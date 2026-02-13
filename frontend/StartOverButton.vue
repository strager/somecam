<script setup lang="ts">
import { useRouter } from "vue-router";
import { clearAllProgress } from "./store";

const router = useRouter();

function startOver(): void {
	if (!window.confirm("Start over? This will clear all your progress.")) return;
	clearAllProgress();
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
