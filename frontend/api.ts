interface SummarizeRequest {
	cardSource: string;
	cardDescription: string;
	questionText: string;
	answer: string;
}

interface SummarizeResponse {
	summary: string;
}

export async function fetchSummary(request: SummarizeRequest): Promise<SummarizeResponse> {
	const response = await fetch("/api/summarize", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Summarize request failed (${response.status.toString()}): ${text}`);
	}

	return (await response.json()) as SummarizeResponse;
}

interface InferAnswersRequest {
	cardId: string;
	questions: { questionId: string; answer: string }[];
}

interface InferAnswersResponse {
	inferredAnswers: { questionId: string; answer: string }[];
}

export async function fetchInferredAnswers(request: InferAnswersRequest): Promise<InferAnswersResponse> {
	const response = await fetch("/api/infer-answers", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Infer answers request failed (${response.status.toString()}): ${text}`);
	}

	return (await response.json()) as InferAnswersResponse;
}
