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
// "many" is a weasel word and sits OUTSIDE the passive span, so it survives the overlap
// resolver. ("quickly" does not — it is inside "was quickly written", and one stretch of
// prose gets one mark. See the overlap tests in rule-engine.test.mjs.)
assert.ok(moneyRules.includes("weasel"));
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

// =========================================================================================
// Round 2 — regressions introduced BY the first round of fixes, caught by re-reviewing the
// diff. Every one of these was a NEW bug in the fix, which is exactly why the diff gets its
// own review pass rather than being trusted because the tests were green.
// =========================================================================================

// --- a stray backtick must not pair across a blank line ------------------------------------
// The new closer scan was unbounded, so "Press the ` key." paired with the opening backtick
// of a real code span paragraphs later and BLANKED everything in between — then re-paired
// every span after it. CommonMark forbids a code span containing a blank line.
const stray = "Press the ` key.\n\nThis paragraph was quickly written by many experts.\n\nRun `npm test` now.";
const strayRules = rules(stray);
assert.ok(strayRules.includes("passive"), "a stray backtick must not blank the next paragraph");
// "many" survives; "quickly" is inside the passive span and the overlap resolver drops it.
assert.ok(strayRules.includes("weasel"));
assert.ok(maskText(stray).includes("was quickly written"));
// The real code span still masks.
assert.ok(!maskText(stray).includes("npm test"));

// --- a quoted fence must not close an unquoted one -----------------------------------------
// Fence tracking ignored blockquote depth, so "> ```" inside a ```markdown block CLOSED it.
// The block's real closer then OPENED a phantom fence that swallowed the rest of the note.
const quoted = "```markdown\n> ```\n> quoted\n```\n\nThis was clearly written by experts.";
// The point is that the prose after the block is ANALYZED at all; which rule fires is
// incidental. ("clearly" is inside the passive span "was clearly written", so the overlap
// resolver keeps the passive and drops the weasel — one mark per stretch of prose.)
assert.ok(
	rules(quoted).includes("passive"),
	"prose after a fenced block containing a quoted fence must still be analyzed"
);
assert.ok(!maskText(quoted).includes("quoted"), "the fenced content stays masked");

// --- an unclosed fence inside a quote must not swallow the note ------------------------------
const unclosed = "> ```js\n> const x = 1;\n\nThe rest was obviously written by the team.";
assert.ok(
	rules(unclosed).includes("passive"),
	"a blockquote ending must close a fence opened inside it"
);

// --- phrase marks must not span a masked construct --------------------------------------------
// findPhrases judged token gaps on the MASKED text, where a code span is spaces — so
// "the `sic` bottom line" matched the cliche "the bottom line" straight across the code.
assert.ok(
	!rules("But the `sic` bottom line is that it works.").includes("cliche"),
	"a phrase must not match across a masked span"
);
// The real cliche still fires.
assert.ok(rules("But the bottom line is that it works.").includes("cliche"));

// --- fences inside list items ------------------------------------------------------------------
assert.deepEqual(rules("1. Run this:\n\n    ```yaml\n    - task: was clearly deleted\n    ```\n"), []);
assert.deepEqual(rules("- item\n\n\t```js\n\tconst wasRemoved = clearly(x);\n\t```\n"), []);

// --- the bounded scans stay linear ---------------------------------------------------------------
const t0 = Date.now();
maskText("` x ".repeat(20000));
maskText("$a ".repeat(20000));
maskText("```\n".repeat(10000));
assert.ok(Date.now() - t0 < 2000, "the bounded scanners must stay linear");

console.log("ok  mask-regressions.test.mjs (round 2)");
