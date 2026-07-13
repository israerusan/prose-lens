/**
 * Echo detection (Pro): the words and two-word phrases a writer leans on inside a
 * short span of prose. A crutch word is only a crutch when it clusters — "system"
 * eight times in a 3000-word note is fine, three times in four sentences is not —
 * so qualification is decided over a sliding window of sentences, while the count
 * and offsets we report cover the whole document.
 *
 * There are no regexes here at all (tokenisation is delegated to segment.mjs), and
 * every pass is linear in the number of words, so a single 50k-word "sentence" costs
 * a few map writes per word rather than a quadratic scan.
 */

import { words } from "./segment.mjs";
import { STOPWORDS } from "./wordlists.mjs";

export const DEFAULT_ECHO_OPTIONS = {
	windowSentences: 4,
	minCount: 3,
	minWordLength: 4,
	maxResults: 25,
};

const STOP = STOPWORDS instanceof Set ? STOPWORDS : new Set(STOPWORDS);

function positiveInt(value, fallback, min) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const n = Math.floor(value);
	return n >= min ? n : fallback;
}

function resolveOptions(options) {
	const o = options || {};
	return {
		windowSentences: positiveInt(o.windowSentences, DEFAULT_ECHO_OPTIONS.windowSentences, 1),
		// A "repetition" of two is a coincidence in English; refuse to go below three.
		minCount: positiveInt(o.minCount, DEFAULT_ECHO_OPTIONS.minCount, 3),
		minWordLength: positiveInt(o.minWordLength, DEFAULT_ECHO_OPTIONS.minWordLength, 2),
		maxResults: positiveInt(o.maxResults, DEFAULT_ECHO_OPTIONS.maxResults, 0),
	};
}

/** "they're" -> "they": stopword lists carry base forms, not every contraction. */
function baseForm(lower) {
	let cut = lower.indexOf("'");
	if (cut < 0) cut = lower.indexOf("’");
	return cut > 0 ? lower.slice(0, cut) : lower;
}

function isStopword(lower) {
	return STOP.has(lower) || STOP.has(baseForm(lower));
}

/**
 * @param {string} masked
 * @param {{from: number, to: number}} sentence
 */
function tokenize(masked, sentence) {
	const found = words(masked, sentence.from, sentence.to);
	const tokens = new Array(found.length);
	for (let i = 0; i < found.length; i++) {
		const w = found[i];
		const lower = w.text.toLowerCase();
		tokens[i] = {
			lower,
			from: w.from,
			stop: isStopword(lower),
			// Capitalisation anywhere but the sentence opening is our only proper-noun
			// signal, and the opening tells us nothing because every sentence starts big.
			mid: i > 0,
			midCap: i > 0 && w.text[0] !== lower[0],
		};
	}
	return tokens;
}

/** Word terms and bigram terms for one sentence, duplicates kept so counts stay honest. */
function sentenceTerms(tokens, minWordLength) {
	const wordTerms = [];
	const phraseTerms = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (!t.stop && t.lower.length >= minWordLength) wordTerms.push(t.lower);
		const next = tokens[i + 1];
		// "of the", "and it" — a bigram of two function words is noise, never a tic.
		if (next && !(t.stop && next.stop)) phraseTerms.push(t.lower + " " + next.lower);
	}
	return { wordTerms, phraseTerms };
}

function addTerms(counts, terms, qualified, minCount) {
	for (const term of terms) {
		const n = (counts.get(term) || 0) + 1;
		counts.set(term, n);
		if (n >= minCount) qualified.add(term);
	}
}

function removeTerms(counts, terms) {
	for (const term of terms) {
		const n = counts.get(term) - 1;
		if (n > 0) counts.set(term, n);
		else counts.delete(term);
	}
}

/**
 * A term whose every mid-sentence occurrence is capitalised is a name, a product, or
 * an acronym. Those repeat because the subject repeats, and flagging them is the
 * fastest way to make an echo panel look stupid.
 */
function isProperNoun(caps, term) {
	const c = caps.get(term);
	return !!c && c.mid > 0 && c.midCap === c.mid;
}

function sameOffsets(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * Echoed words and phrases, strongest first.
 *
 * @param {string} masked masked document text (see mask.mjs)
 * @param {Array<{from: number, to: number}>} sentences
 * @param {Partial<typeof DEFAULT_ECHO_OPTIONS>} [options]
 * @returns {Array<{term: string, kind: "word"|"phrase", count: number, offsets: number[]}>}
 */
export function findEchoes(masked, sentences, options) {
	if (typeof masked !== "string" || !Array.isArray(sentences) || sentences.length === 0) return [];
	const opt = resolveOptions(options);
	if (opt.maxResults === 0) return [];

	// Pass 1: slide a window of `windowSentences` sentences and record which terms ever
	// reach `minCount` inside one. Each sentence enters and leaves the window once, so a
	// term's window count is maintained incrementally rather than recomputed per window.
	const window = opt.windowSentences;
	const ring = new Array(Math.min(window, sentences.length));
	const wordWindow = new Map();
	const phraseWindow = new Map();
	const echoedWords = new Set();
	const echoedPhrases = new Set();

	for (let i = 0; i < sentences.length; i++) {
		if (i >= window) {
			const leaving = ring[i % window];
			removeTerms(wordWindow, leaving.wordTerms);
			removeTerms(phraseWindow, leaving.phraseTerms);
		}
		const entry = sentenceTerms(tokenize(masked, sentences[i]), opt.minWordLength);
		ring[i % window] = entry;
		addTerms(wordWindow, entry.wordTerms, echoedWords, opt.minCount);
		addTerms(phraseWindow, entry.phraseTerms, echoedPhrases, opt.minCount);
	}
	if (echoedWords.size === 0 && echoedPhrases.size === 0) return [];

	// Pass 2: document-wide counts and offsets, for qualifying terms only.
	const tracked = new Set(echoedWords);
	for (const phrase of echoedPhrases) {
		const space = phrase.indexOf(" ");
		tracked.add(phrase.slice(0, space));
		tracked.add(phrase.slice(space + 1));
	}

	const wordOffsets = new Map();
	const phraseOffsets = new Map();
	const caps = new Map();

	for (const sentence of sentences) {
		const tokens = tokenize(masked, sentence);
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (tracked.has(t.lower)) {
				let c = caps.get(t.lower);
				if (!c) caps.set(t.lower, (c = { mid: 0, midCap: 0 }));
				if (t.mid) c.mid++;
				if (t.midCap) c.midCap++;
			}
			if (echoedWords.has(t.lower)) {
				const hits = wordOffsets.get(t.lower);
				if (hits) hits.push(t.from);
				else wordOffsets.set(t.lower, [t.from]);
			}
			const next = tokens[i + 1];
			if (!next) continue;
			const phrase = t.lower + " " + next.lower;
			if (!echoedPhrases.has(phrase)) continue;
			const hits = phraseOffsets.get(phrase);
			if (hits) {
				hits.first.push(t.from);
				hits.second.push(next.from);
			} else {
				phraseOffsets.set(phrase, { first: [t.from], second: [next.from] });
			}
		}
	}

	const results = [];
	for (const [term, offsets] of wordOffsets) {
		if (isProperNoun(caps, term)) continue;
		results.push({ term, kind: "word", count: offsets.length, offsets });
	}

	for (const [term, hits] of phraseOffsets) {
		const space = term.indexOf(" ");
		const first = term.slice(0, space);
		const second = term.slice(space + 1);
		if (isProperNoun(caps, first) || isProperNoun(caps, second)) continue;

		// If the phrase lands on exactly the same occurrences as a word we already
		// report ("the pipeline" x4 wrapping every "pipeline"), it is one finding, not
		// two. Equal counts plus identical offsets is the only case where that is safe;
		// a word that also appears outside the phrase is a genuinely different fact.
		const count = hits.first.length;
		const firstWord = wordOffsets.get(first);
		const secondWord = wordOffsets.get(second);
		const duplicate =
			(firstWord && firstWord.length === count && sameOffsets(firstWord, hits.first)) ||
			(secondWord && secondWord.length === count && sameOffsets(secondWord, hits.second));
		if (duplicate) continue;

		results.push({ term, kind: "phrase", count, offsets: hits.first });
	}

	results.sort((a, b) => {
		if (b.count !== a.count) return b.count - a.count;
		return a.term < b.term ? -1 : a.term > b.term ? 1 : 0;
	});
	return results.length > opt.maxResults ? results.slice(0, opt.maxResults) : results;
}
