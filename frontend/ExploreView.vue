<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { fetchSummary } from "./api.ts";
import { assignQuestions } from "./explore-data.ts";
import type { ExploreEntry, SummaryCache } from "./store.ts";
import { loadChosenCardIds, loadExploreData, loadSummaryCache, saveExploreData, saveSummaryCache } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { MeaningCard } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

const route = useRoute();
const router = useRouter();
const sessionId = route.params.sessionId as string;
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));
const chosenCards = ref<MeaningCard[]>([]);
const answeredCards = ref<Set<string>>(new Set());
const cardAnswerCounts = ref<Record<string, number>>({});

const totalQuestions = computed(() => chosenCards.value.length * EXPLORE_QUESTIONS.length);
const totalAnswered = computed(() => Object.values(cardAnswerCounts.value).reduce((sum, n) => sum + n, 0));
const overallPercent = computed(() => (totalQuestions.value === 0 ? 0 : Math.round((totalAnswered.value / totalQuestions.value) * 100)));

const instructionText = computed(() => {
	if (totalAnswered.value === 0) {
		return "Tap a card below to begin exploring what it means to you.";
	}
	if (totalAnswered.value >= totalQuestions.value) {
		return "You've explored all your cards! Review your reflections or download your report.";
	}
	return `You've answered ${String(totalAnswered.value)} of ${String(totalQuestions.value)} questions across your cards. Tap a card to continue.`;
});

function cardStatus(cardId: string): string {
	const count = cardAnswerCounts.value[cardId] ?? 0;
	if (count === 0) return "untouched";
	if (count >= EXPLORE_QUESTIONS.length) return "complete";
	return "partial";
}

function exploreButtonLabel(cardId: string): string {
	const status = cardStatus(cardId);
	if (status === "complete") return "Review";
	if (status === "partial") return "Continue";
	return "Explore";
}

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
		saveSummaryCache(sessionId, cache);
	} catch (error) {
		entry.error = error instanceof Error ? error.message : "Failed to load summary.";
	} finally {
		entry.loading = false;
	}
}

onMounted(() => {
	try {
		const cardIds = loadChosenCardIds(sessionId);
		if (cardIds === null) {
			void router.replace({ name: "findMeaning", params: { sessionId } });
			return;
		}
		const chosenSet = new Set(cardIds);
		chosenCards.value = MEANING_CARDS.filter((c) => chosenSet.has(c.id));

		let exploreData = loadExploreData(sessionId);
		if (exploreData === null) {
			exploreData = assignQuestions(cardIds);
			saveExploreData(sessionId, exploreData);
		}
		const cache = loadSummaryCache(sessionId);
		const promises: Promise<void>[] = [];

		for (const [cardId, entries] of Object.entries(exploreData)) {
			const answered = entries.filter((e) => e.userAnswer !== "");
			cardAnswerCounts.value[cardId] = answered.length;
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
		void router.replace({ name: "findMeaning", params: { sessionId } });
	}
});
</script>

<template>
	<main>
		<header>
			<h1>Explore</h1>
			<div v-if="chosenCards.length > 0" class="instruction-stack">
				<p class="instruction active">{{ instructionText }}</p>
			</div>
		</header>

		<div v-if="chosenCards.length > 0" class="overall-progress">
			<div class="progress-bar">
				<div class="progress-fill" :style="{ width: `${String(overallPercent)}%` }" />
			</div>
			<span class="progress-label">{{ totalAnswered }} of {{ totalQuestions }} questions answered</span>
		</div>

		<button class="edit-cards-btn" @click="router.push({ name: 'findMeaningManual', params: { sessionId } })">Edit selection</button>

		<div class="card-list">
			<div v-for="card in chosenCards" :key="card.id" :class="['card-surface', 'chosen-card', 'status-' + cardStatus(card.id)]">
				<h3>{{ card.source }}</h3>
				<span v-if="cardStatus(card.id) === 'complete'" class="status-badge complete">Complete</span>
				<span v-else-if="cardStatus(card.id) === 'partial'" class="status-badge partial">In progress</span>
				<p>{{ card.description }}</p>
				<div v-if="cardSummaryEntries[card.id]?.some((e) => e.loading)" class="summary-loading">Generating summary...</div>
				<div v-else-if="cardSummaryEntries[card.id]" class="summary-block">
					<div v-for="entry in cardSummaryEntries[card.id]" :key="entry.questionId" class="summary-item">
						<div v-if="entry.error" class="summary-error">Could not load summary.</div>
						<p v-else-if="entry.summary">
							<strong>{{ entry.topic }}:</strong> {{ entry.summary }}
						</p>
					</div>
				</div>
				<p v-if="cardStatus(card.id) !== 'complete'" class="card-progress">{{ cardAnswerCounts[card.id] ?? 0 }} of {{ EXPLORE_QUESTIONS.length }} questions answered</p>
				<button :class="['explore-btn', { prominent: cardStatus(card.id) !== 'complete' }]" @click="router.push({ name: 'exploreMeaning', params: { sessionId, meaningId: card.id } })">{{ exploreButtonLabel(card.id) }}</button>
			</div>
		</div>

		<button class="report-btn" @click="router.push({ name: 'report', params: { sessionId } })">Download Report</button>
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

.overall-progress {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.4rem;
	margin-bottom: 1.5rem;
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

.progress-label {
	font-size: 0.85rem;
	color: #666;
}

.card-list {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.chosen-card {
	position: relative;
	text-align: left;
}

.chosen-card.status-untouched {
	border-left: 4px solid #ccc;
}

.chosen-card.status-partial {
	border-left: 4px solid #b8860b;
}

.chosen-card.status-complete {
	border-left: 4px solid #2a6e4e;
}

.status-badge {
	position: absolute;
	top: 0.75rem;
	right: 0.75rem;
	padding: 0.15rem 0.5rem;
	font-size: 0.75rem;
	font-weight: 600;
	border-radius: 999px;
}

.status-badge.complete {
	color: #2a6e4e;
	background: #d4edda;
}

.status-badge.partial {
	color: #856404;
	background: #fff3cd;
}

.card-progress {
	font-size: 0.85rem;
	color: #888;
	margin: 0.5rem 0 0;
}

.card-progress.complete {
	color: #2a6e4e;
	font-weight: 600;
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
	background: transparent;
	color: #2a6e4e;
	border: 1.5px solid #2a6e4e;
	border-radius: 6px;
	cursor: pointer;
}

.explore-btn:hover {
	background: #eaf5ef;
}

.explore-btn.prominent {
	display: block;
	margin-left: auto;
	margin-right: auto;
	padding: 0.75rem 2rem;
	font-size: 1rem;
	color: #fff;
	background: #2a6e4e;
	border: none;
}

.explore-btn.prominent:hover {
	background: #225d40;
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
