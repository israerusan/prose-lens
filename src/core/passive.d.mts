import type { Sentence, Word } from "./types.d.mts";

/** Spans covering the be-verb (or get-passive) through the past participle. */
export function findPassive(masked: string, sentence: Sentence): Word[];
