<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppButton from "./AppButton.vue";
import { capture } from "./analytics.ts";
import { useStringParam } from "./route-utils.ts";
import { loadChosenCardIds, loadExploreData, loadFreeformNotes, loadSummaryCache, lookupCachedSummary } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { MeaningCard } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

interface QuestionReport {
	topic: string;
	question: string;
	answer: string;
	summary: string;
}

interface CardReport {
	card: MeaningCard;
	questions: QuestionReport[];
	freeformNote: string;
	freeformSummary: string;
}

const router = useRouter();
const sessionId = useStringParam("sessionId");
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

const reports = ref<CardReport[]>([]);

function downloadPdf(): void {
	capture("pdf_download_initiated", { session_id: sessionId });
	window.print();
}

onMounted(() => {
	try {
		const cardIds = loadChosenCardIds(sessionId);
		if (cardIds === null) {
			void router.replace({ name: "findMeaning", params: { sessionId } });
			return;
		}

		const exploreData = loadExploreData(sessionId) ?? {};
		const summaryCache = loadSummaryCache(sessionId);
		const freeformNotes = loadFreeformNotes(sessionId);

		for (const cardId of cardIds) {
			const card = cardsById.get(cardId);
			if (card === undefined) continue;

			const entries = exploreData[cardId] ?? [];
			const answersByQuestionId = new Map(entries.map((e) => [e.questionId, e.userAnswer]));
			const questions: QuestionReport[] = [];

			for (const question of EXPLORE_QUESTIONS) {
				const answer = answersByQuestionId.get(question.id) ?? "";
				const summary = lookupCachedSummary(summaryCache, cardId, answer, question.id) ?? "";

				questions.push({
					topic: question.topic,
					question: question.questionFirstPerson,
					answer,
					summary,
				});
			}

			const freeformNote = freeformNotes[cardId] ?? "";
			const freeformSummary = lookupCachedSummary(summaryCache, cardId, freeformNote) ?? "";

			reports.value.push({ card, questions, freeformNote, freeformSummary });
		}
		capture("report_viewed", { session_id: sessionId });
	} catch {
		void router.replace({ name: "findMeaning", params: { sessionId } });
	}
});
</script>

<template>
	<main>
		<header>
			<h1>SoMeCaM Report</h1>
			<h2>Your Sources of Meaning</h2>
			<p class="intro">SoMeCaM is a method for mapping and exploring your personal sources of meaning. Based on 26 identified sources of meaning across five dimensions — self-transcendence, self-actualization, order, well-being, and relatedness — the method helps you reflect on what matters most in your life.</p>
			<p class="citation">Based on: la Cour, P. &amp; Schnell, T. (2020). Presentation of the Sources of Meaning Card Method: The SoMeCaM. <cite>Journal of Humanistic Psychology, 60</cite>(1), 20–42. <a href="https://doi.org/10.1177/0022167816669620" target="_blank" rel="noopener">doi:10.1177/0022167816669620</a></p>
			<AppButton variant="primary" class="download-btn" @click="downloadPdf">Download PDF</AppButton>
		</header>

		<section class="summary-section">
			<h2>What is meaningful to me?</h2>
			<div v-for="report in reports" :key="report.card.id" class="card-hrule report-card">
				<h3 class="card-title">{{ report.card.description }}</h3>
				<div class="card-body">
				<p v-if="report.freeformSummary" class="freeform-summary">{{ report.freeformSummary }}</p>
				<ul class="summary-list">
					<template v-for="q in report.questions" :key="q.topic">
						<li v-if="q.summary">{{ q.summary }}</li>
					</template>
				</ul>
				<p v-if="!report.freeformSummary && report.questions.every((q) => !q.summary)" class="qa-unanswered">No self reflections</p>
				</div>
			</div>
		</section>

		<section class="detail-section">
			<h2>Self reflections</h2>
			<div v-for="report in reports" :key="report.card.id" class="card-hrule report-card">
				<h3 class="card-title">
					{{ report.card.description }} <span class="source-label">({{ report.card.source }})</span>
				</h3>
				<div class="card-body">
					<div v-if="report.freeformNote" class="qa-block">
						<blockquote class="qa-freeform-answer">{{ report.freeformNote }}</blockquote>
					</div>
					<div v-for="q in report.questions" :key="q.topic" class="qa-block">
						<p class="qa-topic">{{ q.question }}</p>
						<blockquote v-if="q.answer" class="qa-answer">{{ q.answer }}</blockquote>
						<p v-else class="qa-unanswered">Not yet answered.</p>
					</div>
				</div>
			</div>
		</section>
	</main>
</template>

<style scoped>
main {
	margin: var(--space-8) auto;
	max-width: 42rem;
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
	margin: 0 0 var(--space-1);
}

header h2 {
	font-family: var(--font-heading);
	font-size: var(--text-lg);
	font-weight: 400;
	font-style: italic;
	color: var(--color-gray-600);
	margin: 0 0 var(--space-4);
}

.intro {
	font-size: var(--text-base);
	line-height: var(--leading-relaxed);
	color: var(--color-gray-800);
	margin: 0 0 var(--space-3);
}

.citation {
	font-size: var(--text-sm);
	color: var(--color-gray-400);
	line-height: var(--leading-normal);
	margin: 0 0 var(--space-4);
}

.empty-notice {
	text-align: center;
	padding: var(--space-8);
	color: var(--color-gray-600);
}

section h2 {
	font-family: var(--font-heading);
	font-size: var(--text-3xl);
	font-weight: 500;
	margin: var(--space-8) 0 var(--space-4);
}

.source-label {
	font-weight: 400;
	color: var(--color-gray-600);
}

.summary-list {
	margin-bottom: 0;
}

.summary-list li {
	margin: var(--space-1) 0;
	font-size: var(--text-base);
	line-height: var(--leading-normal);
	color: var(--color-gray-800);
}

.freeform-summary {
	margin: var(--space-2) 0 0;
	font-size: var(--text-base);
	color: var(--color-gray-800);
}

.qa-block {
	margin-top: var(--space-3);
	padding-top: var(--space-3);
}

.qa-topic {
	margin: 0;
	font-size: var(--text-base);
	color: var(--color-gray-800);
}

.qa-answer,
.qa-freeform-answer {
	margin: var(--space-1) 0 0;
	font-size: var(--text-base);
	line-height: var(--leading-normal);
	white-space: pre-wrap;
}

.qa-unanswered {
	margin: var(--space-1) 0 0;
	font-size: var(--text-sm);
	font-style: italic;
	color: var(--color-gray-400);
}

@media print {
	.download-btn {
		display: none;
	}

	main {
		max-width: 100%;
	}

	.report-card {
		break-inside: avoid;
	}

	.qa-block {
		break-inside: avoid;
	}
}
</style>
