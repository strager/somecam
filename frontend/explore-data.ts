import { EXPLORE_QUESTIONS } from "../shared/explore-questions.js";

export interface ExploreEntry {
	questionId: string;
	userAnswer: string;
	prefilledAnswer: string;
	submitted: boolean;
}

export type ExploreData = Record<string, ExploreEntry[]>;

export const EXPLORE_KEY = "somecam-explore";

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
		data[cardId] = [{ questionId, userAnswer: "", prefilledAnswer: "", submitted: false }];
	}
	return data;
}
