/**
 * Sentence-length rhythm: the bands behind the heat strip, and the flat-slab detector
 * behind the rhythm map.
 *
 * Pure arithmetic over the sentence list — no text, no regexes, so nothing here can
 * be made to backtrack. The one real design decision is what counts as "monotone";
 * see monotoneRuns below.
 */

/** @type {import("./rhythm.d.mts").RhythmOptions} */
export const DEFAULT_RHYTHM_OPTIONS = {
	shortMax: 8,
	longMin: 25,
	veryLongMin: 40,
	monotoneRun: 4,
	monotoneSpread: 3,
};

/**
 * @param {Array<{words: number}>} sentences
 * @param {Partial<import("./rhythm.d.mts").RhythmOptions>} [options]
 * @returns {import("./rhythm.d.mts").Rhythm}
 */
export function rhythm(sentences, options) {
	const opts = normalize(options);
	const list = Array.isArray(sentences) ? sentences : [];

	const lengths = [];
	const bands = [];
	for (const sentence of list) {
		const words = countOf(sentence);
		lengths.push(words);
		bands.push(bandOf(words, opts));
	}

	return {
		lengths,
		bands,
		monotoneRuns: findMonotoneRuns(lengths, opts),
		variety: stdev(lengths),
	};
}

/**
 * Band thresholds are checked short-first so a nonsensical settings combination
 * (shortMax above longMin) degrades to "short" rather than throwing or reporting a
 * sentence as both.
 *
 * @param {number} words
 * @param {import("./rhythm.d.mts").RhythmOptions} opts
 * @returns {import("./rhythm.d.mts").Band}
 */
function bandOf(words, opts) {
	if (words <= opts.shortMax) return "short";
	if (words >= opts.veryLongMin) return "veryLong";
	if (words >= opts.longMin) return "long";
	return "medium";
}

/**
 * Maximal runs of >= monotoneRun consecutive sentences whose word counts all sit
 * within monotoneSpread of each other (max - min <= spread across the whole run).
 *
 * Scanned greedily left to right: each run is extended as far right as it can go, and
 * the next scan resumes AFTER it. A slow drift like 24, 25, 26, 27, 28, 29 with a
 * spread of 3 therefore reports one run of four rather than two overlapping fours —
 * we would rather under-report a slab than draw the writer three bars for one problem.
 *
 * @param {number[]} lengths
 * @param {import("./rhythm.d.mts").RhythmOptions} opts
 * @returns {Array<{fromIndex: number, toIndex: number, length: number}>}
 */
function findMonotoneRuns(lengths, opts) {
	const runs = [];
	const n = lengths.length;
	let start = 0;

	while (start < n) {
		let min = lengths[start];
		let max = lengths[start];
		let end = start;

		while (end + 1 < n) {
			const next = lengths[end + 1];
			const nextMin = Math.min(min, next);
			const nextMax = Math.max(max, next);
			if (nextMax - nextMin > opts.monotoneSpread) break;
			min = nextMin;
			max = nextMax;
			end++;
		}

		const length = end - start + 1;
		if (length >= opts.monotoneRun) {
			runs.push({ fromIndex: start, toIndex: end, length });
			start = end + 1;
		} else {
			// Too short to matter: slide one sentence and try again, since a run may well
			// begin inside the window we just rejected.
			start++;
		}
	}

	return runs;
}

/** Population (not sample) stdev — this describes the note we have, not a sample of prose. */
function stdev(lengths) {
	const n = lengths.length;
	if (n < 2) return 0;

	let sum = 0;
	for (const value of lengths) sum += value;
	const mean = sum / n;

	let squares = 0;
	for (const value of lengths) {
		const delta = value - mean;
		squares += delta * delta;
	}

	return Math.round(Math.sqrt(squares / n) * 10) / 10;
}

/** A sentence with a missing or absurd word count contributes 0, never NaN. */
function countOf(sentence) {
	const words = sentence ? sentence.words : 0;
	if (typeof words !== "number" || !Number.isFinite(words) || words < 0) return 0;
	return Math.floor(words);
}

function normalize(options) {
	const source = options && typeof options === "object" ? options : {};
	const opts = { ...DEFAULT_RHYTHM_OPTIONS };
	for (const key of Object.keys(DEFAULT_RHYTHM_OPTIONS)) {
		const value = source[key];
		if (typeof value === "number" && Number.isFinite(value)) opts[key] = value;
	}
	// A run of 0 or 1 would mark every sentence in the note; a negative spread could
	// never match. Clamp rather than trusting settings we may not have written.
	opts.monotoneRun = Math.max(2, Math.floor(opts.monotoneRun));
	opts.monotoneSpread = Math.max(0, opts.monotoneSpread);
	return opts;
}
