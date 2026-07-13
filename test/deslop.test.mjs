import assert from "node:assert/strict";
import { findSlop } from "../src/core/deslop.mjs";
import { segmentSentences } from "../src/core/segment.mjs";
import { DESLOP_PHRASES, DESLOP_WORDS } from "../src/core/wordlists.mjs";

/** These tests run on plain prose, where the mask is the identity. */
function analyze(text) {
	return findSlop(text, segmentSentences(text, text));
}

function slice(text, mark) {
	return text.slice(mark.from, mark.to);
}

const phrases = [...DESLOP_PHRASES];
const singleWords = [...DESLOP_WORDS].filter((word) => !/\s/.test(word));
assert.ok(phrases.length > 0, "DESLOP_PHRASES must not be empty");
assert.ok(singleWords.length > 0, "DESLOP_WORDS must not be empty");

// Every mark this module emits is a deslop mark with sane offsets.
function assertWellFormed(text, marks) {
	let previous = -1;
	for (const mark of marks) {
		assert.equal(mark.rule, "deslop");
		assert.ok(["info", "warn", "strong"].includes(mark.severity));
		assert.ok(mark.from >= 0 && mark.to <= text.length && mark.from < mark.to);
		assert.ok(mark.from >= previous, "marks must be sorted by from");
		assert.ok(mark.message.length > 0);
		previous = mark.from;
	}
}

// --- happy path: every phrase in the list fires, wherever it sits ---
for (const phrase of phrases) {
	const text = `We reviewed the plan. ${phrase} the team shipped it.`;
	const start = text.indexOf(phrase);
	const marks = analyze(text);
	assertWellFormed(text, marks);
	const hit = marks.find(
		(mark) => mark.severity === "warn" && mark.from >= start && mark.to <= start + phrase.length
	);
	assert.ok(hit, `phrase should fire: ${phrase}`);
	assert.equal(hit.message, "Common in machine-generated prose");
}

// --- happy path: every single word in the list fires as a whole word, with `word` set ---
for (const word of singleWords) {
	const text = `The report will ${word} in the morning.`;
	const marks = analyze(text).filter((mark) => mark.severity === "info");
	assert.ok(
		marks.some((mark) => mark.word === word.toLowerCase() && slice(text, mark).toLowerCase() === word.toLowerCase()),
		`word should fire: ${word}`
	);
}

// Word matching is whole-word: a list word buried inside a longer word is not a match.
for (const word of singleWords) {
	const text = `The x${word}x sample and the ${word}ing sample are unrelated.`;
	const marks = analyze(text);
	assert.ok(
		marks.every((mark) => mark.word !== word.toLowerCase()),
		`must not fire inside a longer word: ${word}`
	);
}

// --- em dash pile-up ---
{
	const text = "She left the room — quietly, without a word — and never came back.";
	const marks = analyze(text).filter((mark) => mark.message.includes("Em dash"));
	assert.equal(marks.length, 2);
	assert.equal(marks[0].severity, "info");
	assert.equal(slice(text, marks[0]), "—");
	assert.equal(slice(text, marks[1]), "—");
	assert.ok(marks[0].from < marks[1].from);
}

// MUST NOT FIRE: one em dash in a sentence is punctuation, not a tell — even when the
// next sentence also has one.
{
	const text = "She left the room — quietly. He stayed behind — reluctantly.";
	assert.equal(analyze(text).filter((mark) => mark.message.includes("Em dash")).length, 0);
}

// --- the reframing construction ---
{
	const cases = [
		"This isn't just a tool, it's a philosophy.",
		"It's not just a feature, it's a commitment to the craft.",
		"The change was not just cosmetic but structural.",
		"We rewrote not only the parser but also the renderer.",
		"This is not just a refactor. It's a rewrite.",
	];
	for (const text of cases) {
		const marks = analyze(text).filter((mark) => mark.message.includes("reframing"));
		assert.equal(marks.length, 1, `should fire once: ${text}`);
		assert.equal(marks[0].severity, "warn");
		assert.ok(slice(text, marks[0]).length > 4);
	}
}

// MUST NOT FIRE: superficially similar prose that is not the construction.
{
	const clean = [
		"That is just not right.",
		"He did not just leave. But we understood why.",
		"The critical path was blocked, so the release slipped.",
		"She only meant to help, but the timing was bad.",
		"Not everyone agreed; some just wanted to ship.",
	];
	for (const text of clean) {
		const marks = analyze(text).filter((mark) => mark.message.includes("reframing"));
		assert.equal(marks.length, 0, `must not fire: ${text}`);
	}
}

// MUST NOT FIRE: "critical" is not a machine-prose tell, and plain prose stays clean.
{
	assert.ok(!singleWords.some((word) => word.toLowerCase() === "critical"));
	const text = "The critical path was clear. We shipped on Friday and slept well.";
	assert.deepEqual(analyze(text), []);
}

// --- empty and degenerate input ---
assert.deepEqual(findSlop("", []), []);
assert.deepEqual(findSlop("", undefined), []);
assert.deepEqual(findSlop("   \n  ", []), []);
assert.deepEqual(findSlop(null, []), []);

// --- pathological input: 50k characters, no spaces, plus a regex trap ---
{
	const inputs = [
		"a".repeat(50000),
		"—".repeat(50000),
		`not just ${"x".repeat(50000)}`,
		"not just ".repeat(5000),
		`${"not only ".repeat(2500)}but`,
	];
	const started = Date.now();
	for (const text of inputs) {
		const sentences = [{ from: 0, to: text.length, text, words: 0, syllables: 0 }];
		findSlop(text, sentences);
	}
	const elapsed = Date.now() - started;
	assert.ok(elapsed < 2000, `pathological input took ${elapsed}ms`);
}

console.log("ok  deslop.test.mjs");
