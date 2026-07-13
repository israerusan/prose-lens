/**
 * The single source of truth for what is free and what is Pro. Pure (no `obsidian`
 * import) so the TypeScript UI and the Node test suite read the same table and can
 * never drift apart.
 *
 * The tiering rationale, for whoever changes this next: the FREE tier deliberately
 * matches what the existing free plugins in this space already give away (marks,
 * a Flesch grade, sentence-length heat) — it exists to replace five stale
 * single-feature plugins with one maintained one, so it must not be crippled. PRO
 * is only the things that exist NOWHERE else: de-slop marks, the echo detector,
 * revision delta, and focus mode. Moving a free feature behind the paywall breaks
 * that promise and invites the one-star reviews the free tier is there to earn.
 */

/** @typedef {"marks"|"readability"|"rhythm"|"heat"|"deslop"|"echo"|"delta"|"focus"} FeatureKey */

/** @type {Readonly<Record<string, {proOnly: boolean, label: string}>>} */
export const FEATURES = Object.freeze({
	marks: { proOnly: false, label: "Style marks" },
	readability: { proOnly: false, label: "Readability grade" },
	rhythm: { proOnly: false, label: "Rhythm map" },
	heat: { proOnly: false, label: "Sentence-length heat" },
	deslop: { proOnly: true, label: "De-slop marks" },
	echo: { proOnly: true, label: "Echo detector" },
	delta: { proOnly: true, label: "Revision delta" },
	focus: { proOnly: true, label: "Focus mode" },
});

/** Rule ids that only run for Pro users. Everything else is free. */
export const PRO_ONLY_RULES = Object.freeze(new Set(["deslop"]));

/** True when `feature` is available at the given entitlement. Unknown keys are free. */
export function isFeatureEnabled(feature, isPro) {
	const gate = FEATURES[feature];
	if (!gate) return true;
	return gate.proOnly ? isPro === true : true;
}

/** True when a rule id must be withheld from a free user. */
export function isProOnlyRule(ruleId) {
	return PRO_ONLY_RULES.has(ruleId);
}

/** The Pro-only feature keys, in display order. */
export function proFeatureKeys() {
	return Object.keys(FEATURES).filter((key) => FEATURES[key].proOnly);
}
