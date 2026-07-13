import { type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { EditorHost } from "./proseLensExtension";
import { analysisField } from "./state";

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
				if (!settings.focusMode || !settings.isPro) return Decoration.none;

				const analysis = view.state.field(analysisField, false);
				if (!analysis || analysis.sentences.length === 0) return Decoration.none;

				const cursor = view.state.selection.main.head;
				const current = analysis.sentences.find(
					(sentence) => cursor >= sentence.from && cursor <= sentence.to
				);
				if (!current) return Decoration.none;

				const docLength = view.state.doc.length;
				const from = Math.min(current.from, docLength);
				const to = Math.min(current.to, docLength);
				const ranges = [];
				if (from > 0) ranges.push(dim.range(0, from));
				if (to < docLength) ranges.push(dim.range(to, docLength));
				return Decoration.set(ranges, true);
			}
		},
		{ decorations: (value) => value.decorations }
	);
}
