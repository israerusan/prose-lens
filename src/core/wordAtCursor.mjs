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
