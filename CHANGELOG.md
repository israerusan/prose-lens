# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/israerusan/prose-lens/releases/tag/1.0.0
