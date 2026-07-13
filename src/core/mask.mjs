/**
 * Offset-preserving Markdown mask.
 *
 * `maskText` returns a string of EXACTLY the same length as its input, where every
 * character that is not prose has been replaced by a space. Every downstream module
 * (segmentation, rules, readability) runs on the masked string, so an offset in the
 * masked text is the same offset in the real document — no coordinate mapping, and
 * no rule can ever fire inside a code fence, a URL, or a math block.
 *
 * This is the thing the existing plugins in this space get wrong: they lint the raw
 * Markdown, so `const passive_result = was_computed(x)` inside a code block gets
 * flagged as passive voice, and a long URL counts as a 40-word sentence.
 *
 * What gets masked:
 *   - YAML frontmatter (only when it opens on line 1)
 *   - fenced code (``` and ~~~), including the fence lines
 *   - indented code blocks (4 spaces / a tab), when not inside a list
 *   - inline code spans (`x`, ``x``)
 *   - math ($$...$$ block and $...$ inline)
 *   - HTML comments and tags
 *   - wikilinks and embeds ([[...]], ![[...]]) in full
 *   - Markdown link/image URL parts — the visible [text] survives, the (url) does not
 *   - bare URLs
 *   - tags (#tag), footnote refs ([^1]), block ids (^abc123)
 *   - heading lines in full (a heading is not a prose sentence)
 *   - table rows in full
 *   - leading list/quote markers and emphasis punctuation (the words survive)
 *
 * Masking is applied in that order; each pass only overwrites characters that are
 * still unmasked, so a `#tag` inside a code fence can't "unmask" anything.
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

/** Line start offsets, for the line-oriented passes. */
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

function maskFrontmatter(text, out) {
	if (!text.startsWith("---")) return;
	const firstBreak = text.indexOf("\n");
	if (firstBreak === -1) return;
	// The opening fence must be exactly `---` on its own line.
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

function maskFencedCode(text, out) {
	const lines = lineRanges(text);
	let fence = null; // { marker: "```" | "~~~", indent: number }
	for (const { from, to } of lines) {
		const raw = text.slice(from, to);
		const trimmed = raw.trimStart();
		const isBacktick = trimmed.startsWith("```");
		const isTilde = trimmed.startsWith("~~~");
		if (fence === null) {
			if (isBacktick || isTilde) {
				fence = { marker: isBacktick ? "```" : "~~~" };
				blank(out, from, to);
			}
			continue;
		}
		blank(out, from, to);
		if (trimmed.startsWith(fence.marker)) fence = null;
	}
}

/**
 * Whole-line masks that depend on what the line IS: headings, table rows, indented
 * code. Also blanks the leading marker of list items and blockquotes (the words on
 * the line survive — only the `- `, `> `, `1. ` prefix is dropped).
 */
function maskLineKinds(text, out) {
	for (const { from, to } of lineRanges(text)) {
		const raw = text.slice(from, to);
		if (raw.trim() === "") continue;
		// Already fully masked (inside a fence)? Skip.
		if (out.slice(from, to).join("").trim() === "") continue;

		// Heading: not a prose sentence. Mask the whole line.
		if (/^\s{0,3}#{1,6}\s/.test(raw)) {
			blank(out, from, to);
			continue;
		}
		// Setext underline and thematic breaks.
		if (/^\s{0,3}(={2,}|-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
			blank(out, from, to);
			continue;
		}
		// Table row.
		if (/^\s{0,3}\|/.test(raw)) {
			blank(out, from, to);
			continue;
		}
		// Indented code block (4+ spaces or a tab, and not a list continuation).
		if (/^(\t| {4,})\S/.test(raw) && !/^(\t| {4,})\s*([-*+]|\d{1,9}[.)])\s/.test(raw)) {
			blank(out, from, to);
			continue;
		}
		// Leading blockquote and list markers: blank the marker, keep the text.
		const marker = /^\s{0,6}(>\s?|[-*+]\s+|\d{1,9}[.)]\s+|\[[ xX]\]\s+)+/.exec(raw);
		if (marker) blank(out, from, from + marker[0].length);
	}
}

/** Inline code spans: `x`, ``x with a ` in it``. Bounded — no nested quantifiers. */
function maskInlineCode(text, out) {
	const re = /(`{1,3})[^`\n]{0,2000}?\1/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
}

function maskMath(text, out) {
	// Block math first, so its inner `$` can't be seen as inline math.
	const block = /\$\$[\s\S]{0,5000}?\$\$/g;
	let m;
	while ((m = block.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
	}
	const inline = /\$[^$\n]{1,500}?\$/g;
	while ((m = inline.exec(text)) !== null) {
		blank(out, m.index, m.index + m[0].length);
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
		blank(out, start, textStart); // "![" / "["
		blank(out, textEnd, end); // "](url)"
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
 * "**obviously**" tokenizes as "obviously" glued to asterisks and never matches a
 * word list.
 */
function maskEmphasis(text, out) {
	const re = /(\*{1,3}|_{1,3}|={2}|~{2})/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		// Don't blank an underscore that sits inside a word (snake_case).
		const before = text[m.index - 1] ?? " ";
		const after = text[m.index + m[0].length] ?? " ";
		if (m[0][0] === "_" && /\w/.test(before) && /\w/.test(after)) continue;
		blank(out, m.index, m.index + m[0].length);
	}
}
