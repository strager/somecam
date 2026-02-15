<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppButton from "./AppButton.vue";
import ReportContent from "./ReportContent.vue";
import type { CardReport, QuestionReport } from "../shared/report-types.ts";
import { capture } from "./analytics.ts";
import { useStringParam } from "./route-utils.ts";
import { exportSessionData, loadChosenCardIds, loadExploreData, loadFreeformNotes, loadSummaryCache, lookupCachedSummary } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

const router = useRouter();
const sessionId = useStringParam("sessionId");
const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));

const reports = ref<CardReport[]>([]);
const downloading = ref(false);
const downloadError = ref("");

async function downloadPdf(): Promise<void> {
	capture("pdf_download_initiated", { session_id: sessionId });
	downloading.value = true;
	downloadError.value = "";

	try {
		const body = exportSessionData(sessionId);
		const response = await fetch("/api/report-pdf", {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body,
		});

		if (!response.ok) {
			throw new Error(`PDF generation failed (${response.status.toString()})`);
		}

		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "somecam-report.pdf";
		a.click();
		URL.revokeObjectURL(url);
	} catch (error) {
		downloadError.value = error instanceof Error ? error.message : "PDF download failed.";
	} finally {
		downloading.value = false;
	}
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
	<ReportContent :reports="reports">
		<template #header-actions>
			<AppButton variant="primary" class="download-btn" :disabled="downloading" @click="downloadPdf">
				{{ downloading ? "Generating PDF…" : "Download PDF" }}
			</AppButton>
			<p v-if="downloadError !== ''" class="download-error">{{ downloadError }}</p>
		</template>
	</ReportContent>
</template>

<style scoped>
.download-error {
	margin-top: var(--space-2);
	font-size: var(--text-sm);
	color: var(--color-error);
}

@media print {
	.download-btn,
	.download-error {
		display: none;
	}
}
</style>
