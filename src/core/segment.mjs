/**
 * Sentence and word segmentation over MASKED text (see mask.mjs). Every offset
 * returned is an absolute offset into the original document.
 *
 * Blocks come first, and they matter more than they look. Obsidian users write in
 * two incompatible styles: one long line per paragraph, or hard-wrapped prose. If
 * you split sentences on every newline, hard-wrapped prose shatters into fragments
 * and the grade is nonsense. If you never split on newlines, a bullet list with no
 * terminal punctuation merges into one 200-word "sentence". So: consecutive plain
 * lines are joined into one block (soft wrap), while a list item, a quote, a table
 * row, or a heading is always its own block.
 */

import { countSyllables } from "./syllables.mjs";

/** A word is a run of letters that may contain apostrophes/hyphens inside it. */
const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

/** Lines that always stand alone rather than joining the paragraph above them. */
const STANDALONE_LINE = /^\s{0,6}(?:[-*+]\s|\d{1,9}[.)]\s|>|#{1,6}\s|\||\[[ xX]\]\s)/;

/**
 * Prose blocks in the document. A block never spans a blank line, and never merges
 * a list item with the line above it.
 *
 * @param {string} text original document
 * @param {string} masked same-length masked text
 * @returns {Array<{from: number, to: number}>}
 */
export function splitBlocks(text, masked) {
	const blocks = [];
	let start = -1;
	let lineFrom = 0;

	const flush = (end) => {
		if (start !== -1 && end > start && masked.slice(start, end).trim() !== "") {
			blocks.push({ from: start, to: end });
		}
		start = -1;
	};

	for (let i = 0; i <= text.length; i++) {
		const atEnd = i === text.length;
		if (!atEnd && text[i] !== "\n") continue;

		const raw = text.slice(lineFrom, i);
		const maskedLine = masked.slice(lineFrom, i);
		const blank = maskedLine.trim() === "";

		if (blank) {
			flush(lineFrom > 0 ? lineFrom - 1 : lineFrom);
		} else if (STANDALONE_LINE.test(raw)) {
			flush(lineFrom > 0 ? lineFrom - 1 : lineFrom);
			blocks.push({ from: lineFrom, to: i });
		} else if (start === -1) {
			start = lineFrom;
		}

		if (atEnd) {
			flush(i);
			break;
		}
		lineFrom = i + 1;
	}
	flush(text.length);

	// A standalone line pushed mid-stream can land out of order relative to a flush.
	blocks.sort((a, b) => a.from - b.from);
	return blocks;
}

/** Intl.Segmenter when the runtime has it (Obsidian desktop + mobile do), else regex. */
function sentenceSpans(chunk) {
	const Segmenter = typeof Intl !== "undefined" ? Intl.Segmenter : undefined;
	if (typeof Segmenter === "function") {
		try {
			const seg = new Segmenter("en", { granularity: "sentence" });
			const spans = [];
			for (const part of seg.segment(chunk)) {
				spans.push({ from: part.index, to: part.index + part.segment.length });
			}
			return spans;
		} catch {
			// Fall through to the regex path.
		}
	}
	return regexSentenceSpans(chunk);
}

/** Fallback splitter: terminal punctuation followed by whitespace. */
function regexSentenceSpans(chunk) {
	const spans = [];
	let from = 0;
	const re = /[.!?]+(?=\s|$)/g;
	let m;
	while ((m = re.exec(chunk)) !== null) {
		const to = m.index + m[0].length;
		spans.push({ from, to });
		from = to;
	}
	if (from < chunk.length) spans.push({ from, to: chunk.length });
	return spans;
}

/**
 * Every prose sentence in the document, with absolute offsets and word/syllable
 * counts. Whitespace-only sentences (all-masked regions) are dropped.
 *
 * @param {string} text
 * @param {string} masked
 * @returns {Array<{from: number, to: number, text: string, words: number, syllables: number}>}
 */
export function segmentSentences(text, masked) {
	const sentences = [];
	for (const block of splitBlocks(text, masked)) {
		// Newlines become spaces INSIDE a block before segmenting. Intl.Segmenter follows
		// UAX #29, where a hard line break terminates a sentence — which would shatter every
		// hard-wrapped paragraph into one "sentence" per line and make the grade meaningless
		// for anyone who wraps at 80 columns. Blocks already guarantee we never merge across
		// a blank line or a list item, so within a block a newline is just a space. Same
		// length, so every offset still lands exactly where it did.
		const chunk = masked.slice(block.from, block.to).replace(/\n/g, " ");
		for (const span of sentenceSpans(chunk)) {
			const absFrom = block.from + span.from;
			const absTo = block.from + span.to;
			const slice = masked.slice(absFrom, absTo);
			if (slice.trim() === "") continue;

			// Tighten to the first/last non-space so a sentence never starts on padding
			// left behind by a masked span.
			let from = absFrom;
			let to = absTo;
			while (from < to && /\s/.test(masked[from])) from++;
			while (to > from && /\s/.test(masked[to - 1])) to--;
			if (to <= from) continue;

			const tightened = masked.slice(from, to);
			const wordList = words(masked, from, to);
			let syllables = 0;
			for (const word of wordList) syllables += countSyllables(word.text);
			sentences.push({ from, to, text: tightened, words: wordList.length, syllables });
		}
	}
	return sentences;
}

/**
 * Words inside [from, to) of the masked text, with absolute offsets.
 *
 * @param {string} masked
 * @param {number} from
 * @param {number} to
 * @returns {Array<{from: number, to: number, text: string}>}
 */
export function words(masked, from, to) {
	const slice = masked.slice(from, to);
	const found = [];
	WORD_RE.lastIndex = 0;
	let m;
	while ((m = WORD_RE.exec(slice)) !== null) {
		found.push({ from: from + m.index, to: from + m.index + m[0].length, text: m[0] });
	}
	return found;
}
