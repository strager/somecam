// SSR entry point for server-side PDF rendering. In dev, loaded via
// vite.ssrLoadModule(); in production, imported from the SSR build output
// (dist-ssr/). Exports renderPdfHtml() which returns a complete HTML document
// with inlined CSS and base64-encoded fonts.

import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";

import ReportContent from "./ReportContent.vue";
import type { CardReport } from "../shared/report-types.ts";
import pdfReportCss from "./pdf-report.css?inline";

export async function renderPdfHtml(fontCss: string, reports: CardReport[]): Promise<string> {
	const app = createSSRApp(ReportContent, { reports });
	const html = await renderToString(app);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SoMeCaM Report</title>
<style>
${fontCss}
${pdfReportCss}
</style>
</head>
<body>
${html}
</body>
</html>`;
}
