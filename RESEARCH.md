# Research — Astra Deck

Date: 2026-08-11 — replaces all prior research.

Baseline measured at working tree `a14c09f3` (v4.59.1 in manifests, 54 commits
past the `v4.59.1` tag). **Caveat on every measurement below:** a concurrent
agent session was editing this working tree during the pass (popup, locales,
`settings-schema.js`, `generate-locales.js`, `tests/hardening.test.js` all
carry uncommitted changes implementing the existing "settings differ from
defaults" roadmap item). Runtime files in the content-script path
(`ytkit.js`, `runtime-bootstrap.js`, `core/*` except `settings-schema.js`)
were **not** modified, so the startup measurements are clean; the i18n gate
failure is not.

## Executive Summary

Astra Deck is a local-first MV3 YouTube extension plus a generated Tampermonkey
userscript: 468 settings across 18 categories, 286 declared feature IDs, 99
runtime modules, 11 locales, ~28 verification gates and 1,627 passing tests
(verified `npm test`, 2026-08-11). Its engineering rigour is genuinely ahead of
every competitor surveyed — the selector-health, drift, i18n, contrast and
light-theme gates have no equivalent in ImprovedTube, BlockTube or DeArrow.

The strongest current shape is that rigour. The highest-value direction is
**making delivery and steady-state cost as verified as correctness already is.**
Three shipped-or-about-to-ship defects were found in exactly the blind spot the
repo's own notes name (`gotcha-checks-that-always-pass`): a gate that reports
a broken artifact as OK, a rollback pointer to a URL that 404s, and a startup
budget that is failing every run while the documented reflex is "re-run it".

Top opportunities, priority order:

1. **P0 — Startup cost regressed ~5× and the gate is being read as noise.**
   `npm run check:startup` failed 3/3 independent runs; today's *fastest*
   sample (266 ms) exceeds the baseline's recorded *maximum* (232 ms).
2. **P0 — The split userscript ships a placeholder `@require` that cannot
   resolve**, and `check-userscript-size.js` prints `OK` for that state.
3. **P0 — `release-channels.json` names two channels whose "last known good"
   artifact returns HTTP 404.** The rollback promise is false for 2 of 7 channels.
4. **P1 — SponsorBlock and DeArrow data are CC BY-NC-SA 4.0 and Astra Deck
   ships zero attribution.** A licence-compliance defect in an MIT repo.
5. **P1 — `api.cobalt.tools` is a default host permission against that
   project's explicit terms**, and the public instance has been YouTube-blocked
   since June 2025.
6. **P1 — Firefox declares `authenticationInfo` data collection on every
   profile**, including the Chromium-store profile that strips the features
   which could collect it.
7. **P1 — Module load order makes 24 of 26 peeled feature modules inert in the
   extension** — and the behavioural tests target the copy that does not run.
8. **P1 — The `web_accessible_resources` block exposing all 99 runtime modules
   has no `use_dynamic_url`**, while the 2-resource block above it does.
9. **P1 — Three gates in `npm run check` cannot fail from a product change**,
   including one that asserts nothing at all.
10. **P2 — No user-facing feature-health surface.** Survivability, not feature
    count, is what users of every competitor actually complain about.
11. **P2 — Idle cost is unmeasured.** Competitor 1-star reviews are dominated by
    "30-40% CPU before I toggled anything on".
12. **P2 — Filtering is post-render.** BlockTube's pre-render interception is the
    architectural fix for the failure class that produced the v4.58.1 incident.

## Product Map

### Core workflows

- Watch with playback, audio, quality, subtitle, layout, segment, dislike,
  title, comment and recommendation controls applied to live YouTube DOM.
- Filter and annotate feed cards, Shorts, comments and channels locally, with
  hidden-item management, undo and a bounded predicate sandbox.
- Research: transcript viewer, IndexedDB transcript index, AI summary
  (BYO key or Chrome built-in Summarizer), timestamp bookmarks, exports.
- Organise: subscription groups, watch-later workbench, watch-time analytics,
  digital wellbeing.
- Download via the external Astra Downloader companion (separate repo since
  `a6bb685f`); the extension only holds the loopback handoff.

### Personas

- **Power tinkerer** — the only persona the settings surface is designed for
  (468 keys, a search-driven command centre). Verified: no onboarding beyond a
  first-run panel; discovery is search.
- **Privacy-motivated switcher** — leaving a closed-source enhancer. Community
  evidence shows closed source alone earns 1-star reviews.
- **Firefox user** — currently the worst-served: unsigned XPI, temporary
  add-on only, steered to the userscript by INSTALL.md.

### Platforms and distribution

Desktop Chromium 120+ and Firefox 142+; no mobile by design. Three build
profiles (`store-safe`, `chromium-store`, `github-full`) plus the userscript.
**Nothing is listed on any store.** The v4.59.1 GitHub Release carries 6
extension artifacts + 1 userscript + `SHA256SUMS`; both `.xpi` files are
byte-identical to their `.zip` (unsigned renamed ZIPs), and all assets show 0
downloads. Verified: `gh release view`, HTTP probes 2026-08-11.

### Key integrations and data flows

`background.js` proxies every outbound request through an `ALLOWED_FETCH_ORIGINS`
literal allowlist. Consumers: SponsorBlock (`sponsor.ajay.app`,
`sponsorblock.kavin.rocks`), DeArrow (same host), Return YouTube Dislike,
Reddit, `raw.githubusercontent.com` (filter lists), `api.cobalt.tools`, and
loopback ports 9751-9851 + 11434 (Ollama). AI providers are
`optional_host_permissions`. Live probes 2026-08-11: SponsorBlock `/api/status`
200 and healthy; DeArrow `/api/branding` 200; RYD `/votes` 200.

## Competitive Landscape

### ImprovedTube (`code-charity/youtube`, 4,528★, pushed 2026-08-05)

The only OSS rival at comparable breadth, and the only one with a real
contributor and translation funnel (50+ locales, 21-46 new contributors per
release). Shipped in 2026: heatmap-driven "Smart Speed", jump-to-most-replayed,
built-in RYD, auto-dub language selection.

- **Learn:** the heatmap is already in the player response Astra Deck parses —
  Smart Speed and jump-to-most-replayed are the only genuinely new *playback*
  ideas of 2026 and are cheap here. Also: a community translation pipeline
  beats a generator (Astra Deck's 11 locales still carry 930 grandfathered
  English literals).
- **Avoid:** its 1,456 open issues and its performance reputation. Its own
  tracker carries "content scripts inject 8 CSS + 7 JS into every YouTube
  iframe at `document_start`" (#4109) and "settings — constant DISK write and
  high CPU" (#3159); AMO reviews report 30-40% CPU *before any toggle is on*.
  This is the exact failure mode Astra Deck's own startup regression points at.

### BlockTube (`amitbl/blocktube`, 1,389★, last push 2026-02-07)

The filtering benchmark, and it is decaying: 487 open issues, Shorts blocking
(#450) and comment blocking (#397) reported broken, reviewers explicitly asking
for "a maintained version".

- **Learn:** BlockTube filters **before any DOM rendering** by intercepting
  YouTube's response data, so blocked items never exist in the page.
  Astra Deck hides post-render via CSS classes — which is precisely why
  `hideCollaborations` could silently eat 32 of 102 cards for months (v4.58.1).
  Also its two most-requested unbuilt features: subscribable blocklists
  (#508/#59) and "show what filter triggered the block" (#304).
- **Avoid:** black-screen blocking with no explanation — the top usability
  complaint in its reviews.

### SponsorBlock (13,631★) and DeArrow (2,239★)

- **Learn:** SponsorBlock's boolean advanced-skip rules, per-category
  mute-instead-of-skip, full-video labels, and a configurable fallback server
  (#1562, open 4 years, 28 reactions) are all validated demand. DeArrow's
  two-tier thumbnail model (cache service + local `<canvas>` fallback) is the
  right offline-resilience shape.
- **Avoid:** monetisation friction. DeArrow's time-gated activation is its
  single largest 1-star driver ("as deceptive and scummy as the clickbait this
  extension seeks to fix"), and DeArrow's April 2026 run of three emergency
  releases for YouTube class-name churn shows the drift tax on crowd features.
- **Note:** DeArrow released three selector-churn hotfixes in one month
  (2.3.3-2.3.5) — evidence that `yt-lockup-view-model` migration is still live.

### Return YouTube Dislike (13,696★)

- **Learn:** it ships an official userscript beside the extension from one
  source — the same moat Astra Deck has. Its `/votes` response exposes
  `rawDislikes` (10,831) alongside the extrapolated `dislikes` (6,267,301) for
  the same video; surfacing that ratio would make Astra Deck's "estimated"
  label quantitative rather than a disclaimer.
- **Avoid:** the October 2025 ad injection. The dev's "I messed up with
  implementation though. Sorry." is the reference case for how fast a
  monetisation change destroys accumulated trust.

### Flow (`A-EDev/Flow`, 1,838★ in ~10 months) and Grayjay (FUTO)

The two most interesting *new* ideas in the category, both local-first.

- **Learn:** Flow's "FlowNeuro" is an on-device recommendation engine trained on
  the user's own watch/skip/like signals, with weekday/weekend and time-of-day
  segmentation and explicit topic-saturation detection. Grayjay does
  local-network device sync of subscriptions, groups, history and watch-later
  with no cloud. Astra Deck already has watch-time analytics, subscription
  groups and an IndexedDB store — most of the substrate.
- **Avoid:** becoming a separate frontend. Both are clients, not extensions;
  adopting their *architecture* would multiply parser risk.

### Jump Cutter (`WofWca/jumpcutter`, 657★) and Global Speed (2,693★)

- **Learn:** Jump Cutter's lookahead silence-skipping — an `AudioWorklet` with a
  ~200 ms output buffer that pitch-preserves the tail of silence, plus a hidden
  clone media element playing *ahead* to pre-scan. That clone pattern
  generalises to pre-detecting chapters and segments. Global Speed adds per-URL
  (not per-channel) speed rules and pitch shift.
- **Avoid:** Global Speed's hotkey-centric model — it conflicts with the repo's
  documented no-keyboard-shortcuts rule. Note that as a deliberate non-gap.

### Iridium — dead

Archived 2026-01-31. Drop from competitive tracking; ImprovedTube positions
itself as the successor. Its AMO reviews are a useful post-mortem: "it doesn't
work anymore… since YouTube keeps updating and breaking the addon".

### Feature gaps verified against the schema

Every competitor-sourced idea was checked against `extension/core/settings-schema.js`
(468 entries) on 2026-08-11 rather than assumed. Confirmed absent, in rough
value order: heatmap / jump-to-most-replayed (ImprovedTube v4.2026);
original-thumbnail restoration and an oEmbed metadata fallback
(YouTube-No-Translation, 1,231★ — YouTube now localises text baked into
thumbnails, so `antiTranslate` currently restores the title while the thumbnail
stays translated); schedule-driven activation of any toggle (RYS — the natural
completion of the existing `digitalWellbeing` and `focusedMode`); a user-facing
feature-health surface; AI-slop filtering; lookahead silence skipping;
equalizer and pitch shift in the extension build; per-URL (as opposed to
per-channel) speed rules; dual original+crowd title display; bulk unsubscribe;
per-group subscription notifications.

Confirmed **already present** and therefore not opportunities:
`hideMembersOnly`, `syncSettings`, `listFeedLayout`, `volumeBoost`,
`lowPowerProfile`, filter-list subscriptions, `deArrowCasualMode`,
`shortsAsRegularVideo`, `abLoop`, `disableLoudnessNormalization`,
`scrollWheelSpeed`.

### What the category-wide review evidence says

Across AMO 1-2 star reviews for Enhancer for YouTube, ImprovedTube, Unhook,
BlockTube, DeArrow, PocketTube and RYD (accessed 2026-08-11), the complaint
ranking is: **breakage cadence > idle performance cost > closed source /
permissions > monetisation friction > settings that do not persist > feature
gaps.** Feature gaps are last. Every 2025-2026 buyer's guide tells readers to
install a lean stack of 2-4 focused tools rather than one mega-extension —
which means Astra Deck's counter-positioning cannot be "more features", it has
to be "one install that keeps working, and proves it".

## Security, Privacy, and Reliability

### Verified defects and risks

- **Startup budget regression — 3/3 runs.** `npm run check:startup` fails with
  median `parseInitMs` 703 / 1164 / 702 ms against a baseline of 134 ms
  (recorded 2026-08-08, `scripts/startup-performance-baseline.json`). Today's
  fastest single sample, 266 ms, exceeds the baseline's recorded `maxMs` of
  232.1 ms, so machine load does not explain it — load only inflates. The
  repo's own note ("bench-startup --check flakiness is REAL machine load…
  re-run it") is the reflex that would hide this. `ytkit.js` grew 2,929,353 →
  3,112,731 B (+6.3%) since the tag; the runtime-graph commits in the window
  include `e4962ac6 fix(runtime): guard duplicate content-script injection` and
  `ad877585 feat(ai): add local browser AI lanes`. Confidence: **Verified**
  that the gate fails and that the floor moved; the causing commit is not
  identified. **Consequence: `npm run check` currently exits non-zero at HEAD,
  and the eight gates after `check:startup` never run in a normal `check`.**
- **The split userscript cannot load its own library.** `YTKit.user.js:38`
  carries `@require https://update.greasyfork.org/scripts/REPLACE_WITH_GREASY_FORK_CORE_ID/ytkit-core.js`
  (that URL returns 404, probed 2026-08-11). `YTKit-core.user.js` is the only
  file that creates `globalThis.YTKitCore`; the main script never defines it.
  `scripts/check-userscript-size.js:100-103` detects the placeholder and prints
  it as an informational suffix on an `OK` line rather than failing.
  Roadmap_Blocked treats this as blocked on a Greasy Fork account — but
  `sync-userscript.js:15` already accepts `ASTRA_GREASY_FORK_CORE_URL`, and
  `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js`
  returns 200 today. The unblocked fix is to default to the raw GitHub URL that
  `@updateURL`/`@downloadURL` already use. Confidence: **Verified**.
  *(The published v4.59.1 asset is still the pre-split 2.86 MB monolith and
  works; the defect lands with the next release.)*
- **Rollback points at a 404.** `release-channels.json` declares
  `chromium-store-chrome` and `chromium-store-firefox` with `active` **and**
  `lastKnownGood` = 4.59.0, artifacts
  `astra-deck-chromium-store-chrome-v4.59.0.zip` / `…-firefox-v4.59.0.xpi`.
  Neither was ever published — HTTP 404, while the sibling
  `astra-deck-store-safe-chrome-v4.59.0.zip` returns 200.
  `scripts/release-channels.js` `validate` only checks that the artifact name
  matches the channel template (`:69-71`); it never checks that the release or
  asset exists. A `release:rollback` on those channels resolves to nothing.
  Confidence: **Verified**.
- **Licence compliance: SponsorBlock/DeArrow attribution is absent.** Both the
  API and the database are CC BY-NC-SA 4.0 ("The API and database follow CC
  BY-NC-SA 4.0 unless you have explicit permission", with a published
  attribution template). Grep across `README.md`, `docs/`,
  `extension/_locales/en/messages.json` and `LICENSE` returns zero hits for
  `CC BY-NC-SA`. Confidence: **Verified** (absence); the licence terms are as
  published upstream.
- **Cobalt hosted API used against its terms.** `api.cobalt.tools` sits in
  `host_permissions` and `core/data-flow.js:200`. Cobalt's own docs: hosted
  instances "are not intended to be used in other projects without explicit
  permission"; the public instance has been YouTube-blocked since June 2025.
  Confidence: **Verified** (manifest + upstream docs).
- **Firefox data-consent over-declaration.** `scripts/manifest-patch.js:11-16`
  declares `browsingActivity, websiteContent, websiteActivity,
  authenticationInfo` as *required* for **every** profile. The `chromium-store`
  profile strips `downloads`, `cookies`, `nativeMessaging` and all loopback
  origins — it cannot collect authentication info. No `optional` categories and
  no `"none"` sentinel are used. AMO has required this key for new listings
  since 2025-11-03 and is extending it to all extensions in H1 2026.
  Confidence: **Verified** (source); AMO timing per Mozilla's add-ons blog.
- **Dev-toolchain advisories, unpatched upstream for 16 months.**
  `web-ext@10.6.0 → addons-linter@10.10.0 → image-size@2.0.2` carries
  GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq (both high, no patched version).
  `npm audit fix --force` proposes `web-ext@5.5.0` — a major downgrade that
  would drop the Node 22 and Firefox 154 schema lanes. The real remedy is an
  `overrides` pin to `image-size@1.2.1`, which predates the ICNS/JXL/HEIF
  parsers entirely. Production audit (`--omit=dev`) is clean. Confidence:
  **Verified** (`npm audit`, 2026-08-11).
- **`i18n:coverage:gate` fails, and half of it fails at HEAD.** Two causes:
  (a) `docs/i18n-coverage.md` is **34 commits stale** (last touched
  `b50f19b7`), which `--check-report` byte-compares — a genuine HEAD defect;
  (b) reference key count 2466 → 2477, whose 11 added keys are all
  `schemaOverview*` from the concurrent session's uncommitted work — not a HEAD
  defect. Confidence: **Verified** (`git rev-list --count`, diff).
- **Fingerprinting: the large `web_accessible_resources` block has no
  `use_dynamic_url`.** `extension/manifest.json` block 0 (2 resources:
  `icons/32.png`, `assets/cat.gif`) sets `use_dynamic_url: true`; block 1 —
  **100 resources, every runtime module plus `ytkit.js` and
  `runtime-core-loader.mjs`** — does not. Any YouTube page script can probe a
  stable `chrome-extension://<id>/core/…` URL and fingerprint the install. This
  is the block that matters, and it is inconsistent with the one directly above
  it. `build-extension.js:644` only sets the flag on `entries[0]`. Confidence:
  **Verified**.
  *(A prior draft of this pass wrongly recorded `use_dynamic_url` as already
  shipped, from a grep that matched block 0. It is a real gap.)*
- **Raw YouTube cookie values cross the message boundary.** `EXT_COOKIE_LIST`
  (`extension/background.js:1550-1562`) returns cookie `value` fields for the
  12 allowlisted YouTube domains. The only gate is `sender.id === runtime.id`,
  so any compromised extension context can read the full YouTube session jar.
  Inherent to the companion download design, but it is the highest-value asset
  the extension holds and it is not called out in `SECURITY.md`. Confidence:
  **Verified** (source).
- **Adblock-detection collateral.** Enhancer for YouTube, ImprovedTube and
  BlockTube all have user reports of triggering YouTube's adblock detector
  while doing no request blocking. Astra Deck's `early.css` hides player-
  adjacent surfaces at `document_start`. No Astra Deck report exists.
  Confidence: **Likely** — worth a deliberate design constraint, not a fix.

### Missing guardrails

- No user-visible feature-health surface. `core/selector-health.js` and the
  degraded-state pills exist, but there is no answer to "which of my 286
  features are working right now?" — the single most-demanded property across
  all competitor review evidence.
- No idle-cost budget. `bench-startup` measures parse+init and first paint; it
  does not measure steady-state CPU with the feature set enabled and the user
  idle, which is what competitor 1-star reviews actually describe.
- Filtering is post-render, so a filter that over-matches is invisible until a
  user notices missing videos. The v4.58.1 ">25% of a >=8-card feed must fail
  open" invariant is the right patch on the wrong layer.
- `release:channels validate` proves internal consistency, not existence. Any
  gate that certifies a pointer without dereferencing it belongs in the same
  family as the repo's own `gotcha-checks-that-always-pass`.
- No attribution surface for third-party data licences.

### UI surface inconsistencies (five surfaces, one design system)

Popup, side panel, Firefox sidebar, in-page settings panel, live chat. The
individual surfaces are strong — the side panel's `showEmpty()`
(`sidepanel.js:184-217`) distinguishes three causes for every section, the
settings panel has a real tablist with roving focus and a focus trap that
extends into the toast portal (`ytkit.js:5701-5735`). The problem is that the
same job is done differently on each surface:

- **Destructive-action safety is inconsistent within a single screen.**
  `deleteAiCredential()` (`popup.js:1670-1685`) is irreversible — the secret is
  never re-displayable — with neither confirmation nor undo, while
  reset-everything two sections away has a full snapshot undo. Video Hider's
  per-entry "Remove From List" (`features/settings-panel/index.js:1246-1261`,
  `ytkit.js:48887-48901`) has no undo action while "Clear Hidden List Only" 20
  lines below does backup + undo. Takeout history import
  (`ytkit.js:51037-51050`) offers undo only when `preImportStats !== null` and
  silently drops it otherwise — same button, two safety contracts.
- **Two incompatible focus-ring strategies.** Extension pages use
  `outline: none` + `box-shadow` (`surface-system.css:69-72`, 38 popup + 10
  sidepanel rules); in-page surfaces use a real `outline`
  (`core/settings-visual-system.js:907-911`). Because forced-colors never
  paints `box-shadow`, the forced-colors fallback at `surface-system.css:106-110`
   — which rewrites the token to *another* box-shadow — is dead.
- **`live-chat.css` has zero `forced-colors` and zero `html:not([dark])` rules**
  while restyling ~50 chat selectors with hard-coded rgba.
- **The Reaction Sender declares `role="dialog"` with no Escape handler and no
  focus trap** (`features/live-chat/index.js:425-427`) — the only `role=dialog`
  in the codebase with neither.
- **The popup runs an unconditional document-wide Tab trap**
  (`popup.js:1386-1426`) whose `getActiveFocusRoot()` now always returns
  `document.body` since the confirm modal was retired: a trap with nothing to
  trap, which makes Shift-Tab wrap instead of leaving. The popup also lacks the
  skip link the side panel has (`sidepanel.html:13`) despite ~15 sections above
  its toggle list.
- **`sidebar.html:12-128` is a byte-for-byte clone of `sidepanel.html:12-128`**
  with nothing generating one from the other, so every a11y fix must be made
  twice; `sidebar.js` is 4 inert lines setting a `data-astra-surface` attribute
  with no consumer anywhere in the repo.
- The popup filter implements a documented mini-DSL (`popup.js:106-143`); the
  side panel filters the same schema with flat substring matching
  (`sidepanel.js:727-731`) behind a placeholder that implies field syntax.

Confidence: **Verified** (source-read). None of these were driven in a browser
this pass.

### Recovery needs

Rollback needs a dereference step: for every channel, the `lastKnownGood`
artifact must be proven to exist and match its recorded digest before the
channel file is accepted. `SHA256SUMS` and `release-manifest.json` already
exist — compose them rather than adding a second identity system.

## Architecture Assessment

### Boundaries

- **Module load order makes most peeled feature modules inert in the
  extension — root cause identified.** Traced and verified first-hand:
  `runtime-core-loader.mjs` ends with `import './features/download-ui/index.js'`
  then `import './ytkit.js'`; `runtime-bootstrap.js:313-321` imports the
  remaining feature modules only **after** that `await` resolves.
  `extension/ytkit.js:6539` builds `const features = [ … ]` as a top-level
  array literal evaluated during that import, and every module handoff written
  *inside* it — e.g. `(globalThis.YTKitFeatures?.stickyVideo?.createStickyVideoFeature?.({…})`
  at `:10157` — therefore resolves `undefined` and falls through to the inline
  copy. Nothing re-reads `YTKitFeatures` afterwards: `runtime-bootstrap.js:321`
  dispatches `ytkit-runtime-ready` and `ytkit.js` has no listener for it.
  Affected: stickyVideo (5,019 LOC), videoHider (2,938), subscriptionGroups
  (2,907), sponsorBlock, deArrow, returnDislike, videoInsights, videoNotes,
  digitalWellbeing, stickyChat, playerDock, searchHygiene, subscriptionView,
  searchWhileWatching, replayChatDensity, youtubeMusicCompat, plus 12
  `cssFeature()` CSS builders. Modules that still win resolve lazily inside
  method bodies (`chatStyleComments`, `videoFilters`, `subtitles`, `themeCss`,
  `settingsPanel`) or load before `ytkit.js` (`download-ui`).
  **Consequence: ~28k lines of feature modules ship and load in every artifact
  while only ~4k of it executes, and `tests/features/*` — which `require()` the
  modules directly — exercises the copy that does not run.** The running copy
  has regex source-pins only. This is the same shape as the v4.60.0 filter-list
  incident. Churn data agrees on the cost: `extension/ytkit.js` (155 touches in
  300 commits) and its hand-maintained twin `YTKit.user.js` (111) are the two
  hottest files. Confidence: **Verified** (load order and array literal read
  directly; per-feature runtime behaviour not driven in a browser).
- **Two previously-recorded instances of this class are fixed and the notes are
  stale.** The `_settingsPanelRuntimeInitialized` latch now sets the flag below
  the `typeof factory !== 'function'` early return (`ytkit.js:5608-5618`) with a
  real behavioural test (`tests/settings-panel-runtime-latch.test.js`), and
  `buildVideoHiderPane()` is called from `ytkit.js:50121` and
  `features/settings-panel/index.js:2539`. The repo `CLAUDE.md` working notes
  still describe both as broken.
- **`extension/ytkit.js` is 3.11 MB / ~43k lines.** Content-script wiring is
  already lazy — `manifest.json` `content_scripts[2]` is a single 13 KB
  `runtime-bootstrap.js` at `document_idle`. The remaining eager cost is
  `content_scripts[1]`: 5 files / 132 KB in the MAIN world at `document_start`,
  which per Chromium's own data is the injection point that directly delays
  first paint.
- **`content_scripts[3]` loads 7 files / 210 KB + 17 KB CSS into every
  `live_chat` frame with `all_frames: true`.** This was a deferred item; the
  bundle shrank but the shape is unchanged.
- **Refactor candidates:** `extension/core/registry.js` +
  `core/feature-lifecycle.js` are the right boundary for a health contract;
  `core/selector-packs/` + `selectors.js` + `selector-health.js` for
  self-healing selectors; `core/data-flow.js` for third-party licence and
  provenance metadata.

### Platform capability the project is not using

Verified against Chrome 151 stable / Firefox 153 stable, 2026-08-11:

- `runtime.getContexts()` (Chrome 116+) — the correct duplicate-lifecycle
  detector, more direct than the current injection guard.
- `chrome.userScripts` no longer needs global Developer Mode (Chrome 138+
  per-extension toggle); `userScripts.execute()` (135/149) + per-`worldId`
  messaging (133) is the clean path to injecting only enabled features. Do
  **not** add it to the Firefox lane — AMO restricts `userScripts` to script
  managers.
- `soft-navigation` and `interaction-contentful-paint` PerformanceEntries
  (Chrome 151) are the first native instruments for SPA navigation cost — the
  exact axis `bench-startup.js` approximates.
- Chrome 152 beta ships media pseudo-classes `:playing/:paused/:buffering/
  :muted/:volume-locked`, which delete JS-mirrored player-state classes, plus
  `navigator.cpuPerformance` for gating expensive features on weak machines.
- Firefox 153: `document.adoptedStyleSheets` in content scripts (removes
  `<style>` injection for live-chat CSS); `publicSuffix` API; a `build-for-amo`
  npm script honoured for source verification — absent from `package.json`.
- Firefox 142 (= the current floor) is the `browser.trial.ml` / wllama cut-in
  for on-device inference, matching what Chrome 138+ gives via Summarizer.
  Caveat: Firefox ESR is 140.13, *below* the floor.
- `Intl.DurationFormat` and `scheduler.postTask` need Chrome 129 — above the
  declared Chrome 120 floor. Feature-detect or raise the floor.

### YouTube drift to design against

The 2026 breakage class is not new `ytd-*` tags — it is **camelCase view-model
host classes** (`.shortsLockupViewModelHost`, `ytm-shorts-lockup-view-model`)
and **heterogeneous children** under containers like
`ytd-watch-next-secondary-results-renderer`. SABR remains unresolved upstream
(yt-dlp #12482 still open). Treat a missing selector as a loud, telemetered
failure rather than a silent no-op.

### Test and documentation gaps

- 1,627 tests pass, but the project's own dominant defect class is **tests that
  stub the trust boundary the feature exists to cross** (v4.60.0 filter-list
  incident; `gotcha-checks-that-always-pass`). Three separate commits
  (`5eefa552`, `2a9ed1a5`, `33148682`) exist purely to repair vacuous gates.
  The generalisable rule — every gate must be bait-verified against the
  unfixed code — is followed by convention, not enforced.
- **Three gates in the 28-link `check` chain cannot fail from a product
  change**, all verified first-hand:
  - `generate:capability-matrix` (link 28) **asserts nothing.**
    `package.json:31` invokes it without `--check`, so it takes the *write*
    branch and overwrites `build/browser-capability-matrix.json`. A `--check`
    mode exists at `scripts/generate-capability-matrix.js:57` and is never used.
  - `audit-popup-a11y.js` contains **zero occurrences of the string `outline`**.
    The repo `CLAUDE.md` claims it "derives the requirement from popup.css
    itself, so a new outline-suppressing focus rule fails the gate" — it does
    not. It checks 8 hard-coded selector strings; any new outline-suppressing
    rule outside those 8 passes.
  - `audit-overlays-a11y.js`'s 7 "keyboard path" checks exercise the script's
    own synthetic helpers, never extension code, and its mutation canaries are
    behind a `--self-test` flag that `check` never passes.
- **The lint scope excludes the tooling that enforces everything else.**
  `package.json:55` lints only `extension/**` files; `scripts/**` (all 28 gate
  scripts), `build-extension.js`, `sync-userscript.js`, `tests/**` and
  `runtime-core-loader.mjs` are never linted.
- **`bench-startup` silently changes its own budget on a clean clone.** The
  `*.mhtml` captures are gitignored, so a fresh checkout falls back to synthetic
  fixtures and compares against `baseline.fallbackMetrics` — a different budget
  — with only a `console.warn`. Combined with a 35% relative tolerance and
  `iterations: 3`, the gate is not reproducible across machines.
- **The ratchets reset in one command.** `i18n-ui-copy-baseline.json` and
  `light-theme-baseline.json` both accept arbitrary new debt on
  `--update-baseline`; `i18n-placeholder-baseline.json` uses exact equality, so
  an *improvement* also fails and forces a rewrite of the observed numbers —
  meaning a locale regressing is one flag away from green. Only
  `check-userscript-symbols.js:115` (`MIN_DERIVED_SINGLETONS = 12`) implements
  the right anti-vacuity shape: a floor on the gate's own derived scope. That
  pattern should be copied to the other list-scoped gates
  (`check-no-eval.js` `SCAN_FILES`, `check-light-theme-lane.js` `SOURCES` —
  which excludes all of `extension/core/*.js` despite those modules injecting
  CSS — and `audit-overlays-a11y.js` `readSources`, which covers 5 files while
  overlays live in ~25 feature modules).
- **`HARDENING.md` is 13 releases stale** (newest section is H26 on v4.46.0);
  its "still open" lists reference the companion that left in `a6bb685f`. It is
  also listed as unaudited in `ROADMAP.md:54`.
- **`Roadmap_Blocked.md`'s P0 is stale** — "Tag and publish the v4.56.0
  release" against a tree at v4.59.1 with v4.59.1 already published.
- **54 commits sit past the `v4.59.1` tag**, including the entire i18n
  burn-down, three security fixes and ~15 features. No `v4.60.0` tag or release
  exists.
- Zero open issues, zero open PRs, one closed issue in the repo's history, and
  0 downloads on every v4.59.1 asset. Every defect in the changelog was found
  by the maintainer's own audits. There is **no external quality signal at all**
  — which is itself the strongest argument for the health-surface and delivery
  items above.

### Dead code

Only five genuinely dead functions exist across `ytkit.js`, `popup.js`,
`sidepanel.js`, `background.js` and all 26 feature modules — but four of them
are a fork risk, not merely clutter: `sanitizeImportedHiddenVideos`,
`getImportedFilteredVideoPosts`, `sanitizeImportedBlockedChannels` and
`sanitizeImportedBookmarks` at `extension/popup.js:4204-4231` are copies of
`ytkit.js:1196/1205/1333/1382` with zero call sites in `popup.js`, so a future
fix to the originals will not reach them and nothing marks them dead. The fifth
is `ytkit.js:5004` `cachedQuery(selector)`. Separately there are **zero**
`TODO`/`FIXME`/`HACK`/`XXX` markers anywhere in `extension/` or `scripts/` —
unusual, and worth stating plainly.

## Category Coverage

- **Security and privacy:** covered — fingerprinting via `web_accessible_resources`,
  raw cookie values across the message boundary, the Cobalt terms problem, the
  Firefox consent over-declaration, and the dev-toolchain advisory.
- **Reliability:** covered — startup regression, rollback dereference, the
  module load-order defect, gate vacuity, and the reproducibility of the
  startup gate itself.
- **Accessibility:** covered — focus-ring unification, forced-colors gaps, the
  Reaction Sender dialog, the popup focus trap and skip link.
- **i18n/l10n:** the two existing ROADMAP items own the debt; this pass adds
  only the stale-report gate fix and corrects both items' numbers. The
  generator-vs-community-translation question is raised in the ImprovedTube
  entry but not roadmapped — no evidence of demand for 50 locales here.
- **Observability:** covered — the feature-health surface and the idle-cost
  budget are the two new rows.
- **Testing:** covered — the module load-order item's acceptance is a real
  integration test, and the gate-vacuity and scope-floor items harden the
  existing suite.
- **Docs:** covered — `HARDENING.md` retirement, the false `CLAUDE.md` gate
  claim, and the two stale working notes corrected in this file.
- **Distribution / packaging / upgrade:** covered — the userscript `@require`,
  the release-channel 404, and cutting the release. Store submission stays in
  `Roadmap_Blocked.md` pending Open Question 1.
- **Plugin ecosystem:** consciously excluded. The userscript and the
  selector/filter-asset boundaries are the extension points that exist; a
  general plugin surface would expand the attack surface with no demand
  evidence. Unchanged from the 2026-08-08 pass.
- **Mobile:** consciously excluded — desktop-only by design, README states it,
  and the three competitors with mobile support are alternative *clients*, not
  extensions.
- **Offline / resilience:** partially covered. DeArrow's local `<canvas>`
  thumbnail fallback and SponsorBlock's configurable fallback server are
  validated ideas, but both depend on Open Question 2 (whether Astra Deck
  should own a write/host relationship with those commons), so neither is
  roadmapped this pass.
- **Multi-user:** consciously excluded — no evidence for accounts or sharing in
  a local-first single-browser extension. Grayjay's LAN device sync is the only
  credible variant and is noted in the competitive section, not roadmapped.
- **Migration:** covered by the release-channel rollback item; the companion
  split is complete and its residue is already tracked.

## Rejected Ideas

- **Members-only content filtering** — proposed from BlockTube #418 and three
  other trackers. Already shipped as `hideMembersOnly`. Not a gap.
- **Adding `browser_specific_settings` / `data_collection_permissions`** —
  proposed as absent from `extension/manifest.json`. It *is* absent from the
  source manifest but injected at build time by `scripts/manifest-patch.js:32-40`.
  Only the over-declaration (above) is real.
- **Opt-in settings sync / subscribable filter lists / list-view feed / volume
  boost / low-power profile** — all already present (`syncSettings`,
  filter-list subscriptions shipped in the current unreleased block,
  `listFeedLayout`, `volumeBoost`, `lowPowerProfile`).
- **Global/system-wide media hotkeys** (Global Speed) — contradicts the repo's
  documented no-keyboard-shortcuts rule. Deliberate non-gap, not an oversight.
- **Account-proxy age-restriction bypass** (zerodytrash) — the upstream project
  is self-declared broken and routes googlevideo through a third party.
  Privacy and liability dead end.
- **Invidious as a data fallback** — `api.invidious.io/instances.json` lists 11
  instances, only 5 clearnet HTTPS, and **`"api": false` on every one**
  (probed 2026-08-11). Unusable.
- **Becoming an alternative frontend, hosted sync, accounts, a plugin
  marketplace, native mobile** — unchanged from the 2026-08-08 pass; no new
  evidence.
- **Signing the Firefox XPI to unlock Release installs** — structurally
  unavailable under the repo's standing no-code-signing policy, and already
  parked in `Roadmap_Blocked.md`. Firefox's honest supported paths remain the
  userscript and `about:debugging` temporary install.
- **`OPTIONS` probing to confirm the DeArrow vote route** — attempted
  2026-08-11 and it does **not** discriminate: `sponsor.ajay.app` answers 204 to
  a preflight on any path, including known-good and known-bad routes. Recorded
  so the next pass does not repeat it. (`GET /api/branding/vote/1` returns 404,
  which is suggestive but not conclusive for a POST-only route.)

## Sources

### Competitors and analogous projects

https://github.com/code-charity/youtube
https://github.com/code-charity/youtube/issues/4109
https://github.com/amitbl/blocktube
https://github.com/amitbl/blocktube/issues/508
https://github.com/amitbl/blocktube/issues/304
https://github.com/ajayyy/SponsorBlock
https://github.com/ajayyy/SponsorBlock/issues/1562
https://github.com/ajayyy/SponsorBlock/issues/649
https://github.com/ajayyy/DeArrow
https://github.com/Anarios/return-youtube-dislike
https://github.com/ParticleCore/Iridium
https://github.com/YouTube-Enhancer/extension
https://github.com/WofWca/jumpcutter
https://github.com/polywock/globalSpeed
https://github.com/A-EDev/Flow
https://grayjay.app/
https://github.com/YouG-o/YouTube-No-Translation
https://github.com/LuanRT/YouTube.js
https://github.com/lawrencehook/remove-youtube-suggestions
https://github.com/libredirect/browser_extension
https://greasyfork.org/en/scripts/by-site/youtube.com?sort=total_installs

### Community signal

https://addons.mozilla.org/en-US/firefox/addon/youtube-addon/
https://addons.mozilla.org/en-US/firefox/addon/enhancer-for-youtube/
https://addons.mozilla.org/en-US/firefox/addon/youtube-recommended-videos/
https://addons.mozilla.org/en-US/firefox/addon/blocktube/
https://addons.mozilla.org/en-US/firefox/addon/dearrow/
https://addons.mozilla.org/en-US/firefox/addon/youtube-subscription-groups/
https://news.ycombinator.com/item?id=45916525
https://news.ycombinator.com/item?id=45696329
https://news.ycombinator.com/item?id=48779533
https://secureannex.com/blog/mellow-drama/
https://www.ghacks.net/2025/08/18/enhancer-for-youtube-add-on-for-firefox-possibly-discontinued-due-to-problems-with-mozillas-review-process/
https://github.com/violentmonkey/violentmonkey/issues/1934

### Platform, policy, and licences

https://developer.chrome.com/docs/extensions/whats-new
https://developer.chrome.com/blog/chrome-userscript
https://developer.chrome.com/docs/extensions/reference/api/userScripts
https://developer.chrome.com/blog/new-in-chrome-151
https://developer.chrome.com/blog/chrome-152-beta
https://developer.chrome.com/docs/ai/built-in-apis
https://developer.chrome.com/blog/cws-policy-updates-2026
https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/
https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
https://extensionworkshop.com/documentation/publish/add-on-policies/
https://firefox-source-docs.mozilla.org/toolkit/components/ml/extensions.html
https://raw.githubusercontent.com/wiki/ajayyy/SponsorBlock/Database-and-API-License.md
https://gist.github.com/ajayyy/4b27dfc66e33941a45aeaadccb51de71
https://github.com/imputnet/cobalt/blob/main/docs/api.md
https://api.invidious.io/instances.json
https://www.debugbear.com/blog/measuring-the-performance-impact-of-chrome-extensions
https://issues.chromium.org/issues/40480216
https://playwright.dev/docs/chrome-extensions
https://developer.chrome.com/docs/extensions/how-to/test/puppeteer

### Security advisories and dependencies

https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
https://github.com/mozilla/web-ext/releases
https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
https://github.com/websockets/ws/releases
https://github.com/yt-dlp/yt-dlp/issues/12482

## Open Questions

Only items that block correct prioritisation and cannot be answered from the
repository or public sources:

1. **Is store listing actually wanted?** Every distribution item's cost-benefit
   inverts on this answer. `docs/cws-submission-checklist.md` says "not listed
   on CWS today; this checklist captures what would be required *if* the
   maintainer ever decides to submit". If the answer is no, the
   `chromium-store` profile, the permission-narrowing work and the AMO
   data-consent precision are all wasted effort and the honest posture is
   "self-hosted, userscript-first" stated plainly in the README.
2. **Should Astra Deck write to the crowdsourced commons it reads?** Already
   recorded as the blocker on two `Roadmap_Blocked.md` items. It is a liability
   and identity-model decision, not an engineering one, and it gates both the
   SponsorBlock submission item and the resolution of the DeArrow vote defect
   (fix the payload vs. remove the buttons).
3. **Is the ~5× startup regression acceptable for what the 54 unreleased
   commits bought?** If yes, the baseline should be re-recorded with an
   explicit note naming the trade; if no, a bisect over that range is P0 work.
   Either answer is fine — silently re-running the gate until it passes is not.
