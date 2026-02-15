<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import type { MeaningCard, SwipeDirection } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { capture } from "./analytics.ts";
import { useStringParam } from "./route-utils.ts";
import type { SwipeRecord } from "./store.ts";
import { loadPrioritize, needsPrioritization, removePrioritize, saveChosenCardIds, savePrioritize } from "./store.ts";
import SwipeCard from "./SwipeCard.vue";

const router = useRouter();
const sessionId = useStringParam("sessionId");
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

const cards = ref<MeaningCard[]>([]);
const currentIndex = ref(0);
const swipeHistory = ref<SwipeRecord[]>([]);
const swipeCardRef = ref<InstanceType<typeof SwipeCard> | null>(null);

const currentCard = computed(() => cards.value[currentIndex.value] ?? null);
const totalCards = computed(() => cards.value.length);
const progressPercent = computed(() => (totalCards.value > 0 ? Math.round((currentIndex.value / totalCards.value) * 100) : 0));
const isComplete = computed(() => currentIndex.value >= totalCards.value);
const isLastCard = computed(() => currentIndex.value >= totalCards.value - 1);
const canUndo = computed(() => swipeHistory.value.length > 0);
const keptCount = computed(() => swipeHistory.value.filter((r) => r.direction === "agree").length);

onMounted(() => {
	const saved = loadPrioritize(sessionId);
	if (!saved) {
		void router.replace({ name: "findMeaning", params: { sessionId } });
		return;
	}
	if (!needsPrioritization(sessionId)) {
		saveChosenCardIds(sessionId, saved.cardIds);
		removePrioritize(sessionId);
		void router.replace({ name: "explore", params: { sessionId } });
		return;
	}
	const resolved = saved.cardIds.map((id) => cardsById.get(id)).filter((c): c is MeaningCard => c !== undefined);
	if (resolved.length === 0) {
		void router.replace({ name: "findMeaning", params: { sessionId } });
		return;
	}
	cards.value = resolved;
	swipeHistory.value = saved.swipeHistory;
	currentIndex.value = saved.swipeHistory.length;
	capture("prioritization_entered", {
		session_id: sessionId,
		card_count: resolved.length,
	});
});

function handleSwipe(direction: SwipeDirection): void {
	const cardId = currentCard.value.id;
	swipeHistory.value.push({
		cardId,
		direction,
	});
	capture("card_prioritized", {
		session_id: sessionId,
	});
	currentIndex.value++;
	savePrioritize(sessionId, {
		cardIds: cards.value.map((c) => c.id),
		swipeHistory: swipeHistory.value,
	});
}

function handleButtonSwipe(direction: SwipeDirection): void {
	if (isComplete.value) return;
	if (swipeCardRef.value) {
		swipeCardRef.value.flyAway(direction);
	} else {
		handleSwipe(direction);
	}
}

function handleUndo(): void {
	if (swipeHistory.value.length === 0) return;
	swipeHistory.value.pop();
	currentIndex.value = swipeHistory.value.length;
	capture("prioritization_undone", { session_id: sessionId });
	savePrioritize(sessionId, {
		cardIds: cards.value.map((c) => c.id),
		swipeHistory: swipeHistory.value,
	});
}

watch(isComplete, (done) => {
	if (!done) return;
	const keptCardIds = swipeHistory.value.filter((r) => r.direction === "agree").map((r) => r.cardId);
	capture("prioritization_completed", {
		session_id: sessionId,
		kept_count: keptCardIds.length,
		removed_count: swipeHistory.value.length - keptCardIds.length,
	});
	saveChosenCardIds(sessionId, keptCardIds);
	removePrioritize(sessionId);
	void router.push({ name: "explore", params: { sessionId } });
});
</script>

<template>
	<main>
		<header>
			<h1>Find Meaning — Prioritize</h1>
			<div class="instruction-stack">
				<p :class="['instruction', { active: currentIndex === 0 }]">You selected too many cards. Review each one and keep your top sources of meaning (aim for 3–5).</p>
				<p :class="['instruction', { active: currentIndex > 0 && keptCount >= 3 && keptCount <= 5 }]">You've kept {{ keptCount }} so far — looking good! Continue reviewing the rest.</p>
				<p :class="['instruction', { active: currentIndex > 0 && keptCount > 5 }]">You've kept {{ keptCount }} so far. Try to narrow down to 3–5.</p>
				<p :class="['instruction', { active: currentIndex > 0 && keptCount < 3 }]">Keep your top sources of meaning (aim for 3–5).</p>
			</div>
			<div class="progress">
				<div class="progress-bar">
					<div class="progress-fill" :style="{ width: `${String(progressPercent)}%` }" />
				</div>
				<span class="progress-text">
					{{ keptCount }} kept · {{ currentIndex }}/{{ totalCards }}
					reviewed
				</span>
			</div>
		</header>

		<div v-if="!isComplete" class="card-area">
			<div v-if="!isLastCard" class="card-surface blank-card" />
			<SwipeCard ref="swipeCardRef" :key="currentIndex" :card="currentCard!" :allow-unsure="false" :show-source="true" @swiped="handleSwipe" />
		</div>

		<div class="controls">
			<button type="button" class="btn disagree" :disabled="isComplete" @click="handleButtonSwipe('disagree')">Remove</button>
			<button type="button" class="btn agree" :disabled="isComplete" @click="handleButtonSwipe('agree')">Keep</button>
		</div>

		<div class="undo-area">
			<button type="button" class="btn undo" :disabled="!canUndo" @click="handleUndo">Undo</button>
		</div>
	</main>
</template>

<style scoped>
main {
	margin: 2rem auto;
	max-width: 36rem;
	padding: 0 1.5rem;
	font-family: "Segoe UI", system-ui, sans-serif;
	color: #1a1a1a;
}

header {
	text-align: center;
	margin-bottom: 2rem;
}

h1 {
	font-size: 2rem;
	margin: 0 0 0.5rem;
	letter-spacing: 0.02em;
}

.progress {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.4rem;
}

.progress-bar {
	width: 100%;
	max-width: 16rem;
	height: 6px;
	background: #e5e7eb;
	border-radius: 3px;
	overflow: hidden;
}

.progress-fill {
	height: 100%;
	background: #2a6e4e;
	border-radius: 3px;
	transition: width 0.3s ease;
}

.progress-text {
	font-size: 0.85rem;
	color: #666;
}

.card-area {
	position: relative;
	z-index: 1;
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 16rem;
	margin-bottom: 1.5rem;
}

.controls {
	display: flex;
	justify-content: center;
	gap: 0.75rem;
	margin-bottom: 1rem;
}

.undo-area {
	text-align: center;
}

.btn {
	font-size: 1rem;
	padding: 0.6rem 1.5rem;
	border: none;
	border-radius: 6px;
	cursor: pointer;
	font-family: inherit;
	font-weight: 500;
	transition:
		background 0.15s ease,
		opacity 0.15s ease;
}

.btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.btn.agree {
	background: #2a6e4e;
	color: #fff;
}

.btn.agree:hover:not(:disabled) {
	background: #1f5a3e;
}

.btn.disagree {
	background: #c83c3c;
	color: #fff;
}

.btn.disagree:hover:not(:disabled) {
	background: #a83232;
}

.btn.undo {
	background: transparent;
	color: #555;
	border: 1px solid #ccc;
}

.btn.undo:hover:not(:disabled) {
	background: #f3f4f6;
}

.blank-card {
	position: absolute;
}
</style>
