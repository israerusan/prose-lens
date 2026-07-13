import assert from "node:assert";
import { maskText } from "../src/core/mask.mjs";
import { segmentSentences, splitBlocks, words } from "../src/core/segment.mjs";

const sentencesOf = (text) => segmentSentences(text, maskText(text));

// --- basic segmentation -------------------------------------------------------
const basic = sentencesOf("One sentence here. And a second one! A third?");
assert.equal(basic.length, 3);
assert.equal(basic[0].words, 3);

// Offsets are absolute and point at real text.
const doc = "Alpha beta. Gamma delta.";
const two = sentencesOf(doc);
assert.equal(doc.slice(two[1].from, two[1].to).trim(), "Gamma delta.");

// --- soft-wrapped prose must NOT shatter into fragments -----------------------
// This is the case that breaks a naive newline splitter: one sentence, hard-wrapped.
const wrapped = sentencesOf("The quick brown fox\njumps over the lazy dog\nand keeps running.");
assert.equal(wrapped.length, 1, "a hard-wrapped sentence is still one sentence");
assert.equal(wrapped[0].words, 12);

// --- list items must NOT merge into one giant sentence ------------------------
// The mirror-image failure: bullets with no terminal punctuation.
const list = sentencesOf("- first item\n- second item\n- third item");
assert.equal(list.length, 3, "each bullet is its own sentence");

// --- a blank line always ends a block -----------------------------------------
const paragraphs = sentencesOf("First para line one\nline two\n\nSecond para.");
assert.equal(paragraphs.length, 2);

// --- masked regions produce no sentences --------------------------------------
const withCode = sentencesOf("Prose here.\n\n```js\nconst x = 1;\nconst y = 2;\n```\n\nMore prose.");
assert.equal(withCode.length, 2, "a code fence must not contribute sentences");
for (const sentence of withCode) {
	assert.ok(!sentence.text.includes("const"), "code leaked into a sentence");
}

// A note that is nothing but code has no sentences at all.
assert.equal(sentencesOf("```\nwas deleted by the system\n```").length, 0);

// --- words ---------------------------------------------------------------------
const masked = maskText("Hello there, world's end — co-operate.");
const found = words(masked, 0, masked.length);
assert.deepEqual(
	found.map((word) => word.text),
	["Hello", "there", "world's", "end", "co-operate"]
);
// Offsets are real.
assert.equal(masked.slice(found[2].from, found[2].to), "world's");

// Numbers are not words (they have no syllables and would skew the grade).
assert.equal(words(maskText("I have 3 cats"), 0, 13).length, 3);

// --- empty and degenerate -----------------------------------------------------
assert.deepEqual(sentencesOf(""), []);
assert.deepEqual(sentencesOf("   \n\n  "), []);
assert.deepEqual(splitBlocks("", ""), []);

// --- pathological -------------------------------------------------------------
const started = Date.now();
const huge = "word ".repeat(20000);
const hugeSentences = sentencesOf(huge);
assert.ok(hugeSentences.length >= 1);
sentencesOf("a".repeat(50000));
assert.ok(Date.now() - started < 5000, "segmentation of a large document must not hang");

console.log("ok  segment.test.mjs");
