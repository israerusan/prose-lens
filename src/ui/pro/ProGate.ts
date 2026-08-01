import type { App } from "obsidian";
import { PRO_UPSELL } from "../../product";
import { ProUpsellModal } from "./ProUpsellModal";
import { isFeatureEnabled } from "../../core/featureGates.mjs";

/** Anything carrying the resolved Pro entitlement and an app handle. */
export interface ProHost {
	isPro: boolean;
	app: App;
}

/**
 * The one place Pro features are gated. Runs `action` when Pro is active, otherwise
 * opens an actionable upsell for `feature`. Keeping every gate here stops scattered
 * `if (isPro)` checks drifting out of sync with the tier table in featureGates.mjs.
 *
 * Note the de-slop rule is NOT gated here — it is gated inside the rule engine, so a
 * free user's analysis never contains the mark in the first place and there is nothing
 * to strip out of the DOM.
 */
export function requirePro(
	host: ProHost,
	feature: keyof typeof PRO_UPSELL,
	action: () => void
): boolean {
	// Ask the tier table, not the boolean directly, so moving a feature between tiers is a
	// one-line edit in featureGates.mjs rather than a hunt through the UI.
	if (isFeatureEnabled(feature, host.isPro)) {
		action();
		return true;
	}
	new ProUpsellModal(host.app, feature).open();
	return false;
}
