import assert from "node:assert/strict";

import {
	ADVERB_EXCEPTIONS,
	CLICHE_PHRASES,
	DESLOP_PHRASES,
	DESLOP_WORDS,
	HEDGE_PHRASES,
	HEDGE_WORDS,
	IRREGULAR_PARTICIPLES,
	NON_PARTICIPLE_ED,
	STOPWORDS,
	WEASEL_WORDS,
} from "../src/core/wordlists.mjs";

const SETS = {
	ADVERB_EXCEPTIONS,
	DESLOP_WORDS,
	HEDGE_WORDS,
	IRREGULAR_PARTICIPLES,
	NON_PARTICIPLE_ED,
	STOPWORDS,
	WEASEL_WORDS,
};

const LISTS = {
	CLICHE_PHRASES,
	DESLOP_PHRASES,
	HEDGE_PHRASES,
};

// Every export exists, has the right shape, and is not empty.
for (const [name, set] of Object.entries(SETS)) {
	assert.ok(set instanceof Set, `${name} must be a Set`);
	assert.ok(set.size > 0, `${name} must not be empty`);
}
for (const [name, list] of Object.entries(LISTS)) {
	assert.ok(Array.isArray(list), `${name} must be an array`);
	assert.ok(list.length > 0, `${name} must not be empty`);
}

// Rough size floors: these lists are the product, and a truncated one silently
// degrades every rule that reads it.
assert.ok(ADVERB_EXCEPTIONS.size >= 40);
assert.ok(IRREGULAR_PARTICIPLES.size >= 70);
assert.ok(STOPWORDS.size >= 100);
assert.ok(CLICHE_PHRASES.length >= 25);
assert.ok(DESLOP_PHRASES.length >= 30);

// Callers lowercase the token before lookup, so a capitalised or padded entry is
// dead weight that can never match.
for (const [name, set] of Object.entries(SETS)) {
	for (const entry of set) {
		assert.equal(typeof entry, "string", `${name} entries must be strings`);
		assert.equal(entry, entry.toLowerCase(), `${name}: "${entry}" is not lowercase`);
		assert.equal(entry, entry.trim(), `${name}: "${entry}" is not trimmed`);
		assert.ok(entry.length > 0, `${name} has an empty entry`);
	}
}
for (const [name, list] of Object.entries(LISTS)) {
	for (const phrase of list) {
		assert.equal(typeof phrase, "string", `${name} entries must be strings`);
		assert.equal(phrase, phrase.toLowerCase(), `${name}: "${phrase}" is not lowercase`);
		assert.equal(phrase, phrase.trim(), `${name}: "${phrase}" is not trimmed`);
		assert.ok(phrase.length > 0, `${name} has an empty entry`);
		assert.ok(!/\s{2,}/.test(phrase), `${name}: "${phrase}" has doubled whitespace`);
		// Smart quotes would never match text the caller has normalised to ASCII.
		assert.ok(!/[‘’“”]/.test(phrase), `${name}: "${phrase}" has a curly quote`);
	}
}

// A phrase list with a duplicate double-marks the same span.
for (const [name, list] of Object.entries(LISTS)) {
	assert.equal(new Set(list).size, list.length, `${name} has duplicate phrases`);
}

// Longest-first ordering is the contract a first-match scanner depends on.
for (const [name, list] of Object.entries(LISTS)) {
	for (let i = 1; i < list.length; i++) {
		assert.ok(
			list[i - 1].length >= list[i].length,
			`${name} is not sorted longest-first at index ${i}`,
		);
	}
}

// Hedging and overstating are opposite advice; a word cannot be both.
for (const word of HEDGE_WORDS) {
	assert.ok(!WEASEL_WORDS.has(word), `"${word}" is in both HEDGE_WORDS and WEASEL_WORDS`);
}

// The passive rule reads these two lists as accept/reject; an overlap is undefined.
for (const word of IRREGULAR_PARTICIPLES) {
	assert.ok(
		!NON_PARTICIPLE_ED.has(word),
		`"${word}" is in both IRREGULAR_PARTICIPLES and NON_PARTICIPLE_ED`,
	);
}

for (const word of ADVERB_EXCEPTIONS) {
	assert.ok(word.endsWith("ly"), `ADVERB_EXCEPTIONS: "${word}" does not end in "ly"`);
}
for (const word of NON_PARTICIPLE_ED) {
	assert.ok(word.endsWith("ed"), `NON_PARTICIPLE_ED: "${word}" does not end in "ed"`);
}

// The guards that exist because of specific false positives we hit.
for (const word of ["family", "reply", "only", "supply", "likely", "italy", "july"]) {
	assert.ok(ADVERB_EXCEPTIONS.has(word), `ADVERB_EXCEPTIONS is missing "${word}"`);
}
for (const word of ["need", "indeed", "speed", "hundred", "sacred", "wicked"]) {
	assert.ok(NON_PARTICIPLE_ED.has(word), `NON_PARTICIPLE_ED is missing "${word}"`);
}
for (const word of ["been", "written", "taken", "brought", "understood", "put"]) {
	assert.ok(IRREGULAR_PARTICIPLES.has(word), `IRREGULAR_PARTICIPLES is missing "${word}"`);
}
for (const word of ["delve", "tapestry", "underscores", "myriad"]) {
	assert.ok(DESLOP_WORDS.has(word), `DESLOP_WORDS is missing "${word}"`);
}

// Words we must NEVER flag: real content words that look like list members.
for (const word of ["really", "family", "the", "important", "explore", "use"]) {
	assert.ok(!WEASEL_WORDS.has(word), `WEASEL_WORDS must not contain "${word}"`);
}
for (const word of ["important", "key", "use", "help", "build"]) {
	assert.ok(!DESLOP_WORDS.has(word), `DESLOP_WORDS must not contain "${word}"`);
}
// "published" is a plain regular participle; the passive rule must be free to fire.
for (const word of ["published", "learned", "fed", "freed"]) {
	assert.ok(!NON_PARTICIPLE_ED.has(word), `NON_PARTICIPLE_ED must not contain "${word}"`);
}

// Empty input: a lookup on "" must be a clean miss, never a throw.
for (const [name, set] of Object.entries(SETS)) {
	assert.equal(set.has(""), false, `${name} matches the empty string`);
}

// Pathological input: rules feed us whatever the user typed. Set lookups are
// hashed, not scanned, so a 50k-char token must miss instantly.
const pathological = "a".repeat(50000);
const started = Date.now();
for (const set of Object.values(SETS)) {
	assert.equal(set.has(pathological), false);
}
for (const list of Object.values(LISTS)) {
	assert.ok(!list.includes(pathological));
}
assert.ok(Date.now() - started < 200, "lookups on a 50k-char token were slow");

// The arrays are frozen so a rule cannot sort or splice the shared data in place.
for (const [name, list] of Object.entries(LISTS)) {
	assert.ok(Object.isFrozen(list), `${name} must be frozen`);
}

console.log("ok  wordlists.test.mjs");
