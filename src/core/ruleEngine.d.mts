import type { Analysis, RuleOptions } from "./types.d.mts";

export const DEFAULT_RULE_OPTIONS: Readonly<RuleOptions>;

export function analyze(text: string, options?: Partial<RuleOptions>): Analysis;

/** De-slop marks Pro would paint on this (free) analysis, after ignores and overlaps. */
export function countDeslopMarks(analysis: Analysis, ignoredWords?: readonly string[]): number;
