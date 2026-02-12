<script setup lang="ts">
import { onMounted, ref } from "vue";

const loading = ref(true);
const apiStatus = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

onMounted(async () => {
	try {
		const response = await fetch("/api/health");
		if (!response.ok) {
			throw new Error(`Request failed with status ${response.status}`);
		}

		const payload = (await response.json()) as { status?: unknown };
		if (payload.status !== "ok") {
			throw new Error("Unexpected API response.");
		}

		apiStatus.value = payload.status;
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : "Unknown error";
	} finally {
		loading.value = false;
	}
});
</script>

<template>
	<main>
		<h1>SoMeCaM</h1>
		<p v-if="loading">Checking API health...</p>
		<p v-else-if="errorMessage">API Health Error: {{ errorMessage }}</p>
		<p v-else>API Health: {{ apiStatus }}</p>
	</main>
</template>

<style scoped>
main {
	margin: 2rem auto;
	max-width: 34rem;
	padding: 0 1rem;
	font-family: "Segoe UI", sans-serif;
}

h1 {
	margin-bottom: 1rem;
}
</style>
