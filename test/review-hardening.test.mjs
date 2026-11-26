// Regressions from the 1.1.3 adversarial review (codex + grok). Each case is an input a real
// note contains, with the outcome the rendered note implies.
import assert from "node:assert";
import { analyze } from "../src/core/ruleEngine.mjs";
import { maskText } from "../src/core/mask.mjs";
import { findSlop } from "../src/core/deslop.mjs";

const PRO = { isPro: true };
const marked = (text, opts = PRO) =>
	analyze(text, opts).marks.map((m) => `${m.rule}:${text.slice(m.from, m.to)}`);

function assertKept(text, needle) {
	const masked = maskText(text);
	assert.equal(masked.length, text.length, "mask must preserve length");
	const index = text.indexOf(needle);
	assert.notEqual(index, -1, `test bug: "${needle}" not in input`);
	assert.equal(masked.slice(index, index + needle.length), needle, `"${needle}" must survive`);
}

function assertMasked(text, needle) {
	const masked = maskText(text);
	assert.equal(masked.length, text.length, "mask must preserve length");
	const index = text.indexOf(needle);
	assert.notEqual(index, -1, `test bug: "${needle}" not in input`);
	assert.equal(masked.slice(index, index + needle.length).trim(), "", `"${needle}" must be masked`);
}

// A fence opened on the list item's own line closes with its indented closer, and the prose
// after it is analysed. It used to open a phantom root fence that blanked the rest of the note.
{
	const text = "- ```js\n  const x = 1;\n  ```\n\nAfterward it was quickly deleted.";
	assertMasked(text, "const x = 1;");
	assertKept(text, "Afterward it was quickly deleted.");
	assert.ok(marked(text).includes("passive:was quickly deleted"));
}
// ...inside a quote, with nested markers.
{
	const text = "> - ```js\n>   code was written\n>   ```\n> After it was quickly deleted.";
	assertMasked(text, "code was written");
	assertKept(text, "After it was quickly deleted.");
}
// ...and an unterminated one ends with its list item instead of swallowing the note.
{
	const text = "- ```js\n  code\nThe report was quickly written.";
	assertMasked(text, "code");
	assertKept(text, "The report was quickly written.");
}
// Round 2 (codex): a task-item fence, a `>` inside a list fence, and an unclosed indented
// fence under a list item must not swallow the prose that follows.
{
	const task = "- [ ] ```js\n  code was written\n  ```\n\nAfterward it was quickly deleted.";
	assertMasked(task, "code was written");
	assertKept(task, "Afterward it was quickly deleted.");

	const quoteInCode = "- ```\n  > literal code line\n  ```\n\nAfterward it was quickly deleted.";
	assertMasked(quoteInCode, "> literal code line");
	assertKept(quoteInCode, "Afterward it was quickly deleted.");

	const unclosed = "- Step:\n\n  ```js\n  const x = 1\nThe report was quickly written by Alice.";
	assertMasked(unclosed, "const x = 1");
	assertKept(unclosed, "The report was quickly written by Alice.");

	const sameLine = "- item\n  ```js\n  const x = 1\nNext paragraph was quickly written by Sam.";
	assertKept(sameLine, "Next paragraph was quickly written by Sam.");

	// a quoted fence inside a quoted list keeps its content masked at the right depth
	const quoted = "> - ```js\n>   > inner\n>   ```\n> After it was written.";
	assertMasked(quoted, "> inner");
	assertKept(quoted, "After it was written.");
}
// ...and a setext check never reaches into a quoted list item.
{
	const text = "> - The report was quickly written by Alice.\n> ---\n> Body.";
	assertKept(text, "The report was quickly written by Alice.");
}

// A fence that is NOT in a list keeps the old rule: unterminated runs to the end.
{
	const text = "```\ncode\nstill code";
	assertMasked(text, "still code");
}

// Trailing sentence punctuation stays outside a bare URL, so sentences do not merge.
{
	const text = "Read https://example.com/docs. This was clearly written.";
	assertMasked(text, "https://example.com/docs");
	assertKept(text, ". This was");
	assert.equal(analyze(text).sentences.length, 2);
}
{
	const text = "See www.example.com/a?b=1, then go.";
	assertMasked(text, "www.example.com/a?b=1");
	assertKept(text, ", then go.");
}

// A setext heading's text is a heading, not prose.
{
	const text = "The report was clearly written\n---\n\nBody text.";
	assertMasked(text, "The report was clearly written");
	assertKept(text, "Body text.");
	const multi = "Two line\nheading text\n===\n\nBody.";
	assertMasked(multi, "Two line\nheading text");
}
// ...but `---` under a list item is a thematic break, and the item stays prose.
{
	const text = "- item was written\n---\n\nBody.";
	assertKept(text, "item was written");
}
// ...and a `---` after a blank line is a break, never a heading.
{
	const text = "A paragraph was written.\n\n---\n\nBody.";
	assertKept(text, "A paragraph was written.");
}

// A line that only starts with a pipe is a paragraph in GFM, not a table.
{
	const text = "| The report was clearly written by editors.";
	assertKept(text, "The report was clearly written by editors.");
	// a real table still masks
	const table = "| a | b |\n|---|---|\n| was written | x |";
	assertMasked(table, "was written");
}

// An escaped backtick is a literal and cannot open a code span...
{
	const text = "Type \\` and the report was quickly written by editors \\` literally.";
	assertKept(text, "the report was quickly written by editors");
	assert.ok(marked(text).includes("passive:was quickly written"));
}
// ...but a backslash INSIDE code is literal, so `C:\` still closes at its backtick.
{
	const text = "Use `C:\\` and then it was quickly written.";
	assertMasked(text, "`C:\\`");
	assertKept(text, "and then it was quickly written.");
}

// Phrase rules never read across a paragraph break or masked code.
{
	assert.ok(!marked("At the end\n\nof the day, we leave.").some((m) => m.startsWith("cliche")));
	assert.ok(marked("At the end\nof the day, we leave.").some((m) => m.startsWith("cliche")));
	const code = "It is worth `x` noting.";
	assert.deepEqual(
		findSlop(maskText(code), analyze(code).sentences, code).filter((m) => m.from === 0),
		[]
	);
	assert.ok(!marked(code).some((m) => m.startsWith("deslop")));
	assert.ok(marked("It is worth noting that we left.").some((m) => m.startsWith("deslop")));
}

// Contracted be-verbs: 're / 'm always; 's only with an agent, since it may be "has".
{
	assert.ok(marked("You're invited by Sam.").includes("passive:You're invited"));
	assert.ok(marked("They're questioned every night.").includes("passive:They're questioned"));
	assert.ok(marked("It's written by Alice.").includes("passive:It's written"));
	assert.ok(!marked("He's assigned a task.").some((m) => m.startsWith("passive")));
	assert.ok(!marked("She's finished her draft.").some((m) => m.startsWith("passive")));
	assert.ok(!marked("John's written three books.").some((m) => m.startsWith("passive")));
	// typographic apostrophe too
	assert.ok(marked("They’re invited by Sam.").includes("passive:They’re invited"));
}

// --- round 1 (grok) ----------------------------------------------------------------------------

// Delimiters inside a code fence never pair with prose after it.
{
	const comment = "```html\n<!-- TODO\n```\n\nThe report was quickly written by the team.\n-->";
	assertKept(comment, "The report was quickly written by the team.");
	const tick = "```\nconst s = `hello\n```\nUse the `key` once.";
	assertKept(tick, "Use the ");
	assertMasked(tick, "`key`");
	const math = "```\n$$ open\n```\n\nThe report was quickly written.\n\n$$";
	assertKept(math, "The report was quickly written.");
}

// Passive voice and reframes never read across inline code; emphasis is fine.
{
	assert.ok(!marked("The file was `x` deleted by the script.").some((m) => m.startsWith("passive")));
	assert.ok(marked("The file was **quietly** deleted.").some((m) => m.startsWith("passive")));
	assert.ok(!marked("It is not just `x` but also wrong.").some((m) => m.startsWith("deslop")));
}

// Statives: no "name who did it" on a birth, a finish, a departure, a wedding...
{
	for (const text of [
		"She was born in Leeds in 1984.",
		"We were done by noon.",
		"The guests were gone.",
		"They got married in June.",
		"I am finished for today.",
	]) {
		assert.ok(!marked(text).some((m) => m.startsWith("passive")), text);
	}
	// ...unless an agent proves the verb reading.
	assert.ok(marked("The work was done by contractors.").some((m) => m.startsWith("passive")));
}

// Wrapped list items and quote lines are one sentence, not one per line.
{
	const list =
		"- The quarterly report was prepared by the finance team after\n  the auditors had already flagged three lines nobody could explain.";
	assert.equal(analyze(list).sentences.length, 1);
	const quote = "> The quarterly report was prepared by the finance team after\n> the auditors had already flagged three lines.";
	assert.equal(analyze(quote).sentences.length, 1);
	// ...but two list items never merge, and a quoted list item starts its own block.
	assert.equal(analyze("- first item\n- second item").sentences.length, 2);
	assert.equal(analyze("> intro line\n> - quoted item").sentences.length, 2);
}

// A wikilink alias is prose; the target and an embed are not.
{
	const text = "The [[Q3 budget|report was quickly written by the committee]] landed on Monday.";
	assertKept(text, "report was quickly written by the committee");
	assertMasked(text, "[[Q3 budget|");
	assert.ok(marked(text).some((m) => m.startsWith("passive")));
}

// Obsidian comments are hidden in reading view, so they are not prose.
{
	const text = "The draft is fine. %%The report was quickly written and it is obviously too long.%%";
	assertMasked(text, "%%The report was quickly written and it is obviously too long.%%");
	assertMasked("Before\n%%\nhidden was written\n%%\nAfter.", "hidden was written");
	assertKept("Ratio is 50%% of it was written.", "of it was written.");
}

// Phrases survive emphasis inside them.
{
	assert.ok(marked("At the **end** of the day we left.").some((m) => m.startsWith("cliche")));
	assert.ok(marked("It is **worth** noting that we left.").some((m) => m.startsWith("deslop")));
}

// Indented code inside a list item is code.
{
	const text = "- Install it:\n\n        const wasDeleted = obviously(x);\n        more();\n\n- Next was written.";
	assertMasked(text, "const wasDeleted = obviously(x);");
	assertMasked(text, "more();");
	assertKept(text, "Next was written.");
	// a continuation paragraph at the item's own indent is still prose
	assertKept("- item\n\n  Continuation was clearly written.", "Continuation was clearly written.");
}

// --- round 2 (grok) ----------------------------------------------------------------------------

// A setext underline never reaches back over list items.
{
	const text = "Action items\n- send the draft\n- book the room\n---\nNext paragraph was written by Alice.";
	assertKept(text, "Action items");
	assertKept(text, "send the draft");
	assertKept(text, "book the room");
}

// Masked SYNTAX in a gap is not hidden content: links, wikilink aliases, wrapped quote lines.
{
	assert.ok(marked("The bill was [rejected](https://example.com/bill) by the committee.").includes("passive:was [rejected"));
	assert.ok(marked("The plan was [[spec|rejected]] by the board.").some((m) => m.startsWith("passive")));
	assert.ok(marked("> The report was\n> prepared by the finance team.").some((m) => m.startsWith("passive")));
	assert.ok(marked("It is worth [noting](https://x.y) that we left.").some((m) => m.startsWith("deslop")));
	// ...while hidden WORDS still block.
	assert.ok(!marked("The file was `x` deleted.").some((m) => m.startsWith("passive")));
	assert.ok(!marked("At the `end` of the day we left.").some((m) => m.startsWith("cliche")));
}

// A tab- or space-indented ROOT fence ends at its closer, not at a less-indented line.
{
	const text = "\t```js\nconst flagged = obviously(true);\n\t```\n\tThe report was quickly written by Alice.";
	assertMasked(text, "const flagged = obviously(true);");
	// (The tab-indented line after the closer is an indented code block in CommonMark, so it
	// is masked too — correctly.)
	const spaces = "  ```\ncode was written\n  ```\n\nAfter it was written.";
	assertMasked(spaces, "code was written");
	assertKept(spaces, "After it was written.");
}

// A deadline after a determiner is not an agent; a real agent after one still is.
{
	assert.ok(!marked("We were done by the evening.").some((m) => m.startsWith("passive")));
	assert.ok(!marked("They're gone by next Friday.").some((m) => m.startsWith("passive")));
	assert.ok(marked("The work was done by the contractors.").some((m) => m.startsWith("passive")));
}

// Comments and code spans: whichever opens first wins.
{
	const text = "The value %%was `old%% is `new` now.";
	assertMasked(text, "%%was `old%%");
	assertKept(text, " is ");
	assertMasked(text, "`new`");
	const codeFirst = "Use `a %% b` and the report was quickly written %% hidden %%.";
	assertKept(codeFirst, "and the report was quickly written");
	assertMasked(codeFirst, "%% hidden %%");
	// a comment may span paragraphs
	assertMasked("Keep.\n\n%%\nhidden one\n\nhidden two\n%%\n\nKeep too.", "hidden two");
}

// Deeply indented list items stay their own items.
{
	const text = "- Plan the review\n    - Attack the fixes\n        - The report was clearly written by Alice";
	assert.equal(analyze(text).sentences.length, 3);
}

// --- round 3 (grok) ----------------------------------------------------------------------------
{
	// A long wikilink target does not count toward the phrase gap; the alias is the word.
	assert.ok(marked("The plan was [[quarterly report|rejected]] by the board.").some((m) => m.startsWith("passive")));
	assert.ok(marked("> The plan was\n> [[spec|rejected]] by the board.").some((m) => m.startsWith("passive")));
	assert.ok(marked("We left at the [[meeting notes|end]] of the day.").some((m) => m.startsWith("cliche")));
	// ...but a long code span still blocks, however it is spelled.
	assert.ok(!marked("The file was `[[a very long|thing]]` deleted.").some((m) => m.startsWith("passive")));

	// A quoted setext heading right after a list is still a heading.
	assertMasked("- buy milk\n> The report was clearly written\n> ---", "The report was clearly written");

	// More deadlines.
	for (const text of ["We were done by the end of the day.", "They're gone by next week.", "It was finished by the weekend."]) {
		assert.ok(!marked(text).some((m) => m.startsWith("passive")), text);
	}
}

console.log("review-hardening: ok");
