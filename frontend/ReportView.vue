<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { capture } from "./analytics.ts";
import { loadChosenCardIds, loadExploreData, loadFreeformNotes, loadSummaryCache } from "./store.ts";
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
}

const route = useRoute();
const router = useRouter();
const sessionId = route.params.sessionId as string;
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
				const cacheKey = `${cardId}:${question.id}`;
				const summary = cacheKey in summaryCache ? summaryCache[cacheKey].summary : "";

				questions.push({
					topic: question.topic,
					question: question.questionFirstPerson,
					answer: answersByQuestionId.get(question.id) ?? "",
					summary,
				});
			}

			reports.value.push({ card, questions, freeformNote: freeformNotes[cardId] ?? "" });
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
			<button class="download-btn" @click="downloadPdf">Download PDF</button>
		</header>

		<section class="summary-section">
			<h2>What is meaningful to me?</h2>
			<div v-for="report in reports" :key="report.card.id" class="report-card">
				<h3>{{ report.card.description }}</h3>
				<ul class="summary-list">
					<template v-for="q in report.questions" :key="q.topic">
						<li v-if="q.summary">{{ q.summary }}</li>
					</template>
				</ul>
				<p v-if="report.questions.every((q) => !q.summary)" class="qa-unanswered">No self reflections</p>
			</div>
		</section>

		<section class="detail-section">
			<h2>Self reflections</h2>
			<div v-for="report in reports" :key="report.card.id" class="report-card">
				<h3>
					{{ report.card.description }} <span class="source-label">({{ report.card.source }})</span>
				</h3>
				<div v-if="report.freeformNote" class="qa-block">
					<p class="qa-freeform-answer">{{ report.freeformNote }}</p>
				</div>
				<div v-for="q in report.questions" :key="q.topic" class="qa-block">
					<p class="qa-topic">{{ q.question }}</p>
					<p v-if="q.answer" class="qa-answer">{{ q.answer }}</p>
					<p v-else class="qa-unanswered">Not yet answered.</p>
				</div>
			</div>
		</section>
	</main>
</template>

<style scoped>
main {
	margin: 2rem auto;
	max-width: 42rem;
	padding: 0 1.5rem;
	font-family: Georgia, "Times New Roman", serif;
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

header h2 {
	font-size: 1.25rem;
	font-weight: 400;
	color: #555;
	margin: 0 0 1rem;
}

.intro {
	font-size: 0.95rem;
	line-height: 1.6;
	color: #333;
	margin: 0 0 0.75rem;
	text-align: left;
}

.citation {
	font-size: 0.85rem;
	color: #666;
	line-height: 1.5;
	margin: 0 0 1rem;
	text-align: left;
}

.citation a {
	color: #2a6e4e;
}

.download-btn {
	padding: 0.5rem 1.25rem;
	font-size: 0.95rem;
	font-weight: 600;
	color: #fff;
	background: #2a6e4e;
	border: none;
	border-radius: 6px;
	cursor: pointer;
}

.download-btn:hover {
	background: #225d40;
}

.empty-notice {
	text-align: center;
	padding: 2rem;
	color: #555;
}

.empty-notice a {
	color: #2a6e4e;
}

section h2 {
	font-size: 1.4rem;
	margin: 2rem 0 1rem;
	padding-bottom: 0.5rem;
	border-bottom: 2px solid #2a6e4e;
}

.report-card {
	padding-top: 1.5rem;
	padding-bottom: 1.5rem;
	border-top: 1px solid #eee;
}
h2 + .report-card {
	border-top: none;
	padding-top: 0;
}

.report-card h3 {
	font-size: 1.1rem;
	margin: 0 0 0.25rem;
	color: #2a6e4e;
}

.source-label {
	font-weight: 400;
	color: #555;
}

.summary-list {
	margin-bottom: 0;
}

.summary-list li {
	margin: 0.25rem 0;
	font-size: 0.95rem;
	line-height: 1.5;
	color: #333;
}

.summary-list li.qa-unanswered {
	color: #888;
}

.qa-block {
	margin-top: 0.75rem;
	padding-top: 0.75rem;
}

.qa-topic {
	margin: 0;
	font-size: 0.95rem;
	line-height: 1.5;
	color: #333;
}

.qa-answer,
.qa-freeform-answer {
	margin: 0.25rem 0 0;
	font-size: 0.95rem;
	line-height: 1.5;
	white-space: pre-wrap;
}

.qa-answer {
	color: #555;
	padding-left: 0.5rem;
	border-left: 3px solid #2a6e4e;
}

.qa-unanswered {
	margin: 0.25rem 0 0;
	font-size: 0.9rem;
	font-style: italic;
	color: #888;
}

.qa-unanswered a {
	color: #2a6e4e;
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
