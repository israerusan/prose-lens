# The store listing: how it actually works

Verified against `obsidianmd/obsidian-releases` on 2026-08-01. **Read this before trying to
"fix" the store entry**, because the obvious approach does not work and the plausible-sounding
one is wrong.

## The two fields, and where each comes from

Obsidian's in-app plugin browser searches `name + author + description` from the entry in
`obsidianmd/obsidian-releases/community-plugins.json`. That much is stated in that repo's own
README. What is not stated is how the file gets written.

| Field | Source | Can we change it? |
| --- | --- | --- |
| `description` | **Our `manifest.json`**, mirrored automatically, with `" - This plugin has not been manually reviewed by Obsidian staff."` appended | **Yes — ship a release.** |
| `author` | Obsidian's own developer-account record, **not** the manifest | No, not from this repo. |
| `name`, `id`, `repo` | Submission record | No. |

### You cannot open a pull request

`community-plugins.json` is no longer edited by hand. Every commit on that repo is a bot
commit titled `chore: Mirror community plugins and themes`, and **pull requests are disabled
outright** — `GET /repos/obsidianmd/obsidian-releases/pulls` returns 404. A fork-and-PR
workflow is not merely slow here; it is impossible, and even if it landed the next mirror run
would overwrite it within hours.

### The evidence for each source

The mirror updates *existing* entries in place, not just additions. Two changes from a single
day's commits prove which field follows what:

- `auto-move-on-property`: the store description matches that plugin's `manifest.json`
  description verbatim, plus the staff-review suffix. **Description follows the manifest.**
- The same plugin's store `author` changed `"Soul"` → `"Soulbits"` while its
  `manifest.json` says `"soulbits-vibe"` — all three different. **Author does not follow the
  manifest.**

Our own entry is the same story: it read `"saiken"` for three releases while the manifest said
`"Israel Avila"`.

## What we did

Shipped the rewritten description in `manifest.json` as part of **1.1.0**, so the mirror picks
it up on its next run. No PR, no separate process.

```
Writing feedback while you draft: marks passive voice, adverbs, hedges, weasel
words, cliches, and long sentences, plus a live Flesch reading grade. Skips code
and links. English, offline.
```

188 characters. The store appends 64 characters of boilerplate, so anything past ~200 renders
as a wall on the card. (That suffix is on 3,039 of 5,652 entries, including all ten of ours.
It is noise, not a penalty.)

`package.json` carries matching wording so the two cannot drift.

## Why this description

The browser matches over `name + author + description`. "Prose" is the only useful word in the
name; nobody searches "lens". So the description carries essentially all the search weight —
and the old one missed the category noun entirely.

Measured against all 5,652 store entries:

| Query a real person types | Plugins that match | Prose Lens appeared |
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

Two findings drove the rewrite. **`writing` is the most common query in this category and we
did not appear in its results at all** — same for `writer` and `editing`. And **three
zero-competition words we genuinely ship were never said**: cliché, weasel, filler. Head terms
are unwinnable at 53 downloads because results order by popularity; long-tail terms where we
are the only result are winnable today, for free.

The old copy also led with "style marks", which is our internal noun — nobody has that concept
before installing — and spent characters on "in the editor", which is true of every plugin in
the store.

Deliberate omissions:

- **No "grammar", "proofread" or "spelling".** Wrong buyer: they want LanguageTool (294k
  downloads) or Harper. The claim would be inaccurate and would earn support tickets about
  spell-checking we do not do.
- **No "Hemingway".** Naming a third-party product in a store listing implies affiliation and
  is the sort of thing a reviewer flags. Use it in the README's opening line, the GitHub repo
  description, GitHub topics, and every forum or Reddit post, where it costs nothing.
- `cliches` is deliberately unaccented so a substring search for `cliche` matches.
- No "best", "powerful" or "seamless".

## The author field

The store says `saiken`; the manifest now says `Israel Avila (saiken)`; `authorUrl` points at
`github.com/israerusan`.

This is **not** fixable from this repo, and it is not worth much effort. All ten of our store
entries use `saiken`, and the browser matches on author — so `saiken` is a working cross-sell
query that surfaces the whole catalogue, and discarding it would cost more than it gains. The
manifest now carries both forms, which is what a user sees on the plugin's detail page
(Obsidian pulls `manifest.json` and `README.md` from the repo for that page), so the two reads
now agree with each other.

If it ever becomes worth changing, the lever is the Obsidian developer account's display name,
not this repository.

## How to verify

The mirror runs several times a day. After a release, check:

```bash
curl -s https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json \
  | python -c "import json,sys; print([p for p in json.load(sys.stdin) if p['id']=='prose-lens'][0])"
```

Then search the in-app browser for `writing`, `cliche` and `weasel` and confirm the plugin
appears.
