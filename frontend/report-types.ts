// Report data types shared between ReportView.vue (browser), ReportContent.vue,
// and pdf-entry.ts (server-side rendering).

import type { MeaningCard } from "../shared/meaning-cards.ts";

export interface QuestionReport {
	topic: string;
	question: string;
	answer: string;
	summary: string;
}

export interface CardReport {
	card: MeaningCard;
	questions: QuestionReport[];
	freeformNote: string;
	freeformSummary: string;
}
