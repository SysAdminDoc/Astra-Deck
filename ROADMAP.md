# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope. Only the clean-Windows-machine verification half remains blocked, and the asset itself now ships from `SysAdminDoc/AstraDownloader`. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (last real commit 2024-09-18) and its users are being routed to Enhancer, Unhook and Zenith — none of which is OSS-and-maintained, so there is no OSS successor. BlockTube is stalled (last push 2026-02-07, 484 open issues). A BlockTube migration guide plus an Iridium-successor note is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

- `Roadmap_Blocked.md` "P0 — Tag and publish the v4.51.1 release" was **version-stale and mis-blocked**. **Rewritten in place 2026-08-06** — retargeted to v4.56.0 and its blocker corrected. For the record: the CRX-key framing was wrong, because self-hosted CRX installs are Linux-only on modern Chrome and the last two published releases (v4.50.2, v4.50.7) shipped **no CRX at all**, so the missing `ytkit.pem` never gated a ZIP/XPI/userscript release. What actually fails is `node scripts/generate-release-readiness.js`, on three checks only (missing `build/release-manifest.json`, `build/astra-deck-npm-sbom.cdx.json`, `build/SHA256SUMS`) — all produced by `npm run build:userscript`, and the CRX check is not among them. See "Cut a release without a CRX" below for the code change that makes this a one-command path.

- `Roadmap_Blocked.md` "P2 — Userscript bundle is stale; next sync will break Import" had **already materialised** — the bundle was resynced and the breakage shipped. **Narrowed in place 2026-08-06** to the Tampermonkey verification half and retitled; the porting half is programmatic and is tracked below as a P0. The two are no longer duplicates: do the P0 here, confirm it there.

- `Roadmap_Blocked.md` "P2 — Audio auto-gain / high-pass chain" should **absorb multi-band EQ** rather than spawning a second item: `BiquadFilterNode` stages sit on the same MAIN-world audio graph the item already covers, and a 5-band EQ is the specific thing Enhancer's users ask for and Zenith paywalls. Its stated blocker is the stale "this run forbids staging Markdown" session constraint, which does not apply now.

- `Roadmap_Blocked.md` "P3 — Chrome Writer/Rewriter API" is correctly blocked (still Developer Trial), but it should **not** be read as covering Chrome's built-in AI generally: Translator, Language Detector, Summarizer and the Prompt API have been **stable in extensions since Chrome 138**. That lane is unblocked and is tracked separately below.

- Six `Roadmap_Blocked.md` items (Force DVR, replay chat-density chart, opt-in settings sync, logarithmic volume curve, volatile-project-facts gate, immutable build-profile ceilings) cite a self-imposed "this run forbids staging Markdown other than README/CHANGELOG" constraint as their blocker. That is not an external blocker. Move them back to this file on the next pass.

- `Roadmap_Blocked.md:314` "P2 — Opt-in settings/blocklist sync (`storage.sync`)" and "Subscribable and exportable filter lists" below are **adjacent, not duplicates** — do not build both without deciding which. Sync moves a user's own rules between their own devices; subscribable lists move *other people's* rules to everyone. Note also that `chrome.storage.sync` caps at 102,400 B total / 8,192 B per item / 512 items, which the 446-key settings bag cannot fit — only a diff-from-default could, which the sync item does not currently say.

- `Roadmap_Blocked.md:419,427` "P3 — Userscript-tier survey (Greasy Fork)" (filed twice, near-duplicates — merge them) is **partly unblocked**: Greasy Fork still 403s automated fetches, but the same Rails application serves its help and CDN-allowlist pages at `sleazyfork.org`, which does not, and the rules themselves are readable in `greasyfork-org/greasyfork` (`app/models/script_version.rb`, `config/locales/en.yml`). Install counts still need a manual paste. That is enough to have settled the listing mechanics this pass — see "List the userscript on Greasy Fork" below.

## Status

Open items below are from the 2026-08-06 research pass. Earlier backlogs
(competitive-feature additions, audit drains, research and hardening waves) are
drained — shipped work lives in git history and `CHANGELOG.md`.

## Research-Driven Additions

### P0 — Shipped defects and delivery

- [ ] P0 — Cut a release without a CRX
  Why: 174 commits and six minor versions are unreleased. The release is not actually key-gated — the last two published releases shipped no CRX, and self-hosted CRX only installs on Linux — but `build-extension.js` always produces one, and `generate-release-readiness.js` then fails the build as ephemeral-signed.
  Evidence: `build/crx-signing-provenance.json` reports `"mode": "ephemeral"`; `scripts/generate-release-readiness.js:238-243` fails unlabeled ephemeral CRX assets; `build-extension.js` exposes only `--with-userscript`, `--bump`, `--profile`, `--crx-key`, `--crx-key-mode`; `gh release view v4.50.7` lists ZIP/XPI/userscript/SBOM assets and no `.crx`.
  Touches: `build-extension.js`, `scripts/generate-release-readiness.js`, `package.json`, `README.md` (Building section)
  Acceptance: `node build-extension.js --with-userscript --no-crx` produces ZIP/XPI/userscript/SBOM/manifest/SHA256SUMS with no CRX in `build/`, and `npm run release:readiness -- --require-pass` exits 0 with no maintainer key present.
  Complexity: S

### P1 — Trust, correctness, and distribution mechanics

- [ ] P1 — Strip `cookies` and `nativeMessaging` from the store-safe profile
  Why: store-safe declares two of Chrome's most review-sensitive permissions while removing the only thing that consumes them, so the artifact requests capability it cannot exercise and the store rationale document justifies it on a false premise.
  Evidence: `extension/manifest.json:25-32` declares both unconditionally; `build-extension.js:527-538` rewrites only `host_permissions`, `optional_host_permissions`, CSP and `web_accessible_resources`. Both serve the companion alone — `cookies` via `EXT_COOKIE_LIST` (`extension/background.js:1324`) → `browserCookies` (`extension/ytkit.js:812`) → `extension/features/download-ui/index.js:1302-1319`; `nativeMessaging` via `connectNative('com.astra.deck.downloader')` (`extension/background.js:1390`). The companion origin is `profile: 'github-full'` (`extension/core/data-flow.js:44-56`).
  Touches: `build-extension.js`, `extension/core/data-flow.js`, `docs/store-permission-rationale.md:101,103`, `tests/build-fixes.test.js`
  Acceptance: the store-safe manifest omits `cookies` and `nativeMessaging`; a test pins the store-safe `permissions` array; the rationale doc scopes both entries to the GitHub-full profile.
  Note: this is the concrete defect inside the scope of `Roadmap_Blocked.md` "P1 — Make build profiles immutable capability ceilings with a verified permission matrix". Do this one first — it is the smallest true statement of that item and needs no matrix design; land it before attempting the ceiling work so the two do not conflict over `docs/store-permission-rationale.md`.
  Complexity: M

- [ ] P1 — Repair README claims that no longer hold
  Why: the public front door misstates locale count, points at a deleted document, instructs users to install a tool for a removed script, and promises a CRX the last two releases did not ship.
  Evidence: README:15 says "10 bundled UI locales" against 11 and cites a "competitive matrix in ROADMAP.md" that no longer exists; README:416 says `pip install pip-audit` for a companion that left the repo; README:419 has the typo `repositoryN`; README:447 references `npm run audit:python`, absent from `package.json`; README:43 describes an attached CRX that v4.50.2 and v4.50.7 do not carry; the Languages section does not say the 11 locales are extension-only (`YTKit.user.js` bundles no locale catalogue).
  Touches: `README.md`
  Acceptance: every claim in the README resolves against the current tree and the newest published release; a reader following the install steps for any tier reaches a working install or an accurate limitation.
  Note: this is the manual repair; `Roadmap_Blocked.md` "P1 — Generate volatile project facts and fail documentation drift" is the generator that would stop it recurring, and it names the same locale-count defect. Fix the text here, then let that item pin it. README is self-contradictory on this point — `:15` says 10 locales, `:374` says 11, and 11 is correct.
  Complexity: S

- [ ] P1 — Internationalise `isMovie` and `isAutoDubbed` detection
  Why: their four siblings (`isLive`, `isUpcoming`, `isMix`, `isPlaylist`) gained 10-language alternations; these two still match English metadata only, so the predicates are permanently false on 10 of 11 shipped locales.
  Evidence: `extension/features/video-hider/index.js` ~`:1211` and the mirrored copy at `extension/ytkit.js:17954` use `/\b(movie|free with ads|buy or rent|rent or buy)\b/` and `/\b(auto[-\s]?dubbed|dubbed|audio track)\b/`.
  Touches: `extension/features/video-hider/index.js`, `extension/ytkit.js`, `YTKit.user.js` (via `node sync-userscript.js`), `tests/features/video-hider.test.js`
  Acceptance: both predicates match the ES/DE/FR/IT/RU/JA/KO/ZH/AR strings their siblings already cover, pinned by tests driving localised fixture text.
  Complexity: S

- [ ] P1 — Clear the standing dev-dependency advisory and refresh exact pins
  Why: `npm audit` reports one HIGH that reaches the tree only through the toolchain, and two exact pins are one advisory away from stale.
  Evidence: `js-yaml` 4.3.0 (CVE-2026-59870, quadratic CPU) via `web-ext@10.4.0 → addons-linter → eslint@9.39.4`; `web-ext` 10.6.0 and `ws` 8.21.2 are published; the `brace-expansion` override pins exactly 5.0.9, which is the fix for an advisory published 2026-08-03 — the sixth in 14 months.
  Touches: `package.json`, `package-lock.json`
  Acceptance: `npm audit` reports zero advisories at every severity, or the residual is a documented dev-only accept with a stated reason; `npm run check` stays green.
  Complexity: S

- [ ] P1 — Thin bootstrap plus lazy per-feature injection
  Why: 96 files / 4,978,068 B are injected at `document_idle` on every YouTube page regardless of which of the 446 settings are enabled — and Chrome does **not** V8-code-cache content scripts, so that cost is re-paid on every navigation and every frame rather than amortised. This one change fixes startup cost, the Greasy Fork size cap and Chromium store review time at once, so it gates three other items below.
  Evidence: Chromium issue 40480216 — "extensions don't use the v8 compile cache (recompiling content scripts for every frame)", isolated-world creation ~30% of overhead. DebugBear measured Evernote Web Clipper's 2.9 MB content script at 140 ms parse/compile + 300 ms evaluate, already the worst ~1.7% of extensions; Astra's ISOLATED bundle is 1.7× that. SponsorBlock does full YouTube segment skipping in a 115 KB content script (`manifest/chrome-manifest-extra.json`). uBlock Origin Lite's `platform/mv3/extension/js/scripting-manager.js` (13 KB) is the reference implementation: it computes at runtime which per-ruleset scripts to `registerContentScripts`, with `matches`/`excludeMatches` derived from what is enabled.
  Touches: `extension/manifest.json` (content-script entry 3), `extension/background.js`, `extension/core/registry.js`, `extension/core/feature-lifecycle.js`, `extension/core/capability-probe.js`, `build-extension.js`, `sync-userscript.js`
  Acceptance: the always-on ISOLATED script is ≤150 KB and reads settings; enabled features load via `chrome.scripting.registerContentScripts` from the service worker or dynamic `import()` of a `web_accessible_resources` module with `use_dynamic_url: true`; route-gated by the existing `core/selector-packs/` boundaries; `npm run check:startup` shows a measured reduction on a real YouTube fixture; feature parity and the full suite are unchanged.
  Complexity: XL

- [ ] P1 — Benchmark startup against a real YouTube page, and add a steady-state metric
  Why: the only benchmark runs against a synthetic overlay fixture and measures parse and first-paint only, so there is no number that would prove — or disprove — the lazy-injection refactor above. Do this one first; it is the instrument for the other. CPU and freezing are a top-3 recurring 1-star theme for every competitor in this space.
  Evidence: `scripts/startup-performance-baseline.json` records `"fixture": "scripts/smoke-settings-overlay.js::buildFixture"`, 97.2 ms median parse+init; `extension/manifest.json` content-script entry 3 lists 96 files; Enhancer for YouTube #1320 (memory exhaustion per new video) and h5player #684/#546 are the failure mode.
  Touches: `scripts/bench-startup.js`, `scripts/startup-performance-baseline.json`, `mhtml/` fixtures
  Acceptance: the benchmark runs against a captured youtube.com watch and feed page, records heap delta and observer-callback time over a bounded session alongside parse/paint, and `npm run check:startup` gates all four.
  Complexity: M

- [ ] P1 — Give the two largest feature modules dedicated behaviour tests
  Why: `sticky-video` (5,016 lines) and `settings-panel` (3,419 lines) are the biggest feature files in the repo and have no test file of their own; the second is where all five broken userscript calls originate.
  Evidence: `tests/features/` has no `sticky-video.test.js` or `settings-panel.test.js`; both are covered only indirectly via `theater-split.test.js` and `next-monolith-peel.test.js`.
  Touches: `tests/features/settings-panel.test.js` (new), `tests/features/sticky-video.test.js` (new), `tests/helpers/monolith.js`
  Acceptance: both modules have tests that drive real handlers through the existing fake-DOM harness — not source pins — and fail when a handler's dependency is removed.
  Complexity: M

- [ ] P1 — Make the extension discoverable where people actually look
  Why: 11 stars, 1 fork, 0 watchers, 22 repo views / 12 uniques in 14 days, 11 asset downloads on the newest release. The repo's own metadata is the cheapest lever and is currently stale and thin.
  Evidence: `gh api repos/SysAdminDoc/Astra-Deck` reports `description` claiming "150+ features" (README says 200+), empty `homepage`, and topics `[ad-free, dark-theme, javascript, userscript, youtube]` with no `chrome-extension`, `firefox-addon`, `manifest-v3`, `browser-extension`, `sponsorblock`, `dearrow`, or `privacy`; `traffic/popular/referrers` shows `github.com` and one portfolio link and nothing else.
  Touches: repo settings (description, topics, homepage, social preview), `README.md` opening paragraph, `docs/repo-settings.md`
  Acceptance: description and topics match the current feature set; a social-preview image is set; `docs/repo-settings.md` records the intended values so drift is detectable.
  Complexity: S

### P2 — Quick wins with direct demand evidence

- [ ] P2 — Show why a card was hidden
  Why: Video Hider already computes a `reason` string for every hidden card and throws it away. Exposing it is the cheapest item on this list and answers the most-repeated filtering complaint in the space.
  Evidence: `extension/features/video-hider/index.js:1218-1224` returns `{ hide: true, reason: 'mix' | 'playlist' | 'movie' | 'auto-dubbed' | 'low-view' | … }` for every verdict; nothing renders it. BlockTube #304 ("show/log which filter triggered a block"), FilterTube #58 (overlay-instead-of-remove variant).
  Touches: `extension/features/video-hider/index.js`, `extension/ytkit.js` (hidden-card placeholder), `extension/_locales/en/messages.json`
  Acceptance: an opt-in setting renders the reason on the hidden-card placeholder and/or in the diagnostics log; the string is `t()`-wrapped and generated into all 11 locales.
  Complexity: S

- [ ] P2 — Configurable SponsorBlock / DeArrow base URL with mirror fallback
  Why: both integrations hardcode one upstream. Return YouTube Dislike just demonstrated what a single degraded upstream does to a dependent extension, and its users are the ones shopping for an alternative.
  Evidence: `extension/features/sponsorblock/index.js:266` is the only endpoint reference in the file — a single hardcoded GET against `https://sponsor.ajay.app/api/skipSegments/${prefix}` (the k-anonymity path is already used; only the host is fixed). SponsorBlock #1562 (28 👍) and #2426 request exactly this; RYD #1274 (55 👍) and #1288 (54 👍) are the cautionary case.
  Touches: `extension/features/sponsorblock/index.js`, `extension/features/dearrow/index.js`, `extension/core/data-flow.js`, `extension/manifest.json` (optional host), `docs/store-permission-rationale.md`
  Acceptance: the base URL is a validated setting defaulting to the canonical host; a failed request falls back to a configured mirror once and surfaces which host answered in the API-health panel; a non-HTTPS or non-allowlisted host is rejected.
  Complexity: M

- [ ] P2 — Skip-once and per-playback segment override
  Why: SponsorBlock categories are global booleans; the most-requested ergonomic fix is a one-time override without changing settings.
  Evidence: SponsorBlock #1997 (20 👍).
  Touches: `extension/features/sponsorblock/index.js`
  Acceptance: the skip toast offers "don't skip this one", the choice applies to that segment for the current playback only, and it does not persist across navigation.
  Complexity: S

- [ ] P2 — Show the original and the DeArrow title together
  Why: users want the crowdsourced title without losing the original, and the shipped behaviour is replacement-or-nothing.
  Evidence: DeArrow #232 and #264.
  Touches: `extension/features/dearrow/index.js`
  Acceptance: an opt-in mode renders both titles with a visual distinction, works on cards and the watch page, and reverts cleanly when the feature is toggled off.
  Complexity: S

- [ ] P2 — Give the watch-time dashboard an empty state
  Why: with no tracked days it renders 30 zero-height bars and three zeroes, while every other data surface in the codebase has an explicit empty string.
  Evidence: `extension/ytkit.js:34580-34638`; compare the two-variant empty states in `extension/features/download-ui/index.js:2645-2694`.
  Touches: `extension/ytkit.js`, `extension/_locales/en/messages.json`
  Acceptance: zero-data renders a localised explanation and a pointer to the tracker setting instead of an empty chart.
  Complexity: S

- [ ] P2 — Replace the raw JSON parser error on settings import
  Why: a corrupt backup surfaces `Unexpected token … in JSON at position N`, while every other import failure path has hand-written copy.
  Evidence: `extension/popup.js:4071` parses unguarded; the generic catch at `:4158-4159` renders whatever it threw.
  Touches: `extension/popup.js`, `extension/_locales/en/messages.json`
  Acceptance: an unparseable file produces a localised "this file isn't a valid Astra Deck backup" message naming the expected shape; the raw error goes to the diagnostic log only.
  Complexity: S

- [ ] P2 — First-run handling on install, not on first popup open
  Why: the whole onboarding flow only runs if the user opens the toolbar popup; installing and never clicking the icon is a silent no-op.
  Evidence: `extension/background.js` has no `chrome.runtime.onInstalled` listener; `renderFirstRunSurfaces()` (`extension/popup.js:3518`) is the only trigger.
  Touches: `extension/background.js`, `extension/popup.js`
  Acceptance: a fresh install sets the first-run sentinel and surfaces the welcome path on the next YouTube page or via the action badge; an update does not re-trigger it (the existing upgrade guard at `popup.js:3505-3564` still holds).
  Complexity: S

### P2 — Features with strong external demand

- [ ] P2 — Local photosensitive flash detection and auto-dim
  Why: the single highest-reacted open feature request in the OSS YouTube landscape, unresolved since 2020 because a crowdsourced model cannot do it — and Astra already owns the per-frame video-filter pipeline that makes it local.
  Evidence: SponsorBlock #403 (79 👍); related #1310 (21 👍), #1096 (11 👍), #1086 (11 👍). Astra ships `vvfBrightness` and a MAIN-world video filter chain.
  Touches: `extension/features/video-filters/index.js`, `extension/ytkit-main.js`, `extension/core/player.js`
  Acceptance: sampled frame-luminance deltas above a configurable threshold trigger a dim/warn overlay within one frame budget; the sampler uses `requestVideoFrameCallback`, holds a stated CPU budget in `bench-startup`, and auto-disables through the existing crash-recovery counter.
  Complexity: L

- [ ] P2 — Local AI lane on Chrome's built-in APIs
  Why: Translator, Language Detector, Summarizer and the Prompt API have been stable in extensions since Chrome 138. A local lane makes summaries and translation work offline with no key, and removes three high-risk remote hosts from the GitHub-full permission string.
  Evidence: `extension/manifest.json:45-47` declares `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`; the on-device comment translator shipped in v4.54.0 already proves the pattern. Not covered by the blocked Writer/Rewriter item, which tracks a Developer-Trial API.
  Touches: `extension/core/userscript-ai-summary.js`, the AI-summary feature path in `extension/ytkit.js`, `extension/core/capability-probe.js`, `extension/core/data-flow.js`
  Acceptance: with a supported device the summary and transcript-translation paths run with no host permission and no key; without one they fall back to the existing BYO-key lane and say so; the capability probe reports which lane is active.
  Complexity: M

- [ ] P2 — Live-stream latency catch-up
  Why: a single-idea extension took 433 stars in six weeks doing only this, and Astra already ships both halves — a configurable buffer target and programmatic playback-rate control.
  Evidence: `joaogfc/ZeroDelay`; ImprovedTube #4090.
  Touches: `extension/ytkit.js` (live-stream player features), `extension/core/player.js`
  Acceptance: on a live stream, latency above a configurable threshold raises playback rate within bounds until the edge is reached, with a latency/buffer readout in the player chrome; writes go through `setProgrammaticPlaybackRate()` so per-channel saved speeds survive.
  Complexity: M

- [ ] P2 — Local AI-slop / low-signal filtering
  Why: the one 2026 demand wave with clear volume and no incumbent coverage, and it composes with filters Astra already has rather than needing a server.
  Evidence: SponsorBlock #1963 (22 👍), #2317, #2429; ImprovedTube #3150 (8 👍), #1833; FilterTube #22; the 2026 `combatslop-yt` extension.
  Touches: `extension/features/video-hider/index.js`, `extension/core/predicate-sandbox.js`, `extension/core/settings-schema.js`
  Acceptance: local heuristics (synthetic-narration markers in title/description/channel patterns, view-count and age thresholds, upload cadence) expose new predicate fields usable from the existing DSL, each independently toggleable, with the hidden-card reason naming which heuristic fired. No network call and no crowd database.
  Complexity: L

- [ ] P2 — Subscribable and exportable filter lists
  Why: BlockTube is stalled with its users asking for exactly this, and it is the in-policy substitute for the cloud sync this project rejects.
  Evidence: BlockTube #508, #384 (16 👍), #59 (11 👍); FilterTube #62. Astra's predicate DSL and keyword rules are strictly local.
  Touches: `extension/core/persisted-domains.js`, `extension/features/video-hider/index.js`, `extension/popup.js`
  Acceptance: rules export to and import from a versioned file; an optional HTTPS list URL refreshes on a bounded schedule through the `EXT_FETCH` bridge with the origin under the existing allowlist; import is transactional and reversible through the existing undo path.
  Complexity: M

- [ ] P2 — Timestamped-highlight export loop
  Why: this is what the commercial tier actually paywalls — Glasp gates auto-sync to Notion at $12.50–$30/mo and Readwise Reader's $9.99/mo is the highlight→export loop — while Astra already owns transcripts, bookmarks, notes and AI artifacts and gives them no coherent way out.
  Evidence: `glasp.co/pricing`; Astra ships `researchTranscriptIndex`, timestamp bookmarks, video notes and `ytkit-ai-summaries` as separate stores with separate exports.
  Touches: `extension/core/transcript-service.js`, `extension/core/ai-summary-artifacts.js`, the notes and bookmarks features in `extension/ytkit.js`, `extension/core/persisted-domains.js`
  Acceptance: one action exports a video's highlights, notes, bookmarks and summary as Markdown with clickable timestamps (Obsidian-compatible) and as JSON; round-trips through the existing schema-versioned import.
  Complexity: M

- [ ] P2 — Per-quality data-usage estimate before playback
  Why: a dedicated extension took 256 stars since 2026-02 on this alone, and the companion already enumerates formats with their sizes.
  Evidence: `MohamedSayed0573/TubeSize_Extension`; ImprovedTube #566 (5 👍); the `/formats` path in `extension/features/download-ui/index.js`.
  Touches: `extension/features/download-ui/index.js`, `extension/ytkit.js` (playback-stats overlay)
  Acceptance: the quality picker and stats overlay show an estimated size per quality for the current video; the estimate degrades to "unavailable" rather than guessing when the companion is offline.
  Complexity: S

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

### P2 — Platform and delivery engineering

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

### P3 — Debt burn-down and tooling honesty

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

- [ ] P3 — Clear the references the companion split left behind
  Why: a published design doc and a local audit-tooling config both point at code that no longer exists, so the doc misinforms the next reader and two audit tasks silently scan nothing.
  Evidence: `docs/predicate-sandbox-investigation.md` says the sandbox is "not yet enabled in any shipped feature" while `extension/core/predicate-sandbox.js` is the live DSL evaluator behind Video Hider; `.factory/audit-workflow.js:94-100` (gitignored, local tooling) still targets `astra_downloader/astra_downloader.py` for its security and threading audits.
  Touches: `docs/predicate-sandbox-investigation.md`, `.factory/audit-workflow.js`
  Acceptance: the predicate-sandbox doc describes the shipped wiring; no file in `docs/` or `extension/` references a path that left in `a6bb685f` as if it were current; the two audit tasks target extension paths.
  Complexity: S
