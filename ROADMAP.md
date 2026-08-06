# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope, and `gh release view v4.50.7` shows `AstraDownloader.exe` + `AstraDownloader.exe.sha256` already attached to that release. Only the clean-Windows-machine verification half remains blocked. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (~1.3K stars, both store listings) and BlockTube is effectively stalled (last push 2026-02-07, 484 open issues, including a MV3 service-worker-suspension defect). Astra already ships BlockTube-grade filtering, so a BlockTube migration guide is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

- `Roadmap_Blocked.md` "P0 — Tag and publish the v4.51.1 release" is **version-stale as of 2026-08-06**: `gh release list` shows the latest published release is still v4.50.7 (2026-07-28), so the item itself is live, but the tree is now at v4.51.4 and the companion has moved to SysAdminDoc/AstraDownloader (a6bb685f) — the release must NOT carry `AstraDownloader.exe` (the `companion-not-republished` / `companion-not-manifested` readiness gates enforce this). Retarget the item to v4.51.4 (or current) with extension artifacts only. Note: several other `Roadmap_Blocked.md` items name `astra_downloader/*.py` paths that no longer exist in this repo — see the 2026-08-06 audit finding "Blocked-item tracker references files removed by the companion split" below.

## Research-Driven Additions — 2026-08-02

Source evidence and rejected alternatives: `RESEARCH.md` (2026-08-02). Baseline at research time was fully green (1272 JS tests, 356 Python tests + 131 subtests, `npm audit` zero advisories at every severity, ESLint clean), so every item below is a latent gap rather than a broken gate. Does not duplicate the 28 items in `Roadmap_Blocked.md`.

### P0 — Delivery

### P2 — Locale fidelity, capability, and maintainability

## Audit Findings — 2026-08-05

Audit-only pass over the companion (v1.9.0) and the extension/userscript surfaces it talks to,
concentrated on the v1.8.0 any-site download change and the v1.9.0 site-sign-in store.
Baseline at audit time: 409 Python tests pass, 1340 JS tests pass, `npm run lint` exit 0,
`npm run check` green through `audit:contrast`. The one baseline failure is recorded below.

- [ ] P3 — Unaudited — needs a pass
  Category: docs
  Where: repo-wide
  Problem: This pass concentrated on the companion (Python, Qt GUI, HTTP routes) and the extension/userscript code paths that consume companion state. The following were not audited and should not be assumed clean: `extension/ytkit.js` feature internals beyond the download surface (~35k lines); the settings-panel, subscription-groups, video-hider, sponsorblock, dearrow and live-chat feature modules; `extension/popup.js` and `sidepanel.js` interaction flows; the MV3 background service-worker lifecycle; `build-extension.js` and the release/SBOM scripts; the extension's own theming across YouTube light/dark (its `audit:contrast` and `audit:a11y` gates pass, which is evidence but not a substitute for driving the surfaces); and Firefox-specific behaviour. The companion's own dark-only palette was checked for text contrast and passes (`muted`/`fieldHint` #8d97a4 → 6.57:1, `toolbarMeta` #aab2bd → 9.09:1 on the #0a0d12 window; disabled-state colours are below 4.5:1 but are WCAG-exempt), so no contrast finding is logged for it.
  Evidence: Scope of this pass, recorded honestly so the next audit starts where this one stopped.
  Fix: Schedule a pass per area, driving the extension surfaces in a real browser rather than reading them.
  Acceptance: Each listed area has either findings or an explicit "audited, clean" note with the method used.
  Confidence: Verified
  Effort: L

## Audit Findings — 2026-08-06

Audit-only pass over the extension/userscript surfaces the 2026-08-05 pass declared unaudited:
`extension/ytkit.js` internals (all 55k lines, three ranges), `extension/core/*`, all 25
`extension/features/*` modules, popup/sidepanel/sidebar/background + manifest, build/release
tooling and `scripts/*` gates, test-suite quality, userscript parity, theming/UX/a11y/microcopy,
and a commit-by-commit review of the v4.51.2→v4.51.4 wave plus the a6bb685f companion split.
Baseline at audit time (recorded before any finding): 1330 JS tests pass, `npm run check` exit 0
(all gates including `audit:deps` — the previously noted dev-advisory failure is cleared),
ESLint clean, all version strings agree at 4.51.4. There are NO pre-existing baseline failures.
Rendered `smoke:settings-overlay` passes all 6 states (dark/light/RTL/tablet/mobile).
Cross-checked against CLAUDE.md session notes, the last 80 commits, and existing
ROADMAP/Roadmap_Blocked items — nothing below re-logs a tracked or previously fixed issue.

### P1

### P2 — Correctness

### P2 — UX / theming / product

### P3 — Correctness / reliability edge cases

- [ ] P3 — Watched-video features mishandle Polymer element recycling / element swaps
  Category: correctness
  Where: extension/ytkit.js:21036-21058 (hideWatchedVideos._process — permanent ytkit-watched-check once-marker + inline display:none/opacity persists on recycled renderers now showing unwatched videos; also runs before the resume-overlay hydrates so watched items are missed); :36891-36922 (disableLoudnessNormalization — `if (!this._videoListener)` guard binds the volume listener to the FIRST video element forever; after YouTube swaps the <video> node the clamp stops and destroy() removes the listener from the wrong element); commit 876008b8's _processThread dataset cache (thread.dataset.ytkitCommentFilterChecked === rules hash) keeps a recycled comment node's previous verdict
  Problem: Three sites, one class: state keyed to a DOM node that YouTube reuses for different content. titleNormalization._processTitle (:19710-19720) and remainingTimeDisplay._attach (:19984-19998) already handle this correctly in the same file.
  Fix: hideWatchedVideos: re-evaluate idempotently per pass (add/remove based on current #progress presence) like videoResolutionBadge; loudness: track the bound element and detach/reattach on change (remainingTimeDisplay pattern); comment filter: include a content marker (text length/prefix) in the checked stamp.
  Acceptance: Tests simulating node reuse: recycled card un-hides / un-dims; volume clamp survives a video-element swap; recycled comment re-evaluates.
  Confidence: Verified (logic; recycling frequency varies by surface)
  Effort: M

- [ ] P3 — Grouped small-correctness batch (verified, one item each, S effort)
  Category: correctness
  Where / Problems:
  1. ytkit.js:8559-8575 — redirectToVideosTab regex branch `\/featured[^/]` consumes a character: `/c/foo/featured?bp=x` → navigates to `/c/foo/featured?/videos` and, because location.href (absolute) never equals the relative newUrl, reassigns the same URL each load (reload loop); plain `/featured` never matches. Fix: `\/featured(?=$|[/?#])` lookahead + compare location.pathname. (Legacy /user|channel|c/ URLs only.)
  2. ytkit.js:4167 — settings-save rollback toast passes 'error' as the COLOR arg; inferToastTone has no such hex → renders neutral "Notice" with polite live-region instead of role=alert. Fix: `showToast(message, undefined, { tone: 'error' })`.
  3. ytkit.js:2963-2975 — unregisterPersistentButton removes only the button; the .ytkit-pc-wrap wrapper + × dismiss remain, and a dismissed control's persistent .ytkit-pc-ghost "Restore" chip survives feature-disable and restores a stale wrapper. Fix: remove `el.closest('.ytkit-pc-wrap')` and the matching ghost chip.
  4. ytkit.js:19950-19974 — remainingTimeDisplay sums OVERLAPPING SponsorBlock segments without merging, and `(-${formatTime(remaining)})` renders "(--0:05)" when remaining goes negative. Fix: merge intervals; clamp at 0.
  5. ytkit.js:31423 — showStatisticsDashboard's totalTimeOnYouTube increments 60s per wall-clock minute regardless of visibility/playback — a pinned background tab inflates it 24/7 (watchTimeTracker checks paused/ended). Fix: gate on document.visibilityState + !video.paused.
  6. ytkit.js:21004-21006 — perChannelSpeed's capture-phase ratechange handler persists rate changes made by OTHER features (musicVideoSpeedLock forcing 1x deletes the channel's saved speed; liveSpeedReset same). Fix: tag programmatic rate writes (shared flag) and skip persisting them.
  7. ytkit.js:21237-21246 — pauseOtherTabs broadcasts on ANY capture-phase play event, including muted hover-preview players: hovering a thumbnail in one tab pauses the playing video in other tabs. Fix: only broadcast when e.target.closest('#movie_player') is the main video.
  8. ytkit.js:22634-22688 — disableInfiniteScroll's "Load More" restore is dead code: onclick clears inline styles but never removes the ytkit-load-more attribute, whose injected !important CSS keeps the continuation hidden; next-page load relies on Chrome reporting isIntersecting for a zero-area element. Fix: remove the attribute on click, re-add on next continuation.
  9. ytkit-main.js:573-605, 638-653 — bufferPreload never restores the player's default buffering goal on disable/page-leave; the 20s goal sticks until next video load. Fix: capture-and-restore or reset on the disable transition.
  10. extension/core/storage.js:236-249 — preloadExtensionState's skip-if-present merge resurrects keys DELETED during the get(null) round-trip (listener deletes the key, merge re-adds the stale snapshot value). Fix: track preload-window deletions in a set and skip them in the merge.
  11. extension/core/persisted-domains.js:666-670 — restoreTranscriptSnapshot runs prepareTranscriptRecord inside the open readwrite transaction after queueing records.clear(); a prepare throw exits the function without aborting → commits clear + partial restore. replaceTranscriptRecords (:586) prepares BEFORE opening the txn — mirror it. (Trigger needs a pre-v3/corrupt row: edge.)
  12. extension/background.js:127 — broadcastSettingsMutation queries only `*://*.youtube.com/*`; content scripts also run on youtube-nocookie.com and youtu.be (manifest:62-66) and the popup's own broadcast uses the full list (popup.js:409-415). Those tabs converge later via storage.onChanged, so cost is latency + silent divergence of two broadcast implementations. Fix: share YOUTUBE_TAB_URLS.
  13. extension/features/dearrow/index.js:341-353 — remote thumbnails[0].timestamp reaches the thumb URL uninterpolated-validated (`time=${thumb.timestamp}`); a crafted value injects extra query params / [object Object] (robustness, not XSS — host fixed). Fix: `Number.isFinite(ts) && ts >= 0` before interpolating; re-splice pinned twin.
  14. extension/features/dearrow/index.js:245-255 vs ytkit.js:37719-37728 — channel-override handle keys drift: reader truncates to `/@handle` via regex; watch-page writer stores the RAW owner href (can carry /featured or query) → override silently ignored on feed cards for suffixed hrefs. Fix: one normalize helper both sides. (Needs-repro: depends on YouTube emitting suffixed owner hrefs.)
  15. extension/features/return-dislike/index.js:186-192, :284-292 — pill renders via a single 1.5s post-navigation timer; if the like/dislike row hydrates later (cold loads), nothing re-arms until next navigation. Fix: bounded retry (3×1s) or a scoped mutation rule on the actions row. (Needs-repro: timing.)
  16. extension/features/subtitles/index.js — dual captions: (a) `_playerResponse()` accepts the stale previous watch page's response when getVideoId() is empty on non-watch SPA pages → wasted timed-text fetch + invisible overlay mount per navigation; (b) _mountOverlay/_attachVideo failure paths call _scheduleLoad(700) without incrementing _retryCount (unbounded loop if tracks resolve but no player node); (c) "Auto" secondary language compares navigator.language, not the active native track → overlay can duplicate the on-screen language. Fix: gate loads on watch routes; count all retries against the budget; read the player's active caption track.
  17. commit 876008b8, ytkit.js — _languageFromScript Cyrillic ternary returns 'ru' on BOTH arms (`/[ыэъё]/i.test(text) ? 'ru' : 'ru'`) — Bulgarian/Serbian/etc. always classified ru. Fix: distinguish (ы/э/ъ/ё → ru; else generic Cyrillic) or return a multi-code result.
  18. extension/features/home-subs-css/index.js — listFeedLayout's 'search' scope is inert: selectors anchor on `ytd-browse[page-subtype="search"]` but search renders under ytd-search. Fix: anchor on ytd-search or drop 'search' from the scope.
  19. commit f422656b/f422556b playlist enhancer, ytkit.js — native-order restore records order from the SORTED DOM for late-loaded items (toggle back to "none" can't restore true order; unseen items yield NaN comparators), and _getWatchedPercent's `(\d+(?:\.\d+)?)\s*%?` accepts px widths as percents (gates the auto-skip click). Fix: record native order at entry discovery before sorting; require the % sign.
  20. extension/features/video-hider/index.js:2219-2240 — batchBuffer keeps accumulating {element, hidden} records while subs auto-loading is blocked (processBatch only drains when !loadingBlocked; push site unguarded) — unbounded DOM-reference growth until Resume/navigation. Fix: skip pushes (or clear) while blocked.
  21. ytkit.js:29962-30003 — enableHandleRevealer fires an uncapped parallel full-channel-page fetch (with credentials) per unique commenter; scrolling a large thread launches dozens simultaneously. Fix: small concurrency limiter (3 in flight, FIFO) and prefer a lighter endpoint.
  Evidence: Each site read and traced by the auditing pass; consumer paths confirmed; none re-log tracked items.
  Acceptance: Each numbered fix carries its own small test or fixture assertion as described; suite + check gates stay green.
  Confidence: Verified unless noted (14, 15 Needs-repro)
  Effort: S each (16, 19 M)

### P3 — Theming / a11y / polish residue

- [ ] P3 — Settings overlay search placeholder renders clipped mid-word despite a wide input
  Category: visual
  Where: Placeholder string 'Search settings, pages, controls…' set at extension/ytkit.js:43735 and extension/features/settings-panel/index.js:405; observed in build/settings-overlay-smoke/*.png (all six states)
  Problem: The rendered overlay shows "Search settings, pages, co" cut at roughly half the input's width in every smoke state (dark/light/RTL/tablet/mobile), with ample space remaining. Likely a width/mask/font-metric issue in the search-field styling rather than the string itself.
  Evidence: npm run smoke:settings-overlay → inspect desktop-dark.png (this audit did; screenshot shows the clip).
  Fix: Reproduce via the smoke, inspect the computed styles on the input/placeholder (look for a text-overflow/width constraint or a webkit-mask on the field), and let the full placeholder render or ellipsize at the actual input edge.
  Acceptance: Smoke screenshots show the full placeholder (or a right-edge ellipsis); no layout regression in the six states.
  Confidence: Needs-repro (observed in offscreen render; not yet root-caused)
  Effort: S

- [ ] P3 — Test-suite hardening batch (latent vacuous-pass hazards + coverage gaps)
  Category: testing
  Where / Problems:
  1. tests/hardening.test.js:9084 and tests/bugfix-validation.test.js:874-883 — five `indexOf(a) < indexOf(b)` ordering pins whose first operand is never asserted present: if A is deleted, indexOf → -1 < anyPositive and the "A before B" pin passes — exactly the regression they exist to catch. (All windows currently contain their targets — latent, not live.) Fix: precede each with `assert.ok(indexOf(a) > -1)` as hardening.test.js:645-648 already does.
  2. tests/long-session.test.js — the Navigation API fake dispatches no event object and fabricates a `committed` property real browsers never provide (see the P2 Navigation item); nothing tests hashChange/downloadRequest/cancel dispatch behavior.
  3. tests/features/next-monolith-peel.test.js — shorts daily limit: no test covers the local-midnight rollover (`raw.date !== today → reset`); every scenario seeds today's ledger. Add: seed yesterday's date with seconds>limit and a far-future snoozeUntil, drive a tick, assert no overlay and the ledger re-keys to today with snoozeUntil 0 (a stale snooze must not survive rollover), plus one _flushShortsToday merge assertion.
  4. tests/comment-intelligence.test.js:129-133 — replace the source-regex pin with a real-dispatcher test (see the P1 comment-filter item).
  Acceptance: Each listed test added/strengthened; deliberately deleting the anchored line makes the ordering pins fail.
  Confidence: Verified
  Effort: S-M

- [ ] P3 — Gate/tooling robustness batch
  Category: maintainability
  Where / Problems:
  1. scripts/companion-port-catalogue.json:4 origin `http://127.0.0.1:9751-9851` is a port-RANGE pseudo-origin, not a valid origin; it works because both consumers route it through alias maps — and extension/core/data-flow.js:215-236 originMatchesManifest only matches it because `new URL()` THROWS and the catch falls back to startsWith, which succeeds by string-prefix coincidence with the primary port. Any future consumer using the generic origin+'/*' fallback emits an invalid pattern; a port change silently breaks the data-flow panel's permission display. Fix: special-case the pseudo-origin via ORIGIN_HOST_PERMISSION_ALIASES and validate it in companion-port-catalogue.js.
  2. scripts/bench-startup.js:155-156, :406-429 — `--check` is parsed but never read; bench and gate modes are identical, so a bench run on a slower machine fails instead of reporting. Fix: make plain bench report-only.
  3. scripts/check-i18n.js:167 — success line hardcodes "0 getMessage() calls all resolve" regardless of count. Fix: interpolate the real count.
  4. scripts/generate-release-manifest.js:151-198 — no strict unknown-argv rejection (what let the documented `--require-companion` no-op silently; sibling gates all reject). Fix: add the same argv guard.
  5. scripts/generate-release-readiness.js:378-401 — readiness verifies files against SHA256SUMS but never cross-checks release-manifest.json's per-asset sha256 against either; a manifest hand-edit or TOCTOU between the two hash passes goes unflagged. Fix: cross-check the two sources.
  6. extension/ytkit-main.js:244-246 and extension/core/audio-track.js:287-288 — MAIN-world files execute `if (typeof module !== 'undefined' && module.exports) module.exports = …` in the PAGE's global scope; a page-defined CommonJS shim would be overwritten and handed bridge internals. Latent (YouTube defines no global module today). Fix: strip the export blocks from MAIN-world files at build or gate on an extension-test marker.
  7. extension/popup.js:1693-1695 vs :4204-4213 — two code paths drive the companion-update buttons' hidden flags with different predicates (raw githubFullProfile vs policy.resolveEffectiveProfile), and render() runs last in refreshOptionalHostGrantState so it can override the policy result. normalizeProfileModel keeps the flags coherent so divergence needs out-of-band state — but it's the exact two-copies drift trap this repo keeps paying for. Fix: delete the raw-flag block; call refreshCompanionUpdateVisibility().
  8. extension/sidepanel.js:262-264 — sendToTab calls globalThis.YTKitBrowser.sendTabMessage unconditionally, bypassing the deliberate bare-chrome fallback at :7-9; preview-mode-only breakage of the per-section empty states. Fix: optional-chain with a null fallback.
  9. extension/sidebar.html:50, :118, :126 — three i18n keys drifted from sidepanel.html (toggleStateOn vs spOverviewEnabledLabel; healthClearBtn vs spSettingsClearBtn; dlProgressReady vs spRefreshStatusReady). EN matches today; translations can fork the twin surfaces. Fix: align keys (or generate one file from the other).
  10. extension/core/storage-manager.js:56-58, :163-180 — the unload-hook WeakSet is per-factory-instance, so the "idempotent across multiple factory invocations" comment is false; a second call site would stack beforeunload/yt-navigate-start listeners closing over dead managers. No current production impact (one instance). Fix: hoist the guard to module scope keyed on window; fix the comment.
  11. scripts/i18n-placeholder-baseline.json — ~700-717 accepted placeholder mismatches per locale (~37% of keys); the gate structurally cannot catch the P1 "…" class. After fixing the P1, ratchet the baseline down and fail on NEW mismatches of consumed tokens.
  Acceptance: Each numbered fix verifiable by the named command/test; check gates green.
  Confidence: Verified (6, 7 latent by construction)
  Effort: S each

- [ ] P3 — Systemic closure: light-theme render lane for injected surfaces
  Category: testing
  Where: scripts/smoke-settings-overlay.js (pattern to copy), scripts/check-contrast.js (currently validates only 6 hand-picked popup constants), the ~1132 white/black-alpha literals in extension/ytkit.js
  Problem: Every theming finding in this audit (P1 default-ON set, chat-style, videoNotes, chips, early.css) shares one root cause: no gate renders injected CSS against a YouTube light-theme fixture, so regressions recur as new surfaces ship dark-first. The existing smoke already proves the harness pattern works (module + fallback, six states).
  Fix: Add a smoke lane that renders representative injected surfaces (watch metadata, action buttons, comment section, masthead launcher, toasts) over light and dark fixture pages and asserts computed text/background contrast ≥4.5:1, wired into npm run check next to audit:contrast. Seed it with the surfaces fixed in the P1/P2 theming items so it pins them.
  Acceptance: Reverting any one of the theming fixes makes the new lane fail; lane runs in check without a live browser dependency beyond what existing smokes use.
  Confidence: Verified (gap); design of the lane is the work
  Effort: M

- [ ] P3 — Unaudited residue from this pass
  Category: docs
  Where: repo-wide
  Problem: Honest scope record. Not line-audited this pass: ~1,800 lines of pure-CSS template literals in ytkit.js (watchPageRestyle interior detail, chat-style premium layers, popup/dropdown theming — surveyed structurally only); the settings-panel module's full 3.4k lines (repeatedly audited before; skimmed); sticky-video's full 5k lines (lifecycle spot-checked); download-ui's full 2.9k lines (spot-checked); Firefox-specific runtime behavior beyond the manifest-patch/static gates; live-browser verification of every finding marked Needs-repro (the blocked "Live-browser behavioral audit" item covers the vehicle). The companion (AstraDownloader repo) is out of scope here by design.
  Fix: Fold the CSS-literal interiors into the light-theme lane work above; keep the rest on the existing blocked live-browser item.
  Acceptance: Next audit starts from this record.
  Confidence: Verified
  Effort: S
