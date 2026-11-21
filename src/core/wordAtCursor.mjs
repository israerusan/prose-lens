/**
 * The word straddling a cursor position on a line. Pure, so the right-click "ignore this
 * word" flow is testable without an editor — it used to be a private helper buried in
 * main.ts, where nothing could reach it.
 *
 * Letters, apostrophes and hyphens only, and the result is trimmed of leading/trailing
 * punctuation, so right-clicking "well-known," yields "well-known" rather than a token the
 * ignore list would never match against a mark's `word`.
 */

const WORD_CHAR = /[A-Za-zÀ-ÖØ-öø-ÿ'’-]/;
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

/**
 * @param {string} line
 * @param {number} ch cursor column
 * @returns {string|null} the word, or null when the cursor is not on one
 */
export function wordAtCursor(line, ch) {
	if (typeof line !== "string" || line.length === 0) return null;
	if (typeof ch !== "number" || ch < 0) return null;

	let start = Math.min(ch, line.length);
	let end = start;
	while (start > 0 && WORD_CHAR.test(line[start - 1])) start--;
	while (end < line.length && WORD_CHAR.test(line[end])) end++;

	const word = line.slice(start, end).replace(/^[-'’]+|[-'’]+$/g, "");
	return HAS_LETTER.test(word) ? word : null;
}

/**
 * The mark the right-click "stop marking" entry should offer to ignore, or null.
 *
 * It used to require the mark's `word` to equal the single word under the cursor, so every
 * PHRASE mark — the hedge "I think", every cliche, every multi-word de-slop phrase — could
 * never be ignored: right-clicking "think" never matched the mark's word "i think". A
 * curly-apostrophe de-slop word ("it’s", stored folded as "it's") failed the same way. The
 * ignore list has always matched on the mark's own `word`, so that is what is offered.
 *
 * @param {ReadonlyArray<import("./types.d.mts").Mark>} marks
 * @param {number} offset document offset of the cursor
 * @param {ReadonlyArray<string>} [ignoredWords]
 * @returns {import("./types.d.mts").Mark | null}
 */
export function ignorableMarkAt(marks, offset, ignoredWords = []) {
	if (!Array.isArray(marks) || typeof offset !== "number") return null;
	for (const mark of marks) {
		if (!mark.word || mark.from > offset || mark.to < offset) continue;
		if (ignoredWords.includes(mark.word)) continue;
		return mark;
	}
	return null;
}
