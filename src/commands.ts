import { MarkdownView, Notice } from "obsidian";
import type ProseLensPlugin from "./main";
import { requirePro } from "./ui/pro/ProGate";
import { ignorableMarkAt, wordAtCursor } from "./core/wordAtCursor.mjs";
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
			// The most recent note, not the active view: with the prose panel focused the active
			// view is the sidebar, and the command vanished from the palette.
			const path = plugin.activeMarkdownView()?.file?.path;
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
		plugin.app.workspace.on("editor-menu", (menu, editor, info) => {
			const cursor = editor.getCursor();
			const word = wordAtCursor(editor.getLine(cursor.line), cursor.ch);
			if (!word) return;

			// Only offer this on a word we actually marked. It used to appear on every word in
			// every note, so it read as generic menu clutter — `Ignore "the" everywhere` — and
			// the one moment it exists for, right-clicking a mark you disagree with, looked
			// exactly the same as all the noise. Naming the rule makes the offer legible.
			// The mark's own `word` is what gets ignored, so a phrase mark offers the phrase.
			//
			// Mark offsets are a debounce window old. Right-clicking a word just typed above a
			// mark compared the CURRENT cursor to STALE offsets and offered to ignore whatever
			// mark used to sit there, so the marks are mapped into today's coordinates first.
			const offset = editor.posToOffset(cursor);
			const view = info instanceof MarkdownView ? info : plugin.activeMarkdownView();
			const map = view ? plugin.offsetMapper(view) : (at: number) => at;
			const marks = (plugin.currentAnalysis()?.marks ?? []).map((entry) => ({
				...entry,
				from: map(entry.from),
				to: map(entry.to),
			}));
			const mark = ignorableMarkAt(marks, offset, plugin.settings.ignoredWords);
			if (!mark?.word) return;
			const target = mark.word;

			const label = RULE_LABELS.find((rule) => rule.id === mark.rule)?.name.toLowerCase();
			menu.addItem((item) =>
				item
					.setTitle(label ? `Stop marking "${target}" as ${withArticle(singular(label))}` : `Ignore "${target}" everywhere`)
					.setIcon("eye-off")
					.onClick(() => {
						void plugin.ignoreWord(target);
					})
			);
		})
	);
}

/** "Weasel words" -> "weasel word". The menu names one word, not a category. */
function singular(label: string): string {
	return label.endsWith("s") ? label.slice(0, -1) : label;
}

/** "adverb" -> "an adverb". The menu used to read `as a adverb`. */
function withArticle(noun: string): string {
	return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/**
 * Move the cursor to the next or previous mark, wrapping at the ends.
 *
 * `marks` is already sorted by position, so this is a scan rather than a sort. Wrapping
 * rather than stopping matters: a command that silently does nothing at the last mark reads
 * as broken, and there is no natural place for the user to learn they have reached the end.
 */
function jumpToMark(plugin: ProseLensPlugin, checking: boolean, direction: 1 | -1): boolean {
	// Same reason as mute: the note being revised, even while the prose panel has focus.
	const view = plugin.activeMarkdownView();
	const marks = plugin.currentAnalysis()?.marks ?? [];
	// With style marks switched off nothing is painted, so walking the analysis would move
	// the cursor to highlights the user cannot see and announce them in a notice.
	if (!view || !plugin.settings.marksEnabled || marks.length === 0) return false;
	if (checking) return true;

	// Marks carry offsets from the last analysis, which can be a debounce window behind the
	// text. Compare in the document's CURRENT coordinates, or "next" right after typing above
	// a mark skips it or lands on the one before. revealOffset maps the target itself.
	const cursor = view.editor.posToOffset(view.editor.getCursor());
	const map = plugin.offsetMapper(view);
	const at = (mark: { from: number }) => map(mark.from);
	let target = direction === 1 ? marks[0] : marks[marks.length - 1];
	if (direction === 1) {
		const found = marks.find((mark) => at(mark) > cursor);
		if (found) target = found;
	} else {
		for (let i = marks.length - 1; i >= 0; i--) {
			if (at(marks[i]) < cursor) {
				target = marks[i];
				break;
			}
		}
	}
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
