import { Decoration, type DecorationSet } from "@codemirror/view";
import type { Analysis, Mark } from "../core/types.d.mts";
import { rhythm } from "../core/rhythm.mjs";
import type { ProseLensSettings } from "../settings";

/** One CSS class per rule, so a theme can restyle any single mark type. */
const RULE_CLASS: Record<string, string> = {
	adverb: "pl-mark pl-adverb",
	passive: "pl-mark pl-passive",
	hedge: "pl-mark pl-hedge",
	weasel: "pl-mark pl-weasel",
	doubled: "pl-mark pl-doubled",
	cliche: "pl-mark pl-cliche",
	deslop: "pl-mark pl-deslop",
	longSentence: "pl-mark pl-long",
};

const HEAT_CLASS: Record<string, string> = {
	short: "pl-heat pl-heat-short",
	medium: "pl-heat pl-heat-medium",
	long: "pl-heat pl-heat-long",
	veryLong: "pl-heat pl-heat-verylong",
};

function markClass(mark: Mark): string {
	const base = RULE_CLASS[mark.rule] ?? "pl-mark";
	if (mark.rule === "longSentence" && mark.severity === "strong") return `${base} pl-verylong`;
	// A quiet mark is a real mark that has been told to sit down: the modal passive that is
	// everywhere in instructions and checklists. Same information, a fraction of the shout.
	if (mark.severity === "info" && mark.rule === "passive") return `${base} pl-quiet`;
	return base;
}

/**
 * Build the full decoration set for a document.
 *
 * These are built for the WHOLE document, not just the viewport. That is a deliberate
 * call: the expensive step is `analyze()`, which we already run whole-document (the
 * status bar needs a grade for the note, not for the visible slice) and which is
 * debounced and size-capped. A RangeSet of a few thousand marks costs far less to
 * build than the analysis that produced it, and building it once per analysis rather
 * than once per scroll frame keeps scrolling completely free.
 */
export function buildDecorations(analysis: Analysis, settings: ProseLensSettings): DecorationSet {
	const ranges: Array<{ from: number; to: number; value: Decoration }> = [];

	if (settings.sentenceHeat) {
		const bands = rhythm(analysis.sentences, {
			longMin: settings.longSentenceWords,
			veryLongMin: settings.veryLongSentenceWords,
		}).bands;
		analysis.sentences.forEach((sentence, index) => {
			const cls = HEAT_CLASS[bands[index]];
			if (!cls || sentence.to <= sentence.from) return;
			ranges.push({
				from: sentence.from,
				to: sentence.to,
				value: Decoration.mark({ class: cls }),
			});
		});
	}

	if (settings.marksEnabled) {
		for (const mark of analysis.marks) {
			if (mark.to <= mark.from) continue;
			ranges.push({
				from: mark.from,
				to: mark.to,
				value: Decoration.mark({
					class: markClass(mark),
					attributes: { title: mark.message },
				}),
			});
		}
	}

	// `true` = let CodeMirror sort. Marks legitimately overlap (an adverb sits inside a
	// long sentence, which sits inside a heat band), and a hand-sorted RangeSetBuilder
	// throws on the first out-of-order insert.
	return Decoration.set(
		ranges.map((range) => range.value.range(range.from, range.to)),
		true
	);
}
