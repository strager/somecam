import { ref } from "vue";

import type { MeaningCard, SwipeDirection } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { capture } from "./analytics.ts";
import type { SwipeRecord } from "./store.ts";
import { loadPrioritize, needsPrioritization, removePrioritize, saveChosenCardIds, savePrioritize } from "./store.ts";

const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

export class FindMeaningPrioritizeViewModel {
	private readonly sessionId: string;
	private readonly _cards = ref<MeaningCard[]>([]);
	private readonly _currentIndex = ref(0);
	private readonly _swipeHistory = ref<SwipeRecord[]>([]);

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	get currentCard(): MeaningCard | null {
		return this._cards.value[this._currentIndex.value] ?? null;
	}

	get nextCard(): MeaningCard | null {
		return this._cards.value[this._currentIndex.value + 1] ?? null;
	}

	get totalCards(): number {
		return this._cards.value.length;
	}

	get currentIndex(): number {
		return this._currentIndex.value;
	}

	get progressPercent(): number {
		return this.totalCards > 0 ? Math.round((this._currentIndex.value / this.totalCards) * 100) : 0;
	}

	get isComplete(): boolean {
		return this._currentIndex.value >= this.totalCards;
	}

	get canUndo(): boolean {
		return this._swipeHistory.value.length > 0;
	}

	get keptCount(): number {
		return this._swipeHistory.value.filter((r) => r.direction === "agree").length;
	}

	initialize(): "ready" | "no-data" | "skip" {
		const saved = loadPrioritize(this.sessionId);
		if (saved === null) {
			return "no-data";
		}
		if (!needsPrioritization(this.sessionId)) {
			saveChosenCardIds(this.sessionId, saved.cardIds);
			removePrioritize(this.sessionId);
			return "skip";
		}
		const resolved = saved.cardIds.map((id) => cardsById.get(id)).filter((c): c is MeaningCard => c !== undefined);
		if (resolved.length === 0) {
			return "no-data";
		}
		this._cards.value = resolved;
		this._swipeHistory.value = saved.swipeHistory;
		this._currentIndex.value = saved.swipeHistory.length;
		capture("prioritization_entered", {
			session_id: this.sessionId,
			card_count: resolved.length,
		});
		return "ready";
	}

	swipe(direction: SwipeDirection): void {
		const card = this.currentCard;
		if (card === null) return;
		this._swipeHistory.value.push({ cardId: card.id, direction });
		capture("card_prioritized", {
			session_id: this.sessionId,
		});
		this._currentIndex.value++;
		savePrioritize(this.sessionId, {
			cardIds: this._cards.value.map((c) => c.id),
			swipeHistory: this._swipeHistory.value,
		});
	}

	undo(): void {
		if (this._swipeHistory.value.length === 0) return;
		this._swipeHistory.value.pop();
		this._currentIndex.value = this._swipeHistory.value.length;
		capture("prioritization_undone", { session_id: this.sessionId });
		savePrioritize(this.sessionId, {
			cardIds: this._cards.value.map((c) => c.id),
			swipeHistory: this._swipeHistory.value,
		});
	}

	finalize(): void {
		const keptCardIds = this._swipeHistory.value.filter((r) => r.direction === "agree").map((r) => r.cardId);
		capture("prioritization_completed", {
			session_id: this.sessionId,
			kept_count: keptCardIds.length,
			removed_count: this._swipeHistory.value.length - keptCardIds.length,
		});
		saveChosenCardIds(this.sessionId, keptCardIds);
		removePrioritize(this.sessionId);
	}
}
