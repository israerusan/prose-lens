import type { Stats } from "./types.d.mts";

/** The flat, frozen "before" the delta panel holds across an edit. */
export interface Snapshot {
	words: number;
	grade: number;
	flesch: number;
	avgSentenceWords: number;
	passive: number;
	hedge: number;
	adverb: number;
	weasel: number;
	cliche: number;
	deslop: number;
	longSentence: number;
}

export interface DeltaRow {
	key: string;
	label: string;
	before: number;
	after: number;
	/** `after - before`, rounded to 1 decimal. */
	delta: number;
	/** null when the metric did not move, or when the metric has no better/worse. */
	better: boolean | null;
}

export function snapshot(stats: Stats | null | undefined): Readonly<Snapshot>;

export function diffSnapshots(
	before: Readonly<Snapshot> | Stats | null | undefined,
	after: Readonly<Snapshot> | Stats | null | undefined
): DeltaRow[];

export function hasMoved(rows: readonly DeltaRow[] | null | undefined): boolean;
