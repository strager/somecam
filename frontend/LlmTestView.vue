<script setup lang="ts">
import { reactive, ref, watch } from "vue";

import { fetchAnswerDepthCheck, fetchInferredAnswers, fetchSummary } from "./api";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions";
import { MEANING_CARDS } from "../shared/meaning-cards";

const STORAGE_KEY = "somecam-llm-test";

interface StoredState {
	cardId: string;
	rows: { questionId: string; answer: string }[];
}

interface QuestionRow {
	questionId: string;
	answer: string;
	depthLoading: boolean;
	depthResult: string | null;
	depthError: string | null;
	summarizeLoading: boolean;
	summarizeResult: string | null;
	summarizeError: string | null;
}

function createRow(): QuestionRow {
	return {
		questionId: EXPLORE_QUESTIONS[0].id,
		answer: "",
		depthLoading: false,
		depthResult: null,
		depthError: null,
		summarizeLoading: false,
		summarizeResult: null,
		summarizeError: null,
	};
}

function loadState(): { cardId: string; rows: QuestionRow[] } | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return null;
		const data = JSON.parse(raw) as StoredState;
		if (typeof data.cardId !== "string" || !Array.isArray(data.rows) || data.rows.length === 0) return null;
		const restoredRows: QuestionRow[] = data.rows.map((r) => ({
			questionId: typeof r.questionId === "string" ? r.questionId : EXPLORE_QUESTIONS[0].id,
			answer: typeof r.answer === "string" ? r.answer : "",
			depthLoading: false,
			depthResult: null,
			depthError: null,
			summarizeLoading: false,
			summarizeResult: null,
			summarizeError: null,
		}));
		return { cardId: data.cardId, rows: restoredRows };
	} catch {
		return null;
	}
}

function saveState(): void {
	const data: StoredState = {
		cardId: selectedCardId.value,
		rows: rows.map((r) => ({ questionId: r.questionId, answer: r.answer })),
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function debouncedSave(): void {
	if (saveTimer !== undefined) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = undefined;
		saveState();
	}, 300);
}

const stored = loadState();
const selectedCardId = ref(stored ? stored.cardId : MEANING_CARDS[0].id);
const rows = reactive<QuestionRow[]>(stored ? stored.rows : [createRow()]);

watch(selectedCardId, saveState);

const inferResult = ref<string | null>(null);
const inferLoading = ref(false);
const inferError = ref<string | null>(null);

function addRow() {
	rows.push(createRow());
	saveState();
}

function removeRow(index: number) {
	rows.splice(index, 1);
	saveState();
}

async function checkDepth(row: QuestionRow) {
	row.depthLoading = true;
	row.depthError = null;
	row.depthResult = null;
	try {
		const result = await fetchAnswerDepthCheck({
			cardId: selectedCardId.value,
			questionId: row.questionId,
			answer: row.answer,
		});
		row.depthResult = JSON.stringify(result, null, 2);
	} catch (e) {
		row.depthError = e instanceof Error ? e.message : String(e);
	} finally {
		row.depthLoading = false;
	}
}

async function summarize(row: QuestionRow) {
	row.summarizeLoading = true;
	row.summarizeError = null;
	row.summarizeResult = null;
	try {
		const card = MEANING_CARDS.find((c) => c.id === selectedCardId.value);
		const question = EXPLORE_QUESTIONS.find((q) => q.id === row.questionId);
		if (!card || !question) return;
		const result = await fetchSummary({
			cardSource: card.source,
			cardDescription: card.description,
			questionText: question.text,
			answer: row.answer,
		});
		row.summarizeResult = JSON.stringify(result, null, 2);
	} catch (e) {
		row.summarizeError = e instanceof Error ? e.message : String(e);
	} finally {
		row.summarizeLoading = false;
	}
}

async function inferAnswers() {
	inferLoading.value = true;
	inferError.value = null;
	inferResult.value = null;
	try {
		const result = await fetchInferredAnswers({
			cardId: selectedCardId.value,
			questions: rows.map((r) => ({ questionId: r.questionId, answer: r.answer })),
		});
		inferResult.value = JSON.stringify(result, null, 2);
	} catch (e) {
		inferError.value = e instanceof Error ? e.message : String(e);
	} finally {
		inferLoading.value = false;
	}
}
</script>

<template>
	<div class="llm-test">
		<h1>LLM Test</h1>

		<label>
			Card
			<select v-model="selectedCardId">
				<option v-for="card in MEANING_CARDS" :key="card.id" :value="card.id">{{ card.source }} &mdash; {{ card.description }}</option>
			</select>
		</label>

		<div v-for="(row, i) in rows" :key="i" class="question-row">
			<div class="row-header">
				<label>
					Question
					<select v-model="row.questionId" @change="saveState()">
						<option v-for="q in EXPLORE_QUESTIONS" :key="q.id" :value="q.id">{{ q.topic }}: {{ q.text }}</option>
					</select>
				</label>
				<button v-if="rows.length > 1" class="remove-btn" @click="removeRow(i)">Remove</button>
			</div>

			<label>
				Answer
				<textarea v-model="row.answer" rows="3" placeholder="Type an answer..." @input="debouncedSave()"></textarea>
			</label>

			<div class="row-actions">
				<button :disabled="row.depthLoading" @click="checkDepth(row)">
					{{ row.depthLoading ? "Checking..." : "Check Depth" }}
				</button>
				<button :disabled="row.summarizeLoading" @click="summarize(row)">
					{{ row.summarizeLoading ? "Summarizing..." : "Summarize" }}
				</button>
			</div>

			<div v-if="row.depthLoading || row.depthResult || row.depthError" class="result-section">
				<h3>Check Depth</h3>
				<p v-if="row.depthLoading">Loading...</p>
				<pre v-if="row.depthResult">{{ row.depthResult }}</pre>
				<p v-if="row.depthError" class="error">{{ row.depthError }}</p>
			</div>

			<div v-if="row.summarizeLoading || row.summarizeResult || row.summarizeError" class="result-section">
				<h3>Summarize</h3>
				<p v-if="row.summarizeLoading">Loading...</p>
				<pre v-if="row.summarizeResult">{{ row.summarizeResult }}</pre>
				<p v-if="row.summarizeError" class="error">{{ row.summarizeError }}</p>
			</div>
		</div>

		<div class="global-actions">
			<button @click="addRow">+ Add question</button>
			<button :disabled="inferLoading" @click="inferAnswers">
				{{ inferLoading ? "Inferring..." : "Infer Answers" }}
			</button>
		</div>

		<div v-if="inferLoading || inferResult || inferError" class="result-section">
			<h2>Infer Answers</h2>
			<p v-if="inferLoading">Loading...</p>
			<pre v-if="inferResult">{{ inferResult }}</pre>
			<p v-if="inferError" class="error">{{ inferError }}</p>
		</div>
	</div>
</template>

<style scoped>
.llm-test {
	max-width: 800px;
	margin: 0 auto;
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

select,
textarea {
	width: 100%;
	font-size: 1rem;
	padding: 0.5rem;
}

.question-row {
	border: 1px solid #ccc;
	border-radius: 4px;
	padding: 0.75rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.row-header {
	display: flex;
	gap: 0.5rem;
	align-items: end;
}

.row-header label {
	flex: 1;
}

.remove-btn {
	padding: 0.5rem 0.75rem;
	font-size: 0.875rem;
	cursor: pointer;
}

.row-actions {
	display: flex;
	gap: 0.5rem;
}

.row-actions button,
.global-actions button {
	padding: 0.5rem 1rem;
	font-size: 1rem;
	cursor: pointer;
}

.row-actions button:disabled,
.global-actions button:disabled {
	cursor: wait;
}

.global-actions {
	display: flex;
	gap: 0.5rem;
}

.result-section pre {
	background: #f5f5f5;
	padding: 0.75rem;
	overflow-x: auto;
	white-space: pre-wrap;
}

.error {
	color: red;
}
</style>
