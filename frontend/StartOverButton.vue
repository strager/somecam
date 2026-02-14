<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createSession, hasProgressData, saveProgressFile } from "./store.ts";

const route = useRoute();
const router = useRouter();
const sessionId = route.params.sessionId as string;
const hasData = ref(false);

onMounted(() => {
	hasData.value = hasProgressData(sessionId);
});

function startOver(): void {
	if (!window.confirm("Start over with a new session? Your current session will be saved.")) return;
	const newId = createSession();
	void router.push(`/${newId}/find-meaning`);
}
</script>

<template>
	<div class="start-over">
		<button v-if="hasData" type="button" class="start-over-btn" @click="saveProgressFile">Save progress file</button>
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
