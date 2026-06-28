# Research - Astra Deck

## Executive Summary

[Verified] Astra Deck is a local-first YouTube workstation shipped as a Chrome/Firefox MV3 extension, a userscript, and a Windows yt-dlp/ffmpeg companion. Its strongest current shape is trust-heavy integration: profile-split builds, no telemetry, native-token bootstrap, local diagnostics, OPML subscription migration, explicit downloader recovery codes, and a broad tested feature catalog. The highest-value direction is not another generic feature wave; it is closing release-integrity skew, hardening degraded browser-storage paths, reducing the userscript's 55 `not-yet-ported` gaps, centralizing player-state retries, keeping large YouTube surfaces responsive, refreshing i18n proofing, and tracking new YouTube feed experiments before they break hide/filter controls.

## Product Map

- Core workflows: tune YouTube playback/layout/comments/live chat; search and apply settings; hide distracting feed/watch surfaces; enrich watch pages with SponsorBlock, DeArrow, Return YouTube Dislike, transcript tools, notes, and study exports; group subscriptions; download through Astra Downloader; export diagnostics/settings/data.
- User personas: power YouTube viewers, researchers/students, subscription-heavy viewers, local-first privacy users, live-chat viewers, self-hosted downloader users, and maintainers tracking YouTube DOM/API drift.
- Platforms and distribution: Chrome/Edge/Brave MV3, Firefox MV3/sidebar, Tampermonkey/Violentmonkey userscript, Windows companion executable, GitHub release ZIP/XPI/CRX/userscript artifacts.
- Key integrations and data flows: YouTube DOM/Innertube/player APIs, browser storage/IndexedDB, native messaging and loopback companion, yt-dlp/ffmpeg/Deno/PO-token provider, SponsorBlock, DeArrow, Return YouTube Dislike, Reddit, optional BYO/local AI providers, OPML/JSON/CSV import/export.

## Competitive Landscape

### YouTube Enhancer / ImprovedTube
- Does well: broad player/layout controls, rapid reaction to YouTube UI drift, and active requests around player-state retry and premium-quality handling.
- Learn from it: player-facing features need a shared retry/reapply manager instead of one-off timers; Astra already has `extension/ytkit-main.js` quality bridges and can centralize the lifecycle around them.
- Avoid: feature sprawl where player click, speed, quality, and autoplay fixes silently diverge.

### Control Panel for YouTube / Unhook
- Do well: focused distraction removal and fast issue reports when YouTube changes sponsored cards, category chips, Playables, and prompt-feed experiments.
- Learn from it: feed-cleanup selectors need experiment canaries, not just static CSS strings.
- Avoid: making mobile/Safari parity a near-term driver while Astra's stated support is desktop YouTube plus userscript.

### FreeTube
- Does well: local subscriptions/history, external player support, migration/import workflows, and active performance work for huge channel/subscription surfaces.
- Learn from it: local data import/export and large-surface lazy rendering are user-visible reliability features.
- Avoid: becoming a standalone YouTube frontend; Astra's advantage is controlling YouTube in place.

### SponsorBlock, DeArrow, and Return YouTube Dislike
- Do well: crowd-service corrections are table-stakes for power YouTube clients, and their issue trackers expose real failure modes around service/network/storage degradation.
- Learn from them: service health, quota pressure, keyboard-only paths, and Firefox site-data restrictions need explicit diagnostics and fallbacks.
- Avoid: treating third-party service failures as generic selector failures.

### PocketTube
- Does well: subscription organization, collection feeds, import/export, and account/cloud-backed convenience.
- Learn from it: OPML support was the right local-first migration move; next migration value is history/data import rather than cloud sync.
- Avoid: default cloud sync or account features that conflict with Astra's no-telemetry/local-first posture.

### Transcript and Study Tools
- Do well: Glasp, Eightify, NoteGPT, and similar tools make transcript summaries and study artifacts easy to start.
- Learn from them: Astra's advantage is local transcript indexing/export plus BYO/local AI controls; reliability and migration polish matter more than another basic summary button.
- Avoid: hidden remote transcript warehousing or automatic telemetry.

## Security, Privacy, and Reliability

- [Verified] `npm audit --omit=dev --audit-level=moderate` reports 0 vulnerabilities; `npm outdated --json` reports only `eslint` 10.2.1 -> 10.6.0.
- [Verified] Product version surfaces are synchronized at v4.46.14 via `scripts/check-versions.js`, but the latest public GitHub release is v4.46.4 and lacks `AstraDownloader.exe.sha256`; `gh auth status` is invalid in this environment.
- [Verified] `npm run release:readiness -- --require-pass` fails because `build/release-manifest.json`, `build/astra-deck-npm-sbom.cdx.json`, and `build/SHA256SUMS` are missing after the current local build state, while README claims SBOM plus attestation on every release.
- [Verified] Native-token bootstrap is implemented and legacy `/health` token echo is gated; remaining Chrome/Firefox ID validation and public release sidecar upload are already in `Roadmap_Blocked.md`, so this research does not duplicate them.
- [Verified] Firefox site-data restrictions are a real extension failure class: SponsorBlock issue 2473 reports `BroadcastChannel` throwing `SecurityError` when Firefox blocks cookies/site data. Astra has an unguarded `new BroadcastChannel('ytkit-pause-sync')` in `extension/ytkit.js:20592`, while the crash-loop guard falls back to skipping when `localStorage` is unavailable at `extension/ytkit.js:49781`.
- [Verified] Userscript drift is now classified, but still material: `scripts/check-userscript-drift.js` reports 148/226 feature IDs in the userscript and 55 `not-yet-ported` IDs.
- [Verified] `docs/i18n-coverage.md` is stale against the current locale catalog: the doc says 895 EN keys while `node scripts/i18n-coverage.js --no-write` analyzes 901 EN keys. The check gate enforces a high placeholder ceiling but not report freshness.
- [Verified] YouTube experiment drift is active in competitor trackers: Control Panel issues report sponsored-card hiding, grid/list, and custom prompt-feed surfaces changing in June 2026; Astra already has `hidePlayables`, `hideAiSummary`, feed/video hider selectors, and selector fixtures that should absorb this class.
- [Verified] Public extension supply-chain incidents support keeping release manifests, checksums, SBOMs, signing-key custody, optional-permission profiles, and public claims mechanically verifiable.

## Architecture Assessment

- [Verified] `extension/ytkit.js` is still the largest risk at 50,024 lines, despite multiple successful peels under `extension/features/`; future work should peel by runtime ownership and shared lifecycle, not by cosmetic grouping.
- [Verified] `extension/ytkit-main.js` owns quality/codec/audio bridges and already uses direct player APIs, but player-facing features still spread scheduling and reapply behavior across the monolith and feature modules.
- [Verified] `extension/core/settings-schema.js` remains the product contract for settings, defaults, risk/profile/scope, and userscript vehicle metadata; parity work should update schema, defaults, locale keys, userscript bundle, and drift tests together.
- [Verified] Release readiness tooling exists (`scripts/generate-release-readiness.js`, `scripts/generate-release-manifest.js`, digest tests), but the current generated release state is incomplete until build artifacts, SBOM, manifest, and checksum files are produced in order.
- [Verified] Local diagnostics are strong, but storage-denial and BroadcastChannel-denial paths need first-class diagnostics so users do not see silent feature disablement or crash loops under Firefox privacy settings.
- [Likely] Large feed/channel surfaces can still stress DOM mutation handlers because video hider, subscription groups, watch-page tabs, and selector-health scans all process high-card-count YouTube pages; FreeTube's channel-home lazy-render fix is the strongest analogous evidence.
- [Needs live validation] Browser-gated work remains correctly parked in `Roadmap_Blocked.md`: Chrome Web Store/AMO submission, Chrome Local Network Access validation, selector fixture refresh, popup visual regression, and experimental CSS adoption.

## Rejected Ideas

- Cloud sync/account service - PocketTube proves demand, but it contradicts Astra's local-first/no-telemetry posture; use local import/export instead.
- Standalone YouTube frontend - FreeTube owns that product category; Astra should continue controlling YouTube in place.
- Mobile browser support as a priority - Control Panel and Unhook show demand, but Astra's supported platform table excludes mobile and the reliability cost is high.
- Safari/iOS package push - distribution/API cost is high and current support is desktop MV3 plus userscript.
- Custom SABR downloader ownership - yt-dlp and PO-token provider behavior is still moving; classify failures and guide recovery rather than owning transport internals.
- Remote crash telemetry - local diagnostic export better matches the trust model.
- Full TypeScript migration - too much churn for a 50K-line monolith; targeted peels and boundary tests are safer.
- Store migration docs in this pass - already tracked in `Roadmap_Blocked.md` because new markdown docs are not allowed for this research output.
- New plugin marketplace - the feature registry is enough; a plugin ecosystem would raise review/security burden without solving current reliability gaps.
- Multi-user/team features - browser-profile-local state is the product model; shared accounts would add sync and privacy complexity.

## Sources

### Repo evidence
- https://github.com/SysAdminDoc/Astra-Deck
- https://github.com/SysAdminDoc/Astra-Deck/releases/tag/v4.46.4

### Competitors and analogous products
- https://github.com/YouTube-Enhancer/extension
- https://github.com/YouTube-Enhancer/extension/issues/1337
- https://github.com/code-charity/youtube
- https://github.com/insin/control-panel-for-youtube
- https://github.com/insin/control-panel-for-youtube/issues/300
- https://github.com/insin/control-panel-for-youtube/issues/296
- https://github.com/FreeTubeApp/FreeTube
- https://github.com/FreeTubeApp/FreeTube/issues/9336
- https://github.com/FreeTubeApp/FreeTube/issues/9204
- https://pockettube.io/
- https://unhook.app/
- https://soitis.dev/control-panel-for-youtube

### Crowd services and downloader ecosystem
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/SponsorBlock/issues/2473
- https://github.com/ajayyy/DeArrow
- https://github.com/Anarios/return-youtube-dislike
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider

### Platform and policy
- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction
- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://eslint.org/blog/2026/06/eslint-v10.6.0-released/

### Security and supply chain
- https://www.koi.ai/blog/4-million-browsers-infected-inside-shadypanda-7-year-malware-campaign
- https://www.cyberhaven.com/blog/cyberhavens-chrome-extension-security-incident-what-happened-and-how-were-protecting-our-customers
- https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/

## Open Questions

- Which production, beta, and unpacked extension IDs should be registered in native host manifests for Chrome, Edge, and Firefox? This blocks final legacy-token retirement and remains external to this research pass.
- Which public videos/playlists/channels are stable enough for repeatable live browser fixture capture across transcript, download, live-chat, large-channel, and playlist surfaces?
