# Research — Astra Deck

Date: 2026-08-20 — replaces all prior research.

Confidence labels: **Verified** (checked against source or a primary URL this pass),
**Likely** (secondary source), **Assumption**, **Needs live validation**.

## Executive Summary

Astra Deck v4.81.0 is a local-first desktop YouTube enhancement system — an MV3
Chrome/Firefox extension (476 settings across 18 categories, 291 feature IDs, 110
runtime modules, 31 gates, ~2,150 tests), a generated Tampermonkey userscript, and a
separate local download companion. **Verified.** The single most important fact this
pass is not technical: v4.81.0 is genuinely published (GitHub release 2026-08-20T16:34Z,
tag + `package.json` + `release-channels.json` all agree), the tracker has **zero** open
issues in the repo's lifetime except one satisfied localization request, the repo sits at
12 stars / 1 fork / 0 subscribers, release assets show 0–1 downloads each, and the
maintainer's two "tell me what broke / what you actually use" discussion threads
(#43, #44, both 2026-07-30) have **zero replies**. The engineering is far ahead of the
distribution, and the prior pass's premise that a release was blocked is now stale.

That reframes priority. The product does not need feature 292; it needs (a) to survive
YouTube drift without a release cycle, (b) to be installable and verifiable by a stranger,
and (c) to convert a vague "it broke" into an actionable feature ID. Top opportunities in
priority order:

1. **Undo that survives a browser restart, and a backup file before import overwrite.**
   Global reset and settings import both snapshot into `chrome.storage.session`
   (`extension/popup.js:6262-6308`, `:5515-5577`), so the undo for the two most
   destructive actions in the product evaporates when the browser closes.
2. **A remote broken-feature disable feed.** 291 DOM-coupled features, no CI, and
   YouTube shipped watch-page and Shorts DOM changes on 2026-08-13. Refined GitHub
   solves exactly this with an MIT-licensed CSV on GitHub Pages that disables a named
   feature within a version range in ≤6 hours, no store review.
3. **A feature-ID rename map**, which is the prerequisite for (2) and protects stored
   settings across renames. Absent today (verified: no `getNewFeatureName`-equivalent
   anywhere in `extension/` or `scripts/`).
4. **A user-run bisect wizard.** ~10 reloads isolates one culprit among 291 features.
   Discussion #43 states the problem verbatim: "when something breaks for you but not
   for me, your report is the only signal I get."
5. **Delete the orphaned `.github/codeql.yml`, or wire it.** No workflow references it
   and code scanning is `not-configured` — the file implies a security control that does
   not exist.
6. **Locally-signed release checksums.** `SHA256SUMS` proves nothing about provenance;
   whoever forged the artifact forges the hash. A detached signature over the checksum
   file plus a published public key is the trust upgrade that fits the repo's stated
   local-builds-only policy.
7. **Surface enrichment-API failure on the watch page.** SponsorBlock and DeArrow fetch
   failures go to `DiagnosticLog` only, so a YouTube-side outage reads to the user as
   "Astra broke."
8. **A local, user-initiated enabled-feature report.** The maintainer's stated blind spot
   ("I genuinely don't know which ones people treasure") has a no-telemetry answer: a
   copyable local report the user pastes into the feedback thread.
9. **`build-for-amo` plus a reproducible-build proof.** Mozilla auto-builds submitted
   source and fast-tracks matching submissions; AMO review otherwise runs 3 days to
   5 weeks.
10. **Close the two remaining real-browser gaps.** Live-Chromium coverage is better than
    it looks — the extension really is loaded, the DNR ruleset is asserted, and the
    service worker is terminated twice — but the a11y smoke drives standalone fixture
    pages with no extension loaded, and the `all_frames: true` live-chat frame has no
    live check at all.

## Product Map

- **Core workflows:** transform YouTube watch/feed/player/chat surfaces; filter content
  pre-render (feed prefilter) and post-render (video hider, element zapper); enrich via
  SponsorBlock / DeArrow / RYD / heatmap / thumbnails / transcripts; research via notes,
  bookmarks, comment search, transcript IndexedDB search, AI summaries (BYO key /
  Chrome built-in / Ollama); manage 476 settings across popup, side panel, sidebar,
  in-page panel, and per-page modals with profiles, presets, schedules, import/export,
  and undo; hand explicit downloads to the local companion.
- **Personas:** privacy-conscious local-first users; power users; researchers (transcript
  and comment search, export); focus/accessibility users; Firefox users on the userscript
  path; self-hosters on companion-capable profiles.
- **Platforms:** Chrome/Edge/Brave MV3, Firefox MV3 (`strict_min_version 142.0`, unsigned
  XPI today), desktop userscript managers. Build profiles `store-safe`,
  `chromium-store`, `github-full`. Desktop only.
- **Data flows:** MAIN-world bridges ↔ ISOLATED runtime via `data-ytkit-*` attributes;
  service worker owns allowlisted cross-origin fetches, optional permissions, cookies and
  native messaging; storage split across `chrome.storage.local/session/sync`, extension
  IndexedDB, and a page-origin transcript IndexedDB; no Astra server, no telemetry.
  **Verified:** no API credential reaches the MAIN world (`extension/ytkit-main.js`,
  `extension/core/player.js` contain no key/credential handling).

## Competitive Landscape

The enhancement field is still frozen where it was on 2026-08-19 and that baseline is not
restated. Deltas and newly-covered classes only.

- **SponsorBlock / DeArrow** — no activity after 2026-07-26 / 2026-07-13. One correction:
  SponsorBlock v6.1.7 was *published* 2026-07-13; 07-26 is the last commit. Standing
  lessons hold (per-surface perf scoping answers DeArrow #92/#423; never lose local data
  to a remote failure). Licensing question unchanged and blocked.
- **Return YouTube Dislike** — code frozen at v4.0.4 but the repo is not dead (docs commit
  2026-08-08). Its October 2025 upsell-tab incident remains the cautionary tale for this
  exact category: a single mistimed premium tab in a 20M-user extension triggered mass
  uninstalls and a rating collapse, rolled back in ~6 hours. **Learn:** never ship an
  interstitial or upsell surface. **Avoid:** their delivery mechanism, not their price.
- **ImprovedTube (code-charity/youtube)** — the only living Swiss-army competitor and the
  only one that moved after 2026-08-13 (13 commits; merged fixes for automatic
  fullscreen, watch-later false success, subtitles-until-reload, speed-button duplicates,
  comment hitboxes). Ships from `master`, not releases; license `NOASSERTION`, so
  study-only against MIT. **Learn:** its merged-PR stream is a free YouTube-drift feed.
- **Refined GitHub** — 31,962★, **MIT**, 189 feature modules. The most transferable
  project found this pass, and it is not a YouTube tool. Three patterns:
  (a) `source/helpers/hotfix.tsx` fetches `broken-features.csv` from GitHub **Pages**
  (deliberately, to dodge API rate limits) with `cache: 'no-store'`, 6h `maxAge`, 30d
  `staleWhileRevalidate`, skipped on dev builds, and converts each
  `feature, issue, min-working-version` row into `feature:<id> = false`;
  (b) `source/helpers/bisect.tsx` is a user-run binary search over the enabled feature
  set; (c) `feature-data.ts` exposes a rename resolver that both stored options and the
  remote feed consult, so renames don't silently break either. Refined GitHub ships this
  on both CWS and AMO, which is the practical evidence that a disable-only remote feed
  passes store review. **Learn:** all three. **Avoid:** nothing found.
- **RES (Reddit Enhancement Suite)** — the counterfactual for a large settings surface
  without that machinery: 686 open issues at 4,503★ versus Refined GitHub's 78 at
  31,962★, roughly 60× the open-issues-per-star ratio. **Avoid:** letting feature count
  outrun triage tooling.
- **Control Panel for YouTube (insin)** — 363★, active, desktop + mobile.
  Subscriptions-as-inbox: hide watched above a configurable watch percentage, hide live /
  long VODs / Upcoming, then backfill the gaps. **No license file — study only.** Astra
  already has the equivalent keys (`hideVideosWatchedRatio`, `hideVideosHideLive`,
  `hideVideosHideUpcoming`, `hideVideosDurationFilter`,
  `hideVideosSubsLoadLimit`/`Threshold` for backfill), so this is a positioning asset,
  not a gap. **Verified** against `extension/core/settings-schema.js`.
- **uBlock Origin** — 1.73.0 stable, 1.73.1b4 (2026-08-13) adds the `content(...)`
  operator for matching inside `<template>`. The strategically important event is the
  2026-08-05 Facebook capitulation (HN 726 pts / 918 comments): Meta split "Sponsored"
  into individually-wrapped, randomly-ordered, padded characters and volunteer
  maintainers stopped, having previously dropped Twitch the same way. **Avoid:** any
  selector-list commitment that has to be defended indefinitely by one person. Prefer a
  disable feed over an expanding match list.
- **CY Fung's performance family** — CPU Tamer by AnimationFrame (57,836 installs), JS
  Engine Tamer (18,778), Super Fast Chat (14,978), plus knoa's Live CPU Tamer (19,211):
  ~110k installs for scripts that add no features and only make YouTube cheaper to run.
  **Learn:** a 291-feature extension is presumed guilty on cost and needs published
  evidence; the existing `check:steady-state` and `check:startup` gates are that evidence
  and are currently invisible to users.
- **Greasy Fork demand shape** — of the top 100 youtube.com scripts, roughly half the
  top 20 by installs are downloaders, and the two highest *daily* installers (348/day,
  ~200/day) are both 2026-created downloaders. Median total installs across the top 100
  is **5,001**; the "everything" ceiling in this niche is real at ~450k
  (YouTube Ultimate Downloader). "Play with MPV" at 15,372 installs is the working
  precedent that browser→local-app handoff survives Greasy Fork's rules.
- **PocketTube / Magic Actions / Turn Off the Lights / YouTube Premium AI** — unchanged
  from 2026-08-19; per-group feed sorting and a deck view remain the only genuine
  PocketTube paywall gaps and are already on the roadmap.
- **Install counts by feature class** (CWS, cross-checked aggregators — **Likely**):
  single-purpose ad blocking ~10M; single-annoyance fixes 1M–5M (RYD 5M, SponsorBlock 2M,
  Unhook 1M at 4.9★); comprehensive enhancement tops out at ~1M (Enhancer for YouTube,
  1M+, 4.7★ on 517k ratings); subscription management ~300k; AI summarization 100k–1M with
  divergent quality (4.3★ vs 3.1★). **Nothing here says breadth wins** — the highest-rated
  entries are the narrowest. Enhancer for YouTube is the ceiling for the everything
  strategy and it is an order of magnitude below the single-purpose ad blocker. It is
  also the proof that a kitchen-sink YouTube extension satisfies CWS single-purpose.
- **Paid summarizers** — Eightify is $59.99/yr or $9.99/mo (App Store listing,
  **Verified**); NoteGPT ~$100+/yr. Astra's BYO-key/Ollama summarization is the free local
  equivalent of a $60–120/yr product. That is the one feature where a competitor's price
  can be named, and it is a far more concrete pitch than "291 features."

## Reported Issues

The tracker carries no actionable signal, and that is itself the finding. **Verified.**

- **Zero open issues, zero open PRs**, `open_issues_count: 0` via REST. Exactly one issue
  has ever been filed: **#1** (2026-05-04, `ZSK5418`, `enhancement`) asking for
  localization, explicitly reporting no bugs, closed 2026-05-10 as implemented in v3.22.0.
  i18n work continued well past it (11 locales, 43 settings headings localized in v4.78.0).
- **Discussions #43 and #44** (2026-07-30, both authored by the maintainer, both at 0
  comments and 0 reactions) are the intended feedback tripwire and have caught nothing.
  #44 asks users for their five most-used features because "with 150+ features, I
  genuinely don't know which ones people treasure and which nobody has toggled on." That
  is a stated product blind spot with a no-telemetry answer available.
- **All 11 closed-unmerged PRs are Dependabot** (#2–#11, #37–#39). This is policy, not
  neglect: `39e8f8e6` (2026-06-25) removed `.github/dependabot.yml` and `a61b5d5e`
  (2026-06-26) removed all four workflows with the message "Remove GitHub Actions
  workflows — local builds only." No outside-contributor PR has ever been opened.
- **At 12 stars / 1 fork / 0 subscribers, an empty tracker is no data, not good news.**
  Every roadmap item below is therefore self-sourced or competitor-sourced, and none
  outranks a user report because no user report exists.

## Security, Privacy, and Reliability

- **Data-safety defect, highest severity found this pass.** The undo for the two most
  destructive actions is session-scoped. `extension/popup.js:6262-6308` (reset) and
  `:5515-5577` (import) snapshot into `chrome.storage.session`, which is cleared on
  browser exit, and import writes **no backup file** — it aborts with "export a backup
  first" only when the session snapshot itself fails. A user who resets, closes the
  browser, and reopens it has no path back. **Verified.**
- **Destructive-action policy is applied inconsistently.** The project deliberately
  removed confirmation modals in favour of immediate-apply-plus-undo
  (`extension/popup.js:4972-4984`), but subscription-group delete still uses
  `window.confirm` and has no undo (`extension/features/subscription-groups/index.js:2641`),
  and AI-credential delete, per-key schema reset, and transcript-index clear have neither.
  **Verified.**
- **Silent enrichment failure.** SponsorBlock (`extension/features/sponsorblock/index.js:361-366`)
  and DeArrow (`extension/features/dearrow/index.js:290-291`) route fetch failure to
  `DiagnosticLog` and `ExternalApiHealth` with no watch-page signal. Combined with the
  documented pattern that users blame the extension rather than the site, an upstream
  outage reads as an Astra defect. **Verified.**
- **Raw error text reaches users.** ~15 surfaces concatenate `error.message` or an HTTP
  status into user copy — `popup.js:4777`, `:5629`, `:5152-5155`, `ytkit.js:32126`,
  `:33642`, `:39355`, `features/download-ui/index.js:2819`. Provider error bodies can
  reach the UI verbatim through the AI paths. **Verified.**
- **`.github/codeql.yml` is orphaned.** It is a CodeQL *config* file requiring a
  workflow's `config-file:` input; no workflow exists (`.github/workflows` 404s), and
  `code-scanning/default-setup` reports `state: "not-configured"`. The file advertises a
  control that is not running. **Verified.**
- **`SHA256SUMS` is not a provenance claim.** Releases are built locally with no CI, so
  the checksum file and the artifact share one origin — an attacker who produces one
  produces the other. GitHub Artifact Attestations would fix this but require an Actions
  build, which contradicts the deliberate local-builds-only decision; a detached local
  signature over the checksum file plus a published key is the philosophy-compatible
  equivalent. **Verified** (repo state); the conflict is flagged rather than resolved.
- **Store-submission risk is lower than external sources assume — verified locally, not
  inferred.** Running `patchManifestForBuildProfile` over each profile shows
  `chromium-store` drops `downloads`, `cookies`, and `nativeMessaging`, and both store
  profiles drop the `https://*/*` optional host permission and the `https://*`
  `connect-src` source; only `github-full` retains them.
  `scripts/check-chromium-store-profile.js:51-68` gates this. The corresponding external
  recommendations were dropped.
- **`use_dynamic_url` coverage is complete.** Both `web_accessible_resources` groups set
  it and there are zero hardcoded `chrome-extension://` URLs in `extension/`, so the
  install-probe defence is intact. Worth knowing what it does not cover: behavioural
  fingerprinting of Astra's own injected DOM, and the MAIN-world bundle, which shares the
  page realm by definition. LinkedIn's production probe list reportedly carries 6,167
  extension entries growing ~12/day, so this is an active attack class. **Verified**
  (coverage); **Likely** (probe-list figure).
- **The loopback companion channel is not protected by the browser and will not be.**
  Chrome's Local Network Access guidance states there are no plans to apply LNA
  restrictions to extensions. LNA does shield the companion from ordinary web pages
  (enforced Chrome 142, split into `local-network`/`loopback-network` in 145, extended to
  WebSocket/WebTransport in 147), but the companion must defend itself: `Host`-header
  allowlisting is the only control that survives a successful DNS rebind, bearer auth on
  every endpoint, bind `127.0.0.1` never `0.0.0.0`, and origin validation that tolerates a
  rotating extension ID — because `use_dynamic_url: true` regenerates it every session,
  any hardcoded `chrome-extension://<id>` allowlist on the companion side will break.
  A 2026 Radboud thesis demonstrates LNA gaps via IPv6 global unicast. **Verified**
  (Chrome position); **Likely** (defence adequacy).
- **Dependency posture is sound; two corrections.** `npm audit --omit=dev` is clean; the
  standing dev-only advisory count through `web-ext → addons-linter → image-size@2.0.2`
  is **2, not 3** (CVE-2025-71329, CVE-2025-71330 — both unpatched, and 2.0.2 is the
  latest published version, so there is nothing to upgrade to; CVE-2025-71319 is fixed at
  2.0.2 and no longer applies). `brace-expansion` has had **five** advisories in 2026, the
  latest CVE-2026-69152 (2026-08-03) explicitly bypassing the previous mitigation — the
  `^5.0.9` override is currently correct but needs an active watch, not set-and-forget.
  `ws@8.21.2` clears both 2026 `ws` CVEs; 8.21.3 is a non-security patch. `.npmrc`
  already sets `ignore-scripts=true`, which closes the ChainDrop preinstall vector.
- **yt-dlp advisory shape (companion repo, pointer only):** four of six 2026 advisories
  are command injection or RCE through `aria2c` manifest downloads
  (GHSA-vx4q-3cr2-7cg2), `--exec`, `--netrc-cmd`, and `--write-link`. Pin to a build
  after 2026-07-04 and never pass those flags from extension-controllable input.
- **Unsigned XPI is a hard blocker, not a rough edge.** Signing is required on Firefox
  Release and Beta; `xpinstall.signatures.required` only has effect on Developer
  Edition / Nightly / ESR. The released `.xpi` assets cannot be installed by any
  mainstream Firefox user today. **Verified** (Mozilla docs + independent reproduction).
- **View-count redefinition took effect 2026-08-24** as previously recorded; the
  view-metric adaptation shipped in v4.77.0 and only the like-rate tone bands remain
  (blocked). Historical totals are not restated, so old and new uploads are permanently
  non-comparable — worth stating in the feature's copy.
- **No YouTube anti-adblock escalation in August 2026.** The uAssets tracker carries only
  five YouTube-titled items for the whole month, all routine and quickly closed. The
  August "adblock crisis" coverage is about MV2 removal and Facebook. Articles claiming
  YouTube escalation cite no primary evidence. **Verified negative** — this removes the
  urgency from any escalation-driven work.

## Architecture Assessment

- **No remote disable path, no rename map, no bisect.** Verified absent by search across
  `extension/` and `scripts/`. These three are the structural answer to the project's
  actual failure mode — 291 DOM-coupled features against a site that changes weekly,
  shipped by one person with no CI and no user reports — and Refined GitHub proves all
  three at 189 features under a compatible licence.
- **Zero CI.** Four workflows were deliberately deleted on 2026-06-26. The consequence is
  not merely missing automation: the 31-gate `run-checks.js` chain and ~2,150 tests only
  ever run where the maintainer runs them, so a machine-specific pass is
  indistinguishable from a real one, and the `check:startup` gate is already documented
  as machine-sensitive. Restoring CI wholesale contradicts a stated decision; the
  cheap subset that does not is the orphaned CodeQL config and local release signing.
- **`<dialog>`/`showModal()` is used nowhere**, while focus-trap machinery is hand-rolled
  across `extension/popup.js`, `ytkit.js`, `features/settings-panel/index.js`,
  `features/subscription-groups/index.js`, and `features/digital-wellbeing/index.js`.
  `<dialog>` has been Baseline widely available since 2022-03-14 (Chrome 37 / Firefox 98)
  and clears both declared floors with enormous margin. This is the largest safe deletion
  available. `popover` is already used in four places, so the pattern is not foreign.
- **`minimum_chrome_version` is absent from the manifest** while the documented floor is
  Chrome 120. Nothing enforces the claim, so a Chrome 119 user installs and fails oddly.
- **The monolith's compile cost is probably worse than measured.** V8 code caching was
  enabled for `chrome-extension://` *pages* in Chrome 123; the change did not cover
  content scripts, and `extensions/renderer/script_context.cc` compiles with
  `kNoCompileOptions`. If that still holds, `extension/ytkit.js` (2,806,231 bytes) is
  re-parsed and re-compiled on every YouTube pageview with no on-disk amortization, which
  strengthens the existing peel item beyond its measured ~1 ms per 100 KB.
  **Needs live validation** — Chrome tracing with the `v8` category, checking for
  `v8.compile` slices carrying `cacheConsumeOptions`/`consumedCacheSize`.
- **Real-browser coverage is narrower than it looks in only two places. Verified.** The
  external literature's assumption that this project cannot load an extension headlessly
  is wrong: `scripts/smoke-zero-ads-live.js` loads it, reports the extension ID (`:387`),
  falls back across candidate binaries when a branded build rejects `--load-extension`
  (`:399`), and asserts the DNR ruleset is enabled (`:269`); `smoke-mv3-worker-lifecycle.js`
  terminates the worker twice and asserts state survives (`:118-119, :241, :252`). The two
  genuine gaps are `smoke-headless-a11y.js`, which drives standalone `-a11y.html` fixtures
  against a temp profile with **no extension loaded** (`:1205-1211`) so real extension-page
  CSP and storage are unexercised, and the `all_frames: true` live-chat frame, which has no
  live check at all despite being the most drift-prone surface in the product. Ambient
  context, not a gap: Playwright's documented headless form is `channel: 'chromium'` plus
  `launchPersistentContext`, and Chrome 139 removed the side-load flags from branded
  builds — which is why the candidate-fallback in the zero-ads smoke is load-bearing.
- **Discoverability is an architecture problem, not a marketing one.** 476 settings are
  searchable only in the in-page panel (`features/settings-panel/index.js:417-457`); the
  popup exposes 19 quick toggles with no search, and there are five distinct settings
  surfaces with no user-facing explanation of the split. The 13 Shorts-related schema keys
  are scattered across categories even though Shorts removal is the largest single YouTube
  demand signal of 2026 (HN 1,172 pts / 343 comments).
- **Inline debt remains zero.** Independent scan: no TODO/FIXME/HACK/XXX/`@deprecated`/
  WORKAROUND markers in any `.js`/`.mjs`; one conditional skip
  (`tests/build-fixes.test.js:142`, symlink permissions). The 7 descriptor-only monolith
  stubs are intentional; three full inline fallbacks remain as tracked.
- **Gate numbers re-measured this pass** (all **Verified** by running them on Node
  24.19.0): light-theme 138 covered / **56** accepted; i18n copy baseline **934** legacy
  literals across 2 files; settings **476** entries / 18 categories, byte-identical to
  `default-settings.json`; userscript **1,059,226 bytes**, 18,769 lines, mean line length
  56.4 — **not minified**, and ~52% of Greasy Fork's 2 MB ceiling, which
  `scripts/check-userscript-size.js:13` already gates. Caveat for a reviewer: 29 lines
  exceed 500 characters and the longest is 16,704, so a Greasy Fork moderator skimming
  for machine-generated content will find something to ask about — those lines should be
  identified (embedded data versus real code) before submission, not during review.
- **Empty states and microcopy are the weakest UI surfaces.** Missing empty states:
  zero-groups (subscription groups renders only a Create button), Watch Later Workbench
  preview (`ytkit.js:32966-33005` replaces children and leaves a bare list), video notes
  (inline status only). Popup and in-page label drift exists — `debugMode` renders as
  "Diagnostic Logging" (`popup.js:31`) beside a separate `diagnosticLog` setting.
- **Accessibility audits are static/synthetic.** `audit-popup-a11y.js` reads popup.html
  and CSS text; `audit-overlays-a11y.js` asserts source contracts plus synthetic keyboard
  behaviour; `smoke-headless-a11y.js` drives `-a11y.html` fixtures, not the real popup.
  Uncovered: live-chat, keyboard-only journeys end to end, the transcript-search dialog's
  focus trap.

## Consciously Excluded Categories

Stated so a later reader does not mistake absence for oversight.

- **Multi-user.** A browser extension is single-user per browser profile; the only
  multi-user surface is one person's own devices via `chrome.storage.sync`, already bounded
  by `syncSafePrefsAllowlist` in the schema (100 KB / 8 KB-per-item / 512-item quotas
  unchanged). No work identified.
- **Mobile.** Out of contract by design (desktop YouTube extension plus desktop userscript
  managers); carried rejection, not an omission.
- **Plugin ecosystem.** Rejected on evidence, below.
- **Upgrade path.** Covered, not excluded: `SETTINGS_VERSION` 10 with migrations at
  `extension/ytkit.js:4158+`, exercised v1→v10 by
  `tests/settings-migration-roundtrip.test.js:71-78`, plus an update recovery checkpoint at
  `extension/background.js:652-720`. The gap is feature *identity* across renames, which is
  a roadmap item, not a missing category.

## Rejected Ideas

- **Restoring general CI / Dependabot** — contradicts the explicit 2026-06-25/26 decisions
  (`39e8f8e6`, `a61b5d5e`). Only the orphaned CodeQL config and local release signing are
  proposed, because both are true regardless of that policy.
- **GitHub Artifact Attestations** — the correct trust primitive, but it requires an
  Actions build and therefore contradicts local-builds-only. Recorded as the alternative
  if that policy is ever revisited. Source: docs.github.com artifact-attestations.
- **Comment search** — already shipped (`extension/ytkit.js:25530-25553`). YCS-cont (MIT,
  158★) was the candidate; verified redundant.
- **Subscriptions-as-inbox / watched-percentage backfill** — already covered by
  `hideVideosWatchedRatio` + `hideVideosSubsLoadLimit`/`Threshold`. Source: insin/
  control-panel-for-youtube (also unlicensed, so unvendorable).
- **Anti-translation / anti-auto-dub parity work** — the matrix is complete
  (`antiTranslate`, `antiTranslateAudioTrack`, `antiTranslateTranscript`,
  `antiTranslateThumbnails`, `antiTranslateChapters`, `hideVideosHideAutoDubbed`,
  `notifyAutoDubbedAudio`). Verified against the schema.
- **DNR `topDomains` (Chrome 145+)** — the live-chat iframe's initiator is already
  `youtube.com`, so all five rules' existing `initiatorDomains` conditions cover it. No
  gain, and Firefox has no equivalent.
- **Dropping `nativeMessaging`/`cookies`/wildcard hosts from the store build** — already
  done by the `chromium-store` and `store-safe` profiles. Verified by running
  `patchManifestForBuildProfile`.
- **A Greasy Fork size/minification remediation** — the userscript is unminified and at
  52% of the cap, and the gate exists. Nothing to fix.
- **`"message_serialization": "structured_clone"` (Chrome 148)** — the code must keep
  working under JSON at the Chrome 120 floor and in Firefox, so it adds a lane instead of
  removing one. Revisit only if the floor rises.
- **Navigation API, Sanitizer/`setHTML()`, `@scope`, `Temporal`, `CloseWatcher`,
  `scheduler.yield`, customizable `<select>`, anchor positioning** — all floor-gated above
  Chrome 120 / Firefox 142. The Navigation API is the largest future deletion (it would
  replace the entire `history`-patch + `yt-navigate-finish` + MutationObserver stack) and
  is blocked only by Firefox 147. Revisit when floors move, not before.
- **Danmaku / bullet-chat live-chat overlay** — the live implementation
  (ys-j/YoutubeLiveChatFlusher, 137★, MPL-2.0) is small-audience and the cost is a new
  rendering surface on the most drift-prone part of the page.
- **YouTube Music synced lyrics** (YouLyPlus, MIT, 142★) — carried rejection; YouTube
  Music support is bounded by contract to theme/OLED/density.
- **Lowering `strict_min_version` to admit Firefox ESR 140** — ESR is currently 153, and
  142 already admits it; ESR 140 would cost a full capability re-audit for an audience
  with no evidence behind it.
- **Any telemetry, paid tier, upsell surface, or plugin marketplace** — carried
  rejections, reinforced this pass by the RYD upsell incident and the Vencord-vs-
  BetterDiscord outcome.
- **Carried forward unchanged from 2026-08-19/20:** sponsored-text hiding heuristics,
  age-restriction bypass, per-thumbnail RYD ratio bars, Cobalt public-instance fallback,
  buffer-whole-video, mobile support, general-web blocking, cloud accounts/sync, default
  cloud AI, COPPA miniplayer unblock, watch-history private tracking, MV3 SW keepalive
  tricks, Lighthouse-diff CI perf gate, runtime CSS rewriting for theming.

## Sources

### OSS competitors and adjacent architecture
- https://github.com/refined-github/refined-github · https://raw.githubusercontent.com/refined-github/refined-github/main/source/helpers/hotfix.tsx · https://raw.githubusercontent.com/refined-github/refined-github/main/source/helpers/bisect.tsx · https://github.com/refined-github/yolo
- https://github.com/honestbleeps/Reddit-Enhancement-Suite
- https://github.com/code-charity/youtube/commits/master · https://github.com/ajayyy/SponsorBlock/releases · https://github.com/ajayyy/DeArrow · https://github.com/Anarios/return-youtube-dislike
- https://github.com/insin/control-panel-for-youtube · https://news.ycombinator.com/item?id=39627895
- https://github.com/pc035860/YCS-cont · https://github.com/Pelski/ytzero · https://github.com/ys-j/YoutubeLiveChatFlusher · https://github.com/ibratabian17/YouLyPlus
- https://github.com/gorhill/uBlock/releases · https://github.com/uBlockOrigin/uAssets/issues · https://github.com/yt-dlp/yt-dlp/security

### Community and market signal
- https://news.ycombinator.com/item?id=47016443 (Shorts, 1,172 pts) · https://news.ycombinator.com/item?id=49303202 · https://news.ycombinator.com/item?id=49270726 · https://news.ycombinator.com/item?id=46571628 · https://news.ycombinator.com/item?id=47655392
- https://greasyfork.org/en/scripts/by-site/youtube.com?sort=total_installs · https://greasyfork.org/en/help/code-rules · https://greasyfork.org/en/help/external-scripts
- https://chromewebstore.google.com/detail/enhancer-for-youtube/ponfpcnoihfmfllpaingbgckeeldkhle · https://apps.apple.com/us/app/eightify-ai-youtube-summarizer/id6467562658
- https://github.com/Anarios/return-youtube-dislike/issues/1232

### YouTube platform
- https://blog.youtube/inside-youtube/design-principles-use-put-creators-center-stage/ (2026-08-13) · https://blog.youtube/inside-youtube/engaged-views-youtube-explained/ · https://ppc.land/ads-no-longer-push-youtube-video-titles-down-the-watch-page/ · https://www.androidauthority.com/ask-youtube-coming-to-mobile-3698297/

### Store, signing, and distribution policy
- https://developer.chrome.com/docs/webstore/review-process · https://developer.chrome.com/docs/webstore/program-policies/policies · https://developer.chrome.com/blog/cws-policy-updates-2026 · https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
- https://extensionworkshop.com/documentation/publish/source-code-submission/ · https://discourse.mozilla.org/t/help-our-source-code-review-process-add-a-build-for-amo-script/148822 · https://discourse.mozilla.org/t/important-update-addressing-the-long-manual-review-times/148498
- https://www.devdoc.net/web/developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Distribution.html · https://github.com/TomasHubelbauer/firefox-permanent-unsigned-extension
- https://blogs.windows.com/msedgedev/2026/08/07/moving-the-microsoft-edge-extensions-ecosystem-forward-with-manifest-version-3/ · https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- https://docs.github.com/en/actions/concepts/security/artifact-attestations

### Platform APIs and web features
- https://developer.chrome.com/docs/extensions/whats-new · https://developer.chrome.com/blog/chrome-152-beta · https://developer.chrome.com/blog/structured-clone-messaging · https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest · https://developer.chrome.com/docs/extensions/reference/api/sidePanel · https://developer.chrome.com/docs/ai/built-in-apis
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/150 · .../152 · .../153 · .../154 · https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction
- https://webstatus.dev · https://playwright.dev/docs/next/chrome-extensions

### Security and engineering technique
- https://developer.chrome.com/blog/local-network-access · https://github.com/WICG/local-network-access/issues/115 · https://www.cs.ru.nl/bachelors-theses/2026/Aditya_Desai___1114348___Evaluating_the_Effect_of_Local_Network_Access_on_DNS_Rebinding_Attacks.pdf
- https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html · https://palant.info/2022/08/31/when-extension-pages-are-web-accessible/ · https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/_QYvKQ5woBI · https://v8.dev/blog/code-caching-for-devs · https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/renderer/script_context.cc
- https://bihui-jin.github.io/assets/pdf/emse25_google_extension.pdf (FSE 2026 journal-first) · https://www.debugbear.com/blog/chrome-extensions-website-performance
- https://www.bleepingcomputer.com/news/security/new-details-reveal-how-hackers-hijacked-35-google-chrome-extensions/ · https://blog.barracuda.com/2026/02/25/hidden-cybersecurity-risk-browser-extensions
- https://github.com/aclap-dev/video-downloadhelper/wiki/CoApp-not-recognized · https://discuss.privacyguides.net/t/is-it-safe-to-install-a-companion-app-with-a-firefox-extension/15127 · https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options · https://textslashplain.com/2026/04/28/smart-app-control/

## Open Questions

- **Answered 2026-08-21 (shipped store-wide).** The question was whether a remote
  disable-only feed survives AMO's remote-logic rule. Decision: it ships in every
  profile, and the reasoning is recorded in `docs/store-permission-rationale.md`
  under "Known-Breakage Notices and the remote-logic rule". The short version:
  restricting it to the GitHub build would withhold the repair channel from exactly
  the users who cannot self-update, and the mechanism is narrow enough to state in
  full — a row names a shipped feature ID, an issue number, and a version range, and
  the only thing that can happen as a result is `shouldFeatureBeActive` returning
  false one step after the user's own setting was read. It carries no code, no
  copy, no links, and no way to enable anything. Still not a ruling from Mozilla;
  Refined GitHub shipping the same mechanism on AMO remains the strongest evidence.
- **Are content scripts still excluded from V8 code caching?** The Chrome 123 change
  covered `chrome-extension://` pages; no commit was found enabling it for content
  scripts. This changes the size of the monolith-peel payoff and needs a tracing
  measurement, not an inference.
- **Which extension-page states can only be reached from a standalone fixture?** The a11y
  smoke uses fixture pages rather than the loaded extension; before converting it, decide
  which of its 6 surfaces × 50 states genuinely need a synthetic page (forced-colors,
  320px reflow, pseudolocale) and which are only fixtures because the harness predates
  extension loading.
- **Carried, operator-gated:** distribution order across Edge Add-ons / CWS / AMO /
  Greasy Fork — with the correction that Chrome's MV2 purge already completed in
  2024–2025 and the *live* displaced-user wave is Edge's, announced 2026-08-07 and
  running through end of 2026 against a reported 13M-install uBO population there.
- **Carried:** DeArrow license wire format; Ask-YouTube DOM capture (now shipped to all
  signed-in US users 13+ on desktop as of 2026-08-13, so the capture is newly feasible);
  Firefox Document PiP exposure to content scripts; the minimum cookie
  names/domains/partitions the released companion accepts.
