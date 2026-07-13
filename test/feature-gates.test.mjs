// The tier table. If one of these flips, someone has moved a feature across the paywall
// — which is a product decision, not a refactor, and it should fail the build until it
// is made deliberately.
import assert from "node:assert";
import { FEATURES, isFeatureEnabled, isProOnlyRule, proFeatureKeys } from "../src/core/featureGates.mjs";

// Free: the things that replace the stale single-feature plugins already in the store.
for (const key of ["marks", "readability", "rhythm", "heat"]) {
	assert.equal(FEATURES[key].proOnly, false, `${key} must stay free`);
	assert.equal(isFeatureEnabled(key, false), true);
}

// Pro: the things that exist nowhere else.
for (const key of ["deslop", "echo", "delta", "focus"]) {
	assert.equal(FEATURES[key].proOnly, true, `${key} must stay Pro`);
	assert.equal(isFeatureEnabled(key, false), false);
	assert.equal(isFeatureEnabled(key, true), true);
}

assert.deepEqual(proFeatureKeys().sort(), ["delta", "deslop", "echo", "focus"]);

// De-slop is the only rule the engine itself withholds.
assert.equal(isProOnlyRule("deslop"), true);
for (const rule of ["adverb", "passive", "hedge", "weasel", "doubled", "cliche", "longSentence"]) {
	assert.equal(isProOnlyRule(rule), false, `${rule} must run for free users`);
}

// An unknown key is free, not accidentally paywalled.
assert.equal(isFeatureEnabled("nonexistent", false), true);

console.log("ok  feature-gates.test.mjs");
