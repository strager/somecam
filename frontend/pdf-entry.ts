// SSR entry point for server-side PDF rendering. In dev, loaded via
// vite.ssrLoadModule(); in production, imported from the SSR build output
// (dist-ssr/). Exports renderPdfHtml() which returns a complete HTML document
// with inlined CSS and base64-encoded fonts.

import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";

import ReportContent from "./ReportContent.vue";
import type { CardReport } from "./report-types.ts";
import pdfReportCss from "./pdf-report.css?inline";

const hardcodedTestData: CardReport[] = [
	{
		card: { id: "test-1", source: "Self-knowledge", description: "To understand myself and my behavior is important for me" },
		questions: [
			{ topic: "Interpretation", question: "What did I have in mind when I chose this?", answer: "I want to understand why I react to things the way I do.", summary: "Understanding personal reactions" },
			{ topic: "Significance", question: "Why is this of importance for me?", answer: "Knowing myself helps me make better decisions.", summary: "Better decision-making" },
			{ topic: "Importance", question: "How important is this for me?", answer: "", summary: "" },
		],
		freeformNote: "Self-reflection has always been a big part of my life.",
		freeformSummary: "Lifelong self-reflection practice",
	},
	{
		card: { id: "test-2", source: "Creativity", description: "I need to be creative in some way" },
		questions: [
			{ topic: "Interpretation", question: "What did I have in mind when I chose this?", answer: "Building things from scratch gives me energy.", summary: "Energized by building" },
			{ topic: "Significance", question: "Why is this of importance for me?", answer: "", summary: "" },
			{ topic: "Importance", question: "How important is this for me?", answer: "", summary: "" },
		],
		freeformNote: "",
		freeformSummary: "",
	},
];

export async function renderPdfHtml(fontCss: string): Promise<string> {
	const reports = hardcodedTestData;
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
