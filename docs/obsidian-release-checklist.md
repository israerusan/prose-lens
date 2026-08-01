# Obsidian Release & Review Checklist

A pre-flight for shipping a new version of Prose Lens so it cleanly passes Obsidian's
automated review (and stays listed). A failed review can delist the plugin, and restoring it
is slow.

> The automated review runs [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin-obsidianmd)
> plus manifest/release validation. The highest-leverage safeguard is to run those same
> checks locally — which this repo does.

## 0. Local == the review bot

`npm run lint` runs `tsc --noEmit` then `eslint . --max-warnings 0` with
`eslint-plugin-obsidianmd`'s recommended config (see `eslint.config.mjs`). A warning can
still block review, so the gate is zero warnings. `test/manifest-contract.test.mjs` covers
the manifest checks eslint cannot lint (it cannot parse `manifest.json`).

**Known local-only failure:** `npm test` also runs `scripts/sync-shared.mjs --check`, which
reports DRIFT in `scripts/sync-shared.mjs` itself. That drift is pre-existing shared-repo
infrastructure, **not** a regression, and you must **not** run `npm run sync:shared` to
"fix" it — doing so vendors the wrong engine into this plugin. CI gates on `npm run build`
and `npm run test:ci`. Locally, run the three gates separately:

```bash
npm run lint      # must be clean
npm run test:ci   # unit tests without the sync check
npm run build     # produces main.js
```

## 1. Ship sequence (every release)

1. `npm run lint` — clean.
2. `npm run test:ci` — all tests pass.
3. `npm run build` — produces `main.js` (production, no inline sourcemap).
4. Bump the version in **both** `manifest.json` and `package.json`.
5. Add a `versions.json` entry: `"<version>": "<minAppVersion>"`.
6. Update `CHANGELOG.md` **and** its link-reference block at the bottom. (The 1.0.2 entry
   was missed entirely once; the store shipped a version the changelog did not mention,
   which reads as an abandoned project to exactly the audience this plugin is trying to win
   from abandoned projects.)
7. Commit → merge to `main`.
8. Tag it: `git tag <version>` where `<version>` **exactly equals** the manifest version (no
   `v` prefix).
9. `git push origin <version>` — push the **specific tag**. **Never** `git push --tags`.
10. `gh release create <version> main.js manifest.json styles.css versions.json`. Verify it
    published as Latest with those assets.

## 2. manifest.json

- `description`: must **not** contain "Obsidian" or "plugin"; sentence case, ends with a
  period. (The bot does a blunt case-insensitive substring check — no exceptions.)
- `name` / `id`: no "Obsidian", no "plugin"; `id` is lowercase-hyphenated and never changes.
- `version`: valid semver, equals the release tag, has a `versions.json` entry.
- `minAppVersion`, `author`, `authorUrl`: present and real. `isDesktopOnly`: accurate.

> **The manifest description IS the store listing.** The in-app browser searches the entry in
> `obsidianmd/obsidian-releases/community-plugins.json`, and a bot mirrors our manifest
> description into it after a release (appending a staff-review suffix). So the description is
> a search asset, not just repo metadata — treat a change to it as a deliberate act. The
> `author` field is the exception: it comes from the Obsidian developer account, not the
> manifest, and cannot be changed from here. Pull requests to that repo are disabled outright.
> See `docs/store-listing.md`.

## 3. Source code

- No `innerHTML` / `outerHTML` / `insertAdjacentHTML` — build DOM with `createEl` /
  `createDiv` / `setText`.
- No inline JS styles (`el.style.x = …`) — use a CSS class in `styles.css`. For values that
  are genuinely data (the rhythm bar's width), use `setCssProps`, **never** `setCssStyles`:
  `setCssStyles` is `Object.assign` onto a `CSSStyleDeclaration`, so a `--custom-prop` key
  lands as a JS expando and sets no CSS variable at all. That shipped once, and every rhythm
  bar silently rendered at 100%.
- No unnecessary type assertions; no `var`; no floating promises (`await` or `void`).
- Register listeners/commands so they're auto-released on unload. Delegate panel listeners
  from `contentEl` once — per-row `registerDomEvent` inside a render that runs on every
  keystroke leaks hundreds of listeners.
- **Never open a leaf during `onload`** — wrap it in `this.app.workspace.onLayoutReady()`.
- Use `this.app`, not a global `app`. `instanceof TFile` for file checks. `normalizePath()`
  on any user-supplied path.
- No default hotkeys. Minimal `console` output. Feature-detect Node APIs (mobile).
- Resolving the note the user is working in: `getMostRecentLeaf()`, **not**
  `getActiveViewOfType(MarkdownView)`. A sidebar leaf can be the active one — and is,
  whenever a click in our own panel is being handled.
- Deciding whether a note is still open: read the path from `leaf.getViewState()`, not
  `instanceof MarkdownView`. Since 1.7 a background tab holds a `DeferredView`.

## 4. Settings & commands

- No "General" heading; don't put the plugin name or "settings" in a heading.
- Setting and command names in sentence case; command names don't repeat the plugin name
  (Obsidian prefixes it).

## 5. Styling

- All CSS in `styles.css`; theme-safe via Obsidian CSS variables; viewport-safe sizing.
- Never distinguish anything by hue alone — `@media (forced-colors: active)` collapses every
  hue to one system colour. Marks carry a distinct `text-decoration-style` for this reason.

## 6. Privacy and monetisation

- No telemetry, no phone-home. License verification is fully offline.
- Pro surfaces live in the panel only: never a notice, never a modal on load, never an
  editor decoration. `hideProSections` must remove all of them. The free tier's published
  promise — no caps, no note limit, no session limit, no nag screen — is a real asset and is
  worth more than any single sale.

## Delisting recovery

1. Fix the exact flagged items.
2. Bump a patch version (+ `versions.json`, changelog).
3. Re-release via the ship sequence.
4. If a bad release exists: `gh release delete <bad> --cleanup-tag --yes` then
   `gh release edit <good> --latest`.
