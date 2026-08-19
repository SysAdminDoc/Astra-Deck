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

- [ ] P3 — Reduce monolith compile time, the last large startup cost
  Why: with the foundation graph now loaded concurrently (16-21 ms), the single biggest remaining startup stage is `monolithMs` — 65-87 ms spent compiling and executing the ~3.1 MB `extension/ytkit.js`. Every bench run prints the stage line, so the number is always visible.
  Context (2026-08-18): the ~2x regression bisected on 2026-08-08..v4.63.0 is CLOSED. Its remaining "debt" turned out to be an artifact of comparing against a reference recorded on hardware that was wiped in the 2026-08-15 rebuild. Verified before retiring that reference: `b5c933aa` (the concurrent-loading fix) and HEAD measured 131.70/93.60 and 134.90/89.00 back to back on the same box — identical within noise. The reference is now re-recorded on the current machine with the retired one and its bisect preserved in `startup-performance-baseline.json`'s `history`, and no accepted-regression allowances are carried.
  Evidence: `npm run check:startup` stage lines; `scripts/startup-performance-baseline.json`.
  Found it (2026-08-19): the "rarely-used feature bodies" are not scattered - they are 15 inline FALLBACK objects. Every peeled feature is wired as `(globalThis.YTKitFeatures?.x?.createXFeature?.({...}) || { ...the entire pre-peel implementation, still inline... })`, so the monolith carries a second full copy of code that also ships as a module. Ten of the fifteen are full copies; five are already minimal stubs (360-551 bytes), which is the shape the other ten should take.
    Measured: `sticky-video` fallback 316,911 bytes vs its module's 318,608 - the same code twice, 100% of its distinctive lines (>=60 chars) present in both files. Same pattern: `video-hider` 125,774/172,354 (68% of lines duplicated), `sponsorblock` 35,016/37,718 (97%), `dearrow` 29,995/32,564 (97%), `chat-style-comments` (89%), `subscription-groups` (89%), `settings-panel` (81%). Seven fallbacks cross-validate against their module size at ratio 0.69-0.99 and sum to 549 KB; including the two whose spans a brace scan could not measure cleanly (`subscription-groups`, `return-dislike`) the total is roughly 770 KB, about a quarter of the 3.2 MB monolith. Both automated totals produced before cross-validation were wrong (1.44 MB and 2.85 MB) - a brace matcher that does not skip regex literals over-runs, and a gap-to-next-call measure counts unrelated feature objects. Use module size as the cross-check.
    A user with the feature ON parses both copies and discards the inline one via `||`. A user with it OFF has the module skipped by `FEATURE_SETTINGS` gating and parses ~318 KB of fallback to read five descriptor fields. Neither case is paying for anything.
    The second cost is correctness, and it is the one that already bit: the two copies must be hand-patched together. The recycled-node item below lists `ytkit.js` AND `features/subscription-groups/index.js` line pairs for the same defect, and the v4.72.0 fix had to edit both. A fix applied to one copy diverges silently, and the divergence only surfaces when a module fails to load and the stale copy takes over.
    Progress (2026-08-19): seven of the ten full fallbacks are gone - `sticky-video` (316,911 B), `sponsorblock` (35,016 B), `dearrow` (29,995 B), `digital-wellbeing` (21,641 B), `video-notes` (17,911 B), `return-dislike` (17,568 B), `youtube-music-compat` (1,827 B). ytkit.js 3,204,260 -> 2,787,757 (-13.0%). One feature per commit.
    HOW TO MEASURE, and it matters: sequential before/after runs are not trustworthy on this box even when it is idle - they produced a phantom 30 ms regression earlier in the same session, and they overstated this work's benefit. Use an INTERLEAVED A/B instead: copy the two `extension/ytkit.js` revisions aside, then alternate base/head for five rounds swapping only that one file, and compare min and median. Any drift in machine load then hits both arms equally.
    Measured that way: `sticky-video` alone (316 KB) is watch -3.3 ms / feed -3.2 ms on min, -3.0 / -2.2 on median - a real win that survives the rigorous method. The six that followed (118,859 B combined) are watch -0.1 ms / feed -1.2 ms, i.e. watch is inside the noise floor. The honest rule of thumb is about 1 ms per 100 KB removed. An earlier note here projected 10-14 ms for the remaining nine; that was extrapolated from a single sequential measurement and was too optimistic. The realistic total for all ten is 7-8 ms, of which 3.3 is already banked.
    So the startup argument alone does not justify the remaining three. The MAINTENANCE argument does, and it is no longer hypothetical: peeling `video-notes` exposed that `html:not([dark]) .ytkit-video-notes-container` and `.ytkit-video-notes-name` existed ONLY in the dead ytkit.js copy, so Per-Video Notes had been painting near-white text on light theme while `npm run audit:light-theme` stayed green by finding the rule in code no user ran. Peeling `sponsorblock` exposed a behavioural test building the feature through `loadFallbackFeature`, exercising the copy nobody runs. Every removal makes the gates point at the code that ships.
    Before removing each one, diff the copy against its module (normalise indentation, drop comment-only lines) and reconcile any line the copy has that the module lacks. `dearrow`, `sponsorblock` and `digital-wellbeing` came back clean; `video-notes` did not.
    Cost per feature, roughly: 1-10 test re-points, plus retiring any pure drift guard whose subject no longer exists (the `dearrow` "character-identical to the peeled module" pin was exactly that). Add a stub-size guard so the descriptor cannot grow an implementation back. Use acorn to find the range - a brace matcher that does not skip regex literals over-runs badly. Bait-verify every re-pointed pin: mutate the module and confirm the test fails.
    Watch for gates and tools, not just tests: `scripts/audit-overlays-a11y.js` and `scripts/check-light-theme-lane.js` read a hand-listed set of sources, so a peeled feature drops out of their scope silently - add the module to the list (see the scope-floor item below, which is the general fix). `scripts/check-localizable-ui-copy.js` is a ratchet and needs `--update-baseline` after copy leaves ytkit.js; verify the diff only decreases. If the module source changes at all, `node sync-userscript.js` must run or the byte-for-byte userscript bundle test fails.
    Do NOT batch these. `subscription-groups` was attempted and reverted: removing its 164,457-byte fallback broke 34 tests across 11 files, and unlike the seven done so far they are not all source pins - `npm run audit:overlays -- --self-test` fails too, and count-based assertions ("both ytkit.js compact-count methods", "all three monolith CSV escapers") need re-deriving rather than re-pointing. It needs its own session.
    Remaining, smallest first: `floating-logo` (31,264 B, monolith-only - there is no module, so this one needs a real peel first and is different work from the other two), `video-hider` (125,774 B), `subscription-groups` (164,457 B). All three are their own session; the seven already done were the ones where the copy and the module had converged.
    Recon on `video-hider` (2026-08-19, not started): the factory is `createHideVideosFromHomeFeature`, not `createVideoHiderFeature`. 101 lines differ between copy and module, so unlike the seven done so far this one cannot be a straight delete. Roughly 17 are monolith-only bindings the module reimplements under other names (`MONOLITH_FILTER_LIST_CODEC`, `MONOLITH_FILTER_LIST_SUBSCRIPTION_KEY`, `monolithReadResponseHeader`, `monolithFilterListError`, `monolithSha256Text`, `monolithClassifyFilterListRefreshError`); about 15 are hardcoded English the copy never localised and the module does (`'Video Hider'`, `'Resume Loading'`, `'Review Filters'`, the Subscriptions Guard banner strings) - those overlap the grandfathered-English-literals item below. Spot-checked and present in the module: the 1 MiB filter-list limit, SHA-256 integrity, `not-modified-without-cache`, `integrity-error`, the refresh timer. One real divergence: the detached-node cap is 500 in the copy and 200 in the module, and the module is the one that runs, so the conservative value is what ships. Nothing found that only the copy implements, but confirm the remaining ~69 lines individually before deleting.
    Plan: replace each full fallback with the minimal descriptor stub the other five already use (id, name, description, group, icon, pages, and `isParent` where the settings tree nests children under the row - `dearrow` and `sponsorblock` both need it - plus no-op init/destroy). One feature per commit, interleaved A/B before and after, `next-monolith-peel.test.js` pins rewritten per feature.
    Deliberate trade: a module that genuinely fails to load leaves its feature inert rather than falling back to a pre-peel copy. That is the better failure - drain #9 already made a failed module non-fatal and diagnosable, and silently running divergent old code is worse than not running it.
  Touches: `extension/ytkit.js`, `scripts/generate-runtime-bootstrap.js`, `sync-userscript.js`
  Acceptance: `monolithMs` drops measurably without splitting the monolith's public behaviour — e.g. by moving rarely-used feature bodies out of the always-parsed path — and `npm run smoke:zero-ads:live` still boots the real extension. Measure before and after at the same commit on the same machine; note that the FIRST bench run after an idle period floors ~15-20 ms high (cold page cache), so compare warm runs.
  Complexity: L

### P3

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
  Note (2026-08-19 research): RYD remains frozen at v4.0.4 (2026-05-02) with breakage reports accumulating unanswered — Astra's maintained integration is now a differentiator, strengthening this item. Documented limits confirmed current (100 req/min, 10k/day): keep caching aggressive and never fetch per-thumbnail.

- [ ] P3 — Adopt the platform APIs that delete existing code
  Why: several 2026 platform additions replace hand-rolled machinery already carried in this repo, at low risk behind feature detection.
  Evidence (all accessed 2026-08-11): `runtime.getContexts()` (Chrome 116+) is the direct duplicate-lifecycle detector — https://developer.chrome.com/docs/extensions/reference/api/runtime ; Chrome 152 ships `:playing`/`:paused`/`:buffering`/`:muted` media pseudo-classes that delete JS-mirrored player-state classes, plus `navigator.cpuPerformance` for gating expensive features — https://developer.chrome.com/blog/chrome-152-beta ; Firefox 153 exposes `document.adoptedStyleSheets` to content scripts, removing `<style>` injection for live-chat CSS, and honours a `build-for-amo` npm script for source verification (absent from `package.json`) — https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/ ; Chrome 148 exposes all APIs under `browser.*`, retiring the `chrome`/`browser` shim. Note `Intl.DurationFormat` and `scheduler.postTask` need Chrome 129, above the declared Chrome 120 floor — feature-detect or raise the floor.
  Touches: `extension/core/browser-api.js`, `extension/core/injection-guard.js`, `extension/ytkit.js`, `extension/live-chat.css`, `package.json`
  Acceptance: each adoption is behind a capability probe recorded in the capability matrix, the Chrome 120 / Firefox 142 floors still work, and `npm run check:startup` does not regress.
  Complexity: M
  Note (2026-08-19 research): Chrome moves to a TWO-WEEK release cadence starting with 153 (stable 2026-09-08) — https://developer.chrome.com/blog/chrome-two-week-release — so capability probes over version checks becomes mandatory, not preferred. New since the item was written: Chrome 149 `chrome.userScripts.execute()` returns synchronous syntax diagnostics; Chrome 150 `chrome.contextMenus` supports the `'tab'` context and `alarms.create()` enforces a 1024-byte name limit; Chrome 153 experiments with pinning action icons to the toolbar BY DEFAULT (revisit any "pin the extension" onboarding copy); Firefox 154 (2026-08-18) adds the `sandbox` manifest key.

- [ ] P3 — Design against the 2026 YouTube drift shape, not the 2024 one
  Why: the current breakage class is camelCase view-model host classes and heterogeneous container children, not new `ytd-*` tags — and DeArrow shipped three emergency releases in April 2026 alone for exactly this.
  Evidence: `.shortsLockupViewModelHost` / `ytm-shorts-lockup-view-model` migrations tracked across https://github.com/iv-org/invidious/pull/5922 , https://github.com/code-charity/youtube/pull/4277 , https://github.com/TeamNewPipe/NewPipeExtractor/pull/1503 ; heterogeneous children under `ytd-watch-next-secondary-results-renderer`; https://github.com/ajayyy/DeArrow/releases
  Touches: `extension/core/selector-packs/**`, `selector-packs.json`, `extension/core/selector-health.js`, `tests/selector-regression.test.js`
  Acceptance: selector packs carry camelCase view-model host variants as first-class entries rather than fallbacks; any container walk tolerates mixed child types; a missing selector raises a telemetered failure rather than a silent no-op; the fixture set includes at least one modern lockup capture.
  Complexity: M
  Note (2026-08-19 research): uBlock Origin 1.73.1 betas (2026-08-07..13) added a `content(...)` procedural operator specifically to match elements inside `<template>` tags because YouTube increasingly renders from templates — the fixture set should also include one template-stamped capture, and any card walk should not assume children are live DOM at observation time.
  Note (2026-08-13 live recon): `ytd-page-manager` retains hidden prior-route trees after SPA navigation, so shared surface resolvers must prefer connected, visible nodes under the active route instead of accepting the first selector match.

### Research-driven gaps — 2026-08-11

#### P1

(The former P1 item "Refresh expired caption tracks and expose transcript provenance" was verified fully implemented by `cc55df5f` on 2026-08-18 — every acceptance criterion traced to code and tests — and deleted per the roadmap workflow. Residual polish from that feature is logged in the 2026-08-18 audit section: fallbackReason overwrite, dead-URL double-fetch, and the i18n ratchet regression.)

#### P2

- [ ] P3 — Finish the transcript-index storage story: popup readout, backups, corruption recovery
  Status 2026-08-18: the reliability core shipped — a 64 MB byte budget alongside the 1,000-record cap, oldest-first eviction planned by a pure, unit-tested helper (`planTranscriptEviction`) and applied in the write path before a quota failure can occur, an `_stats()` readout (count, bytes, oldest/newest, `navigator.storage.estimate()`), and a localized usage line in the transcript search panel next to its Clear action. Stress test proves the worst case the record cap alone permitted (1,000 x 200,000 chars, ~400 MB) now stays under budget with nothing dropped from the accounting.
  Remaining: (a) the POPUP cannot show this — the index lives in a page-origin IndexedDB, so `chrome.storage.local` measurement will never include it and surfacing it needs a new content-script message channel; (b) the cap and index metadata are not yet included in settings backups; (c) a corrupted-store state offers Clear but no export-before-clear.
  Touches: `extension/popup.js`, `extension/background.js`, `extension/core/persisted-domains.js`, `extension/ytkit.js`
  Acceptance: the popup reports transcript-index count/bytes alongside extension-local bytes by asking an open YouTube tab (and degrades cleanly when none is open); backups carry the cap and index metadata; a corruption state offers export-then-clear rather than clear alone.
  Complexity: M

- [ ] P3 — `check:startup` reports a false regression when the machine is busy
  Category: reliability / tooling
  Where: `scripts/bench-startup.js` — the gate compares the MIN of 7 samples per surface against `baseline.metrics.parseInitMs.minMs + 25ms`.
  Problem: the minimum of a small sample is the statistic most sensitive to competing load, so a build or a second bench running alongside inflates it past the tolerance and the gate reports a startup regression that does not exist. Observed 2026-08-19: three consecutive runs on a loaded machine gave min 136-144 ms and failed; on the same commit with the machine idle, min 94-108 ms / median 113-116 ms, indistinguishable from the pre-drain tree (min 91-109 ms / median 114-118 ms). Roughly 40 minutes went into bisecting a regression that was never there.
  Evidence: the baseline itself records `minMs: 110.4` alongside `p95Ms: 142.4` from the same capture — the spread the gate treats as signal is already in the reference.
  Fix: compare the MEDIAN (the statistic the summary line already prints) against a median baseline, or keep the min comparison and re-run once before failing. Either way, print both statistics on failure so a reader can tell load from regression at a glance.
  Acceptance: a bench run under deliberate CPU load does not fail the gate on an unchanged tree; a synthetic +25 ms regression still fails it.
  Confidence: Verified (reproduced both directions on 2026-08-19)
  Effort: S

- [ ] P3 — `npm run smoke:a11y` dies on a CDP timeout roughly one run in three
  Why: the rendered accessibility lane is the only proof that surfaces survive 320px, forced colors, and 200% zoom, and it is unreliable enough that a red run is now assumed to be flake — which is exactly how a real failure gets waved through. Confirmed pre-existing: a clean stash of HEAD failed the same way (2026-08-18), so it is not caused by recent surface work.
  Evidence: `devtools call timed out: Emulation.setDeviceMetricsOverride` and `... Runtime.evaluate`, both on the `settings` surface (8 states, 411 focus visits — the heaviest lane). Also observed once: a sidepanel `.sp-skip-link` focus-indicator failure that did not reproduce.
  Touches: `scripts/smoke-headless-a11y.js`, `scripts/smoke-settings-overlay.js` (`DevtoolsClient`)
  Acceptance: ten consecutive runs pass. Either the per-call timeout is raised where the settings surface genuinely needs longer and the wait is made condition-based rather than fixed, or the surface is split so no single CDP call has to cover 411 focus visits. A timeout must name which surface and state it died in.
  Complexity: S

- [ ] P3 — Add a pseudo-locale long-string lane to the reflow smoke
  Status 2026-08-18: the reflow coverage shipped — `smoke-headless-a11y.js` now renders ALL SIX primary surfaces (popup, sidepanel, sidebar, settings, transcript, download) at exactly 320 CSS pixels in `ar`, `de` and `pt_BR`, checking document-level horizontal scrolling, clipped controls, and (on the surfaces Astra Deck owns) `lang`/`dir`. It found and fixed a real clip: the settings footer was one unwrappable row and pushed its Done button 13px off the panel edge — bait-verified.
  Remaining: the acceptance also asked for a generated long-string/pseudo-locale fixture. `npm run i18n:pseudolocale` exists (`scripts/generate-pseudolocale.js`) but its output is not wired into the smoke's staged `_locales`, so worst-case string length is not yet exercised.
  Touches: `scripts/smoke-headless-a11y.js`, `scripts/generate-pseudolocale.js`
  Acceptance: the smoke stages a generated pseudo-locale (accented, ~40% expanded) and renders every surface with it at 320 CSS pixels; failures name the clipped control.
  Complexity: S

- [ ] P3 — The i18n copy gate fingerprints `<style>.textContent` CSS as "UI copy", and `npm run check` is fail-fast
  Category: testing / maintainability
  Where: `scripts/check-localizable-ui-copy.js:88-124` (`collectJsLiterals` classifies a `styleEl.textContent = \`…css…\`` assignment as sink `assignment:textContent`); chain at `package.json` `scripts.check`.
  Problem: two systemic issues surfaced when the download-panel CSS edit tripped this gate (fixed in `9c29ae6f` by ratcheting): (1) the gate treats an entire `<style>` CSS blob assigned via `.textContent` as one localizable UI-copy literal, so every edit to `_playerBtnCSS` / the speed-popup / dl-popup stylesheet blocks in `ytkit.js` fails with a spurious "route new copy through locale keys" error and forces a baseline ratchet, even though no user-facing string changed; (2) because `check` is a single `&&` chain, one red gate hides every gate after it — when the copy gate was red, the 17 following gates (lint, `audit:a11y`, `audit:contrast`, `audit:light-theme`, `audit:deps`, `i18n:coverage:gate`, `generate-capability-matrix --check`, the Firefox checks, etc.) never ran via `npm run check` or `release:prepare`, so work shipped with them silently unexercised.
  Evidence: the digest changed 926→926 (count identical) purely from the CSS edit — diffing extracted `(sink,value)` pairs against `66b30e6f` showed the sole delta was the `_playerBtnCSS` block; the fail-fast chain behavior is inherent to `&&`.
  Fix: exclude `<style>`/`.textContent` CSS assignments from `collectJsLiterals` (a literal that is assigned to a `style` element or that parses as CSS is not UI copy); and make `check` run all gates and aggregate failures at the end (or split into independent jobs) so one red gate can't mask others.
  Acceptance: editing a CSS block in `ytkit.js` no longer trips the copy gate; a deliberately-untranslated `textContent` label still does; `npm run check` reports every failing gate in one run.
  Confidence: Verified
  Effort: M

- [ ] P3 — Userscript companion downloads ignore the user's quality/format and lack an in-progress guard
  Category: correctness
  Where: `YTKit.user.js:2316` (payload `{url, audioOnly}` only) vs. extension `index.js:1519-1524`; `YTKit.user.js:2259` (`ytKitDownload`, no `_downloadInProgress` guard) vs. extension `:1443-1448`.
  Problem: the userscript sends no `quality`/`format`, so companion downloads always use server defaults even though the userscript has a `downloadQuality` setting (it only affects the direct-stream fallback). And `ytKitDownload` has no in-progress guard, so double-clicks queue duplicate downloads.
  Evidence: compared payloads and guards across the two vehicles.
  Fix: mirror the extension payload (`quality`, `format` from settings) and add the `_downloadInProgress` guard.
  Acceptance: a userscript companion download honors the chosen quality/format; a double-click queues one download.
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

- [ ] P3 — Userscript duplicates RYD / SponsorBlock / DeArrow / player-handoff features on non-schema keys; bundled modules are never called
  Category: maintainability
  Where: `YTKit.user.js` hand-maintained copies — RYD `:8066` (key `returnYoutubeDislike`, canonical is `returnDislike`), SponsorBlock `:14508`, DeArrow `:14788`/`:14922`; provider/handoff keys `replaceWithCobaltDownloader` `:5783`, `downloadProvider` `:5892`, and seven player-handoff keys (`showVlcButton :6708`, `showMp3DownloadButton :6784`, `showVlcQueueButton :13057`, `showMpvButton :13087`, `preferredMediaPlayer :13163`, `showDownloadPlayButton :13180`, `subsVlcPlaylist :13209`).
  Problem: `YTKit.user.js:167-169` declare the peeled `return-dislike`/`sponsorblock`/`dearrow` modules as bundled and `YTKit-core.user.js` exports their factories, but `YTKit.user.js` calls **none** of them (only `createUserscriptAiSummaryFeature` of the four is wired). The hand-maintained duplicates run instead — with no cache, no rate budget, no `ExternalApiHealth`, and keyed on settings that don't exist in `extension/core/settings-schema.js` (the schema collapsed the handoff surface to `vlcMpvHandoff` + `showLocalDownloadButton`). So userscript users get an inferior second implementation and a pile of settings the extension retired.
  Evidence: 0 call sites for the bundled factories; the listed keys have 0 occurrences under `extension/`.
  Fix: wire the userscript to the bundled feature factories (as it already does for `stickyChat`/`subtitles`/`themeCss`) and delete the hand-maintained duplicates and their retired keys, or explicitly document why the userscript keeps a separate implementation.
  Acceptance: the userscript RYD/SponsorBlock/DeArrow paths run the bundled modules (honoring the schema keys), and the non-schema handoff keys are removed or documented.
  Confidence: Verified (High)
  Effort: L

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
  Where: (a) `extension/features/settings-panel/index.js` — the `_panelCleanups` registry has zero `.push(...)` sites anywhere (`ytkit.js:1719`+`:48118-48125`, `settings-panel/index.js:82`+`:254-261` only drain it), and the same file attaches six anonymous `document`-level listeners (`:3169,:3174,:3201,:3390,:3542,:3786`) with no `removeEventListener` and no `destroy()` export; (b) three dead `YTKitCore` aliases — `core/data-flow.js:527` `findDataFlowCoverageGaps`, `core/settings-sync.js:909` `settingsSync`, `core/browser-api.js:121` `resolveBrowserNamespace` (each shadowed by the live export the callers actually use); (c) two dead regex alternates `uiStyleManager`/`colorThemeManager` in `core/settings-visual-system.js:47` (they are element ids, not schema keys, so the branch never fires); (d) unused CSS `.sp-storage-card` (`sidepanel.css:1106`, no creation site).
  Problem: inert code that misleads maintainers — the `_panelCleanups` registry promises centralized teardown that does nothing (no leak today, but the next panel-widget author will trust it and leak), the settings panel cannot be torn down, and the dead keys/aliases/CSS invite false assumptions.
  Evidence: grep-verified zero consumers for each; the `_panelCleanups` drains iterate an empty array.
  Fix: delete the dead aliases, regex alternates, and `.sp-storage-card`; either wire real registrations into `_panelCleanups` and give the settings panel a `destroy()` (named handlers) or remove the empty registry + its MutationObserver.
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

## Audit Findings — 2026-08-18

Baseline at audit time (local tree = origin/main + 4 unpushed commits `d1b332ae..2b839c33`, v4.62.0; `npm ci` was required first — node_modules was absent on this machine after the OS rebuild): `npm test` **1713/1714 pass** (1 skipped, 0 fail). `npm run check` fails at HEAD on four gates: `check:project-facts` (the machine-local CLAUDE.md generated block was stale at v4.61.0 — regenerated during this audit, passes now; while red it masked the 24 gates after it via the tracked fail-fast `&&` chain), `check:startup` (firstFeaturePaintMs median 116.80 ms > 88.80 ms budget, fixture mode captured-mhtml — pre-existing machine-sensitive baseline, already tracked), `i18n:coverage:gate` and `generate-capability-matrix --check` (both logged below). Rendered smokes pass: settings-overlay 7 states × 445 controls (dark/light/RTL/wide/tablet/mobile), headless-a11y 6 surfaces incl. 200% reflow and forced colors. Delivery state: latest git tag and GitHub release are **v4.59.1**; `release-channels.json` still points every channel at 4.59.0 — see the release-gate item below and the refreshed P0 in `Roadmap_Blocked.md`. Method: five parallel trace-and-verify sweeps (post-08-14 delta, popup/sidepanel UX, background trust boundaries, monolith feature slices incl. peeled-copy drift, tests/gates/release); ~40 candidate findings, 14 re-verified by hand at file:line with zero mismatches; agent-cleared suspicions are omitted. The background trust-boundary sweep found **no high/critical issue** — cookie-handoff capability, remote filter-list sanitization, DNR rules, and optional-host validation all hold as documented.

### P2

- [ ] P3 — Subscription Groups: confirm-dialog matcher can click Cancel and still record success; 1000-cap silently drops the just-added channel; no way to rename or delete a group
  Category: correctness / ux
  Where: `_confirmUnsubscribeDialog` selector `'#confirm-button, button[aria-label], [role="button"]'` takes the first document-order match — `extension/ytkit.js:43809-43826`, `features/subscription-groups/index.js:1479-1496`; staged record deleted on "success" `index.js:1624-1627`. Cap: `_setGroupMembership` appends then `slice(0, 1000)` — `index.js:2546-2560` — dropping the just-added channel while toasting "added". Product gap: group rename/delete/reorder exists in NO copy; the only way to remove a group is Shift+click replace-import.
  Problem: in dialog variants without `#confirm-button`, the first `[role="button"]` is typically Cancel — the helper clicks it, returns true, the 30-day staging record is deleted, and a still-subscribed channel is logged as unsubscribed. The cap bug turns a hard limit into silent data drop with false success feedback.
  Evidence: selectors and cap logic read in both copies; absence of rename/delete verified by control enumeration.
  Fix: match the confirm button by accessible label/test, never bare `[role="button"]`; at the cap, refuse the add with an explanatory toast instead of slicing; add minimal rename + delete controls to the group editor (both copies + `sync-userscript.js`).
  Acceptance: a cancel-first dialog leaves the staging record intact; adding channel 1001 toasts a refusal and membership is unchanged; a group can be renamed and deleted from the editor.
  Confidence: dialog Likely (needs a cancel-first fixture), cap + product gap Verified
  Effort: M

- [ ] P3 — Transcript refresh polish: error-path diagnostics discard the refresh outcome, and a known-dead caption URL is fetched twice before refreshing
  Category: correctness / perf
  Where: `extension/core/transcript-service.js:440-448` (thrown-error diagnostic hardcodes `fallbackReason: allowDomFallback ? 'panel-unavailable' : 'dom-disabled'`, overwriting `'refresh-discovery-failed'`/`'refresh-fetch-failed'` set at `:399,:421`); `:912-937` (`_fetchTranscriptContent` format loop: on a 403/404 for json3 it still fetches the SAME URL as xml before throwing)
  Problem: (1) exactly the case provenance was built to explain — "we tried a refresh and it failed" — never reaches `getDiagnostics()`/DiagnosticLog. (2) A revoked-but-unexpired URL costs two wasted round-trips of latency per refresh (the expired-`expire`-param case is correctly pre-skipped at `:365`).
  Evidence: both read by hand; verified the hardcoded overwrite at `:447`.
  Fix: `fallbackReason: fallbackReason || (allowDomFallback ? 'panel-unavailable' : 'dom-disabled')`; and `if (status === 403 || status === 404) break;` out of the format loop.
  Acceptance: a failed-refresh + no-panel scenario reports `refresh-fetch-failed` in diagnostics; a 403 track fetch issues exactly one request before rediscovery; tests cover both.
  Confidence: Verified
  Effort: S

- [ ] P3 — Settings-reference generator escapes `|` only in the Purpose cell — a future value containing a pipe silently truncates its README table row
  Category: docs / maintainability
  Where: `scripts/generate-settings-reference.js:165-169` (`escapeCell` used only at `:236`); `formatConstraints`/`formatBehavior`/title go through `code()`/`escapeHtml`, which do not escape `|`
  Problem: latent today (no current value contains `|`), but the `--check` gate would PASS on the broken output since generator and README agree. An enum value or feature name with a pipe breaks the table silently.
  Evidence: escape call sites enumerated.
  Fix: run every cell through `escapeCell` after HTML formatting; add a generator unit test with a pipe-bearing fixture entry.
  Acceptance: a pipe-bearing value renders escaped; the fixture test pins it.
  Confidence: Verified (latent)
  Effort: S

- [ ] P3 — Newest source-pin tests carry three latent vacuous windows
  Category: testing
  Where: (a) `tests/ai-credential-custody.test.js:52-53` — the slice's end needle `indexOf("…SUMMARY_REQUEST'")` is searched from 0, not from the start index: if dispatch reorder puts SUMMARY_REQUEST before CREDENTIAL_STATUS the slice is empty and `doesNotMatch` passes vacuously (the sibling `_callLLM`/`_run` slices pass a fromIndex; `tests/youtube-state-reset.test.js:170-172` shows the correct pattern); (b) `tests/hardening.test.js` `.so-key-select` pin asserts only that the selector STRING appears in popup.css — an empty rule or a comment passes (the text/color variants pin a declaration); (c) `tests/popup-fixes.test.js` finite-select refocus pin matches `select[data-key="${esc}"]` at global scope — unique at HEAD, but survives the refocus helper losing its select branch if the string appears anywhere else.
  Problem: all three are non-vacuous at HEAD but in the exact `gotcha-checks-that-always-pass` family the 22c60972 commit was draining.
  Evidence: (a) verified by hand at `:52-53`; (b)(c) verified by the tests sweep against current file content.
  Fix: (a) pass the start index as fromIndex + assert end > start; (b) pin one load-bearing declaration inside the block; (c) scope the match to the extracted refocus-helper slice.
  Acceptance: each pin fails under its bait (reorder / empty rule / moved string) and passes at HEAD.
  Confidence: Verified
  Effort: S

- [ ] P3 — Backfill real render assertions onto the features whose DOM half was never covered
  Category: testing
  Where: `tests/features/watch-later-workbench.test.js` (the feature has 26 `appendChild`, 2 `replaceChildren`, and an `isConnected` guard; the test references none of them); same shape for other `loadFeature`-hosted features whose tests exercise only pure helpers
  Problem: the shared helper's DOM no-ops were fixed on 2026-08-18 (`appendChild`/`replaceChildren` attach, `remove`/`insertBefore` exist, `className` reflects, `isConnected` defaults true, `matches` evaluates class/id/attribute selectors and throws on combinators), so render assertions are now POSSIBLE — but the existing tests still assert only source shape for the render half, which is why a broken render path can still pass.
  Evidence: the helper rewrite landed with the timestampBookmarks regression test as its first consumer (bait-verified); the remaining feature tests were not revisited.
  Fix: for each `loadFeature` test that covers a UI-building feature, assert on the built tree (`children`, `textContent`, class state) rather than on source text; delete the source pins those assertions replace.
  Acceptance: at least the watch-later-workbench, transcript-viewer, and subscription-groups render paths assert on real built nodes; a bait (render into the wrong node) fails.
  Confidence: Verified
  Effort: M

- [ ] P3 — Nothing gates release staleness: `chore(release)` commits ship with no tag, no channel promotion, and every gate stays green
  Category: process / testing
  Where: `release-channels.json` (all five channels: active=4.59.0, lastKnownGood=4.59.0, rollbackTarget=4.58.2) vs product version 4.62.0; `scripts/check-versions.js:153-170` tag-sanity only asserts no tag sorts AHEAD of the product version and has zero coverage of release-channels.json (grep-verified)
  Problem: v4.60.0, v4.61.0, and v4.62.0 each have a release commit but no tag, no artifacts, no promotion — and even tagged v4.59.1 was never promoted. A release commit that never ships passes every gate silently. (The publication act itself is maintainer-local and stays in `Roadmap_Blocked.md` — this item is the missing gate.)
  Evidence: `git tag` + `gh release list` + release-channels.json read 2026-08-18.
  Fix: extend check-versions (or a `release:channels validate` lane) to warn/fail when HEAD's product version has a `chore(release)` commit but no matching tag, and to report channel-pointer lag against the newest tag explicitly.
  Acceptance: at current HEAD the new lane reports the 3-version lag; after a properly tagged+promoted release it passes.
  Confidence: Verified
  Effort: S

- [ ] P3 — npm-chain flag forwarding silently swallows `--bump`/`--profile`/`--crx-key`, and `capture:surface` duplicates `capture:watch`
  Category: process
  Where: `package.json:16-18` — `npm run build -- --bump patch` appends the flags to the LAST command of the `&&` chain (`generate-capability-matrix.js`, which ignores them), so `build-extension.js` runs with no bump and default `--profile both`, exit 0, silently wrong (the documented `--no-crx` instance of this trap got a dedicated script + `ASTRA_SKIP_CRX` env escape; bump/profile/key have none). `package.json:45-46` — `capture:watch` and `capture:surface` are byte-identical entries.
  Evidence: npm arg-forwarding semantics + chain shape; script entries read.
  Fix: add env-var equivalents in build-extension.js (it already reads `ASTRA_SKIP_CRX`) or restructure so `node build-extension.js` is the chain's last command; give `capture:surface` its intended argument or delete the alias.
  Acceptance: `npm run build -- --bump patch` either bumps or fails loudly; no byte-identical script aliases remain.
  Confidence: Verified
  Effort: S

- [ ] P3 — Mobile settings panel clips setting descriptions mid-glyph instead of ellipsizing
  Category: visual
  Where: `extension/core/settings-visual-system.js:1513-1519` — the mobile lane switches `.ytkit-feature-desc` to `display:-webkit-box` + `-webkit-line-clamp:2` (inheriting `overflow:hidden` from the base rule at `:851-855`)
  Problem: observed in the shipped smoke render (`build/settings-overlay-smoke/mobile-light.png`, Codec Selector card): the description paints ~2.5 lines with the third line sheared horizontally mid-glyph behind the select control — no ellipsis, unreadable fragment. The smoke's "readable primary controls" assertion doesn't cover description overflow, so it passes.
  Evidence: rendered PNG reviewed by hand 2026-08-18; CSS lane read.
  Fix: verify the clamp interaction in the panel probe (the box height is not collapsing to the clamp — likely the `!important` `display` fight with the base `display:block`); either make the clamp lane self-consistent (`display:-webkit-box; overflow:hidden; -webkit-box-orient:vertical` together, no competing height) or drop the clamp on mobile and let descriptions wrap fully; add a description-overflow check to the mobile smoke states.
  Acceptance: the mobile render shows either a clean 2-line ellipsis or full wrapped text — no sheared glyphs; the smoke asserts it.
  Confidence: Verified (observed); root-cause mechanism Needs-repro in the probe
  Effort: S

- [ ] P3 — Popup feedback gaps: "Open Full Settings" gives no busy state and can open duplicate tabs; the external-health empty state is unstyled; copy-status live regions never clear
  Category: ux / visual
  Where: (a) `extension/popup.js:6386-6400` — the click handler never sets `disabled`/`aria-busy` during the up-to-8 s `sendPanelOpenMessage` ack window (`:1751-1771`), and each extra click can fall through to `ext.tabs.create('https://www.youtube.com/')` → duplicate tabs; `#openSidePanel` (`:6409`) has the same unguarded shape; (b) `popup.js:2743` creates `li.className='external-health-empty'` but popup.css styles only `.selector-health-empty` (`:1167`) and `.feature-perf-empty` (`:1332`) — the third dashboard's empty state renders as a plain default list item; (c) `popup.js:2635/2653` and `:2838/2851` write "Copied…" into aria-live regions with no auto-clear (unlike `showStatus` `:1571-1577`), so stale "Copied" lines persist for the popup's lifetime and can coexist.
  Evidence: all traced by the UX sweep; every OTHER async action in the file was confirmed to carry disable+aria-busy (cleared list), making these the only stragglers.
  Fix: (a) `disabled` + `aria-busy` for the flight on both CTAs; (b) add `.external-health-empty` to the shared empty-state rule; (c) clear the copy-status lines after ~4 s like the status banner.
  Acceptance: double-clicking Open Full Settings opens at most one tab and the button shows busy; the empty state matches its siblings in both render states; "Copied" clears itself. Rendered popup smoke re-checked.
  Confidence: Verified
  Effort: S

- [ ] P3 — Popup speaks raw camelCase setting keys in toasts and accessible names, against its own labeling policy
  Category: a11y / ux
  Where: `extension/popup.js:3950-3955` (`schemaResetTitleTpl`/`schemaResetAriaTpl` interpolate `entry.key`), `:3963` (toast "customProgressBarColor reset to default."), `:3618/:3652` (`formatSettingWriteError(entry.key, …)`), while `:3764` passes `entry.labelKey || entry.key` and the row label deliberately humanizes (`:3499-3503`, with an in-code comment about voice-control targeting)
  Problem: the reset button's accessible name and three status paths contradict the popup's own humanized-label policy; three call sites disagree on which name to use, so voice-control users and toast readers get names that match nothing on screen.
  Evidence: call sites compared by the UX sweep.
  Fix: pass the resolved visible label everywhere; keep the raw key in the title/tooltip only.
  Acceptance: reset toast/aria-name show the humanized label; a test asserts label parity across the three sites.
  Confidence: Verified
  Effort: S

- [ ] P3 — Microcopy consistency batch (popup + sidepanel)
  Category: ux / docs
  Where: (a) `extension/popup.js:4965` vs `:5257` — one key `filterListStatusRefreshFail` serves two different failures; the service-unavailable branch tells users to "Check the address, then try again" when the address is fine and retrying cannot help; (b) `popup.html:85` "Skip - configure manually" uses a hyphen where the surface's style is an em dash; (c) the same destination is named "Open Full Settings", "the full workspace", and "Settings workspace" across `openFullSettings`/`contextNoteInlinePanel`/`workspaceEyebrow`; (d) `popup.js:1138/1151` directs users to "Settings Overview" while the section is titled "Settings overview"; (e) `sidepanel.js:715` renders "Unavailable" where sibling placeholders are `'--'`/`'-'` (`:714`, `sidepanel.html:47`).
  Problem: each is small; together they read as inattention on the primary surfaces. Same class as the tracked `statusImportSnapshotFail` drift, different keys.
  Evidence: all verified by the UX sweep at the cited lines.
  Fix: give the `:4965` branch its own key (`filterListStatusStateReadFail`) with cause-accurate copy; fix the dash; pick one workspace noun; match the section title's case; unify placeholders. Locale keys via the documented recipe (11 locales).
  Acceptance: each cited string matches its surface's convention; `npm run check` i18n gates stay green after the baseline ratchets.
  Confidence: Verified
  Effort: S

## Research-Driven Additions — 2026-08-19

Evidence detail and sources live in `RESEARCH.md` (2026-08-19). Items already tracked above or in `Roadmap_Blocked.md` (distribution/publication, migration docs, supply-chain doc, SponsorBlock/DeArrow submission) are not duplicated; the MV2-purge adoption window (uBO leaves CWS 2026-08-31) makes the blocked distribution items time-sensitive but does not change their operator-gated status.

- [ ] P3 — Stage-aware anti-adblock detection diagnostics
  Why: YouTube's degradation ladder is now stage-documented (repeated ads → throttling/injected delays → autoplay stops → videos refuse to load), and users blame the extension, not YouTube — the ABP 5.17 incident shows a slowdown reads as "the blocker broke my YouTube." Recognizing the stage and explaining it converts a trust-breaker into a trust-builder.
  Evidence: RESEARCH.md §Security (emarketer 2026-01-08 FAQ, cybernews 2026-08 tests, tomsguide ABP incident); vault 2026-08-15 note (stop/start loop attributed to aggressive quick-fixes rules, not YouTube punishment).
  Touches: `extension/core/feature-health.js` or a small detector module, `extension/popup.js` (feature-health surface), `extension/core/settings-schema.js`, locales
  Acceptance: when a ladder stage's observable signature fires (e.g. playback-blocked enforcement dialog present, repeated unskippable pre-rolls despite DNR), the feature-health surface names the stage in plain language and offers a one-click "pause zero-ads for this session" that auto-restores (timed pause survives worker eviction — the Ghostery `revokeAt` alarm pattern); no stage is auto-acted on; detection is structural, never auto-dismissing any dialog.
  Complexity: M

- [ ] P3 — Per-surface enable masks for API-heavy features
  Why: DeArrow's own top complaint thread is performance, and its most-requested mitigation is per-surface disabling (issue #92 disable-on-playlists, active 2026-08-16). Astra's attribution layer already records per-surface outcomes, so surface-granular enablement is the natural next use of that data — and a competitive answer no upstream ships.
  Evidence: RESEARCH.md §Competitive (DeArrow #92, #423); `extension/core/selectors.js` `withSelectorAttribution` surface recording.
  Touches: `extension/core/settings-schema.js` (per-surface mask entries for dearrow/sponsorblock/returnDislike class features), feature modules' rule registration, settings panel rendering, locales
  Acceptance: at least DeArrow can be scoped to exclude chosen surfaces (e.g. playlists) without disabling globally; the mask is honored at rule-registration level (no fetch fired for excluded surfaces, not just no render); default masks unchanged (all surfaces on).
  Complexity: M

- [ ] P3 — Transcript "export for LLM" preset
  Why: transcript-to-LLM workflows are a live differentiator (YouTube Alchemy v11.11, 2026-08-08, ships channel/collaborator-aware transcript exports); Astra already has the transcript viewer, IndexedDB search, and copy actions — a formatted export (title, URL, chapters, timestamped text) is a small addition squarely inside the research persona.
  Evidence: RESEARCH.md §Competitive (TimMacy/YouTubeAlchemy).
  Touches: `extension/core/transcript-service.js` consumers in `extension/ytkit.js` (transcript panel actions), locales
  Acceptance: the transcript panel offers a one-click copy/download of a structured plain-text/Markdown export (video title, canonical URL, chapter headings, timestamped lines) suitable for pasting into an LLM/NotebookLM; works from the already-fetched transcript with no new network; respects the existing provenance labels (stale/cached text stays labeled in the export).
  Complexity: S

- [ ] P3 — Opt-in background-tab energy tamer
  Why: "YouTube CPU Tamer" holds 57k Greasy Fork installs on this demand alone, and idle-CPU complaints are ImprovedTube's recurring uninstall reason. Astra has a steady-state budget gate but no user-facing energy mode.
  Evidence: RESEARCH.md §Competitive (Greasy Fork top-installs profile); `npm run check:steady-state` (existing budget machinery as the verification harness).
  Touches: MAIN-world module (timer/rAF coalescing while `document.hidden`), `extension/ytkit-main.js` bridge, settings schema/locales
  Acceptance: with the feature on and the tab hidden, timer/rAF churn drops measurably (steady-state bench comparison recorded before/after); playback, live chat, and background audio are exempted and verified unaffected; feature is off by default and classified for the userscript honestly.
  Complexity: M

- [ ] P3 — Verify the toolchain on Node 24 before Node 22 goes maintenance
  Why: Node 22 (the `engines` floor) enters Maintenance in October 2026 (EOL 2027-04-30); CVE-2026-21717 is fixed in 22.22.2. The move is cheap now and forced later.
  Evidence: RESEARCH.md §Security (nodejs.org/en/about/eol).
  Touches: `package.json` engines, CLAUDE.md build notes
  Acceptance: `npm test` + `npm run check` + a no-CRX build pass on Node 24 with any incompatibilities fixed; the build machine runs ≥22.22.2 meanwhile; engines raised only when 24 is verified.
  Complexity: S

Note (belongs to the 2026-08-18 audit section above) — extends the existing P3 item "Userscript duplicates RYD / SponsorBlock / DeArrow / player-handoff features on non-schema keys; bundled modules are never called": the 2026-08-18 monolith sweep verified twelve concrete divergences the hand-maintained userscript copies carry versus the extension pair (which are line-for-line identical for SponsorBlock/DeArrow): DeArrow never processes watch pages (`YTKit.user.js:14830-14843` pathname gate) so the related rail — its main target — is untouched; sentence-case renders "THe truth about x" (`:14904` operates on `slice(1)`); a DeArrow 404 yields null instead of empty branding so `daFallbackFormat` never fires (`:14857-14875`); SB drops `[t,t]` `poi_highlight` markers (`:14518`); the SB cache ignores which categories it was fetched for (`:14527-14547`); DeArrow cache has no in-session TTL and "No cache" hydrates 24 h of entries (`:14788,:14846`); the thumbnail path lacks the extension's three guards (videoId pattern, timestamp finiteness, lazy-img deferral; `:14955-14987`); SB lacks skip-timing jitter, stale-cache API-outage fallback, and the progress-bar rebuild observer (declared `:14462`, never armed); perChannelSpeed lacks BOTH extension fixes (untagged programmatic writes `:8285,:8314`; navigate-save reads current DOM `:8308-8309`); hideWatchedVideos still uses the once-marker the extension removed for recycled nodes (`:8336-8338`); Subscription Groups is the oldest third copy (silent full-replace import with no undo `:13589-13626`, no `_sessionLastVisit`, default true vs schema false `:2966`) while the modern factory bundled at `YTKit-core.user.js:24286` has zero call sites — the stickyChat/subtitles/themeCss factories show the wiring pattern to follow. This strengthens that item's case: wire the bundled factories rather than patching twelve divergences one at a time.
