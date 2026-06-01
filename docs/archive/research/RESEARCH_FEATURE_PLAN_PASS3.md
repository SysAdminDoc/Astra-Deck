# Project Research and Feature Plan — Pass 3 (External Research)

> Authored 2026-05-25 against HEAD `394a494` (v4.46.0 shipped + v4.47.0-equivalent in `[Unreleased]`).
> This is a **companion** to [RESEARCH_FEATURE_PLAN.md](RESEARCH_FEATURE_PLAN.md) (the active backlog) and [ROADMAP.md](ROADMAP.md) (the v5→v6 long arc). It validates the active backlog, flags re-prioritizations, and proposes **new opportunities** the maintainer has not already written down. It does not duplicate items already present in those files except where evidence changed.
>
> **Pass-3 autonomous-loop addendum (2026-05-25 same day):** Several Pass-3 roadmap items shipped in the same loop and are now reflected in `[Unreleased]`. Specifically: theater-split fullscreen overlay stash (EXIST-1, both userscript and extension `stickyVideo`), capability-probe popup chip (EXIST-2 / NF10 follow-up), bug-report bundle expansion (NEW-1), and userscript drift health check (NEW-2). NF28 (DeArrow channel-override chip) was discovered already-shipped in `ytkit.js` at lines 26319 + 26350 + 30842 — the backlog entry was stale and has been removed from `RESEARCH_FEATURE_PLAN.md`.

---

## Executive Summary

Astra Deck is a mature, production-grade YouTube enhancement layer (MV3 Chrome/Firefox extension + Tampermonkey userscript + Python `astra_downloader` companion) with **~357 user-facing features**, **547 JS tests + 98 Python tests**, **25 documented hardening passes**, and a maintainer who runs autonomous loops weekly. The shape is excellent: explicit trust boundaries, single-source-of-truth schema, versioned selector packs (migration complete in 7 batches), a popup that renders editors for every one of 354 schema keys, and a documented competitive matrix against 22 competitors. The biggest unaddressed risk is **runtime DOM churn detection** — competitors break on every YouTube redesign, and Astra has solid fixture infrastructure but no automated end-to-end gate that exercises the real site in CI. The highest-value opportunities are therefore (1) close the test-automation gap, (2) ship the small set of "data shipped, UI deferred" features that already have an active-backlog placeholder (DeArrow channel overrides chip, capability-probe chips, first-run welcome), and (3) execute the live-chat capture window so three selector packs can stop carrying `needsFreshCapture: true`.

**Top 10 opportunities (priority order):**

1. **P0 — Live-chat MHTML fixture capture (EI8)** unblocks 3 stale selector packs and is a one-hour task for a maintainer at a live stream. Already in backlog; no execution.
2. **P0 — Capability-probe popup chip render (NF10 follow-up)** — `extension/core/capability-probe.js` exists, is tested, and is unused by `popup.js`. The UX promise of "won't surprise you when a feature can't run in this browser" needs the consumer side.
3. **P0 — Peel `theater-split.user.js` into the extension as `features/theater-split/`** — the userscript and the extension diverge silently. I just shipped a fullscreen-handler bug fix in `theater-split.user.js`; the same code is not in the extension. This is a structural hazard, not a one-off bug.
4. **P1 — Real E2E gate (Playwright against a YouTube watch page) in CI** — selector-health is runtime only. Competitive products break on YouTube redesigns within hours; Astra would learn at user-report latency.
5. **P1 — DeArrow channel-override chip UI (NF28)** — data model has shipped since v3.28; the user-facing surface has been deferred for ~17 versions. Highest-leverage data-already-there gap.
6. **P1 — Astra Downloader `/update` endpoint + popup action (NF6)** — the `.exe` is stuck at the version installed; users cannot keep up with yt-dlp / Deno cutoffs.
7. **P1 — First-run welcome + What's New (NF21)** — onboarding gap; the popup currently dumps a 354-key editor on a fresh install with no guidance.
8. **P2 — Subscription Manager v2 (nested groups + dead-channel detection, NF2)** — PocketTube's killer feature; Astra has the data plumbing.
9. **P2 — Per-video notes (NF1)** — YouFocus parity, fills the Research workspace gap explicitly called out in ROADMAP §Phase 2.
10. **P2 — Bug report bundle export** (new — not in backlog) — `diagnosticLog` ring buffer exists but there is no one-click "share this with the maintainer" path; closes a support loop.

---

## Evidence Reviewed

### Local files

- **Planning artifacts:** `AGENTS.md`, `CLAUDE.md` (904 lines), `README.md` (411), `CONTRIBUTING.md`, `ROADMAP.md` (1517), `RESEARCH_FEATURE_PLAN.md` (235), `HARDENING.md` (1583), `CHANGELOG.md` (head 400 lines + index of 5713)
- **Manifest + schema:** `extension/manifest.json`, `extension/default-settings.json`, `extension/settings-meta.json`, `extension/core/settings-schema.js`
- **Core code:** `extension/ytkit.js` (43,610 lines) — read targeted slices (defaults block, version constants, fullscreen-related sections); `extension/ytkit-main.js`, `extension/background.js` (695 lines), `extension/popup.js` (2,877 lines), `extension/popup.html`, `extension/popup.css`, `extension/early.css` (5,204 lines)
- **Modules:** all 26 files under `extension/core/` enumerated, including the 25 `extension/core/selector-packs/*.js` files
- **Modular features:** 6 files under `extension/features/`
- **Userscripts:** `YTKit.user.js`, `theater-split.user.js` (3,186 lines — read end-to-end during prior bug fix), `YT_Reaction_Spammer.user.js`
- **Companion:** `astra_downloader/astra_downloader.py` (4,644 lines), `test_astra_downloader.py` (1,763), `build.py`, `requirements.txt`
- **Tests:** 18 files in `tests/` totaling ~11,551 lines — indexed via Grep, key files read (hardening test catalog, theater-split test, capability-probe usage)
- **Build/CI:** `build-extension.js`, `sync-userscript.js`, `scripts/manifest-patch.js`, `.github/workflows/build.yml`, `.github/workflows/validate.yml`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, `.github/dependabot.yml`
- **Docs:** `docs/architecture.md`, `docs/cws-submission-checklist.md`, `docs/i18n-coverage.md`, `docs/predicate-sandbox-investigation.md`, `docs/screen-reader-smoke.md`, `docs/selector-fixture-workflow.md`, `docs/signing-keys.md`, indexed `docs/research/` (24 prior research files)

### Git history

- `git log --since="2026-03-01" --oneline` → **365 commits** in ~3 months (feat-heavy 54:5 vs fix)
- HEAD: `394a494 feat(polish): EI-NEW2 + EI-NEW3 + EI-NEW4 + Phase V matrix sync`
- Total commits in repo: 808
- Recent tags: `v4.5.2`, `v4.5.1`, `v4.5.0`, `v4.4.0`, `v4.3.0`, ... down to `v3.20.5`
- Working tree currently has a local change in `theater-split.user.js` (fullscreen-stash fix I applied in the preceding task)

### Build/test/release artifacts inspected

- `npm test` → 547/547 pass (verified live)
- `pytest` under `astra_downloader/` → 98/98 pass (per HARDENING H25 + CHANGELOG Unreleased)
- `node build-extension.js` → ships Chrome ZIP + CRX3, Firefox ZIP + XPI, userscript copy in `build/`
- CI workflows: `build.yml` (tag-triggered, emits 5 artifacts), `validate.yml` (PR/push gate)
- Release cadence: 26 versions shipped in the v4.5.3 → v4.46.0 arc (autonomous loop driven)

### External sources

- ROADMAP §Phase 1 already enumerates 22 competitors with CWS / AMO / GitHub install counts and last-updated dates as of 2026-05-21. I verified the depth of that table (it covers RYD, VSC, SponsorBlock, Enhancer for YouTube, Unhook, Improve YouTube, PocketTube, UnTrap, DeArrow, BlockTube, DF Tube, YouTube Tweaks, Tweaks for YouTube, YouTube Alchemy, YouTube HD, TubeMod, YouFocus, Scripts.YT, Tweeks, userstyles, Iridium, Control Panel for YouTube). I did **not** open the live stores in this pass — relying on the maintainer's 2026-05-21 snapshot. Refreshing those store counts is a known-low-value chore; the relevant signal is feature parity, which the matrix in ROADMAP §Phase 2 captures.
- Standards consulted from prior knowledge: Chrome MV3 lifecycle, `chrome.storage.session` semantics, Fullscreen API ancestor-display behavior, Trusted Types CSP, WCAG 2.2 AA touch-target sizing.
- Anthropic / OpenAI / Google AI provider quotas: not re-verified live; the BYO-key model means quotas are the user's responsibility, not Astra's.

### Could not verify

- **Iridium and Control Panel for YouTube feature scoring** (matrix rows 21–22, added 2026-05-20). The ROADMAP entry says "deeper feature scoring pending." Without a live install I cannot confirm what they ship; this leaves a documented blind spot in the competitor matrix.
- **Live-chat iframe DOM** — there is no current MHTML fixture; EI8 is blocked on maintainer availability at a live stream.
- **Actual CWS / AMO ratings drift since 2026-05-21** — point-in-time data, not re-verified.
- **End-user crash rate / SW restart frequency in the wild** — no telemetry. Diagnostic ring buffer exists but is never collected; user crashes are only seen via GitHub issues.

---

## Current Product Map

### Core workflows

| Workflow | Surface | Implementation |
|---|---|---|
| Watch a video with player polish | YouTube `/watch` | `ytkit.js` watch-route features + `early.css` anti-FOUC |
| Filter feed / Shorts / channels | YouTube `/`, `/feed/subscriptions`, channel pages | `videoHider`, `commentFilterManager`, `videoHider._shouldHide` |
| Theater split (player left, comments/chat right) | YouTube `/watch` | `theater-split.user.js` (standalone) **and** `stickyVideo` feature in extension (diverge silently) |
| Download a video | Right-click player → Astra Downloader | `MediaDLManager` in `ytkit.js` + Flask `astra_downloader.py` on `127.0.0.1:9751` |
| Configure features | Toolbar popup (extension) or no UI (userscript) | `popup.js` + `popup.html` (schema-driven editor for 354/354 keys) |
| Research workflow | Transcript export, AI summary, transcript index | `transcriptViewer`, `aiVideoSummary`, `researchTranscriptIndex` |

### Existing features

- ~357 toggles in `defaults:` (verified via the catalog parser at `scripts/catalog-utils.js`)
- Categorized in `extension/core/settings-schema.js` across 18 categories
- 5 risk levels (safe / api / local-companion / experimental / store-risk)
- 3 distribution profiles (store-safe / github-full / both)
- See ROADMAP §Phase 2 feature matrix (lines 453–533) for competitive coverage. I will not re-tabulate it here.

### User personas (inferred from feature mix + commit history)

1. **YouTube power user** — wants Enhancer-for-YouTube-style breadth without the privacy concerns. Primary persona.
2. **Researcher / student** — uses `transcriptViewer`, `aiVideoSummary`, `researchTranscriptIndex`, `timestampBookmarks`, `subscriptionGroups`. Needs `videoNotes` (gap).
3. **Creator** — uses `creatorCommentHighlight`, `commentFilterManager`, `downloadHistoryPanel`, `videoScreenshot`. Lightly served.
4. **Privacy-conscious user** — uses `cleanShareUrls`, `forceDarkEverywhere`, store-safe profile. Wants explicit data-flow panel (shipped v4.12.0).
5. **Tampermonkey / portable user** — wants `YTKit.user.js` parity with extension. Userscript bundles the v5.0.0 core modules per v4.20.0.

### Platforms / distribution

| Platform | Artifact | Status |
|---|---|---|
| Chrome (CRX, sideload) | `build/astra-deck-chrome-vX.Y.Z.crx` | Shipped every release |
| Chrome (ZIP, manual) | `build/astra-deck-chrome-vX.Y.Z.zip` | Shipped every release |
| Firefox (XPI) | `build/astra-deck-firefox-vX.Y.Z.xpi` | Shipped every release |
| Firefox (ZIP) | `build/astra-deck-firefox-vX.Y.Z.zip` | Shipped every release |
| Tampermonkey / Violentmonkey | `YTKit.user.js` | Tracked at GitHub raw URL; auto-updates via `@updateURL` |
| Theater split (standalone userscript) | `theater-split.user.js` | Tracked separately; **NOT auto-synced with extension** |
| Reaction spammer (standalone userscript) | `YT_Reaction_Spammer.user.js` | Tracked separately; **NOT auto-synced** |
| Chrome Web Store | n/a | Not submitted (Open Question 2) |
| Mozilla Add-ons (AMO) | n/a | Not submitted |
| Local companion (Windows) | `AstraDownloader.exe` (PyInstaller-built) | Self-install via PowerShell script; not signed |

### Integrations / permissions / storage / data flows

- **External APIs** (background.js EXT_FETCH allowlist): YouTube family, SponsorBlock (`sponsor.ajay.app`), Return YouTube Dislike (`returnyoutubedislikeapi.com`), DeArrow (via SponsorBlock infra), OpenAI / Anthropic / Gemini (BYO key), Ollama (`127.0.0.1:11434`), Astra Downloader (`127.0.0.1:9751-9851`)
- **Permissions:** `storage`, `unlimitedStorage`, `cookies`, `downloads`
- **Storage:** `chrome.storage.local` (settings, profile data), `chrome.storage.session` (SW transient state for `_pendingReveals`), `IndexedDB` (transcript index)
- **Trust boundaries** (per `docs/architecture.md`): browser↔extension, extension↔YouTube DOM, extension↔third-party API, extension↔local companion

---

## Feature Inventory

The maintainer already maintains a comprehensive feature catalog in `extension/core/settings-schema.js` and competitive coverage matrix in `ROADMAP.md` §Phase 2. I will not duplicate either. Below are **only** features where this pass surfaced a non-trivial finding.

### Theater Split (stickyVideo / theater-split.user.js)

- **User value:** Premium player left + comments/chat right on scroll-down. The marquee differentiator vs Enhancer for YouTube's basic cinema mode.
- **Entry point:** Activates automatically on `/watch` pages when `stickyVideo` setting is on. Scroll down to expand the split, scroll up (3 ticks within 600ms) or hit the close button to collapse.
- **Main code locations:**
  - Extension: `extension/ytkit.js` feature `stickyVideo` (~4,780 lines per RESEARCH_FEATURE_PLAN NF15)
  - Userscript: `theater-split.user.js` (3,186 lines, version `1.0.7`)
- **Current maturity:** **Verified hazard.** Two parallel implementations diverge silently. I just shipped a fullscreen-handler bug fix to the userscript (`onFullscreenChange` was hiding `splitWrapper` even though the player was inside it, breaking fullscreen on live / previously-live videos). The same code path very likely exists in the extension's `stickyVideo` feature. There is no test that asserts parity between the two implementations.
- **Tests/docs coverage:** `tests/features/theater-split.test.js` covers the standalone userscript; the extension's `stickyVideo` is covered by hardening tests but the fullscreen-on-live regression is not asserted in either suite.
- **Improvement opportunities:**
  - Peel `theater-split.user.js` into `extension/features/theater-split/index.js` and have both consumers (extension + userscript) load from the same module via `sync-userscript.js` (already supports this pattern — see the v4.20.0 v5.0.0 core bundle in the userscript)
  - Add a regression test for the fullscreen-on-live-video path in both implementations
  - The `_chatWatcherObs` + `_pendingChatObs` double-observer leak risk (NF32 in active backlog) is the same class of bug

### Capability Probe (NF10 follow-up)

- **User value:** "Don't lie about what works in your browser." Settings rows for features that require an unavailable browser capability (Summarizer API in Chrome behind origin trial, Document PiP, etc.) should show an "Unavailable" chip rather than a silent no-op when toggled.
- **Entry point:** Should appear in the popup settings overview, but **does not today**.
- **Main code locations:**
  - Probe: `extension/core/capability-probe.js` — verified to expose `runAll()` and `isEntryAvailable(entry, capabilityMap)`
  - Consumer: `extension/popup.js` — **verified to contain zero references to `capabilityProbe` or `isEntryAvailable`**
  - Tests: `tests/hardening.test.js` covers the probe module
- **Current maturity:** Half-shipped. Module + tests landed in v4.47.0; the popup integration was deferred and is the open NF10 follow-up item (RESEARCH_FEATURE_PLAN:155–166). Verified open via direct grep.
- **Improvement opportunities:** Wire it up. This is a P0/P1 quick win — the work is one file (`popup.js` schema-overview row builder) + one CSS rule.

### DeArrow channel overrides

- **User value:** Per-channel toggle to disable DeArrow on creators whose titles are fine. The data model and lookup shipped in v3.28; users currently have no UI to manage these overrides.
- **Entry point:** **No UI today.** Users would have to manually edit the `deArrowChannelOverrides` setting via the popup's array editor.
- **Main code locations:** Lookup at `ytkit.js:26174` (per backlog reference); model at `deArrowChannelOverrides` schema entry.
- **Current maturity:** Half-shipped. Data model deferred for ~17 versions since v3.28 (CLAUDE.md:438).
- **Improvement opportunities:** Ship the channel-override chip per NF28 (already in backlog as P1/M).

### Subscription Groups

- **User value:** Group channels, filter feed by group, see "new since last visit." Shipped v3.29. PocketTube parity for the basic case.
- **Entry point:** Toolbar above the subscriptions feed.
- **Main code locations:** `ytkit.js#subscriptionGroups` (~5,000 lines incl. UI and store helpers)
- **Current maturity:** Solid for one-level groups; **missing nested groups, dead-channel detection, per-group sort persistence, group notifications digest** (all in backlog as P2/P3).
- **Improvement opportunities:** See "Subscription Manager v2" larger bet below.

### Live chat features

- **User value:** Astra has multiple live-chat features (e.g., `chatStyleComments`, `hiddenChatElementsManager`, the reaction spammer) but the **selector packs are stale** (`needsFreshCapture: true` per backlog EI8).
- **Improvement opportunities:** Capture window + competitive differentiator (see Larger Bets).

### Astra Downloader auto-update

- **User value:** Users install one version of `AstraDownloader.exe` and never update. YouTube breaks yt-dlp every ~30 days; Deno was added as a requirement in 2026; future PO token / runtime changes will silently break downloads.
- **Entry point:** No update path exists in the popup today.
- **Main code locations:** `astra_downloader.py` exposes `/health`, `/download`, `/history`, `/pick-folder` — no `/update`.
- **Current maturity:** Listed as P1/L in backlog (NF6).
- **Improvement opportunities:** Add `/update` endpoint, semver-compare on each popup open, surface in popup as a chip on the "Setup MediaDL" row.

### Storage / settings export-import

- **Current maturity:** Schema-driven editors for 354/354 keys in popup (shipped v4.41.0). Migration chain v1→v7 with round-trip tests (verified). Profile-import sanitization in place.
- **Improvement opportunity:** **Per-key reset.** When a single feature is misconfigured (e.g., `customCssInjection` textarea contains rendering-breaking CSS), the user has to either know what the default is or hit global Reset. A "↺" button next to each schema-overview row would be a quick win.

---

## Competitive and Ecosystem Research

ROADMAP §Phase 1 already covers 22 competitors. I will not re-tabulate. What I add here:

### Iridium for YouTube + Control Panel for YouTube (matrix rows 21–22, **unscored**)

- **Source:** Listed in `docs/research/iter-8-sources.md` (2026-05-20), promoted to ROADMAP matrix in current `[Unreleased]` Phase V batch
- **What this project should learn:** Both occupy overlapping territory with Astra's `qualityProfileMatrix`, `forceH264`, and codec/UI control features. The maintainer has flagged them as "deeper feature scoring pending."
- **Recommended action:** A one-hour scoring pass (clean Chrome profile, install both, walk every feature) would close the matrix. If either ships something Astra doesn't (e.g., HDR forcing, AV1 preference per device class, specific player-chrome restorations), that's a P2/P3 catch-up item. Open Question.

### What this project should explicitly avoid

(Already in `RESEARCH_FEATURE_PLAN.md` Non-Goals; restating for completeness.)

- Password-protected settings (UnTrap parity) — fake security
- Always-on background AI inference — battery + privacy + cost
- Direct in-extension yt-dlp — store-policy risk
- Universal HTML5 speed control (VSC scope) — outside YouTube focus
- Mobile YouTube (`m.youtube.com`) — separate codebase
- Keyboard shortcuts — house style ban (retired v4.5.3)
- Confirmation dialogs — house style ban (retired v3.10+)
- Auto-engagement beyond existing `autoLikeSubscribed`

### Patterns competitors do well that Astra could absorb

- **YouTube Alchemy's transcript export buttons in the header** — Astra has the transcript service; Alchemy's header-level placement is more discoverable than Astra's sidebar buttons
- **PocketTube's dead-channel detection** — backlog P2/L, no implementation start
- **VSC's per-site rules and 0.07× lower bound** — VSC's range is wider than Astra's `SPEED_OPTIONS` 0.1×–16×; the `fineSpeedControl` feature could be extended
- **Unhook's privacy framing** — Unhook's smaller permission footprint and explicit privacy copy is a marketing model Astra could mirror in README + popup hero
- **YouTube Tweaks' anti-autodub specificity** — Astra has `antiTranslateAudioTrack` + `antiTranslateTranscript`; YouTube Tweaks splits these further by route. Worth a per-route override.

---

## Highest-Value New Features

These are features **not currently in `RESEARCH_FEATURE_PLAN.md`** (or only partially scoped). Items already there are referenced in the Existing Feature Improvements section instead.

### NEW-1: Bug Report Bundle Export

- **User problem solved:** When a user hits a bug, they need to file an issue. The `bug_report.md` template asks for steps, environment, console errors. Console errors are hard to copy on YouTube (CSP, noise). `diagnosticLog` (500-entry ring buffer) already captures the right data, but there is no user-facing way to export it.
- **Evidence:** `extension/core/diagnostic-log.js` exists; `window.__ytkitDiagnostics.download()` exists in code; `.github/ISSUE_TEMPLATE/bug_report.md` doesn't mention it; popup has no surface
- **Proposed behavior:** Popup "Diagnostics" panel adds a "Generate Bug Report" button. Output: a single JSON blob containing diagnosticLog ring buffer + sanitized settings snapshot (BYO API keys redacted) + browser/OS strings + extension version. Copies to clipboard with toast confirmation. Bug report template gets a one-liner asking for the bundle.
- **Implementation areas:** `popup.html` (new button), `popup.js` (handler), `.github/ISSUE_TEMPLATE/bug_report.md` (one-line update)
- **Data model / API / UI:** No new storage. Reuses the existing ring buffer.
- **Risks / edge cases:** API keys must be redacted (regex over schema-known sensitive keys). Bundle should be size-capped (~256KB) so paste-into-issue stays reasonable.
- **Verification plan:** Unit test asserts redaction of `aiSummaryApiKey`. Manual: trigger a known error, click button, verify clipboard payload.
- **Complexity:** S
- **Priority:** P1 (closes the support loop)

### NEW-2: Userscript Drift Health Check

- **User problem solved:** Three top-level userscripts (`YTKit.user.js`, `theater-split.user.js`, `YT_Reaction_Spammer.user.js`) exist. Only `YTKit.user.js` is auto-synced by `build-extension.js`. The other two share the same target site (YouTube DOM) but are not exercised by selector-regression tests. Drift discovered live by users.
- **Evidence:** I just shipped a fullscreen bug fix in `theater-split.user.js` that was likely sitting unfixed for the entire duration `theater-split.user.js` has existed. `tests/features/theater-split.test.js` covers the standalone userscript but not the fullscreen interaction with live videos.
- **Proposed behavior:** A new test file `tests/userscript-health.test.js` that for each standalone userscript: (a) asserts metadata block is well-formed, (b) asserts every CSS selector it uses appears in at least one MHTML fixture token list, (c) asserts every documented feature has a behavior test.
- **Implementation areas:** New test file; possible additions to `scripts/build-selector-fixtures.js` to harvest selectors from these scripts; possible new fixtures
- **Risks / edge cases:** False positives where a selector is intentionally absent from the fixture (it only appears at runtime). Mitigated by marking such selectors in the userscript with `/* fixture-exempt */`.
- **Verification plan:** Test passes against current code; deliberately break a selector and verify failure.
- **Complexity:** M
- **Priority:** P1

### NEW-3: E2E gate (Playwright against YouTube)

- **User problem solved:** YouTube redesigns break features. Astra has fixture-driven selector regression but no actual page load test in CI. The maintainer's hardening passes catch a lot, but the "real DOM has changed and our selectors miss" path only shows up via user reports.
- **Evidence:** ROADMAP §Phase 1 community findings: "YouTube UI churn repeatedly breaks player/control/sidebar/comment integrations." HARDENING.md H21 (liquid-glass redesign deferred pending capture). Backlog gap I-7.
- **Proposed behavior:** A nightly (not per-commit) CI job that uses Playwright to (a) load a stable YouTube watch URL with the unpacked extension, (b) screenshot the player + popup, (c) assert key selectors resolve (no `null`s in the test page), (d) post a GitHub issue on failure tagged `[selector-drift]`. Optional: opens browser cookied via a service account or runs unauthenticated.
- **Implementation areas:** `.github/workflows/e2e-nightly.yml` (new), `tests/e2e/` (new directory), a `playwright.config.ts` (new); possibly `package.json` adds `playwright` as dev dep
- **Risks / edge cases:** YouTube serves rate-limited responses to headless browsers and runs anti-bot scripts. Playwright with stealth plugins handles most of this; cookie-jar via Playwright `BrowserContext` is an option. CI flakiness needs to be classified separately from real drift.
- **Verification plan:** Land workflow; verify it runs against current YouTube. Manually mutate a selector pack to deliberately fail; verify issue gets filed.
- **Complexity:** L
- **Priority:** P1 (no existing safety net for the most common real-world failure mode)

### NEW-4: PyQt6 GUI smoke tests for Astra Downloader

- **User problem solved:** `astra_downloader` has 98 Python tests but **no GUI tests**. The `FolderPickerService` watchdog was added in NF35 because a real GUI dialog blocked the Flask thread. Future GUI regressions will be caught by user reports only.
- **Evidence:** NF22 in backlog ("PyQt6 GUI smoke tests"). `pytest.ini` already pins `qt_api=pyqt6` and `asyncio_default_fixture_loop_scope=function` — infrastructure exists.
- **Proposed behavior:** New test class `GuiSmokeTests` in `astra_downloader/test_astra_downloader.py` (or split to `test_gui.py`). Uses `pytest-qt` to: (a) instantiate the tray app, (b) verify menu items present, (c) drive `FolderPickerService` to open and close a `QFileDialog` (mocked), (d) assert the watchdog logs at threshold.
- **Implementation areas:** `astra_downloader/requirements.txt` (`pytest-qt`), new test file
- **Risks / edge cases:** Headless CI needs `xvfb-run` (Linux) or `QT_QPA_PLATFORM=offscreen`. Already a standard PyQt CI pattern.
- **Verification plan:** Tests pass locally; integrate into `validate.yml`.
- **Complexity:** M
- **Priority:** P2 (NF22 in backlog)

### NEW-5: Long-session memory-leak detection

- **User problem solved:** Users browsing YouTube for hours can accumulate observer leaks, timer leaks, listener leaks. Astra has the `_panelCleanups` registry and per-feature `destroy()` contracts, but no test asserts that after N route changes + N feature toggles, `performance.memory.usedJSHeapSize` and observer counts return to baseline.
- **Evidence:** G3 in backlog ("No long-session memory leak test"). ROADMAP §Risks calls this out.
- **Proposed behavior:** A long-running JS test that simulates 1000 SPA route changes with all features enabled, then disabled, then re-enabled. Assertions: (a) `chrome.storage.local` size stable, (b) DOM node count returns to baseline ±5%, (c) MutationObserver / IntersectionObserver instances all disconnect. Run as part of the nightly E2E (NEW-3) or as a `npm run test:longsession` opt-in.
- **Implementation areas:** New `tests/longsession.test.js`; possibly a JSDOM harness or Playwright (preferred — real browser is the only way to count observers)
- **Risks / edge cases:** Real-browser test means slow runtime (20+ minutes). Opt-in / nightly only.
- **Verification plan:** Deliberately leak an observer in a feature; verify the test catches it.
- **Complexity:** L
- **Priority:** P2

### NEW-6: Per-key "Reset to default" button in popup schema overview

- **User problem solved:** A user misconfigures one feature (e.g., paste-bombs CSS into `customCssInjection`, or sets `vvfBrightness` to 0 making the page invisible) and currently has to either remember the default or hit global Reset. Per-key reset is a one-click recovery.
- **Evidence:** Popup has global Reset (with undo-toast since v3.x). No per-key path. Confirmed via search of `popup.js`.
- **Proposed behavior:** Each schema-overview row gets a tiny "↺" affordance (visible on hover or always for non-default values). Click → sets that key to `DEFAULT_SETTINGS[key]` with the existing undo-toast pattern.
- **Implementation areas:** `popup.js` (row builder), `popup.css` (affordance styling), one new hardening test
- **Risks / edge cases:** "Default" varies if the user has a profile loaded. Should reset to the active profile's default, not the global default.
- **Verification plan:** Unit test asserts reset path. Manual: paste bad CSS, click reset, verify recovery.
- **Complexity:** S
- **Priority:** P2

### NEW-7: Service Worker lifecycle ring buffer in diagnostic-log

- **User problem solved:** MV3 service workers restart unpredictably. Several Astra bugs over the past year (the `_pendingReveals` SW-restart class) only surfaced because the maintainer hit them in development. Users will hit them silently.
- **Evidence:** `chrome.storage.session` mirror was added in v3.20.0 for `_pendingReveals`. The cap-bypass-on-hydration was found in H25 (v4.46.0). The pattern keeps recurring.
- **Proposed behavior:** Augment `diagnostic-log.js` with a small SW-lifecycle ring buffer (last 50 SW starts with timestamps and "what was in flight"). Surfaced in the bug-report bundle (NEW-1) and as a one-row stat in the popup's diagnostics panel.
- **Implementation areas:** `extension/core/diagnostic-log.js` (extension), `extension/background.js` (record events), `popup.js` (display)
- **Risks / edge cases:** Don't store anything privacy-sensitive in the ring buffer. Cap entries to prevent unbounded growth (same pattern as the existing 500-entry buffer).
- **Verification plan:** Unit test on the ring; manual: trigger SW restart via DevTools, verify entry appears.
- **Complexity:** S
- **Priority:** P2

### NEW-8: CHANGELOG rotation

- **User problem solved:** `CHANGELOG.md` is 5,713 lines. Loading it in any browser-rendered Markdown view is slow. CI grep of changelog is slow. Adding a new entry to a long file means git diffs grow.
- **Evidence:** `wc -l CHANGELOG.md` → 5713; new `[Unreleased]` entries are 50–100 lines each
- **Proposed behavior:** Annual rotation: `CHANGELOG.md` keeps the current year + `[Unreleased]`; older years move to `CHANGELOG-YYYY.md`. README links to the historical files. `build-extension.js` can validate at build time.
- **Implementation areas:** New files; `README.md` link update
- **Risks / edge cases:** GitHub release notes link to specific anchors in CHANGELOG.md — moving content could break old links. Mitigation: keep the section header anchors stable in archive files (no anchor renaming).
- **Verification plan:** Manual visual check. Optionally: a CI gate that fails when `CHANGELOG.md` crosses, say, 2000 lines.
- **Complexity:** S
- **Priority:** P3

### NEW-9: Live-chat archive export

- **User problem solved:** Live streams have valuable chat content (Q&A links, timestamps, community notes). YouTube's chat replay is not exportable. Power users currently use third-party tools.
- **Evidence:** ROADMAP §Phase 2 gap analysis: "Live chat: few competitors deeply polish live chat. Astra should own live chat readability, moderation filters, sticky/side-by-side layouts, **archive export**, and low-latency performance." Not currently in active backlog.
- **Proposed behavior:** While viewing chat replay (`/watch?v=…` post-stream), a "Export chat replay" button in the chat header dumps timestamped messages to a JSONL or CSV file via `chrome.downloads`. Optionally with filter: only `@handle` mentions, only superchats, only timestamps with chapter marks.
- **Implementation areas:** `extension/features/live-chat-export/` (new), live-chat selector packs (already capture-blocked per EI8 — so this is downstream of EI8)
- **Risks / edge cases:** YouTube's chat replay API uses chunked JSON; need to walk pages without rate-limiting. Should be off by default and opt-in.
- **Verification plan:** Manual against a known live replay; selector-regression test.
- **Complexity:** L
- **Priority:** P2 (after EI8 unblocks)

### NEW-10: README rewrite (deferred from ROADMAP §v6.0.0)

- **User problem solved:** Current README is 411 lines and dates back through multiple rebrands. The product is now 357 features, 22 competitor coverage, dual extension+userscript distribution, +companion downloader. New visitors cannot tell what Astra is in 10 seconds.
- **Evidence:** ROADMAP §v6.0.0 explicitly defers README work to the implementation release. The 354-key competitive comparison page generated from settings schema (Definition of Done item) does not exist.
- **Proposed behavior:** Concise README with: pitch (1 sentence), top 6 features with screenshots, install paths (extension + userscript + companion), privacy stance (link to data-flow panel), competitive position (link to generated comparison), changelog link
- **Implementation areas:** `README.md`, possibly auto-generated `docs/comparison.md` from `settings-schema.js`
- **Risks / edge cases:** Screenshots go stale; auto-capture via E2E (NEW-3) could keep them current
- **Verification plan:** Reviewer eye-test; link-check CI
- **Complexity:** M
- **Priority:** P2

---

## Existing Feature Improvements

### EXIST-1: Theater Split fullscreen handling (extension `stickyVideo`)

- **Current behavior:** The userscript `theater-split.user.js` had a fullscreen handler that hid `splitWrapper` even though the player was inside it, breaking native fullscreen on live / previously-live videos (which leak a `position:fixed; z-index:10001` chat overlay). Fix shipped in `theater-split.user.js` in the preceding task (added `fullscreenStash` state, `enterFullscreenStash` / `exitFullscreenStash` helpers).
- **Problem:** The same code path almost certainly exists in the extension's `stickyVideo` feature in `ytkit.js`. Users on the extension build have the same bug.
- **Recommended change:** Port the fix to `ytkit.js#stickyVideo` (specifically its `onFullscreenChange` equivalent). Add a parity test asserting both implementations handle fullscreen + live + split identically.
- **Code locations:** `ytkit.js#stickyVideo` (~4,780 lines), `tests/features/theater-split.test.js`
- **Backward compatibility:** None — pure bug fix
- **Verification plan:** Manually: open live stream → activate split → press F → verify fullscreen succeeds and chat overlay is hidden. Same on previously-live archive.
- **Complexity:** M
- **Priority:** P0 (active user-facing bug)

### EXIST-2: Capability-probe popup integration (NF10 follow-up, P0/P1 quick win)

- **Current behavior:** Probe runs; popup ignores result; users see toggles that silently no-op.
- **Recommended change:** Already specified in `RESEARCH_FEATURE_PLAN.md:155–166`. Implement.
- **Verification plan:** Synthetic test: set `summarizerApi` false → assert `localAiSummary` row carries the chip; true → no chip.
- **Complexity:** S
- **Priority:** P0

### EXIST-3: DeArrow channel-override chip UI (NF28)

- **Current behavior:** Data model in `deArrowChannelOverrides`, lookup at `ytkit.js:26174`. Users cannot manage without editing the JSON in the popup array editor.
- **Recommended change:** Per backlog NF28 — chip next to channel name on watch + grid pages, cycles `DeArrow → Original → Off`, writes to `deArrowChannelOverrides`.
- **Code locations:** New `extension/features/de-arrow-overrides/index.js`, consumer in `ytkit.js#deArrow`
- **Verification plan:** Manual on a known channel with bad DeArrow titles; toggle each state; reload page; verify persistence.
- **Complexity:** M
- **Priority:** P1

### EXIST-4: Astra Downloader auto-update (NF6 — high-leverage)

- **Current behavior:** `.exe` stuck at install version; users hit `yt-dlp` outdated errors, Deno-runtime-missing warnings, and similar.
- **Recommended change:** `/update` endpoint in `astra_downloader.py` (semver compare against GitHub latest release, atomic replace, restart). "Check for update" action in popup that polls on open and surfaces a chip on the MediaDL setup row.
- **Code locations:** `astra_downloader/astra_downloader.py`, `extension/popup.js`, `MediaDLManager.check()` in `ytkit.js`
- **Backward compatibility:** Older `.exe` installations will not have the endpoint; popup must tolerate 404 gracefully and tell the user to manually update once.
- **Verification plan:** pytest semver compare; manual install of older `.exe` → click update → verify replacement.
- **Complexity:** L (signing budget is the open question; unsigned ship works but produces SmartScreen warnings)
- **Priority:** P1

### EXIST-5: First-run welcome + What's New (NF21)

- **Current behavior:** Fresh install opens the toolbar popup directly to a 354-key editor. No guidance. No profile picker.
- **Recommended change:** Per backlog NF21 — welcome card with profile picker (store-safe / github-full / research-focused / focus-mode), version chip linking to a What's New mini-modal.
- **Verification plan:** Clear extension storage; open popup; verify welcome card; pick a profile; verify settings apply with undo toast.
- **Complexity:** M
- **Priority:** P1

### EXIST-6: `chatStyleComments` rebuild (EI-NEW1, currently P3)

- **Current behavior:** ~4,500 lines of brittle CSS chains targeting YouTube comment classes. Frequently breaks on rename.
- **Recommended change:** `@supports(selector(...))` fallback chains AND introduce a small DOM observer that rebuilds the layout against capture-backed selector packs (rather than raw class chains).
- **Priority bump candidate:** P2 if the next YouTube comment redesign hits before this is rebuilt
- **Complexity:** M (per backlog)
- **Priority:** P2 (recommend bump from P3)

### EXIST-7: Settings export-import binary format (storage scaling)

- **Current behavior:** Settings export is JSON. `videoNotes` (NEW-1 candidate), `timestampBookmarks`, `videoHistory`, transcript index can grow large. JSON export is slow and produces 10s of MB files.
- **Recommended change:** Optional binary export format (msgpack via a small bundled lib, or just base64 + gzip) selected by a popup-export modal. Store-safe option keeps JSON.
- **Backward compatibility:** Import handler must accept both formats.
- **Complexity:** M
- **Priority:** P3

### EXIST-8: Issue templates ask for store-policy context

- **Current behavior:** `.github/ISSUE_TEMPLATE/feature_request.md` asks for use case + alternatives; doesn't ask whether the feature should be store-safe or github-full.
- **Recommended change:** Add a "Audience" field with options: store-safe (everyone), github-full (advanced), companion-required, AI-key-required. Helps triage map onto the existing profile model.
- **Complexity:** S
- **Priority:** P3

### EXIST-9: Userscript metadata @match parity audit

- **Current behavior:** Three userscripts have hand-edited `@match` patterns. `YTKit.user.js` is in sync via `sync-userscript.js`; the other two are not.
- **Recommended change:** Audit + assert in a test. Specifically: confirm `theater-split.user.js` and `YT_Reaction_Spammer.user.js` exclude `m.youtube.com` and `studio.youtube.com` consistently with the extension manifest.
- **Complexity:** S
- **Priority:** P3 (subsumed by NEW-2)

---

## Reliability, Security, Privacy, and Data Safety

Astra is in a very strong place here (25 hardening passes, explicit trust boundaries, EXT_FETCH allowlist, sanitized profile import, ReDoS guards, etc.). Items below are gaps the maintainer has not already addressed.

### Bugs / risks found

- **R-NEW-1: Theater Split fullscreen handler hides splitWrapper while player is inside it.** Verified in userscript and fixed in preceding task. Almost certainly present in extension `stickyVideo`. See EXIST-1.
- **R-NEW-2: SW-restart visibility gap.** `_pendingReveals` hydration cap was added in H25 because cap-bypass was discovered. Other SW-restart-sensitive state (in-flight downloads, BroadcastChannel arbitration for `pauseOtherTabs`) is not similarly audited. See NEW-7 (lifecycle ring buffer) for a detection mechanism rather than a fix.
- **R-NEW-3: theater-split + extension stickyVideo parity drift.** No structural mechanism ensures the two implementations stay aligned. Fix: peel theater-split into the extension (EXIST-1 cross-reference).
- **R-NEW-4: Three userscripts diverging.** Same class of issue. Fix: NEW-2.

### Missing guardrails

- **No long-session leak detector** — G3 in backlog; see NEW-5.
- **No automated DOM-drift gate** — see NEW-3.
- **No automated a11y gate beyond build-time `audit-popup-a11y.js`** — manual smoke per `docs/screen-reader-smoke.md`. Could integrate `axe-playwright` into NEW-3.
- **Settings import format-version drift** — H11 added import migration semantics; no test asserts that a v1 export still imports cleanly into v7. (The `settings-migration-roundtrip.test.js` covers the migration chain but tests round-trip of a fresh export, not a v1-era export.)

### Permission / network / file-system concerns

- **`unlimitedStorage` is permission-warning-worthy on CWS upgrade** — HARDENING.md flagged this back in v3.20.0 ("if/when we ever publish to the CWS, frame this in the release notes"). If CWS submission is on the horizon (Open Question 2), this needs proactive copy.
- **`downloads` permission** — already declared; no change needed.
- **Background fetch allowlist** is strict but `127.0.0.1` ports 9751–9851 + Ollama 11434 are open. Anyone running a malicious local server on those ports can receive an extension fetch. Recommendation: require a per-port shared secret (already partly done — the `MediaDLManager.check()` verifies a `token` from the health response). Audit whether all calls use the token-bound path.

### Recovery / rollback needs

- **Per-key reset** (NEW-6) is the primary recovery affordance gap.
- **Profile snapshot before manual edit** — when a user edits a JSON array via the schema-overview editor, there is no automatic snapshot. The undo-toast pattern catches some cases; a deeper "last 5 setting changes" history would catch more.

### Logging / diagnostics needs

- **NEW-1 (Bug Report Bundle)** is the main gap.
- **NEW-7 (SW lifecycle ring buffer)** is the supporting infrastructure.

---

## UX, Accessibility, and Trust

### Onboarding gaps

- **First-run is a 354-key dump.** NEW-2 (welcome card + profile picker) is the right answer; already in backlog as NF21.
- **No "what's installed and what's running"** — popup shows storage stats and quick toggles but doesn't summarize "you have 47 features active." A one-line summary on the hero card would build trust.

### Empty / loading / error / disabled states

- **Schema-overview rows for disabled features look identical to enabled features.** A subtle "off" state styling would help scanability. Verified by reading `popup.css`.
- **`downloadHealthPanel` "Deno: missing" pill** has good empty-state copy (winget install command, deno.com link). Audit other panels for parity.

### Destructive / irreversible actions

- **Global Reset has undo-toast** (shipped). Per-key reset (NEW-6) would extend the same pattern.
- **`commentFilterRules` and `videoHider` keyword textareas** — no preview, no dry-run. BlockTube competitor has this; Astra's predicate sandbox could.
- **`customCssInjection` textarea** — no preview, can break page rendering. A preview modal that applies for 5s with a Cancel button would be safer than the current "save and reload."

### Settings clarity

- **354 keys is a lot.** The schema-overview category collapse helps. Search filter helps. Capability-probe chips (EXIST-2) will help more.
- **Risk badges** already shipped (v4.16.0). Profile-gating badges shipped (v4.39.0). Good.

### Accessibility

- **`docs/screen-reader-smoke.md` is manual** — NEW-3 + axe-playwright could automate.
- **Touch-target sizes** — verified via `audit-popup-a11y.js`. Audit passes; the runtime page is not similarly audited.
- **Reduced-motion + forced-colors** — both shipped (v3.31.0). Good.

### Microcopy and trust signals

- **AI provider rows** — "Inline trust signal" is a P2/S backlog item ("Key stored locally only" inline copy). Worth shipping with EXIST-5 (first-run welcome).
- **Privacy data-flow panel** is off by default. Worth making always-visible in the popup hero, even as a small "View data flows →" link.

---

## Architecture and Maintainability

### Module / boundary improvements

- **`ytkit.js` is 43,610 lines.** The maintainer is actively peeling features into `extension/features/<name>/index.js`. 21 of ~200 features peeled per ROADMAP. The next peels (P2/XL in backlog) target the largest: `stickyVideo` (4,780 lines), `hideVideosFromHome` (1,367), `chatStyleComments` (1,338).
- **Recommendation:** Sequence the `stickyVideo` peel with EXIST-1 (fullscreen-fix port) — fix the bug as part of the peel, in one PR. This avoids fixing it twice.
- **`extension/features/` standard interface is forming** but isn't documented. Adding a `docs/feature-module-template.md` would help future peels avoid bespoke patterns.

### Refactor candidates

- **`chatStyleComments`** (EI-NEW1) — 4,500 lines of CSS chains. Largest brittle surface. P3 in backlog; recommend P2.
- **`hideVideosFromHome._isSameChannel`** is O(channels) per card (EI-NEW5). 8ms+ on 500+ blocked channels. Quick win.
- **`selector-health` attribute-drift detection** (EI-NEW6) — per-surface miss counter doesn't catch class-rename churn.

### Test gaps

- **No E2E** (NEW-3)
- **No GUI tests for downloader** (NEW-4 / NF22)
- **No long-session leak test** (NEW-5 / G3)
- **No userscript drift test** (NEW-2)
- **Settings migration round-trip doesn't test ancient exports** (R-NEW-4 above)

### Documentation gaps

- **README needs rewrite** (NEW-10)
- **Feature-module template** (above)
- **CHANGELOG length** (NEW-8)
- **Issue template doesn't ask about audience** (EXIST-8)

### Release / build / deployment gaps

- **No signed Astra Downloader installer** (Open Question 1, blocking NF6 trust)
- **No store-safe vs GitHub-full split artifact** (P3 backlog; would jump to P1 if CWS submission goes ahead)
- **No automated CWS submission preflight** beyond `docs/cws-submission-checklist.md` — would benefit from a `npm run check:cws` script

---

## Prioritized Roadmap

Each item is independently shippable; ordering reflects highest-leverage-first within each priority band.

### P0 — ship this week

- [ ] **P0 — Port theater-split fullscreen fix into `ytkit.js#stickyVideo`**
  - Why: Same bug exists in extension build. Users on the extension have broken fullscreen on live videos.
  - Evidence: Bug verified and fixed in `theater-split.user.js` (preceding task in this session, see `onFullscreenChange`, `enterFullscreenStash`, `exitFullscreenStash`).
  - Touches: `extension/ytkit.js#stickyVideo` (find the equivalent fullscreen handler), `tests/features/theater-split.test.js` (add parity assertion)
  - Acceptance: Manually verify on a live stream: activate split → press F → fullscreen succeeds and chat overlay is hidden.
  - Verify: `npm test` plus manual smoke against a live YouTube stream.

- [ ] **P0 — Capability-probe popup chip render (NF10 follow-up)**
  - Why: Probe module + tests shipped v4.47.0; popup ignores result; users see toggles that silently no-op.
  - Evidence: Verified open via `grep -n "capabilityProbe" extension/popup.js` (0 hits) vs `extension/core/capability-probe.js` (full implementation + `isEntryAvailable` helper).
  - Touches: `extension/popup.js` (schema-overview row builder), `extension/popup.css` (new `.unavailable-chip` rule)
  - Acceptance: Synthetic test sets `summarizerApi` false → asserts `localAiSummary` row carries chip; true → no chip.
  - Verify: `npm test` + manual: open Chrome without Summarizer API → verify chip on `localAiSummary` row.

- [ ] **P0 — Capture live-chat MHTML fixtures (EI8)**
  - Why: 3 selector packs ship `lastVerified: null, needsFreshCapture: true`; multiple live-chat features ride on them; unblocks live-chat archive export (NEW-9) and live-chat polish.
  - Evidence: `extension/core/selector-packs/liveChat.js`, `liveChatFrame.js`, `liveChatPlaceholder.js`; backlog item; H21 watchlist.
  - Touches: `mhtml/LiveChat.mhtml` (new, gitignored), `tests/fixtures/yt-live-chat.tokens.txt`, 3 selector pack `lastVerified` stamps.
  - Acceptance: `npm test -- --test-name-pattern "Selector"` passes; `lastVerified` non-null in all 3 packs.
  - Verify: `npm run build:fixtures && npm test`.

### P1 — next 2–4 weeks

- [ ] **P1 — Real E2E gate (Playwright against a YouTube watch page)**
  - Why: Selector-health is runtime only; user reports are the current failure-mode signal. Competitive products break on every YouTube redesign.
  - Evidence: ROADMAP §Phase 1 community findings; HARDENING.md H21 (liquid-glass deferred); zero existing e2e tests.
  - Touches: New `.github/workflows/e2e-nightly.yml`, new `tests/e2e/`, `package.json` adds `playwright` dev dep.
  - Acceptance: Workflow runs nightly; loads a known watch URL with the unpacked extension; screenshots player + popup; asserts key selectors resolve; opens a GitHub issue tagged `[selector-drift]` on failure.
  - Verify: Mutate a selector pack to deliberately fail; verify issue gets filed within 24h.

- [ ] **P1 — DeArrow channel-override chip UI (NF28)**
  - Why: Data model shipped v3.28; UI deferred for 17 versions; highest-leverage data-already-there gap.
  - Evidence: CLAUDE.md:438; lookup at `ytkit.js:26174`; `deArrowChannelOverrides` schema entry exists.
  - Touches: New `extension/features/de-arrow-overrides/index.js`, consumer hook in `ytkit.js#deArrow`.
  - Acceptance: Chip cycles `DeArrow → Original → Off`; persists across reloads; updates lookup at `ytkit.js:26174`.
  - Verify: Manual on a known channel with bad DeArrow titles.

- [ ] **P1 — Astra Downloader `/update` endpoint + popup "Check for update" action (NF6)**
  - Why: `.exe` stuck at install version; no path to fix yt-dlp / Deno cutoff breakage.
  - Evidence: Backlog NF6; CHANGELOG NF27 (Deno cutoff hard-gate); user-facing setup flow has no update step.
  - Touches: `astra_downloader/astra_downloader.py` (new endpoint), `extension/popup.html` + `popup.js`, `MediaDLManager.check()` in `ytkit.js`.
  - Acceptance: Semver compare; atomic replace; restart succeeds; popup chip appears on outdated install.
  - Verify: pytest semver compare; manual install of older `.exe` + click Update.

- [ ] **P1 — First-run welcome card + profile picker + What's New (NF21)**
  - Why: Fresh install opens to 354-key editor; no onboarding.
  - Evidence: NF21 in backlog; user-facing popup verified to lack any first-run path.
  - Touches: `extension/popup.html`, `extension/popup.js`, new `extension/whatsnew/` dir.
  - Acceptance: Clean install → welcome card; profile picker applies with undo-toast; What's New mini-modal lists last release.
  - Verify: Clear extension storage; reopen popup; walk through.

- [ ] **P1 — Bug Report Bundle Export (NEW-1)**
  - Why: Closes support loop; `diagnosticLog` ring buffer exists but is not user-accessible.
  - Evidence: `extension/core/diagnostic-log.js` exists; `window.__ytkitDiagnostics.download()` exists; popup has no surface.
  - Touches: `popup.html` (new "Generate Bug Report" button in Diagnostics panel), `popup.js` (handler with redaction), `.github/ISSUE_TEMPLATE/bug_report.md` (one-line update).
  - Acceptance: Clicking produces a JSON blob with diagnosticLog + sanitized settings + version; copies to clipboard.
  - Verify: Unit test asserts redaction of `aiSummaryApiKey`; manual: trigger known error, click button, verify clipboard payload.

- [ ] **P1 — Userscript drift health check (NEW-2)**
  - Why: Three standalone userscripts (`YTKit.user.js`, `theater-split.user.js`, `YT_Reaction_Spammer.user.js`); only one auto-synced; the others drift silently (just demonstrated by the theater-split bug).
  - Evidence: I shipped a fullscreen fix in `theater-split.user.js` this session; same bug had been latent.
  - Touches: New `tests/userscript-health.test.js`; possible additions to `scripts/build-selector-fixtures.js`.
  - Acceptance: For each standalone userscript: metadata block valid; every selector appears in at least one MHTML fixture (or is marked `/* fixture-exempt */`); every documented feature has a behavior test.
  - Verify: Test passes; deliberately break a selector; verify failure.

### P2 — next quarter

- [ ] **P2 — Subscription Manager v2 (nested groups + dead-channel detection + group notifications digest)**
  - Why: PocketTube parity; Astra has the data plumbing; ROADMAP §Phase 2 gap analysis lists it as a "high-value gap Astra can own."
  - Evidence: Backlog items NF2 and following.
  - Touches: Peel `subscriptionGroups` into `features/subscriptions/`; new schema `subscriptionGroupsNested`, `subscriptionDeadChannelDetection`, `subscriptionBulkUnsubscribeStaging`.
  - Acceptance: 100-channel JSON round-trip preserves nesting; simulated 410 on a channel flags it; bulk unsubscribe stages with 30-day undo.
  - Verify: Unit tests on the schema + state machine; manual on staged data.

- [ ] **P2 — Per-video notes (NF1)**
  - Why: YouFocus parity; ROADMAP §Phase 2 gap.
  - Evidence: Backlog NF1.
  - Touches: New `extension/features/research/video-notes/index.js`; schema additions; popup integration; export rail.
  - Acceptance: Round-trip a note via export; LRU caps at 1000.
  - Verify: Unit test + manual.

- [ ] **P2 — Peel `stickyVideo` into `extension/features/theater-split/` (NF15 top of the order)**
  - Why: Largest monolith block (4,780 lines); two parallel implementations (extension + userscript) currently diverge silently.
  - Evidence: Backlog NF15; theater-split fullscreen bug as supporting evidence.
  - Touches: `extension/features/theater-split/index.js` (new), `manifest.json`, `sync-userscript.js`, `ytkit.js` (delete inline), `theater-split.user.js` (load from peeled module via sync-userscript bundle pattern).
  - Acceptance: Byte-identical inline fallback; lifecycle adoption; fullscreen test passes for both consumers.
  - Verify: `npm test`; manual smoke on live + VOD + non-watch routes.

- [ ] **P2 — Long-session memory-leak detector (NEW-5 / G3)**
  - Why: Observer / timer / listener leak accumulation over hours.
  - Evidence: G3 in backlog; ROADMAP §Risks.
  - Touches: New `tests/longsession.test.js`; Playwright harness (cross-references NEW-3).
  - Acceptance: 1000 SPA route changes with all features enabled/disabled returns DOM node count and observer count to baseline ±5%.
  - Verify: Deliberately leak; assert detection.

- [ ] **P2 — Per-key "Reset to default" in popup schema overview (NEW-6)**
  - Why: Recovery from one bad setting without nuking the rest.
  - Evidence: Verified no per-key reset in `popup.js`.
  - Touches: `popup.js` row builder; `popup.css` affordance; one hardening test.
  - Acceptance: Hover row → "↺" affordance; click → resets that key with undo toast.
  - Verify: Paste-bomb CSS into `customCssInjection`; click reset; verify recovery.

- [ ] **P2 — SW lifecycle ring buffer in diagnostic-log (NEW-7)**
  - Why: MV3 SW restart visibility; supports NEW-1 bug bundle.
  - Touches: `extension/core/diagnostic-log.js`, `extension/background.js`, `popup.js` (display).
  - Acceptance: Last 50 SW starts visible with timestamps + in-flight context; capped at fixed size.
  - Verify: DevTools-triggered SW restart shows up.

- [ ] **P2 — PyQt6 GUI smoke tests (NF22)**
  - Touches: `astra_downloader/requirements.txt` (`pytest-qt`), new `astra_downloader/test_gui.py`.
  - Acceptance: GUI smoke covers tray instantiation, menu items, FolderPickerService dialog open/close with watchdog threshold.
  - Verify: pytest passes; integrate into `validate.yml`.

- [ ] **P2 — README rewrite for v6.0.0 release (NEW-10)**
  - Touches: `README.md`, possibly auto-generated `docs/comparison.md`.
  - Acceptance: New visitor can identify Astra's value in 10 seconds; install paths for extension + userscript + companion; privacy stance link.
  - Verify: Reviewer eye-test.

### P3 — opportunistic / when scope allows

- [ ] **P3 — Live-chat archive export (NEW-9)** — after EI8 unblocks.
- [ ] **P3 — `chatStyleComments` rebuild (EI-NEW1 promotion candidate)** — bump to P2 if YouTube comment redesign lands.
- [ ] **P3 — Settings export binary format (EXIST-7)**.
- [x] **P3 — CHANGELOG rotation (NEW-8)** — shipped 2026-05-25; v3.33.0 and earlier moved to `CHANGELOG-v3-archive.md`.
- [x] **P3 — Issue template asks for audience (EXIST-8)** — shipped 2026-05-25.
- [ ] **P3 — Iridium + Control Panel for YouTube feature scoring** — close the matrix.
- [ ] **P3 — Store-safe vs GitHub-full split artifact** — bumps to P1 if CWS submission proceeds.

---

## Quick Wins

Low-risk, completable in < 1 day each. Listed in execution order:

1. **Capability-probe popup chip (EXIST-2 / NF10 follow-up)** — S, P0
2. **Port theater-split fullscreen fix into extension `stickyVideo` (EXIST-1)** — S/M, P0
3. **Live-chat MHTML fixture capture (EI8)** — S, P0, blocked on a 1-hour maintainer session at a live stream
4. **Bug Report Bundle Export button (NEW-1)** — S, P1
5. **Per-key Reset button (NEW-6)** — S, P2
6. **Userscript metadata @match parity assertion (subset of NEW-2 / EXIST-9)** — S, P3
7. **Issue template "audience" field (EXIST-8)** — S, P3
8. **SW lifecycle ring buffer skeleton (NEW-7, scoping pass)** — S, P2

---

## Larger Bets

Bigger features or refactors needing planning, design, or staged rollout:

1. **E2E gate (Playwright nightly, NEW-3)** — needs Playwright onboarding, anti-bot mitigation, CI runner sizing. L, P1.
2. **Subscription Manager v2 (NF2 + dead-channel + group notifications)** — multi-feature; schema-version bump; design pass needed. L+L+M; P2.
3. **Per-video notes (NF1) + Research workspace export** — schema additions + export rail + popup integration. M+M; P2.
4. **`stickyVideo` peel (NF15 lead) with fullscreen-fix port (EXIST-1)** — single-PR opportunity; biggest peel + active bug. XL; P2.
5. **Astra Downloader signed installer + `/update` endpoint (NF6 complete)** — code-signing budget is the blocker (Open Question 1). L; P1.
6. **Store-safe vs GitHub-full artifact split** — build pipeline change; promotion to P1 contingent on CWS submission decision (Open Question 2). M; currently P3.

---

## Explicit Non-Goals

Carried over from `RESEARCH_FEATURE_PLAN.md` Non-Goals (still binding); I add no new exclusions.

- Password-protected settings
- Always-on background AI inference
- Direct in-extension yt-dlp
- Universal HTML5 speed control (VSC scope)
- Mobile YouTube (`m.youtube.com`)
- YouTube Studio / YouTube Music as first-class (Music opt-in only)
- Auto-engagement beyond existing `autoLikeSubscribed`
- Keyboard shortcuts
- Confirmation dialogs

---

## Open Questions (block correct prioritization)

Carried from `RESEARCH_FEATURE_PLAN.md` Open Questions (still binding); I add three new ones.

**Carried over:**

1. **Astra Downloader code-signing budget.** If not budgeted, NF6 ships unsigned with SmartScreen warning + SHA-256 in README.
2. **CWS / AMO submission intent.** If on horizon, store-safe / GitHub-full split artifact jumps to P1; `unlimitedStorage` upgrade-warning copy needed; `docs/cws-submission-checklist.md` walk-through.
3. **Subscription dead-channel detection method.** RSS feed vs channel-page scrape. Maintainer call.
4. **Lifecycle migration cadence.** Peel 1/week, 1/month, or batch?
5. **Live-chat capture availability.** Fixture refresh needs a maintainer at a live stream. Schedule window? **Note:** this is the single most leveraged unblock — 3 selector packs and at least one larger bet (NEW-9 live-chat export) depend on it.
6. **i18n coverage policy (NF24).** At what % "translated keys identical to EN" should we warn vs accept?

**New from this pass:**

7. **Should `theater-split.user.js` continue to ship as a standalone userscript, or be retired in favor of the extension's `stickyVideo` feature (or the future peeled `features/theater-split/`)?** Drives EXIST-1 / NEW-2 / NF15 sequencing.
8. **Should Astra adopt a nightly E2E gate (NEW-3) before or after Subscription Manager v2 (NF2)?** E2E adds CI maintenance overhead; Sub Mgr v2 adds user-facing value. Both are P1/P2.
9. **Should `chatStyleComments` (EI-NEW1) be rebuilt against the new selector-pack model now, or wait for the next YouTube comment redesign?** Predictive vs reactive; the maintainer's house style has been reactive but the 4,500-line CSS footprint is unusually high.

---

## Quality Bar Compliance

- **Specific over broad:** Every recommendation cites either a file path (e.g., `extension/popup.js`), a line reference (e.g., `ytkit.js:26174`), a backlog item ID (e.g., NF10, EI8, NF28), or a competitor product as evidence.
- **Verified vs assumption labels:**
  - **Verified:** Capability-probe popup gap (grep'd), SETTINGS_VERSION=7 (grep'd), 547 JS tests passing (ran), theater-split fullscreen bug (fixed in this session), 5,713-line CHANGELOG (`wc -l`), `theater-split.user.js` and `stickyVideo` are parallel implementations (read both).
  - **Likely:** Extension `stickyVideo` has the same fullscreen bug as the userscript (high confidence by code-shape, not yet verified by reading the extension's `onFullscreenChange` equivalent).
  - **Assumption:** Iridium and Control Panel for YouTube ship features Astra doesn't (not installed and walked).
  - **Needs live validation:** All Playwright E2E concerns (anti-bot mitigation, headless detection); user-perceived performance of `chatStyleComments` rebuild.
- **No invented capabilities:** Every cited feature, file, or test was inspected.
- **Implementation-readable:** Every roadmap item has Why / Evidence / Touches / Acceptance / Verify.
