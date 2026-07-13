/**
 * Flesch reading ease and Flesch-Kincaid grade level.
 *
 * Both are English-only — the syllable heuristic and the coefficients are fitted to
 * English, and running them over German or Portuguese produces confident nonsense.
 * The settings tab says so out loud rather than quietly lying to those users.
 */

/**
 * @param {Array<{words: number, syllables: number}>} sentences
 * @param {Record<string, number>} [counts] mark counts by rule id
 * @returns {import("./types.d.mts").Stats}
 */
export function computeStats(sentences, counts = {}) {
	const list = Array.isArray(sentences) ? sentences : [];
	let words = 0;
	let syllables = 0;
	let longest = 0;
	for (const sentence of list) {
		words += sentence.words;
		syllables += sentence.syllables;
		if (sentence.words > longest) longest = sentence.words;
	}
	const count = list.length;

	// An empty (or wordless) note has no reading ease. Return zeros rather than a
	// NaN that would render as "Grade NaN" in the status bar.
	if (count === 0 || words === 0) {
		return {
			words: 0,
			sentences: 0,
			syllables: 0,
			flesch: 0,
			grade: 0,
			avgSentenceWords: 0,
			longestSentenceWords: 0,
			counts: { ...counts },
		};
	}

	const wordsPerSentence = words / count;
	const syllablesPerWord = syllables / words;

	const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
	const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;

	return {
		words,
		sentences: count,
		syllables,
		flesch: round1(clamp(flesch, 0, 100)),
		grade: round1(Math.max(0, grade)),
		avgSentenceWords: round1(wordsPerSentence),
		longestSentenceWords: longest,
		counts: { ...counts },
	};
}

/** Plain-English label for a reading-ease score — friendlier than a bare number. */
export function easeLabel(flesch) {
	if (flesch >= 80) return "Very easy";
	if (flesch >= 60) return "Easy";
	if (flesch >= 50) return "Fairly hard";
	if (flesch >= 30) return "Hard";
	return "Very hard";
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function round1(value) {
	return Math.round(value * 10) / 10;
}
