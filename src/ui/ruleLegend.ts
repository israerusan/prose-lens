import { RULE_CLASS } from "../editor/decorations";
import { RULE_LABELS } from "../settings";

export interface LegendRow {
	id: string;
	/** The rule's name, which is also the sample text the legend paints. */
	name: string;
	/** The exact class the editor paints this rule with. */
	markClass: string;
	pro: boolean;
}

/**
 * The legend, derived from the two things that already define a mark: its label and the
 * class the editor paints it with.
 *
 * The legend does NOT own a colour table. It renders each rule's own name using that rule's
 * own mark class, so "Adverbs" appears underlined in exactly the yellow the editor uses for
 * adverbs, and a restyle — by us or by the user's theme — moves both together. A legend
 * with its own copy of the palette is a legend that drifts, and a drifted legend is worse
 * than none: it teaches the wrong thing confidently.
 *
 * Seven unexplained colours was the single largest comprehension hole in the product. There
 * was no key anywhere: not in the editor, not in the panel, not in settings. The only way to
 * learn what purple meant was to hover one mark at a time and read a tooltip.
 */
export const LEGEND: readonly LegendRow[] = RULE_LABELS.map((rule) => ({
	id: rule.id,
	name: rule.name,
	markClass: RULE_CLASS[rule.id] ?? "pl-mark",
	pro: rule.pro === true,
}));
