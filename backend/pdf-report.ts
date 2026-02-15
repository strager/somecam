// Loads the Vue SSR entry point (frontend/pdf-entry.ts) and renders report
// HTML. In dev, uses Vite's ssrLoadModule() for HMR-friendly loading; in
// production, dynamically imports the pre-built SSR bundle.

interface PdfEntryModule {
	renderPdfHtml: () => Promise<string>;
}

const isProduction = process.env.NODE_ENV === "production";

let cachedModule: PdfEntryModule | undefined;

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

export async function renderReportHtml(vite: unknown): Promise<string> {
	const ssrModule = await loadSsrModule(vite);
	return ssrModule.renderPdfHtml();
}
