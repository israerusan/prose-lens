import type { Analysis } from "../core/types.d.mts";
import { easeLabel } from "../core/readability.mjs";

/**
 * The reading grade in the status bar. Owns its own element and its own emptiness rules, so
 * main.ts does not have to know that an analysis-less editor, a wordless note, and a
 * disabled setting all render as nothing.
 */
export class StatusBar {
	constructor(private el: HTMLElement) {
		this.el.addClass("pl-status");
	}

	/** The status-bar element, so the plugin can register its click handler on it. */
	get element(): HTMLElement {
		return this.el;
	}

	render(analysis: Analysis | null, enabled: boolean): void {
		this.el.empty();
		this.el.removeAttribute("aria-label");
		if (!enabled || !analysis || analysis.stats.words === 0) return;

		const { grade, flesch, words } = analysis.stats;
		this.el.setText(`Grade ${grade.toFixed(1)} · ${easeLabel(flesch)}`);
		this.el.setAttr("aria-label", `${words} words, reading ease ${flesch.toFixed(0)}`);
	}
}
