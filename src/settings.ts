import { DEFAULT_RULE_OPTIONS } from "./core/ruleEngine.mjs";

/**
 * The settings SHAPE and its defaults. Rendering lives in ui/SettingsTab.ts.
 *
 * Keeping the two apart is not ceremony: the shape is data that the editor extension, the
 * panel, and the tests all read, while the rendering is Obsidian-facing UI. When they lived
 * in one file, importing "the settings type" dragged the whole settings tab — and every
 * `obsidian` symbol it touches — into anything that wanted it.
 */
export interface ProseLensSettings {
	licenseKey: string;
	/** Cached entitlement. Derived from licenseKey, persisted so startup is instant. */
	isPro: boolean;
	licenseEmail: string;

	marksEnabled: boolean;
	rules: Record<string, boolean>;
	longSentenceWords: number;
	veryLongSentenceWords: number;
	/** Words the user has muted. Lives here, never in the note. */
	ignoredWords: string[];
	sentenceHeat: boolean;
	showStatusBar: boolean;
	/** Pro. Dims everything but the sentence under the cursor. */
	focusMode: boolean;
	/** Paths where marks are muted. Also here, never in the note. */
	mutedPaths: string[];
	/** Above this many characters, analysis is skipped rather than freezing the editor. */
	maxNoteChars: number;
	/** Removes every Pro section from the panel, for people who never want to see them. */
	hideProSections: boolean;
	/** Set the first time the plugin loads, so the panel is revealed exactly once. */
	hasSeenWelcome: boolean;
	schemaVersion: number;
}

/**
 * Bounds for every numeric setting, in one place, so the sliders and the loader cannot
 * disagree about what a legal value is.
 *
 * `maxNoteChars` used to offer a million. Whole-document analysis of a million characters
 * measures at roughly 2.4 seconds of blocked main thread per typing pause — Obsidian stops
 * responding entirely — and the setting's own description framed raising it as the safe
 * option. A ceiling the machine can actually meet is not a limitation, it is the feature.
 */
export const BOUNDS = {
	longSentenceWords: { min: 15, max: 45 },
	veryLongSentenceWords: { min: 25, max: 70 },
	maxNoteChars: { min: 50_000, max: 400_000, step: 25_000 },
} as const;

/** Bumped when a release needs `normalizeSettings` to repair something specific. */
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: ProseLensSettings = {
	licenseKey: "",
	isPro: false,
	licenseEmail: "",

	marksEnabled: true,
	rules: { ...DEFAULT_RULE_OPTIONS.rules },
	longSentenceWords: DEFAULT_RULE_OPTIONS.longSentenceWords,
	veryLongSentenceWords: DEFAULT_RULE_OPTIONS.veryLongSentenceWords,
	ignoredWords: [],
	sentenceHeat: false,
	showStatusBar: true,
	focusMode: false,
	mutedPaths: [],
	maxNoteChars: 300000,
	hideProSections: false,
	hasSeenWelcome: false,
	schemaVersion: SCHEMA_VERSION,
};

/**
 * Turn whatever is in `data.json` into settings the rest of the plugin can trust.
 *
 * `Object.assign` alone is not enough, and the difference is not theoretical. It only skips
 * ABSENT keys — an explicit `null` or a string where a number belongs is copied straight
 * over the default. A `data.json` carrying `"maxNoteChars": null` (a truncated write, a
 * hand edit, a config copied between vaults) makes `doc.length > null` true for every
 * non-empty note, so the plugin silently skips analysis on everything, forever, with no
 * error anywhere and no way for the user to work out why. `"longSentenceWords": NaN` does
 * the same to one rule.
 *
 * So every field is coerced against its default, and the whole pass is unconditional and
 * idempotent — which is the safest kind of migration, because it repairs a file it has
 * already seen as readily as one it has not.
 */
export function normalizeSettings(raw: unknown): ProseLensSettings {
	const data = (raw ?? {}) as Record<string, unknown>;
	// A hostile or corrupt data.json must not reach the prototype chain and forge `isPro`
	// onto every object in the runtime.
	if (Object.prototype.hasOwnProperty.call(data, "__proto__")) {
		delete data["__proto__"];
	}

	const rules: Record<string, boolean> = { ...DEFAULT_SETTINGS.rules };
	const storedRules = isRecord(data.rules) ? data.rules : {};
	for (const id of Object.keys(rules)) {
		// Unknown keys are dropped rather than merged: a rule id that no longer exists would
		// otherwise live in data.json forever and read as a real setting in a bug report.
		rules[id] = bool(storedRules[id], rules[id]);
	}

	const longSentenceWords = num(
		data.longSentenceWords,
		DEFAULT_SETTINGS.longSentenceWords,
		BOUNDS.longSentenceWords
	);

	return {
		licenseKey: str(data.licenseKey, DEFAULT_SETTINGS.licenseKey),
		// Never `bool()`. Entitlement is the one field where anything short of an explicit
		// `true` written by our own save must read as free.
		isPro: data.isPro === true,
		licenseEmail: str(data.licenseEmail, DEFAULT_SETTINGS.licenseEmail),

		marksEnabled: bool(data.marksEnabled, DEFAULT_SETTINGS.marksEnabled),
		rules,
		longSentenceWords,
		// The two thresholds are a pair, and the settings tab already refuses to let them
		// cross. A file that has them crossed would make every long sentence render as a
		// very long one, so the same invariant is restored here rather than trusted.
		veryLongSentenceWords: Math.max(
			longSentenceWords + 1,
			num(
				data.veryLongSentenceWords,
				DEFAULT_SETTINGS.veryLongSentenceWords,
				BOUNDS.veryLongSentenceWords
			)
		),
		ignoredWords: stringArray(data.ignoredWords),
		sentenceHeat: bool(data.sentenceHeat, DEFAULT_SETTINGS.sentenceHeat),
		showStatusBar: bool(data.showStatusBar, DEFAULT_SETTINGS.showStatusBar),
		focusMode: bool(data.focusMode, DEFAULT_SETTINGS.focusMode),
		mutedPaths: stringArray(data.mutedPaths),
		maxNoteChars: num(data.maxNoteChars, DEFAULT_SETTINGS.maxNoteChars, BOUNDS.maxNoteChars),
		hideProSections: bool(data.hideProSections, DEFAULT_SETTINGS.hideProSections),
		hasSeenWelcome: bool(data.hasSeenWelcome, DEFAULT_SETTINGS.hasSeenWelcome),
		schemaVersion: SCHEMA_VERSION,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number, bounds: { min: number; max: number }): number {
	// Number.isFinite rejects null, undefined, NaN, Infinity and every non-number, which is
	// the whole failure set. Clamping afterwards means a value that was legal under an older
	// ceiling is pulled down to one this machine can meet, rather than kept and honoured.
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}

export interface RuleLabel {
	id: string;
	name: string;
	desc: string;
	pro?: boolean;
}

/**
 * One row per rule in the settings tab. Data, not markup — so a test can assert that every
 * rule the engine ships is actually reachable from the UI, and that no Pro rule is quietly
 * rendered as a free one.
 */
export const RULE_LABELS: readonly RuleLabel[] = [
	{ id: "adverb", name: "Adverbs", desc: "Words ending in -ly. A stronger verb usually beats one." },
	{
		id: "passive",
		name: "Passive voice",
		desc: "Marks be-verb plus past participle. A heuristic, so it is deliberately conservative — and it marks 'should be done' quietly, because that is the register of instructions.",
	},
	{ id: "hedge", name: "Hedges", desc: "Qualifiers that weaken a claim: maybe, somewhat, I think." },
	{ id: "weasel", name: "Weasel words", desc: "Unsupported intensifiers: many, clearly, significantly." },
	{ id: "doubled", name: "Doubled words", desc: "The same word twice in a row." },
	{ id: "cliche", name: "Cliches", desc: "Phrases the reader's eye slides over." },
	{ id: "longSentence", name: "Long sentences", desc: "Sentences past the thresholds below." },
	{
		id: "deslop",
		name: "De-slop marks",
		desc: "Phrasing tells of machine-generated prose. A highlighter, not a detector — it never scores your writing.",
		pro: true,
	},
];
