import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { SwipeDirection } from "../shared/meaning-cards.ts";

const PROGRESS_KEY = "somecam-progress";
const NARROWDOWN_KEY = "somecam-narrowdown";
const CHOSEN_KEY = "somecam-chosen";
const EXPLORE_KEY = "somecam-explore";
const SUMMARIES_KEY = "somecam-summaries";
const FREEFORM_KEY = "somecam-freeform";
const LLM_TEST_KEY = "somecam-llm-test";
const PERSIST_REQUESTED_KEY = "somecam-persist-requested";

const DEFAULT_QUESTION_ID = EXPLORE_QUESTIONS[0]?.id ?? "";

export interface SwipeRecord {
	cardId: string;
	direction: SwipeDirection;
}

export interface SwipeProgress {
	shuffledCardIds: string[];
	swipeHistory: SwipeRecord[];
}

export interface NarrowDownProgress {
	cardIds: string[];
	swipeHistory: SwipeRecord[];
}

export interface ExploreEntry {
	questionId: string;
	userAnswer: string;
	prefilledAnswer: string;
	submitted: boolean;
}

export interface ExploreEntryFull extends ExploreEntry {
	guardrailText: string;
	submittedAfterGuardrail: boolean;
}

export type ExploreData = Record<string, ExploreEntry[]>;
export type ExploreDataFull = Record<string, ExploreEntryFull[]>;
export type SummaryCache = Record<string, { answer: string; summary: string }>;
export type FreeformNotes = Record<string, string>;

interface LlmTestRow {
	questionId: string;
	answer: string;
}

export interface LlmTestState {
	cardId: string;
	rows: LlmTestRow[];
}

function parseJsonFromStorage(key: string): unknown {
	try {
		const raw = localStorage.getItem(key);
		if (raw === null) {
			return null;
		}
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSwipeDirection(value: unknown): value is SwipeDirection {
	return value === "agree" || value === "disagree" || value === "unsure";
}

function isSwipeRecord(value: unknown): value is SwipeRecord {
	if (!isObjectRecord(value)) {
		return false;
	}
	return typeof value.cardId === "string" && isSwipeDirection(value.direction);
}

function isExploreEntry(value: unknown): value is ExploreEntry {
	if (!isObjectRecord(value)) {
		return false;
	}

	return typeof value.questionId === "string" && typeof value.userAnswer === "string" && typeof value.prefilledAnswer === "string" && typeof value.submitted === "boolean";
}

function toExploreEntryFull(value: unknown): ExploreEntryFull | null {
	if (!isExploreEntry(value)) {
		return null;
	}

	const withOptional = value as ExploreEntry & {
		guardrailText?: unknown;
		submittedAfterGuardrail?: unknown;
	};

	if (withOptional.guardrailText !== undefined && typeof withOptional.guardrailText !== "string") {
		return null;
	}
	if (withOptional.submittedAfterGuardrail !== undefined && typeof withOptional.submittedAfterGuardrail !== "boolean") {
		return null;
	}

	return {
		questionId: withOptional.questionId,
		userAnswer: withOptional.userAnswer,
		prefilledAnswer: withOptional.prefilledAnswer,
		submitted: withOptional.submitted,
		guardrailText: withOptional.guardrailText ?? "",
		submittedAfterGuardrail: withOptional.submittedAfterGuardrail ?? false,
	};
}

function isSummaryCacheEntry(value: unknown): value is { answer: string; summary: string } {
	if (!isObjectRecord(value)) {
		return false;
	}
	return typeof value.answer === "string" && typeof value.summary === "string";
}

export function loadSwipeProgress(): SwipeProgress | null {
	const parsed = parseJsonFromStorage(PROGRESS_KEY);
	if (!isObjectRecord(parsed)) {
		return null;
	}
	if (!isStringArray(parsed.shuffledCardIds) || parsed.shuffledCardIds.length === 0) {
		return null;
	}
	if (!Array.isArray(parsed.swipeHistory) || !parsed.swipeHistory.every((entry) => isSwipeRecord(entry))) {
		return null;
	}
	return {
		shuffledCardIds: parsed.shuffledCardIds,
		swipeHistory: parsed.swipeHistory,
	};
}

export function saveSwipeProgress(data: SwipeProgress): void {
	localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
}

export function loadNarrowDown(): NarrowDownProgress | null {
	const parsed = parseJsonFromStorage(NARROWDOWN_KEY);
	if (!isObjectRecord(parsed)) {
		return null;
	}
	if (!isStringArray(parsed.cardIds) || parsed.cardIds.length === 0) {
		return null;
	}
	if (!Array.isArray(parsed.swipeHistory) || !parsed.swipeHistory.every((entry) => isSwipeRecord(entry))) {
		return null;
	}
	return {
		cardIds: parsed.cardIds,
		swipeHistory: parsed.swipeHistory,
	};
}

export function saveNarrowDown(data: NarrowDownProgress): void {
	localStorage.setItem(NARROWDOWN_KEY, JSON.stringify(data));
}

export function removeNarrowDown(): void {
	localStorage.removeItem(NARROWDOWN_KEY);
}

export function loadChosenCardIds(): string[] | null {
	const parsed = parseJsonFromStorage(CHOSEN_KEY);
	if (!isStringArray(parsed) || parsed.length === 0) {
		return null;
	}
	return parsed;
}

export function saveChosenCardIds(ids: string[]): void {
	localStorage.setItem(CHOSEN_KEY, JSON.stringify(ids));
}

export function loadExploreData(): ExploreData | null {
	const parsed = parseJsonFromStorage(EXPLORE_KEY);
	if (!isObjectRecord(parsed)) {
		return null;
	}
	for (const entries of Object.values(parsed)) {
		if (!Array.isArray(entries) || !entries.every((entry) => isExploreEntry(entry))) {
			return null;
		}
	}
	return parsed as ExploreData;
}

export function loadExploreDataFull(): ExploreDataFull | null {
	const parsed = parseJsonFromStorage(EXPLORE_KEY);
	if (!isObjectRecord(parsed)) {
		return null;
	}

	const result: ExploreDataFull = {};
	for (const [cardId, entries] of Object.entries(parsed)) {
		if (!Array.isArray(entries)) {
			return null;
		}

		const fullEntries: ExploreEntryFull[] = [];
		for (const entry of entries) {
			const fullEntry = toExploreEntryFull(entry);
			if (fullEntry === null) {
				return null;
			}
			fullEntries.push(fullEntry);
		}
		result[cardId] = fullEntries;
	}

	return result;
}

export function saveExploreData(data: ExploreData | ExploreDataFull): void {
	localStorage.setItem(EXPLORE_KEY, JSON.stringify(data));
}

export function loadSummaryCache(): SummaryCache {
	const parsed = parseJsonFromStorage(SUMMARIES_KEY);
	if (!isObjectRecord(parsed)) {
		return {};
	}
	for (const entry of Object.values(parsed)) {
		if (!isSummaryCacheEntry(entry)) {
			return {};
		}
	}
	return parsed as SummaryCache;
}

export function saveSummaryCache(cache: SummaryCache): void {
	localStorage.setItem(SUMMARIES_KEY, JSON.stringify(cache));
}

export function loadFreeformNotes(): FreeformNotes {
	const parsed = parseJsonFromStorage(FREEFORM_KEY);
	if (!isObjectRecord(parsed)) {
		return {};
	}
	for (const value of Object.values(parsed)) {
		if (typeof value !== "string") {
			return {};
		}
	}
	return parsed as FreeformNotes;
}

export function saveFreeformNotes(notes: FreeformNotes): void {
	localStorage.setItem(FREEFORM_KEY, JSON.stringify(notes));
}

export function loadLlmTestState(): LlmTestState | null {
	const parsed = parseJsonFromStorage(LLM_TEST_KEY);
	if (!isObjectRecord(parsed)) {
		return null;
	}
	if (typeof parsed.cardId !== "string") {
		return null;
	}
	if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
		return null;
	}

	const rows: LlmTestRow[] = parsed.rows.map((row) => {
		if (!isObjectRecord(row)) {
			return {
				questionId: DEFAULT_QUESTION_ID,
				answer: "",
			};
		}
		return {
			questionId: typeof row.questionId === "string" ? row.questionId : DEFAULT_QUESTION_ID,
			answer: typeof row.answer === "string" ? row.answer : "",
		};
	});

	return {
		cardId: parsed.cardId,
		rows,
	};
}

export function saveLlmTestState(data: LlmTestState): void {
	localStorage.setItem(LLM_TEST_KEY, JSON.stringify(data));
}

export type ProgressPhase = "explore" | "narrow-complete" | "narrow" | "swipe" | "none";

export function detectProgressPhase(): ProgressPhase {
	if (loadChosenCardIds() !== null) {
		return "explore";
	}
	const narrow = loadNarrowDown();
	if (narrow !== null) {
		if (narrow.swipeHistory.length >= narrow.cardIds.length) {
			return "narrow-complete";
		}
		return "narrow";
	}
	const swipe = loadSwipeProgress();
	if (swipe !== null && swipe.swipeHistory.length > 0) {
		return "swipe";
	}
	return "none";
}

export function clearAllProgress(): void {
	localStorage.removeItem(PROGRESS_KEY);
	localStorage.removeItem(NARROWDOWN_KEY);
	localStorage.removeItem(CHOSEN_KEY);
	localStorage.removeItem(EXPLORE_KEY);
	localStorage.removeItem(SUMMARIES_KEY);
	localStorage.removeItem(FREEFORM_KEY);
}

const ALL_SOMECAM_KEYS = [PROGRESS_KEY, NARROWDOWN_KEY, CHOSEN_KEY, EXPLORE_KEY, SUMMARIES_KEY, FREEFORM_KEY, LLM_TEST_KEY];

const EXPORT_VERSION = "somecam-v1";

export function exportProgressData(): string {
	const result: Record<string, unknown> = { version: EXPORT_VERSION };
	for (const key of ALL_SOMECAM_KEYS) {
		const raw = localStorage.getItem(key);
		if (raw !== null) {
			result[key] = JSON.parse(raw) as unknown;
		}
	}
	return JSON.stringify(result);
}

export function importProgressData(json: string): void {
	const parsed: unknown = JSON.parse(json);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Invalid progress data: expected an object");
	}
	const obj = parsed as Record<string, unknown>;
	if (obj.version !== EXPORT_VERSION) {
		throw new Error(`Invalid progress data: expected version "${EXPORT_VERSION}", got "${String(obj.version)}"`);
	}
	for (const key of ALL_SOMECAM_KEYS) {
		localStorage.removeItem(key);
	}
	for (const key of ALL_SOMECAM_KEYS) {
		if (key in obj) {
			localStorage.setItem(key, JSON.stringify(obj[key]));
		}
	}
}

export function hasProgressData(): boolean {
	return ALL_SOMECAM_KEYS.some((key) => localStorage.getItem(key) !== null);
}

export function saveProgressFile(): void {
	const json = exportProgressData();
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "somecam-progress.json";
	a.click();
	URL.revokeObjectURL(url);
}

export function requestStoragePersistence(): void {
	if (!sessionStorage.getItem(PERSIST_REQUESTED_KEY)) {
		sessionStorage.setItem(PERSIST_REQUESTED_KEY, "1");
		void navigator.storage.persist();
	}
}

export function loadProgressFile(): Promise<void> {
	return new Promise((resolve, reject) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (!file) {
				reject(new Error("No file selected"));
				return;
			}
			file.text().then((text) => {
				importProgressData(text);
				resolve();
			}, reject);
		});
		input.click();
	});
}
