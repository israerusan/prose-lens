/**
 * Revision delta (Pro): "did that edit actually make this tighter?"
 *
 * The whole feature is one honest comparison of two `Stats`, so the interesting
 * decisions are all about NOT overclaiming. Two of them:
 *
 * 1. `better` is derived from the ROUNDED delta, not the raw one. Grade 9.02 ->
 *    9.06 displays as "0.0" and must therefore read as "no change" — showing a
 *    green arrow next to a zero is the kind of detail that makes a writer stop
 *    trusting the panel.
 * 2. `words` has no direction. Cutting is usually the goal, but drafting is not,
 *    and a tool that scolds you for adding a paragraph is a tool you turn off.
 */

/**
 * Metric rows in display order. `dir` is the direction of improvement:
 * -1 lower is better, +1 higher is better, 0 no such thing.
 */
const METRICS = Object.freeze([
	Object.freeze({ key: "words", label: "Words", dir: 0 }),
	Object.freeze({ key: "grade", label: "Grade level", dir: -1 }),
	Object.freeze({ key: "flesch", label: "Reading ease", dir: 1 }),
	Object.freeze({ key: "avgSentenceWords", label: "Avg sentence length", dir: -1 }),
	Object.freeze({ key: "passive", label: "Passive voice", dir: -1 }),
	Object.freeze({ key: "hedge", label: "Hedges", dir: -1 }),
	Object.freeze({ key: "adverb", label: "Adverbs", dir: -1 }),
	Object.freeze({ key: "weasel", label: "Weasel words", dir: -1 }),
	Object.freeze({ key: "cliche", label: "Cliches", dir: -1 }),
	Object.freeze({ key: "deslop", label: "Machine-prose marks", dir: -1 }),
	Object.freeze({ key: "longSentence", label: "Long sentences", dir: -1 }),
]);

/**
 * Freeze a `Stats` into the flat shape the delta panel compares. Frozen because a
 * snapshot is held across edits — an accidental mutation would silently rewrite the
 * user's "before".
 *
 * @param {import("./types.d.mts").Stats | null | undefined} stats
 * @returns {Readonly<Record<string, number>>}
 */
export function snapshot(stats) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const metric of METRICS) out[metric.key] = read(stats, metric.key);
	return Object.freeze(out);
}

/**
 * @param {Readonly<Record<string, number>> | null | undefined} before
 * @param {Readonly<Record<string, number>> | null | undefined} after
 * @returns {Array<{key: string, label: string, before: number, after: number, delta: number, better: boolean | null}>}
 */
export function diffSnapshots(before, after) {
	return METRICS.map((metric) => {
		const from = read(before, metric.key);
		const to = read(after, metric.key);

		// `|| 0` also collapses -0, which would otherwise render as "-0.0".
		const delta = round1(to - from) || 0;

		let better = null;
		if (metric.dir < 0) better = delta === 0 ? null : delta < 0;
		else if (metric.dir > 0) better = delta === 0 ? null : delta > 0;

		return { key: metric.key, label: metric.label, before: from, after: to, delta, better };
	});
}

/** True when the edit changed anything we measure — the panel stays quiet otherwise. */
export function hasMoved(rows) {
	if (!Array.isArray(rows)) return false;
	return rows.some((row) => row != null && row.delta !== 0);
}

/**
 * Read one metric from either a snapshot (flat) or a raw `Stats` (rule counts live
 * under `.counts`). Accepting both means a caller can diff live stats without first
 * remembering to wrap them, and it costs one lookup.
 */
function read(source, key) {
	if (source == null || typeof source !== "object") return 0;
	const flat = source[key];
	if (typeof flat === "number" && Number.isFinite(flat)) return flat;
	const counts = source.counts;
	if (counts != null && typeof counts === "object") {
		const nested = counts[key];
		if (typeof nested === "number" && Number.isFinite(nested)) return nested;
	}
	return 0;
}

function round1(value) {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value * 10) / 10;
}
