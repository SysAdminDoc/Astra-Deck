# Roadmap - Astra Deck

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

- [ ] P2 — Force DVR on live streams
  Why: Streams with DVR disabled cannot rewind; a MAIN-world player-response interceptor can enable DVR when the expected response shape is present.
  Evidence: DVR-chan 4.1 source; `extension/ytkit-main.js`; schema and i18n coverage gates.
  Where: `extension/ytkit-main.js`, settings schema/defaults/locales, generated i18n coverage report, player-response fixtures.
  Acceptance: On a DVR-disabled live fixture, the seekbar becomes scrubable; the feature is off by default and reports degradation when the player-response shape drifts.
  Complexity: M

- [ ] P2 — Replay chat-density highlight chart
  Why: Chat-activity spikes locate VOD highlights; the feature must remain optional because it observes and aggregates replay-chat activity.
  Evidence: VOD Highlight Analyzer (SkAnon), Live Replay Comment Collector (yuyuyzl).
  Touches: new `extension/features/` module, chat replay frame observation, canvas sparkline over progress bar, settings schema/locales.
  Acceptance: On VODs with chat replay, an opt-in density sparkline renders above the progress bar; clicking a spike seeks there; sampling is budgeted and cancelled on navigation.
  Complexity: L

- [ ] P2 — Opt-in settings/blocklist sync (`storage.sync`)
  Why: Browser-account sync must be a distinct default-off consent decision; the existing `syncSafePrefs` field only governs safe-profile export filtering and defaults on.
  Evidence: BlockTube issue #59; `extension/ytkit.js:5528-5660`; no `storage.sync` runtime call sites.
  Touches: storage layer, policy-profile scrub, popup settings/import recovery, settings schema/locales.
  Acceptance: A default-off toggle syncs schema-validated, secret-scrubbed preferences and blocklists within quota, resolves newest-write-wins conflicts, and offers local Undo.
  Complexity: L

- [ ] P2 — Logarithmic volume curve
  Why: A low-volume curve changes core playback semantics and must remain independently optional.
  Evidence: Youtube Music fix volume ratio (Nemo64); Volume Curve Designer.
  Touches: shared player/audio path, settings schema/locales, rememberVolume integration.
  Acceptance: A toggle remaps native slider position to logarithmic gain without double-scaling volumeBoost or persisted volume.
  Complexity: S

- [ ] P1 — Generate volatile project facts and fail documentation drift
  Why: docs inspected on 2026-07-14 disagree with source on locale count, schema size, module count, extension surfaces, Firefox floor, themes, and bounded YouTube Music/embed behavior, which makes release and contributor guidance unreliable.
  Evidence: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/architecture.md`; `extension/core/settings-schema.js`; manifests; `scripts/check-versions.js`.
  Touches: source-of-truth scripts/tests, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/architecture.md`, package check pipeline.
  Acceptance: stale claims are corrected; generated/validated facts cover version, browser floors, locales, schema entries, peeled modules, shipped surfaces, profiles, themes, and compatibility modes; changing a source fact without its rendered documentation fails `npm run check`.
  Complexity: M

- [ ] P2 — Restore dislikes on Shorts
  Why: YouTube removed the Shorts dislike button, Return YouTube Dislike has not restored it and has not committed since 2026-05-02, and Astra's own module is watch-page and thumbnail scoped.
  Evidence: RYD #1294 (27 👍, filed 2026-06-29, open); `extension/features/return-dislike/index.js:383,522` covers cards and the watch page only.
  Touches: `extension/features/return-dislike/index.js`, `extension/core/selector-packs/` (Shorts surfaces)
  Acceptance: the estimated dislike count renders on the Shorts player with the same `est.` disclosure as the watch page, and survives Shorts navigation.
  Complexity: M

- [ ] P2 — Filter sponsored and affiliate content out of comments and descriptions
  Why: the second-highest single feature request in the landscape, and Astra already ships both halves — comment filtering and SponsorBlock reads.
  Evidence: SponsorBlock #649 (40 👍).
  Touches: `extension/ytkit.js` (comment filter manager, description handling), `extension/core/settings-schema.js`
  Acceptance: an opt-in filter collapses comments and description blocks matching affiliate/sponsor patterns, shows the reason, and is reversible per item.
  Complexity: M

- [ ] P2 — Watch Later bulk management
  Why: repeatedly requested across trackers, and Astra already has the bounded-session + Undo `bulkCardActions` pattern and a Watch Later workbench to host it.
  Evidence: ImprovedTube #231 (6 👍), #652 (6 👍), #4085; the existing workbench in `extension/ytkit.js:33087-33610`.
  Touches: `extension/ytkit.js` (Watch Later workbench)
  Acceptance: bulk remove by age, duration, watched state and channel runs inside the existing bounded-session cap with per-item and "undo all" recovery.
  Complexity: M

- [ ] P2 — Move YouTube selectors into a hot-updatable rule asset
  Why: DOM knowledge is compiled into releases, so a YouTube change costs a release cycle on a channel whose last release is 174 commits old. This is the failure mode killing every competitor: Control Panel for YouTube spent eight of eleven 2026 releases on breakage repair, DeArrow shipped seven emergency fixes, and YouTube changed CSS variables twice in May 2026.
  Evidence: 33 packs under `extension/core/selector-packs/` plus inline selectors ship frozen; uBlock Origin solves the same problem with versioned assets, differential updates (`Diff-Path`/`Diff-Expires`, per-block SHA-1) and randomised multi-CDN fetch (`gorhill/uBlock` `assets/assets.json`, `uBlockOrigin/uAssetsCDN`).
  Touches: `extension/core/selector-packs/`, `extension/core/selectors.js`, `extension/core/selector-health.js`, `extension/background.js`, `scripts/build-selector-fixtures.js`
  Acceptance: selector packs load from a signed, versioned asset with the shipped copy as the offline default; updates verify a digest before applying, are bounded in size, roll back on parse failure, and are visible in the diagnostics panel. No new origin outside the existing allowlist.
  Complexity: XL

- [ ] P2 — List the userscript on Greasy Fork, under the 2 MB cap
  Why: Greasy Fork is the only channel that will carry this product **intact** — it has no downloader prohibition, unlike CWS and Edge — it is the only tier with working auto-update, and listing there auto-feeds userscript.zone and Tampermonkey's script index. The file is 30.2% over the hard limit and the rules forbid minifying to fit.
  Evidence: `YTKit.user.js` is 2,729,479 B against `MAX_CODE_LENGTH = 2.megabytes` (2,097,152 B), enforced on create in `greasyfork-org/greasyfork` `app/models/script_version.rb`. Two compliant mechanisms: **libraries** are separate script records with their own 2 MB budget and are on the `@require` allowlist (`update.greasyfork.org/scripts/…`), keeping the code on Greasy Fork as `code_rules.hosting` demands; and **`@resource` is exempt from the CDN allowlist** — "these rules only apply to external, executable code. Loading non-executable code, for example JSON or CSS, is not restricted." That covers the 644 KB (23.7%) of CSS in template literals, the locale catalogues and the SVG icons. `raw.githubusercontent.com` is not on the `@require` allowlist; jsDelivr is, only with a 40-hex commit SHA, and would still violate the hosting rule. Greasy Fork has no antifeature category for local-companion traffic or media downloading — it needs only an accurate description and `@connect 127.0.0.1`, which the header already has.
  Touches: `sync-userscript.js`, `YTKit.user.js` header (`@resource`, `@require`, plus the missing `@homepageURL`/`@supportURL`/`@license`/`@icon`, and a `@description` that still says "115+ features"), the CSS template literals in `extension/ytkit.js` and `extension/core/settings-visual-system.js`, `scripts/check-userscript-drift.js`
  Acceptance: the generated `YTKit.user.js` is under 2,097,152 B with no minification; feature parity is unchanged at 159/270; the drift and symbol gates pass; the listing is live with the companion dependency stated in the description. Cheaper if the lazy-injection refactor lands first.
  Complexity: L

- [ ] P2 — Prepare a download-free build for the Chromium stores
  Why: CWS and Edge are the only discovery surfaces with real volume, and both reject the download capability — but not the rest of the product. Edge is the cheaper door: $0 (versus $5) and its §1.2.3 explicitly permits a non-integrated companion app when disclosed in the description, while Google's own 2026-04-23 PSA reports a submission surge and ~28 business-day queues.
  Evidence: CWS program policies prohibit extensions that "encourage, facilitate, or enable the unauthorized access, download, or streaming of copyrighted content or media"; Edge §2.8 is verbatim the same. Video Downloader Ultimate states publicly that it removed YouTube downloading from its Chrome build to stay listed. Three manifest facts drive the risk: `https://api.cobalt.tools/*` in `host_permissions`, **seven** `http://127.0.0.1:*` origins against the "narrowest permissions necessary" rule, and a `features/download-ui/` module beside the `downloads` permission. `docs/cws-submission-checklist.md` and `docs/store-permission-rationale.md` already exist.
  Touches: `build-extension.js` (a third profile), `extension/core/data-flow.js`, `extension/manifest.json`, `docs/cws-submission-checklist.md`, `docs/store-permission-rationale.md`
  Acceptance: a store profile builds with no `downloads` permission, no `api.cobalt.tools` host, no loopback origins and no download feature module or naming, and passes `npm run check`. Submission itself is an operator action — Edge additionally requires government-ID verification — so track that half in `Roadmap_Blocked.md` alongside the existing CWS/AMO submission items.
  Complexity: M

- [ ] P2 — Emit a Firefox update manifest from the release pipeline
  Why: Firefox is the only target where silent auto-update is achievable outside a store, and the release tooling that would produce the manifest already exists. Chrome self-hosted CRX installs are Linux-only, so this is the one auto-update lever the project has.
  Evidence: `scripts/generate-release-manifest.js` and `scripts/generate-release-sbom.js` already run per release; `browser_specific_settings.gecko.update_url` requires an HTTPS JSON manifest of `{version, update_link, update_hash}`.
  Touches: `scripts/generate-release-manifest.js` (or a new emitter), `scripts/manifest-patch.js`, `build-extension.js`, `docs/hosted-policy-closure.md`
  Acceptance: a release emits `updates.json` with the version, an HTTPS `update_link` to the release asset and a `update_hash` matching `SHA256SUMS`; the patched Firefox manifest points `gecko.update_url` at it. Effective only once the XPI is signed — track the signing decision separately.
  Complexity: M

- [ ] P2 — Adopt the platform APIs that replace hand-rolled machinery
  Why: several long-standing sources of breakage now have first-class platform answers on both targets.
  Evidence: Chrome 148 makes `browser` native and lets `runtime.onMessage` return a Promise; Firefox 153 adds `runtime.getDocumentId()` and content-script `adoptedStyleSheets`; Popover, `@scope`, `::highlight`, the Navigation API, `Intl.DurationFormat` and `RegExp.escape()` all reached Baseline in 2025–2026; Document Picture-in-Picture is Chrome 130+ and **Firefox 151+**.
  Touches: `extension/core/browser-api.js`, `extension/core/navigation.js`, `extension/core/toast-dom.js`, `extension/core/text-metrics.js`, `extension/core/date-time.js`, the transcript search path in `extension/ytkit.js`
  Acceptance: taken one API at a time behind `extension/core/capability-probe.js` — `@scope` around injected CSS, `::highlight` for transcript and segment marking (no DOM mutation), `Intl.DurationFormat` for durations across all 11 locales, `RegExp.escape()` on every user-supplied filter string. Each lands with a fallback and a test; none regresses `npm run check:startup`.
  Note: `Roadmap_Blocked.md` already holds three items of this same family, blocked on live-browser verification — `appearance: base-select`, `@starting-style`, and `<details name>` exclusive accordion. Deliberately excluded here: the four APIs above are verifiable against the existing fixture and headless lanes, those three are not. Do not re-file them.
  Complexity: L

- [ ] P3 — Start burning down the 1,604 grandfathered English literals
  Why: the copy gate passes because the debt is fingerprinted as accepted, not because it is fixed, so 11 locales ship large English surfaces.
  Evidence: `scripts/i18n-ui-copy-baseline.json` grandfathers 1,604 literals across 20 files — 1,273 in `extension/ytkit.js`, 134 in `settings-panel`, 40 in `subscription-groups`, 30 in `download-ui`, 28 in `video-hider`, 26 in `popup.js`. The Video Notes panel (`extension/ytkit.js:22902-22942`) is entirely unwrapped while siblings in the same file use `t()`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `extension/_locales/**`, `scripts/i18n-ui-copy-baseline.json`, `scripts/generate-locales.js`
  Acceptance: the baseline count only ever decreases; a per-pass target is recorded and the highest-traffic surfaces (Video Notes, settings-panel, download-ui) go first. Translations go into the `generate-locales.js` tables before regenerating so the placeholder ratchet does not move.
  Complexity: L

- [ ] P3 — Start burning down the 277 light-theme-blind surfaces
  Why: the gate accepts 277 legacy surfaces against 89 that carry a light lane, so YouTube light-theme users still meet near-white text on near-white backgrounds on surfaces nothing flags.
  Evidence: `npm run audit:light-theme` reports 89 covered / 277 accepted; `scripts/light-theme-baseline.json`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `scripts/light-theme-baseline.json`
  Acceptance: the accepted count only ever decreases; default-ON surfaces are cleared first; a light-fixture render lane confirms the fixes rather than a source-text rule.
  Complexity: L

- [ ] P3 — Make the accessibility and contrast audits see real rendered output
  Why: all four audits are static string-presence checks over source text, so they only catch regressions of already-fixed patterns — which is exactly how the watch-time dialog shipped with no dialog semantics.
  Evidence: `scripts/audit-overlays-a11y.js:7` states "This is intentionally static"; `scripts/check-contrast.js:37-56` hardcodes six colour pairs from `popup.css` and reads no stylesheet; `docs/screen-reader-smoke.md` is a manual checklist outside `npm run check`.
  Touches: `scripts/audit-overlays-a11y.js`, `scripts/check-contrast.js`, `scripts/smoke-headless-a11y.js`
  Acceptance: contrast is computed from the actual custom-property values in `popup.css`/`sidepanel.css` rather than a literal list; the headless a11y smoke asserts focus order and focus-trap behaviour on at least the settings panel and one injected overlay against a real DOM.
  Note: distinct from `Roadmap_Blocked.md` "P2 — Visual regression testing for popup" — that item compares screenshots against a committed baseline and is blocked on browser binaries; this one computes contrast and asserts focus behaviour, and runs in the headless lane `npm run smoke:settings-overlay` already uses. The rendered light-theme lane the P3 above wants is the natural place to host both.
  Complexity: M

- [ ] P3 — Show which settings differ from their defaults
  Why: 446 keys with per-key reset but no aggregate view of what a user changed, which is the first thing anyone needs when a feature misbehaves or before filing a bug.
  Evidence: `extension/popup.js:2588-2920` renders the Schema Overview key-by-key with a per-key reset (`:3167`) and no diff view; settings are stored sparsely so the data is already exactly the diff.
  Touches: `extension/popup.js`, `extension/core/settings-schema.js`
  Acceptance: a "changed from defaults" view lists every non-default key with its current and default value, is copyable into a bug report, and is included in the diagnostics bundle.
  Complexity: S

- [ ] P2 — Make external enrichment provenance and rate limits visible
  Why: Sponsor, dislike, title, and related enrichment can be stale, unavailable, rate-limited, or privacy-sensitive. Silent fallbacks make a correct "no result" indistinguishable from a broken feature.
  Evidence: [SponsorBlock’s API/database model](https://github.com/ajayyy/SponsorBlock/wiki) and [Return YouTube Dislike’s API](https://github.com/Anarios/return-youtube-dislike), including its [privacy discussion](https://github.com/Anarios/return-youtube-dislike/issues/344).
  Touches: external service adapters, cache metadata, popup/diagnostics status surfaces, settings copy, and tests for 200/empty/304/429/timeout responses.
  Acceptance: each external enrichment reports source, last-refresh age, availability, and cooldown/retry state; a user can disable each source and understand what local fallback remains; cached data is visibly stale after its TTL; identifiers are not sent to an optional service without the existing user-facing opt-in/permission contract.
  Complexity: M

- [ ] P2 — Add rollback-safe release channels and artifact health checks
  Why: a selector or browser-specific release can fail after static build gates pass. The project needs a bounded way to stop propagation and return to the last known-good artifact across extension and userscript channels.
  Evidence: [uBlock’s versioned filter assets](https://github.com/gorhill/uBlock/wiki/Dashboard%3A-Filter-lists/b902569784469ad2bf326efb82d9fd3f92f2fe8d), [yt-dlp’s release cadence](https://github.com/yt-dlp/yt-dlp/releases), and [Firefox’s update-link/hash model](https://extensionworkshop.com/documentation/manage/updating-your-extension/).
  Touches: release manifest/SBOM/digest scripts, GitHub release workflow, selector-asset metadata, userscript metadata, and release documentation.
  Acceptance: every channel identifies a last-known-good artifact and a rollback target; a release health check validates manifest/version/digest, selector-pack parse, startup budget, and a smoke fixture before promotion; a failed health result prevents promotion and a documented rollback restores the previous artifact without rebuilding it.
  Complexity: L

## Audit Findings — 2026-08-10

Baseline at audit time (working tree = HEAD a61ce0d7 + uncommitted v4.58.3–v4.58.6 work): `npm test` 1514/1514 pass. `npm run check` FAILS at `i18n:copy:gate` (new, from the uncommitted work — item below). Pre-existing baseline failures, already tracked, not re-logged: `audit:deps` (web-ext → addons-linter → image-size advisories; tracked P1 above) and `i18n:coverage:gate` (every locale 16 placeholder-identical keys over baseline, from fa3ebfdd). One `lint` failure during a loaded parallel run did not reproduce on a clean re-run — machine load, not a defect. All other gates pass at the working tree.

- [ ] P2 — EN catalog descriptions have drifted from what features actually do, and no gate can see it
  Category: correctness (settings copy) + testing
  Where: `extension/_locales/en/messages.json` `feature_*_desc` keys vs the inline literals in `extension/ytkit.js`; worst confirmed: `feature_hideAiSummary_desc` ("Remove AI-generated summaries and Ask AI buttons" — Ask AI is the separate `hideAskAi` toggle, cross-checked against distinct `body.ytkit-hideAskAi`/`body.ytkit-hideAiSummary` lanes in early.css:54-78); also `feature_playlistEnhancer_desc`, `feature_codecSelector_desc`, `feature_bulkCardActions_desc`, `feature_storageQuotaLRU_desc` (store list omits videoNotesData/bookmarks/watch-progress/watch-time — code at ytkit.js:34998), `feature_researchSpacedReview_desc`, plus scope drift on sbPerChannelProfiles, deArrowVoting, audioPan, restoreNativeYouTubeUi, localAiTranscriptQa, subscriptionGroups
  Problem: `getFeatureI18nText`/`t()` prefer the catalog, so every past "update the description" fix that touched only the ytkit.js literal was invisible to users; the catalog actively misstates feature scope in the cases above. Root cause is a gate gap: check-i18n validates tokens, the copy gate fingerprints literals as accepted debt, but nothing asserts catalog == inline copy.
  Evidence: script-diffed catalog vs inline literals (typographic-quote noise excluded); representative entries hand-checked.
  Fix: one catalog resync pass (EN + generate-locales tables), then extend check-i18n to diff `feature_*_{name,desc}` catalog messages against the extracted definitions (normalizing quotes) and fail on divergence.
  Acceptance: the new check fails when a ytkit.js description literal is edited without the catalog (bait-verify), then passes; the listed keys match their inline copy.
  Confidence: Verified
  Effort: M

- [ ] P2 — The v4.58.3/4 persistence fixes and CC control are covered by source-text pins only
  Category: testing
  Where: `tests/features/settings-panel.test.js:178-227`, `tests/features/player-dock.test.js:31-45`
  Problem: The headline fixes are asserted via regex presence (`/applyExternalSettingsUpdate/`, `/quick-settings-rollback/`, `doesNotMatch(/appState\.settings\[fid\] = newVal/)`). None dispatches a toggle, fakes a failing `settingsManager.save()`, or asserts rollback restores state — they pass against any implementation containing the strings. No test drives `_syncCcButton` or the CC click delegation. This is the repo's documented recurring defect class ("a lazy source pin is not a pin"). Only the video-hider quick-hide-injection test (tests/features/video-hider.test.js:191-249) is behavioral.
  Evidence: tests read and run (they pass; the pinned code paths never execute).
  Fix: use the `tests/helpers/monolith.js` slice-and-run harness: drive the change handler with a fake save resolving `{ok:false, settings}` and assert checkbox/appState roll back; drive `_syncCcButton` against a fake native button (aria-pressed both ways). Verify each new test fails against the pre-fix code shape.
  Acceptance: the new tests fail when the rollback call or `_syncCcButton` state mirror is removed (bait-verify), pass at HEAD.
  Confidence: Verified
  Effort: M

- [ ] P3 — `toTrustedHTML` is a sanitization-free Trusted Types launderer exposed to all feature code
  Category: security (hardening, no current exploit)
  Where: `extension/core/trusted-html.js:9-33`; re-exposed via `extension/ytkit.js:1661-1673`
  Problem: The policy's `createHTML` is `String(v)` — any string becomes TrustedHTML with zero sanitization, bypassing both the repo's own sanitizer and YouTube's TT enforcement in one step for any future caller. The safe entry points (`setTrustedHTML`/`parseTrustedHTML`) do sanitize, and zero core callers assign raw innerHTML today (verified), so this is exposure, not a live hole. Secondary: the DOMParser sanitizer leaves `<iframe src>`, `<object>`, `<embed>`, `style` attributes intact.
  Fix: route `createHTML` through the sanitized-tree pass, or restrict `toTrustedHTML` visibility to the sanitizing wrappers; extend the sanitizer's tag strip list.
  Acceptance: `el.innerHTML = toTrustedHTML('<img onerror=…>')` yields sanitized markup in a unit test.
  Confidence: Verified
  Effort: M

- [ ] P3 — EXT_FETCH validates only the final redirect hop on non-credentialed requests
  Category: security (residual, low exploitability)
  Where: `extension/background.js:1210-1223`
  Problem: Non-credentialed requests keep `redirect: 'follow'` and the allowlist re-check inspects only `resp.url` — an open redirect on an allowlisted origin can bounce a blind GET through an internal host mid-chain; only the final URL is validated. No response readback from intermediate hops (blind-SSRF probing only). Credentialed/auth requests already use `redirect: 'manual'`.
  Fix: if hardening further, a `redirect:'manual'` loop with per-hop allowlist validation; otherwise record as accepted residual in HARDENING.md.
  Acceptance: either per-hop validation with a test, or a documented accepted-residual entry.
  Confidence: Verified (code path); exploitability Low
  Effort: M

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

### Unaudited — needs a pass (scope records, not implementable as-is)

- [ ] P3 — Unaudited this pass (2026-08-10): live-browser behavior on real YouTube (all findings above are from source trace, fixtures, and headless renders — no logged-in youtube.com session was driven); the Firefox runtime lane beyond `check:firefox`/`smoke:firefox` static+startup coverage; the popup rendered in a real extension context (audits are static + code trace); `theater-split.user.js` and `YT_Reaction_Spammer.user.js` contents (only their gate coverage was audited); `HARDENING.md`/`SECURITY.md` doc accuracy against current code; the `archive/` and `mhtml/` directories; CRX/XPI packaging internals beyond what the gates assert.
