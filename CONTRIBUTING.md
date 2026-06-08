# Contributing to Astra Deck

Thanks for your interest in contributing to Astra Deck! This guide will help you get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. Use **Node 22+** (`.nvmrc` is included for `nvm use`)
4. Run `npm ci`
5. If you are testing the userscript build, install [Tampermonkey](https://www.tampermonkey.net/) (Chrome) or [Violentmonkey](https://violentmonkey.github.io/) (Firefox). Note: Chrome 138+ moved the "Allow User Scripts" toggle to a per-extension control; fresh Tampermonkey installs default OFF and must be enabled manually under `chrome://extensions` → Tampermonkey → Details

> **New contributor?** Start with [docs/architecture.md](docs/architecture.md) — it walks the four moving parts (MV3 extension, userscript, Astra Downloader, popup), end-to-end data flow on a watch page load and a download, where things live, the five trust boundaries, conventions, and a worked example of adding a CSS-only feature.

## Project Structure

```
Astra-Deck/
  extension/           # MV3 extension source
    core/              # Shared runtime utilities (env, storage, styles, url,
                       #   page, navigation, player)
    _locales/          # WebExtension i18n catalogues (10 bundled locales)
    ytkit.js           # Main feature/content-script runtime (ISOLATED world)
    ytkit-main.js      # MAIN-world bridge (codec filter, quality forcer)
    background.js      # Service worker (fetch proxy, downloads, broadcasts)
    popup.*            # Toolbar popup UI (only extension surface;
                       #   options.html / options.js retired in v3.19.0)
    manifest.json      # MV3 manifest
    default-settings.json  # Auto-generated catalogue (don't hand-edit)
    settings-meta.json     # Auto-generated SETTINGS_VERSION pin
  astra_downloader/    # Local Python/Flask + PyQt6 yt-dlp companion
  build-extension.js   # Canonical packager for Chrome/Firefox/userscript artifacts
  tests/               # Focused Node-based verification (npm test)
  scripts/             # check-versions, check-i18n, audit-storage,
                       #   audit-popup-a11y, check-contrast,
                       #   build-selector-fixtures, generate-locales,
                       #   extract-i18n-keys, custom ESLint rules
  YTKit.user.js        # Repo-tracked userscript source (legacy filename
                       #   preserved for stable @updateURL on existing
                       #   installs; built from extension/ytkit.js by
                       #   sync-userscript.js)
  YT_Reaction_Spammer.user.js  # Standalone live-chat reaction spammer
  theater-split.user.js        # Standalone theater split userscript
  CHANGELOG.md         # Public version history
  HARDENING.md         # Cumulative hardening audit log
  ROADMAP.md           # Working roadmap (Now / Next / Later)
```

## Architecture

The repo now ships both an MV3 extension and a userscript build. Most feature logic lives in `extension/ytkit.js` and follows the feature object pattern:

```javascript
{
    id: 'featureName',
    name: 'Human Readable Name',
    description: 'What this feature does',
    group: 'Category',        // Appearance, Playback, Interface, etc.
    icon: 'lucide-icon-name',
    init() { /* activate */ },
    destroy() { /* clean up */ }
}
```

### Key patterns:
- **CSS-only features**: Use `cssFeature()` factory
- **DOM observation**: Use `addMutationRule()` / `removeMutationRule()`
- **SPA navigation**: Use `addNavigateRule()` / `removeNavigateRule()`
- **Settings storage**: Use `StorageManager.get()` / `StorageManager.set()`
- **Extension packaging**: Use `build-extension.js` rather than ad-hoc zipping
- **Generated catalogs**: `default-settings.json` and `settings-meta.json` are generated from `ytkit.js`

## Adding a Feature

1. Define your feature object in the `features` array in `extension/ytkit.js`
2. Add a default value in `settingsManager.defaults`
3. Implement `init()` to activate and `destroy()` to fully clean up
4. Always remove event listeners, observers, and DOM elements in `destroy()`
5. Test with the feature toggled on/off multiple times

## Verification

Run these before sending changes:

```bash
npm test
npm run check
npm run build
```

For YouTube DOM drift or refreshed MHTML captures, follow
`docs/selector-fixture-workflow.md` before changing selector canaries.

### Windows / UNC checkouts

`npm run <script>` fails on a checkout served from a UNC path
(`\\host\share\...`, e.g. a mapped VMware/SMB share) with
*"CMD.EXE ... UNC paths are not supported. Defaulting to Windows directory."*
This is a `cmd.exe` limitation — it refuses any working directory on a UNC
path — and it affects every npm script, not just one. Two workarounds:

- **Map the share to a drive letter** and work from there
  (`net use Z: \\host\share`), or
- **Run the tools directly with Node/bash**, which handle UNC paths:
  ```bash
  node --test tests/*.test.js tests/features/*.test.js
  node ./node_modules/eslint/bin/eslint.js extension/background.js extension/popup.js extension/core/*.js extension/ytkit.js
  ```

Do not commit an `.npmrc` `script-shell` override to "fix" this — it would
force a shell that does not exist on other contributors' machines.

## Dev Scripts (Manual, Not in `npm run check`)

The `scripts/` directory holds two manual generators that are
intentionally not wired into `package.json` because they're run on
demand, not on every commit:

- **`scripts/_gen-schema.js`** — One-shot ROADMAP → settings-schema
  re-generator. Re-extracts the per-category schema embedded in
  `ROADMAP.md §Full Per-Toggle Settings Schema` and emits a draft
  `extension/core/settings-schema.js`. Used to re-validate the
  canonical schema against the ROADMAP narrative when either changes
  significantly. The repo's working source-of-truth is the existing
  `extension/core/settings-schema.js`; this script is the
  re-derivation path.
  - Run: `node scripts/_gen-schema.js`
  - When to run: after a meaningful ROADMAP schema-section edit, or
    when sanity-checking the schema after a large refactor.

- **`scripts/generate-locales.js`** — Translation-table → locale-file
  generator. Reads `extension/_locales/en/messages.json`, applies the
  inline per-locale translation tables embedded in the script, and
  writes `extension/_locales/<lang>/messages.json` for every non-EN
  locale (de, es, fr, it, ja, ko, pt_BR, ru, zh_CN). Brand names
  (Astra Deck, Astra Downloader, DeArrow, SponsorBlock, YouTube) and
  technical formats (MP4, M4A, VP9, AV1, H.264, TrustedTypes, ETA)
  are intentionally preserved as English.
  - Run: `node scripts/generate-locales.js`
  - When to run: after adding new EN strings to
    `_locales/en/messages.json` (extend the translation tables first,
    then re-run); reviewers should treat the generated locales as
    machine-authored and queue native-speaker proofing.

- **`npm run i18n:coverage` / `npm run i18n:coverage:warn`** — Locale
  proofing report. Refreshes `docs/i18n-coverage.md`, separates exact
  do-not-translate brand/technical matches from unresolved
  identical-to-EN placeholders, and lists the per-locale
  `feature_*_(name|desc)` proofing queue with sample keys.
  - Run: `npm run i18n:coverage`
  - Warning run: `npm run i18n:coverage:warn`
  - When to run: after any locale or feature-copy change. Native-speaker
    patches should update the locale's translation table, preserve exact
    reviewed brand/technical terms, run the generator, then refresh the
    coverage report.

- **`npm run i18n:proofing-export`** — Translator handoff export. Writes
  per-locale CSV files plus `index.json` under ignored `build/i18n-proofing/`
  with one row for each unresolved feature name/description placeholder.
  Translators fill `proposed_translation` and `notes`; accepted entries are
  then ported back into `scripts/generate-locales.js` or
  `extension/_locales/zh_CN/messages.json`. Formula-like CSV cells are
  neutralized before escaping so the generated files can be opened in
  spreadsheet tools for review.
  - Run: `npm run i18n:proofing-export`
  - Optional: `node scripts/export-i18n-proofing.js --locale de --output-dir <path>`

## Code Style

- Avoid new dependencies unless they solve a clear, high-value problem
- Use `cachedQuery()` for frequently accessed DOM elements
- Use `DebugManager.log()` for debug output
- Always clean up in `destroy()` -- no leaked listeners or DOM nodes
- Follow existing indentation (4 spaces)

## Submitting Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run `npm test`, `npm run check`, and `npm run build`
4. Test thoroughly on YouTube (watch page, home, search, channels)
5. Commit with a clear message
6. Push and open a Pull Request

## Security Reports

Do not use public issues for vulnerabilities, suspected signing-key exposure,
private logs, exploit chains, or credential material. Use the private reporting
path in [SECURITY.md](SECURITY.md) so the report can be triaged before public
disclosure.

## Reporting Bugs

Use the [Bug Report template](https://github.com/SysAdminDoc/Astra-Deck/issues/new?template=bug_report.md)
for non-sensitive bugs and include:
- Browser + version
- Userscript manager + version
- Astra Deck version
- Steps to reproduce
- Console errors (F12 > Console)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
