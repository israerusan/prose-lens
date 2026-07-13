// Phrase-level fixtures: the file you argue with when a customer argues with you.
//
// Tuning a word list is a PRODUCT decision, not a code change — every entry is something the
// plugin will one day tell a paying writer is wrong with their prose. The lists themselves
// are just data; what matters is which SENTENCES fire and which stay silent. So this pins
// concrete sentences to concrete rules, in both directions.
//
// When someone disputes a flag, add their sentence here FIRST — to the FIRES or the SILENT
// table — and only then touch a list. That way the next person can see why an entry is in or
// out instead of guessing, and nobody re-adds a word that was deliberately dropped.
import assert from "node:assert";
import { analyze } from "../src/core/ruleEngine.mjs";
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

const rules = (doc) => analyze(doc, { isPro: true }).marks.map((mark) => mark.rule);

// --- these sentences MUST produce this rule ---------------------------------------------------
const FIRES = [
	["adverb", "He walked quickly toward the door."],
	["adverb", "She spoke softly."],
	["passive", "The ball was thrown by John."],
	["passive", "Mistakes were made."],
	["passive", "The bug has been fixed."],
	["passive", "It got broken."],
	["hedge", "It is arguably the best option."],
	["hedge", "I think we should go."],
	["weasel", "Many experts agree."],
	["weasel", "The results improved significantly."],
	["doubled", "This is is wrong."],
	["cliche", "At the end of the day it works."],
	["cliche", "We need to think outside the box."],
	["deslop", "Let us delve into the details."],
	["deslop", "It is worth noting that this matters."],
	["deslop", "A rich tapestry of ideas."],
	["deslop", "It is not just fast, it is transformative."],
	["longSentence", `${"word ".repeat(30)}end.`],
];

for (const [rule, sentence] of FIRES) {
	assert.ok(
		rules(sentence).includes(rule),
		`expected "${rule}" for: ${sentence}\n  got: ${rules(sentence).join(", ") || "nothing"}`
	);
}

// --- these sentences MUST STAY SILENT ------------------------------------------------------------
// Each one is a false positive that a real writer would (rightly) complain about. They are the
// reason the lists are conservative, and they are the first thing to break if someone "improves"
// a list by adding words to it.
const SILENT = [
	// -ly words that are not adverbs.
	["adverb", "The family reply was warm."],
	["adverb", "Please apply the supply to the assembly."],
	["adverb", "It was an ugly, silly, friendly holy day."],
	// Adjectives after "be" are not passives.
	["passive", "She was happy."],
	["passive", "It is red."],
	["passive", "The report is comprehensive."],
	["passive", "She was tired."],
	// -ed words that are not participles.
	["passive", "We need to speed up."],
	["passive", "It is indeed a problem."],
	// Progressive, not passive.
	["passive", "I am running."],
	["passive", "He was going to leave."],
	// "was able" is not a passive.
	["passive", "She was able to finish."],
	// Not doubled — a masked span sits between them.
	["doubled", "the `code` the end"],
	// A single em dash is a dash, not a machine-prose tell.
	["deslop", "The report — which was late — arrived."],
	// "just not right" is not the "not just X, it's Y" construction.
	["deslop", "That is just not right."],

	// DELIBERATE OMISSIONS — these were considered and left OFF the lists. Do not "fix" them.
	// The adjective "significant" is often a plain factual claim ("a statistically significant
	// result"); only the adverb "significantly" is the hand-wave. Same shape for the others.
	["weasel", "The result was statistically significant."],
	// "critical" is a real severity word in a real note, not machine prose.
	["deslop", "This is a critical bug."],
	// A heading is not a sentence, and a person's name is not a hedge.
	["hedge", "# Maybe Records, the label"],
];

for (const [rule, sentence] of SILENT) {
	assert.ok(
		!rules(sentence).includes(rule),
		`"${rule}" fired on a sentence that must stay silent: ${sentence}\n  got: ${rules(sentence).join(", ")}`
	);
}

// --- list hygiene ---------------------------------------------------------------------------------
// Cheap invariants that catch a fat-fingered edit before it becomes a support email.
const SETS = {
	ADVERB_EXCEPTIONS,
	HEDGE_WORDS,
	WEASEL_WORDS,
	DESLOP_WORDS,
	IRREGULAR_PARTICIPLES,
	NON_PARTICIPLE_ED,
	STOPWORDS,
};
for (const [name, set] of Object.entries(SETS)) {
	assert.ok(set.size > 0, `${name} must not be empty`);
	for (const entry of set) {
		assert.equal(entry, entry.toLowerCase().trim(), `${name}: "${entry}" must be lowercase and trimmed`);
		assert.ok(entry.length > 0, `${name} must not contain an empty entry`);
	}
}

const PHRASE_LISTS = { HEDGE_PHRASES, CLICHE_PHRASES, DESLOP_PHRASES };
for (const [name, list] of Object.entries(PHRASE_LISTS)) {
	assert.ok(list.length > 0, `${name} must not be empty`);
	assert.equal(new Set(list).size, list.length, `${name} contains a duplicate`);
	for (const phrase of list) {
		assert.equal(phrase, phrase.toLowerCase().trim(), `${name}: "${phrase}" must be lowercase and trimmed`);
		// Curly apostrophes never match: Obsidian's smart quotes rewrite the document, and the
		// matcher folds them the other way. A curly quote in a list is a phrase that can never fire.
		assert.ok(!/[’‘“”]/.test(phrase), `${name}: "${phrase}" has a curly quote and will never match`);
	}
}

// A word cannot be both a hedge and a weasel — they are contradictory advice on one span, and
// the overlap resolver would have to pick arbitrarily.
for (const word of HEDGE_WORDS) {
	assert.ok(!WEASEL_WORDS.has(word), `"${word}" is in both HEDGE_WORDS and WEASEL_WORDS`);
}

// Every adverb exception really does end in -ly, or it is doing nothing.
for (const word of ADVERB_EXCEPTIONS) {
	assert.ok(word.endsWith("ly"), `ADVERB_EXCEPTIONS: "${word}" does not end in -ly, so it suppresses nothing`);
}

// Every non-participle really does end in -ed, likewise.
for (const word of NON_PARTICIPLE_ED) {
	assert.ok(word.endsWith("ed"), `NON_PARTICIPLE_ED: "${word}" does not end in -ed`);
}

console.log("ok  wordlist-fixtures.test.mjs");
