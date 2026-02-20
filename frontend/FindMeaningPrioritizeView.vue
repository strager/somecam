<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import type { SwipeDirection } from "../shared/meaning-cards.ts";
import { FindMeaningPrioritizeViewModel } from "./FindMeaningPrioritizeViewModel.ts";
import { useStringParam } from "./route-utils.ts";
import AppButton from "./AppButton.vue";
import SwipeCard from "./SwipeCard.vue";

const router = useRouter();
const sessionId = useStringParam("sessionId");
const vm = new FindMeaningPrioritizeViewModel(sessionId);

const swipeCardRef = ref<InstanceType<typeof SwipeCard> | null>(null);

onMounted(() => {
	const result = vm.initialize();
	if (result === "no-data") {
		void router.replace({ name: "findMeaning", params: { sessionId } });
		return;
	}
	if (result === "skip") {
		void router.replace({ name: "explore", params: { sessionId } });
		return;
	}
});

watch(
	() => vm.isComplete,
	(done) => {
		if (!done) return;
		vm.finalize();
		void router.push({ name: "explore", params: { sessionId } });
	},
);

function handleSwipe(direction: SwipeDirection): void {
	vm.swipe(direction);
}

function handleButtonSwipe(direction: SwipeDirection): void {
	if (vm.isComplete) return;
	if (swipeCardRef.value !== null) {
		swipeCardRef.value.flyAway(direction);
	} else {
		handleSwipe(direction);
	}
}

function handleUndo(): void {
	vm.undo();
}
</script>

<template>
	<main>
		<header>
			<h1>Find Meaning — Prioritize</h1>
			<div class="instruction-stack">
				<p :class="['instruction', { active: vm.currentIndex === 0 }]">You selected too many cards. Review each one and keep your top sources of meaning (aim for 3–5).</p>
				<p :class="['instruction', { active: vm.currentIndex > 0 && vm.keptCount >= 3 && vm.keptCount <= 5 }]">You've kept {{ vm.keptCount }} so far — looking good! Continue reviewing the rest.</p>
				<p :class="['instruction', { active: vm.currentIndex > 0 && vm.keptCount > 5 }]">You've kept {{ vm.keptCount }} so far. Try to narrow down to 3–5.</p>
				<p :class="['instruction', { active: vm.currentIndex > 0 && vm.keptCount < 3 }]">Keep your top sources of meaning (aim for 3–5).</p>
			</div>
			<div class="progress">
				<div class="progress-bar">
					<div class="progress-fill" :style="{ width: `${String(vm.progressPercent)}%` }" />
				</div>
				<span class="progress-text">
					{{ vm.keptCount }} kept · {{ vm.currentIndex }}/{{ vm.totalCards }}
					reviewed
				</span>
			</div>
		</header>

		<div v-if="!vm.isComplete" class="card-area">
			<SwipeCard ref="swipeCardRef" :key="vm.currentIndex" :card="vm.currentCard!" :next-card="vm.nextCard" :allow-unsure="false" :show-source="true" @swiped="handleSwipe" />
		</div>

		<div class="controls">
			<AppButton variant="primary" emphasis="muted" :disabled="vm.isComplete" @click="handleButtonSwipe('disagree')">Remove ✕</AppButton>

			<AppButton variant="primary" :disabled="vm.isComplete" @click="handleButtonSwipe('agree')">Keep ✓</AppButton>
		</div>

		<div class="undo-area">
			<AppButton variant="secondary" emphasis="muted" :disabled="!vm.canUndo" @click="handleUndo">Undo</AppButton>
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
