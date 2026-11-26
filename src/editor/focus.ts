import { type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { EditorHost } from "./proseLensExtension";
import { analysisDriftField, analysisField } from "./state";
import { isFeatureEnabled } from "../core/featureGates.mjs";

const dim = Decoration.mark({ class: "pl-dim" });

/**
 * Focus mode (Pro): dim everything except the sentence under the cursor, so a revision
 * pass has somewhere to look.
 *
 * Implemented as two long mark decorations — everything before the current sentence and
 * everything after it — rather than a line decoration per line. A 3,000-line note would
 * otherwise mean 3,000 decorations rebuilt on every cursor move; this is always exactly
 * two, and CodeMirror splits them across lines itself.
 */
export function focusPlugin(host: EditorHost): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet = Decoration.none;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.selectionSet || update.state.field(analysisField) !== update.startState.field(analysisField)) {
					this.decorations = this.build(update.view);
				}
			}

			private build(view: EditorView): DecorationSet {
				const settings = host.settings;
				if (!settings.focusMode || !isFeatureEnabled("focus", settings.isPro)) {
					return Decoration.none;
				}

				const analysis = view.state.field(analysisField, false);
				if (!analysis || analysis.sentences.length === 0) return Decoration.none;

				const cursor = view.state.selection.main.head;

				// The analysis can be a whole debounce window behind — longer, for a typist who
				// never pauses — so its offsets are mapped through everything typed since.
				// Without this the spans lag the cursor and the WRONG sentence stays lit.
				// Mapping preserves document order, so the scan can stop at the first sentence
				// that starts after the cursor, and only the matched sentence is ever mapped.
				const drift = view.state.field(analysisDriftField, false);
				let start = -1;
				let end = -1;
				/** The last sentence that starts before the cursor, when none contains it. */
				let before: { from: number; to: number } | null = null;
				for (const sentence of analysis.sentences) {
					const mappedFrom = drift ? drift.mapPos(sentence.from, -1) : sentence.from;
					if (cursor < mappedFrom) break;
					const mappedTo = drift ? drift.mapPos(sentence.to, 1) : sentence.to;
					if (cursor <= mappedTo) {
						start = mappedFrom;
						end = mappedTo;
						break;
					}
					before = { from: mappedFrom, to: mappedTo };
				}
				if (start < 0) {
					// The cursor is in no sentence: on the blank line after one, or in a heading or
					// a code block. Returning nothing here un-dimmed the WHOLE note, so arrowing past
					// a paragraph break flashed everything bright. Keep the sentence just written lit
					// when only whitespace separates it from the cursor; otherwise light the line.
					//
					// "Just written" means the cursor is still on that sentence's own line. At column
					// 0 of a heading or the next list item the gap is whitespace too, but the line
					// under the cursor is what the writer is on, so that line is lit instead.
					const line = view.state.doc.lineAt(cursor);
					const sameLine = before !== null && view.state.doc.lineAt(before.to).number === line.number;
					const gap = before && sameLine && cursor - before.to <= 200 ? view.state.sliceDoc(before.to, cursor) : null;
					if (before && gap !== null && gap.trim() === "") {
						start = before.from;
						end = before.to;
					} else {
						if (line.length > 0) {
							start = line.from;
							end = line.to;
						} else if (before) {
							// An empty line lights nothing, so dimming "everything but it" dimmed
							// the whole note. Keep the last sentence written lit instead.
							start = before.from;
							end = before.to;
						} else {
							return Decoration.none;
						}
					}
				}

				const docLength = view.state.doc.length;
				const from = Math.min(start, docLength);
				const to = Math.min(end, docLength);
				const ranges = [];
				if (from > 0) ranges.push(dim.range(0, from));
				if (to < docLength) ranges.push(dim.range(to, docLength));
				return Decoration.set(ranges, true);
			}
		},
		{ decorations: (value) => value.decorations }
	);
}
