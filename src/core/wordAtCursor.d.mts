export function wordAtCursor(line: string, ch: number): string | null;
export function ignorableMarkAt(
	marks: ReadonlyArray<import("./types.d.mts").Mark>,
	offset: number,
	ignoredWords?: ReadonlyArray<string>
): import("./types.d.mts").Mark | null;
