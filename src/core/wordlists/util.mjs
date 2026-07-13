/**
 * Curated word and phrase data for every rule. No logic lives here beyond freezing
 * and length-sorting the exports.
 *
 * Everything is hand-authored for this product. The bias throughout is toward
 * SILENCE: a word only earns a place on a list if flagging it would be defensible
 * in most sentences a real writer would type. Anything genuinely ambiguous is left
 * off (weasel/hedge/deslop) or added to a suppression list (adverb/passive).
 *
 * Conventions consumers rely on:
 * - Every entry is lowercase and trimmed. Callers lowercase the token first.
 * - Phrases use ASCII apostrophes and hyphens; callers must normalise curly
 *   quotes before matching, since Obsidian's smart-quote setting rewrites them.
 * - Phrase arrays are sorted longest-first so a naive scanner that takes the first
 *   match prefers "plays a crucial role" over "plays a".
 */

/** Longest-first, so overlapping phrases resolve to the more specific one. */
export const byLength = (a, b) => b.length - a.length || a.localeCompare(b);
