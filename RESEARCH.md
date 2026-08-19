# Research — Astra Deck
Date: 2026-08-19 — replaces all prior research.

## Executive Summary

**Verified.** Astra Deck v4.69.0 is a local-first desktop YouTube enhancement system: an MV3 Chrome/Firefox extension (474 settings, 290 feature IDs, 105 runtime modules), a generated Tampermonkey/Violentmonkey userscript, and an optional local Astra Downloader companion. Its strongest current shape is engineering depth the field cannot match — 1,859 tests, 28 verification gates, selector fixtures, feature-health/attribution telemetry that stays on-device, and a drained P0–P2 roadmap — while its weakest is distribution: no store listing, no signed XPI, no Greasy Fork record, and a release pipeline whose channels point ten versions behind the tree. The 2026-08-19 external pass found the competitive field largely **frozen** (SponsorBlock, DeArrow, RYD, BlockTube, Unhook all unchanged since mid-July or long before) at exactly the moment the Chrome MV2 purge (2026-08-31, uBO delisted) will push displaced users toward YouTube-specific MV3 tools. The highest-value directions, in order: (1) ship the wave-timed distribution work already staged in Roadmap_Blocked.md; (2) hide the new AI surfaces (Ask-YouTube chatbot, search AI carousels — rolled to all US users 2026-08-12 with no opt-out, and no competitor ships toggles yet); (3) finish the anti-translation matrix (auto-dub defeat is the hottest demand category of 2026 with the weakest supply); (4) resolve DeArrow API licensing before any store submission; (5) build the YouTube-semantic element zapper — the leapfrog feature the whole field has conspicuously failed to ship, for which Astra's hide-attribution and surface-taxonomy foundations are already built.

## Product Map

- **Core workflows:** transform YouTube watch/feed/player/chat surfaces; filter content pre-render (feed prefilter) and post-render (video-hider with fail-open + hide attribution); enrich via SponsorBlock, DeArrow, RYD, heatmap, thumbnails, transcripts; research via notes, bookmarks, AI summaries (BYO key / Chrome built-in / Ollama), transcript IndexedDB search; manage 474 settings across popup/sidepanel/sidebar/in-page panel with profiles, schedules (focus hours), import/export, undo; hand explicit downloads to the local companion.
- **Personas:** privacy-conscious local-first users; power users wanting granular playback/layout/filtering; researchers needing transcript search and exports; accessibility/focus users; Firefox users on the userscript path; self-hosters on companion-capable profiles.
- **Platforms:** Chrome/Edge/Brave MV3 (Chrome 120+), Firefox MV3 (142+, unsigned XPI today), desktop userscript managers. Profiles: `store-safe`, `chromium-store` (download-free), `github-full`. Desktop only; mobile and YouTube Studio explicitly excluded.
- **Data flows:** MAIN-world bridges (player, audio graph, JSON.parse feed prefilter) ↔ ISOLATED runtime via `data-ytkit-*` attributes; service worker owns allowlisted cross-origin fetches, optional permissions, cookies, native messaging; storage split across `chrome.storage.local/session/sync`, extension IndexedDB, page-origin transcript IndexedDB; no Astra server, no telemetry.

## Competitive Landscape

Field state verified 2026-08-19 (delta vs the 2026-08-15 baseline in the vault note "YouTube Ad Blocking Ecosystem 2026-08-14"):

- **SponsorBlock 6.1.7 / DeArrow 2.3.10** (both 2026-07-13, no release since; maintenance mode) — learn: their most-wanted unbuilt feature is crowdsourced sponsored-text hiding in descriptions/comments (SponsorBlock #649, 40 reactions, assigned but unshipped); DeArrow's top complaint is performance (#423 Firefox slowdown, #92 disable-on-playlists, active 2026-08-16) — per-surface perf scoping is the winning answer. Avoid: single-backend dependence; AMO 1-star reviews show submission 403s and silently lost user work — never lose local data to a remote failure.
- **DeArrow licensing (new finding, Likely):** dearrow.ajay.app/payment and /free state the API is free only for **non-browser-extension** use; extensions are expected to carry the $1 license-key flow. Astra consumes `GET /api/branding` from an extension without any license handling — resolve before store publication (roadmap item added).
- **Return YouTube Dislike** — still frozen at v4.0.4 (2026-05-02); breakage reports (#1274, #1293) accumulate unanswered. Astra's own RYD integration that tracks DOM changes is now a differentiator; the confidence-signal roadmap item stands. API limits confirmed current: 100 req/min, 10k/day — cache aggressively, never per-thumbnail.
- **ImprovedTube (code-charity/youtube)** — the only living Swiss-army competitor: release v4.2027 (2026-05-30) but actively merging (Volume Boost player button PR #4178 2026-08-12; auto-dubbed-audio-track fixes #4179 2026-08-05). Learn: auto-dub defeat is their hottest merged work; volume-boost-as-player-button UX beats settings-page toggles. Avoid: their recurring idle-CPU complaints — Astra's steady-state budget gate is the moat.
- **Enhancer for YouTube** — Chrome 3.0.19 (2026-07-15), Firefox 2.0.136 restored 2026-08-04 (a secondary source claiming it is "completely broken for Firefox" is contradicted by the AMO versions page — primary wins). Coasting, maintenance-only. Its earlier Firefox absence created the refugee pool the blocked migration-doc item targets.
- **BlockTube** (abandoned, 2026-02-07), **Unhook** (1.6.9, 2026-03-22, community "Unhook NG" fork signals stagnation), **yt-anti-translate** (stagnant since April despite owning the hottest demand), **FilterTube 3.3.5** (active; family/parental angle: protected profiles, time limits — but still no element picker).
- **uBlock Origin 1.73.0** + betas 1.73.1b0–b4 (2026-08-07..13): new `content(...)` procedural operator matches inside `<template>` tags — YouTube increasingly renders from templates; Astra's drift-shape item gains a fixture requirement. **2026-08-31: uBO leaves CWS with the MV2 purge** (HN 1,746 pts); Firefox is the last full-uBO browser; uBO publicly stopped chasing Facebook ads (2026-08-12, HN 724 pts) — the community reads capacity limits, raising demand for dedicated YouTube tools. This is the adoption window the blocked distribution items should target.
- **New/trending 2026:** YouTubeTweak (xlch88, pushed 2026-08-12) — nearest new suite; Control Panel for YouTube (insin) — mobile-browser wedge, out of Astra's contract; TubeSize — per-quality file-size transparency (Astra's download popup already probes sizes); thumbnail-rating-bar (elliotwaite, active again 2026-08-11) — RYD-powered ratio bars, rate-budget-hostile to a frozen upstream; ZeroDelay — live-latency nudging.
- **Greasy Fork top-installs profile:** dominated by downloaders, an ad-remover, hotkey tools (out of contract), **YouTube CPU Tamer** (57k installs — energy demand is real), and age-restriction bypass (rejected, see below). Alchemy (TimMacy, v11.11 2026-08-08) ships transcript-export-for-LLM workflows — a small, natural addition to Astra's research persona.
- **Players (FreeTube 0.25.2, Grayjay):** both are consumed by bot-protection plumbing (poToken scraping, SABR support) — evidence that the extractor path keeps getting more expensive, validating Astra's browser-context + local-companion architecture.

## Security, Privacy, and Reliability

- **Dependency stack: clean (Verified via registry + GHSA, 2026-08-19).** eslint ^10.6.0 (10.8.1 in range), web-ext 10.6.0 current, ws 8.21.2 clears both 2026 advisories, crx3 2.0.0 clean. All three overrides are load-bearing and exactly the patched lines: adm-zip ^0.6.0 (GHSA-xcpc-8h2w-3j85, patched 0.6.0), brace-expansion ^5.0.9 (GHSA-rgw5-rvv9-x895 2026-08-03, patched 5.0.9), shell-quote ^1.10.0 (GHSA-395f-4hp3-45gv + June critical, patched ≤1.10.0). Keep all three. The image-size dev-only exception remains blocked upstream (Roadmap_Blocked P1).
- **Node 22 goes Maintenance in October 2026** (EOL 2027-04-30); CVE-2026-21717 fixed in 22.22.2 — build machine should be ≥22.22.2 now, and a Node 24 verification pass belongs on the roadmap before October.
- **Companion-repo pointer:** yt-dlp 2026.07.04 fixed CVE-2026-55404 (command injection via `--write-link`); SysAdminDoc/AstraDownloader should confirm its pinned yt-dlp is ≥2026.07.04. SABR downloader PR #13515 remains unmerged — stable yt-dlp still routes around SABR via non-web clients + PO tokens, so the companion handoff path holds.
- **2026 extension-ecosystem attack patterns** (defensive posture, no exposure found): 108-extension credential-theft campaign; OAuth phishing of CWS developer accounts leading to trojaned updates (Cyberhaven pattern); ownership-transfer permission creep. Astra's mitigations are structural — local build, no CI publish tokens, no remote code — plus operator hygiene: 2FA on store accounts, treat "CWS policy violation" emails as phishing. Strengthens the blocked supply-chain-transparency doc item.
- **CWS policy (effective 2026-08-01) explicitly prohibits extensions "designed to circumvent safety guardrails or usage restrictions on AI-powered services."** Astra's BYO-key AI summary is compliant, but store listing copy must never frame it as bypassing provider limits.
- **Compliance-dialog hazard (account safety):** YouTube's AI age-verification interstitials are compliance dialogs; auto-dismissing them has account consequences. Astra ships no generic dialog auto-dismisser (verified — PageControl dismissal is user-initiated), but `_confirmUnsubscribeDialog`'s first-match `[role="button"]` selector is exactly the shape that could someday click one; a shared never-click denylist is cheap insurance (roadmap item added).
- **Anti-adblock ladder is now stage-documented:** repeated ads → throttling/5s injected delays → autoplay stops → videos refuse to load; Jan 2026 data shows 11% deterred, 22% more motivated. Blame lands on the extension (the ABP 5.17 slowdown incident). A stage-aware diagnostic with a one-click session pause converts a trust-breaker into a trust-builder (roadmap item added).
- **Upstream APIs stable:** SponsorBlock server (status page green through 2026-08-18, k-anonymity endpoint unchanged) and RYD (documented limits stand). No 2026 deprecations found for either.

## Architecture Assessment

- **Inline debt is effectively zero (Verified):** no TODO/FIXME/HACK anywhere in extension/, scripts/, tests/, or the build scripts — debt is routed into ROADMAP.md by convention (catch-reason lint rule, gate-enforced). The only genuine limitation markers are the SABR user-facing string (download-ui/index.js:2532, honest) and one loud-failure shim (ytkit.js:1924).
- **Fix-the-fix chains from the last 200 commits identify the real friction:** settings-panel CSS took five corrective passes in four days (2026-08-10..14) — correlating with the documented "do not reason about panel CSS by reading it" wart and the tracked three-token-systems item; startup perf took 5 commits over 12 days to settle after the deferral optimization. The panel-CSS consolidation item is therefore under-prioritized relative to its churn cost.
- **Monolith/peel duplication is visible in copied code** (identical comment at ytkit.js:36424 and features/digital-wellbeing/index.js:66); the blocked "one canonical implementation per extracted feature" item and the userscript-factory-wiring item remain the structural fixes. The ~3.1 MB monolith's compile time (65–87 ms) is the last large startup cost (tracked).
- **Foundations now exist for the zapper:** hide-attribution markers with per-navigation counts, surface taxonomy (35 surfaces), fail-open guards, and feed-prefilter's refusal set (player response, playlist renderers) are exactly the substrate a YouTube-semantic element picker needs — the L-sized leapfrog is cheaper than it was in any prior pass.
- **Test/doc gaps are already fully itemized in ROADMAP.md** (render-assertion backfill, vacuous-pin windows, gate scope floors, HARDENING.md staleness) — this pass found no new structural gap beyond those.

## Rejected Ideas

- **Sponsored-text hiding in descriptions/comments (SponsorBlock #649):** local heuristics guarantee false positives on legitimate text; the crowdsourced dataset it needs does not exist upstream yet. Revisit only if SponsorBlock ships the category. Source: github.com/ajayyy/SponsorBlock/issues/649.
- **Age-restriction bypass** (top Greasy Fork install-driver): ToS/account risk and an explicit store-removal ground; contradicts the compliance-dialog posture. Source: greasyfork.org/en/scripts/by-site/youtube.com.
- **Per-thumbnail RYD ratio bars** (elliotwaite pattern): 100 req/min upstream budget on a frozen project makes fleet-wide per-thumbnail fetching commons-hostile. Source: returnyoutubedislike.com/docs.
- **Cobalt public-instance fallback:** upstream dormant since 2026-04-06, public instances gated/unreliable; existing exact-origin self-host posture stands. Source: github.com/imputnet/cobalt.
- **Buffer-whole-video** (ImprovedTube #581): SABR/serverAbrStreamingUrl makes client-side full-buffer infeasible; ImprovedTube tags it "Impossible?". Source: github.com/yt-dlp/yt-dlp/pull/13515.
- **Synced-lyrics pane** (ytify): music-app scope creep beyond bounded YouTube Music compatibility. **Mobile support** (Control Panel for YouTube's wedge): desktop contract. **General-web blocking, cloud accounts/sync, plugin marketplace, remote code, default cloud AI:** rejected in prior passes; nothing in this pass weakens those rejections.

## Sources

### OSS competitors and adjacent
- https://github.com/ajayyy/SponsorBlock/issues/649
- https://github.com/ajayyy/DeArrow (issues #39, #92, #381, #423)
- https://dearrow.ajay.app/payment · https://dearrow.ajay.app/free · https://wiki.sponsor.ajay.app/w/API_Docs
- https://github.com/Anarios/return-youtube-dislike · https://returnyoutubedislike.com/docs
- https://github.com/code-charity/youtube (PRs #4178, #4179; issues #2716, #3593, #3658)
- https://github.com/varshneydevansh/FilterTube · https://github.com/amitbl/blocktube
- https://github.com/gorhill/uBlock/releases (1.73.1b content() operator)
- https://github.com/TimMacy/YouTubeAlchemy · https://github.com/xlch88/YouTubeTweak · https://github.com/insin/control-panel-for-youtube · https://github.com/elliotwaite/thumbnail-rating-bar-for-youtube · https://github.com/MohamedSayed0573/TubeSize_Extension
- https://github.com/FreeTubeApp/FreeTube/releases · https://github.com/futo-org/grayjay-android
- https://greasyfork.org/en/scripts/by-site/youtube.com
- https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04 · https://github.com/yt-dlp/yt-dlp/pull/13515 · https://github.com/imputnet/cobalt

### Community and market
- https://www.pcworld.com/article/3212428/ (Firefox last uBO browser; HN 49303202, 1,746 pts)
- https://digitalescapetools.com/2026/08/ublock-origin-stops-chasing (HN 724 pts)
- https://www.socialmediatoday.com/news/youtube-expands-access-to-its-in-app-ai-chatbot/827757/ (Ask YouTube, 2026-08-12)
- https://9to5google.com/2026/08/17/youtube-view-counts-change/ · https://9to5google.com/2026/08/10/youtube-premium-lite-expansion-monetization-changes/ · https://9to5google.com/2026/07/18/youtube-pip-broken/
- https://www.emarketer.com/content/faq-on-ad-blocking-preparing-platform-crackdowns-user-response-what-s-changing-2026
- https://www.emarketer.com/content/youtube-age-verification-friction-could-threaten-engagement-loyalty
- https://addons.mozilla.org/en-US/firefox/addon/sponsorblock/reviews/?score=1
- https://addons.mozilla.org/en-US/firefox/addon/enhancer-for-youtube/versions/
- https://www.tomsguide.com/news/youtube-is-loading-slower-for-users-with-ad-blockers-yet-again

### Platform and store policy
- https://developer.chrome.com/blog/chrome-two-week-release (153 → two-week cadence, 2026-09-08)
- https://developer.chrome.com/docs/extensions/whats-new (149 userScripts.execute diagnostics; 150 contextMenus 'tab'; 153 toolbar-pin experiment)
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154 (sandbox manifest key)
- https://blog.mozilla.org/addons/ (publicSuffix API, 2026-08-06)
- https://developer.chrome.com/blog/cws-policy-updates-2026 (AI-guardrail-circumvention prohibition)
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/ (unlisted signing free/functional)
- https://developer.chrome.com/docs/ai/prompt-api · https://developer.chrome.com/docs/ai/summarizer-api

### Security
- GHSA-xcpc-8h2w-3j85 · GHSA-rgw5-rvv9-x895 · GHSA-395f-4hp3-45gv · GHSA-96hv-2xvq-fx4p · GHSA-6v4j-43gg-vj32 (CVE-2026-55404)
- https://nodejs.org/en/about/eol
- https://www.bankinfosecurity.com (CWS developer OAuth phishing) · https://pluto.security (ownership-transfer creep)

## Open Questions

- **DeArrow license contract shape:** the payment pages establish the expectation, but the exact wire format (query param? header?) and enforcement posture for read-only branding GETs needs confirmation against wiki API docs or upstream before implementing the key pass-through.
- **Ask-YouTube DOM stability:** the chatbot entry points and search AI carousels rolled out 2026-08-12; structural selectors need a live DOM capture (browser-gated) before the hiding item can ship non-guessed selectors.
- **Needs external protocol coordination (carried forward):** which minimum YouTube cookie names/domains/partitions the released Astra Downloader accepts, and whether it can advertise that contract with a protocol version.
- **Needs live validation (carried forward):** Firefox extension rendering, userscript-manager grants, a real cookie-bearing companion handoff.
- **Needs operator decision (carried forward, now time-sensitive):** which of CWS / AMO / Greasy Fork publishes first — the MV2-purge adoption window opens 2026-09-01.
