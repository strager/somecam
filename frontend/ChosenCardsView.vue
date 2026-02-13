<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { fetchSummary } from "./api";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions";
import type { MeaningCard } from "../shared/meaning-cards";
import { MEANING_CARDS } from "../shared/meaning-cards";

const CHOSEN_KEY = "somecam-chosen";
const EXPLORE_KEY = "somecam-explore";
const SUMMARIES_KEY = "somecam-summaries";

type ExploreData = Record<string, { questionId: string; answer: string }>;
type SummaryCache = Record<string, { answer: string; summary: string }>;

function assignQuestions(cardIds: string[]): ExploreData {
	const data: ExploreData = {};
	let pool: string[] = [];
	for (const cardId of cardIds) {
		if (pool.length === 0) {
			pool = EXPLORE_QUESTIONS.map((q) => q.id);
		}
		const index = Math.floor(Math.random() * pool.length);
		const questionId = pool[index];
		pool.splice(index, 1);
		data[cardId] = { questionId, answer: "" };
	}
	return data;
}

function loadSummaryCache(): SummaryCache {
	try {
		const raw = localStorage.getItem(SUMMARIES_KEY);
		if (raw !== null) {
			return JSON.parse(raw) as SummaryCache;
		}
	} catch {
		// ignore corrupt cache
	}
	return {};
}

function saveSummaryCache(cache: SummaryCache): void {
	localStorage.setItem(SUMMARIES_KEY, JSON.stringify(cache));
}

const router = useRouter();
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));
const chosenCards = ref<MeaningCard[]>([]);
const answeredCards = ref<Set<string>>(new Set());

const summaries = ref<Record<string, string>>({});
const summaryLoading = ref<Record<string, boolean>>({});
const summaryErrors = ref<Record<string, string>>({});

async function loadSummary(cardId: string, card: MeaningCard, questionText: string, answer: string, cache: SummaryCache): Promise<void> {
	if (cardId in cache && cache[cardId].answer === answer) {
		summaries.value[cardId] = cache[cardId].summary;
		return;
	}

	summaryLoading.value[cardId] = true;
	try {
		const result = await fetchSummary({
			cardSource: card.source,
			cardDescription: card.description,
			questionText,
			answer,
		});
		summaries.value[cardId] = result.summary;
		cache[cardId] = { answer, summary: result.summary };
		saveSummaryCache(cache);
	} catch (error) {
		summaryErrors.value[cardId] = error instanceof Error ? error.message : "Failed to load summary.";
	} finally {
		summaryLoading.value[cardId] = false;
	}
}

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

		if (localStorage.getItem(EXPLORE_KEY) === null) {
			const data = assignQuestions(cardIds);
			localStorage.setItem(EXPLORE_KEY, JSON.stringify(data));
		}

		const exploreRaw = localStorage.getItem(EXPLORE_KEY);
		if (exploreRaw === null) return;

		const exploreData = JSON.parse(exploreRaw) as ExploreData;
		const cache = loadSummaryCache();
		const promises: Promise<void>[] = [];

		for (const [cardId, entry] of Object.entries(exploreData)) {
			if (entry.answer) {
				answeredCards.value.add(cardId);
				const card = cardsById.get(cardId);
				const question = questionsById.get(entry.questionId);
				if (card !== undefined && question !== undefined) {
					promises.push(loadSummary(cardId, card, question.text, entry.answer, cache));
				}
			}
		}

		if (promises.length > 0) {
			void Promise.all(promises);
		}
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
				<button :class="['explore-btn', { answered: answeredCards.has(card.id) }]" @click="router.push(`/explore/${card.id}`)">Explore</button>
				<div v-if="summaryLoading[card.id]" class="summary-loading">Generating summary...</div>
				<div v-else-if="summaryErrors[card.id]" class="summary-error">Could not load summary.</div>
				<div v-else-if="summaries[card.id]" class="summary-block">
					{{ summaries[card.id] }}
				</div>
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

.explore-btn {
	margin-top: 0.75rem;
	padding: 0.5rem 1.25rem;
	font-size: 0.95rem;
	font-weight: 600;
	color: #fff;
	background: #2a6e4e;
	border: none;
	border-radius: 6px;
	cursor: pointer;
}

.explore-btn:hover {
	background: #225d40;
}

.explore-btn.answered {
	background: transparent;
	color: #2a6e4e;
	border: 1.5px solid #2a6e4e;
}

.explore-btn.answered:hover {
	background: #eaf5ef;
}

.summary-loading {
	margin-top: 0.75rem;
	font-size: 0.9rem;
	color: #888;
	font-style: italic;
}

.summary-error {
	margin-top: 0.75rem;
	font-size: 0.9rem;
	color: #c0392b;
}

.summary-block {
	margin-top: 0.75rem;
	padding: 0.75rem 1rem;
	font-size: 0.95rem;
	line-height: 1.5;
	color: #333;
	background: #f0faf4;
	border-left: 3px solid #2a6e4e;
	border-radius: 4px;
}
</style>
