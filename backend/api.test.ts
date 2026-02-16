import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { solveChallenge } from "altcha-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.ts";
import { rateLimitTunables } from "./rate-limit.ts";

// Use trivial PoW difficulty in tests so challenges solve instantly.
rateLimitTunables.powMaxNumber = 100;

interface ChallengeResponse {
	code: string;
	challenge: {
		challengeId: string;
		expiresAt: number;
		altcha: {
			algorithm: string;
			challenge: string;
			maxnumber: number;
			salt: string;
			signature: string;
		};
	};
}

function isChallengeResponse(body: unknown): body is ChallengeResponse {
	return typeof body === "object" && body !== null && "code" in body && body.code === "challenge_required" && "challenge" in body && typeof body.challenge === "object" && body.challenge !== null;
}

function expectChallengeResponse(body: unknown): ChallengeResponse {
	if (!isChallengeResponse(body)) {
		throw new Error("Expected challenge_required response");
	}
	return body;
}

async function buildChallengePayload(challengeBody: ChallengeResponse): Promise<{ challengeId: string; payload: string }> {
	const { challengeId, altcha } = challengeBody.challenge;
	const result = solveChallenge(altcha.challenge, altcha.salt, altcha.algorithm, altcha.maxnumber);
	const solution = await result.promise;
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

	return { challengeId, payload };
}

async function solveAndVerify(baseUrl: string, challengeBody: ChallengeResponse, existingToken?: string): Promise<string> {
	const { challengeId, payload } = await buildChallengePayload(challengeBody);

	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (existingToken !== undefined) {
		headers.Authorization = `Bearer ${existingToken}`;
	}

	const response = await fetch(`${baseUrl}/api/session/verify`, {
		method: "POST",
		headers,
		body: JSON.stringify({ challengeId, payload }),
	});

	expect(response.status).toBe(200);
	const body: unknown = await response.json();
	expect(body).toHaveProperty("sessionToken");
	if (typeof body !== "object" || body === null || !("sessionToken" in body) || typeof body.sessionToken !== "string") {
		throw new Error("Expected sessionToken in response");
	}
	expect(body.sessionToken).toMatch(/^[a-z]{32}$/);
	return body.sessionToken;
}

async function obtainSessionToken(baseUrl: string): Promise<string> {
	// Hit a budgeted endpoint to trigger a challenge
	const challengeResponse = await fetch(`${baseUrl}/api/summarize`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			cardId: "self-knowledge",
			questionId: "interpretation",
			answer: "test",
		}),
	});
	expect(challengeResponse.status).toBe(429);
	const challengeBody: unknown = await challengeResponse.json();
	if (!isChallengeResponse(challengeBody)) {
		throw new Error("Expected challenge_required response");
	}
	return solveAndVerify(baseUrl, challengeBody);
}

describe("API", () => {
	let server: Server | undefined;
	let baseUrl = "";

	beforeAll(async () => {
		const dbPath = path.join(os.tmpdir(), `rate-limit-test-${crypto.randomUUID()}.sqlite`);
		const app = await createApp({ rateLimitConfig: { rateLimitDbPath: dbPath, powSecret: crypto.randomUUID(), enableCleanup: false } });

		await new Promise<void>((resolve, reject) => {
			const candidate = app.listen(0, "127.0.0.1", () => {
				server = candidate;
				resolve();
			});
			candidate.on("error", reject);
		});

		if (server === undefined) {
			throw new Error("Server failed to start.");
		}

		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected server to listen on a TCP port.");
		}

		baseUrl = `http://127.0.0.1:${address.port.toString()}`;
	});

	afterAll(async () => {
		if (server === undefined) {
			return;
		}
		const runningServer = server;

		await new Promise<void>((resolve, reject) => {
			runningServer.close((error) => {
				if (error !== undefined) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	});

	it("returns API health", async () => {
		const response = await fetch(`${baseUrl}/api/health`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.json()).toEqual({ status: "ok" });
	});

	it("returns 200 for analytics proxy when POSTHOG_KEY is not set", async () => {
		const response = await fetch(`${baseUrl}/api/a/capture`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ event: "test_event" }),
		});
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});

	it("returns 400 for POST /api/summarize with missing fields", async () => {
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cardId: "self-knowledge" }),
		});
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toHaveProperty("type", "about:blank");
		expect(body).toHaveProperty("title", expect.any(String));
		expect(body).toHaveProperty("status", 400);
		expect(body).toHaveProperty("detail", expect.any(String));
	});

	it("returns 500 for POST /api/summarize when config is not set", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "Family gives me a sense of belonging.",
			}),
		});
		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toEqual(
			expect.objectContaining({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				detail: "AI summarization is not configured.",
			}),
		);
	});

	it("returns 500 for POST /api/summarize without questionId when config is not set", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				answer: "These are my personal reflections on self-knowledge.",
			}),
		});
		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toEqual(
			expect.objectContaining({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				detail: "AI summarization is not configured.",
			}),
		);
	});

	it("returns 400 for POST /api/infer-answers with missing fields", async () => {
		const response = await fetch(`${baseUrl}/api/infer-answers`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cardId: "self-knowledge" }),
		});
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toHaveProperty("type", "about:blank");
		expect(body).toHaveProperty("title", expect.any(String));
		expect(body).toHaveProperty("status", 400);
		expect(body).toHaveProperty("detail", expect.any(String));
	});

	it("returns 500 for POST /api/infer-answers when config is not set", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/infer-answers`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questions: [
					{ questionId: "interpretation", answer: "I want to understand my motivations." },
					{ questionId: "significance", answer: "" },
					{ questionId: "importance", answer: "" },
				],
			}),
		});
		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toEqual(
			expect.objectContaining({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				detail: "AI inference is not configured.",
			}),
		);
	});

	it("returns 400 for POST /api/check-answer-depth with missing fields", async () => {
		const response = await fetch(`${baseUrl}/api/check-answer-depth`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cardId: "self-knowledge" }),
		});
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toHaveProperty("type", "about:blank");
		expect(body).toHaveProperty("title", expect.any(String));
		expect(body).toHaveProperty("status", 400);
		expect(body).toHaveProperty("detail", expect.any(String));
	});

	it("returns 500 for POST /api/check-answer-depth when config is not set", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/check-answer-depth`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "It means a lot to me.",
			}),
		});
		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toEqual(
			expect.objectContaining({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				detail: "AI depth check is not configured.",
			}),
		);
	});

	it("returns 500 for POST /api/report-pdf when DOCRAPTOR_API_KEY is not set", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/report-pdf`, {
			method: "POST",
			headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
			body: "some session data",
		});
		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toEqual(
			expect.objectContaining({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				detail: "PDF generation is not configured.",
			}),
		);
	});

	it("returns 400 for POST /api/report-html with empty body", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/report-html`, {
			method: "POST",
			headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
			body: "",
		});
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");
	});

	it("returns 400 for POST /api/report-html with invalid session data", async () => {
		const token = await obtainSessionToken(baseUrl);
		const response = await fetch(`${baseUrl}/api/report-html`, {
			method: "POST",
			headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
			body: "not valid json",
		});
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");
		const body: unknown = await response.json();
		expect(body).toHaveProperty("detail", "Invalid session data.");
		expect(JSON.stringify(body)).not.toContain("Unexpected");
	});

	it("returns 400 for POST /api/report-pdf with empty body", async () => {
		const token = await obtainSessionToken(baseUrl);
		const savedKey = process.env.DOCRAPTOR_API_KEY;
		process.env.DOCRAPTOR_API_KEY = "test-key";
		try {
			const response = await fetch(`${baseUrl}/api/report-pdf`, {
				method: "POST",
				headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
				body: "",
			});
			expect(response.status).toBe(400);
			expect(response.headers.get("content-type")).toContain("application/problem+json");
		} finally {
			if (savedKey === undefined) {
				delete process.env.DOCRAPTOR_API_KEY;
			} else {
				process.env.DOCRAPTOR_API_KEY = savedKey;
			}
		}
	});

	it("returns 400 for POST /api/report-pdf with invalid session data", async () => {
		const token = await obtainSessionToken(baseUrl);
		const savedKey = process.env.DOCRAPTOR_API_KEY;
		process.env.DOCRAPTOR_API_KEY = "test-key";
		try {
			const response = await fetch(`${baseUrl}/api/report-pdf`, {
				method: "POST",
				headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
				body: "not valid json",
			});
			expect(response.status).toBe(400);
			expect(response.headers.get("content-type")).toContain("application/problem+json");
			const body: unknown = await response.json();
			expect(body).toHaveProperty("detail", "Invalid session data.");
			expect(JSON.stringify(body)).not.toContain("Unexpected");
		} finally {
			if (savedKey === undefined) {
				delete process.env.DOCRAPTOR_API_KEY;
			} else {
				process.env.DOCRAPTOR_API_KEY = savedKey;
			}
		}
	});

	it("returns RFC 9457 problem details for validation failures", async () => {
		const response = await fetch(`${baseUrl}/api/health?timeoutSeconds=invalid`);
		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toHaveProperty("type", "about:blank");
		expect(body).toHaveProperty("title", expect.any(String));
		expect(body).toHaveProperty("status", 400);
		expect(body).toHaveProperty("detail", expect.any(String));
		expect(body).toHaveProperty("errors");
	});
});

describe("Error sanitization", () => {
	let server: Server | undefined;
	let baseUrl = "";
	let originalXaiApiKey: string | undefined;

	beforeAll(async () => {
		originalXaiApiKey = process.env.XAI_API_KEY;
		process.env.XAI_API_KEY = "test-xai-api-key";

		const dbPath = path.join(os.tmpdir(), `rate-limit-test-${crypto.randomUUID()}.sqlite`);
		const app = await createApp({ rateLimitConfig: { rateLimitDbPath: dbPath, powSecret: crypto.randomUUID(), enableCleanup: false } });

		await new Promise<void>((resolve, reject) => {
			const candidate = app.listen(0, "127.0.0.1", () => {
				server = candidate;
				resolve();
			});
			candidate.on("error", reject);
		});

		if (server === undefined) {
			throw new Error("Server failed to start.");
		}

		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected server to listen on a TCP port.");
		}

		baseUrl = `http://127.0.0.1:${address.port.toString()}`;
	});

	afterAll(async () => {
		if (server !== undefined) {
			const runningServer = server;
			await new Promise<void>((resolve, reject) => {
				runningServer.close((error) => {
					if (error !== undefined) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		}

		if (originalXaiApiKey === undefined) {
			delete process.env.XAI_API_KEY;
		} else {
			process.env.XAI_API_KEY = originalXaiApiKey;
		}
	});

	it("never forwards raw upstream AI error messages to clients", async () => {
		const token = await obtainSessionToken(baseUrl);
		const upstreamErrorText = "provider rejected request: api_key=test-xai-api-key";
		const originalFetch = globalThis.fetch;
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url === "https://api.x.ai/v1/chat/completions") {
				return Promise.resolve(new Response(upstreamErrorText, { status: 500 }));
			}
			return originalFetch(input, init);
		});

		try {
			const response = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "Tell me what this means in my life.",
				}),
			});

			expect(response.status).toBe(502);
			expect(response.headers.get("content-type")).toContain("application/problem+json");
			const body: unknown = await response.json();
			expect(body).toHaveProperty("detail", "Upstream AI service error.");
			expect(JSON.stringify(body)).not.toContain(upstreamErrorText);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});

describe("Rate limiting", () => {
	let server: Server | undefined;
	let baseUrl = "";

	beforeAll(async () => {
		const dbPath = path.join(os.tmpdir(), `rate-limit-test-${crypto.randomUUID()}.sqlite`);
		const app = await createApp({ rateLimitConfig: { rateLimitDbPath: dbPath, powSecret: crypto.randomUUID(), enableCleanup: false } });

		await new Promise<void>((resolve, reject) => {
			const candidate = app.listen(0, "127.0.0.1", () => {
				server = candidate;
				resolve();
			});
			candidate.on("error", reject);
		});

		if (server === undefined) {
			throw new Error("Server failed to start.");
		}

		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected server to listen on a TCP port.");
		}

		baseUrl = `http://127.0.0.1:${address.port.toString()}`;
	});

	afterAll(async () => {
		if (server === undefined) {
			return;
		}
		const runningServer = server;

		await new Promise<void>((resolve, reject) => {
			runningServer.close((error) => {
				if (error !== undefined) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	});

	it("returns 429 challenge_required for budgeted endpoint without token", async () => {
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "test",
			}),
		});

		expect(response.status).toBe(429);
		expect(response.headers.get("content-type")).toContain("application/problem+json");

		const body: unknown = await response.json();
		expect(body).toHaveProperty("code", "challenge_required");
		expect(body).toHaveProperty("challenge");

		const challenge = expectChallengeResponse(body).challenge;
		expect(challenge).toHaveProperty("challengeId");
		expect(challenge).toHaveProperty("expiresAt");
		expect(challenge).toHaveProperty("altcha");
		expect(challenge.altcha).toHaveProperty("algorithm");
		expect(challenge.altcha).toHaveProperty("challenge");
		expect(challenge.altcha).toHaveProperty("salt");
		expect(challenge.altcha).toHaveProperty("signature");
		expect(challenge.altcha).toHaveProperty("maxnumber");
	});

	it("returns 200 with token after solving challenge and verifying", async () => {
		// Get a challenge
		const challengeResponse = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "test",
			}),
		});

		expect(challengeResponse.status).toBe(429);
		const challengeBody = expectChallengeResponse(await challengeResponse.json());

		const token = await solveAndVerify(baseUrl, challengeBody);
		expect(token).toMatch(/^[a-z]{32}$/);
	});

	it("retrying original request with token succeeds after obtaining session", async () => {
		const token = await obtainSessionToken(baseUrl);

		// Retry with token — should reach the handler (500 because no AI config)
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "test answer for rate limit test",
			}),
		});

		// 500 means it got past the rate limiter and reached the handler
		expect(response.status).toBe(500);
		const body: unknown = await response.json();
		expect(body).toHaveProperty("detail", "AI summarization is not configured.");
	});

	it("returns 409 challenge_replayed when reusing a solved challenge", async () => {
		// Get a challenge
		const challengeResponse = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "test",
			}),
		});
		expect(challengeResponse.status).toBe(429);
		const challengeBody = expectChallengeResponse(await challengeResponse.json());

		// Solve the challenge
		const { challengeId, altcha } = challengeBody.challenge;
		const result = solveChallenge(altcha.challenge, altcha.salt, altcha.algorithm, altcha.maxnumber);
		const solution = await result.promise;
		if (solution === null) throw new Error("Failed to solve");

		const payload = btoa(
			JSON.stringify({
				algorithm: altcha.algorithm,
				challenge: altcha.challenge,
				number: solution.number,
				salt: altcha.salt,
				signature: altcha.signature,
			}),
		);

		// First verify — should succeed
		const firstVerify = await fetch(`${baseUrl}/api/session/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ challengeId, payload }),
		});
		expect(firstVerify.status).toBe(200);

		// Replay the same verify — should fail with 409
		const replayVerify = await fetch(`${baseUrl}/api/session/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ challengeId, payload }),
		});
		expect(replayVerify.status).toBe(409);

		const replayBody: unknown = await replayVerify.json();
		expect(replayBody).toHaveProperty("code", "challenge_replayed");
	});

	it("allows only one successful verify across three concurrent replay attempts", async () => {
		const challengeResponse = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "concurrent replay test",
			}),
		});
		expect(challengeResponse.status).toBe(429);
		const challengeBody = expectChallengeResponse(await challengeResponse.json());
		const { challengeId, payload } = await buildChallengePayload(challengeBody);

		const attempts = await Promise.all(
			Array.from({ length: 3 }, async () =>
				fetch(`${baseUrl}/api/session/verify`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ challengeId, payload }),
				}),
			),
		);

		const statuses = attempts.map((response) => response.status);
		expect(statuses.filter((status) => status === 200)).toHaveLength(1);
		expect(statuses.filter((status) => status === 409)).toHaveLength(2);

		for (const response of attempts) {
			if (response.status === 200) {
				const body: unknown = await response.json();
				expect(body).toHaveProperty("sessionToken");
				continue;
			}
			const body: unknown = await response.json();
			expect(body).toHaveProperty("code", "challenge_replayed");
		}
	});

	it("returns 400 for invalid challenge ID", async () => {
		const response = await fetch(`${baseUrl}/api/session/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ challengeId: "nonexistent-id", payload: "bogus" }),
		});

		expect(response.status).toBe(400);
		const body: unknown = await response.json();
		expect(body).toHaveProperty("code", "challenge_invalid");
	});

	it("deducts budget before handler execution", async () => {
		const token = await obtainSessionToken(baseUrl);

		// Use up budget with many 5-credit calls (bootstrap gives 100 credits)
		// 100 / 5 = 20 calls should exhaust the budget
		for (let i = 0; i < 20; i++) {
			const response = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "budget test",
				}),
			});
			// Should be 500 (reaches handler, no AI config)
			expect(response.status).toBe(500);
		}

		// 21st call should get 429 — budget exhausted
		const exhaustedResponse = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "budget test",
			}),
		});
		expect(exhaustedResponse.status).toBe(429);
	});

	it("refreshing an existing session preserves the token", async () => {
		const token = await obtainSessionToken(baseUrl);

		// Exhaust budget
		for (let i = 0; i < 20; i++) {
			await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "refresh test",
				}),
			});
		}

		// Get new challenge
		const challengeResponse = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "refresh test",
			}),
		});
		expect(challengeResponse.status).toBe(429);
		const challengeBody = expectChallengeResponse(await challengeResponse.json());

		// Verify with existing token — should refresh the same session
		const refreshedToken = await solveAndVerify(baseUrl, challengeBody, token);
		expect(refreshedToken).toBe(token);
	});

	it("/api/health is accessible without any auth", async () => {
		const response = await fetch(`${baseUrl}/api/health`);
		expect(response.status).toBe(200);
	});

	it("budget cap prevents accumulation beyond 150 units", async () => {
		// Get first session with 100 credits
		const token = await obtainSessionToken(baseUrl);

		// Trigger a refresh while we still have budget
		// First, use 1 call to leave 95 credits
		await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "cap test",
			}),
		});

		// Now trigger a challenge from a different endpoint perspective — go get a challenge from /api/report-pdf which costs 100
		const pdfResponse = await fetch(`${baseUrl}/api/report-pdf`, {
			method: "POST",
			headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
			body: "cap test",
		});
		// 95 credits < 100 cost, so we get a challenge
		expect(pdfResponse.status).toBe(429);
		const challengeBody = expectChallengeResponse(await pdfResponse.json());

		// Solve and verify to add credits (should cap at 150)
		await solveAndVerify(baseUrl, challengeBody, token);

		// Now we should have min(95 + 100, 150) = 150 credits
		// We should be able to do the PDF now (costs 100)
		const pdfRetry = await fetch(`${baseUrl}/api/report-pdf`, {
			method: "POST",
			headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
			body: "cap test",
		});
		// 500 because DOCRAPTOR_API_KEY not set — but we passed the budget check
		expect(pdfRetry.status).toBe(500);

		// After PDF we have 50 credits left. Do 10 more summarize calls (5 each = 50)
		for (let i = 0; i < 10; i++) {
			const resp = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "cap exhaust",
				}),
			});
			expect(resp.status).toBe(500); // reaches handler
		}

		// Now at 0 credits — should get 429
		const finalResponse = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "should fail",
			}),
		});
		expect(finalResponse.status).toBe(429);
	});

	it("invalid bearer token triggers challenge flow, not 401", async () => {
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer invalidtokenthatisnottherightformat",
			},
			body: JSON.stringify({
				cardId: "self-knowledge",
				questionId: "interpretation",
				answer: "test",
			}),
		});

		expect(response.status).toBe(429);
		const body: unknown = await response.json();
		expect(body).toHaveProperty("code", "challenge_required");
	});

	it("session/verify returns 400 for malformed request body", async () => {
		const response = await fetch(`${baseUrl}/api/session/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ wrong: "fields" }),
		});

		expect(response.status).toBe(400);
	});

	it("different challenges issue different challenge IDs", async () => {
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const response = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "uniqueness test",
				}),
			});
			expect(response.status).toBe(429);
			const body = expectChallengeResponse(await response.json());
			ids.push(body.challenge.challengeId);
		}

		// All challenge IDs should be unique
		expect(new Set(ids).size).toBe(3);
	});

	it("budget credits expire after 30 minutes", async () => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "hrtime"] });
		vi.setSystemTime(new Date(1_700_000_000_000));
		try {
			const token = await obtainSessionToken(baseUrl);

			const initialUse = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "budget ttl check",
				}),
			});
			expect(initialUse.status).toBe(500);

			vi.setSystemTime(new Date(Date.now() + 30 * 60 * 1000 + 1));

			const expiredUse = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "budget ttl check",
				}),
			});
			expect(expiredUse.status).toBe(429);
			const body: unknown = await expiredUse.json();
			expect(body).toHaveProperty("code", "challenge_required");
		} finally {
			vi.useRealTimers();
		}
	});

	it("session expires after 24 hours and verify returns a new token", async () => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "hrtime"] });
		vi.setSystemTime(new Date(1_800_000_000_000));
		try {
			const originalToken = await obtainSessionToken(baseUrl);

			const beforeExpiry = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${originalToken}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "session ttl check",
				}),
			});
			expect(beforeExpiry.status).toBe(500);

			vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000 + 1));

			const challengeResponse = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${originalToken}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "session ttl check",
				}),
			});
			expect(challengeResponse.status).toBe(429);

			const challengeBody = expectChallengeResponse(await challengeResponse.json());
			const refreshedToken = await solveAndVerify(baseUrl, challengeBody, originalToken);
			expect(refreshedToken).not.toBe(originalToken);

			const withRefreshed = await fetch(`${baseUrl}/api/summarize`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${refreshedToken}` },
				body: JSON.stringify({
					cardId: "self-knowledge",
					questionId: "interpretation",
					answer: "session ttl check",
				}),
			});
			expect(withRefreshed.status).toBe(500);
		} finally {
			vi.useRealTimers();
		}
	});
});
