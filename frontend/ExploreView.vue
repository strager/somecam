<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { fetchAnswerDepthCheck, fetchInferredAnswers } from "./api";
import type { ExploreQuestion } from "../shared/explore-questions";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions";
import type { MeaningCard } from "../shared/meaning-cards";
import { MEANING_CARDS } from "../shared/meaning-cards";

const EXPLORE_KEY = "somecam-explore";

interface ExploreEntry {
	questionId: string;
	userAnswer: string;
	prefilledAnswer: string;
	submitted: boolean;
	guardrailText: string;
	submittedAfterGuardrail: boolean;
}

type ExploreData = Record<string, ExploreEntry[]>;

const route = useRoute();
const router = useRouter();

const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));

const cardId = route.params.cardId as string;

const card = ref<MeaningCard | undefined>(undefined);
const entries = ref<ExploreEntry[]>([]);
const currentAnswer = ref("");
const inferring = ref(false);
const depthCheckFollowUp = ref("");
const depthCheckShown = ref(false);
const pendingInferResult = ref<Map<string, string> | null>(null);

const activeIndex = computed(() => {
	const idx = entries.value.findIndex((e) => !e.submitted);
	return idx === -1 ? entries.value.length : idx;
});

const activeQuestion = computed<ExploreQuestion | undefined>(() => {
	const idx = activeIndex.value;
	if (idx >= entries.value.length) return undefined;
	return questionsById.get(entries.value[idx].questionId);
});

const displayedQuestion = computed<ExploreQuestion | undefined>(() => {
	if (activeQuestion.value !== undefined) return activeQuestion.value;
	if (!depthCheckShown.value) return undefined;
	const last = entries.value.at(-1);
	if (last === undefined) return undefined;
	return questionsById.get(last.questionId);
});

const answeredEntries = computed(() => {
	const submitted = entries.value.filter((e) => e.submitted);
	if (depthCheckShown.value && submitted.length > 0) {
		return submitted.slice(0, -1);
	}
	return submitted;
});

const allAnswered = computed(() => {
	return entries.value.length === EXPLORE_QUESTIONS.length && entries.value.every((e) => e.submitted);
});

function persistEntries(): void {
	const raw = localStorage.getItem(EXPLORE_KEY);
	if (raw === null) return;
	const data = JSON.parse(raw) as ExploreData;
	data[cardId] = entries.value;
	localStorage.setItem(EXPLORE_KEY, JSON.stringify(data));
}

function answeredQuestionIds(): Set<string> {
	return new Set(entries.value.filter((e) => e.submitted).map((e) => e.questionId));
}

function remainingQuestionIds(): string[] {
	const answered = answeredQuestionIds();
	const inEntries = new Set(entries.value.map((e) => e.questionId));
	return EXPLORE_QUESTIONS.filter((q) => !answered.has(q.id) && !inEntries.has(q.id)).map((q) => q.id);
}

async function submitAnswer(): Promise<void> {
	if (depthCheckShown.value) {
		// User pressing Next to skip the guardrail
		const idx = entries.value.length - 1;
		if (idx >= 0 && entries.value[idx].submitted) {
			entries.value[idx].userAnswer = currentAnswer.value.trim();
			entries.value[idx].submittedAfterGuardrail = true;
			persistEntries();
		}
		depthCheckShown.value = false;
		depthCheckFollowUp.value = "";
		applyInferAndAdvance(pendingInferResult.value ?? new Map<string, string>(), remainingQuestionIds());
		pendingInferResult.value = null;
		return;
	}

	const idx = activeIndex.value;
	if (idx >= entries.value.length) return;

	const answerText = currentAnswer.value.trim();
	if (answerText === "") return;

	entries.value[idx].userAnswer = answerText;
	entries.value[idx].submitted = true;
	persistEntries();

	if (allAnswered.value) {
		void router.push("/chosen");
		return;
	}

	const remaining = remainingQuestionIds();
	if (remaining.length === 0) {
		void router.push("/chosen");
		return;
	}

	const questions = [...entries.value.filter((e) => e.submitted).map((e) => ({ questionId: e.questionId, answer: e.userAnswer })), ...remaining.map((qId) => ({ questionId: qId, answer: "" }))];

	inferring.value = true;

	const inferPromise = fetchInferredAnswers({ cardId, questions })
		.then((r) => new Map(r.inferredAnswers.map((ia) => [ia.questionId, ia.answer])))
		.catch(() => new Map<string, string>());

	const depthResult = await fetchAnswerDepthCheck({
		cardId,
		questionId: entries.value[idx].questionId,
		answer: answerText,
	}).catch(() => ({ sufficient: true, followUpQuestion: "" }));

	if (!depthResult.sufficient && depthResult.followUpQuestion) {
		// Depth check failed fast — cache the still-pending infer promise
		inferring.value = false;
		pendingInferResult.value = null;
		entries.value[idx].guardrailText = depthResult.followUpQuestion;
		persistEntries();
		depthCheckFollowUp.value = depthResult.followUpQuestion;
		depthCheckShown.value = true;
		// Resolve infer in background so it's ready when user skips
		void inferPromise.then((result) => {
			pendingInferResult.value = result;
		});
		return;
	}

	const inferResult = await inferPromise;
	inferring.value = false;

	applyInferAndAdvance(inferResult, remaining);
}

function applyInferAndAdvance(inferredMap: Map<string, string>, remaining: string[]): void {
	if (remaining.length === 0) {
		void router.push("/chosen");
		return;
	}

	// Pick next question: prefer one with a pre-fill
	let nextQuestionId: string | undefined;
	let nextPrefill = "";

	for (const qId of remaining) {
		const inferred = inferredMap.get(qId);
		if (inferred !== undefined) {
			nextQuestionId = qId;
			nextPrefill = inferred;
			break;
		}
	}

	if (nextQuestionId === undefined) {
		const randomIndex = Math.floor(Math.random() * remaining.length);
		nextQuestionId = remaining[randomIndex];
	}

	entries.value.push({
		questionId: nextQuestionId,
		userAnswer: "",
		prefilledAnswer: nextPrefill,
		submitted: false,
		guardrailText: "",
		submittedAfterGuardrail: false,
	});
	persistEntries();
	currentAnswer.value = nextPrefill;
}

async function inferAndAdvance(): Promise<void> {
	if (allAnswered.value) {
		void router.push("/chosen");
		return;
	}

	const remaining = remainingQuestionIds();
	if (remaining.length === 0) {
		void router.push("/chosen");
		return;
	}

	const questions = [...entries.value.filter((e) => e.submitted).map((e) => ({ questionId: e.questionId, answer: e.userAnswer })), ...remaining.map((qId) => ({ questionId: qId, answer: "" }))];

	inferring.value = true;
	let inferredMap = new Map<string, string>();
	try {
		const result = await fetchInferredAnswers({ cardId, questions });
		inferredMap = new Map(result.inferredAnswers.map((ia) => [ia.questionId, ia.answer]));
	} catch {
		// graceful degradation: no pre-fills
	} finally {
		inferring.value = false;
	}

	applyInferAndAdvance(inferredMap, remaining);
}

function stopExploring(): void {
	const idx = activeIndex.value;
	if (idx < entries.value.length && currentAnswer.value.trim() !== "") {
		entries.value[idx].userAnswer = currentAnswer.value.trim();
		persistEntries();
	}
	void router.push("/chosen");
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter" && event.shiftKey) {
		event.preventDefault();
		void submitAnswer();
	}
}

onMounted(() => {
	const foundCard = cardsById.get(cardId);
	if (foundCard === undefined) {
		void router.replace("/chosen");
		return;
	}

	try {
		const raw = localStorage.getItem(EXPLORE_KEY);
		if (raw === null) {
			void router.replace("/chosen");
			return;
		}
		const data = JSON.parse(raw) as ExploreData;
		const cardEntries = data[cardId];
		if (!Array.isArray(cardEntries) || cardEntries.length === 0) {
			void router.replace("/chosen");
			return;
		}

		card.value = foundCard;
		entries.value = (cardEntries as (Omit<ExploreEntry, "guardrailText" | "submittedAfterGuardrail"> & { guardrailText?: string; submittedAfterGuardrail?: boolean })[]).map((e) => ({
			questionId: e.questionId,
			userAnswer: e.userAnswer,
			prefilledAnswer: e.prefilledAnswer,
			submitted: e.submitted,
			guardrailText: e.guardrailText ?? "",
			submittedAfterGuardrail: e.submittedAfterGuardrail ?? false,
		}));

		const lastEntry = entries.value[entries.value.length - 1];
		if (lastEntry.submitted) {
			if (lastEntry.guardrailText && !lastEntry.submittedAfterGuardrail) {
				// Refreshed during guardrail — restore it
				depthCheckFollowUp.value = lastEntry.guardrailText;
				depthCheckShown.value = true;
				currentAnswer.value = lastEntry.userAnswer;
				return;
			}
			if (entries.value.length < EXPLORE_QUESTIONS.length) {
				// Refreshed during inference — re-run it
				void inferAndAdvance();
			} else {
				void router.push("/chosen");
			}
		} else {
			// Initialize currentAnswer from the active entry's prefill (or existing user answer)
			const idx = activeIndex.value;
			if (idx < entries.value.length) {
				const entry = entries.value[idx];
				currentAnswer.value = entry.userAnswer || entry.prefilledAnswer;
			}
		}
	} catch {
		void router.replace("/chosen");
	}
});
</script>

<template>
	<main v-if="card">
		<header>
			<h1>SoMeCaM</h1>
			<h2>Explore: {{ card.source }}</h2>
		</header>

		<div class="card-wrapper">
			<div class="card-surface explore-card">
				<p class="description">{{ card.description }}</p>

				<div v-for="entry in answeredEntries" :key="entry.questionId" class="answered-question">
					<p class="question">{{ questionsById.get(entry.questionId)?.topic }}: {{ questionsById.get(entry.questionId)?.text }}</p>
					<p class="answered-text">{{ entry.userAnswer }}</p>
				</div>

				<div v-if="inferring" class="inferring-indicator">
					<span class="spinner"></span>
					<span>Thinking about your next question...</span>
				</div>

				<div v-else-if="displayedQuestion && !allAnswered">
					<p class="question">{{ displayedQuestion.topic }}: {{ displayedQuestion.text }}</p>
					<textarea v-model="currentAnswer" rows="5" placeholder="Type your reflection here..." @keydown="onKeydown"></textarea>
					<p v-if="depthCheckShown" class="depth-follow-up">
						<em>{{ depthCheckFollowUp }}</em>
					</p>
					<button class="submit-btn" :disabled="!depthCheckShown && currentAnswer.trim() === ''" @click="submitAnswer">Next</button>
					<p v-if="depthCheckShown" class="hint">Press Next to continue as-is, or edit your answer above</p>
					<p v-else class="hint">Shift + Enter to submit</p>
				</div>

				<button class="stop-btn" @click="stopExploring">Stop Exploring</button>
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

.card-wrapper {
	display: flex;
	justify-content: center;
}

.explore-card {
	text-align: left;
}

.description {
	font-size: 1rem;
	line-height: 1.5;
	color: #333;
	margin: 0 0 1rem;
}

.answered-question {
	margin-bottom: 1rem;
	padding-bottom: 0.75rem;
	border-bottom: 1px solid #e0e0e0;
}

.question {
	font-size: 1.1rem;
	font-weight: 600;
	color: #2a6e4e;
	margin: 0 0 0.5rem;
}

.answered-text {
	font-size: 1rem;
	line-height: 1.5;
	color: #555;
	margin: 0;
	white-space: pre-wrap;
}

.inferring-indicator {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 1rem 0;
	font-size: 1rem;
	color: #888;
	font-style: italic;
}

.spinner {
	display: inline-block;
	width: 1.25rem;
	height: 1.25rem;
	border: 2px solid #e0e0e0;
	border-top-color: #2a6e4e;
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	flex-shrink: 0;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

textarea {
	width: 100%;
	padding: 0.75rem;
	font-size: 1rem;
	font-family: inherit;
	border: 1px solid #ccc;
	border-radius: 6px;
	resize: vertical;
	box-sizing: border-box;
}

textarea:focus {
	outline: none;
	border-color: #2a6e4e;
	box-shadow: 0 0 0 2px rgba(42, 110, 78, 0.2);
}

.submit-btn {
	display: block;
	width: 100%;
	margin-top: 1rem;
	padding: 0.75rem 1.5rem;
	font-size: 1rem;
	font-weight: 600;
	color: #fff;
	background: #2a6e4e;
	border: none;
	border-radius: 8px;
	cursor: pointer;
}

.submit-btn:hover:not(:disabled) {
	background: #225d40;
}

.submit-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.hint {
	text-align: center;
	font-size: 0.85rem;
	color: #888;
	margin: 0.5rem 0 0;
}

.depth-follow-up {
	font-size: 1.1rem;
	font-weight: 600;
	color: #b8860b;
	margin: 0 0 0.5rem;
}

.stop-btn {
	display: block;
	width: 100%;
	margin-top: 1.5rem;
	padding: 0.75rem 1.5rem;
	font-size: 1rem;
	font-weight: 600;
	color: #c0392b;
	background: transparent;
	border: 1.5px solid #c0392b;
	border-radius: 8px;
	cursor: pointer;
}

.stop-btn:hover {
	background: #fdf0ef;
}
</style>
