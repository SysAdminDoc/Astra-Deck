# Research: Astra Deck

Date: 2026-10-05. Replaces all prior research (the last pass was 2026-09-04 at v4.88.4).

Confidence labels: **Verified** (read in source, tracker or a fetched page), **Likely** (strong evidence, not reproduced), **Needs live validation** (only a signed-in or live YouTube session can settle it).

## Executive Summary

Astra Deck v4.94.0 (released 2026-10-05) is a local-first YouTube control suite: an MV3 extension for Chromium 120+ and Firefox 142+, and, since v4.93.0, a userscript generated from the same files. It has 483 settings and 304 feature IDs, and every release passes 3,320 tests and 38 of 39 gates. On breadth it is ahead of every open-source peer. Each 2026-09-25 Control Panel addition and each 2026-09 HN request already has an Astra setting, except the two below. The 2026-09-04 recommendations mostly shipped: the channel landing tab, the open-thumbnail button, a monolith-peel ratchet, the steady-state gate in `release:prepare`, player-rollout naming in feature health, and tests for Video Notes and Digital Wellbeing.

What this pass found is mostly about trust in what already ships. The project's only open user report (#51) came from a userscript user on Firefox, and it exposed two gaps. The live smokes run signed out, and the userscript has no way to produce the diagnostics bundle the bug template asks for. Meanwhile YouTube changed its feed cards on 2026-09-24/25, and Astra's view-count and duration parsing still reads only the older containers. That puts the feed filters at risk of silently letting every card through.

Top opportunities, in priority order:

1. Reproduce and fix #51, the invisible account avatar in the userscript on Firefox, with a signed-in fixture so the class can't recur unseen.
2. Give userscript users a diagnostics bundle (a manager menu command plus an in-panel action) and fix the bug template.
3. Re-verify Video Hider's view-count and duration parsing against YouTube's 2026-09-25 card layout, and make unreadable metadata visible instead of passing.
4. Stop the `deps` gate from being permanently red while node-forge has no fix, with an exact-path allowance that expires.
5. Hide thumbnail badges ("New", "4K"): three other projects' trackers asked for it in September, and Control Panel shipped it on 2026-09-25.
6. Hide videos YouTube labels "Made with AI": the highest-signal request of the window, and the only implementation that uses YouTube's own label costs $1.99.
7. SRI hashes on the userscript's three `@require` URLs, for integrity and Greasy Fork eligibility.
8. Small adoption work: carry the popup's What's New note into the in-page panel for userscript users, and get listed on awesome-userscripts.

## Product Map

- **Core workflows:**
  - Restyle or restore YouTube's layout and player: `classicLayoutProfile`, `newPlayerUiRestore`, Theater Split, the Player Dock.
  - Filter and organize feeds: Video Hider, Subscription Groups, Watch Feed, Feed Triage.
  - Enrich playback: SponsorBlock, DeArrow, Return YouTube Dislike, the audio graph, Repeat, A-B loop.
  - Work with transcripts: search, export, BYO-key AI summary and Q&A.
  - Hand downloads to the separate Astra Downloader companion.
  - Evidence: `extension/core/settings-schema.js`, `extension/features/*/index.js`.
- **Personas:**
  - People undoing the 2025-10-14 redesign. This is still the biggest public complaint, and there is no official rollback ([piunikaweb 2025-10-14](https://piunikaweb.com/2025/10/14/youtube-new-desktop-ui-rollout-complaints/)).
  - Focus and wellbeing users.
  - Subscription power users.
  - Transcript researchers.
  - Local-download users.
  - Userscript-only users, a first-class vehicle since v4.93.0. The reporter of #51 is one, and they get no popup at all.
- **Platforms and distribution:** GitHub Releases only (15 assets per release, no CRX because the signing key isn't on the build machine, unsigned XPI) plus the userscript, auto-updated from `main` via `@updateURL`. There are no Chrome Web Store, AMO or Greasy Fork listings, and all five release channels still serve 4.82.0 (`release-channels.json`, Roadmap_Blocked P0). The repo has 20 stars and 2 forks, up from 13 on 2026-09-04.
- **Data flows:**
  - The ISOLATED content runtime talks to the sealed MAIN-world bridge (`core/bridge-channel.js`).
  - The background worker handles `EXT_FETCH` with origin allowlists.
  - Loopback to the companion and Ollama runs from extension origins only. `core/capability-probe.js` runs in the popup, and download traffic goes through messaging.
  - The userscript maps `chrome.*` onto GM APIs (`userscript/host.js`).

## Competitive Landscape

Activity checked 2026-10-05 with `gh` and the fetched pages listed under Sources.

- **Control Panel for YouTube** (390 stars, no license file, so study only; v1.36.0 on 2026-09-25 after a gap since v1.35.2 on 2026-07-06).
  - Strength: the fastest turnaround on YouTube drift in this window. The subscriptions list view broke on 2026-09-24 (#336) and was fixed the next day. The same release added hiding for the new views icon and thumbnail badges, and coped with a "play icon" views layout that had broken its low-view hiding of related videos.
  - Learn: treat its release notes as a free drift feed. Each line is a YouTube change Astra probably also has to handle.
  - Avoid: long release gaps. Two months of silence preceded this burst.
- **YouTube Enhancer** (MIT, 390 stars, v1.35.0 on 2026-09-06).
  - Strength: monthly cadence, with fixes for autoplay toggle folding, the captions button and original-audio-track selection.
  - Learn: its top open request is a hold-to-speed gesture with a configurable rate ([#661](https://github.com/YouTube-Enhancer/extension/issues/661), +7). Astra lacks it.
  - Avoid: unreleased zip builds handed out in issues (#1442).
- **ImprovedTube** (`code-charity/youtube`, 4,615 stars, NOASSERTION license, so study only).
  - Strength: the broadest catalogue, with merges almost daily.
  - Learn: its 2026-09 breakage reports show where drift lands: speed-adjusted remaining time (#4340), Firefox fit-to-window (#4356), Cinema Mode blackout (#4354).
  - Avoid: drive-by PRs merged with little review, which shows up in regressions. Its GitHub tag (v4.2027, May) also lags its store build (4.2081).
- **FilterTube** (MIT, 107 stars, v3.4.1 on 2026-10-01).
  - Strength: 38 bundled UI languages, plus a timed allow-only session ("Hard Timer Whitelist").
  - Avoid: its BlockTube import shipped with a Firefox Android white-screen bug (#79, #80).
- **Return YouTube Dislike** (13,788 stars, v4.0.6 on 2026-09-07).
  - #1329 (2026-10-01) traced a broken ratio bar to YouTube changing where page data stores the like count.
  - Not affected: Astra's `likeViewRatio` reads the Like button's DOM (`extension/ytkit.js` ~25566), not page data. **Verified.**
  - Avoid: #1314 drew 80 reactions over an unexplained Firefox data-consent prompt. Any new permission Astra asks for needs a plain explanation.
- **SponsorBlock / DeArrow** (GPL-3.0; no release since 2026-07-13).
  - Open Shorts drift: DeArrow [#525](https://github.com/ajayyy/DeArrow/issues/525).
  - SponsorBlock [#2556](https://github.com/ajayyy/SponsorBlock/issues/2556) (2026-09-25) notes YouTube's A/B testing of video content, which breaks the one-ID-one-segment-set assumption. That is upstream data, not Astra code.
- **Weedout** (Safari only, $1.99, source MIT at [masteranza/weedout-for-youtube](https://github.com/masteranza/weedout-for-youtube)).
  - Strength: it hides videos YouTube labels "Made with AI" across feed, search, related, playlists and Shorts. Its Show HN reached 185 points on 2026-09-01.
  - Its source documents the mechanism. The label exists only in watch-page data (`videoPrimaryInfoRenderer.badges[].metadataBadgeRenderer`). Feeds need one masked InnerTube `next` lookup per card, with the verdict cached.
  - Learn: the signal is YouTube's own label, not AI detection.
  - Avoid: per-card network lookups as a default, given Astra's local-first stance.
- **Remove YouTube Suggestions** (MPL-2.0, 584 stars, v4.3.83 on 2026-09-06). Moved its premium features back to free or donation (#231, 2026-09-10). That supports Astra's no-paywall position.
- **ZeroDelay** (GPL-3.0, 433 stars, v1.5.0 on 2026-07-14). A "Copy diagnostics" JSON button and an in-popup what's-new chip. Both are cheap and both are things Astra's userscript lacks.
- **Enhancer for YouTube** (closed source, about 2M Chrome users, CWS 3.0.19 updated 2026-07-15). Free, so it's the trust and distribution benchmark rather than a feature one.
- **Commercial metering.**
  - PocketTube Premium is $3.99/mo, for nested groups, tags and Deck view. Astra ships groups, AI tags and new-since-visit badges free.
  - Glasp is free at 3 summaries a day, Pro is $12.50/mo.
  - Eightify is about $4.95/mo (secondary source).
  - Maxxmod (Show HN 2026-09-24) lists 60+ features with a "Pro coming soon" waitlist, and Astra has every one it names.
  - Astra's BYO-key and Ollama lanes avoid all metering. **Verified** against the inventory.
- **Greasy Fork tier** (by-site list, fetched 2026-10-05).
  - Downloaders and ad skippers lead on installs: HTML5 Video Playing Tools has 1.29M, YouTube Ultimate Downloader 457K.
  - Single-purpose CPU tamers still draw 30 to 50 installs a day. Astra has `enableCPU_Tamer`.
  - New 2026-10-05 scripts mirror Astra features (Hide Watched Videos, subscription categories), which shows demand without showing gaps.
  - The candidates the 2026-08-06 pass couldn't read (Greasy Fork returned 403 then) are all covered. Method: Greasy Fork search sorted by total installs, each script's feature list checked against `SETTINGS_SCHEMA`.
    - Better Youtube Shorts (3,950 installs, last updated 2024-12-25) offers Shorts redirect, volume, speed, a progress bar and auto-scroll. Astra has `redirectShorts`, `shortsSpeedControl`, `shortsAutoAdvance` and `shortsAsRegularVideo`, which gives Shorts the full player.
    - YouTube Improvements: Layout & Video Enhancer (59,397 installs, updated 2026-10-02) offers layout, download, screenshot, theme and speed controls. Astra has `watchPageTabs`, the downloader, `videoScreenshot`, `colorTheme` and the speed family.
    - Tabview YouTube Totara's Info/Comments/Videos tabs are `watchPageTabs`.
    - h5player is mostly keyboard shortcuts, which this project doesn't ship.
    - Surveyed, nothing new. **Verified.**

**YouTube changes in the window that touch Astra:**

- **Custom Feeds** (AI-prompted home tabs, US "this fall") and **Ask YouTube for Shopping** were announced at Made on YouTube on 2026-09-23. Neither is visible on desktop web yet. The Ask surfaces belong to the existing Roadmap_Blocked item "Hide the new AI surfaces".
- **Shorts Series on web**, rolling out from 2026-09-23 ([droid-life](https://www.droid-life.com/2026/09/23/youtube-teases-3-neat-new-features/)).
- **AI labels moved below the player**, with an overlay on Shorts (2026-05-27, [9to5Google](https://9to5google.com/2026/05/27/youtube-updating-ai-content-labels/)).
- **"New" thumbnail badges** (from about 2026-09-18).
- **New views icon and "play icon" views layout** (2026-09-24/25).
- **Ad-block enforcement** with "content isn't available" errors (2026-01-23). Astra is not an ad blocker and should keep out of that fight.

## Reported Issues

- **#51, "[Bug] Account button is invisible"** (opened 2026-10-01 by Aiakio, no replies, label `bug`).
  - Environment: LibreWolf 157.0-1 on CachyOS, Violentmonkey, Astra v4.93.0, a fresh userscript install with default settings, signed in.
  - The screenshot shows Astra's masthead buttons and the bell, then an empty square with a blue outline where the avatar should be.
  - Trace: no default-on rule hides the avatar.
    - `hideOwnAvatar` (`extension/ytkit.js` ~7581) is default off.
    - `squareAvatars` (~28688, default on) only sets `border-radius: 0`.
    - The `rectangularize` carve-out (~39213) only sets radius on avatars.
  - Root cause is undetermined. **Needs live validation.**
  - The candidates are the MAIN-world bundle or the GM adapter under Violentmonkey on Firefox, or a LibreWolf default unrelated to Astra.
  - Every live smoke runs signed out, and signed out YouTube renders "Sign in" instead of the avatar. That is why no gate could see this.
- **The same report exposes a support gap. Verified.**
  - The reporter wrote "could not find any diagonstics or toolbar popup".
  - `.github/ISSUE_TEMPLATE/bug_report.md:24-29` sends everyone to "toolbar popup → Diagnostics → Save log", which exists only in the extension (`extension/popup.js` ~2417).
  - `userscript/host.js` `registerMenu()` (~1505) registers only "Open Astra Deck settings" and the AI-key command.
- **Feature requests:** none open.
- **Closed:** #1 (2026-05-10), a feature request that was satisfied.
- **Pull requests:** none from outside contributors.
- **Discussions:** #43 and #44 (both 2026-07-30) still have 0 comments after 67 days. There is still no data on which settings people use, and #51 is the only intake signal.

## Security, Privacy, and Reliability

- **The dev audit is red on an unfixable advisory. Verified.**
  - GHSA-86w9-cpqp-85rv (node-forge `<= 1.4.0`, `first_patched_version: null`, published 2026-09-03) reaches the tree only as web-ext 10.7.0 → `@devicefarmer/adbkit` 3.3.9 → node-forge 1.4.0. That is web-ext's Firefox-for-Android path, which nothing here runs.
  - brace-expansion GHSA-q2hr-2g5m-vwhr was cleared on 2026-10-05 by raising the override to `^5.0.12`.
  - The `deps` gate has no allowance mechanism by design (`scripts/audit-dependencies.js:108-112`), so `npm run check` stays 38/39 until upstream ships a fix. A second, real advisory would land unseen in an already-red gate.
  - web-ext 10.7.0 (2026-09-21) is still the newest release and still pulls adbkit.
- **The userscript libraries carry no integrity hash. Verified.**
  - `sync-userscript.js:46-62` pins the three `@require` URLs to `refs/tags/v<version>` on `raw.githubusercontent.com`. A tag that is moved or re-pushed changes the code every install runs.
  - Greasy Fork's external-script rules accept `@require` URLs that carry SRI hashes ([greasyfork help](https://greasyfork.org/en/help/external-scripts)). That also removes one obstacle for the blocked Greasy Fork listing.
- **Feed filters can fail open on the 2026-09-25 card layout. Likely.**
  - `features/video-hider/index.js:1628` `_extractViewCount` reads `#metadata-line, ytd-video-meta-block, .metadata, #meta` or text carrying "view"/"watching". It falls back to whole-card text without `allowBare`.
  - `:1609` `_extractDuration` reads `ytd-thumbnail-overlay-time-status-renderer` or an `aria-label` containing ":".
  - Neither reads `yt-content-metadata-view-model`, which `features/subscription-view/index.js` already knows.
  - When YouTube replaces the word "views" with an icon, as Control Panel v1.36.0 describes, the low-view, low-signal and cadence filters would see `null` and let the card through. The user can't tell.
- **Supply chain context.** Socket disclosed 23 Chrome extensions bought through ExtensionHub and turned into malware (2026-08-30, [SecurityWeek](https://www.securityweek.com/several-chrome-extensions-compromised-in-supply-chain-attack/)). Island showed an 11M-user YouTube ad blocker could run arbitrary JS from a config change (2026-06-25). Astra's signed feeds, SBOM and release manifest are the right answer. The unpublished signing key (Roadmap_Blocked P1) is the remaining hole.
- **Checked and fine. Verified 2026-10-05:**
  - Chrome 150 rejects alarm names over 1024 bytes, and Astra calls no `alarms.create`.
  - Local Network Access gates page origins. Astra's loopback calls run from the popup or worker, and the existing blocked LNA item stands.
  - Chrome 154 (2026-09-22) and Firefox 154 (2026-08-18) change nothing Astra uses.
  - Firefox ESR moved to 153, and the 142 floor is unaffected.
- **Companion ecosystem.** This lives in the AstraDownloader repo, not here.
  - yt-dlp stable is still 2026.08.19, with nightlies to 2026.09.27.
  - The bgutil PO-token provider 2.0.0 now binds to localhost by default and patched an RCE.
  - The companion should require yt-dlp at 2026.07.04 or later (CVE fixes) and bgutil 2.0.0 or later.

## Architecture Assessment

- **`extension/ytkit.js` keeps growing.**
  - It is 53,255 lines, up from 52,320 on 2026-09-04, and was touched in 40 of the 124 commits since.
  - The peel ratchet (`scripts/check-monolith-peel.js`, remainder 279) counts feature IDs, not bytes, so new code inside existing inline features passes it.
  - `YTKit-app.user.js` is that file plus wrapping. It has 282 KB of headroom under Greasy Fork's 2 MiB cap, so this growth eats the Greasy Fork path.
- **`extension/popup.js` is 7,856 lines** and holds the only copy of diagnostics bundle assembly. Moving that to a core module serves both vehicles, which is the #51 support fix.
- **Coverage blind spots.**
  - All live smokes (`smoke-main-bridge-live.js`, `smoke-userscript-managers.js`, `capture-theater-split.js`) run signed out, so signed-in-only surfaces are untested: the avatar menu, subscriptions feed, notifications and Watch Later.
  - A signed-in capture sits in the working tree (`Subscriptions - YouTube.mhtml`, 6.5 MB, gitignored by `*.mhtml`). It carries the maintainer's account data, so a fixture cut from it has to be trimmed to the masthead and scrubbed before it's committed.
- **Checked this pass with nothing new to add:**
  - Accessibility: the open work is still Roadmap_Blocked P0 (screen-reader evidence) and P1 (a live region for settings operations), and neither moved.
  - Offline: everything runs locally except the opt-in AI, companion and enrichment lookups. The AI-label lookup mode would be the first new network path, so it ships opt-in.
  - Migration from other tools: Roadmap_Blocked P2 "Competitor migration documentation" still stands.
  - Upgrades: the extension popup already shows a What's New banner (`extension/popup.js` ~5592). Only userscript users miss it.
- **Strengths not to disturb:** the 39-gate runner that reports every gate, the strict `init()`/`destroy()` contract, the peel ratchet, signed feeds, and generated userscript parity with drift and symbol gates.

## Rejected Ideas

- **Configurable hold-to-speed gesture** ([YouTube Enhancer #661](https://github.com/YouTube-Enhancer/extension/issues/661), +7). Deferred: one tracker, and it overlaps YouTube's own press-and-hold. Revisit if a second tracker asks.
- **Hide auto-generated chapters** ([Control Panel #342](https://github.com/insin/control-panel-for-youtube/issues/342)). One reaction, and its maintainer couldn't reproduce it.
- **Block the Opus audio codec** ([ImprovedTube #4363](https://github.com/code-charity/youtube/issues/4363)). One requester. Astra's codec paths are video-only by design (`codecSelector`, `forceH264`).
- **More UI locales to match FilterTube's 38.** The existing 10 non-English locales are about 70% translated (`docs/i18n-coverage.md`), so finishing them, which is an existing P3 item, comes first.
- **Listing in awesome-privacy.** The list collects privacy alternatives to services. Astra is an enhancer, and the fit is weak. awesome-userscripts is the right list.
- **Hide Custom Feeds or Ask YouTube for Shopping now.** Neither is visible on desktop web yet. The Ask surfaces fold into Roadmap_Blocked "Hide the new AI surfaces".
- **Ad blocking or anti-adblock countermeasures.** These are outside Astra's charter, and YouTube's 2026-01-23 enforcement makes it a moving fight.
- **Raise the Firefox floor to ESR 153, or adopt `browser.publicSuffix` (Chrome 153) or the Firefox `sandbox` key (154).** No feature needs them.
- **Per-card AI-label lookups on by default.** Each card would cost one request to YouTube, so it is opt-in only (see the roadmap item).
- **Carried unchanged from 2026-09-04:**
  - vision-LLM selector repair;
  - telemetry;
  - a plugin marketplace;
  - mobile or multi-user support;
  - aria2c.
  - The reasons are the no-telemetry promise, the local-first model, the reviewable package boundary, and CVE-2026-50574.

## Sources

### Repository
- https://github.com/SysAdminDoc/Astra-Deck/issues/51
- https://github.com/SysAdminDoc/Astra-Deck/discussions/43
- https://github.com/SysAdminDoc/Astra-Deck/discussions/44

### Direct OSS competitors
- https://github.com/insin/control-panel-for-youtube/releases/tag/v1.36.0
- https://github.com/insin/control-panel-for-youtube/issues/335
- https://github.com/insin/control-panel-for-youtube/issues/336
- https://github.com/insin/control-panel-for-youtube/issues/337
- https://github.com/insin/control-panel-for-youtube/issues/342
- https://github.com/YouTube-Enhancer/extension/releases/tag/v1.35.0
- https://github.com/YouTube-Enhancer/extension/issues/661
- https://github.com/YouTube-Enhancer/extension/issues/1425
- https://github.com/code-charity/youtube/issues/4340
- https://github.com/code-charity/youtube/issues/4356
- https://github.com/code-charity/youtube/issues/4358
- https://github.com/code-charity/youtube/issues/4363
- https://github.com/varshneydevansh/FilterTube/releases
- https://github.com/Anarios/return-youtube-dislike/issues/1314
- https://github.com/Anarios/return-youtube-dislike/issues/1329
- https://github.com/ajayyy/DeArrow/issues/525
- https://github.com/ajayyy/SponsorBlock/issues/2556
- https://github.com/joaogfc/ZeroDelay/releases/tag/v1.5.0
- https://github.com/lawrencehook/remove-youtube-suggestions/issues/231
- https://github.com/masteranza/weedout-for-youtube

### Userscript tier and lists
- https://greasyfork.org/en/scripts/by-site/youtube.com?sort=total_installs
- https://greasyfork.org/en/help/external-scripts
- https://greasyfork.org/en/scripts?q=Better+YouTube+Shorts&sort=total_installs
- https://greasyfork.org/en/scripts?q=YouTube+Improvements+Layout+Video+Enhancer&sort=total_installs
- https://github.com/awesome-scripts/awesome-userscripts/blob/main/CONTRIBUTING.md
- https://github.com/violentmonkey/violentmonkey/releases

### Commercial
- https://masteranza.github.io/weedout/
- https://chromewebstore.google.com/detail/enhancer-for-youtube/ponfpcnoihfmfllpaingbgckeeldkhle
- https://pockettube.io/pricing.html
- https://glasp.co/pricing
- https://maxxmod.com/

### Community
- https://news.ycombinator.com/item?id=49528895
- https://news.ycombinator.com/item?id=49829812
- https://piunikaweb.com/2025/10/14/youtube-new-desktop-ui-rollout-complaints/
- https://piunikaweb.com/2026/02/03/youtube-subscriptions-list-view-removed/

### YouTube product
- https://www.socialmediatoday.com/news/youtube-presents-new-ai-and-engagement-features-at-made-on-2026/831216/
- https://www.droid-life.com/2026/09/23/youtube-teases-3-neat-new-features/
- https://9to5google.com/2026/05/27/youtube-updating-ai-content-labels/
- https://www.androidauthority.com/youtube-embed-player-redesign-3652875/
- https://www.howtogeek.com/youtube-is-breaking-ad-blockers-again/
- https://blog.youtube/news-and-events/youtube-premium-lite-background-play-downloads/

### Platform
- https://developer.chrome.com/blog/new-in-chrome-154
- https://developer.chrome.com/docs/extensions/whats-new
- https://developer.chrome.com/blog/cws-policy-updates-2026
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154
- https://blog.mozilla.org/addons/
- https://endoflife.date/firefox

### Security and dependencies
- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://github.com/advisories/GHSA-q2hr-2g5m-vwhr
- https://www.securityweek.com/several-chrome-extensions-compromised-in-supply-chain-attack/
- https://www.island.io/blog/badblocker-11-million-users-one-server-call-away-from-compromise
- https://github.com/yt-dlp/yt-dlp/releases
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases

## Open Questions

- **Does #51 reproduce without Astra in LibreWolf 157?** Only the reporter's browser can say that quickly. A signed-in reproduction here settles the Astra side, but not a LibreWolf default.
- **Do Tampermonkey and Violentmonkey both honor a `#sha256=` hash on `@require`, and refuse a mismatch?** The SRI item's acceptance depends on it, and `smoke:userscript-managers` can answer it.
- **What rate limit applies to masked InnerTube `next` lookups at feed scale?** Weedout ships the approach but publishes no numbers. The opt-in lookup mode needs a concurrency cap chosen from a measured run.
