/**
 * The one entry point the plugin calls. Masks the document, segments it, runs every
 * enabled rule, applies the Pro gate and the user's ignore list, and returns marks +
 * sentences + stats in one pass.
 *
 * Everything here is pure: no `obsidian` import, no I/O, no clock. That is what lets the
 * whole linguistic layer be tested under plain Node with zero mocking, and it is why the
 * CodeMirror extension can stay a thin rendering shell.
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
 * Precedence for the single-word lexical rules. A word gets AT MOST ONE of these.
 *
 * "clearly" is both an adverb and a weasel word, and marking it twice paints two
 * overlapping decorations on one word and shows the reader two tooltips for one problem.
 * Weasel beats hedge beats adverb because that is the order of how specific the advice
 * is: "say who, or how many" is more actionable than "this is an adverb".
 */
const WORD_RULES = [
	{ rule: "weasel", set: WEASEL_WORDS, severity: "info", message: "Weasel word — say who, or how many" },
	{ rule: "hedge", set: HEDGE_WORDS, severity: "info", message: "Hedge — it weakens the claim" },
];

/** Phrase lists, matched as token runs rather than substrings. */
const PHRASE_RULES = [
	{ rule: "hedge", phrases: HEDGE_PHRASES, severity: "info", message: "Hedge — it weakens the claim" },
	{ rule: "cliche", phrases: CLICHE_PHRASES, severity: "info", message: "Cliche — the reader skips it" },
];

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
		// produces the mark, so there is nothing to leak into the DOM and nothing to strip
		// out later.
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

	const activeWordRules = WORD_RULES.filter((entry) => enabled(entry.rule));
	const markAdverbs = enabled("adverb");

	for (const sentence of sentences) {
		const wordList = words(masked, sentence.from, sentence.to);

		for (let i = 0; i < wordList.length; i++) {
			const word = wordList[i];
			const lower = word.text.toLowerCase();

			// One lexical mark per word, in precedence order.
			let matched = false;
			for (const entry of activeWordRules) {
				if (!entry.set.has(lower)) continue;
				marks.push({
					from: word.from,
					to: word.to,
					rule: entry.rule,
					severity: entry.severity,
					message: entry.message,
					word: lower,
				});
				matched = true;
				break;
			}
			if (!matched && markAdverbs && lower.length >= 4 && lower.endsWith("ly") && !ADVERB_EXCEPTIONS.has(lower)) {
				marks.push({
					from: word.from,
					to: word.to,
					rule: "adverb",
					severity: "info",
					message: "Adverb — a stronger verb usually beats one",
					word: lower,
				});
			}

			if (enabled("doubled") && i > 0) {
				const previous = wordList[i - 1];
				if (previous.text.toLowerCase() === lower) {
					// Adjacency is judged on the ORIGINAL text, not the masked text. Masked text
					// turns a code span into spaces, so `the \`x\` the` used to read as a doubled
					// word and painted a mark straight across the code.
					const gap = source.slice(previous.to, word.from);
					if (/^\s*$/.test(gap)) {
						marks.push({
							from: previous.from,
							to: word.to,
							rule: "doubled",
							severity: "warn",
							message: "Doubled word",
							word: lower,
						});
					}
				}
			}
		}

		if (enabled("passive")) {
			for (const span of findPassive(masked, sentence)) {
				// A modal passive ("this should be flagged") is the register of instructions and
				// checklists, which is a lot of what lives in a vault. Still passive, still
				// marked — but at the quietest severity, so the tool does not appear to be
				// arguing with the writer's own documentation.
				marks.push({
					from: span.from,
					to: span.to,
					rule: "passive",
					severity: span.modal ? "info" : "warn",
					message: span.modal
						? "Passive voice — fine in instructions, but naming who acts is stronger"
						: "Passive voice — name who did it",
				});
			}
		}
	}

	const activePhraseRules = PHRASE_RULES.filter((entry) => enabled(entry.rule));
	if (activePhraseRules.length > 0) {
		marks.push(...findPhrases(source, masked, activePhraseRules));
	}
	if (enabled("deslop")) {
		marks.push(...findSlop(masked, sentences));
	}

	marks = applyIgnores(marks, opts.ignoredWords);
	marks = resolveOverlaps(marks);
	marks.sort((a, b) => a.from - b.from || a.to - b.to || a.rule.localeCompare(b.rule));

	/** @type {Record<string, number>} */
	const counts = {};
	for (const mark of marks) counts[mark.rule] = (counts[mark.rule] ?? 0) + 1;

	return { marks, masked, sentences, stats: computeStats(sentences, counts) };
}

/**
 * Phrase matching as a single left-to-right token scan.
 *
 * The first version ran `indexOf` across the entire document once per phrase — about 89
 * full-document scans plus two whole-document `toLowerCase()` copies, on every keystroke.
 * This tokenizes the document once, buckets the phrases by their first word, and only
 * looks at a phrase when its opening word actually appears. Cost is O(document), not
 * O(phrases x document).
 *
 * Matching is token-based, so it is word-boundary-correct by construction: "just" can
 * never match inside "adjust".
 */
function findPhrases(source, masked, ruleEntries) {
	/** @type {Map<string, Array<{tokens: string[], entry: object}>>} */
	const buckets = new Map();
	for (const entry of ruleEntries) {
		for (const phrase of entry.phrases) {
			const tokens = String(phrase).toLowerCase().split(/\s+/).filter(Boolean);
			if (tokens.length === 0) continue;
			const bucket = buckets.get(tokens[0]);
			if (bucket) bucket.push({ tokens, entry });
			else buckets.set(tokens[0], [{ tokens, entry }]);
		}
	}
	if (buckets.size === 0) return [];

	const wordList = words(masked, 0, masked.length);
	const lower = wordList.map((word) => word.text.toLowerCase());
	const found = [];

	for (let i = 0; i < wordList.length; i++) {
		const candidates = buckets.get(lower[i]);
		if (!candidates) continue;

		// Longest phrase wins, so "at the end of the day" beats a shorter overlapping entry.
		let best = null;
		for (const candidate of candidates) {
			const { tokens } = candidate;
			if (i + tokens.length > wordList.length) continue;
			let ok = true;
			for (let t = 1; t < tokens.length; t++) {
				if (lower[i + t] !== tokens[t]) {
					ok = false;
					break;
				}
				// The words must be adjacent PROSE. The gap is judged on the source, not the
				// masked text — masked text turns a code span into spaces, so "the `sic` bottom
				// line" would otherwise read as the cliche "the bottom line" and paint a mark
				// straight across the code. Same invariant the doubled-word rule enforces.
				const from = wordList[i + t - 1].to;
				const until = wordList[i + t].from;
				if (until - from > 8 || /\S/.test(source.slice(from, until))) {
					ok = false;
					break;
				}
			}
			if (ok && (!best || tokens.length > best.tokens.length)) best = candidate;
		}
		if (!best) continue;

		const last = wordList[i + best.tokens.length - 1];
		found.push({
			from: wordList[i].from,
			to: last.to,
			rule: best.entry.rule,
			severity: best.entry.severity,
			message: best.entry.message,
			word: best.tokens.join(" "),
		});
		i += best.tokens.length - 1;
	}
	return found;
}

/**
 * Precedence for marks that land on the same words, highest first. Only used to break a
 * tie when two marks cover the SAME span; containment is settled by span length below.
 */
const RULE_RANK = {
	doubled: 70,
	deslop: 60,
	cliche: 50,
	passive: 40,
	hedge: 30,
	weasel: 25,
	adverb: 10,
};

/**
 * One statement per stretch of prose.
 *
 * Rules legitimately fire on top of each other — "was quickly written" is a passive span
 * with an adverb inside it, and the de-slop phrase "not just thorough, it's" contains the
 * hedge "just". Painting both means two overlapping underlines and two tooltips telling
 * the writer two things about the same words. The user does not care that two internal
 * heuristics matched; they see the tool nagging twice, and in a writing tool noise reads
 * as unreliability.
 *
 * So when one mark fully CONTAINS another, the containing mark wins: it is the more
 * contextual message, and once the writer fixes it the inner mark reappears if it still
 * applies. Two exceptions:
 *
 *   - `longSentence` is a different layer entirely (a background tint over a whole
 *     sentence, not an underline on a phrase). It contains almost everything by
 *     definition and must never suppress anything.
 *   - `doubled` survives being contained. It is a TYPO, not a style opinion, and it is the
 *     one mark a writer always wants to see.
 */
function resolveOverlaps(marks) {
	const layered = marks.filter((mark) => mark.rule !== "longSentence");
	if (layered.length < 2) return marks;

	// DOCUMENT order, longest-first on ties — not longest-first overall.
	//
	// The previous version sorted by length and then asked, for each mark, whether ANY mark
	// already kept contained it: `kept.some(...)`, a linear scan inside a loop over every
	// mark. Marks in prose almost never nest, so `kept` grows to n and the common case IS
	// the worst case — n squared over a four-clause predicate. On a 300,000-character draft
	// that was ~56ms of a ~211ms analysis, and it scales with MARK DENSITY, so it punished
	// exactly the adverb-heavy, hedge-heavy first drafts this plugin exists to fix.
	//
	// Sorting by `from` instead makes the whole question one number. Every mark seen so far
	// starts at or before the current one, so "is this mark contained?" reduces to "did
	// anything already seen reach at least as far right?" — a running maximum, checked in
	// constant time.
	//
	// It is safe to fold DROPPED marks into that maximum: containment is transitive, so if
	// the mark that reaches furthest was itself swallowed, whatever swallowed it also
	// contains the current mark. The outermost container is never dropped, so the answer is
	// the same one the pairwise scan gave.
	const ordered = [...layered].sort(
		(a, b) =>
			a.from - b.from ||
			b.to - a.to ||
			(RULE_RANK[b.rule] ?? 0) - (RULE_RANK[a.rule] ?? 0)
	);

	const dropped = new Set();
	/** The furthest right any non-`doubled` mark has reached. */
	let furthest = -1;
	for (const mark of ordered) {
		// A doubled word is a TYPO, not a style opinion: it is never suppressed, and it never
		// suppresses anything either, so it stays out of the running maximum entirely.
		if (mark.rule === "doubled") continue;
		if (mark.to <= furthest) dropped.add(mark);
		else furthest = mark.to;
	}

	return marks.filter((mark) => !dropped.has(mark));
}

/**
 * Drop marks the user has muted. Ignores are matched on the mark's `word`, so a rule with
 * no word (passive voice, long sentence) can never be silenced by accident — it has to be
 * turned off as a rule instead.
 */
function applyIgnores(marks, ignoredWords) {
	if (!Array.isArray(ignoredWords) || ignoredWords.length === 0) return marks;
	const ignored = new Set(
		ignoredWords.map((word) => String(word).toLowerCase().trim()).filter(Boolean)
	);
	if (ignored.size === 0) return marks;
	return marks.filter((mark) => !(mark.word && ignored.has(mark.word)));
}
