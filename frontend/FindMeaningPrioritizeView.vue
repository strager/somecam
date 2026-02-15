<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import type { MeaningCard, SwipeDirection } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";
import { capture } from "./analytics.ts";
import { useStringParam } from "./route-utils.ts";
import type { SwipeRecord } from "./store.ts";
import { loadPrioritize, needsPrioritization, removePrioritize, saveChosenCardIds, savePrioritize } from "./store.ts";
import AppButton from "./AppButton.vue";
import SwipeCard from "./SwipeCard.vue";

const router = useRouter();
const sessionId = useStringParam("sessionId");
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

const cards = ref<MeaningCard[]>([]);
const currentIndex = ref(0);
const swipeHistory = ref<SwipeRecord[]>([]);
const swipeCardRef = ref<InstanceType<typeof SwipeCard> | null>(null);

const currentCard = computed(() => cards.value[currentIndex.value] ?? null);
const nextCard = computed(() => cards.value[currentIndex.value + 1] ?? null);
const totalCards = computed(() => cards.value.length);
const progressPercent = computed(() => (totalCards.value > 0 ? Math.round((currentIndex.value / totalCards.value) * 100) : 0));
const isComplete = computed(() => currentIndex.value >= totalCards.value);
const canUndo = computed(() => swipeHistory.value.length > 0);
const keptCount = computed(() => swipeHistory.value.filter((r) => r.direction === "agree").length);

onMounted(() => {
	const saved = loadPrioritize(sessionId);
	if (saved === null) {
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
			<SwipeCard ref="swipeCardRef" :key="currentIndex" :card="currentCard!" :next-card="nextCard" :allow-unsure="false" :show-source="true" @swiped="handleSwipe" />
		</div>

		<div class="controls">
			<AppButton variant="primary" emphasis="muted" :disabled="isComplete" @click="handleButtonSwipe('disagree')">Remove ✕</AppButton>

			<AppButton variant="primary" :disabled="isComplete" @click="handleButtonSwipe('agree')">Keep ✓</AppButton>
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
	margin-bottom: var(--space-6);
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
