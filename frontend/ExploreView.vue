<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { fetchSummary } from "./api.ts";
import { capture } from "./analytics.ts";
import { assignQuestions } from "./explore-data.ts";
import { useStringParam } from "./route-utils.ts";
import type { ExploreEntry, SummaryCache } from "./store.ts";
import { loadChosenCardIds, loadExploreData, loadFreeformNotes, loadSummaryCache, lookupCachedSummary, saveExploreData, saveSummaryCache } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { MeaningCard } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

const router = useRouter();
const sessionId = useStringParam("sessionId");
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));
const chosenCards = ref<MeaningCard[]>([]);
const answeredCards = ref<Set<string>>(new Set());
const cardAnswerCounts = ref<Record<string, number>>({});

const totalQuestions = computed(() => chosenCards.value.length * EXPLORE_QUESTIONS.length);
const totalAnswered = computed(() => Object.values(cardAnswerCounts.value).reduce((sum, n) => sum + n, 0));
const overallPercent = computed(() => (totalQuestions.value === 0 ? 0 : Math.round((totalAnswered.value / totalQuestions.value) * 100)));
const allComplete = computed(() => totalQuestions.value > 0 && totalAnswered.value >= totalQuestions.value);

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

const sortedCards = computed(() =>
	[...chosenCards.value].sort((a, b) => {
		const aComplete = cardStatus(a.id) === "complete" ? 1 : 0;
		const bComplete = cardStatus(b.id) === "complete" ? 1 : 0;
		return aComplete - bComplete;
	}),
);

function exploreButtonLabel(cardId: string): string {
	const status = cardStatus(cardId);
	if (status === "complete") return "Review";
	if (status === "partial") return "Continue";
	return "Explore";
}

function onExploreCard(cardId: string): void {
	const answered = cardAnswerCounts.value[cardId] ?? 0;
	capture("card_exploration_started", {
		session_id: sessionId,
		card_id: cardId,
		question_number: Math.min(answered + 1, EXPLORE_QUESTIONS.length),
	});
	void router.push({ name: "exploreMeaning", params: { sessionId, meaningId: cardId } });
}

function onEditSelection(): void {
	capture("edit_selection_clicked", { session_id: sessionId });
	void router.push({ name: "findMeaningManual", params: { sessionId } });
}

function onOpenReport(source: string): void {
	capture("report_opened", {
		session_id: sessionId,
		source,
	});
	void router.push({ name: "report", params: { sessionId } });
}

interface SummaryEntry {
	questionId: string;
	topic: string;
	summary: string;
	loading: boolean;
	error: string;
	unanswered: boolean;
}

const cardSummaryEntries = ref<Partial<Record<string, SummaryEntry[]>>>({});

interface FreeformSummary {
	summary: string;
	loading: boolean;
	error: string;
}

const cardFreeformSummary = ref<Partial<Record<string, FreeformSummary>>>({});

async function loadSummary(cardId: string, questionId: string, answer: string, cache: SummaryCache, requestQuestionId?: string): Promise<void> {
	const cacheKey = `${cardId}:${questionId}`;
	const entry = cardSummaryEntries.value[cardId]?.find((e) => e.questionId === questionId);
	if (entry === undefined) return;

	const cached = lookupCachedSummary(cache, cardId, answer, questionId);
	if (cached !== null) {
		entry.summary = cached;
		return;
	}

	entry.loading = true;
	try {
		const result = await fetchSummary({
			cardId,
			...(requestQuestionId !== undefined ? { questionId: requestQuestionId } : {}),
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

async function loadFreeformSummary(cardId: string, noteText: string, cache: SummaryCache, entry: FreeformSummary): Promise<void> {
	const cacheKey = `${cardId}:freeform`;

	const cached = lookupCachedSummary(cache, cardId, noteText);
	if (cached !== null) {
		entry.summary = cached;
		return;
	}

	entry.loading = true;
	try {
		const result = await fetchSummary({ cardId, answer: noteText });
		entry.summary = result.summary;
		cache[cacheKey] = { answer: noteText, summary: result.summary };
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

			const isPartial = answered.length < EXPLORE_QUESTIONS.length;
			const answeredIds = new Set(answered.map((e) => e.questionId));

			const questionOrder = new Map(EXPLORE_QUESTIONS.map((q, i) => [q.id, i]));
			const validEntries = answered
				.map((e) => ({ entry: e, question: questionsById.get(e.questionId) }))
				.filter((v): v is { entry: ExploreEntry; question: (typeof EXPLORE_QUESTIONS)[number] } => v.question !== undefined)
				.sort((a, b) => (questionOrder.get(a.entry.questionId) ?? 0) - (questionOrder.get(b.entry.questionId) ?? 0));

			const summaryRows: SummaryEntry[] = validEntries.map((v) => ({
				questionId: v.entry.questionId,
				topic: v.question.topic,
				summary: "",
				loading: false,
				error: "",
				unanswered: false,
			}));

			if (isPartial) {
				for (const q of EXPLORE_QUESTIONS) {
					if (!answeredIds.has(q.id)) {
						summaryRows.push({
							questionId: q.id,
							topic: q.topic,
							summary: "",
							loading: false,
							error: "",
							unanswered: true,
						});
					}
				}
			}

			cardSummaryEntries.value[cardId] = summaryRows;

			for (const v of validEntries) {
				promises.push(loadSummary(cardId, v.entry.questionId, v.entry.userAnswer, cache, v.entry.questionId));
			}
		}

		const freeformNotes = loadFreeformNotes(sessionId);
		for (const cardId of Object.keys(exploreData)) {
			const noteText: string | undefined = freeformNotes[cardId];
			if (noteText === undefined || noteText === "") continue;

			const freeformEntry: FreeformSummary = { summary: "", loading: false, error: "" };
			cardFreeformSummary.value[cardId] = freeformEntry;

			promises.push(loadFreeformSummary(cardId, noteText, cache, freeformEntry));
		}

		if (promises.length > 0) {
			void Promise.all(promises);
		}
		capture("explore_overview_visited", { session_id: sessionId });
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

		<button v-if="allComplete" class="btn-primary report-btn" @click="onOpenReport('explore_overview_primary')">Download report</button>
		<button class="btn-secondary edit-cards-btn" @click="onEditSelection">Edit selection</button>

		<div class="card-list">
			<div v-for="card in sortedCards" :key="card.id" :class="['card-hrule', 'chosen-card', 'status-' + cardStatus(card.id)]">
				<div class="card-title">
					{{ card.description }} <span class="source-label">({{ card.source }})</span>
				</div>
				<span v-if="cardStatus(card.id) === 'complete'" class="status-badge complete">Complete</span>
				<span v-else-if="cardStatus(card.id) === 'partial'" class="status-badge partial">In progress</span>
				<div v-if="cardSummaryEntries[card.id]?.some((e) => e.loading) || cardFreeformSummary[card.id]?.loading" class="summary-loading">Generating summary...</div>
				<template v-else-if="cardSummaryEntries[card.id]">
					<p v-if="cardFreeformSummary[card.id]?.summary" class="freeform-summary">{{ cardFreeformSummary[card.id]!.summary }}</p>
					<p v-else-if="cardFreeformSummary[card.id]?.error" class="summary-error">Could not load notes summary.</p>
					<ul class="summary-block">
						<li v-for="entry in cardSummaryEntries[card.id]" :key="entry.questionId" :class="['summary-item', { unanswered: entry.unanswered }]">
							<span v-if="entry.unanswered" class="summary-unanswered"
								><strong>{{ entry.topic }}:</strong> <em>Not yet answered.</em></span
							>
							<span v-else-if="entry.error" class="summary-error">Could not load summary.</span>
							<span v-else-if="entry.summary"
								><strong>{{ entry.topic }}:</strong> {{ entry.summary }}</span
							>
						</li>
					</ul>
				</template>
				<button :class="['explore-btn', cardStatus(card.id) !== 'complete' ? 'btn-primary' : 'btn-secondary']" @click="onExploreCard(card.id)">{{ exploreButtonLabel(card.id) }}</button>
			</div>
		</div>

		<button :class="['report-btn', allComplete ? 'btn-primary' : 'btn-secondary']" @click="onOpenReport('explore_overview_secondary')">Download report</button>
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
	font-family: var(--font-heading);
	font-size: var(--text-4xl);
	font-weight: 500;
	color: var(--color-black);
	margin: 0 0 var(--space-1);
}

.overall-progress {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	margin-bottom: var(--space-6);
}

.progress-bar {
	width: 100%;
	max-width: 16rem;
	height: 6px;
	background: var(--color-gray-200);
	overflow: hidden;
}

.progress-fill {
	height: 100%;
	background: var(--color-green-600);
	transition: width 0.3s ease;
}

.progress-label {
	font-size: var(--text-sm);
	color: var(--color-gray-400);
}

.card-list {
	margin-bottom: var(--space-6);
}

.chosen-card {
	position: relative;
}

.status-badge {
	position: absolute;
	top: 0;
	right: 0;
	padding: var(--space-1) var(--space-2);
	font-size: var(--text-xs);
	font-weight: 600;
}

.status-badge.complete {
	color: var(--color-green-700);
	background: var(--color-success-bg);
}

.status-badge.partial {
	color: var(--color-warning);
	background: var(--color-warning-bg);
}

.source-label {
	font-weight: 400;
	color: var(--color-gray-600);
}

.explore-btn {
	margin-top: var(--space-3);
}

.freeform-summary {
	margin: var(--space-3) 0 0;
	font-size: var(--text-base);
	color: var(--color-gray-800);
	line-height: var(--leading-normal);
}

.summary-loading {
	margin-top: var(--space-3);
	font-size: var(--text-sm);
	color: var(--color-gray-400);
	font-style: italic;
}

.summary-error {
	margin-top: var(--space-3);
	font-size: var(--text-sm);
	color: var(--color-error);
}

.summary-unanswered,
.summary-item.unanswered::before {
	color: var(--color-gray-400);
}

.summary-block {
	list-style: none;
	margin-top: var(--space-3);
	padding: 0 0 0 var(--space-6);
	font-size: var(--text-base);
	line-height: var(--leading-normal);
	color: var(--color-gray-800);
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.summary-item {
	position: relative;
	margin: var(--space-1) 0;
}

.summary-item::before {
	position: absolute;
	left: calc(-1 * var(--space-6));
	content: "\2713";
}

.summary-item.unanswered::before {
	content: "\2610";
}

.edit-cards-btn {
	margin-bottom: var(--space-6);
}

.report-btn {
	margin-bottom: var(--space-4);
}
</style>
