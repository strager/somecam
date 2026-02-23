import { bench, describe } from "vitest";

import { makeXorshift, Ranking } from "./ranking.ts";

/**
 * Advance a ranking using a noisy oracle. The stronger item wins most of
 * the time, but occasionally the weaker item wins. This prevents the
 * algorithm from converging too quickly, letting us reach late-game states
 * with production config.
 */
async function advanceRanking(ranking: Ranking<number>, rounds: number, rng: () => number): Promise<void> {
	for (let i = 0; i < rounds && !ranking.stopped; i++) {
		const { a, b } = await ranking.selectPair();
		const stronger = a > b ? a : b;
		const weaker = a > b ? b : a;
		// ~20% chance the weaker item wins
		const upset = rng() < 0.2;
		const winner = upset ? weaker : stronger;
		const loser = upset ? stronger : weaker;
		await ranking.recordComparison(winner, loser);
	}
}

// Build snapshots at early, mid, and late game states from a single run.
// Each bench iteration clones the snapshot and runs one step, so the
// timing reflects exactly one selectPair + recordComparison at that state.

const items = Array.from({ length: 26 }, (_, i) => i);
const oracleRng = makeXorshift(99);
const ranking = new Ranking(items, {
	k: 5,
	seed: 42,
	noWorkerCache: true,
	noSpeculation: true,
});

await advanceRanking(ranking, 20, oracleRng);
const mid = ranking.clone();

describe("Ranking single step (26 items, k=5)", () => {
	bench(`mid game (round ${mid.round.toString()})`, async () => {
		const r = mid.clone();
		const { a, b } = await r.selectPair();
		await r.recordComparison(a > b ? a : b, a > b ? b : a);
	});
});
