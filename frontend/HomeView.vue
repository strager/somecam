<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { ProgressPhase, SessionMeta } from "./store.ts";
import { createSession, deleteSession, detectSessionPhase, ensureSessionsInitialized, formatSessionDate, listSessions, loadProgressFile, renameSession, saveProgressFile } from "./store.ts";

const router = useRouter();

const sessions = ref<SessionMeta[]>([]);
const sessionPhases = ref<Record<string, ProgressPhase>>({});
const renamingId = ref<string | null>(null);
const renameInput = ref("");
const renameInputEl = ref<HTMLInputElement | null>(null);

function refreshState(): void {
	sessions.value = listSessions();
	const phases: Record<string, ProgressPhase> = {};
	for (const s of sessions.value) {
		phases[s.id] = detectSessionPhase(s.id);
	}
	sessionPhases.value = phases;
}

onMounted(() => {
	ensureSessionsInitialized();
	refreshState();
});

function phaseRoute(sessionId: string, p: ProgressPhase): string {
	switch (p) {
		case "explore":
			return `/${sessionId}/explore`;
		case "prioritize-complete":
		case "prioritize":
			return `/${sessionId}/find-meaning/prioritize`;
		case "swipe":
		case "none":
			return `/${sessionId}/find-meaning`;
	}
}

function onNewSession(): void {
	const newId = createSession();
	refreshState();
	void router.push(`/${newId}/find-meaning`);
}

function onStartRename(session: SessionMeta): void {
	renamingId.value = session.id;
	renameInput.value = session.name;
	void nextTick(() => {
		renameInputEl.value?.focus();
		renameInputEl.value?.select();
	});
}

function onConfirmRename(): void {
	if (renamingId.value === null) return;
	const trimmed = renameInput.value.trim();
	if (trimmed.length > 0) {
		renameSession(renamingId.value, trimmed);
	}
	renamingId.value = null;
	refreshState();
}

function onCancelRename(): void {
	renamingId.value = null;
}

function onRenameKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter") {
		onConfirmRename();
	} else if (event.key === "Escape") {
		onCancelRename();
	}
}

function onDelete(id: string): void {
	if (!window.confirm("Delete this session? This cannot be undone.")) return;
	deleteSession(id);
	refreshState();
}

function onExport(): void {
	saveProgressFile();
}

function onLoadFile(): void {
	loadProgressFile().then(
		() => {
			refreshState();
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

		<section class="sessions">
			<div v-if="sessions.length === 0" class="cta">
				<button type="button" @click="onNewSession">Start Finding Meaning</button>
			</div>
			<template v-else>
				<h2>Your Sessions</h2>
				<div class="session-list">
					<div v-for="session in sessions" :key="session.id" class="session-item">
						<div class="session-info">
							<template v-if="renamingId === session.id">
								<input ref="renameInputEl" v-model="renameInput" type="text" class="rename-input" @keydown="onRenameKeydown" @blur="onConfirmRename" />
							</template>
							<template v-else>
								<a class="session-name" :href="phaseRoute(session.id, sessionPhases[session.id] ?? 'none')">{{ session.name }}</a>
							</template>
							<span class="session-date">
								Created {{ formatSessionDate(new Date(session.createdAt)) }}<template v-if="formatSessionDate(new Date(session.lastUpdatedAt)) !== formatSessionDate(new Date(session.createdAt))"> · Updated {{ formatSessionDate(new Date(session.lastUpdatedAt)) }}</template>
							</span>
						</div>
						<div class="session-actions">
							<button type="button" class="action-btn" @click="onStartRename(session)">Rename</button>
							<button type="button" class="action-btn delete-btn" @click="onDelete(session.id)">Delete</button>
						</div>
					</div>
				</div>
			</template>
		</section>

		<div class="file-actions">
			<button v-if="sessions.length > 0" type="button" class="file-btn" @click="onExport">Export all sessions</button>
			<button type="button" class="file-btn" @click="onLoadFile">Import sessions file</button>
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

.sessions {
	margin-bottom: 1rem;
}

.session-list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.session-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem 1rem;
	border: 1px solid #ddd;
	border-radius: 6px;
	gap: 0.75rem;
}

.session-info {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	min-width: 0;
	flex: 1;
}

.session-name {
	font-weight: 600;
	font-size: 0.95rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: #2a6e4e;
	text-decoration: none;
}

.session-name:hover {
	text-decoration: underline;
}

.session-date {
	font-size: 0.8rem;
	color: #888;
}

.rename-input {
	font-family: inherit;
	font-size: 0.95rem;
	font-weight: 600;
	padding: 0.15rem 0.35rem;
	border: 1px solid #2a6e4e;
	border-radius: 4px;
	outline: none;
	width: 100%;
	box-sizing: border-box;
}

.session-actions {
	display: flex;
	gap: 0.35rem;
	flex-shrink: 0;
}

.action-btn {
	background: none;
	border: 1px solid #ccc;
	border-radius: 4px;
	font-size: 0.78rem;
	padding: 0.25rem 0.5rem;
	cursor: pointer;
	font-family: inherit;
	color: #555;
	transition:
		border-color 0.15s ease,
		color 0.15s ease;
}

.action-btn:hover {
	border-color: #888;
	color: #1a1a1a;
}

.delete-btn:hover {
	border-color: #c0392b;
	color: #c0392b;
}

.new-session-btn {
	font-size: 0.9rem;
	padding: 0.5rem 1.25rem;
	border: 2px solid #2a6e4e;
	border-radius: 6px;
	background: none;
	color: #2a6e4e;
	cursor: pointer;
	font-family: inherit;
	font-weight: 600;
	transition:
		background 0.15s ease,
		color 0.15s ease;
}

.new-session-btn:hover {
	background: #2a6e4e;
	color: #fff;
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

.file-actions {
	text-align: center;
	display: flex;
	justify-content: center;
	gap: 1rem;
}

.file-btn {
	background: none;
	border: none;
	color: #999;
	font-size: 0.85rem;
	cursor: pointer;
	font-family: inherit;
	text-decoration: underline;
	padding: 0.25rem 0.5rem;
}

.file-btn:hover {
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
