import os from "node:os";
import path from "node:path";

import { solveChallenge } from "altcha-lib";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RateLimitConfig } from "./config.ts";
import { RateLimiter, rateLimitTunables } from "./rate-limit.ts";

rateLimitTunables.powMaxNumber = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function validateAltcha(altcha: unknown): { algorithm: string; challenge: string; maxnumber: number; salt: string; signature: string } {
	if (!isRecord(altcha) || typeof altcha.algorithm !== "string" || typeof altcha.challenge !== "string" || typeof altcha.maxnumber !== "number" || typeof altcha.salt !== "string" || typeof altcha.signature !== "string") {
		throw new Error("Invalid altcha challenge shape");
	}
	return { algorithm: altcha.algorithm, challenge: altcha.challenge, maxnumber: altcha.maxnumber, salt: altcha.salt, signature: altcha.signature };
}

async function solveAndVerify(rl: RateLimiter, costUnits: number, authHeader?: string): Promise<string> {
	const guard = await rl.budgetGuard(authHeader, costUnits);
	if (guard.ok) throw new Error("Expected challenge");

	const altcha = validateAltcha(guard.challenge.altcha);
	const solution = await solveChallenge(altcha.challenge, altcha.salt, altcha.algorithm, altcha.maxnumber).promise;
	if (solution === null) throw new Error("Failed to solve challenge");

	const payload = btoa(
		JSON.stringify({
			algorithm: altcha.algorithm,
			challenge: altcha.challenge,
			number: solution.number,
			salt: altcha.salt,
			signature: altcha.signature,
		}),
	);

	const result = await rl.verifyChallenge(guard.challenge.challengeId, payload, authHeader);
	return result.sessionToken;
}

describe("RateLimiter", () => {
	let rateLimiter: RateLimiter | undefined;
	let dbPath: string | undefined;

	afterEach(() => {
		rateLimiter?.close();
		vi.useRealTimers();
	});

	function makeConfig(overrides?: Partial<RateLimitConfig>): RateLimitConfig {
		dbPath = path.join(os.tmpdir(), `rate-limit-test-${crypto.randomUUID()}.sqlite`);
		return { rateLimitDbPath: dbPath, powSecret: "test-secret", enableCleanup: false, ...overrides };
	}

	function createRateLimiter(overrides?: Partial<RateLimitConfig>): RateLimiter {
		rateLimiter = new RateLimiter(makeConfig(overrides));
		return rateLimiter;
	}

	function openDb(): Database.Database {
		if (dbPath === undefined) throw new Error("No DB path set");
		return new Database(dbPath);
	}

	function queryCreditsUsed(token: string): number {
		const db = openDb();
		try {
			const row: unknown = db.prepare("SELECT credits_used FROM session_tokens WHERE session_token = ?").get(token);
			if (!isRecord(row) || typeof row.credits_used !== "number") {
				throw new Error("Session not found");
			}
			return row.credits_used;
		} finally {
			db.close();
		}
	}

	function countRows(table: string): number {
		const db = openDb();
		try {
			const row: unknown = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get();
			if (!isRecord(row) || typeof row.cnt !== "number") throw new Error("Count query failed");
			return row.cnt;
		} finally {
			db.close();
		}
	}

	it("increments credits_used on each budgetGuard deduction", async () => {
		const rl = createRateLimiter();

		const token = await solveAndVerify(rl, 5);
		expect(queryCreditsUsed(token)).toBe(0);

		const authHeader = `Bearer ${token}`;
		for (let i = 0; i < 3; i++) {
			const r = await rl.budgetGuard(authHeader, 5);
			expect(r.ok).toBe(true);
		}
		expect(queryCreditsUsed(token)).toBe(15);

		for (let i = 0; i < 2; i++) {
			const r = await rl.budgetGuard(authHeader, 10);
			expect(r.ok).toBe(true);
		}
		expect(queryCreditsUsed(token)).toBe(35);
	});

	it("does not clean up when enableCleanup is false", async () => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "hrtime"] });
		const startTime = new Date("2026-01-01T00:00:00Z");
		vi.setSystemTime(startTime);

		const rl = createRateLimiter({ enableCleanup: false });

		await solveAndVerify(rl, 5);
		expect(countRows("session_tokens")).toBe(1);
		expect(countRows("issued_challenges")).toBe(1);

		// Advance 48 hours (past both session and challenge retention)
		vi.setSystemTime(new Date(startTime.getTime() + 48 * 60 * 60 * 1000));

		// Trigger budgetGuard which calls maybeCleanup (issues a new challenge since budget expired)
		await rl.budgetGuard(undefined, 5);

		// Original data should still be there (plus the new challenge just issued)
		expect(countRows("session_tokens")).toBe(1);
		expect(countRows("issued_challenges")).toBe(2);
	});

	it("cleans up expired sessions when enableCleanup is true", async () => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "hrtime"] });
		const startTime = new Date("2026-01-01T00:00:00Z");
		vi.setSystemTime(startTime);

		const rl = createRateLimiter({ enableCleanup: true });

		await solveAndVerify(rl, 5);
		expect(countRows("session_tokens")).toBe(1);

		// Advance 25 hours (past 24-hour session retention)
		vi.setSystemTime(new Date(startTime.getTime() + 25 * 60 * 60 * 1000));

		// Trigger cleanup via budgetGuard
		await rl.budgetGuard(undefined, 5);

		expect(countRows("session_tokens")).toBe(0);
	});

	it("cleans up expired challenges when enableCleanup is true", async () => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "hrtime"] });
		const startTime = new Date("2026-01-01T00:00:00Z");
		vi.setSystemTime(startTime);

		const rl = createRateLimiter({ enableCleanup: true });

		await solveAndVerify(rl, 5);
		expect(countRows("issued_challenges")).toBe(1);

		// Advance 25 hours (past 24-hour challenge retention)
		vi.setSystemTime(new Date(startTime.getTime() + 25 * 60 * 60 * 1000));

		// Trigger cleanup (also issues a new challenge since no auth)
		await rl.budgetGuard(undefined, 5);

		// Old consumed challenge cleaned up; 1 new challenge just issued
		expect(countRows("issued_challenges")).toBe(1);
	});

	it("does not clean up sessions that are still active", async () => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "hrtime"] });
		const startTime = new Date("2026-01-01T00:00:00Z");
		vi.setSystemTime(startTime);

		const rl = createRateLimiter({ enableCleanup: true });

		const token = await solveAndVerify(rl, 5);
		const authHeader = `Bearer ${token}`;

		// Use the session 10 minutes later (within 30-min budget TTL)
		vi.setSystemTime(new Date(startTime.getTime() + 10 * 60 * 1000));
		const r = await rl.budgetGuard(authHeader, 5);
		expect(r.ok).toBe(true);

		// Advance to 23.5 hours from start (within 24h of last_used_at at 10min)
		vi.setSystemTime(new Date(startTime.getTime() + 23.5 * 60 * 60 * 1000));

		// Budget is expired (30 min TTL), so budgetGuard won't deduct — but cleanup still runs
		await rl.budgetGuard(authHeader, 5);

		// Session should still exist (last_used_at was 10min, which is < 24h ago)
		expect(countRows("session_tokens")).toBe(1);
	});
});
