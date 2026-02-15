// SSR entry point for server-side PDF rendering. In dev, loaded via
// vite.ssrLoadModule(); in production, imported from the SSR build output
// (dist-ssr/). Exports renderPdfHtml() which returns a complete HTML document.

import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";

import PdfTest from "./PdfTest.vue";

export async function renderPdfHtml(): Promise<string> {
	const app = createSSRApp(PdfTest, { title: "PDF generation is working." });

	const html = await renderToString(app);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SoMeCaM Report</title>
</head>
<body>
${html}
</body>
</html>`;
}
