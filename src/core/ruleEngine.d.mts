import type { Analysis, RuleOptions } from "./types.d.mts";

export const DEFAULT_RULE_OPTIONS: Readonly<RuleOptions>;

export function analyze(text: string, options?: Partial<RuleOptions>): Analysis;
