// Regression tests for every mask defect found by the multi-agent review of 1.0.0-rc.
//
// Each one of these FAILED against the first implementation, and each one broke the
// product's central correctness claim: that no rule can ever fire inside code, math, or a
// URL. They are separated from mask.test.mjs so it stays obvious what they are for — if
// one of these ever goes red again, a real user is being told their code is passive voice.
import assert from "node:assert";
import { analyze } from "../src/core/ruleEngine.mjs";
import { maskText } from "../src/core/mask.mjs";

const rules = (doc) => analyze(doc, { isPro: true }).marks.map((mark) => mark.rule);

// --- fenced code inside a blockquote or a callout ------------------------------------
// The fence check used trimStart(), which strips spaces but not "> ", so a fence inside a
// blockquote was never recognised and every rule fired inside the code.
assert.deepEqual(
	rules("> ```js\n> const wasDeleted = obviously(x);\n> ```\n"),
	[],
	"a code fence inside a blockquote must be masked"
);
assert.deepEqual(
	rules("> [!note] Title\n> ```js\n> const wasQuicklyRemoved = clearly(y);\n> ```\n"),
	[],
	"a code fence inside a callout must be masked"
);

// --- fence length -----------------------------------------------------------------------
// A fence of N markers is closed only by a run of at least N. The first version hard-coded
// 3, so a 4-backtick fence was closed early by an inner ``` line and the rest of the block
// was linted as prose.
assert.deepEqual(
	rules("````\ncode was quickly deleted\n```\nstill code was obviously removed\n````\n"),
	[],
	"a 4-backtick fence is not closed by an inner 3-backtick line"
);
assert.deepEqual(rules("~~~~\nit was clearly removed\n~~~\nstill inside\n~~~~\n"), []);

// --- inline code spans of any length ------------------------------------------------------
// The regex was (`{1,3}), so a 4+ backtick span leaked its contents.
assert.deepEqual(
	rules("Use ````the value was quickly deleted```` here."),
	[],
	"a 4-backtick inline code span must be masked"
);
assert.deepEqual(rules("Use ``a ` tick and was obviously deleted`` here."), []);
// Unmatched backticks are literal text, not an unterminated span that eats the note.
assert.ok(rules("A ` stray tick and the file was quickly deleted.").includes("passive"));

// --- currency is not math -----------------------------------------------------------------
// /\$[^$\n]{1,500}?\$/ treated ANY two dollar signs on a line as a math span, so the entire
// clause between two prices was silently blanked and the analysis went blind to real prose.
const money = "It cost $5 and the report was quickly written by many experts for $10.";
const moneyRules = rules(money);
assert.ok(moneyRules.includes("passive"), "prose between two currency amounts must still be analyzed");
assert.ok(moneyRules.includes("adverb"));
assert.ok(maskText(money).includes("was quickly written"), "the clause must survive masking");
// Real inline math still masks.
assert.deepEqual(rules("The value $x = was_computed_slowly$ holds."), []);

// --- doubled words must not span a masked construct -----------------------------------------
// Adjacency was judged on the MASKED text, where a code span is spaces — so "the `x` the"
// read as a doubled word and painted a mark straight across the code.
assert.ok(!rules("the `code` the end").includes("doubled"), "a masked span is not adjacency");
assert.ok(!rules("the $x$ the end").includes("doubled"));
// A genuinely doubled word still fires.
assert.ok(rules("this is is wrong").includes("doubled"));

// --- ReDoS: leading whitespace ---------------------------------------------------------------
// The indented-code guard had two greedy quantifiers competing for the same run of spaces:
// 16,000 leading spaces took 147ms, on every keystroke. The old "pathological" test used
// "a".repeat(50000), which never enters that branch — the guard was theatre.
const started = Date.now();
for (const n of [10000, 40000]) {
	maskText(" ".repeat(n) + "x");
	maskText("\t".repeat(n) + "x");
}
const elapsed = Date.now() - started;
assert.ok(elapsed < 1000, `leading-whitespace masking must stay linear (took ${elapsed}ms)`);

console.log("ok  mask-regressions.test.mjs");
