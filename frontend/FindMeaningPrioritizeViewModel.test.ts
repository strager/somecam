// @vitest-environment node

import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { FindMeaningPrioritizeViewModel } from "./FindMeaningPrioritizeViewModel.ts";
import { ensureSessionsInitialized, getActiveSessionId, loadChosenCardIds, loadPrioritize, savePrioritize } from "./store.ts";

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
	it("returns 'no-data' when no prioritize data in localStorage", () => {
		const vm = new FindMeaningPrioritizeViewModel(sid());
		expect(vm.initialize()).toBe("no-data");
	});

	it("returns 'skip' when ≤5 cards (saves chosen cards, removes prioritize data)", () => {
		const cardIds = MEANING_CARDS.slice(0, 4).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });

		const vm = new FindMeaningPrioritizeViewModel(sid());
		expect(vm.initialize()).toBe("skip");
		expect(loadChosenCardIds(sid())).toEqual(cardIds);
		expect(loadPrioritize(sid())).toBeNull();
	});

	it("returns 'ready' and loads cards when >5 cards exist", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });

		const vm = new FindMeaningPrioritizeViewModel(sid());
		expect(vm.initialize()).toBe("ready");
		expect(vm.totalCards).toBe(7);
		expect(vm.currentIndex).toBe(0);
		expect(vm.currentCard).not.toBeNull();
	});

	it("resumes from saved swipe history", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		const history = [
			{ cardId: cardIds[0], direction: "agree" as const },
			{ cardId: cardIds[1], direction: "disagree" as const },
		];
		savePrioritize(sid(), { cardIds, swipeHistory: history });

		const vm = new FindMeaningPrioritizeViewModel(sid());
		expect(vm.initialize()).toBe("ready");
		expect(vm.currentIndex).toBe(2);
		expect(vm.canUndo).toBe(true);
	});

	it("returns 'no-data' when all saved card IDs are unknown", () => {
		savePrioritize(sid(), { cardIds: ["nonexistent-1", "nonexistent-2", "nonexistent-3", "nonexistent-4", "nonexistent-5", "nonexistent-6"], swipeHistory: [] });

		const vm = new FindMeaningPrioritizeViewModel(sid());
		expect(vm.initialize()).toBe("no-data");
	});
});

describe("swipe", () => {
	function setupVm(): FindMeaningPrioritizeViewModel {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });
		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();
		return vm;
	}

	it("advances currentIndex", () => {
		const vm = setupVm();
		vm.swipe("agree");
		expect(vm.currentIndex).toBe(1);
	});

	it("sets canUndo to true", () => {
		const vm = setupVm();
		expect(vm.canUndo).toBe(false);
		vm.swipe("agree");
		expect(vm.canUndo).toBe(true);
	});

	it("persists to localStorage via loadPrioritize()", () => {
		const vm = setupVm();
		vm.swipe("agree");
		const saved = loadPrioritize(sid());
		expect(saved).not.toBeNull();
		expect(saved!.swipeHistory).toHaveLength(1);
		expect(saved!.swipeHistory[0].direction).toBe("agree");
	});

	it("is a no-op when isComplete", () => {
		const cardIds = MEANING_CARDS.slice(0, 6).map((c) => c.id);
		const history = cardIds.map((id) => ({ cardId: id, direction: "agree" as const }));
		savePrioritize(sid(), { cardIds, swipeHistory: history });

		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();
		expect(vm.isComplete).toBe(true);
		vm.swipe("agree");
		expect(vm.currentIndex).toBe(6);
	});
});

describe("undo", () => {
	function setupVm(): FindMeaningPrioritizeViewModel {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });
		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();
		return vm;
	}

	it("decrements currentIndex and restores previous card", () => {
		const vm = setupVm();
		const first = vm.currentCard;
		vm.swipe("agree");
		vm.undo();
		expect(vm.currentIndex).toBe(0);
		expect(vm.currentCard).toEqual(first);
	});

	it("sets canUndo to false after undoing only swipe", () => {
		const vm = setupVm();
		vm.swipe("agree");
		vm.undo();
		expect(vm.canUndo).toBe(false);
	});

	it("persists to localStorage", () => {
		const vm = setupVm();
		vm.swipe("agree");
		vm.undo();
		const saved = loadPrioritize(sid());
		expect(saved).not.toBeNull();
		expect(saved!.swipeHistory).toHaveLength(0);
	});

	it("is a no-op when canUndo is false", () => {
		const vm = setupVm();
		vm.undo();
		expect(vm.currentIndex).toBe(0);
	});
});

describe("derived properties", () => {
	it("keptCount increases when swiping 'agree'", () => {
		const cardIds = MEANING_CARDS.slice(0, 7).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });
		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();

		expect(vm.keptCount).toBe(0);
		vm.swipe("agree");
		expect(vm.keptCount).toBe(1);
		vm.swipe("disagree");
		expect(vm.keptCount).toBe(1);
	});

	it("isComplete becomes true after swiping all cards", () => {
		const cardIds = MEANING_CARDS.slice(0, 6).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });
		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();

		expect(vm.isComplete).toBe(false);
		for (let i = 0; i < 6; i++) {
			vm.swipe("agree");
		}
		expect(vm.isComplete).toBe(true);
	});
});

describe("finalize", () => {
	it("saves only kept (agree) card IDs via loadChosenCardIds()", () => {
		const cardIds = MEANING_CARDS.slice(0, 6).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });
		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();

		vm.swipe("agree");
		vm.swipe("disagree");
		vm.swipe("agree");
		vm.swipe("agree");
		vm.swipe("disagree");
		vm.swipe("agree");
		vm.finalize();

		const chosen = loadChosenCardIds(sid());
		expect(chosen).toEqual([cardIds[0], cardIds[2], cardIds[3], cardIds[5]]);
	});

	it("removes prioritize data (loadPrioritize() returns null after)", () => {
		const cardIds = MEANING_CARDS.slice(0, 6).map((c) => c.id);
		savePrioritize(sid(), { cardIds, swipeHistory: [] });
		const vm = new FindMeaningPrioritizeViewModel(sid());
		vm.initialize();

		for (let i = 0; i < 6; i++) {
			vm.swipe("agree");
		}
		vm.finalize();

		expect(loadPrioritize(sid())).toBeNull();
	});
});
