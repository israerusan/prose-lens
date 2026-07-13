/**
 * Heuristic English syllable counter. Flesch needs syllables-per-word and there is no
 * dictionary in the bundle — that is the whole point, this stays offline and tiny — so
 * this is the classic strip-then-count-vowel-groups heuristic with the corrections that
 * matter most in ordinary prose.
 *
 * It is wrong sometimes ("created" reads as 2, not 3). That is acceptable: Flesch is a
 * coarse gauge, and one word off by one syllable moves the grade by hundredths. What is
 * NOT acceptable is returning 0 — it would divide the grade into Infinity and render
 * "Grade NaN" — so the floor is 1 for anything with a letter.
 *
 * English only, and the settings tab says so rather than quietly producing confident
 * nonsense for German or Portuguese.
 */

/**
 * Endings whose vowel is silent and must be removed BEFORE counting groups:
 *   [^laeiouy]es  — "makes" -> "mak",   but not "tables" (the -le keeps its syllable)
 *   [^taeiouyd]ed — "walked" -> "walk", but not "wanted" (-ted) or "agreed" (vowel + ed)
 *   [^laeiouy]e   — "make" -> "mak",    but not "table"
 */
const SILENT_ENDING = /(?:[^laeiouy]es|[^taeiouyd]ed|[^laeiouy]e)$/;

/** A leading y is a consonant ("yellow"), not a vowel — but a medial one is ("rhythm"). */
const LEADING_Y = /^y/;

const VOWEL_GROUPS = /[aeiouy]+/g;

/**
 * @param {string} word
 * @returns {number} syllable count, minimum 1 for any word containing a letter
 */
export function countSyllables(word) {
	if (typeof word !== "string") return 0;
	const clean = word.toLowerCase().replace(/[^a-z]/g, "");
	if (clean.length === 0) return 0;
	// Short words are always one syllable, and short-circuiting them here keeps the
	// stripping rules from eating a whole word ("axe" -> "ax" -> ... -> 0).
	if (clean.length <= 3) return 1;

	const stripped = clean.replace(SILENT_ENDING, "").replace(LEADING_Y, "");

	VOWEL_GROUPS.lastIndex = 0;
	const groups = stripped.match(VOWEL_GROUPS);
	return Math.max(1, groups ? groups.length : 0);
}
