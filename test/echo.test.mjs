import assert from "node:assert";

import { DEFAULT_ECHO_OPTIONS, findEchoes } from "../src/core/echo.mjs";
import { segmentSentences } from "../src/core/segment.mjs";
import { STOPWORDS } from "../src/core/wordlists.mjs";

/** Plain prose has nothing to mask, so the document is its own masked text. */
function echoes(text, options) {
	return findEchoes(text, segmentSentences(text, text), options);
}

function term(results, name) {
	return results.find((r) => r.term === name);
}

assert.deepStrictEqual(DEFAULT_ECHO_OPTIONS, {
	windowSentences: 4,
	minCount: 3,
	minWordLength: 4,
	maxResults: 25,
});

// Happy path: a crutch word inside one window, counted across the document.
{
	const text =
		"The pipeline broke again. Our pipeline needs a rewrite. " +
		"Every pipeline failure costs a day. Nobody enjoys pipeline work.";
	const found = echoes(text);
	const hit = term(found, "pipeline");
	assert.ok(hit, "pipeline should be an echo");
	assert.strictEqual(hit.kind, "word");
	assert.strictEqual(hit.count, 4);
	assert.strictEqual(hit.offsets.length, 4);
	for (const off of hit.offsets) {
		assert.strictEqual(text.slice(off, off + 8).toLowerCase(), "pipeline");
	}
	assert.deepStrictEqual(hit.offsets, [...hit.offsets].sort((a, b) => a - b));
}

// A bigram is reported when it is a finding of its own: "thing" occurs four times but
// "the thing" only three, so the phrase is not just the word wearing a hat.
{
	const text =
		"This is the thing I wanted. The thing about it is simple. " +
		"Another thing bothers me. I mean the thing itself.";
	const found = echoes(text);
	const phrase = term(found, "the thing");
	assert.ok(phrase, "the thing should be a phrase echo");
	assert.strictEqual(phrase.kind, "phrase");
	assert.strictEqual(phrase.count, 3);
	for (const off of phrase.offsets) {
		assert.strictEqual(text.slice(off, off + 9).toLowerCase(), "the thing");
	}
	const word = term(found, "thing");
	assert.ok(word, "the word should survive alongside the phrase");
	assert.strictEqual(word.count, 4);
}

// Same finding twice: every "pipeline" is inside a "the pipeline", so drop the bigram.
{
	const found = echoes("We fixed the pipeline. Then the pipeline broke. Later the pipeline healed.");
	assert.ok(term(found, "pipeline"), "word survives");
	assert.strictEqual(term(found, "the pipeline"), undefined, "redundant bigram suppressed");
}

// Sorted by count desc, then term asc, and truncated.
{
	const text =
		"Latency haunts latency budgets and latency graphs. " +
		"Latency again, plus throughput. Throughput and throughput. " +
		"Throughput budgets, latency budgets.";
	const found = echoes(text, { maxResults: 2 });
	assert.strictEqual(found.length, 2);
	for (let i = 1; i < found.length; i++) {
		assert.ok(found[i - 1].count >= found[i].count, "count descending");
		if (found[i - 1].count === found[i].count) {
			assert.ok(found[i - 1].term < found[i].term, "term ascending on ties");
		}
	}
}

// MUST NOT FIRE 1: repetition spread wider than the window is not an echo.
{
	const text =
		"The garden looked tired. We watered everything. The sun stayed out. " +
		"The garden filled in. Weeds took over. Bees arrived. Late frost hit. " +
		"The garden died.";
	const found = echoes(text);
	assert.strictEqual(term(found, "garden"), undefined, "3 hits across 9 sentences is not a cluster");
}

// MUST NOT FIRE 2: stopwords, whatever the list happens to contain.
{
	const stop = [...STOPWORDS].find((w) => typeof w === "string" && w.length >= 5 && /^[a-z]+$/.test(w));
	assert.ok(stop, "wordlists must expose usable stopwords");
	const text = `We ${stop} it. They ${stop} it too. Everyone ${stop} it. Nobody ${stop} it.`;
	assert.strictEqual(term(echoes(text), stop), undefined, "stopwords are never echoes");
}

// MUST NOT FIRE 3: proper nouns repeat because the subject repeats.
{
	const text = "Sarah met Priya. Later Priya laughed. Nobody told Priya. Priya left.";
	const found = echoes(text);
	assert.strictEqual(term(found, "priya"), undefined, "a name is not a crutch word");
}

// MUST NOT FIRE 4: words below minWordLength, and anything below minCount.
{
	const text = "The cat sat. A cat ran. That cat left. Our cat sang. The rabbit waited twice.";
	const found = echoes(text);
	assert.strictEqual(term(found, "cat"), undefined, "3-letter word is under minWordLength");
	assert.strictEqual(term(found, "rabbit"), undefined, "one occurrence is not an echo");
}

// MUST NOT FIRE 5: two occurrences never qualify, even if the caller asks for one.
{
	const text = "The invoice arrived. The invoice was wrong.";
	assert.deepStrictEqual(echoes(text, { minCount: 1 }), [], "minCount below 3 is refused");
}

// Empty and degenerate input.
{
	assert.deepStrictEqual(findEchoes("", [], DEFAULT_ECHO_OPTIONS), []);
	assert.deepStrictEqual(findEchoes("hello", null), []);
	assert.deepStrictEqual(echoes(""), []);
	assert.deepStrictEqual(echoes("   \n\n   "), []);
	assert.deepStrictEqual(echoes("Short."), []);
	assert.deepStrictEqual(echoes("The report is fine."), []);
	assert.deepStrictEqual(echoes("Repeated words", { maxResults: 0 }), []);
}

// Masked regions are spaces, so code and URLs cannot contribute occurrences.
{
	const text = "The widget shipped. The widget sold. The widget won.";
	const masked = text.replace(/widget/g, "      ");
	const found = findEchoes(masked, segmentSentences(text, masked), DEFAULT_ECHO_OPTIONS);
	assert.strictEqual(term(found, "widget"), undefined, "masked text holds no words");
}

// Pathological: 50k characters with no spaces, and a very long repetitive document.
{
	const blob = "a".repeat(50000);
	let start = Date.now();
	assert.deepStrictEqual(findEchoes(blob, [{ from: 0, to: blob.length }], DEFAULT_ECHO_OPTIONS), []);
	assert.ok(Date.now() - start < 1000, "single 50k-char token must be fast");

	const flood = "buffer overflow buffer overflow ".repeat(5000);
	start = Date.now();
	const found = findEchoes(flood, [{ from: 0, to: flood.length }], DEFAULT_ECHO_OPTIONS);
	assert.ok(Date.now() - start < 1000, "20k-word single sentence must not be quadratic");
	assert.strictEqual(term(found, "buffer").count, 10000);
}

console.log("ok  echo.test.mjs");
