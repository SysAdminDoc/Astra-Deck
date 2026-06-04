# Astra Deck Roadmap

Generated: 2026-05-21 (research pass 2 + autonomous v5.0.0 foundation sprint — supersedes the morning pass with full per-toggle settings schema, manifest-command audit, tightened architecture, and 6 shipped foundation slices v4.5.3 → v4.11.0)

This is the canonical roadmap and active backlog. Shipped work is summarized in
[COMPLETED.md](COMPLETED.md) and detailed in [CHANGELOG.md](CHANGELOG.md).
Research is summarized in [RESEARCH_REPORT.md](RESEARCH_REPORT.md), with the
pre-consolidation research plans archived under `docs/archive/research/`.

## Active Backlog

### Browser-Bounded Captures

- [x] **P0 / S — Capture live-chat MHTML fixtures (EI8)**: refresh the three
  live-chat selector packs and token fixture, then run
  `npm run build:fixtures && npm test`. _(Delivered 2026-06-04: committed
  `yt-live-chat.tokens.txt` from `mhtml/LiveChat.mhtml`; wrapper selectors were
  verified by rendered watch-page DOM probe because full watch-page MHTML
  capture timed out in headless Chrome.)_
- [ ] **P0 / S — Capture YouTube liquid-glass player chrome (HARDENING H21,
  EI9)**: refresh the watch-page fixture and promote liquid-glass selectors into
  the critical selector set.
- [ ] **P2 / M — MHTML capture-week expansion (EI15 + NF19)**: add fixtures and
  selector packs for Shorts, channel, search, history, watch-later, embedded
  player, and notifications surfaces.

### Polish And Parity

- [ ] **P2 / L — `stickyVideo` unify chat observer lifecycle (NF32)**: merge the
  duplicate chat watcher paths into one predictable init/destroy lifecycle.
- [ ] **P2 / M — `subscriptionGroups` per-group sort persistence (NF31)**: move
  sort mode from a global setting to per-group state.
- [ ] **P3 / M — `chatStyleComments` selector fallbacks (EI-NEW1)**: add
  `@supports(selector(...))` fallbacks for brittle CSS chains.
- [ ] **P3 / M — `hideVideosFromHome` channel-key cache (EI-NEW5)**: precompute
  blocked-channel lookup keys instead of scanning all records per card.
- [ ] **P3 / M — `selector-health` attribute-drift detection (EI-NEW6)**: expand
  selector health beyond miss counts to class/attribute churn.

### Lint And Lifecycle

- [ ] **P2 / M — `require-catch-reason` to `extension/core/*.js`** after the
  per-file catch annotation pass.
- [ ] **P3 / L — `require-catch-reason` to `ytkit.js`** after annotating the
  large monolith catch surface.
- [ ] **P2 / L — Wave 3 lifecycle full delegate**: move CSS injection ownership
  into peel modules and make `cssFeature` a thin lifecycle wrapper.
- [ ] **P2 / XL — Top-3 monolith peel**: split `stickyVideo`,
  `hideVideosFromHome`, and `chatStyleComments` into feature modules.
- [ ] **P2 / L — Next-2 monolith peel**: split `youtubeMusicCompat` and
  `floatingLogoOnWatch`.

### Companion, Subscriptions, And Research

- [ ] **P1 / L — Astra Downloader `/update` endpoint + popup action (NF6)**:
  provide a user-visible companion update path with semver compare, atomic
  replace, and restart.
- [ ] **P2 / L — Astra Downloader signed installer + MSI**: deferred until CWS
  submission intent and signing budget are decided.
- [ ] **P2 / L — Nested subscription groups (NF2)**: add depth-2 groups and
  JSON round-trip coverage.
- [ ] **P2 / L — Dead-channel detection + bulk unsubscribe staging**: flag stale
  channels and provide a 30-day undo window.
- [ ] **P3 / M — Group notifications digest panel**: show per-group new-video
  counts since last visit.
- [ ] **P2 / M — Per-video notes (`videoNotes`) (NF1)**: add notes schema/UI,
  export support, and a 1000-note LRU cap.
- [ ] **P3 / M — Study/work mode export to Markdown/CSV**.
- [ ] **P3 / M — i18n feature-definition labels out of `ytkit.js` (EI6)**.
- [ ] **P3 / M — Store-safe vs GitHub-full separate build artifacts**.

### Carried Risks And Questions

- R4: bound storage growth for `videoNotes`, `timestampBookmarks`, and
  `videoHistory`.
- R6: finish `policy-profile.js` scrub-regex coverage.
- R8: surface a Cobalt fallback unreachable diagnostic.
- G3: add a long-session memory leak test.
- Open decisions: downloader signing budget, CWS/AMO submission intent,
  dead-channel detection method, lifecycle migration cadence, live-chat capture
  window, and i18n coverage warning policy.

## Session log (2026-05-21 autonomous loop)

Six ships executed in sequence, each fully tested + built + pushed:

| Version | Slice | Tests | Δ |
|---|---|---:|---|
| v4.5.3 | Retire `commands` keyboard-shortcut surface (manifest, background, locales, Firefox patch, ytkit.js, CLAUDE.md, HARDENING.md) | 315 | (Open question resolved) |
| v4.6.0 | settings-schema single source of truth + `scripts/check-settings.js` + build wire + 10 regression tests | 325 | +10 |
| v4.7.0 | core/feature-lifecycle.js + core/policy-profile.js + manifest wire + 11 tests | 336 | +11 |
| v4.8.0 | core/selector-health.js + lifecycle singleton + 7 tests | 343 | +7 |
| v4.9.0 | core/lifecycle-route-bridge.js (navigation → lifecycle) + 4 tests | 347 | +4 |
| v4.10.0 | core/data-flow.js (origin catalogue) + 6 tests | 353 | +6 |
| v4.11.0 | schema↔data-flow coverage gate + Cobalt entry + PARENT_FEATURE map + 3 tests | 356 | +3 |
| v4.12.0 | popup data-flow panel UI (HTML + CSS + JS + 10-locale i18n + 7 tests) | 363 | +7 |
| v4.13.0 | First feature peel — `features/subtitles/buildSubtitleCss()` + 6 tests | 369 | +6 |
| v4.14.0 | Toast helpers peeled into `core/toast.js` (+ `getToastAriaDefaults`) + 6 tests | 375 | +6 |
| v4.15.0 | Privacy quick-toggles in popup (new `Privacy` group, padlock glyph) + 4 tests | 379 | +4 |
| v4.16.0 | Schema-driven risk badges on popup toggle rows (api / local-companion / experimental / store-risk) + 4 tests | 383 | +4 |
| v4.17.0 | Second feature peel — `features/video-filters/buildVideoFilterCss()` + isIdentity + clamping + 6 tests | 389 | +6 |
| v4.18.0 | Third feature peel — `features/blue-light-filter/buildBlueLightRgba()` + OVERLAY_FIXED_CSS + 5 tests | 394 | +5 |
| v4.19.0 | Bundled theme-css peel (customProgressBarColor + customSelectionColor + grayscaleThumbnails) + 7 tests | 401 | +7 |
| v4.20.0 | Userscript bundle of 11 v5.0.0 core modules via `sync-userscript.js` + 5 tests | 406 | +5 |
| v4.21.0 | theme-css extends (+forceDarkEverywhere, +themeAccentColor) + 5 tests | 411 | +5 |
| v4.22.0 | theme-css extends (+compactUnfixedHeader, +hideVideoEndContent) + 5 tests | 416 | +5 |
| v4.23.0 | Schema-driven category overview in popup (collapsible, reactive) + 5 tests | 421 | +5 |
| v4.24.0 | Interactive expansion + per-key boolean editing in popup overview + 5 tests | 426 | +5 |
| v4.25.0 | Schema-overview search wired through the existing `#q` filter + 5 tests | 431 | +5 |
| v4.26.0 | Number-type inline editor in schema overview + 4 tests | 435 | +4 |
| v4.27.0 | String-type inline editor (text + auto color picker for hex defaults) + 5 tests | 440 | +5 |
| v4.28.0 | `humanizeSettingKey()` helper + popup label upgrade + 6 tests | 446 | +6 |
| v4.29.0 | Persist popup overview expansion across opens + 5 tests | 451 | +5 |
| v4.30.0 | Documentation tag — v5.0.0 foundation arc closed (no code change) | 451 | 0 |
| v4.31.0 | v5.1.0 #1 — versioned selector-pack file split (batch 1: appShell, nav+masthead, search, leftNav) + 7 tests | 458 | +7 |
| v4.32.0 | v5.1.0 #2 — selector-pack batch 2 (feed-shell: feed, feedCard, thumbnail, shortsShelf) + 4 tests | 462 | +4 |
| v4.33.0 | v5.1.0 #3 — selector-pack batch 3 (watch-shell: watch, relatedSidebar, player, mainVideo) + 4 tests | 466 | +4 |
| v4.34.0 | v5.1.0 #4 — selector-pack batch 4 (player-chrome + sidebar + modals: playerChrome, playerSettings, sidebar, modals) + 4 tests | 470 | +4 |
| v4.35.0 | v5.1.0 #5 — selector-pack batch 5 (engagement: comments, commentComposer, engagementPanels) + 4 tests | 474 | +4 |
| v4.36.0 | v5.1.0 #6 — selector-pack batch 6 (misc: settingsOverlay, profile+channelProfile, notifications, media) + 5 tests | 479 | +5 |
| v4.37.0 | v5.1.0 #7 — selector-pack migration COMPLETE (final batch: live-chat trio); INLINE_SURFACES is now `{}` + 5 tests | 484 | +5 |
| v4.38.0 | feature peel — wave-8 CSS-only quintet (hideNotificationButton, noFrostedGlass, hideLatestPosts, disableMiniPlayer, nyanCatProgressBar) → `features/wave-8-css/` + 5 tests | 489 | +5 |
| v4.39.0 | profile-badge integration — github-full-gated rows show a badge in the schema overview; cached policy-profile resolver + 5 tests | 494 | +5 |
| v4.40.0 | labelKey/descriptionKey override fields on schema entries — 4 brand-name overrides (Cobalt × 2, AI summary × 2); popup row builder consults overrides first + 4 tests | 498 | +4 |
| v4.41.0 | array / object JSON editors in the schema overview — textarea + parse-error pill; covers the final 14 schema keys (popup editor now 354/354) + 6 tests | 504 | +6 |
| v4.42.0 | DOM-layer toast extraction → `core/toast-dom.js` exposes `createToastSystem({ deps })`; ytkit.js delegates via cached system, inline body remains as byte-identical fallback + 6 tests | 510 | +6 |
| v4.43.0 | feature peel batch 2 — 6 Home / Subs CSS-only features (hideCreateButton, hideVoiceSearch, widenSearchBar, disablePlayOnHover, fullWidthSubscriptions, hideSubscriptionOptions) → `features/home-subs-css/` + 5 tests | 515 | +5 |
| v4.44.0 | Documentation tag — v5.1.0 carry-forward arc closed (5 of 8 items `[x]`, 3 of 8 `[~]` with v5.2.0+ scope; no code change) | 515 | 0 |

Net: 7 new `extension/core/` modules, 4 feature carve-outs covering 10 monolith feature blocks, popup ships per-key editors for boolean + number + string (text or color) types covering ≈340 of 354 schema keys with humanised English labels and persisted category-expansion state, 1 popup `Privacy` quick-toggle group, schema-driven risk badges on every applicable toggle row, userscript bundles the v5.0.0 core surface, +136 hardening tests (315 → 451), **26 versions shipped (v4.5.3 → v4.30.0)**, every `npm run check` + `npm test` + `node build-extension.js` pipeline green. Open question (Ctrl+Shift+Y) resolved. **v5.0.0 foundation arc effectively complete.**

Carry-forward for the next session (v5.1.0+ work — v5.0.0 foundation is now sound enough to start any of these in isolation):

1. **Versioned selector packs** — [x] migration COMPLETE in 7 batches (v4.31.0–v4.37.0). All 28 surfaces (+ 2 aliases) now live in their own `extension/core/selector-packs/<surface>.js` file with `captureEvidence` + `lastVerified`. `INLINE_SURFACES` is `{}`. The live-chat trio was refreshed on 2026-06-04 with `mhtml/LiveChat.mhtml`, committed `yt-live-chat.tokens.txt` coverage, and watch-wrapper DOM probe evidence.
2. **Continue feature peels (long tail)** — [~] +11 peels this session (v4.38.0 wave-8 CSS quintet → `features/wave-8-css/`; v4.43.0 home-subs CSS sextet → `features/home-subs-css/`). Total peeled: 21 of ~200 monolith blocks. v5.2.0+ scope: continue batch-by-batch (next likely batches are wave-10 alchemy CSS, watch-page CSS, and comments CSS clusters). DOM-walking observers are blocked on slice #3 and remain v5.2.0+ work.
3. **Per-feature lifecycle adoption** — [~] deferred to v5.2.0+ as a multi-slice initiative. Adopting the v4.7.0 `feature-lifecycle.js` contract per category changes feature-internal init/destroy semantics and needs paired DOM-walking peels + visible-behaviour QA per category — not safe to land mechanically in a single session. The contract + route-token + AbortController machinery shipped in v4.7.0–v4.9.0 remain ready for adoption when category owners are available.
4. **DOM-layer toast extraction** — [x] shipped in v4.42.0. `extension/core/toast-dom.js` exports `createToastSystem({ zIndex, inferToastTone, getToastRgb, getToastBadgeLabel })` → `{ showToast, dismissToast }`. ytkit.js delegates via a cached system instance; the existing inline body remains as the byte-identical fallback for the userscript / module-unavailable path. The unified live-region overlay primitive (announcement role coordination across toast + a11y live region) remains a v5.2.0+ refinement.
5. **Array / object editors in the popup** — [x] shipped in v4.41.0. `buildSchemaOverviewKeyRow` renders a `<textarea.so-key-json>` for array + object entries pre-populated via `JSON.stringify(value, null, 2)`; commit happens on change/blur via `JSON.parse`. Parse failures stamp a `.so-key-json-error` pill and skip persistence; array→object / object→array shape flips are rejected up-front. Popup editor coverage is now **354/354 keys**. Per-key custom UIs (multi-select for `hiddenChatElements` etc.) remain a v5.2.0+ follow-up.
6. **i18n translation pass** — [~] deferred to v5.2.0+ as a localisation sweep. The 13 placeholder keys still ship English-everywhere across all 10 locales (the existing `t()` helper falls through to the inline English string when a locale key is missing, so the user-visible behaviour stays correct). Shipping machine translations would risk bad localisations across all 10 locale bundles without verification. A focused locale-by-locale sweep with native-speaker review is the right path; the infrastructure is ready.
7. **Profile-badge integration in the schema overview** — [x] shipped in v4.39.0. `buildSchemaOverviewKeyRow` consults a cached `createPolicyProfile()` instance and renders a `.so-key-profile-badge.so-key-profile-gated` chip on github-full-gated entries when the effective profile is store-safe. The badge sits at the house-style 4 px backdrop radius with an amber informational tone.
8. **`labelKey` / `descriptionKey` override fields on schema entries** — [x] shipped in v4.40.0. Optional `labelKey` + `descriptionKey` string fields on any schema entry; the popup row builder consults `entry.labelKey` (trim/non-empty guarded) first and falls back to the v4.28.0 humaniser. Initial overrides: `downloadCobaltFallback`, `downloadCobaltInstance`, `aiSummaryEndpoint`, `aiSummaryProvider`. Paired-i18n keys remain a v5.2.0+ follow-up.

Target site: YouTube desktop web (`www.youtube.com`, `youtube-nocookie.com`, `youtu.be`), live-chat iframe (`*.youtube.com/live_chat*`), `i.ytimg.com` thumbnail origin. YouTube Music is opt-in only via `youtubeMusicCompat`. Excluded by design: `m.youtube.com`, `studio.youtube.com`.
Current repo version observed: Astra Deck v4.5.2 (`extension/manifest.json` and `extension/ytkit.js` `YTKIT_VERSION`).
Planning track: Astra Deck v5.0.0 through v6.0.0.
Deliverable for this run: planning only. No feature code was written. README is deferred to the implementation release per repo rules.

Source-of-truth inputs for this pass:

- `extension/default-settings.json` — 354 keys (273 boolean, 44 string, 22 number, 7 object, 6 array, 2 null) extracted live.
- `extension/manifest.json` — MV3 v4.5.2, 4 permissions, 17 host-permission origins, MAIN+ISOLATED dual-world content-script layout, dedicated all-frame live-chat injection.
- `extension/core/*.js` — runtime modules (registry, selectors, navigation, api-limiter, trusted-html, predicate-sandbox, transcript-service, storage-manager, diagnostic-log, etc.) already implementing several Phase-3 contracts.
- `mhtml/WatchPage.mhtml`, `mhtml/YouTube.mhtml`, `Subscriptions - YouTube.mhtml`, `Worldwide Societal Collapse... - YouTube.mhtml` — four captures, 16 MIME parts decoded.
- `CHANGELOG.md` (3024 lines), `CLAUDE.md` (901 lines), `HARDENING.md` (audit history), `docs/research/iter-{1,5,8}-*.md` (prior factory-loop sources).
- `tests/` 19 spec files (unit, hardening, parity, selector regression, settings migration round-trip).

## Project Overview

Astra Deck is a premium, privacy-first YouTube power-user layer for people who want one tool to replace a stack of YouTube enhancers, focus blockers, downloader helpers, transcript tools, playback controllers, UI themes, and research workflows.

One-line pitch: Astra Deck turns YouTube into a controlled, dark, dense, searchable, automatable media workstation while preserving a single-file userscript path and a store-ready MV3 extension path.

Chosen vehicle: both MV3 extension and single-file userscript.

- MV3 extension is required for `chrome.downloads`, background fetch proxying, safe cross-origin API calls, `chrome.storage`, store distribution, toolbar UI, optional declarative blocking, cookie-assisted local downloader handoff, and long-running background coordination.
- Userscript is required for single-file portability, Tampermonkey/Violentmonkey users, easier MAIN-world access, self-hosted/GitHub distribution, rapid breakage hotfixes, and bypassing store-review delays when YouTube ships DOM changes.
- Build rule: maintain one source catalog and produce two synchronized artifacts. Extension code can remain modular; userscript output must remain readable, single-file, non-minified, and parity-tested.

Version convention:

- Existing product versioning remains `Astra Deck vX.Y.Z`.
- The superset roadmap begins at `v5.0.0` because the repo is already at `v4.5.2`; a greenfield `ProjectName v0.0.1` convention is not applicable to this existing release line.
- Each phase below has explicit acceptance criteria and can ship independently.

House style for every shipped UI:

- Premium paid-software look only: deep dark and OLED palettes, glass surfaces, subtle shimmer, hover lift, spring easing, staggered entrances, branded accent, custom scrollbar, dense mode.
- Never ship a light theme.
- Do not add keyboard shortcuts. Competitor shortcut features must become visible buttons, wheel gestures, pointer controls, command-palette actions, menu items, or context actions.
- Do not use confirmation dialogs. Dangerous or destructive actions should apply immediately only when reversible; otherwise use undo toasts, soft-delete staging, disabled states, or an explicit visible action surface.
- Every feature module must expose `init()` and `destroy()`; `destroy()` must fully remove DOM, observers, listeners, timers, pending async work, body/html classes, injected style tags, and storage listeners.
- Settings overlays must use `pointer-events: none` while inactive and must not trap focus when hidden.
- CSS must scope to Astra-owned classes on `html`/`body` and `data-ytkit-*` nodes.
- On YouTube and other Trusted Types enforcing pages, all HTML injection must go through DOM APIs or the existing Trusted Types policy wrapper.
- Selectors must prefer custom elements, IDs, roles, `aria-*`, `href`, and structure. Obfuscated or generated classes are fallbacks only.
- Runtime observers must process added nodes only; no full-document scan per mutation.

## Phase 0: Local Repo Ingest

### Repo State Summary

Observed checkout: `C:\Users\--\repos\Astra-Deck`.

The repo is an existing production-grade YouTube extension/userscript project, not a scaffold. It already includes:

- Chrome/Firefox MV3 extension under `extension/`.
- Single-file userscript outputs in `YTKit.user.js` and historical archive builds.
- MAIN-world bridge (`extension/ytkit-main.js`) and isolated-world content runtime (`extension/ytkit.js`).
- Early anti-FOUC CSS (`extension/early.css`).
- Background service worker fetch/download proxy (`extension/background.js`).
- Local companion downloader (`astra_downloader/`) with PyQt/Flask/yt-dlp integration.
- Popup/settings UI (`extension/popup.*`).
- Locale bundles for 10 locales.
- Core modules for navigation, selectors, storage, styles, Trusted Types, API limiting, diagnostics, transcript service, predicate sandboxing, icons, page/player helpers, and URL/video-type utilities.
- Tests and audits for background behavior, core modules, SponsorBlock, DeArrow, theater split, userscript parity, storage size, settings migration, syntax, contrast, a11y, and repo paths.

Observed current default settings count: 354 keys. The current `extension/default-settings.json` is a flat object with no per-key category metadata. The roadmap therefore treats settings taxonomy as a first-class v5 task.

Already built or partially built:

- SponsorBlock integration with category toggles, cache fallback, and stale async invalidation.
- DeArrow title/thumbnail replacement, cache caps, channel overrides, and original-title peek controls.
- Return YouTube Dislike API fetch surface and card/watch ratio display settings.
- Transcript service with 5-method failover: page player response, Innertube player endpoint, watch HTML fetch, caption regex, and DOM panel scrape.
- Local downloader companion, local history/health panels, stream links panel, Cobalt fallback settings, format/quality defaults, and thumbnail/subtitle/screenshot download settings.
- Large content-filtering surface: Shorts removal/redirect, hidden videos, duration/view filters, watched-ratio filters, mixes/playlists/live/upcoming filters, keyword/channel/comment filters, advanced local predicate settings.
- UI and player polish: OLED/dense/classic/new-player restore settings, watch page tabs, theater split, player controls hiding, video zoom/rotation/filters, PiP, sleep timer, A/B loop, custom speed buttons, progress bar controls.
- Research and productivity settings: AI summaries, local AI summary, transcript AI handoff, research transcript index/search, spaced review, watch history analytics, subscription groups.
- Safety and diagnostics: safe/full feature profiles, privacy data-flow panel, diagnostic log, API retry/backoff, storage quota LRU, low-power profile, reduced-motion/forced-colors/a11y live-region settings.

Missing or needing a deeper build pass:

- Formal settings metadata categories for all 354 keys.
- Runtime selector health dashboard that promotes MHTML fixture failures into user-visible diagnostics.
- Self-healing selector resolver with versioned selector packs and capture provenance.
- Full competitive feature parity validation against UnTrap, Enhancer for YouTube, Improve YouTube, YouTube Alchemy, YouTube Tweaks, Tweaks for YouTube, Unhook, BlockTube, PocketTube, SponsorBlock, DeArrow, Return YouTube Dislike, and Video Speed Controller.
- Explicit store-safe vs GitHub/full-power packaging profiles with separate permission manifests and user-visible privacy copy.
- Full subscription manager parity with PocketTube: nested groups, AI tags, dead-channel detection, group notifications, bulk unsubscribe, import/export.
- Full study/work mode parity with YouFocus/UnTrap: mode history, per-video notes, focus timers, schedules, opening delays, and clean local export.
- Comprehensive live-chat capture/fixtures for chat iframe internals.
- Fresh capture for YouTube's new/Delhi/liquid-glass player chrome in all A/B variants.
- README deliverable for the v5 product after implementation. This run only updates `ROADMAP.md`.

### Full Repo Tree

Source-controlled product tree plus local capture artifacts:

```text
Astra-Deck/
  .github/
    ISSUE_TEMPLATE/
      bug_report.md
      feature_request.md
    dependabot.yml
    pull_request_template.md
    workflows/
      build.yml
  .gitignore
  .nvmrc
  AGENTS.md
  AstraDownloader.ico
  CHANGELOG.md
  CLAUDE.md
  CONTRIBUTING.md
  HARDENING.md
  LICENSE
  README.md
  ROADMAP.md
  YTKit.user.js
  YT_Reaction_Spammer.user.js
  archive/
    YTKit-v0.1.0.user.js
    YTKit-v0.2.0.user.js
    YTKit-v0.3.0.user.js
    YTKit-v0.4.0.user.js
    YTKit-v0.5.0.user.js
    YTKit-v0.6.0.user.js
    YTKit-v0.7.0.user.js
    YTKit-v0.8.0.user.js
    YTKit-v1.0.0.user.js
    YTKit-v1.1.0.user.js
    YTKit-v1.2.0.user.js
    YTKit-v1.2.1.user.js
    YTKit-v1.3.0.user.js
    YTKit-v2.0.0.user.js
    YTKit-v2.1.0.user.js
  assets/
    cat.gif
    starfall.gif
    ytlogo.png
  astra_downloader/
    astra_downloader.py
    build.py
    requirements.txt
    test_astra_downloader.py
  build-extension.js
  docs/
    cws-submission-checklist.md
    predicate-sandbox-investigation.md
    screen-reader-smoke.md
    selector-fixture-workflow.md
    signing-keys.md
  eslint.config.js
  extension/
    _locales/
      de/messages.json
      en/messages.json
      es/messages.json
      fr/messages.json
      it/messages.json
      ja/messages.json
      ko/messages.json
      pt_BR/messages.json
      ru/messages.json
      zh_CN/messages.json
    background.js
    core/
      api-limiter.js
      diagnostic-log.js
      env.js
      icons.js
      navigation.js
      page.js
      player.js
      predicate-sandbox.js
      registry.js
      selectors.js
      storage-manager.js
      storage.js
      styles.js
      transcript-service.js
      trusted-html.js
      url.js
      video-type.js
    default-settings.json
    early.css
    icons/
      128.png
      16.png
      32.png
      48.png
      brand-glyph.svg
      brand-wordmark-dark.svg
      brand-wordmark-light.svg
    manifest.json
    popup.css
    popup.html
    popup.js
    settings-meta.json
    ytkit-main.js
    ytkit.js
  logo.png
  mhtml/
    WatchPage.mhtml
    YouTube.mhtml
  package-lock.json
  package.json
  pytest.ini
  scripts/
    audit-popup-a11y.js
    audit-storage-size.js
    build-selector-fixtures.js
    catalog-utils.js
    check-contrast.js
    check-i18n.js
    check-syntax.js
    check-versions.js
    eslint-rules/
      no-post-await-addlistener.js
    extract-i18n-keys.js
    generate-locales.js
    manifest-patch.js
    repo-paths.js
  sync-userscript.js
  tests/
    background.test.js
    bugfix-validation.test.js
    catalog-utils.test.js
    core-foundation.test.js
    core-icons.test.js
    core-page-url.test.js
    core-storage-manager.test.js
    core-transcript-service.test.js
    features/
      dearrow.test.js
      sponsorblock.test.js
      theater-split.test.js
    fixtures/
      settings-import-roundtrip.json
      yt-home.tokens.txt
      yt-watch.tokens.txt
    hardening.test.js
    helpers/
      source.js
    repo-paths.test.js
    selector-regression.test.js
    settings-migration-roundtrip.test.js
    storage-size-audit.test.js
    userscript-parity.test.js
  theater-split.user.js
  Subscriptions - YouTube.mhtml
  Worldwide Societal Collapse... - YouTube.mhtml
```

Generated or dependency trees such as `.git/`, `node_modules/`, build outputs, PyInstaller output, caches, and editor state are not planning inputs and are excluded from this roadmap tree.

### MHTML Capture Ground Truth

All four local captures were treated as the DOM ground truth for current YouTube surfaces. The captures are MIME snapshots containing quoted-printable/base64 encoded HTML and CSS parts. The local parse pass decoded MIME bodies, extracted HTML/CSS documents, counted surface tags, and scanned for script/API state.

| Capture | Date observed | Approx size | Extracted parts | Surfaces present | Key notes |
|---|---:|---:|---|---|---|
| `mhtml/WatchPage.mhtml` | 2026-04-23 | 5.39 MB | 3 HTML, 75 CSS | watch, player, feed cards, comments, sidebar, nav, modals, settings, media, profile, notifications | Strong watch-page baseline with Polymer/Kevlar custom elements. |
| `mhtml/YouTube.mhtml` | 2026-04-23 | 5.40 MB | 3 HTML, 70 CSS | home feed, cards, sidebar, nav, modals, settings, media, profile, notifications | Home-grid baseline; no comment composer. |
| `Subscriptions - YouTube.mhtml` | 2026-05-19 | 5.71 MB | 3 HTML, 70 CSS | subscriptions feed, guide/sidebar, nav, feed cards, media, profile | Subscription-specific grouping/sorting baseline. |
| `Worldwide Societal Collapse... - YouTube.mhtml` | 2026-05-19 | 5.27 MB | 3 HTML, 76 CSS | watch, player, comments, related sidebar, engagement panels, media | Newer watch capture; useful for player/comment churn. |

Script/API scan result:

- The saved MHTML files did not preserve usable `ytInitialData`, `ytInitialPlayerResponse`, `ytcfg`, GraphQL query IDs, or Innertube request payloads as inline script state. Treat them as DOM/CSS ground truth, not API-state dumps.
- No GraphQL endpoint was observed. YouTube's relevant internal API surface is Innertube JSON, not GraphQL.
- CSP/Trusted Types are handled in the repo via `extension/core/trusted-html.js`; the roadmap must keep all injection behind DOM APIs or that wrapper.
- SPA signals are YouTube Polymer/Kevlar custom elements, `yt-navigate-finish`, `yt-page-data-updated`, `popstate`, `window.navigation` fallback, and `ytd-watch-flexy[video-id]` attribute mutation.

### Selector Map

Every key surface has a stable selector strategy and a fragile fallback. Stable selectors are the only selectors that should be used in new feature code unless they fail and diagnostic logs prove a fallback is necessary.

| Surface | Stable selector strategy | Fragile fallback/watchlist | Churn risk | Notes |
|---|---|---|---|---|
| App shell | `ytd-app`, `ytd-page-manager` | `body > ytd-app`, `ytd-page-manager.style-scope` | medium | Mount broad observers here only until scoped targets exist. |
| Masthead/nav | `ytd-masthead`, `#masthead-container`, `#masthead` | `ytd-masthead div.style-scope`, obfuscated topbar button wrappers | high | Header A/B churn affects buttons and search wrappers. |
| Search | `yt-searchbox`, `input#search`, `form[role="search"] input` | `yt-searchbox-input`, `ytd-searchbox #container.ytd-searchbox`, `ytSearchboxComponent*` | high | Prefer role/input over generated component classes. |
| Left guide/sidebar | `ytd-guide-renderer`, `ytd-mini-guide-renderer`, `yt-app-drawer`, `#guide` | `ytd-guide-entry-renderer.style-scope`, `ytd-mini-guide-entry-renderer.style-scope` | high | Home often has mini guide; subscriptions capture has full guide. |
| Feed root | `ytd-browse ytd-rich-grid-renderer`, `ytd-rich-grid-renderer`, `#contents` scoped below feed | `#contents.ytd-rich-grid-renderer`, `ytd-rich-grid-renderer.style-scope` | high | Filter chips recycle content without route events. |
| Feed card/post | `ytd-rich-item-renderer`, `yt-lockup-view-model`, `ytd-video-renderer` | `yt-lockup-view-model.ytd-rich-item-renderer`, `ytd-rich-item-renderer.style-scope` | high | New lockup view models appear in captures; process per-card roots. |
| Thumbnail/media card | `ytd-thumbnail`, `yt-thumbnail-view-model`, `a#thumbnail` | `ytThumbnailViewModelHost`, `ytd-thumbnail a#thumbnail` | high | Resolve from nearest card root. Do not query global thumbnails repeatedly. |
| Shorts | `a[href^="/shorts"]`, `ytd-rich-shelf-renderer` | `yt-thumbnail-overlay-badge-view-model`, `ytd-reel-shelf-renderer` | high | URL path is the stable signal. |
| Watch page | `ytd-watch-flexy[video-id]`, `ytd-watch-flexy`, `ytd-watch-metadata`, `#below` | `ytd-watch-metadata.watch-active-metadata`, `ytd-watch-flexy[flexy]` | high | `video-id` is best route state. |
| Player | `#movie_player`, `.html5-video-player` | `ytd-player #movie_player`, `#player-container #movie_player` | high | MAIN bridge required for page globals. |
| Main video | `video.html5-main-video`, `#movie_player video` | `video.video-stream`, `.html5-video-container video` | medium | Always scoped to current player. |
| Player chrome | `.ytp-chrome-bottom`, `.ytp-right-controls`, `.ytp-progress-bar` | `.ytp-delhi-modern`, `.ytp-overflow-panel`, `.ytp-action-pill`, `.ytp-actions-container` | very high | New player/liquid-glass/Delhi UI needs fresh captures. |
| Player settings | `.ytp-settings-button`, `.ytp-panel`, `.ytp-menuitem` | `.ytp-popup`, `.ytp-panel-menu`, `.ytp-overflow-panel` | high | Prefer player APIs where available; avoid forced menu opening. |
| Related sidebar | `#secondary ytd-watch-next-secondary-results-renderer`, `ytd-watch-next-secondary-results-renderer` | `#related`, `ytd-watch-next-secondary-results-renderer.style-scope` | high | Resolve section root before modifying compact cards. |
| Comments | `ytd-comments`, `ytd-comment-thread-renderer`, `ytd-comment-view-model` | `ytd-comment-thread-renderer.style-scope`, `ytd-comment-renderer` | high | Keep old/new comment shapes in selector packs. |
| Comment composer | `ytd-comment-simplebox-renderer`, `ytd-commentbox`, `#contenteditable-root` | `ytd-comment-simplebox-renderer #placeholder-area`, `ytd-comments ... div.style-scope` | high | Must preserve accessibility and native editor behavior. |
| Engagement panels | `ytd-engagement-panel-section-list-renderer`, `#panels ytd-engagement-panel-section-list-renderer` | `ytd-engagement-panel-title-header-renderer`, `*.style-scope` | high | Transcript, chapters, clips, AI summary live here. |
| Modals/popups | `tp-yt-paper-dialog`, `ytd-popup-container tp-yt-paper-dialog`, `tp-yt-iron-dropdown` | `.ytp-popup`, `.ytd-popup-container`, style-scope wrappers | high | Use inert/focus-safe overlay handling. |
| Astra settings overlay | `[data-ytkit-surface="control-center"]`, `.ytkit-control-center`, `#ytkit-panel` | `.ytkit-panel`, `.ytkit-modal` | low | Astra-owned nodes must be removable by `destroy()`. |
| Channel/profile | `ytd-video-owner-renderer`, `ytd-channel-name`, `#channel-name`, `ytd-c4-tabbed-header-renderer`, `ytd-page-header-renderer` | `yt-avatar-shape`, `yt-decorated-avatar-view-model` | high | Resolve channel IDs/handles from links, never visible text alone. |
| Notifications | `ytd-notification-topbar-button-renderer`, `yt-icon-badge-shape`, `ytd-notification-renderer` | badge-shape generated classes, multi-page-menu wrappers | high | Wait for popup menu root before sorting. |
| Live chat frame | `ytd-live-chat-frame#chat`, `ytd-live-chat-frame`, `iframe#chatframe` | `#chat.ytd-live-chat-frame`, `ytd-live-chat-frame iframe` | very high | Needs dedicated live-stream capture before major work. |
| Live chat iframe DOM | `yt-live-chat-app`, `yt-live-chat-renderer`, `yt-live-chat-item-list-renderer` | `yt-live-chat-text-message-renderer`, `yt-live-chat-message-input-renderer` | very high | Requires all-frame content script and iframe-specific fixtures. |

### CSS Token Catalog

The captures expose YouTube token families that Astra should hook instead of fighting with raw colors:

- Color and surface: `--yt-spec-*`, `--premium-yt-spec-*`, `--yt-saturated-*`, `--yt-light-wash-*`, text/icon/background token families.
- Player spacing/chrome: `--ytd-watch-flexy-space-below-player`, `--yt-delhi-pill-height`, `--yt-delhi-bottom-controls-height`, `--yt-frosted-glass-backdrop-filter-override`.
- Controls and radii: `--yt-button-icon-size`, `--yt-img-border-radius`, avatar and thumbnail radius tokens.
- Live chat: `--yt-live-chat-*` token family for item backgrounds, author colors, timestamps, badges, borders, and input surfaces.
- Text/link: `--yt-attributed-string-link-hover-color` and related attributed string tokens.
- Scrollbar/chrome: YouTube custom scrollbar tokens plus native overlay-scrollbar interaction.

Theme strategy:

- Build a `tokenThemeBridge` that maps YouTube tokens into Astra semantic variables: `--ad-bg`, `--ad-panel`, `--ad-elevated`, `--ad-text`, `--ad-muted`, `--ad-border`, `--ad-accent`, `--ad-danger`, `--ad-warning`, `--ad-success`, `--ad-radius`, `--ad-z-overlay`.
- Override tokens only when a feature class is active, for example `html.ytkit-oled html[dark]`, `html.ytkit-dense`, and `html.ytkit-classic-layout`.
- Preserve YouTube's native forced-colors and reduced-motion affordances.

## Phase 1: Competitive Landscape

Research date: 2026-05-21.

External data is volatile. User counts and update dates below are point-in-time observations from Chrome Web Store, AMO, official sites, Greasy Fork/OpenUserJS, GitHub, and community threads. Store counts are rounded by stores.

### Ranked Competitor Baselines

| Rank | Tool | Author/publisher | Platform | Popularity/recency observed | Feature count | What it does best | Source |
|---:|---|---|---|---|---:|---|---|
| 1 | Return YouTube Dislike | Dmitry Selivanov / Anarios community | Chrome, Firefox, userscript, Edge | Chrome: 6M users, 19.7K ratings, v4.0.4, updated 2026-05-02. AMO: 920,031 users but official Firefox build last updated 2024-10-17. GitHub: 13,591 stars, updated 2026-05-21. | focused | Dislike restoration via archived/sampled data and ratio UI. | https://chromewebstore.google.com/detail/return-youtube-dislike/gebbhagfogifgggkldgodflihgfeippi ; https://addons.mozilla.org/en-US/firefox/addon/return-youtube-dislikes/ ; https://github.com/Anarios/return-youtube-dislike |
| 2 | Video Speed Controller | igrigorik | Chrome, general HTML5 media | Chrome: 3M users, 4.4K ratings, v0.10.2, updated 2026-04-15. | focused | Universal speed overlay, fine increments, per-site rules, 0.07x-16x range. | https://chromewebstore.google.com/detail/video-speed-controller/nffaoalbilbmmfgbnbgppjihopabppdk |
| 3 | SponsorBlock | Ajay Ramachandran / community | Chrome, Firefox, Safari, userscript-compatible ports | Chrome: 2M users, 3.4K ratings, v6.1.5, updated 2026-04-21. AMO: 741,003 users. GitHub: 13,230 stars, updated 2026-05-21. | focused | Crowdsourced segment skipping, categories, submissions/voting, public DB. | https://chromewebstore.google.com/detail/sponsorblock-for-youtube/mnjggcdmjocbbbhaepdhchncahnbgone ; https://addons.mozilla.org/en-US/firefox/addon/sponsorblock/ ; https://github.com/ajayyy/SponsorBlock |
| 4 | Enhancer for YouTube | Maxime RF | Chrome, Edge, Firefox | Chrome: 1M users, 17.3K ratings, v3.0.17, updated 2026-03-14. AMO: 510,589 users, v2.0.133.1, updated 2026-04-07. Edge: about 560K users from Edge search. | broad | Playback, quality, volume boost, themes, cinema/mini/popout, distractions, Shorts. | https://chromewebstore.google.com/detail/enhancer-for-youtube/ponfpcnoihfmfllpaingbgckeeldkhle ; https://addons.mozilla.org/en-US/firefox/addon/enhancer-for-youtube/ ; https://www.mrfdev.com/enhancer-for-youtube |
| 5 | Unhook | Unhook | Chrome, Firefox, Edge | Chrome: 1M users, 4.2K ratings, v1.6.9, updated 2026-03-21. Official site claims 500K+ active users but store currently shows 1M. | 20+ | Simple distraction removal with a tiny private permission footprint. | https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid ; https://unhookextension.com/ |
| 6 | Improve YouTube | Code for Charity | Chrome, GitHub | Chrome: 400K users, 7.1K ratings, v4.2026, updated 2026-03-23. GitHub: 4,379 stars, updated 2026-05-21. | 250+ | Huge open-source settings catalog, multilingual, playback/layout/content controls. | https://chromewebstore.google.com/detail/improve-youtube-%F0%9F%8E%A7-for-yo/bnomihfieiccainjcjblhegjgglakjdd ; https://github.com/code-charity/youtube |
| 7 | PocketTube | NabokD | Chrome, Firefox, Edge, Opera, Safari, mobile | Official site: 300K+ users. GitHub: 334 stars, updated 2026-05-21. | subscription-focused | Subscription groups/tags, personal group feeds, sort/filter, dead-channel detection, group notifications. | https://pockettube.io/ ; https://github.com/NabokD/pockettube |
| 8 | UnTrap for YouTube | UnTrap | Chrome, Firefox, Edge, Safari, Opera | Chrome: 100K users, 490 ratings, described as 250+ features. | 250+ | All-in-one focus/customization plus AI summaries, parental controls, schedules, password-protected settings. | https://chromewebstore.google.com/detail/untrap-for-youtube/enboaomnljigfhfjfoalacienlhjlfil ; https://untrap.app/ ; https://addons.mozilla.org/firefox/addon/untrap-for-youtube/ |
| 9 | DeArrow | Ajay / SponsorBlock ecosystem | Chrome, Firefox | Chrome: 100K users, 303 ratings, v2.3.6, updated 2026-04-23. AMO: 32,224 users. GitHub: 2,144 stars, updated 2026-05-21. | focused | Crowdsourced descriptive titles/thumbnails with fallback title formatting and random timestamp thumbnails. | https://chromewebstore.google.com/detail/dearrow-better-titles-and/enamippconapkdmgfgjchkhakpfinmaj ; https://addons.mozilla.org/en-US/firefox/addon/dearrow/ ; https://github.com/ajayyy/DeArrow |
| 10 | BlockTube | amitbl | Firefox, Chrome/Edge/Opera/Brave | AMO: 30,243 users, v0.4.8, updated 2026-02-07. GitHub: 1,351 stars, updated 2026-05-21. | filtering-focused | Block channels/videos/comments by name, keyword, regex, duration, and custom JS predicate. | https://addons.mozilla.org/en-US/firefox/addon/blocktube/ ; https://github.com/amitbl/blocktube |
| 11 | DF Tube New | focusapps | Chrome | Chrome: 20K users, v1.21.2, updated 2026-05-21. | focus-focused | Hide recommendations/home grid/comments/playlists/Shorts and disable autoplay. | https://chromewebstore.google.com/detail/df-tube-new-distraction-f/kchgllkpfcggmdaoopkhlkbcokngahlg |
| 12 | YouTube Tweaks | Pedro | Firefox, Chrome, Edge | AMO: 15K users, 260 reviews, v2026.5.18, updated 2026-05-18. | 80+ | Grid sizing, hiding, per-channel speed, comments sidebar, quality, wheel controls, anti-autodub. | https://addons.mozilla.org/en-US/firefox/addon/youtube-tweaks/ |
| 13 | Tweaks for YouTube | InzkDev | Firefox, Chrome, Edge | AMO: 8,386 users, v3.89.0, updated 2026-05-15. | 100+ | Mouse-wheel/button control, audio processing, player controls, subtitle styling, YouTube Music/Drive support. | https://addons.mozilla.org/en-CA/firefox/addon/tweaks-for-youtube/ |
| 14 | YouTube Alchemy | Tim Macy | Userscript, Chrome, Firefox, Edge | Greasy Fork: 1,845 installs, v10.13, updated 2026-05-07. AMO: v10.13, updated 2026-05-07. GitHub: 86 stars, updated 2026-05-19. | 200+ | Native-feeling tab view, transcript export, header links, color-coded videos, dense UI settings. | https://greasyfork.org/en/scripts/521686-youtube-alchemy ; https://github.com/TimMacy/YouTubeAlchemy ; https://addons.mozilla.org/en-CA/firefox/addon/youtube-alchemy/ |
| 15 | YouTube HD | adisib | OpenUserJS userscript | 33,716 installs, version 2025.04.13+e9cf6ae, updated 2025-04. | focused | Auto quality 144p-8K, player resize, auto theater, no interval loop. | https://openuserjs.org/scripts/adisib/Youtube_HD |
| 16 | TubeMod | Pedro Gregorio | Chrome, Firefox | Official site claims 50+ options; open-source/free. | 50+ | Lightweight interface hiding/tweaking with import/export. | https://tubemod.dev/ |
| 17 | YouFocus | YouFocus | Chrome | Official site, 2025 product. | focused | Study/work modes, local time tracking, focused history, video notes, channel blocking. | https://youfocus.site/ |
| 18 | Scripts.YT | Robert Wesner | Userscripts and small extensions | Active script hub. | small focused scripts | Play-all restoration, timestamp persistence, shadow-comment checks. | https://scripts.yt/ |
| 19 | Tweeks | NextByte | AI-generated website modifications | Official site: 25K+ people, 4K+ public tweeks, 59 YouTube tweeks. | platform | Natural-language userscript generation and sharing. | https://www.tweeks.io/ |
| 20 | Userstyles/Stylus YouTube themes | Various | Stylus/UserCSS | Counts vary by hub. | CSS-only | OLED/dark/compact/old-layout patches and element hiding with minimal JS risk. | https://userstyles.world/ ; https://greasyfork.org/en/scripts/by-site/youtube.com?language=css |
| 21 | Iridium for YouTube | iridiumio | Chrome, Edge, Firefox | CWS listing active (noted in docs/research/iter-8-sources.md, added 2026-05-20). Closed-source. | broad | Codec/quality controls, player polish, ad/sponsor handling; overlaps Astra's qualityProfileMatrix + forceH264 surface. | https://chromewebstore.google.com/detail/iridium-for-youtube/ |
| 22 | Control Panel for YouTube | Jasper de Groot | Chrome, Firefox | CWS listing noted in iter-8-sources (2026-05-20); deeper feature scoring pending. | broad | UI-tweaks + control panel for layout / Shorts / channels; presumed quality/UI control. | (CWS listing per iter-8-sources.md) |

### Community and Issue Findings

High-value feature-request and breakage themes:

- YouTube UI churn repeatedly breaks player/control/sidebar/comment integrations. Open issues in Improve YouTube, SponsorBlock, RYD, BlockTube, and DeArrow show new player UI, dislike button changes, hidden items returning, scrolled-away ratio bars, and DOM changes breaking thumbnail menus.
- Users want comments/chapters/transcript in sidebars and tabs, not buried below the player. Improve YouTube issues include comments-in-sidebar refresh regression and chapters-in-sidebar requests.
- Content filters need route-specific exceptions. BlockTube issues request subscriptions-page improvements, disable blocking on channel pages/tabs, likes field in advanced blocking, and search case-insensitivity.
- Anti-autodub and auto-translation controls are recurring requests. YouTube Tweaks and BlockTube both expose or request anti-autodub/title-translation behavior.
- Store review delays matter. RYD community threads note userscript updates can land faster than official add-on store updates.
- Focus-mode demand is strong. Recent Reddit threads and YouFocus/UnTrap show users asking for active maintenance, clean study/work modes, timers, notes, and distraction-free defaults.
- Security trust matters. 2026 malicious-extension reporting repeatedly names fake YouTube/TikTok enhancer categories as an attack vector, so Astra must make privacy boundaries, source transparency, permissions, and remote-code avoidance visible.

## Phase 2: Feature Catalog and Gap Analysis

### Abbreviations

Matrix columns:

- AD: Astra Deck current repo
- EYT: Enhancer for YouTube
- IYT: Improve YouTube
- UT: UnTrap
- UH: Unhook
- BT: BlockTube
- PT: PocketTube
- SB: SponsorBlock
- DA: DeArrow
- RYD: Return YouTube Dislike
- YTA: YouTube Alchemy
- YTT: YouTube Tweaks
- TFY: Tweaks for YouTube
- VSC: Video Speed Controller
- US: userscripts/userstyles/smaller tools

Legend: `Y` means present or clearly claimed; `P` means partial; `-` means not a primary feature; `N/A` means the competitor is focused elsewhere.

### Feature Matrix

| Category | Feature | AD | EYT | IYT | UT | UH | BT | PT | SB | DA | RYD | YTA | YTT | TFY | VSC | US | Best implementation note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Theming/UI | OLED/deep dark theme | Y | Y | Y | Y | - | - | - | - | - | - | Y | P | P | - | Y | Astra should keep OLED only and map YouTube tokens natively. |
| Theming/UI | Custom theme/token bridge | P | Y | Y | P | - | - | - | - | - | - | Y | - | custom CSS | - | userstyles | Improve YouTube has mature theme breadth; Astra should add semantic tokens. |
| Theming/UI | Dense/compact layout | Y | P | Y | Y | P | - | - | - | - | - | Y | Y | P | - | Y | YouTube Alchemy has native-feeling compact tab layout. |
| Theming/UI | Classic/old layout restoration | P | P | Y | P | - | - | - | - | - | - | Y | P | - | - | Y | Userstyles and Redux-style tools fill nostalgia gaps but are brittle. |
| Theming/UI | Square thumbnails/avatars/search | Y | P | Y | P | - | - | - | - | - | - | Y | Y | - | - | Y | Astra already has keys; must unify with theme profile. |
| Theming/UI | Custom scrollbar | Y | - | P | P | - | - | - | - | - | - | P | - | P | - | Y | Keep minimal and high-contrast. |
| Theming/UI | Hide frosted glass/new player glass | Y | P | P | P | - | - | - | - | - | - | Y | P | - | - | Y | Current YouTube player UI needs fresh capture. |
| Theming/UI | Watch tabs for info/comments/videos/transcript | Y | - | P | - | - | - | - | - | - | - | Y | - | Y | - | Y | YouTube Alchemy tab view is the benchmark. |
| Theming/UI | Comments in sidebar | P | P | P | - | - | - | - | - | - | - | Y | Y | Y | - | Y | Must survive refresh and route changes. |
| Content filtering | Hide Shorts everywhere | Y | Y | Y | Y | Y | Y | - | - | - | - | Y | Y | Y | - | Y | Use URL/path + shelf selectors. |
| Content filtering | Redirect Shorts to regular video | Y | Y | P | Y | - | - | - | - | - | - | Y | P | - | - | Y | Must preserve timestamp/share links. |
| Content filtering | Hide home feed | Y | P | Y | Y | Y | - | - | - | - | - | P | P | P | - | Y | Unhook's simple toggle is best UX. |
| Content filtering | Hide related/sidebar | Y | Y | Y | Y | Y | - | - | - | - | - | Y | P | Y | - | Y | Must be route-scoped and reversible. |
| Content filtering | Hide comments/live chat | Y | Y | Y | Y | Y | Y | - | - | - | - | Y | Y | Y | - | Y | Must not break comment loading or composer. |
| Content filtering | Keyword/video title blocking | Y | - | Y | Y | - | Y | - | - | - | - | P | P | P | - | Y | BlockTube is baseline; Astra should add safe predicate DSL. |
| Content filtering | Channel blocking | Y | - | P | Y | - | Y | - | - | - | - | P | P | - | - | Y | Include quick block buttons and import/export. |
| Content filtering | Comment author/keyword blocking | Y | - | P | Y | - | Y | - | - | - | - | - | P | - | - | Y | Needs emoji/case/locale-safe matching. |
| Content filtering | Regex filters | P | - | P | Y | - | Y | - | - | - | - | - | P | - | - | Y | Use sandboxed regex budget and circuit breaker. |
| Content filtering | Advanced predicate filters | P | - | - | - | - | Y | - | - | - | - | - | - | - | - | - | BlockTube's JS predicate is powerful but unsafe; Astra DSL must be safer. |
| Content filtering | Hide watched videos by progress | Y | - | P | Y | - | Y | P | - | - | - | Y | Y | Y | - | Y | Astra should combine native progress, local history, and user overrides. |
| Content filtering | Duration/view-count filters | Y | - | P | Y | - | Y | Y | - | - | - | P | Y | P | - | Y | PocketTube leads subscription sorting/filtering. |
| Content filtering | Hide mixes/playlists/movies/upcoming/live | Y | P | Y | Y | Y | Y | P | - | - | - | Y | Y | Y | - | Y | Keep per-route exceptions. |
| Content filtering | Hide autoplay/auto-generated playlists | Y | Y | P | P | Y | Y | - | - | - | - | Y | Y | Y | - | Y | BlockTube issues show this often regresses. |
| Content filtering | Anti auto-dub/translated titles | Y | P | P | P | - | requested | - | - | - | - | Y | Y | - | - | Y | Make title/audio/transcript separate toggles. |
| Playback | Default video quality | Y | Y | Y | P | - | - | - | - | - | - | Y | Y | Y | - | Y | YouTube HD and Enhancer are baselines. |
| Playback | Quality matrix by normal/theater/fullscreen/embed/background | Y | P | P | - | - | - | - | - | - | - | P | P | Y | - | - | Astra should own this as a premium differentiator. |
| Playback | Force H.264/codec/FPS | Y | Y | Y | - | - | - | - | - | - | - | P | - | P | - | Y | MAIN bridge required. |
| Playback | Speed defaults | Y | Y | Y | P | - | - | - | - | - | - | Y | Y | Y | Y | Y | VSC range/per-site model is best. |
| Playback | Per-channel speed | Y | P | P | - | - | - | - | - | - | - | - | Y | - | - | - | YouTube Tweaks is baseline. |
| Playback | Mouse wheel speed/volume/seek | Y | Y | P | - | - | - | - | - | - | - | P | Y | Y | P | Y | Must avoid adding keyboard shortcuts. |
| Playback | Volume boost/audio filters/mono/high-pass | P | Y | P | - | - | - | - | - | - | - | - | Y | Y | - | Y | Tweaks for YouTube is baseline. |
| Playback | A/B loop | Y | Y | P | - | - | - | - | - | - | - | - | P | P | - | Y | Provide visible controls and timeline handles. |
| Playback | Sleep timer | Y | P | P | - | - | - | - | - | - | - | - | - | - | - | Y | Add status/undo toast. |
| Playback | Pause other tabs | Y | Y | P | - | - | - | - | - | - | - | - | Y | P | - | Y | Needs BroadcastChannel/storage event arbitration. |
| Playback | Auto-dismiss "Still watching" | Y | P | Y | P | - | Y | - | - | - | - | - | Y | P | - | Y | Must stay store-policy safe. |
| Playback | Disable autoplay/playlist autoplay | Y | Y | Y | Y | Y | Y | - | - | - | - | Y | Y | Y | - | Y | Visible setting and status indicator. |
| Player UI | Cinema/theater/full-window mode | Y | Y | Y | Y | - | - | - | - | - | - | Y | Y | Y | - | Y | Enhancer/Alchemy are key baselines. |
| Player UI | Sticky/mini/popout player | Y | Y | Y | P | - | - | - | - | - | - | P | Y | Y | - | Y | Must preserve scroll and accessibility. |
| Player UI | PiP button | Y | Y | Y | P | - | - | - | - | - | - | Y | P | Y | - | Y | Use native PiP API. |
| Player UI | Screenshot/snapshot | Y | Y | Y | P | - | - | - | - | - | - | P | Y | Y | - | Y | Include format, subtitles, and filename template. |
| Player UI | Frame-by-frame controls | Y | P | P | - | - | - | - | - | - | - | - | - | Y | P | Y | Visible buttons only. |
| Player UI | Persistent progress bar/chapters | Y | P | Y | P | - | - | - | SB marks | - | - | Y | Y | Y | - | Y | Alchemy with SponsorBlock chapter markers is baseline. |
| Player UI | Custom progress bar color/Nyan progress | Y | P | Y | - | - | - | - | - | - | - | Y | Y | - | - | Y | Keep themeable and opt-in. |
| Media/downloads | Local yt-dlp downloader | Y | - | - | P | - | - | - | - | - | - | - | - | P | - | Y | Astra's local companion is differentiator. |
| Media/downloads | Direct stream links | Y | - | - | P | - | - | - | - | - | - | - | - | Y | - | Y | Must be clear about reliability and policy. |
| Media/downloads | Thumbnail download | Y | - | P | P | - | - | - | - | DA thumbs | - | - | P | Y | - | Y | Include max-res fallback chain. |
| Media/downloads | Subtitle/transcript download | Y | - | P | Y | - | - | - | - | - | - | Y | P | Y | - | Y | Alchemy transcript exporter is benchmark. |
| Sponsor/quality | SponsorBlock skips | Y | - | P | P | - | - | - | Y | - | - | Y | - | - | - | Y | SponsorBlock official behavior is baseline. |
| Sponsor/quality | SponsorBlock submissions/voting | P | - | - | - | - | - | - | Y | - | - | - | - | - | - | - | Add only if API/reputation semantics are implemented safely. |
| Sponsor/quality | DeArrow titles/thumbs | Y | - | P | P | - | - | - | - | Y | - | - | - | - | - | Y | Official DeArrow is baseline. |
| Sponsor/quality | Return dislikes/ratio | Y | - | P | P | - | - | - | - | - | Y | - | - | - | - | Y | RYD official API and caveat copy is baseline. |
| Subscriptions | Subscription groups | P | - | - | P | - | - | Y | - | - | - | - | - | - | - | Y | PocketTube is baseline. |
| Subscriptions | Group feed/filter/sort | P | - | - | P | - | - | Y | - | - | - | - | P | - | - | Y | Need local IndexedDB + YouTube page fetch fallback. |
| Subscriptions | Dead-channel detection | - | - | - | - | - | - | Y | - | - | - | - | - | - | - | - | Add a cautious local-only implementation. |
| Subscriptions | New since last visit | Y | - | - | P | - | - | Y | - | - | - | Y | - | - | - | Y | Store local last-seen per channel/group. |
| Navigation | Logo to subscriptions | Y | - | Y | P | - | - | - | - | - | - | Y | Y | - | - | Y | Already present; should be profile-aware. |
| Navigation | Restore Play All | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | Scripts.YT YTPA is baseline. |
| Navigation | Quick links/header links | Y | - | P | - | - | - | - | - | - | - | Y | - | - | - | Y | Alchemy supports up to 10 header links. |
| Navigation | Open in alternative frontend | Y | - | P | - | - | alt requested | - | SB supports Invidious | DA partial | - | - | - | - | - | Y | Should be explicit opt-in and per-instance. |
| Privacy | Clean share URLs | Y | - | P | P | - | - | - | - | - | - | P | - | - | - | Y | `YTShareAntiTrack` proves demand. |
| Privacy | Local-only/no tracking | Y | claimed | claimed | mixed AI | claimed | claimed | claimed | public user ID | server API | server API | claimed | claimed | claimed | claimed | varies | Split store-safe local profile from API-enabled profile. |
| Privacy | Data-flow panel | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Make this visible and exportable. |
| Privacy | Password-protected settings | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | Only implement as local UI lock, not real crypto security. |
| Accessibility | Reduced motion | Y | P | P | P | - | - | - | - | - | - | - | - | - | - | userstyles | Required for premium polish. |
| Accessibility | Forced colors/high contrast | Y | - | P | - | - | - | - | - | - | - | - | - | - | - | userstyles | Keep semantic tokens and contrast audit. |
| Accessibility | Screen-reader status region | Y | - | P | - | - | - | - | - | - | - | - | - | - | - | - | All toasts/actions announce through one live region. |
| Accessibility | Subtitle styling | Y | - | P | - | - | - | - | - | - | - | - | - | Y | - | Y | TFY is baseline for subtitle controls. |
| Research/AI | AI summary | Y | - | - | Y | - | - | - | - | - | - | P | - | - | - | Y | UnTrap/Rovetify set expectation; Astra must be BYO-key/local-first. |
| Research/AI | Transcript index/search | Y | - | - | P | - | - | - | - | - | - | Y | - | - | - | Y | Use IndexedDB and explicit retention controls. |
| Research/AI | Transcript handoff to ChatGPT/NotebookLM/etc. | Y | - | - | P | - | - | - | - | - | - | Y | - | - | - | Y | Alchemy's header buttons are benchmark. |
| Research/AI | Per-video notes | - | - | - | P | - | - | - | - | - | - | - | - | - | - | Y | YouFocus and community scripts show demand. |
| Research/AI | Study/work modes and time tracking | P | - | - | Y | - | - | - | - | - | - | - | - | - | - | Y | YouFocus is baseline; add local export. |
| Live chat | Premium live chat layout | Y | - | P | P | Y hide | - | - | - | - | - | P | P | - | - | Y | Needs fresh iframe captures. |
| Live chat | Chat keyword/reaction controls | Y | - | - | - | - | comment filters | - | - | - | - | - | - | - | - | Y | Keep spammy automation off by default. |
| Developer/DX | Feature registry lifecycle | P | - | Y | - | - | - | - | - | - | - | P | - | - | - | - | Every feature must be reversible and testable. |
| Developer/DX | MHTML selector fixtures | P | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Make captures first-class fixture inputs. |
| Developer/DX | Store-safe/full profiles | P | - | - | P | - | - | - | - | - | - | - | - | - | - | - | Critical due extension-store security climate. |

### Gap Analysis

High-value gaps Astra can own:

- Selector intelligence: competitors fix DOM churn reactively. Astra should ship a runtime selector resolver that records misses, falls back through versioned selector packs, exposes a health panel, and points maintainers to stale MHTML fixtures.
- Permission transparency: many YouTube enhancers are now judged against malicious-extension risk. Astra should ship an explicit data-flow panel, store-safe manifest, and full-power GitHub build with clear permission deltas.
- Full subscription workstation: PocketTube dominates subscription grouping, but Astra can combine groups with filters, DeArrow/RYD/SponsorBlock metadata, local notes, watch-later cleanup, dead-channel detection, and AI tag suggestions.
- Research workspace: Alchemy has transcript export; UnTrap/Rovetify have AI summaries; YouFocus has notes/time tracking. Astra should unify transcripts, notes, summaries, spaced review, quote clipping, Markdown export, and local search.
- Safe predicate engine: BlockTube's custom JS is powerful but risky. Astra should build an audited expression DSL with budgets, dry-run preview, rule explanations, import/export, and route-specific exceptions.
- Player chrome resilience: YouTube's new player UI breaks the category. Astra should build a player chrome adapter with old/new selector packs and capture-backed tests.
- Live chat quality: few competitors deeply polish live chat. Astra should own live chat readability, moderation filters, sticky/side-by-side layouts, archive export, and low-latency performance.
- Accessibility as a differentiator: most competitors treat a11y as incidental. Astra should make reduced motion, forced colors, live regions, focus trapping, contrast, and pointer-target sizes part of release gates.
- Local media pipeline: downloader competitors are often sketchy or policy-sensitive. Astra already has a local companion; make it safer, clearer, and more reliable than direct in-extension download claims.

Final scope: the v6 charter is the union of competitor features above plus these gaps, constrained by privacy, store policy, performance, and maintainability.

## Phase 3: Technical Reconnaissance

### Selector Strategy

Implement selector handling as a versioned selector pack:

```js
{
  surface: "feedCard",
  stable: ["ytd-rich-item-renderer", "yt-lockup-view-model", "ytd-video-renderer"],
  fallback: ["yt-lockup-view-model.ytd-rich-item-renderer", "ytd-rich-item-renderer.style-scope"],
  captureEvidence: ["mhtml/YouTube.mhtml", "Subscriptions - YouTube.mhtml"],
  highChurn: true,
  ownerFeatureIds: ["hideVideosKeywordFilter", "deArrow", "returnDislikeOnCards"]
}
```

Rules:

- New feature code calls `findSurfaceElement(surface, root)` or `findSurfaceElements(surface, root)`, never raw document-wide selectors.
- High-churn surfaces use `waitForElement` with bounded backoff and a short timeout.
- Observers process only `addedNodes` and then scope down to nearest feature root.
- Every selector miss increments bounded diagnostics keyed by `surface::selector`.
- Selector packs include capture provenance and last verified date.
- Tests fail if a stable selector disappears from all current fixtures and no fallback matches.

### SPA Handling

Existing good signals to keep:

- `yt-navigate-finish`
- `yt-page-data-updated`
- `popstate`
- `window.navigation` `navigate` event as feature-detected fallback
- `ytd-watch-flexy[video-id]` mutation observer

Feature lifecycle model:

- `document_start`: anti-FOUC classes, theme variables, Trusted Types policy setup, MAIN bridge registration.
- `document_idle`: settings load, registry init, current-route processing.
- Once per session: storage migrations, locale load, background bridge handshake, diagnostics setup, API limiter setup.
- Once per route: watch metadata, player controls, transcript/chapters/comments panels, related sidebar, subscription feed transforms.
- Per added node: feed cards, thumbnails, comments, notifications, live-chat messages.
- Per media element: playback rate, quality, codec, volume, subtitles, PiP/screenshot controls.

Observer constraints:

- One global coordinator per document.
- One scoped observer per high-churn surface only when a feature is enabled.
- Never perform a full `document.querySelectorAll` for every mutation.
- Batch work in `requestAnimationFrame` or `requestIdleCallback` with fallback timeout.
- Disconnect all observers in feature `destroy()`.

### APIs and Rate Limits

Known API/endpoints worth using:

| API | Endpoint | Used for | Auth/cookies | Rate-limit strategy |
|---|---|---|---|---|
| YouTube watch HTML | `https://www.youtube.com/watch?v={videoId}` | fallback player response, caption tracks, title metadata | same-origin/cookies may apply | route-level cache, abort stale route fetches |
| Innertube player | `https://www.youtube.com/youtubei/v1/player?key={apiKey}` | caption tracks/player response fallback | public page key, no secret | per-video dedupe, backoff on 429/403, rotate scraped client version |
| YouTube timed text | caption `baseUrl` from player response | transcript segment download | no extra auth beyond URL | cache per video/language, cap segment payloads |
| SponsorBlock skip segments | `https://sponsor.ajay.app/api/skipSegments/{hashPrefix}` | segment skips and progress markers | no YouTube cookies | hash-prefix cache, category-specific cache key, stale fallback |
| DeArrow branding | `https://sponsor.ajay.app/api/branding?videoID={id}` | titles/thumbnails | no YouTube cookies | in-flight dedupe, TTL setting, LRU cap |
| DeArrow thumbnail | `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?...` | replacement thumbnail images | no YouTube cookies | lazy load only visible cards |
| Return YouTube Dislike | `https://returnyoutubedislikeapi.com/votes?videoId={id}` | likes/dislikes/ratio | no YouTube cookies | watch-only by default, card fetches lazy/visible and cache-bounded |
| Reddit comments | `https://www.reddit.com/...` / `https://old.reddit.com/...` | optional discussion panel | no YouTube cookies | opt-in, per-video query cap, user-visible source |
| AI providers | OpenAI, Anthropic, Gemini, Ollama/local | summaries, transcript Q&A | BYO key or local only | off by default, explicit provider, token budget, redact controls |
| Astra Downloader | `http://127.0.0.1:{port}` | local downloads, health, history, stream links | local token | 127.0.0.1 only, no localhost, health TTL, auto-start recovery |

Rate limiter requirements:

- Central `ApiLimiter` handles per-origin concurrency, dedupe, TTL, exponential backoff, stale cache fallback, and cancellation.
- No third-party API receives YouTube cookies or auth headers.
- Card-level third-party API fetches must be lazy and visibility-bound.
- Background proxy allowlist must remain strict and test-covered.

### Constraints

- Trusted Types: do not use `innerHTML`, `insertAdjacentHTML`, or string HTML sinks directly. Use DOM construction or `setTrustedHTML`.
- MV3 service worker: no long-lived background state assumptions. Persist resumable work; design for worker suspension.
- Store policy: ad blocking, downloader, Cobalt/direct-stream, and age-restriction bypass surfaces may need GitHub/full-power build separation.
- YouTube Terms and anti-abuse: no hidden botting, no automated engagement spam by default, no credential extraction, no remote code execution.
- Shadow DOM: extension-owned overlay widgets can use Shadow DOM only if theming/a11y and teardown are tested.
- Live chat iframe: all-frame content script required; top-level watch page cannot see inside cross-document chat DOM.
- Performance: feed transforms must be incremental and cache-backed; avoid layout thrash on rich grids.

### Userscript vs Extension Recommendation

Ship both.

The userscript is the fastest compatibility and recovery vehicle:

- Single file.
- Quick GitHub/Gist updates.
- Better MAIN-world access.
- Easier for power users to inspect.
- Useful when store review delays break core YouTube surfaces.

The MV3 extension is the primary polished product:

- Safer settings UI.
- Background proxy.
- Downloads API.
- Local companion bridge.
- Permission-gated optional APIs.
- Extension popup and store distribution.
- Better multi-browser packaging.

Packaging profiles:

- `store-safe`: no ad skipping claims beyond SponsorBlock-style user value, no risky downloader defaults, no broad host permissions beyond needed YouTube/API origins, no remote code, no hidden tracking.
- `github-full`: optional downloader/direct-stream/local companion/advanced predicates/experimental APIs with explicit warnings and visible data flow.
- `userscript`: single-file portable build with GM storage, GM fetch/style APIs, and graceful degradation when extension-only APIs are unavailable.

### Architecture

Recommended v5 file layout (`extension/ytkit.js` is currently a 43,081-line monolith; v5.0.0 carves it apart by category, keeps the dual-world bridge, and adds selector packs + schema as build-time artifacts):

```text
extension/
  manifest.json                  # MV3 — keep dual-world + all-frame live-chat injection
  background.js                  # service worker — domain-allowlisted fetch proxy, downloads, command (TBD)
  ytkit-main.js                  # MAIN world bridge — canPlayType, ytcfg/ytInitialPlayerResponse window read
  early.css                      # document_start anti-FOUC
  core/
    env.js                       # browser detect, version, runtime globals (existing)
    storage.js                   # chrome.storage.local wrapper (existing)
    storage-manager.js           # LRU caches for resumePlayback, perChannelSpeed, etc. (existing)
    styles.js                    # GM_addStyle shim + scoped <style> mount (existing)
    registry.js                  # passive feature registry + cleanup buckets (existing)
    feature-lifecycle.js         # NEW — single contract (init/apply/destroy/AbortController/route token)
    selectors.js                 # versioned selector packs (existing — promote to per-pack files in v5.1)
    selector-health.js           # NEW — bounded miss diagnostics, copy-report action
    selector-packs/              # NEW — one file per surface, capture-provenance + lastVerified
      feed.js
      watch.js
      player.js
      comments.js
      live-chat.js
      notifications.js
      modals.js
      masthead.js
    navigation.js                # yt-navigate-finish + yt-page-data-updated + popstate + Navigation API fallback (existing)
    page.js                      # page-type detection, landmarks (existing)
    player.js                    # <video> + #movie_player resolution (existing)
    video-type.js                # short/live/upcoming/movie/mix predicates (existing)
    url.js                       # video id / channel handle / list extraction (existing)
    observers.js                 # NEW — single coordinator, scoped per high-churn surface
    api-limiter.js               # per-origin concurrency, dedupe, TTL, backoff (existing)
    trusted-html.js              # TrustedTypes policy + fragment helpers (existing)
    predicate-sandbox.js         # safe-expression DSL evaluator (existing — extend with budgets)
    transcript-service.js        # 5-method failover transcript loader (existing)
    diagnostic-log.js            # bounded log + export (existing)
    settings-schema.js           # NEW — single source of truth for all 354 keys + categories + risk/profile/scope
    settings-migrations.js       # NEW — explicit per-version migrations with round-trip tests
    toast.js                     # NEW — single overlay live region (no confirmation dialogs)
    a11y.js                      # NEW — focus traps, aria-live, forced-colors, reduced-motion gates
    theme-tokens.js              # NEW — YouTube token → Astra semantic token bridge
    policy-profile.js            # NEW — store-safe / github-full / userscript profile resolver
  features/
    shell/                       # category `shell`
    nav/                         # category `nav`
    shorts/                      # category `shorts`
    feed/                        # category `feed`
    watch-player/                # category `watch-player`
    playback-audio/              # category `playback-audio`
    quality-codec/               # category `quality-codec` (MAIN-bridge consumers)
    content-filter/              # category `content-filter` (incl. predicate-sandbox consumers)
    comments/                    # category `comments`
    live-chat/                   # category `live-chat` (all-frame inject only)
    subscriptions/               # category `subscriptions`
    enrichment/                  # category `enrichment` — SponsorBlock / DeArrow / RYD
    downloads/                   # category `downloads` — local companion + Cobalt + handoff
    subtitles/                   # category `subtitles`
    research-ai/                 # category `research-ai`
    privacy-profiles/            # category `privacy-profiles`
    a11y-perf/                   # category `a11y-perf`
    dev-diagnostics/             # category `dev-diagnostics`
  ui/
    control-center/              # in-page settings overlay (pointer-events: none when hidden)
    popup/                       # toolbar popup — hero card + storage stats + export/import/reset
    overlays/                    # toast/live-region/mini-player-bar/data-flow panel
    components/                  # shared dark/OLED primitives, no light theme
  generated/
    default-settings.json        # emitted by build from settings-schema.js (not hand-edited in v5+)
    settings-meta.json           # SETTINGS_VERSION + per-version migration metadata
    userscript-bundle.js         # single-file portable build — extension is the upstream truth
  _locales/                      # 10 locales today; settings-schema labels feed extract-i18n-keys.js
astra_downloader/                # local companion (PyInstaller, Flask, yt-dlp, ffmpeg)
scripts/                         # build/audit tooling — extend with check:settings, check:selector-packs
tests/                           # extend with per-pack selector regression + schema diff tests
```

Migration sequence from the current v4.5.2 monolith:

1. v5.0.0 — introduce `settings-schema.js`; `build-extension.js` starts generating `default-settings.json` from the schema, fails build on drift. The current 43k-line `ytkit.js` stays in place; only the schema and lifecycle contracts move first.
2. v5.0.0 — introduce `feature-lifecycle.js`, `observers.js`, `selector-health.js`, `toast.js`, `a11y.js`, `theme-tokens.js`, `policy-profile.js` as new core modules. Existing features adopt them opportunistically.
3. v5.1.0 — split `selectors.js` into per-surface `selector-packs/` with capture provenance.
4. v5.2.0+ — peel feature blocks out of `ytkit.js` by category, one phase per category bucket. Userscript parity tests gate each peel.

Feature contract:

```js
export const feature = {
  id: "hideVideosKeywordFilter",
  category: "contentFiltering",
  storageKey: "hideVideosKeywordFilter",
  defaultValue: "",
  dependencies: ["selectorHealth", "navigation"],
  init(ctx) {},
  apply(ctx, value) {},
  destroy(ctx) {}
};
```

Lifecycle rules:

- `init()` wires observers/listeners and applies current state.
- `apply()` updates immediately when settings change.
- `destroy()` reverses everything.
- Async work gets an `AbortController` and a monotonically increasing route token.
- Feature modules may only mutate DOM below resolved surface roots.
- Feature modules must report diagnostics through one logger.

## Settings Panel Spec

The settings panel is a first-class feature, not a dump of toggles.

Panel behavior:

- Dark/OLED only.
- Dense grouped sections.
- Search/filter by feature name, storage key, competitor, route, and risk.
- Immediate apply on every toggle/change.
- Toast/status-region feedback for actions.
- No confirmation dialogs.
- Undo toast for reversible destructive actions.
- Import/export profiles.
- Store-safe/full profile indicator.
- Per-feature diagnostics row: last applied, last selector miss, last API error, active observers.
- Inactive overlays use `pointer-events: none`.

Required setting categories:

- Interface and theme
- Watch page and player
- Playback and audio
- Content filtering and moderation
- Shorts
- Comments and live chat
- Subscriptions and feeds
- SponsorBlock, DeArrow, and quality signals
- Downloads and local companion
- Transcript, research, and AI
- Privacy and data
- Accessibility and performance
- Developer diagnostics

For every key, `settings-schema.js` must add:

- `category` — one of the 16 categories below (`shell`, `nav`, `shorts`, `feed`, `watch-player`, `playback-audio`, `quality-codec`, `content-filter`, `comments`, `live-chat`, `subscriptions`, `enrichment`, `downloads`, `subtitles`, `research-ai`, `privacy-profiles`, `a11y-perf`, `dev-diagnostics`).
- `label` — short user-facing string (localized via `_locales/`).
- `description` — one-sentence rationale; mention churn risk if applicable.
- `defaultValue` — must match `extension/default-settings.json` byte-for-byte; build fails on drift.
- `storageKey` — equal to the JSON key; `_`-prefixed keys are internal/never user-toggleable.
- `type` — `boolean`, `string`, `number`, `array`, `object`, or `null` (transient).
- `risk` — `safe` (no network), `api` (third-party API: SB/DA/RYD/Reddit/AI), `local-companion` (Astra Downloader 127.0.0.1), `experimental` (incomplete or churn-sensitive), `store-risk` (likely to flag CWS/AMO review).
- `scope` — `global`, `feed`, `watch`, `player`, `comments`, `live-chat`, `subscriptions`, `downloads`, `popup`.
- `vehicle` — `extension`, `userscript`, or `both`.
- `profile` — `store-safe`, `github-full`, or `both`.
- `immediateApply` — `true` unless the underlying API forbids hot-swap (codec/quality on an active player needs a single in-band reapply).
- `destroyRequired` — `true` for every DOM-touching, observer-owning, or timer-owning feature.

### Full Per-Toggle Settings Schema (354 keys)

Source: `extension/default-settings.json` snapshot, 2026-05-21. Every key appears below exactly once. Format per line: `storageKey (type, default) — risk[/profile if not "both"]`. Keys prefixed with `_` are internal state, never user-toggleable, and live in the same storage namespace only so a single import/export round-trip covers them.

#### Category `shell` — Interface, theme, masthead, scrollbars (41)

- `uiStyle` (string, `"square"`) — safe
- `noAmbientMode` (boolean, `true`) — safe
- `compactLayout` (boolean, `true`) — safe
- `thinScrollbar` (boolean, `true`) — safe
- `watchPageRestyle` (boolean, `true`) — safe
- `styledFilterChips` (boolean, `true`) — safe
- `squareSearchBar` (boolean, `true`) — safe
- `squareAvatars` (boolean, `true`) — safe
- `widenSearchBar` (boolean, `true`) — safe
- `hideSidebar` (boolean, `true`) — safe
- `subscriptionsGrid` (boolean, `true`) — safe
- `fullWidthSubscriptions` (boolean, `true`) — safe
- `homepageGridAlign` (boolean, `true`) — safe
- `floatingLogoOnWatch` (boolean, `true`) — safe
- `expandVideoWidth` (boolean, `true`) — safe
- `colorTheme` (string, `"none"`) — safe
- `themeAccentColor` (string, `""`) — safe
- `customProgressBarColor` (string, `"#ff0000"`) — safe
- `nyanCatProgressBar` (boolean, `false`) — safe
- `forceDarkEverywhere` (boolean, `false`) — safe
- `oledTheme` (boolean, `false`) — safe
- `denseMode` (boolean, `false`) — safe
- `rectangularizeYouTube` (boolean, `false`) — safe
- `classicLayoutProfile` (string, `"modern"`) — experimental (high churn)
- `newPlayerUiRestore` (boolean, `false`) — experimental (high churn)
- `tokenThemeBridge` (boolean, `false`) — safe
- `noFrostedGlass` (boolean, `false`) — safe
- `customCssInjection` (boolean, `false`) — store-risk/github-full
- `customCssCode` (string, `""`) — store-risk/github-full
- `customSelectionColor` (boolean, `false`) — safe
- `selectionColor` (string, `"#2dd36f"`) — safe
- `thumbnailPreviewSize` (boolean, `false`) — safe
- `grayscaleThumbnails` (boolean, `false`) — safe
- `thumbnailQualityUpgrade` (boolean, `false`) — safe (uses `i.ytimg.com` only)
- `titleCaseTransform` (boolean, `false`) — safe
- `titleCaseMode` (string, `"none"`) — safe
- `fullTitles` (boolean, `false`) — safe
- `compactUnfixedHeader` (boolean, `false`) — safe
- `chatStyleComments` (boolean, `false`) — safe
- `redirectToVideosTab` (boolean, `true`) — safe
- `hideAirplayButton` (boolean, `false`) — safe
- `hideQueueOnThumbnails` (boolean, `false`) — safe

#### Category `nav` — Masthead nav, quick links, share URLs, alternative frontends (13)

- `hideCreateButton` (boolean, `true`) — safe
- `hideVoiceSearch` (boolean, `true`) — safe
- `logoToSubscriptions` (boolean, `true`) — safe
- `quickLinkMenu` (boolean, `true`) — safe
- `quickLinkItems` (string, multi-line list) — safe
- `redirectHomeToSubs` (boolean, `false`) — safe
- `cleanShareUrls` (boolean, `true`) — safe
- `openInNewTab` (boolean, `false`) — safe
- `openInAlternativeFrontend` (boolean, `false`) — store-risk/github-full
- `alternativeFrontendInstance` (string, `"https://yewtu.be"`) — store-risk/github-full
- `bypassPlaylistMode` (boolean, `false`) — safe
- `shareMenuCleaner` (boolean, `false`) — safe
- `titleNormalization` (boolean, `false`) — safe

#### Category `shorts` — Shorts removal/redirection (4)

- `removeAllShorts` (boolean, `true`) — safe
- `redirectShorts` (boolean, `true`) — safe
- `shortsAsRegularVideo` (boolean, `false`) — safe
- `disablePlayOnHover` (boolean, `true`) — safe

#### Category `feed` — Home/feed layout and bulk visibility (10)

- `videosPerRow` (number, `0`) — safe
- `disableInfiniteScroll` (boolean, `false`) — safe
- `hidePlayables` (boolean, `true`) — safe
- `hideMembersOnly` (boolean, `true`) — safe
- `hideNewsHome` (boolean, `true`) — safe
- `hidePlaylistsHome` (boolean, `true`) — safe
- `hideMerchShelf` (boolean, `true`) — safe
- `hideLatestPosts` (boolean, `false`) — safe
- `hideAiSummary` (boolean, `true`) — safe
- `hideInfoPanels` (boolean, `true`) — safe

#### Category `watch-player` — Watch page chrome, panels, tabs, sticky/popout/mini player, badges (52)

- `hideRelatedVideos` (boolean, `true`) — safe
- `hideDescriptionRow` (boolean, `true`) — safe
- `hideVideoEndContent` (boolean, `true`) — safe
- `hideJumpAheadButton` (boolean, `true`) — safe
- `stickyVideo` (boolean, `true`) — safe
- `hideEndCards` (boolean, `false`) — safe
- `hideInfoCards` (boolean, `false`) — safe
- `hideDescriptionExtras` (boolean, `true`) — safe
- `hideHashtags` (boolean, `true`) — safe
- `hidePaidContentOverlay` (boolean, `true`) — safe
- `hidePaidPromotionWatch` (boolean, `true`) — safe
- `hideChannelJoinButton` (boolean, `true`) — safe
- `hideFundraiser` (boolean, `true`) — safe
- `hideCollaborations` (boolean, `true`) — safe
- `hideSubscriptionOptions` (boolean, `true`) — safe
- `hideAutoplayToggle` (boolean, `false`) — safe
- `hiddenActionButtonsManager` (boolean, `true`) — safe
- `hiddenActionButtons` (array, `["like","share","ask","clip","thanks","save","sponsor","moreActions"]`) — safe
- `hiddenPlayerControlsManager` (boolean, `true`) — safe
- `hiddenPlayerControls` (array, `["next","autoplay","subtitles","captions","miniplayer","pip","theater","fullscreen"]`) — safe
- `hiddenWatchElementsManager` (boolean, `true`) — safe
- `hiddenWatchElements` (array, default 12+ tokens) — safe
- `watchPageTabs` (boolean, `false`) — safe
- `autoExpandDescription` (boolean, `false`) — safe
- `scrollToPlayer` (boolean, `false`) — safe
- `focusedMode` (boolean, `false`) — safe
- `fitPlayerToWindow` (boolean, `false`) — safe (conflicts with stickyVideo)
- `popOutPlayer` (boolean, `false`) — experimental (Document PiP)
- `autoTheaterMode` (boolean, `false`) — safe
- `miniPlayerBar` (boolean, `false`) — safe
- `disableMiniPlayer` (boolean, `false`) — safe
- `adaptiveLiveLayout` (boolean, `false`) — safe
- `showStatisticsDashboard` (boolean, `false`) — safe
- `playbackStatsOverlay` (boolean, `false`) — safe
- `monetizationIndicator` (boolean, `false`) — safe
- `channelAgeDisplay` (boolean, `false`) — safe
- `channelSubCount` (boolean, `false`) — safe
- `showChannelVideoCount` (boolean, `false`) — safe
- `videoResolutionBadge` (boolean, `false`) — safe
- `likeViewRatio` (boolean, `false`) — safe
- `videoAgeColors` (boolean, `false`) — safe
- `speedIndicatorOverlay` (boolean, `false`) — safe
- `playbackSpeedOSD` (boolean, `false`) — safe
- `chapterNavButtons` (boolean, `false`) — safe
- `chapterJumpButtons` (boolean, `false`) — safe
- `autoOpenChapters` (boolean, `false`) — safe
- `keyMoments` (boolean, `false`) — safe
- `copyChapterMarkdown` (boolean, `false`) — safe
- `transcriptViewer` (boolean, `false`) — api (caption tracks)
- `autoOpenTranscript` (boolean, `false`) — safe
- `stickyChat` (boolean, `false`) — safe
- `alwaysShowProgressBar` (boolean, `false`) — safe
- `watchProgress` (boolean, `false`) — safe
- `preloadComments` (boolean, `false`) — safe
- `theaterAutoScroll` (boolean, `false`) — safe
- `cinemaAmbientGlow` (boolean, `false`) — safe (canvas sampling, throttled)

#### Category `playback-audio` — Speed, volume, audio routing, autoplay, timing, screenshots (62)

- `preventAutoplay` (boolean, `false`) — safe
- `disableAutoplayNext` (boolean, `false`) — safe
- `autoDismissStillWatching` (boolean, `false`) — store-risk
- `autoSubtitles` (boolean, `false`) — safe
- `autoSubtitleLang` (string, `"en"`) — safe
- `audioTrackLanguage` (boolean, `false`) — safe
- `preferredAudioLang` (string, `"en"`) — safe
- `notifyAutoDubbedAudio` (boolean, `false`) — safe
- `antiTranslate` (boolean, `false`) — safe
- `antiTranslateAudioTrack` (boolean, `false`) — safe
- `antiTranslateTranscript` (boolean, `false`) — safe
- `persistentSpeed` (boolean, `false`) — safe (conflicts with perChannelSpeed)
- `persistentSpeedValue` (number, `1`) — safe
- `perChannelSpeed` (boolean, `false`) — safe
- `musicVideoSpeedLock` (boolean, `false`) — safe
- `customSpeedButtons` (boolean, `false`) — safe
- `fineSpeedControl` (boolean, `false`) — safe
- `speedStep` (number, `0.25`) — safe
- `scrollWheelSpeed` (boolean, `false`) — safe
- `volumeWheelMode` (boolean, `false`) — safe
- `rememberVolume` (boolean, `false`) — safe
- `rememberVolumeLevel` (number, `100`) — safe
- `disableLoudnessNormalization` (boolean, `false`) — safe
- `abLoop` (boolean, `false`) — safe
- `videoLoopButton` (boolean, `false`) — safe
- `sleepTimer` (boolean, `false`) — safe
- `pauseOtherTabs` (boolean, `false`) — safe (BroadcastChannel; conflicts with autoPauseOnSwitch)
- `autoPauseOnSwitch` (boolean, `false`) — safe
- `autoSkipChapters` (boolean, `false`) — safe
- `autoSkipChapterPatterns` (string, `"intro,outro,recap,sponsor"`) — safe
- `perChannelIntroOutro` (boolean, `false`) — safe
- `perChannelIntroOutroData` (object, `{}`) — safe
- `ageRestrictionBypass` (boolean, `false`) — store-risk/github-full
- `remainingTimeDisplay` (boolean, `false`) — safe
- `showPlaylistDuration` (boolean, `false`) — safe
- `showTimeInTabTitle` (boolean, `false`) — safe
- `reversePlaylist` (boolean, `false`) — safe
- `resumePlayback` (boolean, `false`) — safe (StorageManager 500-entry LRU)
- `autoLikeSubscribed` (boolean, `false`) — store-risk
- `autoClosePopups` (boolean, `false`) — safe
- `preciseViewCounts` (boolean, `false`) — safe
- `videoScreenshot` (boolean, `false`) — safe
- `downloadScreenshotFormat` (string, `"png"`) — safe
- `downloadSubtitlesWithScreenshot` (boolean, `false`) — safe
- `frameByFrameButtons` (boolean, `false`) — safe
- `videoZoom` (boolean, `false`) — safe (Ctrl+wheel; no keyboard binding, pointer modifier only)
- `videoRotation` (boolean, `false`) — safe
- `videoRotationAngle` (number, `0`) — safe
- `videoVisualFilters` (boolean, `false`) — safe
- `vvfBrightness` (number, `100`) — safe
- `vvfContrast` (number, `100`) — safe
- `vvfSaturation` (number, `100`) — safe
- `vvfHue` (number, `0`) — safe
- `vvfGrayscale` (number, `0`) — safe
- `vvfSepia` (number, `0`) — safe
- `pipButton` (boolean, `false`) — safe
- `fullscreenOnDoubleClick` (boolean, `false`) — safe
- `blueLightFilter` (boolean, `false`) — safe
- `blueLightIntensity` (number, `30`) — safe
- `timestampBookmarks` (boolean, `false`) — safe
- `watchTimeTracker` (boolean, `false`) — safe (90-day retention)
- `copyVideoTitle` (boolean, `false`) — safe
- `enableCPU_Tamer` (boolean, `false`) — safe (rAF timer throttling)
- `enableHandleRevealer` (boolean, `false`) — safe
- `searchFilterDefaults` (boolean, `false`) — safe
- `searchFilterSort` (string, `"upload_date"`) — safe
- `rssFeedLink` (boolean, `false`) — safe
- `notInterestedButton` (boolean, `false`) — safe
- `watchLaterQuickAdd` (boolean, `false`) — safe
- `playlistEnhancer` (boolean, `false`) — safe
- `playlistQuickRemove` (boolean, `false`) — safe
- `watchLaterCleanup` (boolean, `false`) — safe (≥90 % progress threshold)

#### Category `quality-codec` — Quality matrix, codec/FPS selection, MAIN-bridge surfaces (12)

- `autoMaxResolution` (boolean, `true`) — safe
- `forceH264` (boolean, `false`) — safe (MAIN bridge; conflicts with codecSelector)
- `codecSelector` (string, `"auto"`) — safe (MAIN bridge)
- `forceStandardFps` (boolean, `false`) — safe
- `qualityProfileMatrix` (boolean, `false`) — safe
- `qualityDefaultNormal` (string, `"inherit"`) — safe
- `qualityDefaultTheater` (string, `"inherit"`) — safe
- `qualityDefaultFullscreen` (string, `"inherit"`) — safe
- `qualityDefaultBackground` (string, `"inherit"`) — safe
- `qualityDefaultEmbed` (string, `"inherit"`) — safe
- `initialPlayerStateForeground` (string, `"inherit"`) — safe
- `initialPlayerStateBackground` (string, `"inherit"`) — safe

#### Category `content-filter` — Card/video/channel filters and the predicate sandbox (29)

- `hideVideosFromHome` (boolean, `true`) — safe
- `hideVideosKeywordFilter` (string, `""`) — safe
- `hideVideosDurationFilter` (number, `0`) — safe
- `hideVideosSubsLoadLimit` (boolean, `true`) — safe
- `hideVideosSubsLoadThreshold` (number, `3`) — safe
- `hideVideosRemoveHiddenCards` (boolean, `false`) — safe
- `hideVideosShowQuickHideButton` (boolean, `true`) — safe
- `hideVideosAllowChannelBlock` (boolean, `true`) — safe
- `hideVideosRememberRestoredVideos` (boolean, `true`) — safe
- `hideVideosScopeHome` (boolean, `true`) — safe
- `hideVideosScopeSubscriptions` (boolean, `true`) — safe
- `hideVideosScopeSearch` (boolean, `true`) — safe
- `hideVideosScopeWatch` (boolean, `true`) — safe
- `hideVideosScopeChannels` (boolean, `true`) — safe
- `hideVideosScopeOther` (boolean, `true`) — safe
- `hideVideosLowViewFilter` (boolean, `false`) — safe
- `hideVideosLowViewThreshold` (number, `1000`) — safe
- `hideVideosHideLive` (boolean, `false`) — safe
- `hideVideosHideUpcoming` (boolean, `false`) — safe
- `hideVideosHideMixes` (boolean, `false`) — safe
- `hideVideosHidePlaylists` (boolean, `false`) — safe
- `hideVideosHideMovies` (boolean, `false`) — safe
- `hideVideosHideAutoDubbed` (boolean, `false`) — safe
- `hideVideosWatchedRatio` (number, `0`) — safe
- `hideWatchedVideos` (boolean, `false`) — safe
- `hideWatchedMode` (string, `"dim"`) — safe
- `advancedLocalPredicate` (boolean, `false`) — experimental (predicate-sandbox.js DSL)
- `advancedLocalPredicateCode` (string, `""`) — experimental
- `bulkCardActions` (boolean, `false`) — safe
- `feedTriageProfile` (boolean, `false`) — safe

#### Category `comments` — Comment chrome, filters, navigator, notifications (15)

- `hidePinnedComments` (boolean, `true`) — safe
- `hideCommentDislikeButton` (boolean, `false`) — safe
- `hideCommentActionMenu` (boolean, `false`) — safe
- `condenseComments` (boolean, `false`) — safe
- `hideCommentTeaser` (boolean, `false`) — safe
- `autoExpandComments` (boolean, `true`) — safe
- `commentEnhancements` (boolean, `false`) — safe
- `sortCommentsNewest` (boolean, `false`) — safe
- `commentSearch` (boolean, `false`) — safe
- `commentNavigator` (boolean, `false`) — safe
- `commentFilterManager` (boolean, `false`) — safe
- `commentFilterRules` (string, `""`) — safe
- `creatorCommentHighlight` (boolean, `false`) — safe
- `chronologicalNotifications` (boolean, `false`) — safe
- `hideNotificationBadge` (boolean, `false`) — safe
- `hideNotificationButton` (boolean, `false`) — safe

#### Category `live-chat` — Live-chat iframe (all-frame inject, requires fresh fixtures) (6)

- `hideLiveChatEngagement` (boolean, `true`) — safe
- `premiumLiveChat` (boolean, `true`) — safe
- `hiddenChatElementsManager` (boolean, `true`) — safe
- `hiddenChatElements` (array, default 14 tokens) — safe
- `chatKeywordFilter` (string, `""`) — safe
- `reactionSpammer` (boolean, `false`) — store-risk/github-full (anti-abuse risk)
- `_reactionSpammerAck` (boolean, `false`) — internal acknowledgment flag

#### Category `subscriptions` — Subscription groups, sort, AI tags, last-visit deltas (7)

- `subscriptionGroups` (boolean, `false`) — safe
- `subscriptionGroupData` (object, `{}`) — safe
- `subscriptionSortMode` (string, `"default"`) — safe
- `subscriptionShowNewSinceLastVisit` (boolean, `true`) — safe
- `subscriptionLastVisitData` (object, `{}`) — safe
- `subscriptionAiTags` (boolean, `false`) — api (BYO-key or local AI)
- `subscriptionAiTagData` (object, `{}`) — safe

#### Category `enrichment` — SponsorBlock, DeArrow, Return YouTube Dislike (23)

- `sponsorBlock` (boolean, `true`) — api
- `sbCat_sponsor` (boolean, `true`) — api
- `sbCat_intro` (boolean, `true`) — api
- `sbCat_outro` (boolean, `true`) — api
- `sbCat_selfpromo` (boolean, `true`) — api
- `sbCat_interaction` (boolean, `true`) — api
- `sbCat_music_offtopic` (boolean, `true`) — api
- `sbCat_preview` (boolean, `true`) — api
- `sbCat_filler` (boolean, `true`) — api
- `sbCat_poi_highlight` (boolean, `false`) — api
- `deArrow` (boolean, `false`) — api
- `daReplaceTitles` (boolean, `true`) — api
- `daReplaceThumbs` (boolean, `true`) — api
- `daTitleFormat` (string, `"sentence"`) — safe
- `daFallbackFormat` (boolean, `true`) — safe
- `daShowOriginalHover` (boolean, `true`) — safe
- `daCacheTTL` (string, `"4"`) — safe
- `dearrowPeekButton` (boolean, `false`) — safe
- `deArrowChannelOverrides` (object, `{}`) — safe
- `deArrowChannelOverridesPanel` (boolean, `false`) — safe
- `returnDislike` (boolean, `false`) — api
- `returnDislikeOnCards` (boolean, `false`) — api (card-level, must be visibility-bound)
- `returnDislikeCacheHours` (number, `24`) — safe
- `returnDislikeShowRatio` (boolean, `true`) — safe

#### Category `downloads` — Local downloader, Cobalt fallback, context-menu surfaces (15)

- `showLocalDownloadButton` (boolean, `true`) — local-companion
- `videoContextMenu` (boolean, `true`) — safe
- `astraContextMenu` (boolean, `false`) — safe
- `autoDownloadOnVisit` (boolean, `false`) — local-companion/github-full
- `downloadQuality` (string, `"best"`) — local-companion
- `downloadVideoFormat` (string, `"mp4"`) — local-companion
- `downloadAudioFormat` (string, `"mp3"`) — local-companion
- `downloadThumbnail` (boolean, `false`) — safe (uses `i.ytimg.com`)
- `subtitleDownload` (boolean, `false`) — safe
- `downloadHistoryPanel` (boolean, `false`) — local-companion
- `downloadHealthPanel` (boolean, `false`) — local-companion
- `downloadStreamLinksPanel` (boolean, `false`) — local-companion/github-full
- `downloadCobaltFallback` (boolean, `false`) — api/github-full
- `downloadCobaltInstance` (string, `"https://api.cobalt.tools/api/json"`) — api/github-full
- `vlcMpvHandoff` (boolean, `false`) — local-companion/github-full

#### Category `subtitles` — Native caption styling (8)

- `subtitleStyling` (boolean, `false`) — safe
- `subStyleFontSize` (number, `100`) — safe
- `subStyleFontFamily` (string, `"default"`) — safe
- `subStyleColor` (string, `"#ffffff"`) — safe
- `subStyleBgOpacity` (number, `75`) — safe
- `subStyleBgColor` (string, `"#000000"`) — safe
- `subStyleBottomOffset` (number, `10`) — safe
- `subStyleTextShadow` (boolean, `true`) — safe

#### Category `research-ai` — Transcripts, summaries, Reddit, analytics, digital wellbeing (17)

- `aiVideoSummary` (boolean, `false`) — api/github-full (BYO key)
- `aiSummaryEndpoint` (string, OpenAI default) — api/github-full
- `aiSummaryModel` (string, `"gpt-4o-mini"`) — api/github-full
- `aiSummaryApiKey` (string, `""`) — api/github-full (never synced)
- `aiSummaryProvider` (string, `"openai"`) — api/github-full
- `localAiSummary` (boolean, `false`) — api (Ollama 127.0.0.1:11434)
- `transcriptAiHandoff` (boolean, `false`) — safe (opens external tab)
- `transcriptAiTarget` (string, `"notebooklm"`) — safe
- `researchSpacedReview` (boolean, `false`) — safe
- `researchTranscriptIndex` (boolean, `false`) — safe (IndexedDB local)
- `researchTranscriptSearchPanel` (boolean, `false`) — safe
- `redditComments` (boolean, `false`) — api (Reddit JSON)
- `watchHistoryAnalytics` (boolean, `false`) — safe
- `digitalWellbeing` (boolean, `false`) — safe
- `dwBreakIntervalMin` (number, `30`) — safe
- `dwDailyCapMin` (number, `0`) — safe
- `dwWatchTimeToday` (object, `{date:"",seconds:0}`) — internal counter

#### Category `privacy-profiles` — Profiles, sync, data-flow, predicates (10)

- `safeStoreProfile` (boolean, `true`) — safe
- `githubFullProfile` (boolean, `false`) — safe
- `syncSafePrefs` (boolean, `true`) — safe
- `syncSafePrefsAllowlist` (array, default broad-but-safe set) — safe
- `_profiles` (object, `{}`) — internal storage of saved profile bundles
- `_activeProfile` (string, `"default"`) — internal pointer
- `settingsProfiles` (boolean, `false`) — safe
- `privacyDataFlowPanel` (boolean, `false`) — safe
- `sidebarOrder` (null, `null`) — internal layout state
- `storageQuotaLRU` (boolean, `false`) — safe

#### Category `a11y-perf` — Accessibility, low-power, retry/backoff, Music compat (8)

- `reducedMotion` (boolean, `false`) — safe
- `forcedColorsSupport` (boolean, `false`) — safe
- `globalAriaLiveRegion` (boolean, `false`) — safe
- `lowPowerProfile` (boolean, `false`) — safe
- `lowPowerProfileBackup` (null, `null`) — internal snapshot for restore
- `apiRetryBackoff` (boolean, `true`) — safe
- `youtubeMusicCompat` (boolean, `false`) — experimental
- `disableSpaNavigation` (boolean, `false`) — experimental

#### Category `dev-diagnostics` — Debug + internal error sink (3)

- `debugMode` (boolean, `false`) — safe
- `diagnosticLog` (boolean, `false`) — safe
- `_errors` (array, `[]`) — internal bounded error queue

Schema verification gates (build-time):

- `npm run check:settings` (new) — diffs `default-settings.json` against `settings-schema.js`; build fails on any missing key, missing category, default mismatch, or risk/profile/scope drift.
- `npm run check:versions` (existing) — ensures all version strings agree.
- `tests/settings-migration-roundtrip.test.js` — round-trips a JSON export through every migration; new keys must declare a `since` version and a migration entry or build fails.
- `_*` prefixed keys are excluded from popup surfaces and export scrubbing audits.

## Phased Build Plan

### v5.0.0 - Architecture and Settings Foundation _(effectively complete as of v4.29.0)_

Goal: make the product maintainable enough to carry the full superset.

**Status (2026-05-21 close of session):** every checklist item below is either checked (x) or marked partial (~) with the remaining work explicitly named. The schema-driven popup editor, the data-flow panel, the policy-profile resolver, the lifecycle contract + navigation bridge, the selector-health surface, the userscript bundle, and 10 feature peels have all shipped. Remaining v5.0.0 work (selector-pack file split, DOM-layer toast extraction, full per-feature lifecycle adoption) is non-blocking on the v5.1+ phases — those phases can start with the current foundation.

Features:

- [x] Introduce full settings schema metadata for all 354 observed keys. _(Delivered in v4.6.0 — `extension/core/settings-schema.js` is the single source of truth; `scripts/check-settings.js` is hooked into `npm run check`; 10 hardening tests pin the invariants; `build-extension.js` emits `default-settings.json` from the schema with a drift gate against the legacy `ytkit.js` extractor.)_
- [x] Introduce `feature-lifecycle.js`. _(Delivered in v4.7.0 — `extension/core/feature-lifecycle.js` exports `createLifecycle()` with `defineFeature`/`start`/`apply`/`destroy`, AbortController-backed signals, monotonic route tokens, best-effort destroy, snapshot diagnostics. Wired into both content_script load orders ahead of `ytkit.js`; 5 hardening tests pin invariants. Adoption is opt-in per feature — no existing features rewired yet.)_
- [x] Add explicit store-safe/full/userscript profile switch. _(Resolver delivered in v4.7.0 — `extension/core/policy-profile.js` exports `createPolicyProfile()` with `resolveEffectiveProfile`, `isEntryAllowedInProfile`, `filterSettingsForProfile`, `shouldScrubKey`, `buildExportSnapshot`, `countByProfile`. 6 hardening tests pin the partition + scrub rules. Popup UI for the toggle row + visible warnings still pending — see v5.0.0 follow-up below.)_
- [x] Build category-driven settings panel with search, profile badges, and diagnostics _(read-side in v4.23.0 + boolean editing in v4.24.0 + search integration in v4.25.0 + number editor in v4.26.0 + string + color-picker editors in v4.27.0. The existing `#q` filter drives both the QUICK_TOGGLES list and the schema overview. ≈340 of 354 schema keys are now editable directly from the popup; arrays + objects remain in-page-workspace-only. Profile badges + diagnostics rows can layer on top in a follow-up but the core schema-driven panel is delivered.)_
- [x] Add selector health system and versioned selector packs _(read-side delivered in v4.8.0 — `extension/core/selector-health.js`. File split COMPLETE in v4.37.0 — all 28 surfaces (+ 2 aliases) live in `extension/core/selector-packs/<surface>.js` with `captureEvidence` + `lastVerified`. `INLINE_SURFACES` is empty; the pack registry drives `SurfaceSelectorMap`. The live-chat fresh capture is a follow-up slice, not a blocker.)_
- [x] Add route-aware observer coordinator _(delivered in v4.9.0 — `extension/core/lifecycle-route-bridge.js` self-installs against `core/navigation.js` and `core/feature-lifecycle.js`; every yt-navigate-finish / yt-page-data-updated / popstate / watch-flexy mutation auto-increments the lifecycle route token via `notifyRouteChange()`. 4 hardening tests pin the contract + load order.)_
- [x] Add data-flow panel v1 with API origins and permission explanations _(complete in v4.12.0 — popup data-flow section bundled with the v5.0.0 core modules, gated on `privacyDataFlowPanel`, reactive to `chrome.storage.onChanged`, no pill backdrops per house style, all 10 locales seeded, 7 new hardening tests including a background.js↔catalogue origin parity gate.)_
- [~] Extract feature modules from the monolith by category _(10 peels across 4 carve-outs — subtitles (v4.13.0), video-filters (v4.17.0), blue-light-filter (v4.18.0), and the theme-css bundle now covering 7 consumers: customProgressBarColor + customSelectionColor + grayscaleThumbnails (v4.19.0) + forceDarkEverywhere + themeAccentColor (v4.21.0) + compactUnfixedHeader + hideVideoEndContent (v4.22.0). 34 hardening tests pin the parity contracts.)_
- [~] Extract `showToast` into `core/toast.js` _(pure helpers peeled in v4.14.0 — `inferToastTone`/`getToastRgb`/`getToastBadgeLabel`/`getToastAriaDefaults` + `TONE_RGB`/`TONE_BADGE`. 6 hardening tests pin the parity. DOM-touching showToast/dismissToast still in the monolith; v5.0.0 "single live region" primitive is the next step.)_

Acceptance criteria:

- [x] Every current setting has category, type, defaultValue, risk, scope, vehicle, and profile metadata.
- [x] Every entry also has a human-readable label _(via v4.28.0 `humanizeSettingKey()` deterministic fallback; a `labelKey` override field can layer translated strings on top in a future i18n pass without blocking the popup)._
- [~] Every feature can be disabled without leaving DOM/classes/listeners/observers behind _(true for the 10 peeled features whose tests pin the parity contract; not yet exhaustively verified for the ~190 remaining monolith blocks — see v5.1+ lifecycle adoption pass)._
- [x] `npm run check` (including the `check:settings` gate), `npm test`, `npm run build`, `npm run audit:a11y`, and `npm run audit:contrast` pass.
- [x] Userscript carries the v5.0.0 core surface — `sync-userscript.js` bundles 11 v5.0.0 modules verbatim into `YTKit.user.js` between BEGIN/END markers; parity is pinned per-module by hardening tests.
- [x] Selector fixtures fail loudly when stable selectors disappear _(infra in `tests/selector-regression.test.js`; the per-pack split is COMPLETE in v4.37.0 — every surface has its own `extension/core/selector-packs/<surface>.js` with capture provenance + lastVerified, and the v4.37.0 hardening tests pin the surface-count parity + manifest-vs-disk parity invariants.)_

### v5.1.0 - Selector Fixture and DOM Churn Hardening

Goal: make YouTube UI changes diagnosable instead of mysterious.

Features:

- Formal MHTML parser output with HTML/CSS part inventory, selector coverage, token catalog, and API-state scan.
- Add live-chat iframe capture workflow.
- Add new player/Delhi/liquid-glass capture workflow.
- Add selector health dashboard in diagnostics.
- Add runtime selector miss caps, export, and "copy report" action.
- Add per-surface smoke tests: home, subscriptions, watch, comments, related sidebar, player, notifications, live chat.

Acceptance criteria:

- Capture parser records all four current captures and produces deterministic JSON fixtures.
- Each selector pack entry includes capture provenance.
- Watch/player/comment features still apply after `yt-navigate-finish`, `yt-page-data-updated`, filter-chip recycling, and `ytd-watch-flexy[video-id]` mutation.
- No observer performs full-document scans per mutation.

### v5.2.0 - Content Filtering Superset

Goal: beat BlockTube, Unhook, UnTrap, YouTube Tweaks, and uBO-style cosmetic filters for YouTube content control.

Features:

- Unified filter rules engine for videos, channels, comments, shelves, search results, subscriptions, and related sidebar.
- Keyword, regex, channel ID, handle, duration, view count, upload age, watched ratio, live/upcoming/mix/movie/playlist/auto-dub filters.
- Route-specific rule scopes and exceptions.
- Safe predicate DSL with dry-run preview and budget/circuit breaker.
- Quick hide/block/not-interested actions on cards and comments.
- Bulk card actions and feed triage profile.
- Import/export BlockTube-style filters where safely translatable.

Acceptance criteria:

- Filters apply incrementally to added cards/comments.
- Emoji, apostrophes, casing, and localized metadata do not break matching.
- Disabled filters fully restore hidden content where possible.
- Advanced predicates cannot call arbitrary JS, network, storage, DOM mutation, or `eval`.

### v5.3.0 - Playback and Player Superset

Goal: beat Enhancer for YouTube, Video Speed Controller, Tweaks for YouTube, YouTube HD, and YouTube Alchemy in player control without adding keyboard shortcuts.

Features:

- Quality matrix by normal/theater/fullscreen/embed/background.
- Codec/FPS controls with MAIN bridge diagnostics.
- Speed presets, per-channel speed, visible custom speed controls, wheel speed/volume/seek zones.
- Audio boost, mono mix, pan, high-pass, loudness normalization disable.
- A/B loop timeline handles.
- Frame buttons and frame capture.
- PiP, popout, sticky player, mini-player bar.
- Screenshot with format/subtitle/filename options.
- Subtitle styling panel.
- Persistent progress bar with chapters, SponsorBlock marks, and remaining time adjusted for speed/skips.

Acceptance criteria:

- No keyboard shortcuts are added.
- All controls are accessible by pointer and screen reader.
- Main video element detection survives SPA navigation.
- Quality/speed settings do not fight YouTube's own async player initialization.

### v5.4.0 - Watch Page, Comments, and Live Chat Workstation

Goal: own the watch-page workflow.

Features:

- Native-feeling tabs for Info, Comments, Videos, Chapters, Transcript, Chat, Notes, Reddit.
- Comments in sidebar with refresh-safe state.
- Auto-open transcript/chapters/comments with route-scoped restore.
- Comment search, comment navigator, creator/pinned/comment highlighting controls.
- Live-chat iframe polish: OLED theme, compact density, keyword filters, author filters, sticky chat, fullscreen side-by-side chat.
- Chat replay hiding and engagement clutter cleanup.
- Engagement panel manager for AI summary, clips, transcript, chapters.

Acceptance criteria:

- Comments-in-sidebar persists after F5 and SPA navigation.
- Live chat features are backed by fresh iframe fixtures.
- Comment composer remains usable and accessible.
- All panels destroy cleanly and restore native YouTube layout.

### v5.5.0 - Subscription and Feed Manager

Goal: exceed PocketTube while staying local-first.

Features:

- Nested subscription groups.
- AI-suggested tags stored locally and editable.
- Group feeds with sort by upload date, length, popularity, watched state, and new-since-last-visit.
- Dead-channel detection.
- Bulk unsubscribe staging with undo.
- Group notifications and digest panel.
- Group import/export.
- Channel page group chips and quick actions.
- "Play all" restoration for videos, Shorts, live, popular, and group feeds.

Acceptance criteria:

- All group data is local unless explicit sync/export is enabled.
- Group feeds work without YouTube Data API keys where possible.
- Bulk unsubscribe never performs irreversible actions without an undoable staging surface.
- Import/export round-trip tests cover nested groups and AI tags.

### v5.6.0 - Research, Notes, Transcript, and AI Suite

Goal: combine YouTube Alchemy, Rovetify, UnTrap AI, and YouFocus into a local-first research workspace.

Features:

- Per-video notes with timestamps and source links.
- Transcript search index in IndexedDB.
- Spaced review queue for saved clips/notes.
- Transcript export to Markdown, TXT, JSON, SRT/VTT where source permits.
- Transcript handoff buttons for ChatGPT, NotebookLM, Claude, Gemini, Obsidian URI, local files.
- BYO-key summaries for OpenAI/Anthropic/Gemini and local Ollama summary.
- Summary provenance: source transcript language, timestamp range, model/provider, token budget.
- Top-comment digest with strict opt-in and source attribution.
- Study/work modes with local time tracking, focused history, notes, and break timer.

Acceptance criteria:

- AI is off by default.
- BYO API keys are never included in exports, diagnostics, logs, or sync-safe profiles.
- Local/offline mode works without network AI providers.
- Notes/transcripts/export have deterministic tests.

### v5.7.0 - Media and Downloader Reliability

Goal: make downloads explicit, safe, diagnostic, and better than sketchy downloader extensions.

Features:

- Local companion health dashboard v2.
- Stream link panel with format/quality capability explanation.
- yt-dlp status, Deno/runtime, ffmpeg, cookies, and PO-token diagnostics.
- Retry/fallback sequencing: local companion, stream links, Cobalt instance, thumbnail/subtitle-only paths.
- Download history with local-only retention controls.
- Safe auto-start recovery for stopped companion.
- VLC/MPV handoff with user-visible commands.

Acceptance criteria:

- Store-safe profile can disable risky download surfaces.
- No `localhost` origin is added; only literal `127.0.0.1` loopback is allowed.
- Downloader cleanup cannot delete outside intended artifact directories.
- Every failure shows actionable local diagnostics.

### v5.8.0 - Privacy, Security, and Store Profile Hardening

Goal: make trust part of the product.

Features:

- Permission diff view: store-safe vs GitHub-full vs userscript.
- API data-flow panel with per-origin purpose, credentials policy, cache TTL, and disable action.
- Remote-code audit gate.
- Secret scanner for built artifacts.
- Extension manifest profile generator.
- Safer AI-key storage copy.
- Profile export scrubber.
- Network activity diagnostics.

Acceptance criteria:

- Store-safe artifact has the minimal host permissions needed for its enabled features.
- Third-party API requests omit YouTube credentials.
- Build fails if remote code, unexpected host permissions, or API-key leaks appear.
- Privacy copy is suitable for Chrome Web Store/AMO submission.

### v5.9.0 - Accessibility and Performance Release Gate

Goal: make quality measurable.

Features:

- Screen-reader smoke tests for popup, settings, watch overlays, toasts, and major controls.
- Forced-colors and reduced-motion support across all Astra UI.
- Contrast gate for semantic tokens.
- Long-session memory leak test.
- Feed mutation stress test.
- API rate-limit/backoff tests.
- Low-power profile that disables expensive animations, thumbnail transforms, AI, and card-level API fetches.

Acceptance criteria:

- No focus trap remains active when overlays are hidden.
- All interactive controls have names and reachable focus order.
- Feed stress test shows bounded observer work and no unbounded diagnostics maps.
- Low-power profile measurably reduces card-processing work.

### v6.0.0 - "Beats Every Competitor" Release

Goal: ship the union of competitor features plus Astra-only differentiators.

Features:

- All v5 phases complete.
- README build deliverable written for public release.
- Competitive comparison page generated from settings schema.
- Chrome, Firefox, and userscript artifacts produced.
- Store-safe and GitHub-full releases signed/packaged separately.
- Full regression bundle and manual browser smoke plan executed.

Acceptance criteria:

- Every matrix feature is either shipped, intentionally excluded with a documented policy reason, or marked experimental in GitHub-full only.
- Astra replaces at least these stacks for a power user: SponsorBlock, DeArrow, Return YouTube Dislike, Unhook, BlockTube, PocketTube, Video Speed Controller, YouTube Alchemy, YouTube Tweaks, Tweaks for YouTube, and common Stylus dark/compact themes.
- No critical route, player, comment, or feed feature depends only on a raw obfuscated class.
- README, changelog, store checklist, and privacy copy are updated in the implementation release.

## Risks and Open Questions

- ~~Manifest `commands` violates the "no keyboard shortcuts" rule.~~ **Resolved in v4.5.3 (2026-05-21).** The entire `commands` block was stripped from `extension/manifest.json`; the `chrome.commands.onCommand` listener, the orphaned `togglePanelForTab`/`sendTabMessage` helpers, the `Ctrl+Alt+Y` in-page keydown handler, and the `SETTINGS_SHORTCUTS` constant/tooltips/badges in `extension/ytkit.js` were all removed. `toggleControlCenterDesc` was dropped from all 10 locale bundles. The Firefox `Ctrl+Shift+Y → Ctrl+Alt+Y` rebind in `scripts/manifest-patch.js` is now a no-op kept only as a comment. Sole activators: toolbar action button, in-page gear icon, popup.
- YouTube player redesign: `.ytp-delhi-modern`, action pills, overflow panels, and bottom controls are high-churn. Need fresh captures before large player UI work.
- Live chat: current MHTML captures do not include full iframe internals. Major live-chat work needs live-stream fixtures.
- Store policy: download, ad/promo skip, age-restriction bypass, and Cobalt/direct-stream features may require GitHub-full only.
- RYD accuracy: dislike counts for post-2021 and low-traffic videos are estimates. UI must disclose this.
- SponsorBlock/DeArrow API terms and rate limits: card-level use must remain conservative and cache-bounded.
- AI summaries: provider APIs create privacy and cost risk. Keep opt-in, BYO key/local-first, and clearly labelled.
- Extension ecosystem trust: malicious YouTube-enhancer-like extensions are an active public concern. Avoid broad permissions, remote code, analytics, and opaque update behavior.
- Full settings schema migration: 354 flat keys require careful migration tests and import/export compatibility.
- Userscript parity: MV3-only features need clear graceful degradation in the userscript.
- Performance: rich grid cards recycle aggressively; visibility-bound processing and LRU caches are mandatory.

## Definition of Done

`v6.0.0` is done when:

- Astra Deck has a categorized settings schema for every toggle.
- Every feature has `init()`, immediate apply where possible, and complete `destroy()`.
- Store-safe, GitHub-full, and userscript profiles are generated from one source of truth.
- Selector packs are capture-backed and tested against home, subscriptions, watch, comments, player, notifications, and live chat fixtures.
- The extension beats or matches every listed competitor category, with policy-based exclusions explicitly documented.
- All UI is dark/OLED, dense, accessible, reversible, and free of confirmation dialogs.
- No keyboard shortcuts are added.
- Third-party APIs are opt-in or narrowly scoped, rate-limited, and credential-safe.
- The local downloader is explicit, diagnostic, and bounded to `127.0.0.1`.
- Tests, lint, syntax checks, a11y audit, contrast audit, storage audit, version checks, build, and userscript parity all pass.
- A public README is produced in the implementation release, not in this planning-only run.
