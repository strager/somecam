import { bench, describe } from "vitest";

import { Ranking } from "./ranking.ts";

/** Seeded xorshift32 PRNG returning values in (0, 1). */
function makeRng(seed: number): () => number {
	let state = seed;
	return () => {
		state ^= state << 13;
		state ^= state >> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

/**
 * Advance a ranking using a noisy oracle. The stronger item wins most of
 * the time, but occasionally the weaker item wins. This prevents the
 * algorithm from converging too quickly, letting us reach late-game states
 * with production config.
 */
function advanceRanking(ranking: Ranking<number>, rounds: number, rng: () => number): void {
	for (let i = 0; i < rounds && !ranking.stopped; i++) {
		const { a, b } = ranking.selectPair();
		const stronger = a > b ? a : b;
		const weaker = a > b ? b : a;
		// ~20% chance the weaker item wins
		const upset = rng() < 0.2;
		const winner = upset ? weaker : stronger;
		const loser = upset ? stronger : weaker;
		ranking.recordComparison(winner, loser);
	}
}

// Build snapshots at early, mid, and late game states from a single run.
// Each bench iteration clones the snapshot and runs one step, so the
// timing reflects exactly one selectPair + recordComparison at that state.

const items = Array.from({ length: 26 }, (_, i) => i);
const oracleRng = makeRng(99);
const ranking = new Ranking(items, {
	k: 5,
	rng: makeRng(42),
});

advanceRanking(ranking, 5, oracleRng);
const early = ranking.clone();

advanceRanking(ranking, 15, oracleRng);
const mid = ranking.clone();

advanceRanking(ranking, 30, oracleRng);
const late = ranking.clone();

describe("Ranking single step (26 items, k=5)", () => {
	bench(`early game (round ${early.round.toString()})`, () => {
		const r = early.clone();
		const { a, b } = r.selectPair();
		r.recordComparison(a > b ? a : b, a > b ? b : a);
	});

	bench(`mid game (round ${mid.round.toString()})`, () => {
		const r = mid.clone();
		const { a, b } = r.selectPair();
		r.recordComparison(a > b ? a : b, a > b ? b : a);
	});

	bench(`late game (round ${late.round.toString()})`, () => {
		const r = late.clone();
		const { a, b } = r.selectPair();
		r.recordComparison(a > b ? a : b, a > b ? b : a);
	});
});
