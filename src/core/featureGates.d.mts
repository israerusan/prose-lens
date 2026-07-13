export type FeatureKey =
	| "marks"
	| "readability"
	| "rhythm"
	| "heat"
	| "deslop"
	| "echo"
	| "delta"
	| "focus";

export interface FeatureGate {
	proOnly: boolean;
	label: string;
}

export const FEATURES: Readonly<Record<FeatureKey, FeatureGate>>;
export const PRO_ONLY_RULES: ReadonlySet<string>;

export function isFeatureEnabled(feature: FeatureKey | string, isPro: boolean): boolean;
export function isProOnlyRule(ruleId: string): boolean;
export function proFeatureKeys(): FeatureKey[];
