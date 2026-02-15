import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.ts";

describe("API", () => {
	let server: Server | undefined;
	let baseUrl = "";

	beforeAll(async () => {
		const app = await createApp();

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
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
		const response = await fetch(`${baseUrl}/api/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
		const response = await fetch(`${baseUrl}/api/infer-answers`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
		const response = await fetch(`${baseUrl}/api/check-answer-depth`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
		const response = await fetch(`${baseUrl}/api/report-pdf`, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
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

	it("returns 400 for POST /api/report-pdf with empty body", async () => {
		const savedKey = process.env.DOCRAPTOR_API_KEY;
		process.env.DOCRAPTOR_API_KEY = "test-key";
		try {
			const response = await fetch(`${baseUrl}/api/report-pdf`, {
				method: "POST",
				headers: { "Content-Type": "text/plain" },
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
		const savedKey = process.env.DOCRAPTOR_API_KEY;
		process.env.DOCRAPTOR_API_KEY = "test-key";
		try {
			const response = await fetch(`${baseUrl}/api/report-pdf`, {
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: "not valid json",
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
