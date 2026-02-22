import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { ExploreData } from "./store.ts";

export function assignQuestions(cardIds: string[]): ExploreData {
	const data: ExploreData = {};
	let pool: string[] = [];
	for (const cardId of cardIds) {
		if (pool.length === 0) {
			pool = EXPLORE_QUESTIONS.map((q) => q.id);
		}
		const index = Math.floor(Math.random() * pool.length);
		const questionId = pool[index];
		pool.splice(index, 1);
		data[cardId] = {
			entries: [{ questionId, userAnswer: "", prefilledAnswer: "", submitted: false, guardrailText: "", submittedAfterGuardrail: false, thoughtBubbleText: "", thoughtBubbleAcknowledged: false }],
			freeformNote: "",
			statementSelections: [],
		};
	}
	return data;
}
