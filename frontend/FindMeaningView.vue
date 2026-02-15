<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";

import type { MeaningCard, SwipeDirection } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { capture } from "./analytics.ts";
import { useStringParam } from "./route-utils.ts";
import type { SwipeRecord } from "./store.ts";
import { detectSessionPhase, loadSwipeProgress, needsPrioritization, saveChosenCardIds, savePrioritize, selectCandidateCards, saveSwipeProgress } from "./store.ts";
import AppButton from "./AppButton.vue";
import SwipeCard from "./SwipeCard.vue";

const router = useRouter();
const sessionId = useStringParam("sessionId");

const shuffledCards = ref<MeaningCard[]>([]);
const currentIndex = ref(0);
const swipeHistory = ref<SwipeRecord[]>([]);
const swipeCardRef = ref<InstanceType<typeof SwipeCard> | null>(null);
const lastSwipeMethod = ref<"drag" | "button">("drag");
const cardShownAtMs = ref(performance.now());
const phaseStartedAtMs = ref(performance.now());

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
const nextCard = computed(() => shuffledCards.value[currentIndex.value + 1] ?? null);
const totalCards = computed(() => shuffledCards.value.length);
const progressPercent = computed(() => (totalCards.value > 0 ? Math.round((currentIndex.value / totalCards.value) * 100) : 0));
const isComplete = computed(() => currentIndex.value >= totalCards.value);
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
	phaseStartedAtMs.value = performance.now();
	const saved = loadSwipeProgress(sessionId);
	if (saved !== null) {
		const cards = saved.shuffledCardIds.map((id) => cardsById.get(id)).filter((c): c is MeaningCard => c !== undefined);
		if (cards.length > 0) {
			shuffledCards.value = cards;
			swipeHistory.value = saved.swipeHistory;
			currentIndex.value = saved.swipeHistory.length;
			cardShownAtMs.value = performance.now();
			const detected = detectNextPhase();
			if (detected !== null) {
				nextPhaseLabel.value = detected.label;
			}
			return;
		}
	}
	shuffledCards.value = shuffle(MEANING_CARDS);
	cardShownAtMs.value = performance.now();
});

function handleSwipe(direction: SwipeDirection): void {
	const cardId = currentCard.value.id;
	const now = performance.now();
	capture("card_swiped", {
		session_id: sessionId,
		method: lastSwipeMethod.value,
		time_on_card_ms: Math.round(now - cardShownAtMs.value),
	});
	swipeHistory.value.push({
		cardId,
		direction,
	});
	currentIndex.value++;
	saveSwipeProgress(sessionId, {
		shuffledCardIds: shuffledCards.value.map((c) => c.id),
		swipeHistory: swipeHistory.value,
	});
	cardShownAtMs.value = performance.now();
	lastSwipeMethod.value = "drag";
}

function handleButtonSwipe(direction: SwipeDirection): void {
	if (isComplete.value) return;
	lastSwipeMethod.value = "button";
	if (swipeCardRef.value !== null) {
		swipeCardRef.value.flyAway(direction);
	} else {
		handleSwipe(direction);
	}
}

function handleUndo(): void {
	if (swipeHistory.value.length === 0) return;
	swipeHistory.value.pop();
	currentIndex.value = swipeHistory.value.length;
	capture("swipe_undone", { session_id: sessionId });
	saveSwipeProgress(sessionId, {
		shuffledCardIds: shuffledCards.value.map((c) => c.id),
		swipeHistory: swipeHistory.value,
	});
	cardShownAtMs.value = performance.now();
	lastSwipeMethod.value = "drag";
}

function continueToNextPhase(): void {
	const detected = detectNextPhase();
	if (detected !== null) {
		void router.push(detected.route);
		return;
	}

	const agreedCount = swipeHistory.value.filter((record) => record.direction === "agree").length;
	const disagreedCount = swipeHistory.value.filter((record) => record.direction === "disagree").length;
	const unsureCount = swipeHistory.value.filter((record) => record.direction === "unsure").length;
	capture("swiping_phase_completed", {
		session_id: sessionId,
		agreed_count: agreedCount,
		disagreed_count: disagreedCount,
		unsure_count: unsureCount,
		total_time_ms: Math.round(performance.now() - phaseStartedAtMs.value),
	});

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
			<SwipeCard ref="swipeCardRef" :key="currentIndex" :card="currentCard!" :next-card="nextCard" @swiped="handleSwipe" />
		</div>

		<div v-else class="end-state">
			<h2>All cards reviewed!</h2>
			<p>You have reviewed all {{ totalCards }} sources of meaning.</p>
			<AppButton variant="primary" @click="continueToNextPhase">{{ nextPhaseLabel }}</AppButton>
		</div>

		<div class="controls">
			<AppButton variant="primary" emphasis="muted" :disabled="isComplete" @click="handleButtonSwipe('disagree')">Disagree ✕</AppButton>
			<AppButton variant="secondary" emphasis="muted" :disabled="isComplete" @click="handleButtonSwipe('unsure')">Unsure ？</AppButton>
			<AppButton variant="primary" :disabled="isComplete" @click="handleButtonSwipe('agree')">Agree ✓</AppButton>
		</div>

		<div class="undo-area">
			<AppButton variant="secondary" emphasis="muted" :disabled="!canUndo" @click="handleUndo">Undo</AppButton>
		</div>
	</main>
</template>

<style scoped>
main {
	margin: var(--space-8) auto;
	max-width: 36rem;
	padding: 0 var(--space-6);
	color: var(--color-black);
}

header {
	margin-bottom: var(--space-8);
}

h1 {
	margin: 0 0 var(--space-1);
}

.progress {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
}

.progress-bar {
	width: 100%;
	height: 6px;
	background: var(--color-gray-200);
	overflow: hidden;
}

.progress-fill {
	height: 100%;
	background: var(--color-green-600);
	transition: width 0.3s ease;
}

.progress-text {
	font-size: var(--text-sm);
	color: var(--color-gray-400);
}

.card-area {
	position: relative;
	z-index: 1;
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 16rem;
	margin-bottom: var(--space-6);
}

.end-state {
	padding: var(--space-8) 0;
}

.end-state h2 {
	margin: 0 0 var(--space-2);
}

.end-state p {
	color: var(--color-gray-600);
	margin: 0 0 var(--space-6);
	line-height: 1.5;
}

.controls {
	display: flex;
	justify-content: center;
	gap: var(--space-3);
	margin-bottom: var(--space-4);
}

.undo-area {
	text-align: center;
}
</style>
