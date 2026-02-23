// ============================================================
// Top-k Identification via Bayesian Bradley-Terry
// with Information-Gain Pair Selection — Pure Math Functions
// ============================================================
//
// This module contains the stateless mathematical functions used by
// the Ranking class. It is designed to be imported by the worker
// script without triggering circular dependencies.
// ============================================================

export type WinLoss = readonly [winner: number, loser: number];

export type RemainingEstimate = { low: number; mid: number; high: number } | null;

/** Create a xorshift32 PRNG returning values in (0, 1). */
export function makeXorshift(seed: number): () => number {
	let state = seed === 0 ? 1 : seed;
	return () => {
		state ^= state << 13;
		state ^= state >> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

/**
 * Evaluate all possible pairs and return the one whose comparison would
 * teach us the most about which items are in the top-k.
 *
 * Exhaustive search over all C(N,2) pairs using computeInformationGain.
 * Applies a recency discount to pairs containing items from the last
 * comparison to reduce repeated presentations of the same item.
 *
 * @param recencyDiscount - multiplier in (0, 1] applied to the information
 *   gain of pairs that include items from the most recent comparison.
 *   1.0 = no discount; 0.5 = halve the effective informativeness of
 *   recently-shown items. Default 1.0.
 * @returns [i, j] — the most informative pair of indices
 */
export function selectPair(mu: Float64Array, sigma: Float64Array, history: readonly WinLoss[], k: number, n: number, priorVariance: number, monteCarloSamples: number, rng: () => number, recencyDiscount = 1.0): [number, number] {
	let bestPair: [number, number] = [0, 1];
	let bestGain = -Infinity;

	// Extract the last pair from history for recency discounting
	const lastPair = history.length > 0 ? history[history.length - 1] : null;

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			let gain = computeInformationGain(i, j, mu, sigma, history, k, n, priorVariance, monteCarloSamples, rng);

			// Penalize pairs that include items from the last comparison.
			// Gain is negative (higher = better), so dividing by a value < 1
			// makes the gain more negative (worse), discouraging repeat items.
			if (lastPair !== null && recencyDiscount < 1) {
				if (i === lastPair[0] || i === lastPair[1]) {
					gain /= recencyDiscount;
				}
				if (j === lastPair[0] || j === lastPair[1]) {
					gain /= recencyDiscount;
				}
			}

			if (gain > bestGain) {
				bestGain = gain;
				bestPair = [i, j];
			}
		}
	}

	return bestPair;
}

/**
 * Compute the expected information gain about the top-k identity from
 * comparing items i vs j. Simulates both outcomes ("i wins" and "j wins"),
 * refits the model for each, computes the resulting top-k entropy, and
 * returns the negative expected posterior entropy (higher = more informative).
 *
 * Chaloner, K., & Verdinelli, I. (1995). "Bayesian Experimental Design:
 *   A Review." Statistical Science, 10(3), 273-304.
 *
 * MacKay, D. J. C. (1992). "Information-Based Objective Functions for Active
 *   Model Selection." Neural Computation, 4(4), 590-604.
 *
 * Pfeiffer, T., Gao, X. A., Chen, Y., Mao, A., & Rand, D. G. (2012).
 *   "Adaptive Polling for Information Aggregation." AAAI, 26(1).
 */
export function computeInformationGain(i: number, j: number, mu: Float64Array, sigma: Float64Array, history: readonly WinLoss[], k: number, n: number, priorVariance: number, monteCarloSamples: number, rng: () => number): number {
	const pIWins = sigmoid(mu[i] - mu[j]);
	const pJWins = 1 - pIWins;

	// Simulate outcome: i beats j
	const historyI: WinLoss[] = [...history, [i, j]];
	const refitI = bayesianRefit(historyI, n, priorVariance);
	const entropyIfIWins = topKEntropy(refitI.mu, refitI.sigma, k, monteCarloSamples, rng);

	// Simulate outcome: j beats i
	const historyJ: WinLoss[] = [...history, [j, i]];
	const refitJ = bayesianRefit(historyJ, n, priorVariance);
	const entropyIfJWins = topKEntropy(refitJ.mu, refitJ.sigma, k, monteCarloSamples, rng);

	const expectedPosteriorEntropy = pIWins * entropyIfIWins + pJWins * entropyIfJWins;

	return -expectedPosteriorEntropy; // higher is better (lower expected entropy)
}

/**
 * Stop when the weakest top-k item's lower confidence bound exceeds the
 * strongest non-top-k item's upper confidence bound.
 *
 * Kalyanakrishnan, S., Tewari, A., Auer, P., & Stone, P. (2012). "PAC
 *   Subset Selection in Stochastic Multi-Armed Bandits." ICML.
 *
 * Kaufmann, E., & Kalyanakrishnan, S. (2013). "Information Complexity in
 *   Bandit Subset Selection." COLT.
 *
 * @param mu - MAP strength estimates
 * @param sigma - marginal standard deviations
 * @param k - number of top items
 * @param z - confidence level (e.g. 1.96 for 95%)
 * @param confidenceThreshold - gap must exceed this value (default 0)
 */
export function checkConfidenceStop(mu: Float64Array, sigma: Float64Array, k: number, z: number, confidenceThreshold: number): boolean {
	const constraint = findBindingConstraint(mu, sigma, k, z);
	if (constraint === null) return true; // k >= n, all items in top-k
	return constraint.weakestLcb - constraint.strongestUcb > confidenceThreshold;
}

/**
 * Find the binding constraint for confidence-based stopping: the weakest
 * top-k item (lowest LCB) and the strongest non-top-k item (highest UCB).
 *
 * Returns null when k >= n (all items are in the top-k).
 */
function findBindingConstraint(mu: Float64Array, sigma: Float64Array, k: number, z: number): { weakestIdx: number; weakestLcb: number; strongestIdx: number; strongestUcb: number } | null {
	const sorted = argsortDescending(mu);
	const topK = sorted.slice(0, k);
	const rest = sorted.slice(k);

	if (rest.length === 0) return null;

	let weakestIdx = topK[0];
	let weakestLcb = mu[topK[0]] - z * sigma[topK[0]];
	for (const i of topK) {
		const lcb = mu[i] - z * sigma[i];
		if (lcb < weakestLcb) {
			weakestLcb = lcb;
			weakestIdx = i;
		}
	}

	let strongestIdx = rest[0];
	let strongestUcb = mu[rest[0]] + z * sigma[rest[0]];
	for (const j of rest) {
		const ucb = mu[j] + z * sigma[j];
		if (ucb > strongestUcb) {
			strongestUcb = ucb;
			strongestIdx = j;
		}
	}

	return { weakestIdx, weakestLcb, strongestIdx, strongestUcb };
}

/**
 * Check if the top-k set has been unchanged for stabilityWindow rounds.
 * Returns the new stable count and the current top-k set (as a sorted array
 * of indices).
 *
 * @param mu - MAP strength estimates
 * @param k - number of top items
 * @param previousTopK - previous top-k set (sorted array of indices), or null
 * @param stableCount - current consecutive stable round count
 * @param stabilityWindow - number of consecutive stable rounds to trigger stop
 */
export function checkStabilityStop(mu: Float64Array, k: number, previousTopK: readonly number[] | null, stableCount: number, stabilityWindow: number): { stopped: boolean; topK: number[]; stableCount: number } {
	const sorted = argsortDescending(mu);
	const currentTopK = sorted.slice(0, k).sort((a, b) => a - b);

	let same = false;
	if (previousTopK !== null && previousTopK.length === currentTopK.length) {
		same = true;
		for (let i = 0; i < currentTopK.length; i++) {
			if (currentTopK[i] !== previousTopK[i]) {
				same = false;
				break;
			}
		}
	}

	const newStableCount = same ? stableCount + 1 : 0;

	return {
		stopped: newStableCount >= stabilityWindow,
		topK: currentTopK,
		stableCount: newStableCount,
	};
}

/**
 * Estimate how many rounds remain until the stability stop triggers.
 *
 * Uses the empirical flip rate from a sliding window of recent rounds to
 * model the expected number of consecutive non-flip rounds needed. Produces
 * a confidence interval via a Beta posterior on the flip probability.
 *
 * @param flipHistory - boolean array: true = top-k set changed on that round
 * @param stableCount - current consecutive stable round count
 * @param stabilityWindow - number of consecutive stable rounds to trigger stop
 * @param maxRemaining - optional hard cap on remaining rounds
 */
export function estimateStabilityStop(flipHistory: readonly boolean[], stableCount: number, stabilityWindow: number, maxRemaining?: number): RemainingEstimate {
	const cappedMaxRemaining = maxRemaining !== undefined ? Math.max(0, maxRemaining) : undefined;
	if (cappedMaxRemaining !== undefined && cappedMaxRemaining === 0) {
		return { low: 0, mid: 0, high: 0 };
	}

	if (flipHistory.length < stabilityWindow) return null;

	const needed = stabilityWindow - stableCount;

	// Empirical flip rate from sliding window with Jeffreys prior
	const window = Math.min(15, flipHistory.length);
	let flips = 0;
	for (let i = flipHistory.length - window; i < flipHistory.length; i++) {
		if (flipHistory[i]) flips++;
	}
	const p = (flips + 0.5) / (window + 1);

	// Expected remaining rounds via Markov chain:
	// Need `needed` consecutive non-flip rounds.
	// E[rounds] = (1/q) * ((1/q)^needed - 1) / (1/q - 1) when p >= 0.01
	function expectedRounds(flipProb: number, need: number): number {
		if (need <= 0) return 0;
		const qq = 1 - flipProb;
		if (flipProb < 0.01) return need;
		const invQ = 1 / qq;
		return (invQ * (Math.pow(invQ, need) - 1)) / (invQ - 1);
	}

	const rawMid = expectedRounds(p, needed);

	// Confidence interval via normal approximation to Beta posterior
	const se = 0.675 * Math.sqrt((p * (1 - p)) / (window + 1));
	const pLow = Math.max(0, p - se);
	const pHigh = Math.min(0.99, p + se);

	// Higher flip prob → more remaining rounds
	const rawLow = expectedRounds(pLow, needed);
	const rawHigh = expectedRounds(pHigh, needed);

	const low = cappedMaxRemaining === undefined ? rawLow : Math.min(rawLow, cappedMaxRemaining);
	const mid = cappedMaxRemaining === undefined ? rawMid : Math.min(rawMid, cappedMaxRemaining);
	const high = cappedMaxRemaining === undefined ? rawHigh : Math.min(rawHigh, cappedMaxRemaining);

	// Hide unreliable estimates where the confidence interval is too wide
	if (high > 3 * low && high - low > stabilityWindow) return null;

	return { low, mid, high };
}

/**
 * Helper: return indices sorted by descending mu value.
 */
export function argsortDescending(mu: Float64Array): number[] {
	const indices: number[] = [];
	for (let i = 0; i < mu.length; i++) {
		indices.push(i);
	}
	indices.sort((a, b) => mu[b] - mu[a]);
	return indices;
}

/**
 * Estimate how uncertain we still are about which K items are the best.
 *
 * We draw many random samples of what the true scores *could* be (given our
 * uncertainty), figure out the top-k for each sample, and measure how much
 * disagreement there is. High entropy means we're still unsure. Low entropy
 * means the same set keeps winning.
 *
 * This is the quantity we're trying to minimize by picking informative pairs.
 *
 * @param mu - MAP strength estimates (length N)
 * @param sigma - marginal standard deviations (length N)
 * @param k - number of top items to identify
 * @param monteCarloSamples - number of MC samples (default 500)
 * @param rng - random number generator returning values in (0,1)
 */
export function topKEntropy(mu: Float64Array, sigma: Float64Array, k: number, monteCarloSamples: number, rng: () => number): number {
	const n = mu.length;
	const setCounts = new Map<string, number>();
	const sampled = new Float64Array(n);
	const indices = new Array<number>(n);

	for (let m = 0; m < monteCarloSamples; m++) {
		// Draw samples from Normal(mu[i], sigma[i])
		for (let i = 0; i < n; i++) {
			sampled[i] = mu[i] + sigma[i] * boxMuller(rng);
		}

		// Find top-k indices by sorting
		for (let i = 0; i < n; i++) {
			indices[i] = i;
		}
		indices.sort((a, b) => sampled[b] - sampled[a]);

		// Canonical key: sorted first k indices, comma-joined
		const topKIndices = indices.slice(0, k);
		topKIndices.sort((a, b) => a - b);
		const key = topKIndices.join(",");
		setCounts.set(key, (setCounts.get(key) ?? 0) + 1);
	}

	// Shannon entropy
	let entropy = 0;
	for (const count of setCounts.values()) {
		const p = count / monteCarloSamples;
		if (p > 0) {
			entropy -= p * Math.log(p);
		}
	}

	return entropy;
}

/**
 * Box-Muller transform: generate a standard normal sample from two uniform
 * random numbers in (0, 1).
 */
export function boxMuller(rng: () => number): number {
	const u1 = rng();
	const u2 = rng();
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Full Bayesian refit of all N strength parameters.
 *
 * Instead of just guessing a single score for each item, we track how *sure*
 * we are about each score. An item that's been compared ten times has a tight
 * range. An item compared once has a wide range. This function re-estimates
 * all scores and their uncertainties from scratch given the full history.
 *
 * Maximizes the log-posterior:
 *   log P(strengths | data) =
 *     sum_{(w,l) in history} log sigma(mu_w - mu_l)    [likelihood]
 *     - sum_i  mu_i^2 / (2 * priorVariance)            [Gaussian prior]
 *
 * Pins mu[0] = 0 for identifiability (Bradley-Terry strengths are only
 * defined up to a constant). Optimizes the remaining N-1 free parameters
 * with Newton's method, then extracts sigma from the inverse Hessian
 * (Laplace approximation).
 *
 * Caron, F., & Doucet, A. (2012). "Efficient Bayesian Inference for
 *   Generalized Bradley-Terry Models." JCGS, 21(1), 174-196.
 *
 * Herbrich, R., Minka, T., & Graepel, T. (2006). "TrueSkill: A Bayesian
 *   Skill Rating System." NeurIPS, 19.
 *
 * @param history - array of [winner, loser] index pairs
 * @param n - number of items
 * @param priorVariance - prior variance for each strength parameter
 * @returns mu (MAP estimates) and sigma (marginal standard deviations)
 */
export function bayesianRefit(history: readonly WinLoss[], n: number, priorVariance: number): { mu: Float64Array; sigma: Float64Array } {
	const mu = new Float64Array(n); // all zeros
	const sigma = new Float64Array(n);

	// Edge case: no data — return prior
	if (history.length === 0) {
		sigma.fill(Math.sqrt(priorVariance));
		return { mu, sigma };
	}

	// We pin mu[0] = 0 and optimize indices 1..n-1.
	// m = n-1 is the number of free parameters.
	const m = n - 1;

	// Working arrays for the free parameters (indices 1..n-1 of the full mu)
	const theta = new Float64Array(m); // initialized to 0

	const NEWTON_MAX_ITER = 50;
	const NEWTON_TOL = 1e-8;

	for (let iter = 0; iter < NEWTON_MAX_ITER; iter++) {
		// Build full mu from theta (mu[0]=0, mu[i]=theta[i-1] for i>=1)
		mu[0] = 0;
		for (let i = 0; i < m; i++) {
			mu[i + 1] = theta[i];
		}

		// Compute gradient and Hessian of the negative log-posterior
		// w.r.t. the free parameters theta[0..m-1].
		const grad = new Float64Array(m);
		const hess = new Float64Array(m * m);

		// Prior contribution: -mu_i^2 / (2*priorVariance)
		// Gradient of negative log-posterior from prior: mu_i / priorVariance
		// Hessian diagonal from prior: 1 / priorVariance
		for (let i = 0; i < m; i++) {
			grad[i] = theta[i] / priorVariance;
			hess[i * m + i] = 1.0 / priorVariance;
		}

		// Likelihood contribution from each comparison
		for (const [winner, loser] of history) {
			const diff = mu[winner] - mu[loser];
			const p = sigmoid(diff);
			// gradient of -log(sigma(diff)) w.r.t. mu_winner is -(1-p)
			// gradient of -log(sigma(diff)) w.r.t. mu_loser is p
			// Hessian contribution: p*(1-p) for second derivative

			const pq = p * (1 - p);

			// Map full indices to free parameter indices (skip index 0)
			const wi = winner - 1; // -1 if winner is item 0
			const li = loser - 1;

			if (wi >= 0) {
				grad[wi] -= 1 - p;
			}
			if (li >= 0) {
				grad[li] += 1 - p;
			}

			// Hessian contributions
			if (wi >= 0) {
				hess[wi * m + wi] += pq;
			}
			if (li >= 0) {
				hess[li * m + li] += pq;
			}
			if (wi >= 0 && li >= 0) {
				hess[wi * m + li] -= pq;
				hess[li * m + wi] -= pq;
			}
		}

		// Newton step: delta = H^{-1} * grad
		// We need to solve H * delta = grad
		const hessL = new Float64Array(hess);
		choleskyDecompose(hessL, m);

		const delta = new Float64Array(grad);
		choleskySolve(hessL, delta, m);

		// Update: theta -= delta (we minimized neg log-posterior)
		let maxDelta = 0;
		for (let i = 0; i < m; i++) {
			theta[i] -= delta[i];
			maxDelta = Math.max(maxDelta, Math.abs(delta[i]));
		}

		if (maxDelta < NEWTON_TOL) {
			break;
		}
	}

	// Final mu
	mu[0] = 0;
	for (let i = 0; i < m; i++) {
		mu[i + 1] = theta[i];
	}

	// Compute sigma from inverse Hessian at the converged point
	// Rebuild Hessian at final theta
	const finalHess = new Float64Array(m * m);
	for (let i = 0; i < m; i++) {
		finalHess[i * m + i] = 1.0 / priorVariance;
	}
	for (const [winner, loser] of history) {
		const diff = mu[winner] - mu[loser];
		const p = sigmoid(diff);
		const pq = p * (1 - p);
		const wi = winner - 1;
		const li = loser - 1;
		if (wi >= 0) {
			finalHess[wi * m + wi] += pq;
		}
		if (li >= 0) {
			finalHess[li * m + li] += pq;
		}
		if (wi >= 0 && li >= 0) {
			finalHess[wi * m + li] -= pq;
			finalHess[li * m + wi] -= pq;
		}
	}

	choleskyDecompose(finalHess, m);
	const inv = choleskyInverse(finalHess, m);

	// sigma[0] for the pinned parameter: derive from the prior (it's pinned,
	// but for downstream use we report the prior uncertainty since it has no
	// data-driven update via the free parameters)
	sigma[0] = 0; // pinned, no uncertainty
	for (let i = 0; i < m; i++) {
		const variance = inv[i * m + i];
		sigma[i + 1] = Math.sqrt(Math.max(0, variance));
	}

	return { mu, sigma };
}

/**
 * The Bradley-Terry-Luce preference model.
 *
 * Every item has a hidden strength score. When you compare two items, the one
 * with the higher score is more likely to win — but not guaranteed, because
 * humans are noisy. This function turns the difference in scores into a
 * probability of winning.
 *
 * Bradley, R. A., & Terry, M. E. (1952). "Rank Analysis of Incomplete Block
 *   Designs: I. The Method of Paired Comparisons." Biometrika, 39(3/4),
 *   324–345.
 *
 * Luce, R. D. (1959). Individual Choice Behavior: A Theoretical Analysis.
 *   Wiley.
 */
export function sigmoid(x: number): number {
	return 1.0 / (1.0 + Math.exp(-x));
}

// ---- Linear algebra helpers (Cholesky) ----
// These operate on dense symmetric positive-definite matrices stored as
// Float64Array in row-major order. They are exported for testing but are
// internal implementation details of bayesianRefit.

/**
 * In-place Cholesky decomposition: A = L * L^T.
 * Overwrites the lower triangle of `a` with L. The upper triangle is not
 * zeroed out (callers must only read the lower triangle).
 *
 * @param a - n×n symmetric positive-definite matrix (row-major Float64Array)
 * @param n - dimension
 */
export function choleskyDecompose(a: Float64Array, n: number): void {
	for (let j = 0; j < n; j++) {
		let sum = 0;
		for (let k = 0; k < j; k++) {
			sum += a[j * n + k] * a[j * n + k];
		}
		const diag = a[j * n + j] - sum;
		if (diag <= 0) {
			throw new Error("Matrix is not positive definite");
		}
		a[j * n + j] = Math.sqrt(diag);

		for (let i = j + 1; i < n; i++) {
			let s = 0;
			for (let k = 0; k < j; k++) {
				s += a[i * n + k] * a[j * n + k];
			}
			a[i * n + j] = (a[i * n + j] - s) / a[j * n + j];
		}
	}
}

/**
 * Solve L * L^T * x = b given Cholesky factor L.
 * Forward substitution (L * y = b) then back substitution (L^T * x = y).
 *
 * @param l - n×n lower-triangular Cholesky factor (row-major)
 * @param b - right-hand side vector (overwritten with solution)
 * @param n - dimension
 */
export function choleskySolve(l: Float64Array, b: Float64Array, n: number): void {
	// Forward substitution: L * y = b
	for (let i = 0; i < n; i++) {
		let sum = 0;
		for (let j = 0; j < i; j++) {
			sum += l[i * n + j] * b[j];
		}
		b[i] = (b[i] - sum) / l[i * n + i];
	}

	// Back substitution: L^T * x = y
	for (let i = n - 1; i >= 0; i--) {
		let sum = 0;
		for (let j = i + 1; j < n; j++) {
			sum += l[j * n + i] * b[j];
		}
		b[i] = (b[i] - sum) / l[i * n + i];
	}
}

/**
 * Compute the full inverse of A given its Cholesky factor L, where A = L*L^T.
 * Returns a new Float64Array containing the n×n inverse matrix.
 *
 * @param l - n×n lower-triangular Cholesky factor (row-major)
 * @param n - dimension
 * @returns n×n inverse matrix (row-major Float64Array)
 */
export function choleskyInverse(l: Float64Array, n: number): Float64Array {
	const inv = new Float64Array(n * n);
	const col = new Float64Array(n);

	for (let j = 0; j < n; j++) {
		// Solve L * L^T * x = e_j
		col.fill(0);
		col[j] = 1;
		choleskySolve(l, col, n);
		for (let i = 0; i < n; i++) {
			inv[i * n + j] = col[i];
		}
	}

	return inv;
}
