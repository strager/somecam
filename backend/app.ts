import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { createApiMiddleware } from "./api.ts";
import type { AppConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { createAnalyticsHandler } from "./posthog-proxy.ts";

function internalErrorBody(): string {
	return JSON.stringify({
		type: "about:blank",
		title: "Internal Server Error",
		status: 500,
		detail: "Unexpected server error.",
	});
}

export async function createApp(): Promise<Express> {
	const app = express();

	let config: AppConfig | undefined;
	try {
		config = loadConfig();
	} catch {
		console.warn("XAI_API_KEY is not set; AI summarization will be disabled.");
	}

	app.use("/api/a", createAnalyticsHandler());
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use("/api", await createApiMiddleware(config));

	app.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
		const message = error instanceof Error ? error.message : String(error);
		console.error("Unhandled application error:", message);
		res.status(500);
		res.type("application/problem+json");
		res.send(internalErrorBody());
	});

	return app;
}
