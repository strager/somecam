export interface ExploreQuestion {
	id: string;
	topic: string;
	text: string;
}

export const EXPLORE_QUESTIONS: readonly ExploreQuestion[] = [
	{
		id: "interpretation",
		topic: "Interpretation",
		text: "What did you have in mind when you chose this?",
	},
	{
		id: "significance",
		topic: "Significance",
		text: "Can you tell why this is of importance for you?",
	},
	{
		id: "importance",
		topic: "Importance",
		text: "Has its importance changed through time? How is it now?",
	},
	{
		id: "threat",
		topic: "Threat",
		text: "Are you living according to this right now, or is something blocking it?",
	},
	{
		id: "change",
		topic: "Change",
		text: "What should change to make it more salient in your life?",
	},
];
