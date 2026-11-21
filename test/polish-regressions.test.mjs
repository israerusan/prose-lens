// Regressions from the 1.1.x polish pass: claims the product makes that the code did not keep.
import assert from "node:assert";
import { analyze } from "../src/core/ruleEngine.mjs";
import { maskText } from "../src/core/mask.mjs";
import { segmentSentences } from "../src/core/segment.mjs";

const rules = (doc) => analyze(doc, { isPro: true }).marks.map((mark) => mark.rule);
const sentencesOf = (text) => segmentSentences(text, maskText(text));

// --- callout type markers are syntax, not prose ------------------------------------------------
// The "!" in "> [!note]" read as a sentence end, so every callout title produced a wordless
// one-"sentence" fragment that counted toward the grade and the rhythm map.
{
	const doc = "> [!note] Callout title here\n> Body text works.";
	const masked = maskText(doc);
	assert.equal(masked.length, doc.length, "mask keeps length");
	assert.ok(!masked.includes("[!note]"), "the callout marker is masked");
	assert.ok(masked.includes("Callout title here"), "the callout title survives");
	assert.deepEqual(sentencesOf(doc).map((s) => s.words), [3, 3]);
	assert.ok(rules("> [!tip]- Folded title clearly\n").includes("weasel"));
}

// --- wordless fragments are not sentences ---------------------------------------------------------
{
	const withFragment = analyze("The cat sat down. 2024. The dog ran off.").stats;
	assert.equal(withFragment.sentences, 2, "a number-only fragment is not a sentence");
	assert.equal(withFragment.avgSentenceWords, 4);
	assert.ok(sentencesOf("— !").length === 0);
}

// --- indented lines that are NOT code ------------------------------------------------------------
// CommonMark: an indented line cannot interrupt a paragraph, and after a blank line inside a list
// it is a continuation paragraph of the item. Both were masked as code, silencing every rule.
assert.ok(rules("Para line one\n    continuation clearly here.").includes("weasel"));
assert.ok(rules("- item\n\n    Continuation paragraph clearly inside list.").includes("weasel"));
// Real indented code is still masked: after a blank line, a heading, or a closed fence, and
// a run of indented lines stays code.
assert.deepEqual(rules("Intro para.\n\n    const wasDeleted = obviously(x);\n"), []);
assert.deepEqual(rules("# Head\n    const wasDeleted = obviously(x);\n"), []);
assert.deepEqual(rules("- item\n\n# Head\n\n    const wasDeleted = obviously(x);\n"), []);
assert.deepEqual(rules("- item\n\nPara.\n\n    const wasDeleted = obviously(x);\n"), []);
assert.deepEqual(rules("```\nx\n```\n    const wasDeleted = obviously(x);\n"), []);
assert.deepEqual(rules("    code was clearly done\n    more code clearly\n"), []);



// --- every free rule keeps a distinct underline shape -----------------------------------------
// The README promises marks stay distinguishable without colour. The quiet (modal) passive
// overrode its double underline with `dotted` — the hedge's shape.
{
	const { readFileSync } = await import("node:fs");
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const block = (cls) => {
		const match = new RegExp(`\n\.${cls} \{([^}]*)\}`).exec(css);
		assert.ok(match, `styles.css has .${cls}`);
		return match[1];
	};
	const prop = (body, name) => (new RegExp(`${name}:\s*([^;]+);`).exec(body) ?? [])[1] ?? "";
	const shape = (cls) => {
		const body = block(cls);
		return `${prop(body, "text-decoration-style")}/${prop(body, "text-decoration-thickness") || "2px"}`;
	};
	const shapes = ["adverb", "passive", "hedge", "weasel", "cliche", "doubled"].map((rule) => shape(`pl-${rule}`));
	assert.equal(new Set(shapes).size, shapes.length, `free underline shapes must be distinct: ${shapes}`);
	assert.equal(prop(block("pl-quiet"), "text-decoration-style"), "", "the quiet passive keeps the passive's shape");
}
console.log("ok  polish-regressions.test.mjs");
