# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
