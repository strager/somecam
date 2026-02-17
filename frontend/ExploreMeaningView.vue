<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppButton from "./AppButton.vue";
import { fetchAnswerDepthCheck, fetchInferredAnswers } from "./api.ts";
import { capture } from "./analytics.ts";
import ExploreTextarea from "./ExploreTextarea.vue";
import { useStringParam } from "./route-utils.ts";
import type { ExploreEntryFull } from "./store.ts";
import { loadChosenCardIds, loadExploreDataFull, loadFreeformNotes, requestStoragePersistence, saveExploreData, saveFreeformNotes } from "./store.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import type { MeaningCard } from "../shared/meaning-cards.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

const router = useRouter();

const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));

const sessionId = useStringParam("sessionId");
const cardId = useStringParam("meaningId");

const card = ref<MeaningCard | undefined>(undefined);
const entries = ref<ExploreEntryFull[]>([]);
const inferring = ref(false);
const depthCheckFollowUp = ref("");
const depthCheckShown = ref(false);
const pendingInferResult = ref<Map<string, string> | null>(null);
const activeTextarea = ref<InstanceType<typeof ExploreTextarea> | null>(null);
const entryTextareas: (InstanceType<typeof ExploreTextarea> | null)[] = [];
const freeformTextarea = ref<InstanceType<typeof ExploreTextarea> | null>(null);
const freeformNote = ref("");
const questionStartTimeMs = ref(performance.now());
const submittedAnswerSnapshots = ref<Map<string, string>>(new Map());
const editedAfterSubmit = ref<Set<string>>(new Set());

const EXPLORE_PHASE_TRACK_KEY_PREFIX = "somecam-explore-phase-complete";

const activeIndex = computed(() => {
	const idx = entries.value.findIndex((e) => !e.submitted);
	return idx === -1 ? entries.value.length : idx;
});

const editingEntryIndex = computed(() => {
	if (depthCheckShown.value) {
		const lastIdx = entries.value.length - 1;
		return lastIdx >= 0 && entries.value[lastIdx].submitted ? lastIdx : -1;
	}
	const idx = activeIndex.value;
	return idx < entries.value.length ? idx : -1;
});

const prefilledQuestionIds = ref<Set<string>>(new Set());

const allAnswered = computed(() => {
	return entries.value.length === EXPLORE_QUESTIONS.length && entries.value.every((e) => e.submitted);
});

const submittedCount = computed(() => entries.value.filter((e) => e.submitted).length);

function markQuestionStartNow(): void {
	questionStartTimeMs.value = performance.now();
}

function answerSource(entry: ExploreEntryFull, answer: string): "original" | "inferred-accepted" | "inferred-edited" {
	if (entry.prefilledAnswer === "") {
		return "original";
	}
	return answer === entry.prefilledAnswer ? "inferred-accepted" : "inferred-edited";
}

function trackSubmittedSnapshot(questionId: string, answer: string): void {
	submittedAnswerSnapshots.value.set(questionId, answer);
	editedAfterSubmit.value.delete(questionId);
}

function persistEntries(): void {
	const data = loadExploreDataFull(sessionId);
	if (data === null) return;
	data[cardId] = entries.value;
	saveExploreData(sessionId, data);
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function debouncedPersist(): void {
	if (persistTimer !== undefined) return;
	persistTimer = setTimeout(() => {
		persistTimer = undefined;
		persistEntries();
	}, 300);
}

function onAnsweredEntryInput(entry: ExploreEntryFull): void {
	const snapshot = submittedAnswerSnapshots.value.get(entry.questionId);
	if (snapshot !== undefined && snapshot !== entry.userAnswer) {
		editedAfterSubmit.value.add(entry.questionId);
	}
	debouncedPersist();
}

function onAnsweredEntryBlur(entry: ExploreEntryFull): void {
	persistEntries();
	if (!editedAfterSubmit.value.has(entry.questionId)) {
		return;
	}
	capture("answer_edited_after_submit", {
		session_id: sessionId,
		card_id: cardId,
		question_id: entry.questionId,
		answer_length: entry.userAnswer.trim().length,
	});
	trackSubmittedSnapshot(entry.questionId, entry.userAnswer);
}

function persistFreeform(): void {
	const notes = loadFreeformNotes(sessionId);
	notes[cardId] = freeformNote.value;
	saveFreeformNotes(sessionId, notes);
}

let freeformPersistTimer: ReturnType<typeof setTimeout> | undefined;

function debouncedFreeformPersist(): void {
	if (freeformPersistTimer !== undefined) return;
	freeformPersistTimer = setTimeout(() => {
		freeformPersistTimer = undefined;
		persistFreeform();
	}, 300);
}

function maybeTrackExplorePhaseCompleted(): void {
	const trackedKey = `${EXPLORE_PHASE_TRACK_KEY_PREFIX}:${sessionId}`;
	if (sessionStorage.getItem(trackedKey) === "1") {
		return;
	}

	const chosenCardIds = loadChosenCardIds(sessionId);
	const data = loadExploreDataFull(sessionId);
	if (chosenCardIds === null || data === null) {
		return;
	}

	const allCardsComplete = chosenCardIds.every((chosenId) => {
		const cardEntries = data[chosenId];
		return Array.isArray(cardEntries) && cardEntries.length === EXPLORE_QUESTIONS.length && cardEntries.every((entry) => entry.submitted);
	});

	if (!allCardsComplete) {
		return;
	}

	capture("explore_phase_completed", { session_id: sessionId });
	sessionStorage.setItem(trackedKey, "1");
}

function answeredQuestionIds(): Set<string> {
	return new Set(entries.value.filter((e) => e.submitted).map((e) => e.questionId));
}

function remainingQuestionIds(): string[] {
	const answered = answeredQuestionIds();
	const inEntries = new Set(entries.value.map((e) => e.questionId));
	return EXPLORE_QUESTIONS.filter((q) => !answered.has(q.id) && !inEntries.has(q.id)).map((q) => q.id);
}

function acceptGuardrail(): void {
	const lastIdx = entries.value.length - 1;
	if (lastIdx < 0 || !entries.value[lastIdx].submitted) return;
	const entry = entries.value[lastIdx];
	entry.userAnswer = entry.userAnswer.trim();
	entry.submittedAfterGuardrail = true;
	trackSubmittedSnapshot(entry.questionId, entry.userAnswer);
	capture("answer_submitted_after_guardrail", {
		session_id: sessionId,
		card_id: cardId,
		question_id: entry.questionId,
	});
}

async function submitAnswer(): Promise<void> {
	if (depthCheckShown.value) {
		acceptGuardrail();
		persistEntries();
		depthCheckShown.value = false;
		depthCheckFollowUp.value = "";
		applyInferAndAdvance(pendingInferResult.value ?? new Map<string, string>(), remainingQuestionIds());
		pendingInferResult.value = null;
		return;
	}

	const idx = activeIndex.value;
	if (idx >= entries.value.length) return;

	const answerText = entries.value[idx].userAnswer.trim();
	if (answerText === "") return;

	const questionId = entries.value[idx].questionId;
	const source = answerSource(entries.value[idx], answerText);
	capture("question_answered", {
		session_id: sessionId,
		card_id: cardId,
		question_id: questionId,
		answer_length: answerText.length,
		time_spent_ms: Math.round(performance.now() - questionStartTimeMs.value),
		source,
	});
	if (source === "inferred-accepted") {
		capture("inferred_answer_accepted", {
			session_id: sessionId,
			card_id: cardId,
			question_id: questionId,
		});
	} else if (source === "inferred-edited") {
		capture("inferred_answer_edited", {
			session_id: sessionId,
			card_id: cardId,
			question_id: questionId,
		});
	}

	entries.value[idx].userAnswer = answerText;
	entries.value[idx].submitted = true;
	prefilledQuestionIds.value.delete(questionId);
	trackSubmittedSnapshot(questionId, answerText);
	persistEntries();

	requestStoragePersistence(sessionId);

	const remaining = remainingQuestionIds();

	const questions = [...entries.value.filter((e) => e.submitted).map((e) => ({ questionId: e.questionId, answer: e.userAnswer })), ...remaining.map((qId) => ({ questionId: qId, answer: "" }))];

	const inferPromise =
		remaining.length > 0
			? fetchInferredAnswers({ cardId, questions })
					.then((r) => new Map(r.inferredAnswers.map((ia) => [ia.questionId, ia.answer])))
					.catch(() => new Map<string, string>())
			: Promise.resolve(new Map<string, string>());

	inferring.value = remaining.length > 0;

	const depthResult = await fetchAnswerDepthCheck({
		cardId,
		questionId,
		answer: answerText,
	}).catch(() => ({ sufficient: true, followUpQuestion: "" }));
	capture("depth_check_triggered", {
		session_id: sessionId,
		card_id: cardId,
		question_id: questionId,
		sufficient: depthResult.sufficient,
	});

	if (!depthResult.sufficient && depthResult.followUpQuestion !== "") {
		// Depth check failed fast — cache the still-pending infer promise
		inferring.value = false;
		pendingInferResult.value = null;
		entries.value[idx].guardrailText = depthResult.followUpQuestion;
		persistEntries();
		capture("depth_check_followup_shown", {
			session_id: sessionId,
			card_id: cardId,
			question_id: questionId,
		});
		depthCheckFollowUp.value = depthResult.followUpQuestion;
		depthCheckShown.value = true;
		void nextTick(() => {
			activeTextarea.value?.focus();
		});
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
		userAnswer: nextPrefill,
		prefilledAnswer: nextPrefill,
		submitted: false,
		guardrailText: "",
		submittedAfterGuardrail: false,
	});
	if (nextPrefill !== "") {
		prefilledQuestionIds.value.add(nextQuestionId);
	}
	persistEntries();
	markQuestionStartNow();
}

async function inferAndAdvance(): Promise<void> {
	const remaining = remainingQuestionIds();
	if (remaining.length === 0) {
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

function finishExploring(): void {
	if (depthCheckShown.value) {
		acceptGuardrail();
	}
	persistEntries();
	persistFreeform();
	const noteLength = freeformNote.value.trim().length;
	if (noteLength > 0) {
		capture("freeform_notes_added", {
			session_id: sessionId,
			card_id: cardId,
			note_length: noteLength,
		});
	}
	const answeredCount = entries.value.filter((entry) => entry.submitted).length;
	capture("card_exploration_finished", {
		session_id: sessionId,
		card_id: cardId,
		answered_count: answeredCount,
		total_questions: EXPLORE_QUESTIONS.length,
		completed_all_questions: answeredCount === EXPLORE_QUESTIONS.length,
	});
	maybeTrackExplorePhaseCompleted();
	void router.push({ name: "explore", params: { sessionId } });
}

function onKeydown(index: number | null, event: KeyboardEvent): void {
	if (!(event.key === "Enter" && event.shiftKey)) return;
	event.preventDefault();
	if (index === editingEntryIndex.value) {
		void submitAnswer();
	} else if (index !== null) {
		const next = entryTextareas[index + 1] ?? null;
		if (next !== null) {
			next.focus();
		} else if (allAnswered.value) {
			freeformTextarea.value?.focus();
		}
	} else {
		finishExploring();
	}
}

onMounted(() => {
	const foundCard = cardsById.get(cardId);
	if (foundCard === undefined) {
		void router.replace({ name: "explore", params: { sessionId } });
		return;
	}

	try {
		const data = loadExploreDataFull(sessionId);
		if (data === null) {
			void router.replace({ name: "explore", params: { sessionId } });
			return;
		}
		const cardEntries = data[cardId];
		if (!Array.isArray(cardEntries) || cardEntries.length === 0) {
			void router.replace({ name: "explore", params: { sessionId } });
			return;
		}

		card.value = foundCard;
		entries.value = cardEntries;
		freeformNote.value = loadFreeformNotes(sessionId)[cardId] ?? "";
		submittedAnswerSnapshots.value = new Map(entries.value.filter((entry) => entry.submitted).map((entry) => [entry.questionId, entry.userAnswer]));

		const lastEntry = entries.value[entries.value.length - 1];
		if (lastEntry.submitted) {
			if (lastEntry.guardrailText !== "" && !lastEntry.submittedAfterGuardrail) {
				// Refreshed during guardrail — restore it
				depthCheckFollowUp.value = lastEntry.guardrailText;
				depthCheckShown.value = true;
				return;
			}
			if (entries.value.length < EXPLORE_QUESTIONS.length) {
				// Refreshed during inference — re-run it
				void inferAndAdvance();
			}
		} else {
			const idx = activeIndex.value;
			if (idx < entries.value.length) {
				const entry = entries.value[idx];
				if (entry.prefilledAnswer !== "") {
					prefilledQuestionIds.value.add(entry.questionId);
					if (entry.userAnswer === "") {
						entry.userAnswer = entry.prefilledAnswer;
					}
				}
				markQuestionStartNow();
			}
		}
	} catch {
		void router.replace({ name: "explore", params: { sessionId } });
	}
});
</script>

<template>
	<main v-if="card">
		<header>
			<h1>Explore meaning</h1>

			<h2 class="description">
				&ldquo;{{ card.description }}&rdquo; <span class="source">({{ card.source }})</span>
			</h2>

			<div class="instruction-stack">
				<p :class="['instruction', { active: !allAnswered && submittedCount === 0 }]">Reflect on what this source of meaning means to you. Answer each question thoughtfully.</p>
				<p :class="['instruction', { active: !allAnswered && submittedCount > 0 }]">Question {{ submittedCount + 1 }} of {{ EXPLORE_QUESTIONS.length }} — keep reflecting on this source of meaning.</p>
				<p :class="['instruction', { active: allAnswered }]">You've answered all questions. Add any additional notes, or finish exploring this card.</p>
			</div>
		</header>

		<div v-for="(entry, index) in entries" :key="entry.questionId" class="card-hrule">
			<label :for="`q-${entry.questionId}`"
				><q>{{ card.description }}</q
				><br />{{ questionsById.get(entry.questionId)?.text }}</label
			>
			<p v-if="prefilledQuestionIds.has(entry.questionId)" class="prefill-hint"><em>This answer was pre-filled based on your previous responses. Feel free to edit it.</em></p>
			<ExploreTextarea
				:id="`q-${entry.questionId}`"
				:ref="
					(el: any) => {
						entryTextareas[index] = el;
						if (index === editingEntryIndex) activeTextarea = el;
					}
				"
				v-model="entry.userAnswer"
				:variant="index === editingEntryIndex ? undefined : 'answered'"
				:rows="index === editingEntryIndex ? 5 : 3"
				:placeholder="index === editingEntryIndex ? 'Type your reflection here...' : ''"
				@update:model-value="index === editingEntryIndex ? debouncedPersist() : onAnsweredEntryInput(entry)"
				@blur="index === editingEntryIndex ? persistEntries() : onAnsweredEntryBlur(entry)"
				@keydown="onKeydown(index, $event)"
			/>
			<template v-if="index === editingEntryIndex">
				<p v-if="depthCheckShown" class="depth-follow-up">
					<em>{{ depthCheckFollowUp }}</em>
				</p>
				<AppButton variant="primary" class="submit-btn" :disabled="!depthCheckShown && entry.userAnswer.trim() === ''" @click="submitAnswer">Next</AppButton>
				<p v-if="depthCheckShown" class="hint">Press Next to continue as-is, or edit your answer above</p>
				<p v-else class="hint">Shift + Enter to submit</p>
			</template>
		</div>

		<div v-if="inferring" class="inferring-indicator">
			<span class="spinner"></span>
			<span>Thinking about your next question...</span>
		</div>

		<div v-if="allAnswered && !inferring && !depthCheckShown" class="card-hrule">
			<label for="freeform-notes">Additional notes about this source of meaning</label>
			<ExploreTextarea id="freeform-notes" ref="freeformTextarea" v-model="freeformNote" :rows="5" placeholder="Any other thoughts you'd like to capture (optional)" @update:model-value="debouncedFreeformPersist" @blur="persistFreeform()" @keydown="onKeydown(null, $event)" />
		</div>

		<AppButton variant="secondary" class="finish-btn" @click="finishExploring">Finish exploring</AppButton>
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
	margin: 0 0 var(--space-1);
}

.description {
	font-weight: 400;
	border-left: 3px solid var(--color-green-600);
	padding: var(--space-4) 0 var(--space-4) var(--space-5);
	margin: var(--space-16) 0 var(--space-12) 0;
}

.source {
	color: var(--color-gray-600);
}

label {
	font-family: var(--font-heading);
	font-size: var(--text-lg);
	font-weight: 500;
	color: var(--color-gray-800);
	cursor: pointer;
}

.inferring-indicator {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	padding: var(--space-4) 0;
	font-size: var(--text-base);
	color: var(--color-gray-400);
	font-style: italic;
}

.spinner {
	display: inline-block;
	width: 1.25rem;
	height: 1.25rem;
	border: 2px solid var(--color-gray-200);
	border-top-color: var(--color-green-600);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	flex-shrink: 0;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.submit-btn {
	width: 100%;
	margin-top: var(--space-4);
}

.hint {
	font-size: var(--text-sm);
	color: var(--color-gray-400);
	margin: var(--space-2) 0 0;
}

.depth-follow-up {
	font-size: var(--text-lg);
	font-weight: 600;
	color: var(--color-warning);
	margin: 0 0 var(--space-2);
}

.prefill-hint {
	font-size: var(--text-sm);
	color: var(--color-warning);
	margin: 0 0 var(--space-2);
}

.finish-btn {
	width: 100%;
	margin-top: var(--space-6);
}
</style>
