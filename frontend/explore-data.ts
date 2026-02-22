import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import { hashStrings } from "./deterministic-hash.ts";
import type { ExploreData } from "./store.ts";

export function assignQuestions(cardIds: string[], sessionId: string): ExploreData {
	const data: ExploreData = {};
	for (const cardId of cardIds) {
		const questionId = EXPLORE_QUESTIONS[hashStrings(sessionId, cardId) % EXPLORE_QUESTIONS.length].id;
		data[cardId] = {
			entries: [{ questionId, userAnswer: "", prefilledAnswer: "", submitted: false, guardrailText: "", submittedAfterGuardrail: false, thoughtBubbleText: "", thoughtBubbleAcknowledged: false }],
			freeformNote: "",
			statementSelections: [],
		};
	}
	return data;
}
