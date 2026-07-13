import { byLength } from "./util.mjs";

/**
 * Qualifiers that weaken a claim.
 *
 * PROVENANCE: hand-authored for this project. Nothing here is copied from write-good,
 * proselint, retext, or any other project — those carry licences we are not going to
 * inherit into a commercial product, and their lists are tuned for different tools.
 *
 * TUNING THIS LIST IS A PRODUCT DECISION, NOT A CODE CHANGE. Every entry here is something
 * the plugin will one day tell a paying customer is wrong with their writing. When one of
 * them argues, the argument is with this file. Pin the disputed phrase in
 * test/wordlist-fixtures.test.mjs before you change anything, so the next person can see
 * WHY an entry is in or out rather than guessing.
 */

/**
 * Single-word hedges and qualifiers: they soften a claim without adding
 * information. Distinct from WEASEL_WORDS, which overstate one instead.
 *
 * Deliberately absent: "pretty" (adjective far more often than intensifier),
 * "clearly"/"obviously" (those overstate, so they live in WEASEL_WORDS), and
 * "about" (a preposition in most sentences).
 */
export const HEDGE_WORDS = new Set([
	"actually",
	"allegedly",
	"almost",
	"apparently",
	"approximately",
	"arguably",
	"basically",
	"conceivably",
	"essentially",
	"fairly",
	"generally",
	"hopefully",
	"just",
	"largely",
	"likely",
	"mainly",
	"marginally",
	"maybe",
	"moderately",
	"mostly",
	"nearly",
	"occasionally",
	"often",
	"ostensibly",
	"partially",
	"partly",
	"perhaps",
	"possibly",
	"potentially",
	"presumably",
	"probably",
	"purportedly",
	"quite",
	"rather",
	"really",
	"reportedly",
	"reputedly",
	"roughly",
	"seemingly",
	"slightly",
	"somehow",
	"somewhat",
	"sometimes",
	"supposedly",
	"theoretically",
	"typically",
	"unlikely",
	"usually",
	"very",
	"virtually",
]);

/**
 * Multiword hedges. Kept short and idiomatic; a phrase is only listed when the
 * sentence is stronger with it deleted outright.
 */
export const HEDGE_PHRASES = Object.freeze([
	"a bit",
	"a little bit",
	"as far as i can tell",
	"by and large",
	"for the most part",
	"give or take",
	"i believe",
	"i feel like",
	"i guess",
	"i suppose",
	"i think",
	"if you ask me",
	"in a sense",
	"in my opinion",
	"in my view",
	"in some ways",
	"it appears",
	"it could be argued",
	"it might be said",
	"it seems",
	"kind of",
	"more or less",
	"or something like that",
	"sort of",
	"to a certain extent",
	"to some extent",
	"up to a point",
].sort(byLength));
