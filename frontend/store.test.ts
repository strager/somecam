// @vitest-environment node

import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearAllProgress, loadChosenCardIds, loadExploreData, loadExploreDataFull, loadLlmTestState, loadNarrowDown, loadSummaryCache, loadSwipeProgress, removeNarrowDown, saveChosenCardIds, saveExploreData, saveLlmTestState, saveNarrowDown, saveSummaryCache, saveSwipeProgress } from "./store.js";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.js";

const STORAGE_PREFIX = "somecam";

function storageKey(suffix: string): string {
	return `${STORAGE_PREFIX}-${suffix}`;
}

const CHOSEN_STORAGE_KEY = storageKey("chosen");
const PROGRESS_STORAGE_KEY = storageKey("progress");
const NARROWDOWN_STORAGE_KEY = storageKey("narrowdown");
const EXPLORE_STORAGE_KEY = storageKey("explore");
const SUMMARIES_STORAGE_KEY = storageKey("summaries");
const LLM_TEST_STORAGE_KEY = storageKey("llm-test");
const DEFAULT_QUESTION_ID = EXPLORE_QUESTIONS[0].id;

let currentDom: JSDOM | null = null;

function setGlobalDom(dom: JSDOM): void {
	Object.defineProperty(globalThis, "window", {
		value: dom.window,
		configurable: true,
	});
	Object.defineProperty(globalThis, "document", {
		value: dom.window.document,
		configurable: true,
	});
	Object.defineProperty(globalThis, "localStorage", {
		value: dom.window.localStorage,
		configurable: true,
	});
}

beforeEach(() => {
	currentDom = new JSDOM("", { url: "http://localhost" });
	setGlobalDom(currentDom);
});

afterEach(() => {
	currentDom?.window.close();
	currentDom = null;
});

describe("loadChosenCardIds/saveChosenCardIds", () => {
	it("returns null when key is absent", () => {
		expect(loadChosenCardIds()).toBeNull();
	});

	it("returns null for corrupt JSON", () => {
		localStorage.setItem(CHOSEN_STORAGE_KEY, "{");
		expect(loadChosenCardIds()).toBeNull();
	});

	it("returns null for empty array", () => {
		localStorage.setItem(CHOSEN_STORAGE_KEY, JSON.stringify([]));
		expect(loadChosenCardIds()).toBeNull();
	});

	it("returns null for non-array JSON", () => {
		localStorage.setItem(CHOSEN_STORAGE_KEY, JSON.stringify("not-an-array"));
		expect(loadChosenCardIds()).toBeNull();
	});

	it("returns null for arrays with non-string values", () => {
		localStorage.setItem(CHOSEN_STORAGE_KEY, JSON.stringify(["self-knowledge", 42]));
		expect(loadChosenCardIds()).toBeNull();
	});

	it("round-trips a saved array of card IDs", () => {
		saveChosenCardIds(["self-knowledge", "community"]);
		expect(loadChosenCardIds()).toEqual(["self-knowledge", "community"]);
	});

	it("preserves order of IDs", () => {
		saveChosenCardIds(["community", "self-knowledge", "challenge"]);
		expect(loadChosenCardIds()).toEqual(["community", "self-knowledge", "challenge"]);
	});
});

describe("loadSwipeProgress/saveSwipeProgress", () => {
	it("returns null when key is absent", () => {
		expect(loadSwipeProgress()).toBeNull();
	});

	it("returns null when shuffledCardIds is missing", () => {
		localStorage.setItem(
			PROGRESS_STORAGE_KEY,
			JSON.stringify({
				swipeHistory: [],
			}),
		);
		expect(loadSwipeProgress()).toBeNull();
	});

	it("returns null when shuffledCardIds is empty", () => {
		localStorage.setItem(
			PROGRESS_STORAGE_KEY,
			JSON.stringify({
				shuffledCardIds: [],
				swipeHistory: [],
			}),
		);
		expect(loadSwipeProgress()).toBeNull();
	});

	it("returns null when swipeHistory is missing", () => {
		localStorage.setItem(
			PROGRESS_STORAGE_KEY,
			JSON.stringify({
				shuffledCardIds: ["self-knowledge"],
			}),
		);
		expect(loadSwipeProgress()).toBeNull();
	});

	it("returns null when swipeHistory has invalid direction", () => {
		localStorage.setItem(
			PROGRESS_STORAGE_KEY,
			JSON.stringify({
				shuffledCardIds: ["self-knowledge"],
				swipeHistory: [{ cardId: "self-knowledge", direction: "keep" }],
			}),
		);
		expect(loadSwipeProgress()).toBeNull();
	});

	it("returns null when swipeHistory has non-string cardId", () => {
		localStorage.setItem(
			PROGRESS_STORAGE_KEY,
			JSON.stringify({
				shuffledCardIds: ["self-knowledge"],
				swipeHistory: [{ cardId: 123, direction: "agree" }],
			}),
		);
		expect(loadSwipeProgress()).toBeNull();
	});

	it("round-trips saved progress", () => {
		saveSwipeProgress({
			shuffledCardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "self-knowledge", direction: "agree" }],
		});

		expect(loadSwipeProgress()).toEqual({
			shuffledCardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "self-knowledge", direction: "agree" }],
		});
	});
});

describe("loadNarrowDown/saveNarrowDown/removeNarrowDown", () => {
	it("returns null when key is absent", () => {
		expect(loadNarrowDown()).toBeNull();
	});

	it("returns null when cardIds is missing", () => {
		localStorage.setItem(
			NARROWDOWN_STORAGE_KEY,
			JSON.stringify({
				swipeHistory: [],
			}),
		);
		expect(loadNarrowDown()).toBeNull();
	});

	it("returns null when cardIds is empty", () => {
		localStorage.setItem(
			NARROWDOWN_STORAGE_KEY,
			JSON.stringify({
				cardIds: [],
				swipeHistory: [],
			}),
		);
		expect(loadNarrowDown()).toBeNull();
	});

	it("returns null when swipeHistory is missing", () => {
		localStorage.setItem(
			NARROWDOWN_STORAGE_KEY,
			JSON.stringify({
				cardIds: ["self-knowledge"],
			}),
		);
		expect(loadNarrowDown()).toBeNull();
	});

	it("round-trips saved progress", () => {
		saveNarrowDown({
			cardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "community", direction: "agree" }],
		});

		expect(loadNarrowDown()).toEqual({
			cardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "community", direction: "agree" }],
		});
	});

	it("removeNarrowDown clears the key so loadNarrowDown returns null", () => {
		saveNarrowDown({
			cardIds: ["self-knowledge"],
			swipeHistory: [],
		});

		removeNarrowDown();
		expect(loadNarrowDown()).toBeNull();
	});
});

describe("loadExploreData/saveExploreData", () => {
	it("returns null when key is absent", () => {
		expect(loadExploreData()).toBeNull();
	});

	it("returns null for corrupt JSON", () => {
		localStorage.setItem(EXPLORE_STORAGE_KEY, "{");
		expect(loadExploreData()).toBeNull();
	});

	it("returns null for malformed explore entries", () => {
		localStorage.setItem(
			EXPLORE_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge": [
					{
						questionId: "interpretation",
						userAnswer: "answer",
						prefilledAnswer: "",
						submitted: "true",
					},
				],
			}),
		);
		expect(loadExploreData()).toBeNull();
	});

	it("round-trips saved explore data", () => {
		saveExploreData({
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "My answer",
					prefilledAnswer: "",
					submitted: true,
				},
			],
		});

		expect(loadExploreData()).toEqual({
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "My answer",
					prefilledAnswer: "",
					submitted: true,
				},
			],
		});
	});
});

describe("loadExploreDataFull", () => {
	it("returns null when key is absent", () => {
		expect(loadExploreDataFull()).toBeNull();
	});

	it("fills defaults for entries that lack guardrail fields", () => {
		localStorage.setItem(
			EXPLORE_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge": [
					{
						questionId: "interpretation",
						userAnswer: "answer",
						prefilledAnswer: "",
						submitted: true,
					},
				],
			}),
		);

		expect(loadExploreDataFull()).toEqual({
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "answer",
					prefilledAnswer: "",
					submitted: true,
					guardrailText: "",
					submittedAfterGuardrail: false,
				},
			],
		});
	});

	it("preserves existing guardrail fields", () => {
		localStorage.setItem(
			EXPLORE_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge": [
					{
						questionId: "interpretation",
						userAnswer: "answer",
						prefilledAnswer: "",
						submitted: true,
						guardrailText: "Can you go deeper?",
						submittedAfterGuardrail: true,
					},
				],
			}),
		);

		expect(loadExploreDataFull()).toEqual({
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "answer",
					prefilledAnswer: "",
					submitted: true,
					guardrailText: "Can you go deeper?",
					submittedAfterGuardrail: true,
				},
			],
		});
	});

	it("returns null when guardrailText is not a string", () => {
		localStorage.setItem(
			EXPLORE_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge": [
					{
						questionId: "interpretation",
						userAnswer: "answer",
						prefilledAnswer: "",
						submitted: true,
						guardrailText: 123,
					},
				],
			}),
		);
		expect(loadExploreDataFull()).toBeNull();
	});

	it("returns null when submittedAfterGuardrail is not a boolean", () => {
		localStorage.setItem(
			EXPLORE_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge": [
					{
						questionId: "interpretation",
						userAnswer: "answer",
						prefilledAnswer: "",
						submitted: true,
						submittedAfterGuardrail: "yes",
					},
				],
			}),
		);
		expect(loadExploreDataFull()).toBeNull();
	});

	it("returns null when a card entry bucket is not an array", () => {
		localStorage.setItem(
			EXPLORE_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge": {
					questionId: "interpretation",
				},
			}),
		);
		expect(loadExploreDataFull()).toBeNull();
	});
});

describe("loadSummaryCache/saveSummaryCache", () => {
	it("returns empty object when key is absent", () => {
		expect(loadSummaryCache()).toEqual({});
	});

	it("returns empty object for corrupt JSON", () => {
		localStorage.setItem(SUMMARIES_STORAGE_KEY, "{");
		expect(loadSummaryCache()).toEqual({});
	});

	it("returns empty object for malformed cache entries", () => {
		localStorage.setItem(
			SUMMARIES_STORAGE_KEY,
			JSON.stringify({
				"self-knowledge:interpretation": {
					answer: "answer",
					summary: 123,
				},
			}),
		);
		expect(loadSummaryCache()).toEqual({});
	});

	it("round-trips saved cache", () => {
		saveSummaryCache({
			"self-knowledge:interpretation": {
				answer: "My answer",
				summary: "My summary",
			},
		});

		expect(loadSummaryCache()).toEqual({
			"self-knowledge:interpretation": {
				answer: "My answer",
				summary: "My summary",
			},
		});
	});
});

describe("loadLlmTestState/saveLlmTestState", () => {
	it("returns null when key is absent", () => {
		expect(loadLlmTestState()).toBeNull();
	});

	it("returns null when cardId is not a string", () => {
		localStorage.setItem(
			LLM_TEST_STORAGE_KEY,
			JSON.stringify({
				cardId: 42,
				rows: [{ questionId: "interpretation", answer: "answer" }],
			}),
		);
		expect(loadLlmTestState()).toBeNull();
	});

	it("returns null when rows is missing", () => {
		localStorage.setItem(
			LLM_TEST_STORAGE_KEY,
			JSON.stringify({
				cardId: "self-knowledge",
			}),
		);
		expect(loadLlmTestState()).toBeNull();
	});

	it("returns null when rows is empty", () => {
		localStorage.setItem(
			LLM_TEST_STORAGE_KEY,
			JSON.stringify({
				cardId: "self-knowledge",
				rows: [],
			}),
		);
		expect(loadLlmTestState()).toBeNull();
	});

	it("normalizes non-object rows", () => {
		localStorage.setItem(
			LLM_TEST_STORAGE_KEY,
			JSON.stringify({
				cardId: "self-knowledge",
				rows: [null],
			}),
		);
		expect(loadLlmTestState()).toEqual({
			cardId: "self-knowledge",
			rows: [{ questionId: DEFAULT_QUESTION_ID, answer: "" }],
		});
	});

	it("normalizes rows with non-string questionId", () => {
		localStorage.setItem(
			LLM_TEST_STORAGE_KEY,
			JSON.stringify({
				cardId: "self-knowledge",
				rows: [{ questionId: 99, answer: "answer" }],
			}),
		);
		expect(loadLlmTestState()).toEqual({
			cardId: "self-knowledge",
			rows: [{ questionId: DEFAULT_QUESTION_ID, answer: "answer" }],
		});
	});

	it("normalizes rows with non-string answer", () => {
		localStorage.setItem(
			LLM_TEST_STORAGE_KEY,
			JSON.stringify({
				cardId: "self-knowledge",
				rows: [{ questionId: "interpretation", answer: 99 }],
			}),
		);
		expect(loadLlmTestState()).toEqual({
			cardId: "self-knowledge",
			rows: [{ questionId: "interpretation", answer: "" }],
		});
	});

	it("round-trips saved state", () => {
		saveLlmTestState({
			cardId: "self-knowledge",
			rows: [
				{ questionId: "interpretation", answer: "answer 1" },
				{ questionId: "importance", answer: "answer 2" },
			],
		});

		expect(loadLlmTestState()).toEqual({
			cardId: "self-knowledge",
			rows: [
				{ questionId: "interpretation", answer: "answer 1" },
				{ questionId: "importance", answer: "answer 2" },
			],
		});
	});
});

describe("clearAllProgress", () => {
	it("removes all progress keys except llm-test", () => {
		saveSwipeProgress({
			shuffledCardIds: ["self-knowledge"],
			swipeHistory: [],
		});
		saveNarrowDown({
			cardIds: ["self-knowledge"],
			swipeHistory: [],
		});
		saveChosenCardIds(["self-knowledge"]);
		saveExploreData({
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "",
					prefilledAnswer: "",
					submitted: false,
				},
			],
		});
		saveSummaryCache({
			"self-knowledge:interpretation": {
				answer: "answer",
				summary: "summary",
			},
		});
		const llmTestState = {
			cardId: "self-knowledge",
			rows: [{ questionId: "interpretation", answer: "answer" }],
		};
		saveLlmTestState(llmTestState);

		clearAllProgress();

		expect(loadSwipeProgress()).toBeNull();
		expect(loadNarrowDown()).toBeNull();
		expect(loadChosenCardIds()).toBeNull();
		expect(loadExploreData()).toBeNull();
		expect(loadSummaryCache()).toEqual({});
		expect(loadLlmTestState()).toEqual(llmTestState);
	});
});
