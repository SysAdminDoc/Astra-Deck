# Roadmap - Astra Deck

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

- [ ] P3 — Start burning down the 1,604 grandfathered English literals
  Why: the copy gate passes because the debt is fingerprinted as accepted, not because it is fixed, so 11 locales ship large English surfaces.
  Evidence: `scripts/i18n-ui-copy-baseline.json` grandfathers 1,604 literals across 20 files — 1,273 in `extension/ytkit.js`, 134 in `settings-panel`, 40 in `subscription-groups`, 30 in `download-ui`, 28 in `video-hider`, 26 in `popup.js`. The Video Notes panel (`extension/ytkit.js:22902-22942`) is entirely unwrapped while siblings in the same file use `t()`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `extension/_locales/**`, `scripts/i18n-ui-copy-baseline.json`, `scripts/generate-locales.js`
  Acceptance: the baseline count only ever decreases; a per-pass target is recorded and the highest-traffic surfaces (Video Notes, settings-panel, download-ui) go first. Translations go into the `generate-locales.js` tables before regenerating so the placeholder ratchet does not move.
  Complexity: L
  Note (2026-08-13 verification): evidence is stale in the item's favour — the baseline now records **928 literals across 2 files** (926 `extension/ytkit.js`, 2 `core/persisted-domains.js`; `strictCount` 343), down from 1,604/20. The item stands; only the numbers moved.

- [ ] P3 — Start burning down the 277 light-theme-blind surfaces
  Why: the gate accepts 277 legacy surfaces against 89 that carry a light lane, so YouTube light-theme users still meet near-white text on near-white backgrounds on surfaces nothing flags.
  Evidence: `npm run audit:light-theme` reports 89 covered / 277 accepted; `scripts/light-theme-baseline.json`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `scripts/light-theme-baseline.json`
  Acceptance: the accepted count only ever decreases; default-ON surfaces are cleared first; a light-fixture render lane confirms the fixes rather than a source-text rule.
  Complexity: L
  Note (2026-08-11 research): current gate output is **253 accepted / 121 covered**, not 277/89. Also note the gate's `SOURCES` list (`scripts/check-light-theme-lane.js:34-39`) excludes all of `extension/core/*.js` even though those modules inject CSS, and `extension/live-chat.css` has zero `html:not([dark])` rules while restyling ~50 chat selectors — so the true uncovered set is larger than 253.

## Audit Findings — 2026-08-10

Baseline at audit time (working tree = HEAD a61ce0d7 + uncommitted v4.58.3–v4.58.6 work): `npm test` 1514/1514 pass. `npm run check` FAILS at `i18n:copy:gate` (new, from the uncommitted work — item below). Pre-existing baseline failures, already tracked, not re-logged: `audit:deps` (web-ext → addons-linter → image-size advisories; tracked P1 above) and `i18n:coverage:gate` (every locale 16 placeholder-identical keys over baseline, from fa3ebfdd). One `lint` failure during a loaded parallel run did not reproduce on a clean re-run — machine load, not a defect. All other gates pass at the working tree.

- [ ] P3 — Three parallel CSS token systems across popup, sidepanel, and surface-system, already drifting
  Category: maintainability / visual
  Where: `extension/popup.css:10-80`, `extension/sidepanel.css:1-45`, `extension/surface-system.css:1-21`
  Problem: popup.css and sidepanel.css each declare near-identical `:root` token blocks as duplicated literals (drift present: `--page-bg` vs `--bg`; popup-only `--accent-mid`, `--radius-lg/xl`); surface-system.css — loaded by both pages — defines a third `--astra-*` namespace with different values (`--astra-accent: #ff5d4a` vs `--accent: #ff6b4a`). ~40 raw hex literals in popup.css sit outside any token. A palette change needs three-way sync with no gate.
  Fix: consolidate on the `--astra-*` namespace in surface-system.css (already shared), alias the legacy names during migration, and burn down the raw hexes; optionally a gate asserting popup/sidepanel declare no duplicate token literals.
  Acceptance: one source of token truth; both pages render unchanged (screenshot compare); zero drifted duplicates.
  Confidence: Verified
  Effort: M

- [ ] P3 — EN messages.json sorted-insert ordering has drifted
  Category: maintainability
  Where: `extension/_locales/en/messages.json` (`feature_sponsorBlock*` before `feature_scrollToPlayer`; `playerCcAria` after `playerGearTitleTpl`; `photosensitiveFlashDetected` inside the `playlist*` block)
  Problem: Tooling convention treats the file as sorted-inserted; drift makes future surgical inserts land inconsistently and inflates diffs. No runtime effect.
  Fix: re-sort next time the generator rewrites EN.
  Acceptance: keys sort consistently; locale parity gates stay green.
  Confidence: Verified
  Effort: S

### Follow-up findings — 2026-08-10 (user-reported: hide "X" button missing from thumbnails)

### Follow-up findings — 2026-08-11 (filter-list / permission audit)

Baseline at audit time: `npm test` 1644/1644 pass, `npm run check` EXIT 0 on the
audited branch. This pass was scoped to the v4.59.1 filter-list subscription, the
permission plumbing it depends on, and the popup surfaces it touches. Findings
that were fixed are in CHANGELOG.md, not repeated here.

### Remaining audit scope

- [ ] P3 — Audit the still-unverified secondary surfaces and packaging internals
  Why: the 2026-08-13 pass verified authenticated Chromium routes, the in-page settings system, extension ad blocking, and a manager-neutral userscript artifact; sidepanel/sidebar, companion handoff, Firefox live rendering, specialist scripts, and archive internals still lack equivalent runtime evidence.
  Evidence: `RESEARCH.md` Open Questions; `scripts/smoke-zero-ads-live.js`; `scripts/smoke-userscript-settings.js`; no live Firefox or cookie-bearing companion result exists.
  Touches: `extension/sidepanel.*`, `extension/sidebar.*`, `extension/features/download-ui/`, `theater-split.user.js`, `YT_Reaction_Spammer.user.js`, `build-extension.js`, `archive/`, `mhtml/`
  Acceptance: each named surface has a bounded source/runtime audit; active artifacts get reproducible checks or targeted fixes; archival-only content is explicitly excluded from shipping gates; Firefox and companion limits are recorded without inferring from Chromium.
  Complexity: L

## Research-Driven Additions

Added 2026-08-11. All evidence is first-hand unless a source URL is given.
Items already tracked in `Roadmap_Blocked.md` (Greasy Fork / CWS / AMO
publication, SponsorBlock submission, the DeArrow vote payload defect) are not
duplicated here.

### P0

### P1

### P2

- [ ] P2 — Give the user one answer to "which of my features are working right now?"
  Why: across AMO 1–2 star reviews for every major competitor, breakage cadence is the single largest complaint and silent failure is what makes it unbearable — "it doesn't work anymore… since YouTube keeps updating and breaking the addon". Astra Deck already has the telemetry (`core/selector-health.js`, feature health snapshots, degraded-state pills); it has no surface that answers the question.
  Evidence: https://addons.mozilla.org/en-US/firefox/addon/particle-iridium/ , https://addons.mozilla.org/en-US/firefox/addon/blocktube/ , https://addons.mozilla.org/en-US/firefox/addon/youtube-recommended-videos/ (accessed 2026-08-11); `extension/core/selector-health.js`; the popup's three dashboards render one-line `<li>` empty states (`popup.js:2192-2195, 2500-2503, 2653-2656`) where the side panel gives three-cause states (`sidepanel.js:328-350`).
  Touches: `extension/core/selector-health.js`, `extension/core/registry.js`, `extension/popup.js`, `extension/sidepanel.js`
  Acceptance: one surface lists every enabled feature as healthy / degraded / failed with the selector or API that failed and when, is reachable in two clicks from the toolbar, and is included in the diagnostics bundle. A feature whose selector stops matching flips to degraded within one navigation — bait-verified by breaking a selector pack entry.
  Complexity: M

- [ ] P2 — Measure and budget idle steady-state cost, not just startup
  Why: the top uninstall reason in competitor reviews is idle CPU, explicitly before any feature is enabled — "ramped up CPU usage by 30%-40%. Why is this? I haven't even toggled anything ON yet." `bench-startup` measures parse+init and first paint and stops there.
  Evidence: https://addons.mozilla.org/en-US/firefox/addon/youtube-addon/ (accessed 2026-08-11); `scripts/bench-startup.js` metric set is `parseInitMs`, `firstFeaturePaintMs`, `heapDeltaBytes`, `observerCallbackMs`; ImprovedTube's own tracker carries the same class of report (https://github.com/code-charity/youtube/issues/4109 , https://github.com/code-charity/youtube/issues/3159).
  Touches: `scripts/bench-startup.js`, `scripts/startup-performance-baseline.json`, `extension/core/registry.js`
  Acceptance: a steady-state lane holds a captured watch page open for a fixed interval with the default feature set and records observer callback time, timer wakeups and heap growth per minute; a budget is recorded; the default profile stays under it. Chrome 151's `soft-navigation` and `interaction-contentful-paint` PerformanceEntries are the native instrument for the navigation half — https://developer.chrome.com/blog/new-in-chrome-151
  Complexity: M

- [ ] P2 — Make the startup gate reproducible instead of advisory
  Why: with `iterations: 3`, a 35% relative tolerance and a silent fixture fallback, the gate cannot distinguish a regression from machine load — which is exactly why a real ~5x regression went unremarked.
  Evidence: `scripts/startup-performance-baseline.json` sets `iterations: 3` and `tolerance.relative: 0.35`; observed samples on 2026-08-11 spanned 135–2542 ms within single runs. `scripts/bench-startup.js:446-461` falls back to synthetic fixtures when the gitignored `mhtml/*` captures are absent — i.e. on every clean clone — and then compares against `baseline.fallbackMetrics`, a different budget, with only a `console.warn`.
  Touches: `scripts/bench-startup.js`, `scripts/startup-performance-baseline.json`
  Acceptance: the gate uses a load-robust statistic (minimum or trimmed mean of ≥7 samples, since load only inflates), prints which fixture mode it used in its failure message, and fails loudly rather than warning when it silently switches budgets. Bait-verify by inserting a known 100 ms delay and confirming the gate fails.
  Complexity: S

- [ ] P2 — Filter before render instead of hiding after it
  Why: post-render CSS hiding is why `hideCollaborations` could hide 32 of 102 cards for months with no symptom; the v4.58.1 ">25% of a ≥8-card feed must fail open" invariant patches the symptom at the wrong layer. BlockTube — the benchmark for this — intercepts YouTube's response data so blocked items never exist in the page, and it is decaying (487 open issues, Shorts and comment blocking reported broken, last push 2026-02-07), which leaves the position open.
  Evidence: https://github.com/amitbl/blocktube ; `extension/features/video-hider/index.js`; the v4.58.1 changelog entry.
  Touches: `extension/ytkit-main.js` (MAIN world), `extension/features/video-hider/index.js`, `extension/ytkit.js`, `extension/core/data-flow.js`
  Acceptance: at least one filter class (blocked channel IDs) is applied to the browse/player response before Polymer renders it, autoplay and playlist integrity are preserved, the post-render path remains as the fallback, and a test drives the real interception rather than stubbing it. Store-review risk of data interception is assessed against the `chromium-store` profile before it ships there.
  Complexity: XL

- [ ] P2 — Explain every hide, not just Video Hider's
  Why: "show what filter triggered the blocking" is BlockTube's standing unbuilt request and its top usability complaint is a blocked video showing a blank screen with no reason. Astra Deck's `Explain hidden cards` toggle annotates Video Hider hides only — `hideCollaborations`, `hidePlannedLivestreams` and `removeAllShorts` are separate features and get no note, which is why "disable Video Hider" cleared nothing during the v4.58.1 incident.
  Evidence: https://github.com/amitbl/blocktube/issues/304 , https://addons.mozilla.org/en-US/firefox/addon/blocktube/ (accessed 2026-08-11); repo `CLAUDE.md` v4.58.1 note.
  Touches: `extension/ytkit.js`, `extension/features/video-hider/index.js`, every feed-hiding feature, `extension/_locales/**`
  Acceptance: every feature that hides a card stamps a single shared marker naming the feature and the matched rule; one toggle reveals annotations for all of them; the count of cards hidden per feature this navigation is readable from the diagnostics bundle.
  Complexity: M

- [ ] P2 — Add the destructive-action safety net where it is missing
  Why: three surfaces apply three different safety contracts to comparable actions, including one irreversible action with neither confirmation nor undo, which contradicts the repo's own "reversible-apply or undo toasts" convention.
  Evidence: `extension/popup.js:1670-1685` `deleteAiCredential()` is irreversible (the secret is never re-displayable, `popup.html:201`) with no undo, while reset-everything at `popup.js:5388-5447` has a full snapshot undo. Video Hider per-entry "Remove From List" (`features/settings-panel/index.js:1246-1261`, `ytkit.js:48887-48901`) has no undo while "Clear Hidden List Only" 20 lines below does. Takeout history import (`ytkit.js:51037-51050`) offers undo only when `preImportStats !== null` and silently drops it otherwise.
  Touches: `extension/popup.js`, `extension/features/settings-panel/index.js`, `extension/ytkit.js`
  Acceptance: every destructive action either restores on undo or states in its toast that it cannot be undone; the Takeout import path has one contract, not two; `clearDiagnosticLog()`'s documented exception stays documented.
  Complexity: S

- [ ] P2 — Unify the focus-ring strategy and finish forced-colors coverage
  Why: two incompatible strategies ship side by side and the forced-colors fallback for one of them is dead, so Windows High Contrast users lose focus indication on surfaces nothing flags.
  Evidence: extension pages use `outline: none` + `box-shadow` (`extension/surface-system.css:69-72`, 38 popup + 10 sidepanel rules) while in-page surfaces use a real `outline` (`core/settings-visual-system.js:907-911`); forced-colors never paints `box-shadow`, so `surface-system.css:106-110` — which rewrites the token to another box-shadow — can never work. `extension/live-chat.css` has zero `forced-colors` rules while restyling ~50 chat selectors with hard-coded rgba.
  Touches: `extension/surface-system.css`, `extension/popup.css`, `extension/sidepanel.css`, `extension/live-chat.css`, `extension/core/settings-visual-system.js`, `scripts/audit-popup-a11y.js`
  Acceptance: one focus-ring mechanism that survives `forced-colors: active` on every surface, `live-chat.css` gains a forced-colors lane, and the a11y gate detects outline-suppressing rules rather than listing selectors (shares the P1 gate item above).
  Complexity: M

- [ ] P2 — Fix the Reaction Sender dialog and the popup's vestigial focus trap
  Why: one `role="dialog"` has no Escape handler and no focus trap, and the popup runs a document-wide Tab trap with nothing left to trap.
  Evidence: `extension/features/live-chat/index.js:425-427` declares `role="dialog" aria-modal="false"` — the only dialog in the codebase with neither Escape nor a trap (compare `popup.js:1388-1398` and `ytkit.js:50890-50892`). `popup.js:1386-1426` traps Tab unconditionally while `getActiveFocusRoot()` (`:1371-1376`) always returns `document.body` since the confirm modal was retired, so Shift-Tab wraps instead of leaving. The popup has no skip link despite ~15 sections above its toggle list, while `sidepanel.html:13` has one.
  Touches: `extension/features/live-chat/index.js`, `extension/popup.js`, `extension/popup.html`, `scripts/audit-overlays-a11y.js`
  Acceptance: the Reaction Sender closes on Escape and traps focus while open, or drops the `role="dialog"`; the popup's Tab handler is removed or re-scoped to a real modal root; the popup gains a skip link; the overlay a11y gate covers the live-chat surface.
  Complexity: S

- [ ] P2 — Generate the Firefox sidebar from the side panel instead of cloning it
  Why: `sidebar.html:12-128` is a byte-for-byte clone of `sidepanel.html:12-128` with nothing keeping them in sync, so every a11y and copy fix must be made twice — a smaller instance of the same duplication tax as the module/monolith split.
  Evidence: the two files; `extension/sidebar.js` is 4 inert lines setting `data-astra-surface="firefox-sidebar"` with no consumer anywhere in the repo.
  Touches: `extension/sidebar.html`, `extension/sidebar.js`, `build-extension.js`
  Acceptance: the sidebar markup is generated from the side panel at build time or the divergence is gated byte-for-byte; the inert `sidebar.js` is either given a consumer or deleted.
  Complexity: S

- [ ] P2 — Ship the heatmap features YouTube already hands us
  Why: jump-to-most-replayed and heatmap-driven speed are the only genuinely new playback ideas in the category this year, ImprovedTube shipped both in 2026, and the heatmap JSON already arrives in the player response Astra Deck parses — so the marginal cost is low and it is a leapfrog on a specialist's own ground.
  Evidence: https://github.com/code-charity/youtube/releases (v4.2026 "Smart Speed"); no `heatmap`/`mostReplayed` key exists in `extension/core/settings-schema.js` (verified 2026-08-11).
  Touches: `extension/ytkit.js` (`_rw.ytInitialPlayerResponse` parser), `extension/core/settings-schema.js`, `extension/_locales/**`
  Acceptance: a jump-to-most-replayed control appears in the player chrome when heatmap data is present and is absent when it is not; an opt-in speed mode raises playback rate through cold regions and returns to the user's rate through hot ones, writing through `setProgrammaticPlaybackRate()` so it cannot clobber a saved per-channel speed.
  Complexity: M

- [ ] P2 — Restore original thumbnails, not just original titles
  Why: YouTube now localises text baked into thumbnails, so `antiTranslate` restores the title while the thumbnail still shows translated text — a visible half-fix. YouTube-No-Translation (1,231 stars) solves it and adds oEmbed as a zero-permission metadata fallback Astra Deck has no equivalent of.
  Evidence: https://github.com/YouG-o/YouTube-No-Translation ; no `thumbnailOriginal`-shaped key exists in the settings schema (verified 2026-08-11).
  Touches: `extension/ytkit.js` (`antiTranslate`), `extension/core/data-flow.js`
  Acceptance: with the feature on, a video whose thumbnail carries localised text renders the original-language thumbnail, with a documented fallback order and no new install-time host permission.
  Complexity: M

- [ ] P2 — Schedule-driven feature activation ("focus hours")
  Why: RYS ships time-based hiding and it is the natural completion of the existing `digitalWellbeing` and `focusedMode` features; nothing in the 468-key schema can vary a toggle by time of day.
  Evidence: https://github.com/lawrencehook/remove-youtube-suggestions ; no `schedule`/`focusHours`/`timeOfDay` key exists in `extension/core/settings-schema.js` (verified 2026-08-11).
  Touches: `extension/core/settings-schema.js`, `extension/ytkit.js`, `extension/popup.js`
  Acceptance: any boolean feature can carry an optional active-window; the window is evaluated locally with no alarm permission added; leaving the window restores the prior value rather than writing a new default; the schedule is exported and imported with settings.
  Complexity: M

### P3

- [ ] P3 — Delete the five dead helpers in `popup.js` and `ytkit.js`
  Why: four import sanitisers duplicated from `ytkit.js` with zero call sites in `popup.js` are a real fork risk — a future fix to the originals will not reach the copies, and nothing indicates the copies are dead.
  Evidence: `extension/popup.js:4204` `sanitizeImportedHiddenVideos`, `:4208` `getImportedFilteredVideoPosts`, `:4215` `sanitizeImportedBlockedChannels`, `:4231` `sanitizeImportedBookmarks`; the originals at `ytkit.js:1196/1205/1333/1382` are used at `ytkit.js:4553, 4563, 4565, 4612-4631, 6502`. Also `ytkit.js:5004` `cachedQuery(selector)`, defined and never called.
  Touches: `extension/popup.js`, `extension/ytkit.js`
  Acceptance: the five functions are removed, `npm test` and `npm run check` stay green, and nothing in the import path regresses.
  Complexity: S

- [ ] P3 — Lint the tooling that enforces everything else
  Why: the 28 gate scripts, the build script and the userscript sync script are the highest-leverage code in the repo and are the only JavaScript never linted.
  Evidence: `package.json:55` lists only `extension/**` paths; `scripts/**`, `build-extension.js`, `sync-userscript.js`, `tests/**` and `extension/runtime-core-loader.mjs` are excluded. ESLint 10 resolves `eslint.config.*` from each linted file's directory, so a stricter config can be scoped without a monorepo — https://eslint.org/docs/latest/use/migrate-to-10.0.0
  Touches: `package.json`, `eslint.config.js`
  Acceptance: `npm run lint` covers `scripts/`, the two root build scripts and `runtime-core-loader.mjs`; the custom `require-catch-reason` rule applies there too.
  Complexity: S

- [ ] P3 — Put a scope floor on the list-scoped gates
  Why: six gates are scoped by hand-written file lists, so anything off the list is uncontrolled and a renamed file drops out silently. `check-userscript-symbols.js` already implements the right shape.
  Evidence: `scripts/check-userscript-symbols.js:115` `MIN_DERIVED_SINGLETONS = 12` is a floor on the gate's own derived scope. Contrast `scripts/check-no-eval.js:35-54` `SCAN_FILES`; `scripts/check-light-theme-lane.js:34-39` `SOURCES` (excludes all of `extension/core/*.js`, which also inject CSS); `scripts/audit-overlays-a11y.js:18-27` (5 files, while overlays live in ~25 feature modules); `scripts/check-contrast.js:141-150` (6 token pairs). `scripts/check-versions.js:153-170` returns "skipped" and true when `git` is off PATH.
  Touches: `scripts/check-no-eval.js`, `scripts/check-light-theme-lane.js`, `scripts/audit-overlays-a11y.js`, `scripts/check-contrast.js`, `scripts/check-versions.js`
  Acceptance: each gate derives its scope by glob and asserts a minimum count, so deleting or renaming a covered file fails rather than silently shrinking coverage; a missing `git` fails the stray-tag check instead of skipping it.
  Complexity: M

- [ ] P3 — Retire or rewrite `HARDENING.md`
  Why: it is 13 releases stale, its "still open" lists reference the companion that left the repo in `a6bb685f`, and `ROADMAP.md:54` already records it as unaudited — so it is a document that can only mislead.
  Evidence: the newest section is H26 on v4.46.0; `HARDENING.md:668` "Pass 6 candidates" are all companion items; `:957` and `:1027` are v3.20.x-era.
  Touches: `HARDENING.md`, `SECURITY.md`, `docs/architecture.md`
  Acceptance: either the file is archived with a header pointing at `CHANGELOG.md` and `ROADMAP.md` as the live records, or it is regenerated against current code; `SECURITY.md`'s supported-version and provenance claims are checked against what releases actually ship.
  Complexity: S

- [ ] P3 — Surface the Return YouTube Dislike confidence signal
  Why: the API returns `rawDislikes` and `rawLikes` alongside the extrapolated `dislikes`, so the "estimated" label can become a quantitative confidence indicator instead of a disclaimer — and mis-set expectations are a recurring 1-star theme for RYD itself.
  Evidence: live probe 2026-08-11 for `kJQP7kiw5Fk` returned `rawDislikes: 10831` against `dislikes: 6267301` — a ~578× extrapolation factor exposed in the same payload. https://returnyoutubedislike.com/docs
  Touches: `extension/ytkit.js` (`returnDislike`), `extension/_locales/**`
  Acceptance: the dislike pill's tooltip states the sample size behind the estimate; a very low `rawDislikes` renders a visibly lower-confidence treatment; the README wording stays "estimated".
  Complexity: S

- [ ] P3 — Adopt the platform APIs that delete existing code
  Why: several 2026 platform additions replace hand-rolled machinery already carried in this repo, at low risk behind feature detection.
  Evidence (all accessed 2026-08-11): `runtime.getContexts()` (Chrome 116+) is the direct duplicate-lifecycle detector — https://developer.chrome.com/docs/extensions/reference/api/runtime ; Chrome 152 ships `:playing`/`:paused`/`:buffering`/`:muted` media pseudo-classes that delete JS-mirrored player-state classes, plus `navigator.cpuPerformance` for gating expensive features — https://developer.chrome.com/blog/chrome-152-beta ; Firefox 153 exposes `document.adoptedStyleSheets` to content scripts, removing `<style>` injection for live-chat CSS, and honours a `build-for-amo` npm script for source verification (absent from `package.json`) — https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/ ; Chrome 148 exposes all APIs under `browser.*`, retiring the `chrome`/`browser` shim. Note `Intl.DurationFormat` and `scheduler.postTask` need Chrome 129, above the declared Chrome 120 floor — feature-detect or raise the floor.
  Touches: `extension/core/browser-api.js`, `extension/core/injection-guard.js`, `extension/ytkit.js`, `extension/live-chat.css`, `package.json`
  Acceptance: each adoption is behind a capability probe recorded in the capability matrix, the Chrome 120 / Firefox 142 floors still work, and `npm run check:startup` does not regress.
  Complexity: M

- [ ] P3 — Design against the 2026 YouTube drift shape, not the 2024 one
  Why: the current breakage class is camelCase view-model host classes and heterogeneous container children, not new `ytd-*` tags — and DeArrow shipped three emergency releases in April 2026 alone for exactly this.
  Evidence: `.shortsLockupViewModelHost` / `ytm-shorts-lockup-view-model` migrations tracked across https://github.com/iv-org/invidious/pull/5922 , https://github.com/code-charity/youtube/pull/4277 , https://github.com/TeamNewPipe/NewPipeExtractor/pull/1503 ; heterogeneous children under `ytd-watch-next-secondary-results-renderer`; https://github.com/ajayyy/DeArrow/releases
  Touches: `extension/core/selector-packs/**`, `selector-packs.json`, `extension/core/selector-health.js`, `tests/selector-regression.test.js`
  Acceptance: selector packs carry camelCase view-model host variants as first-class entries rather than fallbacks; any container walk tolerates mixed child types; a missing selector raises a telemetered failure rather than a silent no-op; the fixture set includes at least one modern lockup capture.
  Complexity: M
  Note (2026-08-13 live recon): `ytd-page-manager` retains hidden prior-route trees after SPA navigation, so shared surface resolvers must prefer connected, visible nodes under the active route instead of accepting the first selector match.

### Research-driven gaps — 2026-08-11

#### P1

- [ ] P1 — Refresh expired caption tracks and expose transcript provenance
  Why: YouTube caption `baseUrl` values carry an `expire` parameter; Astra’s service tries five track sources and two formats but does not retry a fresh player response after a 403/404/expired URL, and returned transcripts have no source/age/expiry signal.
  Evidence: `extension/core/transcript-service.js:179-503`, `extension/ytkit.js:1841-1848`, `extension/ytkit.js:45545-45843`, https://stackoverflow.com/questions/78081057/how-can-i-download-youtube-captions-using-javascript
  Touches: `extension/core/transcript-service.js`, transcript call sites in `extension/ytkit.js`, `extension/features/**` transcript consumers, `tests/core-transcript-service.test.js`, `tests/transcript-panel.test.js`, localized status/diagnostic copy
  Acceptance: an expired/403/404 caption fetch triggers at most one fresh track discovery for the same video, retries the selected track or an honest DOM fallback, aborts on SPA video change, and never returns a different video’s transcript; result/diagnostics expose source, language, fetchedAt, expiresAt, and stale/fallback reason; tests simulate expired URLs, stale player globals, captionless videos, and navigation cancellation.
  Complexity: M

#### P2

- [ ] P2 — Put the transcript IndexedDB under a byte budget and show it in storage health
  Why: the index caps 1,000 records and 200,000 characters per record but the popup measures only `chrome.storage.local`; `storageQuotaLRU` does not prune `ytkit-transcript-index`, so the largest local store can grow without a visible budget or recovery path.
  Evidence: `extension/core/transcript-index.js:7-18`, `extension/ytkit.js:45545-45843`, `extension/popup.js:2011-2055`, `extension/ytkit.js:36726-36855`, https://developer.chrome.com/docs/extensions/reference/api/storage, https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
  Touches: `extension/core/transcript-index.js`, `extension/ytkit.js`, `extension/core/persisted-domains.js`, `extension/popup.js`, `scripts/audit-storage-size.js`, `scripts/smoke-transcript-index.js`, `tests/core-transcript-index.test.js`, `tests/storage-size-audit.test.js`
  Acceptance: transcript index reports count, estimated bytes, oldest/newest age, and IndexedDB/storage estimate alongside extension-local bytes; a deterministic byte cap plus record cap evicts oldest records before writes fail; quota/corruption states offer export/clear/undo-safe recovery; the cap and metadata are included in backups; stress tests prove no cross-video data loss and no silent quota rejection.
  Complexity: M

- [ ] P2 — Extend rendered locale and WCAG reflow coverage to every primary surface
  Why: `smoke-headless-a11y.js` exercises 200% overflow and forced colors, but RTL is limited to sidepanel/sidebar `ar`, popup/settings/transcript/download are not locale-stressed, and no all-surface run proves the 320 CSS-pixel reflow requirement for the 11 bundled locales.
  Evidence: `scripts/smoke-headless-a11y.js:47-80,454-622`, `extension/_locales/` (11 locales), `README.md:346`, https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
  Touches: `scripts/smoke-headless-a11y.js`, `scripts/smoke-settings-overlay.js`, `extension/popup.css`, `extension/sidepanel.css`, `extension/sidebar.html`, `extension/_locales/**`, `tests/hardening.test.js`
  Acceptance: CI renders popup, sidepanel/sidebar, settings, transcript, and download at a 320 CSS-pixel equivalent with `en`, `de`, `pt_BR`, `ar`, and a generated long-string/pseudo-locale fixture; it checks document/root horizontal overflow, clipped labels/focus targets, correct `lang/dir`, keyboard reachability, and forced-colors; exceptions are scoped to video/data surfaces and documented.
  Complexity: M

## Audit Findings — 2026-08-14

Baseline at audit time (clean worktree at origin/main after two in-session fixes — `7f40b94e` unbroke a backtick-in-CSS-comment parse error in `extension/ytkit.js:2113`, `9c29ae6f` ratcheted the UI-copy baseline for the popover CSS edit): `npm test` **1688/1688 pass**. `npm run check` now runs the full chain and fails **only** at `check:startup` (`firstFeaturePaintMs` median 117.70 ms > 102.40 ms budget, `fixture mode: synthetic-fallback` because the gitignored `mhtml/*` captures are absent on a clean clone) — this is the already-tracked startup-reproducibility item, not a new regression. `audit:deps` reports the tracked `image-size@2.0.2` dev-only exception. All other gates green. Method: six parallel trace-and-verify sweeps (background trust boundaries, popup/sidepanel UX+a11y, download/player slice, userscript drift + dead code, vacuous tests/gates, settings wiring) plus rendered smoke captures (settings-overlay in dark/light/RTL/tablet/mobile, headless-a11y in normal/200%-reflow/forced-colors) reviewed by hand. Findings below were each re-verified at file:line against the working tree before logging; suspicions the agents cleared are omitted.

### P1

- [ ] P1 — `autoSubtitleLang` is a dead user-facing setting in both vehicles
  Category: correctness
  Where: `extension/core/settings-schema.js:463` (declared `internal: false`, `immediateApply: true`, default `"en"`); defaults-only echoes at `extension/default-settings.json:248`, `extension/ytkit.js:3721`, `YTKit.user.js:2868`, `YTKit-core.user.js:3433`.
  Problem: the key is never read by any runtime code — exhaustive cross-ref of the whole 468-key schema against `ytkit.js`, `features/**`, `core/**`, `background.js`, `popup.js`, and both userscript files found zero read sites. The `autoSubtitles` feature (`ytkit.js:27874-27911`) only clicks the CC button; it never selects a caption language. Because the popup schema-overview renders an editable text input for every non-internal string entry (`popup.js:3658-3723`), a user can set "Auto subtitle lang" to `es`, it persists, and nothing happens — the worst dead-toggle class (looks wired, silently inert). The real language knob is `dualSubtitleLanguage` (`settings-schema.js:812`), the only settings key `features/subtitles/index.js` reads.
  Evidence: two independent sweeps reached the same conclusion; grep for `autoSubtitleLang` outside schema/defaults/fixtures returns nothing.
  Fix: either wire the language into the subtitle feature (select the matching caption track via the player API on enable) or mark the entry `internal: true` and add it to `RETIRED_SETTING_KEYS` with a migration.
  Acceptance: either setting the value changes the selected caption track on a multi-caption video, or the key no longer renders in the popup and a migration drops it; a test asserts the chosen behavior.
  Confidence: Verified
  Effort: M

### P2

- [ ] P2 — Userscript sends the full YouTube cookie jar (incl. httpOnly session cookies) to any local port squatter
  Category: security
  Where: `YTKit.user.js:2356-2371` (cookie collection + attach), gated only by `_isAstraDownloaderHealth` at `YTKit.user.js:1683-1690`.
  Problem: the userscript's companion `/download` attaches **all** `.youtube.com` cookies — including httpOnly `SID`/`HSID`/`SSID`/`SAPISID` sign-in cookies — to whichever local server answered `/health` with `{token, service: 'astra-downloader'}` (or merely `{token, token_required: true, port}` on a catalogued port). There is no native-messaging identity proof, no cookie-contract filtering, no one-time capability, and no disclosure. The extension hardened exactly this path (`extension/features/download-ui/index.js:1550-1596`: cookies only after fresh native-host proof, contract-filtered, disclosed); the userscript body never got that gate. An unprivileged local process listening on a companion port obtains a full Google session — defeating Chrome's app-bound cookie encryption, which otherwise stops non-browser processes reading these cookies. Requires a userscript manager with `GM_cookie` granted.
  Evidence: read both code paths; the extension's gate is absent from the userscript body; matches the documented "userscript retains retired/looser network paths" incident class (repo CLAUDE.md).
  Fix: port the extension's contract — require the exact `service` id plus an out-of-band proof before attaching any sign-in cookie, or drop cookie handoff from the userscript entirely and let the companion use its own browser-cookie import.
  Acceptance: a fake local server returning the minimal health shape receives no httpOnly sign-in cookies; a test drives the userscript download path against a stub health server and asserts the payload carries no `SID`/`SAPISID`.
  Confidence: Verified
  Effort: M

- [ ] P2 — Userscript leaks the watch URL to y2mate / savefrom / ssyoutube; branches bypass the download-boundary gate
  Category: security
  Where: `YTKit.user.js:5790-5792` (provider map), used at `:5818`/`:5820`; duplicated at `:5905-5907`.
  Problem: three third-party download frontends are hardcoded as navigation targets that receive the canonical watch URL / video id (`baseUrl + encodeURIComponent(canonicalUrl)` at `:5820`, `baseUrl + videoId` at `:5818`). None exist anywhere under `extension/` (zero hits for `y2mate|savefrom|ssyoutube`; not in `background.js` `ALLOWED_FETCH_ORIGINS`, `manifest.json`, or `core/data-flow.js` `ORIGIN_CATALOGUE`) — they are archived v3 providers (`CHANGELOG-v3-archive.md:2367`). This contradicts the hardening comment at `YTKit.user.js:1631-1644` and the `_buildConfiguredWebDownloaderUrl` fragment design that `tests/download-health-boundary.test.js:376-382` asserts — but the test only guards the `cobalt` branch, so these three are untested and skip the boundary.
  Evidence: grep + changelog + test-scope read; the sibling Cobalt-instance keys are deliberately retained and pinned, so this is specifically the three retired providers.
  Fix: remove the y2mate/savefrom/ssyoutube provider map and their settings keys (`downloadProvider`, `replaceWithCobaltDownloader`), or route them through the same `_buildConfiguredWebDownloaderUrl` boundary and extend the test to cover every branch.
  Acceptance: the userscript exposes no download destination that transmits the watch URL outside the boundary-gated set; the boundary test covers all surviving branches.
  Confidence: Verified
  Effort: S

- [ ] P2 — `EXT_FETCH` per-hop redirect validation is unreachable in a real MV3 service worker (blocks all redirects; legit 3xx endpoints fail in production but pass CI)
  Category: correctness
  Where: `extension/background.js:1104-1150` (`fetchWithValidatedRedirects` hop loop); masking test `tests/background.test.js:769-797`.
  Problem: each hop fetches with `redirect: 'manual'` (`:1096`), then the loop expects to read `response.status` and the `Location` header to follow and re-validate the next hop (the behavior commit `49549a60` was written to provide). In a real service worker, `fetch(url,{redirect:'manual'})` returns an opaque-redirect filtered response (`type:'opaqueredirect'`, `status:0`, no readable headers), so the guard at `:1114` always throws first and the follow branch at `:1121-1150` never runs — `EXT_FETCH` rejects every redirect instead of validating-and-following. It is fail-closed (no exploit), but any allowlisted endpoint that legitimately 301/302s (an http→https bounce or trailing-slash normalization on SponsorBlock/RYD/a filter-list host) fails in shipped browsers while passing CI, because the test's mock returns a plain `Response(null,{status:302,headers:{location}})` (type `basic`, status readable) so the follow-loop executes only in tests.
  Evidence: traced the handler; the MV3 opaque-redirect behavior is well-defined; the test/browser divergence is in the mock shape.
  Fix: drive the redirect tests with a fetch mock that reproduces `type:'opaqueredirect'`/`status:0` for `redirect:'manual'`; if following is actually desired, obtain `Location` via a mechanism that survives manual-redirect (the filtered response cannot expose it) — otherwise document that redirects are intentionally refused and simplify the dead follow-branch.
  Acceptance: a test using a realistic opaque-redirect mock demonstrates the shipped behavior; a known-good redirecting allowlisted URL either succeeds or is documented as unsupported.
  Confidence: Likely (browser-behavior dependent, fail-closed)
  Effort: M

- [ ] P2 — Popup backup import lowers a future `settingsSchemaVersion` stamp that `load()` deliberately preserves
  Category: correctness
  Where: `extension/popup.js:799-806` (`migrateImportedSettings`), contradicting the invariant at `extension/ytkit.js:4396-4403`.
  Problem: when an imported backup's `settingsSchemaVersion` is newer than the running build, values are kept but `migrated._settingsVersion = targetVersion` writes the **lower** running version. `load()` explicitly guards against this ("Preserve a stamp written by a NEWER build… otherwise would lower the stamp and re-arm forward migrations") using `Math.max`; the import path defeats it. Reachable when a future build bumps the schema version, a second machine / downgrade imports that backup, the stamp drops, and the next upgrade re-runs forward migrations over already-future-shaped data. Today's migrations are mostly `undefined`-guarded so corruption is latent, but the guard exists precisely for this.
  Evidence: both code paths read; the `load()` invariant is documented and enforced.
  Fix: mirror `load()` — store `Math.max(startingVersion, targetVersion)` in the future-version branch.
  Acceptance: importing a backup stamped with a higher schema version leaves the stored `_settingsVersion` at the higher value; a test covers the future-version import.
  Confidence: Verified (mechanism); corruption impact Likely
  Effort: S

- [ ] P2 — `knownValues` vocabularies are out of sync with the runtime/in-page token set (cross-surface state misrepresentation)
  Category: correctness
  Where: `extension/core/settings-schema.js:227` (`hiddenPlayerControls`, missing `ytLogo` and `settings`) and `:220` (`hiddenChatElements`, missing `reactions`); popup grid at `popup.js:3724-3766`; runtime handlers at `ytkit.js:17529-17550` and the `reactions` chat entry near `ytkit.js:16511`/`:16552`.
  Problem: the popup checkbox grid renders only `knownValues`. A user who hides the native brand button, the settings gear, or chat reactions in-page (all offered as in-panel sub-toggles with live selectors) then opens the popup and sees no checked box for that state — the tokens are carried silently at the array tail and can't be inspected or unset from the popup. Not data loss (the grid preserves unknown tokens, `popup.js:3765-3766`), but the popup and the in-page panel disagree about what is hidden. The parity gate didn't catch it because it only requires `knownValues ⊇ default`.
  Evidence: verified both directions (the reverse case `hiddenActionButtons` omitting `dislike` is fine because `action.dislike` exists in `selector-packs.json`).
  Fix: add `ytLogo`, `settings` to `hiddenPlayerControls.knownValues` and `reactions` to `hiddenChatElements.knownValues`; consider a gate that asserts `knownValues` equals the union of default + in-page sub-toggle tokens.
  Acceptance: hiding those elements in-page shows the corresponding checked boxes in the popup grid; the vocabularies match the runtime selector maps.
  Confidence: Verified
  Effort: S

- [ ] P2 — Content-script storage preload failure degrades to silent session-long defaults with no signal
  Category: correctness
  Where: `extension/core/storage.js:245-254`; consumed by `settingsManager.load()` at `ytkit.js:4378+`.
  Problem: if `chrome.storage.local.get(null)` rejects, the catch logs `console.warn` and sets `extensionStateReady = true` over an empty cache; `load()` then merges `{}` over defaults, so every feature runs at factory settings for the whole tab session while the popup (its own read path) shows the user's real settings. The two surfaces silently disagree. Data is not lost — `save()` diffs against the same-session baseline and `mutateMany` merges onto the background's fresh read — but the user sees their customizations vanish on the page with no toast or banner.
  Evidence: traced the catch and the merge; the no-data-loss half is genuinely defended.
  Fix: surface the preload failure through the existing `_errors` toast/diagnostic-ring machinery, the same way flush failures already are.
  Acceptance: a simulated preload rejection produces a visible degraded-state indication in-page; a test asserts the error is recorded.
  Confidence: path Verified; trigger Needs-repro
  Effort: S

- [ ] P2 — Backup import rejects the entire file on a single unknown key
  Category: ux / reliability
  Where: `extension/popup.js:861-869` → `core/policy-profile.js:243+` (`validateSettingsForBackupImport`, no `allowUnknown`).
  Problem: any unknown key makes `validateSettingsSnapshot` throw and aborts the whole import ("Settings import rejected: unknown setting …"). A backup from a future build that added even one setting cannot be restored after a downgrade — all-or-nothing, no partial import, no per-key skip report (the sync path resolves per-key). Malformed JSON is handled well (friendly message) and the apply path is snapshot+rollback protected, so this is specifically the unknown-key wholesale rejection.
  Evidence: traced the validator; contrast with the per-key sync path.
  Fix: pass `allowUnknown: true` for backup import (unknown keys already survive round-trips elsewhere), or drop-and-report unknown keys instead of rejecting the file.
  Acceptance: a backup containing one unknown key imports the known keys and reports the skipped one; a test covers it.
  Confidence: Verified
  Effort: S

- [ ] P2 — Onboarding preset completion is silent; the profile-confirmation toasts are dead code
  Category: ux
  Where: `extension/popup.js:4390-4398` (dead `profile-store-safe`/`profile-github-full` toast branches), `:4442-4458` (`pickWelcomePreset`).
  Problem: picking a welcome preset flips a whole bundle of settings but produces **zero** success feedback — the card just vanishes (`dismissWelcomeCard` is called with `preset-*`/`preset-skip`, which no toast branch handles). The two profile-confirmation toasts, localized in all 11 locales (`statusWelcomeProfileSafe`/`statusWelcomeProfileFull`), are unreachable because no caller passes those reasons. Failure paths toast; success doesn't — violating the popup's own immediate-apply+toast convention.
  Evidence: traced all `dismissWelcomeCard` callers; the reason strings never match the toast branch.
  Fix: toast in `pickWelcomePreset` after the write (and/or thread the profile reasons back through `dismissWelcomeCard`).
  Acceptance: completing onboarding by any preset shows a confirmation toast; a test asserts a status message fires on preset apply.
  Confidence: Verified
  Effort: S

- [ ] P2 — Several JS-driven state hooks have no CSS, so error/urgent states render as neutral idle text
  Category: visual / ux
  Where: `extension/popup.js:4856-4868` (`filterListStatus.dataset.state = 'info'|'success'|'error'`), `:2355`/`:2372` (`storageBanner.dataset.tier = 'corruption'|'soft'|'hard'`), `:2461` (`selectorHealthAsset.dataset.state = asset.status`).
  Problem: none of these `[data-state]`/`[data-tier]` selectors have any rule in `popup.css`/`surface-system.css` (grep returns only `.app-status` and `.external-health-state[data-tone]`). Every filter-list failure ("That address is on a private or local network…", refresh/permission failures) renders as gray body text indistinguishable from the idle "No filter list is being followed"; the storage `corruption` tier is meant to read as more urgent than the `soft` size nudge (per its own code comment) but renders identically; a degraded/error selector-rules asset looks healthy. SR users get the `role="status"` live region; sighted users get no tone.
  Evidence: grepped both stylesheets for the emitted attribute selectors — absent.
  Fix: add tone rules mirroring the existing `.status.success/.error/.info` palette (`popup.css:2580-2582`) for each `[data-state]`/`[data-tier]` family.
  Acceptance: a filter-list error renders in the error color, a corruption banner is visibly more urgent than a soft nudge, and a degraded selector asset is visually distinct; verified in the rendered popup smoke in both themes.
  Confidence: Verified
  Effort: S

- [ ] P2 — Notification hide/restore feature has no CSS backstop; its test asserts only the `hidden` IDL property
  Category: testing / correctness
  Where: `extension/ytkit.js:31346-31365` (`_setHidden`); test `tests/notification-controls.test.js:98-105`.
  Problem: `_setHidden` hides `ytd-notification-renderer` items via `item.hidden = true` plus marker attributes only — no CSS rule anywhere targets those markers or `ytd-notification-renderer[hidden]` (grepped `extension/`, both userscripts). The `hidden` attribute is just a UA `display:none`, which any author-level `display` on the Polymer host overrides, so the item can stay painted. The test drives a fake node and asserts `item.hidden === true`, passing regardless of rendered outcome — the exact "hidden but still painted" family whose cure the repo already applied to the popup (`tests/hardening.test.js:4890` pins `.brand-version[hidden]{display:none}`).
  Evidence: no CSS backstop exists; the assertion is property-only.
  Fix: add `ytd-notification-renderer[data-ytkit-notification-read-hidden], …[data-ytkit-notification-cap-hidden] { display:none !important; }` to the feature CSS and pin that rule in the test.
  Acceptance: the rule exists and is pinned; a rendered check confirms a marked notification has zero client rects.
  Confidence: Verified (absence of backstop); rendered impact Needs-repro on live YouTube
  Effort: S

### P3

- [ ] P3 — The i18n copy gate fingerprints `<style>.textContent` CSS as "UI copy", and `npm run check` is fail-fast
  Category: testing / maintainability
  Where: `scripts/check-localizable-ui-copy.js:88-124` (`collectJsLiterals` classifies a `styleEl.textContent = \`…css…\`` assignment as sink `assignment:textContent`); chain at `package.json` `scripts.check`.
  Problem: two systemic issues surfaced when the download-panel CSS edit tripped this gate (fixed in `9c29ae6f` by ratcheting): (1) the gate treats an entire `<style>` CSS blob assigned via `.textContent` as one localizable UI-copy literal, so every edit to `_playerBtnCSS` / the speed-popup / dl-popup stylesheet blocks in `ytkit.js` fails with a spurious "route new copy through locale keys" error and forces a baseline ratchet, even though no user-facing string changed; (2) because `check` is a single `&&` chain, one red gate hides every gate after it — when the copy gate was red, the 17 following gates (lint, `audit:a11y`, `audit:contrast`, `audit:light-theme`, `audit:deps`, `i18n:coverage:gate`, `generate-capability-matrix --check`, the Firefox checks, etc.) never ran via `npm run check` or `release:prepare`, so work shipped with them silently unexercised.
  Evidence: the digest changed 926→926 (count identical) purely from the CSS edit — diffing extracted `(sink,value)` pairs against `66b30e6f` showed the sole delta was the `_playerBtnCSS` block; the fail-fast chain behavior is inherent to `&&`.
  Fix: exclude `<style>`/`.textContent` CSS assignments from `collectJsLiterals` (a literal that is assigned to a `style` element or that parses as CSS is not UI copy); and make `check` run all gates and aggregate failures at the end (or split into independent jobs) so one red gate can't mask others.
  Acceptance: editing a CSS block in `ytkit.js` no longer trips the copy gate; a deliberately-untranslated `textContent` label still does; `npm run check` reports every failing gate in one run.
  Confidence: Verified
  Effort: M

- [ ] P3 — Speed popup: no vertical clamp / max-height on the JS fallback, and a document-listener leak on fast reopen
  Category: correctness / a11y
  Where: `extension/ytkit.js:3122-3133` (fallback placement, no `top+ph>innerHeight` clamp and no `maxHeight`), `:3142-3145` (50 ms `setTimeout` attaching capture-phase `click`+`keydown` with no `popup.isConnected` guard).
  Problem: two gaps the download popup already fixed but the speed popup did not. (a) The no-anchor fallback branch (Firefox / no CSS anchor positioning) clamps `left` both ways and flips above→below when `top<8`, but never clamps the bottom edge and never caps height, so the ~230 px grid can extend past the viewport bottom after a flip in a short viewport. (b) If `_closeSpeedPopup()` runs inside the 50 ms arm window (a double-click reopen discards the old cleanup closure), the timer still fires and attaches the capture-phase listeners with no remover — leaked for the page lifetime, and the leaked `outsideClick` closes any later speed popup on the first click. The download popup carries the guard + comment at `index.js:2321-2324` and `:2369-2376`.
  Evidence: compared both popups line-for-line; the guards are present in one and absent in the other.
  Fix: mirror the download popup's bottom clamp + `maxHeight`, and add `if (!popup.isConnected) return;` before attaching the deferred listeners.
  Acceptance: the speed popup stays fully on screen from a bottom-bar trigger in a short viewport; rapid reopen adds no permanent document listeners (asserted in a jsdom test).
  Confidence: Verified (code)
  Effort: S

- [ ] P3 — Anchored download-popup inline clamp silently no-ops on RTL pages
  Category: correctness
  Where: `extension/features/download-ui/index.js:2355-2361`.
  Problem: the edge-overhang clamp computes `shift` from physical `getBoundingClientRect()` coordinates and applies it as `popup.style.marginInlineStart`. The anchored popup is positioned by physical `left: anchor(center)` with `right:auto` and a fixed 292 px width, so on `dir=rtl` pages (YouTube ar/he/fa/ur) `margin-inline-start` maps to `margin-right` — the slack side of a left-constrained fixed box — and moves nothing. A dock button near the viewport edge leaves the popup partially off-screen for RTL users.
  Evidence: traced the computed-style axis; the measurement is physical but the applied property is logical.
  Fix: apply the shift on the physical axis the measurement was taken in (`marginLeft`), or compute the whole clamp in logical coordinates.
  Acceptance: on an `dir=rtl` fixture the anchored popup is nudged back on-screen from an edge trigger; add an RTL case to the placement probe.
  Confidence: Verified
  Effort: S

- [ ] P3 — Download popup height cap is applied only at open; async content can push the toolbar off the top
  Category: correctness
  Where: `extension/features/download-ui/index.js:2347-2350`.
  Problem: `maxHeight` is set only if `popup.offsetHeight > heightCap` at open, but the playlist preview row (~+200 px) and the two-line quality-chip probe labels render later. Because the anchored popup is pinned `bottom: anchor(top)`, late growth extends upward; `position-try flip-block` can flip it below and the base `max-height: calc(100vh - 16px)` bounds total height, but when neither side alone fits the grown popup the toolbar (tabs + close) exits the viewport top with no way to scroll it back (`__body` scrolls, the fixed popup doesn't). Esc still closes.
  Evidence: traced the render timing and the anchor pinning.
  Fix: apply the cap unconditionally (`maxHeight = max(MIN, spaceAbove, spaceBelow)` always), or re-run the clamp in a `ResizeObserver` on the popup.
  Acceptance: opening the popup then loading a long playlist/probe keeps the toolbar on screen; a probe with late content growth confirms it.
  Confidence: Verified (geometry); worst case Needs-repro
  Effort: S

- [ ] P3 — Download popup survives SPA navigation and can download the wrong video
  Category: correctness
  Where: `extension/features/download-ui/index.js:2243` (CTA reads `window.location.href` at click) vs. formats/estimates/playlist/dir captured at open; no navigate rule closes `_dlPopup`.
  Problem: nothing closes the popup on SPA navigation (only the popup's own handlers call `_closeDlPopup`). YouTube autoplay navigates without a user click, so the popover's light-dismiss never fires; a popup left open across the transition shows video A's formats/sizes but, on click, downloads video B (current URL).
  Evidence: traced the open-time captures vs. the click-time URL read; no `addNavigateRule` closes it.
  Fix: close the popup on navigate (register a navigate rule), or freeze `requestUrl` at open and use it for the CTA and all probes.
  Acceptance: navigating (incl. autoplay) while the popup is open either closes it or downloads the video it was opened for; a test drives a navigation between open and click.
  Confidence: Verified (path); impact Likely
  Effort: S

- [ ] P3 — Empty 2xx `/download` response is misrouted to the restart/repair flow
  Category: correctness
  Where: `extension/features/download-ui/index.js:1539` (`if (resp.id)`).
  Problem: on an empty or non-JSON 2xx body, `extensionFetchJson` yields `{data:null}`, so `resp.id` throws a `TypeError` that the catch rethrows into `ytKitDownload`'s connection-error handler (`:1492-1510`) → a misleading "Astra Downloader stopped. Starting it again…" + repair prompt instead of `showDownloaderFailure`.
  Evidence: traced the null shape and the catch routing.
  Fix: `if (resp?.id) { … } else { showDownloaderFailure(resp || {}); }`.
  Acceptance: an empty 2xx download response shows the failure UI, not the restart prompt; a test covers the null-body case.
  Confidence: Verified
  Effort: S

- [ ] P3 — Duplicate/orphaned download health-pill containers when sibling download panels coexist
  Category: correctness
  Where: `extension/features/download-ui/index.js:2584-2607` (health dedupe by `anchor.nextElementSibling`) vs. Stream Links (`:2775`), Cobalt (`:2907`), History (`:3232`) each `insertAdjacentElement('afterend', …)` on the same anchor.
  Problem: the sibling panels insert themselves between the anchor and the health container, so on the next navigate tick the health panel no longer sees itself as `nextElementSibling` and builds a second container; the first is orphaned with stale pills and a live `aria-live="polite"` region. Needs ≥2 of the four panels enabled (all default off).
  Evidence: traced the dedupe predicate against the sibling insertion points.
  Fix: dedupe parent-wide like the sibling features do (`anchor.parentElement.querySelector('.ytkit-download-health')`).
  Acceptance: enabling health + stream-links together across a navigation yields exactly one health container; a test asserts a single node.
  Confidence: Likely
  Effort: S

- [ ] P3 — One-click Deno provisioning sends the wrong auth header
  Category: correctness
  Where: `extension/features/download-ui/index.js:2560` (`headers: { 'X-MDL-Token': data.token }`).
  Problem: every other authenticated companion call uses `X-Auth-Token` (`:623,:651,:1534,:1938,:2019,:2168…`); `X-MDL-Token` appears nowhere else in the repo. If the companion expects `X-Auth-Token`, the health-pill "click to provision Deno" action always 401s with a failure toast. Companion source isn't in this repo, so server-side is unconfirmed.
  Evidence: header-name grep across the file; the endpoint does token comparison (`CHANGELOG.md:2847`).
  Fix: use `X-Auth-Token`, and build the URL via `MediaDLManager.baseUrl()` instead of hand-concatenating.
  Acceptance: clicking the provision pill with the companion running succeeds; verified against the running companion.
  Confidence: Likely / Needs-repro
  Effort: S

- [ ] P3 — Playlist preview creates a dead-end and its hint copy is then wrong
  Category: correctness / ux
  Where: `extension/features/download-ui/index.js:2244-2255` (empty-selection hard block) vs. hint at `:2121-2124`.
  Problem: once `playlistSelection` becomes a Set (any preview), an empty selection hard-blocks the Download button ("Select at least one playlist item") — contradicting the hint "Without a selection, this video downloads normally". Reachable with zero effort when the playlist has 0 items, the current video is outside the shown subset (preselect misses), or the user unchecks everything intending a normal download. The only escape is closing and reopening the popup.
  Evidence: traced the Set transition and the block.
  Fix: empty selection falls through to single-video download (matching the hint), or add an explicit "clear preview" affordance.
  Acceptance: unchecking all preview items and clicking Download downloads the single video; a test covers the empty-Set path.
  Confidence: Verified
  Effort: S

- [ ] P3 — Userscript companion downloads ignore the user's quality/format and lack an in-progress guard
  Category: correctness
  Where: `YTKit.user.js:2316` (payload `{url, audioOnly}` only) vs. extension `index.js:1519-1524`; `YTKit.user.js:2259` (`ytKitDownload`, no `_downloadInProgress` guard) vs. extension `:1443-1448`.
  Problem: the userscript sends no `quality`/`format`, so companion downloads always use server defaults even though the userscript has a `downloadQuality` setting (it only affects the direct-stream fallback). And `ytKitDownload` has no in-progress guard, so double-clicks queue duplicate downloads.
  Evidence: compared payloads and guards across the two vehicles.
  Fix: mirror the extension payload (`quality`, `format` from settings) and add the `_downloadInProgress` guard.
  Acceptance: a userscript companion download honors the chosen quality/format; a double-click queues one download.
  Confidence: Verified
  Effort: S

- [ ] P3 — CSV history/groups export does not neutralize formula-injection prefixes
  Category: security
  Where: `extension/features/download-ui/index.js:3003-3005` (`_csvCell`) and `extension/ytkit.js:42596-42602` (`_csvEscape`).
  Problem: `_csvCell` quotes cells and escapes quotes but does nothing about leading `=`/`+`/`-`/`@`; exported fields include `title`/`filename`/`url` where title is arbitrary uploader text. `_csvEscape` (the group export) detects those prefixes but only to decide whether to *quote* — quoting does not stop Excel evaluating a `"=…"` cell on open. So neither export path actually neutralizes formula injection, despite the changelog advertising it. `_csvCell` also silently truncates at 500 rows with no notice (`:3012`).
  Evidence: read both helpers; quoting-only is not neutralization.
  Fix: add a shared helper that prefixes a `'` (or tab) to any cell beginning `=`/`+`/`-`/`@`/tab, used by both exports; surface the 500-row cap.
  Acceptance: a video titled `=cmd|…` exports as a literal string Excel does not evaluate; a test asserts the prefix on formula-leading cells in both exporters.
  Confidence: Verified
  Effort: S

- [ ] P3 — Number/color/JSON schema editors expose raw camelCase keys as their accessible name
  Category: a11y
  Where: `extension/popup.js:3622` (number), `:3671` (string/color), `:3737` (checkbox group), `:3792` (JSON textarea) — all set `aria-label` to `entry.key`.
  Problem: the visible row label is the humanized/override label, but the accessible name is the raw storage key (e.g. `downloadCobaltInstance`). Voice-control users cannot target "Self-hosted Cobalt origin" by its visible name, and SR users hear camelCase. This is the exact accessible-name/visible-label mismatch the code already fixed for boolean switches at `:3585-3588`.
  Evidence: read all four editor builders.
  Fix: reuse the humanized `label.textContent` computed at `:3487-3491` for the `aria-label`.
  Acceptance: each editor's accessible name contains its visible label; the popup a11y smoke asserts name/label agreement.
  Confidence: Verified
  Effort: S

- [ ] P3 — Two side-panel state strings are injected via CSS `content:` and can never be localized
  Category: i18n / a11y
  Where: `extension/sidepanel.css:1129-1141` (`[data-saving="true"]::after { content:"Saving" }`, `[data-error="true"]::after { content:"Try again" }`); shared by `sidebar.html`.
  Problem: every other user-facing string in these surfaces goes through `data-i18n`/`t()`; these two render English in all 10 non-EN locales and are structurally unreachable by the messages pipeline (distinct from the tracked "grandfathered EN literals", which is JS-side). SR feedback is separately covered via `aria-description`, so this is the visible/localization side.
  Evidence: read the CSS; grep confirms no `t()` path feeds them.
  Fix: render the state text from `sidepanel.js` with `t()` into a real element, drop the `::after` content.
  Acceptance: switching locale localizes the saving/retry state text; a locale render check covers it.
  Confidence: Verified
  Effort: S

- [ ] P3 — Number-editor "clear to reset" affordance silently keeps the old value
  Category: correctness / ux
  Where: `extension/popup.js:3616-3633` (`persist()` early-returns on empty input).
  Problem: the code comment claims "Schema default fills the placeholder so the user can recover by clearing and re-typing", but committing an empty field early-returns; after clear+blur the field shows the default (as placeholder) while storage still holds the old value, which reappears on reopen. The affordance actively misleads (the real reset is the per-key ↺ button).
  Evidence: read the persist path end to end.
  Fix: treat commit-on-empty as reset-to-default, or restore the stored value into the field on blur.
  Acceptance: clearing a number field and blurring either resets to default or visibly restores the stored value; a test covers it.
  Confidence: Verified
  Effort: S

- [ ] P3 — `uiStyle` runtime fallback disagrees with the schema default and is reachable
  Category: correctness
  Where: `extension/ytkit.js:6985` (`appState.settings.uiStyle || 'rounded'`) vs. schema default `"square"` (`settings-schema.js:121`).
  Problem: normally latent on a dense post-`load()` bag, but the popup string editor deliberately persists empty strings and `uiStyle` has no `enum`, so `''` writes cleanly and `'' || 'rounded'` flips the UI to rounded while the schema diff/placeholder say square. This was the only true `||`/`??` fallback mismatch in the sampled set (all others matched schema).
  Evidence: traced the empty-string persist path into the fallback.
  Fix: `|| 'square'`, or treat `''` as `'square'` explicitly.
  Acceptance: clearing `uiStyle` yields the square style; a test asserts the fallback equals the schema default.
  Confidence: Verified
  Effort: S

- [ ] P3 — Popup wheel interceptor swallows Ctrl/⌘+wheel zoom
  Category: a11y
  Where: `extension/popup.js:6136-6148` (`installWheelScrolling`).
  Problem: the non-passive document `wheel` handler calls `preventDefault()` without checking `event.ctrlKey`/`metaKey`, so the browser's Ctrl+wheel / pinch zoom is cancelled over any scrollable region (most of the popup). Low-vision users lose a zoom path inside the popup.
  Evidence: read the handler; no modifier check exists.
  Fix: `if (event.ctrlKey || event.metaKey) return;` at the top of the handler.
  Acceptance: Ctrl+wheel zooms the popup; a test or manual check confirms the gesture is not cancelled.
  Confidence: Verified
  Effort: S

- [ ] P3 — Capability-probe re-render lacks the focused-editor guard the storage-change path has
  Category: ux
  Where: `extension/popup.js:6195-6199` (`ensureCapabilityMap()` → unconditional `renderSchemaOverview()`) vs. the guard at `:6294-6296`.
  Problem: when the capability probe resolves (up to ~1.5 s after boot), it rebuilds the schema overview unconditionally, while the storage-change path deliberately skips the rebuild when focus is inside the overview ("never blow away a focused inline editor mid-edit"). A user who opens the overview and starts typing within the probe window loses uncommitted input.
  Evidence: compared the two re-render call sites.
  Fix: reuse the same `contains(document.activeElement)` guard before the probe-driven rebuild.
  Acceptance: typing in an inline editor during the probe window is not discarded; timing test or manual repro.
  Confidence: Verified (paths); timing-dependent
  Effort: S

- [ ] P3 — Pre-NF21 upgrade guard stamps the version but still shows the "What's New" banner it exists to suppress
  Category: correctness
  Where: `extension/popup.js:4290-4341`.
  Problem: the guard writes `LAST_SEEN_VERSION_KEY` and flips local `firstRunSeen` true, but the local `lastSeen` const (read at `:4290`, still `''`) is what the gate at `:4339` checks, so `showWhatsNew('')` fires on that same popup open — contradicting the in-code contract ("stamp the sentinels silently so neither surface fires today"). One-shot per upgrading user, low harm, but the tokenless "Updated to vX. See what changed." variant renders when it shouldn't.
  Evidence: traced the local vs. stored version reads.
  Fix: re-read the stamped value (or use the just-written `targetVersion`) for the gate, so the banner fires only on the next real bump.
  Acceptance: an upgrading user does not see the What's New banner on the stamping open; a test covers the pre-NF21 path.
  Confidence: Verified
  Effort: S

- [ ] P3 — Permanent storage-quota failure silently drops fire-and-forget auxiliary writes
  Category: correctness
  Where: `extension/core/storage.js:332-356` (`storageWrite`/`storageWriteJSON` callers never observe `{ok:false}`).
  Problem: settings `save()` surfaces failure (rollback + `role=alert` toast), and flush failures retry with backoff, but fire-and-forget auxiliary writes (watch progress, sticky-chat layout, low-power backup, etc.) never observe failure; on a persistently full quota the data is lost at tab close with only a `console.warn`. The popup storage banner mitigates only if the user opens the popup.
  Evidence: traced the fire-and-forget callers vs. the settings save path.
  Fix: route persistent-quota failures on auxiliary writes into the same diagnostic-ring/banner surface.
  Acceptance: a simulated full quota produces a user-visible signal for auxiliary writes; a test asserts the failure is recorded.
  Confidence: Verified (path); user impact Needs-repro
  Effort: M

- [ ] P3 — `readTextBounded` / AI-summary buffer the whole body before enforcing the size cap on chunked responses
  Category: reliability
  Where: `extension/background.js:796-808` (`readTextBounded`) and `:246-255` (`performAiSummaryRequest`).
  Problem: both check `content-length`, then `await response.text()` and measure bytes only after the full body is buffered. A response with no `Content-Length` (chunked) bypasses the pre-check, so the entire body is read into memory before the 256 KB / 512 KB / 2 MB cap trips — unlike `EXT_FETCH`, which streams with an incremental reader cap (`:1805-1826`). Destinations are semi-trusted (GitHub raw, self-hosted Cobalt, BYO AI provider), so this is DoS/robustness hardening, not injection.
  Evidence: read both paths; no streaming bound.
  Fix: reuse the `EXT_FETCH` streaming bounded-reader for these paths instead of `response.text()`.
  Acceptance: a chunked over-limit response is aborted before fully buffering; a test streams an oversized chunked body and asserts early abort.
  Confidence: Verified
  Effort: M

- [ ] P3 — Inconsistent disclosure ARIA on the download triggers
  Category: a11y
  Where: `extension/features/player-dock/index.js:173-182` (`.ytkit-po-dl`) and `extension/ytkit.js:20220-20246` (`.ytkit-local-dl-btn`) declare no `aria-haspopup`/initial `aria-expanded`; the context-menu fallback stamps `aria-expanded` onto the `#movie_player` div (`index.js:2274`).
  Problem: the speed button correctly declares `aria-haspopup="menu"` + initial `aria-expanded="false"`; the download triggers declare neither, so `aria-expanded` first appears mid-lifecycle, and the `#movie_player` fallback puts an expanded-state ARIA attribute on a non-widget element.
  Evidence: compared the trigger creation sites.
  Fix: add `aria-haspopup="dialog"` + `aria-expanded="false"` at creation for the button triggers; skip the attribute for the non-button `#movie_player` anchor.
  Acceptance: both download buttons expose a stable disclosure state from creation; no ARIA state lands on `#movie_player`.
  Confidence: Verified
  Effort: S

- [ ] P3 — Stream Links close handler mutates the History panel's private state
  Category: maintainability
  Where: `extension/features/download-ui/index.js:2707-2713` (`downloadStreamLinksPanel` close does `this._requestToken++` / clears `this._searchTimer`).
  Problem: those properties exist only on `downloadHistoryPanel` (copy-paste from `:3113-3119`). Harmless today (`undefined++` → a NaN expando), but it masks the two panels' divergence and will bite the next refactor.
  Evidence: read both close handlers.
  Fix: remove the borrowed lines from the Stream Links close handler (it has no async token / search timer).
  Acceptance: the Stream Links close handler references only its own state; behavior unchanged.
  Confidence: Verified
  Effort: S

- [ ] P3 — Userscript duplicates RYD / SponsorBlock / DeArrow / player-handoff features on non-schema keys; bundled modules are never called
  Category: maintainability
  Where: `YTKit.user.js` hand-maintained copies — RYD `:8066` (key `returnYoutubeDislike`, canonical is `returnDislike`), SponsorBlock `:14508`, DeArrow `:14788`/`:14922`; provider/handoff keys `replaceWithCobaltDownloader` `:5783`, `downloadProvider` `:5892`, and seven player-handoff keys (`showVlcButton :6708`, `showMp3DownloadButton :6784`, `showVlcQueueButton :13057`, `showMpvButton :13087`, `preferredMediaPlayer :13163`, `showDownloadPlayButton :13180`, `subsVlcPlaylist :13209`).
  Problem: `YTKit.user.js:167-169` declare the peeled `return-dislike`/`sponsorblock`/`dearrow` modules as bundled and `YTKit-core.user.js` exports their factories, but `YTKit.user.js` calls **none** of them (only `createUserscriptAiSummaryFeature` of the four is wired). The hand-maintained duplicates run instead — with no cache, no rate budget, no `ExternalApiHealth`, and keyed on settings that don't exist in `extension/core/settings-schema.js` (the schema collapsed the handoff surface to `vlcMpvHandoff` + `showLocalDownloadButton`). So userscript users get an inferior second implementation and a pile of settings the extension retired.
  Evidence: 0 call sites for the bundled factories; the listed keys have 0 occurrences under `extension/`.
  Fix: wire the userscript to the bundled feature factories (as it already does for `stickyChat`/`subtitles`/`themeCss`) and delete the hand-maintained duplicates and their retired keys, or explicitly document why the userscript keeps a separate implementation.
  Acceptance: the userscript RYD/SponsorBlock/DeArrow paths run the bundled modules (honoring the schema keys), and the non-schema handoff keys are removed or documented.
  Confidence: Verified (High)
  Effort: L

- [ ] P3 — Dead `@connect` grants in the userscript metadata, including a `localhost` grant the extension deliberately dropped for security
  Category: security / maintainability
  Where: `YTKit.user.js:29` (`@connect localhost`), `:24` (`@connect returnyoutubedislikeapi.com`), `:28` (`@connect raw.githubusercontent.com`).
  Problem: none has a live `GM_xmlhttpRequest` site. `@connect localhost` is the more serious one: every companion URL builds from `127.0.0.1`, and `extension/background.js:713-719` explicitly refuses to allowlist `localhost` because "Firefox still resolves through DNS — a hostile network or compromised resolver can rebind `localhost` to an internal IP and probe the LAN." The userscript still grants exactly that channel. `returnyoutubedislikeapi.com` is reached via bare `fetch()` (CORS-governed, not `@connect`), and `raw.githubusercontent.com` appears only in `@updateURL`/`@downloadURL`/`@require`/`@icon` (not `@connect`-governed).
  Evidence: enumerated every GM call site; none targets these three hosts.
  Fix: remove the three dead `@connect` entries; keep only the hosts with a real GM request site (`127.0.0.1`, the AI providers, `sponsor.ajay.app`, `sponsorblock.kavin.rocks`).
  Acceptance: the userscript `@connect` list contains only hosts it actually requests via GM; installing still works.
  Confidence: High (localhost, RYD) / Medium (githubusercontent)
  Effort: S

- [ ] P3 — `.data-flow-dot.df-risk-local-companion` has no CSS rule, so loopback origins render with no risk color
  Category: visual
  Where: `extension/popup.css:2015-2019` (rules for `safe`/`api`/`local`/`experimental`/`store-risk`) vs. emitter `popup.js:3080` (`'data-flow-dot df-risk-' + entry.riskBand`) and the only loopback `riskBand: 'local-companion'` (`core/data-flow.js:121`, and Ollama `:229`).
  Problem: the emitted class is `df-risk-local-companion`, which has no rule — both loopback origins (companion, Ollama) render with no risk dot color. The stylesheet instead carries `df-risk-local` (never emitted) and `df-risk-store-risk` (also never emitted — `riskBand` only takes `safe`/`api`/`local-companion`/`experimental`; `store-risk` is a schema `risk` value feeding the separate `toggle-risk-*` family). The sibling toggle badge got the name right (`popup.css:3007` `.toggle-risk-local-companion`).
  Evidence: exhaustive `riskBand:` scan of `data-flow.js`; grep of the emitted class against the stylesheet.
  Fix: rename the CSS rule to `.df-risk-local-companion` (drop the dead `df-risk-local` and `df-risk-store-risk` rules).
  Acceptance: the Data Flow panel's loopback origin dots render in the intended color; verified in the popup smoke.
  Confidence: Verified
  Effort: S

- [ ] P3 — `.ytkit-vote-badge` / `.ytkit-liked` is styled and removed in the extension but never created (lost in the module peel)
  Category: correctness / maintainability
  Where: `extension/features/chat-style-comments/index.js:18` (5 `.ytkit-vote-badge` style rules), injected at `ytkit.js:7745-7747`; removal-only sites at `chat-style-comments/index.js:307,1286,1374`.
  Problem: the extension styles the vote badge and has three paths that hide/remove it, but no creation site exists anywhere in `extension/` — the constructor was dropped when the feature was peeled out of the monolith. The badge **is** built in the userscript (`YTKit.user.js:3958`/`:3973`/`:3980`), so this is a feature the extension silently lost (or dead CSS + dead removal paths if the badge was intentionally retired extension-side).
  Evidence: grep for the `ytkit-vote-badge` creation/`ytkit-liked` toggle under `extension/` returns nothing; the userscript has it.
  Fix: decide whether the like-badge belongs in the extension — if yes, port the constructor from the userscript; if no, delete the CSS and the three removal paths.
  Acceptance: either the vote badge renders in the extension comment restyle, or the orphaned CSS/removal code is gone; behavior matches intent.
  Confidence: Verified
  Effort: M

- [ ] P3 — Confirmed dead code and inert scaffolding (delete or wire)
  Category: maintainability
  Where: (a) `extension/features/settings-panel/index.js` — the `_panelCleanups` registry has zero `.push(...)` sites anywhere (`ytkit.js:1719`+`:48118-48125`, `settings-panel/index.js:82`+`:254-261` only drain it), and the same file attaches six anonymous `document`-level listeners (`:3169,:3174,:3201,:3390,:3542,:3786`) with no `removeEventListener` and no `destroy()` export; (b) three dead `YTKitCore` aliases — `core/data-flow.js:527` `findDataFlowCoverageGaps`, `core/settings-sync.js:909` `settingsSync`, `core/browser-api.js:121` `resolveBrowserNamespace` (each shadowed by the live export the callers actually use); (c) two dead regex alternates `uiStyleManager`/`colorThemeManager` in `core/settings-visual-system.js:47` (they are element ids, not schema keys, so the branch never fires); (d) dead schema key `lowPowerProfileBackup` (`settings-schema.js:746`; the real snapshot lives under the top-level `ytkit-low-power-backup` key, `ytkit.js:46665`); (e) unused CSS `.sp-storage-card` (`sidepanel.css:1106`, no creation site).
  Problem: inert code that misleads maintainers — the `_panelCleanups` registry promises centralized teardown that does nothing (no leak today, but the next panel-widget author will trust it and leak), the settings panel cannot be torn down, and the dead keys/aliases/CSS invite false assumptions.
  Evidence: grep-verified zero consumers for each; the `_panelCleanups` drains iterate an empty array.
  Fix: delete the dead aliases, regex alternates, `lowPowerProfileBackup` key (with a retirement migration), and `.sp-storage-card`; either wire real registrations into `_panelCleanups` and give the settings panel a `destroy()` (named handlers) or remove the empty registry + its MutationObserver.
  Acceptance: each listed symbol is either removed or given a live consumer; `npm test` + `npm run check` stay green.
  Confidence: Verified
  Effort: M

- [ ] P3 — Stale/misleading maintainer comments and drifted microcopy in the popup snapshot paths
  Category: docs / maintainability
  Where: `extension/popup.js:6453-6455` (comment cites a "PIN" that does not exist anywhere), `:6025-6027` (`statusResetSnapshotFail` blames "data too large" but post-EI2 the session payload is a tiny descriptor — bulk goes to IndexedDB via `persistedDomains.writeExtensionSnapshot` at `:5836-5841`), `:5089` vs `:5317` (same key `statusImportSnapshotFail` carries two drifted English fallbacks).
  Problem: comments and error copy steer maintainers and users toward wrong causes; the drifted fallback means the visible string depends on which call site wins.
  Evidence: grepped for "PIN" (absent), traced the snapshot write path, compared the two fallbacks.
  Fix: correct the comments, re-point the snapshot-fail copy at the real (session-API) failure cause, and unify the `statusImportSnapshotFail` fallback.
  Acceptance: no comment references a non-existent PIN; the snapshot-fail copy names the real cause; the import-snapshot fallback is identical at both call sites.
  Confidence: Verified
  Effort: S

Note — refines the existing "Delete the five dead helpers in `popup.js` and `ytkit.js`" item: its line numbers are stale. The dead import-sanitizers are now at `extension/popup.js:4559` (`sanitizeImportedVideoIdList`), `:4575` (`sanitizeImportedHiddenVideos`), `:4579` (`getImportedFilteredVideoPosts`), `:4586` (`sanitizeImportedBlockedChannels`), `:4602` (`sanitizeImportedBookmarks`) — six functions, not four — and `ytkit.js:5004` no longer holds `cachedQuery` (the file grew). Update the item's `Where:` before implementing.
