import { MarkdownView, Notice } from "obsidian";
import type ProseLensPlugin from "./main";
import { requirePro } from "./ui/pro/ProGate";
import { wordAtCursor } from "./core/wordAtCursor.mjs";
import { RULE_LABELS } from "./settings";

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

	// Marks you can walk are a tool; marks you can only look at are decoration. There is no
	// default hotkey — bind one and a revision pass becomes a keypress.
	plugin.addCommand({
		id: "next-mark",
		name: "Go to next style mark",
		checkCallback: (checking) => jumpToMark(plugin, checking, 1),
	});

	plugin.addCommand({
		id: "previous-mark",
		name: "Go to previous style mark",
		checkCallback: (checking) => jumpToMark(plugin, checking, -1),
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

			// Only offer this on a word we actually marked. It used to appear on every word in
			// every note, so it read as generic menu clutter — `Ignore "the" everywhere` — and
			// the one moment it exists for, right-clicking a mark you disagree with, looked
			// exactly the same as all the noise. Naming the rule makes the offer legible.
			const offset = editor.posToOffset(cursor);
			const mark = plugin
				.currentAnalysis()
				?.marks.find(
					(candidate) =>
						candidate.word === lower && candidate.from <= offset && candidate.to >= offset
				);
			if (!mark) return;

			const label = RULE_LABELS.find((rule) => rule.id === mark.rule)?.name.toLowerCase();
			menu.addItem((item) =>
				item
					.setTitle(label ? `Stop marking "${word}" as a ${singular(label)}` : `Ignore "${word}" everywhere`)
					.setIcon("eye-off")
					.onClick(() => {
						void plugin.ignoreWord(lower);
					})
			);
		})
	);
}

/** "Weasel words" -> "weasel word". The menu names one word, not a category. */
function singular(label: string): string {
	return label.endsWith("s") ? label.slice(0, -1) : label;
}

/**
 * Move the cursor to the next or previous mark, wrapping at the ends.
 *
 * `marks` is already sorted by position, so this is a scan rather than a sort. Wrapping
 * rather than stopping matters: a command that silently does nothing at the last mark reads
 * as broken, and there is no natural place for the user to learn they have reached the end.
 */
function jumpToMark(plugin: ProseLensPlugin, checking: boolean, direction: 1 | -1): boolean {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const marks = plugin.currentAnalysis()?.marks ?? [];
	if (!view || marks.length === 0) return false;
	if (checking) return true;

	const cursor = view.editor.posToOffset(view.editor.getCursor());
	const target =
		direction === 1
			? (marks.find((mark) => mark.from > cursor) ?? marks[0])
			: ([...marks].reverse().find((mark) => mark.from < cursor) ?? marks[marks.length - 1]);
	plugin.revealOffset(target.from);
	new Notice(target.message);
	return true;
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
