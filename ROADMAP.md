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

- [ ] P2 — Repeat Takeout imports double-count all previously imported watch time
  Category: correctness
  Where: extension/ytkit.js:1389-1441 (mergeTakeoutWatchHistoryIntoStats), save site :4528-4530 (settingsManager.importYouTubeTakeoutWatchHistory)
  Problem: The merge rebuilds `days` as `organicDays + all surviving imported-ledger entries`, where organicDays = `sanitizeWatchTimeStats(currentStats).days` (line 1423). But after the first import the persisted `days` already CONTAINS imported seconds (the merged result is what gets saved), so every later import that adds ≥1 new entry re-adds EVERY previously imported entry's seconds on top of days that already include them. Error compounds per import (ledger cap 5000 × 60s = up to ~83 phantom hours per import). The exact-same-file case is masked only because `result.imported === 0` skips the save — the normal workflow (importing a fresh, overlapping Takeout export) hits it every time.
  Evidence: Verified by executable simulation of the extracted function: organic {2026-08-01:100} + import A(60s) → day 60, total 160; second import {A dup + new B} → day 120 (A counted twice), total 280 instead of 220.
  Fix: Track imported contributions separately — either compute organicDays as storedDays minus the sum of the previous ledger before merging, or persist organic and imported day-maps as separate fields and derive `days` at read time.
  Acceptance: A test importing overlapping ledgers twice asserts totals equal organic + union-of-imports (no double count); watch analytics render unchanged for single imports.
  Confidence: Verified (simulation)
  Effort: M

- [ ] P2 — Preset/Low-Power recipes never apply their feature changes in the tab that toggles them
  Category: correctness
  Where: extension/ytkit.js:42150-42183 (lowPowerProfile._apply/_restore), :42188-42339 (presetPrivacy/presetResearcher/presetPowerUser/presetFocus — same pattern)
  Problem: `_apply()` flips the recipe keys in appState.settings IN PLACE and calls settingsManager.save(), but nothing destroys/inits the affected features in the same tab: the toggle handler only lifecycles the preset feature itself (ytkit.js:46782, module twin features/settings-panel/index.js:3191); handleExternalStorageChanges consumes the local echo via StorageManager.consumeLocalEcho so the save never reaches applyExternalSettingsUpdate; the save-normalization path (ytkit.js:4142-4148) only fires when the persisted result differs from appState.settings (it doesn't — mutated in place first); _pageChangeTracker only reacts to page-type changes. Turning on "Low Power Profile" mid-watch leaves cinemaAmbientGlow, videoVisualFilters, playbackStatsOverlay, researchTranscriptIndex etc. running and never starts enableCPU_Tamer — the toggle's entire purpose. Restore has the same gap. Cross-tab and next-pageload behave correctly (external-change path applies), which is why this survived earlier audits. Panel checkboxes for recipe keys also go stale (no syncFeatureControl for them).
  Evidence: Full trace of all four suppression paths above; recipe keys verified to exist in default-settings.json (no typo'd dead keys).
  Fix: After _apply()/_restore(), run the recipe keys through the same destroy/init reconciliation applyExternalSettingsUpdate performs (extract a helper or call it directly with the new settings and a force-local flag), and refresh the panel controls for those keys.
  Acceptance: A test (or rendered smoke) enabling Low Power on a fixture with an affected feature initialized asserts destroy ran in the same tick chain and CPU tamer init ran; restore reverses it; cross-tab behavior unchanged.
  Confidence: Likely (fully traced, not executed)
  Effort: M

- [ ] P2 — DeArrow Voting posts to a nonexistent API route with the wrong payload shape — every vote fails
  Category: correctness
  Where: extension/ytkit.js:37861-37877 (deArrowVoting._vote)
  Problem: Votes go to `POST https://sponsor.ajay.app/api/branding/vote/${type}` with body {UUID, userID}. SponsorBlockServer exposes no /api/branding/vote/<n> route; branding votes are `POST /api/branding` with {videoID, userID, title|thumbnail, downvote}; the {UUID, userID, type} shape belongs to the segment endpoint /api/voteOnSponsorTime. Every vote 404s, so both vote buttons always show "DeArrow vote failed." The v4.51.0 audit fixed the attribute wiring that makes these buttons appear — nothing verifies the vote round-trip.
  Evidence: The only other DeArrow API use is GET /api/branding?videoID= (features/dearrow/index.js:167, ytkit.js:31172); no test covers the vote endpoint (grep branding/vote tests/ → nothing).
  Fix: POST /api/branding with videoID + the existing title/thumbnail evidence + `downvote: type === 0` per the DeArrow API docs (or remove the vote buttons if submission is out of scope — align with the Roadmap_Blocked SponsorBlock-submission product decision). Add a fetch-fake test pinning URL + payload shape.
  Acceptance: Vote requests hit /api/branding with the documented shape (test-pinned); a live vote returns 200 when verified against the real API.
  Confidence: Likely (endpoint knowledge verified against SponsorBlockServer docs; not network-verified from here)
  Effort: S

- [ ] P2 — Volume Wheel reads volume from an inaccessible MAIN-world API — volume pinned to the 45-55% band
  Category: correctness
  Where: extension/ytkit.js:36685-36702 (volumeWheelMode._onWheel)
  Problem: `current = movie?.getVolume?.() ?? 50` — `movie` is the #movie_player DOM element and getVolume is a MAIN-world expando invisible to the ISOLATED content script (the repo's own docs state this for Polymer .data), so `current` is always the literal 50. Each wheel tick computes next = 50 ± 5 and writes video.volume = 0.45/0.55: the user can never scroll below 45% or above 55%, and the first tick snaps volume to ~50%. There is a video.volume fallback for the WRITE but not the READ.
  Evidence: World isolation semantics + code read; compare rememberVolume (:25394-25402) which correctly treats the player API as optional. Feature default-off.
  Fix: Baseline from the media element: `const current = Math.round(((video && video.volume) ?? 0.5) * 100)` before computing, keeping setVolume as a best-effort mirror (or route the read through the existing MAIN-world bridge).
  Acceptance: Test: with video.volume = 0.8 and no getVolume expando, one wheel-up tick yields 0.85 (not 0.55).
  Confidence: Verified
  Effort: S

- [ ] P2 — Two auto-dismiss features click generic confirm/accept buttons in ANY YouTube dialog
  Category: correctness
  Where: extension/ytkit.js:19873-19899 (autoDismissStillWatching._dismiss/_popupHandler — clicks first match of `.yt-confirm-dialog-renderer #confirm-button, .ytd-popup-container tp-yt-paper-button#button` on every popup-container mutation, debounced 200ms); extension/ytkit.js:27652-27673 (autoClosePopups._dismiss — clicks `tp-yt-paper-dialog #accept-button/#dismiss-button/#cancel-button` on every unthrottled broad mutation tick)
  Problem: `yt-confirm-dialog-renderer #confirm-button` is YouTube's GENERIC confirmation dialog (clear watch history, delete playlist, discard comment…), and the paper-dialog button ids are equally generic. With either feature on, a user-opened destructive confirmation can be auto-accepted ~200ms after render, before the user can react — and dialogs the user opens "close by themselves." Both default-off, but autoDismissStillWatching is force-enabled by the Feed Triage recipe (_RECIPE at ytkit.js:36537), widening exposure. autoClosePopups also does 4 querySelector + offsetParent layout reads per mutation batch forever (perf).
  Evidence: Observer/selector sites read; no text/intent discrimination anywhere in either _dismiss; the yt-popup-opened path triggers on any YT-CONFIRM-DIALOG-RENDERER.
  Fix: Gate clicks on dialog intent: structural (ytmusic-you-there-renderer for you-there; specific renderers — consent bump, ytd-mealbar-promo-renderer, ytd-survey-renderer — for autoClosePopups) plus localized text match ("continue watching") as fallback, mirroring how hidePlannedLivestreams anchors its regexes. Drop the bare paper-dialog button arms; debounce autoClosePopups' mutation path.
  Acceptance: Tests: a fabricated "clear watch history" confirm dialog is NOT clicked by either feature; the you-there renderer IS dismissed; no per-mutation layout reads without a candidate dialog present.
  Confidence: Verified (selector overreach); Likely for specific destructive-dialog field instances
  Effort: M

- [ ] P2 — hideCollaborations (default ON) is inert after any SPA navigation to the subscriptions feed
  Category: correctness
  Where: extension/ytkit.js:16767-16804 (hideCollaborations.init); tracker subset at :54981 (`pageScopedFeatures = liveFeatureList.filter(f => !f._arrayKey && f.pages)`)
  Problem: init() starts with `if (window.location.pathname !== '/feed/subscriptions') return;` and registers its navigate rule only AFTER that check. The feature declares no `pages` property, so _pageChangeTracker never re-initializes it on navigation. Unless the browser hard-loads directly on /feed/subscriptions, the feature (default true, ytkit.js:3272) does nothing all session — the common path (land on Home → click Subscriptions) leaves it permanently inert. initFeatureLifecycle marks it _initialized so nothing retries. Secondary issues in the same block, fix together: (a) _validateFeedCard matches only the legacy shelf layout (ytd-item-section-renderer + ytd-shelf-renderer #title-container a[title]) — likely a no-op on the modern rich-grid subs feed (needs a fixture to confirm); (b) _fetchSubscriptions parses only the first expandedShelfContentsRenderer batch of /feed/channels while _validateFeedCard destructively .remove()s cards from channels not in that batch — a truncated list would delete videos from genuinely subscribed channels.
  Evidence: Early-return + missing pages property + tracker filter all verified by direct read; no module twin exists.
  Fix: Give the feature `pages: [PageTypes.SUBSCRIPTIONS]` (or register the navigate rule unconditionally and defer the subscriptions fetch to first arrival). While there: hide via class toggle instead of .remove() so a truncated subscription fetch can't destroy cards, and add a rich-grid fixture to decide whether _validateFeedCard needs modern selectors.
  Acceptance: Test: init on a non-subs page, simulated navigate to /feed/subscriptions → feature processes cards. Fixture decides the rich-grid question; removal replaced by reversible hiding.
  Confidence: Verified (logic trace)
  Effort: S

- [ ] P2 — Popup schema overview ignores schema defaults — default-on features show Disabled, counts undercount, spurious per-key Reset buttons
  Category: correctness
  Where: extension/popup.js:2864 (buildSchemaOverviewKeyRow — `const on = settings[entry.key] === true;`), :3232-3241 (isToggleEnabled — `undefined → false`), :3197-3208 (isDefaultValue) with the reset-button gate at :3155-3157
  Problem: The stored ytSuiteSettings bag is SPARSE — the mutation controller persists only changed keys (core/settings-controller.js localMutateMany; ytkit.js save() diffs against baseline). The quick toggles and sidepanel were fixed for exactly this in v4.49.6 (`_settingsState[key] ?? entry.defaultValue`), but the schema-overview panel was not: (1) default-on booleans never explicitly written render OFF in their category rows; (2) the "X/total settings on" roll-up undercounts every default-enabled feature; (3) the per-key "↺ reset" affordance renders for every never-written key with a non-null default (`isDefaultValue(undefined, false)` hits the `currentValue == null || defaultValue == null → false` branch), contradicting the code comment at :3194-3196.
  Evidence: All three code paths verified by direct read; sparse-bag precondition corroborated by the repo's own v4.49.6 fix note ("fresh installs showed default-on features as Disabled" for quick toggles — same storage shape, unfixed sibling surface).
  Fix: Resolve `settings[key] ?? entry.defaultValue` in buildSchemaOverviewKeyRow and isToggleEnabled; make isDefaultValue treat undefined current as equal to any defaultValue.
  Acceptance: With empty storage, the schema overview shows default-on features as On, the roll-up counts them, and no reset buttons render; tests added beside the existing popup quick-toggle default-resolution tests.
  Confidence: Verified
  Effort: S

- [ ] P2 — Orphaned-tab settings writes report {ok:true} while persisting nothing
  Category: correctness
  Where: extension/core/storage.js:284-286 (flushPendingStorageWrites), fed by storageWriteMany :343-353 and storage-manager.js setSync :151
  Problem: When the extension context is invalidated (extension updated/reloaded/disabled while a YouTube tab stays open), hasExtensionContext() goes false and flushPendingStorageWrites() returns `storageFlushInFlight || Promise.resolve({ ok: true })` even with pendingStorageWrites non-empty and unpersistable. Every setSync/immediate write then resolves {ok:true}. The whole point of the {ok,error} contract (9328b166; v4.49.6 "settings-import now awaits the aggregated setSync results") is that persistence failure cannot report success — but in an orphaned tab the settings panel keeps working against the in-memory cache, so imports, undo/rollback confirmations, and "Settings saved" toasts all claim success and everything is lost on next load. The messaging paths already reject with "Extension context invalidated. Reload the page." — the storage write path is the one surface that lies.
  Evidence: Branch + both feeder paths verified by direct read; no test covers this branch with pending writes present.
  Fix: When `!core.hasExtensionContext() && hasPendingStorageWrites()`, resolve `{ ok: false, error: new Error('Extension context invalidated') }` (keep quiet {ok:true} only for the truly-empty case) so the import transaction and setSync consumers surface the reload-the-page failure they already know how to render.
  Acceptance: Test: invalidate the fake context, queue a write, flush → {ok:false}; settings-import surfaces the failure toast instead of "imported".
  Confidence: Verified
  Effort: S

- [ ] P2 — SponsorBlock "Highlight" (poi_highlight) is silently inert — zero-length POI segments are dropped by normalization
  Category: correctness
  Where: extension/features/sponsorblock/index.js:131-146 (_normalizeSegments — requires `s.segment[1] > s.segment[0]`); intent comment at :347-351; byte-identical twin at extension/ytkit.js:30275-30290
  Problem: The SponsorBlock API returns poi_highlight entries as zero-length point markers (`segment: [t, t]`, actionType "poi"), so every POI entry is filtered out before reaching the cache or _renderBarSegments. The _checkSkip comment explicitly claims POI is "Render[ed] on the progress bar … but never auto-advance" — the never-skip half is test-pinned, the render half never happens. Enabling the "Jump to the highlight" sub-feature (sbCat_poi_highlight, ytkit.js:30721) only adds the category to the API query; nothing renders anywhere (bar or segment list).
  Evidence: Both segment sources (_fetchSegments and _markCachedSegments) route through _normalizeSegments; tests pin only the never-skip half; no test feeds a [t,t] segment; git -S poi_highlight shows no prior fix.
  Fix: Accept `s.segment[1] >= s.segment[0]` when actionType === 'poi' (or category poi_highlight) and give POI a synthetic minimum render width in _renderBarSegments (plus a distinct marker style). Fix the module, re-splice the pinned ytkit.js twin.
  Acceptance: Test feeding a [t,t] poi_highlight segment asserts it survives normalization and renders a marker; skip behavior still never fires for POI.
  Confidence: Likely (filter verified; depends on the documented SB API [t,t] POI shape)
  Effort: S

- [ ] P2 — Navigation API adoption: `event.committed` doesn't exist on NavigateEvent — dead branch, pre-render dispatch timing, and unfiltered navigation types
  Category: correctness
  Where: extension/core/navigation.js:237-249, 277-284 (commit 971f886f); test harness: tests/long-session.test.js (fabricates the event shape)
  Problem: Per spec, `{committed, finished}` is the return value of navigation.navigate()/traverseTo(), NOT a NavigateEvent property — `event?.committed` is always undefined in a real browser, so the "prefer the platform's commit promise" branch is dead code that only the test harness can exercise (a check-that-always-passes). Dispatch therefore always uses the synchronous fallback: rules run ~50ms after `navigate` — at/near URL commit, BEFORE YouTube renders the new page — whereas the replaced yt-navigate-finish fired after data load; yt-page-data-updated re-fires rules later but lastNavHref was already consumed, so per-URL-deduped rules latch onto pre-render DOM. Additionally `navigate` fires for cases yt-navigate-finish never signaled — history.replaceState, canceled navigations, downloads, cross-document link clicks — each now triggering pendingMutationRouteReset + a full navigate-rule pass.
  Evidence: Spec semantics + code read; the harness dispatches no event object at all, so nothing tests hashChange/downloadRequest/cancel behavior.
  Fix: Filter on `event.navigationType` / `event.destination?.sameDocument` / `event.downloadRequest` before dispatching; for timing, use `navigation.transition?.finished` or keep yt-navigate-finish as the dispatch signal with the Navigation API as a supplementary/fallback trigger; delete or rewrite the committed branch. Make the test harness dispatch a realistic NavigateEvent shape ({navigationType, hashChange, downloadRequest, destination}) and assert download/hash navigations don't reset route health.
  Acceptance: tests/long-session.test.js passes with the realistic event fake; a new test asserts a downloadRequest navigate does not fire navigate rules; live behavior verified on a real SPA navigation (rules still fire once per route change).
  Confidence: Verified (dead branch, spec); Likely (timing consequences)
  Effort: M

- [ ] P2 — Userscript twins missing four shipped extension fixes (localized action hooks, per-channel speed reset, auto-start budget, focused-mode scope)
  Category: correctness
  Where: YTKit.user.js:32799-32841 (pre-6ebf7403 `_buttonAriaLabels`/`aria-label="…"` English-only action hooks; also :31962 `button[aria-label="Create"]`, :34071 "Join this channel", :34166 "Share"); :36637-36648 (pre-2df33124 _saveCurrentSpeed — `if (!video || video.playbackRate === 1) return;` so resetting to 1x never clears the stored speed, and no _activeChannelId capture); :30340 (`tryAutoStart(retries = 4)`) with :30439, :30468, :25153, :44852 still passing 5 (9c10b46c raised the extension to 8 for the ~12s cold start; only :30915 was ported); :39516 (focusedMode feature object missing the `pages: [PageTypes.WATCH]` gate from d2561495 — masthead-hiding CSS applies on every page type)
  Problem: The userscript's hand-maintained twins retain four bugs the extension already fixed this wave. On non-English locales the userscript's action-hiding features silently no-op; per-channel speed can never be reset; healthy cold starts of the 40MB companion exe report "Still not responding"; focused mode hides the masthead everywhere. The regression pin for the auto-start budget deliberately excludes the userscript (tests/download-health-boundary.test.js:252 covers module + monolith only) even though tests/helpers/source.js already exposes sources.userscript.
  Evidence: All four sites diffed against the extension counterparts by line; drift gate (check-userscript-drift.js) is feature-ID-granular so it reports parity regardless.
  Fix: Hand-port each fix verbatim (structural hook selectors; `delete speeds[channelId]` + _activeChannelId; budget 8 everywhere; pages gate). Then widen the existing pins: include sources.userscript in the tryAutoStart doesNotMatch, and add parity pins for the other three sites in tests/userscript-parity.test.js. Longer-term gate improvement is covered by the P1 bundle-drift item.
  Acceptance: grep 'aria-label="Save to playlist"' YTKit.user.js → 0; tryAutoStart(4|5) absent from all three sources (test-pinned); focusedMode carries the pages gate; per-channel speed reset test passes against the userscript source.
  Confidence: Verified (line diffs)
  Effort: M

### P2 — UX / theming / product

- [ ] P2 — Popover top-layer migration regressions: overlays stack by show-order, dl overlays left behind, dismiss animation defeated
  Category: ux
  Where: commit d4bebef5. Sites: extension/ytkit.js:43618-43631 + :5403-5406 (panel popover); #ytkit-mediadl-install-prompt z-index 2147483647 at ytkit.js:51448 created without popover in features/download-ui/index.js:519; .ytkit-dl-progress z 2147483647 at ytkit.js:51804; extension/core/toast-dom.js (dismissToast calls hidePopover() BEFORE the class-removal fade; CloseWatcher per toast)
  Problem: (a) The two download overlays carry z 2147483647 specifically to beat the panel's 2147483646 (same rationale as the v4.50.1 Z.TOAST fix) — but the panel is now a `popover=manual` in the top layer, which paints above ANY z-index, so an active download progress card or install/repair prompt raised while the panel is open renders underneath it. (b) Toast-above-panel is now temporal: a toast shown before the panel opens sits below it for its remaining lifetime (undo toasts run seconds). (c) dismissToast() calls toast.hidePopover() before the fade — `[popover]:not(:popover-open)` is display:none, so popover-path toasts vanish instantly and the fade branch (pinned byte-for-byte for userscript parity) never paints. (d) Each toast creates a CloseWatcher — Esc now dismisses toasts, and watchers created without user activation are browser-grouped so one Esc can close several surfaces at once.
  Evidence: Top-layer stacking semantics are spec behavior; all sites read directly; toasts and dl-popup were migrated to popovers while these two overlays were missed.
  Fix: Give showInstallPrompt and the dl-progress card the same `popover="manual"` + showPopover() treatment with non-popover fallback; when the panel popover opens, re-show (hide+show) any visible toasts so they re-enter the top layer above it (or render panel-era toasts inside the panel's subtree); move hidePopover() after the exit transition completes; create toast CloseWatchers only for toasts with actions (or accept-and-document Esc dismissal).
  Acceptance: With the settings panel open: a fired download progress card and an undo toast are both visible above the panel; toast dismiss visibly fades in popover mode; hardening/userscript-parity pins updated in the same change.
  Confidence: Verified (semantics + sites); visual outcomes Needs-repro in a live browser
  Effort: M

- [ ] P2 — chatStyleComments paints white-alpha text over the page background — unreadable on YouTube light theme (both copies)
  Category: visual
  Where: extension/features/chat-style-comments/index.js:18 (buildCommentRestyleCss — #content-text rgba(255,255,255,0.78), timestamps 0.25, reply borders 0.035, container background = accent at 0.03 alpha) and :1316-1319 (styleReplyDialogs inline rgba(255,255,255,0.85) on rgba(255,255,255,0.04)); byte-identical fallback at extension/ytkit.js:7042
  Problem: Opt-in feature, but 100% broken for light-theme users: the base layer restyles the entire comment section (and YouTube's own commentbox cancel/emoji buttons) with white-alpha text over the page background. The premium layer's dark cards mask it only when active. Sibling modules (return-dislike, video-notes, subscription-view) already use --yt-spec-* vars with html:not([dark]) overrides.
  Evidence: No html:not([dark]) rules or spec vars anywhere in buildCommentRestyleCss/styleReplyDialogs (grep-verified).
  Fix: Route text/border colors through var(--yt-spec-text-primary/-secondary, <current dark fallback>) with html:not([dark]) overrides where vars don't suffice. Fix the module first, re-splice the ytkit.js fallback (parity-pinned). While there, also strip the ~30 inline styles per comment on disable — normalizeCommentLayoutSurface/normalizeCommentInteractionSurface (ytkit.js:8156-8273) write setProperty(…,'important') per comment that neither destroy path removes (module cleanupRuntimeDom :1348-1357 removes only dataset flags/badges), leaving 24px avatars and forced layout on native comments after live toggle-off; the reply-dialog styles ARE stripped (:8296-8311), proving the pattern was known and these were missed.
  Acceptance: Light-theme fixture: comment text legible with the feature on; toggling the feature off restores native comment layout without reload (no residual inline properties); dark theme unchanged; parity pin green.
  Confidence: Verified (CSS + cleanup gap); visual outcome Likely (needs a light-theme drive)
  Effort: M

- [ ] P2 — Fresh-install defaults hide the caption overlay, core player controls, and auto-accept content warnings
  Category: ux
  Where: extension/default-settings.json:95-105 (hiddenPlayerControls default `["next","autoplay","subtitles","captions","miniplayer","pip","theater","fullscreen"]` — `captions` maps to '.caption-window' at ytkit.js:16676-16693, i.e. the caption TEXT overlay), :85-94 (hiddenActionButtons hides Like/Share/Save), :251 (autoDismissContentWarning: true — auto-clicks "I understand and wish to proceed"), plus early.css:167-169 (all avatars hidden site-wide) and hiddenWatchElements hiding the transcript section
  Problem: On first install, closed captions never render even with CC on (direct harm to deaf/hard-of-hearing users), and fullscreen/theater/PiP/miniplayer buttons are gone — reading as "the extension broke my player." autoDismissContentWarning auto-accepts an age/content interstitial the user never opted into. These page-level defaults apply before the popup welcome card (with its profile picks) is ever opened.
  Evidence: Defaults and selector mapping verified by direct read; injectStyle wraps the list in display:none !important (core/styles.js:19).
  Fix: PRODUCT DECISION — these are documented owner-canonical defaults, so confirm scope with the owner before changing. Minimum defensible change: remove `captions` and `fullscreen` from the default hidden set and default autoDismissContentWarning to false (keep everything available as opt-in). Alternative: ship neutral defaults in the store-safe profile only. Touching defaults requires the full 8-touchpoint recipe (schema/default-settings/fixture expectedDefaulted/storage-size pins etc. per CLAUDE.md).
  Acceptance: Fresh-profile install: CC button shows captions, fullscreen button present, content warnings require a human click; existing users' stored settings unaffected (defaults only apply to unset keys).
  Confidence: Verified (behavior); the "right" default is an owner call
  Effort: S (plus pins)

- [ ] P2 — watchHistoryAnalytics overlay: no dialog semantics, unlabeled close, hardcoded English, off-brand palette, overflow below ~700px
  Category: a11y
  Where: extension/ytkit.js:33592-33686
  Problem: (a) The modal has no role="dialog"/aria-modal, no focus trap, no Escape handling — the settings panel and toasts got CloseWatcher/popover treatment (d4bebef5); this overlay was skipped and is absent from audit-overlays-a11y.js's covered list. (b) `close.textContent='×'` has no aria-label and no type="button" (:33599). (c) All strings hardcoded English in an 11-locale product ('Watch Time — Last 30 Days', 'Total (30d)', 'Daily avg', 'Active days', 'All time', '📊 Watch Stats'). (d) Catppuccin palette (#1e1e2e/#cdd6f4/#89b4fa at :33641-33660) instead of the graphite/coral Astra system used by every other injected surface. (e) min-width:680px beats max-width:90vw → overflows below ~700px with no scroll. The injected '📊 Watch Stats' chip is fixed-dark (legible but alien on light theme).
  Evidence: All sites read directly; overlay absent from the a11y audit script's list.
  Fix: Give it the standard overlay treatment: popover/CloseWatcher + role=dialog + labeled close (type=button, aria-label via locale key), localize the six strings (locale-key flow: en + generate-locales + ar/zh_CN backfill), restyle with the shared surface tokens, swap min-width for width:min(680px, 94vw), and add it to audit-overlays-a11y.js's covered list.
  Acceptance: audit:overlays covers it and passes; Escape closes it; strings resolve from the catalog in all 11 locales; renders inside a 390px viewport without overflow.
  Confidence: Verified
  Effort: M

- [ ] P2 — Flagship injected controls are hardcoded English despite full i18n elsewhere
  Category: ux
  Where: extension/ytkit.js:18520-18536 (Download button 'Show local download options'/'Download' — no catalog keys), :18277-18287 ('Hide all visible videos on this page'/'Hide All'), :21406 ('Sleep timer' + hint), :2112-2113 (`'Dismiss ' + label` concatenation — can't localize grammatically), preset toasts at :42158/:42171 ('Low Power on…') and siblings; subscription dialog aria-labels that audit-overlays-a11y.js:457 pins AS English source strings
  Problem: The most-clicked injected surfaces (download, hide-all) are English-only for 10 of 11 locales. All are sheltered by the 1297-entry ytkit.js allowance in scripts/i18n-ui-copy-baseline.json — the copy gate launders them.
  Evidence: Grep-verified no t()/getMessage on the listed literals; baseline entry count read from the file.
  Fix: Add locale keys for the listed strings (standard flow: en catalog + generate-locales + ar/zh_CN surgical backfill + i18n-coverage refresh + copy-gate baseline shrink), replace 'Dismiss ' concatenation with a {label} template key, and update the audit-overlays pin to accept localized aria-labels. Ratchet the ytkit.js baseline allowance down by the number of strings converted.
  Acceptance: The listed controls render localized strings under a non-EN locale fixture; i18n-ui-copy-baseline.json entry count strictly decreases; all i18n gates green.
  Confidence: Verified
  Effort: M

### P2 — Post-split documentation / process

- [ ] P2 — docs/signing-keys.md release checklist contains dead commands and self-contradictory companion steps
  Category: docs
  Where: docs/signing-keys.md:247-248 (step 2: `py -3.12 -m pytest astra_downloader` — directory deleted by a6bb685f, command errors), :257-265 (step 6: `npm run release:manifest -- --require-companion` — flag doesn't exist and is SILENTLY swallowed because generate-release-manifest.js has no strict argv validation; staging the exe in build/ is exactly what the companion-not-republished readiness gate now FAILS on), :271-272 and :279-283 (steps 9/12 still verify AstraDownloader.exe / companionUpdateRequired on this repo's releases)
  Problem: This is the canonical release procedure; a maintainer following it hits a hard error at step 2 and executes a believed-gate no-op at step 6. check-versions.js's doc-truth gate scans this file but only for retired-workflow refs and "latest release vX" claims, so none of this trips it.
  Evidence: Commands run/greped against the current tree; both readiness gates verified live at generate-release-readiness.js:299/:367.
  Fix: Rewrite steps 2/6/9/12 for the two-repo world (the correct policy text at :287-291 already exists); add strict unknown-argv rejection to generate-release-manifest.js like the sibling gate scripts have.
  Acceptance: Every command in the checklist executes successfully on a clean checkout; `npm run release:manifest -- --require-companion` exits non-zero with "unknown argument".
  Confidence: Verified
  Effort: S

- [ ] P2 — docs/native-messaging-token-bootstrap.md claims companion source lives here and that no release ever shipped the exe pair
  Category: docs
  Where: docs/native-messaging-token-bootstrap.md:27 ("In `astra_downloader/astra_downloader.py`:" — file moved repos), :82-85 ("The companion setup path still requires both AstraDownloader.exe and .sha256 on the GitHub release. No published release attaches the companion asset pair yet")
  Problem: False twice over: v4.50.7 DID ship the pair from this repo, and post-split the pair ships from SysAdminDoc/AstraDownloader (v2.0.0+) — while this repo's gates now REJECT attaching it here. As written the doc instructs a future release step the gates will fail.
  Evidence: gh release view v4.50.7 shows the assets; readiness gates verified; AstraDownloader repo carries its own releases.
  Fix: Repoint the implemented-state section and the release-packaging note at the AstraDownloader repo; note the gates that forbid republishing here.
  Acceptance: The doc contains no claim that companion source or release assets live in this repo; check-versions doc gate still green.
  Confidence: Verified
  Effort: S

- [ ] P2 — CODEOWNERS pins three paths deleted by the companion split — and a hardening test enforces the staleness
  Category: maintainability
  Where: .github/CODEOWNERS:11 (/scripts/companion-license-inventory.js), :15 (/scripts/stage-companion-release.js), :35 (/astra_downloader/); pinned by tests/hardening.test.js:2280-2318 (protected-path list, incl. :2311)
  Problem: All three paths were deleted in a6bb685f; the hardening test REQUIRES each entry to be present, so removing the dead lines fails the suite — the gate actively preserves stale state instead of catching it. Related comment staleness: hardening.test.js:1674 and :2390 still cite astra_downloader/astra_downloader.py:830-838 / test_astra_downloader.py as the cookie wire-format parity counterpart, which now lives in the AstraDownloader repo (that cross-repo contract is no longer verifiable from this suite — note it in the comment).
  Evidence: Paths verified absent; CODEOWNERS lines and test list read directly.
  Fix: Delete the three CODEOWNERS lines and the matching protected-path entries in the same commit; repoint the two test comments at the AstraDownloader repo.
  Acceptance: CODEOWNERS references only existing paths; `npm test` green.
  Confidence: Verified
  Effort: S

- [ ] P2 — Blocked-item tracker references files removed by the companion split
  Category: docs
  Where: Roadmap_Blocked.md:17-18, 25-26, 42-43, 69, 78 (items whose Touches/Where name astra_downloader/download.py, astra_downloader.py, health.py etc.)
  Problem: ROADMAP/Roadmap_Blocked are the single task tracker; several blocked items point implementation at files that no longer exist in this repo. An agent draining them will chase missing files. The affected items (aria2c option, native-messaging LNA fallback, bgutil auto-provision, playlist bounding, /health token echo, etc.) are now AstraDownloader-repo work.
  Evidence: Paths verified absent from this tree; items read in Roadmap_Blocked.md at HEAD.
  Fix: Migrate the companion-scoped items to the AstraDownloader repo's roadmap (preserving their Blocker lines) and leave a one-line pointer under each here, or annotate each with "companion repo: SysAdminDoc/AstraDownloader" and the new file paths.
  Acceptance: No Roadmap_Blocked item names a file absent from this repo without naming the repo that now owns it.
  Confidence: Verified
  Effort: S

### P3 — Correctness / reliability edge cases

- [ ] P3 — Reaction Spammer ytkit.js twin doesn't enforce the configurable interval floor (module does)
  Category: correctness
  Where: extension/ytkit.js:16114-16118 (input min + change clamp use _INTERVAL_MIN_MS_FLOOR=500), :16248 (_tick clamp), enforcement only in _loadState :15774-15779; module copy enforces reactionSpammerMinIntervalMs at every clamp point (extension/features/live-chat/index.js:272, :431)
  Problem: With reactionSpammerMinIntervalMs raised (v4.47.0 EI-NEW3), the ytkit-driven panel lets the user type below the configured floor and spam at that rate all session (clamped back only on next page load). Both copies write the same ytkitReactionSpammerState key with different invariants.
  Fix: In the ytkit.js twin use the _INTERVAL_MIN_MS getter (not the hard floor) at the input min, the change-handler clamp, and the _tick clamp.
  Acceptance: With min interval configured to 1500, typing 600 in the fallback panel clamps to 1500 immediately; parity test pins both copies.
  Confidence: Verified (exact line comparison)
  Effort: S

- [ ] P3 — subscriptionGroups ytkit.js fallback lost the _sessionLastVisit NEW-badge fix (09b2d2d6)
  Category: correctness
  Where: Fallback: extension/ytkit.js:38471 (_applyNewSinceMarkers), :38560, :38570, :38616, nav rule :39895-39928 — `grep _sessionLastVisit extension/ytkit.js` → 0 hits; module: extension/features/subscription-groups/index.js:619, 708, 718, 787-789, 2220, 2242 (frozen session map so badges survive the whole visit)
  Problem: In the fallback copy, 8s after arriving on /feed/subscriptions, _stampLastVisit overwrites lastVisit and the next feed mutation re-runs markers/digest against the fresh map — every NEW badge disappears and digest counts collapse to 0 mid-visit. Module (the shipping copy when module loading works) and the userscript both have the fix; only the inline fallback drifted, and no hardening test pins this pair.
  Fix: Re-splice the fallback from the module and add a parity pin like the DeArrow twins have.
  Acceptance: grep _sessionLastVisit extension/ytkit.js ≥ 1; parity pin added; fallback-only smoke shows badges persisting past the 8s stamp.
  Confidence: Verified (drift); behavior Likely
  Effort: M

- [ ] P3 — subscriptionGroups content-type filter never runs for lazily-loaded cards (both copies)
  Category: correctness
  Where: module extension/features/subscription-groups/index.js:2228-2234 (scoped mutation rule re-applies group filter/markers but not _applyContentTypeFilter — that runs only in the nav-time pass at :2212); fallback ytkit.js:39921-39927 (same)
  Problem: With subscriptionFilterLive/subscriptionFilterStreamed on, infinite-scroll cards are never live/streamed-filtered until the next navigation, while the group filter on the same cards works — inconsistent by construction.
  Fix: Add `this._applyContentTypeFilter()` to the mutation rule in the module, re-splice the fallback.
  Acceptance: Test: appending a card batch with the live filter active hides live cards without a navigation.
  Confidence: Verified (code path)
  Effort: S

- [ ] P3 — Video Hider: interstitial "Unblock" leaves the channel's already-hidden rail cards hidden
  Category: correctness
  Where: extension/features/video-hider/index.js:815-820 (_handleDirectWatchDecision 'unblock' branch)
  Problem: The branch removes the channel and resumes playback but never reprocesses processed cards — related-rail cards from that channel keep .ytkit-video-hidden (with data-ytkit-hide-processed) until next navigation. The toast _undoHide path (:1451-1453) DOES call _processAllVideos(); this path is the outlier.
  Fix: Call `this._processAllVideos()` in the 'unblock' branch.
  Acceptance: Test: unblock via the interstitial → previously hidden cards for that channel are re-shown in the same pageview.
  Confidence: Verified
  Effort: S

- [ ] P3 — parseCompactCount('') returns 0, violating its own missingValue contract and video-hider's "no data ≠ 0 views" guards
  Category: correctness
  Where: extension/core/text-metrics.js:150 (`if (!raw) return 0;`); consumers features/video-hider/index.js:1124-1133 (_extractViewCount), :1217 (`views !== null && views < threshold` guard), :1604-1609 (_extractSubsCount)
  Problem: The docstring promises missingValue (default null) for unparseable text so callers can distinguish "no data" from "0 views", but empty/whitespace input short-circuits to 0. A card processed before Polymer hydration yields views=0 → hidden as low-view; subs-count predicates get 0 for missing metadata. Transient (rescans self-heal), but it defeats two downstream null-guards written to depend on the opposite. NOTE: the behavior is deliberately pinned by tests/core-text-metrics.test.js:62 — the pin contradicts the docstring and both consumers; changing it is a decision, not just a fix.
  Fix: Return missingValue for empty input and update the test pin (or have the two extractors skip empty candidate text). Sweep other parseCompactCount callers for empty-string reliance first.
  Acceptance: parseCompactCount('', null) === null (pin updated); a pre-hydration empty-metadata card is not hidden by the low-view rule (test).
  Confidence: Verified (path); transient impact
  Effort: S

- [ ] P3 — Quick Links: deleting one link permanently discards all stored links beyond the 10-item cap
  Category: correctness
  Where: extension/ytkit.js:19111-19120 (del.onclick rebuilds from _parseItems(), which truncates to _QL_MAX_ITEMS=10); preservation contract comment at :18831-18838
  Problem: With 12 stored entries, deleting one rewrites the setting with 9 — entries 11-12 destroyed, exactly what the v4.47.0 comment promises won't happen (it also normalizes full URLs to path form, lesser lossy side effect). quickLinkMenu is default-on; exposure limited to users with >10 stored links.
  Fix: Splice against the un-capped parsed list (parse raw lines without the cap for mutations).
  Acceptance: Test: 12 stored entries, delete #3 → 11 remain including the two over-cap entries.
  Confidence: Verified
  Effort: S

- [ ] P3 — Five features match English UI text only — inert or misbehaving on the 10 non-EN locales
  Category: correctness
  Where: extension/ytkit.js — sortCommentsNewest._sort :23018-23050 (matches 'newest'; on non-EN it opens the sort menu, finds nothing, never closes the dropdown, and the mutation rule re-opens it every ~2s — worst of the group); autoLikeSubscribed._isSubscribed :23545-23552 ('subscribed'/'unsubscribe' text); watchLaterQuickAdd._findWatchLaterMenuItem :25906-25917 ('watch later' → error toast every use); notInterestedButton :21906-21931 ('not interested' text, plus it queries menu items on the NEXT animation frame after menuBtn.click() — usually before the menu renders, so native feedback rarely lands even in English while the card still visually hides, silently diverging from YouTube's recommendation state); preciseViewCounts._process :20507 (text.includes('view') gate — the view-count half inert on non-EN)
  Problem: Same class 6ebf7403 fixed for the action hooks; these five sites were missed. bulkCardActions (:36263-36304) already demonstrates the correct pattern in the same file: structural iconType match (NOT_INTERESTED/REMOVE, playlistEditEndpoint) first, text fallback, 250ms retries.
  Fix: Port the bulkCardActions structural-first + delayed-retry pattern to all five; add document.body.click() menu-close fallbacks; for sortCommentsNewest prefer menu-item position (newest is the second item) over text.
  Acceptance: Fixture tests with non-EN aria/labels: each feature acts (or no-ops cleanly without dangling menus); notInterestedButton lands the native feedback in the EN fixture too (retry present).
  Confidence: Verified (code paths; behavior by inspection)
  Effort: M

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

- [ ] P3 — Remaining light-theme gaps on lesser surfaces
  Category: visual
  Where: extension/ytkit.js:37711-37715 (.ytkit-da-channel-chip — #e9d5ff on 12-14% tint, no light lane), :40407 (.ytkit-local-ai-btn — also reused by the Study/Work export buttons at :41348), :40535 (.ytkit-ai-qa-btn), :22257-22262 (videoNotes container — rgba(255,255,255,0.04) bg, #e5e7eb/#fff text); extension/early.css:28-31 (keyMoments border-left rgba(255,255,255,0.12) — invisible on light) and :23-31 (creatorCommentHighlight/keyMoments use PHYSICAL border-left/padding-left — wrong side in RTL, the settings layer already converted to logical props)
  Problem: Same class as the P1 theming item but opt-in/lesser surfaces; sibling controls in the same feature families already carry html:not([dark]) overrides (.ytkit-da-vote-btn :37839, .ytkit-transcript-search-btn :41710).
  Fix: Add html:not([dark]) lanes matching the sibling patterns; convert the two early.css blocks to border-inline-start/padding-inline-start.
  Acceptance: Light-theme fixture legibility for each control; RTL fixture shows accents on the correct side.
  Confidence: Verified (CSS)
  Effort: S

- [ ] P3 — Reduced Motion and Forced Colors sheets target a toast class that doesn't exist
  Category: a11y
  Where: extension/ytkit.js:42982 (reducedMotion sheet `.ytkit-toast`), :42028 + :42051 (forcedColorsSupport sheet)
  Problem: The toast root class is ytkit-global-toast (ytkit.js:2681); nothing ever gets .ytkit-toast (repo-wide grep). With Reduced Motion (strong) on, the toast root's slide/fade still plays (the `[class*="ytkit-"] *` rule covers descendants only); in forced-colors mode the toast misses its Canvas/CanvasText carve-out.
  Fix: Replace .ytkit-toast with .ytkit-global-toast in both sheets (incl. the `a` variant).
  Acceptance: Grep shows no .ytkit-toast selectors; reduced-motion fixture asserts no animation on the toast root.
  Confidence: Verified
  Effort: S

- [ ] P3 — Settings overlay search placeholder renders clipped mid-word despite a wide input
  Category: visual
  Where: Placeholder string 'Search settings, pages, controls…' set at extension/ytkit.js:43735 and extension/features/settings-panel/index.js:405; observed in build/settings-overlay-smoke/*.png (all six states)
  Problem: The rendered overlay shows "Search settings, pages, co" cut at roughly half the input's width in every smoke state (dark/light/RTL/tablet/mobile), with ample space remaining. Likely a width/mask/font-metric issue in the search-field styling rather than the string itself.
  Evidence: npm run smoke:settings-overlay → inspect desktop-dark.png (this audit did; screenshot shows the clip).
  Fix: Reproduce via the smoke, inspect the computed styles on the input/placeholder (look for a text-overflow/width constraint or a webkit-mask on the field), and let the full placeholder render or ellipsize at the actual input edge.
  Acceptance: Smoke screenshots show the full placeholder (or a right-edge ellipsis); no layout regression in the six states.
  Confidence: Needs-repro (observed in offscreen render; not yet root-caused)
  Effort: S

- [ ] P3 — EN catalog mixes straight and curly apostrophes
  Category: ux
  Where: extension/_locales/en/messages.json — 17 messages use ', 11 use ’ (e.g. "Couldn't" vs curly elsewhere)
  Fix: Normalize to one form (curly, matching the majority of recent strings); regenerate locales; update copy-gate baseline.
  Acceptance: One apostrophe form across the EN catalog; i18n gates green.
  Confidence: Verified
  Effort: S

### P3 — Maintainability / testing / hygiene

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

- [ ] P3 — Post-split root/hygiene residue batch
  Category: maintainability
  Where / Problems:
  1. AstraDownloader.exe.sha256 (tracked) — pins a hash of a companion build that no longer ships from this repo; nothing in scripts/tests reads the root sidecar. AstraDownloader.ico (tracked) — no remaining source references. AstraDownloader.exe (untracked, 40.4MB, stale v1.9.x) — dead weight. Fix: git rm the sidecar + ico, delete the local exe.
  2. .gitignore:18-20 — comment still says the exe "is a release artifact built by astra_downloader/build.py … attach it to the GitHub Release" (deleted path; now forbidden by the release gates); RESEARCH.md listed under "never track" yet tracked and published (inert line, false comment); bare `YTKit-v1.2.0.user.js` pattern also matches the tracked archive/ copy (unanchored); astra_downloader/ build-artifact block ignores a directory that no longer exists. Fix: correct the comment, drop stale lines, anchor with leading /.
  3. scripts/__pycache__/ — orphaned bytecode of scripts deleted by the split (render-companion-gui, yt-dlp-smoke). Fix: delete the directory.
  4. outputs/astra-downloader-{dashboard,downloads,history,settings}-premium-mockup.png (tracked) — companion GUI design targets; the GUI lives in SysAdminDoc/AstraDownloader now. Fix: move to that repo or delete.
  Acceptance: `git ls-files | grep -i astradownloader` returns nothing; .gitignore comments truthful; no __pycache__ under scripts/.
  Confidence: Verified
  Effort: S

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
