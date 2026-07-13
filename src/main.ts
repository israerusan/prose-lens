import { MarkdownView, Plugin, type WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { Analysis } from "./core/types.d.mts";
import type { Snapshot } from "./core/delta.d.mts";
import { resolveLicenseTransition } from "./core/licenseTransition.mjs";
import { snapshot } from "./core/delta.mjs";
import { LicenseManager } from "./license/LicenseManager";
import { PRODUCT_NAME } from "./product";
import { DEFAULT_SETTINGS, type ProseLensSettings } from "./settings";
import { ProseLensSettingTab } from "./ui/SettingsTab";
import { proseLensExtension, type EditorHost } from "./editor/proseLensExtension";
import { ProsePanelView, VIEW_TYPE_PROSE_PANEL } from "./ui/ProsePanelView";
import { StatusBar } from "./ui/StatusBar";
import { noticeFocus, noticeMarks, noticeMuted, registerCommands } from "./commands";
import { Notice } from "obsidian";

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
				this.statusBar?.render(this.activeAnalysis, this.settings.showStatusBar);
				this.refreshPanels();
			})
		);

		// Eviction belongs on layout-change, NOT file-open: file-open fires after the leaf
		// already holds the file, so a note being reopened is always still "open" and its stale
		// baseline would survive the very eviction meant to clear it.
		this.registerEvent(this.app.workspace.on("layout-change", () => this.evictClosedNotes()));

		this.addSettingTab(new ProseLensSettingTab(this));
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
	}

	// --- settings -------------------------------------------------------------

	async loadSettings(): Promise<void> {
		const loaded: unknown = await this.loadData();
		const data = (loaded ?? {}) as Record<string, unknown>;
		// A hostile or corrupt data.json must not reach the prototype chain and forge `isPro`
		// onto every object in the runtime.
		if (Object.prototype.hasOwnProperty.call(data, "__proto__")) {
			delete data["__proto__"];
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		this.settings.rules = { ...DEFAULT_SETTINGS.rules, ...(this.settings.rules ?? {}) };
		this.settings.ignoredWords = coerceStringArray(this.settings.ignoredWords);
		this.settings.mutedPaths = coerceStringArray(this.settings.mutedPaths);
		this.settings.isPro = this.settings.isPro === true;
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
	onAnalysis(view: EditorView, analysis: Analysis | null): void {
		const path = this.pathFor(view);
		if (path) {
			if (analysis) this.analyses.set(path, analysis);
			else this.analyses.delete(path);
			// The first analysis after the note is opened becomes the delta baseline. The entry
			// is dropped when the note closes, so "since you opened this note" is literally true.
			if (analysis && !this.baselines.has(path)) {
				this.baselines.set(path, snapshot(analysis.stats));
			}
		}
		if (!this.isActiveEditor(view)) return;
		this.activeAnalysis = analysis;
		this.statusBar?.render(analysis, this.settings.showStatusBar);
		this.refreshPanels();
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
		const path = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
		if (!path) return null;
		return this.baselines.get(path) ?? null;
	}

	/** Jump the active editor to a document offset — the panel's rows are clickable. */
	revealOffset(offset: number): void {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
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
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file) open.add(view.file.path);
		}
		for (const path of [...this.analyses.keys()]) {
			if (!open.has(path)) this.analyses.delete(path);
		}
		for (const path of [...this.baselines.keys()]) {
			if (!open.has(path)) this.baselines.delete(path);
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
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		return active !== null && active.containerEl.contains(view.dom);
	}
}

function coerceStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}
