// @vitest-environment node

import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { FindMeaningRankingViewModel } from "./FindMeaningRankingViewModel.ts";
import { ensureSessionsInitialized, getActiveSessionId, loadChosenCardIds, loadRanking, saveRanking, saveSwipeProgress } from "./store.ts";

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

function sid(): string {
	return getActiveSessionId();
}

// Seeded RNG for deterministic tests (simple LCG)
function seededRng(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function setupSwipeProgressAllSwiped(cardIds: string[]): void {
	saveSwipeProgress(sid(), {
		shuffledCardIds: cardIds,
		swipeHistory: cardIds.map((id) => ({ cardId: id, direction: "agree" as const })),
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

describe("initialize", () => {
	it("returns 'no-data' when sorting isn't complete", () => {
		const vm = new FindMeaningRankingViewModel(sid());
		expect(vm.initialize(seededRng(1))).toBe("no-data");
	});

	it("returns 'no-data' when swipe progress exists but not all cards swiped", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		saveSwipeProgress(sid(), {
			shuffledCardIds: cardIds,
			swipeHistory: [{ cardId: cardIds[0], direction: "agree" }],
		});
		const vm = new FindMeaningRankingViewModel(sid());
		expect(vm.initialize(seededRng(1))).toBe("no-data");
	});

	it("returns 'skip' when <=5 candidate cards", () => {
		const cardIds = MEANING_CARDS.slice(0, 4).map((c) => c.id);
		setupSwipeProgressAllSwiped(cardIds);
		const vm = new FindMeaningRankingViewModel(sid());
		expect(vm.initialize(seededRng(1))).toBe("skip");
		expect(loadChosenCardIds(sid())).toEqual(cardIds);
	});

	it("returns 'ready' when >5 cards, populates currentPair", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		setupSwipeProgressAllSwiped(cardIds);
		const vm = new FindMeaningRankingViewModel(sid());
		expect(vm.initialize(seededRng(1))).toBe("ready");
		expect(vm.currentPair).not.toBeNull();
		expect(vm.currentPair!.length).toBe(2);
		expect(vm.round).toBe(0);
		expect(vm.isComplete).toBe(false);
	});

	it("resumes from saved comparison history", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		saveRanking(sid(), {
			cardIds,
			comparisons: [{ winner: cardIds[0], loser: cardIds[1] }],
			complete: false,
		});
		const vm = new FindMeaningRankingViewModel(sid());
		expect(vm.initialize(seededRng(1))).toBe("ready");
		expect(vm.round).toBe(1);
		expect(vm.canUndo).toBe(true);
	});
});

describe("choose", () => {
	function setupVm(): FindMeaningRankingViewModel {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		setupSwipeProgressAllSwiped(cardIds);
		const vm = new FindMeaningRankingViewModel(sid());
		vm.initialize(seededRng(42));
		return vm;
	}

	it("advances round and persists to localStorage", () => {
		const vm = setupVm();
		vm.choose(0);
		expect(vm.round).toBe(1);
		const saved = loadRanking(sid());
		expect(saved).not.toBeNull();
		expect(saved!.comparisons).toHaveLength(1);
	});

	it("throws when isComplete", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		// Build many comparisons to trigger max-comparisons stop
		const comparisons = [];
		for (let i = 0; i < 80; i++) {
			comparisons.push({ winner: cardIds[0], loser: cardIds[1] });
		}
		saveRanking(sid(), { cardIds, comparisons, complete: false });
		const vm = new FindMeaningRankingViewModel(sid());
		vm.initialize(seededRng(42));
		// After replaying 80 comparisons, it should be stopped
		expect(vm.isComplete).toBe(true);
		expect(() => {
			vm.choose(0);
		}).toThrow();
	});
});

describe("undo", () => {
	function setupVm(): FindMeaningRankingViewModel {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		setupSwipeProgressAllSwiped(cardIds);
		const vm = new FindMeaningRankingViewModel(sid());
		vm.initialize(seededRng(42));
		return vm;
	}

	it("throws when no comparisons", () => {
		const vm = setupVm();
		expect(() => {
			vm.undo();
		}).toThrow();
	});

	it("decrements round", () => {
		const vm = setupVm();
		vm.choose(0);
		expect(vm.round).toBe(1);
		vm.undo();
		expect(vm.round).toBe(0);
		expect(vm.canUndo).toBe(false);
	});

	it("persists to localStorage", () => {
		const vm = setupVm();
		vm.choose(0);
		vm.undo();
		const saved = loadRanking(sid());
		expect(saved).not.toBeNull();
		expect(saved!.comparisons).toHaveLength(0);
	});
});

describe("finalize", () => {
	it("saves chosen cards via loadChosenCardIds", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		setupSwipeProgressAllSwiped(cardIds);
		const vm = new FindMeaningRankingViewModel(sid());
		vm.initialize(seededRng(42));

		// Make comparisons until complete
		while (!vm.isComplete) {
			vm.choose(0);
		}
		vm.finalize();
		const chosen = loadChosenCardIds(sid());
		expect(chosen).not.toBeNull();
		expect(chosen!.length).toBe(5);
	});
});

describe("full ranking run", () => {
	it("completes ranking with 7 cards, picking lexicographically lowest card", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		setupSwipeProgressAllSwiped(cardIds);
		const vm = new FindMeaningRankingViewModel(sid());
		vm.initialize(seededRng(99));

		while (!vm.isComplete) {
			const pair = vm.currentPair!;
			// Pick the card with lexicographically lower ID
			const index = pair[0].id <= pair[1].id ? 0 : 1;
			vm.choose(index);
		}

		expect(vm.topK.length).toBe(5);
		vm.finalize();
		const chosen = loadChosenCardIds(sid());
		expect(chosen).not.toBeNull();
		expect(chosen!.length).toBe(5);
	});
});
