/**
 * Offset-preserving Markdown mask.
 *
 * `maskText` returns a string of EXACTLY the same length as its input, where every
 * character that is not prose has been replaced by a space. Every downstream module
 * (segmentation, rules, readability) runs on the masked string, so an offset in the
 * masked text is the same offset in the real document — no coordinate mapping, and no
 * rule can ever fire inside a code fence, a URL, or a math block.
 *
 * This is the thing the existing plugins in this space get wrong: they lint the raw
 * Markdown, so `const passive_result = was_computed(x)` inside a code block gets flagged
 * as passive voice, and a long URL counts as a 40-word sentence.
 *
 * The delimiter scanners below are hand-rolled rather than regex-based, deliberately.
 * Code spans and fences have variable-length delimiters (CommonMark: a run of N
 * backticks is closed only by a run of N backticks), which a regex either gets wrong or
 * gets right at the cost of catastrophic backtracking — and every one of these runs on
 * arbitrary prose on every keystroke.
 *
 * What gets masked:
 *   - YAML frontmatter (only when it opens on line 1)
 *   - fenced code (``` / ~~~, any fence length, INCLUDING inside a blockquote or callout)
 *   - indented code blocks (4 spaces / a tab), when not a list continuation
 *   - inline code spans of any backtick-run length
 *   - math ($$...$$ block and $...$ inline — but not currency)
 *   - HTML comments and tags
 *   - wikilinks and embeds ([[...]], ![[...]]) in full
 *   - Markdown link/image URL parts — the visible [text] survives, the (url) does not
 *   - bare URLs
 *   - tags (#tag), footnote refs ([^1]), block ids (^abc123)
 *   - heading lines in full (a heading is not a prose sentence)
 *   - table rows in full
 *   - leading list/quote markers and emphasis punctuation (the words survive)
 *
 * Each pass only blanks characters; a later pass can never resurrect one. Fenced code is
 * masked FIRST so a `#tag` or a `$x$` inside a code block can never be re-read as prose.
 */

const SPACE = " ";

/** Replace [from,to) with spaces, preserving newlines so line structure survives. */
function blank(chars, from, to) {
	const end = Math.min(to, chars.length);
	for (let i = Math.max(0, from); i < end; i++) {
		if (chars[i] !== "\n") chars[i] = SPACE;
	}
}

/**
 * @param {string} text
 * @returns {string} same-length text with every non-prose character blanked
 */
export function maskText(text) {
	if (typeof text !== "string" || text.length === 0) return "";
	// Index-based copy, NOT Array.from — Array.from splits by code point, which would
	// break the 1:1 offset parity that the whole design depends on for astral chars.
	const out = new Array(text.length);
	for (let i = 0; i < text.length; i++) out[i] = text[i];

	maskFrontmatter(text, out);
	maskFencedCode(text, out);
	maskLineKinds(text, out);
	maskInlineCode(text, out);
	maskMath(text, out);
	maskHtml(text, out);
	maskWikilinks(text, out);
	maskMarkdownLinks(text, out);
	maskBareUrls(text, out);
	maskTagsAndRefs(text, out);
	maskEmphasis(text, out);

	return out.join("");
}

/** Line start/end offsets, for the line-oriented passes. */
function lineRanges(text) {
	const lines = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\n") {
			lines.push({ from: start, to: i });
			start = i + 1;
		}
	}
	lines.push({ from: start, to: text.length });
	return lines;
}

/**
 * Where a line's real content starts, and how deeply it is quoted.
 *
 * Leading whitespace is consumed without a 3-space limit on purpose. CommonMark would
 * call a 4-space-indented ``` an indented code block rather than a fence — but indented
 * code is masked too, so the outcome is identical either way, while insisting on the
 * limit would fail to recognise a fence indented inside a list item, which is how
 * everyone actually writes them.
 *
 * `depth` is the number of blockquote markers. It matters: a fence opened inside a quote
 * must not be closed by an unquoted fence, and vice versa.
 */
function lineContext(raw) {
	let i = 0;
	let depth = 0;
	while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i++;
	while (raw[i] === ">") {
		depth++;
		i++;
		while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i++;
	}
	return { start: i, depth };
}

function maskFrontmatter(text, out) {
	if (!text.startsWith("---")) return;
	const firstBreak = text.indexOf("\n");
	if (firstBreak === -1) return;
	if (text.slice(0, firstBreak).trim() !== "---") return;
	const lines = lineRanges(text);
	for (let i = 1; i < lines.length; i++) {
		const line = text.slice(lines[i].from, lines[i].to).trim();
		if (line === "---" || line === "...") {
			blank(out, 0, lines[i].to);
			return;
		}
	}
	// Unterminated frontmatter: mask nothing rather than swallow the whole note.
}

/**
 * Fenced code, honouring the three CommonMark rules that matter here:
 *   - a fence may sit inside a blockquote or a callout (`> ```js`), or inside a list item
 *   - a fence of N markers is closed only by a run of AT LEAST N of the same marker, so a
 *     4-backtick fence is NOT closed by an inner ``` line
 *   - a fence lives inside its container. A ``` inside a blockquote does NOT close a fence
 *     opened outside it — that mistake let a quoted fence terminate an outer block, after
 *     which real prose was linted as code and the actual closer opened a phantom fence
 *     that blanked the rest of the note.
 */
function maskFencedCode(text, out) {
	let open = null; // { char, length, depth }

	for (const { from, to } of lineRanges(text)) {
		const raw = text.slice(from, to);
		const { start, depth } = lineContext(raw);
		const fence = fenceAt(raw, start);

		if (open === null) {
			if (fence) {
				open = { ...fence, depth };
				blank(out, from, to);
			}
			continue;
		}

		// The container that held the fence has ended (the quote stopped, or a blank line
		// broke it). An unterminated fence must not swallow the remainder of the note.
		if (depth < open.depth && raw.trim() !== "") {
			open = null;
			continue;
		}

		blank(out, from, to);

		// A closer must be the same marker, at least as long, at the same quote depth, and
		// bare — an info string is only allowed on the opener.
		if (
			fence &&
			fence.char === open.char &&
			fence.length >= open.length &&
			depth === open.depth &&
			raw.slice(start + fence.length).trim() === ""
		) {
			open = null;
		}
	}
}

/**
 * The cells of a table row: outer pipes optional, `\|` is an escaped literal pipe.
 */
function tableCells(body) {
	return splitRow(body).cells;
}

/** True when the row has at least one unescaped pipe — i.e. it can be a table row at all. */
function hasPipe(body) {
	return splitRow(body).pipes > 0;
}

/**
 * Split a row on unescaped pipes. A backslash escapes the NEXT character, whatever it is, so
 * `\|` is a literal pipe but `\\|` is a literal backslash followed by a real separator —
 * scanning in pairs gets the parity right without counting backslash runs.
 */
function splitRow(body) {
	const trimmed = body.trim();
	const cells = [];
	let cell = "";
	let pipes = 0;
	let leading = false;
	let trailing = false;
	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
		if (char === "\\" && i + 1 < trimmed.length) {
			cell += char + trimmed[i + 1];
			i++;
			continue;
		}
		if (char === "|") {
			pipes++;
			if (i === 0) leading = true;
			if (i === trimmed.length - 1) trailing = true;
			cells.push(cell);
			cell = "";
		} else {
			cell += char;
		}
	}
	cells.push(cell);
	if (leading) cells.shift();
	if (trailing && cells.length > 0) cells.pop();
	return { cells, pipes };
}

/**
 * True when `header` over `delimiter` opens a GFM table: the delimiter row is cells of
 * dashes with optional alignment colons, it has at least one unescaped pipe, and — as GFM
 * requires — it has exactly as many cells as the header. Without the count check, a line
 * of prose that merely contained a pipe was hidden whenever a dash row followed it.
 *
 * Tested per cell, not with one regex over the whole row, so trailing whitespace cannot set
 * two adjacent `[ \t]*` quantifiers backtracking.
 */
function opensTable(header, delimiter) {
	// Both rows need a real (unescaped) pipe; `a \| b` is one cell of prose.
	if (!hasPipe(header) || !hasPipe(delimiter) || !delimiter.includes("-")) return false;
	const delimiterCells = tableCells(delimiter);
	if (delimiterCells.length === 0) return false;
	if (!delimiterCells.every((cell) => /^[ \t]*:?-+:?[ \t]*$/.test(cell))) return false;
	return tableCells(header).length === delimiterCells.length;
}

/** The fence run beginning at `index`, or null. */
function fenceAt(raw, index) {
	const char = raw[index];
	if (char !== "`" && char !== "~") return null;
	let length = 0;
	while (raw[index + length] === char) length++;
	if (length < 3) return null;
	return { char, length };
}

/**
 * Whole-line masks that depend on what the line IS: headings, table rows, indented code.
 * Also blanks the leading marker of list items and blockquotes — the words on the line
 * survive, only the `- `, `> `, `1. ` prefix goes.
 */
function maskLineKinds(text, out) {
	// CommonMark: an indented code block cannot interrupt a paragraph (the indented line is a
	// lazy continuation of it), and inside a list an indented line after a blank is a
	// continuation paragraph of the item, not code. Masking either one blinded every rule to
	// real prose. `prevParagraph` is "the previous line was prose"; `inList` is "we are still
	// inside a list" — it survives blank lines and ends at an unindented non-list line.
	let prevParagraph = false;
	let inList = false;
	let prevBlank = true;
	// GFM table rows. A table is recognised by its delimiter row (`--- | :---:`), and the
	// outer pipes are OPTIONAL — `Name | Result` is a valid header. Only checking for a
	// leading `|` let every unpiped table reach the rule engine as prose, cells and all.
	// Keyed on the delimiter row so a lone `|` in an ordinary sentence stays prose.
	let inTable = false;
	const lines = lineRanges(text);
	for (let index = 0; index < lines.length; index++) {
		const { from, to } = lines[index];
		const raw = text.slice(from, to);
		if (raw.trim() === "") {
			prevParagraph = false;
			prevBlank = true;
			inTable = false;
			continue;
		}
		const wasBlank = prevBlank;
		prevBlank = false;
		// Already fully masked (inside a fence)? Leave it.
		if (out.slice(from, to).join("").trim() === "") {
			prevParagraph = false;
			continue;
		}

		const context = lineContext(raw);
		const body = raw.slice(context.start);
		const isListItem = /^[ \t]*(?:[-*+]|\d{1,9}[.)])\s/.test(raw);
		if (isListItem) inList = true;
		else if (wasBlank && !/^(\t| {2,})/.test(raw)) inList = false;

		if (/^#{1,6}\s/.test(body)) {
			blank(out, from, to);
			prevParagraph = false;
			// A heading can never be a lazy list continuation, so an unindented one ends the list.
			if (context.start === 0) inList = false;
			continue;
		}
		if (/^(={2,}|-{3,}|\*{3,}|_{3,})\s*$/.test(body)) {
			blank(out, from, to);
			prevParagraph = false;
			continue;
		}
		if (inTable && hasPipe(body)) {
			blank(out, from, to);
			continue;
		}
		inTable = false;
		if (body.includes("|") && index + 1 < lines.length) {
			const next = text.slice(lines[index + 1].from, lines[index + 1].to);
			const nextContext = lineContext(next);
			if (nextContext.depth === context.depth && opensTable(body, next.slice(nextContext.start))) {
				inTable = true;
				blank(out, from, to);
				prevParagraph = false;
				continue;
			}
		}
		if (body.startsWith("|")) {
			blank(out, from, to);
			prevParagraph = false;
			continue;
		}
		// Indented code: 4+ spaces or a tab, and not a list item.
		//
		// The two tests are kept disjoint on purpose. The original wrote the second as
		// /^(\t| {4,})\s*(marker)/ — two greedy quantifiers competing for the SAME run of
		// spaces, which backtracks quadratically: 16,000 leading spaces took 147ms, on
		// every keystroke. `[ \t]+` consumes the run exactly once.
		if (!prevParagraph && !inList && /^(\t| {4,})\S/.test(raw) && !isListItem) {
			blank(out, from, to);
			continue;
		}
		prevParagraph = true;

		const marker = /^\s{0,6}(>\s?|[-*+]\s+|\d{1,9}[.)]\s+|\[[ xX]\]\s+)+/.exec(raw);
		if (marker) blank(out, from, from + marker[0].length);

		// A callout's type marker — `> [!note]`, `> [!tip]-` — is syntax, not prose. Left in,
		// its "!" read as sentence-ending punctuation and split the title into a wordless
		// fragment that counted as a sentence in the grade. The title after it survives.
		if (context.depth > 0) {
			const callout = /^\[![^\]\n]{1,40}\][+-]?/.exec(body);
			if (callout) {
				const start = from + context.start;
				blank(out, start, start + callout[0].length);
			}
		}
	}
}

/**
 * Inline code spans. A run of N backticks opens a span that only a run of exactly N
 * backticks closes (CommonMark). The regex this replaced capped N at 3, so ````x````
 * leaked its contents straight into the rule engine.
 *
 * A span may not cross a blank line (CommonMark), and that is the ONLY bound. An earlier
 * version also capped a span at 1,000 characters, which made any longer valid span — a
 * pasted one-line command, a long regex — read as literal backticks with its contents
 * linted as prose. The cap existed to bound the cost of a paragraph full of unmatched
 * backticks; this version gets that bound structurally instead:
 *
 *   1. One pass collects every backtick run with its length and paragraph number.
 *   2. Runs are grouped by length. An opener's closer is the next run of the same length,
 *      found through a per-length cursor that only ever moves forward.
 *
 * Openers are visited in increasing position, so every cursor is monotonic and the whole
 * match is linear in the document — no input can make it quadratic. A stray backtick
 * ("Press the ` key.") still cannot pair across a paragraph break.
 */
function maskInlineCode(text, out) {
	/** @type {Array<{start: number, length: number, paragraph: number}>} */
	const runs = [];
	let paragraph = 0;
	for (let i = 0; i < text.length; ) {
		const char = text[i];
		if (char === "\n") {
			if (isBlankLineBreak(text, i)) paragraph++;
			i++;
			continue;
		}
		if (char !== "`") {
			i++;
			continue;
		}
		let length = 0;
		while (text[i + length] === "`") length++;
		runs.push({ start: i, length, paragraph });
		i += length;
	}
	if (runs.length < 2) return;

	/** @type {Map<number, number[]>} run indices, in document order, per run length */
	const byLength = new Map();
	runs.forEach((run, index) => {
		const list = byLength.get(run.length);
		if (list) list.push(index);
		else byLength.set(run.length, [index]);
	});
	/** @type {Map<number, number>} next unexamined position in each byLength list */
	const cursor = new Map();

	let consumedUntil = -1;
	for (let index = 0; index < runs.length; index++) {
		const opener = runs[index];
		if (opener.start < consumedUntil) continue;
		const list = byLength.get(opener.length) ?? [];
		let k = cursor.get(opener.length) ?? 0;
		while (k < list.length && list[k] <= index) k++;
		cursor.set(opener.length, k);
		if (k === list.length) continue;
		const closer = runs[list[k]];
		// No closer in this paragraph: the backticks are literal text.
		if (closer.paragraph !== opener.paragraph) continue;
		blank(out, opener.start, closer.start + closer.length);
		consumedUntil = closer.start + closer.length;
	}
}

/** True when the newline at `index` is followed by a line that is blank. */
function isBlankLineBreak(text, index) {
	let k = index + 1;
	while (k < text.length && (text[k] === " " || text[k] === "\t" || text[k] === "\r")) k++;
	return k >= text.length || text[k] === "\n";
}

function maskMath(text, out) {
	// Block math first, so its inner `$` can't be seen as inline math.
	const block = /\$\$[\s\S]{0,5000}?\$\$/g;
	let m;
	while ((m = block.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
	maskInlineMath(text, out);
}

/**
 * Inline math, WITHOUT eating currency.
 *
 * The old regex was /\$[^$\n]{1,500}?\$/g — any two dollar signs on a line. So
 * "It cost $5 and the report was written by experts for $10" silently blanked the entire
 * clause between the two amounts, and the analysis went blind to real prose. Money in a
 * note is far more common than inline LaTeX.
 *
 * The discriminator is the one LaTeX itself uses: a math span may not open with
 * whitespace or a digit (`$5` is money, `$x` is math), and may not close with whitespace.
 */
function maskInlineMath(text, out) {
	let i = 0;
	while (i < text.length) {
		if (text[i] !== "$") {
			i++;
			continue;
		}
		const after = text[i + 1];
		if (after === undefined || /[\s\d]/.test(after)) {
			i++;
			continue;
		}
		let j = i + 1;
		let close = -1;
		while (j < text.length && text[j] !== "\n" && j - i <= 500) {
			if (text[j] === "$" && !/\s/.test(text[j - 1])) {
				close = j;
				break;
			}
			j++;
		}
		if (close === -1) {
			i++;
			continue;
		}
		blank(out, i, close + 1);
		i = close + 1;
	}
}

function maskHtml(text, out) {
	const comment = /<!--[\s\S]{0,5000}?-->/g;
	let m;
	while ((m = comment.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
	// Quoted attribute values are consumed whole, so a `>` inside one (`title="a > b"`) does
	// not end the tag and leak the rest of the attribute into the rule engine as prose. The
	// three alternatives start with disjoint characters, so each position can be matched
	// exactly one way and a tag that never closes fails in linear time. A quoted value may
	// run to 100,000 characters: `<img src="data:image/png;base64,…">` is ordinary in a note,
	// and the old 500-character cap left every such tag, base64 and all, to the rules.
	const tag = /<\/?[A-Za-z][A-Za-z0-9-]{0,40}(\s(?:[^<>"'\n]|"[^"\n]{0,100000}"|'[^'\n]{0,100000}'){0,500})?\/?>/g;
	while ((m = tag.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
}

/** [[Note]], [[Note|alias]], ![[embed]] — masked in full. An alias is a label, not prose. */
function maskWikilinks(text, out) {
	const re = /!?\[\[[^\]\n]{0,300}\]\]/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
}

/** [text](url) and ![alt](url): keep `text`, mask the brackets and the whole (url). */
function maskMarkdownLinks(text, out) {
	const re = /(!?)\[([^\]\n]{0,300})\]\(([^)\s\n]{0,500})(\s+"[^"\n]{0,200}")?\)/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		const isImage = m[1] === "!";
		const textStart = start + m[1].length + 1;
		const textEnd = textStart + m[2].length;
		if (isImage) {
			blank(out, start, end); // alt text is not prose the reader reads
			continue;
		}
		blank(out, start, textStart);
		blank(out, textEnd, end);
	}
}

function maskBareUrls(text, out) {
	const re = /\b(?:https?:\/\/|www\.)[^\s<>()[\]]{1,2000}/gi;
	let m;
	while ((m = re.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
}

function maskTagsAndRefs(text, out) {
	// #tag / #nested/tag — must start at a boundary so "C#" and "issue #3" don't match.
	const tag = /(^|[\s([{])#[A-Za-zÀ-ɏ][\wÀ-ɏ/-]{0,80}/g;
	let m;
	while ((m = tag.exec(text)) !== null) {
		blank(out, m.index + m[1].length, m.index + m[0].length);
	}
	const footnote = /\[\^[^\]\n]{0,60}\]/g;
	while ((m = footnote.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
	const blockId = /\s\^[A-Za-z0-9-]{1,40}\s*$/gm;
	while ((m = blockId.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
}

/**
 * Emphasis and highlight punctuation only — the words inside survive. Without this,
 * "**obviously**" tokenizes as "obviously" glued to asterisks and never matches a list.
 */
function maskEmphasis(text, out) {
	const re = /(\*{1,3}|_{1,3}|={2}|~{2})/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		// Don't blank an underscore inside a word (snake_case).
		const before = text[m.index - 1] ?? " ";
		const after = text[m.index + m[0].length] ?? " ";
		if (m[0][0] === "_" && /\w/.test(before) && /\w/.test(after)) continue;
		blank(out, m.index, m.index + m[0].length);
	}
}
