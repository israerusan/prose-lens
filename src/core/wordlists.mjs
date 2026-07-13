/**
 * Barrel for the word lists. Each family lives in its own file under wordlists/ so that
 * tuning one — which is a PRODUCT decision, arguing with a paying customer about their
 * prose — is a small, reviewable diff instead of a line lost in an 800-line wall.
 *
 * Import from here; the split is an implementation detail.
 */
export * from "./wordlists/adverbs.mjs";
export * from "./wordlists/hedges.mjs";
export * from "./wordlists/weasels.mjs";
export * from "./wordlists/cliches.mjs";
export * from "./wordlists/deslopTerms.mjs";
export * from "./wordlists/participles.mjs";
export * from "./wordlists/stopwords.mjs";
