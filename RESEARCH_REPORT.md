# Astra Deck Research Report

Deep-research and product-map pass conducted 2026-06-03. This is the canonical
research summary; actionable items live in [ROADMAP.md](ROADMAP.md) under
"Research-Driven Additions." Pre-consolidation source documents are archived at:

- `docs/archive/research/RESEARCH_FEATURE_PLAN.md`
- `docs/archive/research/RESEARCH_FEATURE_PLAN_PASS3.md`
- `docs/archive/roadmap-dossier-2026-05-21.md` (the legacy internal
  planning-track dossier labelled v5.0.0 -> v6.0.0: product plan, competitive
  matrix, feature catalog, and technical reconnaissance; not the shipped
  product-version line, which currently agrees at v4.46.0)

Claim labels: [Verified] = read in-tree or confirmed against a cited source;
[Likely] = strong inference from in-tree evidence; [Assumption] = reasonable
default not directly confirmed; [Needs validation] = requires a device, browser,
or maintainer action to confirm.

## 2026-06-04 Freshness Refresh

- [Verified] The live working tree has advanced beyond the 2026-06-03 report:
  NF6 companion self-update, NF2 nested subscription groups, dead-channel
  detection / unsubscribe staging, NF1 per-video notes, the group notifications
  digest, Study / Work export, feature-definition i18n, and store-safe /
  GitHub-full release artifact split, monthly yt-dlp smoke CI, and the
  selector-fixture match harness, and the Firefox programmatic-injection
  pre-flight are now
  represented in `ROADMAP.md`, `extension/ytkit.js`, docs, the packager,
  workflows, fixture generation, static checks, and hardening tests. The
  subscription implementation uses rendered-feed DOM heuristics, local
  last-visit data, and a 30-day local undo/staging window rather than a YouTube
  Data API unsubscribe path; the notes and study/work exports stay local-first
  with versioned JSON, Markdown, or CSV downloads; the settings-panel feature
  labels now resolve through the locale layer before falling back to inline
  English; the store-safe package now strips AI, Cobalt, and loopback host
  grants while GitHub-full keeps the complete data-flow catalogue; yt-dlp
  bumps now run through exact Python package pins plus a bounded real-download
  smoke workflow; selector fixture regeneration now proves `playerChrome` and
  `liveChat` selector-pack chains against decoded MHTML markup; Firefox
  pre-flight now blocks future programmatic injection APIs until their
  `moz-extension://` targets are reviewed; and the Flask `/download` boundary
  now rejects client-supplied yt-dlp argv/flag fields before queueing; storage
  growth for notes, timestamp bookmarks, watch progress, and watch-time stats
  is bounded at write time; and `policy-profile.js` scrub coverage now removes
  separator-aware API-key names plus password/credential/key-alias/cookie/
  token/bearer/secret/auth-shaped values before profile or forward-compat
  export passthrough; and Cobalt fallback failures now record an actionable
  `cobalt-fallback` diagnostic with origin-only endpoint context when Astra
  Downloader is offline; and a new long-session route/mutation stress test now
  pins shared observer count, scoped-rule early exits, capped diagnostic maps,
  and listener/observer cleanup; and a pinned v1 full-profile settings fixture
  now proves the 362-key settings schema migrates forward without unclassified
  drops.
- [Verified] Validation on 2026-06-04 after the profile-split artifact batch:
  `node --check build-extension.js`, `node --check extension/background.js`,
  `node --check tests/hardening.test.js`, `node --test tests/hardening.test.js`
  (421 checks), `npm run check`, `npm test` (616 checks), `npm run build`,
  ZIP manifest inspection for store-safe/full host grants, and
  `node sync-userscript.js` all passed. The build emitted store-safe and
  GitHub-full Chrome ZIP/CRX plus Firefox ZIP/XPI artifacts for v4.46.0.
- [Verified] Validation on 2026-06-04 after the monthly yt-dlp smoke batch:
  `node --check tests/yt-dlp-smoke-workflow.test.js`,
  `py -3.12 -m py_compile scripts/yt-dlp-smoke.py`,
  `node --test tests/yt-dlp-smoke-workflow.test.js` (3 checks),
  `py -3.12 -m pip install -r astra_downloader/requirements.txt`,
  `py -3.12 scripts/yt-dlp-smoke.py` (downloaded `dQw4w9WgXcQ.mp4`, 3441508
  bytes), `py -3.12 -m pytest astra_downloader` (117 tests), `npm run check`,
  `npm test` (619 checks), and `npm run build` all passed.
- [Verified] Validation on 2026-06-04 after the selector-resilience harness
  batch: `node --check scripts/build-selector-fixtures.js`,
  `npm run build:fixtures`, `node --check tests/selector-regression.test.js`,
  `node --test tests/selector-regression.test.js` (33 checks), `npm run check`,
  `npm test` (621 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the Firefox injection audit batch:
  `node --check scripts/check-firefox-injection.js`,
  `node scripts/check-firefox-injection.js`, `node --check
  tests/firefox-injection-audit.test.js`, and `node --test
  tests/firefox-injection-audit.test.js` (3 checks), `npm run check`,
  `npm test` (624 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the downloader request-field
  allowlist batch: `py -3.12 -m py_compile astra_downloader/astra_downloader.py`,
  `py -3.12 -m pytest astra_downloader/test_astra_downloader.py -q` (121
  tests), `npm run check`, `npm test` (624 checks),
  `py -3.12 -m pytest astra_downloader` (121 tests), `npm run build`,
  `node sync-userscript.js`, and `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the storage-growth cap batch:
  `node --check extension/ytkit.js`, `node --check YTKit.user.js`,
  `node --test tests/hardening.test.js tests/userscript-parity.test.js` (429
  checks), `npm run check`, `npm test` (628 checks), `npm run build`,
  `node sync-userscript.js`, and `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the policy-profile scrub coverage
  batch: `node --check extension/core/policy-profile.js`,
  `node --check tests/hardening.test.js`, and
  `node --test tests/hardening.test.js` (426 checks), `npm run check`,
  `npm test` (630 checks), `npm run build`, `node sync-userscript.js`,
  `node --check YTKit.user.js`, and `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the Cobalt fallback diagnostic
  batch: `node --check extension/ytkit.js`,
  `node --check tests/hardening.test.js`, and
  `node --test tests/hardening.test.js` (427 checks), `npm run check`,
  `npm test` (631 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the long-session memory-leak
  regression batch: `node --check tests/long-session.test.js` and
  `node --test tests/long-session.test.js` (1 check), `npm run check`,
  `npm test` (632 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the settings migration fixture
  batch: `node --check tests/settings-migration-roundtrip.test.js` and
  `node --test tests/settings-migration-roundtrip.test.js` (2 checks),
  `npm run check`, `npm test` (633 checks), `npm run build`,
  `node sync-userscript.js`, and `git diff --check` all passed.
- [Verified, external] Current source check did not create a new roadmap row:
  Chrome Web Store policy still keeps the single-purpose / no-remotely-hosted-
  code / permission-rationale items relevant; MDN's `scripting.executeScript`
  page is still the right Firefox MV3 compatibility anchor; Mozilla's Firefox
  128 MV3 MAIN-world support keeps the Firefox pre-flight item actionable; yt-dlp
  `2026.03.17` remains the latest stable release observed, with YouTube support
  explicitly called out as a churn risk; and YouTube Data API subscription reads
  require OAuth and have documented quota cost, supporting the local-first DOM
  staging approach for this slice.
- [Verified, external] Package/security freshness check: `npm audit --omit=dev
  --audit-level=moderate` is clean, `crx3` is current at 2.0.0, and ESLint has
  low-risk patch/minor drift (`10.2.1` installed; npm reports `10.4.1` current).
  The dirty companion source/test work in the live tree already targets the
  existing yt-dlp flag-allowlist roadmap row, so this pass updated that row's
  status instead of adding a duplicate.

## Executive Summary

Astra Deck is a mature, single-developer YouTube enhancement platform spanning a
Manifest V3 extension (Chrome/Edge/Brave/Firefox 128+), a Tampermonkey/Violent-
monkey userscript built from the same source, and a local Python/Flask + PyQt6 +
yt-dlp companion downloader. [Verified] It carries a 362-key flat settings schema,
27 `extension/core/` runtime modules, 11 peeled `extension/features/` modules, a
28-surface capture-provenanced selector-pack system, 10 bundled UI locales, and a
strong CI gate (syntax, versions, i18n, settings, no-eval, lint, a11y, contrast,
deps audit, plus a build/release workflow). [Verified]

The engineering arc is sound; the dominant risks are (1) **runtime DOM churn**
against YouTube's high-velocity redesigns, (2) **store-policy / trust surface**
from a broad permission and host set mitigated by profile-split artifacts,
(3) **upgrade data-safety** for the 362-key schema, and (4) **version-surface confusion** —
the product ships as 4.46.0 while older docs described an internal
planning-track "v5.0.0 foundation complete" and v5/v6 plan.

Top opportunities (one-liners):

1. Standing migration test that loads a pinned old-version settings blob and
   proves lossless forward migration (highest data-loss risk). [Verified]
2. Reconcile version surfaces — ship line is 4.46.x, not v5/v6. [Verified]
3. Per-permission justification + single-purpose store note before CWS/AMO. [Verified]
4. Settings import/export with schema validation + credential scrub (PocketTube
   sync is the competitive baseline; stay local-first). [Verified]
5. Firefox MV3 parity smoke gate before AMO (Enhancer-for-YouTube's Firefox gap
   is the clearest competitive opening). [Verified]
6. First-run onboarding + companion empty/permission states (no silent failure). [Verified]
7. WCAG 2.2 AA audit for in-page overlays, not just the popup. [Verified]
8. Document the yt-dlp cookie-handling threat model for the `cookies` permission. [Verified]
9. Disclose Return-YouTube-Dislike estimate accuracy in the UI. [Verified]
10. One-click scrubbed diagnostics export for bug reports / selector-rot repro. [Verified]

## Evidence Reviewed

- `package.json` (v4.46.0, node ≥22, crx3 dep, full `check`/`test` scripts). [Verified]
- `astra_downloader/requirements.txt` exact-pins `yt-dlp==2026.3.17` and
  `curl_cffi==0.15.0` for the scheduled extractor smoke gate, while retaining
  upper-major GUI/server dependency bounds. [Verified]
- `extension/manifest.json` (MV3 v4.46.0, 4 permissions, 19 full-profile host
  origins, document_start MAIN + ISOLATED dual-world content scripts, live-chat
  excluded from the main scripts). [Verified]
- `extension/core/` (27 modules: registry, selectors, navigation, api-limiter,
  trusted-html, predicate-sandbox, transcript-service, storage-manager,
  diagnostic-log, policy-profile, selector-health, settings-schema 107 KB, etc.). [Verified]
- `extension/features/` (11 peeled modules) and `extension/ytkit.js` (2.1 MB
  monolith) + `ytkit-main.js` MAIN-world bridge. [Verified]
- `extension/default-settings.json` (362 keys). [Verified]
- `astra_downloader/` (Flask + PyQt6 + yt-dlp companion; loopback 9751 + 5
  fallbacks; bearer-token + Host-header allowlist per `docs/architecture.md`). [Verified]
- `scripts/` (build, fixtures, i18n, storage audit, a11y/contrast audits,
  version/settings/no-eval checks, manifest-patch for Gecko). [Verified]
- `.github/workflows/build.yml`, `validate.yml`, and `yt-dlp-smoke.yml` (test +
  check gate, tag-driven release with version-surface verification, and monthly
  `workflow_dispatch` yt-dlp extractor smoke). [Verified]
- `tests/` (19 spec files incl. hardening, selector-regression,
  settings-migration-roundtrip, userscript-parity). [Verified]
- `docs/architecture.md`, `docs/cws-submission-checklist.md`,
  `docs/screen-reader-smoke.md`, `docs/signing-keys.md`. [Verified]
- `git log -30` (active feature-peel cadence; parallel development in flight). [Verified]
- Competitive / standards landscape: SponsorBlock, DeArrow, Return YouTube
  Dislike, Enhancer for YouTube, Improve YouTube, PocketTube, BlockTube, Unhook;
  Chrome Web Store MV3 program policy; AMO Firefox MV3; WCAG 2.2 AA; yt-dlp
  cookie-handling advisories. [Verified, external]

## Current Product Map

Four moving parts communicating across three trust boundaries (per
`docs/architecture.md`): [Verified]

1. **MV3 extension** (`extension/`) — content scripts inject at `document_start`
   in both MAIN (`ytkit-main.js`) and ISOLATED (`core/*` + selector packs +
   `ytkit.js`) worlds; a dedicated all-frame injection handles the live-chat
   iframe; `background.js` is the service worker.
2. **Userscript** (`YTKit.user.js`) — built from `extension/ytkit.js` via
   `sync-userscript.js`; parity guarded by `userscript-parity.test.js`.
3. **Astra Downloader** — Python companion, HTTP on `127.0.0.1:9751` (+ five
   fallback ports), bearer-token auth + DNS-rebinding Host-header defense.
4. **Toolbar popup** — the only settings surface (the options page was retired in
   v3.19.0).

Target surface: YouTube desktop web + `youtube-nocookie.com` + `youtu.be` +
live-chat iframe + `i.ytimg.com`; `m.youtube.com` and `studio.youtube.com`
excluded by design. [Verified]

## Feature Inventory

| Area | Where | Maturity | Coverage |
|------|-------|----------|----------|
| Sponsor/segment skip (SponsorBlock) | `extension/ytkit.js`, `sponsor.ajay.app` host | Shipped | Hardened, rate-limited [Likely] |
| Title/thumbnail (DeArrow-class) | settings schema + `ytkit.js` | Shipped | [Likely] |
| Return YouTube Dislike | `returnyoutubedislikeapi.com` host | Shipped | No estimate-disclosure UI [Verified] |
| Feed/comment/channel filtering (BlockTube-class) | `features/video-hider/`, `ytkit.js` | Shipped | ReDoS-guarded; channel-key cache [Verified] |
| Subscription groups (PocketTube-class) | subscription-groups feature | Shipped | Depth-2 groups, dead-channel staging, and group digest are shipped; external sync remains absent [Verified] |
| Theater split / sticky player | `features/sticky-video/`, `player-dock/` | Shipped | Lifecycle-unified chat observer [Verified] |
| Theming / OLED tokens | `features/theme-css/`, `wave-8-css/`, `home-subs-css/` | Shipped | Schema-driven [Verified] |
| Transcript viewer + IndexedDB search | `core/transcript-service.js` | Shipped | [Verified] |
| Study / Work export | `researchSpacedReview` feature | Shipped | Markdown/CSV export from watch time, focused mode, digital wellbeing, and timestamp bookmarks [Verified] |
| AI summary (BYO key / local) | OpenAI/Anthropic/Gemini + Ollama hosts | Shipped, opt-in | GitHub-full artifact only [Verified] |
| Downloader companion | `astra_downloader/` | Shipped | Self-update endpoint and popup action; local loopback grants stay GitHub-full [Verified] |
| Per-video notes | `videoNotes` feature | Shipped | Local-first notes, versioned export, 1000-note LRU cap [Verified] |
| Settings import/export | — | Gap | No first-class surface [Verified] |
| Selector-pack health | `core/selector-health.js` | Shipped | Now reports attribute-shape drift [Verified] |

## Competitive Landscape

- **SponsorBlock / DeArrow** (same author): community-sourced segment skip and
  title/thumbnail correction; 4.7★; the de-facto baseline Astra already mirrors. [Verified]
- **Enhancer for YouTube**: deep player control (quality/codec/FPS, popup player)
  but documented Firefox reliability gaps and YouTube-update compatibility churn —
  the clearest opening for Astra cross-browser parity. [Verified]
- **Improve YouTube!**: open-source, frequent updates, strong Firefox support —
  Astra's nearest open-source rival on reliability. [Verified]
- **PocketTube** (200k+ users): nested subscription groups, custom icons,
  "play all," and cross-device sync via Google Drive / Chrome profile — Astra's
  subscription roadmap is differentiated by local-first but lacks sync/import-export. [Verified]
- **BlockTube**: rule-based filtering; Astra's filter engine is the planned
  superset (predicate-sandbox already exists for safe DSL evaluation). [Verified]
- **Return YouTube Dislike**: estimate-based for post-2021/low-traffic videos —
  Astra surfaces counts but does not yet disclose the estimate caveat. [Verified]

Standards: Chrome Web Store MV3 program policy (no remotely hosted code;
single-purpose; per-permission justification; specific host patterns over
`<all_urls>`). Astra correctly avoids `<all_urls>` but bundles a broad feature
set + sensitive permissions, raising the single-purpose/justification bar. WCAG
2.2 AA adds focus-appearance and target-size criteria relevant to in-page
overlays. yt-dlp has a cookie-leak advisory class (cross-host leakage on
redirect, CVE-2023-35934) relevant to the `cookies` permission. [Verified]

## Quality & Friction Findings

- **[High] Upgrade data-safety.** 362 flat keys + `unlimitedStorage`; the existing
  round-trip test does not load a pinned old-version blob → silent config loss on
  a botched migration is the top data-loss risk. → ROADMAP P0 migration test. [Verified]
- **[High] Version-surface confusion.** Ship line 4.46.0 vs documented internal
  planning-track "v5.0.0 complete" / v5-v6 plan; a contributor or reviewer
  cannot tell releases from planning. → ROADMAP P1 version reconciliation.
  [Verified]
- **[Med] Onboarding / empty-state friction.** Popup is the only surface; the
  companion connection fails silently until the user happens to launch the
  PyInstaller app. → ROADMAP P2 onboarding + empty/permission states. [Verified]
- **[Med] No first-class backup.** No settings import/export → no cross-browser
  migration and no recovery path, while PocketTube ships sync. → ROADMAP P1
  import/export with scrub. [Verified]
- **[Med] Diagnostics trapped in console.** `diagnostic-log` / `selector-health`
  exist but cannot be exported for an issue. → ROADMAP P3 diagnostics bundle. [Verified]
- **[Low] RYD estimate not disclosed.** → ROADMAP P2 estimate affordance. [Verified]

## Architecture & Technical Findings

- **Boundaries** are clean and documented: three explicit trust boundaries,
  dual-world content scripts, bearer-token + Host-header companion. [Verified]
- **Persistence**: `chrome.storage` + `chrome.storage.session` for transient SW
  state; IndexedDB for transcripts; `unlimitedStorage`. Growth bounds for
  `videoNotesData`, `ytkit-bookmarks`, `ytkit-watch-progress`, and
  `ytkit-watch-time` now run at write time with deterministic eviction in the
  extension and userscript paths, plus an extension `storageQuotaLRU` backstop.
  [Verified]
- **Concurrency / lifecycle**: `feature-lifecycle.js`, `lifecycle-route-bridge.js`,
  and AbortController machinery shipped; per-category adoption is deferred to a
  multi-slice initiative (Existing Planned Work). [Verified]
- **Error handling**: a custom `require-catch-reason` lint rule now spans
  `core/*.js` and `ytkit.js`; silent catches must carry a `reason:`. [Verified]
- **Dependency health**: minimal npm deps (`crx3`, `eslint`); `npm audit`
  gated in CI; yt-dlp is the highest-churn dependency and now has exact
  package pins plus a monthly/manual smoke workflow that downloads a bounded
  YouTube fixture before extractor bumps are trusted. [Verified]
- **Testability**: 19 spec files including hardening (474 KB),
  selector-regression, and userscript-parity; in-page overlay a11y is not yet
  automated. [Verified]
- **Dead code**: `ytkit.js` retains inline feature objects as compatibility
  fallbacks after peeling — intentional, not dead, but a long-tail cleanup target. [Likely]
- **Release automation**: `workflow_dispatch` + tag-driven build/release with a
  `check-versions --tag` gate and `gh release` upload — matches the house CI
  standard; Firefox build is patched but not smoke-tested (ROADMAP P1). [Verified]

## Security / Privacy / Data Safety

- **Permission surface** [Verified]: `cookies`, `downloads`, `unlimitedStorage`,
  `storage`; 19 GitHub-full host origins incl. three AI providers, Cobalt,
  Reddit, and seven loopback ports. No `<all_urls>`; specific patterns used.
  Store-safe build artifacts now strip AI, Cobalt, and loopback grants/CSP, but
  the breadth of the full package still raises the single-purpose/justification
  bar (ROADMAP P1 store note).
- **No remote code** [Likely]: `check-no-eval.js` gate + MV3 prohibition; consistent
  with policy.
- **Credential handling** [Verified]: `policy-profile.js` scrubs gated/credential
  fields; AI keys are BYO and must never appear in exports/diagnostics — which is
  exactly why import/export (P1) and diagnostics export (P3) must run through the
  scrubber, and R6 (finish scrub-regex coverage) is in Existing Planned Work.
- **Companion** [Verified]: loopback-only (`127.0.0.1`, never `localhost`),
  bearer-token, DNS-rebinding Host-header defense, yt-dlp pinned, and Flask
  `/download` request-field allowlisting that blocks client-supplied yt-dlp
  argv / flag payloads before queueing. The yt-dlp cookie-leak class warrants a
  written threat model (ROADMAP P2).

## UX & Accessibility

- Popup a11y + contrast are CI-gated; `docs/screen-reader-smoke.md` is a manual
  procedure. [Verified]
- In-page overlays (theater split, transcript, notes, subscription manager,
  toasts) have no automated a11y gate and are the WCAG 2.2 AA target-size /
  focus-appearance risk (ROADMAP P2). [Verified]
- House rules honored: dark/OLED, dense, no confirmation dialogs, no keyboard
  shortcuts (the `commands` surface was removed in v4.5.3). [Verified]

## Explicit Non-Goals

- `m.youtube.com` and `studio.youtube.com` support (excluded by design). [Verified]
- Keyboard shortcuts (removed in v4.5.3; must not return). [Verified]
- Remotely hosted code / analytics / opaque auto-update (trust posture). [Verified]
- Cloud account sync as a default — Astra stays local-first; any sync must be
  explicit and opt-in (contrast with PocketTube's Google-Drive sync). [Assumption]

## Open Questions

- Downloader signing budget and CWS/AMO submission intent (gates the signed
  installer work). [Needs validation]
- Live-stream MHTML capture window for full live-chat iframe internals — repeated
  headless-capture timeouts mean this needs a manual/stable-browser save path.
  [Needs validation]
- Real-browser QA for the DOM-heuristic dead-channel staging flow, especially on
  large subscription feeds and YouTube layouts outside the current rendered-card
  selectors. [Needs validation]
- Whether the v5/v6 numbering should be retired entirely or formally re-baselined
  onto the 4.46.x line. [Needs validation]
- Lifecycle-migration cadence and which feature category owners are available for
  the paired DOM-walking peels + visible-behaviour QA. [Needs validation]
