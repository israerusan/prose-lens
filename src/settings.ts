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
	schemaVersion: number;
}

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
	schemaVersion: 1,
};

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
