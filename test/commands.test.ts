// Commands and the right-click "stop marking" entry, driven through registerCommands with a
// fake workspace — the real handlers run, only Obsidian is stubbed.
import assert from "node:assert";
import { MarkdownView, notices } from "obsidian";
import { registerCommands } from "../src/commands";
import { analyze } from "../src/core/ruleEngine.mjs";
import { ignorableMarkAt } from "../src/core/wordAtCursor.mjs";
import { DEFAULT_SETTINGS, type ProseLensSettings } from "../src/settings";
import type ProseLensPlugin from "../src/main";

interface Command {
	id: string;
	checkCallback?: (checking: boolean) => boolean;
}

function setup(text: string, cursorOffset: number, overrides: Partial<ProseLensSettings> = {}) {
	const settings: ProseLensSettings = { ...DEFAULT_SETTINGS, ...overrides, ignoredWords: [] };
	const analysis = analyze(text, { isPro: settings.isPro, ignoredWords: settings.ignoredWords });
	const lines = text.split("\n");
	const posToOffset = (pos: { line: number; ch: number }) => {
		let offset = 0;
		for (let i = 0; i < pos.line; i++) offset += lines[i].length + 1;
		return offset + pos.ch;
	};
	const offsetToPos = (offset: number) => {
		let line = 0;
		while (line < lines.length - 1 && offset > lines[line].length) {
			offset -= lines[line].length + 1;
			line++;
		}
		return { line, ch: offset };
	};
	const editor = {
		getCursor: () => offsetToPos(cursorOffset),
		getLine: (line: number) => lines[line],
		posToOffset,
	};
	const view = new MarkdownView(null);
	(view as unknown as { editor: typeof editor }).editor = editor;

	const commands: Command[] = [];
	let menuHandler: ((menu: unknown, ed: unknown) => void) | null = null;
	const revealed: number[] = [];
	const ignored: string[] = [];
	const fake = {
		settings,
		app: {
			workspace: {
				getActiveViewOfType: () => view,
				on: (_name: string, handler: (menu: unknown, ed: unknown) => void) => {
					menuHandler = handler;
					return {};
				},
			},
		},
		addCommand: (command: Command) => commands.push(command),
		registerEvent: () => undefined,
		currentAnalysis: () => analysis,
		revealOffset: (offset: number) => revealed.push(offset),
		ignoreWord: (word: string) => {
			ignored.push(word);
			return Promise.resolve();
		},
	};
	registerCommands(fake as unknown as ProseLensPlugin);

	const openMenu = () => {
		const items: Array<{ title: string; click: () => void }> = [];
		const menu = {
			addItem: (cb: (item: unknown) => void) => {
				const entry = { title: "", click: () => undefined as void };
				const item = {
					setTitle: (title: string) => ((entry.title = title), item),
					setIcon: () => item,
					onClick: (fn: () => void) => ((entry.click = fn), item),
				};
				cb(item);
				items.push(entry);
			},
		};
		assert.ok(menuHandler, "the editor-menu handler is registered");
		menuHandler(menu, editor);
		return items;
	};
	const command = (id: string) => {
		const found = commands.find((entry) => entry.id === id);
		assert.ok(found?.checkCallback, `command ${id} exists`);
		return found.checkCallback;
	};
	return { openMenu, command, revealed, ignored };
}

// --- right-click ignore on a PHRASE mark ---------------------------------------------------
// The menu required the mark's `word` to equal the single word under the cursor, so a phrase
// mark — the hedge "I think" the README uses as its example — could never be ignored.
{
	const text = "Honestly, I think the plan works.";
	const { openMenu, ignored } = setup(text, text.indexOf("think") + 2);
	const items = openMenu();
	assert.equal(items.length, 1, "a phrase mark offers the stop-marking entry");
	assert.match(items[0].title, /"i think"/);
	items[0].click();
	assert.deepEqual(ignored, ["i think"], "the phrase itself is what gets ignored");
	// And ignoring that phrase really silences it.
	assert.ok(
		!analyze(text, { ignoredWords: ["i think"] }).marks.some((mark) => mark.word === "i think")
	);
}

// A single-word mark still offers the word.
{
	const text = "This is clearly fine.";
	const { openMenu, ignored } = setup(text, text.indexOf("clearly") + 1);
	const items = openMenu();
	assert.equal(items.length, 1);
	items[0].click();
	assert.deepEqual(ignored, ["clearly"]);
}

// An unmarked word offers nothing.
{
	const text = "This is clearly fine.";
	const { openMenu } = setup(text, text.indexOf("fine") + 1);
	assert.equal(openMenu().length, 0);
}

// An already-ignored mark word is not offered again.
assert.equal(
	ignorableMarkAt(analyze("I think so.").marks, 3, ["i think"]),
	null,
	"an ignored phrase is not offered twice"
);

// --- next / previous mark respect "Show style marks" -----------------------------------------
// With marks switched off nothing is painted, yet the commands walked the hidden analysis and
// announced invisible highlights in a notice.
{
	const text = "This is clearly fine. That was obviously done.";
	const on = setup(text, 0);
	assert.equal(on.command("next-mark")(false), true);
	assert.equal(on.revealed.length, 1);

	const off = setup(text, 0, { marksEnabled: false });
	const before = notices.length;
	assert.equal(off.command("next-mark")(true), false, "unavailable while marks are hidden");
	assert.equal(off.command("previous-mark")(false), false);
	assert.equal(off.revealed.length, 0);
	assert.equal(notices.length, before);
}
