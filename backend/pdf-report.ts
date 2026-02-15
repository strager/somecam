// Loads the Vue SSR entry point (frontend/pdf-entry.ts) and renders report
// HTML. In dev, uses Vite's ssrLoadModule() for HMR-friendly loading; in
// production, dynamically imports the pre-built SSR bundle.
//
// Also handles calling the DocRaptor API to convert rendered HTML into a PDF,
// and loading/base64-encoding font files for embedding in the HTML document.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PdfEntryModule {
	renderPdfHtml: (fontCss: string) => Promise<string>;
}

const isProduction = process.env.NODE_ENV === "production";

let cachedModule: PdfEntryModule | undefined;
let cachedFontCss: string | undefined;

function isPdfEntryModule(mod: unknown): mod is PdfEntryModule {
	return typeof mod === "object" && mod !== null && "renderPdfHtml" in mod && typeof mod.renderPdfHtml === "function";
}

function isViteDevServer(obj: unknown): obj is { ssrLoadModule: (url: string) => Promise<unknown> } {
	return typeof obj === "object" && obj !== null && "ssrLoadModule" in obj && typeof obj.ssrLoadModule === "function";
}

function assertPdfEntryModule(mod: unknown): PdfEntryModule {
	if (!isPdfEntryModule(mod)) {
		throw new Error("SSR module does not export a renderPdfHtml function.");
	}
	return mod;
}

async function loadSsrModule(vite: unknown): Promise<PdfEntryModule> {
	if (isProduction) {
		if (cachedModule === undefined) {
			// @ts-expect-error Production build output does not exist at typecheck time.
			const mod: unknown = await import("../frontend/dist-ssr/pdf-entry.js");
			cachedModule = assertPdfEntryModule(mod);
		}
		return cachedModule;
	}

	if (!isViteDevServer(vite)) {
		throw new Error("Vite dev server is required for SSR in development mode.");
	}

	const mod: unknown = await vite.ssrLoadModule("/pdf-entry.ts");
	return assertPdfEntryModule(mod);
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

export async function renderReportHtml(vite: unknown): Promise<string> {
	const ssrModule = await loadSsrModule(vite);
	const fontCss = await loadFontCss();
	return ssrModule.renderPdfHtml(fontCss);
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
