<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import type { ProgressPhase, SessionMeta } from "./store.ts";
import { createSession, deleteSession, detectSessionPhase, ensureSessionsInitialized, formatSessionDate, listSessions, loadProgressFile, renameSession, saveProgressFile } from "./store.ts";

const router = useRouter();

const sessions = ref<SessionMeta[]>([]);
const sessionPhases = ref<Record<string, ProgressPhase>>({});
const renamingId = ref<string | null>(null);
const renameInput = ref("");
const renameInputEl = ref<HTMLInputElement[]>([]);

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

function phaseRoute(sessionId: string, p: ProgressPhase): RouteLocationRaw {
	switch (p) {
		case "explore":
			return { name: "explore", params: { sessionId } };
		case "prioritize-complete":
		case "prioritize":
			return { name: "findMeaningPrioritize", params: { sessionId } };
		case "swipe":
		case "none":
			return { name: "findMeaning", params: { sessionId } };
	}
}

function onNewSession(): void {
	const newId = createSession();
	refreshState();
	void router.push({ name: "findMeaning", params: { sessionId: newId } });
}

function onStartRename(session: SessionMeta): void {
	renamingId.value = session.id;
	renameInput.value = session.name;
	void nextTick(() => {
		const el = renameInputEl.value[0];
		el.focus();
		el.select();
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
								<router-link class="session-name" :to="phaseRoute(session.id, sessionPhases[session.id] ?? 'none')">{{ session.name }}</router-link>
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
			<a class="github-link" href="https://github.com/strager/somecam" target="_blank" rel="noopener" aria-label="View source on GitHub">
				<!-- GitHub mark icon from Primer Octicons (mark-github-24)
					 https://github.com/primer/octicons/blob/main/icons/mark-github-24.svg -->
				<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.303 16.652c-2.837-.344-4.835-2.385-4.835-5.028 0-1.074.387-2.235 1.031-3.008-.279-.709-.236-2.214.086-2.837.86-.107 2.02.344 2.708.967.816-.258 1.676-.386 2.728-.386 1.053 0 1.913.128 2.686.365.666-.602 1.848-1.053 2.708-.946.3.581.344 2.085.064 2.815.688.817 1.053 1.913 1.053 3.03 0 2.643-1.998 4.641-4.877 5.006.73.473 1.224 1.504 1.224 2.686v2.235c0 .644.537 1.01 1.182.752 3.889-1.483 6.94-5.372 6.94-10.185 0-6.081-4.942-11.044-11.022-11.044-6.081 0-10.98 4.963-10.98 11.044a10.84 10.84 0 0 0 7.112 10.206c.58.215 1.139-.172 1.139-.752v-1.719a2.768 2.768 0 0 1-1.032.215c-1.418 0-2.256-.773-2.857-2.213-.237-.58-.495-.924-.989-.988-.258-.022-.344-.129-.344-.258 0-.258.43-.451.86-.451.623 0 1.16.386 1.719 1.181.43.623.881.903 1.418.903.537 0 .881-.194 1.375-.688.365-.365.645-.687.903-.902Z" fill="currentColor" /></svg>
			</a>
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

.github-link {
	display: block;
	margin-top: 1rem;
	text-align: center;
	color: #666;
	transition: color 0.15s ease;
}

.github-link:hover {
	color: #1a1a1a;
}
</style>
