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
  Note (2026-08-20 verification): current baseline is **934 across 2 files** (932 ytkit.js, strictCount 335) — the v4.71–4.76 feature work added a few grandfathered literals. The item stands.

- [ ] P3 — Start burning down the 277 light-theme-blind surfaces
  Why: the gate accepts 277 legacy surfaces against 89 that carry a light lane, so YouTube light-theme users still meet near-white text on near-white backgrounds on surfaces nothing flags.
  Evidence: `npm run audit:light-theme` reports 89 covered / 277 accepted; `scripts/light-theme-baseline.json`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `scripts/light-theme-baseline.json`
  Acceptance: the accepted count only ever decreases; default-ON surfaces are cleared first; a light-fixture render lane confirms the fixes rather than a source-text rule.
  Complexity: L
  Note (2026-08-20 verification): current baseline is **254 accepted / 136 covered** — coverage grew 15 surfaces during the v4.71–4.76 peel work (video-notes light-theme restoration among them). The item stands.
  Note (2026-08-11 research): current gate output is **253 accepted / 121 covered**, not 277/89. Also note the gate's `SOURCES` list (`scripts/check-light-theme-lane.js:34-39`) excludes all of `extension/core/*.js` even though those modules inject CSS, and `extension/live-chat.css` has zero `html:not([dark])` rules while restyling ~50 chat selectors — so the true uncovered set is larger than 253.
  Note (2026-08-20, root cause found and cleared before burning anything down): the blocker under this item is gone. It was never really the 254 surfaces — it was that the palette did not exist. The `:root` block lived inside `injectPanelStyles()`, which runs only on the first settings-panel open, so on a normal pageview no `--ytkit-*` token existed and every surface painted the fallback literal beside it. Twenty tokens were also referenced under names nothing declared. Both are fixed: the palette is injected at bootstrap, the phantom names are defined or split, and the palette carries an `html:not([dark])` lane for the first time. A light lane is now reachable from the palette, so this item is a palette edit plus per-surface tokenisation rather than 254 hand-written rules.
  Two things to carry into the burndown, both learned the hard way here. **First, some of the accepted list are gate false positives** — `ytkit-video-hide-btn` and the blocked-watch dialog paint light text on their OWN opaque dark ground and read correctly on either theme, so adding `html:not([dark])` rules to satisfy a source-text regex would be theatre. That is what this item's third acceptance clause (a render lane, not a source rule) guards against. **Second, some of the "covered" list never worked.** `.ytkit-hidden-note` and `.ytkit-video-hidden-placeholder` had light lanes that resolved `--ytkit-text-secondary` and `--ytkit-border` to their dark-only palette values, so the light colours written beside them could never apply — the note's body text would have landed at about 2.03:1 against the light-theme page instead of the intended 4.99:1. Both now use `--ytkit-card-*`, which is relit in the palette's light lane. Assume neither list is trustworthy without rendering the surface.
  Note (2026-08-20, naming): the split to reuse is by what a surface sits on, not by how it looks. `--ytkit-card-*` for surfaces embedded in YouTube's own layout (relit on light theme); `--ytkit-overlay-*` for Astra's own opaque dark overlays (deliberately not relit — relighting the ground while the text stays near-white is the exact defect the gate exists for). `tests/ytkit-token-definitions.test.js` pins that only the card family appears in the light lane.

- [ ] P3 — Teach the light-theme gate to see tokenised colours
  Why: `scripts/check-light-theme-lane.js` flags a surface only when the rule contains a literal near-white `color:` value. A rule that says `color: var(--ytkit-card-text)` is invisible to it — neither flagged nor verified — so the burndown item above can be "completed" by tokenising a surface without ever giving the token a light lane, and the gate would applaud. This is the same class as the two blind spots already found: it accepts a light-lane rule that cannot take effect, and it flags surfaces that provide their own dark ground.
  Evidence: `NEAR_WHITE` and `COLOR_DECL` in `scripts/check-light-theme-lane.js:66-78` match literal values only; the palette light lane added 2026-08-20 (`extension/ytkit.js`, the `html:not([dark])` block after `:root`) is the first thing a token could resolve through, and nothing checks that a token used in a light lane actually has a light value.
  Touches: `scripts/check-light-theme-lane.js`, `scripts/light-theme-baseline.json`
  Acceptance: the gate resolves `--ytkit-*` references against the palette's two lanes before judging a colour, so a near-white token counts as near-white and a token with no light-lane value used inside `html:not([dark])` is reported; the baseline is re-derived once and the accepted count still only decreases afterwards.
  Complexity: M

## Audit Findings — 2026-08-10

Baseline at audit time (working tree = HEAD a61ce0d7 + uncommitted v4.58.3–v4.58.6 work): `npm test` 1514/1514 pass. `npm run check` FAILS at `i18n:copy:gate` (new, from the uncommitted work — item below). Pre-existing baseline failures, already tracked, not re-logged: `audit:deps` (web-ext → addons-linter → image-size advisories; tracked P1 above) and `i18n:coverage:gate` (every locale 16 placeholder-identical keys over baseline, from fa3ebfdd). One `lint` failure during a loaded parallel run did not reproduce on a clean re-run — machine load, not a defect. All other gates pass at the working tree.

- [ ] P3 — Burn down the raw hex literals in popup.css and sidepanel.css
  Category: maintainability / visual
  Why: the token-source half of the old three-token-systems item is done (2026-08-20), but colour literals outside `:root` still bypass the palette entirely, so a theme change silently misses them. They are also where the next drift will start now that duplicate token declarations are gated.
  Evidence: 85 raw hex uses (29 distinct) in `extension/popup.css` and 22 uses (15 distinct) in `extension/sidepanel.css`, all outside the `:root` block.
  Touches: `extension/popup.css`, `extension/sidepanel.css`, `extension/surface-system.css`
  Acceptance: each literal either resolves to an existing `--astra-*` token or gains one in surface-system.css; `npm run audit:contrast` reports the same ratios and `npm run smoke:a11y` still passes; the count only decreases.
  Confidence: Verified
  Effort: M
  Analysis (2026-08-20, before starting): **not one of the 44 distinct literals exactly equals a palette value**, so there is no mechanical swap to make and this cannot be done as a find-and-replace. It splits into three real groups.
    (a) Near-misses of a palette value. Read the call site before assuming these are substitutable, because most are not: five of the seven `#f4f6fb` uses are the FALLBACK arm of `var(--text-primary, #f4f6fb)`, which is a defensive default rather than a colour use, and replacing it with another `var()` is pointless — the useful fix there is correcting the stale fallback literal to `#f4f6fa` so it matches the token it stands in for. All five `#ff5f4a` uses are the second stop of `linear-gradient(135deg, #ff8a64 0%, #ff5f4a 100%)`, and its partner `#ff8a64` has no palette equivalent, so the gradient needs a paired brand token (`--astra-accent-gradient-*`) rather than a one-sided swap. That leaves exactly ONE clean direct substitution in the whole set: `popup.css:3144 color: #6aa9ff` to the info token. Not worth its own commit; fold it into whichever group actually gets done.
    (b) A tint/shade family the palette has no answer for: `#ffd9a8` (18 uses), `#ff8585` (13), `#ffb84d` (9), `#ffd0d0`/`#ffb4b4`/`#ffd1d1`/`#ffdde0`/`#ffe6e9`/`#ffe0e4` and friends. These are per-state washes over the semantic colours. The fix is to decide the tint scale first (for example `--astra-error-100/200/300`) and add it to surface-system.css; swapping them one at a time just moves literals into a bigger palette.
    (c) One-offs that may be genuinely page-local (`#0d1117`, `#b889ff`, `#c8a6ff`, `#ffffff`).
    Do (a) as its own commit with the contrast ratios quoted before and after. Do NOT start (b) without deciding the tint scale, or the palette doubles in size for no gain.
  Note (2026-08-20): the parallel-token-systems half is closed. popup.html and sidepanel.html load their page sheet first and `surface-system.css` second, so the 32 popup and 28 sidepanel `:root` declarations were overridden before paint — and all 60 held a different value from the one that shipped (`--radius-md` said 12px while 10px rendered; a documented AA fix on `--text-subtle` was inert from the day it was written). They are deleted and `tests/css-token-source.test.js` fails if a duplicate returns. A `hardening.test.js` pin had encoded the duplicate as the contract by asserting sidepanel.css *declares* `--focus-ring`; it now asserts the page *uses* `var(--focus-ring)`.

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
  Note (2026-08-20 research): two cheap additions to this item's acceptance. (a) Key selector-health records to YouTube's build (`INNERTUBE_CLIENT_VERSION` — already read by `core/transcript-service.js`, nowhere else) so drift correlates with a specific YouTube deploy; (b) a startup canary that resolves N critical surfaces and, on aggregate failure, raises one user-visible "YouTube changed — features X/Y degraded" notice instead of silent per-feature no-ops. `core/selector-health.js` currently has telemetry but no canary and no version keying (verified). Technique precedent: apiserpent.com/blog/resilient-scraper-selector-drift.

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

- [ ] P3 — Userscript duplicates RYD / SponsorBlock / DeArrow / player-handoff features on non-schema keys; bundled modules are never called
  Category: maintainability
  Where: `YTKit.user.js` hand-maintained copies — RYD `:8066` (key `returnYoutubeDislike`, canonical is `returnDislike`), SponsorBlock `:14508`, DeArrow `:14788`/`:14922`; provider/handoff keys `replaceWithCobaltDownloader` `:5783`, `downloadProvider` `:5892`, and seven player-handoff keys (`showVlcButton :6708`, `showMp3DownloadButton :6784`, `showVlcQueueButton :13057`, `showMpvButton :13087`, `preferredMediaPlayer :13163`, `showDownloadPlayButton :13180`, `subsVlcPlaylist :13209`).
  Problem: `YTKit.user.js:167-169` declare the peeled `return-dislike`/`sponsorblock`/`dearrow` modules as bundled and `YTKit-core.user.js` exports their factories, but `YTKit.user.js` calls **none** of them (only `createUserscriptAiSummaryFeature` of the four is wired). The hand-maintained duplicates run instead — with no cache, no rate budget, no `ExternalApiHealth`, and keyed on settings that don't exist in `extension/core/settings-schema.js` (the schema collapsed the handoff surface to `vlcMpvHandoff` + `showLocalDownloadButton`). So userscript users get an inferior second implementation and a pile of settings the extension retired.
  Evidence: 0 call sites for the bundled factories; the listed keys have 0 occurrences under `extension/`.
  Fix: wire the userscript to the bundled feature factories (as it already does for `stickyChat`/`subtitles`/`themeCss`) and delete the hand-maintained duplicates and their retired keys, or explicitly document why the userscript keeps a separate implementation.
  Acceptance: the userscript RYD/SponsorBlock/DeArrow paths run the bundled modules (honoring the schema keys), and the non-schema handoff keys are removed or documented.
  Confidence: Verified (High)
  Effort: L

## Audit Findings — 2026-08-18

Baseline at audit time (local tree = origin/main + 4 unpushed commits `d1b332ae..2b839c33`, v4.62.0; `npm ci` was required first — node_modules was absent on this machine after the OS rebuild): `npm test` **1713/1714 pass** (1 skipped, 0 fail). `npm run check` fails at HEAD on four gates: `check:project-facts` (the machine-local CLAUDE.md generated block was stale at v4.61.0 — regenerated during this audit, passes now; while red it masked the 24 gates after it via the tracked fail-fast `&&` chain), `check:startup` (firstFeaturePaintMs median 116.80 ms > 88.80 ms budget, fixture mode captured-mhtml — pre-existing machine-sensitive baseline, already tracked), `i18n:coverage:gate` and `generate-capability-matrix --check` (both logged below). Rendered smokes pass: settings-overlay 7 states × 445 controls (dark/light/RTL/wide/tablet/mobile), headless-a11y 6 surfaces incl. 200% reflow and forced colors. Delivery state: latest git tag and GitHub release are **v4.59.1**; `release-channels.json` still points every channel at 4.59.0 — see the release-gate item below and the refreshed P0 in `Roadmap_Blocked.md`. Method: five parallel trace-and-verify sweeps (post-08-14 delta, popup/sidepanel UX, background trust boundaries, monolith feature slices incl. peeled-copy drift, tests/gates/release); ~40 candidate findings, 14 re-verified by hand at file:line with zero mismatches; agent-cleared suspicions are omitted. The background trust-boundary sweep found **no high/critical issue** — cookie-handoff capability, remote filter-list sanitization, DNR rules, and optional-host validation all hold as documented.

### P2

- [ ] P3 — Backfill real render assertions onto the features whose DOM half was never covered
  Category: testing
  Where: `tests/features/watch-later-workbench.test.js` (the feature has 26 `appendChild`, 2 `replaceChildren`, and an `isConnected` guard; the test references none of them); same shape for other `loadFeature`-hosted features whose tests exercise only pure helpers
  Problem: the shared helper's DOM no-ops were fixed on 2026-08-18 (`appendChild`/`replaceChildren` attach, `remove`/`insertBefore` exist, `className` reflects, `isConnected` defaults true, `matches` evaluates class/id/attribute selectors and throws on combinators), so render assertions are now POSSIBLE — but the existing tests still assert only source shape for the render half, which is why a broken render path can still pass.
  Evidence: the helper rewrite landed with the timestampBookmarks regression test as its first consumer (bait-verified); the remaining feature tests were not revisited.
  Fix: for each `loadFeature` test that covers a UI-building feature, assert on the built tree (`children`, `textContent`, class state) rather than on source text; delete the source pins those assertions replace.
  Acceptance: every UI-building feature test asserts on real built nodes rather than source text, and each conversion is bait-verified by rendering into the wrong node.
  Confidence: Verified
  Effort: M
  Note (2026-08-20): the three surfaces the original acceptance named are done and bait-verified — watch-later-workbench recovery rows, transcript-viewer body states, and the subscription-groups empty-group notice. Two shared-helper gaps were fixed to make them possible and both had been silently falsifying render tests: `textContent = ''` did not clear children (so a renderer that stacks duplicates looked correct), and `insertAdjacentElement` did not exist (so a notice placed next to an anchor vanished). The item stays open for the remaining UI-building features.

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

- [ ] P3 — Opt-in background-tab energy tamer
  Why: "YouTube CPU Tamer" holds 57k Greasy Fork installs on this demand alone, and idle-CPU complaints are ImprovedTube's recurring uninstall reason. Astra has a steady-state budget gate but no user-facing energy mode.
  Evidence: RESEARCH.md §Competitive (Greasy Fork top-installs profile); `npm run check:steady-state` (existing budget machinery as the verification harness).
  Touches: MAIN-world module (timer/rAF coalescing while `document.hidden`), `extension/ytkit-main.js` bridge, settings schema/locales
  Acceptance: with the feature on and the tab hidden, timer/rAF churn drops measurably (steady-state bench comparison recorded before/after); playback, live chat, and background audio are exempted and verified unaffected; feature is off by default and classified for the userscript honestly.
  Complexity: M

Note (belongs to the 2026-08-18 audit section above) — extends the existing P3 item "Userscript duplicates RYD / SponsorBlock / DeArrow / player-handoff features on non-schema keys; bundled modules are never called": the 2026-08-18 monolith sweep verified twelve concrete divergences the hand-maintained userscript copies carry versus the extension pair (which are line-for-line identical for SponsorBlock/DeArrow): DeArrow never processes watch pages (`YTKit.user.js:14830-14843` pathname gate) so the related rail — its main target — is untouched; sentence-case renders "THe truth about x" (`:14904` operates on `slice(1)`); a DeArrow 404 yields null instead of empty branding so `daFallbackFormat` never fires (`:14857-14875`); SB drops `[t,t]` `poi_highlight` markers (`:14518`); the SB cache ignores which categories it was fetched for (`:14527-14547`); DeArrow cache has no in-session TTL and "No cache" hydrates 24 h of entries (`:14788,:14846`); the thumbnail path lacks the extension's three guards (videoId pattern, timestamp finiteness, lazy-img deferral; `:14955-14987`); SB lacks skip-timing jitter, stale-cache API-outage fallback, and the progress-bar rebuild observer (declared `:14462`, never armed); perChannelSpeed lacks BOTH extension fixes (untagged programmatic writes `:8285,:8314`; navigate-save reads current DOM `:8308-8309`); hideWatchedVideos still uses the once-marker the extension removed for recycled nodes (`:8336-8338`); Subscription Groups is the oldest third copy (silent full-replace import with no undo `:13589-13626`, no `_sessionLastVisit`, default true vs schema false `:2966`) while the modern factory bundled at `YTKit-core.user.js:24286` has zero call sites — the stickyChat/subtitles/themeCss factories show the wiring pattern to follow. This strengthens that item's case: wire the bundled factories rather than patching twelve divergences one at a time.

## Research-Driven Additions — 2026-08-20

Evidence detail and sources live in `RESEARCH.md` (2026-08-20). Items already tracked above or in `Roadmap_Blocked.md` (distribution/publication now including Edge, AI-surface hiding, DeArrow licensing, PO-token auto-provision, supply-chain doc) are not duplicated. Companion-repo actions (yt-dlp bump to 2026.08.19, minimum-version enforcement ≥2026.06.09) belong to SysAdminDoc/AstraDownloader and are recorded in RESEARCH.md as pointers.

- [ ] P3 — Per-group subscription-feed sorting
  Why: it is one of the last PocketTube premium features Astra does not undercut for free (nested subgroups, mark-as-watched, and group management already shipped); their $3.99/mo paywall and its review resentment make free parity a clear switch driver.
  Evidence: RESEARCH.md §Commercial (pockettube.io/pricing.html); `extension/features/subscription-groups/index.js` subgroup support verified.
  Touches: `extension/features/subscription-groups/index.js`, `extension/core/settings-schema.js`, locales
  Acceptance: within a group's feed view the user can sort by upload date, duration, or channel; the sort is remembered per group; no new network requests (sorts operate on already-rendered feed data); userscript classification decided honestly.
  Complexity: M

- [ ] P3 — Per-channel enable overrides for enrichment features
  Why: per-context override stacks are FrankerFaceZ's most-loved settings capability, and Astra already carries the substrate (`perChannelSpeed`, `perChannelIntroOutro`, `sbPerChannelProfiles`) — extending the same pattern to DeArrow and RYD (e.g. "never rewrite titles on this channel") answers real DeArrow complaints at a granularity the per-surface masks item does not cover.
  Evidence: RESEARCH.md §Adjacent (FrankerFaceZ profiles); existing per-channel keys in `extension/core/settings-schema.js` (verified); DeArrow #92/#423 complaint class.
  Touches: `extension/core/settings-schema.js`, `extension/features/dearrow/index.js`, RYD feature paths in `extension/ytkit.js`, settings panel, locales
  Acceptance: at least DeArrow honors a per-channel disable list at fetch level (no request fired for excluded channels); the override UI reuses the existing per-channel machinery's storage shape; defaults unchanged.
  Complexity: M

- [ ] P3 — Local transcript Q&A ("ask this video") on the existing AI provider stack
  Why: YouTube gates its flagship 2026 AI features ("Ask YouTube") behind Premium, and the demand is validated OSS-side (youtube-ai-extension, ~669★, watch-page chat panel over the transcript); Astra already has the transcript service, IndexedDB search, provider plumbing (BYO key / Chrome built-in / Ollama), and the AI-credential spend cap shipped in v4.71.0 — a Q&A panel is the natural next consumer and the strongest remaining leapfrog now that the element zapper shipped.
  Evidence: RESEARCH.md §Commercial (YouTube Premium 2026 AI set) and §Competitive (youtube-ai-extension); `extension/core/transcript-service.js`; Chrome Prompt API extensions-stable since 138.
  Touches: AI summary feature module and its provider layer, `extension/core/transcript-service.js` consumers, `extension/core/settings-schema.js`, settings panel, locales
  Acceptance: with a transcript loaded, the user can ask free-form questions answered from transcript content via their configured provider (works fully offline with Ollama or Chrome built-in); responses cite timestamps that seek on click; respects the existing per-tab spend cap and provider-origin grants; off by default; store-safe profile exclusion honored like the rest of the AI catalogue.
  Complexity: L
