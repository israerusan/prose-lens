import assert from "node:assert/strict";
import { snapshot, diffSnapshots, hasMoved } from "../src/core/delta.mjs";

const LABELS = [
	"Words",
	"Grade level",
	"Reading ease",
	"Avg sentence length",
	"Passive voice",
	"Hedges",
	"Adverbs",
	"Weasel words",
	"Cliches",
	"Machine-prose marks",
	"Long sentences",
];

const KEYS = [
	"words",
	"grade",
	"flesch",
	"avgSentenceWords",
	"passive",
	"hedge",
	"adverb",
	"weasel",
	"cliche",
	"deslop",
	"longSentence",
];

function stats(overrides = {}, counts = {}) {
	return {
		words: 100,
		sentences: 5,
		syllables: 160,
		flesch: 60,
		grade: 9,
		avgSentenceWords: 20,
		longestSentenceWords: 32,
		...overrides,
		counts: { ...counts },
	};
}

// --- snapshot -------------------------------------------------------------

{
	const snap = snapshot(stats({}, { passive: 3, hedge: 2, adverb: 7, deslop: 1 }));
	assert.deepEqual(Object.keys(snap), KEYS, "snapshot exposes every metric key");
	assert.equal(snap.words, 100);
	assert.equal(snap.grade, 9);
	assert.equal(snap.flesch, 60);
	assert.equal(snap.avgSentenceWords, 20);
	assert.equal(snap.passive, 3);
	assert.equal(snap.adverb, 7);
	assert.equal(snap.deslop, 1);
	// Missing count keys are 0, never undefined — the panel renders them raw.
	assert.equal(snap.weasel, 0);
	assert.equal(snap.cliche, 0);
	assert.equal(snap.longSentence, 0);
	assert.ok(Object.isFrozen(snap), "snapshot is frozen");
}

// Empty / absent input must zero out, not throw.
{
	for (const input of [null, undefined, {}]) {
		const snap = snapshot(input);
		assert.deepEqual(Object.keys(snap), KEYS);
		for (const key of KEYS) assert.equal(snap[key], 0, `${key} zeroed for ${String(input)}`);
	}
}

// Junk values (NaN from a divide-by-zero upstream) coerce to 0 rather than
// poisoning every delta with NaN.
{
	const snap = snapshot({ words: NaN, grade: Infinity, flesch: "60", counts: { passive: null } });
	assert.equal(snap.words, 0);
	assert.equal(snap.grade, 0);
	assert.equal(snap.flesch, 0);
	assert.equal(snap.passive, 0);
}

// --- diffSnapshots: happy path --------------------------------------------

{
	const before = snapshot(stats({ words: 120, grade: 11.4, flesch: 48.2, avgSentenceWords: 24 }, { passive: 4, hedge: 3, adverb: 9, weasel: 2, cliche: 1, deslop: 5, longSentence: 3 }));
	const after = snapshot(stats({ words: 96, grade: 8.9, flesch: 62.7, avgSentenceWords: 17 }, { passive: 1, hedge: 3, adverb: 4, weasel: 0, cliche: 1, deslop: 0, longSentence: 5 }));
	const rows = diffSnapshots(before, after);

	assert.equal(rows.length, 11);
	assert.deepEqual(rows.map((r) => r.label), LABELS, "rows come back in display order");
	assert.deepEqual(rows.map((r) => r.key), KEYS);

	const by = Object.fromEntries(rows.map((r) => [r.key, r]));

	assert.deepEqual(by.words, { key: "words", label: "Words", before: 120, after: 96, delta: -24, better: null });

	assert.equal(by.grade.delta, -2.5);
	assert.equal(by.grade.better, true, "lower grade is better");

	assert.equal(by.flesch.delta, 14.5);
	assert.equal(by.flesch.better, true, "higher reading ease is better");

	assert.equal(by.avgSentenceWords.delta, -7);
	assert.equal(by.avgSentenceWords.better, true);

	assert.equal(by.passive.delta, -3);
	assert.equal(by.passive.better, true);

	assert.equal(by.deslop.delta, -5);
	assert.equal(by.deslop.better, true);

	assert.equal(by.longSentence.delta, 2);
	assert.equal(by.longSentence.better, false, "more long sentences is worse");

	// Unchanged metrics are neutral, not silently "improved".
	assert.equal(by.hedge.delta, 0);
	assert.equal(by.hedge.better, null);
	assert.equal(by.cliche.better, null);
}

// A worse edit reports worse, and flesch inverts correctly.
{
	const rows = diffSnapshots(snapshot(stats({ flesch: 70, grade: 8 })), snapshot(stats({ flesch: 55, grade: 12 })));
	const by = Object.fromEntries(rows.map((r) => [r.key, r]));
	assert.equal(by.flesch.delta, -15);
	assert.equal(by.flesch.better, false, "falling reading ease is worse");
	assert.equal(by.grade.delta, 4);
	assert.equal(by.grade.better, false);
}

// --- MUST NOT FIRE --------------------------------------------------------

// 1. Identical snapshots: every delta is 0, every verdict null, nothing moved.
{
	const snap = snapshot(stats({}, { passive: 2, adverb: 3 }));
	const rows = diffSnapshots(snap, snap);
	for (const row of rows) {
		assert.equal(row.delta, 0, `${row.key} did not move`);
		assert.equal(row.better, null, `${row.key} has no verdict`);
	}
	assert.equal(hasMoved(rows), false, "an unedited document has not moved");
}

// 2. A sub-0.1 wobble displays as 0.0 and must NOT be sold as an improvement —
//    the verdict is read off the rounded delta, so display and arrow agree.
{
	const rows = diffSnapshots(snapshot(stats({ grade: 9.02, flesch: 60.01 })), snapshot(stats({ grade: 9.06, flesch: 59.98 })));
	const by = Object.fromEntries(rows.map((r) => [r.key, r]));
	assert.equal(by.grade.delta, 0);
	assert.equal(by.grade.better, null, "a rounding wobble is not a regression");
	assert.equal(by.flesch.delta, 0);
	assert.equal(by.flesch.better, null);
	assert.equal(hasMoved(rows), false);
	assert.ok(!Object.is(by.grade.delta, -0), "delta never renders as -0");
}

// 3. Word count never carries a verdict, in either direction — drafting is not a sin.
{
	const grew = diffSnapshots(snapshot(stats({ words: 100 })), snapshot(stats({ words: 400 })));
	const cut = diffSnapshots(snapshot(stats({ words: 400 })), snapshot(stats({ words: 100 })));
	assert.equal(grew[0].delta, 300);
	assert.equal(grew[0].better, null, "adding words is not worse");
	assert.equal(cut[0].delta, -300);
	assert.equal(cut[0].better, null, "cutting words is not automatically better");
}

// 4. hasMoved on junk stays false instead of throwing.
{
	assert.equal(hasMoved([]), false);
	assert.equal(hasMoved(null), false);
	assert.equal(hasMoved(undefined), false);
	assert.equal(hasMoved("nope"), false);
	assert.equal(hasMoved([null, undefined]), false);
}

// --- empty / missing sides ------------------------------------------------

{
	for (const [before, after] of [[null, null], [undefined, undefined], [null, snapshot(stats())], [snapshot(stats()), undefined], [{}, {}]]) {
		const rows = diffSnapshots(before, after);
		assert.equal(rows.length, 11);
		for (const row of rows) assert.equal(typeof row.delta, "number");
	}

	// A first-ever snapshot (no "before") reads as growth from zero, not NaN.
	const fresh = diffSnapshots(null, snapshot(stats({ words: 50, grade: 10 }, { passive: 2 })));
	const by = Object.fromEntries(fresh.map((r) => [r.key, r]));
	assert.equal(by.words.before, 0);
	assert.equal(by.words.after, 50);
	assert.equal(by.grade.delta, 10);
	assert.equal(by.passive.delta, 2);
	assert.equal(hasMoved(fresh), true);
}

// Raw Stats may be diffed directly — rule counts are found under `.counts`.
{
	const rows = diffSnapshots(stats({}, { passive: 5 }), stats({}, { passive: 1 }));
	const passive = rows.find((r) => r.key === "passive");
	assert.equal(passive.delta, -4);
	assert.equal(passive.better, true);
}

// --- hasMoved -------------------------------------------------------------

{
	const moved = diffSnapshots(snapshot(stats({}, { adverb: 4 })), snapshot(stats({}, { adverb: 3 })));
	assert.equal(hasMoved(moved), true);
}

// --- pathological ---------------------------------------------------------

// No regexes here, but the panel diffs on every keystroke: 50k diffs of a
// snapshot carrying a huge junk `counts` map must stay well under a frame budget.
{
	const noisy = { words: 1, grade: 1, flesch: 1, avgSentenceWords: 1, counts: {} };
	for (let i = 0; i < 5000; i++) noisy.counts["junk" + i] = i;
	const before = snapshot(noisy);
	const after = snapshot({ ...noisy, grade: 2 });

	const started = Date.now();
	for (let i = 0; i < 50000; i++) hasMoved(diffSnapshots(before, after));
	const elapsed = Date.now() - started;
	assert.ok(elapsed < 2000, `50k diffs took ${elapsed}ms`);

	// Junk count keys are ignored outright — no stray rows leak into the panel.
	assert.equal(Object.keys(before).length, 11);
	assert.equal(diffSnapshots(before, after).length, 11);
}

// A 50k-character string where a number belongs must not blow up either.
{
	const rows = diffSnapshots({ words: "a".repeat(50000) }, { words: 5 });
	assert.equal(rows[0].before, 0);
	assert.equal(rows[0].after, 5);
	assert.equal(rows[0].delta, 5);
}

console.log("ok  delta.test.mjs");
