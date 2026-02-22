import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { ExploreData } from "./store.ts";
import { selectNextQuestion } from "./store.ts";

const allQuestionIds = EXPLORE_QUESTIONS.map((q) => q.id);

export function assignQuestions(cardIds: string[], sessionId: string): ExploreData {
	const data: ExploreData = {};
	for (const cardId of cardIds) {
		const questionId = selectNextQuestion(sessionId, cardId, allQuestionIds, []);
		data[cardId] = {
			entries: [{ questionId, userAnswer: "", prefilledAnswer: "", submitted: false, guardrailText: "", submittedAfterGuardrail: false, thoughtBubbleText: "", thoughtBubbleAcknowledged: false }],
			freeformNote: "",
			statementSelections: [],
		};
	}
	return data;
}
