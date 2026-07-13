# Prose Lens

**Live readability and style marks, right in the Obsidian editor.**

Adverbs, passive voice, hedges, long sentences, and a live reading grade — highlighted as
you type, in the note you are already writing. No web form, no round trip, no account.
Your manuscript never leaves your vault.

> Prose Lens **never writes to your notes**. It only highlights. Turn it off and every
> character is exactly where you left it.

## Why it exists

Every serious writer in Obsidian has the same loop today: draft in Obsidian, paste the
paragraph into a readability site, read the verdict, come back, hand-edit. It is a context
switch, it is a privacy leak — your journal, your manuscript, your client memo, pasted into
someone else's web form — and the feedback arrives *after* the prose has already set.

Prose Lens moves the feedback into the sentence you are writing.

It also replaces a shelf of single-purpose plugins that each do one part of this and have
not shipped an update in over a year, with one that does all of it and is maintained.

## What it marks

| Mark | What it catches |
| --- | --- |
| **Adverbs** | `-ly` words. A stronger verb usually beats one. |
| **Passive voice** | be-verb plus past participle. Conservative by design — see below. |
| **Hedges** | *maybe*, *somewhat*, *I think* — the qualifiers that weaken a claim. |
| **Weasel words** | *many*, *clearly*, *significantly* — claims with nobody behind them. |
| **Doubled words** | the the. |
| **Clichés** | the phrases a reader's eye slides straight over. |
| **Long sentences** | past your threshold, with a second tier for the ones nobody finishes. |

Plus **Flesch reading ease and grade level** in the status bar, live, and a
**sentence-length heat** layer that tints each sentence by how long it is.

**Nothing fires inside code.** Code fences, inline code, math, frontmatter, URLs,
wikilinks, headings, and table rows are masked before a single rule runs — so
`const was_deleted = obviously(x)` is not "passive voice with an adverb", and a long URL is
not a 40-word sentence. This is the part the older plugins in this space get wrong.

## Pro — $12, one time

Three of these exist nowhere else in the community store.

| | Free | Pro |
| --- | :---: | :---: |
| All style marks | ✓ | ✓ |
| Reading grade in the status bar | ✓ | ✓ |
| Sentence-length heat | ✓ | ✓ |
| Rhythm map | ✓ | ✓ |
| **De-slop marks** | | ✓ |
| **Echo detector** | | ✓ |
| **Revision delta** | | ✓ |
| **Focus mode** | | ✓ |

- **De-slop marks** — the phrasing tells of machine-generated prose: em-dash pile-ups,
  *"it's worth noting"*, *"delve"*, *"a testament to"*, the *"not just X, it's Y"*
  construction. **It is a highlighter, not a detector.** It will never put a percentage on
  your writing or claim to know who wrote it. AI-detection scores are statistically
  indefensible and the people they hurt are real writers.
- **Echo detector** — the words and phrases you lean on, and where they cluster. *"However"
  three times in four sentences.*
- **Revision delta** — grade, passive count, and hedge count now, versus when you opened
  the note. Editing finally moves a number.
- **Focus mode** — dim everything except the sentence under the cursor.

The free tier has **no caps** — no note limit, no session limit, no nag. It is a complete
tool on its own, and it is meant to be.

Licenses are verified **offline** with an Ed25519 signature built into the plugin. No
account, no server, no network request, on any tier.

## Honest limitations

- **English only.** Flesch and the syllable model are fitted to English. Running them over
  German or Portuguese produces confident nonsense, so the plugin says so rather than
  quietly lying to you.
- **Passive voice is a heuristic, not a parser.** There is no part-of-speech tagger in the
  bundle — that is a deliberate trade for a small, instant, fully offline plugin. It is
  tuned to stay quiet when unsure, so it misses some passives rather than crying wolf on
  correct prose. If it marks something it should not, right-click the word and it will
  never mark it again.
- Very large notes are skipped rather than stalling your typing. The threshold is a
  setting.

## Install

Search for **Prose Lens** in Settings → Community plugins.

**Manual:** copy `main.js`, `manifest.json`, and `styles.css` into
`.obsidian/plugins/prose-lens/` in your vault, then enable it.

## Commands

- Toggle style marks
- Mute style marks in this note
- Open the prose panel
- Toggle focus mode *(Pro)*

No default hotkeys — bind whatever you like.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # typecheck + the review bot's lint ruleset + the test suite
npm run build   # production bundle
```

The linguistic core (`src/core/*.mjs`) is pure JavaScript with no `obsidian` import and no
dependencies, so the whole rule engine runs and is tested under plain Node with no mocking.

## License

MIT. See [LICENSE](LICENSE).
