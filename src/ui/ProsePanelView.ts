import { ItemView, type WorkspaceLeaf } from "obsidian";
import type ProseLensPlugin from "../main";
import type { Analysis } from "../core/types.d.mts";
import { rhythm } from "../core/rhythm.mjs";
import { findEchoes } from "../core/echo.mjs";
import { findSlop } from "../core/deslop.mjs";
import type { Echo } from "../core/echo.d.mts";
import { diffSnapshots, hasMoved, snapshot } from "../core/delta.mjs";
import { easeLabel } from "../core/readability.mjs";
import { createExternalLink } from "./links";
import { describeSkip } from "./StatusBar";
import { LEGEND } from "./ruleLegend";
// The tier table, not a hand-written `settings.isPro` check. featureGates.mjs calls itself the
// single source of truth for what is free, and until these call sites existed it had authority
// over exactly one of the four Pro features — so a future edit to the table could pass its own
// tests while the panel went on gating whatever it had hardcoded.
import { isFeatureEnabled } from "../core/featureGates.mjs";
import { PRO_PRICE_LABEL, PRO_UNLOCK_SUMMARY, PURCHASE_URL } from "../product";
import { ProUpsellModal } from "./pro/ProUpsellModal";

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
 * De-slop counts for free users, keyed by the analysis that produced them.
 *
 * The count is computed HERE rather than in the rule engine, and that is a cost decision,
 * not a style one. Running the de-slop pass inside `analyze()` would charge every free user
 * roughly 9ms per keystroke on a 100k note whether or not they ever open the panel;
 * computing it in the panel charges only the free users actually looking at it. The engine,
 * the tier table, and the "a free user's marks array never contains a de-slop mark"
 * invariant are all untouched.
 *
 * Same WeakMap discipline as the echoes: `render()` runs on every analysis, so without this
 * the count would be recomputed on every keystroke.
 */
const deslopCache = new WeakMap<Analysis, number>();

function countSlop(analysis: Analysis): number {
	const cached = deslopCache.get(analysis);
	if (cached !== undefined) return cached;
	// The masked text rides along on the analysis, so this is one token scan — no second read
	// of the editor and no second mask of the note.
	const count = findSlop(analysis.masked, analysis.sentences).length;
	deslopCache.set(analysis, count);
	return count;
}

/**
 * The side panel: the rhythm map (free) plus the echo detector and revision delta (Pro).
 *
 * It renders from whatever the active editor last published and never re-reads the
 * document, so opening the panel cannot disagree with the marks in the editor.
 */
export class ProsePanelView extends ItemView {
	/** Sentence/echo offsets for the currently rendered rows, addressed by row index. */
	private targets: number[] = [];
	/** How far through each rule's marks the user has walked, so a second click advances. */
	private ruleCursor = new Map<string, number>();

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
			const ruleRow = target.closest<HTMLElement>("[data-pl-rule]");
			if (ruleRow?.dataset.plRule) {
				this.jumpToRule(ruleRow.dataset.plRule);
				return;
			}
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
			// A muted or over-sized note used to land here too, so the panel told someone
			// looking at 320,000 characters of prose to "open a note with some prose in it".
			const skipped = this.plugin.currentSkip();
			root.createDiv({
				cls: "pl-empty",
				text: skipped ? describeSkip(skipped) : "Open a note with some prose in it.",
			});
			return;
		}

		this.renderSummary(root, analysis);
		this.renderMarks(root, analysis);
		this.renderRhythm(root, analysis);
		// One switch removes every Pro surface from the panel. The free tier promises no caps
		// and no nag screen, and a promise that cannot be enforced by the user is a slogan.
		if (this.plugin.settings.hideProSections) return;
		this.renderDeslop(root, analysis);
		this.renderEcho(root, analysis);
		this.renderDelta(root, analysis);
	}

	/**
	 * How much filler this note contains — the number only, never where.
	 *
	 * A free user could not previously form any opinion about de-slop, because the rule is
	 * gated inside `analyze()` and the mark never exists for them. Nothing in the product
	 * ever said anything about THEIR draft; the locked cards described a feature category
	 * they had never heard of. This is the one place free learns a fact about its own text.
	 *
	 * The boundary is deliberate and it is the whole design: free answers "does this draft
	 * have the problem?", Pro answers "where is it, and how do I work through it?". A count
	 * is not actionable on its own — you cannot fix four phrases you cannot see — so it sells
	 * the result without handing over the tool.
	 *
	 * Guards that keep this a diagnosis rather than a shakedown: it renders only inside a
	 * panel the user chose to open, never as a notice, a modal, or an editor mark; the
	 * wording is flat ("matching phrases", never "problems", never "AI slop"); a zero says so
	 * plainly rather than going quiet; and `hideProSections` deletes it outright.
	 */
	private renderDeslop(root: HTMLElement, analysis: Analysis): void {
		const settings = this.plugin.settings;
		// A Pro user sees the marks themselves and a De-slop row in the legend above; a user
		// who switched the rule off has said they do not want it counted either.
		if (settings.isPro || settings.rules.deslop === false) return;

		const section = root.createDiv({ cls: "pl-section" });
		const heading = section.createEl("h3", { text: "Filler and AI-isms" });
		heading.createSpan({ cls: "pl-pro-pill", text: "Pro" });

		const count = countSlop(analysis);
		if (count === 0) {
			section.createDiv({ cls: "pl-empty", text: "No filler phrases found in this note." });
			return;
		}

		const locked = section.createDiv({ cls: "pl-locked" });
		locked.createDiv({
			cls: "pl-locked-text",
			text: `${count} matching ${count === 1 ? "phrase" : "phrases"} in this note.`,
		});
		locked.createDiv({ cls: "pl-locked-sub", text: "Pro highlights each one where it sits." });
		const explain = locked.createEl("button", { cls: "pl-locked-link", text: "What counts?" });
		explain.addEventListener("click", () => {
			new ProUpsellModal(this.app, "deslop").open();
		});
		createExternalLink(locked, {
			cls: "pl-pro-btn",
			text: `Get Pro — ${PRO_PRICE_LABEL}`,
			url: PURCHASE_URL,
		});
	}

	/**
	 * What is marked in this note, what each colour means, and a way to walk them.
	 *
	 * Every number here comes from `stats.counts`, which the rule engine has always computed
	 * and which nothing in the product ever read. So this section costs no analysis at all —
	 * it is the plugin finally showing work it was already doing.
	 *
	 * It sits directly under Readability and above the two Pro sections on purpose. A free
	 * user who found the panel used to get four numbers, a bar chart, and two locked cards,
	 * which reads as "this is mostly an advert". Three substantive free sections above the
	 * locked ones makes them read as "there is more", which is what they actually are.
	 */
	private renderMarks(root: HTMLElement, analysis: Analysis): void {
		const section = root.createDiv({ cls: "pl-section" });
		section.createEl("h3", { text: "Marks in this note" });

		const settings = this.plugin.settings;
		if (!settings.marksEnabled) {
			section.createDiv({ cls: "pl-empty", text: "Style marks are turned off." });
			return;
		}

		const list = section.createDiv({ cls: "pl-legend" });
		let total = 0;
		for (const rule of LEGEND) {
			// De-slop belongs to the Pro section, which speaks for itself. A rule the user has
			// switched off is not a legend entry — it is not painting anything to explain.
			// A Pro rule is a legend entry only for a Pro user — for anyone else it is painting
			// nothing, and the section below speaks for it.
			if ((rule.pro && !settings.isPro) || settings.rules[rule.id] === false) continue;

			const count = analysis.stats.counts[rule.id] ?? 0;
			total += count;

			const row = list.createDiv({ cls: count > 0 ? "pl-legend-row" : "pl-legend-row is-empty" });
			// The sample IS the rule's name painted with the rule's own mark class, so the
			// legend cannot disagree with the editor.
			row.createSpan({ cls: `pl-legend-sample ${rule.markClass}`, text: rule.name });
			row.createSpan({ cls: "pl-legend-count", text: String(count) });
			if (count > 0) {
				row.dataset.plRule = rule.id;
				row.setAttr("aria-label", `${count} ${rule.name.toLowerCase()} — go to the next one`);
				row.setAttr("title", "Go to the next one");
			}
		}

		section.createDiv({
			cls: "pl-note",
			text:
				total === 0
					? "Nothing marked here. Clean draft."
					: "Click a row to walk through them. Marked something you would keep? Right-click the word to ignore it, or turn the rule off in settings.",
		});
	}

	/**
	 * Jump to the next mark of one rule, cycling round at the end.
	 *
	 * Cycling rather than always landing on the first is the difference between a legend and
	 * a tool: clicking "Passive voice" three times walks the three passives.
	 */
	private jumpToRule(rule: string): void {
		const analysis = this.plugin.currentAnalysis();
		if (!analysis) return;
		const offsets = analysis.marks.filter((mark) => mark.rule === rule).map((mark) => mark.from);
		if (offsets.length === 0) return;
		// The modulo keeps the cursor valid on its own as the user edits and the count moves.
		const next = ((this.ruleCursor.get(rule) ?? -1) + 1) % offsets.length;
		this.ruleCursor.set(rule, next);
		this.plugin.revealOffset(offsets[next]);
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

		// A loop, not Math.max(...lengths). Spreading an array into a call throws
		// "Maximum call stack size exceeded" somewhere north of 125,000 arguments, and a note
		// of very short sentences reaches that inside the size cap.
		let longest = 1;
		for (const length of result.lengths) {
			if (length > longest) longest = length;
		}
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

		if (!isFeatureEnabled("echo", this.plugin.settings.isPro)) {
			this.renderLocked(section, "See which words you lean on, and where.", "echo");
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

		if (!isFeatureEnabled("delta", this.plugin.settings.isPro)) {
			this.renderLocked(section, "Watch the grade fall as you cut.", "delta");
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

	private renderLocked(section: HTMLElement, promise: string, feature: string): void {
		const locked = section.createDiv({ cls: "pl-locked" });
		locked.createDiv({ cls: "pl-locked-text", text: promise });
		locked.createDiv({ cls: "pl-locked-sub", text: `Unlock ${PRO_UNLOCK_SUMMARY}.` });
		// product.ts has carried per-feature copy for all four Pro features since 1.0, and
		// only `focus` was ever shown — the sole upsell modal in the product sold the one Pro
		// feature that has a free competitor in the store. This reaches the other three.
		const explain = locked.createEl("button", { cls: "pl-locked-link", text: "What is this?" });
		explain.addEventListener("click", () => {
			new ProUpsellModal(this.app, feature).open();
		});
		createExternalLink(locked, {
			cls: "pl-pro-btn",
			text: `Get Pro — ${PRO_PRICE_LABEL}`,
			url: PURCHASE_URL,
		});
	}
}
