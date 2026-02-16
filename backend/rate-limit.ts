import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { createChallenge, verifySolution } from "altcha-lib";

import type { RateLimitConfig } from "./config.ts";

// --- Constants ---

const SESSION_TOKEN_LENGTH = 32;
const MAX_BUDGET_UNITS = 150;
const BOOTSTRAP_GRANT_UNITS = 100;
const REFRESH_GRANT_UNITS = 100;
const BUDGET_TTL_MS = 30 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 120 * 1000;
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_PDF_DOWNLOADS_PER_DAY = 3;
const PDF_DOWNLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

export const rateLimitTunables = {
	powMaxNumber: 50_000,
};

const TOKEN_REGEX = /^[a-z]{32}$/;

// --- DB row helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asBudgetRow(row: unknown): { budget_units: number; budget_expires_at: number } | undefined {
	if (!isRecord(row)) return undefined;
	if (typeof row.budget_units !== "number" || typeof row.budget_expires_at !== "number") return undefined;
	return { budget_units: row.budget_units, budget_expires_at: row.budget_expires_at };
}

function asChallengeRow(row: unknown): { challenge_id: string; expires_at: number; consumed_at: number | null; altcha_challenge: string; grant_units: number } | undefined {
	if (!isRecord(row)) return undefined;
	if (typeof row.challenge_id !== "string" || typeof row.expires_at !== "number" || typeof row.altcha_challenge !== "string" || typeof row.grant_units !== "number") {
		return undefined;
	}
	return {
		challenge_id: row.challenge_id,
		expires_at: row.expires_at,
		consumed_at: typeof row.consumed_at === "number" ? row.consumed_at : null,
		altcha_challenge: row.altcha_challenge,
		grant_units: row.grant_units,
	};
}

// --- Types ---

export interface ChallengeInfo {
	challengeId: string;
	expiresAt: number;
	altcha: unknown;
}

export type BudgetGuardResult = { ok: true } | { ok: false; challenge: ChallengeInfo };

export type PdfDailyLimitResult = { allowed: true; remaining: number } | { allowed: false; remaining: 0; retryAfterMs: number };

export interface VerifyResult {
	sessionToken: string;
}

// --- Rate limiter class ---

export class RateLimiter {
	private db: Database.Database;
	private powSecret: string;
	private enableCleanup: boolean;
	private lastCleanup = 0;

	constructor(config: RateLimitConfig) {
		this.powSecret = config.powSecret;
		this.enableCleanup = config.enableCleanup;

		const dir = path.dirname(config.rateLimitDbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		this.db = new Database(config.rateLimitDbPath);
		this.db.pragma("journal_mode = WAL");
		this.initSchema();
	}

	private initSchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS session_tokens (
				session_token TEXT PRIMARY KEY,
				created_at INTEGER NOT NULL,
				last_used_at INTEGER NOT NULL,
				budget_units INTEGER NOT NULL,
				budget_expires_at INTEGER NOT NULL,
				credits_used INTEGER NOT NULL DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS pdf_downloads (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_token TEXT NOT NULL,
				downloaded_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_pdf_downloads_session_time
				ON pdf_downloads (session_token, downloaded_at);

			CREATE TABLE IF NOT EXISTS issued_challenges (
				challenge_id TEXT PRIMARY KEY,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL,
				consumed_at INTEGER,
				altcha_challenge TEXT NOT NULL,
				altcha_payload_json TEXT NOT NULL,
				grant_units INTEGER NOT NULL
			);
		`);
	}

	close(): void {
		this.db.close();
	}

	// --- Session token helpers ---

	private generateSessionToken(): string {
		const bytes = crypto.randomBytes(SESSION_TOKEN_LENGTH);
		const letters = "abcdefghijklmnopqrstuvwxyz";
		let token = "";
		for (let i = 0; i < SESSION_TOKEN_LENGTH; i++) {
			token += letters[bytes[i] % 26];
		}
		return token;
	}

	private parseToken(authHeader: string | undefined): string | null {
		if (authHeader === undefined) return null;
		const match = /^Bearer\s+(.+)$/i.exec(authHeader);
		if (match === null) return null;
		const token = match[1];
		if (!TOKEN_REGEX.test(token)) return null;
		return token;
	}

	// --- Budget guard ---

	async budgetGuard(authHeader: string | undefined, costUnits: number): Promise<BudgetGuardResult> {
		if (costUnits === 0) {
			return { ok: true };
		}

		this.maybeCleanup();

		const token = this.parseToken(authHeader);
		const now = Date.now();

		if (token !== null) {
			const stmt = this.db.prepare(`
				UPDATE session_tokens
				SET budget_units = budget_units - ?,
				    credits_used = credits_used + ?,
				    last_used_at = ?
				WHERE session_token = ?
				  AND last_used_at >= ?
				  AND budget_expires_at > ?
				  AND budget_units >= ?
			`);
			const result = stmt.run(costUnits, costUnits, now, token, now - SESSION_RETENTION_MS, now, costUnits);
			if (result.changes === 1) {
				return { ok: true };
			}
		}

		// Budget insufficient or no valid token — issue challenge
		const effectiveBudget = this.getEffectiveBudget(token, now);
		const isNewSession = token === null || !this.isValidSession(token, now);
		const baseGrant = isNewSession ? BOOTSTRAP_GRANT_UNITS : REFRESH_GRANT_UNITS;
		const grantUnits = Math.min(baseGrant, MAX_BUDGET_UNITS - effectiveBudget);

		const challenge = await this.issueChallenge(grantUnits, now);
		return { ok: false, challenge };
	}

	private getEffectiveBudget(token: string | null, now: number): number {
		if (token === null) return 0;
		const row = asBudgetRow(
			this.db
				.prepare(
					`
			SELECT budget_units, budget_expires_at
			FROM session_tokens
			WHERE session_token = ?
			  AND last_used_at >= ?
		`,
				)
				.get(token, now - SESSION_RETENTION_MS),
		);

		if (row === undefined) return 0;
		if (row.budget_expires_at <= now) return 0;
		return row.budget_units;
	}

	private isValidSession(token: string, now: number): boolean {
		const row = this.db
			.prepare(
				`
			SELECT 1 FROM session_tokens
			WHERE session_token = ?
			  AND last_used_at >= ?
		`,
			)
			.get(token, now - SESSION_RETENTION_MS);
		return row !== undefined;
	}

	// --- Challenge issuance ---

	private async issueChallenge(grantUnits: number, now: number): Promise<ChallengeInfo> {
		const challengeId = crypto.randomUUID();
		const expiresAt = now + CHALLENGE_TTL_MS;

		const altchaChallenge = await createChallenge({
			hmacKey: this.powSecret,
			maxnumber: rateLimitTunables.powMaxNumber,
		});

		const altchaPayloadJson = JSON.stringify(altchaChallenge);

		this.db
			.prepare(
				`
			INSERT INTO issued_challenges (challenge_id, created_at, expires_at, altcha_challenge, altcha_payload_json, grant_units)
			VALUES (?, ?, ?, ?, ?, ?)
		`,
			)
			.run(challengeId, now, expiresAt, altchaChallenge.challenge, altchaPayloadJson, grantUnits);

		return {
			challengeId,
			expiresAt,
			altcha: altchaChallenge,
		};
	}

	// --- Verify and consume challenge ---

	async verifyChallenge(challengeId: string, payload: string, authHeader: string | undefined): Promise<VerifyResult> {
		const now = Date.now();

		// Fetch challenge row
		const challengeRow = asChallengeRow(
			this.db
				.prepare(
					`
			SELECT challenge_id, expires_at, consumed_at, altcha_challenge, grant_units
			FROM issued_challenges
			WHERE challenge_id = ?
		`,
				)
				.get(challengeId),
		);

		if (challengeRow === undefined || challengeRow.expires_at <= now) {
			throw new ChallengeError("challenge_invalid", 400, "Challenge not found or expired.");
		}

		if (challengeRow.consumed_at !== null) {
			throw new ChallengeError("challenge_replayed", 409, "Challenge has already been consumed.");
		}

		// Verify the ALTCHA payload
		const verified = await verifySolution(payload, this.powSecret);
		if (!verified) {
			throw new ChallengeError("challenge_invalid", 400, "Challenge solution verification failed.");
		}

		// Bind verified solution to issued challenge
		const decodedPayload: unknown = JSON.parse(atob(payload));
		if (typeof decodedPayload !== "object" || decodedPayload === null || !("challenge" in decodedPayload) || decodedPayload.challenge !== challengeRow.altcha_challenge) {
			throw new ChallengeError("challenge_invalid", 400, "Solution does not match the issued challenge.");
		}

		// Transaction: consume challenge + create/refresh session
		const token = this.parseToken(authHeader);
		const sessionToken = this.consumeAndGrant(challengeRow.challenge_id, challengeRow.grant_units, token, now);

		return { sessionToken };
	}

	private consumeAndGrant(challengeId: string, grantUnits: number, existingToken: string | null, now: number): string {
		const txn = this.db.transaction(() => {
			// Mark challenge consumed (guarded by consumed_at IS NULL)
			const consumeResult = this.db
				.prepare(
					`
				UPDATE issued_challenges
				SET consumed_at = ?
				WHERE challenge_id = ?
				  AND consumed_at IS NULL
			`,
				)
				.run(now, challengeId);

			if (consumeResult.changes !== 1) {
				throw new ChallengeError("challenge_replayed", 409, "Challenge has already been consumed.");
			}

			// Try to refresh existing session
			if (existingToken !== null) {
				const session = asBudgetRow(
					this.db
						.prepare(
							`
					SELECT budget_units, budget_expires_at
					FROM session_tokens
					WHERE session_token = ?
					  AND last_used_at >= ?
				`,
						)
						.get(existingToken, now - SESSION_RETENTION_MS),
				);

				if (session !== undefined) {
					const effectiveBudget = session.budget_expires_at > now ? session.budget_units : 0;
					const newBudget = Math.min(MAX_BUDGET_UNITS, effectiveBudget + grantUnits);

					this.db
						.prepare(
							`
						UPDATE session_tokens
						SET budget_units = ?,
						    budget_expires_at = ?,
						    last_used_at = ?
						WHERE session_token = ?
					`,
						)
						.run(newBudget, now + BUDGET_TTL_MS, now, existingToken);

					return existingToken;
				}
			}

			// Create new session
			const newToken = this.generateSessionToken();
			const newBudget = Math.min(MAX_BUDGET_UNITS, grantUnits);

			this.db
				.prepare(
					`
				INSERT INTO session_tokens (session_token, created_at, last_used_at, budget_units, budget_expires_at, credits_used)
				VALUES (?, ?, ?, ?, ?, 0)
			`,
				)
				.run(newToken, now, now, newBudget, now + BUDGET_TTL_MS);

			return newToken;
		});

		return txn.immediate();
	}

	// --- PDF daily limit ---

	checkPdfDailyLimit(authHeader: string | undefined): PdfDailyLimitResult {
		const token = this.parseToken(authHeader);
		if (token === null) {
			return { allowed: true, remaining: MAX_PDF_DOWNLOADS_PER_DAY };
		}

		const now = Date.now();
		const windowStart = now - PDF_DOWNLOAD_WINDOW_MS;

		const count = this.countPdfDownloads(token, windowStart);

		if (count < MAX_PDF_DOWNLOADS_PER_DAY) {
			return { allowed: true, remaining: MAX_PDF_DOWNLOADS_PER_DAY - count };
		}

		const oldestRow = this.db.prepare(`SELECT downloaded_at FROM pdf_downloads WHERE session_token = ? AND downloaded_at >= ? ORDER BY downloaded_at ASC LIMIT 1`).get(token, windowStart);
		const oldestDownloadedAt = isRecord(oldestRow) && typeof oldestRow.downloaded_at === "number" ? oldestRow.downloaded_at : now;
		const retryAfterMs = oldestDownloadedAt + PDF_DOWNLOAD_WINDOW_MS - now;

		return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) };
	}

	recordPdfDownload(authHeader: string | undefined): number {
		const token = this.parseToken(authHeader);
		if (token === null) {
			return MAX_PDF_DOWNLOADS_PER_DAY;
		}

		const now = Date.now();
		this.db.prepare(`INSERT INTO pdf_downloads (session_token, downloaded_at) VALUES (?, ?)`).run(token, now);

		const windowStart = now - PDF_DOWNLOAD_WINDOW_MS;
		const count = this.countPdfDownloads(token, windowStart);

		return Math.max(MAX_PDF_DOWNLOADS_PER_DAY - count, 0);
	}

	private countPdfDownloads(token: string, windowStart: number): number {
		const row = this.db.prepare(`SELECT COUNT(*) AS cnt FROM pdf_downloads WHERE session_token = ? AND downloaded_at >= ?`).get(token, windowStart);
		if (isRecord(row) && typeof row.cnt === "number") {
			return row.cnt;
		}
		return 0;
	}

	// --- Cleanup ---

	// Cleanup disabled by default: keeping session and challenge data around
	// while we iron out the system, so we can inspect usage if bugs arise.
	// Set RATE_LIMIT_CLEANUP=1 to enable.
	private maybeCleanup(): void {
		if (!this.enableCleanup) return;

		const now = Date.now();
		if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return;
		this.lastCleanup = now;

		this.db.prepare(`DELETE FROM session_tokens WHERE last_used_at < ?`).run(now - SESSION_RETENTION_MS);
		this.db.prepare(`DELETE FROM issued_challenges WHERE expires_at < ?`).run(now - CHALLENGE_RETENTION_MS);
		this.db.prepare(`DELETE FROM issued_challenges WHERE consumed_at IS NOT NULL AND consumed_at < ?`).run(now - CHALLENGE_RETENTION_MS);
		this.db.prepare(`DELETE FROM pdf_downloads WHERE downloaded_at < ?`).run(now - PDF_DOWNLOAD_WINDOW_MS);
	}
}

// --- Error type ---

export class ChallengeError extends Error {
	code: string;
	statusCode: number;

	constructor(code: string, statusCode: number, message: string) {
		super(message);
		this.code = code;
		this.statusCode = statusCode;
	}
}
