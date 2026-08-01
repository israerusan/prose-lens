import { MarkdownView, Plugin, type WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { Analysis } from "./core/types.d.mts";
import type { Snapshot } from "./core/delta.d.mts";
import { resolveLicenseTransition } from "./core/licenseTransition.mjs";
import { snapshot } from "./core/delta.mjs";
import { LicenseManager } from "./license/LicenseManager";
import { PRODUCT_NAME } from "./product";
import { DEFAULT_SETTINGS, normalizeSettings, type ProseLensSettings } from "./settings";
import { ProseLensSettingTab } from "./ui/SettingsTab";
import { proseLensExtension, type EditorHost } from "./editor/proseLensExtension";
import { ProsePanelView, VIEW_TYPE_PROSE_PANEL } from "./ui/ProsePanelView";
import { StatusBar } from "./ui/StatusBar";
import { noticeFocus, noticeMarks, noticeMuted, registerCommands } from "./commands";
import { Notice } from "obsidian";
import type { SkipReason } from "./editor/proseLensExtension";

/**
 * The note a leaf holds, whether or not that leaf is currently loaded.
 *
 * Since Obsidian 1.7 a backgrounded tab is DEFERRED: its `view` is a `DeferredView`, not a
 * `MarkdownView`. An `instanceof MarkdownView` check therefore reports every background tab
 * as closed — so any `layout-change` (resizing a pane, toggling a sidebar, opening the prose
 * panel) evicted the delta baseline of every note the user was not looking at, and "Since
 * you opened this note" quietly came to mean "since you last came back to it".
 *
 * The view state carries the path either way, and it works on older releases too, which
 * `leaf.isDeferred` does not.
 */
function pathForLeaf(leaf: WorkspaceLeaf): string | null {
	const view = leaf.view;
	if (view instanceof MarkdownView && view.file) return view.file.path;
	const file = leaf.getViewState().state?.file;
	return typeof file === "string" ? file : null;
}

/** How long a burst of continuous setting changes is coalesced before a write. */
const SAVE_DEBOUNCE_MS = 400;

export default class ProseLensPlugin extends Plugin implements EditorHost {
	settings: ProseLensSettings = { ...DEFAULT_SETTINGS };

	/** Bumped on every settings save; the editor extension re-runs when it changes. */
	settingsEpoch = 0;

	private statusBar: StatusBar | null = null;
	/** The analysis of the editor the user is actually looking at. */
	private activeAnalysis: Analysis | null = null;
	/**
	 * The last analysis of each open note. Switching tabs must not blank the status bar for a
	 * note that has already been analyzed — the new editor may never fire an update, so there
	 * would be nothing to re-publish. Evicted when the note is no longer open anywhere.
	 */
	private analyses = new Map<string, Analysis>();
	/** Why each open note has no analysis, for the notes that have none. */
	private skips = new Map<string, SkipReason>();
	private activeSkip: SkipReason | null = null;
	/** Opening state per note, for the Pro revision delta. Session-scoped, never persisted. */
	private baselines = new Map<string, Snapshot>();
	private saveTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.refreshLicense();

		// The plugin IS the editor host. An object literal would snapshot `settingsEpoch` as a
		// primitive at construction, and the extension would never see a settings change again.
		this.registerEditorExtension(proseLensExtension(this));
		this.registerView(VIEW_TYPE_PROSE_PANEL, (leaf) => new ProsePanelView(leaf, this));

		// The panel is half the product and had no visible entry point at all: no ribbon icon,
		// and a status bar that opened it without ever saying so. On mobile it was worse —
		// Obsidian has no status bar there, so the command palette was the only route.
		this.addRibbonIcon("pilcrow", `${PRODUCT_NAME} — open the prose panel`, () => {
			void this.activatePanel();
		});

		this.statusBar = new StatusBar(this.addStatusBarItem());
		this.registerDomEvent(this.statusBar.element, "click", () => {
			void this.activatePanel();
		});
		this.statusBar.render(null, this.settings.showStatusBar);

		registerCommands(this);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				// Re-publish the note's own analysis rather than blanking. An already-open tab may
				// never fire an editor update on the way back to it, so blanking here left the
				// status bar empty and the panel showing the PREVIOUS note's numbers.
				const path = file?.path ?? null;
				this.activeAnalysis = path ? (this.analyses.get(path) ?? null) : null;
				this.activeSkip = path ? (this.skips.get(path) ?? null) : null;
				this.statusBar?.render(
					this.activeAnalysis,
					this.settings.showStatusBar,
					this.activeSkip
				);
				this.refreshPanels();
			})
		);

		// Eviction belongs on layout-change, NOT file-open: file-open fires after the leaf
		// already holds the file, so a note being reopened is always still "open" and its stale
		// baseline would survive the very eviction meant to clear it.
		this.registerEvent(this.app.workspace.on("layout-change", () => this.evictClosedNotes()));

		this.addSettingTab(new ProseLensSettingTab(this));

		// Inside onLayoutReady, never in onload: opening a leaf while the workspace is still
		// assembling fights Obsidian for the layout, and it is one of the things plugin review
		// looks for.
		this.app.workspace.onLayoutReady(() => {
			void this.revealPanelOnce();
		});
	}

	/**
	 * Show the panel the first time the plugin ever loads, and never again.
	 *
	 * Installing used to do nothing observable whatsoever. Marks appeared in whatever note was
	 * open, in seven colours explained nowhere, and the panel that explains them was reachable
	 * only from the command palette. This is the smallest thing that fixes it: one reveal, one
	 * sentence, no modal, no tour, no second occurrence.
	 *
	 * The flag is written BEFORE the panel opens, so a failure to open cannot turn this into
	 * something that greets the user on every launch.
	 */
	private async revealPanelOnce(): Promise<void> {
		if (this.settings.hasSeenWelcome) return;
		this.settings.hasSeenWelcome = true;
		await this.saveSettings();
		await this.activatePanel();
		new Notice(
			`${PRODUCT_NAME} is marking your prose. The panel lists what each colour means — and nothing is ever written to your notes.`,
			8000
		);
	}

	onunload(): void {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			// FLUSH, don't drop. Dragging a slider and then quitting inside the debounce window
			// used to discard the write silently. onunload is synchronous, so this is
			// fire-and-forget by necessity — but issuing the write beats dropping it.
			void this.saveData(this.settings);
		}
		this.baselines.clear();
		this.analyses.clear();
		this.skips.clear();
	}

	// --- settings -------------------------------------------------------------

	async loadSettings(): Promise<void> {
		// Every coercion lives in normalizeSettings, where a test can reach it without an app.
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.saveData(this.settings);
		this.settingsEpoch++;
		// Public API for "re-apply editor extensions" — every open editor re-runs its analysis
		// without this plugin ever reaching into a CodeMirror instance.
		this.app.workspace.updateOptions();
		this.refreshPanels();
	}

	/**
	 * Coalesced save, for controls that fire continuously. A slider fires an onChange per step
	 * and the license field one per keystroke; each save bumps the epoch, and each epoch bump
	 * makes every open editor re-analyse its whole note.
	 */
	queueSave(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.saveSettings();
		}, SAVE_DEBOUNCE_MS);
	}

	/** Flush a queued save immediately — the settings tab calls this when it closes. */
	async flushPendingSave(): Promise<void> {
		if (this.saveTimer === null) return;
		await this.saveSettings();
	}

	/**
	 * Re-verify the stored key and apply the resulting entitlement.
	 *
	 * @param persistUnchanged save even when nothing moved (so a key being typed survives a restart)
	 * @param coalesce queue the save instead of writing immediately
	 * @returns true when Pro actually flipped — the caller re-renders on that, and only that
	 */
	async refreshLicense(persistUnchanged = false, coalesce = false): Promise<boolean> {
		const verified = this.settings.licenseKey
			? LicenseManager.verify(this.settings.licenseKey)
			: null;
		const transition = resolveLicenseTransition(
			{ isPro: this.settings.isPro, email: this.settings.licenseEmail },
			this.settings.licenseKey,
			verified,
			persistUnchanged
		);
		this.settings.isPro = transition.isPro;
		this.settings.licenseEmail = transition.email;
		if (transition.persist) {
			// A Pro flip is a real state change and must land now; a keystroke in the key field
			// that changed nothing else can wait.
			if (coalesce && !transition.flipped) this.queueSave();
			else await this.saveSettings();
		}
		return transition.flipped;
	}

	// --- state changes (called by commands.ts) --------------------------------

	async setMarksEnabled(enabled: boolean): Promise<void> {
		this.settings.marksEnabled = enabled;
		await this.saveSettings();
		noticeMarks(enabled);
	}

	async setFocusMode(enabled: boolean): Promise<void> {
		this.settings.focusMode = enabled;
		await this.saveSettings();
		noticeFocus(enabled);
	}

	async toggleMuted(path: string): Promise<void> {
		const muted = this.settings.mutedPaths.includes(path);
		this.settings.mutedPaths = muted
			? this.settings.mutedPaths.filter((entry) => entry !== path)
			: [...this.settings.mutedPaths, path];
		await this.saveSettings();
		noticeMuted(!muted);
	}

	async ignoreWord(word: string): Promise<void> {
		if (this.settings.ignoredWords.includes(word)) return;
		this.settings.ignoredWords = [...this.settings.ignoredWords, word].sort();
		await this.saveSettings();
		new Notice(`${PRODUCT_NAME} will stop marking "${word}".`);
	}

	// --- analysis plumbing ----------------------------------------------------

	/** EditorHost. Called by the editor extension after each analysis. */
	onAnalysis(view: EditorView, analysis: Analysis | null, skipped: SkipReason | null): void {
		const path = this.pathFor(view);
		if (path) {
			if (analysis) this.analyses.set(path, analysis);
			else this.analyses.delete(path);
			if (skipped) this.skips.set(path, skipped);
			else this.skips.delete(path);
			// The first analysis after the note is opened becomes the delta baseline. The entry
			// is dropped when the note closes, so "since you opened this note" is literally true.
			if (analysis && !this.baselines.has(path)) {
				this.baselines.set(path, snapshot(analysis.stats));
			}
		}
		if (!this.isActiveEditor(view)) return;
		this.activeAnalysis = analysis;
		this.activeSkip = skipped;
		this.statusBar?.render(analysis, this.settings.showStatusBar, skipped);
		this.refreshPanels();
	}

	/** Why the active note has no analysis, when it has none. */
	currentSkip(): SkipReason | null {
		return this.activeSkip;
	}

	/** EditorHost. True when the user has muted marks for the note in this editor. */
	isMuted(view: EditorView): boolean {
		const path = this.pathFor(view);
		return path !== null && this.settings.mutedPaths.includes(path);
	}

	currentAnalysis(): Analysis | null {
		return this.activeAnalysis;
	}

	currentBaseline(): Snapshot | null {
		const path = this.activeMarkdownView()?.file?.path;
		if (!path) return null;
		return this.baselines.get(path) ?? null;
	}

	/**
	 * The note the user is working in — which is NOT the same as the active view.
	 *
	 * Clicking a row in the prose panel makes the SIDEBAR leaf active, so
	 * getActiveViewOfType(MarkdownView) returns null at exactly the moment the click is
	 * handled. Every clickable row in the panel silently did nothing because of that, and the
	 * delta section reported "No baseline yet." the first time it was opened.
	 * getMostRecentLeaf exists for this case: the API doc describes it as being for
	 * "interacting with the leaf in the root split while a sidebar leaf might be active".
	 */
	private activeMarkdownView(): MarkdownView | null {
		const recent = this.app.workspace.getMostRecentLeaf()?.view;
		if (recent instanceof MarkdownView) return recent;
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	/** Jump the editor to a document offset — the panel's rows are clickable. */
	revealOffset(offset: number): void {
		const active = this.activeMarkdownView();
		if (!active || typeof offset !== "number" || offset < 0) return;
		const editor = active.editor;
		const position = editor.offsetToPos(Math.min(offset, editor.getValue().length));
		editor.setCursor(position);
		editor.scrollIntoView({ from: position, to: position }, true);
		editor.focus();
	}

	async activatePanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROSE_PANEL)[0];
		const leaf: WorkspaceLeaf | null = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: VIEW_TYPE_PROSE_PANEL, active: true });
		void this.app.workspace.revealLeaf(leaf);
	}

	private refreshPanels(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROSE_PANEL)) {
			const view = leaf.view;
			if (view instanceof ProsePanelView) view.render();
		}
	}

	/**
	 * Drop cached state for notes no longer open in any leaf. Both maps are keyed by path and
	 * would otherwise grow for the whole session — and a stale baseline would make "since you
	 * opened this note" quietly mean "since the first time you ever opened it".
	 */
	private evictClosedNotes(): void {
		const open = new Set<string>();
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const path = pathForLeaf(leaf);
			if (path) open.add(path);
		}
		for (const path of [...this.analyses.keys()]) {
			if (!open.has(path)) this.analyses.delete(path);
		}
		for (const path of [...this.baselines.keys()]) {
			if (!open.has(path)) this.baselines.delete(path);
		}
		for (const path of [...this.skips.keys()]) {
			if (!open.has(path)) this.skips.delete(path);
		}
	}

	/**
	 * The note a CodeMirror view belongs to. Obsidian's public API has no view->file lookup, so
	 * match on DOM containment — public, stable, and cheaper than reaching into the private
	 * `editor.cm` handle most plugins use here.
	 */
	private markdownViewFor(view: EditorView): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const candidate = leaf.view;
			if (candidate instanceof MarkdownView && candidate.containerEl.contains(view.dom)) {
				return candidate;
			}
		}
		return null;
	}

	private pathFor(view: EditorView): string | null {
		return this.markdownViewFor(view)?.file?.path ?? null;
	}



	private isActiveEditor(view: EditorView): boolean {
		// Same reason as activeMarkdownView: with the prose panel focused, the active view is
		// the sidebar, and the status bar would blank itself for the note being analyzed.
		const active = this.activeMarkdownView();
		return active !== null && active.containerEl.contains(view.dom);
	}
}
