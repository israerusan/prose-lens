import { PluginSettingTab, Setting } from "obsidian";
import type ProseLensPlugin from "./main";
import { DEFAULT_RULE_OPTIONS } from "./core/ruleEngine.mjs";
import { PRO_PRICE_LABEL, PRO_UNLOCK_SUMMARY, PRODUCT_NAME, PURCHASE_URL } from "./product";

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

/** Returns `url` if it is a well-formed http(s) URL, otherwise `fallback`. */
export function safeHttpUrl(url: string, fallback: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
	} catch {
		// Not a parseable URL — fall through.
	}
	return fallback;
}

/**
 * Every outbound link goes through here: the href is sanitised to http(s) (so a value
 * that ever became user-editable could not smuggle in `javascript:`), and it opens in a
 * new tab with rel="noopener noreferrer".
 */
export function createExternalLink(
	parent: HTMLElement,
	options: { text: string; url: string; cls?: string }
): HTMLAnchorElement {
	const link = parent.createEl("a", {
		cls: options.cls,
		text: options.text,
		href: safeHttpUrl(options.url, PURCHASE_URL),
	});
	link.setAttr("target", "_blank");
	link.setAttr("rel", "noopener noreferrer");
	return link;
}

const RULE_LABELS: Array<{ id: string; name: string; desc: string; pro?: boolean }> = [
	{ id: "adverb", name: "Adverbs", desc: "Words ending in -ly. A stronger verb usually beats one." },
	{ id: "passive", name: "Passive voice", desc: "Marks be-verb plus past participle. Heuristic, so it is deliberately conservative." },
	{ id: "hedge", name: "Hedges", desc: "Qualifiers that weaken a claim: maybe, somewhat, I think." },
	{ id: "weasel", name: "Weasel words", desc: "Unsupported intensifiers: many, clearly, significantly." },
	{ id: "doubled", name: "Doubled words", desc: "The same word twice in a row." },
	{ id: "cliche", name: "Cliches", desc: "Phrases the reader's eye slides over." },
	{ id: "longSentence", name: "Long sentences", desc: "Sentences past the thresholds below." },
	{ id: "deslop", name: "De-slop marks", desc: "Phrasing tells of machine-generated prose. A highlighter, not a detector — it never scores your writing.", pro: true },
];

export class ProseLensSettingTab extends PluginSettingTab {
	constructor(private plugin: ProseLensPlugin) {
		super(plugin.app, plugin);
	}

	/** Nothing typed into a coalesced control may be lost when the tab closes. */
	hide(): void {
		void this.plugin.flushPendingSave();
	}

	display(): void {
		this.containerEl.empty();
		this.renderLicense();
		this.renderMarks();
		this.renderRules();
		this.renderPro();
		this.renderIgnored();
		this.renderPerformance();
	}

	/** The shared accent "Pro" pill — one affordance for gating, everywhere. */
	private markPro(setting: Setting): void {
		setting.nameEl.createSpan({ cls: "pl-pro-pill", text: "Pro" });
	}

	private proHeading(name: string): void {
		const heading = new Setting(this.containerEl).setName(name).setHeading();
		this.markPro(heading);
	}

	private appendUpgrade(setting: Setting): void {
		setting.descEl.appendText(" ");
		createExternalLink(setting.descEl, {
			cls: "pl-upgrade-inline",
			text: "Upgrade to Pro",
			url: PURCHASE_URL,
		});
	}

	/**
	 * A Pro row for a free user shows a disabled lock and a way to upgrade — never an
	 * empty right-hand side, which reads as a rendering bug rather than a paywall.
	 */
	private proRow(name: string, desc: string, render: (setting: Setting) => void): void {
		const setting = new Setting(this.containerEl).setName(name).setDesc(desc);
		this.markPro(setting);
		if (!this.plugin.settings.isPro) {
			setting.settingEl.addClass("pl-setting-locked");
			setting.addExtraButton((button) =>
				button.setIcon("lock").setDisabled(true).setTooltip("Pro feature")
			);
			this.appendUpgrade(setting);
			return;
		}
		render(setting);
	}

	private renderLicense(): void {
		new Setting(this.containerEl).setName("License").setHeading();

		new Setting(this.containerEl)
			.setName("License key")
			.setDesc("Verified offline — no account, no server, no network request.")
			.addText((text) =>
				text
					.setPlaceholder("Paste your license key")
					.setValue(this.plugin.settings.licenseKey)
					.onChange((value) => {
						this.plugin.settings.licenseKey = value;
						// queueSave, not saveSettings: this fires per keystroke, and each save bumps
						// settingsEpoch, which makes every open editor re-analyse its whole note.
						// Re-verify per keystroke (offline, microseconds) but only rebuild the
						// tab when Pro actually flips — display() empties containerEl, which
						// would destroy the input the user is typing into.
						void this.plugin.refreshLicense(true, true).then((flipped) => {
							if (flipped) this.display();
						});
					})
			);

		const status = this.containerEl.createDiv({ cls: "pl-license-status" });
		if (this.plugin.settings.isPro) {
			status.addClass("is-pro");
			const email = this.plugin.settings.licenseEmail;
			status.createEl("p", {
				text: `Pro active${email ? ` (${email})` : ""}. Thank you for supporting ${PRODUCT_NAME}.`,
			});
		} else {
			status.createEl("p", { text: `Free tier active. Upgrade to unlock ${PRO_UNLOCK_SUMMARY}.` });
			createExternalLink(status, {
				cls: "pl-pro-btn",
				text: `Get Pro — ${PRO_PRICE_LABEL}`,
				url: PURCHASE_URL,
			});
		}
	}

	private renderMarks(): void {
		new Setting(this.containerEl).setName("Marks").setHeading();

		new Setting(this.containerEl)
			.setName("Show style marks")
			.setDesc("Highlight prose issues inline as you type. Nothing is ever written to the note.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.marksEnabled).onChange(async (value) => {
					this.plugin.settings.marksEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(this.containerEl)
			.setName("Sentence-length heat")
			.setDesc("Tint every sentence by how long it is, so a slab of flat prose is visible at a glance.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.sentenceHeat).onChange(async (value) => {
					this.plugin.settings.sentenceHeat = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(this.containerEl)
			.setName("Reading grade in the status bar")
			.setDesc("Flesch reading ease and grade level for the active note. English only — the syllable model does not transfer.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showStatusBar).onChange(async (value) => {
					this.plugin.settings.showStatusBar = value;
					await this.plugin.saveSettings();
				})
			);
	}

	private renderRules(): void {
		new Setting(this.containerEl).setName("Rules").setHeading();

		for (const rule of RULE_LABELS) {
			if (rule.pro) continue;
			new Setting(this.containerEl)
				.setName(rule.name)
				.setDesc(rule.desc)
				.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.rules[rule.id] !== false).onChange(async (value) => {
						this.plugin.settings.rules[rule.id] = value;
						await this.plugin.saveSettings();
					})
				);
		}

		new Setting(this.containerEl)
			.setName("Long sentence threshold")
			.setDesc("Words before a sentence is marked long.")
			.addSlider((slider) =>
				slider
					.setLimits(15, 45, 1)
					.setValue(this.plugin.settings.longSentenceWords)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.longSentenceWords = value;
						if (this.plugin.settings.veryLongSentenceWords <= value) {
							this.plugin.settings.veryLongSentenceWords = value + 5;
						}
						// A slider fires once per step; coalesce the drag into one save.
						this.plugin.queueSave();
					})
			);

		new Setting(this.containerEl)
			.setName("Very long sentence threshold")
			.setDesc("Words before a sentence is marked as hard to read in one pass.")
			.addSlider((slider) =>
				slider
					.setLimits(25, 70, 1)
					.setValue(this.plugin.settings.veryLongSentenceWords)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.veryLongSentenceWords = Math.max(
							value,
							this.plugin.settings.longSentenceWords + 1
						);
						this.plugin.queueSave();
					})
			);
	}

	private renderPro(): void {
		this.proHeading("Pro features");

		const deslop = RULE_LABELS.find((rule) => rule.id === "deslop");
		this.proRow(deslop?.name ?? "De-slop marks", deslop?.desc ?? "", (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.rules.deslop !== false).onChange(async (value) => {
					this.plugin.settings.rules.deslop = value;
					await this.plugin.saveSettings();
				})
			);
		});

		this.proRow(
			"Focus mode",
			"Dim everything except the sentence under the cursor.",
			(setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.focusMode).onChange(async (value) => {
						this.plugin.settings.focusMode = value;
						await this.plugin.saveSettings();
					})
				);
			}
		);

		new Setting(this.containerEl)
			.setName("Echo detector and revision delta")
			.setDesc("Both live in the side panel. Open it from the command palette.")
			.addButton((button) =>
				button.setButtonText("Open panel").onClick(() => {
					void this.plugin.activatePanel();
				})
			);
	}

	private renderIgnored(): void {
		const ignored = this.plugin.settings.ignoredWords;
		if (ignored.length === 0) return;

		new Setting(this.containerEl).setName("Ignored words").setHeading();

		for (const word of [...ignored]) {
			new Setting(this.containerEl).setName(word).addExtraButton((button) =>
				button
					.setIcon("rotate-ccw")
					.setTooltip("Stop ignoring")
					.onClick(async () => {
						this.plugin.settings.ignoredWords = this.plugin.settings.ignoredWords.filter(
							(entry) => entry !== word
						);
						await this.plugin.saveSettings();
						this.display();
					})
			);
		}
	}

	private renderPerformance(): void {
		new Setting(this.containerEl).setName("Performance").setHeading();

		new Setting(this.containerEl)
			.setName("Skip notes larger than")
			.setDesc("Characters. Above this size, analysis is skipped so a huge note cannot stall typing.")
			.addSlider((slider) =>
				slider
					.setLimits(50000, 1000000, 50000)
					.setValue(this.plugin.settings.maxNoteChars)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.maxNoteChars = value;
						this.plugin.queueSave();
					})
			);
	}
}
