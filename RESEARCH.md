# Research — Astra Deck
Date: 2026-07-21 — replaces all prior research (supersedes 2026-07-20).

## Executive Summary

[Verified] Astra Deck (YTKit) is an exceptionally mature, local-first YouTube enhancement suite: a Chromium/Firefox MV3 extension (`extension/ytkit.js`, ~51.8K lines + 25 feature modules, 415 schema-backed settings, 11 locales), a generated userscript, and a Windows Python/PyQt6/yt-dlp companion. Since 2026-07-20 the active roadmap has been fully drained: the token-exempt client fallback and the exact FFmpeg 8.1.2 security floor shipped, and the three "viewer gap" items were found already implemented under different setting names (`videoContextMenu` copy-timestamp, `preciseViewCounts`, `volumeWheelMode`). 40 items remain in `Roadmap_Blocked.md` (store/AMO submission, companion release, DVR force, playlist bounding, capability ceiling, subtitle/AI/comment packs) — a comprehensive tracked backlog, not re-proposed here.

This delta pass has one high-value finding: **the token-exempt fallback chain shipped on 2026-07-21 (`tv,android_vr,web`) is sub-optimal and should be corrected to `tv,web_embedded,android_vr`.** Bare `web` is not token-exempt — without a GVS PO token it returns only SABR-protocol formats, which yt-dlp still cannot download (the native SABR downloader, PR #13515, is unmerged as of 2026-07-13), so `web` as a last fallback is dead weight that yt-dlp skips or 403s. `android_vr` has confirmed 2026 reliability regressions (intermittent format-18-only 360p drops, `UNPLAYABLE` on "made for kids", no adaptive URLs) and should be demoted to last, not second. This corrects production behavior with strong upstream evidence.

Top opportunities, priority order:

1. [Verified] Correct the token-exempt fallback chain to `tv,web_embedded,android_vr` (drop dead-weight `web`, demote erratic `android_vr`).
2. [Verified] Nudge the user to install a PO-token provider when an exempt-chain download degrades or fails (no token-free client covers age-gated/members/kids/full-quality).
3. [Tracked, blocked] Everything else of value is already in `Roadmap_Blocked.md`.

## Product Map

- **Core workflows:** schema-driven customization of playback, layout, feeds, comments, live chat, privacy, focus, accessibility; local retention of notes, bookmarks, watch state, download queue, transcript full-text search, filters, subscription groups; optional SponsorBlock/DeArrow/Return-YouTube-Dislike/Reddit/BYO-AI enrichment; authenticated loopback download companion.
- **Personas:** power viewers, privacy-conscious users, students/researchers, distraction-reduction users, Windows media archivists.
- **Platforms/distribution:** Chrome-family + Firefox MV3 in store-safe and GitHub-full profiles; generated userscript; Windows 10+ PyQt6/PyInstaller companion; Node 22+ tooling floor.
- **Data flows:** content scripts (youtube.com/youtu.be only — no `<all_urls>`/`file://`/self-injection) ↔ MV3 worker; per-capability optional host grants; settings/artifacts in extension storage/localStorage/IndexedDB; companion accepts loopback requests, auto-provisions Deno, consumes an optional bgutil PO-token provider (falls back to token-exempt clients when absent), and delegates to yt-dlp/FFmpeg; AI/metadata calls transit the background fetch boundary with header-based keys.
- **Hard constraints:** MIT repo license (companion redistribution posture is a blocked P0 legal decision); Chrome/Firefox MV3 lifecycles; YouTube SABR/PO-token + SPA/DOM churn; store policy profiles; local-first/no-account; Windows-only companion.

## Competitive Landscape

The 2026-07-20 sweep established that Astra has already absorbed most competitor breadth; this pass adds only deltas.

- **yt-dlp core (the real competitor is YouTube):** [Verified] SABR + PO-token enforcement keeps expanding — `web` lost `adaptiveFormats` playback URLs (SABR-only), and SABR is forced even with Premium cookies + PO token in some cases. The native SABR downloader (PR #13515) is not yet merged, so SABR-only clients remain undownloadable. This is exactly why the companion must lead with non-SABR exempt clients (`tv`), and why bare `web` in the fallback is useless. Learn: keep tracking the exempt-client set and PR #13515; it will change the calculus when merged.
- **SponsorBlock / DeArrow:** [Verified] The AI-content category is still unshipped — #2357 (2025-10-10) closed with no PR, duplicate #2499 (2026-06-03) open, #1963 (2024-02-01) open. There is no public AI-content segment DB to consume; any Astra AI-content feature would need on-device heuristics, not a SponsorBlock-style API. Track, do not build.
- **Control Panel for YouTube / Enhancer / ImprovedTube / Iridium / BlockTube / Parabolic / Stacher / MeTube:** [Verified] Unchanged from 2026-07-20 — no new distinctive feature surfaced, and no new 2026-launched YouTube-enhancement extension emerged to differentiate against. The incumbents are stable-to-declining (Enhancer chronic breakage).

## Security, Privacy, and Reliability

- [Verified] **Fallback-chain correctness (shipped 2026-07-21):** `astra_downloader/health.py` `build_youtube_extractor_args` emits `youtube:player_client=tv,android_vr,web` when the PO-token provider is absent. `web` is not a token-exempt client (SABR-only without a GVS token → yt-dlp skip/403), and `android_vr` is erratic in 2026 (format-18-only drops; `UNPLAYABLE` on kids content). Correct to `tv,web_embedded,android_vr`. This is a reliability defect in just-shipped code, not a stylistic preference.
- [Verified] **Coverage gap is inherent:** no token-free client covers the full catalog at full quality — `tv` fails `LOGIN_REQUIRED` on age-gated/members content, `android_vr` fails kids/age-gated, `web_embedded` only covers embeddable videos. Robust unattended coverage of those classes still requires a PO-token provider; the companion should surface that when a download actually degrades/fails, not just passively on the dashboard "PO provider: Fallback" row.
- [Verified, N/A] **Firefox 149-153 platform changes do NOT apply:** FF 152 removed content-script injection into `moz-extension://` documents and FF 153 makes `file://`/`<all_urls>` access opt-in with re-authorization. Astra's `content_scripts` match only `*.youtube.com`/`youtu.be`/`live_chat`, declare no `file://` host permission, and never self-inject — verified in `extension/manifest.json`. No action; recorded so this is not re-investigated.
- [Verified, tracked] yt-dlp `==2026.7.4` (CVE-2026-55404 `--write-link` fix, `--exec` restricted to safe conversions, curl cookie-leak fix) is already pinned in `astra_downloader/constraints-release.txt`. The exact FFmpeg 8.1.2 floor now flags stale PATH ffmpeg. No dependency action.
- [Tracked, blocked] `/health` token echo and unauth log-line leak, playlist unbounded downloads, `.google.com` cookie breadth, native-host single-message handshake, and the capability-ceiling immutability are all already in `Roadmap_Blocked.md`.

## Architecture Assessment

- [Verified] `extension/ytkit.js` (~51.8K lines, down from 55K on 2026-07-14) and the companion's `astra_downloader.py` (~3.2K lines) continue their one-feature-at-a-time extraction; the canonical-implementation-per-feature and stale-userscript-bundle items are already tracked in `Roadmap_Blocked.md`. No new refactor item warranted.
- [Verified] Testing/observability remain strong: 275 companion tests + 1188 extension tests, `smoke-headless-a11y.js` (WCAG 2.2), contrast/overlay/i18n gates, MV3-lifecycle smoke, redacted companion diagnostics. The one genuine coverage gap — live-YouTube-DOM behavioral verification of the feature modules — is tracked in `Roadmap_Blocked.md` (needs a real browser).
- [Under consideration] Chrome 148 `browser` namespace + structured-clone messaging and `userScripts.execute()` (Chrome 135) could simplify the dual-target wrapper and on-demand page-world injection, but the baseline Chrome floor is well below 148 and the existing wrapper works; revisit when the floor rises. Not roadmap-ready.

## Rejected Ideas

- **AI-generated-content detect/skip category** — SponsorBlock #2357/#2499/#1963: no public segment DB and no maintainer commitment; a viewer extension would need on-device heuristic detection (unreliable, high false-positive, maintenance-heavy) with no community-data leverage. Distinct from the tracked "Hide AI surfaces pack" (which hides YouTube's own AI UI, not creator content).
- **Firefox 152/153 self-injection & file-access hardening** — Mozilla add-on blog: verified not applicable (no self-injection, no `file://`); nothing to harden.
- **Chrome `browser`-namespace / userScripts / structured-clone migration now** — Chrome extensions "what's new": bleeding-edge (Chrome 148) vs the extension's support floor; the working cross-browser wrapper makes this churn, not value, today.
- **Bundle the native SABR downloader path** — yt-dlp PR #13515: unmerged upstream; nothing to integrate until it lands.
- **Full alternative client, hosted multi-user backend, creator SEO suite, cloud AI proxy, mobile/Safari ports, always-on channel archiving, arbitrary yt-dlp arg text, custom-JS filters** — carried forward from prior research; unchanged rationale.

## Sources

### yt-dlp / YouTube extraction (client validation)
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/yt-dlp/yt-dlp/issues/12482
- https://github.com/yt-dlp/yt-dlp/issues/14390
- https://github.com/yt-dlp/yt-dlp/issues/15689
- https://github.com/yt-dlp/yt-dlp/issues/16150
- https://github.com/yt-dlp/yt-dlp/issues/15780
- https://github.com/yt-dlp/yt-dlp/issues/15583
- https://github.com/yt-dlp/yt-dlp/pull/13515
- https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04
- https://github.com/yt-dlp/yt-dlp/releases/tag/2026.06.09
- https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/Changelog.md

### AI-content filtering (ecosystem signal)
- https://github.com/ajayyy/SponsorBlock/issues/2357
- https://github.com/ajayyy/SponsorBlock/issues/1963
- https://github.com/ajayyy/SponsorBlock/issues

### Browser platform (verified applicability)
- https://developer.chrome.com/docs/extensions/whats-new
- https://developer.chrome.com/docs/extensions/reference/api/userScripts
- https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/

### Competitive (delta check)
- https://www.unscart.com/blog/best-extensions-for-youtube-2026
- https://unifab.ai/resource/enhancer-for-youtube

## Open Questions

- [Needs live validation] `web_embedded` only covers embeddable videos; for uploader-disabled-embedding videos it fails. Is the residual coverage after `tv` large enough to justify `web_embedded` as the second client, or is `tv,android_vr` (android_vr last) simpler with comparable coverage? Resolve by testing the chain against an age-gated, a members-only, a "made for kids", and an embedding-disabled video.
- [Needs product decision, carried] Should the bgutil PO-token provider be bundled/auto-provisioned by default (footprint + a second loopback listener minting tokens) or stay opt-in with only the exempt-client fallback shipped by default? (Tracked as the blocked P2.)
