import type { Sentence, Stats } from "./types.d.mts";

export function computeStats(
	sentences: Array<Pick<Sentence, "words" | "syllables">>,
	counts?: Record<string, number>
): Stats;

export function easeLabel(flesch: number): string;
