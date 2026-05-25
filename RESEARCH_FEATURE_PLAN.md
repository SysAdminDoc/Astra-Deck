# Astra Deck — Research and Feature Plan (companion to ROADMAP.md)

Date: 2026-05-24
Audited version: v4.46.0 (`package.json`, `extension/manifest.json`, `extension/ytkit.js` `YTKIT_VERSION`, `YTKit.user.js`)
Audited HEAD: `1a68b46 v4.46.0: extreme audit cut (H25) — SW + popup + Python hardening`

## How this file relates to ROADMAP.md

`ROADMAP.md` is the canonical product/architecture plan for Astra Deck v5.0.0 → v6.0.0. It was written at v4.5.2 (2026-05-21), and the autonomous-loop sprint shipped 41 more minor versions on top of it (v4.6.0 → v4.46.0). Most of v5.0.0's "foundation arc" has effectively landed already — schema, lifecycle module, selector packs, popup data-flow panel, schema-driven popup editor — but a number of items the roadmap promised are still real gaps in the current code, and the audit surfaced a fresh layer of issues the roadmap doesn't cover at all.

This file is a code-audit-grounded punch list for what to ship next. It deliberately does NOT duplicate the competitive landscape, settings schema, or phase taxonomy in `ROADMAP.md` — go there for those. Where an item below overlaps a roadmap line, the roadmap reference is cited inline.

---

## Executive Summary

Astra Deck v4.46.0 is a mature, production-grade YouTube enhancement suite (MV3 extension + userscript + local Python downloader) with 354 schema-tracked settings, ~200 user-visible features, 519 JS tests + 82 Python tests, and a clean four-artifact release pipeline. The strongest current shape is the **schema-driven popup with full 354-key metadata coverage**, the **policy-profile resolver gating github-full surfaces**, the **versioned selector packs (28 surfaces) with capture provenance**, and the **hardened service-worker fetch proxy with SSRF defenses and per-origin credential isolation**.

The highest-value direction for improvement is to **finish what was started but never adopted** — `core/feature-lifecycle.js` exists but no feature uses it; the conflict map covers 7 pairs but misses 5+ that are documented elsewhere; the selector health system writes diagnostics that the popup surfaces but the "copy report" action mentioned in the roadmap was never built; the live-chat selector pack ships with `lastVerified: null`; the YouTube "liquid glass" player chrome is in active rollout and the H21 hardening note explicitly says fresh captures are blocking. Beyond completion work, the biggest user-facing levers are **subscription manager parity with PocketTube** (nested groups, dead-channel detection, bulk unsubscribe with undo, group notifications), **research workspace consolidation** (per-video notes, study mode export, summary provenance) and a **safer/clearer install path for Astra Downloader** (code signing, auto-update, recovery from "permanent dismiss").

### Top 10 opportunities, in priority order

1. **P0 — Fix the version-badge drift in README** (one-line fix; user-facing trust signal that is currently misleading).
2. **P0 — Refresh the YouTube "liquid glass" player MHTML captures** (HARDENING.md H21 is the explicit blocker for the player-chrome features).
3. **P0 — Capture live-chat iframe fixtures** (selector packs `liveChat`, `liveChatFrame`, `liveChatPlaceholder` ship with `lastVerified: null`).
4. **P1 — Complete the `// reason:` catch-block invariant** (22 of 175 catches comply; the rest are silent failures that violate the v3.14.0 hardening rule) and ship the ESLint rule that enforces it (already noted as a v3.14.0 "follow-up").
5. **P1 — Build the selector-health "Copy report" button + miss-rate dashboard** (the data is in `core/selector-health.js`; the popup already lists problem surfaces but has no copy/export action).
6. **P1 — Close the conflict map** (add `autoPauseOnSwitch↔pauseOtherTabs`, `focusedMode↔transcriptViewer+timestampBookmarks+stickyVideo`, `forceH264↔codecSelector`, `hideEndCards↔hideVideoEndContent`, `popOutPlayer↔fullscreenOnDoubleClick+pipButton` per CLAUDE.md, and gate init on conflicts not just settings-change).
7. **P1 — First wave of lifecycle adoption** (start with the 6 already-peeled features in `extension/features/`; they're isolated enough to wire `defineFeature()` against without rippling into the monolith).
8. **P1 — Peel the top-3 monolith blocks** (`stickyVideo` 3,779 lines, `chatStyleComments` 1,337 lines, `floatingLogoOnWatch` 525 lines — together 12.7 % of `ytkit.js`).
9. **P2 — Subscription Manager v2** (nested groups, dead-channel detection, bulk unsubscribe with undo staging — the PocketTube parity gap called out in ROADMAP §5.5.0 is the single largest competitive gap left).
10. **P2 — Astra Downloader trust + UX** (code-sign the .exe, ship a `gh release`-driven auto-updater, recover from "Not now" permanent dismiss, add per-domain Add/Remove Programs entry, optional web queue UI on `127.0.0.1:9751`).

---

## Evidence Reviewed

### Local files inspected
- `CLAUDE.md` (904 lines), `AGENTS.md`, `README.md`, `ROADMAP.md` (1,516 lines), `CHANGELOG.md` (3,000+ lines, recent ~250 read), `HARDENING.md` (H21–H25 read), `CONTRIBUTING.md`, `LICENSE`.
- `package.json` (v4.46.0), `extension/manifest.json` (v4.46.0), `extension/default-settings.json` (469 lines / 354 keys), `extension/settings-meta.json`.
- `extension/ytkit.js` (43,298 lines — surveyed via subagent), `extension/popup.js` (2,443), `extension/popup.css` (2,090), `extension/popup.html` (212), `extension/background.js` (695), `extension/ytkit-main.js` (299), `extension/early.css` (128).
- `extension/core/*.js` (25 files, ~5,800 lines) — read settings-schema, feature-lifecycle, selector-health, policy-profile, data-flow, selectors top, plus all `selector-packs/*.js`.
- `extension/features/*/index.js` (6 feature peels, ~580 lines combined).
- `astra_downloader/astra_downloader.py`, `build.py`, `test_astra_downloader.py`, `requirements.txt` (surveyed via subagent).
- `tests/` (15 spec files + 3 feature specs + helpers + fixtures = 519 JS tests; verified via subagent).
- `scripts/` (16 scripts including `check-settings.js`, `check-versions.js`, `audit-popup-a11y.js`, `check-contrast.js`).
- `docs/` (5 markdown files + `docs/research/` 24 files).
- `.github/workflows/build.yml` (53 lines).
- Build artifacts in `build/` — confirmed Chrome ZIP/CRX + Firefox ZIP/XPI at v4.46.0.

### Git history reviewed
`git log --oneline -30` from v4.46.0 back to v4.17.0 — confirms the autonomous-loop sprint cadence (one minor version per slice, every slice tested + built + pushed). 450 total commits on `main`.

### External research
Competitive landscape — ROADMAP §Phase 1 already documents 20 competitor tools with Chrome Web Store / AMO / GitHub counts and feature notes as of 2026-05-21. Not re-researched here; treated as primary source.

### Could not be verified
- Live YouTube DOM (extension not loaded in a real browser during this audit).
- `npm test` / `npm run check` not executed (HGFS build slowness; the build/ artifacts at v4.46.0 are evidence that CI passed).
- HARDENING.md mentions 4 new H25 regression tests bringing total to 519/519; not run.
- Chrome Web Store / AMO store-review responses (Astra Deck self-distributes per `docs/cws-submission-checklist.md`).
- Behavior of `mediadl://` protocol launch on Windows when handler is not registered.

---

## Current Product Map

### Stack
- **Extension**: Chrome/Edge/Brave MV3, Firefox 128+ MV3 (manifest auto-patched at build); ISOLATED + MAIN world dual-context; all-frames inject on `live_chat` iframe; persistent CRX3 signing via `ytkit.pem`.
- **Userscript**: `YTKit.user.js` single-file, Tampermonkey / Violentmonkey targets; `sync-userscript.js` strips `_rw` bridge and gm-compat preamble.
- **Build**: Node 22+, `build-extension.js` produces all 5 artifacts (Chrome ZIP+CRX, Firefox ZIP+XPI, userscript) in one pass with `--bump patch|minor|major`.
- **Companion**: `astra_downloader.py` (Flask + PyQt6 + yt-dlp + ffmpeg), single-file PyInstaller .exe at `%LOCALAPPDATA%\AstraDownloader\`, ports 9751 with 5 fallbacks (9761/9771/9781/9791/9851) + Ollama at 11434.
- **CI**: `.github/workflows/build.yml` — npm ci → `npm test` + `npm run check` → tag check → `npm run build:userscript` → `gh release create` with build artifacts.

### Core workflows
1. Watch a YouTube video with auto-best quality, SponsorBlock skips, DeArrow titles/thumbs, RYD ratio pill, optional transcript sidebar, optional AI summary.
2. Browse home / subscriptions with Shorts removed, watched videos hidden/dimmed, keyword filter + advanced predicate, BlockTube-grade comment filter.
3. Download a video via right-click → AstraDownloader local server (port 9751) → yt-dlp + ffmpeg → `~/Videos/` (or chosen folder via OS file dialog).
4. Configure features via toolbar popup → quick toggles, storage stats, export/import/reset, schema overview with inline editors for all 354 keys, data-flow panel showing 11 external origins.
5. Research workflow: transcript IndexedDB index, transcript search panel, spaced review CSV, transcript AI handoff to NotebookLM/ChatGPT/Claude/Gemini/Perplexity, watch-time analytics dashboard, digital-wellbeing break reminders.

### User personas (inferred)
- **Power user**: wants 200+ toggles, custom CSS, advanced predicate filters, subscription groups, download formats.
- **Privacy-conscious user**: wants store-safe profile, no third-party APIs unless opted in, BYO AI keys, no telemetry, 127.0.0.1-only companion.
- **Researcher / student**: wants transcript export + search, per-video notes (not yet shipped), AI summary handoff, watch history analytics.
- **Accessibility user**: wants reduced motion, forced colors, screen-reader live region announcements, no keyboard shortcut conflicts.

### Platforms and distribution
- Self-distributed via GitHub Releases (`https://github.com/SysAdminDoc/Astra-Deck/releases`). Not currently on Chrome Web Store or AMO; submission checklist exists at `docs/cws-submission-checklist.md`.
- Five artifacts per release: Chrome CRX, Chrome ZIP, Firefox XPI, Firefox ZIP, userscript copy.

### Important integrations
- **YouTube**: Innertube API fallback (`/youtubei/v1/player`), watch HTML scrape, caption tracks JSON3, `movie_player.setPlaybackQualityRange()` via MAIN bridge.
- **SponsorBlock**: `sponsor.ajay.app/api/skipSegments/{prefix}` (hash-prefix privacy), 9 category toggles.
- **DeArrow**: `sponsor.ajay.app/api/branding`, `dearrow-thumb.ajay.app/api/v1/getThumbnail`, in-flight dedupe + TTL.
- **Return YouTube Dislike**: `returnyoutubedislikeapi.com/votes`, 100/min rolling budget, 500-entry LRU.
- **Reddit**: `reddit.com/search.json` for the optional Reddit comments panel.
- **AI providers**: OpenAI / Anthropic / Gemini (BYO key) + Ollama local (`127.0.0.1:11434`).
- **Astra Downloader**: local 127.0.0.1 ports 9751–9851.

### Permissions (manifest.json)
- `storage`, `unlimitedStorage`, `cookies`, `downloads`
- 17 host_permissions: 5 YouTube origins, `i.ytimg.com`, SponsorBlock, RYD, OpenAI, Anthropic, Gemini, Reddit (2 origins), 6 AstraDownloader ports, Ollama port.
- CSP `connect-src` enumerates the same origins except Reddit (subtle gap — see Reliability section).

---

## Feature Inventory (selected — full list at ROADMAP.md §Phase 2)

The roadmap's full feature matrix and 354-key schema enumeration is exhaustive. This section highlights the features that the code audit found in non-trivial states (largest blocks, weakest teardown, half-implemented, undocumented). For full coverage see `ROADMAP.md §Phase 2` and `extension/core/settings-schema.js`.

| Feature | Lines (ytkit.js) | Entry | Maturity | Notes |
|---|---:|---|---|---|
| `stickyVideo` (Theater Split) | 8199–12978 (~3,779) | watch-page scroll | complete, large | Heaviest feature; PiP/fullscreen state machine; chat watcher observer; userscript v1.0.6 at root for standalone install. Top peel candidate. |
| `chatStyleComments` | 5888–7225 (~1,337) | watch-page | partial / experimental | CSS injection + comment mutation observer; selection-tracking; off by default. Top-2 peel candidate. |
| `quickLinkMenu` + `quickLinkEditor` | 17036–18210 (~1,173) | masthead logo hover | complete | Dropdown + editor; consider extracting to a `features/quick-links/` module. |
| `reactionSpammer` | 14276–15164 (~888) | live_chat | complete, store-risk | Default OFF, 500ms floor, amber first-use warning. Standalone userscript at root (`YT_Reaction_Spammer.user.js`) carries duplicate logic. |
| `deArrow` | 25936–26800 (~864) | feed cards + watch title | complete | Cache TTL + in-flight dedup; channel overrides; peek button. |
| `subscriptionGroups` | 30645–31344 (~699) | subscriptions feed | partial | Single-level groups only; no nesting, no AI tags (despite `subscriptionAiTags` schema), no dead-channel detection, no bulk unsubscribe. PocketTube gap. |
| `miniPlayerBar` | 21450–22127 (~677) | scroll-past on watch | complete | Position/size persisted. |
| `transcriptViewer` | 20797–21449 (~652) | engagement panels | complete | Five-method failover via `core/transcript-service.js`. |
| `returnDislike` | 30102–30645 (~543) | watch + cards (opt-in) | complete | Budget throttling; LRU 500. |
| `videoHider` | 15354–15892 (~538) | feed cards | complete | Selector-driven; route-scoped; predicate sandbox consumer. |
| `floatingLogoOnWatch` | 7673–8198 (~525) | watch page | complete | Top-3 peel candidate. |
| `premiumLiveChat` | 13615–14040 (~425) | live_chat iframe | partial | Live-chat selector packs (`liveChat`, `liveChatFrame`, `liveChatPlaceholder`) carry `lastVerified: null`. |
| `commentEnhancements` | 13207–13548 (~341) | comments | complete | |
| `watchTimeTracker` + `digitalWellbeing` | 20108–20177 (~69) + `dwWatchTimeToday` | watch-page tick | partial | Tick interval clearable in `destroy()`; no skew/clock-change safeguards. |
| `subscriptionAiTags` | (schema only) | subscriptions sort | partial | Schema seeded, but the v4.3.0 release added Shift+click handler that depends on `localAiSummary` (Chrome Built-in Summarizer); Chrome Summarizer is an origin trial (likely returns empty in CWS Firefox profile). |
| `qualityProfileMatrix` | (MAIN bridge) | per-context | complete | 5 contexts; `inherit` defaults. |
| Selector packs (28 surfaces) | `core/selector-packs/*.js` | — | complete except live-chat | All 28 ship; `liveChat`, `liveChatFrame`, `liveChatPlaceholder` are `lastVerified: null` per the v4.37.0 README; `playerChrome` `lastVerified` should be re-stamped after the H21 liquid-glass capture. |
| `core/feature-lifecycle.js` | 222 lines | (not adopted) | shipped + unused | `createLifecycle()` + `defineFeature()` ready; **zero `defineFeature` call sites in `ytkit.js`**; the 6 peeled features in `extension/features/` don't use it either. |
| `core/toast.js` + `core/toast-dom.js` | 94 + 169 | shared | shipped + partially adopted | Pure helpers extracted (v4.14.0) and DOM factory extracted (v4.42.0); ytkit.js retains a byte-identical inline fallback. |

### Hidden / undocumented surfaces
- **`window.__ytkitOpenAnalytics()`** — globally exposed entry to the watch-history analytics modal, mentioned in CLAUDE.md v3.10 notes but not referenced in README.
- **`window.__ytkitSearchTranscripts(q)` / `window.__ytkitClearTranscriptIndex()`** — IndexedDB transcript search; documented in roadmap v3.30 but not in README.
- **`window.__ytkitDiagnostics.download()`** — emits JSON bug report; mentioned in CLAUDE.md v3.9 but not surfaced as a UI action.
- **`window.__ytkitProfiles`** — settings-profile export/import via console; not exposed in popup UI.
- **`ytkit.unsafe()` console toggle** — exits safe mode; only documented in README §Architecture.
- **`?ytkit=safe` URL param** — safe mode; same.

These deserve a "Power user / console" section in the README or a hidden "Advanced" tab in the popup with one-click invocation.

---

## Competitive and Ecosystem Research

The roadmap §Phase 1 is the canonical landscape — 20 competitors documented with store / GitHub / popularity counts as of 2026-05-21. The relevant deltas for this companion file are:

| Competitor | Notable capability Astra hasn't matched | Implementation note |
|---|---|---|
| **PocketTube** | Nested subscription groups, dead-channel detection, group notifications, bulk unsubscribe with confirmation queue, channel-import/export | All-local IndexedDB + YouTube page fetch fallback; ROADMAP §5.5.0 calls this out but no code yet. |
| **YouTube Alchemy** | Header links (up to 10), native-feel watch-tab view, color-coded video age, transcript export presets, "header buttons that open NotebookLM/ChatGPT" | Astra has `transcriptAiHandoff` + `watchPageTabs` + `videoAgeColors` — but Alchemy's polish is the benchmark. The popup has no equivalent quick-link header editor. |
| **YouFocus** | Per-video notes, study/work mode with timers and exports, focused-history view, channel blocking with timer | Astra has `digitalWellbeing` + `watchHistoryAnalytics` but no per-video notes feature, no Markdown/CSV export for study mode. |
| **UnTrap** | Parental controls, schedules, password-protected settings | Astra explicitly rejects password protection (per CLAUDE.md "use at your own risk" framing); schedules and parental controls would be a v6 differentiator. |
| **YouTube Tweaks** | Mouse-wheel volume / seek zones, anti-autodub split toggles (title/audio/transcript) | Astra has wheel-speed + volume-wheel-mode but no wheel-seek; anti-autodub IS already split per-axis (`antiTranslate` + `antiTranslateAudioTrack` + `antiTranslateTranscript`). |
| **Tweaks for YouTube** | Audio processing (mono mix, high-pass, pan), volume boost, EQ | Astra has `volumeBoost`/`audioNormalization` only in the userscript build per CLAUDE.md (MAIN-world Web Audio API access). Extension parity = MAIN-bridge audio routing. |
| **Video Speed Controller** | Universal speed overlay for all HTML5 video, 0.07x–16x | Astra is YouTube-only. VSC's per-site override model is the polish benchmark. |
| **BlockTube** | "Likes" field in advanced blocking; subscriptions-page improvements; case-insensitive search; user-JS predicate (unsafe) | Astra has the predicate sandbox (`core/predicate-sandbox.js`) with safe-DSL; the `ctx` surface should add a `likes` field and a `subsCount` field to close BlockTube parity. |
| **Scripts.YT / Play-All restoration** | Restored Play All button on home/popular/subs | Astra schema has no `playAllRestore` key; mentioned as `-` in the roadmap matrix. |

What to **intentionally avoid**:
- **Password-protected settings** (UnTrap) — false security; cookie-stored bypass trivial. Roadmap §Privacy already calls this out.
- **Always-on background extension AI inference** — battery, privacy, cost. Astra's "off by default, BYO-key/local-first" stance is correct.
- **Bot-like auto-engagement** (auto-like all subscribed creators, auto-comment, etc.) — `autoLikeSubscribed` is already labeled `store-risk` in the schema. Don't extend this surface; if anything, gate it harder.
- **Direct in-extension yt-dlp / ad-blocking proxy** — too much store-policy risk; the local-companion pattern is the right wall.

---

## Highest-Value New Features

### NF1 — Per-video notes with timestamp anchors

- **User problem**: researchers/students paste timestamps into Obsidian or text files to remember context; there's no in-product way to attach durable notes to a video.
- **Evidence**: roadmap §5.6.0 lists "per-video notes with timestamps and source links"; matrix marks `Per-video notes` as Astra `-` vs UnTrap `P` and "US: Y". `timestampBookmarks` exists (`appState.settings.timestampBookmarks`) but is per-timestamp, not per-video freeform.
- **Proposed behavior**: A small notes button next to the timestamp-bookmarks button; opens a markdown textarea pinned to `(videoId, channelId)`; persists in `chrome.storage.local` under `videoNotes` (object keyed by videoId, capped at 1000 entries with LRU eviction); export as markdown via the existing `transcriptAiHandoff` rail (so notes → NotebookLM / Obsidian URI).
- **Implementation areas**: new `features/research/video-notes/index.js`, popup quick-toggle, schema entry `videoNotes` (object), `videoNotesShowButton` (boolean). Reuse `core/storage-manager.js` LRU pattern. Hook into `core/storage-manager.js` for capacity-bounded persistence.
- **Risks / edge cases**: notes lost when video is unlisted/private; export must scrub anything that looks like an API key or session token via `core/policy-profile.js` `shouldScrubKey()`.
- **Verification plan**: round-trip a note through export/import; verify destroy() removes the button; verify the LRU eviction kicks in at 1001 entries.
- **Complexity**: M. **Priority**: P2.

### NF2 — Subscription Manager v2 (PocketTube parity)

- **User problem**: managing 50+ subscriptions on YouTube is impossible. PocketTube's groups + dead-channel detection + bulk-unsubscribe staging are the dominant solution.
- **Evidence**: ROADMAP §5.5.0; matrix shows Astra `P` vs PocketTube `Y` on subscription groups / group feed / dead-channel detection. Current `subscriptionGroups` (`ytkit.js` 30645–31344) is single-level only.
- **Proposed behavior**:
  - Nested group support (group → sub-group, depth 2 max).
  - Dead-channel detection: weekly sweep that hits the channel's RSS or page; if 410/404 or no uploads in 365 days, flag with a chip and bulk-unsubscribe staging.
  - Bulk unsubscribe with undo: staging list in the popup, "Confirm in 30 days" countdown, undoable from the popup until expiry.
  - Group import/export (JSON, schema v2).
  - Channel-page group chips: click to add/remove the current channel from a group without opening the popup.
- **Implementation areas**: peel `subscriptionGroups` from `ytkit.js` into `features/subscriptions/`; new selector pack `subscriptionPage`; new schema keys `subscriptionGroupsNested`, `subscriptionDeadChannelDetection`, `subscriptionBulkUnsubscribeStaging`.
- **Risks**: YouTube anti-abuse on bulk-unsubscribe scripting; must rate-limit (1/sec, ≤50/day cap) and only confirm with explicit user action per channel.
- **Verification plan**: import a 100-channel JSON, verify nesting, simulate dead channel, exercise bulk-unsubscribe undo timeline.
- **Complexity**: XL. **Priority**: P2.

### NF3 — Selector-health "Copy report" + sidebar dashboard

- **User problem**: when YouTube ships DOM churn, Astra silently fails — users see broken features but have no actionable diagnostic; maintainer has to manually reproduce.
- **Evidence**: ROADMAP §5.1.0 lists "selector health dashboard in diagnostics" + "copy report action"; `core/selector-health.js` already implements `summarize()`, `rankProblemSurfaces()`, `formatCopyReport()` (per the file's own JSDoc), but the popup only renders the top-6 surfaces (`popup.html:102–109`) with no copy/export action.
- **Proposed behavior**: add a "Copy diagnostics report" button in the popup; clipboard payload includes the v4.46.0 version line, the formatted selector miss table, the diagnostic-log ring buffer's last 100 entries (via `core/diagnostic-log.js`), the active feature list, and the active YouTube tab URL. Mark with a unique header line so a future GitHub issue template can paste-and-parse it.
- **Implementation areas**: `extension/popup.html` (button), `extension/popup.js` (clipboard handler), wire `core/selector-health.js#formatCopyReport` + `core/diagnostic-log.js` exports.
- **Verification plan**: trigger a synthetic selector miss, click the button, paste, verify report format. Add hardening test pinning the clipboard payload structure.
- **Complexity**: S. **Priority**: P1.

### NF4 — Conflict map closure + init-time enforcement

- **User problem**: enabling conflicting features yields confusing behavior (e.g., `popOutPlayer` + `pipButton` both trying to control the same `<video>`), with no toast or visual hint.
- **Evidence**: `CONFLICT_MAP` in `ytkit.js:4967–4979` covers 7 pairs; CLAUDE.md lists 6 conflict pairs of which **4 are missing from the map** (`autoPauseOnSwitch↔pauseOtherTabs`, `focusedMode` family, `hideEndCards↔hideVideoEndContent`, `popOutPlayer↔fullscreenOnDoubleClick+pipButton`); init-time conflict check (`ytkit.js:43163–43175`) only logs, doesn't auto-disable.
- **Proposed behavior**: extend `CONFLICT_MAP` to the full 11 pairs documented in CLAUDE.md; auto-disable at init time via the same `showToast` path used at settings-change time; surface the toast with an "Undo" action.
- **Implementation areas**: `ytkit.js:4967–4979` (map extension) and `ytkit.js:43163–43175` (init enforcement) and `ytkit.js:35510–35536` (settings-change enforcement) — keep both paths in sync via a shared helper.
- **Verification plan**: hardening test that asserts every CLAUDE.md-listed conflict appears in `CONFLICT_MAP`; integration test that forces both halves of a pair on and verifies one is disabled.
- **Complexity**: S. **Priority**: P1.

### NF5 — First wave of `feature-lifecycle.js` adoption

- **User problem**: the lifecycle module shipped in v4.7.0 but no feature uses it; the discipline it enforces (AbortController, route token, full destroy()) never materialized.
- **Evidence**: `core/feature-lifecycle.js` exports `createLifecycle()` + `defineFeature()`; grep for `defineFeature` in `ytkit.js` returns zero matches; the 6 `extension/features/*` modules don't use it either.
- **Proposed behavior**: pick the 6 already-peeled features (subtitles, video-filters, blue-light-filter, theme-css, wave-8-css, home-subs-css) and rewrite them to use `createLifecycle().defineFeature({ ... })`. They're CSS-only so the destroy() contract is trivial — they're the safest starting point.
- **Implementation areas**: each `extension/features/*/index.js`; the calling sites in `ytkit.js` (lines 5015, 14052, 18254, etc.).
- **Risks**: minor regression in CSS feature lifecycle ordering; pin via the existing hardening tests.
- **Verification plan**: existing 34 hardening tests on the 6 peeled features must still pass; add 1 new test per feature confirming `defineFeature` is called.
- **Complexity**: M. **Priority**: P1.

### NF6 — Astra Downloader trust + recoverable install flow

- **User problem**: the .exe is unsigned (SmartScreen warns), there's no Add/Remove Programs entry, the extension's install prompt permanently dismisses on "Not now" with no obvious recovery, and no auto-update path exists for the companion.
- **Evidence**: subagent audit Part A §7–§8; README §134–168 documents install but doesn't address recovery/uninstall; `_ytkit_mediadl_prompt_dismissed` persists in `chrome.storage.local` until manually cleared.
- **Proposed behavior**:
  - Sign the .exe with a SmartScreen-friendly certificate (or document the Microsoft submission flow). Cost-aware: GitHub Releases without signing is fine for self-distribution if the README warns and shows the SHA-256 of every .exe.
  - Add "Reinstall Astra Downloader" action in the popup's storage stats card (clears `_ytkit_mediadl_prompt_dismissed` + re-runs `MediaDLManager.check()`).
  - Add Add/Remove Programs entry via PyInstaller's installer hook (or a tiny `.msi` wrapper).
  - Add `/update` endpoint to AstraDownloader; check for newer Releases asset (semver compare), download to a temp file, atomically replace, restart.
- **Implementation areas**: `astra_downloader/build.py` (signing + Add/Remove entry), `astra_downloader/astra_downloader.py` (`/update` endpoint + version compare), `extension/popup.html` (Reinstall action), `extension/popup.js` (clear dismissed flag + retry).
- **Risks**: code-signing certs cost money; atomic replace on Windows is tricky if the .exe is running.
- **Verification plan**: smoke-install on a clean VM, verify SmartScreen behavior, verify Reinstall action, verify `/update` semver compare via `test_astra_downloader.py`.
- **Complexity**: L. **Priority**: P1 (Reinstall + `/update`); P2 (signing + .msi).

### NF7 — Multi-select checkbox UI for array settings

- **User problem**: array settings like `hiddenChatElements`, `hiddenActionButtons`, `hiddenPlayerControls` are edited in the popup as raw JSON textareas (v4.41.0 feature) — power-user-only UX.
- **Evidence**: subagent popup audit §2; `popup.js:1705–1775`; default-settings has 6 array entries.
- **Proposed behavior**: detect `schema.type === 'array'` AND `schema.knownValues` (new optional field listing valid items, e.g., `['like', 'share', 'ask', ...]`). When `knownValues` is present, render as a checkbox grid instead of a textarea. Falls back to textarea otherwise (e.g., `quickLinkItems` free-text). Add `knownValues` to the 6 array keys in `core/settings-schema.js`.
- **Implementation areas**: `core/settings-schema.js` (extend 6 array entries with `knownValues`), `extension/popup.js:1705–1775` (renderer fork).
- **Verification plan**: round-trip an edit through the new checkbox UI; verify JSON parity with the textarea path.
- **Complexity**: S. **Priority**: P2.

### NF8 — Reduced-motion guard on popup status pulse + global audit _[shipped — invariant pin only]_

- Re-examined: `popup.css:2052-2057` already declares the universal
  `* { animation: none !important; transition: none !important; }` guard
  under `@media (prefers-reduced-motion: reduce)`, which covers every
  keyframe (status-pulse, spin, fade-down, backdrop-in, modal-in, shimmer)
  and every transition in the popup. `early.css` has no animations or
  transitions to guard.
- Real gap closed: added the `v4.47.0 popup.css honours prefers-reduced-motion globally`
  hardening test so future refactors cannot silently scope the guard
  narrower or drop it. `ytkit.js` style injectors are content-script-only
  and inherit YouTube's own reduced-motion respect.

### NF9 — Wheel-seek + ROI mouse zones for the player

- **User problem**: VSC and YouTube Tweaks expose per-axis mouse-wheel zones (left third = speed, right third = volume, bottom = seek). Astra ships `scrollWheelSpeed` and `volumeWheelMode` but no seek; competitors are ahead here per the matrix (`Mouse wheel speed/volume/seek` Astra `Y` but only on two axes).
- **Evidence**: schema has `scrollWheelSpeed` + `volumeWheelMode`; no `wheelSeek` key. Project policy bans keyboard shortcuts — pointer modifiers are explicitly the substitute.
- **Proposed behavior**: new `wheelSeek` setting; reuses the existing `{ passive: false }` wheel handler in the volumeWheelMode feature; modifier-key gating (Shift+wheel = seek ±5s, default no-modifier = volume, Ctrl+wheel = zoom — already taken by `videoZoom`).
- **Implementation areas**: `ytkit.js` near `volumeWheelMode` impl; new schema entry under `playback-audio`.
- **Verification plan**: manual smoke test; conflict check against `videoZoom` (Ctrl already claimed).
- **Complexity**: S. **Priority**: P3.

### NF10 — Pages-and-popups DOM inventory check / dead-feature sweep

- **User problem**: 354 keys exist; some features ship but never wired in (e.g., `subscriptionAiTags` depends on Chrome Built-in Summarizer which is origin-trial-gated and silently no-ops outside Chrome stable's origin trial; `popOutPlayer` Document PiP API is experimental). No mechanism surfaces "this feature is on but doing nothing in this browser".
- **Evidence**: `popOutPlayer` schema marks `experimental`; `localAiSummary` requires Ollama at 11434; no UI surfaces capability detection.
- **Proposed behavior**: `core/capability-probe.js` runs once per session and writes `_capabilityProbe` (object) with `{documentPip, summarizerApi, ollama, deno, bgutilProvider, mediaDL, codecAv1, codecVp9, hevc}` results; popup quick-toggle list and schema overview render a grey "unavailable" chip for features whose schema declares a required capability.
- **Implementation areas**: new `core/capability-probe.js`; extend `core/settings-schema.js` entries with optional `requires: ['documentPip']` etc; popup row renderer renders chip when `requires.some(c => probe[c] === false)`.
- **Verification plan**: simulate "no Ollama" + "no Document PiP" probes, verify chip; verify enabling the toggle still works but shows "Unavailable in this browser" inline.
- **Complexity**: M. **Priority**: P2.

---

## Existing Feature Improvements

### EI1 — `// reason:` catch invariant enforcement _[partial — shipped + scoped to background.js]_
- Rule shipped at `scripts/eslint-rules/require-catch-reason.js` and wired into `eslint.config.js` as `error` on `extension/background.js` (which is currently 100 % compliant after one annotation fix at `background.js:414`). Rule matches the empty-catch-without-reason pattern only — non-empty catches (logging, returning, anything) pass regardless of comment.
- Pinned by `v4.47.0 ESLint require-catch-reason rule is wired and enforces v3.14.0 invariant` hardening test which exercises 6 contract cases (empty without/with reason, case-insensitivity, leading/indented comments, non-empty body) via the ESLint Linter API.
- **Deferred (still tracked):** popup.js (41 catches), ytkit.js (175 catches), core/*.js (50 catches) need a per-file violation audit + bulk annotation pass before the rule can extend to them. The rule itself doesn't change — only `eslint.config.js` `files:` widens.

### EI2 — Reset action: staging + undo grace period
- **Current behavior**: popup Reset wipes `chrome.storage.local` after one confirm dialog; no rollback (subagent popup audit §7).
- **Problem**: a misclick destroys 354 settings + hidden lists + bookmarks; policy says "no confirmation dialogs" but this is the rare reversible case where staging works better.
- **Recommended change**: replace the confirm dialog with a soft-delete staging: snapshot current state into `_resetSnapshot` (object with TTL 7 days), wipe live settings, show a sticky toast with "Undo (7 days)" action. Auto-purge after 7 days.
- **Touches**: `extension/popup.js#resetStorage`, `core/storage-manager.js` for `_resetSnapshot` LRU, popup CSS for sticky toast.
- **Backward compat**: existing import/export flows unaffected.
- **Verification**: round-trip reset → undo → state restored byte-identical; expiry test fast-forwards `Date.now()`.
- **Complexity**: M. **Priority**: P1.

### EI3 — Search filter expands to descriptions / risk / category _[shipped]_
- Shipped: `parseSearchQuery` + `entryPassesFilters` helpers in `popup.js` add a mini-DSL — `risk:api`, `category:downloads`, `scope:watch`, `profile:store-safe`. Comma-separated values inside a field act as OR; multiple field clauses AND. Unknown fields fall back to free text so typos don't silently swallow the user's input.
- Wired into both the quick-toggle list (`render`) and the schema overview (`renderSchemaOverview`) — the quick-toggle path joins each row to its schema entry by storage key so field filters work even on the curated 18-item list.
- Schema overview free-text now also matches the humanised label and the schema entry's `description`.
- Popup placeholder updated to surface the syntax (`Filter — try risk:api or category:downloads`); full grammar in the `title` tooltip.
- Pinned by `v4.47.0 popup search mini-DSL parses field filters and forwards free text` hardening test (parser + entryPassesFilters AND/OR semantics).

### EI4 — Top-3 monolith peel
- **Current behavior**: `stickyVideo` (3,779 lines), `chatStyleComments` (1,337 lines), `floatingLogoOnWatch` (525 lines) — together 12.7 % of `ytkit.js`.
- **Problem**: stickyVideo alone has 40+ state properties; fast-SPA-nav cleanup bugs have shipped twice (theater-split v1.0.6); ESLint, jsdoc, and per-feature tests can't focus on it while it's buried in the monolith.
- **Recommended change**: peel each into `extension/features/<name>/index.js` with `defineFeature()` from the lifecycle module; preserve byte-identical inline fallback in `ytkit.js` for userscript build (per the pattern in `features/home-subs-css/index.js` etc.).
- **Touches**: 3 new `features/*/index.js`; `manifest.json` content_scripts arrays; `sync-userscript.js`; `ytkit.js` delegation glue.
- **Backward compat**: userscript parity tests pin the inline-vs-module byte-identical fallback.
- **Verification**: existing theater-split test + 2 new tests per peel.
- **Complexity**: L per feature (XL total). **Priority**: P2.

### EI5 — Manifest CSP adds `https://www.reddit.com https://old.reddit.com`
- **Current behavior**: `manifest.json#content_security_policy.extension_pages` connect-src enumerates AI / SponsorBlock / RYD / AstraDownloader / Ollama but **omits Reddit** even though `host_permissions` includes both Reddit origins.
- **Problem**: Reddit comments panel uses `EXT_FETCH` proxy via background.js so the popup CSP doesn't strictly need Reddit, but the asymmetry between host_permissions and connect-src is a smell that will eventually bite (e.g., when a popup feature fetches Reddit directly).
- **Recommended change**: add `https://www.reddit.com https://old.reddit.com` to `connect-src`. Audit every host_permissions entry against the CSP for the same gap.
- **Touches**: `extension/manifest.json:248`.
- **Verification**: hardening test that asserts every host_permissions origin appears in connect-src (modulo HTTP loopback variations).
- **Complexity**: S. **Priority**: P2.

### EI6 — `i18n` feature-definition labels move out of `ytkit.js`
- **Current behavior**: ~150 feature definitions in `ytkit.js` carry hardcoded English `name` + `description` (per CLAUDE.md v3.21 coverage caveat); only popup quick-toggle labels are translated.
- **Problem**: 9 non-English locales ship today but feature-card text in the popup workspace card and schema overview is English-only.
- **Recommended change**: extend `scripts/extract-i18n-keys.js` to harvest `name:` / `description:` from the features array; emit `feature_<id>_name` / `feature_<id>_desc` keys; wire ytkit.js feature renderer to consult `t('feature_X_name', fallback)`.
- **Touches**: `scripts/extract-i18n-keys.js`, `_locales/*/messages.json` (regen via `scripts/generate-locales.js`), `ytkit.js` feature renderer.
- **Verification**: `npm run check:i18n` passes; 10-locale parity test extends to feature labels.
- **Complexity**: M. **Priority**: P3 (deferred to v5.2.0+ per ROADMAP).

### EI7 — Storage Manager flush-on-blur for the popup _[wontfix — architecture correct]_
- Re-examined: the popup does **not** use the `StorageManager` debounce
  layer — every write goes through `chrome.storage.local.set(...)` directly
  (`popup.js:441`), which is itself event-loop-synchronous IPC into the
  storage layer. There is no in-popup debounce to flush.
- The `StorageManager` debounce + `beforeunload`/`yt-navigate-start` auto-flush
  hooks at `core/storage-manager.js:141-158` are for the content-script
  consumer (`ytkit.js`), which is where the original concern would apply
  — and those hooks were already installed in earlier hardening passes.

### EI8 — Live-chat fresh capture (selector packs `lastVerified: null`)
- **Current behavior**: 3 selector packs ship as `needsFreshCapture: true, lastVerified: null` (per roadmap §v4.37.0).
- **Problem**: live-chat features (`premiumLiveChat`, `hiddenChatElementsManager`, `chatKeywordFilter`, `reactionSpammer`) ride on these selectors; if YouTube ships a live-chat DOM change, Astra has no fixture-backed regression.
- **Recommended change**: follow `docs/selector-fixture-workflow.md` to capture `mhtml/LiveChat.mhtml` from an active live stream; promote into `tests/fixtures/`; re-stamp `lastVerified` on the 3 packs; flip `needsFreshCapture` to false.
- **Touches**: `mhtml/LiveChat.mhtml` (new, gitignored), `tests/fixtures/yt-live-chat.tokens.txt` (regen), `extension/core/selector-packs/liveChat.js`, `liveChatFrame.js`, `liveChatPlaceholder.js`.
- **Verification**: `npm test -- --test-name-pattern "Selector"`.
- **Complexity**: S (capture-bounded). **Priority**: P0 (per ROADMAP §5.1.0 acceptance).

### EI9 — Liquid-glass player chrome capture + selector refresh (HARDENING H21)
- **Current behavior**: HARDENING.md H21 deferred; pending fresh capture of YouTube's new player UI.
- **Problem**: pill-shaped action container, no pause dim, smaller double-tap-skip, dynamic like animations. Features `popOutPlayer`, `pipButton`, `fullscreenOnDoubleClick`, `speedIndicatorOverlay`, `playbackSpeedOSD`, etc. all sit on `playerChrome` / `playerSettings` selector packs.
- **Recommended change**: follow `docs/selector-fixture-workflow.md` against a Chrome profile that has the liquid-glass rollout; promote `mhtml/WatchPage-liquid-glass.mhtml`; extend `playerChrome.js` `stable` array with the new pill selectors; keep old selectors as `fallback` during A/B window.
- **Touches**: `extension/core/selector-packs/playerChrome.js`, `playerSettings.js`; HARDENING.md H21 close-out.
- **Verification**: manual smoke test of `popOutPlayer`, `pipButton`, `fullscreenOnDoubleClick` on a liquid-glass-enabled video.
- **Complexity**: S (capture-bounded). **Priority**: P0 (per ROADMAP §risks).

### EI10 — README badge sync + Featured screenshot
- **Current behavior**: `README.md:8` says `version-4.5.2`; actual is `v4.46.0`.
- **Problem**: visible user-facing trust signal mismatch; suggests the README is stale.
- **Recommended change**: change to `version-4.46.0`; add a "Latest" auto-updating badge sourced from GitHub Releases (shields.io endpoint); add a screenshot of the popup at v4.46.0 (current README has none).
- **Touches**: `README.md`; new `docs/screenshots/popup.png`.
- **Verification**: human review.
- **Complexity**: S. **Priority**: P0.

### EI11 — `*.bak` files at repo root
- **Current behavior**: `ls` shows `YTKit.user.js.bak`, `theater-split.user.js.bak`, `YT_Reaction_Spammer.user.js.bak`, `YTKit-v1.2.0.user.js` at repo root.
- **Problem**: developer cruft; the archive/ directory is the canonical place for old userscript versions.
- **Recommended change**: delete `*.bak` files; move `YTKit-v1.2.0.user.js` into `archive/` (it's already a v-tagged build); add `*.bak` to `.gitignore`.
- **Touches**: `.gitignore`, file deletions.
- **Verification**: `git status` shows clean tree.
- **Complexity**: S. **Priority**: P2.

### EI12 — `astra_downloader` response-size cap
- **Current behavior**: subagent audit Part A §2 found no explicit Content-Length cap on HTTP responses from `astra_downloader.py`; relies on Waitress's internal limits.
- **Problem**: a future endpoint that streams big payloads (e.g., download progress logs) could OOM the Flask process.
- **Recommended change**: add `MAX_RESPONSE_BYTES = 10 * 1024 * 1024` constant, wrap every `flask.Response` builder in a size guard, return 413 if exceeded.
- **Touches**: `astra_downloader/astra_downloader.py`, new test in `test_astra_downloader.py`.
- **Verification**: pytest that POSTs a 12 MB payload to a future endpoint and asserts 413.
- **Complexity**: S. **Priority**: P2.

### EI13 — Downloader: parallelize concurrent yt-dlp invocations
- **Current behavior**: `MAX_CONCURRENT = 3` in the queue, but yt-dlp invocations are serialized inside `_run_download` per the subagent audit.
- **Problem**: queuing 3 downloads doesn't actually run 3 yt-dlp processes; they wait. With 1080p movies that's 30+ min wall time vs 10 min wall time.
- **Recommended change**: spawn yt-dlp via `threading.Thread` (3 thread pool), let each process run independently; bound total memory via `psutil.Process.memory_info()` polling that pauses new starts above a configurable watermark.
- **Touches**: `astra_downloader/astra_downloader.py#DownloadManager._run_download`.
- **Risks**: bandwidth saturation; expose `MaxParallelDownloads` config (default 1, max 3).
- **Verification**: pytest forcing 3 concurrent `/download` calls; assert all 3 reach `downloading` state within 200ms.
- **Complexity**: M. **Priority**: P2.

### EI14 — End-to-end download test (mocked yt-dlp)
- **Current behavior**: `test_astra_downloader.py` exhaustively unit-tests normalizers, security, and config but never invokes a full download flow.
- **Problem**: regressions in the `/download → yt-dlp argv → status callback → history persist` chain go undetected until a user reports a failure.
- **Recommended change**: add `EndToEndDownloadTests` class that uses a fake yt-dlp binary (a tiny Python script that prints fake progress lines and writes a 1 KB output file); exercise the full state machine.
- **Touches**: `astra_downloader/test_astra_downloader.py`, `astra_downloader/fixtures/fake_yt_dlp.py` (new).
- **Verification**: pytest passes; integration coverage delta visible in CI.
- **Complexity**: M. **Priority**: P2.

### EI15 — MHTML capture inventory expansion
- **Current behavior**: 4 captures (Home, Watch, Subscriptions, Watch long-form) per ROADMAP §Phase 0 capture table.
- **Problem**: no fixtures for: Shorts player, channel page (Videos/Playlists/Community tabs), notifications dropdown menu, search results page, history page, watch later page, post-video creator page, embedded player (youtube-nocookie).
- **Recommended change**: capture 8 new MHTML files following `docs/selector-fixture-workflow.md`; regenerate fixtures; promote new selector packs (`channelPage`, `searchResults`, `notificationsDropdown`, `historyPage`, `embeddedPlayer`) as the surfaces stabilize.
- **Touches**: `mhtml/*.mhtml`, `tests/fixtures/*.tokens.txt`, new selector packs.
- **Verification**: `npm test -- --test-name-pattern "Selector"`.
- **Complexity**: M. **Priority**: P2.

---

## Reliability, Security, Privacy, and Data Safety

### Bugs / risks found
- **R1 (LOW)** — `astra_downloader` token doesn't rotate on restart (subagent audit Part A §2). Documented as user-controlled in `ServerToken` config but easy to forget.
- **R2 (LOW)** — `_pendingReveals` cap-bypass on hydration fixed in H25; the cap itself is 1024 — high-volume users (>1024 in-flight downloads ever) lose oldest pending reveal silently. Documented; acceptable trade-off.
- **R3 (LOW)** — `chrome.downloads.show` failure on file move is silently swallowed (`background.js:357–360` `// reason: Explorer reveal may fail if file was moved before reveal`). User has no indication that the reveal failed; consider toast on the popup.
- **R4 (MED)** — `videoNotes` / `timestampBookmarks` / `videoHistory` storage is unbounded between LRU sweeps (every 5 min). A burst of activity could blow past `chrome.storage.local`'s post-`unlimitedStorage` ceiling (~1 GB on most Chromiums).
- **R5 (MED)** — Manifest CSP doesn't include Reddit origins (EI5 above). Currently inert because Reddit fetches go through background proxy, but a popup-side feature that fetches directly would break.
- **R6 (LOW)** — `policy-profile.js` scrubs API keys by regex `/apiKey$/i` and `/token$/i`. Doesn't catch `apikey_v2` or `bearer`. Extend regex set.
- **R7 (LOW)** — `astra_downloader` writes Netscape cookies to `INSTALL_DIR\.cookies.{uuid}.txt` with file mode 0o600 but no directory perm (subagent audit Part A §4). On a shared Windows account, sibling processes can read. Already in-band loopback only; acceptable.
- **R8 (LOW)** — Cobalt fallback (`downloadCobaltFallback`) defaults to `api.cobalt.tools` — a public instance whose ToS / availability can change. Document that users should run their own Cobalt instance for reliability; surface "Cobalt instance unreachable" diagnostic in download health panel.

### Missing guardrails
- **G1** — No remote-code-audit gate in CI; the manifest CSP forbids it but the build pipeline doesn't double-check `eval` / `Function` / dynamic-script-inject in built artifacts.
- **G2** — No secret scanner gate; should grep built artifacts for hex/Base64-shaped strings matching common API-key formats; fail CI if found.
- **G3** — No long-session memory leak test (ROADMAP §5.9.0 calls this out).
- **G4** — No `npm audit` gate in CI; HARDENING.md mentions it ran clean for H25, but it's not enforced per-PR. Add to `npm run check`.

### Permission / network / FS concerns
- Permissions look minimal and justified; the `cookies` + `downloads` + `unlimitedStorage` set is needed.
- `host_permissions` covers exactly what's used; no `<all_urls>`. Good.
- AstraDownloader confines outputs to allowed roots (subagent audit Part A §4); robust against path traversal.

### Recovery / rollback needs
- Reset wipes everything with no undo (EI2 above).
- "Not now" permanently dismisses the AstraDownloader install prompt (NF6 above).
- Settings profile import overwrites with no staging; could mirror EI2's snapshot pattern.

### Logging / diagnostics needs
- `core/diagnostic-log.js` already exists with a 500-entry ring buffer + `window.__ytkitDiagnostics.download()` exporter.
- Missing: a popup-side "Copy diagnostic log" button (NF3 above bundles this with selector-health).

---

## UX, Accessibility, and Trust

### Onboarding gaps
- No first-run experience; user installs and goes directly into 200+ features. Consider a one-time "welcome card" in the popup the first time it opens, with 3–4 most-recommended toggles and a link to README.
- README has no screenshot (EI10).
- No "What's new in v4.46.0" surface; users have to read CHANGELOG.md.

### Empty / loading / error / disabled states
- Popup data-flow panel is hidden by default (`privacyDataFlowPanel` off); doesn't surface "Enable Data-Flow Panel to see external API origins" hint when toggled off.
- Storage stats card renders zeroes during boot — could show a `…` skeleton.
- AstraDownloader install prompt: when AstraDownloader is unreachable mid-page, the install prompt re-opens; no per-tab dismiss vs permanent dismiss distinction.

### Destructive / irreversible actions
- Reset (EI2).
- Settings profile delete (no undo, no soft-delete).
- Hidden videos bulk import via "Replace" mode could nuke a curated list with no recovery.
- AstraDownloader `/download` with the same URL re-downloads (v3.20.8 archive lock removal): no warning that the file will be overwritten.

### Settings clarity
- 354 keys is a lot. The category grouping helps; the schema overview helps further. Consider a "Profile picker" landing card in the popup with 4 curated profiles (`Default`, `Focus mode`, `Researcher`, `Power user`) that flip groups of toggles at once. `lowPowerProfile` and `feedTriageProfile` are precedents; extend to higher-level personas.

### Accessibility issues
- Missing `prefers-reduced-motion` guard (NF8).
- Multi-select arrays as raw JSON (NF7).
- No screen-reader smoke for the popup status banner pulse (`docs/screen-reader-smoke.md` covers most but not the storage banners).

### Microcopy / trust signals
- "Use at your own risk" warning for `reactionSpammer` is good.
- Astra Downloader install prompt copy could explicitly say "this is open-source; SHA-256 verified" + show the hash.
- AI provider rows don't show "Key stored locally only" trust message inline (only in privacy-data-flow panel which is off by default).

---

## Architecture and Maintainability

### Module / boundary improvements
- **A1** — `core/feature-lifecycle.js` adoption (NF5). Single-biggest architectural win available because the code already exists.
- **A2** — Top-3 peel from monolith (EI4). Frees per-feature ESLint, focused tests, jsdoc.
- **A3** — Hoist `showToast` / `Modal` / `Slider` factories / `DebugManager` from `ytkit.js` into `core/` with the same delegation+fallback pattern v4.42.0 used for `toast-dom.js`. Subagent ytkit audit §5.
- **A4** — `astra_downloader.py` is one giant file; consider splitting into `astra_downloader/server.py`, `tray.py`, `download_manager.py`, `path_safety.py`, `config.py` per the `pytest.ini` style.

### Refactor candidates
- `ytkit.js` IIFE wrapper (5 → 43298): hard to navigate; consider splitting on `// ── REGION: feature_<id> ──` markers as a transitional readability step before module peels.
- `CONFLICT_MAP` (NF4) — make the map declarative (data only) and the enforcement separately testable.
- `popup.js` is a 2,443-line ES2020 module with no internal sections; could split into `popup-renderer.js`, `popup-actions.js`, `popup-data-flow.js`, `popup-schema-overview.js` and keep `popup.js` as the bootstrap.

### Test gaps
- No E2E download test (EI14).
- No long-session memory leak test (G3).
- No fixture for live-chat, Shorts, search results, channel page (EI15).
- No popup snapshot/visual regression test.
- No userscript-runtime test (parity tests only check string-level equivalence).

### Documentation gaps
- README badge drift (EI10).
- No architecture map for contributors (subagent audit Part B §5).
- No "how to add a feature" guide beyond CONTRIBUTING.md §"Adding a Feature" (which is 5 bullet points).
- No "how to write a hardening test" guide.
- No debugging guide (DevTools, console invariants, safe mode, diagnostic log).
- README doesn't link to `docs/cws-submission-checklist.md`, `docs/predicate-sandbox-investigation.md`, `docs/screen-reader-smoke.md`, `docs/selector-fixture-workflow.md`, `docs/signing-keys.md` — these are great references buried where users won't find them.

### Release / build / deployment gaps
- No staged release (alpha/beta channels). `gh release create vX.Y.Z` is the only path; users on `--bump patch` see daily-ish releases.
- No release notes generated from CHANGELOG (the workflow uses `--generate-notes` which generates from PR titles; the CHANGELOG entries are richer and unused).
- No SBOM (software bill of materials) generated; useful for store submission.
- No store-safe vs github-full **separate releases**; today both are bundled in the same artifact. `policy-profile.js` enforces the runtime split but the build doesn't emit two ZIPs.

---

## Prioritized Roadmap

Each item is sized + scoped to a coding agent. Items are grouped by phase; phases are designed so each can ship independently.

### Phase A — Trust & docs sync (≤1 day of work each)

- [x] **P0 — Sync README badge to v4.46.0 + add popup screenshot**
  - Shipped: badge now uses `shields.io/github/v/release/SysAdminDoc/Astra-Deck` so it self-updates per release tag.
  - Popup screenshot still pending (deferred; requires loaded extension in a browser session).
  - Commit: see `chore(docs): refresh README` in the autonomous-loop run.

- [ ] **P0 — Capture and commit live-chat MHTML fixtures**
  - Why: 3 selector packs ship `lastVerified: null` and `needsFreshCapture: true`; live-chat features ride on them.
  - Evidence: `extension/core/selector-packs/liveChat.js`, `liveChatFrame.js`, `liveChatPlaceholder.js`; ROADMAP §5.1.0 acceptance.
  - Touches: `mhtml/LiveChat.mhtml` (new, gitignored), `tests/fixtures/yt-live-chat.tokens.txt`, 3 selector pack `lastVerified` stamps.
  - Acceptance: `npm test -- --test-name-pattern "Selector"` passes; `lastVerified` non-null in all 3 packs.
  - Verify: `npm run build:fixtures && npm test`.

- [ ] **P0 — Capture YouTube liquid-glass player chrome (HARDENING H21 close-out)**
  - Why: H21 explicitly defers selector promotion until a fresh capture lands; player chrome features (popOutPlayer, pipButton, etc.) at risk.
  - Evidence: `HARDENING.md` H21 section.
  - Touches: `mhtml/WatchPage-liquid-glass.mhtml`, `extension/core/selector-packs/playerChrome.js`, `playerSettings.js`.
  - Acceptance: `playerChrome.stable` includes the pill-shaped action container; `lastVerified` re-stamped.
  - Verify: manual smoke test of popOutPlayer + pipButton + fullscreenOnDoubleClick on a liquid-glass-enabled video.

- [x] **P2 — Delete `*.bak` files at repo root; gitignore them**
  - Shipped: removed `YTKit.user.js.bak`, `YT_Reaction_Spammer.user.js.bak`, `theater-split.user.js.bak`, and the duplicate `YTKit-v1.2.0.user.js` (canonical copy lives in `archive/`). `*.bak` was already in `.gitignore`.

### Phase B — Hardening invariants (1–3 days each)

- [x] **P1 — Ship the `// reason:` ESLint rule (partial — background.js scoped)**
  - Shipped: see EI1. Rule + wiring + hardening test all in place; background.js compliant. Bulk popup.js / ytkit.js / core/* rollout deferred behind a per-file annotation audit.

- [x] **P1 — Close the conflict map (partial — only the truly-conflicting pair added)**
  - Re-examined: the CLAUDE.md claim of 6 missing conflict pairs is documentation rot. In-code comments at `ytkit.js:4973–4976` document the explicit decoupling mechanism for each — `focusedMode` was scoped to related videos only; `autoPauseOnSwitch + pauseOtherTabs` tag pause reasons; `popOutPlayer / pipButton / fullscreenOnDoubleClick` coordinate via `__ytkit_videoPopped`; `hideEndCards / hideVideoEndContent` is a parent/sub-feature relationship. Adding those back would undo correctness work.
  - **Real gap closed:** `forceH264 ↔ codecSelector` IS a hard conflict — `_syncMainWorldCodec` at `ytkit.js:1143-1146` silently lets `forceH264` override the user's `codecSelector` choice. Added the symmetric pair so the auto-disable toast surfaces the silent override.
  - **Init-time enforcement:** kept silent (DebugManager.log only), not toasted. Toasting on every page load would be noisy because init runs per SPA navigation; the loud feedback path stays at settings-change time.
  - Shipped: new CONFLICT_MAP entries + cooperative-pair comment block. Pinned by `v4.47.0 CONFLICT_MAP pins the documented mutually-exclusive pairs` hardening test. CLAUDE.md §Architecture Notes synced to match the actual map.

- [x] **P1 — Build selector-health "Copy report" + diagnostics export**
  - Shipped: `popup.html` carries the `Copy report` button + an aria-live `selector-health-copy-status` line; `popup.html` now also bundles `core/selector-health.js` so `formatSelectorCopyReport` runs client-side. `popup.js` adds `copySelectorHealthReport()` with an `_selectorHealthCopyInFlight` guard against rapid double-clicks. Payload prepends `activeTab: <url>` + ctx counts to the standard report. Clipboard write prefers `navigator.clipboard.writeText` with `execCommand('copy')` fallback for locked-down contexts. All 7 new i18n keys added to en + 9 non-EN locales (English placeholders pending a future locale sweep per ROADMAP §i18n). Pinned by `v4.47.0 popup ships selector-health "Copy report" wiring end-to-end` hardening test.
  - Future: include the diagnostic-log ring buffer + a "Save report as JSON" sibling action for offline filing (deferred — current button covers the GitHub-issue paste path).

- [x] **P1 — Add `prefers-reduced-motion` guard across all Astra CSS**
  - Re-examined and shipped:
    - `popup.css:2052-2057` **already** carries the global `* { animation: none !important; transition: none !important; }` guard — subagent audit missed it. No CSS change needed.
    - `early.css` declares zero animations/transitions — nothing to guard.
    - **Real gap was the missing invariant pin.** Added `v4.47.0 popup.css honours prefers-reduced-motion globally` hardening test (`tests/hardening.test.js`) so the universal-selector guard cannot be silently scoped-narrower or dropped.

- [~] **P1 — Add manifest CSP `connect-src` Reddit origins** _[wontfix — architecture correct]_
  - Re-examined: the popup script does no cross-origin fetches; every
    external request goes through `background.js#EXT_FETCH` proxy. The
    `extension_pages` CSP only scopes what the popup HTML can reach, so
    omitting YouTube / i.ytimg / Reddit from connect-src is intentional
    least-privilege, not a gap. Audit recommendation withdrawn.

- [ ] **P1 — Reset action: snapshot + 7-day undo**
  - Why: EI2; today's reset is destructive with no recovery.
  - Evidence: subagent popup audit §7.
  - Touches: `popup.js#resetStorage`, sticky-toast CSS, `core/storage-manager.js` for `_resetSnapshot`.
  - Acceptance: reset → undo → state restored byte-identical; expiry test passes.
  - Verify: round-trip test; mocked-clock expiry test.

- [x] **P1 — Add `npm audit --omit=dev` gate to `npm run check`**
  - Shipped: new `npm run audit:deps` script (`npm audit --omit=dev --audit-level=moderate`) appended to `npm run check`. Currently passes with 0 vulnerabilities.

### Phase C — Lifecycle adoption (3–5 days each)

- [ ] **P1 — Wire the 6 peeled features through `defineFeature()`**
  - Why: NF5; lifecycle module shipped but unused.
  - Evidence: `core/feature-lifecycle.js`; no `defineFeature` calls in `ytkit.js`.
  - Touches: each `extension/features/*/index.js`, calling sites in `ytkit.js`.
  - Acceptance: each peeled feature's init/destroy goes through `createLifecycle()` + `defineFeature()`; existing 34 hardening tests still pass + 6 new tests pin the call.
  - Verify: `npm test`.

- [ ] **P2 — Peel `stickyVideo` (3,779 lines) into `features/theater-split/`**
  - Why: EI4; top peel candidate.
  - Touches: `extension/features/theater-split/index.js` (new), `manifest.json`, `sync-userscript.js`, `ytkit.js` glue.
  - Acceptance: byte-identical fallback in `ytkit.js`; lifecycle adoption; existing theater-split tests pass.
  - Verify: `npm test`; manual smoke on watch page with scroll, fullscreen, PiP.

- [ ] **P2 — Peel `chatStyleComments` (1,337 lines)**
  - Why: EI4.
  - Touches: as above for stickyVideo.
  - Acceptance: same.
  - Verify: same.

- [ ] **P2 — Peel `floatingLogoOnWatch` (525 lines)**
  - Why: EI4.
  - Touches: as above.
  - Acceptance: same.
  - Verify: same.

### Phase D — Companion service hardening (1 week)

- [ ] **P1 — Astra Downloader `/update` endpoint + popup "Check for downloader update" action**
  - Why: NF6; today the .exe is stuck at the version installed.
  - Evidence: subagent audit Part A §7.
  - Touches: `astra_downloader/astra_downloader.py` `/update`, `popup.js` action, `MediaDLManager.check()`.
  - Acceptance: semver compare; atomic replace; restart succeeds.
  - Verify: pytest semver compare; manual install of older .exe + click "Update".

- [ ] **P1 — "Reinstall Astra Downloader" popup action (clears `_ytkit_mediadl_prompt_dismissed`)**
  - Why: NF6; "Not now" today is permanent with no obvious recovery path.
  - Touches: `popup.html`, `popup.js`.
  - Acceptance: button visible; click clears the flag + re-runs health probe.
  - Verify: hardening test.

- [ ] **P2 — End-to-end download test with fake yt-dlp**
  - Why: EI14.
  - Touches: `astra_downloader/test_astra_downloader.py`, `astra_downloader/fixtures/fake_yt_dlp.py` (new).
  - Acceptance: full `/download → progress → history` flow asserted.
  - Verify: `python -m pytest astra_downloader`.

- [ ] **P2 — Parallel concurrent yt-dlp downloads (configurable cap)**
  - Why: EI13.
  - Touches: `astra_downloader/astra_downloader.py#DownloadManager._run_download`.
  - Acceptance: 3 concurrent `/download` calls all reach `downloading` within 200ms.
  - Verify: pytest.

- [ ] **P2 — Response-size cap (10 MB) on all Flask responses**
  - Why: EI12.
  - Touches: `astra_downloader/astra_downloader.py`.
  - Acceptance: 12 MB payload returns 413.
  - Verify: pytest.

### Phase E — Subscription manager v2 (2–3 weeks)

- [ ] **P2 — Nested subscription groups (depth 2)**
  - Why: NF2; PocketTube parity (ROADMAP §5.5.0).
  - Touches: `subscriptionGroups` peel into `features/subscriptions/`; new schema `subscriptionGroupsNested`; popup overview integration.
  - Acceptance: 100-channel JSON round-trip preserves nesting.
  - Verify: hardening test + manual smoke.

- [ ] **P2 — Dead-channel detection + bulk unsubscribe staging with 30-day undo**
  - Why: NF2.
  - Touches: peeled subscription module; new schema `subscriptionDeadChannelDetection`, `subscriptionBulkUnsubscribeStaging`.
  - Acceptance: simulate 410 on a channel page; flag rendered; unsubscribe staged; undoable until expiry.
  - Verify: integration test with mocked YouTube responses.

- [ ] **P3 — Group notifications digest panel**
  - Why: NF2.
  - Touches: peeled subscription module; popup integration.
  - Acceptance: per-group "X new since last visit" digest with click-through to filtered feed.
  - Verify: smoke test.

### Phase F — Research workspace (1–2 weeks)

- [ ] **P2 — Per-video notes (`videoNotes` schema + UI)**
  - Why: NF1; ROADMAP §5.6.0; competitive gap vs YouFocus.
  - Touches: `features/research/video-notes/index.js` (new), schema additions, popup integration, export rail.
  - Acceptance: round-trip a note via export; LRU caps at 1000.
  - Verify: hardening test.

- [ ] **P3 — Study/work mode export to Markdown/CSV**
  - Why: NF1 extension; YouFocus parity.
  - Touches: `digitalWellbeing` extension; new export action.
  - Acceptance: 7-day session exports as RFC 4180 CSV + markdown.
  - Verify: round-trip test.

### Phase G — Polish and minor competitive parity (1 week each)

- [ ] **P2 — Multi-select checkbox UI for array settings (NF7)**
- [ ] **P2 — Search filter mini-DSL (EI3)**
- [ ] **P2 — Capability probe + unavailable chip (NF10)**
- [ ] **P3 — Wheel-seek (NF9)**
- [ ] **P3 — Header quick-links editor parity with YouTube Alchemy (10 slots)**
- [ ] **P3 — Anti-autodub split toggles (already split per axis; just expose better in UI)**

### Phase H — Store and contributor docs (1 week)

- [ ] **P2 — Contributor architecture map**
  - Why: subagent audit Part B §5.
  - Touches: `docs/architecture.md` (new) — flowchart from extension → downloader → yt-dlp → file output.
  - Acceptance: includes load order, world boundaries, message contracts, key tests.

- [ ] **P2 — "How to add a feature" walkthrough**
  - Why: subagent audit Part B §5.
  - Touches: `docs/adding-a-feature.md` (new) — worked example using a real CSS feature.

- [ ] **P3 — Store-safe vs GitHub-full separate build artifacts**
  - Why: subagent §release gaps.
  - Touches: `build-extension.js` — emit `astra-deck-chrome-store-safe-vX.zip` and `astra-deck-chrome-full-vX.zip`.
  - Acceptance: store-safe artifact has minimal host_permissions.

---

## Quick Wins

These can land in a single ≤200-line PR each; pick any of them if blocked on bigger work.

- **QW1** — README badge sync (Phase A).
- **QW2** — Manifest CSP Reddit add (EI5). _[wontfix — popup doesn't fetch external; current asymmetry is correct]_
- **QW3** — `*.bak` cleanup + gitignore (EI11). _[shipped]_
- **QW4** — Selector-health "Copy report" button (NF3). _[shipped]_
- **QW5** — `prefers-reduced-motion` guard in popup.css (NF8). _[shipped — invariant pin]_
- **QW6** — Reset action: snapshot + undo (EI2).
- **QW7** — Search filter mini-DSL (EI3). _[shipped]_
- **QW8** — Popup "flush on beforeunload" (EI7). _[wontfix — popup uses synchronous chrome.storage.local, no debounce to flush]_
- **QW9** — `npm audit` gate in `npm run check` (G4). _[shipped]_
- **QW10** — `docs/` cross-link section in README (subagent audit Part B §5). _[shipped]_
- **QW11** — Hidden-API surface (`window.__ytkitOpenAnalytics()`, `ytkit.unsafe()`, `?ytkit=safe`) documented in README §Advanced. _[shipped]_
- **QW12** — "Reinstall Astra Downloader" popup button (NF6 partial).

---

## Larger Bets

Bigger features or refactors that need planning, design, or staged rollout:

- **LB1** — `feature-lifecycle.js` full adoption across all ~200 features (NF5 wave 1 first, then wave-by-wave). 6–12 month effort.
- **LB2** — Subscription Manager v2 with nested groups + dead-channel detection + bulk unsubscribe (NF2). 3 weeks.
- **LB3** — Top-3 monolith peel (EI4). 2 weeks per feature; XL combined.
- **LB4** — Astra Downloader code signing + auto-update + Add/Remove Programs entry (NF6). 1–2 weeks plus cert cost.
- **LB5** — Live-chat / liquid-glass capture pass + selector pack refresh + per-feature regression smoke (EI8 + EI9 + EI15). 1 week (capture-bounded by browser access).
- **LB6** — Store-safe vs GitHub-full split releases (Phase H). 1 week + store-submission timeline.
- **LB7** — `i18n` feature-definition labels across 10 locales (EI6). 1 week build + open-ended translation review.
- **LB8** — Research workspace consolidation: per-video notes + study mode export + summary provenance + spaced review UI (NF1 + Phase F). 2–3 weeks.

---

## Explicit Non-Goals

Ideas considered and rejected:

- **Password-protected settings**. Provides false security on a client-side extension; cookie-stored bypass is trivial. Roadmap §Privacy already calls this out. UnTrap parity not worth the trust-signal cost.
- **Always-on extension AI inference / background summarization**. Battery, privacy, cost. Astra's "off by default, BYO-key/local-first" stance is intentional.
- **Direct in-extension yt-dlp invocation**. Too much CWS/AMO policy risk; the local-companion wall (ports 9751–9851) is the right boundary.
- **Universal HTML5 video speed control** (Video Speed Controller scope). Outside Astra's scope ("YouTube workstation").
- **Mobile YouTube support** (`m.youtube.com`). Explicitly excluded in manifest `exclude_matches`; mobile DOM diverges enough to need its own codebase.
- **YouTube Studio / YouTube Music as first-class targets**. Studio excluded by manifest; Music compat is opt-in only via `youtubeMusicCompat`. Keep that scope.
- **Auto-engagement features** (auto-comment, auto-share, mass-like beyond `autoLikeSubscribed`). Bot-policy risk; `autoLikeSubscribed` already labeled `store-risk`.
- **Keyboard shortcuts**. Project policy explicitly bans them; competitor shortcut features must become visible buttons / pointer / wheel zones (per CLAUDE.md house style).
- **Confirmation dialogs**. Project policy bans them; destructive actions use undo toasts (EI2 follows this).

---

## Open Questions

Only questions that block prioritization or implementation. Do not block the punch list above.

1. **Code-signing certificate budget for Astra Downloader .exe** — if not budgeted, NF6 ships without signing and the README documents SmartScreen warning explicitly. Need maintainer call.
2. **CWS / AMO submission intent** — the `docs/cws-submission-checklist.md` exists but the README says "self-distributed". If submission is on the horizon, Phase H (store-safe / GitHub-full split releases + privacy policy URL) becomes P1 not P3.
3. **Subscription dead-channel detection method** — RSS feed (no auth, no quota) vs channel page scrape (richer but rate-limit risk). NF2 leans RSS for cost; need maintainer call on accuracy bar.
4. **Lifecycle migration cadence** — peel 1 feature/week, 1 category/month, or batch? The 6 already-peeled features could ship lifecycle adoption in a single PR (NF5 wave 1); subsequent waves depend on this.
5. **Live-chat capture availability** — fixture refresh needs a maintainer-side active live stream. Schedule window?
