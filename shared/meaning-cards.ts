export interface MeaningCard {
	id: string;
	source: string;
	description: string;
}

export type SwipeDirection = "agree" | "disagree" | "unsure";

export const MEANING_CARDS: readonly MeaningCard[] = [
	{
		id: "social-commitment",
		source: "Social commitment",
		description: "I intervene when I see injustice being done",
	},
	{
		id: "religiosity",
		source: "Religiosity",
		description: "My religion gives me strength",
	},
	{
		id: "unity-with-nature",
		source: "Unity with nature",
		description: "It is my aim to live in harmony with nature",
	},
	{
		id: "self-knowledge",
		source: "Self-knowledge",
		description: "To understand myself and my behavior is important for me",
	},
	{
		id: "health",
		source: "Health",
		description: "I think a healthy diet is of great importance",
	},
	{
		id: "generativity",
		source: "Generativity",
		description: "I try to make the world a better place to live in",
	},
	{
		id: "spirituality",
		source: "Spirituality",
		description: "There are certain things in life I consider sacred",
	},
	{
		id: "challenge",
		source: "Challenge",
		description: "I look for challenges",
	},
	{
		id: "individualism",
		source: "Individualism",
		description: "Independence is immensely important to me",
	},
	{
		id: "power",
		source: "Power",
		description: "When I get the opportunity, I show my strengths",
	},
	{
		id: "development",
		source: "Development",
		description: "I am always on the look out for tasks that will teach me something",
	},
	{
		id: "success",
		source: "Success",
		description: "I need to produce excellent results",
	},
	{
		id: "freedom",
		source: "Freedom",
		description: "Freedom is the most important thing for me",
	},
	{
		id: "knowledge",
		source: "Knowledge",
		description: "I like to question everything",
	},
	{
		id: "creativity",
		source: "Creativity",
		description: "Picasso was right saying that the most important things in life are to be creative and imaginative",
	},
	{
		id: "tradition",
		source: "Tradition",
		description: "People shouldn't question tried and tested traditions",
	},
	{
		id: "practicality",
		source: "Practicality",
		description: "People should always be realists",
	},
	{
		id: "moral",
		source: "Moral",
		description: "Everyone needs clear values to hold on to",
	},
	{
		id: "reason",
		source: "Reason",
		description: "Reason is the measure of all things",
	},
	{
		id: "community",
		source: "Community",
		description: "I need to be around other people",
	},
	{
		id: "fun",
		source: "Fun",
		description: "It is important for me to laugh heartily at least once a day",
	},
	{
		id: "love",
		source: "Love",
		description: "I take a great deal of time on matters of love and romance",
	},
	{
		id: "comfort",
		source: "Comfort",
		description: "People should spoil themselves regularly",
	},
	{
		id: "care",
		source: "Care",
		description: "I am always thinking of how I can make other people happy",
	},
	{
		id: "attentiveness",
		source: "Attentiveness",
		description: "I want to experience every moment of my life to the full",
	},
	{
		id: "harmony",
		source: "Harmony",
		description: "I am striving for inner harmony",
	},
];
