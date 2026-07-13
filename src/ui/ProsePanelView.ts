import { ItemView, type WorkspaceLeaf } from "obsidian";
import type ProseLensPlugin from "../main";
import type { Analysis } from "../core/types.d.mts";
import { rhythm } from "../core/rhythm.mjs";
import { findEchoes } from "../core/echo.mjs";
import type { Echo } from "../core/echo.d.mts";
import { diffSnapshots, hasMoved, snapshot } from "../core/delta.mjs";
import { easeLabel } from "../core/readability.mjs";
import { createExternalLink } from "../settings";
import { PRO_PRICE_LABEL, PRO_UNLOCK_SUMMARY, PURCHASE_URL } from "../product";

export const VIEW_TYPE_PROSE_PANEL = "prose-lens-panel";

/**
 * Echoes, keyed by the analysis that produced them.
 *
 * The echo pass is the most expensive thing in the panel, and render() runs on EVERY
 * analysis — so without this the panel doubled the per-keystroke cost of the whole
 * plugin. A WeakMap keyed on the Analysis object means each analysis is scanned at most
 * once, and the entry dies with it.
 */
const echoCache = new WeakMap<Analysis, Echo[]>();

/**
 * The side panel: the rhythm map (free) plus the echo detector and revision delta (Pro).
 *
 * It renders from whatever the active editor last published and never re-reads the
 * document, so opening the panel cannot disagree with the marks in the editor.
 */
export class ProsePanelView extends ItemView {
	/** Sentence/echo offsets for the currently rendered rows, addressed by row index. */
	private targets: number[] = [];

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
		// ONE delegated listener for the whole panel, registered once.
		//
		// The first version called registerDomEvent per rhythm bar and per echo row inside
		// render() — and render() runs on every analysis. Component.registerDomEvent only
		// releases its registrations on view unload, so every keystroke added hundreds more
		// that were never freed. Delegation means the listener count is exactly one, forever.
		this.registerDomEvent(this.contentEl, "click", (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const row = target.closest<HTMLElement>("[data-pl-target]");
			if (!row) return;
			const index = Number(row.dataset.plTarget);
			const offset = this.targets[index];
			if (typeof offset === "number") this.plugin.revealOffset(offset);
		});
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.targets = [];
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("pl-panel");
		this.targets = [];

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

	/** Register a click target and return the index to stamp on the row. */
	private target(offset: number): string {
		this.targets.push(offset);
		return String(this.targets.length - 1);
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
			// The bar length IS the data — it cannot live in styles.css. It is published as a
			// CSS custom property, which a theme can still override, rather than as a raw
			// inline `width`.
			//
			// setCssProps, NOT setCssStyles. setCssStyles is Object.assign onto a
			// CSSStyleDeclaration, so a "--custom-prop" key lands as a JS expando and sets no
			// CSS variable at all — every bar silently fell back to width:100% and the rhythm
			// map, the headline free feature, rendered as a solid block. setCssProps exists for
			// exactly this and calls setProperty underneath.
			bar.setCssProps({
				"--pl-bar-width": `${Math.max(4, Math.round((length / longest) * 100))}%`,
			});
			bar.setAttr("aria-label", `${length} words`);
			bar.setAttr("title", `${length} words`);
			bar.dataset.plTarget = this.target(analysis.sentences[index].from);
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

		// The masked text rides along on the analysis, so there is no second read of the
		// editor and no second mask of the whole note here.
		let echoes = echoCache.get(analysis);
		if (!echoes) {
			echoes = findEchoes(analysis.masked, analysis.sentences);
			echoCache.set(analysis, echoes);
		}

		if (echoes.length === 0) {
			section.createDiv({ cls: "pl-empty", text: "Nothing repeats. Good." });
			return;
		}

		const list = section.createDiv({ cls: "pl-echo-list" });
		for (const echo of echoes) {
			const row = list.createDiv({ cls: "pl-echo" });
			row.createSpan({ cls: "pl-echo-term", text: echo.term });
			row.createSpan({ cls: "pl-echo-count", text: `${echo.count}×` });
			row.dataset.plTarget = this.target(echo.offsets[0]);
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
		locked.createDiv({ cls: "pl-locked-sub", text: `Unlock ${PRO_UNLOCK_SUMMARY}.` });
		createExternalLink(locked, {
			cls: "pl-pro-btn",
			text: `Get Pro — ${PRO_PRICE_LABEL}`,
			url: PURCHASE_URL,
		});
	}
}
