<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import type { MeaningCard } from "../shared/meaning-cards";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions";
import { MEANING_CARDS } from "../shared/meaning-cards";

const EXPLORE_KEY = "somecam-explore";

const route = useRoute();
const router = useRouter();

const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
const questionsById = new Map(EXPLORE_QUESTIONS.map((q) => [q.id, q]));

const cardId = route.params.cardId as string;

const card = ref<MeaningCard | undefined>(undefined);
const questionText = ref("");
const answer = ref("");

function persistAnswer(): void {
	const raw = localStorage.getItem(EXPLORE_KEY);
	if (raw === null) return;
	const data = JSON.parse(raw) as Record<string, unknown>;
	const entry = data[cardId] as { questionId: string; answer: string } | undefined;
	if (entry === undefined) return;
	entry.answer = answer.value;
	localStorage.setItem(EXPLORE_KEY, JSON.stringify(data));
}

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

watch(answer, () => {
	clearTimeout(autosaveTimer);
	autosaveTimer = setTimeout(persistAnswer, 300);
});

onUnmounted(() => {
	clearTimeout(autosaveTimer);
});

function submit(): void {
	clearTimeout(autosaveTimer);
	persistAnswer();
	void router.push("/chosen");
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter" && event.shiftKey) {
		event.preventDefault();
		submit();
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
		const data = JSON.parse(raw) as Record<string, unknown>;
		const entry = data[cardId] as { questionId: string; answer: string } | undefined;
		if (entry === undefined) {
			void router.replace("/chosen");
			return;
		}
		const question = questionsById.get(entry.questionId);
		if (question === undefined) {
			void router.replace("/chosen");
			return;
		}
		card.value = foundCard;
		questionText.value = question.text;
		answer.value = entry.answer;
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
				<p class="question">{{ questionText }}</p>
				<textarea v-model="answer" rows="5" placeholder="Type your reflection here..." @keydown="onKeydown"></textarea>
				<button class="submit-btn" @click="submit">Save &amp; Continue</button>
				<p class="hint">Shift + Enter to submit</p>
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

.question {
	font-size: 1.1rem;
	font-weight: 600;
	color: #2a6e4e;
	margin: 0 0 0.75rem;
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

.submit-btn:hover {
	background: #225d40;
}

.hint {
	text-align: center;
	font-size: 0.85rem;
	color: #888;
	margin: 0.5rem 0 0;
}
</style>
