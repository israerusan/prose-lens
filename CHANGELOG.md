# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-31

The release that makes the plugin explain itself. Installing it used to do nothing
observable: marks appeared in seven colours documented nowhere, the panel that explains them
was reachable only from the command palette, and the free tier's one interactive feature was
broken.

### Added

- **A legend, in the panel.** "Marks in this note" lists every active rule with a live count
  and a sample painted with that rule's own mark class — so the key cannot drift from what
  the editor draws. Click a row to walk that rule's marks one at a time.
- **A ribbon icon**, and a first run that opens the panel exactly once. No modal, no tour, no
  second occurrence.
- **Go to next / previous style mark** commands. No default hotkeys; bind what you like.
- **Distinct underline shapes** per rule — solid, double, dotted, dashed, wavy — so the marks
  are still distinguishable without colour, and in forced-colours mode, where every hue
  collapses to one system Highlight.
- **A filler count for the free tier.** The panel says how many de-slop phrases a note
  contains. Pro still shows where they are; free now knows whether there is anything to look
  for.
- **Hide Pro features**, a setting that removes every Pro section from the panel outright.
- **A status bar that explains itself** — what the grade means, and that clicking it opens
  the panel.

### Fixed

- **Clicking anything in the panel did nothing.** Both the rhythm bars and the Pro echo rows
  resolved the target note with `getActiveViewOfType(MarkdownView)`, which returns null
  precisely because clicking a panel row makes the sidebar leaf active. The same bug made a
  Pro user's first look at the revision delta read "No baseline yet."
- **Focus mode dimmed the wrong sentence while typing.** The analysis is debounced, so its
  sentence offsets lag the cursor; they are now mapped through the intervening edits.
- **The revision baseline was dropped for background tabs.** Since Obsidian 1.7 a deferred
  tab holds a `DeferredView`, so eviction treated every unfocused note as closed and "Since
  you opened this note" quietly meant "since you came back to it."
- **A muted or over-sized note no longer looks broken.** The panel and status bar say which
  it is, how large the note is, and where the limit lives, instead of claiming there is no
  prose.
- **A corrupt `data.json` can no longer disable the plugin silently.** Every field is now
  coerced against its default; a `null` note-size limit used to skip analysis on every note
  forever, with no error anywhere.
- **A crash on notes with very many sentences**, from spreading the sentence lengths into
  `Math.max`.

### Changed

- **Overlap resolution is no longer quadratic.** Analysis of a 300,000-character note is
  measurably faster; the output is unchanged, and a 4,000-case differential test pins the new
  sweep to the old pairwise scan.
- **The note-size limit tops out at 400,000 characters**, not a million. A million measured at
  roughly 2.4 seconds of blocked main thread per typing pause, and the old setting text framed
  raising it as the safe choice.
- Every tier gate now asks `featureGates.mjs` instead of reading the entitlement directly, so
  the file that calls itself the single source of truth for what is free actually is one.

## [1.0.2] - 2026-07-25

### Changed

- The purchase link points at a dedicated Buy Me a Coffee product page, so sales are
  attributable to this plugin rather than to the shared profile.

## [1.0.1] - 2026-07-13

### Fixed

- **One statement per stretch of prose.** Rules legitimately fire on top of each other —
  `was quickly written` is a passive span with an adverb inside it, and the de-slop phrase
  `not just thorough, it's` contains the hedge `just`. Painting both meant two overlapping
  underlines and two tooltips telling the writer two things about the same words. The
  containing mark now wins; a doubled word (a typo, not an opinion) is never swallowed.
- **A pair of em dashes is a parenthetical, not machine prose.** `The report — which was
  late — arrived` is correct English that careful writers type on purpose, and the de-slop
  rule was nagging them for it. The pile-up threshold is now three or more in one sentence.
- **The modal passive is marked quietly.** `This should be flagged` is genuinely passive and
  still marked — but it is also the register of instructions and checklists, which is a large
  part of what lives in a vault, so it renders as a hairline rather than at full weight.

### Changed

- Word lists are split by rule family under `src/core/wordlists/`, each with provenance.
  Tuning one is a product decision, not a code change — `test/wordlist-fixtures.test.mjs`
  now pins concrete sentences to concrete rules in both directions, including the entries
  deliberately left OFF the lists, so a disputed flag is argued in one place.
- `main.ts` and `settings.ts` split up: commands, the status bar, link safety, and the
  settings rendering each moved out of the two files that were becoming god-objects.

### Testing

- The `.test.ts` harness existed but had never been pointed at anything — the `obsidian`
  stub was four lines, so every UI behaviour was defended by comments. It is now a working
  fake DOM, and the settings tab and side panel are tested against the real components:
  Pro rows lock for free users and unlock for Pro, the gating surface is asserted to agree
  with the tier table, sliders coalesce their writes, and the rhythm bars must set
  `--pl-bar-width` as a CSS custom property — the exact bug that shipped in 1.0.0.

## [1.0.0] - 2026-07-13

First release.

### Added

- **Style marks** — live inline highlights for adverbs, passive voice, hedges, weasel
  words, doubled words, clichés, and long sentences. They render as you type and nothing
  is ever written to the note.
- **Readability** — Flesch reading ease and Flesch–Kincaid grade level in the status bar,
  updating live. English only.
- **Sentence-length heat** — tint every sentence by how long it is, so a slab of flat
  prose is visible at a glance.
- **Rhythm map** — a side panel showing sentence length down the note, with flat stretches
  called out. Click a bar to jump to the sentence.
- **De-slop marks (Pro)** — the phrasing tells of machine-generated prose: em-dash
  pile-ups, "it's worth noting", "delve", "a testament to", the "not just X, it's Y"
  construction. A highlighter, never a score — this does not claim to detect AI, and it
  never puts a percentage on your writing.
- **Echo detector (Pro)** — the words and phrases you lean on, and where they cluster.
- **Revision delta (Pro)** — grade, passive count, and hedge count now versus when you
  opened the note.
- **Focus mode (Pro)** — dim everything except the sentence under the cursor.
- Offline Ed25519 license verification. No account, no server, no network request, ever.

### Notes

- Marks never fire inside code fences, inline code, math, frontmatter, URLs, wikilinks,
  headings, or table rows.
- Passive-voice detection is a heuristic, not a parser. It is deliberately conservative:
  a missed passive is better than a false accusation on correct prose. Right-click any
  word to stop marking it.

[1.1.0]: https://github.com/israerusan/prose-lens/releases/tag/1.1.0
[1.0.2]: https://github.com/israerusan/prose-lens/releases/tag/1.0.2
[1.0.1]: https://github.com/israerusan/prose-lens/releases/tag/1.0.1
[1.0.0]: https://github.com/israerusan/prose-lens/releases/tag/1.0.0
