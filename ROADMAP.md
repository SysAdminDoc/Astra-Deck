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

- [ ] P3 — Show which settings differ from their defaults
  Why: 446 keys with per-key reset but no aggregate view of what a user changed, which is the first thing anyone needs when a feature misbehaves or before filing a bug.
  Evidence: `extension/popup.js:2588-2920` renders the Schema Overview key-by-key with a per-key reset (`:3167`) and no diff view; settings are stored sparsely so the data is already exactly the diff.
  Touches: `extension/popup.js`, `extension/core/settings-schema.js`
  Acceptance: a "changed from defaults" view lists every non-default key with its current and default value, is copyable into a bug report, and is included in the diagnostics bundle.
  Complexity: S

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

- [ ] P1 — A granted filter-list host is never re-checked, and the grant is never surfaced or revocable
  Category: security / UX
  Where: `extension/core/remote-list-scope.js`, `extension/background.js` (`requireRuntimeOptionalHostGrant`), `extension/popup.js` (`refreshFilterList`)
  Problem: the denylist is literal-only by design (resolving at validation time proves nothing about resolution at fetch time), so a granted public hostname that later resolves to a private address keeps its grant. Separately, once granted, the origin never appears in the popup: there is no list of granted filter-list hosts and no way to revoke one short of the browser's own extension settings. Clearing the URL field leaves the host permission granted.
  Fix: surface granted filter-list origins in the data-flow panel with a Remove action wired to `permissions.remove`, and drop the grant when the configured URL changes to a different host.
  Acceptance: changing or clearing the URL revokes the previous origin; the panel lists every granted filter-list host with a working Remove.
  Confidence: Verified (residual documented in docs/store-permission-rationale.md)
  Effort: M

- [ ] P2 — Remote filter-list failures are not distinguishable to the user
  Category: UX
  Where: `extension/features/video-hider/index.js` (`_refreshFilterList`), `extension/ytkit.js` (monolith twin), `extension/popup.js`
  Problem: the content script returns `{ ok: false, reason, error }` where `error` is a free-text message ("HTTP 404", "Unsupported or invalid Astra Deck filter-list format", "Filter list exceeds the 1 MiB limit"). The popup cannot map those to copy without string-matching, so all of them collapse into one "Could not refresh the list" message. A user whose list is served but malformed gets the same advice as one whose host is down.
  Fix: add a stable `code` to the failure result in BOTH copies (`unreachable`, `bad-format`, `too-large`, `http-error`) and give each its own locale key.
  Acceptance: a malformed list and an unreachable host produce different, actionable messages.
  Confidence: Verified
  Effort: S

- [ ] P2 — The filter-list refresh cadence cannot be observed or controlled
  Category: UX
  Where: `extension/features/video-hider/index.js:263-266` and the `ytkit.js` twin (`_FILTER_LIST_REFRESH_MS` 24 h, min 6 h, max 7 d)
  Problem: the refresh interval is a hard-coded constant with no setting and no display. The status line now says whether a list is being followed, but not when it was last fetched or when it will refresh next, so a stale list is indistinguishable from a fresh one.
  Fix: render the `fetchedAt` timestamp as relative time via `core/date-time.js` in the status line; consider a coarse cadence control (daily / weekly / manual only).
  Acceptance: the popup shows when the list was last updated; a manual-only mode stops the background timer.
  Confidence: Verified
  Effort: S

- [ ] P3 — `hideVideosFilterListUrl` is schema `vehicle: 'extension'` but the monolith still carries a full fallback codec
  Category: maintainability
  Where: `extension/ytkit.js` (`MONOLITH_FILTER_LIST_CODEC`), `extension/features/video-hider/index.js` (`createFallbackFilterListCodec`)
  Problem: the setting cannot exist in the userscript, and the shared normalizer now fails closed there, so the userscript-side codec can only ever process a locally-imported list. Two near-identical codecs remain in the tree for a path that is largely unreachable, and the "make every change twice" rule applies to both.
  Fix: decide whether userscript users get local filter-list import at all; if not, delete the fallback codec and gate the feature block on the extension vehicle.
  Acceptance: one codec, or an explicit test proving the userscript path is exercised.
  Confidence: Verified
  Effort: M

### Unaudited this pass — 2026-08-11 (scope record, not implementable as-is)

- [ ] P3 — Unaudited on 2026-08-11: everything outside the filter-list/permission surface. Specifically not covered: the settings panel and its visual system, SponsorBlock/DeArrow/Return-YouTube-Dislike surfaces, the download companion path, the side panel and sidebar, live chat, the subscription-groups feature, theming across injected YouTube surfaces in either theme, and any live-browser verification (all findings this pass are from source trace, mutation testing, and the gate suite — no logged-in youtube.com session and no rendered popup were driven). The popup was audited only for the filter-list section and the forced-colors focus lane.

### Unaudited — needs a pass (scope records, not implementable as-is)

- [ ] P3 — Unaudited this pass (2026-08-10): live-browser behavior on real YouTube (all findings above are from source trace, fixtures, and headless renders — no logged-in youtube.com session was driven); the Firefox runtime lane beyond `check:firefox`/`smoke:firefox` static+startup coverage; the popup rendered in a real extension context (audits are static + code trace); `theater-split.user.js` and `YT_Reaction_Spammer.user.js` contents (only their gate coverage was audited); `HARDENING.md`/`SECURITY.md` doc accuracy against current code; the `archive/` and `mhtml/` directories; CRX/XPI packaging internals beyond what the gates assert.
