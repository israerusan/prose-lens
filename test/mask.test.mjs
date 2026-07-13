// The mask is the foundation the whole product rests on: if it leaks, rules fire inside
// code blocks and URLs, which is exactly the bug the existing plugins in this space have.
// Two invariants matter more than any individual case:
//   1. the masked string is EXACTLY as long as the input (offsets are shared)
//   2. every character that survives masking is prose
import assert from "node:assert";
import { maskText } from "../src/core/mask.mjs";

/** Every masked region must be blank; every kept region must be intact. */
function assertMasked(text, needle) {
	const masked = maskText(text);
	assert.equal(masked.length, text.length, "mask must preserve length");
	const index = text.indexOf(needle);
	assert.notEqual(index, -1, `test bug: "${needle}" is not in the input`);
	const region = masked.slice(index, index + needle.length);
	assert.equal(region.trim(), "", `"${needle}" should have been masked, got "${region}"`);
}

function assertKept(text, needle) {
	const masked = maskText(text);
	const index = text.indexOf(needle);
	assert.notEqual(index, -1, `test bug: "${needle}" is not in the input`);
	assert.equal(
		masked.slice(index, index + needle.length),
		needle,
		`"${needle}" is prose and must survive masking`
	);
}

// --- length parity, the load-bearing invariant -------------------------------
for (const sample of [
	"",
	"plain prose",
	"---\ntitle: x\n---\nbody",
	"```js\nconst was_deleted = true;\n```",
	"a `code` b $x^2$ c https://example.com d [[Note]] e",
	"emoji 🎯 and accents café",
]) {
	assert.equal(maskText(sample).length, sample.length, `length parity broke on: ${sample}`);
}

// --- code must never be linted ----------------------------------------------
assertMasked("```js\nconst wasDeleted = obviously();\n```", "const wasDeleted = obviously();");
assertMasked("~~~\nwas quickly removed\n~~~", "was quickly removed");
assertMasked("Use the `was_deleted` flag.", "`was_deleted`");
assertKept("Use the `was_deleted` flag.", "Use the");

// --- frontmatter -------------------------------------------------------------
assertMasked("---\nstatus: was completed\n---\nReal prose here.", "status: was completed");
assertKept("---\nstatus: x\n---\nReal prose here.", "Real prose here.");
// A `---` that is NOT frontmatter (mid-document) must not swallow the note.
assert.ok(maskText("Hello.\n\n---\n\nWorld.").includes("Hello."));
assert.ok(maskText("Hello.\n\n---\n\nWorld.").includes("World."));

// --- math, URLs, links, wikilinks --------------------------------------------
assertMasked("The value $x = was_computed$ holds.", "$x = was_computed$");
assertMasked("See https://example.com/was-deleted for more.", "https://example.com/was-deleted");
assertMasked("Read [[My Note|the note]] now.", "[[My Note|the note]]");
assertMasked("Read [the docs](https://example.com/really) now.", "](https://example.com/really)");
assertKept("Read [the docs](https://example.com/really) now.", "the docs");

// --- headings and tables are not prose sentences ------------------------------
assertMasked("# A heading that was written badly\n\nBody.", "# A heading that was written badly");
assertMasked("| a | was deleted |\n", "| a | was deleted |");

// --- markers go, words stay ---------------------------------------------------
assertKept("- the item was removed", "the item was removed");
assertMasked("- the item was removed", "- ");
assertKept("> quoted prose here", "quoted prose here");
assertKept("**obviously** wrong", "obviously");
assertMasked("**obviously** wrong", "**");
// snake_case must not be shredded by the emphasis pass.
assertKept("the some_var name", "some_var");

// --- tags ---------------------------------------------------------------------
assertMasked("Tagged #project/alpha here.", "#project/alpha");
// A hash that is not a tag must survive.
assertKept("Issue #3 was filed", "#3");

// --- pathological input: must not hang ---------------------------------------
const started = Date.now();
maskText("`".repeat(5000));
maskText("a".repeat(50000));
maskText("$".repeat(5000));
maskText("[".repeat(5000) + "]".repeat(5000));
assert.ok(Date.now() - started < 2000, "masking pathological input must not hang");

console.log("ok  mask.test.mjs");
