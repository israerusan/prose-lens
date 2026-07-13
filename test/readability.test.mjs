import assert from "node:assert";
import { computeStats, easeLabel } from "../src/core/readability.mjs";
import { countSyllables } from "../src/core/syllables.mjs";

// --- syllables ------------------------------------------------------------------
const expected = {
	cat: 1,
	hello: 2,
	table: 2,
	make: 1,
	walked: 1, // silent -ed
	wanted: 2, // -ted keeps its own syllable
	beautiful: 3,
	readability: 5,
	a: 1,
	the: 1,
	rhythm: 1, // no vowels but y — must still be >= 1
};
for (const [word, count] of Object.entries(expected)) {
	assert.equal(countSyllables(word), count, `countSyllables("${word}")`);
}
// Never zero for a real word — a zero would divide the grade into infinity.
for (const word of ["strength", "why", "queue", "x"]) {
	assert.ok(countSyllables(word) >= 1, `"${word}" must have at least one syllable`);
}
assert.equal(countSyllables(""), 0);
assert.equal(countSyllables(123), 0);

// --- stats ----------------------------------------------------------------------
// An empty note must return zeros, never NaN — "Grade NaN" in the status bar is a bug
// report waiting to happen.
const empty = computeStats([]);
assert.equal(empty.grade, 0);
assert.equal(empty.flesch, 0);
assert.equal(empty.words, 0);
for (const value of Object.values(empty)) {
	if (typeof value === "number") assert.ok(!Number.isNaN(value), "stats must never be NaN");
}
assert.equal(computeStats([{ words: 0, syllables: 0 }]).grade, 0);

// Short, simple sentences score EASIER than long, complex ones. The absolute numbers
// are a heuristic, but this ordering is the product promise.
const simple = computeStats([
	{ words: 5, syllables: 6 },
	{ words: 6, syllables: 7 },
]);
const complex = computeStats([{ words: 40, syllables: 90 }]);
assert.ok(simple.flesch > complex.flesch, "simple prose must read easier");
assert.ok(simple.grade < complex.grade, "simple prose must grade lower");

// Clamped, so a pathological note cannot render "Grade -4".
assert.ok(computeStats([{ words: 1, syllables: 1 }]).grade >= 0);
assert.ok(computeStats([{ words: 1, syllables: 1 }]).flesch <= 100);

const stats = computeStats(
	[
		{ words: 10, syllables: 15 },
		{ words: 20, syllables: 30 },
	],
	{ adverb: 2 }
);
assert.equal(stats.words, 30);
assert.equal(stats.sentences, 2);
assert.equal(stats.avgSentenceWords, 15);
assert.equal(stats.longestSentenceWords, 20);
assert.equal(stats.counts.adverb, 2);

// --- labels ----------------------------------------------------------------------
assert.equal(easeLabel(90), "Very easy");
assert.equal(easeLabel(20), "Very hard");

console.log("ok  readability.test.mjs");
