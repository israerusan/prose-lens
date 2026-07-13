// The Pro gating SURFACE, tested against the real settings tab.
//
// Until now this was defended by comments. The failure it guards against is not theoretical:
// a Pro row that renders its real control to a free user gives the feature away, and a Pro
// row that renders NOTHING looks like a rendering bug rather than a paywall — the exact
// reason the locked-row pattern exists.
import assert from "node:assert";
import { Setting, type FakeEl } from "obsidian";
import { ProseLensSettingTab } from "../src/ui/SettingsTab";
import { DEFAULT_SETTINGS, RULE_LABELS, type ProseLensSettings } from "../src/settings";
import { FEATURES } from "../src/core/featureGates.mjs";
import { DEFAULT_RULE_OPTIONS } from "../src/core/ruleEngine.mjs";

/** A plugin double carrying only what the settings tab actually touches. */
function fakePlugin(overrides: Partial<ProseLensSettings> = {}) {
	const settings: ProseLensSettings = {
		...DEFAULT_SETTINGS,
		rules: { ...DEFAULT_SETTINGS.rules },
		...overrides,
	};
	return {
		app: {},
		settings,
		saved: 0,
		queued: 0,
		async saveSettings() {
			this.saved++;
		},
		queueSave() {
			this.queued++;
		},
		async flushPendingSave() {},
		async refreshLicense() {
			return false;
		},
		async activatePanel() {},
	};
}

function render(overrides: Partial<ProseLensSettings> = {}) {
	const plugin = fakePlugin(overrides);
	// The real settings tab, unmodified.
	const tab = new ProseLensSettingTab(plugin as never);
	tab.display();
	return { plugin, tab, root: tab.containerEl as unknown as FakeEl };
}

// --- the free tier -------------------------------------------------------------------------
{
	const { root } = render({ isPro: false });

	const locked = root.findAll((el) => el.hasClass("pl-setting-locked"));
	assert.ok(locked.length >= 2, "a free user must see the Pro rows rendered as LOCKED");

	// Every locked row offers a way out. A dead row reads as a bug, not a paywall.
	for (const row of locked) {
		assert.ok(
			row.text().toLowerCase().includes("upgrade to pro"),
			"a locked row must carry an upgrade link"
		);
	}

	// The free user is told what Pro is, and given a purchase link that is safe.
	const cta = root.find((el) => el.hasClass("pl-pro-btn"));
	assert.ok(cta, "a free user must see a Get Pro button");
	assert.match(cta.attrs.href ?? "", /^https:\/\//, "the purchase link must be sanitised to https");
	assert.equal(cta.attrs.rel, "noopener noreferrer");
	assert.equal(cta.attrs.target, "_blank");

	assert.ok(root.text().includes("Free tier active"), "the license status must say so");
	assert.ok(!root.text().includes("Pro active"), "a free user must not be told Pro is active");
}

// --- the Pro tier ---------------------------------------------------------------------------
{
	const { root } = render({ isPro: true, licenseKey: "x", licenseEmail: "a@b.com" });

	assert.equal(
		root.findAll((el) => el.hasClass("pl-setting-locked")).length,
		0,
		"a Pro user must see no locked rows"
	);
	assert.ok(root.text().includes("Pro active"), "a Pro user must be told their license is live");
	assert.ok(root.text().includes("a@b.com"), "the licensed email is shown");
	assert.ok(!root.text().includes("Free tier active"));
}

// --- the gating surface must agree with the tier table ---------------------------------------
// This is the drift that costs money: a rule marked Pro in the tier table but rendered as a
// free toggle in the settings tab gives the feature away and nobody notices.
for (const label of RULE_LABELS) {
	const gate = FEATURES[label.id as keyof typeof FEATURES];
	if (label.pro) {
		assert.ok(gate, `Pro rule "${label.id}" must exist in the tier table`);
		assert.equal(gate.proOnly, true, `"${label.id}" is rendered as Pro but is free in featureGates`);
	} else if (gate) {
		assert.equal(
			gate.proOnly,
			false,
			`"${label.id}" is rendered as a free rule but is Pro in featureGates`
		);
	}
}

// Every rule the ENGINE ships must be reachable from the UI. A rule with no toggle is a rule
// the user can never turn off when it annoys them — which is the whole mitigation for the
// heuristics being heuristics.
for (const rule of Object.keys(DEFAULT_RULE_OPTIONS.rules)) {
	assert.ok(
		RULE_LABELS.some((label) => label.id === rule),
		`rule "${rule}" ships in the engine but has no settings row`
	);
}

// --- continuous controls coalesce their writes -------------------------------------------------
// A slider fires onChange per STEP. Each immediate save bumps settingsEpoch, and each epoch bump
// makes every open editor re-analyse its whole note — so one drag across the range used to mean
// hundreds of writes and hundreds of full re-analyses. Sliders must queue, toggles must not.
{
	Setting.reset();
	const { plugin, tab } = render({ isPro: true });
	void tab;

	const sliders = Setting.instances.flatMap((setting) => setting.sliders);
	assert.ok(sliders.length >= 3, "the thresholds and the size cap are sliders");
	for (const slider of sliders) slider.drag(30);
	assert.equal(plugin.saved, 0, "a slider drag must NOT write settings immediately");
	assert.equal(plugin.queued, sliders.length, "every slider step must go through queueSave");

	const toggles = Setting.instances.flatMap((setting) => setting.toggles);
	assert.ok(toggles.length >= 3);
	toggles[0].toggle(false);
	assert.equal(plugin.saved, 1, "a toggle is a discrete action and must write immediately");
}

// --- the long-sentence thresholds cannot cross ----------------------------------------------------
{
	Setting.reset();
	const { plugin } = render({ isPro: true, longSentenceWords: 25, veryLongSentenceWords: 40 });
	const sliders = Setting.instances.flatMap((setting) => setting.sliders);

	// Dragging "long" past "very long" must push "very long" up, not produce an impossible pair
	// where a sentence is long but never very long.
	sliders[0].drag(45);
	assert.ok(
		plugin.settings.veryLongSentenceWords > plugin.settings.longSentenceWords,
		"very-long must stay above long"
	);
}

console.log("ok  settings-tab.test.ts");
