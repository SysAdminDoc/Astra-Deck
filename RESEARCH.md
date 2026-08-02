# Research — Astra Deck
Date: 2026-07-29 — replaces all prior research.

## Executive Summary

[Verified] Astra Deck is an unusually broad, local-first YouTube toolkit: a 247-feature, 11-locale Chromium/Firefox MV3 extension, a bundled userscript, and an authenticated Windows yt-dlp companion with durable queue recovery, staged updates, diagnostics, and release-integrity gates. Its strongest shape is not feature count but the safety systems around that breadth. The highest-value direction is therefore to make existing promises truthful and contain YouTube-DOM regressions before adding more surface area.

Top opportunities, in priority order:
1. Remove synchronous yt-dlp/ffmpeg probes from companion construction so the Dashboard paints before any subprocess timeout.
2. Make the existing Preferred Audio Track Language control functional through the reviewed MAIN/ISOLATED player bridge, and support descriptive-audio preference.
3. Add per-rule time/invocation budgets to the shared mutation runtime so one self-triggering feature cannot churn every page.
4. Finish localization of the named in-page, downloader, transcript, Settings, and popup maintenance surfaces already covered by the active i18n backlog.
5. Make the side dashboard genuinely RTL-safe and add an Arabic rendered regression state.
6. Expand companion visual QA from polished empty shells to operational, error, dirty, and high-DPI states.
7. Expose the retained 500-entry download history with filtering, sorting, pagination, and export instead of silently showing only 50.
8. Add a conservative power-efficient codec mode that changes behavior only when `MediaCapabilities.decodingInfo()` returns a discriminating result.

## Product Map

- **Core workflows:** customize YouTube playback/layout/discovery; filter and organize feeds/comments/subscriptions; capture transcripts, notes, clips, and media; diagnose selectors/APIs/storage; download through the local companion.
- **User personas:** YouTube power users, focus/privacy users, researchers and note-takers, multilingual/accessibility users, and Windows media archivists.
- **Platforms and distribution:** Chrome/Edge/Brave and Firefox MV3 packages, Tampermonkey/Violentmonkey userscript, and an unsigned Windows 10+ x64 PyInstaller companion. Mobile browsers are explicitly unsupported.
- **Key integrations and data flows:** YouTube DOM/player and InnerTube; SponsorBlock, DeArrow, Return YouTube Dislike, Reddit, optional AI providers, and Cobalt; extension-to-companion requests use authenticated loopback HTTP with native-messaging token bootstrap; companion work flows through yt-dlp, ffmpeg, and optional JS/PO-token runtimes.

## Competitive Landscape

- **ImprovedTube / Enhancer for YouTube:** broad, discoverable playback and layout controls validate Astra Deck's all-in-one positioning. Learn from their compact option taxonomy and strong per-control explanations; avoid duplicating their recurring original-audio, list-view, and YouTube-selector regressions without shared runtime guardrails.
- **FreeTube / NewPipe / LibreTube:** independent front ends excel at subscriptions, queues, profile separation, and recommendation escape. Learn from durable portable data and explicit degraded states; avoid replacing YouTube's authenticated web experience or expanding Astra Deck into a second client application.
- **SponsorBlock / DeArrow / Return YouTube Dislike:** focused community-data tools set the standard for transparent categories, per-video overrides, caching, and graceful API failure. Reuse their narrow-purpose clarity; avoid allowing network features to fail indistinguishably from absent data.
- **BlockTube / Unhook:** simple filtering and distraction removal remain table stakes, while issue traffic shows selectors, localization, sync, and Shorts/comments are the maintenance cost. Learn from rule discoverability; avoid a second overlapping rule language.
- **Parabolic / Seal / MeTube:** format discovery, presets, accurate ffmpeg re-cutting, and downloader state visibility are the strongest companion lessons. Avoid multi-site expansion and unbounded command passthrough, which conflict with Astra Downloader's YouTube-only SSRF boundary.
- **JDownloader:** LinkGrabber, queue inspection, retry controls, and searchable history make long-running download state understandable. Learn from staged capture and data access; avoid clipboard surveillance by default and heavyweight remote-control scope.
- **TubeArchivist / ytdl-sub:** durable archive state, scheduled channel ingestion, metadata, and media-server exports define the archiver ceiling. Learn from restart-safe state and explicit retention; avoid importing Docker/server/multi-user weight into the desktop companion.
- **PocketTube / 4K Video Downloader:** grouping, sync, scheduled subscriptions, and bulk operations are the capabilities users pay for. Learn from coherent workflows and progressive disclosure; avoid gating data portability or recovery behind a paid/cloud account.

## Security, Privacy, and Reliability

- [Verified] `npm audit --audit-level=low` and `py -3.12 -m pip_audit -r astra_downloader/constraints-release.txt` reported no known vulnerabilities on 2026-07-29. The repo is already on the patched `brace-expansion` 5.0.8 and yt-dlp 2026.7.4 floors for GHSA-mh99-v99m-4gvg and CVE-2026-55404.
- [Verified] The companion's strongest guardrails are already present: loopback bind, Host/Origin checks, constant-time token auth, server-side YouTube URL allowlisting, bounded requests/responses/queue, redacted diagnostics, secret-free atomic queue persistence, and staged rollback updates (`astra_downloader/routes.py`, `download.py`, `astra_downloader.py`).
- [Verified] `audioTrackLanguage` is intentionally inert while presenting as a selectable feature, and `antiTranslateAudioTrack` reads `window.movie_player` from the ISOLATED content-script world (`extension/ytkit.js`). This is a correctness boundary: player calls must use the existing MAIN-world bridge or a DOM player element, with timeouts and no menu clicking.
- [Verified] The shared mutation dispatcher catches thrown errors but has no per-rule duration, frequency, or route circuit breaker (`extension/core/navigation.js`). A self-mutating rule can therefore degrade the entire YouTube tab without incrementing the feature crash counter.
- [Verified] Crash recovery and migration foundations are strong: the companion restores unfinished work as explicit `paused`/`needs-auth` states without secrets (`astra_downloader/download.py`), and extension persisted domains are schema-versioned. The remaining settings rollback write bug is already tracked in `ROADMAP.md`; do not create another migration item.
- [Verified] Browser-account sync, companion redistribution/license closure, Chrome LNA validation, and live store/browser verification remain operator- or policy-gated in `Roadmap_Blocked.md`; no duplicate active item is justified.

## Architecture Assessment

- [Verified] Canonical boundaries are still incomplete: `astra_downloader/_compat.py::make_legacy_resolver` reaches back into the composition root, while `extension/ytkit.js` and `YTKit.user.js` retain large fallback/vehicle copies. Existing roadmap items already own fallback drift; future feature work should land in extracted modules first.
- [Verified] Companion construction calls `_tools_status_text()` while building Settings; its version getters can each wait five seconds, despite `_refresh_tools_status()` already providing the correct worker boundary (`astra_downloader/gui.py`, `astra_downloader/astra_downloader.py`).
- [Verified] `extension/core/navigation.js` already centralizes mutation batching, scoped selectors, record caps, hidden-tab draining, and bounded element batches. It is the lowest-cost enforcement point for rule health budgets and route-scoped suspension.
- [Verified] Sidepanel JS sets `dir=rtl`, but CSS still uses physical left/right alignment and switch travel; the only rendered sidepanel smoke is dark LTR (`extension/sidepanel.css`, `scripts/smoke-headless-a11y.js`, `tests/sidepanel-i18n.test.js`).
- [Verified] Companion screenshot QA seeds empty collections only and manually repaints the navigation rail. Active, paused, auth-required, failed, dirty, invalid, update-busy, server-error, minimum-size, high-DPI, and large-font states are not rendered (`scripts/render-companion-gui.py`).
- [Verified] History persists 500 entries but the GUI and in-page panel each expose 50, with no total, search, filter, pagination, or export (`astra_downloader/config.py`, `gui.py`, `extension/features/download-ui/index.js`).
- [Verified] Documentation facts have drifted: `docs/architecture.md` understates line/settings counts and still forbids a light theme; `README.md` and `docs/native-messaging-token-bootstrap.md` still claim no current release carries the companion asset pair; `docs/predicate-sandbox-investigation.md` says the shipped sandbox is disabled. The tracked generated-doc contract is the right root fix.

## Rejected Ideas

- **Mobile-browser port:** [Rejected] README explicitly excludes Android/iOS browsers, and NewPipe/LibreTube/SmartTube already serve the native-client use case better.
- **Cloud accounts or multi-user companion:** [Rejected] TubeArchivist needs users because it is a shared server; Astra Downloader is an authenticated single-user loopback process. This would add identity, tenancy, and remote-attack surface without a local workflow.
- **Arbitrary JavaScript plugins via `chrome.userScripts`:** [Rejected] the API requires a new permission and a user-mode toggle, is Chromium-specific, and would undercut CSP/no-eval and store-risk boundaries. Keep shareable behavior declarative through settings profiles.
- **Generic hosted CI:** [Rejected] `.github/workflows` is intentionally absent under `docs/repo-settings.md`; local release/readiness scripts are the stated operational model.
- **Multi-site downloader:** [Rejected] Parabolic/Seal/MeTube breadth is attractive but conflicts with `is_youtube_url` and the companion's deliberate SSRF boundary.
- **Remote telemetry/crash collection:** [Rejected] privacy docs promise no analytics or automatic diagnostic upload. Bounded local diagnostics and user-reviewed bundles are sufficient.
- **Automatic LoAF script attribution:** [Rejected] Chrome documents that isolated-world extension code lacks Long Animation Frame script attribution. Directly timing Astra's own shared rule dispatcher is more accurate and portable.
- **GitHub-based extension self-updater:** [Rejected] store builds already update through their stores; adding GitHub host access for unpacked installs is disproportionate to a manual release-link workflow.

## Sources

### Direct and adjacent OSS
- https://github.com/code-charity/youtube
- https://github.com/YouTube-Enhancer/extension
- https://github.com/amitbl/blocktube
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/DeArrow
- https://github.com/Anarios/return-youtube-dislike
- https://github.com/FreeTubeApp/FreeTube
- https://github.com/TeamNewPipe/NewPipe
- https://github.com/libre-tube/LibreTube
- https://github.com/yuliskov/SmartTube
- https://github.com/NickvisionApps/Parabolic
- https://github.com/JunkFood02/Seal
- https://github.com/alexta69/metube
- https://github.com/tubearchivist/tubearchivist
- https://github.com/jmbannon/ytdl-sub
- https://github.com/yt-dlp/yt-dlp

### Commercial products and documentation
- https://www.mrfdev.com/enhancer-for-youtube
- https://unhookextension.com/
- https://pockettube.io/pricing.html
- https://www.4kdownload.com/products/videodownloader
- https://jdownloader.org/home/features
- https://docs.tubearchivist.com/downloads/
- https://docs.tubearchivist.com/settings/application/

### Platforms, standards, dependencies, and security
- https://developer.chrome.com/docs/extensions/reference/api/userScripts
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- https://developer.chrome.com/docs/ai/built-in-apis
- https://developer.chrome.com/docs/web-platform/long-animation-frames
- https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo
- https://w3c.github.io/webextensions/specification/
- https://support.google.com/youtube/answer/13339776?hl=en
- https://support.google.com/youtube/answer/15569972?hl=en-EN
- https://support.google.com/youtube/answer/16166822?hl=en-GB
- https://doc.qt.io/qt-6/accessible.html
- https://github.com/advisories/GHSA-mh99-v99m-4gvg
- https://nvd.nist.gov/vuln/detail/CVE-2026-55404
- https://github.blog/security/vulnerability-research/attacking-browser-extensions/

### Community and research
- https://news.ycombinator.com/item?id=44265411
- https://news.ycombinator.com/item?id=40643856
- https://stackoverflow.com/questions/61732313/content-script-running-mutationobserver-conflicting-with-youtube
- https://www.reddit.com/r/youtubedl/comments/1lgnk2k
- https://support.mozilla.org/en-US/kb/diagnose-firefox-issues-using-troubleshoot-mode
- https://arxiv.org/abs/2307.14551
- https://arxiv.org/abs/2507.13926
- https://arxiv.org/abs/2406.12710
- https://assets.mofoprod.net/network/documents/Mozilla-Report-YouTube-User-Controls.pdf

### Discovery lists
- https://github.com/awesome-soft/awesome-chrome-extensions
- https://project-awesome.org/r/Awesome-WebExtensions
- https://github.com/awesome-selfhosted/awesome-selfhosted

## Open Questions

- None. The remaining live-browser, store, legal, and product-scope decisions are already recorded in `Roadmap_Blocked.md`.
