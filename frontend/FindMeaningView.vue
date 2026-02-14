<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";

import type { MeaningCard, SwipeDirection } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import type { SwipeRecord } from "./store.ts";
import { detectSessionPhase, loadSwipeProgress, needsPrioritization, saveChosenCardIds, savePrioritize, selectCandidateCards, saveSwipeProgress } from "./store.ts";
import SwipeCard from "./SwipeCard.vue";

const route = useRoute();
const router = useRouter();
const sessionId = route.params.sessionId as string;

const shuffledCards = ref<MeaningCard[]>([]);
const currentIndex = ref(0);
const swipeHistory = ref<SwipeRecord[]>([]);
const swipeCardRef = ref<InstanceType<typeof SwipeCard> | null>(null);

const nextPhaseLabel = ref("Continue to Next Phase");

function detectNextPhase(): { label: string; route: RouteLocationRaw } | null {
	const phase = detectSessionPhase(sessionId);
	switch (phase) {
		case "explore":
			return { label: "Explore Meaning", route: { name: "explore", params: { sessionId } } };
		case "prioritize-complete":
			return { label: "Explore Meaning", route: { name: "findMeaningPrioritize", params: { sessionId } } };
		case "prioritize":
			return { label: "Prioritize Meaning", route: { name: "findMeaningPrioritize", params: { sessionId } } };
		default:
			return null;
	}
}

const currentCard = computed(() => shuffledCards.value[currentIndex.value] ?? null);
const totalCards = computed(() => shuffledCards.value.length);
const progressPercent = computed(() => (totalCards.value > 0 ? Math.round((currentIndex.value / totalCards.value) * 100) : 0));
const isComplete = computed(() => currentIndex.value >= totalCards.value);
const isLastCard = computed(() => currentIndex.value >= totalCards.value - 1);
const canUndo = computed(() => swipeHistory.value.length > 0);

function shuffle<T>(array: readonly T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

onMounted(() => {
	const saved = loadSwipeProgress(sessionId);
	if (saved) {
		const cards = saved.shuffledCardIds.map((id) => cardsById.get(id)).filter((c): c is MeaningCard => c !== undefined);
		if (cards.length > 0) {
			shuffledCards.value = cards;
			swipeHistory.value = saved.swipeHistory;
			currentIndex.value = saved.swipeHistory.length;
			const detected = detectNextPhase();
			if (detected) {
				nextPhaseLabel.value = detected.label;
			}
			return;
		}
	}
	shuffledCards.value = shuffle(MEANING_CARDS);
});

function handleSwipe(direction: SwipeDirection): void {
	swipeHistory.value.push({
		cardId: currentCard.value.id,
		direction,
	});
	currentIndex.value++;
	saveSwipeProgress(sessionId, {
		shuffledCardIds: shuffledCards.value.map((c) => c.id),
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
	saveSwipeProgress(sessionId, {
		shuffledCardIds: shuffledCards.value.map((c) => c.id),
		swipeHistory: swipeHistory.value,
	});
}

function continueToNextPhase(): void {
	const detected = detectNextPhase();
	if (detected) {
		void router.push(detected.route);
		return;
	}

	const cardIdsToConsider = selectCandidateCards(sessionId);

	if (needsPrioritization(sessionId)) {
		savePrioritize(sessionId, { cardIds: cardIdsToConsider, swipeHistory: [] });
		void router.push({ name: "findMeaningPrioritize", params: { sessionId } });
	} else {
		saveChosenCardIds(sessionId, cardIdsToConsider);
		void router.push({ name: "explore", params: { sessionId } });
	}
}
</script>

<template>
	<main>
		<header>
			<h1>Find Meaning</h1>
			<div v-if="!isComplete" class="instruction-stack">
				<p :class="['instruction', { active: currentIndex === 0 }]">Read each card and decide if this source of meaning resonates with you.</p>
				<p :class="['instruction', { active: currentIndex > 0 }]">Keep going — decide if each source of meaning resonates with you.</p>
			</div>
			<div class="progress">
				<div class="progress-bar">
					<div class="progress-fill" :style="{ width: `${String(progressPercent)}%` }" />
				</div>
				<span class="progress-text"> {{ progressPercent }}% ({{ currentIndex }}/{{ totalCards }}) </span>
			</div>
		</header>

		<div v-if="!isComplete" class="card-area">
			<div v-if="!isLastCard" class="card-surface blank-card" />
			<SwipeCard ref="swipeCardRef" :key="currentIndex" :card="currentCard!" @swiped="handleSwipe" />
		</div>

		<div v-else class="end-state">
			<h2>All cards reviewed!</h2>
			<p>You have reviewed all {{ totalCards }} sources of meaning.</p>
			<button type="button" class="btn primary" @click="continueToNextPhase">{{ nextPhaseLabel }}</button>
		</div>

		<div class="controls">
			<button type="button" class="btn disagree" :disabled="isComplete" @click="handleButtonSwipe('disagree')">Disagree</button>
			<button type="button" class="btn unsure" :disabled="isComplete" @click="handleButtonSwipe('unsure')">Unsure</button>
			<button type="button" class="btn agree" :disabled="isComplete" @click="handleButtonSwipe('agree')">Agree</button>
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
	margin: 0 0 1rem;
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

.end-state {
	text-align: center;
	padding: 2rem 0;
}

.end-state h2 {
	font-size: 1.4rem;
	margin: 0 0 0.5rem;
}

.end-state p {
	color: #555;
	margin: 0 0 1.5rem;
	line-height: 1.5;
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

.btn.unsure {
	background: #6b7280;
	color: #fff;
}

.btn.unsure:hover:not(:disabled) {
	background: #565c66;
}

.btn.primary {
	font-size: 1.1rem;
	padding: 0.75rem 2rem;
	background: #2a6e4e;
	color: #fff;
}

.btn.primary:hover {
	background: #1f5a3e;
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
