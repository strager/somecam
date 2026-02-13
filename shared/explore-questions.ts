export interface ExploreQuestion {
	id: string;
	text: string;
}

export const EXPLORE_QUESTIONS: readonly ExploreQuestion[] = [
	{
		id: "interpretation",
		text: "What did you have in mind when you chose this?",
	},
	{
		id: "significance",
		text: "Can you tell why this is of importance for you?",
	},
	{
		id: "importance",
		text: "Has its importance changed through time? How is it now?",
	},
	{
		id: "threat",
		text: "Are you living according to this right now, or is something blocking it?",
	},
	{
		id: "change",
		text: "What should change to make it more salient in your life?",
	},
];
