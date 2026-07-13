import { MarkdownView, Notice } from "obsidian";
import type ProseLensPlugin from "./main";
import { requirePro } from "./ui/pro/ProGate";
import { wordAtCursor } from "./core/wordAtCursor.mjs";

/**
 * Every command and context-menu entry, in one place.
 *
 * These used to live inline in onload(), which is how a plugin entry point turns into a
 * god-object: each new feature adds another twenty lines of registration between the
 * settings load and the view registration, and eventually nobody can see the lifecycle for
 * the wiring. main.ts now says what the plugin IS; this says what it DOES.
 *
 * No default hotkeys — Obsidian's guidelines forbid them, and the review checks.
 */
export function registerCommands(plugin: ProseLensPlugin): void {
	plugin.addCommand({
		id: "toggle-marks",
		name: "Toggle style marks",
		callback: () => {
			void plugin.setMarksEnabled(!plugin.settings.marksEnabled);
		},
	});

	plugin.addCommand({
		id: "toggle-marks-this-note",
		name: "Mute style marks in this note",
		checkCallback: (checking) => {
			const path = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
			if (!path) return false;
			if (!checking) void plugin.toggleMuted(path);
			return true;
		},
	});

	plugin.addCommand({
		id: "open-panel",
		name: "Open the prose panel",
		callback: () => {
			void plugin.activatePanel();
		},
	});

	plugin.addCommand({
		id: "toggle-focus-mode",
		name: "Toggle focus mode",
		callback: () => {
			requirePro({ isPro: plugin.settings.isPro, app: plugin.app }, "focus", () => {
				void plugin.setFocusMode(!plugin.settings.focusMode);
			});
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu, editor) => {
			const cursor = editor.getCursor();
			const word = wordAtCursor(editor.getLine(cursor.line), cursor.ch);
			if (!word) return;
			const lower = word.toLowerCase();
			if (plugin.settings.ignoredWords.includes(lower)) return;
			menu.addItem((item) =>
				item
					.setTitle(`Ignore "${word}" everywhere`)
					.setIcon("eye-off")
					.onClick(() => {
						void plugin.ignoreWord(lower);
					})
			);
		})
	);
}

/** Notices live here too, so the plugin body stays free of copy. */
export function noticeMarks(enabled: boolean): void {
	new Notice(enabled ? "Style marks on." : "Style marks off.");
}

export function noticeFocus(enabled: boolean): void {
	new Notice(enabled ? "Focus mode on." : "Focus mode off.");
}

export function noticeMuted(muted: boolean): void {
	new Notice(muted ? "Marks muted for this note." : "Marks on for this note.");
}
