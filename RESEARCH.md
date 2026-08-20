# Research — Astra Deck
Date: 2026-08-20 — replaces all prior research.

## Executive Summary

**Verified.** Astra Deck v4.76.0 is a local-first desktop YouTube enhancement system: an MV3 Chrome/Firefox extension (476 settings across 18 categories, 291 feature IDs, 110 runtime modules), a generated Tampermonkey/Violentmonkey userscript, and the separate Astra Downloader companion. Since the 2026-08-19 pass, six releases (v4.71–v4.76) shipped in one day: the element zapper (previously listed here as the field's missing leapfrog — now shipped), seven monolith inline-fallback peels (-13% ytkit.js), a download-popup correctness wave, an AI-credential spend cap, and gate hardening. The competitive field remains frozen (SponsorBlock/DeArrow quiet since July, RYD since May, uBO 1.73.1 still beta) while the Chrome MV2 purge lands 2026-08-31 and Edge follows the same month — the distribution items staged in Roadmap_Blocked.md are the highest-value work and are now doubly time-sensitive. Highest-value directions, in order: (1) ship the blocked distribution work before the 2026-09-01 adoption window (now including Edge); (2) adapt view-count-dependent features before YouTube's 2026-08-24 view-metric redefinition; (3) hide the new AI surfaces (blocked on a live DOM capture) and group the already-shipped AI-content filters into one discoverable surface; (4) local transcript Q&A — the free, local answer to YouTube Premium's flagship 2026 AI features; (5) selector build-version keying + startup canary so drift degrades loudly instead of silently; (6) finish the last three monolith fallback peels (floating-logo, video-hider, subscription-groups).

## Product Map

- **Core workflows:** transform YouTube watch/feed/player/chat surfaces; filter content pre-render (feed prefilter) and post-render (video-hider with fail-open + hide attribution, element zapper since v4.71.0); enrich via SponsorBlock, DeArrow, RYD, heatmap, thumbnails, transcripts; research via notes, bookmarks, AI summaries (BYO key / Chrome built-in / Ollama), transcript IndexedDB search; manage settings across popup/sidepanel/sidebar/in-page panel with profiles, presets (Focus/PowerUser/Privacy/Researcher), schedules, import/export, undo; hand explicit downloads to the local companion.
- **Personas:** privacy-conscious local-first users; power users; researchers (transcript search/export); accessibility/focus users; Firefox users on the userscript path; self-hosters on companion-capable profiles.
- **Platforms:** Chrome/Edge/Brave MV3 (Chrome 120+), Firefox MV3 (142+, unsigned XPI today), desktop userscript managers. Profiles: `store-safe`, `chromium-store` (download-free), `github-full`. Desktop only.
- **Data flows:** MAIN-world bridges ↔ ISOLATED runtime via `data-ytkit-*` attributes; service worker owns allowlisted cross-origin fetches, optional permissions, cookies, native messaging; storage split across `chrome.storage.local/session/sync`, extension IndexedDB, page-origin transcript IndexedDB; no Astra server, no telemetry.

## Competitive Landscape

### OSS field (delta vs 2026-08-19; fast movers re-verified 2026-08-20)

- **SponsorBlock / DeArrow** — still quiet (SB last commits 2026-07-26, DeArrow 2026-07-13; no August activity). Standing lessons hold: per-surface perf scoping answers DeArrow's top complaint (#92/#423); never lose local data to a remote failure (AMO 403 reviews). DeArrow API licensing question unchanged (blocked item).
- **Return YouTube Dislike** — frozen at v4.0.4 (2026-05-02); Astra's maintained integration is a differentiator; confidence-signal item stands. Separately, the 2025 "RYD injecting ads" incident (HN id 45696329) is still the active trust narrative around YouTube extensions — it strengthens the blocked supply-chain-transparency doc item: "no telemetry, no ad injection, reproducible builds" is the pledge users now audit for.
- **ImprovedTube** — still the only living Swiss-army competitor: 2026-08-12 merges shipped volume boost (Astra parity: `volumeBoost` exists) and Shorts container refinements; their 2026-07-22 playlist-quick-delete breakage is a canary for playlist-endpoint drift.
- **uBlock Origin** — 1.73.1 (template-tag `content()` operator) still beta as of 2026-08-20; stable is 1.73.0. MV2 purge 2026-08-31; **Edge announced the same lockout 2026-08-08 (Verge, 193-pt HN thread)** — the displaced-user wave now covers both stores, making the blocked Edge/CWS submissions time-sensitive together.
- **yt-dlp 2026.08.19 stable is out** (new `visionos` player client, `web_embedded` fallbacks) — new clients usually mean old ones started failing; the companion repo (SysAdminDoc/AstraDownloader) should bump promptly. SABR PR #13515 remains open but actively maintained — plausible within months; do not build against it yet.
- **Others unchanged:** BlockTube (abandoned), Unhook (stale), yt-anti-translate (stagnant), FilterTube (active, no zapper), YouTubeTweak, Control Panel for YouTube (mobile wedge, out of contract), thumbnail-rating-bar, TubeSize, FreeTube/Grayjay (bot-protection plumbing validates the browser-context + local-companion architecture).
- **New from awesome-list/topic harvest:** remove-youtube-suggestions (~576★) — distraction-removal-as-identity retains users; Astra's `presetFocus` already answers this, worth store-listing prominence. youtube-ai-extension (~669★, watch-page chat panel over the transcript via OpenAI) — validates the transcript-Q&A direction and shows the UX shape. Simple Sponsor Skipper — SB API is frontend-agnostic (no action needed). YouTube Classic userscripts — "revert the redesign" demand; Astra's `classicPlayerChrome`/`classicLayoutProfile` already ship this; again a positioning asset, not a gap.

### Commercial / closed-source (new class this pass)

- **PocketTube** ($3.99/mo premium): paywalls nested groups, auto-tags, deck view, feed sorting, unlimited mark-as-watched, community-posts tab. **Astra already ships free:** subgroups (`subscription-groups` since v4.74 rename/delete wave), mark-as-watched (`markWatchedVideos`), group management. Remaining genuine gaps: per-group feed sorting and a deck/board view. PocketTube's AMO reviews show paywall resentment — Astra's free coverage is the clearest "why switch" pitch for store listings.
- **Magic Actions for YouTube:** feature subset of Astra (AutoHD, wheel volume, cinema mode, snapshot — Astra: `videoScreenshot`); its nag-driven upsell popups destroyed its reputation. Negative lesson only: never inject upsell UI.
- **Turn Off the Lights:** free/donation; signature ambient-glow feature — Astra parity exists (`cinemaAmbientGlow`). Transferable idea: a separate beta listing as a volunteer channel for selector-drift fixes.
- **YouTube Premium 2026:** differentiates on AI now — "Jump Ahead" (≈ SB highlight jump, covered), "Ask YouTube" conversational Q&A (Premium-gated, rolling out). A local BYO-key/Chrome-Prompt-API transcript Q&A matches Google's flagship paid feature for free — the strongest remaining leapfrog now that the zapper shipped. Sleep timer (Astra: `sleepTimer` exists) and background play (mobile, out of contract) are already answered.
- **Paid sponsor-skip market: does not exist** on desktop (only a $2.99 Safari port of SB) — nothing to copy; bundling SB+DeArrow+RYD in one install remains the differentiator.

### Adjacent-domain architecture lessons (new class this pass)

- **FrankerFaceZ:** per-context settings profiles with priority-ordered overrides — Astra already has per-channel speed/intro-outro and `sbPerChannelProfiles`; generalizing per-channel overrides to DeArrow/RYD is the transferable increment. Their never-shipped, long-requested shareable-preset gallery (FFZ #326) is demand evidence for Astra's existing export/import + presets.
- **7TV:** evaluate-only-what's-in-view (IntersectionObserver) for per-card work; per-origin site-script folders; config mirrored across contexts by a thin worker. Astra's steady-state gate already polices the cost; the pattern is a fallback if a future filter feature regresses it.
- **Dark Reader:** the measured ceiling of runtime CSS rewriting (312 MB / 14% CPU, multi-second render delays) — Astra's static-stylesheet-first theming is correct; never adopt per-rule runtime rewriting.
- **Stylus/Violentmonkey:** `@updateURL`/`@downloadURL` metadata is the whole userscript update story — Astra's YTKit.user.js already carries both pointed at raw.githubusercontent (verified), which also sidesteps Violentmonkey's known GitHub-release-asset update bug (#1673). Correct as-is.
- **Vencord vs BetterDiscord:** in-tree centrally-reviewed features (Vencord, thriving) vs third-party plugin marketplace (BetterDiscord, chronic breakage) — reinforces the standing plugin-marketplace rejection; filter-list *data* remains the right extensibility surface.

## Security, Privacy, and Reliability

- **ChainDrop npm worm (2026-08-04, ~444 packages incl. keyv 6.0.0 / cacheable): no exposure (Verified 2026-08-20).** package-lock.json carries keyv **4.5.4** only, no cacheable. Prod dep tree is one package (crx3). `npm audit --omit=dev`: **0 vulnerabilities**; full audit: 3 high, all the known dev-only image-size chain via web-ext→addons-linter (blocked upstream, tracked). The worm's preinstall-hook vector still argues for an `--ignore-scripts` install posture (roadmap item added).
- **brace-expansion 2026 CVE cluster** (CVE-2026-13149/-14257/-33750): already neutralized by the existing `brace-expansion ^5.0.9` override. adm-zip and shell-quote overrides likewise remain load-bearing — keep all three.
- **Node.js July security release (2026-07-29)** patched 22.x/24.x (TLS session-reuse hostname bypass follow-up, dns.resolveAny DoS) — build machine should be on the patched 22.x line; the existing Node-24 verification item covers the migration.
- **Companion-repo pointers (SysAdminDoc/AstraDownloader):** yt-dlp advisory chain through 2026 (CVE-2026-26331 netrc-cmd, CVE-2026-50574 aria2c file-write fixed 2026.06.09, CVE-2026-55404 --write-link) argues the companion enforce a minimum yt-dlp ≥2026.06.09 and never pass those flags from extension-controllable input; bump to 2026.08.19 for the new player clients. Community signal says PO-token provisioning is the single biggest "wish it just worked" in downloads — the blocked auto-provision item is well-aimed.
- **CWS policy effective 2026-08-01** tightened limited-use ("data collected must be strictly necessary to the single disclosed purpose") on top of the AI-guardrail-circumvention prohibition — audit `docs/privacy-policy.md` and store copy against it during the blocked CWS submission (noted there; no separate item).
- **View-count redefinition effective 2026-08-24:** views counted at first frame, no minimum watch time; the old metric survives as "engaged views" in Analytics. This shifts semantics under `preciseViewCounts`, `hideVideosLowViewFilter`, `hideVideosLowSignalMinViews`, and any parser reading view strings (roadmap item added).
- **Anti-adblock ladder, compliance-dialog hazard, extension-ecosystem attack patterns:** unchanged from 2026-08-19; the never-auto-click denylist shipped (`1418b9ae`), the stage-aware diagnostics item stands. No new named extension-attack campaign in August 2026.
- **Upstream APIs stable:** SponsorBlock server and RYD limits unchanged; no new deprecations found.

## Architecture Assessment

- **Monolith peel: 7 of 10 full inline fallbacks removed in v4.72–4.73** (-416 KB, ytkit.js now 2,796,252 bytes; 14 `}) || {` fallbacks remain, 11 of them already minimal stubs). The three full ones left — `floatingLogoOnWatch` (ytkit.js:9905), `hideVideosFromHome` (:13434), `subscriptionGroups` (:36454) — are each their own session per the tracked item; the video-notes peel proved the copies hide real bugs (light-theme rule existed only in dead code).
- **Userscript duplication unchanged (Verified 2026-08-20):** YTKit.user.js still runs hand-maintained RYD/SB/DeArrow copies on non-schema keys; zero call sites for the bundled factories (25 SB refs, 26 DeArrow refs hand-maintained). The tracked wiring item remains the structural fix, with twelve documented behavioral divergences as its case.
- **Inline debt still zero:** no real TODO/FIXME/HACK anywhere in extension/, scripts/, tests/ (only `\uXXXX` literals in check-i18n.js error text).
- **Selector resilience gap:** `core/selector-health.js` has telemetry but no startup canary and no keying to YouTube's build (`INNERTUBE_CLIENT_VERSION` is read only by transcript-service.js). Version-keyed health records plus a canary that fails loud with a user-visible "YouTube changed, features X/Y degraded" notice is the cheap next increment on the tracked drift-shape item (note added there).
- **HARDENING.md still v4.46-era** (30 versions behind; item stands). Stale roadmap evidence corrected this pass: i18n grandfathered literals now **934** across 2 files (was 928); light-theme baseline now **254 accepted / 136 covered** (was 253/121) — notes added inline.
- **MV3 service-worker lifetime:** repo already ships `smoke:mv3-lifecycle` and stores state outside worker memory; the 2025 practitioner consensus (alarms + storage, no keepalive hacks) matches current practice. No action.
- **Perf measurement:** the in-house interleaved A/B + CDP `Performance.getMetrics` method is stronger than the DebugBear Lighthouse-diff approach the literature offers; the arXiv 2404.06827 finding (parse cost of even-inactive extensions) is already answered by `FEATURE_SETTINGS` gating and the peel work.

## Rejected Ideas

- **Plugin/add-on marketplace:** Vencord (in-tree, thriving) vs BetterDiscord (marketplace, chronic breakage) settles it; also incompatible with MV3 no-remote-code. Source: vencord.dev/faq.
- **Lighthouse-diff CI perf gate (DebugBear method):** inferior to the existing interleaved A/B + CDP metrics harness; would add tooling for less signal.
- **Runtime CSS rewriting for theming (Dark Reader dynamic mode):** measured 3× memory / multi-second render ceiling; static-first is already the architecture. Source: darkreader issues/1295, DebugBear measurements.
- **Paid/premium tier of any kind:** PocketTube's paywall resentment is the counter-evidence; Astra's position is the free undercut.
- **COPPA miniplayer unblock (unblock-miniplayer):** niche, unverified demand, adjacent to platform-restriction bypass posture. Source: awesome-userscripts.
- **Watch-history private tracking/export (Magic Actions):** weak signal, YouTube's own history covers it, new storage surface for little value.
- **MV3 SW keepalive tricks:** Google restricts to enterprise; alarms+storage pattern already in place.
- Carried forward from 2026-08-19 (unchanged): sponsored-text hiding heuristics (SB #649 dataset doesn't exist), age-restriction bypass, per-thumbnail RYD ratio bars, Cobalt public-instance fallback, buffer-whole-video, synced-lyrics pane, mobile support, general-web blocking, cloud accounts/sync, default cloud AI.

## Sources

### OSS competitors and adjacent
- https://github.com/ajayyy/SponsorBlock/commits/master · https://github.com/ajayyy/DeArrow/commits/master (issues #92, #423, #649)
- https://dearrow.ajay.app/payment · https://wiki.sponsor.ajay.app/w/API_Docs
- https://github.com/Anarios/return-youtube-dislike · https://returnyoutubedislike.com/docs
- https://github.com/code-charity/youtube/commits/master
- https://github.com/gorhill/uBlock/releases
- https://github.com/yt-dlp/yt-dlp/releases · https://github.com/yt-dlp/yt-dlp/pull/13515 · https://github.com/yt-dlp/yt-dlp/security
- https://github.com/lawrencehook/remove-youtube-suggestions · https://github.com/topics/youtube-extension?s=stars · https://github.com/awesome-scripts/awesome-userscripts

### Commercial and adjacent-domain
- https://pockettube.io/pricing.html · https://www.turnoffthelights.com/ · https://www.chromeactions.com/
- https://mavic.ai/how-much-is-youtube-premium-pricing-features-is-it-worth-it-in-2026/ · https://www.androidauthority.com/youtube-premium-features-that-matter-3679143/
- https://github.com/FrankerFaceZ/FrankerFaceZ/issues/326 · https://github.com/SevenTV/Extension · https://darkreader.org/blog/dynamic-theme/ · https://github.com/darkreader/darkreader/issues/1295
- https://violentmonkey.github.io/api/metadata-block/ · https://github.com/violentmonkey/violentmonkey/issues/1673 · https://vencord.dev/faq/

### Community and market
- https://www.theverge.com/tech/976880/microsoft-edge-extensions-ad-blockers-mv2-mv3 (Edge MV2 purge, 2026-08-08)
- https://www.neowin.net/news/google-chrome-is-killing-all-ublock-origin-bypasses-microsoft-edge-opera-to-follow/ · https://9to5google.com/2026/06/15/google-chromes-next-update-will-mark-the-end-of-popular-ad-blockers/
- https://techcrunch.com/2026/08/17/youtube-will-now-count-a-view-as-soon-as-a-video-starts-playing/ (view metric, effective 2026-08-24)
- https://www.androidauthority.com/youtube-embed-player-redesign-3652875/ · https://techcrunch.com/2025/06/26/youtube-adds-an-ai-overviews-like-search-results-carousel
- HN id 45696329 (RYD ad-injection trust incident)
- https://dev.to/ali_ibrahim/bypassing-the-2026-youtube-great-wall-a-guide-to-yt-dlp-v2rayng-and-sabr-blocks-1dk8

### Platform and store policy
- https://developer.chrome.com/docs/extensions/whats-new (149 userScripts.execute; 150 contextMenus 'tab'; 153 toolbar-pin default experiment; two-week cadence from 2026-09-08)
- https://developer.chrome.com/docs/ai/built-in-apis (Prompt API extensions-stable since 138; Writer/Rewriter still OT)
- https://blog.mozilla.org/addons/ (Firefox 153 WebExtensions: publicSuffix API, local-file permission changes)
- https://developer.chrome.com/blog/cws-policy-updates-2026 (limited-use tightening, effective 2026-08-01)
- https://caniuse.com/customizable-select · https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API (Firefox 151 support)

### Security
- https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/ · https://www.wiz.io/blog/keyv-and-cacheable-npm-supply-chain-attack (ChainDrop, 2026-08-04)
- GHSA-mh99-v99m-4gvg + CVE-2026-13149/-33750/-25547 (brace-expansion cluster)
- https://nodejs.org/en/blog/vulnerability/july-2026-security-releases · https://nodejs.org/en/about/eol
- CVE-2026-26331 · CVE-2026-50574 (GHSA-vx4q-3cr2-7cg2) · CVE-2026-50023 · CVE-2026-55404 (yt-dlp chain)

### Engineering technique
- https://arxiv.org/abs/2404.06827 (extension perf empirical study)
- https://apiserpent.com/blog/resilient-scraper-selector-drift (build-version-keyed selectors, canary checks)

## Open Questions

- **DeArrow license contract shape** (carried): exact wire format and enforcement posture for read-only branding GETs — confirm against wiki API docs before implementing the key pass-through.
- **Ask-YouTube DOM stability** (carried): the chatbot entry points and search AI carousels need a live DOM capture (browser-gated) before the hiding item can ship non-guessed selectors. Desktop rollout is still partial/experimental as of 2026-08-20.
- **Firefox 151 Document PiP reach:** MDN lists Firefox 151 support, but whether `documentPictureInPicture` is exposed to extension content scripts on YouTube (and to userscript managers) needs live validation before `popOutPlayer` can be advertised on Firefox.
- **Needs external protocol coordination** (carried): minimum YouTube cookie names/domains/partitions the released Astra Downloader accepts, and a protocol version to advertise it.
- **Needs operator decision** (carried, now more time-sensitive): distribution order across CWS / Edge Add-ons / AMO / Greasy Fork — the Chrome MV2 purge lands 2026-08-31 and Edge announced the same lockout 2026-08-08, so both stores' displaced-user waves open together on 2026-09-01.
