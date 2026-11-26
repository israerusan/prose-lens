/**
 * Whether the mask hid real WORDS between two words of a phrase.
 *
 * Every phrase-shaped rule (passive voice, cliches and hedges, de-slop, echo bigrams) works on
 * the masked text, where a code span is a run of spaces — so "the file was `x` deleted" reads
 * as "was deleted" unless the gap is checked against the source. But most of what the mask
 * blanks is SYNTAX the reader never sees as text: emphasis, link brackets, a quote's `>` on a
 * wrapped line, the `[[target|` in front of a wikilink alias. Treating those as content broke
 * "was [rejected](url)", "at the **end** of the day" and every passive wrapped across two
 * callout lines. So the line is drawn at letters and digits the mask hid — code, math, a URL —
 * with a wikilink's target (the part the alias replaces) counted as syntax.
 *
 * One rule, here, so the four callers cannot drift apart again.
 */

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * How long [from, to) reads to the reader: its length minus any `[[target|` prefix, which the
 * alias replaces on screen. Callers cap a phrase gap at a few characters, and counting the
 * target meant "was [[quarterly report|rejected]]" could never be a passive.
 *
 * @param {string} source
 * @param {string} masked
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function visibleGapLength(source, masked, from, to) {
	let length = to - from;
	if (typeof source !== "string" || source === masked || source.length !== masked.length) return length;
	for (let i = from; i < to - 1; i++) {
		if (source[i] !== "[" || source[i + 1] !== "[" || source[i] === masked[i]) continue;
		const pipe = targetPipe(source, i, to);
		if (pipe === -1) continue;
		length -= pipe - i + 1;
		i = pipe;
	}
	return length;
}

/** The `|` that ends a `[[target|` starting at `i`, searched within the gap only; else -1. */
function targetPipe(source, i, to) {
	for (let k = i + 2; k < to && source[k] !== "]"; k++) {
		if (source[k] === "|") return k;
	}
	return -1;
}

/**
 * @param {string} source the unmasked text
 * @param {string} masked the masked text, same length
 * @param {number} from
 * @param {number} to
 * @returns {boolean}
 */
export function hidesWords(source, masked, from, to) {
	if (typeof source !== "string" || source === masked || source.length !== masked.length) return false;
	for (let i = from; i < to; i++) {
		if (source[i] === masked[i]) continue;
		if (source[i] === "[" && source[i + 1] === "[") {
			// `[[target|` ahead of an alias: the target is the link, not words in the sentence.
			// Searched within the gap only: gaps are a few characters, the document is not.
			const pipe = targetPipe(source, i, to);
			if (pipe !== -1) {
				i = pipe;
				continue;
			}
		}
		if (WORD_CHAR.test(source[i])) return true;
	}
	return false;
}
