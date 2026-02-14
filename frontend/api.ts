import { capture } from "./analytics.ts";

interface SummarizeRequest {
	cardId: string;
	questionId: string;
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

async function postJson<T>(endpoint: string, payload: unknown, failureLabel: string): Promise<T> {
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
		const body = (await response.json()) as T;
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

export async function fetchSummary(request: SummarizeRequest): Promise<SummarizeResponse> {
	return postJson<SummarizeResponse>("/api/summarize", request, "Summarize");
}

export async function fetchAnswerDepthCheck(request: CheckAnswerDepthRequest): Promise<CheckAnswerDepthResponse> {
	return postJson<CheckAnswerDepthResponse>("/api/check-answer-depth", request, "Check answer depth");
}

export async function fetchInferredAnswers(request: InferAnswersRequest): Promise<InferAnswersResponse> {
	return postJson<InferAnswersResponse>("/api/infer-answers", request, "Infer answers");
}
