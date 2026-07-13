import type { Mark, Sentence } from "./types.d.mts";

/** De-slop marks (rule: "deslop") over masked text, sorted by `from`. */
export function findSlop(masked: string, sentences?: Sentence[]): Mark[];
