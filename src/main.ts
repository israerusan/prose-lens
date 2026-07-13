import { MarkdownView, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { Analysis } from "./core/types.d.mts";
import { resolveLicenseTransition } from "./core/licenseTransition.mjs";
import { snapshot } from "./core/delta.mjs";
import type { Snapshot } from "./core/delta.d.mts";
import { LicenseManager } from "./license/LicenseManager";
import { PRODUCT_NAME } from "./product";
import { DEFAULT_SETTINGS, ProseLensSettingTab, type ProseLensSettings } from "./settings";
import { proseLensExtension, type EditorHost } from "./editor/proseLensExtension";
import { ProsePanelView, VIEW_TYPE_PROSE_PANEL } from "./ui/ProsePanelView";
import { requirePro } from "./ui/pro/ProGate";
import { easeLabel } from "./core/readability.mjs";

export default class ProseLensPlugin extends Plugin implements EditorHost {
	settings: ProseLensSettings = { ...DEFAULT_SETTINGS };

	/** Bumped on every settings save; the editor extension re-runs when it changes. */
	settingsEpoch = 0;

	private statusBar: HTMLElement | null = null;
	/** The analysis of the editor the user is actually looking at. */
	private activeAnalysis: Analysis | null = null;
	/** Opening state per note, for the Pro revision delta. Session-scoped, never persisted. */
	private baselines = new Map<string, Snapshot>();

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.refreshLicense();

		// The plugin IS the editor host. Passing an object literal would snapshot
		// `settingsEpoch` as a primitive at construction time, and the extension would
		// never see a settings change again.
		this.registerEditorExtension(proseLensExtension(this));

		this.registerView(VIEW_TYPE_PROSE_PANEL, (leaf) => new ProsePanelView(leaf, this));

		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("pl-status");
		this.registerDomEvent(this.statusBar, "click", () => {
			void this.activatePanel();
		});
		this.renderStatusBar(null);

		this.addCommand({
			id: "toggle-marks",
			name: "Toggle style marks",
			callback: () => {
				void this.setMarksEnabled(!this.settings.marksEnabled);
			},
		});

		this.addCommand({
			id: "toggle-marks-this-note",
			name: "Mute style marks in this note",
			checkCallback: (checking) => {
				const path = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
				if (!path) return false;
				if (!checking) void this.toggleMuted(path);
				return true;
			},
		});

		this.addCommand({
			id: "open-panel",
			name: "Open the prose panel",
			callback: () => {
				void this.activatePanel();
			},
		});

		this.addCommand({
			id: "toggle-focus-mode",
			name: "Toggle focus mode",
			callback: () => {
				requirePro({ isPro: this.settings.isPro, app: this.app }, "focus", () => {
					void this.setFocusMode(!this.settings.focusMode);
				});
			},
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const word = wordAtCursor(editor.getLine(editor.getCursor().line), editor.getCursor().ch);
				if (!word) return;
				const lower = word.toLowerCase();
				if (this.settings.ignoredWords.includes(lower)) return;
				menu.addItem((item) =>
					item
						.setTitle(`Ignore "${word}" everywhere`)
						.setIcon("eye-off")
						.onClick(() => {
							void this.ignoreWord(lower);
						})
				);
			})
		);

		// A new note gets a fresh delta baseline; leaving one drops it, so reopening a
		// note later measures that session's edits rather than a stale one.
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.activeAnalysis = null;
				this.renderStatusBar(null);
			})
		);

		this.addSettingTab(new ProseLensSettingTab(this));
	}

	onunload(): void {
		this.baselines.clear();
	}

	// --- settings -------------------------------------------------------------

	async loadSettings(): Promise<void> {
		const loaded: unknown = await this.loadData();
		const data = (loaded ?? {}) as Record<string, unknown>;
		// A hostile or corrupt data.json must not be able to reach the prototype chain
		// and forge `isPro` onto every object in the runtime.
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
		await this.saveData(this.settings);
		this.settingsEpoch++;
		// Public API for "re-apply editor extensions" — every open editor re-runs its
		// analysis without this plugin ever reaching into a CodeMirror instance.
		this.app.workspace.updateOptions();
		this.refreshPanels();
	}

	/**
	 * Re-verify the stored key and apply the resulting entitlement.
	 *
	 * @param persistUnchanged save even when nothing moved (the settings tab passes this
	 *   so a key the user is typing survives a restart)
	 * @returns true when Pro actually flipped — the caller re-renders on that, and only that
	 */
	async refreshLicense(persistUnchanged = false): Promise<boolean> {
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
		if (transition.persist) await this.saveSettings();
		return transition.flipped;
	}

	// --- state changes --------------------------------------------------------

	private async setMarksEnabled(enabled: boolean): Promise<void> {
		this.settings.marksEnabled = enabled;
		await this.saveSettings();
		new Notice(enabled ? "Style marks on." : "Style marks off.");
	}

	private async setFocusMode(enabled: boolean): Promise<void> {
		this.settings.focusMode = enabled;
		await this.saveSettings();
		new Notice(enabled ? "Focus mode on." : "Focus mode off.");
	}

	private async toggleMuted(path: string): Promise<void> {
		const muted = this.settings.mutedPaths.includes(path);
		this.settings.mutedPaths = muted
			? this.settings.mutedPaths.filter((entry) => entry !== path)
			: [...this.settings.mutedPaths, path];
		await this.saveSettings();
		new Notice(muted ? "Marks on for this note." : "Marks muted for this note.");
	}

	private async ignoreWord(word: string): Promise<void> {
		this.settings.ignoredWords = [...this.settings.ignoredWords, word].sort();
		await this.saveSettings();
		new Notice(`${PRODUCT_NAME} will stop marking "${word}".`);
	}

	// --- analysis plumbing ----------------------------------------------------

	/** EditorHost. Called by the editor extension after each analysis. */
	onAnalysis(view: EditorView, analysis: Analysis | null): void {
		const path = this.pathFor(view);
		// The first analysis of a note in this session becomes the delta baseline, so
		// "since you opened this note" means exactly that.
		if (path && analysis && !this.baselines.has(path)) {
			this.baselines.set(path, snapshot(analysis.stats));
		}
		if (!this.isActiveEditor(view)) return;
		this.activeAnalysis = analysis;
		this.renderStatusBar(analysis);
		this.refreshPanels();
	}

	/** EditorHost. True when the user has muted marks for the note in this editor. */
	isMuted(view: EditorView): boolean {
		const path = this.pathFor(view);
		return path !== null && this.settings.mutedPaths.includes(path);
	}

	/** The analysis the panel should render, and the baseline to measure it against. */
	currentAnalysis(): Analysis | null {
		return this.activeAnalysis;
	}

	currentBaseline(): Snapshot | null {
		const path = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
		if (!path) return null;
		return this.baselines.get(path) ?? null;
	}

	/** Raw text of the active note, for the panel's echo pass. */
	currentText(): string | null {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		return active ? active.editor.getValue() : null;
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

	private renderStatusBar(analysis: Analysis | null): void {
		const status = this.statusBar;
		if (!status) return;
		status.empty();
		if (!this.settings.showStatusBar) return;

		if (!analysis) {
			status.setText("");
			return;
		}
		const { grade, flesch, words } = analysis.stats;
		if (words === 0) {
			status.setText("");
			return;
		}
		status.setText(`Grade ${grade.toFixed(1)} · ${easeLabel(flesch)}`);
		status.setAttr("aria-label", `${words} words, reading ease ${flesch.toFixed(0)}`);
	}

	private refreshPanels(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROSE_PANEL)) {
			const view = leaf.view;
			if (view instanceof ProsePanelView) view.render();
		}
	}

	async activatePanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROSE_PANEL)[0];
		const leaf: WorkspaceLeaf | null = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: VIEW_TYPE_PROSE_PANEL, active: true });
		void this.app.workspace.revealLeaf(leaf);
	}

	// --- editor <-> file plumbing --------------------------------------------

	/**
	 * The note a CodeMirror view belongs to. Obsidian's public API has no view->file
	 * lookup, so match on DOM containment — which is public, stable, and cheaper than
	 * reaching into the private `editor.cm` handle that most plugins use here.
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

/** The word straddling `ch` on `line`, or null. Letters, apostrophes and hyphens only. */
function wordAtCursor(line: string, ch: number): string | null {
	if (!line) return null;
	const isWordChar = (char: string) => /[A-Za-zÀ-ÖØ-öø-ÿ'’-]/.test(char);
	let start = Math.min(ch, line.length);
	let end = start;
	while (start > 0 && isWordChar(line[start - 1])) start--;
	while (end < line.length && isWordChar(line[end])) end++;
	const word = line.slice(start, end).replace(/^[-'’]+|[-'’]+$/g, "");
	return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(word) ? word : null;
}

function coerceStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}
