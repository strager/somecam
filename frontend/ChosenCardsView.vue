<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { fetchSummary } from "./api.ts";
import { assignQuestions } from "./explore-data.ts";
import StartOverButton from "./StartOverButton.vue";
import type { ExploreEntry, SummaryCache } from "./store.ts";
import { loadChosenCardIds, loadExploreData, loadSummaryCache, saveExploreData, saveSummaryCache } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { MeaningCard } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

const router = useRouter();
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));
const chosenCards = ref<MeaningCard[]>([]);
const answeredCards = ref<Set<string>>(new Set());

interface SummaryEntry {
	questionId: string;
	topic: string;
	summary: string;
	loading: boolean;
	error: string;
}

const cardSummaryEntries = ref<Partial<Record<string, SummaryEntry[]>>>({});

async function loadSummary(cardId: string, questionId: string, answer: string, cache: SummaryCache): Promise<void> {
	const cacheKey = `${cardId}:${questionId}`;
	const entry = cardSummaryEntries.value[cardId]?.find((e) => e.questionId === questionId);
	if (entry === undefined) return;

	if (cacheKey in cache && cache[cacheKey].answer === answer) {
		entry.summary = cache[cacheKey].summary;
		return;
	}

	entry.loading = true;
	try {
		const result = await fetchSummary({
			cardId,
			questionId,
			answer,
		});
		entry.summary = result.summary;
		cache[cacheKey] = { answer, summary: result.summary };
		saveSummaryCache(cache);
	} catch (error) {
		entry.error = error instanceof Error ? error.message : "Failed to load summary.";
	} finally {
		entry.loading = false;
	}
}

onMounted(() => {
	try {
		const cardIds = loadChosenCardIds();
		if (cardIds === null) {
			void router.replace("/cards");
			return;
		}
		const chosenSet = new Set(cardIds);
		chosenCards.value = MEANING_CARDS.filter((c) => chosenSet.has(c.id));

		let exploreData = loadExploreData();
		if (exploreData === null) {
			exploreData = assignQuestions(cardIds);
			saveExploreData(exploreData);
		}
		const cache = loadSummaryCache();
		const promises: Promise<void>[] = [];

		for (const [cardId, entries] of Object.entries(exploreData)) {
			const answered = entries.filter((e) => e.userAnswer !== "");
			if (answered.length === 0) continue;

			answeredCards.value.add(cardId);
			const card = cardsById.get(cardId);
			if (card === undefined) continue;

			const questionOrder = new Map(EXPLORE_QUESTIONS.map((q, i) => [q.id, i]));
			const validEntries = answered
				.map((e) => ({ entry: e, question: questionsById.get(e.questionId) }))
				.filter((v): v is { entry: ExploreEntry; question: (typeof EXPLORE_QUESTIONS)[number] } => v.question !== undefined)
				.sort((a, b) => (questionOrder.get(a.entry.questionId) ?? 0) - (questionOrder.get(b.entry.questionId) ?? 0));
			cardSummaryEntries.value[cardId] = validEntries.map((v) => ({
				questionId: v.entry.questionId,
				topic: v.question.topic,
				summary: "",
				loading: false,
				error: "",
			}));

			for (const v of validEntries) {
				promises.push(loadSummary(cardId, v.entry.questionId, v.entry.userAnswer, cache));
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

		<button class="edit-cards-btn" @click="router.push('/edit-cards')">Edit selection</button>

		<div class="card-list">
			<div v-for="card in chosenCards" :key="card.id" class="card-surface chosen-card">
				<h3>{{ card.source }}</h3>
				<p>{{ card.description }}</p>
				<button :class="['explore-btn', { answered: answeredCards.has(card.id) }]" @click="router.push(`/explore/${card.id}`)">Explore</button>
				<div v-if="cardSummaryEntries[card.id]?.some((e) => e.loading)" class="summary-loading">Generating summary...</div>
				<div v-else-if="cardSummaryEntries[card.id]" class="summary-block">
					<div v-for="entry in cardSummaryEntries[card.id]" :key="entry.questionId" class="summary-item">
						<div v-if="entry.error" class="summary-error">Could not load summary.</div>
						<p v-else-if="entry.summary">
							<strong>{{ entry.topic }}:</strong> {{ entry.summary }}
						</p>
					</div>
				</div>
			</div>
		</div>

		<button class="report-btn" @click="router.push('/report')">Download Report</button>

		<StartOverButton />
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
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.summary-item p {
	margin: 0;
}

.edit-cards-btn {
	display: block;
	margin: 0 auto 1.5rem;
	padding: 0.5rem 1.25rem;
	font-size: 0.95rem;
	font-weight: 600;
	background: transparent;
	color: #2a6e4e;
	border: 1.5px solid #2a6e4e;
	border-radius: 6px;
	cursor: pointer;
}

.edit-cards-btn:hover {
	background: #eaf5ef;
}

.report-btn {
	display: block;
	margin: 1.5rem auto 0;
	padding: 0.5rem 1.25rem;
	font-size: 0.95rem;
	font-weight: 600;
	background: transparent;
	color: #2a6e4e;
	border: 1.5px solid #2a6e4e;
	border-radius: 6px;
	cursor: pointer;
}

.report-btn:hover {
	background: #eaf5ef;
}
</style>
