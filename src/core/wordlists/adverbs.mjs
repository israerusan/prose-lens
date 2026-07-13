/**
 * -ly words that are not adverbs.
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
 * Words ending in -ly that are not adverbs: nouns ("family", "assembly"), verbs
 * ("reply", "comply"), proper nouns ("July"), and the large class of -ly
 * ADJECTIVES ("friendly", "costly", "unlikely"). The adjectives matter most —
 * without them "a friendly reply from the family" reads as three adverbs.
 *
 * A handful of entries here (daily, weekly, likely, early) really can be adverbs.
 * We suppress them anyway: they are almost never the flabby -ly adverb the rule is
 * hunting for, and a false hit on "the daily standup" is worse than a missed hit.
 */
export const ADVERB_EXCEPTIONS = new Set([
	"ally",
	"anomaly",
	"apply",
	"assembly",
	"belly",
	"brotherly",
	"bubbly",
	"bully",
	"burly",
	"butterfly",
	"chilly",
	"comely",
	"comply",
	"costly",
	"cowardly",
	"crumbly",
	"curly",
	"daily",
	"deadly",
	"dolly",
	"dragonfly",
	"early",
	"elderly",
	"family",
	"fatherly",
	"firefly",
	"fly",
	"folly",
	"friendly",
	"ghastly",
	"ghostly",
	"gully",
	"hilly",
	"holly",
	"holy",
	"homely",
	"homily",
	"imply",
	"italy",
	"jelly",
	"jolly",
	"july",
	"leisurely",
	"likely",
	"lily",
	"lively",
	"lonely",
	"lovely",
	"manly",
	"melancholy",
	"molly",
	"monopoly",
	"monthly",
	"motherly",
	"multiply",
	"neighborly",
	"neighbourly",
	"nightly",
	"oily",
	"only",
	"orderly",
	"panoply",
	"ply",
	"portly",
	"prickly",
	"quarterly",
	"rally",
	"rely",
	"reply",
	"saintly",
	"scholarly",
	"sicily",
	"sickly",
	"silly",
	"sly",
	"stately",
	"sully",
	"supply",
	"surly",
	"tally",
	"timely",
	"ugly",
	"unlikely",
	"unruly",
	"unsightly",
	"weekly",
	"wily",
	"wobbly",
	"womanly",
	"woolly",
	"worldly",
	"wrinkly",
	"yearly",
]);
