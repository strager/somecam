<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { ProgressPhase } from "./store.ts";
import { detectProgressPhase, loadProgressFile } from "./store.ts";

const router = useRouter();

const phase = ref<ProgressPhase>(detectProgressPhase());

function phaseLabel(p: ProgressPhase): string {
	switch (p) {
		case "explore":
		case "prioritize-complete":
			return "Explore Meaning";
		case "prioritize":
		case "swipe":
			return "Continue Finding Meaning";
		case "none":
			return "Start Finding Meaning";
	}
}

function phaseRoute(p: ProgressPhase): string {
	switch (p) {
		case "explore":
			return "/explore";
		case "prioritize-complete":
		case "prioritize":
			return "/find-meaning/prioritize";
		case "swipe":
		case "none":
			return "/find-meaning";
	}
}

const ctaLabel = computed(() => phaseLabel(phase.value));
const ctaRoute = computed(() => phaseRoute(phase.value));

function onCtaClick(): void {
	void router.push(ctaRoute.value);
}

function onLoadFile(): void {
	loadProgressFile().then(
		() => {
			phase.value = detectProgressPhase();
			void router.push(ctaRoute.value);
		},
		(err: unknown) => {
			window.alert(err instanceof Error ? err.message : "Failed to load progress file");
		},
	);
}
</script>

<template>
	<main>
		<header>
			<h1>SoMeCaM</h1>
			<p class="subtitle">Sources of Meaning Card Method</p>
		</header>

		<section class="purpose">
			<h2>Explore What Makes Life Meaningful</h2>
			<p>SoMeCaM is a method for mapping and exploring your personal sources of meaning. Based on 26 identified sources of meaning across five dimensions — self-transcendence, self-actualization, order, well-being, and relatedness — the method helps you reflect on what matters most in your life.</p>
		</section>

		<section class="privacy">
			<h2>Your Privacy</h2>
			<p>Your data is never stored on our servers. Your responses are saved locally in your browser so you can return to them later.</p>
		</section>

		<div class="cta">
			<button type="button" @click="onCtaClick">{{ ctaLabel }}</button>
		</div>

		<div class="load-file">
			<button type="button" class="load-file-btn" @click="onLoadFile">Load progress file</button>
		</div>

		<footer>
			<p class="citation">
				Based on: la Cour, P. &amp; Schnell, T. (2020). Presentation of the Sources of Meaning Card Method: The SoMeCaM.
				<cite>Journal of Humanistic Psychology, 60</cite>(1), 20–42.
				<a href="https://doi.org/10.1177/0022167816669620" target="_blank" rel="noopener">doi:10.1177/0022167816669620</a>
			</p>
		</footer>
	</main>
</template>

<style scoped>
main {
	margin: 3rem auto;
	max-width: 36rem;
	padding: 0 1.5rem;
	font-family: "Segoe UI", system-ui, sans-serif;
	color: #1a1a1a;
}

header {
	text-align: center;
	margin-bottom: 2.5rem;
}

h1 {
	font-size: 2.5rem;
	margin: 0 0 0.25rem;
	letter-spacing: 0.02em;
}

.subtitle {
	font-size: 1.1rem;
	color: #555;
	margin: 0;
}

h2 {
	font-size: 1.25rem;
	margin: 0 0 0.5rem;
}

section {
	margin-bottom: 2rem;
}

section p {
	line-height: 1.6;
	margin: 0;
}

.cta {
	text-align: center;
	margin: 2.5rem 0;
}

.cta button {
	font-size: 1.1rem;
	padding: 0.75rem 2rem;
	border: none;
	border-radius: 6px;
	background: #2a6e4e;
	color: #fff;
	cursor: pointer;
	font-family: inherit;
	transition: background 0.15s ease;
}

.cta button:hover {
	background: #1f5a3e;
}

.load-file {
	text-align: center;
}

.load-file-btn {
	background: none;
	border: none;
	color: #999;
	font-size: 0.85rem;
	cursor: pointer;
	font-family: inherit;
	text-decoration: underline;
	padding: 0.25rem 0.5rem;
}

.load-file-btn:hover {
	color: #666;
}

footer {
	margin-top: 3rem;
	padding-top: 1.5rem;
	border-top: 1px solid #ddd;
}

.citation {
	font-size: 0.85rem;
	color: #666;
	line-height: 1.5;
	margin: 0;
}

.citation a {
	color: #2a6e4e;
}
</style>
