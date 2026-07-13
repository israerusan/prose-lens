import type { Sentence } from "./types.d.mts";

export type Band = "short" | "medium" | "long" | "veryLong";

export interface RhythmOptions {
	/** Word count at or below which a sentence is "short". */
	shortMax: number;
	longMin: number;
	veryLongMin: number;
	/** Minimum consecutive sentences before a flat stretch is reported. */
	monotoneRun: number;
	/** Max spread (max - min words) tolerated inside a monotone run. */
	monotoneSpread: number;
}

export interface MonotoneRun {
	/** Inclusive index into `sentences`. */
	fromIndex: number;
	/** Inclusive index into `sentences`. */
	toIndex: number;
	length: number;
}

export interface Rhythm {
	lengths: number[];
	bands: Band[];
	monotoneRuns: MonotoneRun[];
	/** Population standard deviation of the lengths, to 1 decimal. 0 for < 2 sentences. */
	variety: number;
}

export const DEFAULT_RHYTHM_OPTIONS: RhythmOptions;

export function rhythm(
	sentences: Array<Pick<Sentence, "words">>,
	options?: Partial<RhythmOptions>
): Rhythm;
