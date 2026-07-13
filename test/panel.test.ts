// The side panel, tested against the real view.
//
// The bug this file exists to prevent already shipped once: the rhythm bars set their width
// with setCssStyles, which cannot set a CSS custom property, so every bar silently rendered
// at 100% and the headline free feature looked like a solid block. The whole core test suite
// was green throughout, because the defect lived entirely in the UI layer nothing tested.
import assert from "node:assert";
import type { FakeEl } from "obsidian";
import { ProsePanelView } from "../src/ui/ProsePanelView";
import { analyze } from "../src/core/ruleEngine.mjs";
import { snapshot } from "../src/core/delta.mjs";
import { DEFAULT_SETTINGS, type ProseLensSettings } from "../src/settings";

const PROSE =
	"The report was quickly written by many experts. She walked slowly toward the door and then stopped. " +
	"It is worth noting that the results were obviously significant, and the team was clearly delighted. " +
	"Short. Another short one. A third.";

function mount(overrides: Partial<ProseLensSettings> = {}, text = PROSE) {
	const settings: ProseLensSettings = { ...DEFAULT_SETTINGS, ...overrides };
	const analysis = analyze(text, {
		rules: settings.rules,
		longSentenceWords: settings.longSentenceWords,
		veryLongSentenceWords: settings.veryLongSentenceWords,
		isPro: settings.isPro,
	});
	const revealed: number[] = [];
	const plugin = {
		settings,
		currentAnalysis: () => analysis,
		currentBaseline: () => snapshot(analyze("Tiny.").stats),
		revealOffset: (offset: number) => revealed.push(offset),
	};
	// The real view, unmodified.
	const view = new ProsePanelView({} as never, plugin as never);
	void view.onOpen();
	return { view, root: view.contentEl as unknown as FakeEl, revealed, analysis };
}

// --- the rhythm map is the free headline feature and it must actually render -------------------
{
	const { root } = mount({ isPro: false });

	const bars = root.findAll((el) => el.hasClass("pl-bar"));
	assert.ok(bars.length >= 4, "one bar per sentence");

	// THE REGRESSION: the width must reach the DOM as a CSS custom property. The stub's
	// setCssStyles deliberately does NOT populate cssProps, exactly as the real API does not —
	// so reaching for it again fails right here instead of shipping a wall of full-width bars.
	for (const bar of bars) {
		const width = bar.cssProps["--pl-bar-width"];
		assert.ok(width, "every rhythm bar must set --pl-bar-width (setCssProps, not setCssStyles)");
		assert.match(width, /^\d+%$/);
	}

	// The bars must actually differ — if they were all 100% the map would say nothing.
	const widths = new Set(bars.map((bar) => bar.cssProps["--pl-bar-width"]));
	assert.ok(widths.size > 1, "bars of different-length sentences must have different widths");

	// The longest sentence owns the full bar.
	assert.ok([...widths].includes("100%"));
}

// --- Pro gating in the panel ---------------------------------------------------------------------
{
	const free = mount({ isPro: false });
	const text = free.root.text();
	assert.ok(text.includes("Echoes"), "the Pro sections are advertised, not hidden");
	assert.ok(text.includes("Since you opened this note"));
	assert.ok(
		free.root.findAll((el) => el.hasClass("pl-locked")).length >= 2,
		"a free user must see the echo and delta sections LOCKED, with a way to unlock"
	);
	assert.ok(free.root.find((el) => el.hasClass("pl-pro-btn")), "a locked section offers a purchase link");
	// No echo rows leak to a free user.
	assert.equal(free.root.findAll((el) => el.hasClass("pl-echo")).length, 0);

	const pro = mount({ isPro: true });
	assert.equal(
		pro.root.findAll((el) => el.hasClass("pl-locked")).length,
		0,
		"a Pro user must see no locked sections"
	);
	// The rhythm map is free and renders identically for both.
	assert.equal(
		free.root.findAll((el) => el.hasClass("pl-bar")).length,
		pro.root.findAll((el) => el.hasClass("pl-bar")).length
	);
}

// --- clicking a row jumps the editor -----------------------------------------------------------
{
	const { root, revealed, analysis } = mount({ isPro: true });
	const bars = root.findAll((el) => el.hasClass("pl-bar"));

	// Delegation: ONE listener on contentEl, not one per row. Clicking a bar must still work —
	// and it must resolve to the right sentence, which is what the data-index indirection buys.
	bars[2].click();
	assert.equal(revealed.length, 1, "clicking a bar reveals exactly one offset");
	assert.equal(revealed[0], analysis.sentences[2].from, "and it is THAT sentence's offset");
}

// --- an empty note says so instead of rendering a broken shell -----------------------------------
{
	const { root } = mount({ isPro: true }, "");
	assert.ok(root.text().includes("Open a note"), "an empty note gets an empty state");
	assert.equal(root.findAll((el) => el.hasClass("pl-bar")).length, 0);
}

console.log("ok  panel.test.ts");
