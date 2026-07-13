import { ItemView, Setting, type WorkspaceLeaf } from "obsidian";
import type ProseLensPlugin from "../main";
import type { Analysis } from "../core/types.d.mts";
import { rhythm } from "../core/rhythm.mjs";
import { findEchoes } from "../core/echo.mjs";
import { diffSnapshots, hasMoved, snapshot } from "../core/delta.mjs";
import { easeLabel } from "../core/readability.mjs";
import { maskText } from "../core/mask.mjs";
import { createExternalLink } from "../settings";
import { PRO_PRICE_LABEL, PRO_UNLOCK_SUMMARY, PURCHASE_URL } from "../product";

export const VIEW_TYPE_PROSE_PANEL = "prose-lens-panel";

/**
 * The side panel: the rhythm map (free) plus the echo detector and revision delta (Pro).
 *
 * It renders from whatever the active editor last published — it never analyses anything
 * itself, so opening the panel costs nothing and can never disagree with the marks in the
 * editor.
 */
export class ProsePanelView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ProseLensPlugin
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_PROSE_PANEL;
	}

	getDisplayText(): string {
		return "Prose";
	}

	getIcon(): string {
		return "pilcrow";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("pl-panel");

		const analysis = this.plugin.currentAnalysis();
		if (!analysis || analysis.stats.words === 0) {
			root.createDiv({ cls: "pl-empty", text: "Open a note with some prose in it." });
			return;
		}

		this.renderSummary(root, analysis);
		this.renderRhythm(root, analysis);
		this.renderEcho(root, analysis);
		this.renderDelta(root, analysis);
	}

	private renderSummary(root: HTMLElement, analysis: Analysis): void {
		const { stats } = analysis;
		const section = root.createDiv({ cls: "pl-section" });
		section.createEl("h3", { text: "Readability" });

		const grid = section.createDiv({ cls: "pl-stat-grid" });
		this.stat(grid, "Grade", stats.grade.toFixed(1));
		this.stat(grid, "Reading ease", `${stats.flesch.toFixed(0)} · ${easeLabel(stats.flesch)}`);
		this.stat(grid, "Words", String(stats.words));
		this.stat(grid, "Avg sentence", `${stats.avgSentenceWords.toFixed(1)} words`);
	}

	private stat(parent: HTMLElement, label: string, value: string): void {
		const cell = parent.createDiv({ cls: "pl-stat" });
		cell.createDiv({ cls: "pl-stat-value", text: value });
		cell.createDiv({ cls: "pl-stat-label", text: label });
	}

	private renderRhythm(root: HTMLElement, analysis: Analysis): void {
		const section = root.createDiv({ cls: "pl-section" });
		section.createEl("h3", { text: "Rhythm" });

		const result = rhythm(analysis.sentences, {
			longMin: this.plugin.settings.longSentenceWords,
			veryLongMin: this.plugin.settings.veryLongSentenceWords,
		});
		if (result.lengths.length === 0) {
			section.createDiv({ cls: "pl-empty", text: "No sentences yet." });
			return;
		}

		const longest = Math.max(...result.lengths, 1);
		const map = section.createDiv({ cls: "pl-rhythm" });
		result.lengths.forEach((length, index) => {
			const bar = map.createDiv({ cls: `pl-bar pl-bar-${result.bands[index]}` });
			// Width is data, not decoration — it has to be set per bar. setCssStyles keeps
			// it out of an inline style attribute the review bot rejects.
			bar.setCssStyles({ width: `${Math.max(4, Math.round((length / longest) * 100))}%` });
			bar.setAttr("aria-label", `${length} words`);
			bar.setAttr("title", `${length} words`);
			this.registerDomEvent(bar, "click", () => {
				this.plugin.revealOffset(analysis.sentences[index].from);
			});
		});

		const flat = result.monotoneRuns.reduce((total, run) => total + run.length, 0);
		section.createDiv({
			cls: "pl-note",
			text:
				result.monotoneRuns.length === 0
					? `Variety ${result.variety.toFixed(1)}. No flat stretches.`
					: `Variety ${result.variety.toFixed(1)}. ${flat} sentences sit in ${result.monotoneRuns.length} flat stretch${result.monotoneRuns.length === 1 ? "" : "es"} — same length, one after another.`,
		});
	}

	private renderEcho(root: HTMLElement, analysis: Analysis): void {
		const section = root.createDiv({ cls: "pl-section" });
		const heading = section.createEl("h3", { text: "Echoes" });
		heading.createSpan({ cls: "pl-pro-pill", text: "Pro" });

		if (!this.plugin.settings.isPro) {
			this.renderLocked(section, "See which words you lean on, and where.");
			return;
		}

		const masked = maskText(this.plugin.currentText() ?? "");
		const echoes = findEchoes(masked, analysis.sentences);
		if (echoes.length === 0) {
			section.createDiv({ cls: "pl-empty", text: "Nothing repeats. Good." });
			return;
		}

		const list = section.createDiv({ cls: "pl-echo-list" });
		for (const echo of echoes) {
			const row = list.createDiv({ cls: "pl-echo" });
			row.createSpan({ cls: "pl-echo-term", text: echo.term });
			row.createSpan({ cls: "pl-echo-count", text: `${echo.count}×` });
			this.registerDomEvent(row, "click", () => {
				this.plugin.revealOffset(echo.offsets[0]);
			});
		}
	}

	private renderDelta(root: HTMLElement, analysis: Analysis): void {
		const section = root.createDiv({ cls: "pl-section" });
		const heading = section.createEl("h3", { text: "Since you opened this note" });
		heading.createSpan({ cls: "pl-pro-pill", text: "Pro" });

		if (!this.plugin.settings.isPro) {
			this.renderLocked(section, "Watch the grade fall as you cut.");
			return;
		}

		const baseline = this.plugin.currentBaseline();
		if (!baseline) {
			section.createDiv({ cls: "pl-empty", text: "No baseline yet." });
			return;
		}

		const rows = diffSnapshots(baseline, snapshot(analysis.stats));
		if (!hasMoved(rows)) {
			section.createDiv({ cls: "pl-empty", text: "Nothing has changed yet." });
			return;
		}

		const table = section.createDiv({ cls: "pl-delta" });
		for (const row of rows) {
			if (row.delta === 0) continue;
			const line = table.createDiv({ cls: "pl-delta-row" });
			line.createSpan({ cls: "pl-delta-label", text: row.label });
			const sign = row.delta > 0 ? "+" : "";
			const value = line.createSpan({
				cls: "pl-delta-value",
				text: `${sign}${row.delta.toFixed(1).replace(/\.0$/, "")}`,
			});
			if (row.better === true) value.addClass("is-better");
			if (row.better === false) value.addClass("is-worse");
		}
	}

	private renderLocked(section: HTMLElement, promise: string): void {
		const locked = section.createDiv({ cls: "pl-locked" });
		locked.createDiv({ cls: "pl-locked-text", text: promise });
		new Setting(locked)
			.setDesc(`Unlock ${PRO_UNLOCK_SUMMARY}.`)
			.addExtraButton((button) => button.setIcon("lock").setDisabled(true).setTooltip("Pro feature"));
		createExternalLink(locked, {
			cls: "pl-pro-btn",
			text: `Get Pro — ${PRO_PRICE_LABEL}`,
			url: PURCHASE_URL,
		});
	}
}
