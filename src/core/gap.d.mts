/** True when the mask hid letters or digits (code, math, a URL) in [from, to) of the source. */
/** Length of [from, to) as the reader sees it: a `[[target|` prefix does not count. */
export function visibleGapLength(source: string, masked: string, from: number, to: number): number;

export function hidesWords(source: string, masked: string, from: number, to: number): boolean;
