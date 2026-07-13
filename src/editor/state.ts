import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { Analysis } from "../core/types.d.mts";

/** Publishes a fresh analysis (and its decorations) into the editor state. */
export const setAnalysis = StateEffect.define<Analysis | null>();
export const setDecorations = StateEffect.define<DecorationSet>();

/**
 * The decorations currently painted in this editor.
 *
 * The `map` call is the important line. Analysis is debounced, so between a keystroke
 * and the next run the marks are stale by construction — mapping them through the
 * change set keeps every highlight glued to its word while the user types, instead of
 * letting them slide one character to the left with each character typed. Without it,
 * the marks visibly "lag" behind the cursor, which reads as a broken plugin.
 */
export const decorationField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		let next = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setDecorations)) next = effect.value;
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

/**
 * The last analysis for this document. Offsets go stale between runs exactly as the
 * decorations do, but nothing reads them positionally except focus mode — which
 * recomputes on every selection change anyway — so they are deliberately not mapped.
 */
export const analysisField = StateField.define<Analysis | null>({
	create() {
		return null;
	},
	update(analysis, tr) {
		let next = analysis;
		for (const effect of tr.effects) {
			if (effect.is(setAnalysis)) next = effect.value;
		}
		return next;
	},
});
