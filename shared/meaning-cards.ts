export interface MeaningCard {
	source: string;
	description: string;
}

export type SwipeDirection = "agree" | "disagree" | "unsure";

export const MEANING_CARDS: readonly MeaningCard[] = [
	{
		source: "Social commitment",
		description: "I intervene when I see injustice being done",
	},
	{
		source: "Religiosity",
		description: "My religion gives me strength",
	},
	{
		source: "Unity with nature",
		description: "It is my aim to live in harmony with nature",
	},
	{
		source: "Self-knowledge",
		description: "To understand myself and my behavior is important for me",
	},
	{
		source: "Health",
		description: "I think a healthy diet is of great importance",
	},
	{
		source: "Generativity",
		description: "I try to make the world a better place to live in",
	},
	{
		source: "Spirituality",
		description: "There are certain things in life I consider sacred",
	},
	{
		source: "Challenge",
		description: "I look for challenges",
	},
	{
		source: "Individualism",
		description: "Independence is immensely important to me",
	},
	{
		source: "Power",
		description: "When I get the opportunity, I show my strengths",
	},
	{
		source: "Development",
		description: "I am always on the look out for tasks that will teach me something",
	},
	{
		source: "Success",
		description: "I need to produce excellent results",
	},
	{
		source: "Freedom",
		description: "Freedom is the most important thing for me",
	},
	{
		source: "Knowledge",
		description: "I like to question everything",
	},
	{
		source: "Creativity",
		description: "Picasso was right saying that the most important things in life are to be creative and imaginative",
	},
	{
		source: "Tradition",
		description: "People shouldn't question tried and tested traditions",
	},
	{
		source: "Practicality",
		description: "People should always be realists",
	},
	{
		source: "Moral",
		description: "Everyone needs clear values to hold on to",
	},
	{
		source: "Reason",
		description: "Reason is the measure of all things",
	},
	{
		source: "Community",
		description: "I need to be around other people",
	},
	{
		source: "Fun",
		description: "It is important for me to laugh heartily at least once a day",
	},
	{
		source: "Love",
		description: "I take a great deal of time on matters of love and romance",
	},
	{
		source: "Comfort",
		description: "People should spoil themselves regularly",
	},
	{
		source: "Care",
		description: "I am always thinking of how I can make other people happy",
	},
	{
		source: "Attentiveness",
		description: "I want to experience every moment of my life to the full",
	},
	{
		source: "Harmony",
		description: "I am striving for inner harmony",
	},
];
