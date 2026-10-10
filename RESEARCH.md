# Research: Astra Deck

Date: 2026-10-10. Replaces all prior research (the last pass was 2026-10-05 at v4.94.0).

Confidence labels: **Verified** (read in source, a tracker or a fetched page), **Likely** (strong evidence, not reproduced), **Needs live validation** (only a signed-in or live YouTube session can settle it, and browser runs wait for the owner's word).

## Executive Summary

Astra Deck v4.97.0 (released 2026-10-07) is a local-first YouTube control suite: an MV3 extension for Chromium 120+ and Firefox 142+, and a userscript generated from the same files. It has 490 settings and 305 feature IDs, 39 gates, a clean dev audit, and every recommendation from the 2026-10-05 pass has shipped: #51 is fixed and confirmed by its reporter, the userscript has a diagnostics bundle and a What's New note, the feed filters read the 2026-09 cards, thumbnail badges and "Made with AI" videos can be hidden, the `@require` libraries carry SHA-256 pins, and all ten non-English locales are translated. The tracker is empty. The biggest open risk is outside the repo: since about 2026-10-07 YouTube is rolling out a watch-page layout that moves comments and the description into a right-hand panel with a recommendation grid under the player, and Astra has no code for it. Undoing redesigns is Astra's first persona, Chrome users can't use the uBlock Origin scriptlets that revert it, and 67 selector rules key on the old `ytd-watch-flexy` layout.

Top opportunities, in priority order:

1. Restore the classic watch layout when the 2026-10 side-rail test is on: an experiment-flag override at document start in the MAIN world, a CSS fallback for the new side menu, and a selector audit for `ytd-watch-grid`.
2. Hide the Shorts grid shelves (`grid-shelf-view-model`) that slipped past Remove All Shorts after YouTube's 2026-10-09 markup change.
3. Hide AI-generated chapters while keeping creator chapters, through the page-world response hook Astra already runs for the feed prefilter.
4. Translate the 29 English toasts still in `extension/ytkit.js` and close the copy gate's blind spot that let them through a "fully translated" release.
5. Serve the userscript libraries from jsDelivr's commit-pinned GitHub mirror, the only GitHub-backed source Greasy Fork recognizes, so the blocked Greasy Fork listing has its code side done.
6. Import subscriptions from Google Takeout and NewPipe, since migration is where new users arrive and Subscription Groups reads only its own JSON and OPML.
7. Show views on their own line on Home and Subscriptions, which two trackers asked for after the 2026-09-25 metadata merge.
8. Housekeeping with user-visible cost: seven 2026-10-09 fixes missing from the CHANGELOG, a shipped DeArrow Voting toggle that can never succeed, and five stale developer docs the doc-truth gate doesn't cover.

## Product Map

- **Core workflows** (`extension/core/settings-schema.js`, `extension/features/*/index.js`):
  - Restyle or restore YouTube's layout and player: `classicLayoutProfile`, `newPlayerUiRestore`, Theater Split, the Player Dock.
  - Filter and organize feeds: Video Hider (keywords, channels, views, duration, badges, AI label), Subscription Groups, Watch Feed, Hide All with the Subscriptions sweep.
  - Enrich playback: SponsorBlock, DeArrow, Return YouTube Dislike, the audio graph, Repeat, A-B loop, the flash guard.
  - Work with transcripts: search, export, BYO-key AI summary and Q&A, Ollama.
  - Hand downloads to the Astra Downloader companion, paired once from the userscript.
- **Personas:** people undoing YouTube redesigns (the 2026-10 watch layout is the current one), focus and wellbeing users, subscription power users, transcript researchers, local-download users, and userscript-only users, who since v4.96.0 get diagnostics and since 2026-10-09 a What's New note.
- **Platforms and distribution:** GitHub Releases only, 15 assets per release (Chrome ZIPs, unsigned Firefox XPIs, the userscript, SBOM, manifest, SHA256SUMS), no CRX because the signing key isn't on the build machine. The userscript updates from `main` through `@updateURL` with tag-pinned, hash-pinned libraries. No store or Greasy Fork listing. All five release channels still serve 4.82.0 because `docs/screen-reader-evidence.json` doesn't exist (`release-channels.json`, Roadmap_Blocked P0). 24 stars, 2 forks, up from 20 on 2026-10-05. **Verified** with `gh`.
- **Data flows:** the ISOLATED runtime talks to the sealed MAIN-world bridge (`core/bridge-channel.js`); the MAIN world hooks `JSON.parse` for the feed prefilter (`extension/ytkit-main.js:266-347`) and defines `ytInitialPlayerResponse` (:583); the worker proxies `EXT_FETCH` through origin allowlists; loopback to the companion and Ollama runs from extension origins; the userscript maps `chrome.*` onto GM APIs (`userscript/host.js`). The only network path added since 2026-10-05 is the opt-in "Look Up AI Labels" lookup, four cookieless requests at a time (CHANGELOG 4.97.0).

## Competitive Landscape

Activity checked 2026-10-10 with `gh` and the fetched pages listed under Sources.

- **YouTube itself, 2026-10 watch layout.** Comments and the description move to a right-hand panel, recommendations become a grid under the player, the theater button disappears. Ubergizmo dated it 2026-10-07, Techdows published the revert guide 2026-10-08, Control Panel's tracker got the first report 2026-10-07 (#343), and about 15 r/youtube threads in the window are about it. YouTube tried the same layout in 2024 and withdrew it. The community fix sets `yt.config_.EXPERIMENT_FLAGS` entries false (`web_watch_eligible_to_switch_to_grid`, `web_watch_enable_single_column_grid_view`, `web_fixed_panel_watch_next_grid_swap`, `web_live_chat_panel_watch_next_grid_swap`, `web_watch_fixed_default_panels`, `web_engagement_panel_show_description`, `web_watch_move_summary_to_sd`, `web_watch_hero_list`, `web_watch_split_scroll`, `web_side_rail_dismissible_panels`, `kevlar_watch_hide_comments_while_panel_open`, `kevlar_watch_cinematics`, `disable_theater_mode`), which uBlock Origin Lite on Chrome can't run. **Verified** from the pages; whether an enrolled account answers to exactly these flags **needs live validation**.
- **youtube-classic-watch-layout** (davidluttrull, MIT, created 2026-10-07, 0 stars). A 133-line script written for Enhancer for YouTube's custom-script slot. It sets the flags false in both `ytcfg.get('EXPERIMENT_FLAGS')` and `yt.config_.EXPERIMENT_FLAGS`, flips `isTwoColumns_`, `splitScroll` and `sideRailDismissiblePanels` on the live `ytd-watch-flexy`, and re-applies on every navigation. Its README admits it was tested by forcing the flags on, not on an enrolled account. Learn: the two-layer approach (flags for pages built later, element properties for the page already on screen). Avoid: running at `document-idle`, which shows the new layout first.
- **Control Panel for YouTube** (insin, 390 stars, no license, study only). v1.36.0 (2026-09-25) is still the latest release, but `main` moved 2026-10-08 to 2026-10-10: AI-generated chapters off (commit beb487b3), Notifications hide, views on a separate line (35c57575). Its `hideWatchSideMenu` option is one CSS rule (`ytd-watch-flexy { --ytd-watch-flexy-fixed-side-menu-width: 0 }` plus `#fixed-side-menu`) and its code already queries `ytd-watch-grid` beside `ytd-watch-flexy`. The 2026-10-05 pass said every v1.36.0 addition had an Astra setting; the side-menu hide didn't, and still doesn't. Learn: it patches InnerTube responses (`next`, `get_watch`, `ytInitialData`) for chapters and ads, the same place Astra's prefilter sits. Avoid: a release gap while `main` carries the fixes.
- **Remove YouTube Suggestions** (584 stars, MPL-2.0). v4.3.84 and v4.4.0 both on 2026-10-09: "Fix hiding shorts from search results" (selector `#container.ytd-search grid-shelf-view-model.ytGridShelfViewModelHost.ytd-item-section-renderer`), "also hide grid shelves without a bottom button" (the same host without the search scope), "Fix settings broken by YouTube markup changes", and "Speed through ads" because YouTube stopped honoring scripted clicks on the Skip button. Learn: the two Shorts selectors, which Astra lacks (see Reliability). Avoid: its license model.
- **ImprovedTube** (code-charity/youtube, 4,622 stars, pushed 2026-10-10). Drift reports in the window: metadata merged onto one line so long channel names hide views and age (#4361, 2026-09-27), cinema mode black on Firefox 157 (#4381, 2026-10-09), Video Filters broken by a TrustedHTML violation (#4374, fixed 2026-10-10). Its most-reacted open request is a list view (#3593, 19 reactions). Learn: the drift list. Avoid: drive-by PRs that shipped the `innerHTML` regression.
- **YouTube Enhancer** (392 stars). Nothing shipped after v1.35.0 (2026-09-06); only tooling commits. New ask: a temporary 2x gesture that returns to the previous speed (#1435, 2026-09-27) beside #661 (7 reactions). Still one tracker, still deferred.
- **FilterTube** (107 stars, MIT, v3.4.1 on 2026-10-01). Its three newest issues are a BlockTube import that doesn't load (#80), a Firefox Android white screen after a BlockTube import (#79) and a low-views request (#81, which Astra has). Learn: imports are where users arrive.
- **yt-anti-translate** (484 stars, v1.20.5 on 2026-09-04). Covers titles, descriptions, chapters, audio, thumbnails, channel branding, Shorts and embeds, with per-channel allowances. Astra's `antiTranslate*` family covers titles, transcript, thumbnails, chapters and the audio track; per-channel exceptions and channel-header branding are unchecked.
- **YouTubeAlchemy** (TimMacy, 103 stars, AGPL, v12.3.3, pushed 2026-10-10) and **YouTubeTweak** (xlch88, 417 stars, MIT, v2.0.2 on 2026-09-21) are the closest peers by shape: a userscript plus extension with hundreds of layout options, and a "no telemetry, no paywall" pledge. Their feature lists map onto existing Astra settings; Alchemy's transcript hand-off to NotebookLM is the one idea Astra doesn't name.
- **Return YouTube Dislike** (13.8k stars, v4.0.6 on 2026-09-07) and **SponsorBlock / DeArrow** (no release since 2026-07-13, both pushed around 2026-10-03). Nothing new forces an Astra change; DeArrow #528 (blank thumbnails with "DeArrow and original") closed. Astra's `deArrowVoting` posts to a route that doesn't exist (see Reliability).
- **BlockTube** (1,408 stars) has had no release since 2026-02-07 and four unanswered issues in the window; **Iridium** is archived; **ZeroDelay** has been idle since 2026-07-14. Their users are migration candidates.
- **AI-label tools.** Weedout (Safari, $1.99) now has a Firefox port, Herbisight; AiBlock ships community lists (Override92/AiSList); "Stop the Slop" reached AMO. Astra ships `hideVideosMadeWithAiFilter` with the watch-page learning path and the opt-in lookup, which is the mechanism these use. r/youtube, r/firefox and r/uBlockOrigin each carried a "block AI videos" thread in the window.
- **Greasy Fork tier** (by daily installs, 2026-10-10). Downloaders and ad skippers lead; "YouTube Remove AI Chapters" (script 598706, updated 2026-10-08) draws about 33 installs a day for one feature Astra lacks; YouTube CPU Tamer and YouTube JS Engine Tamer (updated 2026-10-08) show the performance niche Astra's `lowPowerProfile` and `enableCPU_Tamer` already serve. Greasy Fork's recognized-CDN list has no entry for `raw.githubusercontent.com`; jsDelivr's `/gh/<owner>/<repo>@<40-hex-sha>/` form is allowed, and SRI in Tampermonkey format is allowed. **Verified** (greasyfork.org/en/help/cdns).
- **Adjacent patterns worth copying:** refined-github's rename map applied as a settings migration (Astra has one at `settings-schema.js` ~1152); FreeTube's import matrix (Takeout CSV and JSON, NewPipe JSON, OPML, its own `.db`); uBlock Origin's logger that names which rule acted on which node (Astra's `diagnostic-log` and feature health are the seeds). Not copying: Vencord's cloud settings sync, FrankerFaceZ's conditional profiles, Enhancer for YouTube's custom-script slot (remote code under Chrome Web Store policy).

## Reported Issues

The repo has issues and discussions enabled. Read 2026-10-10 with `gh`. **Verified.**

- **Open issues: none. Open pull requests: none.**
- **#51 "[Bug] Account button is invisible"** (opened 2026-10-01, userscript on LibreWolf 157 with Violentmonkey). Fixed in 4.96.0 (`early.css` avatar rule, commits `2ff15c80` and `1f95d75c`), the maintainer replied 2026-10-07, the submitter confirmed "It is, yes. Thank you!" on 2026-10-08 and the issue closed on that word. Nothing to do.
- **#1** (closed 2026-05-10) was implemented in v3.22.0. The only other closed issue.
- **Discussions #43 and #44** (2026-07-30) still have 0 comments after 72 days. There is no usage data and no intake signal beyond #51.
- **Template drift (not an issue, found in the tracker's own template):** `.github/ISSUE_TEMPLATE/bug_report.md` now has the userscript diagnostics path, but its examples still read "Firefox 122" (below the 142 floor) and "4.47.0". Rolled into the stale-docs roadmap item.
- **Outside trackers that mention `yt-lockup-view-model` since 2026-09-15** carry nothing about Astra: ImprovedTube #3664, YouTube Enhancer #1425, Channel-Blocker #49.

## Security, Privacy, and Reliability

- **The 2026-10 watch layout is unhandled. Likely.** `grep` over `extension/` finds no `EXPERIMENT_FLAGS`, `web_watch_*`, `#fixed-side-menu` or `ytd-watch-grid`. `ytd-watch-flexy` appears 42 times in `extension/ytkit.js` and 25 times across `features/sticky-video-styles`, `core/selector-packs/watch.js`, `core/video-type.js`, `core/element-zapper.js`, `core/settings-visual-system.js`, `core/selector-packs/sidebar.js`, `features/video-hider`, `features/subtitles`, `features/element-zapper` and `core/navigation.js`. If YouTube's new layout replaces or restructures that element for an enrolled account, Theater Split, the Player Dock placement, Watch Feed's sidebar reading and the comment tools degrade with no feature-health signal. Control Panel's code treats `ytd-watch-grid` as a sibling of `ytd-watch-flexy` (page.js:3697). A MAIN-world override at `document_start` is possible today: `ytkit-main.js` already runs there and keeps `_NATIVE.jsonParse` for its own reads (:30-37).
- **Shorts grid shelves pass Remove All Shorts. Verified by selector.** Astra hides `ytd-reel-shelf-renderer` and `ytd-rich-shelf-renderer[is-shorts]` (`extension/early.css:76-77`, `extension/ytkit.js:10897-10898`, `core/selector-packs/shortsShelf.js:32`). YouTube's 2026-10-09 markup renders shelves as `grid-shelf-view-model.ytGridShelfViewModelHost` inside `ytd-item-section-renderer`, which Remove YouTube Suggestions added the same day (commits 2dca2940 and 436b0fd8). Whether every grid shelf is Shorts **needs live validation**; scoping with `:has(ytm-shorts-lockup-view-model)`, which `features/home-subs-css` already names, avoids hiding other shelves.
- **Scripted clicks may stop landing. Needs live validation.** Remove YouTube Suggestions 4.3.84 (2026-10-08) says YouTube no longer accepts scripted clicks on the ad Skip button. Astra's quality forcing drives `.ytp-settings-button` and the quality submenu by click (`ytkit.js` ~13782, CLAUDE.md "Quality forcing uses DOM click simulation"), and Still Watching presses the prompt's button. If the rejection extends past ads, both fail quietly. Logged in Roadmap_Blocked (browser run).
- **DeArrow Voting ships and can't work. Verified.** `deArrowVoting` (`settings-schema.js:736`, `ytkit.js` ~36454) posts to `https://sponsor.ajay.app/api/branding/vote/${type}` (~36499), a route that doesn't exist; Roadmap_Blocked L359 explains the fix can't be tested without writing to DeArrow's live data. The toggle is off by default but visible.
- **Dependencies are clean. Verified 2026-10-10.** `npm audit`: 0 findings across 356 packages. `npm outdated`: only `ws`, 8.21.3 to 8.22.0. web-ext 10.7.0, eslint 10.12.0 and acorn 8.19.0 are current; `crx3` 2.0.0 hasn't moved since 2025-11-23. The node-forge advisory left the tree with the adbkit stand-in on 2026-10-06.
- **Tampermonkey 5.5.1 changed SRI enforcement. Needs live validation.** Its 2026-10-01 changelog says "Corrected SRI enforce mode for `@require`". Astra's pins shipped under 5.5.0 and the 4.97.0 CHANGELOG promises Tampermonkey refuses a changed file; Violentmonkey still ignores the hashes. A wrong-hash install under 5.5.1 is the test. Logged in Roadmap_Blocked.
- **Trusted Types stay strict. Verified.** No `createPolicy('default')` anywhere in `extension/` or `userscript/`. Aviatrix's 2026 write-up of a YouTube ad-block extension that registered a permissive default policy is the counterexample to keep out.
- **Platform changes, checked and fine. Verified.** Chrome 154 (2026-09-22) adds WebSocket `targetAddressSpace` and Background Fetch LNA gating, neither used. Firefox 154 to 157 add `sandbox`, `theme.backgrounds_area`, and `alarms.clearAll()` resolving `undefined`; Astra creates one alarm (`background.js:364`, the zero-ad pause) and never calls `clearAll`. Nothing in Firefox 154 to 157 makes unsigned XPIs installable. Chrome Web Store's 2026-08-01 policy tightens Limited Use; Astra has no listing.
- **Signed-out YouTube is getting harder. Likely.** "Tell HN: YouTube is punishing logged-out users" (2026-10-10, 50018070) describes login walls for anonymous and VPN traffic. Every Astra live smoke runs signed out, and the companion's yt-dlp path is the same traffic.
- **Companion context** (lives in the AstraDownloader repo): yt-dlp stable is still 2026.08.19; its open issues in the window are age-restricted downloads (#17751, #17705) and a flag to refuse downloads without a JS runtime (#17701); bgutil PO-token provider 2.0.0 patched an RCE (GHSA-qpv9-8xfj-xx9m) and 2.0.1/2.0.2 (2026-10-02, 2026-10-07) clear dependency CVEs. Deno 2.9.7 (2026-09-17) is current.
- **Repository hygiene. Verified.** `main` is 12 commits ahead of `origin/main` (the 2026-10-09 session's last push was before its i18n sweep), `extension/core/settings-sync.js` and `tests/settings-sync.test.js` carry uncommitted work on the sync payload budget, and `CHANGELOG.md` Unreleased stops at 17:52 on 2026-10-09 while seven fix commits landed between 17:54 and 18:08 (player-dock `b0f4565f`, DeArrow `1ab5cdc0` and `7705066b`, Return YouTube Dislike `54094a4f`, sync `69e50bbc` and `b7f6badb`, settings `f14c4a76`). The release-notes script publishes the section verbatim.

## Architecture Assessment

- **`extension/ytkit.js` is 49,680 lines**, down from 53,255 on 2026-10-05 after the 3,900-line settings-panel fallback was retired, with 280 of 305 feature IDs still inline against 31 peeled modules (`scripts/monolith-peel-baseline.json`). `YTKit-app.user.js` is 1,654,681 bytes, 78.9% of the 2 MiB cap, so the retirement bought 160 KB of Greasy Fork headroom.
- **The copy gate has a structural blind spot.** `scripts/check-localizable-ui-copy.js` counts `showToast` as a sink (line 43) but keeps legacy files behind a whole-file baseline, so 29 capitalised English `showToast('…')` literals remain in `ytkit.js` (16525 "Playlist reversed", 17494 "Sleep timer elapsed. Playback paused.", 17795 "A-B Loop cleared", 18822 "No video found", 18890 "Video popped out", 18919 "PiP not supported" among them) while `features/` has none and the 2026-10-09 CHANGELOG says every language is fully translated. `docs/i18n-coverage.md` (97.7% to 98.9%) measures catalogue keys, not sinks.
- **Two toast APIs** live in `ytkit.js`: the delegating `showToast` at 3255 and a `createToast` wrapper at 40907, beside `core/toast.js` and `core/toast-dom.js`. One entry point would make the quiet-toast rule (`isQuietToast`, v4.95.0) impossible to bypass.
- **Page-world response patching exists but has one tenant.** `installFeedPrefilter` (`ytkit-main.js:266-347`) hooks `JSON.parse` behind a bridge attribute and hands parsed data to `core/feed-prefilter.js`. AI-chapter removal and any future response-shaped feature should register as a second decision module on that hook instead of a second hook; `core/heatmap.js:85-88` already reads `markersMap`, so the two have to agree on what survives.
- **Experiment flags would be the first write to page config.** The feed prefilter only filters; a layout restorer sets `EXPERIMENT_FLAGS`. Keep it behind a setting, apply before `ytcfg.set` runs (document start), re-apply on `yt-navigate-finish`, and ship the flag list as a user-editable string setting (the `autoSkipChapterPatterns` pattern) so renamed flags don't need a release.
- **The 2026-09-28 audit sweep is still open** (ROADMAP P3). Fixes landed on 2026-10-09 in three of its listed modules (dearrow, return-dislike, player-dock), so the remaining reading is element-zapper, search-hygiene, sponsorblock, subtitles, video-insights, live-chat, sticky-chat, subscription-view and `core/*`.
- **Doc drift the gates don't see.** `scripts/check-versions.js` `ACTIVE_DOC_TRUTH_FILES` (:32-38) covers README and four docs, so `docs/hosted-policy-closure.md:36,77` ("Latest public release `v4.46.0`"), `SOURCE-README.md:67` ("`.nvmrc` pins Node 22", it holds 24), `CONTRIBUTING.md:100-101` (edit a `features` array and `settingsManager.defaults`, replaced by the schema) and `INSTALL.md` (no chromium-store profile) all pass. `release-channels.json` has no `chromium-store` channel for the artifacts the README ships. `.github/FUNDING.yml` has never existed despite the README's Ko-fi button.
- **Coverage blind spots unchanged:** every live smoke runs signed out, so the avatar menu, Subscriptions, notifications and Watch Later are untested; the Firefox lane is blocked on the 156 session hang (Roadmap_Blocked). No CI by repo policy (CONTRIBUTING: "No CI and no git hooks by policy"), so the 39 gates are only as good as the last local run.
- **Checked this pass with nothing new to add:** accessibility (still the blocked NVDA evidence record), offline behaviour (everything local except the opt-in AI, companion, enrichment and AI-label lookups), upgrades (both vehicles now show a What's New note), migration from other tools (the import item below is the first code-side step; Roadmap_Blocked's documentation item stands).
- **Strengths not to disturb:** the 39-gate runner, the `init()`/`destroy()` contract, the peel ratchet, signed feeds, generated userscript parity with drift and symbol gates, and the quiet-by-default toasts.

## Rejected Ideas

- **Hold-to-2x or temporary-speed gesture** ([YouTube Enhancer #1435](https://github.com/YouTube-Enhancer/extension/issues/1435), #661 with 7 reactions). Still one tracker, and it overlaps YouTube's own press-and-hold. Revisit when a second tracker asks.
- **Hotkey remapping or a per-key blocker** (RVX "Hotkey" patch, Life-Experimentalist/Youtube-Keystrokes-Blocker). Astra ships no keyboard shortcuts by house rule.
- **A custom-script slot** like Enhancer for YouTube's. Remote code is barred by Chrome Web Store policy and breaks the reviewable-package promise.
- **Cloud settings sync with ETags** (Vencord `cloudSync.ts`). A server-side account contradicts local-first and no-telemetry; `storage.sync` and file export already exist.
- **Silence skipping** (WofWca/jumpcutter). `skipSilence*` sits in `RETIRED_SHIPPED_IDS` (`settings-schema.js:1118-1122`); don't bring it back without the retirement reason.
- **Thumbnail like/dislike bars** (elliotwaite/thumbnail-rating-bar-for-youtube, 272 stars). One Return YouTube Dislike request per card by default, against the local-first stance; `likeViewRatio` on the watch page covers the question.
- **Danmaku live-chat overlay** (ys-j/YoutubeLiveChatFlusher) and **data cost before play** (TubeSize). Niche, one source each.
- **Play All on channel pages** (RobertWesner/YouTube-Play-All, 87 stars) and **disable playlist autoplay** (an RVX Android patch). One source each; Watch Feed covers the queue case. Under consideration, not scheduled.
- **Repairing the missing Up Next panel on Mixes** (r/youtube 1ww2shl, 2026-10-02). A YouTube-side bug with a YouTube-side workaround.
- **Hiding Custom Feeds, Shorts Series or the Ask surfaces now.** Still not seen on desktop web beyond the 2026-09-23 announcements; both stay in Roadmap_Blocked until a capture exists.
- **Swapping the comments and sidebar columns** ([ImprovedTube #4370](https://github.com/code-charity/youtube/issues/4370)). One request; Theater Split is the Astra answer.
- **Hide the YouTube logo, per-channel grayscale exceptions** (Remove YouTube Suggestions 4.3.83/4.4.0). One source each, cosmetic.
- **Block the Opus codec** ([ImprovedTube #4363](https://github.com/code-charity/youtube/issues/4363)). One requester; Astra's codec paths are video-only by design.
- **Listing in pluja/awesome-privacy** (19,940 stars). It lists services and frontends, not extensions. Lissy93's list is a different fit (roadmap).
- **A GitHub Actions lane.** Removed on 2026-06-26 by policy, and the release-currency tests forbid citing workflow paths.
- **Carried unchanged from 2026-09-04 and 2026-10-05:** vision-LLM selector repair, telemetry, a plugin marketplace, mobile or multi-user support, aria2c, ad blocking or anti-adblock countermeasures, per-card AI-label lookups on by default, more locales before the existing ten are finished (they are now).

## Sources

### Repository
- https://github.com/SysAdminDoc/Astra-Deck/issues/51
- https://github.com/SysAdminDoc/Astra-Deck/discussions/43
- https://github.com/SysAdminDoc/Astra-Deck/discussions/44
- https://github.com/SysAdminDoc/Astra-Deck/releases/tag/v4.97.0

### YouTube's 2026-10 watch layout
- https://www.ubergizmo.com/2026/10/youtube-tests-desktop-redesign-comments-moved-to-right-panel/
- https://www.androidauthority.com/youtube-desktop-comments-sidebar-redesign-3720193/
- https://techdows.com/how-to-revert-youtube-new-layout-october-2026.html
- https://github.com/insin/control-panel-for-youtube/issues/343
- https://github.com/davidluttrull/youtube-classic-watch-layout
- https://www.reddit.com/r/youtube/comments/1wzvguw/how_to_get_the_old_youtube_desktop_layout_back/
- https://www.reddit.com/r/youtube/comments/1wxerdp/is_anyone_else_forced_onto_this_nightmare_youtube/
- https://www.reddit.com/r/youtube/comments/1x1nloc/defaulting_to_theatre_mode_on_desktop/

### Direct OSS competitors
- https://github.com/insin/control-panel-for-youtube/commits/main (beb487b3, 809ea285, 35c57575)
- https://github.com/insin/control-panel-for-youtube/issues/340
- https://github.com/insin/control-panel-for-youtube/issues/342
- https://github.com/insin/control-panel-for-youtube/issues/344
- https://github.com/lawrencehook/remove-youtube-suggestions/releases/tag/v4.4.0
- https://github.com/lawrencehook/remove-youtube-suggestions/releases/tag/v4.3.84
- https://github.com/lawrencehook/remove-youtube-suggestions/commit/2dca2940
- https://github.com/lawrencehook/remove-youtube-suggestions/commit/436b0fd8
- https://github.com/code-charity/youtube/issues/3593
- https://github.com/code-charity/youtube/issues/4361
- https://github.com/code-charity/youtube/issues/4374
- https://github.com/code-charity/youtube/issues/4381
- https://github.com/YouTube-Enhancer/extension/issues/1435
- https://github.com/varshneydevansh/FilterTube/issues/79
- https://github.com/varshneydevansh/FilterTube/issues/80
- https://github.com/zpix1/yt-anti-translate
- https://github.com/TimMacy/YouTubeAlchemy
- https://github.com/xlch88/YouTubeTweak
- https://github.com/amitbl/blocktube/issues
- https://github.com/ajayyy/DeArrow/issues/528

### Userscript tier, lists and adjacent projects
- https://greasyfork.org/en/help/cdns
- https://greasyfork.org/en/help/external-scripts
- https://greasyfork.org/en/scripts/598706-youtube-remove-ai-chapters
- https://greasyfork.org/en/scripts/by-site/youtube.com?sort=daily_installs
- https://github.com/awesome-scripts/awesome-userscripts/blob/master/CONTRIBUTING.md
- https://github.com/Lissy93/awesome-privacy/blob/main/.github/CONTRIBUTING.md
- https://github.com/FreeTubeApp/FreeTube/blob/development/src/renderer/components/DataSettings/DataSettings.vue
- https://github.com/refined-github/refined-github/blob/main/source/feature-renames.json
- https://github.com/anddea/revanced-patches/blob/main/patches-list.json
- https://github.com/RobertWesner/YouTube-Play-All
- https://github.com/WofWca/jumpcutter
- https://github.com/elliotwaite/thumbnail-rating-bar-for-youtube

### Community
- https://news.ycombinator.com/item?id=50018070
- https://news.ycombinator.com/item?id=49528895
- https://www.reddit.com/r/youtube/comments/1ww2shl/anyone_else_missing_the_up_next_sidebar_on_the/
- https://www.reddit.com/r/youtube/comments/1x1gvic/youtube_playlists_are_completely_broken/
- https://www.reddit.com/r/youtube/search/?q=AI+slop&sort=new&t=month
- https://xenospectrum.com/en/youtube-made-on-2026-new-features/
- https://www.droid-life.com/2026/09/23/youtube-teases-3-neat-new-features/

### Platform, managers and security
- https://developer.chrome.com/release-notes/154
- https://developer.chrome.com/docs/extensions/whats-new
- https://developer.chrome.com/blog/cws-policy-updates-2026
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/157
- https://www.tampermonkey.net/changelog.php
- https://www.tampermonkey.net/documentation.php?q=externals
- https://github.com/violentmonkey/violentmonkey/releases
- https://aviatrix.ai/threat-research-center/chrome-adblock-for-youtube-extension-vulnerability-2026/
- https://github.com/mozilla/web-ext/releases
- https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases
- https://github.com/denoland/deno/releases/tag/v2.9.7
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository

## Open Questions

- **Does an enrolled account's watch page answer to the community flag list, and does a document-start override survive YouTube's own `ytcfg.set` merges?** The only in-field implementation (youtube-classic-watch-layout) was tested by forcing the flags on. A staged run on an account YouTube enrolled, or a forced-flag run, settles it; neither can run without the owner's word.
- **Does Tampermonkey 5.5.1 refuse a mismatched `#sha256=` library, and does any Violentmonkey 2.49.x build check it?** The 4.97.0 CHANGELOG promises the refusal; Roadmap_Blocked holds the check.
- **Is every `grid-shelf-view-model` shelf a Shorts shelf?** Remove YouTube Suggestions hides them all under Remove All Shorts; scoping with `:has(ytm-shorts-lockup-view-model)` is the safe default until a capture shows otherwise.
- **Does YouTube's scripted-click rejection (2026-10-08) reach the settings menu and the Still Watching prompt?** Only a live watch page can say.
