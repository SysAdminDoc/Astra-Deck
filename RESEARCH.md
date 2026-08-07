# Research — Astra Deck
Date: 2026-08-06 — replaces all prior research (previous pass: 2026-08-02).

## Executive Summary

[Verified] Astra Deck at v4.56.0 is a 96-file / 4.75 MB MV3 content-script bundle
(`extension/`, 56,236-line `ytkit.js` + 43 core modules + 33 selector packs + 25
peeled feature modules), a generated 2.60 MB Tampermonkey userscript, and — since
`a6bb685f` (2026-08-06) — a companion downloader that now lives in its own
repository. The engineering baseline is strong: **1,446 JS tests pass**, `npm run
check` chains 20+ gates, `npm audit` is clean at production scope, SBOM and
release-digest tooling exist, and eight of the ten opportunities from the
2026-08-02 pass have shipped or been verified fixed (`ageDays`/`isShort`/
`isMembersOnly` now compute from live DOM; `isLive`/`isUpcoming`/`isMix`/
`isPlaylist` carry 10-language alternations; the companion's chmod finding left
with the companion).

The constraint has moved again, and it is now unambiguous. **Every delivery
channel this project has is broken, ineligible, or unused, and the product is
therefore not reaching anyone.** GitHub reports 11 stars, 1 fork, 0 watchers, 22
repo views / 12 uniques over 14 days, and 11 total asset downloads on the newest
release (`gh api repos/SysAdminDoc/Astra-Deck`, `.../traffic/views`,
`.../releases`). 174 commits and six minor versions sit unreleased. Meanwhile the
one channel that *does* auto-update — the userscript — ships five dead controls.

Top opportunities, in priority order:

1. **Five shipped userscript controls call methods that do not exist.** Import,
   import-Undo, Takeout import, companion install-assist, and copy-install-command
   all `TypeError` on click for every Tampermonkey user. Live since 2026-07-09,
   included in the v4.50.7 release.
2. **The released Firefox XPI is unsigned**, so the install path the README
   documents cannot work on Firefox Release or Beta.
3. **174 commits are unreleased and the readiness gate fails only because no
   release build has been run** — plus the CRX key gate blocks a release that no
   longer needs a CRX.
4. **The store-safe profile ships `cookies` + `nativeMessaging` with no reachable
   consumer**, because the same profile strips the loopback hosts those
   permissions exist to serve.
5. **4.98 MB of content script is re-parsed on every YouTube navigation**, because
   Chrome does not code-cache content scripts. Lazy per-feature injection is the
   one investment that fixes startup cost, the Greasy Fork size cap, and store
   review time simultaneously.
6. **The userscript is 2.60 MB against Greasy Fork's 2 MB hard cap**, closing the
   largest free discovery channel available — though Greasy Fork *libraries* plus
   `@resource` are a documented compliant path over it.
7. **YouTube DOM knowledge is compiled into shipped releases**, so every YouTube
   CSS/DOM change costs a release cycle. Competitors are dying of exactly this.
8. **Chrome's built-in AI APIs have been stable in extensions since Chrome 138** —
   a local lane would delete three remote AI hosts from the permission string.
9. **Two gates are ratchets that hide large user-facing debt**: 1,604 hardcoded
   English literals and 277 light-theme-blind surfaces are grandfathered, not
   fixed.
10. **The highest-reacted unserved request in the entire OSS landscape is local**:
    photosensitive flash detection (79 👍 on SponsorBlock #403), feasible on the
    per-frame video-filter pipeline Astra already owns.
11. **SponsorBlock/DeArrow endpoints are hardcoded with no mirror**, the exact
    single-point-of-failure that just degraded Return YouTube Dislike.

## Product Map

- **Core workflows:** customise YouTube playback/layout/discovery; filter feeds,
  comments and subscriptions with a predicate DSL; capture transcripts, notes,
  bookmarks and media; diagnose selector/API/storage health; download through the
  separate local companion.
- **User personas:** YouTube power users, focus/privacy users, researchers and
  note-takers, multilingual and accessibility users, Windows media archivists.
- **Platforms and distribution:** Chrome/Edge/Brave and Firefox 142+ MV3 packages
  in store-safe and GitHub-full profiles, a Tampermonkey/Violentmonkey userscript,
  and an externally-released Windows companion. Distribution is GitHub Releases
  only — no store listing, no Greasy Fork listing, no auto-update on the
  extension tier. Mobile browsers, YouTube Music, Studio and embeds are out of
  scope by policy.
- **Key integrations and data flows:** YouTube DOM/player and InnerTube;
  SponsorBlock, DeArrow, Return YouTube Dislike, Reddit, Cobalt, BYO AI providers,
  Ollama. Extension→companion traffic is authenticated loopback HTTP on
  `127.0.0.1:9751` plus five fallback ports, routed entirely through the service
  worker's `EXT_FETCH` bridge — re-verified this pass: the only bare `fetch()`
  calls in ISOLATED content-script code are `extension/ytkit.js:202`
  (`chrome-extension://` locale load) and `:22215` (`youtube.com/about`).
- **Tier parity:** 159/270 feature IDs reach the userscript (59%); 19 are
  classified `not-yet-ported` at the gate's cap. The userscript ships **no locale
  catalogues at all** — the 11-locale UI is extension-only, which the README's
  Languages section does not qualify.

## Competitive Landscape

- **ImprovedTube** (`code-charity/youtube`, 4,518★, 1,453 open, pushed 2026-08-05)
  — the best public demand signal in the space. Top open asks: list feed view
  (#3593, 19 👍), buffer/preload (#581, 13 👍), original audio track (#2716, 12 👍),
  kill "Most relevant" sub sort (#3658, 12 👍), filter auto-dubbed (#3150, 8 👍).
  Issue **#4104** is an exhaustive audit of the Greasy Fork userscript ecosystem;
  Astra already ships ~20 of its 24 filed items, so the *unfiled tail* (5-band EQ,
  channel-ID/country reveal, real-time subscriber count, animated-thumbnail
  restore) is the useful part. **Learn:** demand ranking. **Avoid:** 1,453 open
  issues, release notes that are contributor lists, and unreviewed LLM PRs the
  maintainer now has to triage.
- **SponsorBlock / DeArrow** (13,521★ / 2,236★, both pushed 2026-08-05) — the
  commons Astra reads from, and the source of the largest single feature demands
  anywhere: photosensitive flash category (#403, 79 👍), sponsored comments and
  descriptions (#649, 40 👍), mirror/fallback server (#1562, 28 👍), visual segment
  masking (#538, 25 👍), skip-once (#1997, 20 👍). DeArrow shipped **seven**
  emergency fixes in 2026 for YouTube class/format churn. **Learn:** published DB
  dumps under CC BY-NC-SA and a self-hostable server. Astra already consumes the
  k-anonymity hash-prefix endpoint (`/api/skipSegments/${prefix}`,
  `extension/features/sponsorblock/index.js:266`), so the lesson there is to hold
  that pattern for any *future* crowd lookup, not to adopt it. **Avoid:**
  submission without an appeals path — its worst reviews are "a moderator approved
  a wrong segment and I can't fix it."
- **Return YouTube Dislike** (13,696★, no commit since 2026-05-02) — the market's
  stated reason for shopping for a no-telemetry alternative. Issue #1235
  ("Please reconsider the freemium model!", 26 👍) documents the trust collapse
  after the Oct-2025 ad injection; #1274 ("not working anymore", 55 👍), #1288
  ("Firefox extension out of date", 54 👍) and #1294 (Shorts dislike button gone,
  27 👍) are all open and unfixed. **Learn:** Astra's no-telemetry, credential-scrub,
  SBOM posture is exactly what these users are now shopping for — and Shorts
  dislikes are an unclaimed feature. **Avoid:** any post-install behaviour change
  not disclosed at install.
- **BlockTube** (1,383★, stalled since 2026-02-07, 484 open) — the clean migration
  target. Its users' unmet asks are all filter *ergonomics*: subscribable remote
  blocklists (#508, #384), cross-device sync (#59, 11 👍), members-only blocking
  (#418, 12 👍), and "show which filter triggered a block" (#304). **Learn:** rule
  distribution and attribution. **Avoid:** a second rule language.
- **Control Panel for YouTube** (356★, ~2 releases/month) — the healthiest cadence
  in the field, and the clearest warning: **eight of its eleven 2026 releases are
  pure YouTube-breakage repair**, including two separate CSS-variable regressions
  in May 2026. **Learn:** nothing to copy feature-wise. **Avoid:** the entire
  old-UI-restoration class, which is what generates that repair load.
- **Enhancer for YouTube** (370★) — abandoned Firefox/AMO in Aug 2025 citing
  YouTube churn *plus* review latency, and is parked mid-rewrite behind five
  refactor RFCs (#1347–#1351) filed 2026-06/07 with zero comments. **Learn:** its
  open audio-sync/EQ demand. **Avoid:** #1320 (memory exhaustion per new video)
  and #1361 (blocks YouTube entirely alongside uBlock Origin).
- **Iridium** — archived 2026-01-31; last real commit was **2024-09-18**, so it was
  dead 16 months before archival. Users are routed to Enhancer, Unhook and Zenith
  — and **Zenith is proprietary freemium, Unhook is closed-source**, so there is
  no OSS successor. That migration window is genuinely unclaimed.
- **2026 risers, each proving one idea:** ZeroDelay (433★ in six weeks — live-stream
  latency catch-up), TubeSize (256★ since 2026-02 — per-quality data-usage estimate
  before play), CombatSlop (crowd-voted AI-slop tags). **Learn:** single-idea
  extensions are still winning stars; Astra has the substrate for all three.
- **Commercial tier — what is paywalled is the roadmap.** Glasp gates *auto-sync to
  Notion* and *channel-level watching* ($12.50–$30/mo), not summarization;
  Readwise Reader's $9.99/mo is the highlight→export loop; Eightify/NoteGPT/Snipd
  sell nothing but volume caps, which BYO-key makes worthless. PocketTube converts
  ~0.8% of 300K users at $3+/mo (2,333 Patreon members, $5,194/mo) — and its worst
  reviews are the upsell popups. **Learn:** the export loop is the real product.
  **Avoid:** competing on feature count against Enhancer's 1M users.

## Security, Privacy, and Reliability

- **[Verified] Five user-facing userscript controls throw on click.**
  `YTKit.user.js` bundles `features/settings-panel/index.js`, which calls
  `settingsManager.importAllSettingsDetailed` (`:26085`),
  `settingsManager.undoLastSettingsImport` (`:26100`),
  `settingsManager.importYouTubeTakeoutWatchHistory` (`:26135`),
  `MediaDLManager.runInstallAssist` (`:25385`, `:25610`) and
  `MediaDLManager.copyInstallCommand` (`:25406`). Each appears **exactly once** in
  the file — the call site — with no definition. The userscript's own
  `settingsManager` (`:31933`) implements only `importAllSettings`, and its
  `MediaDLManager` (`:30495`) implements neither install-assist method. All five
  are defined in `extension/ytkit.js` (`:4414`, `:4630`, `:4639`) and
  `extension/features/download-ui/index.js` (`:481`, `:499`). Introduced by
  `9d787b13` (2026-07-09) and present in the published `v4.50.7` artifact.
  `Roadmap_Blocked.md:270` predicted this as a future risk; it has already
  happened.
- **[Verified] A second shipped feature is inert, and is correctly filed elsewhere.**
  DeArrow vote submission posts to an endpoint that 404s on every call; `bc09e460`
  moved it to `Roadmap_Blocked.md` rather than fixing it, because the fix writes to
  a live third-party public database and needs a maintainer liability call first.
  Noted here so the shipped-defect picture is complete — do not open a second item.
- **[Verified] No gate detects cross-boundary symbol breakage.**
  `scripts/check-userscript-drift.js` proves the 44 bundled modules are
  byte-identical to source — which is precisely how these calls arrived intact
  while their callees did not. Nothing checks that a bundled module's calls into
  the userscript monolith resolve. A ~30-line static resolver over
  `<singleton>.<method>(` would have caught all five.
- **[Verified] The released Firefox XPI is unsigned.**
  `astra-deck-store-safe-firefox-v4.50.7.xpi` contains no `META-INF/`, no
  `mozilla.rsa`, no `manifest.mf` — it is a renamed ZIP, which is exactly what
  `build-extension.js:764-765` produces ("XPI is just a ZIP with .xpi extension"),
  with no signing step anywhere in the build. Firefox Release and Beta refuse unsigned XPIs, so README:45-51
  ("Install Add-on From File") works only on Developer Edition, Nightly, or ESR
  with `xpinstall.signatures.required=false`. The free AMO unlisted-signing channel
  returns a signed XPI in seconds and enables `gecko.update_url` auto-update; note
  this is Mozilla-side signing with no certificate purchase, so it sits inside the
  repo's no-code-signing policy's "platform physically refuses" escape hatch —
  but the tension should be recorded deliberately, not assumed away.
- **[Verified] The store-safe profile ships two sensitive permissions with no
  reachable consumer.** `extension/manifest.json:25-32` declares `cookies` and
  `nativeMessaging`; `build-extension.js:527-538` rewrites only `host_permissions`,
  `optional_host_permissions`, CSP and `web_accessible_resources`, never
  `permissions`. Both exist solely for the companion — `cookies` via
  `EXT_COOKIE_LIST` (`background.js:1324`) → `browserCookies` (`ytkit.js:812`) →
  `download-ui/index.js:1302-1319`; `nativeMessaging` via
  `ext.runtime.connectNative('com.astra.deck.downloader')` (`background.js:1390`)
  — and the companion origin is `profile: 'github-full'`
  (`extension/core/data-flow.js:44-56`), so store-safe strips all six loopback
  hosts. `docs/store-permission-rationale.md:101,103` justifies both permissions to
  reviewers in terms of a capability the store-safe build cannot exercise.
- **[Verified] Distribution is the largest reliability risk to users, and it is
  quantified now.** 174 commits / six minor versions unreleased;
  `node scripts/generate-release-readiness.js` fails on exactly three checks —
  missing `build/release-manifest.json`, `build/astra-deck-npm-sbom.cdx.json`, and
  `build/SHA256SUMS` — all produced by `npm run build:userscript`, none blocked
  externally. The CRX half *is* key-gated (`build/crx-signing-provenance.json`
  reports `"mode": "ephemeral"`; no `%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem`,
  `ASTRA_CRX_KEY_PATH` unset), but self-hosted CRX installs are Linux-only on
  modern Chrome and the last two published releases shipped no CRX at all — so the
  key should not gate the release. `build-extension.js` has no flag to skip CRX
  production, which is what makes it look like a blocker.
- **[Verified] Local dependency posture is good with one live advisory.**
  `npm audit --omit=dev` is clean; the full-scope audit reports one HIGH
  (`js-yaml` 4.3.0, CVE-2026-59870 quadratic CPU) reaching the tree only through
  `web-ext@10.4.0 → addons-linter → eslint@9.39.4`. `web-ext` 10.6.0 and `ws`
  8.21.2 are available. The `brace-expansion` pin at exactly 5.0.9 matches an
  advisory published **2026-08-03** — six advisories in 14 months makes an exact
  pin a recurring maintenance obligation, not a fix.
- **[Verified] Chrome Local Network Access remains architecturally mitigated.**
  Chrome 142 shipped LNA; extension requests with matching `host_permissions` are
  exempt, content-script-originated ones are not. Re-verified above that no
  content script issues a loopback `fetch()`. No new work warranted; the
  live-browser confirmation stays in `Roadmap_Blocked.md`.
- **[Likely] Neither Chromium store will take the product intact, and three
  manifest facts are why.** Chrome Web Store policy prohibits extensions that
  "encourage, facilitate, or enable the unauthorized access, download, or streaming
  of copyrighted content"; Microsoft Edge §2.8 is verbatim the same hazard.
  Precedent is concrete — Video Downloader Ultimate states publicly that it stripped
  YouTube downloading from its Chrome build to stay listed. The three things a
  reviewer keys on are all in `extension/manifest.json`: `https://api.cobalt.tools/*`
  (a YouTube-download API) in `host_permissions`, **seven** `http://127.0.0.1:*`
  origins against the "narrowest permissions necessary" rule, and a feature module
  named for downloading alongside the `downloads` permission. The one pattern that
  survives review is detect-in-extension / capture-in-companion behind
  `nativeMessaging` — which is architecturally what Astra already is. Edge is the
  cheaper door of the two ($0 with government-ID verification, versus $5 and a
  28-business-day queue as of Google's 2026-04-23 PSA) and its §1.2.3 *explicitly*
  permits a non-integrated companion app when disclosed in the description.
  Whatever is decided, it should be recorded as a policy decision rather than left
  as inertia.
- **[Verified] Accessibility and i18n gates are ratchets, not clean bills of
  health.** `npm run i18n:copy:gate` passes with **1,604 hardcoded English
  literals** grandfathered in `scripts/i18n-ui-copy-baseline.json` (1,273 in
  `ytkit.js` alone; the Video Notes panel at `ytkit.js:22902-22942` is entirely
  unwrapped). `npm run audit:light-theme` passes with **277 legacy surfaces
  accepted** against 89 that carry a light lane. `npm run audit:contrast` checks
  six hand-listed colour pairs from `popup.css` and nothing else.
  `audit-popup-a11y.js` and `audit-overlays-a11y.js` are static string-presence
  checks over source text — they cannot see a new defect that does not match an
  existing assertion, as the watch-time dialog proved when it shipped with no
  dialog semantics.

## Architecture Assessment

- **[Verified] YouTube DOM knowledge is compiled into releases.** 33 selector
  packs, `early.css`, `live-chat.css` and thousands of inline selectors ship as
  frozen artifacts, so a YouTube change costs a full release cycle — on a channel
  where the last release is 174 commits old. Control Panel for YouTube logged two
  CSS-variable regressions in May 2026 alone; DeArrow shipped seven emergency
  fixes in 2026; the Obsidian ecosystem saw transcript selectors break twice in
  two months. uBlock Origin's answer — a versioned rule asset with differential
  updates (`Diff-Path`/`Diff-Expires`, per-block SHA-1) served from multiple CDNs
  — converts this from a release problem into an hours problem.
- **[Verified] The dual-artifact tax is still the dominant maintenance cost, and
  it now has a correctness failure mode.** `extension/ytkit.js` (56,236 lines) and
  `YTKit.user.js` (46,541 lines) must move together; the byte-for-byte drift gate
  guarantees the *bundle* matches while the surrounding monolith silently
  diverges (see the five broken calls above). `Roadmap_Blocked.md` already owns
  the canonicalisation work — do not open a second item.
- **[Verified] The userscript is over Greasy Fork's cap, and the compliant fix is
  known.** `YTKit.user.js` is 2,729,479 bytes against a hard
  `MAX_CODE_LENGTH = 2.megabytes` (2,097,152 B) enforced on create
  (`greasyfork-org/greasyfork` `app/models/script_version.rb`), with minifying-to-fit
  explicitly forbidden. Two mechanisms exist and both are in the rules: **Greasy
  Fork *libraries*** are separate `Script` records with their own 2 MB budget and
  are on the `@require` allowlist (`update.greasyfork.org/scripts/…`), so the code
  still lives on Greasy Fork and `code_rules.hosting` is satisfied; and
  **`@resource` is exempt from the CDN allowlist entirely** — "these rules only
  apply to external, executable code. Loading non-executable code, for example JSON
  or CSS, is not restricted." That covers the 644 KB (23.7%) of CSS in template
  literals, the 11 locale catalogues, and the SVG icon set. `raw.githubusercontent.com`
  is **not** on the `@require` allowlist; jsDelivr is, but only with a 40-hex commit
  SHA, and parking the bulk there violates the hosting rule.
- **[Verified] Startup is measured on the wrong fixture, and the platform does not
  amortise the cost.** `scripts/startup-performance-baseline.json` records 97.2 ms
  median parse+init against `scripts/smoke-settings-overlay.js::buildFixture` — a
  synthetic page, not youtube.com — and measures neither memory nor steady-state
  observer cost. The real number is worse than the fixture suggests because
  **Chrome does not V8-code-cache content scripts**: per Chromium's own tracking
  bug, "extensions don't use the v8 compile cache (recompiling content scripts for
  every frame)" and isolated-world creation alone accounts for ~30% of extension
  overhead. So 4.98 MB across 96 files is re-parsed and re-compiled on **every**
  YouTube navigation and frame, not once per session. For scale: DebugBear measured
  Evernote Web Clipper's 2.9 MB content script at 140 ms parse/compile + 300 ms
  evaluate (559 ms total page CPU), which already put it in the worst ~1.7% of
  extensions — Astra's ISOLATED bundle is 1.7× that. SponsorBlock does full
  segment skipping on YouTube in a **115 KB** content script, 43× smaller. CPU and
  freezing are a top-3 recurring 1-star theme for every competitor in this space.
- **[Verified] Test coverage is strong in aggregate, thin on the two largest
  features.** 1,446 tests across 69 + 41 files, and every `core/` module basename
  appears somewhere. The uncovered-by-name modules are
  `extension/features/sticky-video/index.js` (5,016 lines) and
  `extension/features/settings-panel/index.js` (3,419 lines) — the two biggest
  feature files in the repo, and the second is where the five broken userscript
  calls originate.
- **[Verified] Stale references left by the companion split.**
  `.factory/audit-workflow.js:94-100` still targets `astra_downloader/astra_downloader.py`
  for two audit tasks; `docs/predicate-sandbox-investigation.md` still says the
  sandbox is "not yet enabled in any shipped feature" while
  `core/predicate-sandbox.js` is the live DSL evaluator behind Video Hider; README
  still tells users to `pip install pip-audit` (README:416), references a removed
  `npm run audit:python` (README:447), contains the typo `repositoryN` (README:419),
  claims "10 bundled UI locales" against 11 (README:15), and points at a
  "competitive matrix in ROADMAP.md" that no longer exists.
- **[Verified] `isMovie` and `isAutoDubbed` are still English-only** in the Video
  Hider metadata extractor (`extension/features/video-hider/index.js` ~`:1211`,
  mirrored `extension/ytkit.js:17954`) while their four siblings gained 10-language
  alternations. `scripts/check-localized-selectors.js` caps English `aria-label`
  debt at 25 grandfathered file+selector pairs — it prevents growth, it does not
  shrink it.
- **[Likely] Platform capability now exceeds what the codebase uses.** Chrome 148
  makes the `browser` namespace native and lets `runtime.onMessage` return a
  Promise; Chrome 150 adds a `tab` context to `contextMenus` and a 1024-byte alarm
  name limit; Firefox 153 adds `runtime.getDocumentId()` (stable per-document keys
  for SPA navigation), `adoptedStyleSheets` access from content scripts, and
  `userScripts.execute()`. On the web-platform side, Popover, `@scope`,
  `::highlight`, Navigation API, `Intl.DurationFormat`, `RegExp.escape()` and
  Document Picture-in-Picture (Chrome 130 / **Firefox 151**) all reached
  Baseline or cross-target availability in 2025–2026.

## Rejected Ideas

- **Old-player-UI restoration** — [Rejected, re-confirmed] Control Panel for
  YouTube spent eight of eleven 2026 releases repairing exactly this feature class.
  Demanded (ImprovedTube #3259, 9 👍) and still unmaintainable by construction.
- **Piped / Invidious / alternative-frontend support** — [Rejected] 53 👍 on
  DeArrow #39 and every awesome-privacy list points there, but it is a non-YouTube
  surface, and Safari 18.4+ permission changes already forced SponsorBlock to
  *drop* Invidious support.
- **Astra on embedded YouTube players** — [Rejected 2026-08-06, unchanged] needs a
  build-time slim bundle; contradicts the deep-equal live_chat bundle invariant in
  `tests/build-fixes.test.js`.
- **Route loopback traffic through the service worker for Chrome LNA** —
  [Rejected] already the shipped architecture; re-verified this pass at
  `extension/ytkit.js:202`/`:22215` being the only bare content-script fetches.
- **Listing the full product on Chrome Web Store or Edge Add-ons** — [Rejected]
  downloader adjacency (`downloads` + `api.cobalt.tools` + a download-named module)
  is an enforced rejection class under CWS policy and Edge §2.8, and CWS tightened
  Limited Use enforcement on 2026-08-01. A *download-free* build on those stores as
  a discovery funnel is not rejected — it is a live option, gated on the manifest
  slimming below.
- **`@require`-ing the userscript bulk from raw.githubusercontent.com or jsDelivr**
  — [Rejected] `raw.githubusercontent.com` is not on Greasy Fork's `@require`
  allowlist at all, and jsDelivr (allowed only with a 40-hex commit SHA) still
  violates `code_rules.hosting`: "a script that simply loads the bulk of the script
  from somewhere else is not allowed." Greasy Fork *libraries* plus `@resource` are
  the compliant mechanisms.
- **Moving feature code into `world: MAIN` for startup speed** — [Rejected] the
  manifest world gives no material parse/compile advantage; the wins developers
  report come from *dynamic* injection via the service worker. MAIN also loses
  `chrome.*` and is page-readable. Astra's 95 KB MAIN shim is already correctly
  sized.
- **Waiting for the platform to fix content-script parse cost** — [Rejected]
  Chromium's tracking bug for extension content scripts missing the V8 compile
  cache is open with no 2026 change; V8's code-caching improvements apply to page
  scripts, not content scripts.
- **Cloud accounts, multi-user companion, or Google-Drive settings sync** —
  [Rejected] adds identity and tenancy to a single-user design. Note
  `chrome.storage.sync` caps at 102,400 B total / 8,192 B per item / 512 items,
  which a 446-key settings blob cannot fit anyway — only a diff-from-default could.
- **Building a crowdsourced Astra server** (AI-slop votes, private-equity labels,
  sponsored-comment marks) — [Rejected] contradicts the no-cloud, no-telemetry,
  no-accounts posture and reproduces Return YouTube Dislike's exact failure mode.
  Where crowd data is genuinely required, federate to an existing commons and use
  k-anonymity hash-prefix lookup; otherwise take the local-compute path.
- **Mobile-browser port** — [Rejected] README excludes it; NewPipe/LibreTube/
  SmartTube serve it natively and all three are actively maintained.
- **Multi-site downloader in the extension** — [Rejected] the companion already
  does any-site downloads in its own repo behind its own SSRF boundary; duplicating
  the policy here would fork it.
- **`chrome.userScripts`-based arbitrary JS plugins** — [Rejected] since Chrome 138
  it needs a per-extension toggle that defaults **off** for every new install and
  cannot be requested programmatically (w3c/webextensions#740).
- **aria2c / `--external-downloader`** — [Rejected] banned in the companion over
  CVE-2026-50574; enforced by a pinned test there.
- **Remote telemetry or crash upload** — [Rejected] contradicts the published
  privacy policy and is the specific thing this project's target users are fleeing.
- **Watch-time analytics as a positioning axis** — [Rejected] commoditized; several
  free CWS trackers do it. Keep the feature, do not market on it.
- **Enterprise `storage.managed` policy provisioning** — [Rejected for now] still
  sourced only from a single BlockTube request with no Astra-side demand.

## Sources

### OSS competitors and demand trackers
- https://github.com/code-charity/youtube/issues/4104
- https://github.com/code-charity/youtube/issues/3593
- https://github.com/ajayyy/SponsorBlock/issues/403
- https://github.com/ajayyy/SponsorBlock/issues/649
- https://github.com/ajayyy/SponsorBlock/issues/1562
- https://github.com/ajayyy/SponsorBlock/issues/1963
- https://github.com/ajayyy/SponsorBlock/wiki/K-Anonymity
- https://github.com/ajayyy/DeArrow/releases
- https://github.com/Anarios/return-youtube-dislike/issues/1235
- https://github.com/Anarios/return-youtube-dislike/issues/1294
- https://github.com/amitbl/blocktube/issues/508
- https://github.com/amitbl/blocktube/issues/304
- https://github.com/insin/control-panel-for-youtube/releases
- https://github.com/YouTube-Enhancer/extension/issues/1320
- https://github.com/ParticleCore/Iridium
- https://github.com/joaogfc/ZeroDelay
- https://github.com/MohamedSayed0573/TubeSize_Extension
- https://github.com/BMHeades/combatslop-yt
- https://github.com/varshneydevansh/FilterTube/issues/58
- https://alternativeto.net/software/iridium-by-particlecore/

### Platform, standards and store policy
- https://developer.chrome.com/docs/extensions/whats-new
- https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace
- https://developer.chrome.com/blog/local-network-access
- https://developer.chrome.com/blog/cws-policy-updates-2026
- https://developer.chrome.com/blog/chrome-userscript
- https://developer.chrome.com/docs/ai/built-in-apis
- https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/
- https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/
- https://extensionworkshop.com/documentation/publish/self-distribution/
- https://extensionworkshop.com/documentation/manage/updating-your-extension/
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://greasyfork.org/en/help/code-rules
- https://github.com/greasyfork-org/greasyfork/blob/master/app/models/script_version.rb
- https://sleazyfork.org/en/help/cdns
- https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies
- https://www.chromium.org/developers/extensions-deployment-faq/
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VJ6DcpEn51Y
- https://webstatus.dev

### Distribution, supply chain and security
- https://github.com/gorhill/uBlock/wiki/Dashboard:-Filter-lists
- https://github.com/uBlockOrigin/uAssetsCDN
- https://github.com/gorhill/uBlock/blob/master/platform/mv3/extension/js/scripting-manager.js
- https://github.com/ajayyy/SponsorBlock/blob/master/manifest/chrome-manifest-extra.json
- https://www.debugbear.com/blog/2020-chrome-extension-performance-report
- https://www.debugbear.com/blog/chrome-extensions-website-performance
- https://issues.chromium.org/issues/40480216
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://socket.dev/blog/108-chrome-ext-linked-to-data-exfil-session-theft-shared-c2
- https://thehackernews.com/2026/06/chrome-ad-blocker-with-10m-installs.html
- https://thehackernews.com/2026/03/chrome-extension-turns-malicious-after.html
- https://nodejs.org/en/blog/vulnerability/july-2026-security-releases
- https://osv.dev
- https://piunikaweb.com/2026/07/08/google-chrome-manifest-v2-web-store-removal-date/

### Community signal and the paid tier
- https://news.ycombinator.com/item?id=47016443
- https://news.ycombinator.com/item?id=45696329
- https://news.ycombinator.com/item?id=44962001
- https://addons.mozilla.org/en-US/firefox/addon/enhancer-for-youtube/reviews/?score=1
- https://addons.mozilla.org/en-US/firefox/addon/youtube-subscription-groups/reviews/?score=1
- https://addons.mozilla.org/en-US/firefox/addon/sponsorblock/reviews/?score=1
- https://glasp.co/pricing
- https://variety.com/2026/digital/news/youtube-premium-pirce-increase-youtube-music-us-1236713223/
- https://forum.obsidian.md/t/web-clipper-youtube-video-transcript-for-yts-ui-feb-2026-update/111550
- https://github.com/jdepoix/youtube-transcript-api/issues/593
- https://github.com/yt-dlp/yt-dlp/issues/15012

## Open Questions

- **Is Firefox auto-update via AMO unlisted signing acceptable under the repo's
  no-code-signing policy?** The policy bans purchased certificates and notarization;
  AMO unlisted signing is free, automated, Mozilla-side, and the *only* way an XPI
  installs on Firefox Release at all. Whether that counts as the policy's
  "platform physically refuses" escape hatch is a maintainer call that decides
  whether Firefox is a supported target or a Developer-Edition-only one.
- **Should the Chromium stores get a download-free build?** Greasy Fork and Firefox
  can carry the product intact; CWS and Edge cannot. A download-free build is a
  fourth artifact to keep in parity — the cost this repo already pays most — in
  exchange for the only discovery surfaces with real volume. Edge additionally
  requires government-ID + selfie verification, which is an operator action, not an
  engineering one.
- **SponsorBlock submission identity and abuse posture.** Unchanged from the prior
  pass: `postSkipSegments`/`voteOnSponsorTime` need a persisted private `userID`,
  a new durable identifier and a new outbound write path. Whether to carry
  submission at all — versus voting only, versus neither — changes the design.
