# Roadmap - Astra Deck

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

- [ ] P3 — Start burning down the 1,604 grandfathered English literals
  Why: the copy gate passes because the debt is fingerprinted as accepted, not because it is fixed, so 11 locales ship large English surfaces.
  Evidence: `scripts/i18n-ui-copy-baseline.json` grandfathers 1,604 literals across 20 files — 1,273 in `extension/ytkit.js`, 134 in `settings-panel`, 40 in `subscription-groups`, 30 in `download-ui`, 28 in `video-hider`, 26 in `popup.js`. The Video Notes panel (`extension/ytkit.js:22902-22942`) is entirely unwrapped while siblings in the same file use `t()`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `extension/_locales/**`, `scripts/i18n-ui-copy-baseline.json`, `scripts/generate-locales.js`
  Acceptance: the baseline count only ever decreases; a per-pass target is recorded and the highest-traffic surfaces (Video Notes, settings-panel, download-ui) go first. Translations go into the `generate-locales.js` tables before regenerating so the placeholder ratchet does not move.
  Complexity: L
  Note (2026-08-11 research): evidence is stale in the item's favour — the baseline now records **930 literals across 2 files** (928 `extension/ytkit.js`, 2 `core/persisted-domains.js`; `strictCount` 343), down from 1,604/20 after the `feat(i18n)` run at the tip. The item stands; only the numbers moved.

- [ ] P3 — Start burning down the 277 light-theme-blind surfaces
  Why: the gate accepts 277 legacy surfaces against 89 that carry a light lane, so YouTube light-theme users still meet near-white text on near-white backgrounds on surfaces nothing flags.
  Evidence: `npm run audit:light-theme` reports 89 covered / 277 accepted; `scripts/light-theme-baseline.json`.
  Touches: `extension/ytkit.js`, `extension/features/**`, `scripts/light-theme-baseline.json`
  Acceptance: the accepted count only ever decreases; default-ON surfaces are cleared first; a light-fixture render lane confirms the fixes rather than a source-text rule.
  Complexity: L
  Note (2026-08-11 research): current gate output is **253 accepted / 121 covered**, not 277/89. Also note the gate's `SOURCES` list (`scripts/check-light-theme-lane.js:34-39`) excludes all of `extension/core/*.js` even though those modules inject CSS, and `extension/live-chat.css` has zero `html:not([dark])` rules while restyling ~50 chat selectors — so the true uncovered set is larger than 253.

- [ ] P3 — Show which settings differ from their defaults
  Why: 446 keys with per-key reset but no aggregate view of what a user changed, which is the first thing anyone needs when a feature misbehaves or before filing a bug.
  Evidence: `extension/popup.js:2588-2920` renders the Schema Overview key-by-key with a per-key reset (`:3167`) and no diff view; settings are stored sparsely so the data is already exactly the diff.
  Touches: `extension/popup.js`, `extension/core/settings-schema.js`
  Acceptance: a "changed from defaults" view lists every non-default key with its current and default value, is copyable into a bug report, and is included in the diagnostics bundle.
  Complexity: S
  Note (2026-08-11 research): a concurrent session appears to be implementing this — the working tree carries uncommitted `schemaOverviewChangedView` / `schemaOverviewCopyDiff` locale keys and popup changes. Check before starting.

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

- [ ] P3 — Unaudited this pass (2026-08-11): the `archive/` and `mhtml/` directories; `theater-split.user.js` and `YT_Reaction_Spammer.user.js` contents; CRX/XPI packaging internals beyond what the gates assert; per-feature runtime behaviour in a real logged-in browser (every finding below is source-trace, HTTP probe, or headless-gate evidence).

- [ ] P3 — Unaudited this pass (2026-08-10): live-browser behavior on real YouTube (all findings above are from source trace, fixtures, and headless renders — no logged-in youtube.com session was driven); the Firefox runtime lane beyond `check:firefox`/`smoke:firefox` static+startup coverage; the popup rendered in a real extension context (audits are static + code trace); `theater-split.user.js` and `YT_Reaction_Spammer.user.js` contents (only their gate coverage was audited); `HARDENING.md`/`SECURITY.md` doc accuracy against current code; the `archive/` and `mhtml/` directories; CRX/XPI packaging internals beyond what the gates assert.

## Research-Driven Additions

Added 2026-08-11. All evidence is first-hand unless a source URL is given.
Items already tracked in `Roadmap_Blocked.md` (Greasy Fork / CWS / AMO
publication, SponsorBlock submission, the DeArrow vote payload defect) are not
duplicated here.

### P0

- [ ] P0 — Startup cost regressed ~5x; the gate is failing and being read as noise
  Why: `npm run check` exits non-zero at `check:startup`, so the eight gates after it never run in a normal `check`. The documented reflex ("bench-startup flakiness is REAL machine load — re-run it") would hide a real regression, and this one is real.
  Evidence: three independent runs on 2026-08-11 gave median `parseInitMs` 703 / 1164 / 702 ms against `scripts/startup-performance-baseline.json` `medianMs: 134` (recorded 2026-08-08). Today's *fastest* single sample (266 ms) exceeds the baseline's recorded `maxMs` of 232.1 ms, so load does not explain it — load only inflates. `extension/ytkit.js` grew 2,929,353 → 3,112,731 B (+6.3%) since the `v4.59.1` tag; candidate commits in that window include `e4962ac6 fix(runtime): guard duplicate content-script injection` and `ad877585 feat(ai): add local browser AI lanes`.
  Touches: `extension/ytkit.js`, `extension/runtime-bootstrap.js`, `extension/runtime-core-loader.mjs`, `scripts/bench-startup.js`, `scripts/startup-performance-baseline.json`
  Acceptance: a bisect over `v4.59.1..HEAD` names the commit(s) that moved the floor, and either the cost is recovered or the baseline is re-recorded with a one-line note stating what was traded for it. `npm run check` exits 0 end to end.
  Complexity: M

- [ ] P0 — The split userscript ships a placeholder `@require` that cannot resolve
  Why: `YTKit-core.user.js` is the only file that creates `globalThis.YTKitCore` and the main script never defines it, so the next release ships a userscript that cannot run. INSTALL.md still calls the userscript "the easiest (one click)" and it is the only frictionless Firefox path.
  Evidence: `YTKit.user.js:38` reads `@require https://update.greasyfork.org/scripts/REPLACE_WITH_GREASY_FORK_CORE_ID/ytkit-core.js`; that URL returns **404** (probed 2026-08-11) while `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js` returns **200**. `scripts/check-userscript-size.js:100-103` detects the placeholder and prints it as a suffix on an `OK` line instead of failing. `sync-userscript.js:15` already accepts `ASTRA_GREASY_FORK_CORE_URL` and defaults to the placeholder. The published v4.59.1 asset is still the pre-split 2.86 MB monolith, so nothing is broken for existing users yet.
  Touches: `sync-userscript.js`, `YTKit.user.js`, `scripts/check-userscript-size.js`
  Acceptance: the default `@require` resolves to the raw GitHub URL that `@updateURL`/`@downloadURL` already use, so a release is publishable with no external account; `ASTRA_GREASY_FORK_CORE_URL` still overrides it for the eventual Greasy Fork records; and `check-userscript-size` **fails** on an unresolvable `@require` host rather than reporting OK. Bait-verify by pointing the env var at a nonexistent host.
  Complexity: S

- [ ] P0 — Two release channels declare a last-known-good artifact that returns 404
  Why: the rollback promise is false for 2 of 7 channels, and the gate that exists to validate the channel file never dereferences the pointer it validates.
  Evidence: `release-channels.json` sets `chromium-store-chrome` and `chromium-store-firefox` `active` **and** `lastKnownGood` to 4.59.0 with artifacts `astra-deck-chromium-store-chrome-v4.59.0.zip` / `…-firefox-v4.59.0.xpi`; both return **HTTP 404** (probed 2026-08-11) while the sibling `astra-deck-store-safe-chrome-v4.59.0.zip` returns 200. No `chromium-store` artifact has ever been published. `scripts/release-channels.js:59-71` only asserts the artifact *name* matches the channel template.
  Touches: `release-channels.json`, `scripts/release-channels.js`, `scripts/release-health.js`
  Acceptance: `npm run release:channels` fails when any channel's `active`, `lastKnownGood` or `rollbackTarget` names a release asset that does not exist, and passes only when each resolves and matches its recorded `SHA256SUMS` digest; the two `chromium-store` channels are either published or removed from the file.
  Complexity: S

### P1

- [ ] P1 — Module load order makes 24 of 26 peeled feature modules inert in the extension
  Why: ~28k lines of feature modules ship and load in every artifact while only ~4k executes, every feature change must be made twice, and `tests/features/*` exercises the copy that does not run — the running copy has regex source-pins only. This is the root cause behind the settings-panel, DeArrow-drift and `buildVideoHiderPane` incidents rather than another instance of them.
  Evidence: `extension/runtime-core-loader.mjs` ends with `import './features/download-ui/index.js'` then `import './ytkit.js'`; `extension/runtime-bootstrap.js:313-321` imports the remaining feature modules only after that `await` resolves. `extension/ytkit.js:6539` builds `const features = [ … ]` as a top-level array literal, so handoffs written inside it — e.g. `(globalThis.YTKitFeatures?.stickyVideo?.createStickyVideoFeature?.({…})` at `:10157` — resolve `undefined`. `runtime-bootstrap.js:321` dispatches `ytkit-runtime-ready` and `ytkit.js` has no listener for it. Affected: stickyVideo (`:10157`), videoHider (`:17891`), subscriptionGroups (`:41938`), sponsorBlock (`:32650`), deArrow (`:33551`), returnDislike (`:41053`, `:41388`), videoInsights (`:22224`), videoNotes (`:24046`), digitalWellbeing (`:35300`), stickyChat (`:26322`), playerDock (`:9503`), searchHygiene (`:6635`), subscriptionView (`:6743`), searchWhileWatching (`:30916`), replayChatDensity (`:24384`), youtubeMusicCompat (`:47077`), plus 12 `cssFeature()` builders. `download-ui` wins only because it loads before `ytkit.js`, and `tests/features/next-monolith-peel.test.js:572-582` already asserts it must have no inline fallback — the pattern to generalise.
  Touches: `extension/runtime-bootstrap.js`, `extension/runtime-core-loader.mjs`, `scripts/generate-runtime-bootstrap.js`, `extension/ytkit.js`, `tests/runtime-bootstrap.test.js`
  Acceptance: one integration test loads the real generated bootstrap and asserts, for every feature module in the runtime graph, that the factory the monolith reads is defined at the moment `features` is built. Either the deferred modules load before `ytkit.js`, or the array literal is rebuilt after `ytkit-runtime-ready`, or each affected handoff moves into a method body the way `chatStyleComments` already does. A stamped `dataset.featureSource` readback in `smoke-settings-overlay` proves which copy runs for at least stickyVideo, videoHider and subscriptionGroups.
  Complexity: L

- [ ] P1 — The `web_accessible_resources` block exposing all 99 runtime modules has no `use_dynamic_url`
  Why: any YouTube page script can probe a stable `chrome-extension://<id>/core/…` URL and fingerprint the install. SponsorBlock shipped exactly this mitigation in 6.1.6.
  Evidence: `extension/manifest.json` block 0 (2 resources) sets `use_dynamic_url: true`; block 1 — 100 resources, every runtime module plus `ytkit.js` and `runtime-core-loader.mjs` — does not. `build-extension.js:644` only sets the flag on `entries[0]`. Source: https://github.com/ajayyy/SponsorBlock/releases
  Touches: `extension/manifest.json`, `build-extension.js`, `tests/hardening.test.js`
  Acceptance: every `web_accessible_resources` entry in every Chromium build profile carries `use_dynamic_url: true`, a gate asserts it for all entries rather than the first, and the dynamic-URL rotation does not break `getURL()` resolution in `runtime-bootstrap.js` — verified by a real headless load, not a manifest read.
  Complexity: S

- [ ] P1 — Three `npm run check` gates cannot fail from a product change
  Why: the repo's own dominant defect class is checks that certify more than they check; these three are currently in that state, and one of them is cited in `CLAUDE.md` as protection that does not exist.
  Evidence: (a) `generate:capability-matrix` is the last link of `package.json:45` and is invoked without `--check`, so it takes the write branch and overwrites `build/browser-capability-matrix.json`; a `--check` mode exists at `scripts/generate-capability-matrix.js:57` and is never used. (b) `scripts/audit-popup-a11y.js` contains **zero** occurrences of the string `outline`, so the `CLAUDE.md` claim that it "derives the requirement from popup.css itself, so a new outline-suppressing focus rule fails the gate" is false; it checks 8 hard-coded selector strings. (c) `scripts/audit-overlays-a11y.js:170-252` keyboard checks exercise the script's own synthetic helpers and never touch extension code, and its mutation canaries sit behind `--self-test` (`:620-621`) which `check` never passes.
  Touches: `package.json`, `scripts/generate-capability-matrix.js`, `scripts/audit-popup-a11y.js`, `scripts/audit-overlays-a11y.js`, `CLAUDE.md`
  Acceptance: `check` runs the capability matrix with `--check`; `audit-popup-a11y` derives its required focus-ring selector set from `popup.css` by detecting outline-suppressing rules, bait-verified by adding one; `audit-overlays-a11y` runs its `--self-test` canaries as part of `check`; the false `CLAUDE.md` claim is corrected.
  Complexity: M

- [ ] P1 — SponsorBlock and DeArrow data are CC BY-NC-SA 4.0 and the project ships no attribution
  Why: a licence-compliance defect in an MIT repo that consumes two CC BY-NC-SA datasets by default, and the kind of thing a store reviewer or the upstream maintainer notices before a user does.
  Evidence: "The API and database follow CC BY-NC-SA 4.0 unless you have explicit permission" — https://raw.githubusercontent.com/wiki/ajayyy/SponsorBlock/Database-and-API-License.md with a published attribution template at https://gist.github.com/ajayyy/4b27dfc66e33941a45aeaadccb51de71 . Grep across `README.md`, `docs/`, `extension/_locales/en/messages.json` and `LICENSE` returns zero hits for `CC BY-NC-SA` (2026-08-11).
  Touches: `README.md`, `docs/privacy-policy.md`, `extension/_locales/**`, the in-page SponsorBlock/DeArrow surfaces, `tests/hardening.test.js`
  Acceptance: the upstream attribution text appears in the README, in the store/AMO listing copy, and next to the data in-product wherever SponsorBlock or DeArrow output is shown; a gate pins its presence so it cannot be dropped.
  Complexity: S

- [ ] P1 — `api.cobalt.tools` is a default host permission against that project's stated terms
  Why: Cobalt's own docs say hosted instances "are not intended to be used in other projects without explicit permission", and the public instance has been YouTube-blocked since June 2025 — so the permission buys a reviewer question and a dead code path.
  Evidence: `extension/manifest.json` `host_permissions`, `extension/core/data-flow.js:200`, and the `connect-src` CSP entry. Source: https://github.com/imputnet/cobalt/blob/main/docs/api.md
  Touches: `extension/core/data-flow.js`, `extension/manifest.json`, `extension/background.js` (`ALLOWED_FETCH_ORIGINS`), settings schema, `docs/store-permission-rationale.md`
  Acceptance: the Cobalt endpoint becomes a user-supplied self-hosted origin routed through the existing optional-host door rather than a shipped default; no build profile declares `api.cobalt.tools` at install time; the feature's UI states that a self-hosted instance is required.
  Complexity: M

- [ ] P1 — Firefox declares `authenticationInfo` data collection on every profile
  Why: the consent prompt overstates collection for the profile built specifically to minimise it, which costs installs and misstates the data contract AMO enforces.
  Evidence: `scripts/manifest-patch.js:11-16` declares `browsingActivity, websiteContent, websiteActivity, authenticationInfo` as *required* for all profiles, with no `optional` list and no `"none"` sentinel. The `chromium-store` profile strips `downloads`, `cookies`, `nativeMessaging` and every loopback origin (`scripts/check-chromium-store-profile.js` asserts this), so it cannot collect authentication info. AMO required this key for new listings from 2025-11-03 and is extending it to all extensions in H1 2026 — https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
  Touches: `scripts/manifest-patch.js`, `build-extension.js`, `tests/hardening.test.js`
  Acceptance: the required-category list is derived per build profile from `core/data-flow.js` rather than hard-coded, `technicalAndInteraction` is declared optional where applicable, the store-minimal profile declares only what it can actually collect, and a gate pins the mapping profile-by-profile.
  Complexity: S

- [ ] P1 — Pin `image-size@1.2.1` to restore a truthful dependency gate
  Why: `audit:deps` currently passes only because the advisory pair is enumerated in an exceptions file; the advisories are real, reachable in the dev tree, and unpatched upstream for 16 months.
  Evidence: `npm audit` 2026-08-11 reports 3 high via `web-ext@10.6.0 → addons-linter@10.10.0 → image-size@2.0.2` (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq; no patched version published). `npm audit fix --force` proposes `web-ext@5.5.0`, a major downgrade that drops the Node 22 and Firefox 154 schema lanes. `image-size@1.2.1` predates the ICNS/JXL/HEIF parsers entirely and keeps the `imageSize(buffer)` default export. Production audit (`--omit=dev`) is already clean.
  Touches: `package.json` (`overrides`), `package-lock.json`, `scripts/dependency-audit-exceptions.json`
  Acceptance: `npm audit` reports zero advisories, the exceptions file no longer carries the image-size entry, and `npm run check:firefox` still passes on all three profiles with the pinned version.
  Complexity: S

- [ ] P1 — Regenerate `docs/i18n-coverage.md`; it is 34 commits stale and fails the gate at HEAD
  Why: `i18n:coverage:gate` byte-compares this file, so `npm run check` cannot pass at HEAD independently of the startup regression.
  Evidence: last touched in `b50f19b7`; `git rev-list --count b50f19b7..HEAD` = 34. The report claims 2152 EN keys while `extension/_locales/en/messages.json` has 2466 at HEAD, and every per-locale number disagrees with `scripts/i18n-placeholder-baseline.json`.
  Touches: `docs/i18n-coverage.md`, `scripts/i18n-placeholder-baseline.json`
  Acceptance: `npm run i18n:coverage` regenerates the report and `npm run i18n:coverage:gate` passes at a clean HEAD. Note the working tree also carries 11 uncommitted `schemaOverview*` keys from a concurrent session — regenerate after that lands, not during it.
  Complexity: S

- [ ] P1 — Cut the release; 54 commits sit past the `v4.59.1` tag
  Why: an entire release of finished work — the whole i18n burn-down, three security fixes and ~15 features — is unreleased on the only channel users have, and the artifacts that are published show 0 downloads.
  Evidence: `git log v4.59.1..HEAD | wc -l` = 54; no `v4.60.0` tag or release exists; `Roadmap_Blocked.md`'s P0 still says "Tag and publish the v4.56.0 release" against a tree at 4.59.1 with 4.59.1 already published, so that blocked item is stale and should be retargeted or closed.
  Touches: `package.json`, `extension/manifest.json`, `CHANGELOG.md`, `Roadmap_Blocked.md`, `release-channels.json`, git tag, GitHub Release
  Acceptance: the P0 items above land first (a release that ships the broken `@require` is worse than no release); then a version bump, tag, and GitHub Release carrying the artifact set the last two releases actually shipped plus SBOM / `release-manifest.json` / `SHA256SUMS`; `npm run release:verify-digests` passes; `release-channels.json` is promoted to the new version.
  Complexity: M

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
