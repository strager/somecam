// @vitest-environment node

import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearAllProgress, exportProgressData, hasProgressData, importProgressData, loadChosenCardIds, loadExploreData, loadExploreDataFull, loadFreeformNotes, loadLlmTestState, loadPrioritize, loadSummaryCache, loadSwipeProgress, removePrioritize, saveChosenCardIds, saveExploreData, saveFreeformNotes, saveLlmTestState, savePrioritize, saveSummaryCache, saveSwipeProgress } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";

const STORAGE_PREFIX = "somecam";

function storageKey(suffix: string): string {
	return `${STORAGE_PREFIX}-${suffix}`;
}

const CHOSEN_STORAGE_KEY = storageKey("chosen");
const PROGRESS_STORAGE_KEY = storageKey("progress");
const PRIORITIZE_STORAGE_KEY = storageKey("narrowdown");
const EXPLORE_STORAGE_KEY = storageKey("explore");
const SUMMARIES_STORAGE_KEY = storageKey("summaries");
const FREEFORM_STORAGE_KEY = storageKey("freeform");
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

describe("loadPrioritize/savePrioritize/removePrioritize", () => {
	it("returns null when key is absent", () => {
		expect(loadPrioritize()).toBeNull();
	});

	it("returns null when cardIds is missing", () => {
		localStorage.setItem(
			PRIORITIZE_STORAGE_KEY,
			JSON.stringify({
				swipeHistory: [],
			}),
		);
		expect(loadPrioritize()).toBeNull();
	});

	it("returns null when cardIds is empty", () => {
		localStorage.setItem(
			PRIORITIZE_STORAGE_KEY,
			JSON.stringify({
				cardIds: [],
				swipeHistory: [],
			}),
		);
		expect(loadPrioritize()).toBeNull();
	});

	it("returns null when swipeHistory is missing", () => {
		localStorage.setItem(
			PRIORITIZE_STORAGE_KEY,
			JSON.stringify({
				cardIds: ["self-knowledge"],
			}),
		);
		expect(loadPrioritize()).toBeNull();
	});

	it("round-trips saved progress", () => {
		savePrioritize({
			cardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "community", direction: "agree" }],
		});

		expect(loadPrioritize()).toEqual({
			cardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "community", direction: "agree" }],
		});
	});

	it("removePrioritize clears the key so loadPrioritize returns null", () => {
		savePrioritize({
			cardIds: ["self-knowledge"],
			swipeHistory: [],
		});

		removePrioritize();
		expect(loadPrioritize()).toBeNull();
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

describe("loadFreeformNotes/saveFreeformNotes", () => {
	it("returns empty object when key is absent", () => {
		expect(loadFreeformNotes()).toEqual({});
	});

	it("returns empty object for corrupt JSON", () => {
		localStorage.setItem(FREEFORM_STORAGE_KEY, "{");
		expect(loadFreeformNotes()).toEqual({});
	});

	it("returns empty object for non-object JSON", () => {
		localStorage.setItem(FREEFORM_STORAGE_KEY, JSON.stringify("not-an-object"));
		expect(loadFreeformNotes()).toEqual({});
	});

	it("returns empty object when values are not strings", () => {
		localStorage.setItem(FREEFORM_STORAGE_KEY, JSON.stringify({ "self-knowledge": 123 }));
		expect(loadFreeformNotes()).toEqual({});
	});

	it("round-trips saved notes", () => {
		saveFreeformNotes({ "self-knowledge": "Some extra thoughts", community: "Community notes" });
		expect(loadFreeformNotes()).toEqual({ "self-knowledge": "Some extra thoughts", community: "Community notes" });
	});

	it("round-trips empty object", () => {
		saveFreeformNotes({});
		expect(loadFreeformNotes()).toEqual({});
	});
});

describe("clearAllProgress", () => {
	it("removes all progress keys except llm-test", () => {
		saveSwipeProgress({
			shuffledCardIds: ["self-knowledge"],
			swipeHistory: [],
		});
		savePrioritize({
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
		saveFreeformNotes({ "self-knowledge": "Some notes" });
		const llmTestState = {
			cardId: "self-knowledge",
			rows: [{ questionId: "interpretation", answer: "answer" }],
		};
		saveLlmTestState(llmTestState);

		clearAllProgress();

		expect(loadSwipeProgress()).toBeNull();
		expect(loadPrioritize()).toBeNull();
		expect(loadChosenCardIds()).toBeNull();
		expect(loadExploreData()).toBeNull();
		expect(loadSummaryCache()).toEqual({});
		expect(loadFreeformNotes()).toEqual({});
		expect(loadLlmTestState()).toEqual(llmTestState);
	});
});

describe("exportProgressData/importProgressData", () => {
	it("exportProgressData includes only version when localStorage is empty", () => {
		const result: unknown = JSON.parse(exportProgressData());
		expect(result).toEqual({ version: "somecam-v1" });
	});

	it("exportProgressData returns parsed (not double-encoded) values", () => {
		saveChosenCardIds(["self-knowledge", "community"]);
		const result = JSON.parse(exportProgressData()) as Record<string, unknown>;
		expect(result["somecam-chosen"]).toEqual(["self-knowledge", "community"]);
		expect(typeof result["somecam-chosen"]).not.toBe("string");
	});

	it("importProgressData round-trips: export → clear → import → values restored", () => {
		saveChosenCardIds(["self-knowledge", "community"]);
		saveFreeformNotes({ "self-knowledge": "notes" });

		const exported = exportProgressData();

		localStorage.removeItem(CHOSEN_STORAGE_KEY);
		localStorage.removeItem(FREEFORM_STORAGE_KEY);

		importProgressData(exported);

		expect(loadChosenCardIds()).toEqual(["self-knowledge", "community"]);
		expect(loadFreeformNotes()).toEqual({ "self-knowledge": "notes" });
	});

	it("importProgressData clears keys not present in the imported data", () => {
		saveChosenCardIds(["self-knowledge"]);
		saveFreeformNotes({ "self-knowledge": "notes" });

		const dataWithOnlyChosen = JSON.stringify({
			version: "somecam-v1",
			"somecam-chosen": ["community"],
		});

		importProgressData(dataWithOnlyChosen);

		expect(loadChosenCardIds()).toEqual(["community"]);
		expect(loadFreeformNotes()).toEqual({});
	});

	it("importProgressData throws on invalid JSON", () => {
		expect(() => {
			importProgressData("{");
		}).toThrow();
	});

	it("importProgressData restores all data types from a complete input", () => {
		const input = JSON.stringify({
			version: "somecam-v1",
			"somecam-progress": {
				shuffledCardIds: ["self-knowledge", "community", "challenge"],
				swipeHistory: [
					{ cardId: "self-knowledge", direction: "agree" },
					{ cardId: "community", direction: "disagree" },
				],
			},
			"somecam-narrowdown": {
				cardIds: ["self-knowledge", "challenge"],
				swipeHistory: [{ cardId: "challenge", direction: "unsure" }],
			},
			"somecam-chosen": ["self-knowledge", "challenge"],
			"somecam-explore": {
				"self-knowledge": [
					{
						questionId: "interpretation",
						userAnswer: "It means knowing yourself",
						prefilledAnswer: "",
						submitted: true,
						guardrailText: "Can you elaborate?",
						submittedAfterGuardrail: true,
					},
					{
						questionId: "importance",
						userAnswer: "Very important to me",
						prefilledAnswer: "AI suggestion",
						submitted: true,
					},
				],
				challenge: [
					{
						questionId: "interpretation",
						userAnswer: "",
						prefilledAnswer: "",
						submitted: false,
					},
				],
			},
			"somecam-summaries": {
				"self-knowledge:interpretation": {
					answer: "It means knowing yourself",
					summary: "Self-awareness and introspection",
				},
			},
			"somecam-freeform": {
				"self-knowledge": "Extra thoughts about self-knowledge",
			},
			"somecam-llm-test": {
				cardId: "self-knowledge",
				rows: [
					{ questionId: "interpretation", answer: "test answer" },
					{ questionId: "importance", answer: "test answer 2" },
				],
			},
		});

		importProgressData(input);

		expect(loadSwipeProgress()).toEqual({
			shuffledCardIds: ["self-knowledge", "community", "challenge"],
			swipeHistory: [
				{ cardId: "self-knowledge", direction: "agree" },
				{ cardId: "community", direction: "disagree" },
			],
		});
		expect(loadPrioritize()).toEqual({
			cardIds: ["self-knowledge", "challenge"],
			swipeHistory: [{ cardId: "challenge", direction: "unsure" }],
		});
		expect(loadChosenCardIds()).toEqual(["self-knowledge", "challenge"]);
		expect(loadExploreDataFull()).toEqual({
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "It means knowing yourself",
					prefilledAnswer: "",
					submitted: true,
					guardrailText: "Can you elaborate?",
					submittedAfterGuardrail: true,
				},
				{
					questionId: "importance",
					userAnswer: "Very important to me",
					prefilledAnswer: "AI suggestion",
					submitted: true,
					guardrailText: "",
					submittedAfterGuardrail: false,
				},
			],
			challenge: [
				{
					questionId: "interpretation",
					userAnswer: "",
					prefilledAnswer: "",
					submitted: false,
					guardrailText: "",
					submittedAfterGuardrail: false,
				},
			],
		});
		expect(loadSummaryCache()).toEqual({
			"self-knowledge:interpretation": {
				answer: "It means knowing yourself",
				summary: "Self-awareness and introspection",
			},
		});
		expect(loadFreeformNotes()).toEqual({
			"self-knowledge": "Extra thoughts about self-knowledge",
		});
		expect(loadLlmTestState()).toEqual({
			cardId: "self-knowledge",
			rows: [
				{ questionId: "interpretation", answer: "test answer" },
				{ questionId: "importance", answer: "test answer 2" },
			],
		});
	});

	it("importProgressData throws when version field is missing", () => {
		expect(() => {
			importProgressData(JSON.stringify({ "somecam-chosen": [] }));
		}).toThrow(/version/);
	});

	it("importProgressData throws when version field is wrong", () => {
		expect(() => {
			importProgressData(JSON.stringify({ version: "somecam-v2" }));
		}).toThrow(/version/);
	});
});

describe("hasProgressData", () => {
	it("returns false when empty", () => {
		expect(hasProgressData()).toBe(false);
	});

	it("returns true when any somecam key exists", () => {
		saveChosenCardIds(["self-knowledge"]);
		expect(hasProgressData()).toBe(true);
	});
});
