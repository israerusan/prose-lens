import type { Sentence } from "./types.d.mts";

export interface EchoOptions {
	/** Sentences per sliding window; repetition is only an echo when it clusters. */
	windowSentences: number;
	/** Occurrences inside one window needed to qualify. Never honoured below 3. */
	minCount: number;
	minWordLength: number;
	maxResults: number;
}

export interface Echo {
	/** Lowercased word, or lowercased bigram joined by a single space. */
	term: string;
	kind: "word" | "phrase";
	/** Occurrences across the WHOLE document, not just the window that qualified it. */
	count: number;
	/** Absolute start offset of every occurrence, ascending. */
	offsets: number[];
}

export const DEFAULT_ECHO_OPTIONS: EchoOptions;

export function findEchoes(
	masked: string,
	sentences: Array<Pick<Sentence, "from" | "to">>,
	options?: Partial<EchoOptions>
): Echo[];
