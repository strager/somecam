// @vitest-environment node

import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearAllProgress, createSession, deleteSession, ensureSessionsInitialized, exportProgressData, formatSessionDate, getActiveSessionId, hasProgressData, importProgressData, listSessions, loadChosenCardIds, loadExploreData, loadExploreDataFull, loadFreeformNotes, loadLlmTestState, loadPrioritize, loadSummaryCache, loadSwipeProgress, removePrioritize, renameSession, saveChosenCardIds, saveExploreData, saveFreeformNotes, saveLlmTestState, savePrioritize, saveSummaryCache, saveSwipeProgress, switchSession } from "./store.ts";

function sid(): string {
	return getActiveSessionId();
}
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";

const DEFAULT_QUESTION_ID = EXPLORE_QUESTIONS[0].id;

let currentWindow: Window | null = null;

function setGlobalDom(win: Window): void {
	Object.defineProperty(globalThis, "window", {
		value: win,
		configurable: true,
	});
	Object.defineProperty(globalThis, "document", {
		value: win.document,
		configurable: true,
	});
	Object.defineProperty(globalThis, "localStorage", {
		value: win.localStorage,
		configurable: true,
	});
}

beforeEach(() => {
	currentWindow = new Window({ url: "http://localhost" });
	setGlobalDom(currentWindow);
	ensureSessionsInitialized();
});

afterEach(() => {
	currentWindow?.close();
	currentWindow = null;
});

function activeKey(suffix: string): string {
	return `somecam-${getActiveSessionId()}-${suffix}`;
}

describe("loadChosenCardIds/saveChosenCardIds", () => {
	it("returns null when key is absent", () => {
		expect(loadChosenCardIds(sid())).toBeNull();
	});

	it("returns null for corrupt JSON", () => {
		localStorage.setItem(activeKey("chosen"), "{");
		expect(loadChosenCardIds(sid())).toBeNull();
	});

	it("returns null for empty array", () => {
		localStorage.setItem(activeKey("chosen"), JSON.stringify([]));
		expect(loadChosenCardIds(sid())).toBeNull();
	});

	it("returns null for non-array JSON", () => {
		localStorage.setItem(activeKey("chosen"), JSON.stringify("not-an-array"));
		expect(loadChosenCardIds(sid())).toBeNull();
	});

	it("returns null for arrays with non-string values", () => {
		localStorage.setItem(activeKey("chosen"), JSON.stringify(["self-knowledge", 42]));
		expect(loadChosenCardIds(sid())).toBeNull();
	});

	it("round-trips a saved array of card IDs", () => {
		saveChosenCardIds(sid(), ["self-knowledge", "community"]);
		expect(loadChosenCardIds(sid())).toEqual(["self-knowledge", "community"]);
	});

	it("preserves order of IDs", () => {
		saveChosenCardIds(sid(), ["community", "self-knowledge", "challenge"]);
		expect(loadChosenCardIds(sid())).toEqual(["community", "self-knowledge", "challenge"]);
	});
});

describe("loadSwipeProgress/saveSwipeProgress", () => {
	it("returns null when key is absent", () => {
		expect(loadSwipeProgress(sid())).toBeNull();
	});

	it("returns null when shuffledCardIds is missing", () => {
		localStorage.setItem(
			activeKey("progress"),
			JSON.stringify({
				swipeHistory: [],
			}),
		);
		expect(loadSwipeProgress(sid())).toBeNull();
	});

	it("returns null when shuffledCardIds is empty", () => {
		localStorage.setItem(
			activeKey("progress"),
			JSON.stringify({
				shuffledCardIds: [],
				swipeHistory: [],
			}),
		);
		expect(loadSwipeProgress(sid())).toBeNull();
	});

	it("returns null when swipeHistory is missing", () => {
		localStorage.setItem(
			activeKey("progress"),
			JSON.stringify({
				shuffledCardIds: ["self-knowledge"],
			}),
		);
		expect(loadSwipeProgress(sid())).toBeNull();
	});

	it("returns null when swipeHistory has invalid direction", () => {
		localStorage.setItem(
			activeKey("progress"),
			JSON.stringify({
				shuffledCardIds: ["self-knowledge"],
				swipeHistory: [{ cardId: "self-knowledge", direction: "keep" }],
			}),
		);
		expect(loadSwipeProgress(sid())).toBeNull();
	});

	it("returns null when swipeHistory has non-string cardId", () => {
		localStorage.setItem(
			activeKey("progress"),
			JSON.stringify({
				shuffledCardIds: ["self-knowledge"],
				swipeHistory: [{ cardId: 123, direction: "agree" }],
			}),
		);
		expect(loadSwipeProgress(sid())).toBeNull();
	});

	it("round-trips saved progress", () => {
		saveSwipeProgress(sid(), {
			shuffledCardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "self-knowledge", direction: "agree" }],
		});

		expect(loadSwipeProgress(sid())).toEqual({
			shuffledCardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "self-knowledge", direction: "agree" }],
		});
	});
});

describe("loadPrioritize/savePrioritize/removePrioritize", () => {
	it("returns null when key is absent", () => {
		expect(loadPrioritize(sid())).toBeNull();
	});

	it("returns null when cardIds is missing", () => {
		localStorage.setItem(
			activeKey("narrowdown"),
			JSON.stringify({
				swipeHistory: [],
			}),
		);
		expect(loadPrioritize(sid())).toBeNull();
	});

	it("returns null when cardIds is empty", () => {
		localStorage.setItem(
			activeKey("narrowdown"),
			JSON.stringify({
				cardIds: [],
				swipeHistory: [],
			}),
		);
		expect(loadPrioritize(sid())).toBeNull();
	});

	it("returns null when swipeHistory is missing", () => {
		localStorage.setItem(
			activeKey("narrowdown"),
			JSON.stringify({
				cardIds: ["self-knowledge"],
			}),
		);
		expect(loadPrioritize(sid())).toBeNull();
	});

	it("round-trips saved progress", () => {
		savePrioritize(sid(), {
			cardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "community", direction: "agree" }],
		});

		expect(loadPrioritize(sid())).toEqual({
			cardIds: ["self-knowledge", "community"],
			swipeHistory: [{ cardId: "community", direction: "agree" }],
		});
	});

	it("removePrioritize clears the key so loadPrioritize returns null", () => {
		savePrioritize(sid(), {
			cardIds: ["self-knowledge"],
			swipeHistory: [],
		});

		removePrioritize(sid());
		expect(loadPrioritize(sid())).toBeNull();
	});
});

describe("loadExploreData/saveExploreData", () => {
	it("returns null when key is absent", () => {
		expect(loadExploreData(sid())).toBeNull();
	});

	it("returns null for corrupt JSON", () => {
		localStorage.setItem(activeKey("explore"), "{");
		expect(loadExploreData(sid())).toBeNull();
	});

	it("returns null for malformed explore entries", () => {
		localStorage.setItem(
			activeKey("explore"),
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
		expect(loadExploreData(sid())).toBeNull();
	});

	it("round-trips saved explore data", () => {
		saveExploreData(sid(), {
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "My answer",
					prefilledAnswer: "",
					submitted: true,
				},
			],
		});

		expect(loadExploreData(sid())).toEqual({
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
		expect(loadExploreDataFull(sid())).toBeNull();
	});

	it("fills defaults for entries that lack guardrail fields", () => {
		localStorage.setItem(
			activeKey("explore"),
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

		expect(loadExploreDataFull(sid())).toEqual({
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
			activeKey("explore"),
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

		expect(loadExploreDataFull(sid())).toEqual({
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
			activeKey("explore"),
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
		expect(loadExploreDataFull(sid())).toBeNull();
	});

	it("returns null when submittedAfterGuardrail is not a boolean", () => {
		localStorage.setItem(
			activeKey("explore"),
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
		expect(loadExploreDataFull(sid())).toBeNull();
	});

	it("returns null when a card entry bucket is not an array", () => {
		localStorage.setItem(
			activeKey("explore"),
			JSON.stringify({
				"self-knowledge": {
					questionId: "interpretation",
				},
			}),
		);
		expect(loadExploreDataFull(sid())).toBeNull();
	});
});

describe("loadSummaryCache/saveSummaryCache", () => {
	it("returns empty object when key is absent", () => {
		expect(loadSummaryCache(sid())).toEqual({});
	});

	it("returns empty object for corrupt JSON", () => {
		localStorage.setItem(activeKey("summaries"), "{");
		expect(loadSummaryCache(sid())).toEqual({});
	});

	it("returns empty object for malformed cache entries", () => {
		localStorage.setItem(
			activeKey("summaries"),
			JSON.stringify({
				"self-knowledge:interpretation": {
					answer: "answer",
					summary: 123,
				},
			}),
		);
		expect(loadSummaryCache(sid())).toEqual({});
	});

	it("round-trips saved cache", () => {
		saveSummaryCache(sid(), {
			"self-knowledge:interpretation": {
				answer: "My answer",
				summary: "My summary",
			},
		});

		expect(loadSummaryCache(sid())).toEqual({
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
			"somecam-llm-test",
			JSON.stringify({
				cardId: 42,
				rows: [{ questionId: "interpretation", answer: "answer" }],
			}),
		);
		expect(loadLlmTestState()).toBeNull();
	});

	it("returns null when rows is missing", () => {
		localStorage.setItem(
			"somecam-llm-test",
			JSON.stringify({
				cardId: "self-knowledge",
			}),
		);
		expect(loadLlmTestState()).toBeNull();
	});

	it("returns null when rows is empty", () => {
		localStorage.setItem(
			"somecam-llm-test",
			JSON.stringify({
				cardId: "self-knowledge",
				rows: [],
			}),
		);
		expect(loadLlmTestState()).toBeNull();
	});

	it("normalizes non-object rows", () => {
		localStorage.setItem(
			"somecam-llm-test",
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
			"somecam-llm-test",
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
			"somecam-llm-test",
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
		expect(loadFreeformNotes(sid())).toEqual({});
	});

	it("returns empty object for corrupt JSON", () => {
		localStorage.setItem(activeKey("freeform"), "{");
		expect(loadFreeformNotes(sid())).toEqual({});
	});

	it("returns empty object for non-object JSON", () => {
		localStorage.setItem(activeKey("freeform"), JSON.stringify("not-an-object"));
		expect(loadFreeformNotes(sid())).toEqual({});
	});

	it("returns empty object when values are not strings", () => {
		localStorage.setItem(activeKey("freeform"), JSON.stringify({ "self-knowledge": 123 }));
		expect(loadFreeformNotes(sid())).toEqual({});
	});

	it("round-trips saved notes", () => {
		saveFreeformNotes(sid(), { "self-knowledge": "Some extra thoughts", community: "Community notes" });
		expect(loadFreeformNotes(sid())).toEqual({ "self-knowledge": "Some extra thoughts", community: "Community notes" });
	});

	it("round-trips empty object", () => {
		saveFreeformNotes(sid(), {});
		expect(loadFreeformNotes(sid())).toEqual({});
	});
});

describe("clearAllProgress", () => {
	it("removes all progress keys except llm-test", () => {
		saveSwipeProgress(sid(), {
			shuffledCardIds: ["self-knowledge"],
			swipeHistory: [],
		});
		savePrioritize(sid(), {
			cardIds: ["self-knowledge"],
			swipeHistory: [],
		});
		saveChosenCardIds(sid(), ["self-knowledge"]);
		saveExploreData(sid(), {
			"self-knowledge": [
				{
					questionId: "interpretation",
					userAnswer: "",
					prefilledAnswer: "",
					submitted: false,
				},
			],
		});
		saveSummaryCache(sid(), {
			"self-knowledge:interpretation": {
				answer: "answer",
				summary: "summary",
			},
		});
		saveFreeformNotes(sid(), { "self-knowledge": "Some notes" });
		const llmTestState = {
			cardId: "self-knowledge",
			rows: [{ questionId: "interpretation", answer: "answer" }],
		};
		saveLlmTestState(llmTestState);

		clearAllProgress(sid());

		expect(loadSwipeProgress(sid())).toBeNull();
		expect(loadPrioritize(sid())).toBeNull();
		expect(loadChosenCardIds(sid())).toBeNull();
		expect(loadExploreData(sid())).toBeNull();
		expect(loadSummaryCache(sid())).toEqual({});
		expect(loadFreeformNotes(sid())).toEqual({});
		expect(loadLlmTestState()).toEqual(llmTestState);
	});
});

describe("exportProgressData/importProgressData", () => {
	it("exportProgressData returns v2 format with empty session data", () => {
		const result = JSON.parse(exportProgressData());
		expect(result.version).toBe("somecam-v2");
		expect(Array.isArray(result.sessions)).toBe(true);
		expect(result.sessions).toHaveLength(1);
		expect(result.sessions[0].data).toEqual({});
	});

	it("exportProgressData includes session data", () => {
		saveChosenCardIds(sid(), ["self-knowledge", "community"]);
		const result = JSON.parse(exportProgressData());
		expect(result.sessions[0].data.chosen).toEqual(["self-knowledge", "community"]);
	});

	it("exportProgressData exports all sessions", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const secondId = createSession("Second");
		saveChosenCardIds(sid(), ["community"]);

		const result = JSON.parse(exportProgressData());
		expect(result.sessions).toHaveLength(2);
		const secondSession = result.sessions.find((s: any) => s.id === secondId);
		expect(secondSession).toBeDefined();
		expect(secondSession.data.chosen).toEqual(["community"]);
	});

	it("importProgressData v2 merges sessions by UUID", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const currentId = getActiveSessionId();
		const currentSessions = listSessions();

		const v2Data = JSON.stringify({
			version: "somecam-v2",
			sessions: [
				{
					id: currentId,
					name: "Updated Name",
					createdAt: currentSessions[0].createdAt,
					data: {
						chosen: ["community", "challenge"],
					},
				},
			],
		});

		importProgressData(v2Data);

		expect(loadChosenCardIds(sid())).toEqual(["community", "challenge"]);
		const sessions = listSessions();
		expect(sessions).toHaveLength(1);
		expect(sessions[0].name).toBe("Updated Name");
	});

	it("importProgressData v2 adds new sessions", () => {
		saveChosenCardIds(sid(), ["existing-card"]);

		const v2Data = JSON.stringify({
			version: "somecam-v2",
			sessions: [
				{
					id: "new-session-uuid",
					name: "Imported Session",
					createdAt: "2026-01-01T00:00:00.000Z",
					data: {
						chosen: ["creativity"],
					},
				},
			],
		});

		importProgressData(v2Data);

		const sessions = listSessions();
		expect(sessions).toHaveLength(2);
		const imported = sessions.find((s) => s.id === "new-session-uuid");
		expect(imported).toBeDefined();
		expect(imported?.name).toBe("Imported Session");
	});

	it("importProgressData v2 round-trips: export → import restores data", () => {
		saveChosenCardIds(sid(), ["self-knowledge", "community"]);
		saveFreeformNotes(sid(), { "self-knowledge": "notes" });

		const exported = exportProgressData();
		const activeId = getActiveSessionId();

		// Clear active session data
		clearAllProgress(sid());
		expect(loadChosenCardIds(sid())).toBeNull();

		importProgressData(exported);

		switchSession(activeId);
		expect(loadChosenCardIds(sid())).toEqual(["self-knowledge", "community"]);
		expect(loadFreeformNotes(sid())).toEqual({ "self-knowledge": "notes" });
	});

	it("importProgressData v2 clears data keys not present in import", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		saveFreeformNotes(sid(), { "self-knowledge": "notes" });
		const currentId = getActiveSessionId();

		const v2Data = JSON.stringify({
			version: "somecam-v2",
			sessions: [
				{
					id: currentId,
					name: "Updated",
					createdAt: new Date().toISOString(),
					data: {
						chosen: ["community"],
					},
				},
			],
		});

		importProgressData(v2Data);

		expect(loadChosenCardIds(sid())).toEqual(["community"]);
		expect(loadFreeformNotes(sid())).toEqual({});
	});

	it("importProgressData throws on invalid JSON", () => {
		expect(() => {
			importProgressData("{");
		}).toThrow();
	});

	it("importProgressData throws on unsupported version", () => {
		expect(() => {
			importProgressData(JSON.stringify({ version: "somecam-v99" }));
		}).toThrow(/version/);
	});

	it("importProgressData throws when version field is missing", () => {
		expect(() => {
			importProgressData(JSON.stringify({ "somecam-chosen": [] }));
		}).toThrow(/version/);
	});
});

describe("hasProgressData", () => {
	it("returns false when empty", () => {
		expect(hasProgressData(sid())).toBe(false);
	});

	it("returns true when any somecam key exists", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		expect(hasProgressData(sid())).toBe(true);
	});
});

describe("session management", () => {
	it("listSessions hides empty sessions", () => {
		expect(listSessions()).toHaveLength(0);
		saveChosenCardIds(sid(), ["self-knowledge"]);
		expect(listSessions()).toHaveLength(1);
	});

	it("listSessions hides empty sessions among non-empty ones", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		createSession("Empty Session");
		expect(listSessions()).toHaveLength(1);
		expect(listSessions()[0].name).not.toBe("Empty Session");
	});

	it("listSessions removes empty non-active sessions from localStorage", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const firstId = getActiveSessionId();
		const emptyId = createSession("Empty");
		// Switch back so the empty session is not active
		switchSession(firstId);

		listSessions();

		// The empty session should be purged from metadata
		const raw = localStorage.getItem("somecam-sessions");
		const meta = JSON.parse(raw ?? "[]");
		expect(meta.find((s: any) => s.id === emptyId)).toBeUndefined();
	});

	it("ensureSessionsInitialized creates one session", () => {
		expect(getActiveSessionId()).toBeTruthy();
	});

	it("ensureSessionsInitialized is idempotent", () => {
		const id = getActiveSessionId();
		ensureSessionsInitialized();
		ensureSessionsInitialized();
		expect(getActiveSessionId()).toBe(id);
	});

	it("createSession adds a new session and makes it active", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const firstId = getActiveSessionId();
		const secondId = createSession("Test Session");
		saveChosenCardIds(sid(), ["community"]);
		expect(secondId).not.toBe(firstId);
		expect(getActiveSessionId()).toBe(secondId);
		expect(listSessions()).toHaveLength(2);
	});

	it("createSession auto-names with formatted date when no name given", () => {
		const id = createSession();
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const sessions = listSessions();
		const session = sessions.find((s) => s.id === id);
		expect(session).toBeDefined();
		expect(session?.name).toBe(formatSessionDate(new Date()));
	});

	it("switchSession changes active session", () => {
		const firstId = getActiveSessionId();
		createSession("Second");
		switchSession(firstId);
		expect(getActiveSessionId()).toBe(firstId);
	});

	it("switchSession throws for unknown id", () => {
		expect(() => {
			switchSession("nonexistent");
		}).toThrow(/not found/);
	});

	it("renameSession updates the session name", () => {
		const id = getActiveSessionId();
		saveChosenCardIds(sid(), ["self-knowledge"]);
		renameSession(id, "New Name");
		const session = listSessions().find((s) => s.id === id);
		expect(session).toBeDefined();
		expect(session?.name).toBe("New Name");
	});

	it("renameSession throws for unknown id", () => {
		expect(() => {
			renameSession("nonexistent", "Name");
		}).toThrow(/not found/);
	});

	it("deleteSession removes session and its data", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const firstId = getActiveSessionId();
		createSession("Second");
		saveChosenCardIds(sid(), ["community"]);
		deleteSession(firstId);
		expect(listSessions()).toHaveLength(1);
		expect(localStorage.getItem(`somecam-${firstId}-chosen`)).toBeNull();
	});

	it("deleteSession switches to another session when deleting active", () => {
		const firstId = getActiveSessionId();
		const secondId = createSession("Second");
		switchSession(firstId);
		deleteSession(firstId);
		expect(getActiveSessionId()).toBe(secondId);
	});

	it("deleteSession creates new session when deleting the last one", () => {
		const onlyId = getActiveSessionId();
		deleteSession(onlyId);
		expect(getActiveSessionId()).not.toBe(onlyId);
	});

	it("deleteSession throws for unknown id", () => {
		expect(() => {
			deleteSession("nonexistent");
		}).toThrow(/not found/);
	});
});

describe("session data isolation", () => {
	it("data saved in one session is not visible in another", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		saveFreeformNotes(sid(), { "self-knowledge": "notes from session 1" });

		createSession("Second");

		expect(loadChosenCardIds(sid())).toBeNull();
		expect(loadFreeformNotes(sid())).toEqual({});
	});

	it("switching back to a session restores its data", () => {
		const firstId = getActiveSessionId();
		saveChosenCardIds(sid(), ["self-knowledge"]);

		createSession("Second");
		saveChosenCardIds(sid(), ["community"]);

		switchSession(firstId);
		expect(loadChosenCardIds(sid())).toEqual(["self-knowledge"]);
	});

	it("clearAllProgress only affects the active session", () => {
		saveChosenCardIds(sid(), ["self-knowledge"]);
		const firstId = getActiveSessionId();

		createSession("Second");
		saveChosenCardIds(sid(), ["community"]);
		clearAllProgress(sid());

		expect(loadChosenCardIds(sid())).toBeNull();
		switchSession(firstId);
		expect(loadChosenCardIds(sid())).toEqual(["self-knowledge"]);
	});
});

describe("formatSessionDate", () => {
	it("formats a date as 'Month Day, Year'", () => {
		const date = new Date(2026, 1, 13); // Feb 13, 2026
		expect(formatSessionDate(date)).toBe("February 13, 2026");
	});
});
