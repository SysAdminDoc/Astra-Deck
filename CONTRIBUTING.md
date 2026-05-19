# Contributing to Astra Deck

Thanks for your interest in contributing to Astra Deck! This guide will help you get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. Use **Node 22+** (`.nvmrc` is included for `nvm use`)
4. Run `npm ci`
5. If you are testing the userscript build, install [Tampermonkey](https://www.tampermonkey.net/) (Chrome) or [Violentmonkey](https://violentmonkey.github.io/) (Firefox). Note: Chrome 138+ moved the "Allow User Scripts" toggle to a per-extension control; fresh Tampermonkey installs default OFF and must be enabled manually under `chrome://extensions` → Tampermonkey → Details

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

## Reporting Bugs

Use the [Bug Report template](https://github.com/SysAdminDoc/Astra-Deck/issues/new?template=bug_report.md) and include:
- Browser + version
- Userscript manager + version
- Astra Deck version
- Steps to reproduce
- Console errors (F12 > Console)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
