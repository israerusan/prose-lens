import { PluginSettingTab, Setting } from "obsidian";
import type ProseLensPlugin from "../main";
import { BOUNDS, RULE_LABELS } from "../settings";
import { createExternalLink } from "./links";
import { PRO_PRICE_LABEL, PRO_UNLOCK_SUMMARY, PRODUCT_NAME, PURCHASE_URL } from "../product";

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
		this.renderFeedback();
	}

	// --- gating primitives -----------------------------------------------------

	/** The shared accent "Pro" pill — one affordance for gating, everywhere. */
	private markPro(setting: Setting): void {
		setting.nameEl.createSpan({ cls: "pl-pro-pill", text: "Pro" });
	}

	private proHeading(name: string): void {
		this.markPro(new Setting(this.containerEl).setName(name).setHeading());
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
	 * A Pro row for a free user shows a disabled lock and a way to upgrade — never an empty
	 * right-hand side, which reads as a rendering bug rather than a paywall.
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

	private toggle(name: string, desc: string, key: "marksEnabled" | "sentenceHeat" | "showStatusBar"): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value;
					await this.plugin.saveSettings();
				})
			);
	}

	// --- sections ---------------------------------------------------------------

	private renderLicense(): void {
		new Setting(this.containerEl).setName("License").setHeading();

		new Setting(this.containerEl)
			.setName("License key")
			.setDesc(
				"Verified offline — no account, no server, no network request. One key works on all your devices and vaults; paste the same key into each one."
			)
			.addText((text) =>
				text
					.setPlaceholder("Paste your license key")
					.setValue(this.plugin.settings.licenseKey)
					.onChange((value) => {
						this.plugin.settings.licenseKey = value;
						// Re-verify per keystroke (offline, microseconds) but only rebuild the tab when
						// Pro actually flips — display() empties containerEl, which would destroy the
						// input the user is typing into. Coalesced, because each save bumps the epoch
						// and every epoch bump re-analyses every open note.
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

		this.toggle(
			"Show style marks",
			"Highlight prose issues inline as you type. Nothing is ever written to the note.",
			"marksEnabled"
		);
		this.toggle(
			"Sentence-length heat",
			"Tint every sentence by how long it is, so a slab of flat prose is visible at a glance.",
			"sentenceHeat"
		);
		this.toggle(
			"Reading grade in the status bar",
			"Flesch reading ease and grade level for the active note. English only — the syllable model does not transfer.",
			"showStatusBar"
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
					.setLimits(BOUNDS.longSentenceWords.min, BOUNDS.longSentenceWords.max, 1)
					.setValue(this.plugin.settings.longSentenceWords)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.longSentenceWords = value;
						if (this.plugin.settings.veryLongSentenceWords <= value) {
							this.plugin.settings.veryLongSentenceWords = value + 5;
						}
						// A slider fires once per step; coalesce the whole drag into one save.
						this.plugin.queueSave();
					})
			);

		new Setting(this.containerEl)
			.setName("Very long sentence threshold")
			.setDesc("Words before a sentence is marked as hard to read in one pass.")
			.addSlider((slider) =>
				slider
					.setLimits(BOUNDS.veryLongSentenceWords.min, BOUNDS.veryLongSentenceWords.max, 1)
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

		this.proRow("Focus mode", "Dim everything except the sentence under the cursor.", (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.focusMode).onChange(async (value) => {
					this.plugin.settings.focusMode = value;
					await this.plugin.saveSettings();
				})
			);
		});

		new Setting(this.containerEl)
			.setName("Echo detector and revision delta")
			.setDesc("Both live in the side panel, next to the rhythm map.")
			.addButton((button) =>
				button.setButtonText("Open panel").onClick(() => {
					void this.plugin.activatePanel();
				})
			);

		// The free tier promises no caps, no limits and no nag screen. This is what makes that
		// promise something the user can enforce rather than something we merely assert.
		new Setting(this.containerEl)
			.setName("Hide Pro sections")
			.setDesc(
				"Remove the filler, echo and revision-delta sections from the panel. The marks, the legend, the grade and the rhythm map are unaffected."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.hideProSections).onChange(async (value) => {
					this.plugin.settings.hideProSections = value;
					await this.plugin.saveSettings();
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
			.setDesc(
				"Characters. Above this size, analysis is skipped so a huge note cannot stall typing. The panel says so when it happens, rather than going quiet."
			)
			.addSlider((slider) =>
				slider
					// The ceiling used to be a million, which measures at roughly 2.4 seconds of
					// blocked main thread per typing pause. Nothing above BOUNDS.maxNoteChars.max
					// can be analyzed between keystrokes without the editor visibly freezing, so
					// it is not offered.
					.setLimits(
						BOUNDS.maxNoteChars.min,
						BOUNDS.maxNoteChars.max,
						BOUNDS.maxNoteChars.step
					)
					.setValue(this.plugin.settings.maxNoteChars)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.maxNoteChars = value;
						this.plugin.queueSave();
					})
			);
	}

	private renderFeedback(): void {
		new Setting(this.containerEl).setName("Feedback").setHeading();

		new Setting(this.containerEl)
			.setName("Bugs and feature requests")
			.setDesc("Issues and ideas are tracked on GitHub. Opens in your browser.")
			.addButton((button) =>
				button.setButtonText("Report a bug").onClick(() => {
					window.open("https://github.com/israerusan/prose-lens/issues/new?labels=bug");
				})
			)
			.addButton((button) =>
				button.setButtonText("Request a feature").onClick(() => {
					window.open("https://github.com/israerusan/prose-lens/issues/new?labels=enhancement");
				})
			);
	}
}
