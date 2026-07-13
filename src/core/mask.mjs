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
	for (const { from, to } of lineRanges(text)) {
		const raw = text.slice(from, to);
		if (raw.trim() === "") continue;
		// Already fully masked (inside a fence)? Leave it.
		if (out.slice(from, to).join("").trim() === "") continue;

		const body = raw.slice(lineContext(raw).start);

		if (/^#{1,6}\s/.test(body)) {
			blank(out, from, to);
			continue;
		}
		if (/^(={2,}|-{3,}|\*{3,}|_{3,})\s*$/.test(body)) {
			blank(out, from, to);
			continue;
		}
		if (body.startsWith("|")) {
			blank(out, from, to);
			continue;
		}
		// Indented code: 4+ spaces or a tab, and not a list item.
		//
		// The two tests are kept disjoint on purpose. The original wrote the second as
		// /^(\t| {4,})\s*(marker)/ — two greedy quantifiers competing for the SAME run of
		// spaces, which backtracks quadratically: 16,000 leading spaces took 147ms, on
		// every keystroke. `[ \t]+` consumes the run exactly once.
		if (/^(\t| {4,})\S/.test(raw) && !/^[ \t]+(?:[-*+]|\d{1,9}[.)])\s/.test(raw)) {
			blank(out, from, to);
			continue;
		}

		const marker = /^\s{0,6}(>\s?|[-*+]\s+|\d{1,9}[.)]\s+|\[[ xX]\]\s+)+/.exec(raw);
		if (marker) blank(out, from, from + marker[0].length);
	}
}

/**
 * Inline code spans. A run of N backticks opens a span that only a run of exactly N
 * backticks closes (CommonMark). The regex this replaced capped N at 3, so ````x````
 * leaked its contents straight into the rule engine.
 *
 * The closer search is BOUNDED, and that bound is not an optimisation — it is the
 * correctness fix. An unbounded search let a stray backtick ("Press the ` key.") pair with
 * the opening backtick of a real code span forty lines later and blank every paragraph in
 * between, which then re-paired every code span after it. CommonMark forbids a code span
 * from containing a blank line, so the scan stops at one; the length cap bounds the cost
 * of a document full of unmatched backticks at the same time.
 */
const MAX_CODE_SPAN = 1000;

function maskInlineCode(text, out) {
	let i = 0;
	while (i < text.length) {
		if (text[i] !== "`") {
			i++;
			continue;
		}
		let openLength = 0;
		while (text[i + openLength] === "`") openLength++;

		let j = i + openLength;
		let closeStart = -1;
		const limit = Math.min(text.length, i + MAX_CODE_SPAN);
		while (j < limit) {
			if (text[j] === "\n" && isBlankLineBreak(text, j)) break;
			if (text[j] !== "`") {
				j++;
				continue;
			}
			let closeLength = 0;
			while (text[j + closeLength] === "`") closeLength++;
			if (closeLength === openLength) {
				closeStart = j;
				break;
			}
			j += closeLength;
		}

		if (closeStart === -1) {
			// No closer within the span's reach: the backticks are literal text.
			i += openLength;
			continue;
		}
		blank(out, i, closeStart + openLength);
		i = closeStart + openLength;
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
	const tag = /<\/?[A-Za-z][A-Za-z0-9-]{0,40}(\s[^<>\n]{0,500})?\/?>/g;
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
