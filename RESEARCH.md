# Research - Astra Deck
Date: 2026-07-09 - replaces all prior research. Scope: competitive sweep of the YouTube USERSCRIPT ecosystem (plus userscript-adjacent extensions) to harvest features the extension does not have yet. The prior 2026-07-09 research (release-gate/trust pass) was fully drained into v4.47.0; see git history for its content.

## Executive Summary
[Verified] Astra Deck's ~386 setting keys already cover the large majority of what the YouTube userscript ecosystem ships — the Wave 1-10 imports plus v4.x additions match or exceed YouTube Alchemy, Nova YouTube, Iridium, and the Greasy Fork long tail on most axes. The genuine gaps cluster in six areas where sustained demand exists and competition is weak: (1) Watch Later / queue / watch-history management (no official API since 2016; loudest unmet demand on HN and in paid CWS tools), (2) in-Shorts player controls (Astra only redirects or hides Shorts; the "Better Youtube Shorts" family adds seekbar/volume/speed/anti-loop inside the Shorts player), (3) fullscreen ergonomics (scrollable comments under fullscreen, auto-exit at video end, "More videos" end-grid removal, clock/title overlay), (4) live-stream tooling (force-DVR, live-edge speed reset, replay chat-density highlight chart, floating chat in fullscreen), (5) the YouTube Alchemy v10.16-v11.4 delta (muted-auto-subtitles, subtitles-on-rewind, speed/SponsorBlock-adjusted remaining time, per-page CSS toggling), and (6) comment/subtitle intelligence (language filter, duplicate collapse, per-user block, dual-language captions). A seventh, strategic opportunity is trust positioning: after Return YouTube Dislike's 2025-10 ad-injection scandal and a malicious Shorts-blocker incident, "open source, no remote code, no monetization hooks" is itself a marketable feature Astra Deck already satisfies.

Top opportunities in priority order: playback-error auto-recovery, Watch Later workbench, persistent local queue, in-Shorts player controls, fullscreen comments/auto-exit, speed+SB-aware remaining time, live DVR/speed tools, comment language/duplicate/user filters, dual-language subtitles, allowlist (whitelist) hiding mode.

## Product Map
- [Verified] Core workflows: in-page enhancement via `extension/ytkit.js` + peeled `extension/features/*` modules; popup/side-panel management; in-page settings command center; local download handoff via the Astra Downloader companion; profile-split store-safe/GitHub-full artifacts via `build-extension.js`.
- [Verified] Personas: power viewers, privacy-sensitive local-first users, subscription-heavy users, researchers (transcripts/notes/analytics).
- [Verified] Distribution: Chrome ZIP+CRX, Firefox ZIP+XPI, Tampermonkey userscript, Windows companion EXE. This pass targets the EXTENSION first (per operator direction); userscript parity items are intentionally not proposed (the 19-item `not-yet-ported` backlog is capped and tracked by `scripts/check-userscript-drift.js`).
- [Verified] External data flows: SponsorBlock, DeArrow, RYD, Reddit, optional AI/Cobalt/loopback (GitHub-full only). New features below must respect `core/data-flow.js` profile gating.

## Competitive Landscape (userscript ecosystem)
- **YouTube Alchemy (TimMacy, v11.4 2026-07-04, AGPL-3.0)** — the feature-breadth ceiling: 200+ toggles, weekly cadence, DOM/CSS-only (no InnerTube, no external requests). Learn: the v10.16-v11.4 delta — live catch-up 1x speed reset, auto-subtitles-when-muted, subtitles-for-10s-on-rewind, transcript retry + modern-panel fallback, SB-segment/speed-aware remaining time, per-page CSS injection toggling for perf. Avoid: its keyboard-shortcut-heavy UX (Astra policy forbids shortcuts).
- **Nova YouTube (raingart, 258 stars)** — cleanest plugin-file architecture with auto-generated options UI; closest architectural cousin to Astra's peeled modules. Learn: no-sleep plugin, playback-error handling, plugin registry pattern. Avoid: its download/region-unblock plugins in store-safe profile (policy risk).
- **Tabview Youtube Totara (cyfung1031)** — watch-page tabs + live-chat lag reduction + background-tab keep-alive. Astra already has `watchPageTabs` and CPU tamer; learn its chat-render throttling and `content-visibility` CSS perf tricks.
- **Tube Insights (exyezed, consolidated 2025-11)** — the only suite built on InnerTube (`youtubei/v1`): monetization, category, country flag, exact dates, real-time sub counts, channel bookmarker. Astra has `monetizationIndicator`; the rest is an optional "insights" cluster (GitHub-full profile, degraded-mode aware). Avoid: its backend-routed downloads (Astra has the local companion).
- **Iridium (ParticleCore, archived 2026-01)** — pioneer of MAIN-world player-response interception; now dead, its ~10k users need a migration target (migration guide already tracked in `Roadmap_Blocked.md`). Its feature set (HFR block, per-section Shorts hiding, logo-to-subs) is already covered.
- **Simple YouTube Age Restriction Bypass (zerodytrash, 2.4k stars)** — broken upstream since YouTube's 2026 player changes; Astra's own `ageRestrictionBypass` should be validated against the same breakage class (alternate-client player requests).
- **Better Youtube Shorts / BYTS family (Meriel Varen, WaGi-Coding)** — in-Shorts seekbar, volume, speed, spacebar pause, anti-loop, auto-advance. Astra has nothing inside the Shorts player; biggest single UX gap for users who don't redirect Shorts away.
- **Control Panel for YouTube (insin, 91 toggles, desktop+mobile)** — the best "restore old UI / hide per-content-type" taxonomy. Astra covers most; still lacks: hide AI-summary/"Ask" surfaces, notification limit/hide-read, disable-Home-entirely. Avoid: mobile-web support (Astra is desktop-only by architecture).
- **Long-tail Greasy Fork (~180 scripts swept)** — anti-interruption cluster (auto-dismiss pause dialogs — covered; playback-error auto-refresh — NOT covered), volume science (logarithmic volume curve, normalization defeat — partially covered), playlist math (sort-by-duration, per-playlist resume memory, auto-skip watched — partially covered), dual-language subtitles (~30k installs across the family — not covered), Filmot deleted-video title restore (4.5k installs — not covered).

## Security, Privacy, and Reliability
- [Verified] Trust positioning: RYD injected full-page ads in 2025-10 (HN 45696329); a popular Shorts blocker turned malicious (HN 42119203). Astra's no-remote-code, local-first posture is a differentiator worth stating in store listing copy (blocked store-submission items already exist).
- [Likely] `ageRestrictionBypass` risk: the upstream reference implementation is broken since 2026 player changes; Astra's implementation needs a fixture canary against `playabilityStatus: AGE_VERIFICATION_REQUIRED` before the feature keeps being recommended.
- [Verified] Any Watch Later / history / queue feature rides undocumented `youtubei/v1` endpoints or DOM automation — the same fragility class as `bulkCardActions`. Reuse its bounded-session + pacing + local-log + Undo pattern and `extension/core/external-api-health.js` degradation surfaces for every new mutation feature.
- [Verified] Ad-control features (allow-ads-per-channel, ad speedup/mute) remain excluded from store-safe; do not import despite their prevalence in the long tail.

## Architecture Assessment
- [Verified] Alchemy v11.0's per-page CSS injection toggling (inject only the CSS a page type needs) is a real perf lever; Astra injects most feature CSS globally via `extension/core/styles.js` lifecycle specs — a page-scoped spec variant would cut style-recalc cost on home/subs pages.
- [Verified] Transcript resilience: Alchemy v11.3-11.4 supports both `engagement-panel-searchable-transcript` and the new `data-target-id` modern transcript panel with fallback. Astra's TranscriptService / `transcriptViewer` should pin both variants in the selector packs (`tests/fixtures/selector-surface-matches.json`).
- [Verified] Hardening tests slice fixed byte windows from `ytkit.js` feature blocks — every feature added below may require widening those windows (known repo gotcha).
- [Verified] New external integrations (Filmot, InnerTube insights) must flow through `core/data-flow.js` profile derivation so store-safe artifacts strip them automatically.

## Rejected Ideas
- Ad-blocking/ad-speedup/ad-mute ports (youtube-adb 304k installs, worldtracin) — store policy risk; MAIN-world adblock stays userscript-only. Source: Greasy Fork by-site sweep.
- Background-play via Page Visibility spoofing (Video Background Play Fix, 14k) — Google patches it quarterly; arms race with policy exposure. Source: androidauthority.com 2026 coverage.
- m.youtube.com / mobile-web support (Control Panel for YouTube ships it) — extension surface is desktop-only; a second selector matrix is not worth it.
- Layout-era recreations (CustomTube/StarTube 2008-2024 layouts) — philosophy misfit; `classicLayoutProfile` already covers the tasteful subset.
- Pre-boot `yt.config_`/EXPERIMENT_FLAGS flipping (YouTube Web Tweaks) — the pattern that killed that script; breakage class too high. Source: GF 447802 discontinuation notice.
- Local signature-decipher downloads (maple3142 pattern) — permanent maintenance treadmill; Astra has companion + Cobalt paths.
- Watch-together sync (SyncWatch/WatchParty) — requires signaling infrastructure; contradicts the no-backend posture.
- Danmaku chat overlay + TTS chat reader (CY Fung/knoa family) — niche audience, heavy perf cost on live pages.
- Genius lyrics / Spotify cross-links (cuzi, l1am9111) — external API bloat outside the enhancement mission.
- Crowdsourced "annoyances database" (HN 42995669) — requires running a voting backend.
- Account-proxy age-bypass fallback (zerodytrash strategy 2) — routes user traffic through a third-party account pool; unacceptable privacy posture.
- Subtitle hover-dictionary language learning (Qwyuaa) — large effort, tiny audience; dedicated tools (Language Reactor) own the niche.
- Era browser / "time machine" feed (bygone-yt) — novelty without retention.

## Sources
GitHub: github.com/TimMacy/YouTubeAlchemy · github.com/ParticleCore/Iridium · github.com/cyfung1031/Tabview-Youtube · github.com/exyezed/tube-insights · github.com/raingart/Nova-YouTube-extension · github.com/zerodytrash/Simple-YouTube-Age-Restriction-Bypass · github.com/exwm/yt_clipper · github.com/omnidevZero/YouTubeRedux · github.com/lightbeam24/CustomTube · github.com/zpix1/yt-anti-translate · github.com/insin/control-panel-for-youtube · github.com/amitbl/blocktube/issues · github.com/ajayyy/SponsorBlock/issues · github.com/ajayyy/DeArrow/releases · github.com/Anarios/return-youtube-dislike/issues · github.com/code-charity/youtube/issues · github.com/sniklaus/youtube-watchmarker · github.com/adamlui/youtube-classic
Greasy Fork: greasyfork.org/en/scripts/521686 (Alchemy) · greasyfork.org/en/scripts/501249 (Totara) · greasyfork.org/en/scripts/by-site/youtube.com?sort=total_installs · greasyfork.org/en/users/371179 (CY Fung catalog) · greasyfork.org/en/scripts/485622 (StarTube) · greasyfork.org/en/scripts/460680 (YT Tools AIO)
Community/other: news.ycombinator.com/item?id=45687227 (FocusTube) · news.ycombinator.com/item?id=39627895 (Control Panel) · news.ycombinator.com/item?id=45696329 (RYD ads) · news.ycombinator.com/item?id=46391925 (Streamline queue) · soitis.dev/control-panel-for-youtube · inzk.dev/tweaks-for-youtube/features · tidywl.com/blog/youtube-watch-later-5000-limit · wiki.sponsor.ajay.app/w/Advanced_skip_options · pockettube.io · unhook.app

## Open Questions
- Does `playlistSearch` (extension-only feature) already cover the Save-to-playlist dialog, or only the playlist panel? Determines scope of the save-dialog upgrade item.
- Is `ageRestrictionBypass` currently functional against 2026 player responses? Needs a live check before its canary item is prioritized above P2.
- Which mechanism does `watchLaterCleanup` use today (DOM automation vs `youtubei` browse)? The Watch Later workbench should extend the same mechanism rather than introduce a second one.
