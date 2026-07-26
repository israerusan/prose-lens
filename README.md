# Prose Lens

Live readability and style feedback inside the Obsidian editor.

Write in Obsidian. See weak prose while you draft. Keep your text private.

Prose Lens highlights passive voice, adverbs, hedges, clichés, doubled words, long sentences, and more — directly in the note you are already writing. No browser tab. No copy-paste ritual. No account. No sending your draft to some random website.

<!-- SCREENSHOT SLOT — drop a real Obsidian capture here to lift conversions.
     ![Live inline marks in the editor with the reading-ease score in the status bar](docs/assets/hero.png)
     Suggested shot: a paragraph mid-draft with passive/adverb/long-sentence marks lit up and the Flesch score visible in the status bar. Save as docs/assets/hero.png -->


> Prose Lens never writes to your notes. It only highlights. Disable it and every character stays exactly where you left it.

## Why people buy this

Most writing tools for Obsidian fail in one of two ways:

1. They make you leave the editor.
2. They blindly lint raw Markdown and flag garbage inside code, URLs, math, or links.

Prose Lens fixes both.

You keep drafting in Obsidian, and the plugin only analyzes actual prose. Code fences, inline code, math, frontmatter, URLs, wikilinks, headings, and table rows are masked before the rules run.

That means:

- `const was_deleted = obviously(x)` is not flagged as passive voice with an adverb.
- A long URL is not treated like a 40-word sentence.
- You get feedback on the sentence you are writing, not noise from the syntax around it.

## What you get

### Free

- Inline marks for:
  - adverbs
  - passive voice
  - hedges
  - weasel words
  - doubled words
  - clichés
  - long sentences
- Live Flesch reading ease and grade in the status bar
- Sentence-length heat
- Rhythm map in the prose panel
- No caps, no note limit, no session limit, no nag screen

### Pro — $12 one-time

Purchase: [Buy Me a Coffee — Prose Lens Pro](https://buymeacoffee.com/vaultspotlight/e/560203). License keys are verified **offline** (Ed25519) — no account, server, or subscription.

| Feature | Free | Pro |
| --- | :---: | :---: |
| Core style marks | ✓ | ✓ |
| Reading grade in status bar | ✓ | ✓ |
| Sentence-length heat | ✓ | ✓ |
| Rhythm map | ✓ | ✓ |
| De-slop marks |  | ✓ |
| Echo detector |  | ✓ |
| Revision delta |  | ✓ |
| Focus mode |  | ✓ |

Pro adds the higher-leverage editorial tools:

- **De-slop marks** — catches mushy AI-era filler and overcooked phrasing like "it's worth noting," "a testament to," "delve," and the "not just X, it's Y" construction.
- **Echo detector** — shows the words and phrases you keep leaning on, and where they cluster.
- **Revision delta** — compares now versus when you opened the note, so editing moves a number instead of just a feeling.
- **Focus mode** — dims everything except the sentence under the cursor.

Important: de-slop is a highlighter, not an AI detector. It does not pretend to know who wrote a passage, and it will never spit out fake confidence percentages.

Licenses are verified offline with an Ed25519 signature built into the plugin. No account, no server, no network request.

### Activate Pro

1. [Buy Prose Lens Pro](https://buymeacoffee.com/vaultspotlight/e/560203) — $12 one-time.
2. Your license key is emailed to you **automatically, within seconds** — delivery is fully automated, no waiting.
3. Paste it into the plugin's settings. Pro unlocks instantly, verified offline — no account, no sign-in, no telemetry.

## What it marks

| Mark | What it catches |
| --- | --- |
| **Adverbs** | `-ly` words. A stronger verb usually beats one. |
| **Passive voice** | Be-verb plus past participle. Conservative by design. |
| **Hedges** | *maybe*, *somewhat*, *I think* — the qualifiers that weaken a claim. |
| **Weasel words** | *many*, *clearly*, *significantly* — claims with nobody behind them. |
| **Doubled words** | the the. |
| **Clichés** | Phrases the reader's eye slides over. |
| **Long sentences** | Sentences past your threshold, with a second tier for the real wall-of-text monsters. |

## Why it is different

The real differentiator is not the word list. It is the masking layer.

Before any rule runs, Prose Lens removes non-prose structures from consideration while preserving editor offsets. That keeps the highlights anchored to the right text and avoids the usual Markdown-plugin stupidity.

If another plugin flags your code block, your URL, your table row, and your wikilink title as “bad writing,” that plugin is not being strict. It is being dumb.

## Honest limitations

- **English only.** Flesch and the syllable model are fitted to English. Running them over German or Portuguese would produce confident nonsense.
- **Passive voice is heuristic, not grammatical parsing.** There is no full part-of-speech tagger in the bundle. The plugin is tuned to stay quiet when unsure, which means it misses some passives instead of crying wolf constantly.
- **Very large notes are skipped rather than stalling the editor.** The threshold is configurable.

If Prose Lens marks something you do not want marked, right-click the word and ignore it.

## Who this is for

Prose Lens is for people who actually draft inside Obsidian:

- essay writers
- bloggers
- newsletter writers
- students
- fiction writers
- people writing client memos, proposals, or documentation

It is especially useful if you care about privacy and hate pasting drafts into web tools.

## Install

### Community plugins

Search for **Prose Lens** in Settings → Community plugins.

### Manual install

Download `main.js`, `manifest.json`, and `styles.css`, then copy them into:

`.obsidian/plugins/prose-lens/`

Enable the plugin in Obsidian after copying the files.

## Commands

- Toggle style marks
- Mute style marks in this note
- Open the prose panel
- Toggle focus mode *(Pro)*

No default hotkeys. Bind whatever you like.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The linguistic core in `src/core/*.mjs` is pure JavaScript with no `obsidian` import and no runtime dependency on the app, so the rule engine can be tested under plain Node without mocking the entire editor.

## License

MIT. See [LICENSE](LICENSE).
