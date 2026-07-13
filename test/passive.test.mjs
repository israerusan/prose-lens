import assert from "node:assert";

import { findPassive } from "../src/core/passive.mjs";
import { segmentSentences } from "../src/core/segment.mjs";

/**
 * Plain prose masks to itself, so the document doubles as the masked text and every
 * offset asserted below is a real document offset.
 */
function run(text) {
	const spans = [];
	for (const sentence of segmentSentences(text, text)) {
		spans.push(...findPassive(text, sentence));
	}
	return spans;
}

function texts(input) {
	return run(input).map((span) => span.text);
}

// --- happy path ---------------------------------------------------------------

assert.deepStrictEqual(texts("The ball was thrown by John."), ["was thrown"]);
assert.deepStrictEqual(texts("Mistakes were made."), ["were made"]);
assert.deepStrictEqual(texts("The bug has been fixed."), ["been fixed"]);
assert.deepStrictEqual(texts("The file was quietly deleted."), ["was quietly deleted"]);
assert.deepStrictEqual(texts("It got broken."), ["got broken"]);
assert.deepStrictEqual(texts("The release was not widely announced."), ["was not widely announced"]);
assert.deepStrictEqual(texts("The index is being deleted."), ["is being deleted"]);
assert.deepStrictEqual(texts("The patch wasn't merged."), ["wasn't merged"]);

// Offsets are absolute into the document, not relative to the sentence.
const second = run("All fine here. The ball was thrown by John.");
assert.strictEqual(second.length, 1);
assert.strictEqual(second[0].from, 24);
assert.strictEqual(second[0].to, 34);
assert.strictEqual("All fine here. The ball was thrown by John.".slice(24, 34), "was thrown");

// Two constructions in one paragraph, and the spans never overlap.
const many = run("The build was broken. The tests were skipped.");
assert.deepStrictEqual(
	many.map((span) => span.text),
	["was broken", "were skipped"],
);

// --- must not fire ------------------------------------------------------------

const clean = [
	"She was happy.",
	"It is red.",
	"We need to speed up.",
	"He was going to leave.",
	"I am running.",
	"The report is comprehensive.",
	"She was able to finish the draft.",
	"It is indeed a problem.",
	"This is a well known fact.",
	"The team was very tired.",
	"The meeting is tomorrow.",
	"He gets the joke.",
];
for (const sentence of clean) {
	assert.deepStrictEqual(texts(sentence), [], `must not fire: ${sentence}`);
}

// "-ed" predicate adjectives: participle-shaped, but nobody calls these passive.
for (const sentence of [
	"She was tired.",
	"We are excited about the launch.",
	"I was confused by then.",
	"The room got crowded.",
	"He is interested in the role.",
]) {
	assert.deepStrictEqual(texts(sentence), [], `must not fire: ${sentence}`);
}

// ...but the same words with a real agent behind them are passive after all.
assert.deepStrictEqual(texts("The audience was delighted by the finale."), ["was delighted"]);
assert.deepStrictEqual(texts("The climbers were exhausted by the altitude."), ["were exhausted"]);

// A comma between the auxiliary and the participle means two different clauses.
assert.deepStrictEqual(texts("The winner was Ana, praised by everyone."), []);

// Masking leaves long runs of spaces where code and URLs were; a be-verb must not
// reach across one to find a participle.
const maskedish = `The value is${" ".repeat(20)}deleted.`;
assert.deepStrictEqual(texts(maskedish), []);

// --- empty and degenerate input -----------------------------------------------

assert.deepStrictEqual(run(""), []);
assert.deepStrictEqual(findPassive("", { from: 0, to: 0, text: "", words: 0, syllables: 0 }), []);
assert.deepStrictEqual(findPassive("was fixed", null), []);
assert.deepStrictEqual(findPassive(null, { from: 0, to: 9, text: "was fixed", words: 2, syllables: 2 }), []);
assert.deepStrictEqual(texts("   "), []);
assert.deepStrictEqual(texts("was"), []);

// --- pathological input -------------------------------------------------------

const bomb = "a".repeat(50000);
let start = Date.now();
assert.deepStrictEqual(findPassive(bomb, { from: 0, to: bomb.length, text: bomb, words: 1, syllables: 1 }), []);
assert.ok(Date.now() - start < 1000, "50k-character single word must not stall");

// 12,500 be-verbs in a row: every one starts a lookahead, none of them completes.
const auxSpam = "was ".repeat(12500);
start = Date.now();
assert.deepStrictEqual(findPassive(auxSpam, { from: 0, to: auxSpam.length, text: auxSpam, words: 12500, syllables: 12500 }), []);
assert.ok(Date.now() - start < 1000, "be-verb spam must not stall");

// A 50k word ending in "-ed" is a participle by shape, and must still be linear.
const edBomb = `was ${"a".repeat(49990)}ed`;
start = Date.now();
assert.strictEqual(
	findPassive(edBomb, { from: 0, to: edBomb.length, text: edBomb, words: 2, syllables: 2 }).length,
	1,
);
assert.ok(Date.now() - start < 1000, "50k participle must not stall");

console.log("ok  passive.test.mjs");
