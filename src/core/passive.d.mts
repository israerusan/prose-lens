import type { Sentence } from "./types.d.mts";

export interface PassiveSpan {
	from: number;
	to: number;
	text: string;
	/**
	 * True when the be-verb is introduced by a modal ("should be flagged"). Still passive,
	 * but the register of instructions and checklists — the rule engine marks it at the
	 * quietest severity rather than at full weight.
	 */
	modal: boolean;
}

/** Spans covering the be-verb (or get-passive) through the past participle. */
export function findPassive(masked: string, sentence: Sentence): PassiveSpan[];
