# Roadmap - Astra Deck

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

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
