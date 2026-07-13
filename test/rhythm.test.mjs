import assert from "node:assert/strict";
import { rhythm, DEFAULT_RHYTHM_OPTIONS } from "../src/core/rhythm.mjs";

const S = (...counts) => counts.map((words) => ({ words }));

// --- defaults -----------------------------------------------------------------

assert.deepEqual(DEFAULT_RHYTHM_OPTIONS, {
	shortMax: 8,
	longMin: 25,
	veryLongMin: 40,
	monotoneRun: 4,
	monotoneSpread: 3,
});

// --- happy path ---------------------------------------------------------------

{
	const r = rhythm(S(5, 30, 12, 45));
	assert.deepEqual(r.lengths, [5, 30, 12, 45]);
	assert.deepEqual(r.bands, ["short", "long", "medium", "veryLong"]);
	assert.deepEqual(r.monotoneRuns, []);
	assert.ok(r.variety > 0);
}

// Band boundaries are inclusive on the threshold itself.
{
	const r = rhythm(S(8, 9, 24, 25, 39, 40));
	assert.deepEqual(r.bands, ["short", "medium", "medium", "long", "long", "veryLong"]);
}

// --- monotone runs: maximality ------------------------------------------------

// Six sentences all within +/-3 are ONE run of six, not three overlapping runs of four.
{
	const r = rhythm(S(10, 11, 12, 13, 10, 12));
	assert.deepEqual(r.monotoneRuns, [{ fromIndex: 0, toIndex: 5, length: 6 }]);
}

// Two flat slabs split by an outlier; the outlier belongs to neither.
{
	const r = rhythm(S(10, 10, 10, 10, 40, 12, 12, 12, 12));
	assert.deepEqual(r.monotoneRuns, [
		{ fromIndex: 0, toIndex: 3, length: 4 },
		{ fromIndex: 5, toIndex: 8, length: 4 },
	]);
}

// A run may start after a rejected window: the leading 40 cannot join, the tail can.
{
	const r = rhythm(S(40, 11, 12, 13, 14));
	assert.deepEqual(r.monotoneRuns, [{ fromIndex: 1, toIndex: 4, length: 4 }]);
}

// Documented tradeoff: a slow drift reports the first maximal window only, never a
// second overlapping one starting inside it.
{
	const r = rhythm(S(24, 25, 26, 27, 28, 29));
	assert.deepEqual(r.monotoneRuns, [{ fromIndex: 0, toIndex: 3, length: 4 }]);
}

// --- must NOT fire ------------------------------------------------------------

// 1. Three similar sentences are below the run threshold.
assert.deepEqual(rhythm(S(12, 13, 12)).monotoneRuns, []);

// 2. Genuinely varied prose never trips the detector.
assert.deepEqual(rhythm(S(5, 30, 9, 41, 12, 22, 7)).monotoneRuns, []);

// 3. Four sentences one word outside the spread are not a run (17 - 13 = 4 > 3).
assert.deepEqual(rhythm(S(13, 14, 16, 17)).monotoneRuns, []);

// 4. A single sentence repeated fewer than monotoneRun times, at the very end.
assert.deepEqual(rhythm(S(40, 5, 20, 20, 20)).monotoneRuns, []);

// --- variety ------------------------------------------------------------------

// Population stdev of [2,4,4,4,5,5,7,9] is exactly 2.
assert.equal(rhythm(S(2, 4, 4, 4, 5, 5, 7, 9)).variety, 2);
assert.equal(rhythm(S(10)).variety, 0);
assert.equal(rhythm(S(10, 10, 10, 10)).variety, 0);

// --- empty and malformed input ------------------------------------------------

assert.deepEqual(rhythm([]), { lengths: [], bands: [], monotoneRuns: [], variety: 0 });
assert.deepEqual(rhythm(undefined), { lengths: [], bands: [], monotoneRuns: [], variety: 0 });
assert.deepEqual(rhythm(null, {}), { lengths: [], bands: [], monotoneRuns: [], variety: 0 });

{
	// Missing / absurd word counts degrade to 0 rather than poisoning variety with NaN.
	const r = rhythm([{ words: undefined }, { words: NaN }, { words: -5 }, { words: 12 }]);
	assert.deepEqual(r.lengths, [0, 0, 0, 12]);
	assert.ok(Number.isFinite(r.variety));
}

// --- options ------------------------------------------------------------------

{
	const r = rhythm(S(6, 6, 6), { monotoneRun: 3, monotoneSpread: 0 });
	assert.deepEqual(r.monotoneRuns, [{ fromIndex: 0, toIndex: 2, length: 3 }]);
}

{
	const r = rhythm(S(10, 12), { shortMax: 20, longMin: 21, veryLongMin: 30 });
	assert.deepEqual(r.bands, ["short", "short"]);
}

// A run of 1 would mark the whole note; it is clamped up to 2.
assert.deepEqual(rhythm(S(9, 40), { monotoneRun: 1 }).monotoneRuns, []);

// --- pathological -------------------------------------------------------------

{
	const flat = new Array(50000).fill(0).map(() => ({ words: 15 }));
	const start = Date.now();
	const r = rhythm(flat);
	const elapsed = Date.now() - start;
	assert.deepEqual(r.monotoneRuns, [{ fromIndex: 0, toIndex: 49999, length: 50000 }]);
	assert.equal(r.variety, 0);
	assert.ok(elapsed < 500, `flat 50k took ${elapsed}ms`);
}

{
	// Worst case for the greedy scan: every window is rejected immediately, so it
	// restarts at each index.
	const spiky = new Array(50000).fill(0).map((_, i) => ({ words: i % 2 === 0 ? 1 : 60 }));
	const start = Date.now();
	const r = rhythm(spiky);
	const elapsed = Date.now() - start;
	assert.deepEqual(r.monotoneRuns, []);
	assert.ok(elapsed < 500, `spiky 50k took ${elapsed}ms`);
}

console.log("ok  rhythm.test.mjs");
