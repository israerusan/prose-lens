// The no-churn contract. These rules are what keep data.json from being rewritten on
// every startup and every keystroke in the license field, and what make a lapsed key
// actually revoke Pro.
import assert from "node:assert";
import { resolveLicenseTransition } from "../src/core/licenseTransition.mjs";

// No key, already free: a complete no-op. Nothing changed, nothing persists.
assert.deepEqual(resolveLicenseTransition({ isPro: false, email: "" }, "", null), {
	isPro: false,
	email: "",
	changed: false,
	persist: false,
	flipped: false,
});

// ...unless the caller forces it (the settings tab, so a typed key survives a restart).
assert.equal(resolveLicenseTransition({ isPro: false, email: "" }, "", null, true).persist, true);

// A lapsed key revokes Pro and must persist.
const lapsed = resolveLicenseTransition({ isPro: true, email: "a@b.com" }, "", null);
assert.equal(lapsed.isPro, false);
assert.equal(lapsed.flipped, true);
assert.equal(lapsed.persist, true);

// A stale email with no key is cleared, but that is not a Pro flip.
const staleEmail = resolveLicenseTransition({ isPro: false, email: "a@b.com" }, "", null);
assert.equal(staleEmail.email, "");
assert.equal(staleEmail.persist, true);
assert.equal(staleEmail.flipped, false);

// A valid key turns Pro on.
const activated = resolveLicenseTransition({ isPro: false, email: "" }, "KEY", {
	valid: true,
	email: "a@b.com",
});
assert.equal(activated.isPro, true);
assert.equal(activated.flipped, true);
assert.equal(activated.persist, true);

// Re-verifying an unchanged valid key must NOT write. This is the whole point.
const steady = resolveLicenseTransition({ isPro: true, email: "a@b.com" }, "KEY", {
	valid: true,
	email: "a@b.com",
});
assert.equal(steady.changed, false);
assert.equal(steady.persist, false);
assert.equal(steady.flipped, false);

// An invalid key does not grant Pro, and revokes it if it was on.
const invalid = resolveLicenseTransition({ isPro: true, email: "a@b.com" }, "BAD", {
	valid: false,
	error: "Invalid license signature.",
});
assert.equal(invalid.isPro, false);
assert.equal(invalid.flipped, true);

console.log("ok  license-transition.test.mjs");
