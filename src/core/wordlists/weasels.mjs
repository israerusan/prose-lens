/**
 * Intensifiers with nobody behind them.
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
 * Words that assert magnitude or consensus the sentence never earns: vague
 * quantifiers ("several", "many") and the adverbs that tell the reader how to
 * react ("obviously", "remarkably").
 *
 * No entry may also appear in HEDGE_WORDS — a token belongs to exactly one of the
 * two rules, or the same span gets marked twice with contradictory advice.
 */
export const WEASEL_WORDS = new Set([
	"absolutely",
	"certainly",
	"clearly",
	"considerably",
	"countless",
	"definitely",
	"dramatically",
	"drastically",
	"enormously",
	"exceedingly",
	"extremely",
	"few",
	"hugely",
	"immensely",
	"importantly",
	"incredibly",
	"interestingly",
	"literally",
	"many",
	"most",
	"notably",
	"numerous",
	"obviously",
	"relatively",
	"remarkably",
	"several",
	"significantly",
	"some",
	"substantially",
	"surely",
	"surprisingly",
	"tremendously",
	"undoubtedly",
	"utterly",
	"vast",
	"vastly",
	"various",
	"wildly",
]);
