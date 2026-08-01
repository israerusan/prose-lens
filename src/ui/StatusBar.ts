import type { Analysis } from "../core/types.d.mts";
import { easeLabel } from "../core/readability.mjs";
import type { SkipReason } from "../editor/proseLensExtension";

/**
 * The reading grade in the status bar. Owns its own element and its own emptiness rules, so
 * main.ts does not have to know that an analysis-less editor, a wordless note, and a
 * disabled setting all render as nothing.
 *
 * Note for anyone reading this on mobile: Obsidian has no status bar there
 * (`addStatusBarItem` is documented "Not available on mobile"), so none of this renders and
 * the panel is the only home for the grade.
 */
export class StatusBar {
	constructor(private el: HTMLElement) {
		this.el.addClass("pl-status");
		// Set once, in the constructor, NOT in render(). render() returns early for a wordless
		// note and for a disabled grade, and an element with no text and no tooltip is a
		// zero-width invisible click target — which is what the one mouse-discoverable route
		// to the panel used to be.
		this.el.setAttr("title", "Prose Lens — click to open the prose panel");
	}

	/** The status-bar element, so the plugin can register its click handler on it. */
	get element(): HTMLElement {
		return this.el;
	}

	render(analysis: Analysis | null, enabled: boolean, skipped: SkipReason | null = null): void {
		this.el.empty();
		this.el.removeAttribute("aria-label");
		if (!enabled) return;

		// Saying nothing is what made a skipped note look like a broken plugin. It costs one
		// short string to say the plugin is working and chose not to run.
		if (skipped) {
			this.el.setText(skipped.reason === "muted" ? "Prose muted" : "Prose paused");
			this.el.setAttr("aria-label", describeSkip(skipped));
			this.el.setAttr("title", `${describeSkip(skipped)} Click to open the prose panel.`);
			return;
		}
		this.el.setAttr("title", "Prose Lens — click to open the prose panel");

		if (!analysis || analysis.stats.words === 0) return;

		const { grade, flesch, words } = analysis.stats;
		this.el.setText(`Grade ${grade.toFixed(1)} · ${easeLabel(flesch)}`);
		// "Grade 7.7" is a number with no scale, no direction and no target to anyone who has
		// not met Flesch–Kincaid. One sentence turns it into something actionable.
		const explained =
			`${words.toLocaleString()} words · Flesch–Kincaid grade ${grade.toFixed(1)} — ` +
			`the US school grade needed to read this note; most web writing lands 6–9. ` +
			`Reading ease ${flesch.toFixed(0)} (${easeLabel(flesch)}).`;
		this.el.setAttr("aria-label", explained);
		this.el.setAttr("title", `${explained} Click to open the prose panel.`);
	}
}

/** One plain sentence explaining why a note has no marks. Shared by the panel. */
export function describeSkip(skipped: SkipReason): string {
	if (skipped.reason === "muted") return "Marks are muted for this note.";
	return (
		`This note is too large for live analysis ` +
		`(${skipped.chars.toLocaleString()} characters, limit ${skipped.limit.toLocaleString()}). ` +
		`Raise the limit in settings, under Performance.`
	);
}
