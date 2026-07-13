/**
 * Returns a string of exactly the same length as `text`, with every non-prose
 * character (code, math, URLs, wikilinks, headings, table rows, markers) replaced
 * by a space. Offsets in the result are offsets in the original document.
 */
export function maskText(text: string): string;
