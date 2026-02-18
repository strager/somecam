import { MEANING_SOURCES, MEANING_STATEMENTS, type MeaningSource, type MeaningStatement } from "./meaning-statements.ts";

export interface MeaningCard {
	id: string;
	source: string;
	description: string;
}

export type SwipeDirection = "agree" | "disagree" | "unsure";

export const MEANING_CARDS: readonly MeaningCard[] = MEANING_SOURCES.map((source: MeaningSource) => {
	const statement: MeaningStatement | undefined = MEANING_STATEMENTS.find((s: MeaningStatement) => s.isPrimary && s.meaningId === source.id);
	if (statement === undefined) {
		throw new Error(`could not find item in MEANING_STATEMENTS for ${source.id}`);
	}
	return {
		id: source.id,
		source: source.name,
		description: statement.statement,
	};
});
