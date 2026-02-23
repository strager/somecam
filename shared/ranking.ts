// ============================================================
// Top-k Identification via Bayesian Bradley-Terry
// with Information-Gain Pair Selection
// ============================================================
//
// Identifies the top K items from N items through pairwise comparisons.
// Uses a Bayesian Bradley-Terry model for strength estimation, a Laplace
// approximation for uncertainty quantification, and information-gain pair
// selection to minimize the number of comparisons needed.
//
// Components:
//   - Bradley-Terry model (sigmoid): P(i beats j) = σ(μ_i - μ_j)
//   - Bayesian inference (bayesianRefit): MAP via Newton's method + Laplace
//   - Active learning (computeInformationGain, selectPair): pick the most
//     informative pair to compare next
//   - Stopping rules: confidence separation, stability, hard cap
//
// References:
//   Bradley & Terry (1952), Luce (1959), Caron & Doucet (2012),
//   Herbrich et al. (2006/TrueSkill), Chaloner & Verdinelli (1995),
//   MacKay (1992), Pfeiffer et al. (2012), Kalyanakrishnan et al. (2012),
//   Kaufmann & Kalyanakrishnan (2013)
// ============================================================

import type { RemainingEstimate, WinLoss } from "./ranking-math.ts";
import { checkConfidenceStop, checkStabilityStop, estimateStabilityStop } from "./ranking-math.ts";
import type { BayesianRefitRequest, BayesianRefitResponse, SelectPairRequest, SelectPairResponse, WorkerRequest, WorkerResponse } from "./ranking-worker-protocol.ts";

// Re-export all pure math functions so existing imports from ranking.ts keep working.
export { argsortDescending, bayesianRefit, boxMuller, checkConfidenceStop, checkStabilityStop, choleskyDecompose, choleskyInverse, choleskySolve, computeInformationGain, estimateStabilityStop, makeXorshift, selectPair, sigmoid, topKEntropy } from "./ranking-math.ts";
export type { RemainingEstimate, WinLoss } from "./ranking-math.ts";

export interface RankingConfig {
	/** Number of top items to identify. */
	k: number;
	/** Z-score for confidence-based stopping (e.g. 1.96 for 95%). */
	z: number;
	/** Number of consecutive stable rounds before stopping. */
	stabilityWindow: number;
	/** Hard cap on total pairwise comparisons. */
	maxComparisons: number;
	/** Prior variance for each strength parameter. */
	priorVariance: number;
	/** Gap the confidence intervals must exceed to trigger early stop. */
	confidenceThreshold: number;
	/** Number of Monte Carlo samples for top-k entropy estimation. */
	monteCarloSamples: number;
	/** Penalize pairs that include items from the last comparison.
	 * Value in (0, 1]: 1.0 = no penalty, lower = stronger penalty. */
	recencyDiscount: number;
	/** Seed for the internal xorshift PRNG. */
	seed: number;
	/** Disable the worker-side bayesianRefit cache (useful for benchmarks). */
	noWorkerCache: boolean;
}

export type StopReason = "confidence" | "stability" | "max-comparisons";

export interface ComparisonRecord<T> {
	winner: T;
	loser: T;
}

const DEFAULT_CONFIG: RankingConfig = {
	k: 5,
	z: 1.96,
	stabilityWindow: 10,
	maxComparisons: 80,
	priorVariance: 1.0,
	confidenceThreshold: 0.0,
	monteCarloSamples: 500,
	recencyDiscount: 0.5,
	seed: 0,
	noWorkerCache: false,
};

/**
 * Bayesian Bradley-Terry ranking algorithm.
 *
 * Identifies the top K items from N items through iterative pairwise
 * comparisons. Callers pass in their items (strings, objects, etc.) and
 * interact using those item values. Internally, items are mapped to numeric
 * indices for the math.
 *
 * Heavy math (selectPair, bayesianRefit) is offloaded to a Web Worker
 * (browser) or worker_threads (Node). The methods `selectPair()`,
 * `recordComparison()`, and `undoLastComparison()` are async.
 *
 * Usage:
 *   const ranking = new Ranking(items);
 *   while (!ranking.stopped) {
 *     const { a, b } = await ranking.selectPair();
 *     // show a and b to user, get their choice
 *     await ranking.recordComparison(winner, loser);
 *   }
 *   console.log(ranking.topK);
 */
export class Ranking<T> {
	private readonly _items: readonly T[];
	private readonly _config: RankingConfig;
	private readonly _n: number;
	private _mu: Float64Array;
	private _sigma: Float64Array;
	private _history: WinLoss[];
	private _comparisonRecords: ComparisonRecord<T>[];
	private _flipHistory: boolean[];
	private _round: number;
	private _stopped: boolean;
	private _stopReason: StopReason | null;
	private _previousTopK: number[] | null;
	private _stableCount: number;

	constructor(items: readonly T[], config?: Partial<RankingConfig>) {
		this._items = items;
		this._config = { ...DEFAULT_CONFIG, ...config };
		this._n = items.length;
		this._mu = new Float64Array(this._n);
		this._sigma = new Float64Array(this._n).fill(Math.sqrt(this._config.priorVariance));
		this._history = [];
		this._comparisonRecords = [];
		this._flipHistory = [];
		this._round = 0;
		this._stopped = false;
		this._stopReason = null;
		this._previousTopK = null;
		this._stableCount = 0;
	}

	private _indexOf(item: T): number {
		const idx = this._items.indexOf(item);
		if (idx === -1) {
			throw new Error("Item not found in ranking");
		}
		return idx;
	}

	async selectPair(): Promise<{ a: T; b: T }> {
		if (this._stopped) {
			throw new Error("Ranking has already stopped");
		}
		await ensureWorker();
		const id = nextRequestId++;
		// Derive a unique seed per call using a simple integer hash (MurmurHash3-style mix)
		// so successive calls don't get correlated seeds.
		const callSeed = hashMix(this._config.seed, this._history.length);
		const response = await postToWorker({
			type: "selectPair",
			id,
			mu: this._mu,
			sigma: this._sigma,
			history: this._history,
			k: this._config.k,
			n: this._n,
			priorVariance: this._config.priorVariance,
			monteCarloSamples: this._config.monteCarloSamples,
			recencyDiscount: this._config.recencyDiscount,
			seed: callSeed,
			noCache: this._config.noWorkerCache,
		});
		const [i, j] = response.pair;
		return { a: this._items[i], b: this._items[j] };
	}

	async recordComparison(winner: T, loser: T): Promise<{ stopped: boolean; stopReason: StopReason | null }> {
		if (this._stopped) {
			throw new Error("Ranking has already stopped");
		}

		const wi = this._indexOf(winner);
		const li = this._indexOf(loser);

		this._history.push([wi, li]);
		this._comparisonRecords.push({ winner, loser });
		this._round++;

		// Refit model on worker
		await ensureWorker();
		const id = nextRequestId++;
		const response = await postToWorker({
			type: "bayesianRefit",
			id,
			history: this._history,
			n: this._n,
			priorVariance: this._config.priorVariance,
			noCache: this._config.noWorkerCache,
		});

		this._mu = response.mu instanceof Float64Array ? response.mu : new Float64Array(response.mu);
		this._sigma = response.sigma instanceof Float64Array ? response.sigma : new Float64Array(response.sigma);

		// Check stopping conditions (cheap, stays on main thread)

		// Confidence-based stop
		if (checkConfidenceStop(this._mu, this._sigma, this._config.k, this._config.z, this._config.confidenceThreshold)) {
			this._stopped = true;
			this._stopReason = "confidence";
			return { stopped: true, stopReason: "confidence" };
		}

		// Stability stop
		const stability = checkStabilityStop(this._mu, this._config.k, this._previousTopK, this._stableCount, this._config.stabilityWindow);
		if (this._previousTopK !== null) {
			this._flipHistory.push(stability.stableCount === 0);
		}
		this._previousTopK = stability.topK;
		this._stableCount = stability.stableCount;
		if (stability.stopped) {
			this._stopped = true;
			this._stopReason = "stability";
			return { stopped: true, stopReason: "stability" };
		}

		// Hard cap
		if (this._round >= this._config.maxComparisons) {
			this._stopped = true;
			this._stopReason = "max-comparisons";
			return { stopped: true, stopReason: "max-comparisons" };
		}

		return { stopped: false, stopReason: null };
	}

	async undoLastComparison(): Promise<ComparisonRecord<T>> {
		if (this._history.length === 0) {
			throw new Error("No comparison to undo");
		}

		this._stopped = false;
		this._stopReason = null;

		this._history.pop();
		this._flipHistory.pop();
		const record = this._comparisonRecords.pop();
		if (record === undefined) {
			throw new Error("No comparison to undo");
		}
		this._round--;

		// Refit model on worker
		await ensureWorker();
		const id = nextRequestId++;
		const response = await postToWorker({
			type: "bayesianRefit",
			id,
			history: this._history,
			n: this._n,
			priorVariance: this._config.priorVariance,
			noCache: this._config.noWorkerCache,
		});

		this._mu = response.mu instanceof Float64Array ? response.mu : new Float64Array(response.mu);
		this._sigma = response.sigma instanceof Float64Array ? response.sigma : new Float64Array(response.sigma);

		this._previousTopK = null;
		this._stableCount = 0;

		return record;
	}

	get topK(): readonly T[] {
		const indices: number[] = [];
		for (let i = 0; i < this._n; i++) {
			indices.push(i);
		}
		indices.sort((a, b) => this._mu[b] - this._mu[a]);
		return indices.slice(0, this._config.k).map((i) => this._items[i]);
	}

	get round(): number {
		return this._round;
	}

	get stopped(): boolean {
		return this._stopped;
	}

	get stopReason(): StopReason | null {
		return this._stopReason;
	}

	get mu(): readonly number[] {
		return Array.from(this._mu);
	}

	get sigma(): readonly number[] {
		return Array.from(this._sigma);
	}

	get history(): readonly ComparisonRecord<T>[] {
		return this._comparisonRecords;
	}

	clone(): Ranking<T> {
		const copy = new Ranking(this._items, this._config);
		copy._mu = this._mu.slice();
		copy._sigma = this._sigma.slice();
		copy._history = [...this._history];
		copy._comparisonRecords = [...this._comparisonRecords];
		copy._flipHistory = [...this._flipHistory];
		copy._round = this._round;
		copy._stopped = this._stopped;
		copy._stopReason = this._stopReason;
		copy._previousTopK = this._previousTopK !== null ? [...this._previousTopK] : null;
		copy._stableCount = this._stableCount;
		return copy;
	}

	estimateRemaining(): RemainingEstimate {
		const maxRemaining = Math.max(0, this._config.maxComparisons - this._round);
		return estimateStabilityStop(this._flipHistory, this._stableCount, this._config.stabilityWindow, maxRemaining);
	}
}

// ---- Global worker singleton ----

interface PendingRequest {
	resolve: (response: WorkerResponse) => void;
}

const pendingRequests = new Map<number, PendingRequest>();
let globalWorkerReady: Promise<void> | null = null;

function ensureWorker(): Promise<void> {
	if (globalWorkerReady !== null) return globalWorkerReady;
	globalWorkerReady = initWorker();
	return globalWorkerReady;
}

function handleWorkerResponse(data: WorkerResponse): void {
	const pending = pendingRequests.get(data.id);
	if (pending !== undefined) {
		pendingRequests.delete(data.id);
		pending.resolve(data);
	}
}

let workerPostMessage: (msg: WorkerRequest) => void = () => {
	throw new Error("Worker not initialized");
};

async function initWorker(): Promise<void> {
	if ("Worker" in globalThis) {
		// Browser: use standard Web Worker
		const workerUrl = new URL("./ranking.worker.ts", import.meta.url);
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- globalThis.Worker not typed without DOM lib
		const w = new (globalThis as unknown as { Worker: new (url: URL, opts: { type: string }) => { postMessage(msg: WorkerRequest): void; addEventListener(event: string, handler: (event: { data: WorkerResponse }) => void): void } }).Worker(workerUrl, { type: "module" });
		w.addEventListener("message", (event) => {
			handleWorkerResponse(event.data);
		});
		workerPostMessage = (msg) => {
			w.postMessage(msg);
		};
		return;
	}

	// Node: use worker_threads
	const { Worker } = await import("node:worker_threads");
	const workerPath = new URL("./ranking.worker.ts", import.meta.url);
	const w = new Worker(workerPath);
	w.on("message", (data: WorkerResponse) => {
		handleWorkerResponse(data);
	});
	workerPostMessage = (msg) => {
		w.postMessage(msg);
	};
}

/** Mix two integers into a well-distributed 32-bit seed (MurmurHash3-style finalizer). */
function hashMix(a: number, b: number): number {
	let h = (a ^ b) | 0;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h = h ^ (h >>> 16);
	return h >>> 0;
}

let nextRequestId = 0;

function postToWorker(request: SelectPairRequest): Promise<SelectPairResponse>;
function postToWorker(request: BayesianRefitRequest): Promise<BayesianRefitResponse>;
function postToWorker(request: WorkerRequest): Promise<WorkerResponse> {
	return new Promise((resolve) => {
		pendingRequests.set(request.id, { resolve });
		workerPostMessage(request);
	});
}
