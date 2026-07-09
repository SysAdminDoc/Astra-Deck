# Research - Astra Deck
Date: 2026-07-09 - replaces all prior research.

## Executive Summary
[Verified] Astra Deck is a Chrome/Firefox MV3 YouTube power-user extension with a separate userscript build and an optional local Astra Downloader companion. The strongest current shape is not raw feature count: it is the hardened extension architecture around schema-driven settings, selector health, optional-host profiles, native-token bootstrapping, diagnostics, i18n, and local release gates. The highest-value direction is extension-only trust and control: make public artifacts impossible to mis-sign, make release/install state self-verifying, prepare loopback companion flows for Chrome Local Network Access changes, turn existing subscription/recommendation primitives into clearer workflows, and add rendered settings-overlay regression evidence so premium UI work cannot silently drift. Top opportunities: public CRX signing guard, SemVer/tag sanity gate, generated companion release-state copy, Local Network Access smoke/readiness, subscription health/action center, recommendation scrub queue, settings-overlay visual smoke, external API degraded-mode feedback, cross-browser API wrapper, ESLint correctness ratchet.

## Product Map
- [Verified] Core workflows: in-page YouTube enhancement through `extension/ytkit.js`; popup/sidepanel management through `extension/popup.js`, `extension/sidepanel.js`, and `extension/sidebar.js`; full in-page settings through `extension/features/settings-panel/index.js`; local download handoff through `extension/features/download-ui/index.js` and `astra_downloader/astra_downloader.py`; release packaging through `build-extension.js` and `scripts/generate-release-*`.
- [Verified] User personas: power YouTube viewers who want fewer distractions and stronger playback controls; privacy-sensitive users who prefer local/BYO services; subscription-heavy users; users who need diagnostics instead of guesswork when YouTube or external APIs change.
- [Verified] Platforms and distribution: Chrome/Chromium ZIP + CRX, Firefox ZIP + XPI, Tampermonkey userscript, and Windows companion EXE. This research pass prioritizes extension work only; userscript parity is intentionally not proposed.
- [Verified] Key integrations and data flows: SponsorBlock, DeArrow, Return YouTube Dislike, Reddit, optional OpenAI/Anthropic/Gemini/Ollama/Cobalt, YouTube cookies only for explicit local downloads, native messaging token bootstrap, and loopback `127.0.0.1` companion/Ollama probes.

## Competitive Landscape
- [Verified] ImprovedTube / code-charity: long-running, broad YouTube customization and night-schedule features. Learn from its release cadence and granular UI controls; avoid custom keyboard-shortcut dependency because Astra Deck policy forbids shortcuts.
- [Verified] YouTube Enhancer: broad playback and layout customization with store packaging and i18n/community badges. Learn from clear feature grouping and cross-browser store presence; avoid custom-code/script injection because it conflicts with MV3 hosted-code and trust posture.
- [Verified] PocketTube: subscription groups, Deck mode, group notifications, health status, bulk unsubscribe, mark-watched, and CSV export. Learn from making subscriptions an operational dashboard; avoid cloud sync/paywall coupling unless explicitly chosen later.
- [Verified] Unhook / Untrapped / RYS: focused distraction-removal products with high user demand for hiding recommendations, Shorts, comments, and feeds. Learn from focused task language; avoid becoming only a blocker because Astra Deck's differentiator is control plus recovery.
- [Verified] SponsorBlock, DeArrow, and Return YouTube Dislike: focused crowdsourced/API tools with strong single-purpose trust. Learn from clear degraded-state messaging, cache transparency, and contribution/voting affordances; avoid masking estimates or upstream outages.
- [Verified] BlockTube and FilterTube: local channel/video/comment filtering, regex and smart-rule controls, early identity resolution, and mobile-support ambitions. Learn from blocklist ergonomics and predictable identity handling; avoid password-lock/bypass claims that require product decisions and mobile scope.
- [Verified] FreeTube: privacy-first local subscriptions, local playlists/history, profiles, import/export, and multi-platform packaging. Learn from local data portability and profile segmentation; avoid a desktop-client rewrite because Astra Deck is a browser extension.
- [Verified] Turn Off the Lights: focused cinematic viewing, visual comfort, privacy posture, and broad browser availability. Learn from visual-focus affordances and lightweight feedback; avoid features centered on shortcuts or all-sites behavior that dilute YouTube-specific scope.

## Security, Privacy, and Reliability
- [Verified] Public release risk: `build-extension.js` supports `ASTRA_CRX_KEY_MODE=ephemeral`, `scripts/generate-release-manifest.js` always declares `localSigningRequired: true`, and `scripts/generate-release-readiness.js` checks policy disclosure but not whether public CRX artifacts were actually signed with an external stable key. Extension supply-chain attacks such as Cyberhaven and ShadyPanda make artifact provenance a release-critical trust boundary.
- [Verified] Tag/release drift risk: the repo has a stray `v25.11` git tag while the product version is `v4.46.34`; `git tag --sort=-version:refname` returns `v25.11` first. Current `scripts/check-versions.js --tag` validates a caller-provided tag, but there is no discovered guard that rejects non-product tags before release scripts infer current/latest state.
- [Verified] Install-state drift: `README.md` and `docs/native-messaging-token-bootstrap.md` still hardcode latest release `v4.46.4` lacking `AstraDownloader.exe.sha256`, while GitHub release list shows latest `v4.46.34`. This undermines companion setup trust even though `docs/signing-keys.md` says user-facing companion setup docs must stay synced with live releases.
- [Verified] Loopback resilience risk: Chrome Local Network Access has shipped prompts for local network/loopback requests and expanded restrictions to WebSockets; Astra Deck depends on `127.0.0.1` optional hosts for Astra Downloader and Ollama. Existing code has good literal-loopback/DNS-rebinding hardening, but release smoke should prove the current browser behavior under LNA flags.
- [Verified] External API degradation is partially covered by `extension/core/external-api-health.js`, popup, sidepanel, and tests. Remaining gap is in-page clarity when SponsorBlock/DeArrow/RYD degrade while the user is watching.

## Architecture Assessment
- [Verified] `extension/features/settings-panel/index.js` has substantial premium redesign work and accessibility audits, but no rendered settings-overlay visual smoke was found. Static tests cannot prove the large modal actually changed or remains coherent across desktop/mobile, dark/light, and RTL.
- [Verified] `extension/features/subscription-groups/index.js` already has local groups, JSON/CSV/OPML import/export, sorting, AI tags, last-visit state, and staged unsubscribe data. The gap is product synthesis: a subscription health/action center comparable to PocketTube's health and bulk actions.
- [Verified] `extension/features/video-hider/index.js` and the `notInterestedButton` setting give Astra Deck the primitives for recommendation control. Research shows "Not interested" is effective on homepage recommendations but under-discovered; the gap is a recoverable scrub session rather than one-off hover buttons.
- [Verified] Direct `chrome.*` calls remain spread through popup, sidepanel, background, and core modules. Chrome 148 adds a `browser` namespace while Firefox/Safari already use it; a wrapper would reduce future cross-browser friction, but this is maintainability, not a hot bug.
- [Verified] `eslint.config.js` enforces custom MV3 and catch-reason rules but does not yet enable ESLint's `no-constant-binary-expression` with relational comparison checking, a low-cost correctness ratchet relevant to a large plain-JS codebase.
- [Verified] Accessibility, i18n/l10n, observability, testing, docs, distribution, offline/local resilience, migration, and upgrade strategy were checked. New roadmap items are only added where the live repo still has a concrete gap; store submission, migration docs, supply-chain docs, mobile expansion, and userscript parity are already blocked, rejected, or intentionally not part of this extension-only pass.

## Rejected Ideas
- [Verified] Userscript/extension feature parity: rejected for this pass because the user explicitly scoped current work to extension-only and `scripts/check-userscript-drift.js` already classifies intentional extension-only gaps.
- [Verified] Cloud sync for subscription groups: rejected for now because Astra Deck's privacy posture favors local data and safe export/import; PocketTube's Google Drive/profile sync is useful but changes the data-trust model.
- [Verified] Custom user script/code execution inside Astra Deck: rejected because YouTube Enhancer/Turn Off the Lights expose custom scripting/shortcuts, but MV3 remote-code policy, Astra's no-shortcuts rule, and current security posture argue against it.
- [Likely] Mobile YouTube/Android browser support: rejected because BlockTube/Unhook/FilterTube show demand, but the current architecture, manifest, and testing harness target desktop extension surfaces.
- [Verified] Desktop-client rewrite in the FreeTube direction: rejected because Astra Deck's differentiator is enhancing the live YouTube site with browser extension APIs and local companion handoff, not replacing the client.
- [Verified] Store submission as an active roadmap item: rejected here because Chrome Web Store and AMO submission tasks already exist in `Roadmap_Blocked.md` and require operator accounts/human decisions.

## Sources
Competitors:
- https://github.com/code-charity/youtube
- https://github.com/YouTube-Enhancer/extension
- https://unhook.app/
- https://pockettube.io/
- https://chromewebstore.google.com/detail/pockettube-youtube-subscr/kdmnjgijlmjgmimahnillepgcgeemffb
- https://github.com/FreeTubeApp/FreeTube
- https://freetubeapp.io/
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/DeArrow
- https://github.com/Anarios/return-youtube-dislike
- https://github.com/amitbl/blocktube
- https://github.com/insin/control-panel-for-youtube
- https://github.com/varshneydevansh/FilterTube
- https://github.com/turnoffthelights/turn-off-the-lights-chrome-extension

Platform, policy, and standards:
- https://developer.chrome.com/blog/local-network-access
- https://chromestatus.com/feature/5197681148428288
- https://wicg.github.io/local-network-access/
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/

Security, research, and dependencies:
- https://www.koi.ai/blog/4-million-browsers-infected-inside-shadypanda-7-year-malware-campaign
- https://rhisac.org/threat-intelligence/cyberhaven-extension-compromise-part-of-broader-campaign-affecting-multiple-chrome-extensions/
- https://arxiv.org/html/2307.14551v3
- https://support.google.com/youtube/answer/6342839
- https://policyreview.info/articles/analysis/systematic-review-youtube-recommendations-and-problematic-content
- https://github.com/yt-dlp/yt-dlp/wiki/ejs
- https://github.com/mozilla/web-ext/releases
- https://eslint.org/blog/2026/06/eslint-v10.6.0-released/

## Open Questions
- [Needs live validation] Does the stray git tag `v25.11` intentionally represent an inherited userscript-era tag, or should it be deleted after a release-gate guard prevents recurrence? This does not block implementing the guard.
