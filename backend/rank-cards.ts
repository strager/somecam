import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { type MeaningCard, MEANING_CARDS } from "../shared/meaning-cards.ts";
import { Ranking } from "../shared/ranking.ts";

async function main(): Promise<void> {
	const rl = readline.createInterface({ input: stdin, output: stdout });

	const cards = MEANING_CARDS.slice(0, 8);
	console.log("=== SoMeCaM Card Ranking ===");
	console.log(`Ranking ${String(cards.length)} cards to find your top 5.\n`);
	console.log("For each pair, type A or B to choose which resonates more.\n");

	const ranking = new Ranking<MeaningCard>(cards);

	while (!ranking.stopped) {
		const { a, b } = ranking.selectPair();

		// Randomize display order to control for position bias
		const showAFirst = Math.random() < 0.5;
		const left = showAFirst ? a : b;
		const right = showAFirst ? b : a;

		console.log(`--- Round ${String(ranking.round + 1)} ---`);
		console.log(`  A: [${left.source}] "${left.description}"`);
		console.log(`  B: [${right.source}] "${right.description}"`);

		let choice: MeaningCard | null = null;
		while (choice === null) {
			const answer = await rl.question("  Your choice (A/B): ");
			const normalized = answer.trim().toUpperCase();
			if (normalized === "A") {
				choice = left;
			} else if (normalized === "B") {
				choice = right;
			} else {
				console.log('  Please enter "A" or "B".');
			}
		}

		const winner = choice;
		const loser = winner === left ? right : left;
		const { stopReason } = ranking.recordComparison(winner, loser);

		// Show progress
		console.log(`  Comparisons so far: ${String(ranking.round)}`);
		console.log(`  Current top 5: ${ranking.topK.map((c: MeaningCard) => c.source).join(", ")}`);

		if (stopReason !== null) {
			console.log(`\n  Stopping: ${stopReason}`);
		}
		console.log();
	}

	console.log("=== Your Top 5 Sources of Meaning ===\n");
	ranking.topK.forEach((card: MeaningCard, i: number) => {
		console.log(`  ${String(i + 1)}. [${card.source}] "${card.description}"`);
	});
	console.log();

	rl.close();
}

main().catch((err: unknown) => {
	console.error(err);
	process.exitCode = 1;
});
