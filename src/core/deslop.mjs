/**
 * De-slop: the phrasing tells of machine-generated prose.
 *
 * This is a HIGHLIGHTER, not a detector. It emits no score, no percentage, no
 * "78% likely AI" verdict, and it never will. Per-document AI classification is
 * statistically indefensible — the same sentence can be typed by a person or by a
 * model, and every published classifier has a false-positive rate that ruins real
 * writers. What we can honestly say is "this exact phrase shows up constantly in
 * model output"; the writer decides whether that matters. So: marks only.
 *
 * We also deliberately skip the "rule of three" / triadic-list detector that these
 * packs usually ship. Humans write triads all the time; it fires on good prose.
 */

import { words } from "./segment.mjs";
import { DESLOP_PHRASES, DESLOP_WORDS } from "./wordlists.mjs";

const RULE = "deslop";
const SLOP_MESSAGE = "Common in machine-generated prose";
const EMDASH_MESSAGE = "Em dash pile-up is a machine-prose tell";
const REFRAME_MESSAGE = 'The "not just X, it\'s Y" reframing is a machine-prose tell';

/**
 * Whitespace budget allowed between two words of a phrase. Masking turns emphasis
 * markers and inline code into spaces, so "in **today's** world" arrives with a wider
 * gap than a plain space; a soft-wrapped line adds a newline. Anything beyond that is
 * a different clause and must not glue a phrase together across it.
 */
const MAX_GAP = 8;

/**
 * The reframing construction. The gap is bounded and excludes `.` and `;` so a match
 * cannot leap a clause boundary ("It was not just wrong. But we shipped it." is two
 * thoughts, not the construction), while `.` is still allowed as the *connector* of
 * the "not just X. It's Y" variant. Bounded classes only — these run on every keystroke
 * against arbitrary prose, so no nested quantifiers and no unbounded backtracking.
 */
const REFRAME_PATTERNS = [
	/\bnot\s{1,3}only\b[^\n.;]{1,60}?\bbut\s{1,3}also\b/gi,
	/(?:\b(?:it|that|this)['’]s\s{1,3})?\b(?:isn['’]t|aren['’]t|not)\s{1,3}just\b[^\n.;]{1,60}?\bbut\b/gi,
	/(?:\b(?:it|that|this)['’]s\s{1,3})?\b(?:isn['’]t|aren['’]t|not)\s{1,3}just\b[^\n.;]{1,60}?[,:—–.]\s{0,4}(?:it['’]s|it\s{1,3}is|they['’]re|that['’]s|this\s{1,3}is)\b/gi,
];

/** Lowercase, and fold curly apostrophes so "it’s" and "it's" are one token. */
function normalize(value) {
	return String(value).toLowerCase().replace(/[’‘‛]/g, "'");
}

/** Tokenize a list entry with the SAME tokenizer the document goes through. */
function tokenize(entry) {
	const text = String(entry);
	return words(text, 0, text.length).map((word) => normalize(word.text));
}

/**
 * Two lookup tables built once at load. Single-token entries are a plain map; entries
 * with more than one token are grouped by their first token, longest first, so the
 * longest phrase at a position wins and we never emit a word mark nested inside it.
 */
function buildTables() {
	const single = new Map();
	const multi = new Map();

	const add = (entry, severity) => {
		const tokens = tokenize(entry);
		if (tokens.length === 0) return;
		if (tokens.length === 1) {
			// Phrases are added first, so a warn phrase outranks a same-string info word.
			if (!single.has(tokens[0])) single.set(tokens[0], severity);
			return;
		}
		const head = tokens[0];
		const bucket = multi.get(head) ?? [];
		bucket.push({ tokens, severity, text: tokens.join(" ") });
		multi.set(head, bucket);
	};

	for (const phrase of DESLOP_PHRASES ?? []) add(phrase, "warn");
	for (const word of DESLOP_WORDS ?? []) add(word, "info");
	for (const bucket of multi.values()) bucket.sort((a, b) => b.tokens.length - a.tokens.length);

	return { single, multi };
}

const { single: SINGLE, multi: MULTI } = buildTables();

/** Only whitespace, and not too much of it, may sit between two words of a phrase. */
function gapIsTight(masked, from, to) {
	if (to - from > MAX_GAP) return false;
	for (let i = from; i < to; i++) {
		const char = masked[i];
		if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r") return false;
	}
	return true;
}

/** Longest list entry starting at token `i`, or null. */
function matchAt(masked, tokens, lowered, i) {
	const bucket = MULTI.get(lowered[i]);
	if (!bucket) return null;

	for (const candidate of bucket) {
		const length = candidate.tokens.length;
		if (i + length > tokens.length) continue;
		let ok = true;
		for (let k = 1; k < length; k++) {
			if (lowered[i + k] !== candidate.tokens[k]) {
				ok = false;
				break;
			}
			if (!gapIsTight(masked, tokens[i + k - 1].to, tokens[i + k].from)) {
				ok = false;
				break;
			}
		}
		if (ok) return candidate;
	}
	return null;
}

/** Reframing matches, de-overlapped: three patterns can all cover one construction. */
function findReframes(masked) {
	const hits = [];
	for (const pattern of REFRAME_PATTERNS) {
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(masked)) !== null) {
			if (match[0].length === 0) {
				pattern.lastIndex++;
				continue;
			}
			hits.push({ from: match.index, to: match.index + match[0].length });
		}
	}
	hits.sort((a, b) => a.from - b.from || b.to - a.to);

	const kept = [];
	let end = -1;
	for (const hit of hits) {
		if (hit.from < end) continue;
		kept.push({
			from: hit.from,
			to: hit.to,
			rule: RULE,
			severity: "warn",
			message: REFRAME_MESSAGE,
		});
		end = hit.to;
	}
	return kept;
}

/**
 * Every de-slop mark in the masked document.
 *
 * @param {string} masked masked text (see mask.mjs) — offsets are document offsets
 * @param {import("./types.d.mts").Sentence[]} [sentences]
 * @returns {import("./types.d.mts").Mark[]}
 */
export function findSlop(masked, sentences) {
	if (typeof masked !== "string" || masked.length === 0) return [];

	/** @type {import("./types.d.mts").Mark[]} */
	const marks = [];
	const tokens = words(masked, 0, masked.length);
	const lowered = tokens.map((token) => normalize(token.text));

	for (let i = 0; i < tokens.length; i++) {
		const phrase = matchAt(masked, tokens, lowered, i);
		if (phrase) {
			const last = i + phrase.tokens.length - 1;
			marks.push({
				from: tokens[i].from,
				to: tokens[last].to,
				rule: RULE,
				severity: phrase.severity,
				message: SLOP_MESSAGE,
				word: phrase.text,
			});
			i = last;
			continue;
		}
		const severity = SINGLE.get(lowered[i]);
		if (severity) {
			marks.push({
				from: tokens[i].from,
				to: tokens[i].to,
				rule: RULE,
				severity,
				message: SLOP_MESSAGE,
				word: lowered[i],
			});
		}
	}

	// One em dash is punctuation. Two or more in a single sentence is the tell, so the
	// sentence — not the document — is the unit we count over.
	for (const sentence of sentences ?? []) {
		const text = typeof sentence?.text === "string" ? sentence.text : "";
		let count = 0;
		for (let i = 0; i < text.length; i++) {
			if (text[i] === "—") count++;
		}
		if (count < 2) continue;
		for (let i = 0; i < text.length; i++) {
			if (text[i] !== "—") continue;
			marks.push({
				from: sentence.from + i,
				to: sentence.from + i + 1,
				rule: RULE,
				severity: "info",
				message: EMDASH_MESSAGE,
			});
		}
	}

	marks.push(...findReframes(masked));
	marks.sort((a, b) => a.from - b.from || a.to - b.to);
	return marks;
}
