/**
 * The one entry point the plugin calls. Masks the document, segments it, runs every
 * enabled rule, applies the Pro gate and the user's ignore list, and returns marks +
 * sentences + stats in one pass.
 *
 * Everything here is pure: no `obsidian` import, no I/O, no clock. That is what lets
 * the whole linguistic layer be tested under plain Node with zero mocking, and it is
 * why the CodeMirror extension can stay a thin rendering shell.
 */

import { maskText } from "./mask.mjs";
import { segmentSentences, words } from "./segment.mjs";
import { computeStats } from "./readability.mjs";
import { findPassive } from "./passive.mjs";
import { findSlop } from "./deslop.mjs";
import { isProOnlyRule } from "./featureGates.mjs";
import {
	ADVERB_EXCEPTIONS,
	CLICHE_PHRASES,
	HEDGE_PHRASES,
	HEDGE_WORDS,
	WEASEL_WORDS,
} from "./wordlists.mjs";

/** @type {import("./types.d.mts").RuleOptions} */
export const DEFAULT_RULE_OPTIONS = Object.freeze({
	rules: Object.freeze({
		adverb: true,
		passive: true,
		hedge: true,
		weasel: true,
		doubled: true,
		cliche: true,
		longSentence: true,
		deslop: true,
	}),
	longSentenceWords: 25,
	veryLongSentenceWords: 40,
	ignoredWords: [],
	isPro: false,
});

/**
 * Analyze a document.
 *
 * @param {string} text raw note content
 * @param {Partial<import("./types.d.mts").RuleOptions>} [options]
 * @returns {import("./types.d.mts").Analysis}
 */
export function analyze(text, options = {}) {
	const opts = {
		...DEFAULT_RULE_OPTIONS,
		...options,
		rules: { ...DEFAULT_RULE_OPTIONS.rules, ...(options.rules ?? {}) },
	};
	const source = typeof text === "string" ? text : "";
	const masked = maskText(source);
	const sentences = segmentSentences(source, masked);

	const enabled = (rule) => {
		if (opts.rules[rule] === false) return false;
		// The Pro gate lives here, not in the UI: a free user's analysis simply never
		// produces the mark, so there is nothing to leak into the DOM and nothing to
		// strip out later.
		if (isProOnlyRule(rule) && opts.isPro !== true) return false;
		return true;
	};

	/** @type {import("./types.d.mts").Mark[]} */
	let marks = [];

	if (enabled("longSentence")) {
		for (const sentence of sentences) {
			if (sentence.words >= opts.veryLongSentenceWords) {
				marks.push({
					from: sentence.from,
					to: sentence.to,
					rule: "longSentence",
					severity: "strong",
					message: `Very long sentence (${sentence.words} words) — hard to read in one pass`,
				});
			} else if (sentence.words >= opts.longSentenceWords) {
				marks.push({
					from: sentence.from,
					to: sentence.to,
					rule: "longSentence",
					severity: "warn",
					message: `Long sentence (${sentence.words} words)`,
				});
			}
		}
	}

	for (const sentence of sentences) {
		const wordList = words(masked, sentence.from, sentence.to);

		if (enabled("adverb")) {
			for (const word of wordList) {
				const lower = word.text.toLowerCase();
				if (lower.length < 4 || !lower.endsWith("ly")) continue;
				if (ADVERB_EXCEPTIONS.has(lower)) continue;
				marks.push({
					from: word.from,
					to: word.to,
					rule: "adverb",
					severity: "info",
					message: "Adverb — a stronger verb usually beats one",
					word: lower,
				});
			}
		}

		if (enabled("hedge")) {
			for (const word of wordList) {
				const lower = word.text.toLowerCase();
				if (!HEDGE_WORDS.has(lower)) continue;
				marks.push({
					from: word.from,
					to: word.to,
					rule: "hedge",
					severity: "info",
					message: "Hedge — it weakens the claim",
					word: lower,
				});
			}
		}

		if (enabled("weasel")) {
			for (const word of wordList) {
				const lower = word.text.toLowerCase();
				if (!WEASEL_WORDS.has(lower)) continue;
				marks.push({
					from: word.from,
					to: word.to,
					rule: "weasel",
					severity: "info",
					message: "Weasel word — say who, or how many",
					word: lower,
				});
			}
		}

		if (enabled("doubled")) {
			for (let i = 1; i < wordList.length; i++) {
				const previous = wordList[i - 1];
				const current = wordList[i];
				if (previous.text.toLowerCase() !== current.text.toLowerCase()) continue;
				// Only when they really are adjacent — "had had" is fine, "the ... the" is not
				// a doubled word, it is two sentences' worth of distance.
				if (masked.slice(previous.to, current.from).trim() !== "") continue;
				marks.push({
					from: previous.from,
					to: current.to,
					rule: "doubled",
					severity: "warn",
					message: "Doubled word",
					word: current.text.toLowerCase(),
				});
			}
		}

		if (enabled("passive")) {
			for (const span of findPassive(masked, sentence)) {
				marks.push({
					from: span.from,
					to: span.to,
					rule: "passive",
					severity: "warn",
					message: "Passive voice — name who did it",
				});
			}
		}
	}

	if (enabled("hedge")) {
		marks.push(
			...findPhrases(masked, HEDGE_PHRASES, "hedge", "info", "Hedge — it weakens the claim")
		);
	}
	if (enabled("cliche")) {
		marks.push(
			...findPhrases(masked, CLICHE_PHRASES, "cliche", "info", "Cliche — the reader skips it")
		);
	}
	if (enabled("deslop")) {
		marks.push(...findSlop(masked, sentences));
	}

	marks = applyIgnores(marks, opts.ignoredWords);
	marks.sort((a, b) => a.from - b.from || a.to - b.to || a.rule.localeCompare(b.rule));

	/** @type {Record<string, number>} */
	const counts = {};
	for (const mark of marks) counts[mark.rule] = (counts[mark.rule] ?? 0) + 1;

	return { marks, sentences, stats: computeStats(sentences, counts) };
}

/** Whole-phrase, word-boundary matches of a lowercase phrase list in masked text. */
function findPhrases(masked, phrases, rule, severity, message) {
	const found = [];
	const haystack = masked.toLowerCase();
	for (const phrase of phrases) {
		if (!phrase) continue;
		let index = haystack.indexOf(phrase);
		while (index !== -1) {
			const before = index === 0 ? " " : haystack[index - 1];
			const afterIndex = index + phrase.length;
			const after = afterIndex >= haystack.length ? " " : haystack[afterIndex];
			// Anchor on non-word boundaries so "just" doesn't match inside "adjust".
			if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
				found.push({
					from: index,
					to: afterIndex,
					rule,
					severity,
					message,
					word: phrase,
				});
			}
			index = haystack.indexOf(phrase, index + 1);
		}
	}
	return found;
}

/**
 * Drop marks the user has muted. Ignores are matched on the mark's `word`, so a rule
 * with no word (passive voice, long sentence) can never be silenced by accident — it
 * has to be turned off as a rule instead.
 */
function applyIgnores(marks, ignoredWords) {
	if (!Array.isArray(ignoredWords) || ignoredWords.length === 0) return marks;
	const ignored = new Set(ignoredWords.map((word) => String(word).toLowerCase().trim()).filter(Boolean));
	if (ignored.size === 0) return marks;
	return marks.filter((mark) => !(mark.word && ignored.has(mark.word)));
}
