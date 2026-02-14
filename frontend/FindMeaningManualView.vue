<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { assignQuestions } from "./explore-data.ts";
import { loadChosenCardIds, loadExploreData, saveChosenCardIds, saveExploreData } from "./store.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

const router = useRouter();
const chosenIds = ref<Set<string>>(new Set());
const exploredIds = ref<Set<string>>(new Set());
const confirmingRemove = ref<string | null>(null);

const selectedCount = computed(() => chosenIds.value.size);

function saveChosenIds(): void {
	const ordered = MEANING_CARDS.filter((c) => chosenIds.value.has(c.id)).map((c) => c.id);
	saveChosenCardIds(ordered);
}

function isExplored(cardId: string): boolean {
	return exploredIds.value.has(cardId);
}

function toggleCard(cardId: string): void {
	if (chosenIds.value.has(cardId)) {
		if (isExplored(cardId)) {
			confirmingRemove.value = cardId;
			return;
		}
		removeCard(cardId);
	} else {
		addCard(cardId);
	}
}

function addCard(cardId: string): void {
	chosenIds.value.add(cardId);
	chosenIds.value = new Set(chosenIds.value);
	saveChosenIds();

	const exploreData = loadExploreData();
	if (exploreData !== null && !(cardId in exploreData)) {
		const newEntry = assignQuestions([cardId]);
		Object.assign(exploreData, newEntry);
		saveExploreData(exploreData);
	}
}

function removeCard(cardId: string): void {
	chosenIds.value.delete(cardId);
	chosenIds.value = new Set(chosenIds.value);
	confirmingRemove.value = null;
	saveChosenIds();
}

function cancelRemove(): void {
	confirmingRemove.value = null;
}

onMounted(() => {
	try {
		const cardIds = loadChosenCardIds();
		if (cardIds === null) {
			void router.replace("/find-meaning");
			return;
		}
		chosenIds.value = new Set(cardIds);

		const exploreData = loadExploreData();
		if (exploreData !== null) {
			for (const [cardId, entries] of Object.entries(exploreData)) {
				if (entries.some((e) => e.userAnswer !== "")) {
					exploredIds.value.add(cardId);
				}
			}
		}
	} catch {
		void router.replace("/find-meaning");
	}
});
</script>

<template>
	<main>
		<header>
			<h1>Find Meaning — Manual</h1>
			<p class="count">{{ selectedCount }} card{{ selectedCount === 1 ? "" : "s" }} selected</p>
		</header>

		<div class="card-list">
			<label v-for="card in MEANING_CARDS" :key="card.id" :class="['card-row', { selected: chosenIds.has(card.id), unselected: !chosenIds.has(card.id) }]">
				<input type="checkbox" :checked="chosenIds.has(card.id)" class="card-checkbox" @change="toggleCard(card.id)" />
				<div class="card-content">
					<span class="card-source">{{ card.source }}</span>
					<span class="card-desc">{{ card.description }}</span>
				</div>
				<span v-if="isExplored(card.id)" class="explored-badge">Explored</span>

				<div v-if="confirmingRemove === card.id" class="confirm-overlay" @click.stop>
					<p>This card has exploration answers. Remove it?</p>
					<div class="confirm-actions">
						<button class="confirm-remove" @click="removeCard(card.id)">Remove</button>
						<button class="confirm-cancel" @click="cancelRemove">Cancel</button>
					</div>
				</div>
			</label>
		</div>

		<button class="done-btn" @click="router.push('/explore')">Done</button>
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
	margin-bottom: 1.5rem;
}

h1 {
	font-size: 2rem;
	margin: 0 0 0.25rem;
	letter-spacing: 0.02em;
}

.count {
	font-size: 0.95rem;
	color: #888;
	margin: 0;
}

.card-list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.card-row {
	position: relative;
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border-radius: 6px;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s;
	user-select: none;
}

.card-row.selected {
	background: #eaf5ef;
	border-left: 4px solid #2a6e4e;
}

.card-row.unselected {
	background: #f5f5f5;
	border-left: 4px solid #ccc;
	opacity: 0.7;
}

.card-row:hover {
	opacity: 1;
}

.card-checkbox {
	width: 1.15rem;
	height: 1.15rem;
	flex-shrink: 0;
	accent-color: #2a6e4e;
	cursor: pointer;
}

.card-content {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	min-width: 0;
	flex: 1;
}

.card-source {
	font-weight: 600;
	font-size: 0.95rem;
}

.card-desc {
	font-size: 0.85rem;
	color: #555;
}

.explored-badge {
	flex-shrink: 0;
	margin-left: 0.75rem;
	padding: 0.15rem 0.5rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: #2a6e4e;
	background: #d4edda;
	border-radius: 999px;
}

.confirm-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.95);
	border-radius: 6px;
	z-index: 1;
}

.confirm-overlay p {
	margin: 0 0 0.5rem;
	font-size: 0.9rem;
	color: #333;
}

.confirm-actions {
	display: flex;
	gap: 0.5rem;
}

.confirm-remove {
	padding: 0.35rem 1rem;
	font-size: 0.85rem;
	font-weight: 600;
	color: #fff;
	background: #c0392b;
	border: none;
	border-radius: 4px;
	cursor: pointer;
}

.confirm-remove:hover {
	background: #a93226;
}

.confirm-cancel {
	padding: 0.35rem 1rem;
	font-size: 0.85rem;
	font-weight: 600;
	color: #333;
	background: #e0e0e0;
	border: none;
	border-radius: 4px;
	cursor: pointer;
}

.confirm-cancel:hover {
	background: #d0d0d0;
}

.done-btn {
	display: block;
	margin: 1.5rem auto 0;
	padding: 0.6rem 2rem;
	font-size: 1rem;
	font-weight: 600;
	color: #fff;
	background: #2a6e4e;
	border: none;
	border-radius: 6px;
	cursor: pointer;
}

.done-btn:hover {
	background: #225d40;
}
</style>
