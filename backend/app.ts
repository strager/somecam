import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { createApiMiddleware } from "./api.ts";

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

	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use("/api", await createApiMiddleware());

	app.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
		const message = error instanceof Error ? error.message : String(error);
		console.error("Unhandled application error:", message);
		res.status(500);
		res.type("application/problem+json");
		res.send(internalErrorBody());
	});

	return app;
}
