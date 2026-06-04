# Astra Deck — Architecture Map

This document orients a new contributor to the moving parts. It is descriptive (what is, today, at v4.46.0+), not prescriptive (which direction to push). Product-version sources (`package.json`, `extension/manifest.json`, `extension/ytkit.js`, `YTKit.user.js`, and `package-lock.json`) currently agree at v4.46.0. For where to push, see [ROADMAP.md](../ROADMAP.md) for the active backlog. Legacy v5/v6 labels in older docs are internal planning-track names, not shipped release versions; [RESEARCH_REPORT.md](../RESEARCH_REPORT.md) links the archived feature-plan sources.

## The four moving parts

1. **MV3 extension** — Chrome / Edge / Brave / Firefox 128+ — lives in `extension/`.
2. **Userscript** — `YTKit.user.js` at the repo root — Tampermonkey / Violentmonkey targets. Built from `extension/ytkit.js` by `sync-userscript.js`.
3. **Astra Downloader** (Python companion) — `astra_downloader/` — Flask + PyQt6 + yt-dlp + ffmpeg, packaged as `AstraDownloader.exe` via PyInstaller.
4. **Toolbar popup** — `extension/popup.html` + `popup.js` + `popup.css` — the *only* extension surface for settings management (the standalone options page was retired in v3.19.0).

These four pieces communicate exclusively through three trust boundaries:

- **Content script ↔ background service worker** — `chrome.runtime.sendMessage` (typed messages: `EXT_FETCH`, `DOWNLOAD_FILE`, `EXT_COOKIE_LIST`, `OPEN_URL`, `YTKIT_GET_SELECTOR_HEALTH`, `YTKIT_OPEN_PANEL`, `YTKIT_SETTING_CHANGED`, `YTKIT_SETTINGS_REPLACED`).
- **Extension ↔ Astra Downloader** — HTTP on `127.0.0.1:9751` (with five fallback ports 9761/9771/9781/9791/9851), bearer-token authenticated via `X-Auth-Token`, DNS-rebinding-defended via a Host header allowlist.
- **Extension ↔ YouTube DOM** — selector packs in `extension/core/selector-packs/` (28 surfaces + 2 aliases, capture-provenanced from `mhtml/*.mhtml`).

## End-to-end data flow

### Page load on a YouTube watch page

```
document_start
    early.css                Anti-FOUC CSS (scoped to body classes)
    ytkit-main.js            MAIN-world bridge — patches canPlayType for
                             codec/format filtering. Sole MAIN-world reach
                             into ytcfg / ytInitialPlayerResponse.

document_idle (ISOLATED world)
    core/*.js                Shared utilities — env, storage, styles,
                             registry, selector-packs/*, settings-schema,
                             feature-lifecycle, policy-profile, data-flow,
                             selector-health, toast, lifecycle-route-bridge.
    features/*/index.js      CSS-only feature peels — subtitles,
                             video-filters, blue-light-filter, theme-css,
                             wave-8-css, home-subs-css. Each calls
                             getLifecycle().defineFeature(spec).
    ytkit.js                 43k-line monolith — feature registry,
                             init/destroy lifecycle, conflict map,
                             observer coordinator, downloader integration.

background.js (MV3 service worker)
    Fetch proxy              EXT_FETCH messages with origin allowlist.
    Download bridge          DOWNLOAD_FILE → chrome.downloads.download.
    Reveal pruner            chrome.downloads.onChanged / onErased —
                             surfaces "Show in folder" exactly when
                             state=complete, mirrors pending ids into
                             chrome.storage.session for SW-restart survival.

Toolbar popup (on demand)
    popup.html               Hero card + storage stats + data-flow panel
                             + selector-health dashboard + quick toggles
                             + schema overview (all 362 keys editable).
    Bundles                  core/settings-schema.js, core/policy-profile.js,
                             core/data-flow.js, core/selector-health.js.
                             Communicates with content scripts via
                             chrome.tabs.sendMessage.
```

### A download request

```
User: right-click video → "Download" in YTKit Downloads context menu.
ytkit.js: ytKitDownload(url, audioOnly) →
  MediaDLManager.check()  ─── HTTP GET http://127.0.0.1:9751/health (X-MDL-Client: MediaDL)
                              Validates {service, api, token} response shape.
                              Caches result for 30s. Falls back through 5 ports.
  POST /download                 with X-Auth-Token bearer + {url, audio_only,
                              fmt, quality, output_dir, cookies}.
astra_downloader.py:
  Flask before_request           Host header allowlist (DNS-rebinding defense)
  /download handler              Rate-limit (30/min sliding window) →
                              path-confined output_dir → cookie jar at
                              .cookies.{dl_id}.txt (mode 0o600) →
                              DownloadManager.start_download.
  DownloadManager.start_download   spawn threading.Thread(_run_download).
  _run_download (thread)         build yt-dlp argv with format + quality +
                              PO-token provider + Deno-runtime + ffmpeg
                              location → subprocess.Popen → parse
                              MDLP_JSON / MDLP / [download] progress lines
                              from stdout → mark complete or failed →
                              cleanup cookie jar → write history entry.
ytkit.js (polling): GET /status/{dl_id} every 1s while progress<100.
ytkit.js: showDownloadProgress panel — pill with bar, speed, ETA.
```

### A selector miss

```
ytkit.js feature attempts findSurfaceElement('feedCard', root):
  → core/selectors.js + core/selector-packs/feedCard.js
  → returns null (selector pack stable[] + fallback[] all missed)
  → increments core/selectors.js missCount for that surface
  → bounded diagnostic ring buffer (core/diagnostic-log.js)
User opens the popup:
  → renderSelectorHealthDashboard() → chrome.tabs.sendMessage(YTKIT_GET_SELECTOR_HEALTH)
  → ytkit.js content-script handler reads getSelectorHealthSnapshot()
  → top 6 problem surfaces render in the popup
  → user clicks "Copy report" (v4.47.0)
  → copySelectorHealthReport() runs the same round-trip + bundles
     productVersion + browserUA + activeTab + ctx counts via the
     bundled core/selector-health.js formatSelectorCopyReport(),
     then navigator.clipboard.writeText().
```

## Where things live

| Concern | Lives in | Why |
|---------|----------|-----|
| Feature settings (default values) | `extension/core/settings-schema.js` + `extension/default-settings.json` (mirror, parity-gated by `scripts/check-settings.js`) | Single source of truth for 362 keys + their metadata |
| Feature definitions | `extension/ytkit.js` `features` array (~200 entries) | Each has `{id, name, description, group, icon, init, destroy, pages?, dependsOn?}` |
| CSS-only feature helpers | `extension/features/*/index.js` (6 modules, 21 ids) | Pure `buildCss(settings)` helpers; ytkit.js inline blocks delegate to them. Also call `getLifecycle().defineFeature` at module-eval (NF5 wave 1). |
| MAIN-world bridge | `extension/ytkit-main.js` | `canPlayType` patching for codec/format filtering; the only MAIN-world reach. Talks to ISOLATED via `data-ytkit-codec` attribute. |
| Background service worker | `extension/background.js` | Cross-origin fetch proxy (SSRF-defended allowlist); chrome.downloads bridge; cookie bridge; explicit error on unknown message type. |
| Toolbar popup UI | `extension/popup.html` + `popup.js` + `popup.css` | Hero card, storage stats, data-flow panel, selector-health dashboard + Copy report button, quick toggles, schema overview editing all 362 keys. |
| Selector resolution | `extension/core/selectors.js` + `extension/core/selector-packs/*.js` | 28 surfaces + 2 aliases, each with `stable[]` + `fallback[]` + `captureEvidence[]` + `lastVerified` + `highChurn` flag. |
| Lifecycle contract | `extension/core/feature-lifecycle.js` | `createLifecycle()` + `defineFeature` + `start` + `apply` + `destroy` + AbortController + monotonic route token. Singleton via `getLifecycle()`. |
| Policy profile (store-safe vs github-full) | `extension/core/policy-profile.js` | `createPolicyProfile()` resolves the effective profile, partitions schema entries, scrubs api-key-shaped values for export. |
| Predicate sandbox (BlockTube-DSL parity) | `extension/core/predicate-sandbox.js` | Option-C AST evaluator — no eval / Function / with / arbitrary method calls. ReDoS-guarded. |
| Transcript resolution | `extension/core/transcript-service.js` | 5-method failover: page player response → Innertube → watch HTML → caption regex → DOM panel scrape. |
| Storage layer | `extension/core/storage.js` (write debounce + beforeunload auto-flush) + `extension/core/storage-manager.js` (LRU caches for resumePlayback, perChannelSpeed, deArrowCache, etc.) | Sits on `chrome.storage.local`. Popup writes directly via `chrome.storage.local.set` (synchronous IPC); content script uses the debounced layer. |
| Diagnostic log | `extension/core/diagnostic-log.js` | Bounded ring buffer (500 entries). Hooks console.error + window.onerror for ytkit-tagged messages. `window.__ytkitDiagnostics.download()` exports JSON. |
| Runtime flags (internal) | `extension/core/runtime-flags.js` | Typed accessors for the three internal coordination primitives: `__ytkit_videoPopped` (popOutPlayer ↔ pipButton ↔ fullscreenOnDoubleClick), `__ytkit_cpu_tamer` (CPU Tamer re-entry guard), `__ytkit_debug` (Debug Mode marker). Storage stays on `window.__ytkit_*` for back-compat; the module owns the canonical read/write contract. `tests/hardening.test.js#NF12` pins that ytkit.js never writes the primitives directly. |
| Build pipeline | `build-extension.js` + `sync-userscript.js` + `scripts/manifest-patch.js` | Emits Chrome ZIP + CRX3, Firefox ZIP + XPI, userscript copy. CRX3 signed via `ytkit.pem` (gitignored). Firefox manifest auto-patched. |
| Astra Downloader companion | `astra_downloader/astra_downloader.py` (single file, ~4500 lines) | Flask API + PyQt6 GUI + yt-dlp + ffmpeg. Single-file PyInstaller .exe at `%LOCALAPPDATA%\AstraDownloader\`. |
| Test suites | `tests/*.test.js` (528 JS tests, `node --test`) + `astra_downloader/test_astra_downloader.py` (88 Python tests, pytest) | Hardening regressions, parity gates, selector regression, settings migration round-trip. |
| CI | `.github/workflows/build.yml` | `npm ci` → `npm test` + `npm run check` → tag check → `npm run build:userscript` → `gh release create`. |

## Trust boundaries (and what each is allowed to touch)

1. **MAIN world** (`ytkit-main.js`) — sees page globals (`movie_player`, `ytcfg`, `ytInitialPlayerResponse`). Cannot use `chrome.*` APIs. Communicates with ISOLATED via DOM attributes (`data-ytkit-codec`) and CustomEvent.
2. **ISOLATED world** (`ytkit.js` + `core/*.js` + `features/*/index.js`) — sees `chrome.*` APIs. Cannot reach page globals directly (uses regex scrape + Innertube fallback). DOM manipulation only via TrustedTypes wrappers in `core/trusted-html.js`.
3. **Service worker** (`background.js`) — does the cross-origin fetches the content script can't (due to YouTube's strict CSP). EXT_FETCH origin allowlist; cookies only forwarded to YouTube-family + 127.0.0.1 origins; Authorization only to OpenAI/Anthropic/Ollama/127.0.0.1 origins.
4. **Popup** — `chrome.storage.local` direct read/write; communicates with content scripts via `chrome.tabs.sendMessage`; never fetches external origins (Reddit / SponsorBlock / AI / etc. all route through background proxy). Bundles `core/settings-schema.js`, `core/policy-profile.js`, `core/data-flow.js`, `core/selector-health.js`.
5. **Astra Downloader** — `127.0.0.1` loopback only (literal IP, not `localhost` — DNS rebinding defense). Bearer-token auth (X-Auth-Token). Path-confined output directories (allowlist via DownloadPath / AudioDownloadPath / ExtraOutputRoots). Cookie jar files are per-download, mode 0o600, deleted on download exit. Request body ≤1 MB; response body ≤10 MB.

## Conventions a contributor should know

1. **No keyboard shortcuts.** The entire `commands` manifest block was retired in v4.5.3. Competitor shortcut features become visible buttons, wheel gestures, pointer modifiers, command-palette actions, or context menu items.
2. **No confirmation dialogs.** Destructive actions either apply immediately when reversible, or use undo toasts / soft-delete staging (see Reset → Undo Reset, v4.47.0 EI2).
3. **Dark / OLED only.** Never ship a light theme. popup.css and ytkit.js style injectors must honour `prefers-reduced-motion: reduce` (popup.css ships a universal `* { animation: none; transition: none; }` guard).
4. **Every feature has `init()` + `destroy()`.** `destroy()` must fully remove DOM, observers, listeners, timers, pending async work, body/html classes, injected styles, and storage listeners.
5. **TrustedTypes-safe DOM injection.** All `innerHTML`-shaped writes go through `core/trusted-html.js#setTrustedHTML` or DOM API construction. `el.innerHTML = ''` is also forbidden — use `el.textContent = ''`.
6. **Selector preference.** Stable selectors only: custom elements, IDs, roles, `aria-*`, `href`, structural CSS. Obfuscated / generated classes are `fallback[]` only. New feature code calls `findSurfaceElement(surface, root)`, never raw document-wide selectors.
7. **Catch blocks need `// reason:`.** v3.14.0 invariant: every empty `catch (_) {}` body must explain itself with a `// reason:` comment OR contain at least one executable statement (logger, return, anything). Enforced by `scripts/eslint-rules/require-catch-reason.js` on `background.js` today; wider rollout pending per-file annotation pass (see `ROADMAP.md` lint-surface widening).
8. **No `Co-Authored-By: Claude` trailer in commits.** Project enforces zero AI-attribution. Conventional version-prefix subjects.
9. **Schema parity.** Adding a new setting requires touching BOTH `core/settings-schema.js` (the truth) AND `default-settings.json` (the mirror). `scripts/check-settings.js` enforces parity on every `npm run check`. Tests in `tests/settings-migration-roundtrip.test.js` enforce that prior-schema-version exports round-trip cleanly into the current schema.
10. **Version drift.** `scripts/check-versions.js` enforces that all five sources (`package.json`, `extension/manifest.json`, `extension/ytkit.js#YTKIT_VERSION`, `YTKit.user.js#@version`, `package-lock.json`) carry the same version. Bumping is one command: `node build-extension.js --bump patch|minor|major`.

## How to add a CSS-only feature (worked example)

The cheapest feature to add is a CSS-only one — no JS observers, just a `<style>` element scoped to a body class that ytkit.js applies when the feature is enabled. Walkthrough using a hypothetical `hideSponsorReplyTag`:

1. **Schema entry** — add to `extension/core/settings-schema.js`:
   ```js
   Object.freeze({ key: "hideSponsorReplyTag", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "4.47.0" }),
   ```
2. **Mirror in defaults** — add `"hideSponsorReplyTag": false` at the matching position in `extension/default-settings.json`. Order matters — `scripts/check-settings.js` enforces insertion order parity.
3. **Feature definition** — add a `cssFeature(...)` entry to the `features` array in `extension/ytkit.js`:
   ```js
   cssFeature('hideSponsorReplyTag', 'Hide "Sponsor" reply tag', 'Removes the “Sponsor” badge on comment replies', 'Comments', 'tag',
       'ytd-comment-replies-renderer ytd-comment-view-model[author-is-sponsor] #author-text { display: none !important; }'),
   ```
4. **(Optional) Peel** — for reuse / testability, move the CSS into `extension/features/comments-css/index.js` exporting `buildHideSponsorReplyTagCss()`, then have ytkit.js delegate via the byte-identical fallback pattern.
5. **Hardening test** — add a regression to `tests/hardening.test.js` if the feature has a non-trivial selector or guard. For pure CSS strings, the existing parity tests cover it.
6. **Verify** — `npm test && npm run check && npm run build` — all green. Commit.

## How to add a feature that needs DOM observation

Same as the CSS-only path through step 2, then:

3. **Feature definition with init/destroy** — add a `{ id, name, description, group, icon, _styleElement: null, _observer: null, init() { ... }, destroy() { ... } }` entry. `init()` calls `addNavigateRule(...)` and `addMutationRule(...)` from the core helpers; stores observer/timer handles on `this._*`. `destroy()` calls `removeNavigateRule(...)`, `removeMutationRule(...)`, disconnects observers, clears timers.
4. **Selector pack** — if the feature targets a new surface, add a per-surface file under `extension/core/selector-packs/<surface>.js` with `stable[]`, `fallback[]`, `captureEvidence[]`, `lastVerified`. Register in `manifest.json` content_scripts (both ISOLATED + live_chat all_frames groups).
5. **Conflict map** — if the feature is mutually exclusive with another, add the pair to `CONFLICT_MAP` (`ytkit.js` ~line 4967). Symmetric pairs need both directions. See the cooperative-pair comment block below the map for examples of pairs that *look* like conflicts but were intentionally decoupled — don't re-add those.
6. **Hardening test** — pin the new selectors, observer setup, and destroy invariants in `tests/hardening.test.js`.

## Debugging primer

- **DevTools console (any YouTube tab):**
  - `ytkit.unsafe()` — exit safe mode (if you got there via `?ytkit=safe`).
  - `window.__ytkitDiagnostics.download()` — emit a JSON bug report with the diagnostic ring buffer, selector-health snapshot, and active feature list.
  - `window.__ytkitProfiles.export()` — export settings to JSON.
  - `window.__ytkitSearchTranscripts("query")` — search the local IndexedDB transcript index (requires `researchTranscriptIndex` setting).
- **Service worker DevTools (`chrome://extensions` → Astra Deck → "service worker"):**
  - All EXT_FETCH proxy calls log here. Sender validation rejections log explicitly.
- **Popup DevTools:**
  - Right-click the toolbar icon → Inspect popup. Live storage stats card; `chrome.storage.onChanged` listener active.
- **Astra Downloader logs:**
  - `%LOCALAPPDATA%\AstraDownloader\downloader.log` (rotates per launch).
  - `/health` endpoint returns yt-dlp version, ffmpeg version, PO-token provider status, Deno runtime status.
- **MHTML capture refresh** when YouTube DOM drifts:
  - Follow [docs/selector-fixture-workflow.md](selector-fixture-workflow.md) — capture new MHTML, run `npm run build:fixtures`, update selector-packs.

## Where to push next

See [ROADMAP.md](../ROADMAP.md) for the active backlog. The current residue is mostly browser-bounded capture expansion (shorts/search/channel/history/watch-later/embed/notifications), per-category lifecycle adoption, and the Subscription Manager v2 / Astra Downloader signing larger bets.
