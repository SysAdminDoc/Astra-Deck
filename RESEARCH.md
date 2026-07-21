# Research — Astra Deck
Date: 2026-07-20 — replaces all prior research (supersedes 2026-07-14).

## Executive Summary

[Verified] Astra Deck (YTKit) is an exceptionally mature, local-first YouTube enhancement suite: a Chromium/Firefox MV3 extension (`extension/ytkit.js`, 51,758 lines + 25 extracted feature modules, 415 schema-backed settings, 11 locales), a generated userscript, and a Windows Python/PyQt6/yt-dlp companion. Verification against the 2026-07-14 research shows ~70% of its prior top-10 has shipped: transcript indexing was rebuilt around `TranscriptService`, AI credentials moved to background header-based custody, the pending-download queue is now a schema-versioned on-disk `DownloadQueueStore`, `--break-system-packages` is removed (regression-tested), yt-dlp is pinned to the CVE-fixed `2026.7.4`, and the WCAG 2.2 focus-not-obscured/200%-reflow gaps are covered by `smoke-headless-a11y.js`. Most competitor-distinctive features are already present (auto-dub/original-audio track, watched-ratio hide, grid density, OPML/CSV/JSON subscription export, comment filtering, SponsorBlock-in-download, reverse playlist).

The single highest-value direction now is **companion extraction resilience**, because it is the only area at risk of *total* failure rather than degradation. YouTube's 2025-2026 shift to SABR + enforced PO tokens means a yt-dlp wrapper that lacks a token-exempt fallback client, or whose PO-token provider is not provisioned, slides from "reduced formats" to "cannot download." Astra already provisions Deno and consumes a bgutil PO-token provider when present, but it has no `tv`/`android_vr` fallback client and does not auto-provision the provider itself. After that, the remaining opportunities are small, verified extension gaps.

Top opportunities, priority order:

1. [Verified] Token-exempt client fallback (`tv`/`android_vr`) when PO tokens/provider are unavailable.
2. [Verified] Auto-provision the bgutil PO-token provider (single-binary) the way Deno is already provisioned.
3. [Verified] Enforce a minimum FFmpeg version floor (≥ 8.1.2) in the readiness probe (CVE-2026-8461).
4. [Verified] Exact (non-rounded) view/like/comment counts.
5. [Verified] Copy video URL at the current timestamp.
6. [Verified] Scroll-over-volume-area to adjust volume (removed in the 2025 YouTube redesign).

## Product Map

- **Core workflows:** schema-driven customization of playback, layout, feeds, comments, live chat, privacy, focus, and accessibility; local retention of notes, bookmarks, watch state, download queue, transcript full-text search, filters, and subscription groups; optional SponsorBlock/DeArrow/Return-YouTube-Dislike/Reddit/BYO-AI enrichment; authenticated loopback download companion.
- **Personas:** power viewers, privacy-conscious users, students/researchers, distraction-reduction users, Windows media archivists.
- **Platforms/distribution:** Chrome-family + Firefox MV3 in store-safe and GitHub-full profiles; generated userscript; Windows 10+ PyQt6/PyInstaller companion; Node 22+ tooling floor.
- **Data flows:** content scripts ↔ MV3 worker structured messaging; per-capability optional host grants; settings/artifacts in extension storage/localStorage/IndexedDB; companion accepts loopback requests, provisions Deno, consumes an optional bgutil PO-token provider, and delegates to yt-dlp/FFmpeg; AI/metadata calls transit the background fetch boundary with header-based keys.
- **Hard constraints:** MIT repo license (companion redistribution posture is a blocked P0 legal decision); Chrome/Firefox MV3 lifecycles; YouTube SPA/DOM churn; store policy profiles; local-first/no-account; Windows-only companion.

## Competitive Landscape

The dominant finding is that Astra has already absorbed most competitor breadth. Learn/avoid notes below focus on the *deltas*.

- **Control Panel for YouTube (insin, 2025):** [Verified] Built almost entirely to revert the Oct-2025 YouTube redesign and winning installs on that alone. Learn: the redesign backlash is the single largest current demand wave. Avoid: shipping DOM-coupled redesign-repair without per-feature auto-disable-on-miss — it is the highest-maintenance category and turned Enhancer for YouTube unstable. Astra already covers watch-page restyle, de-pill, hide sidebar/shorts/related, theater split, grid density, watched-hide; the residual gap is small interaction restores (e.g., scroll-to-volume).
- **Enhancer for YouTube / Iridium:** [Verified] Scroll-to-change-volume, detached resizable player, screenshot, monetization badge, selective creator ad-support. Learn: small interaction restores are cheap wins. Avoid: features requiring an ad-war stance; Astra's lane is non-adblock enhancement.
- **ImprovedTube (code-charity):** [Verified] Heatmap-aware "Smart Speed", list-view feeds. Learn: timeline-data-driven playback is a differentiator. Avoid: importing breadth without ownership — Astra already has more settings than its monolith safely absorbs.
- **BlockTube:** [Verified] Regex + custom-JS filters. Learn: power-user filtering. Avoid: the custom-JS channel — it breaks Astra's reviewed-release/CSP boundary (already rejected). Astra's `commentFilterManager` and video hider cover the non-JS surface.
- **SponsorBlock / DeArrow:** [Verified] Community categories (AI-content, spoiler, loud-noise) are the top open requests but are *not yet shipped upstream*, so Astra cannot consume them until the servers add them — track, don't build.
- **Parabolic / Stacher / MeTube:** [Verified] File-size preview before download, storage-aware auto-format, encrypted cookie vault, channel/playlist subscription polling. Learn: pre-download metadata preview and format profiles. Avoid: always-on channel-archiving daemons (already rejected — the opt-in desktop companion has no service lifecycle).
- **yt-dlp core:** [Verified] The real competitor is YouTube itself. SABR + PO-token enforcement is the existential pressure; the fallback-client and provider-provisioning work below is direct parity-then-lead against that.

## Security, Privacy, and Reliability

- [Verified] The companion Python graph is at or above every 2025-2026 CVE floor: `Werkzeug==3.1.8` (> 3.1.3, closes CVE-2025-66221 Windows `safe_join` traversal — directly relevant to a localhost file server), `requests==2.34.2` (≥ 2.32.4), `urllib3==2.7.0` (≥ 2.6.0), `yt-dlp==2026.7.4` (covers aria2c RCE, `--exec` RCE, netrc-cmd, dangerous-file-type, curl cookie-leak). No dependency bump is warranted (`astra_downloader/constraints-release.txt`).
- [Verified] FFmpeg is downloaded at runtime from `yt-dlp/FFmpeg-Builds` "latest" and checksum-verified, but no *minimum version* is enforced, so a stale FFmpeg on PATH could be selected. CVE-2026-8461 (MagicYUV decoder RCE, CVSS 8.8) is fixed in FFmpeg ≥ 8.1.2; the readiness probe (`FfmpegCapabilitiesProbe`/`parse_ffmpeg_major`) should reject builds below the floor.
- [Verified] Reliability risk #1 is extraction, not code defects: `astra_downloader/health.py:118 build_youtube_extractor_args` sets SABR + PO-token args and consumes a bgutil provider when `ok`, but there is no token-exempt client fallback (`tv`/`android_vr`) and the provider (unlike Deno) is not auto-provisioned ("PO provider: Optional" on the dashboard). Flagged residential IPs and token-gated videos fail without it.
- [Verified, tracked] `is_playlist_url` still appends `--yes-playlist` with no `--playlist-end`/`--max-downloads` cap (`astra_downloader/download.py:1078`) — one request can spawn an unbounded job and (per the yt-dlp throttling guidance) raise IP-flagging risk. This is already a P2 product decision in `Roadmap_Blocked.md`; not re-added.
- [Verified, tracked] The store-safe/GitHub-full capability ceiling is still runtime-mutable (`build-extension.js` does not stamp the artifact; `extension/core/policy-profile.js` derives profile from settings). Tracked in `Roadmap_Blocked.md`; blocked on a docs-commit constraint, not re-added.

## Architecture Assessment

- [Verified] `extension/ytkit.js` is 51,758 lines (down from 55,172 on 2026-07-14 — extraction is progressing) across 25 `extension/features/*` modules. Continued one-feature-at-a-time extraction with fallback deletion remains the right long arc; already tracked.
- [Verified] `astra_downloader/astra_downloader.py` is 3,189 lines with `config.py`/`download.py`/`gui.py`/`health.py`/`routes.py` as ownership boundaries; `_compat.py:11` is an intentionally temporary re-export resolver shrinking as ownership moves. Healthy trajectory.
- [Verified] Testing/observability are strong: `smoke-headless-a11y.js` covers WCAG 2.2 2.4.11 (focus-not-obscured) and 1.4.10 (200%/320px reflow); `smoke:mv3-lifecycle`, contrast/overlay/a11y audits, and a redacted companion support bundle exist. No new observability/testing item is warranted beyond the extraction-resilience surfacing below.
- [Under consideration] Chrome 2025-2026 APIs (`browser` namespace in Chrome 148, `userScripts.execute()` in 135, offscreen `WORKER`/`LOCAL_STORAGE` reasons) could simplify the dual-target wrapper and move heavy DOM/audio work off the service worker, but Chrome 148 is bleeding-edge and Astra already maintains a working cross-browser wrapper. Not roadmap-ready; revisit when the baseline Chrome version rises.

## Rejected Ideas

- **Force original audio / disable auto-dub** — CPFY/ImprovedTube: already shipped (`antiTranslateAudioTrack`, `preferredAudioLang`, `notifyAutoDubbedAudio`, `audioTrackLanguage`).
- **Watched-percentage hide, grid items-per-row, list-view density** — CPFY/Redux: already shipped (`hideVideosWatchedRatio`, `hideWatchedMode`, `videosPerRow`).
- **OPML/CSV export of subscriptions, reverse playlist, comment keyword filtering, SponsorBlock-in-download, embed chapters/subs/thumbnail** — PocketTube/Iridium/BlockTube/Parabolic: already shipped (`_exportGroupsOpml`, `reversePlaylist`, `commentFilterManager`, `SponsorBlockAction`, `--embed-*`).
- **Volume booster / loudness normalization** — Enhancer/Iridium: already shipped (compressor-backed normalization, volume boost, passthrough).
- **`--download-archive` dedup** — Parabolic/Stacher: intentionally removed (`download.py:1062` documents the "already downloaded" UX failure; replaced by `--force-overwrites`).
- **SponsorBlock AI-content / spoiler / loud-noise categories** — SponsorBlock #2357/#546/#1310: not yet shipped server-side; Astra cannot consume them until upstream adds them. Track, do not build.
- **Custom-JS filter rules** — BlockTube: breaks the reviewed-release/CSP trust boundary (standing rejection).
- **Always-on channel/playlist subscription polling/archiving** — MeTube/Parabolic/TubeArchivist: needs a daemon/service lifecycle the opt-in desktop companion deliberately lacks.
- **Full alternative client, hosted multi-user backend, creator SEO suite, cloud AI proxy, mobile/Safari ports now** — carried forward from 2026-07-14; unchanged rationale.

## Sources

### YouTube-enhancement extensions / userscripts
- https://github.com/insin/control-panel-for-youtube
- https://soitis.dev/control-panel-for-youtube
- https://github.com/code-charity/youtube
- https://github.com/code-charity/youtube/issues/4147
- https://www.mrfdev.com/enhancer-for-youtube
- https://github.com/ParticleCore/Iridium
- https://unhookextension.com/features
- https://github.com/amitbl/blocktube
- https://github.com/omnidevZero/YouTubeRedux
- https://github.com/avi12/youtube-auto-hd
- https://github.com/YouTube-Enhancer/extension
- https://github.com/Shraymonks/YouTube-Exact-Like-Count
- https://pockettube.io/

### SponsorBlock/DeArrow ecosystem + community signal
- https://github.com/ajayyy/SponsorBlock/issues/2357
- https://github.com/ajayyy/SponsorBlock/issues/1562
- https://github.com/ajayyy/DeArrow/issues/464
- https://android.gadgethacks.com/news/youtube-interface-overhaul-sparks-user-fury-in-2025/
- https://techinika.com/new-youtube-ui-online-reviews
- https://www.bleepingcomputer.com/news/google/youtube-tests-harder-to-block-server-side-ad-injection-in-videos/

### yt-dlp / extraction ecosystem
- https://github.com/yt-dlp/yt-dlp/issues/15012
- https://github.com/yt-dlp/yt-dlp/issues/12482
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases
- https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs
- https://github.com/NickvisionApps/Parabolic
- https://github.com/alexta69/metube

### Security advisories / standards / platform
- https://www.ffmpeg.org/security.html
- https://nvd.nist.gov/vuln/detail/CVE-2025-66221
- https://github.com/yt-dlp/yt-dlp/security/advisories/GHSA-vx4q-3cr2-7cg2
- https://developer.chrome.com/docs/extensions/whats-new
- https://www.w3.org/TR/WCAG22/

## Open Questions

- [Needs product decision] Bundling the bgutil PO-token provider adds a persistent local sidecar (Rust single-binary or Node server) and a third YouTube-tracking dependency. Is the resilience worth the added footprint/attack surface for the default install, or should it stay opt-in with only the fallback-client chain shipped by default?
- [Needs legal validation, carried forward] Does the maintainer hold a commercial PyQt license, or should the companion adopt a GPL-compatible distribution posture / migrate to PySide6 before any binary release? (Still the blocking P0 in `Roadmap_Blocked.md`.)
