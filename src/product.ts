// Central product metadata and marketing copy. Keeping these in one place keeps
// the license binding, the upsell surfaces, and the settings copy consistent —
// LicenseManager, scripts/generate-license.mjs, and every CTA read PRODUCT_ID
// and the PRO_* strings from here.

/** Signed into every license payload; a key only unlocks the product it names. */
export const PRODUCT_ID = "prose-lens";

export const PRODUCT_NAME = "Prose Lens";
export const PRO_NAME = "Prose Lens Pro";

/** One-time price. Kept in one place so every surface stays consistent. */
export const PRO_PRICE_LABEL = "$12 one-time";

/** Where "Unlock Pro" sends people. */
export const PURCHASE_URL = "https://buymeacoffee.com/vaultspotlight/e/560203";

/** One-line pitch for the Pro tier, reused across upsell surfaces. */
export const PRO_TAGLINE =
	"De-slop marks, the echo detector, revision delta, and focus mode. $12 one-time, no subscription, no account.";

/** What a free user is missing, in one phrase. */
export const PRO_UNLOCK_SUMMARY =
	"de-slop marks, the echo detector, revision delta, and focus mode";

/** Contextual upsell copy, keyed by the feature the user reached for. */
export const PRO_UPSELL: Record<string, string> = {
	deslop: "De-slop marks are a Pro feature. " + PRO_TAGLINE,
	echo: "The echo detector is a Pro feature. " + PRO_TAGLINE,
	delta: "Revision delta is a Pro feature. " + PRO_TAGLINE,
	focus: "Focus mode is a Pro feature. " + PRO_TAGLINE,
};
