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
