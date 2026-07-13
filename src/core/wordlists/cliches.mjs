import { byLength } from "./util.mjs";

/**
 * Phrases the reader's eye slides over.
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
 * Dead idioms and boardroom filler. Each one is a phrase a reader skims past, so
 * the mark is safe even when the sentence around it is fine.
 */
export const CLICHE_PHRASES = Object.freeze([
	"a double-edged sword",
	"a win-win",
	"all things considered",
	"at the drop of a hat",
	"at the end of the day",
	"at this point in time",
	"back to the drawing board",
	"beat around the bush",
	"boil the ocean",
	"circle back",
	"cut to the chase",
	"each and every",
	"easier said than done",
	"few and far between",
	"first and foremost",
	"food for thought",
	"going forward",
	"grasping at straws",
	"hit the ground running",
	"in a nutshell",
	"in this day and age",
	"last but not least",
	"leave no stone unturned",
	"level playing field",
	"low-hanging fruit",
	"move the needle",
	"needless to say",
	"off the beaten path",
	"only time will tell",
	"par for the course",
	"push the envelope",
	"raise the bar",
	"take it to the next level",
	"the best of both worlds",
	"the bottom line",
	"the calm before the storm",
	"the elephant in the room",
	"the fact of the matter",
	"the tip of the iceberg",
	"the writing on the wall",
	"think outside the box",
	"touch base",
	"when all is said and done",
	"when push comes to shove",
].sort(byLength));
