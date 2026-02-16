// Loads the Vue SSR entry point (frontend/pdf-entry.ts) and renders report
// HTML. In dev, uses Vite's ssrLoadModule() for HMR-friendly loading; in
// production, dynamically imports the pre-built SSR bundle.
//
// Also handles calling the DocRaptor API to convert rendered HTML into a PDF,
// loading/base64-encoding font files for embedding in the HTML document,
// and assembling report data from session exports.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CardReport, QuestionReport } from "../shared/report-types.ts";
import { EXPLORE_QUESTIONS } from "../shared/explore-questions.ts";
import { MEANING_CARDS } from "../shared/meaning-cards.ts";

interface PdfEntryModule {
	renderPdfHtml: (fontCss: string, componentCss: string, reports: CardReport[]) => Promise<string>;
}

const isProduction = process.env.NODE_ENV === "production";

let cachedModule: PdfEntryModule | undefined;
let cachedFontCss: string | undefined;

function isPdfEntryModule(mod: unknown): mod is PdfEntryModule {
	return typeof mod === "object" && mod !== null && "renderPdfHtml" in mod && typeof mod.renderPdfHtml === "function";
}

interface ModuleNode {
	url: string;
	importedModules: Set<ModuleNode>;
}

interface TransformResult {
	code: string;
}

interface ViteDevServer {
	ssrLoadModule: (url: string) => Promise<unknown>;
	transformRequest: (url: string) => Promise<TransformResult | null>;
	moduleGraph: {
		getModuleByUrl: (url: string) => Promise<ModuleNode | undefined>;
	};
}

function isViteDevServer(obj: unknown): obj is ViteDevServer {
	return typeof obj === "object" && obj !== null && "ssrLoadModule" in obj && typeof obj.ssrLoadModule === "function";
}

function assertPdfEntryModule(mod: unknown): PdfEntryModule {
	if (!isPdfEntryModule(mod)) {
		throw new Error("SSR module does not export a renderPdfHtml function.");
	}
	return mod;
}

async function collectSsrCss(vite: ViteDevServer, entryUrl: string): Promise<string> {
	const cssChunks: string[] = [];
	const visited = new Set<string>();

	async function traverse(mod: ModuleNode): Promise<void> {
		if (visited.has(mod.url)) return;
		visited.add(mod.url);

		if (mod.url.includes("type=style")) {
			const result = await vite.transformRequest(mod.url + "&inline");
			if (result !== null) {
				cssChunks.push(result.code);
			}
		}

		for (const dep of mod.importedModules) {
			await traverse(dep);
		}
	}

	const entryMod = await vite.moduleGraph.getModuleByUrl(entryUrl);
	if (entryMod !== undefined) {
		await traverse(entryMod);
	}
	return cssChunks.join("\n");
}

async function loadSsrModule(vite: unknown): Promise<{ module: PdfEntryModule; componentCss: string }> {
	if (isProduction) {
		if (cachedModule === undefined) {
			// @ts-expect-error Production build output does not exist at typecheck time.
			const mod: unknown = await import("../frontend/dist-ssr/pdf-entry.js");
			cachedModule = assertPdfEntryModule(mod);
		}
		// In production, scoped CSS is bundled into the SSR output.
		return { module: cachedModule, componentCss: "" };
	}

	if (!isViteDevServer(vite)) {
		throw new Error("Vite dev server is required for SSR in development mode.");
	}

	const entryUrl = "/pdf-entry.ts";
	const mod: unknown = await vite.ssrLoadModule(entryUrl);
	const componentCss = await collectSsrCss(vite, entryUrl);
	return { module: assertPdfEntryModule(mod), componentCss };
}

interface FontSpec {
	family: string;
	file: string;
	weight: number;
	style: string;
}

const FONT_SPECS: FontSpec[] = [
	{ family: "EB Garamond", file: "eb-garamond-400.woff2", weight: 400, style: "normal" },
	{ family: "EB Garamond", file: "eb-garamond-500.woff2", weight: 500, style: "normal" },
	{ family: "EB Garamond", file: "eb-garamond-600.woff2", weight: 600, style: "normal" },
	{ family: "EB Garamond", file: "eb-garamond-700.woff2", weight: 700, style: "normal" },
	{ family: "EB Garamond", file: "eb-garamond-400-italic.woff2", weight: 400, style: "italic" },
	{ family: "EB Garamond", file: "eb-garamond-500-italic.woff2", weight: 500, style: "italic" },
	{ family: "EB Garamond", file: "eb-garamond-600-italic.woff2", weight: 600, style: "italic" },
	{ family: "PT Serif", file: "pt-serif-400.woff2", weight: 400, style: "normal" },
	{ family: "PT Serif", file: "pt-serif-700.woff2", weight: 700, style: "normal" },
	{ family: "PT Serif", file: "pt-serif-400-italic.woff2", weight: 400, style: "italic" },
];

async function loadFontCss(): Promise<string> {
	if (cachedFontCss !== undefined) {
		return cachedFontCss;
	}

	const fontsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend/public/fonts");
	const declarations: string[] = [];

	for (const spec of FONT_SPECS) {
		const filePath = path.join(fontsDir, spec.file);
		const data = await fs.readFile(filePath);
		const base64 = data.toString("base64");
		declarations.push(`@font-face {\n` + `  font-family: "${spec.family}";\n` + `  font-style: ${spec.style};\n` + `  font-weight: ${spec.weight.toString()};\n` + `  src: url("data:font/woff2;base64,${base64}") format("woff2");\n` + `}`);
	}

	cachedFontCss = declarations.join("\n");
	return cachedFontCss;
}

// --- Session export parsing and report data assembly ---

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assembleReportData(sessionExportJson: string): CardReport[] {
	const parsed: unknown = JSON.parse(sessionExportJson);
	if (!isRecord(parsed) || parsed.version !== "somecam-v2" || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
		throw new Error("Invalid session export format.");
	}

	const session: unknown = parsed.sessions[0];
	if (!isRecord(session) || !isRecord(session.data)) {
		throw new Error("Invalid session data.");
	}
	const data = session.data;

	const chosenRaw: unknown = data.chosen;
	if (!Array.isArray(chosenRaw)) {
		throw new Error("Session has no chosen cards.");
	}
	const chosenIds = chosenRaw.filter((id): id is string => typeof id === "string");

	const exploreRaw: unknown = data.explore;
	const explore: Record<string, unknown[]> = {};
	if (isRecord(exploreRaw)) {
		for (const [cardId, entries] of Object.entries(exploreRaw)) {
			if (Array.isArray(entries)) {
				explore[cardId] = entries;
			}
		}
	}

	const summariesRaw: unknown = data.summaries;
	const summaries = new Map<string, { answer: string; summary: string }>();
	if (isRecord(summariesRaw)) {
		for (const [key, entry] of Object.entries(summariesRaw)) {
			if (isRecord(entry) && typeof entry.answer === "string" && typeof entry.summary === "string") {
				summaries.set(key, { answer: entry.answer, summary: entry.summary });
			}
		}
	}

	const freeformRaw: unknown = data.freeform;
	const freeform: Record<string, string> = {};
	if (isRecord(freeformRaw)) {
		for (const [cardId, note] of Object.entries(freeformRaw)) {
			if (typeof note === "string") {
				freeform[cardId] = note;
			}
		}
	}

	const cardsById = new Map(MEANING_CARDS.map((c) => [c.id, c]));
	const reports: CardReport[] = [];

	for (const cardId of chosenIds) {
		const card = cardsById.get(cardId);
		if (card === undefined) continue;

		const entries = explore[cardId] ?? [];
		const answersByQuestionId = new Map<string, string>();
		for (const entry of entries) {
			if (isRecord(entry) && typeof entry.questionId === "string" && typeof entry.userAnswer === "string") {
				answersByQuestionId.set(entry.questionId, entry.userAnswer);
			}
		}

		const questions: QuestionReport[] = [];
		for (const q of EXPLORE_QUESTIONS) {
			const answer = answersByQuestionId.get(q.id) ?? "";
			const cached = summaries.get(`${cardId}:${q.id}`);
			const summary = cached?.answer === answer ? cached.summary : "";

			questions.push({
				topic: q.topic,
				question: q.questionFirstPerson,
				answer,
				summary,
			});
		}

		const freeformNote = freeform[cardId] ?? "";
		const cachedFreeform = summaries.get(`${cardId}:freeform`);
		const freeformSummary = cachedFreeform?.answer === freeformNote ? cachedFreeform.summary : "";

		reports.push({ card, questions, freeformNote, freeformSummary });
	}

	return reports;
}

export async function renderReportHtml(vite: unknown, sessionExportJson: string): Promise<string> {
	const reports = assembleReportData(sessionExportJson);
	const { module: ssrModule, componentCss } = await loadSsrModule(vite);
	const fontCss = await loadFontCss();
	return ssrModule.renderPdfHtml(fontCss, componentCss, reports);
}

export async function callDocRaptor(html: string, apiKey: string, testMode: boolean): Promise<Buffer> {
	const body = JSON.stringify({
		type: "pdf",
		test: testMode,
		document_content: html,
		prince_options: { media: "print" },
	});

	const credentials = Buffer.from(`${apiKey}:`).toString("base64");
	const response = await fetch("https://api.docraptor.com/docs", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${credentials}`,
		},
		body,
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => "Unknown error");
		throw new Error(`DocRaptor returned ${response.status.toString()}: ${detail}`);
	}

	return Buffer.from(await response.arrayBuffer());
}
