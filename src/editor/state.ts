import { ChangeSet, StateEffect, StateField } from "@codemirror/state";
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
 * The last analysis for this document. Its offsets are in the coordinates of the document
 * as it stood when the analysis ran, and they are deliberately NOT rewritten here — the
 * analysis is one immutable object shared with the plugin and the side panel, and rewriting
 * a copy of it per keystroke would desynchronise `sentences` from `masked`, which is sliced
 * at the same offsets.
 *
 * Read positions out of it through {@link analysisDriftField} instead.
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

/**
 * Every document change since the current analysis was published.
 *
 * Analysis is debounced by 250ms, and a steady typist can go much longer than that between
 * runs, so any consumer reading an offset out of `analysisField` is reading a stale
 * coordinate. Focus mode did exactly that: after a few dozen keystrokes the sentence spans
 * lagged the cursor, so it dimmed the sentence being written and lit a neighbouring one —
 * or matched nothing at all and un-dimmed the whole document.
 *
 * Composing one ChangeSet is O(1) per transaction and costs nothing when no one reads it,
 * which is the common case: focus mode is Pro and off by default. Consumers map the two
 * offsets they actually need, rather than every offset in the analysis being rewritten.
 */
export const analysisDriftField = StateField.define<ChangeSet>({
	create(state) {
		return ChangeSet.empty(state.doc.length);
	},
	update(drift, tr) {
		// A fresh analysis is by definition in the new document's coordinates, so the drift
		// resets to nothing. Checked first: a transaction can both change the doc and carry
		// the analysis that already accounts for the change.
		for (const effect of tr.effects) {
			if (effect.is(setAnalysis)) return ChangeSet.empty(tr.newDoc.length);
		}
		return tr.docChanged ? drift.compose(tr.changes) : drift;
	},
});
