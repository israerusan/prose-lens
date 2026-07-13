// End-to-end: the engine the plugin actually calls. The single most important assertion
// in this file is the masked-region invariant — NO rule may ever fire inside code, math,
// frontmatter, or a URL. That is the correctness claim the whole product makes.
import assert from "node:assert";
import { analyze, DEFAULT_RULE_OPTIONS } from "../src/core/ruleEngine.mjs";

const rulesFired = (text, options) => new Set(analyze(text, options).marks.map((mark) => mark.rule));

// --- the rules fire on prose ------------------------------------------------------
assert.ok(rulesFired("The ball was thrown by John.").has("passive"));
assert.ok(rulesFired("He quickly ran away.").has("adverb"));
assert.ok(rulesFired("It is arguably fine.").has("hedge"));
assert.ok(rulesFired("Many experts clearly agree.").has("weasel"));
assert.ok(rulesFired("This is is a typo.").has("doubled"));
assert.ok(
	rulesFired("At the end of the day it works.").has("cliche"),
	"cliche phrases must be detected"
);

const long = `${"word ".repeat(30)}end.`;
assert.ok(rulesFired(long).has("longSentence"));

// --- THE INVARIANT: nothing fires inside a masked region ---------------------------
const hostile = [
	"---",
	"summary: the report was quickly written by many experts",
	"---",
	"",
	"# The heading was obviously written badly",
	"",
	"```js",
	"// the value was clearly computed by the system",
	"const wasDeleted = obviously(veryQuickly);",
	"```",
	"",
	"Inline `was_deleted_quickly` and math $x = was_computed_slowly$ and a link",
	"https://example.com/it-was-obviously-deleted-very-quickly and [[A note was written]].",
	"",
	"| col | the row was clearly generated |",
	"| --- | --- |",
].join("\n");

const hostileAnalysis = analyze(hostile, { isPro: true });
assert.deepEqual(
	hostileAnalysis.marks,
	[],
	`no rule may fire inside masked regions, got: ${JSON.stringify(hostileAnalysis.marks.slice(0, 3))}`
);

// Every trigger word above lives inside a masked construct, so none of them may reach a
// sentence. (The connective prose on the inline-code line — "Inline ... and math ... and
// a link" — is real prose and SHOULD survive; that is what proves the mask is scoped and
// not just blanking the document.)
const survived = hostileAnalysis.sentences.map((sentence) => sentence.text).join(" ").toLowerCase();
for (const leaked of ["quickly", "obviously", "clearly", "was", "wasdeleted", "experts", "summary"]) {
	assert.ok(!survived.includes(leaked), `"${leaked}" leaked out of a masked region`);
}
assert.ok(survived.includes("math"), "prose between masked spans must survive");

// The very next line of real prose still gets marked, so the mask is not just "off".
const mixed = analyze(`${hostile}\n\nThe file was quickly deleted.`, { isPro: true });
assert.ok(mixed.marks.some((mark) => mark.rule === "passive"));

// --- the Pro gate lives in the engine ----------------------------------------------
const slop = "It's worth noting that we must delve into the rich tapestry.";
assert.equal(
	analyze(slop, { isPro: false }).marks.some((mark) => mark.rule === "deslop"),
	false,
	"a free user's analysis must never contain a de-slop mark"
);
assert.ok(
	analyze(slop, { isPro: true }).marks.some((mark) => mark.rule === "deslop"),
	"Pro must get de-slop marks"
);

// --- rule toggles -------------------------------------------------------------------
assert.equal(rulesFired("He quickly ran.", { rules: { adverb: false } }).has("adverb"), false);

// --- the ignore list ------------------------------------------------------------------
const ignored = analyze("He quickly ran and slowly walked.", { ignoredWords: ["quickly"] });
const adverbs = ignored.marks.filter((mark) => mark.rule === "adverb").map((mark) => mark.word);
assert.deepEqual(adverbs, ["slowly"], "an ignored word must be dropped, others kept");

// An ignore can never silence a rule with no word (passive, long sentence) by accident.
const stillPassive = analyze("The ball was thrown.", { ignoredWords: ["thrown", "was"] });
assert.ok(stillPassive.marks.some((mark) => mark.rule === "passive"));

// --- marks are sorted, in bounds, and non-empty ---------------------------------------
const prose =
	"The report was quickly written by many experts. At the end of the day, it is arguably fine. " +
	"He obviously walked very slowly toward the door and then he he stopped.";
const analysis = analyze(prose, { isPro: true });
for (let i = 1; i < analysis.marks.length; i++) {
	assert.ok(analysis.marks[i - 1].from <= analysis.marks[i].from, "marks must be sorted by offset");
}
for (const mark of analysis.marks) {
	assert.ok(mark.from >= 0 && mark.to <= prose.length, "a mark must be inside the document");
	assert.ok(mark.to > mark.from, "a mark must not be empty");
	assert.ok(mark.message.length > 0);
	assert.ok(DEFAULT_RULE_OPTIONS.rules[mark.rule] !== undefined, `unknown rule id: ${mark.rule}`);
}

// --- degenerate input --------------------------------------------------------------
for (const input of ["", "   ", null, undefined, 42]) {
	const result = analyze(input);
	assert.deepEqual(result.marks, []);
	assert.equal(result.stats.grade, 0);
}

// --- pathological input must not hang ------------------------------------------------
const started = Date.now();
analyze("a".repeat(50000), { isPro: true });
analyze("was ".repeat(10000), { isPro: true });
analyze(("The report was quickly written by many experts. ").repeat(500), { isPro: true });
const elapsed = Date.now() - started;
assert.ok(elapsed < 10000, `analysis of pathological input took ${elapsed}ms`);



// --- one lexical mark per word ---------------------------------------------------------
// "clearly" is both an adverb and a weasel word. Marking it twice painted two overlapping
// decorations on one word and showed the reader two tooltips for one problem.
const clearly = analyze("It clearly works.").marks.filter((mark) => mark.word === "clearly");
assert.equal(clearly.length, 1, "a word gets at most one lexical mark");
assert.equal(clearly[0].rule, "weasel", "weasel beats adverb — the advice is more specific");

// Precedence must not swallow the other rules: a plain adverb is still an adverb.
assert.equal(analyze("He walked quickly.").marks.filter((m) => m.word === "quickly")[0].rule, "adverb");

// --- the masked text rides along on the result -------------------------------------------
// The panel's echo pass reads it instead of re-reading the editor and re-masking the whole
// note on every keystroke.
const carried = analyze("The file was deleted.");
assert.equal(typeof carried.masked, "string");
assert.equal(carried.masked.length, "The file was deleted.".length);
// --- ONE statement per stretch of prose ---------------------------------------------------
// Rules legitimately fire on top of each other. Painting both means two overlapping underlines
// and two tooltips saying two things about the same words — the user does not care that two
// internal heuristics matched, they see the tool nagging twice, and in a writing tool noise
// reads as unreliability.
const overlapping = (doc) => {
	const found = analyze(doc, { isPro: true }).marks.filter((m) => m.rule !== "longSentence");
	const pairs = [];
	for (let i = 0; i < found.length; i++) {
		for (let j = i + 1; j < found.length; j++) {
			if (found[i].from < found[j].to && found[j].from < found[i].to) {
				pairs.push(`${found[i].rule}/${found[j].rule}`);
			}
		}
	}
	return pairs;
};

// The two the smoke test actually produced.
assert.deepEqual(overlapping("The report was quickly written by experts."), [], "passive swallows the adverb inside it");
assert.deepEqual(overlapping("It is not just thorough, it is transformative."), [], "the de-slop phrase swallows the hedge inside it");

// And a paragraph with every rule live.
assert.deepEqual(
	overlapping(
		"It is worth noting that this was quickly written by many experts, and it is not just thorough, it is transformative. " +
			"At the end of the day the the file should be flagged."
	),
	[],
	"no two marks may cover the same words"
);

// The containing mark is the one that survives, because it is the more contextual message.
const swallowed = analyze("The report was quickly written.", { isPro: true }).marks;
assert.deepEqual(swallowed.map((m) => m.rule), ["passive"]);
// ...and once the passive is fixed, the adverb comes back.
assert.ok(analyze("They wrote the report quickly.").marks.some((m) => m.rule === "adverb"));

// A doubled word is a TYPO, not a style opinion — it survives being contained by anything.
const typo = analyze("At the end of the the day it works.", { isPro: true });
assert.ok(typo.marks.some((m) => m.rule === "doubled"), "a doubled word is never swallowed");

// --- the modal passive is marked QUIETLY, not silenced ----------------------------------------
// "should be flagged" is genuinely passive and a writing tool should say so. But it is also the
// register of instructions and checklists, which is a lot of what lives in a vault — so it is
// reported at the quietest severity rather than at full weight.
const modal = analyze("This should be flagged.").marks.find((m) => m.rule === "passive");
assert.ok(modal, "a modal passive is still a passive and must still be marked");
assert.equal(modal.severity, "info", "...but quietly");

const real = analyze("The ball was thrown by John.").marks.find((m) => m.rule === "passive");
assert.equal(real.severity, "warn", "a plain passive keeps its full weight");

console.log("ok  rule-engine.test.mjs");
