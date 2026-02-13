<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import type { MeaningCard } from "../shared/meaning-cards";
import { MEANING_CARDS } from "../shared/meaning-cards";

const CHOSEN_KEY = "somecam-chosen";

const router = useRouter();
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const chosenCards = ref<MeaningCard[]>([]);

onMounted(() => {
	try {
		const raw = localStorage.getItem(CHOSEN_KEY);
		if (raw === null) {
			void router.replace("/cards");
			return;
		}
		const cardIds = JSON.parse(raw) as string[];
		if (!Array.isArray(cardIds) || cardIds.length === 0) {
			void router.replace("/cards");
			return;
		}
		chosenCards.value = cardIds.map((id) => cardsById.get(id)).filter((c): c is MeaningCard => c !== undefined);
	} catch {
		void router.replace("/cards");
	}
});
</script>

<template>
	<main>
		<header>
			<h1>SoMeCaM</h1>
			<h2>Your Sources of Meaning</h2>
		</header>

		<div class="card-list">
			<div v-for="card in chosenCards" :key="card.id" class="card-surface chosen-card">
				<h3>{{ card.source }}</h3>
				<p>{{ card.description }}</p>
			</div>
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
	margin: 0 0 0.25rem;
	letter-spacing: 0.02em;
}

h2 {
	font-size: 1.25rem;
	font-weight: 400;
	color: #555;
	margin: 0;
}

.card-list {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.chosen-card {
	text-align: left;
}

.chosen-card h3 {
	font-size: 1.1rem;
	margin: 0 0 0.5rem;
	color: #2a6e4e;
}

.chosen-card p {
	font-size: 1rem;
	line-height: 1.5;
	margin: 0;
	color: #333;
}
</style>
