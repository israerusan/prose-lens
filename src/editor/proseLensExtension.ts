import { type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Analysis } from "../core/types.d.mts";
import { analyze } from "../core/ruleEngine.mjs";
import type { ProseLensSettings } from "../settings";
import { buildDecorations } from "./decorations";
import { analysisDriftField, analysisField, decorationField, setAnalysis, setDecorations } from "./state";
import { focusPlugin } from "./focus";

/**
 * Why a note has no analysis.
 *
 * Publishing a bare `null` was indistinguishable from "this plugin is broken": the marks
 * vanished, the status bar emptied, and the panel said "Open a note with some prose in it."
 * — while the user was looking at a 320,000-character note full of prose. The plugin was
 * protecting them and had no way to say so.
 */
export type SkipReason =
	| { reason: "muted" }
	| { reason: "too-large"; chars: number; limit: number };

/** What the editor extension needs from the plugin. Kept narrow so it stays testable. */
export interface EditorHost {
	settings: ProseLensSettings;
	/** Bumped on every settings save. Changing it re-runs the analysis in every editor. */
	readonly settingsEpoch: number;
	/** Called after every analysis so the status bar and the panel can follow along. */
	onAnalysis(view: EditorView, analysis: Analysis | null, skipped: SkipReason | null): void;
	/** True when marks are muted for the note in this editor. */
	isMuted(view: EditorView): boolean;
}

/** Idle time after the last keystroke before we re-analyze. */
const DEBOUNCE_MS = 250;

/**
 * Delay before the FIRST analysis in a newly constructed editor.
 *
 * Constructing an editor for a large note used to analyze it at zero delay, which blocked
 * the main thread at the exact moment the user clicked a tab — the most latency-sensitive
 * moment in the app, and the one where the stall gets attributed to whatever was just
 * clicked. Letting the editor paint first costs nothing anyone can perceive.
 */
const FIRST_RUN_MS = 400;

export function proseLensExtension(host: EditorHost): Extension {
	const runner = ViewPlugin.fromClass(
		class {
			private timer: number | null = null;
			private lastText: string | null = null;
			private epoch: number;
			/** The editor's OWN window — a note in a popout window has a different one. */
			private win: Window;

			constructor(private view: EditorView) {
				this.epoch = host.settingsEpoch;
				this.win = view.dom.ownerDocument.defaultView ?? window;
				this.schedule(FIRST_RUN_MS);
			}

			update(update: ViewUpdate): void {
				// Only a document change can invalidate the analysis. Scrolling and cursor
				// movement must never trigger one — that is what makes scrolling free.
				if (update.docChanged) {
					this.schedule(DEBOUNCE_MS);
					return;
				}
				// A settings save calls workspace.updateOptions(), which reconfigures every
				// editor and lands here. That is how a rule toggle or a Pro unlock reaches the
				// open notes without this extension holding a reference to the plugin's
				// internals — or the plugin reaching into CodeMirror's.
				//
				// Debounced like a keystroke, NOT run immediately: dragging a threshold slider
				// fires a save per step, and an immediate re-analysis per step would re-run the
				// whole pipeline in every open editor on every pixel of the drag.
				if (host.settingsEpoch !== this.epoch) {
					this.epoch = host.settingsEpoch;
					this.lastText = null;
					this.schedule(DEBOUNCE_MS);
				}
			}

			destroy(): void {
				this.clear();
			}

			private clear(): void {
				if (this.timer !== null) {
					this.win.clearTimeout(this.timer);
					this.timer = null;
				}
			}

			private schedule(delay: number): void {
				this.clear();
				this.timer = this.win.setTimeout(() => {
					this.timer = null;
					this.run();
				}, delay);
			}

			private run(): void {
				const settings = host.settings;

				// Both cheap checks happen BEFORE doc.toString(). Materialising a 2MB note into
				// a string only to discover it is over the cap would pay the whole allocation on
				// every debounce tick, which is exactly what the cap exists to avoid.
				const muted = host.isMuted(this.view);
				const length = this.view.state.doc.length;
				const tooLarge = length > settings.maxNoteChars;
				if (muted || tooLarge) {
					// Forget the last text. Otherwise, restoring the document to the text that was
					// analyzed before it was muted or overflowed would compare equal below, the run
					// would be skipped as a no-op, and the marks — already cleared to nothing —
					// would never come back.
					this.lastText = null;
					this.publish(
						null,
						muted
							? { reason: "muted" }
							: { reason: "too-large", chars: length, limit: settings.maxNoteChars }
					);
					return;
				}

				const text = this.view.state.doc.toString();

				// Identical text after a debounce (undo/redo round trip, or a change that
				// cancelled itself out) — skip the work.
				if (text === this.lastText) return;
				this.lastText = text;

				const analysis = analyze(text, {
					rules: settings.rules,
					longSentenceWords: settings.longSentenceWords,
					veryLongSentenceWords: settings.veryLongSentenceWords,
					ignoredWords: settings.ignoredWords,
					isPro: settings.isPro,
				});
				this.publish(analysis);
			}

			private publish(analysis: Analysis | null, skipped: SkipReason | null = null): void {
				const decorations = analysis
					? buildDecorations(analysis, host.settings)
					: Decoration.none;
				this.view.dispatch({
					effects: [setAnalysis.of(analysis), setDecorations.of(decorations)],
				});
				host.onAnalysis(this.view, analysis, skipped);
			}

			/** Force a re-run — used when settings or the Pro entitlement change. */
			refresh(): void {
				this.lastText = null;
				this.schedule(0);
			}
		}
	);

	return [decorationField, analysisField, analysisDriftField, runner, focusPlugin(host)];
}
