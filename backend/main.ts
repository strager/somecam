import { createServer as createViteServer } from "vite";

import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? "3011");

async function main(): Promise<void> {
	const app = await createApp();

	const vite = await createViteServer({
		server: { middlewareMode: true },
		appType: "spa",
	});

	app.use(vite.middlewares);

	app.listen(port, () => {
		console.log(`SoMeCaM dev server listening at http://localhost:${port.toString()}`);
	});
}

main().catch((error: unknown) => {
	console.error("Failed to start SoMeCaM:", error);
	process.exitCode = 1;
});
