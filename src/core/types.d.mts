/** Ids of every mark-producing rule. `deslop` is the only Pro-gated one. */
export type RuleId =
	| "adverb"
	| "passive"
	| "hedge"
	| "weasel"
	| "doubled"
	| "cliche"
	| "longSentence"
	| "deslop";

export type Severity = "info" | "warn" | "strong";

/** One highlight. Offsets are absolute into the ORIGINAL document text. */
export interface Mark {
	from: number;
	to: number;
	rule: RuleId;
	severity: Severity;
	/** Sentence case, no trailing period — rendered straight into a tooltip. */
	message: string;
	/** Matched text, lowercased. Drives "ignore this word everywhere". */
	word?: string;
}

export interface Word {
	from: number;
	to: number;
	text: string;
}

export interface Sentence {
	from: number;
	to: number;
	/** Slice of the MASKED text, so code/math/URLs read as spaces. */
	text: string;
	words: number;
	syllables: number;
}

export interface Stats {
	words: number;
	sentences: number;
	syllables: number;
	/** Flesch reading ease, clamped to 0-100. */
	flesch: number;
	/** Flesch-Kincaid grade level, clamped to >= 0. */
	grade: number;
	avgSentenceWords: number;
	longestSentenceWords: number;
	counts: Record<string, number>;
}

export interface RuleOptions {
	rules: Record<string, boolean>;
	longSentenceWords: number;
	veryLongSentenceWords: number;
	ignoredWords: string[];
	isPro: boolean;
}

export interface Analysis {
	marks: Mark[];
	sentences: Sentence[];
	stats: Stats;
	/**
	 * The masked document. Carried on the result so the side panel can run the echo pass
	 * without re-reading the editor and re-masking the whole note on every keystroke.
	 */
	masked: string;
}
