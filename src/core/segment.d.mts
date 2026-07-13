import type { Sentence, Word } from "./types.d.mts";

export function splitBlocks(text: string, masked: string): Array<{ from: number; to: number }>;
export function segmentSentences(text: string, masked: string): Sentence[];
export function words(masked: string, from: number, to: number): Word[];
