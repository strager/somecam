import type { Request as ExpressRequest, RequestHandler, Response } from "express";
import { OpenAPIBackend, type Context, type Request as OpenApiRequest, type ValidationResult } from "openapi-backend";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AppConfig } from "./config.ts";
import { renderReportHtml } from "./pdf-report.ts";
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
	if (typeof firstError === "object" && firstError !== null && "message" in firstError && typeof firstError.message === "string" && firstError.message.length > 0) {
		return firstError.message;
	}
	return "Request validation failed.";
}

function normalizeApiResponse(value: unknown): ApiResponse {
	if (value === undefined) {
		return { statusCode: 204 };
	}

	if (typeof value === "object" && value !== null && "statusCode" in value && typeof value.statusCode === "number") {
		const result: ApiResponse = {
			statusCode: value.statusCode,
			body: "body" in value ? value.body : undefined,
		};
		if ("headers" in value && typeof value.headers === "object" && value.headers !== null) {
			const headers: Record<string, string> = {};
			for (const [k, v] of Object.entries(value.headers)) {
				if (typeof v === "string") headers[k] = v;
			}
			result.headers = headers;
		}
		return result;
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

	const reqBody: unknown = req.body;
	return {
		method: req.method,
		path: req.url,
		headers,
		body: reqBody,
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

		const body: unknown = context.request.requestBody;
		if (typeof body !== "object" || body === null || !("cardId" in body) || typeof body.cardId !== "string" || !("answer" in body) || typeof body.answer !== "string") {
			throw new Error("Invalid request body for postSummarize");
		}
		const cardId = body.cardId;
		const questionId = "questionId" in body && typeof body.questionId === "string" ? body.questionId : undefined;
		const answer = body.answer;

		const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

		const card = cardsById.get(cardId);
		if (card === undefined) {
			return {
				statusCode: 400,
				headers: problemJsonHeader,
				body: createProblemDetails(400, "Bad Request", `Unknown card ID: ${cardId}`),
			};
		}

		let systemContent: string;
		if (questionId !== undefined && questionId !== "") {
			const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));
			const question = questionsById.get(questionId);
			if (question === undefined) {
				return {
					statusCode: 400,
					headers: problemJsonHeader,
					body: createProblemDetails(400, "Bad Request", `Unknown question ID: ${questionId}`),
				};
			}
			systemContent = `You are a reflective coach helping someone explore their sources of meaning. Summarize their answer.\n\n- 4 to 10 words\n- Do not ask questions\n- Match the vocabulary of the user's answer\n- Do not use the word '${question.topic}' in any form\n\nTopic: ${card.source} — ${card.description}\n\nQuestion given to user: ${question.text}`;
		} else {
			systemContent = `You are a reflective coach helping someone explore their sources of meaning. Summarize their personal notes.\n\n- 4 to 10 words\n- Do not ask questions\n- Match the vocabulary of the user's notes\n\nTopic: ${card.source} — ${card.description}\n\nThese are the user's personal notes about this source of meaning.`;
		}

		try {
			const content = await createChatCompletion({
				apiKey: appConfig.xaiApiKey,
				model: "grok-4-1-fast-reasoning",
				messages: [
					{
						role: "system",
						content: systemContent,
					},
					{
						role: "user",
						content: answer,
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

		const body: unknown = context.request.requestBody;
		if (typeof body !== "object" || body === null || !("cardId" in body) || typeof body.cardId !== "string" || !("questions" in body) || !Array.isArray(body.questions)) {
			throw new Error("Invalid request body for postInferAnswers");
		}
		const cardId = body.cardId;
		const items: unknown[] = body.questions;
		const questions: { questionId: string; answer: string }[] = [];
		for (const q of items) {
			if (typeof q === "object" && q !== null && "questionId" in q && typeof q.questionId === "string" && "answer" in q && typeof q.answer === "string") {
				questions.push({ questionId: q.questionId, answer: q.answer });
			}
		}

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

		const answeredById = new Map(questions.map((q) => [q.questionId, q.answer]));

		const promptQuestions = EXPLORE_QUESTIONS.map((q) => ({
			questionId: q.id,
			topic: q.topic,
			text: q.text,
			answer: answeredById.get(q.id) ?? "",
		}));

		const userMessage = JSON.stringify(promptQuestions);

		try {
			const content = await createChatCompletion({
				apiKey: appConfig.xaiApiKey,
				model: "grok-4-fast-non-reasoning",
				messages: [
					{
						role: "system",
						content: "You are a reflective coach helping someone explore their sources of meaning. " + `The user is reflecting on a source of meaning in their life: "${card.source}" — ${card.description}. ` + "The user will provide a JSON array of question objects about this topic. " + 'Questions with a non-empty "answer" have been answered by the user. ' + 'Questions with an empty "answer" are unanswered. ' + "Determine which unanswered questions are already addressed by the user's existing answers. " + "For each addressed question, write a short answer (1-3 sentences) mimicking the user's writing style. " + 'Return a JSON array of objects with "questionId" and "answer" fields. ' + "Only include questions that are clearly addressed. If none are addressed, return an empty array. " + "Return ONLY the JSON array, no other text.",
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
				const parsed: unknown = JSON.parse(content);
				if (!Array.isArray(parsed)) {
					return { statusCode: 200, body: { inferredAnswers: [] } };
				}
				const items: unknown[] = parsed;
				const inferredAnswers: { questionId: string; answer: string }[] = [];
				for (const item of items) {
					if (typeof item === "object" && item !== null && "questionId" in item && typeof item.questionId === "string" && "answer" in item && typeof item.answer === "string") {
						inferredAnswers.push({
							questionId: item.questionId,
							answer: item.answer,
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
	postCheckAnswerDepth: async (context: Context): Promise<ApiResponse> => {
		if (appConfig === undefined) {
			return {
				statusCode: 500,
				headers: problemJsonHeader,
				body: createProblemDetails(500, "Internal Server Error", "AI depth check is not configured."),
			};
		}

		const depthBody: unknown = context.request.requestBody;
		if (typeof depthBody !== "object" || depthBody === null || !("cardId" in depthBody) || typeof depthBody.cardId !== "string" || !("questionId" in depthBody) || typeof depthBody.questionId !== "string" || !("answer" in depthBody) || typeof depthBody.answer !== "string") {
			throw new Error("Invalid request body for postCheckAnswerDepth");
		}
		const depthCardId = depthBody.cardId;
		const questionId = depthBody.questionId;
		const answer = depthBody.answer;

		const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
		const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));

		const card = cardsById.get(depthCardId);
		if (card === undefined) {
			return {
				statusCode: 400,
				headers: problemJsonHeader,
				body: createProblemDetails(400, "Bad Request", `Unknown card ID: ${depthCardId}`),
			};
		}

		const question = questionsById.get(questionId);
		if (question === undefined) {
			return {
				statusCode: 400,
				headers: problemJsonHeader,
				body: createProblemDetails(400, "Bad Request", `Unknown question ID: ${questionId}`),
			};
		}

		try {
			const content = await createChatCompletion({
				apiKey: appConfig.xaiApiKey,
				model: "grok-4-fast-non-reasoning",
				messages: [
					{
						role: "system",
						content: 'You are evaluating whether someone\'s answer to a reflective question shows personal engagement rather than a dismissive or throwaway response.\n\nA SUFFICIENT answer is anything that shows the person actually thought about the question. Even a few sentences are fine if they contain a personal perspective, a specific detail, or any sign of genuine reflection.\n\nAn INSUFFICIENT answer is one that is clearly dismissive, essentially empty, or shows no real engagement. Examples of insufficient answers:\n- "I don\'t know"\n- "Sure"\n- "It\'s important to me"\n- "Yes" / "No" with nothing else\n- "I picked this because I\'ve been thinking about how I spend too much time working and not enough with my family"\n- "It reminded me of when I used to volunteer at the food bank — I miss that feeling"\n- "Honestly I\'m not sure but I think it connects to wanting more control over my schedule"\n\nExamples of sufficient answers (for a question like "What did you have in mind when you chose this?"):\n- "I chose this because over the last couple of years I\'ve noticed that I feel most alive when I\'m learning something completely new. Last year I started taking ceramics classes and it reminded me how much I love being a beginner — that mix of frustration and excitement. I want more of that in my life."\n- "This one stood out because I\'ve always valued independence but lately I\'ve been questioning whether I take it too far. I tend to push people away when they offer help, and I\'m starting to realize that\'s not independence — it\'s stubbornness. My partner pointed this out recently and it really stuck with me."\n- "When I saw this card I immediately thought about my grandfather. He was someone who lived very simply but always seemed content. Growing up I didn\'t understand why he turned down a promotion that would have meant more money — he said he already had enough and the new role would take him away from his garden and his neighbors.\\n\\nNow that I\'m older and constantly chasing the next milestone at work, I think about him a lot. There\'s something about his approach that feels wise in a way I couldn\'t appreciate as a kid. He wasn\'t lazy or unambitious, he just had a clear sense of what mattered to him.\\n\\nI chose this card because I want to find that same clarity. I don\'t think I need to live exactly like he did, but I want to stop and figure out what \'enough\' looks like for me before I burn out trying to get more of everything."\n\nWhen in doubt, lean toward marking the answer as sufficient. The goal is to gently catch throwaway responses, not to grade the quality of someone\'s self-reflection.\n\nReturn a JSON object with two fields: "sufficient" (boolean) and "followUpQuestion" (string). If sufficient, set followUpQuestion to "". If insufficient, write a brief, warm follow-up question that nudges the person to share a bit more. Return ONLY the JSON object.',
					},
					{
						role: "user",
						content: `Card: ${card.source} — ${card.description}\nQuestion topic: ${question.topic}\nQuestion: ${question.text}\nAnswer: ${answer}`,
					},
				],
				maxTokens: 150,
				temperature: 0.7,
				debugPrompt: appConfig.debugPrompt,
			});

			try {
				const parsed: unknown = JSON.parse(content);
				if (typeof parsed !== "object" || parsed === null) {
					return { statusCode: 200, body: { sufficient: true, followUpQuestion: "" } };
				}
				const sufficient = "sufficient" in parsed && typeof parsed.sufficient === "boolean" ? parsed.sufficient : true;
				const followUpQuestion = "followUpQuestion" in parsed && typeof parsed.followUpQuestion === "string" ? parsed.followUpQuestion : "";
				return { statusCode: 200, body: { sufficient, followUpQuestion } };
			} catch {
				return { statusCode: 200, body: { sufficient: true, followUpQuestion: "" } };
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
	postReportPdf: async (_context: Context, req: ExpressRequest, res: Response): Promise<void> => {
		const html = await renderReportHtml(req.app.locals.vite);
		res.type("text/html").send(html);
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
