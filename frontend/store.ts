import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { SwipeDirection } from "../shared/meaning-cards.ts";

const SESSIONS_KEY = "somecam-sessions";
const ACTIVE_SESSION_KEY = "somecam-active-session";
const LLM_TEST_KEY = "somecam-llm-test";
const PERSIST_REQUESTED_KEY = "somecam-persist-requested";

const LEGACY_KEYS = ["somecam-progress", "somecam-narrowdown", "somecam-chosen", "somecam-explore", "somecam-summaries", "somecam-freeform"];
const SESSION_DATA_SUFFIXES = ["progress", "narrowdown", "chosen", "explore", "summaries", "freeform"] as const;

const DEFAULT_QUESTION_ID = EXPLORE_QUESTIONS[0]?.id ?? "";

export interface SessionMeta {
	id: string;
	name: string;
	createdAt: string;
	lastUpdatedAt: string;
}

export interface SwipeRecord {
	cardId: string;
	direction: SwipeDirection;
}

export interface SwipeProgress {
	shuffledCardIds: string[];
	swipeHistory: SwipeRecord[];
}

export interface PrioritizeProgress {
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

// --- Session management ---

function generateUUID(): string {
	return crypto.randomUUID();
}

export function formatSessionDate(date: Date): string {
	return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function loadSessionsMeta(): SessionMeta[] {
	const parsed = parseJsonFromStorage(SESSIONS_KEY);
	if (!Array.isArray(parsed)) {
		return [];
	}
	const result: SessionMeta[] = [];
	for (const entry of parsed) {
		if (!isObjectRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string" || typeof entry.createdAt !== "string") {
			continue;
		}
		result.push({
			id: entry.id,
			name: entry.name,
			createdAt: entry.createdAt,
			lastUpdatedAt: typeof entry.lastUpdatedAt === "string" ? entry.lastUpdatedAt : entry.createdAt,
		});
	}
	return result;
}

function saveSessionsMeta(sessions: SessionMeta[]): void {
	localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function hasLegacyData(): boolean {
	return LEGACY_KEYS.some((key) => localStorage.getItem(key) !== null);
}

function migrateToSessions(): void {
	const id = generateUUID();
	for (const suffix of SESSION_DATA_SUFFIXES) {
		const legacyKey = `somecam-${suffix}`;
		const raw = localStorage.getItem(legacyKey);
		if (raw !== null) {
			localStorage.setItem(`somecam-${id}-${suffix}`, raw);
			localStorage.removeItem(legacyKey);
		}
	}
	const now = new Date().toISOString();
	const meta: SessionMeta = {
		id,
		name: formatSessionDate(new Date()),
		createdAt: now,
		lastUpdatedAt: now,
	};
	saveSessionsMeta([meta]);
	localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

export function ensureSessionsInitialized(): void {
	if (localStorage.getItem(SESSIONS_KEY) !== null) {
		return;
	}
	if (hasLegacyData()) {
		migrateToSessions();
		return;
	}
	const id = generateUUID();
	const now = new Date().toISOString();
	const meta: SessionMeta = {
		id,
		name: formatSessionDate(new Date()),
		createdAt: now,
		lastUpdatedAt: now,
	};
	saveSessionsMeta([meta]);
	localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

export function getActiveSessionId(): string {
	ensureSessionsInitialized();
	const id = localStorage.getItem(ACTIVE_SESSION_KEY);
	if (id !== null) {
		return id;
	}
	const sessions = loadSessionsMeta();
	if (sessions.length > 0) {
		localStorage.setItem(ACTIVE_SESSION_KEY, sessions[0].id);
		return sessions[0].id;
	}
	ensureSessionsInitialized();
	// ensureSessionsInitialized always creates a session and sets the active key
	const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
	if (activeId === null) {
		throw new Error("ensureSessionsInitialized failed to create a session");
	}
	return activeId;
}

function sessionHasData(id: string): boolean {
	return SESSION_DATA_SUFFIXES.some((suffix) => localStorage.getItem(`somecam-${id}-${suffix}`) !== null);
}

export function listSessions(): SessionMeta[] {
	ensureSessionsInitialized();
	const all = loadSessionsMeta();
	const nonEmpty = all.filter((s) => sessionHasData(s.id));
	if (nonEmpty.length < all.length) {
		saveSessionsMeta(all.filter((s) => sessionHasData(s.id) || s.id === localStorage.getItem(ACTIVE_SESSION_KEY)));
	}
	return nonEmpty;
}

export function createSession(name?: string): string {
	ensureSessionsInitialized();
	const id = generateUUID();
	const now = new Date().toISOString();
	const meta: SessionMeta = {
		id,
		name: name ?? formatSessionDate(new Date()),
		createdAt: now,
		lastUpdatedAt: now,
	};
	const sessions = loadSessionsMeta();
	sessions.push(meta);
	saveSessionsMeta(sessions);
	localStorage.setItem(ACTIVE_SESSION_KEY, id);
	return id;
}

export function switchSession(id: string): void {
	const sessions = loadSessionsMeta();
	if (!sessions.some((s) => s.id === id)) {
		throw new Error(`Session not found: ${id}`);
	}
	localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

export function renameSession(id: string, newName: string): void {
	const sessions = loadSessionsMeta();
	const session = sessions.find((s) => s.id === id);
	if (!session) {
		throw new Error(`Session not found: ${id}`);
	}
	session.name = newName;
	saveSessionsMeta(sessions);
}

export function deleteSession(id: string): void {
	const sessions = loadSessionsMeta();
	const index = sessions.findIndex((s) => s.id === id);
	if (index === -1) {
		throw new Error(`Session not found: ${id}`);
	}

	for (const suffix of SESSION_DATA_SUFFIXES) {
		localStorage.removeItem(`somecam-${id}-${suffix}`);
	}

	sessions.splice(index, 1);

	if (sessions.length === 0) {
		const newId = generateUUID();
		const now = new Date().toISOString();
		const meta: SessionMeta = {
			id: newId,
			name: formatSessionDate(new Date()),
			createdAt: now,
			lastUpdatedAt: now,
		};
		sessions.push(meta);
		localStorage.setItem(ACTIVE_SESSION_KEY, newId);
	} else if (localStorage.getItem(ACTIVE_SESSION_KEY) === id) {
		localStorage.setItem(ACTIVE_SESSION_KEY, sessions[sessions.length - 1].id);
	}

	saveSessionsMeta(sessions);
}

function touchSession(sessionId: string): void {
	const sessions = loadSessionsMeta();
	const session = sessions.find((s) => s.id === sessionId);
	if (session) {
		session.lastUpdatedAt = new Date().toISOString();
		saveSessionsMeta(sessions);
	}
}

// --- Dynamic key resolution ---

function sessionKey(sessionId: string, suffix: string): string {
	return `somecam-${sessionId}-${suffix}`;
}

function progressKey(sessionId: string): string {
	return sessionKey(sessionId, "progress");
}
function narrowdownKey(sessionId: string): string {
	return sessionKey(sessionId, "narrowdown");
}
function chosenKey(sessionId: string): string {
	return sessionKey(sessionId, "chosen");
}
function exploreKey(sessionId: string): string {
	return sessionKey(sessionId, "explore");
}
function summariesKey(sessionId: string): string {
	return sessionKey(sessionId, "summaries");
}
function freeformKey(sessionId: string): string {
	return sessionKey(sessionId, "freeform");
}

// --- Internal helpers ---

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

// --- Session-scoped load/save ---

export function loadSwipeProgress(sessionId: string): SwipeProgress | null {
	const parsed = parseJsonFromStorage(progressKey(sessionId));
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

export function saveSwipeProgress(sessionId: string, data: SwipeProgress): void {
	localStorage.setItem(progressKey(sessionId), JSON.stringify(data));
	touchSession(sessionId);
}

export function loadPrioritize(sessionId: string): PrioritizeProgress | null {
	const parsed = parseJsonFromStorage(narrowdownKey(sessionId));
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

export function savePrioritize(sessionId: string, data: PrioritizeProgress): void {
	localStorage.setItem(narrowdownKey(sessionId), JSON.stringify(data));
	touchSession(sessionId);
}

export function removePrioritize(sessionId: string): void {
	localStorage.removeItem(narrowdownKey(sessionId));
}

export function loadChosenCardIds(sessionId: string): string[] | null {
	const parsed = parseJsonFromStorage(chosenKey(sessionId));
	if (!isStringArray(parsed) || parsed.length === 0) {
		return null;
	}
	return parsed;
}

export function saveChosenCardIds(sessionId: string, ids: string[]): void {
	localStorage.setItem(chosenKey(sessionId), JSON.stringify(ids));
	touchSession(sessionId);
}

export function selectCandidateCards(sessionId: string): string[] {
	const progress = loadSwipeProgress(sessionId);
	if (progress === null) return [];
	const agreeCardIds = progress.swipeHistory.filter((r) => r.direction === "agree").map((r) => r.cardId);
	const unsureCardIds = progress.swipeHistory.filter((r) => r.direction === "unsure").map((r) => r.cardId);
	return agreeCardIds.length < 3 ? agreeCardIds.concat(unsureCardIds) : agreeCardIds;
}

export function needsPrioritization(sessionId: string): boolean {
	const prioritize = loadPrioritize(sessionId);
	if (prioritize !== null) {
		return prioritize.cardIds.length > 5;
	}
	return selectCandidateCards(sessionId).length > 5;
}

export function loadExploreData(sessionId: string): ExploreData | null {
	const parsed = parseJsonFromStorage(exploreKey(sessionId));
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

export function loadExploreDataFull(sessionId: string): ExploreDataFull | null {
	const parsed = parseJsonFromStorage(exploreKey(sessionId));
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

export function saveExploreData(sessionId: string, data: ExploreData | ExploreDataFull): void {
	localStorage.setItem(exploreKey(sessionId), JSON.stringify(data));
	touchSession(sessionId);
}

export function loadSummaryCache(sessionId: string): SummaryCache {
	const parsed = parseJsonFromStorage(summariesKey(sessionId));
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

export function saveSummaryCache(sessionId: string, cache: SummaryCache): void {
	localStorage.setItem(summariesKey(sessionId), JSON.stringify(cache));
	touchSession(sessionId);
}

export function loadFreeformNotes(sessionId: string): FreeformNotes {
	const parsed = parseJsonFromStorage(freeformKey(sessionId));
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

export function saveFreeformNotes(sessionId: string, notes: FreeformNotes): void {
	localStorage.setItem(freeformKey(sessionId), JSON.stringify(notes));
	touchSession(sessionId);
}

// --- Global (non-session-scoped) ---

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

// --- Progress detection ---

export type ProgressPhase = "explore" | "prioritize-complete" | "prioritize" | "swipe" | "none";

export function detectSessionPhase(id: string): ProgressPhase {
	const chosenRaw = parseJsonFromStorage(`somecam-${id}-chosen`);
	if (isStringArray(chosenRaw) && chosenRaw.length > 0) {
		return "explore";
	}
	const narrowRaw = parseJsonFromStorage(`somecam-${id}-narrowdown`);
	if (isObjectRecord(narrowRaw) && isStringArray(narrowRaw.cardIds) && narrowRaw.cardIds.length > 0 && Array.isArray(narrowRaw.swipeHistory)) {
		if (narrowRaw.swipeHistory.length >= narrowRaw.cardIds.length) {
			return "prioritize-complete";
		}
		return "prioritize";
	}
	const progressRaw = parseJsonFromStorage(`somecam-${id}-progress`);
	if (isObjectRecord(progressRaw) && Array.isArray(progressRaw.swipeHistory) && progressRaw.swipeHistory.length > 0) {
		return "swipe";
	}
	return "none";
}

export function clearAllProgress(sessionId: string): void {
	for (const suffix of SESSION_DATA_SUFFIXES) {
		localStorage.removeItem(sessionKey(sessionId, suffix));
	}
}

export function hasProgressData(sessionId: string): boolean {
	return SESSION_DATA_SUFFIXES.some((suffix) => localStorage.getItem(sessionKey(sessionId, suffix)) !== null);
}

// --- Export / Import ---

const EXPORT_VERSION_V1 = "somecam-v1";
const EXPORT_VERSION_V2 = "somecam-v2";

const LEGACY_V1_KEYS = ["somecam-progress", "somecam-narrowdown", "somecam-chosen", "somecam-explore", "somecam-summaries", "somecam-freeform", "somecam-llm-test"];

export function exportProgressData(): string {
	const sessions = loadSessionsMeta();
	const exported: { id: string; name: string; createdAt: string; lastUpdatedAt: string; data: Record<string, unknown> }[] = [];
	for (const session of sessions) {
		const data: Record<string, unknown> = {};
		for (const suffix of SESSION_DATA_SUFFIXES) {
			const raw = localStorage.getItem(`somecam-${session.id}-${suffix}`);
			if (raw !== null) {
				data[suffix] = JSON.parse(raw) as unknown;
			}
		}
		exported.push({ id: session.id, name: session.name, createdAt: session.createdAt, lastUpdatedAt: session.lastUpdatedAt, data });
	}
	return JSON.stringify({ version: EXPORT_VERSION_V2, sessions: exported });
}

export function importProgressData(json: string): void {
	const parsed: unknown = JSON.parse(json);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Invalid progress data: expected an object");
	}
	const obj = parsed as Record<string, unknown>;

	if (obj.version === EXPORT_VERSION_V1) {
		importV1Data(obj);
		return;
	}

	if (obj.version !== EXPORT_VERSION_V2) {
		throw new Error(`Invalid progress data: unsupported version "${String(obj.version)}"`);
	}

	if (!Array.isArray(obj.sessions)) {
		throw new Error("Invalid progress data: expected sessions array");
	}

	ensureSessionsInitialized();
	const existingSessions = loadSessionsMeta();

	for (const entry of obj.sessions) {
		if (!isObjectRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string" || typeof entry.createdAt !== "string") {
			continue;
		}
		const data = isObjectRecord(entry.data) ? entry.data : {};

		// Write session data keys
		for (const suffix of SESSION_DATA_SUFFIXES) {
			const key = `somecam-${entry.id}-${suffix}`;
			if (suffix in data) {
				localStorage.setItem(key, JSON.stringify(data[suffix]));
			} else {
				localStorage.removeItem(key);
			}
		}

		// Update or add session metadata
		const existingIndex = existingSessions.findIndex((s) => s.id === entry.id);
		const meta: SessionMeta = {
			id: entry.id,
			name: entry.name,
			createdAt: entry.createdAt,
			lastUpdatedAt: typeof entry.lastUpdatedAt === "string" ? entry.lastUpdatedAt : entry.createdAt,
		};
		if (existingIndex !== -1) {
			existingSessions[existingIndex] = meta;
		} else {
			existingSessions.push(meta);
		}
	}

	saveSessionsMeta(existingSessions);
}

function importV1Data(obj: Record<string, unknown>): void {
	ensureSessionsInitialized();
	const id = generateUUID();

	for (const suffix of SESSION_DATA_SUFFIXES) {
		const legacyKey = `somecam-${suffix}`;
		if (legacyKey in obj) {
			localStorage.setItem(`somecam-${id}-${suffix}`, JSON.stringify(obj[legacyKey]));
		}
	}

	// Also import llm-test if present (global key)
	if (LEGACY_V1_KEYS.includes("somecam-llm-test") && "somecam-llm-test" in obj) {
		localStorage.setItem(LLM_TEST_KEY, JSON.stringify(obj["somecam-llm-test"]));
	}

	const now = new Date().toISOString();
	const meta: SessionMeta = {
		id,
		name: formatSessionDate(new Date()),
		createdAt: now,
		lastUpdatedAt: now,
	};
	const sessions = loadSessionsMeta();
	sessions.push(meta);
	saveSessionsMeta(sessions);
	localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

export function saveProgressFile(): void {
	const json = exportProgressData();
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "somecam-sessions.json";
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
