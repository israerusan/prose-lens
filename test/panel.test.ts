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
import type { SkipReason } from "../src/editor/proseLensExtension";
import { LEGEND } from "../src/ui/ruleLegend";

const PROSE =
	"The report was quickly written by many experts. She walked slowly toward the door and then stopped. " +
	"It is worth noting that the results were obviously significant, and the team was clearly delighted. " +
	"Short. Another short one. A third.";

function mount(
	overrides: Partial<ProseLensSettings> = {},
	text = PROSE,
	skipped: SkipReason | null = null
) {
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
		currentSkip: () => skipped,
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

// --- the legend must agree with the editor, and its counts with the marks ------------------------
//
// Seven colours were explained nowhere in the product. The fix is only worth anything if the
// legend paints each rule with the SAME class the editor paints it with — a legend carrying
// its own copy of the palette drifts, and a drifted legend teaches the wrong thing.
{
	const { root, analysis } = mount({ isPro: false });
	const rows = root.findAll((el) => el.hasClass("pl-legend-row"));
	assert.ok(rows.length >= 6, "one row per active free rule");

	for (const row of rows) {
		const sample = row.find((el) => el.hasClass("pl-legend-sample"));
		assert.ok(sample, "every legend row shows a sample");
		// The sample text is the rule's own name, and it carries the real mark class.
		const legendRow = LEGEND.find((entry) => entry.name === sample.text());
		assert.ok(legendRow, `sample "${sample.text()}" must be a real rule name`);
		for (const cls of legendRow.markClass.split(" ")) {
			assert.ok(sample.hasClass(cls), `the sample must be painted with ${cls}`);
		}
	}

	// The counts are the counts. If these disagree the panel is lying about the note.
	for (const entry of LEGEND) {
		if (entry.pro) continue;
		const row = rows.find((candidate) => candidate.text().startsWith(entry.name));
		assert.ok(row, `${entry.name} must have a row`);
		const expected = analysis.stats.counts[entry.id] ?? 0;
		assert.ok(
			row.text().endsWith(String(expected)),
			`${entry.name}: panel says "${row.text()}", engine counted ${expected}`
		);
	}

	// No de-slop row for a free user — that is the Pro section's job.
	assert.ok(!root.text().includes("De-slop"), "the legend does not advertise the Pro rule");
}

// --- clicking a legend row walks that rule's marks, cycling ---------------------------------------
{
	const { root, revealed, analysis } = mount({ isPro: false });
	const weasels = analysis.marks.filter((mark) => mark.rule === "weasel").map((mark) => mark.from);
	assert.ok(weasels.length >= 3, "the fixture needs several weasel words to prove cycling");

	const row = root.find(
		(el) => el.hasClass("pl-legend-row") && el.text().startsWith("Weasel words")
	);
	assert.ok(row, "the weasel row exists");

	row.click();
	row.click();
	assert.deepEqual(revealed, [weasels[0], weasels[1]], "a second click advances, it does not repeat");

	// And it wraps rather than dead-ending on the last one.
	for (let i = 2; i < weasels.length; i++) row.click();
	row.click();
	assert.equal(revealed[revealed.length - 1], weasels[0], "the walk cycles back to the first");
}

// --- a rule the user switched off is not in the legend --------------------------------------------
{
	const { root } = mount({ isPro: false, rules: { ...DEFAULT_SETTINGS.rules, adverb: false } });
	const rows = root.findAll((el) => el.hasClass("pl-legend-row"));
	assert.ok(
		!rows.some((row) => row.text().startsWith("Adverbs")),
		"a disabled rule paints nothing, so it has nothing to explain"
	);
	assert.ok(rows.length > 0, "the other rules are still listed");
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

// --- the de-slop teaser: a real number, and nothing but the number -------------------------------
//
// This is the one place a free user learns a fact about their own draft, so it has to be true.
// The count is computed in the panel, BEFORE the engine's ignore and overlap passes, while a
// Pro user sees marks that have been through both. If those two ever disagree, the teaser
// promises four phrases and Pro delivers three — which is worse than showing nothing.
{
	const CORPUS = [
		"It is worth noting that the results delve into a testament to good intentions.",
		"At the end of the day, it is worth noting that the the results matter.",
		"This is not just an editing tip, it is a habit. It is worth noting that.",
		"A testament to — good — intentions — and — more — dashes — here.",
		"It is worth noting it is worth noting it is worth noting.",
		"Delve. Delve deeper. It is worth noting that we should delve into a testament to this.",
		"The report is not just thorough, it is exhaustive, and it is worth noting that.",
		"```\nit is worth noting that this is code\n```\nBut it is worth noting that this is prose.",
		PROSE,
	];

	for (const text of CORPUS) {
		const free = mount({ isPro: false }, text);
		const shownToPro = analyze(text, { isPro: true }).stats.counts.deslop ?? 0;

		// No de-slop mark may reach a free user's analysis at all — the engine gate, unchanged.
		assert.ok(
			!free.analysis.marks.some((mark) => mark.rule === "deslop"),
			"a free analysis must never contain a de-slop mark"
		);

		const text_ = free.root.text();
		if (shownToPro === 0) {
			assert.ok(
				text_.includes("No filler phrases found"),
				`a clean note must say so plainly: ${text.slice(0, 40)}`
			);
		} else {
			assert.ok(
				text_.includes(`${shownToPro} matching phrase`),
				`the teaser must show exactly what Pro would show (${shownToPro}) for: ${text.slice(0, 40)}`
			);
		}
	}
}

// --- ...and it must not read as a shakedown ------------------------------------------------------
{
	const { root } = mount({ isPro: false }, "It is worth noting that this is a testament to delve.");
	const text = root.text();
	assert.ok(text.includes("matching phrases"), "flat, factual wording");
	for (const alarmist of ["problem", "error", "AI slop", "warning", "!"]) {
		assert.ok(!text.includes(alarmist), `the teaser must not say "${alarmist}"`);
	}
	// The count is all a free user gets. No locations, no phrases.
	assert.ok(!text.includes("worth noting"), "the matched phrases themselves stay behind the paywall");
	assert.ok(!text.includes("testament"), "same");

	// A Pro user gets marks and a legend row instead of a teaser.
	const pro = mount({ isPro: true }, "It is worth noting that this is a testament to delve.");
	assert.ok(!pro.root.text().includes("matching phrases"), "Pro is not sold what it already owns");
	assert.ok(pro.root.text().includes("De-slop"), "Pro gets a De-slop legend row");
}

// --- "no nag screen" must be something the user can enforce ---------------------------------------
{
	const hidden = mount(
		{ isPro: false, hideProSections: true },
		"It is worth noting that this is a testament to delve."
	);
	const text = hidden.root.text();
	assert.ok(!text.includes("matching phrases"), "the teaser is gone");
	assert.ok(!text.includes("Echoes"), "so is the echo card");
	assert.ok(!text.includes("Since you opened this note"), "and the delta card");
	assert.equal(hidden.root.findAll((el) => el.hasClass("pl-locked")).length, 0);
	assert.equal(hidden.root.findAll((el) => el.hasClass("pl-pro-btn")).length, 0, "and every buy button");

	// Everything free still works — that is the whole point of the switch.
	assert.ok(text.includes("Marks in this note"), "the legend survives");
	assert.ok(text.includes("Rhythm"), "so does the rhythm map");
	assert.ok(hidden.root.findAll((el) => el.hasClass("pl-bar")).length > 0);
}

// --- a rule the user turned off is not counted at them either -------------------------------------
{
	const off = mount(
		{ isPro: false, rules: { ...DEFAULT_SETTINGS.rules, deslop: false } },
		"It is worth noting that this is a testament to delve."
	);
	assert.ok(
		!off.root.text().includes("matching phrases"),
		"switching the rule off must silence the teaser, not just the marks"
	);
}

// --- an empty note says so instead of rendering a broken shell -----------------------------------
{
	const { root } = mount({ isPro: true }, "");
	assert.ok(root.text().includes("Open a note"), "an empty note gets an empty state");
	assert.equal(root.findAll((el) => el.hasClass("pl-bar")).length, 0);
}

// --- a SKIPPED note must say why, not claim there is no prose ------------------------------------
//
// The panel used to tell someone staring at 320,000 characters of prose to "open a note with
// some prose in it", because a muted note and an over-sized note both arrived here as a bare
// null. That reads as a broken plugin, and the rational response to a broken plugin is uninstall.
{
	const tooLarge = mount({ isPro: false }, "", {
		reason: "too-large",
		chars: 320412,
		limit: 300000,
	});
	const text = tooLarge.root.text();
	assert.ok(!text.includes("Open a note"), "an over-sized note must not be called empty");
	assert.ok(text.includes("too large"), "it must say the note is too large");
	assert.ok(text.includes("320,412"), "and how large it actually is");
	assert.ok(text.includes("300,000"), "and what the limit is");
	assert.ok(text.toLowerCase().includes("settings"), "and where to change it");

	const muted = mount({ isPro: false }, "", { reason: "muted" });
	assert.ok(muted.root.text().includes("muted"), "a muted note says it is muted");
	assert.ok(!muted.root.text().includes("Open a note"));
}

console.log("ok  panel.test.ts");
