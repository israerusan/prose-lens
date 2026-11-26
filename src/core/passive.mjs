/**
 * Passive-voice detection over one sentence of MASKED text.
 *
 * There is no part-of-speech tagger here and there never will be: a tagger is
 * megabytes of model data for a plugin that must finish inside a keystroke. What we
 * ship instead is a deliberately timid heuristic — a be-verb (or a get-passive), then
 * at most two adverbs, then a past participle — and it declines to fire on anything
 * it cannot nearly prove. Passive voice is the rule readers argue with most, so a
 * highlight on a correct sentence costs far more than a missed passive ever will.
 *
 * Everything is walked word-by-word instead of matched with one big sentence-level
 * regex. That keeps the work linear and bounded on adversarial input, and the word
 * offsets come out exact and absolute for free.
 */

import { words } from "./segment.mjs";
import { hidesWords, visibleGapLength } from "./gap.mjs";
import { ADVERB_EXCEPTIONS, IRREGULAR_PARTICIPLES, NON_PARTICIPLE_ED } from "./wordlists.mjs";

/** Lists are authored as arrays for readability; these lookups run on every keystroke. */
const toSet = (list) => (list instanceof Set ? list : new Set(list || []));
const NON_PARTICIPLE = toSet(NON_PARTICIPLE_ED);
const NOT_ADVERBS = toSet(ADVERB_EXCEPTIONS);
const IRREGULAR = toSet(IRREGULAR_PARTICIPLES);

const BE_VERBS = new Set([
	"am",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	// Contracted negatives are still be-verbs. "The bug wasn't fixed" is exactly as
	// passive as "the bug was not fixed", and users write the contraction far more.
	"isn't",
	"aren't",
	"wasn't",
	"weren't",
]);

/** Get-passives: "it got broken", "the index gets rebuilt nightly". */
const GET_VERBS = new Set(["get", "gets", "got", "gotten"]);

/**
 * Modals. A passive introduced by one ("this should be flagged", "the file can be deleted")
 * is still passive — the agent is still missing, and "you should flag this" is still the
 * better sentence — but it is overwhelmingly the register of instructions, checklists, and
 * meta-notes, which is a large part of what people keep in a vault. Marking it at full
 * weight makes the tool feel like it is arguing with documentation.
 *
 * So it is reported, with `modal: true`, and the rule engine drops it to the quietest
 * severity. Marked, not shouted at, and never silently dropped.
 */
const MODALS = new Set([
	"should",
	"shall",
	"can",
	"could",
	"may",
	"might",
	"must",
	"will",
	"would",
	"cannot",
	"ought",
]);

/**
 * Adverbs allowed to sit between the be-verb and the participle.
 *
 * Degree modifiers (very, too, quite, so, rather, pretty, more, most, less) are
 * pointedly ABSENT. A degree word after "be" is the strongest signal English gives
 * that what follows is a predicate adjective rather than a verb — "was very tired",
 * but never "*was very destroyed". Refusing to step over them kills a whole family of
 * false positives at the cost of nothing real.
 */
const INTERVENING = new Set([
	"not",
	"never",
	"always",
	"often",
	"sometimes",
	"seldom",
	"still",
	"already",
	"just",
	"also",
	"even",
	"only",
	"now",
	"then",
	"soon",
	"again",
	"once",
	"ever",
	"well",
	"all",
	"both",
	"no",
	"longer",
	"being",
]);

/**
 * "-ed" words that are participles by shape but predicate adjectives in practice.
 * "She was tired" and "we are excited" are not passive by any reading a writer would
 * accept, yet they are the exact shape the rule looks for — this is the single
 * biggest source of angry passive-voice false positives in every checker that ships
 * one. They live here rather than in wordlists' NON_PARTICIPLE_ED because that list
 * is morphological ("red", "indeed", and "speed" are simply not participles at all),
 * while these genuinely are participles that happen to have gone adjective.
 *
 * They are still allowed to fire when an agent follows (see followedByAgent), so
 * "the audience was delighted by the finale" is not lost.
 */
const ED_ADJECTIVES = new Set([
	"tired",
	"excited",
	"worried",
	"confused",
	"interested",
	"pleased",
	"surprised",
	"delighted",
	"concerned",
	"bored",
	"scared",
	"frightened",
	"annoyed",
	"embarrassed",
	"exhausted",
	"ashamed",
	"disappointed",
	"frustrated",
	"satisfied",
	"aged",
	"crowded",
	"talented",
	"gifted",
	"skilled",
	"tanned",
]);

/**
 * Longest whitespace run tolerated between two words of the construction. Masking
 * replaces inline code, math, and URLs with spaces, so without a cap a be-verb could
 * reach across a masked span and marry a participle that is nowhere near it.
 */
const MAX_GAP = 8;
/** Longest raw gap ever examined: a hidden `[[target|` (at most 300 characters) plus a little. */
const MAX_RAW_GAP = 320;

/**
 * Passive constructions inside one sentence.
 *
 * @param {string} masked masked document text (see mask.mjs)
 * @param {import("./types.d.mts").Sentence} sentence
 * @returns {import("./types.d.mts").Word[]} spans from the be-verb through the participle, absolute offsets
 */
export function findPassive(masked, sentence, source) {
	/** @type {import("./types.d.mts").Word[]} */
	const found = [];
	if (typeof masked !== "string" || !sentence) return found;

	const list = words(masked, sentence.from, sentence.to);

	for (let i = 0; i < list.length; i++) {
		const head = normalize(list[i].text);
		const contracted = contractedBe(head);
		if (!contracted && !BE_VERBS.has(head) && !GET_VERBS.has(head)) continue;

		// The auxiliary, then up to two adverbs, then the participle: at most three
		// words of lookahead, so the whole scan stays linear in sentence length.
		for (let j = i + 1; j < list.length && j <= i + 3; j++) {
			if (!adjacent(masked, list[j - 1], list[j], source)) break;

			const word = normalize(list[j].text);
			if (isParticiple(word)) {
				if ((ED_ADJECTIVES.has(word) || STATIVE.has(word)) && !followedByAgent(masked, list, j, source)) break;
				// "it's written" can be "it has written"; only an agent settles it as passive.
				if (contracted === "ambiguous" && !followedByAgent(masked, list, j, source)) break;

				const from = list[i].from;
				const to = list[j].to;
				const preceding = i > 0 ? list[i - 1].text.toLowerCase() : "";
				found.push({
					from,
					to,
					text: masked.slice(from, to),
					modal: MODALS.has(preceding),
				});
				// Resume after the participle so two spans never overlap.
				i = j;
				break;
			}
			if (!isIntervening(word)) break;
		}
	}

	return found;
}

/**
 * Participles that, after a be- or get-verb, describe a STATE in ordinary notes: "she was born
 * in Leeds", "we were done by noon", "the guests were gone", "they got married in June".
 * Grammatically some are passive, but "name who did it" is nonsense advice there, and birth,
 * completion and departure lines are normal vault prose. Like ED_ADJECTIVES, they still fire
 * when an agent proves the verb reading: "the work was done by contractors".
 */
const STATIVE = new Set(["born", "done", "gone", "married", "engaged", "dressed", "finished"]);

/** Pronouns whose `'s` can stand for "is" — and, just as often, for "has". */
const S_CONTRACTION_HOSTS = new Set(["it", "he", "she", "that", "there", "what", "who", "here", "this"]);

/**
 * A be-verb contracted onto its subject. `'re` and `'m` can only be "are" / "am", so they
 * count exactly like the full verb. `'s` is "is" OR "has" — "he's assigned a task" is active —
 * so it is "ambiguous" and fires only when an agent ("by Alice") proves the passive.
 *
 * @returns {"be" | "ambiguous" | null}
 */
function contractedBe(word) {
	const apostrophe = word.lastIndexOf("'");
	if (apostrophe <= 0) return null;
	const host = word.slice(0, apostrophe);
	const tail = word.slice(apostrophe + 1);
	if (tail === "re" || tail === "m") return "be";
	if (tail === "s" && S_CONTRACTION_HOSTS.has(host)) return "ambiguous";
	return null;
}

/** Lowercase, and fold the typographic apostrophe so "isn’t" matches "isn't". */
function normalize(text) {
	return text.toLowerCase().replace(/[’‘]/g, "'");
}

/**
 * True when nothing but a little whitespace separates two words — and, when the source is
 * given, nothing the mask HID either. The masked text turns inline code into spaces, so
 * "The file was `x` deleted" read as "was deleted" and painted a passive mark straight across
 * the code. Only hidden WORDS block, though: masked syntax the reader never sees as text —
 * link brackets, a quote's `>`, emphasis — must not, or "was [rejected](url)" and a passive
 * wrapped across two callout lines stop matching.
 */
function adjacent(masked, left, right, source) {
	const gap = right.from - left.to;
	// The raw bound first (a wikilink target is at most 300 characters), then the gap as
	// the reader sees it: `[[quarterly report|rejected]]` is one word away from "was".
	if (gap < 0 || gap > MAX_RAW_GAP) return false;
	if (gap > MAX_GAP && visibleGapLength(source, masked, left.to, right.from) > MAX_GAP) return false;
	for (let i = left.to; i < right.from; i++) {
		const code = masked.charCodeAt(i);
		// Punctuation between the auxiliary and the participle means they belong to
		// different clauses ("it was, frankly, ignored" aside — we take the miss).
		if (code !== 32 && code !== 9 && code !== 10 && code !== 13) return false;
	}
	return !hidesWords(source, masked, left.to, right.from);
}

/**
 * Not every "by" introduces an agent: "confused by then" and "annoyed by now" are
 * temporal, "surprised by chance" is adverbial. Only a handful of objects do this, so
 * naming them is cheaper and safer than trying to recognise a noun phrase.
 */
const NON_AGENT = new Set([
	"then",
	"now",
	"default",
	"mistake",
	"accident",
	"chance",
	"design",
	"comparison",
	"contrast",
	"far",
	"itself",
	"necessity",
	// "done by noon", "gone by morning": a deadline, not an agent.
	"noon",
	"midnight",
	"morning",
	"evening",
	"night",
	"tonight",
	"today",
	"tomorrow",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
	"lunch",
	"end",
	"week",
	"weekend",
	"month",
	"year",
	"deadline",
	"dinner",
]);

/**
 * True when the word at `index` is followed by an agent phrase — the one cheap piece
 * of evidence that an ambiguous participle is doing verb work, not adjective work.
 */
function followedByAgent(masked, list, index, source) {
	const next = list[index + 1];
	if (!next || !adjacent(masked, list[index], next, source)) return false;
	if (normalize(next.text) !== "by") return false;

	let object = list[index + 2];
	if (!object || !adjacent(masked, next, object, source)) return false;
	// "done by the evening", "gone by next Friday": look past one determiner before deciding
	// whether the object is a deadline. "by the contractors" is still an agent.
	const after = list[index + 3];
	if (DETERMINERS.has(normalize(object.text)) && after && adjacent(masked, object, after, source)) {
		object = after;
	}
	return !NON_AGENT.has(normalize(object.text));
}

const DETERMINERS = new Set(["the", "a", "an", "this", "that", "next", "last", "each", "every"]);

function isParticiple(word) {
	if (IRREGULAR.has(word)) return true;
	// Three-letter "-ed" words are nouns and adjectives far more often than verbs
	// ("red", "bed", "wed"). The two real participles in that shape ("led", "fed")
	// are carried by the irregular list instead, so the length floor costs nothing.
	if (word.length < 4 || !word.endsWith("ed")) return false;
	return !NON_PARTICIPLE.has(word) && !NOT_ADVERBS.has(word);
}

function isIntervening(word) {
	if (INTERVENING.has(word)) return true;
	// Manner adverbs are an open class, so "-ly" is accepted wholesale — minus the
	// "-ly" nouns and adjectives ("family", "supply", "ugly") the adverb rule already
	// has to know about. That also stops "is family owned" from reading as passive.
	return word.length >= 4 && word.endsWith("ly") && !NOT_ADVERBS.has(word);
}
