import { capture } from "./analytics.ts";

interface SummarizeRequest {
	cardId: string;
	questionId?: string;
	answer: string;
}

interface SummarizeResponse {
	summary: string;
}

interface CheckAnswerDepthRequest {
	cardId: string;
	questionId: string;
	answer: string;
}

interface CheckAnswerDepthResponse {
	sufficient: boolean;
	followUpQuestion: string;
}

interface InferAnswersRequest {
	cardId: string;
	questions: { questionId: string; answer: string }[];
}

interface InferAnswersResponse {
	inferredAnswers: { questionId: string; answer: string }[];
}

async function postJson<T>(endpoint: string, payload: unknown, failureLabel: string, validate: (raw: unknown) => T): Promise<T> {
	const start = performance.now();

	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
	} catch (error) {
		capture("api_call_failed", { endpoint, error_type: "network_error" });
		throw error;
	}

	if (!response.ok) {
		capture("api_call_failed", { endpoint, error_type: `http_${response.status.toString()}` });
		const text = await response.text();
		throw new Error(`${failureLabel} request failed (${response.status.toString()}): ${text}`);
	}

	try {
		const raw: unknown = await response.json();
		const body = validate(raw);
		capture("api_call_completed", {
			endpoint,
			latency_ms: Math.round(performance.now() - start),
		});
		return body;
	} catch {
		capture("api_call_failed", { endpoint, error_type: "invalid_json" });
		throw new Error(`${failureLabel} request failed: invalid JSON response`);
	}
}

function validateSummarizeResponse(raw: unknown): SummarizeResponse {
	if (typeof raw !== "object" || raw === null || !("summary" in raw) || typeof raw.summary !== "string") {
		throw new Error("Invalid summarize response");
	}
	return { summary: raw.summary };
}

function validateCheckAnswerDepthResponse(raw: unknown): CheckAnswerDepthResponse {
	if (typeof raw !== "object" || raw === null || !("sufficient" in raw) || typeof raw.sufficient !== "boolean" || !("followUpQuestion" in raw) || typeof raw.followUpQuestion !== "string") {
		throw new Error("Invalid check-answer-depth response");
	}
	return { sufficient: raw.sufficient, followUpQuestion: raw.followUpQuestion };
}

function validateInferAnswersResponse(raw: unknown): InferAnswersResponse {
	if (typeof raw !== "object" || raw === null || !("inferredAnswers" in raw) || !Array.isArray(raw.inferredAnswers)) {
		throw new Error("Invalid infer-answers response");
	}
	const items: unknown[] = raw.inferredAnswers;
	const inferredAnswers: { questionId: string; answer: string }[] = [];
	for (const item of items) {
		if (typeof item === "object" && item !== null && "questionId" in item && typeof item.questionId === "string" && "answer" in item && typeof item.answer === "string") {
			inferredAnswers.push({ questionId: item.questionId, answer: item.answer });
		}
	}
	return { inferredAnswers };
}

export async function fetchSummary(request: SummarizeRequest): Promise<SummarizeResponse> {
	return postJson("/api/summarize", request, "Summarize", validateSummarizeResponse);
}

export async function fetchAnswerDepthCheck(request: CheckAnswerDepthRequest): Promise<CheckAnswerDepthResponse> {
	return postJson("/api/check-answer-depth", request, "Check answer depth", validateCheckAnswerDepthResponse);
}

export async function fetchInferredAnswers(request: InferAnswersRequest): Promise<InferAnswersResponse> {
	return postJson("/api/infer-answers", request, "Infer answers", validateInferAnswersResponse);
}
