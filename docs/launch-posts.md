# Launch posts

Traffic is the bottleneck, not conversion. 53 downloads × 1.9% × $12 is $12 lifetime; doubling
the conversion rate adds $12 and doubling the price adds $7, while going 53 → 530 installs at
today's rate adds about $108. Installs is the only lever with an order of magnitude in it.

**Do not post any of this until the hero GIF is committed and rendering on GitHub.** Every
channel below is carried by the image.

Ordered by expected installs per hour of work.

---

## 1. r/ObsidianMD — ~2h, expect 60–800 installs (median ~150)

The highest-yield hour available, and the only channel that can move 53 → 500 in a weekend.

Rules that decide the outcome:

- Upload the GIF as a **native image/video**, not a link. Link posts are suppressed.
- Put the story in the body.
- **Disclose the paid tier in the post body, not in a reply.** Reddit forgives monetisation it
  can see and destroys monetisation it discovers.
- Once per meaningful release. Never weekly.

**Title** (problem-first, no "I made a plugin"):

> I kept pasting drafts into Hemingway, so I made my Obsidian editor mark passive voice and
> long sentences live — and skip code blocks

**Body:**

> Every prose linter I tried had the same problem: it lints raw Markdown. So
> `const was_deleted = obviously(x)` gets flagged as passive voice with an adverb, a long URL
> counts as a 40-word sentence, and wikilink titles get graded as bad writing. You end up
> ignoring the highlights, which defeats the point.
>
> Prose Lens masks every non-prose structure — code fences, inline code, math, frontmatter,
> URLs, wikilinks, headings, table rows — before any rule runs, while preserving exact
> character offsets so the highlights stay anchored to the right words. Then it marks passive
> voice, adverbs, hedges, weasel words, clichés, doubled words and long sentences as you type,
> with a Flesch grade in the status bar.
>
> Each rule has its own underline shape as well as its own colour, and the side panel lists
> them with live counts so you can click through and fix them one at a time.
>
> It never writes to your notes, only highlights. No network calls at all — not for analysis,
> not for licensing.
>
> Free covers all seven marks, the legend and counts, the grade, sentence heat and the rhythm
> map, uncapped. There's a $12 one-time Pro with de-slop marks (AI-era filler), an echo
> detector for words you overuse, and a revision delta. Saying that up front so nobody feels
> ambushed — and there's a setting that hides the Pro sections entirely.
>
> GitHub: github.com/israerusan/prose-lens — in the community store as "Prose Lens".

---

## 2. Obsidian Roundup (Eleanor Konik) — ~1h, expect 100–500 installs from one mention

The best-fit newsletter in the ecosystem: her audience is writers and researchers, not
tinkerers. This is the single highest expected-value email available.

Pitch = 5 sentences + the GIF + the **why**, not the feature list. She responds to the
interesting idea, which here is the masking layer: linting prose inside Markdown requires
blanking the non-prose to spaces while preserving exact string length, so downstream offsets
need no remapping at all. Lead with that.

---

## 3. Obsidian forum → Share & showcase — ~1h, 5–30 installs/month, compounding for years

Low immediate yield, best long-term return on the list, because `forum.obsidian.md` ranks
extremely well in Google. This is how you capture "obsidian readability plugin", "obsidian
hemingway" and "write good obsidian alternative" indefinitely.

Title for the query, not for the brand:

> Prose Lens — live readability and style marks in the editor (a Hemingway-style pass without
> leaving Obsidian)

Reply to your own thread on each release so it resurfaces.

---

## 4. Answering "is there a Hemingway for Obsidian?" — ~10 min/day, 1–5 installs/day

The best conversion rate of anything here, because these people have already qualified
themselves. That question is asked on r/ObsidianMD and the forum roughly weekly, alongside
"write-good doesn't work anymore" and "readability-score seems broken".

Set keyword alerts for `hemingway`, `readability`, `passive voice` and `write good` scoped to
r/ObsidianMD. Answer as a person who built a thing: one sentence and a link.

This is the consolidation play made operational — five incumbents in this category are 13 to
20 months stale, and their users are still looking.

---

## 5. Obsidian Discord, plugin-sharing channel — ~15 min, 20–80 installs

Free, but a flash rather than a channel: all of it lands on day one with no tail. Do it the
same hour as the Reddit post.

---

## 6. YouTube reviewers — ~1h for six cold emails, usually 0, occasionally 200–1500

Realistic targets who cover writing and PKM plugins: Nicole van der Hoeven, Bryan Jenks,
FromSergio, Santi Younger, Danny Hatcher, Filipe Donadio.

Send the GIF inline, one paragraph, and offer a free Pro key with **no** coverage expectation
— say so explicitly, it reads as confidence. Lead time 3–8 weeks, reply rate around 1 in 5.

---

## Deliberately skipped

- **r/writing** bans self-promotion outright. Don't burn the account.
- **Indie Hackers / r/SideProject** — the audience is other builders, and Obsidian install
  conversion is near zero. This is where the hour that should have gone to Reddit disappears.
- **Hacker News as "Show HN: Obsidian plugin"** dies at three points. The only version that
  works is an essay where the plugin is the footnote — *"Why linting prose in Markdown
  requires masking, not parsing"* — which is a genuinely interesting engineering post with a
  real trick in it. Treat it as a lottery ticket, and note that the installs it produces
  convert to Pro poorly because the audience is developers.
- **A downloads-count badge in the README.** At 53 it is negative social proof. Revisit at
  four figures.

## Timing

**November is a real seasonal spike** for Obsidian and long-form writing. Schedule the next
release announcement for late October.

## The honest ceiling

The whole craft-writing category in the store is roughly 34,000 downloads. A total
consolidation win — every user of all five stale incumbents — is around 41,000 installs, which
at 1.9% and $12 is roughly $9k lifetime. That is a good hobby outcome, not a business. The
small-market risk was accepted going in; it does not change the ranking above.
