# Research: Astra Deck

Date: 2026-08-23. Replaces all prior research.

## Executive Summary

Astra Deck is a local-first YouTube control suite for Chromium, Firefox, Tampermonkey, and Violentmonkey. Its strongest current shape is unusually broad control backed by serious diagnostics, reversible data handling, three build profiles, real-browser smoke tests, and focused integrations for SponsorBlock, DeArrow, Return YouTube Dislike, transcripts, on-device AI, and Astra Downloader. The market is already saturated with basic hide, resize, speed, and playback controls, so the highest-value direction is trust under change: make release and store-review claims source-derived, make the shipped Transcript Q&A as rigorous as the citation-backed summary path, and verify every first-class watch layout against YouTube experiments. Evidence: `README.md`, `package.json`, `extension/core/external-api-health.js`, `extension/core/persisted-domains.js`, `scripts/run-checks.js`, and the competitor sources below.

Top opportunities, in priority order:

1. Fix the post-tag shipped-identity gate so a successful release does not make `npm run check` fail on the tag alone.
2. Generate truthful `web_accessible_resources` reviewer copy from staged manifests. Current store documents say no JavaScript is exposed while every runtime module is intentionally exposed through a dynamic URL.
3. Rebuild Transcript Q&A on the existing citation, persistence, provider-policy, and failure-copy foundations.
4. Add native YouTube Theater as a third watch-theme conformance lane beside normal watch and Theater Split.
5. Require dated NVDA evidence for UI-changing releases instead of carrying an unchecked manual checklist.
6. Extend source-derived documentation checks to runtime floors, settings surfaces, module-loading behavior, and release provenance claims.
7. Finish the remaining subscription-groups fallback reconciliation without duplicating the broader browser-gated canonical-implementation work.
8. Keep selector and anti-adblock observability ahead of YouTube's rapid experiments, while avoiding another selector-count arms race.

## Product Map

- Core workflows: customize playback and player chrome; restyle normal watch, Theater Split, feeds, comments, chat, and settings; filter or group content; enrich videos with community data; search, export, summarize, and question transcripts. Evidence: `extension/core/settings-schema.js`, `extension/ytkit.js`, and `extension/features/**/index.js`.
- Recovery workflows: import/export with rollback, coordinated IndexedDB snapshots, feature bisect, selector health, external API health, staged unsubscribe, and release-channel rollback. Evidence: `extension/core/persisted-domains.js`, `extension/core/feature-bisect.js`, `extension/core/selector-health.js`, `extension/core/external-api-health.js`, and `scripts/release-channels.js`.
- Personas: privacy-conscious power users, accessibility and focus users, transcript-based researchers, users managing large subscription sets, and users who need local download or media-player handoff. Evidence: `README.md`, `docs/privacy-policy.md`, and the feature schema.
- Platforms and distribution: Manifest V3 builds for Chromium and Firefox plus Tampermonkey and Violentmonkey userscripts. Build profiles are `store-safe`, `chromium-store`, and `github-full`. Evidence: `extension/manifest.json`, `build-extension.js`, and `package.json`.
- Key data flows: isolated content runtime to MAIN-world bridge, extension worker for privileged fetches, optional third-party enrichment APIs, YouTube-origin IndexedDB for transcripts, and authenticated loopback communication with Astra Downloader. Evidence: `docs/architecture.md`, `extension/background.js`, `extension/core/data-flow.js`, and `docs/native-messaging-token-bootstrap.md`.

## Competitive Landscape

- [ImprovedTube](https://github.com/code-charity/youtube), [Control Panel for YouTube](https://github.com/insin/control-panel-for-youtube), and [YouTube Enhancer](https://github.com/YouTube-Enhancer/extension) validate demand for broad playback and layout control. Astra should keep its diagnostics and reversible state as the differentiator, and avoid adding another control unless it has a schema entry, teardown, test, and failure state.
- [SponsorBlock](https://github.com/ajayyy/SponsorBlock), [DeArrow](https://github.com/ajayyy/DeArrow), and [Return YouTube Dislike](https://github.com/Anarios/return-youtube-dislike) show the value of focused community data. Astra should keep fetch suppression, cache provenance, request budgets, and visible degradation. It should not make core playback depend on any one provider.
- [BlockTube](https://github.com/amitbl/blocktube) and [Unhook](https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid) show the appeal of narrow, understandable content controls. Astra should preserve plain-language profiles and attribution, and avoid presenting its 477 settings as one undifferentiated catalogue.
- [FreeTube](https://github.com/FreeTubeApp/FreeTube), [NewPipe](https://github.com/TeamNewPipe/NewPipe), [Invidious](https://github.com/iv-org/invidious), and [Piped](https://github.com/TeamPiped/Piped) provide stronger frontend isolation and alternative delivery paths. Astra should learn from their extractor drift and privacy posture, but should not become an alternate YouTube client because its purpose is enhancement inside the native site.
- [PocketTube](https://pockettube.io/) validates paid demand for groups and subscription cleanup. Astra already ships nested groups, per-group sorting, stale-channel scanning, staged unsubscribe, and import/export in `extension/features/subscription-groups/index.js`; copying another premium checklist would now add little value.
- [Glasp](https://glasp.co/youtube-summary), [NoteGPT](https://notegpt.io/youtube-video-summarizer), and [Eightify](https://eightify.app/tl/) validate timestamped summaries, follow-up questions, saved notes, and export. Astra should match their citation and reopen flow using local storage and user-selected providers, while avoiding default transcript upload or subscription lock-in.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp), [Cobalt](https://github.com/imputnet/cobalt), and [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) show how quickly YouTube download paths change. Astra's separate companion, identity checks, versioned health payload, PO-token state, and recovery copy are the right boundary. Bundling a second downloader copy in this repository would recreate version drift.
- [Refined GitHub](https://github.com/refined-github/refined-github) and [Reddit Enhancement Suite](https://github.com/honestbleeps/Reddit-Enhancement-Suite) show that mature enhancement suites need disciplined feature boundaries and recovery, not just breadth. Astra should finish factory convergence and source-derived gates before expanding its catalogue.

## Reported Issues

- The repository had zero open issues and zero open pull requests on 2026-08-23. The only issue, [#1](https://github.com/SysAdminDoc/Astra-Deck/issues/1), requested localization and is closed; the repository now ships 11 locales, so it is not roadmap work. Evidence: `extension/_locales/` and `scripts/project-facts.js`.
- [Discussion #43](https://github.com/SysAdminDoc/Astra-Deck/discussions/43) and [discussion #44](https://github.com/SysAdminDoc/Astra-Deck/discussions/44) had no comments or reactions on 2026-08-23. Discussion #43 also describes an older feature count and companion layout. Treat both as stale copy, not demand signals.
- No parent tracker exists because the repository is not a fork. The last 200 commits instead show repeated pressure around YouTube SPA node recycling, theme source-versus-render gaps, duplicated feature copies, and tests that asserted the wrong source. Those classes are represented by existing roadmap items and `tests/features/**`; no duplicate tracker-derived item is needed.

## Security, Privacy, and Reliability

- Verified release-gate defect: `npm run check` on tagged `v4.84.3` passes every stage except `shipped-identity`. `scripts/generate-shipped-identity-baseline.js` enumerates all current tags, but the committed baseline contains only tags visible before `v4.84.3` was created. Settings and feature IDs are unchanged. This makes a tag-only release event turn the main check red and needs a tag-aware release contract.
- Verified reviewer-truth defect: `extension/manifest.json` exposes `runtime-core-loader.mjs`, the core graph, feature modules, and `ytkit.js` through `web_accessible_resources` with `use_dynamic_url`. `docs/cws-submission-checklist.md` and `docs/store-permission-rationale.md` claim only icons and assets are exposed and no JavaScript is web-accessible. `tests/hardening.test.js` currently pins both the real manifest graph and the false prose.
- Production dependency audit was clean on 2026-08-23. The full audit still reports the two high-severity `image-size@2.0.2` infinite-loop advisories inherited through `web-ext -> addons-linter`: [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq). Mozilla tracks the chain in [web-ext #3806](https://github.com/mozilla/web-ext/issues/3806), and no patched `image-size` release exists. `Roadmap_Blocked.md` already owns this item.
- Runtime trust boundaries are stronger than the comparison set: optional hosts are permission-gated, proxy requests are allowlisted and header-filtered, remote feature-disable data is bounded, transcript and settings imports are sanitized, and loopback cookie access requires a short-lived native capability. Evidence: `extension/background.js`, `extension/core/remote-list-scope.js`, `extension/core/persisted-domains.js`, `extension/core/cookie-handoff.js`, and `docs/native-messaging-token-bootstrap.md`.
- Hosted configuration drift remains operator work: the live branch settings observed on 2026-08-23 did not match the required review and conversation-resolution claims in `docs/repo-settings.md`. Two stale CodeQL alerts also point at obsolete test-only revisions. These need GitHub administration, not duplicate code roadmap items.

## Architecture Assessment

- The repository has 113 runtime modules, 27 feature modules, 292 feature IDs, 477 settings across 18 categories, 35 selector surfaces, and 33 check stages. Evidence: the generated project facts in `README.md`, `CONTRIBUTING.md`, and `docs/architecture.md`.
- `extension/ytkit.js` retains one full `subscription-groups` fallback beside the running factory module. Its attempted removal exposed 34 tests and a11y audit assumptions. The existing monolith item remains valid, but it should be treated as a correctness reconciliation first and a small parse-time win second.
- The userscript still carries hand-maintained SponsorBlock, DeArrow, Return YouTube Dislike, subscription-group, and retired player-handoff paths even though the current factories are bundled. Evidence: `YTKit.user.js` and `YTKit-core.user.js`. This is already represented by the browser-gated canonical-implementation item in `Roadmap_Blocked.md`, so the active roadmap does not repeat it.
- `extension/runtime-bootstrap.js` conditionally loads by settings, not by route. `README.md` says feature modules are route-gated. The documentation gate should check this claim rather than repeating it.
- Transcript Q&A is present but does not meet its older roadmap acceptance. `extension/ytkit.js` uses hard-coded English, a hand-rolled modal without dialog semantics or Escape/focus restoration, the first 6,000 transcript characters only, plain unvalidated output, no timestamp citations, and no saved conversation. `extension/core/ai-summary-artifacts.js` already provides 120,000-character cue preparation, citation validation, persistence, export, and seekable links that can be reused.
- The live watch-theme smoke verifies normal watch and Theater Split in dark and light, but it never toggles YouTube's native Theater mode. Evidence: `scripts/smoke-zero-ads-live.js` and `README.md`. YouTube documents normal and Theater as distinct player sizes, and community reports show full-bleed Theater experiments can remove scrolling or comments access: [YouTube player sizing](https://support.google.com/youtube/answer/6052392), [report 1](https://www.reddit.com/r/youtube/comments/1nb5pcc), [report 2](https://www.reddit.com/r/youtube/comments/1oidrvv).
- SponsorBlock's current anti-adblock path records a matched enforcement selector but does not provide a user-facing recovery state. YouTube documents a warning followed by possible playback blocking, while Adblock Plus documents a temporary self-pause when it detects the warning. Recovery should be driven by observed warning and playback state, not a presumed escalation ladder. Evidence: `extension/features/sponsorblock/index.js`, [YouTube help](https://support.google.com/youtube/answer/14129599), and [Adblock Plus help](https://help.adblockplus.org/adblock-plus-help-center/what-to-do-if-you-are-seeing-youtube-s-anti-adblocking-warning).
- Automated accessibility coverage is broad, but `docs/screen-reader-smoke.md` contains an unchecked manual NVDA, JAWS, and VoiceOver checklist with no dated evidence artifact. Static source checks cannot prove announcement order, focus restoration, or Blink-versus-Gecko behavior.
- Localization topology is complete, but `docs/i18n-coverage.md` reports only 69.6 to 70.9 percent translated content and about 155 unresolved feature name or description messages per non-English locale. `scripts/export-i18n-proofing.js` already creates a translator-ready queue. Native-language review, not another extraction tool, is the remaining dependency.
- Documentation drift is broader than the generated project-facts block: `CONTRIBUTING.md` says Node 22 after its generated Node 24 fact, `README.md` overstates route gating and release attestation, and `docs/architecture.md` still describes only dark/OLED themes. Semantic claims need bait-verified source checks.
- Test depth is a major strength. On 2026-08-23, `npm test` passed 2,493 tests with one intentional filesystem symlink skip and zero failures. The remaining risk is evidence quality: some UI tests still pin source shape rather than rendered behavior, which the existing render-assertion roadmap item addresses.

## Rejected Ideas

- Another subscription hygiene dashboard: already shipped with stale-channel detection, a health/action center, staged unsubscribe, undo, pacing, logs, and per-group sort modes in `extension/features/subscription-groups/index.js`.
- An original-language assistant: already shipped across titles, descriptions, thumbnails, chapters, transcripts, preferred audio tracks, original-audio selection, and auto-dub notices. Evidence: `extension/core/audio-track.js`, `extension/core/chapters.js`, `extension/core/youtube-thumbnails.js`, and the `antiTranslate*` schema keys.
- A generic provider-status matrix: `extension/core/external-api-health.js`, popup, and side panel already expose available, stale, cooldown, rate-limited, permission-denied, fallback, last-success, host, and request-budget states. Downloader pills separately expose companion identity, auth channel, yt-dlp, ffmpeg, JavaScript runtime, and PO-token health.
- A new transcript batch queue: `researchSpacedReview` already builds a bounded, cancellable 20-video study pack from visible videos with one recovery pass, provenance, Markdown, JSONL, and per-video failures. Crawling whole channels would add API and maintenance cost without strong enough demand.
- A second feature-recovery tool: feature health, selector health, diagnostic bundles, remote disable data, and the feature bisect wizard already cover identification and rollback. Evidence: `extension/core/feature-health.js`, `extension/core/selector-health.js`, `extension/core/feature-disable-feed.js`, and `extension/core/feature-bisect.js`.
- Settings favorites or recently changed rows: plausible at 477 settings, but current search, category navigation, profiles, quick toggles, import previews, and schema summaries are strong, and the research found no direct demand signal.
- Full mobile support: the product is a desktop YouTube extension and userscript, while mobile extension support is host-dependent. A mobile client would conflict with the current architecture and duplicate FreeTube/NewPipe territory.
- Cloud multi-user workspaces or collaborative notes: they conflict with the local-first privacy model and would add identity, moderation, synchronization, and retention obligations without tracker demand.
- A remote plugin marketplace: dynamic executable code is incompatible with store policy and the current reviewable package boundary. The existing static feature-module graph is the safer extension point. See the [Chrome extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure).
- Automatic no-caption transcription in this repository: it belongs behind the separately versioned Astra Downloader companion with explicit model, disk, CPU, and privacy disclosure. The extension should consume a versioned capability only after the companion implements it.
- Immediate AI-disclosure rewriting: YouTube moved altered/synthetic-content labels below long-form players and onto Shorts overlays in 2026, but this repository has no captured labeled-video DOM or stable structural selector. Preserve the native label through theme work now; defer extraction into exports until a live fixture exists. Source: [YouTube AI label update](https://blog.youtube/news-and-events/improving-ai-labels-viewers-creators/).
- A duplicate pixel-diff item: `Roadmap_Blocked.md` already tracks visual regression. Its browser-unavailable explanation is stale because real Chromium and Firefox smoke lanes now run, but relocating it requires editing the blocked roadmap in a separate maintenance pass.

## Sources

### Repository tracker

- https://github.com/SysAdminDoc/Astra-Deck/issues
- https://github.com/SysAdminDoc/Astra-Deck/issues/1
- https://github.com/SysAdminDoc/Astra-Deck/pulls
- https://github.com/SysAdminDoc/Astra-Deck/discussions/43
- https://github.com/SysAdminDoc/Astra-Deck/discussions/44

### Direct OSS competitors

- https://github.com/code-charity/youtube
- https://github.com/insin/control-panel-for-youtube
- https://github.com/YouTube-Enhancer/extension
- https://github.com/amitbl/blocktube
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/DeArrow
- https://github.com/Anarios/return-youtube-dislike
- https://github.com/FreeTubeApp/FreeTube
- https://github.com/gorhill/uBlock
- https://github.com/iv-org/invidious
- https://github.com/TeamPiped/Piped
- https://github.com/libredirect/browser_extension
- https://github.com/pc035860/YCS-cont
- https://github.com/yt-dlp/yt-dlp
- https://github.com/imputnet/cobalt
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider

### Commercial products

- https://www.mrfdev.com/enhancer-for-youtube
- https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid
- https://pockettube.io/
- https://glasp.co/youtube-summary
- https://notegpt.io/youtube-video-summarizer
- https://eightify.app/tl/
- https://harpa.ai/
- https://help.downloadhelper.net/article/6-what-is-vdh

### Adjacent projects

- https://github.com/TeamNewPipe/NewPipe
- https://github.com/refined-github/refined-github
- https://github.com/honestbleeps/Reddit-Enhancement-Suite
- https://github.com/osteele/bisect-obsidian-extensions
- https://github.com/KristjanPikhof/YouTube-Summarizer

### Awesome lists

- https://github.com/digitalblossom/alternative-frontends
- https://github.com/Myzel394/awesome-alternative-frontends
- https://github.com/mendel5/alternative-front-ends
- https://github.com/awesome-scripts/awesome-userscripts
- https://github.com/pluja/awesome-privacy

### Community signal

- https://www.reddit.com/r/youtube/comments/1lepmrs
- https://www.reddit.com/r/youtube/comments/1nq1zp8
- https://www.reddit.com/r/youtube/comments/1lnoim0
- https://www.reddit.com/r/youtube/comments/1nb5pcc
- https://www.reddit.com/r/youtube/comments/1oidrvv
- https://www.reddit.com/r/youtube/comments/1ujdgye
- https://news.ycombinator.com/item?id=47786791
- https://news.ycombinator.com/item?id=38602097
- https://help.adblockplus.org/adblock-plus-help-center/what-to-do-if-you-are-seeing-youtube-s-anti-adblocking-warning
- https://stackoverflow.com/questions/77040261/problems-getting-ondomcontentloaded-to-trigger-on-chrome-extension-manifest-v3
- https://stackoverflow.com/questions/79739749/youtube-captions-api-from-api-explorer-returns-404-for-a-resource-id-obtained-fr

### Standards and platform sources

- https://developer.chrome.com/docs/extensions/whats-new
- https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace
- https://developer.chrome.com/blog/structured-clone-messaging
- https://developer.chrome.com/blog/local-network-access
- https://developer.chrome.com/blog/chrome-userscript
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153
- https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154
- https://github.com/w3c/webextensions
- https://github.com/w3c/webextensions/issues/1051
- https://developers.google.com/youtube/v3/docs/captions/download
- https://developers.google.com/youtube/terms/developer-policies
- https://support.google.com/youtube/answer/13339776
- https://support.google.com/youtube/answer/14110396
- https://support.google.com/youtube/answer/16370674
- https://support.google.com/youtube/answer/6052392
- https://support.google.com/youtube/answer/14129599
- https://blog.youtube/news-and-events/improving-ai-labels-viewers-creators/

### Academic and engineering research

- https://arxiv.org/abs/2406.12710
- https://arxiv.org/abs/2404.06827
- https://arxiv.org/abs/2404.08310
- https://arxiv.org/abs/2503.01000
- https://arxiv.org/abs/2307.14551
- https://www.mozillafoundation.org/en/youtube/user-controls/
- https://faculty.washington.edu/alexisr/youtubeAgency.pdf
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/minimize-page-load-time-impact

### Dependencies and security

- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
- https://github.com/mozilla/web-ext/issues/3806
- https://github.com/mozilla/web-ext/releases
- https://github.com/websockets/ws/releases
- https://github.com/eslint/eslint/releases/tag/v10.9.0
- https://www.npmjs.com/package/crx3
- https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html
- https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
- https://www.koi.ai/blog/trust-me-im-local-chrome-extensions-mcp-and-the-sandbox-escape
- https://socket.dev/blog/socket-now-protects-the-chrome-extension-ecosystem

## Open Questions

- Which stable structural hooks identify YouTube's altered or synthetic-content disclosure in current long-form and Shorts DOM across locales? A live labeled-video capture is required before export provenance can be specified safely. This does not block any prioritized roadmap item.
