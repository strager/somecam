<script setup lang="ts">
import { useRouter } from "vue-router";

const KEYS_TO_CLEAR = ["somecam-progress", "somecam-narrowdown", "somecam-chosen", "somecam-explore", "somecam-summaries"];

const router = useRouter();

function startOver(): void {
	if (!window.confirm("Start over? This will clear all your progress.")) return;
	for (const key of KEYS_TO_CLEAR) {
		localStorage.removeItem(key);
	}
	void router.push("/");
}
</script>

<template>
	<div class="start-over">
		<button type="button" class="start-over-btn" @click="startOver">Start over</button>
	</div>
</template>

<style scoped>
.start-over {
	text-align: center;
	margin-top: 2rem;
}

.start-over-btn {
	background: none;
	border: none;
	color: #999;
	font-size: 0.85rem;
	cursor: pointer;
	font-family: inherit;
	text-decoration: underline;
	padding: 0.25rem 0.5rem;
}

.start-over-btn:hover {
	color: #666;
}
</style>
