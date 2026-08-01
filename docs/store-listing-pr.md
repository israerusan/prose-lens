# Store listing PR — `obsidianmd/obsidian-releases`

The single highest-return action available for this plugin, and it needs no release, no
version bump and no review queue. Roughly 30 minutes, permanent.

## Why the manifest is not enough

Obsidian's in-app plugin browser searches the entry in
`obsidianmd/obsidian-releases/community-plugins.json` — **not** `manifest.json`, and it does
not re-read the manifest when you publish a release. The proof is already in the data: the
store entry says `"author": "saiken"` while the manifest says `"Israel Avila"`. The two have
been out of step since submission.

## What is wrong with the current entry

The browser matches over `name + author + description`. The name contributes "prose"; nobody
searches "lens". So the description carries essentially all the search weight — and it misses
the category noun.

Measured against all 5,652 store entries:

| Query a real person types | Plugins that match | Prose Lens appears |
| --- | ---: | --- |
| `writing` | 109 | **no** |
| `writer` | 23 | **no** |
| `editing` | 77 | **no** |
| `draft` | 22 | **no** |
| `english` | 29 | **no** |
| `cliche` | **0** | **no** |
| `weasel` | **0** | **no** |
| `filler` | **0** | **no** |
| `readability` | 6 | yes |
| `passive voice` | **1 (only us)** | yes |
| `flesch` | 2 | yes |
| `style` | 211 | yes, and worthless |

Two findings. **`writing` is the most common query in this category and Prose Lens does not
appear in the results at all** — same for `writer` and `editing`. And **three
zero-competition words the plugin genuinely ships are never said**: `cliché`, `weasel`,
`filler`. Head terms are unwinnable at 53 downloads because results order by popularity;
long-tail terms where we are the only result are winnable today, for free.

The old copy also led with "style marks", which is our internal noun — nobody has that
concept before installing — and spent characters on "in the editor", which is true of every
plugin in the store.

## The change

One file, one entry. Find the `prose-lens` object and replace it:

```diff
 {
   "id": "prose-lens",
   "name": "Prose Lens",
-  "author": "saiken",
-  "description": "Live readability and style marks in the editor: passive voice, adverbs, hedges, long sentences, and a Flesch reading grade. Works fully offline.",
+  "author": "Israel Avila (saiken)",
+  "description": "Writing feedback while you draft: marks passive voice, adverbs, hedges, weasel words, cliches, and long sentences, plus a live Flesch reading grade. Skips code and links. English, offline.",
   "repo": "israerusan/prose-lens"
 }
```

188 characters. The store appends 64 characters of "This plugin has not been manually
reviewed by Obsidian staff" boilerplate, so anything past ~200 renders as a wall on the card.
(That suffix applies to 3,039 of the 5,652 entries, including all ten of ours. It is noise,
not a penalty.)

`manifest.json` and `package.json` have already been aligned to the same wording so the two
cannot drift again.

### Notes on the wording

- `cliches` is deliberately unaccented so a substring search for `cliche` matches.
- "Writing feedback" leads with the user's noun instead of ours, and captures `writing`.
- "Skips code and links" is the one claim no competitor in this category can make. It is the
  reason someone abandons a Markdown-linting alternative, compressed to four words.
- **No "grammar", no "proofread", no "spelling".** That is the wrong buyer — they want
  LanguageTool (294k downloads) or Harper — the claim would be inaccurate, and it would earn
  support tickets about spell-checking the plugin does not do.
- **No "Hemingway".** Naming a third-party product in a store listing implies affiliation and
  is the kind of thing a reviewer flags. Use it in the README opening line, the GitHub repo
  description, GitHub topics and every forum or Reddit post, where it costs nothing and
  captures search.
- No "best", "powerful" or "seamless".

## Why the author line changes too

The store entry says `saiken`; the manifest says `Israel Avila`; `authorUrl` points at
`github.com/israerusan`. Three strings for one person, on a plugin that asks for money, is a
small live trust leak.

All ten of our store entries use `saiken`, and the browser matches on author — so `saiken` is
a working cross-sell query that surfaces the whole catalogue and should not simply be
discarded. `"Israel Avila (saiken)"` satisfies both the human-trust read and the
author-search read, in one field.

## Checklist

- [ ] Fork `obsidianmd/obsidian-releases`, edit `community-plugins.json`, one entry only.
- [ ] Keep the JSON formatting byte-identical to its neighbours (2-space indent, key order).
- [ ] PR title: `Update Prose Lens listing (description and author)`.
- [ ] PR body: one sentence. No marketing.
- [ ] After merge, search the in-app browser for `writing`, `cliche` and `weasel` and confirm
      the plugin appears.
