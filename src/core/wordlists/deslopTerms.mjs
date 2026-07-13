import { byLength } from "./util.mjs";

/**
 * The phrasing tells of machine-generated prose.
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
 * Vocabulary that reads as machine-generated. Inflections are listed explicitly
 * because the rule matches whole tokens and does not stem.
 *
 * The bar for entry is high: the word must be rare in ordinary human drafts and
 * near-compulsive in model output. Words like "important", "key", "explore", and
 * "navigate" are common LLM tells but far too common in honest prose to flag.
 */
export const DESLOP_WORDS = new Set([
	"beacon",
	"bustling",
	"comprehensive",
	"cornerstone",
	"crucial",
	"cultivate",
	"delve",
	"delves",
	"delving",
	"elevate",
	"elevates",
	"elevating",
	"embark",
	"embarking",
	"embarks",
	"empower",
	"empowering",
	"empowers",
	"ever-changing",
	"ever-evolving",
	"foster",
	"fostering",
	"fosters",
	"groundbreaking",
	"hallmark",
	"harness",
	"harnessing",
	"holistic",
	"illuminate",
	"indelible",
	"intricate",
	"intricacies",
	"invaluable",
	"landscape",
	"leverage",
	"leverages",
	"leveraging",
	"meticulous",
	"meticulously",
	"multifaceted",
	"myriad",
	"nuanced",
	"paramount",
	"pivotal",
	"plethora",
	"profound",
	"realm",
	"resonate",
	"robust",
	"seamless",
	"seamlessly",
	"showcase",
	"showcased",
	"showcases",
	"showcasing",
	"streamline",
	"streamlined",
	"synergy",
	"tapestry",
	"testament",
	"transformative",
	"underpin",
	"underpins",
	"underscore",
	"underscored",
	"underscores",
	"underscoring",
	"unlock",
	"unlocking",
	"unlocks",
	"unparalleled",
	"unwavering",
	"utilize",
	"utilizing",
	"vibrant",
	"vital",
]);

/**
 * Phrase-level LLM tells. The single-word connectives ("furthermore", "moreover")
 * live here rather than in DESLOP_WORDS so the whole rule can be tuned or muted as
 * one unit — they are the least offensive members of the set and the most likely
 * to be a deliberate choice by a human writer.
 */
export const DESLOP_PHRASES = Object.freeze([
	"a game-changer",
	"a myriad of",
	"a testament to",
	"a wide range of",
	"additionally",
	"as we've seen",
	"at the forefront of",
	"buckle up",
	"cutting-edge",
	"delve into",
	"dive deep",
	"embark on a journey",
	"ever-evolving landscape",
	"furthermore",
	"harness the power",
	"holistic approach",
	"in conclusion",
	"in summary",
	"in the ever-evolving",
	"in the realm of",
	"in today's fast-paced world",
	"it is important to note",
	"it is worth noting",
	"it's important to note",
	"it's worth noting",
	"key takeaways",
	"let's dive in",
	"look no further",
	"meticulously crafted",
	"moreover",
	"navigate the complexities",
	"paradigm shift",
	"plays a crucial role",
	"plays a vital role",
	"push the boundaries",
	"rich tapestry",
	"seamless integration",
	"shed light on",
	"stand the test of time",
	"that being said",
	"the possibilities are endless",
	"to summarize",
	"underscores the importance",
	"unlock the potential",
	"unwavering commitment",
	"when it comes to",
].sort(byLength));
