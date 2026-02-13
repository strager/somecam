import type { Request as ExpressRequest, RequestHandler, Response } from "express";
import { OpenAPIBackend, type Context, type Request as OpenApiRequest, type ValidationResult } from "openapi-backend";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AppConfig } from "./config.ts";
import { createChatCompletion } from "./xai-client.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";

interface ApiProblemDetails {
	type: string;
	title: string;
	status: number;
	detail: string;
	errors?: unknown[];
}

interface ApiResponse {
	statusCode: number;
	body?: unknown;
	headers?: Record<string, string>;
}

const OPENAPI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "openapi.yaml");

const api = new OpenAPIBackend({
	definition: OPENAPI_PATH,
	strict: true,
	validate: true,
});

let initializePromise: Promise<unknown> | undefined;
let appConfig: AppConfig | undefined;

const problemJsonHeader = {
	"content-type": "application/problem+json",
};

function createProblemDetails(status: number, title: string, detail: string, errors?: unknown[]): ApiProblemDetails {
	return {
		type: "about:blank",
		title,
		status,
		detail,
		...(errors !== undefined ? { errors } : {}),
	};
}

function firstErrorMessage(errors: unknown[]): string {
	const firstError = errors[0];
	if (typeof firstError === "object" && firstError !== null) {
		const withMessage = firstError as { message?: unknown };
		if (typeof withMessage.message === "string" && withMessage.message.length > 0) {
			return withMessage.message;
		}
	}
	return "Request validation failed.";
}

function normalizeApiResponse(value: unknown): ApiResponse {
	if (value === undefined) {
		return { statusCode: 204 };
	}

	if (typeof value === "object" && value !== null && "statusCode" in value) {
		const withStatusCode = value as {
			statusCode: number;
			body?: unknown;
			headers?: Record<string, string>;
		};
		return {
			statusCode: withStatusCode.statusCode,
			body: withStatusCode.body,
			headers: withStatusCode.headers,
		};
	}

	return {
		statusCode: 200,
		body: value,
	};
}

function extractValidationErrors(context: Context): unknown[] {
	if (!Array.isArray(context.validation.errors)) {
		return [];
	}
	return context.validation.errors;
}

function collectResponseValidationErrors(validationResult: ValidationResult): unknown[] {
	if (!Array.isArray(validationResult.errors)) {
		return [];
	}
	return validationResult.errors;
}

function validateOperationResponse(context: Context, response: ApiResponse): ApiResponse {
	if (response.body === undefined) {
		return response;
	}

	try {
		const validationResult = api.validateResponse(response.body, context.operation, response.statusCode);
		const errors = collectResponseValidationErrors(validationResult);
		if (errors.length === 0) {
			return response;
		}

		return {
			statusCode: 500,
			headers: problemJsonHeader,
			body: createProblemDetails(500, "Response Validation Failed", "Handler returned a response that does not match the OpenAPI spec.", errors),
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : "Handler returned a response that could not be validated.";
		return {
			statusCode: 500,
			headers: problemJsonHeader,
			body: createProblemDetails(500, "Response Validation Failed", detail),
		};
	}
}

function sendApiResponse(res: Response, response: ApiResponse): void {
	res.status(response.statusCode);

	if (response.headers !== undefined) {
		for (const [headerName, headerValue] of Object.entries(response.headers)) {
			res.setHeader(headerName, headerValue);
		}
	}

	if (response.body === undefined) {
		res.end();
		return;
	}

	if (typeof response.body === "string" || Buffer.isBuffer(response.body)) {
		res.send(response.body);
		return;
	}

	if (res.getHeader("content-type") === undefined) {
		res.type("application/json");
	}

	res.send(JSON.stringify(response.body));
}

function toOpenApiRequest(req: ExpressRequest): OpenApiRequest {
	const headers: OpenApiRequest["headers"] = {};
	for (const [name, value] of Object.entries(req.headers)) {
		if (typeof value === "string" || Array.isArray(value)) {
			headers[name] = value;
		}
	}

	return {
		method: req.method,
		path: req.url,
		headers,
		body: req.body as unknown,
	};
}

api.register({
	getHealth: (): ApiResponse => ({
		statusCode: 200,
		body: { status: "ok" },
		headers: { "content-type": "application/json" },
	}),
	postSummarize: async (context: Context): Promise<ApiResponse> => {
		if (appConfig === undefined) {
			return {
				statusCode: 500,
				headers: problemJsonHeader,
				body: createProblemDetails(500, "Internal Server Error", "AI summarization is not configured."),
			};
		}

		const { cardSource, cardDescription, questionText, answer } = context.request.requestBody as {
			cardSource: string;
			cardDescription: string;
			questionText: string;
			answer: string;
		};

		try {
			const content = await createChatCompletion({
				apiKey: appConfig.xaiApiKey,
				model: "grok-4-1-fast-reasoning",
				messages: [
					{
						role: "system",
						content: "You are a reflective coach helping someone explore their sources of meaning. Summarize their answer in a short phrase of 3–8 words. No full sentences. Do not ask questions.",
					},
					{
						role: "user",
						content: `Card: ${cardSource} — ${cardDescription}\nQuestion: ${questionText}\nAnswer: ${answer}`,
					},
				],
				maxTokens: 30,
				temperature: 0.7,
				debugPrompt: appConfig.debugPrompt,
			});

			return { statusCode: 200, body: { summary: content } };
		} catch (error) {
			const detail = error instanceof Error ? error.message : "Upstream AI service error.";
			return {
				statusCode: 502,
				headers: problemJsonHeader,
				body: createProblemDetails(502, "Bad Gateway", detail),
			};
		}
	},
	postInferAnswers: async (context: Context): Promise<ApiResponse> => {
		if (appConfig === undefined) {
			return {
				statusCode: 500,
				headers: problemJsonHeader,
				body: createProblemDetails(500, "Internal Server Error", "AI inference is not configured."),
			};
		}

		const { cardId, questions } = context.request.requestBody as {
			cardId: string;
			questions: { questionId: string; answer: string }[];
		};

		const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
		const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));

		const card = cardsById.get(cardId);
		if (card === undefined) {
			return {
				statusCode: 400,
				headers: problemJsonHeader,
				body: createProblemDetails(400, "Bad Request", `Unknown card ID: ${cardId}`),
			};
		}

		for (const q of questions) {
			if (!questionsById.has(q.questionId)) {
				return {
					statusCode: 400,
					headers: problemJsonHeader,
					body: createProblemDetails(400, "Bad Request", `Unknown question ID: ${q.questionId}`),
				};
			}
		}

		const promptQuestions = questions.map((q) => {
			const question = questionsById.get(q.questionId) as { topic: string; text: string };
			return {
				source: card.source,
				description: card.description,
				questionId: q.questionId,
				topic: question.topic,
				text: question.text,
				answer: q.answer,
			};
		});

		const userMessage = JSON.stringify(promptQuestions);

		try {
			const content = await createChatCompletion({
				apiKey: appConfig.xaiApiKey,
				model: "grok-4-1-fast-reasoning",
				messages: [
					{
						role: "system",
						content: "You are a reflective coach helping someone explore their sources of meaning. " + "The user will provide a JSON array of question objects about a meaning card. " + 'Questions with a non-empty "answer" have been answered by the user. ' + 'Questions with an empty "answer" are unanswered. ' + "Determine which unanswered questions are already addressed by the user's existing answers. " + "For each addressed question, write a short answer (1-3 sentences) mimicking the user's writing style. " + 'Return a JSON array of objects with "questionId" and "answer" fields. ' + "Only include questions that are clearly addressed. If none are addressed, return an empty array. " + "Return ONLY the JSON array, no other text.",
					},
					{
						role: "user",
						content: userMessage,
					},
				],
				maxTokens: 500,
				temperature: 0.7,
				debugPrompt: appConfig.debugPrompt,
			});

			try {
				const parsed = JSON.parse(content) as unknown;
				if (!Array.isArray(parsed)) {
					return { statusCode: 200, body: { inferredAnswers: [] } };
				}
				const inferredAnswers: { questionId: string; answer: string }[] = [];
				for (const item of parsed) {
					if (typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).questionId === "string" && typeof (item as Record<string, unknown>).answer === "string") {
						inferredAnswers.push({
							questionId: (item as Record<string, unknown>).questionId as string,
							answer: (item as Record<string, unknown>).answer as string,
						});
					}
				}
				return { statusCode: 200, body: { inferredAnswers } };
			} catch {
				return { statusCode: 200, body: { inferredAnswers: [] } };
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : "Upstream AI service error.";
			return {
				statusCode: 502,
				headers: problemJsonHeader,
				body: createProblemDetails(502, "Bad Gateway", detail),
			};
		}
	},
	validationFail: (context: Context): ApiResponse => {
		const errors = extractValidationErrors(context);
		return {
			statusCode: 400,
			headers: problemJsonHeader,
			body: createProblemDetails(400, "Bad Request", firstErrorMessage(errors), errors),
		};
	},
	notFound: (): ApiResponse => ({
		statusCode: 404,
		headers: problemJsonHeader,
		body: createProblemDetails(404, "Not Found", "No API endpoint matched this request."),
	}),
	methodNotAllowed: (): ApiResponse => ({
		statusCode: 405,
		headers: problemJsonHeader,
		body: createProblemDetails(405, "Method Not Allowed", "The endpoint does not allow this HTTP method."),
	}),
	postResponseHandler: (context: Context): ApiResponse => {
		const response = normalizeApiResponse(context.response);
		return validateOperationResponse(context, response);
	},
});

async function ensureApiInitialized(): Promise<void> {
	initializePromise ??= api.init();
	await initializePromise;
}

export async function createApiMiddleware(config?: AppConfig): Promise<RequestHandler> {
	appConfig = config;
	await ensureApiInitialized();

	return async (req: ExpressRequest, res: Response, next): Promise<void> => {
		try {
			const result: unknown = await api.handleRequest(toOpenApiRequest(req), req, res);
			if (res.headersSent) {
				return;
			}

			sendApiResponse(res, normalizeApiResponse(result));
		} catch (error) {
			next(error);
		}
	};
}
