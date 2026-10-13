# Research: Astra Deck

Date: 2026-10-13. Replaces all prior research.

## Executive Summary

Astra Deck is a local-first desktop YouTube extension with a generated userscript, extensive feed controls, and a distinctive Theater Split experience. Its strongest direction is making that breadth dependable and optional. Fresh profiles currently enable several visual transformations, while some cold-disabled factories cannot start when enabled later. The settings recovery surface itself can fail in that state. Fix these boundaries, private-context handling, and overlapping presets before adding another layer of controls. This follows the concrete demand in [issue #52](https://github.com/SysAdminDoc/Astra-Deck/issues/52), the startup generator in `scripts/generate-runtime-bootstrap.js`, and the reproduced failures described below.

Confidence labels distinguish evidence. **Verified source** means inspected implementation or primary documentation, **Verified live** means exercised in an isolated Chromium session, and **Verified VM** means real methods exercised with controlled dependencies rather than a full browser. **Likely** marks an untriggered source-supported race. **Needs live validation** marks an outstanding browser or enrolled-layout check.

| Order | Opportunity | Impact / effort | Placement |
| --- | --- | --- | --- |
| 1 | Register cold-disabled factories | 5/5, M | Now, P1. Repair the startup cause before changing defaults. |
| 2 | Keep settings usable with a partial runtime | 5/5, S | Now, P1. A live failure prevents access to recovery controls. |
| 3 | Bind Resume Playback work to its generation and video | 4/5, S | Now, P1. VM reproductions seek the next video and leak a listener. |
| 4 | Recheck DeArrow card identity after awaits | 4/5, S | Now, P1. A narrow guard addresses a plausible recycled-renderer race. |
| 5 | Observe asynchronous lifecycle initialization | 4/5, M | Now, P1. Rejected initialization is currently reported healthy. |
| 6 | Give overlapping presets deterministic ownership | 4/5, M | Now, P1. Existing recipes restore stale settings. |
| 7 | Isolate private-session records and credentials | 5/5, L | Now, P1. A larger trust boundary precedes further persistence work. |
| 8 | Use gentle defaults and one visual starter choice, #52 | 5/5, M | Now, P1. Depends on factory activation, settings recovery, and preset ownership. |
| 9 | Authenticate repair-feed freshness | 4/5, M | Next, P2. Signatures already protect integrity, but not replay freshness. |

All nine fit the existing architecture and require no new runtime dependency. They are reliability or usability parity, rather than a speculative expansion. Risks are concentrated in startup cost, saved-preference compatibility, preset layering, private cookie partitions, and offline cache migration. The remaining Next items address documented migration demand, specific missing controls, packaging accuracy, and failure recovery. Details and observable acceptance criteria are in `ROADMAP.md`.

## Product Map

- Browse Home, Subscriptions, search, and channel feeds with filters, hide attribution, subscription groups, Takeout/NewPipe import, DeArrow, and alternative layouts. Entry points are `extension/features/home-subs-css/index.js`, `subscription-view/index.js`, `subscription-groups/index.js`, `video-hider/index.js`, and `dearrow/index.js`.
- Watch in Theater Split with independently collapsible comments, a resizable divider, live-chat/replay handling, and compact player actions. The implementation is in `extension/features/sticky-video/index.js` and `sticky-video-header/index.js`.
- Resume or queue viewing, inspect transcripts, save notes, and hand transcript text to a chosen assistant. These workflows are in `extension/ytkit.js` (`resumePlayback`, `persistentQueue`, `transcriptViewer`) and `extension/features/video-notes/index.js`.
- Configure the in-page Command Deck, import/export local settings, inspect diagnostics, and use popup/sidebar controls. The 18 schema categories in `extension/core/settings-schema.js` are grouped into 11 Command Deck panes by `extension/features/settings-panel/index.js`; those counts describe different layers.
- Download through the separate AstraDownloader companion or explicitly selected integrations. `extension/core/data-flow.js`, `cookie-handoff.js`, and `extension/background.js` own the permissions and authenticated handoff. The companion executable belongs to its separate repository.

The supported audience is desktop viewers who want distraction controls, people managing large subscriptions, and viewers who use transcripts or assistive technology. That inference follows the workflows above, not a claim of measured user demographics. `package.json`, `extension/manifest.json`, `scripts/manifest-patch.js`, and `sync-userscript.js` specify Node 24+, Chrome 120+, Firefox 142+, and a shared-source userscript. The three packaging profiles are `store-safe`, `chromium-store`, and `github-full`. Userscripts intentionally lack extension network rules, Settings Sync, and authenticated cookie downloads (`userscript/host.js`, `docs/architecture.md`).

The source is v4.99.3; the [latest published GitHub Release](https://github.com/SysAdminDoc/Astra-Deck/releases/tag/v4.99.2) is v4.99.2, published on 2026-10-13. Release promotion still has the existing manual screen-reader gate in `Roadmap_Blocked.md`, with `docs/screen-reader-evidence.json` required but absent. Do not create another signing, store-submission, or channel-promotion item.

Settings and viewing records use local storage (`extension/core/storage.js`, `storage-manager.js`, `persisted-domains.js`). Feature-enabled or requested flows include DeArrow/SponsorBlock, transcript retrieval, assistant services, and the companion. Repair checks also run automatically. Their catalogue is `extension/core/data-flow.js`. The generated runtime has 125 modules, 33 peeled feature modules, 307 declared feature IDs, and 494 settings entries, as checked by `scripts/project-facts.js` and the generated facts in `README.md`.

## Competitive Landscape

| Product or class | Useful signal | Learn and avoid |
| --- | --- | --- |
| [YouTube Enhancer](https://github.com/YouTube-Enhancer/extension/blob/main/README.md) | A broad player toolbox with page-specific controls. Its v1.35.0 release is dated 2026-09-06. | Keep controls scoped to their surface. Defer its requested hold-to-speed gesture until Astra has demand; do not add hotkeys. |
| [FilterTube](https://github.com/varshneydevansh/FilterTube/blob/master/js/io_manager.js) | Imports BlockTube-style filters; [#79](https://github.com/varshneydevansh/FilterTube/issues/79) and #80 expose migration failures. | Add a bounded, loss-aware parser with counts and atomic undo. Never import executable rules or silently reinterpret incompatible filters. |
| [BlockTube](https://github.com/amitbl/blocktube/blob/master/src/ui/options.js) and [ChannelSieve](https://github.com/825i/channelsieve/releases/tag/0.5.1) | A concrete `filterData` export contract and an MV3 maintenance fork published on 2026-08-14. | Support compatible IDs and rule semantics. Discard JavaScript, passwords, and unrelated options. These are filter imports, not subscription imports. |
| [Anti Translate](https://github.com/zpix1/yt-anti-translate/blob/main/app/src/global.js) | Modern renderer support, per-channel exceptions, and cached original-title retrieval. [#193](https://github.com/zpix1/yt-anti-translate/issues/193) documents request flooding. | Extend original titles to lockups with bounded requests. Preserve DeArrow's selected title rather than letting two writers fight. |
| [SponsorBlock](https://github.com/ajayyy/SponsorBlock/blob/master/README.md), [DeArrow](https://github.com/ajayyy/DeArrow/issues/530), and [Return YouTube Dislike](https://github.com/Anarios/return-youtube-dislike/blob/main/README.md) | Mature crowd-data integrations. DeArrow #530 reports a stale title/new thumbnail combination on 2026-10-10. | Harden renderer identity and reuse existing API boundaries. Additional DeArrow options already have an Astra roadmap entry; voting permissions remain blocked separately. |
| [Remove YouTube Suggestions](https://github.com/lawrencehook/remove-youtube-suggestions/releases/tag/v4.5.2) | v4.5.2 shipped on 2026-10-11. This release addresses signed-out sidebar targeting, embeds, and PocketTube coexistence. | Include signed-out and coexistence states in focused acceptance checks. It still sells premium extras; do not describe it as entirely free. |
| [YouTube Tweak](https://github.com/xlch88/YouTubeTweak/blob/main/FUNCTIONS.md) and [YouTubeAlchemy](https://github.com/TimMacy/YouTubeAlchemy/blob/main/README.md) | Discoverable controls and documented default behavior. | Make Astra's existing settings understandable before increasing option count. Avoid another parallel preset or theme engine. |
| [Weedout](https://github.com/masteranza/weedout-for-youtube/blob/main/README.md) | Recommendation filtering supplies another focused alternative. | Keep content-filter rules explainable. Do not infer reliable AI-content classification from a competitor's pitch. |
| [Control Panel](https://github.com/insin/control-panel-for-youtube/releases/tag/v1.37.2), [ImprovedTube](https://github.com/code-charity/youtube), and [Iridium](https://github.com/ParticleCore/Iridium/blob/master/README.md) | Control Panel v1.37.2 is dated 2026-10-13. Its [classic-watch override](https://github.com/insin/control-panel-for-youtube/releases/tag/v1.37.0) is experimental and snapshot-specific. ImprovedTube supplies list-layout demand and an Opus-blocking PR. | Study behavior only where licenses are absent or restrictive. Do not claim these projects prove a general fix for enrolled YouTube experiments, or copy their source into this MIT project. |
| [Nova](https://github.com/raingart/Nova-YouTube-extension/blob/master/README.md) | Internal static feature plugins provide focused controls. | Keep Astra's own registered modules. A remote-code marketplace would conflict with its packaging and trust model. |
| [PocketTube](https://pockettube.io/), [Unhook](https://unhook.app/), and [Enhancer for YouTube](https://www.mrfdev.com/how-to-use-enhancer-for-youtube) | Group organization, restrained distraction controls, and contextual player options. PocketTube's [duplicate UI report](https://github.com/NabokD/pockettube/issues/187) shows update/re-injection cost in an open Firefox tab. | Astra already has groups. Prioritize one coherent control location and gentle defaults, not another grouping service. No current PocketTube price was verified. |
| [Glasp](https://glasp.co/pricing), [NoteGPT](https://notegpt.io/pricing), and [Eightify](https://eightify.app/) | Paid transcript and summary workflows show the value of a direct handoff. On 2026-10-13 Glasp distinguishes three basic handoffs per day from three on-video summaries per seven days. | Astra already hands transcripts to chosen assistants. Keep that explicit workflow; do not add an account-backed summary subscription or automatic page collection. |
| [wallabag](https://github.com/wallabag/wallabag), [SingleFile](https://github.com/gildas-lormeau/SingleFile), [Zotero Connector](https://www.zotero.org/support/kb/connector_permissions), and [Refined GitHub](https://github.com/refined-github/refined-github/blob/main/source/feature-manager.tsx) | Analogues for saved-item lifecycle, faithful capture, permission explanations, and independently disabled features. | Reuse bounded local state and clear permission copy. Astra already has feature kill switches; strengthen freshness rather than replacing the engine. Avoid a new server library or protected-video archive. |

Awesome Userscripts and Awesome Extensions led to the peers above. Reddit subscription-management and theater-layout complaints, Lobsters, Mozilla Discourse, and Stack Overflow corroborate the problem classes but do not establish new Astra-specific demand. Their URLs are retained below; issue #52 outranks those indirect signals.

## Reported Issues

**Verified tracker, 2026-10-13:** [#52](https://github.com/SysAdminDoc/Astra-Deck/issues/52) is the only open issue. It requests familiar initial behavior, opt-in radical styling, fewer overlapping controls, and discoverable presets without resetting saved choices. The concrete defaults include `squareSearchBar`, `squareAvatars`, `subscriptionsGrid`, `homepageGridAlign`, `hideSidebar`, `uiStyle: 'square'`, `watchPageRestyle`, and `stickyVideo` in `extension/core/settings-schema.js:126` and `extension/ytkit.js:4112`. `settingsManager.load()` at `extension/ytkit.js:5091` merges saved values over defaults. Preserve all explicit values, including sparse imports; fully populated older bags do not identify which values the user touched. Existing schema/default parity checks in `build-extension.js` and `scripts/check-settings.js` should be extended, not duplicated.

[#51](https://github.com/SysAdminDoc/Astra-Deck/issues/51), the userscript avatar report, was fixed and confirmed by its reporter on 2026-10-08. [#1](https://github.com/SysAdminDoc/Astra-Deck/issues/1), Chinese localization, is already delivered. Neither becomes new work. No open pull request offers an unmerged implementation. Discussions #43 and #44 have no replies establishing another actionable report. The live and VM defects below are newly observed evidence, not claims that users filed them.

## Security, Privacy, and Reliability

**Private context, Verified source; end-to-end behavior Needs live validation.** `extension/manifest.json` has no explicit incognito mode, `userscript/host.js:780` hardcodes `currentTab().incognito` to false, and the storage paths lack a shared privacy fence. Automatic watch progress, watch time, and resume positions are written in `extension/ytkit.js:15810`, `:19088`, `:19097`, and `:21404`; `extension/core/persisted-domains.js:88` includes backup domains. Watch Feed's `persistentQueue._finishCurrent` at `extension/ytkit.js:23521` automatically removes played records, so private playback also needs an ephemeral feed copy. This is a verified missing boundary, not a reproduced private-data leak.

Use browser `extension.inIncognitoContext` in content code, trusted `sender.tab.incognito` in background handlers, and sandbox `GM_info.isIncognito` in both supported managers. A spanning worker's own flag cannot identify its sender. Unknown manager state should keep automatic records in memory. [Chrome](https://developer.chrome.com/docs/extensions/reference/api/extension#property-inIncognitoContext), [MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender), [Tampermonkey](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_info), and [Violentmonkey](https://violentmonkey.github.io/api/gm/#gm_info) expose these contracts; manager availability predates the tested versions pinned in `scripts/userscript-manager-fixtures.json`. Shared preferences may be read; private histories, caches, diagnostic page identifiers, and feed consumption must not persist. Explicit Copy, Export, and Download remain available. A new action that saves private records into regular in-app storage needs a separate product/policy decision, not an assumed exception to [Mozilla's private-data rule](https://extensionworkshop.com/documentation/publish/add-on-policies/).

**Credential isolation, Verified source; Needs live validation.** Transcript fallback requests at `extension/core/transcript-service.js:692` (POST) and `:720` (HTML GET) supply no credentials policy; `extension/ytkit.js:496` preserves only an explicit `omit`, while `extension/background.js:2443` defaults YouTube credentials to `include`. A regular spanning worker can therefore use its execution context's credentials for a private sender. Force omission for that private request path. Authenticated companion handoff already binds Firefox `cookieStoreId` (`extension/background.js:598`, `:2649`); retain it. Where the sender lacks an ID, resolve its store through [CookieStore.tabIds](https://developer.chrome.com/docs/extensions/reference/api/cookies#type-CookieStore), bind store/private state to the existing one-use tab/document/URL capability, and fail closed on mismatch. Omitted store IDs default to the calling context, not inherently to the sender or always to normal browsing. Preserve [Firefox isolation and partition requirements](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/getAll), rather than querying every first-party domain.

**Repair-feed replay, Verified source.** `extension/background.js:1194` verifies signature integrity, but the payload has no authenticated sequence or expiry and receipt refreshes `cachedAt` (`:1246`). A previously valid payload can appear newly received. Add signed monotonic metadata and bounded validity using the narrow freshness principles in [TUF](https://theupdateframework.github.io/specification/latest/), without importing a full update framework. Keep the current six-hour cache and explicit 30-day stale policy bounded by signed validity (`extension/core/feature-disable-feed.js`). Selector downgrade protection already exists in `extension/core/selectors.js:642` and is not a new task.

**Diagnostics, Verified source.** `extension/core/diagnostic-log.js:66` retains errors in memory and explicitly waits for another settings save. A reload can discard the failure that prompted it. Use independent bounded, debounced persistence with existing redaction, no telemetry, and no recursive logging on quota failure. Private-context isolation and promise-aware lifecycle reporting must land first.

**Dependencies and packaging, Verified source on 2026-10-13.** The five direct dependencies match the inspected published versions: crx3 2.0.0, acorn 8.19.0, ESLint 10.12.0, web-ext 10.7.0, and ws 8.22.0 (`package.json`, `package-lock.json`, linked changelogs below). The checked ws advisories are patched before 8.22.0; the inspected Acorn advisory affects older major versions. No new direct upgrade is justified. This is not a fresh complete transitive audit. Keep `scripts/npm-stubs/devicefarmer-adbkit` because the [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) still has no patched version in its affected range. Do not replace the stub with the vulnerable tooling dependency merely to simplify the lockfile.

`scripts/generate-release-sbom.js:46` treats npm link entries and nested install paths as package identities. Read-only evaluation produced bogus required components such as `web-ext/node_modules/@devicefarmer/adbkit@0.0.0`. Resolve link targets, classify actual dependency reachability, and emit name/version/PURL identities per [npm's lockfile contract](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/) and [CycloneDX](https://cyclonedx.org/docs/1.5/json/). Describe the SBOM as build-tooling dependencies, not browser runtime libraries. Artifact-signing machinery, signed repair feeds, profile pruning, manager SRI harnesses, and unsigned Firefox-install limitations already have implementations or blocked acceptance tasks. `allowed-signers` states that public releases are not yet signed.

## Architecture Assessment

**Cold-start boundary, Verified source and live settings failure.** `scripts/generate-runtime-bootstrap.js:18` still settings-gates factory modules such as Video Notes, Video Insights, Search While Watching, SponsorBlock, and DeArrow. Factory consumers in `extension/ytkit.js` can then keep descriptor-only fallbacks for the tab's lifetime. v4.99.3 removed the Home/Subs and Subscription View gates, but `tests/runtime-bootstrap.test.js:167` covers only those two. Register factory-only providers without activating their observers or network work. Generate a provider/consumer coverage inventory and exercise cold-off to on behavior across it; use bounded covering profiles for interaction combinations, not a blanket all-features-on test. [NIST covering-array guidance](https://csrc.nist.gov/pubs/sp/800/142/final) supports the latter test strategy, not a substitute for exhaustive factory registration checks.

With the hider settings cold-disabled, a real click on `#ytkit-masthead-btn` throws `TypeError: videoHiderFeature?._getHiddenVideos is not a function`. The stack reaches `extension/features/settings-panel/index.js:1610`, `:1669`, and `:2937`. Object optional chaining does not guard an absent method; similar counter/list calls appear at `:1618`, `:1972`, `:2180`, `:2489`, `:2790`, and `:2914`. Canonical fresh defaults open successfully. Keep storage-backed data accessible during module failure, show an unavailable/retry state where necessary, and never replace existing records with fabricated empty arrays. The live harness should fail on extension-origin runtime exceptions and should actually click the settings button.

**Async ownership, Verified VM for the monolith wrapper.** `initFeatureLifecycle` (`extension/ytkit.js:6545`) returned true, marked `_initialized`, and reported healthy after an async initializer rejected. The rejection was unhandled. Separately, **Verified source** in `extension/core/feature-lifecycle.js:114` shows `start` sets `record.started` without observing an initializer's returned promise. Track starting/success/failure only for the active generation, observe promises, and prevent late completion after destruction from changing health. Audit callers that depend on the monolith's boolean return contract.

The real `resumePlayback._restore` (`extension/ytkit.js:21430`) captured video A's saved position of 123 seconds, then sought a reused video element after navigation to B. In a separate deferred-storage enable/disable/enable reproduction, `resumePlayback.init` (`:21458`) installed two `pagehide` listeners; final destroy left one. Use generation and current-video checks after every await, and own/cancel readiness listeners and timers. Tests should drive those real methods with deferred reads and reused elements, rather than assert implementation strings.

**Renderer ownership, Likely.** `extension/features/dearrow/index.js:577` checks route and global generation after awaiting branding but not the renderer's current video ID or connection. Same-route reuse is reset at `:777`; `_waitForCover` at `:676` already checks identity. Apply one shared identity guard to title, thumbnail, and peek writes. The deferred A-to-B renderer test is the acceptance proof; [DeArrow #530](https://github.com/ajayyy/DeArrow/issues/530) supplies analogous demand, not proof that Astra has that exact upstream bug.

**Preset ownership, Verified VM with state-commit and persistence dependencies stubbed.** Real Privacy and Focus methods (`extension/ytkit.js:39153`, `:39263`) keep independent backups. Enabling both, explicitly changing infinite-scroll blocking, then disabling both resurrected prior preset values. Disabling Privacy also undid Shorts removal while Focus remained active; the separately exercised `hasRelevantSettingsChange` at `:6603` returned false for Focus. The full reconciler and cross-tab integration were not exercised. Define per-key layers with explicit edits taking priority, retain existing import keys, and test cross-tab persistence before building the #52 visual choice. [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) supports a small initial choice; a forced tutorial is unnecessary given [contextual onboarding guidance](https://www.nngroup.com/articles/onboarding-tutorials/).

**Concrete UI recovery gaps, Verified live unless marked otherwise.** Home, Subscriptions, Theater Split, all 11 settings panes, popup, and sidebar were inspected in available dark/light states in isolated Chromium. No stable light-navigation contrast defect was reproduced after the theme transition settled. The following gaps merit narrowly scoped work:

- Watch Feed's enabled Add button has zero geometry inside hidden `#actions` in Theater Split. Turning `stickyVideo` off exposes it and a real click adds the item. `_dockSplitActions` in `extension/features/sticky-video-header/index.js:878` moves notifications, page, like, and download actions, but not Watch Feed. Preserve the button's state and listener identity when docking it or exposing it in the existing overflow.
- With `transcriptViewer` enabled, a failed caption request produced an unavailable state that told the user to reload/try again but offered no Retry action. Reuse the abort/generation-safe load path around `extension/ytkit.js:20840`; distinguish captionless media from a transient failure. No claim is made that this video lacks captions or that YouTube's API is defective.
- **Verified source:** the split divider supports arrow-key width changes and Enter/Space collapse (`extension/features/sticky-video/index.js:437`), but pointer users must drag to resize. A contextual click-track range control or narrower/wider buttons can reuse `_applyDividerRatio` without adding hotkeys. [WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) explicitly requires a single-pointer alternative; keyboard support alone is insufficient. The rail's pseudo-element already extends its hit area, so no target-size violation is asserted.

**Migration and title coverage, Verified source.** BlockTube's export envelope includes `filterData`, options, and `uiPass`. The parser belongs beside Video Hider and `extension/core/settings-import-transaction.js`, not in the subscription importer. Use existing regex safety, bound input and work, report unsupported semantics, and atomically merge with one undo. `antiTranslate` at `extension/ytkit.js:17371` only visits `#video-title[title]` plus watch metadata. [Anti Translate's metadata path](https://github.com/zpix1/yt-anti-translate/blob/main/app/src/background.js) first retrieves cached YouTube oEmbed `title`/`author_url`, then falls back to player `videoDetails` on 401. Its fallback has a stale hardcoded client version and no `hl`; reuse Astra's existing client/request boundary instead. Extend lockups and canonical-ID title exceptions with bounded retrieval, including cards whose text and title attribute are both translated. Do not issue channel-search calls just to check exceptions. DeArrow renderer guards precede this work.

**Documentation truth, Verified source.** `docs/privacy-policy.md` omits the automatic raw-GitHub repair feed described by `extension/core/data-flow.js:184`; `docs/cws-submission-checklist.md:462` calls loopback origins GitHub-only although store-safe retains the companion; `INSTALL.md` omits Chrome's userscript permission prerequisite already documented by `CONTRIBUTING.md:27`. `.github/ISSUE_TEMPLATE/feature_request.md` says third-party APIs default off despite DeArrow being on, and `.github/pull_request_template.md` encourages automatic issue closure contrary to the confirmed-fix policy. Extend the existing doc-truth checks and correct obsolete blocked descriptions, including browser availability and sidebar permission gating. Do not add more Markdown files or duplicate the existing blocked store work.

The existing audit sweep, advanced DeArrow settings, `/live/<id>` routing, real live-edge latency, Sleep Timer translation, and side-panel comments tasks remain valid (`ROADMAP.md`). Narrow the list-layout entry: `listFeedLayout` already covers Home, Subscriptions, and search in `extension/features/home-subs-css/index.js:329`; channel grids and live acceptance remain. Enrolled side-panel comments, manual screen-reader behavior, signed-in personalized feeds, and private/container flows remain **Needs live validation**. No complete accessibility or Firefox/private-browser pass is claimed.

## Rejected Ideas

| Disposition | Idea and evidence | Reason |
| --- | --- | --- |
| Rejected as duplicate | Takeout/NewPipe import, transcript handoff, Home/search list layout, filter reasons, AI-label filtering, automatic-chapter hiding, separate view rows, card dislikes, dynamic resource URLs (`extension/features/subscription-groups/index.js`, `extension/ytkit.js`, `extension/core/settings-schema.js`, `extension/manifest.json`) | They already ship. The prior research's missing-feature claims are stale. |
| Under Consideration | Per-surface Shorts controls ([Control Panel #187](https://github.com/insin/control-panel-for-youtube/issues/187)), original channel branding ([Anti Translate](https://github.com/zpix1/yt-anti-translate/blob/main/app/src/content_channelbranding.js)) | Plausible parity work after #52, but no added Astra-specific demand justifies more control surfaces now. Title exceptions have the narrower accepted path. |
| Under Consideration | Hold-to-speed ([YouTube Enhancer #1435](https://github.com/YouTube-Enhancer/extension/issues/1435)), Opus blocking ([ImprovedTube #4364](https://github.com/code-charity/youtube/pull/4364)) | Limited evidence of benefit; do not copy a merged option without proving its value or interfere with player gestures. |
| Under Consideration | Persistent transcript highlights ([Glasp](https://glasp.co/pricing)), timestamp previews ([YouTube Enhancer](https://github.com/YouTube-Enhancer/extension/blob/main/README.md)), batch summaries ([NoteGPT](https://notegpt.io/pricing)), group notifications and dead-channel detection ([PocketTube](https://pockettube.io/)) | Add state, requests, or controls before the existing workflow is coherent. No present Astra report makes them Next work. |
| Under Consideration | Settings Sync lost updates (`extension/core/settings-sync.js`) and Firefox optional-data taxonomy ([Mozilla consent guidance](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)) | Sync needs a deterministic interleaving reproduction. Whether command-format handoff also counts as website activity needs a precise policy decision; do not claim a proven leak or deny explicit downloads through a generic gate. |
| Later validation in existing backlog | YouTube custom feeds and new AI/Shorts surfaces ([YouTube announcement, 2026-09-23](https://blog.youtube/news-and-events/made-on-youtube-viewer-custom-feeds-shopping-tools/)) | Product announcements do not establish DOM selectors. Existing blocked captures take precedence over new guessed filters. |
| Rejected | Remote plugin/script marketplace ([Nova](https://github.com/raingart/Nova-YouTube-extension/blob/master/README.md), [remote-code policy](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)) | Keep static local modules and signed data-only repairs. No remote executable extensions of the extension. |
| Rejected | Cloud settings accounts, shared family workspaces, public highlights ([RYS sync request](https://github.com/lawrencehook/remove-youtube-suggestions/issues/211), [Glasp](https://glasp.co/pricing)) | Multi-user identity and hosted persistence conflict with the current local-first product and lack Astra demand. Local export/import already supplies portability. |
| Rejected | P2P settings transfer ([FilterTube](https://github.com/varshneydevansh/FilterTube/blob/master/README.md)) | Its direct transfer does not inherently conflict with local-first design, but introduces device trust and profile complexity without Astra demand. |
| Rejected | Automatic LLM classifiers or DOM collection ([USENIX Security 2025 study](https://www.usenix.org/conference/usenixsecurity25/presentation/vekaria)) | Explicit assistant handoff is sufficient. The study supports caution about browser assistants, not a claim that Astra collects data that way. |
| Rejected | Mobile/Safari expansion, extra theme/locale counts, keyboard remapping (`README.md`, `extension/core/settings-schema.js`, `extension/_locales/`) | Unsupported breadth or a conflict with the no-new-hotkeys preference. Existing desktop behavior and the specific Sleep Timer translation gap come first. |
| Rejected | Full TUF client, new ad-block backend, protected-video archive ([TUF](https://theupdateframework.github.io/specification/latest/), [SingleFile](https://github.com/gildas-lormeau/SingleFile)) | Narrow freshness metadata and existing download boundaries solve the evidenced problems with less maintenance. Offline recovery stays bounded, not an unbounded stale cache. |
| Rejected | Blind dependency refresh, replacement manager harness, worker keepalive (`package-lock.json`, `scripts/smoke-userscript-managers.js`, [worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)) | Direct versions are current, SRI acceptance already has a harness, and workers are designed to terminate. Preserve state rather than evade lifecycle limits. |
| Rejected pending supported-floor benefit | Firefox 151/153-only APIs, platform-dependent document PiP, origin-trial Rewriter API ([Firefox 153](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153), [Rewriter API](https://developer.chrome.com/docs/ai/rewriter-api)) | Floors are Firefox 142/Chrome 120. Follow `docs/platform-api-adoption.md`: probe, retain a fallback, and adopt only when actual code can be removed. No framework rewrite follows from an [MV3 developer study](https://arxiv.org/abs/2507.13926). |

This disposition covers security, accessibility, observability, testing, documentation, packaging, migration, and upgrade work in the accepted plan; i18n in the retained Sleep Timer item; offline resilience in signed caches and Retry; and plugin, mobile, and multi-user breadth through explicit exclusions.

## Sources

### Direct projects and migration contracts

https://github.com/YouTube-Enhancer/extension/blob/main/README.md
https://github.com/YouTube-Enhancer/extension/releases/tag/v1.35.0
https://github.com/varshneydevansh/FilterTube/blob/master/js/io_manager.js
https://github.com/varshneydevansh/FilterTube/issues/79
https://github.com/amitbl/blocktube/blob/master/src/ui/options.js
https://github.com/825i/channelsieve/blob/master/CHANGES-FORK.md
https://github.com/zpix1/yt-anti-translate/blob/main/app/src/global.js
https://github.com/zpix1/yt-anti-translate/blob/main/app/src/background.js
https://github.com/zpix1/yt-anti-translate/issues/193
https://github.com/ajayyy/SponsorBlock/blob/master/README.md
https://github.com/ajayyy/DeArrow/issues/530
https://github.com/Anarios/return-youtube-dislike/blob/main/README.md
https://github.com/lawrencehook/remove-youtube-suggestions/releases/tag/v4.5.2
https://github.com/xlch88/YouTubeTweak/blob/main/FUNCTIONS.md
https://github.com/TimMacy/YouTubeAlchemy/blob/main/README.md
https://github.com/masteranza/weedout-for-youtube/blob/main/README.md
https://github.com/insin/control-panel-for-youtube/releases/tag/v1.37.2
https://github.com/insin/control-panel-for-youtube/releases/tag/v1.37.0
https://github.com/code-charity/youtube/pull/4364
https://github.com/ParticleCore/Iridium/blob/master/README.md
https://github.com/raingart/Nova-YouTube-extension/blob/master/README.md

### Commercial and adjacent products

https://pockettube.io/
https://github.com/NabokD/pockettube/issues/187
https://unhook.app/
https://www.mrfdev.com/how-to-use-enhancer-for-youtube
https://glasp.co/pricing
https://notegpt.io/pricing
https://eightify.app/
https://github.com/wallabag/wallabag
https://github.com/gildas-lormeau/SingleFile
https://www.zotero.org/support/kb/connector_permissions
https://github.com/refined-github/refined-github/blob/main/source/feature-manager.tsx

### Discovery and community

https://github.com/awesome-scripts/awesome-userscripts/blob/master/README.md
https://github.com/Vucko130/Awesome-Extensions/blob/master/README.md
https://www.reddit.com/r/youtube/comments/1oyezjm/3_musthave_features_for_managing_100_youtube/
https://www.reddit.com/r/youtube/comments/1x1nloc/defaulting_to_theatre_mode_on_desktop/
https://lobste.rs/s/7kjrtz/ublock_filter_list_hide_all_youtube
https://discourse.mozilla.org/t/field-report-shipping-an-mv3-youtube-extension-10-traps-the-docs-dont-tell-you/149259
https://stackoverflow.com/questions/79936448/how-can-i-make-youtube-iframe-api-seekto-calls-silent-without-setting-controls

### Platform, standards, and engineering

https://developer.chrome.com/docs/extensions/reference/manifest/incognito
https://developer.chrome.com/docs/extensions/reference/api/extension#property-inIncognitoContext
https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender
https://developer.chrome.com/docs/extensions/reference/api/cookies#type-CookieStore
https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/getAll
https://extensionworkshop.com/documentation/publish/add-on-policies/
https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
https://www.tampermonkey.net/documentation.php?locale=en&q=GM_info
https://violentmonkey.github.io/api/gm/#gm_info
https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
https://www.nngroup.com/articles/progressive-disclosure/
https://www.nngroup.com/articles/onboarding-tutorials/
https://theupdateframework.github.io/specification/latest/
https://theupdateframework.io/papers/survivable-key-compromise-ccs2010.pdf
https://csrc.nist.gov/pubs/sp/800/142/final
https://www.usenix.org/conference/usenixsecurity25/presentation/vekaria
https://arxiv.org/abs/2507.13926
https://blog.youtube/news-and-events/made-on-youtube-viewer-custom-feeds-shopping-tools/

### Dependencies and packaging

https://github.com/ahwayakchih/crx3/blob/master/CHANGELOG.md
https://github.com/acornjs/acorn/blob/master/acorn/CHANGELOG.md
https://eslint.org/blog/2026/10/eslint-v10.12.0-released/
https://github.com/mozilla/web-ext/releases/tag/10.7.0
https://github.com/websockets/ws/releases
https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p
https://github.com/websockets/ws/security/advisories/GHSA-58qx-3vcg-4xpx
https://github.com/advisories/GHSA-6chw-6frg-f759
https://github.com/advisories/GHSA-86w9-cpqp-85rv
https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/
https://cyclonedx.org/docs/1.5/json/
https://github.com/package-url/purl-spec/blob/main/PURL-TYPES.rst

## Open Questions

None blocks the Now/Next plan. Private/container isolation, enrolled side-panel comments, and manual screen-reader evidence are explicit acceptance work. They are not answered by the source review or the isolated Chromium inspection.
