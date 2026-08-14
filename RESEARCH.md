# Research — Astra Deck
Date: 2026-08-13 — replaces all prior research.

## Executive Summary

**Verified.** Astra Deck is a local-first, desktop YouTube enhancement system: an MV3 Chrome/Firefox extension, a generated Tampermonkey/Violentmonkey userscript, and an optional local Astra Downloader companion. Its strongest shape is broad feature coverage backed by source-derived settings, profile-split permissions, selector fixtures, local recovery, and no Astra telemetry server. The 2026-08-13 live pass made the highest-value “Now” work concrete: the extension blocks separable YouTube ad traffic before request with an enabled MV3 DNR ruleset, both vehicles collapse persistent ad shells, all 11 settings destinations have one coherent desktop command-deck treatment, and an isolated userscript artifact smoke caught and repaired two startup-stopping missing bindings plus an unreachable Video Hider pane. The next priorities are trust boundaries already evidenced in the roadmap: minimize cookie handoff, add upstream attribution, make remote lists and transcripts visibly fresh/recoverable, then invest in feature health and steady-state cost before adding novelty.

## Product Map

- **Core workflows:** transform YouTube watch/feed/player/chat surfaces; filter or annotate content; enrich videos through SponsorBlock, DeArrow, RYD, Reddit, thumbnails, and transcripts; research through notes, bookmarks, summaries, exports, and local transcript search; manage 468 settings through popup/sidepanel/sidebar with profiles, diagnostics, import/export, undo, and reset; hand explicit downloads to a local companion.
- **Personas:** privacy-conscious local-first YouTube users; power users who want granular playback, layout, and filtering controls; researchers who need transcript search, notes, citations, and exports; accessibility/focus users; desktop Firefox users who need the userscript or temporary unsigned extension path; self-hosters who accept the companion-capable profile.
- **Platforms and distribution:** Chrome/Edge/Brave MV3 at Chrome 120+, Firefox MV3 at Firefox 142+, and desktop userscript managers. Build profiles are `store-safe`, `chromium-store`, and `github-full`; the companion is a separate repository. The README explicitly excludes mobile browsers and YouTube Studio, and no CWS/AMO/Greasy Fork publication has been completed.
- **Data flows:** MAIN-world page bridges handle player/interception work; isolated runtime modules handle DOM and extension APIs; the service worker owns allowlisted cross-origin fetches, optional permissions, downloads, cookie access, and native messaging; `chrome.storage.local/session/sync`, page-origin IndexedDB, and exports hold local state; optional BYO-key providers and local Ollama receive data only on feature use. The privacy policy says there is no Astra server or automatic telemetry.

## Live Desktop Snapshot — 2026-08-13

- **Context:** authenticated, dark-theme YouTube in Codex's isolated browser at 1440×900; public extension acceptance used disposable Chrome/Edge profiles. No normal browser profile, credentials, account setting, consent control, or mutation endpoint was used. Routes inspected were `/`, `/feed/subscriptions`, `/results`, channel, watch, account playback, embed, Shorts index/item, live watch/chat, and YouTube Music. The isolated authenticated session was retained in the built-in browser profile.
- **Architecture/lifecycle — Verified:** desktop YouTube is a hydrated `ytd-app` SPA. `ytd-page-manager` retains hidden prior-route trees, and route work must key on `yt-navigate-start`, `yt-navigate-finish`, or `yt-page-data-updated`, not selector existence alone. This makes first-match queries a future risk when hidden prior-route nodes precede the active surface.
- **DOM contract — Verified:** current semantic hooks still cover the masthead/search, browse/feed cards, chips, Shorts, watch player and settings, related content, transcript, comments, live chat, embed, and YouTube Music surfaces. No selector-driven feature was proven dead on its correct route/state/lifecycle, and no native feature fully replaced an Astra behavior strongly enough to justify removal.
- **Data contract — Changed:** advertising is not only rendered markup. Cold home/watch loads without Astra produced `googleads.g.doubleclick.net/pagead/id`, `static.doubleclick.net/instream/ad_status.js`, and `www.google.com/pagead/lvz`; empty `#masthead-ad` and `#player-ads` shells were retained even when no creative was visible. First-party sponsored records were not observed as a separable response and therefore remain a render-suppression boundary, not a claimed network block.
- **Unverified:** mutation/account flows by policy; a paid video creative because the authenticated session showed no visible creative; userscript-manager-specific grants and pre-sandbox request timing; Firefox live rendering. These are not inferred from Chromium or fixture results.

## Advertising Map and Blocking Proof

| Placement | Live hook / request evidence | Timing and route | Implemented boundary |
|---|---|---|---|
| Masthead/display and reserved gap | `#masthead-ad`; `www.google.com/pagead/lvz`; DoubleClick page-ad traffic | Cold home/browse | Extension DNR blocks the separable request; `extension/early.css` collapses the shell at `document_start`. |
| Pre-roll/mid-roll/companion | `#player-ads`, `.video-ads`, `.ytp-ad-*`, companion renderers; `googleads.g.doubleclick.net/pagead/id`; `static.doubleclick.net/instream/ad_status.js` | Cold watch and SPA watch | DNR blocks ad domains plus narrow YouTube `/api/stats/ads`, `/ptracking`, and `/get_midroll_info`; persistent CSS suppresses late player/companion layers. Media hosts are explicitly excluded. |
| In-feed/native promoted records | `ytd-in-feed-ad-layout-renderer`, `ytd-ad-slot-renderer`, page-top/promoted/display/sparkles renderers | Browse/search/feed reinsertion | Persistent render suppression. No separable first-party transport was proven, so no zero-network claim is made for an inseparable browse payload. |
| Userscript vehicle | Same shell selectors | `document-start`, after manager sandbox starts | Persistent shell suppression only. The userscript explicitly tells users that only the extension can guarantee browser-level pre-request blocking. |

**Verified acceptance:** `scripts/check-zero-ad-rules.js` maps all three captured request shapes to one of five narrow static rules and rejects media-host coverage. `scripts/smoke-zero-ads-live.js` loaded the staged extension in isolated Microsoft Edge, confirmed `astra_zero_ads` enabled, observed 17 browser-level `BLOCKED_BY_CLIENT` outcomes and zero matching responses, collapsed every discovered shell on cold home plus a real SPA watch transition, retained masthead/search/player, and opened the redesigned settings panel on the live host. Screenshots are generated under `build/zero-ad-live-smoke/`.

## Settings and Desktop UX

- **Verified extension parity:** ImageGen-led references exist for Video Player, Playback, Comments, Watch Page, Content, Video Hider, Home / Subscriptions, Theme, Live Chat, Downloads, and Advanced under `outputs/astra-deck-settings-command-deck-*-v6.png`. The code-native panel renders every destination at 1440×900 dark/light and 1920×1080 dark; RTL is also exercised at 1440×900. The smoke rejects blank panes, clipped labels, overflow, missing focus/close targets, and an incomplete Video Hider mission header/summary dashboard.
- **Verified userscript repair:** `YTKit.user.js` referenced undefined `t` and `storageReadJSON`/`storageWriteJSON`, so current extracted factories aborted before initialization. It now supplies English fallback localization and a GM-backed storage bridge. Its complete Video Hider renderer had no navigation entry or mount call; it is now reachable and reports hidden videos, blocked channels, and active filters. Array-shaped select options previously rendered `[object Object]`; the renderer now normalizes object and array option forms.
- **Verified userscript parity:** `scripts/smoke-userscript-settings.js` executes the distributable userscript plus generated `@require` core in isolated Chrome and renders all 11 destinations at 1440×900 dark/light and 1920×1080 dark. It checks viewport bounds, horizontal overflow, clipping, blank panes, invalid select labels, and Video Hider structure. Manager-specific grants remain unverified.
- **Journey improvement:** settings now open into a high-density desktop workspace with an always-visible category map, full labels instead of ellipses, a header command search, explicit feature state, at-a-glance Video Hider counts, auto-save feedback, reset/import/export recovery, and consistent dark/light hierarchy. This reduces the prior “open a pane, then inspect four tabs to learn state” loop to one scan.

## Priority Tiers

- **Now — implemented and verified:** YouTube-only pre-request ad blocking, persistent ad-shell cleanup, full desktop settings visual pass, userscript bootstrap recovery, reachable Video Hider management, and artifact/live smoke coverage.
- **Next:** minimize/tab-bind authenticated cookie handoff; add SponsorBlock/DeArrow attribution; add remote-list provenance/last-known-good state; refresh expiring caption tracks with provenance; make feature health visible.
- **Later:** transcript byte budgeting, steady-state performance budgets, filter-before-render, original-thumbnail restoration, heatmap playback helpers, and scheduled focus windows.
- **Rejected:** general-web blocking, cloud accounts/sync, arbitrary plugins/remote code, mobile scope, and silent cloud-AI fallback because each conflicts with Astra's YouTube-only, local-first, desktop contract.

## Competitive Landscape

- **ImprovedTube** — broad playback, layout, filtering, shortcut, and theme coverage plus an active contributor/release loop. Learn from its documented feature breadth, translation/community workflow, tooltips, and response to YouTube churn. Avoid its recurring idle-CPU and breakage complaints; breadth without a steady-state budget becomes an uninstall reason. Sources: `https://github.com/code-charity/youtube`, `https://github.com/code-charity/youtube/releases`, `https://github.com/code-charity/youtube/issues/4109`.
- **BlockTube** — strong title/channel/ID/regex filtering, context-menu setup, and response/pre-render filtering. Learn from filtering before DOM render and from explaining why a result was blocked. Avoid copying its aging selector surface and open-issue burden; its 2026 enhancement queue still includes new-layout, category, and Firefox Android requests. Sources: `https://github.com/amitbl/blocktube`, `https://github.com/amitbl/blocktube/issues/304`, `https://addons.mozilla.org/en-US/firefox/addon/blocktube/`.
- **SponsorBlock** — a mature crowdsourced data product with aggressive YouTube release cadence, cache behavior, attribution expectations, and a demonstrated `use_dynamic_url` mitigation. Learn the importance of upstream attribution, bounded stale-cache behavior, and release-time security fixes. Avoid treating upstream API/database licensing as incidental. Sources: `https://github.com/ajayyy/SponsorBlock`, `https://github.com/ajayyy/SponsorBlock/releases`, `https://raw.githubusercontent.com/wiki/ajayyy/SponsorBlock/Database-and-API-License.md`.
- **DeArrow** — community title/thumbnail corrections with emergency releases following YouTube DOM changes. Learn to preserve a verified fallback, expose cache age, and keep selector updates fast. Avoid shipping upstream data without the required attribution. Sources: `https://github.com/ajayyy/DeArrow`, `https://github.com/ajayyy/DeArrow/releases`, `https://gist.github.com/ajayyy/4b27dfc66e33941a45aeaadccb51de71`.
- **Return YouTube Dislike** — a focused API-backed restoration product whose payload exposes raw sample counts alongside extrapolated counts. Learn to show confidence, not only a generic “estimated” label. Avoid making a low-sample estimate look authoritative or depending on an unbounded remote service. Sources: `https://github.com/Anarios/return-youtube-dislike`, `https://returnyoutubedislike.com/docs`.
- **Enhancer for YouTube** — commercial-grade playback controls, speed/quality/volume, mini-player, shortcuts, codecs, and appearance settings. Learn the parity baseline for playback and its clear consumer-facing affordances. Avoid opaque behavior and permission expansion; Firefox reviews show that speed/quality controls and refresh behavior are judged by users at every YouTube change. Sources: `https://www.mrfdev.com/enhancer-for-youtube`, `https://addons.mozilla.org/en-CA/firefox/addon/enhancer-for-youtube/reviews/`.
- **Unhook** — a focused distraction-removal product with a large installed base. Learn the value of safe presets and a narrow promise. Avoid hiding content without a visible explanation, recovery route, or per-feature status. Source: `https://unhook.app/`.
- **Glasp and Readwise Reader** — transcript capture, timestamped highlights, notes, spaced review, multi-model summaries, and Markdown/HTML/CSV/JSON or Obsidian/Notion export. Learn the research workflow and structured export shape. Intentionally avoid account/cloud dependence and default cloud AI because Astra Deck’s local-first promise is a product constraint. Sources: `https://glasp.co/youtube-summary`, `https://readwise.io/read`.
- **Jump Cutter and Global Speed** — subtitle-aware skipping, time-saved feedback, per-tab controls, and cross-site playback/rate tooling. Learn to scope playback state per tab/video and make time saved measurable. Avoid making a global observer/timer loop the default cost. Sources: `https://github.com/WofWca/jumpcutter`, `https://github.com/polywock/globalSpeed`.
- **YouTube-No-Translation** — original-language titles, audio, captions, chapters, and thumbnails across desktop/mobile variants, with frequent robustness releases. Learn the missing original-thumbnail fallback and language-specific edge cases. Avoid broadening Astra Deck’s platform promise to mobile without a real test/permission contract. Source: `https://github.com/YouG-o/YouTube-No-Translation`.
- **uBlock Origin** — an adjacent filter engine with explicit list age, update, purge, third-party source, bad-list, duplicate, and breakage semantics. Learn to surface source, freshness, out-of-date state, and last-known-good data for Astra’s optional remote Video Hider lists. Avoid expanding Astra Deck into a general web blocker. Source: `https://github.com/gorhill/uBlock/wiki/Dashboard:-Filter-lists`.
- **uBlock Origin Lite** — demonstrates the MV3-native shape Astra needs for its narrower promise: static declarative rules are evaluated by the browser without a permanently running blocker process. Learn the pre-request boundary and keep rules narrow, reviewable, and media-safe. Avoid implying full uBO equivalence; Astra carries five YouTube-specific rules, not a general filter engine. Sources: `https://github.com/uBlockOrigin/uBOL-home`, `https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest`.
- **Violentmonkey and YouTube.js** — stable userscript distribution and a maintained InnerTube/client abstraction. Learn to publish one reproducible generated core, keep dependency boundaries explicit, and isolate YouTube protocol churn. Avoid runtime remote code or making a userscript’s installability depend on an unpublished placeholder. Sources: `https://github.com/violentmonkey/violentmonkey`, `https://github.com/LuanRT/YouTube.js`.

## Security, Privacy, and Reliability

- **[Verified, repaired] The distributable userscript could not start.** Isolated execution of `YTKit-core.user.js` followed by `YTKit.user.js` stopped first at the undefined localization binding `t`, then at undefined `storageReadJSON`/`storageWriteJSON` bindings used by extracted feature factories. Source syntax and size gates could not detect that runtime failure. The userscript now supplies explicit English fallback localization and GM-backed storage adapters, and a real-artifact smoke proves `window.ytkit` plus every settings page initializes.
- **[Verified, new] Cookie transfer is identity-gated but over-broad.** `extension/background.js:1550-1573` returns every cookie under `.youtube.com`; `extension/features/download-ui/index.js:1516-1540` sends the complete list to the companion after native identity verification. Sender validation is present, but the background handler does not itself require a short-lived download capability or a cookie-name allowlist. The privacy policy and store checklist correctly classify cookies as authentication information, and Chrome’s security guidance says privileged messages from content scripts must be treated as attacker-controlled and sensitive data must not be sent back to pages. The implementation should minimize the protocol and add in-product disclosure before the first cookie-bearing handoff.
- **[Verified, new] Remote filter-list state can silently age.** `extension/features/video-hider/index.js:57-657` constrains an optional HTTPS list to 1 MiB, a versioned data-only schema, and no fetched predicate code, which is a good boundary. It stores only URL, attempted/fetched timestamps, rules, and an error; after failure it retains the previous rules, and `popup.html:356-375` reports only “refreshed” or “no remote list configured.” There is no displayed source age, content hash, validator/ETag state, stale status, or last-known-good explanation. uBlock’s list UI demonstrates why age/out-of-date/purge semantics matter even for trusted user-selected data.
- **[Verified, new] Transcript URLs are expiring credentials to YouTube’s caption endpoint.** `extension/core/transcript-service.js:179-503` has five source fallbacks and two response formats, but a failed `timedtext` fetch only moves to another format/source; it does not parse the URL’s `expire` parameter, refresh a stale player response, or return source/age/expiry metadata. The URL shape and limited lifetime are documented in the caption implementation discussion at `https://stackoverflow.com/questions/78081057/how-can-i-download-youtube-captions-using-javascript`. This matters because `researchTranscriptIndex` persists up to 1,000 records in page-origin IndexedDB and currently records only `videoId/title/text/searchTerms/indexedAt`.
- **[Verified, new] Transcript persistence is bounded by count, not bytes.** `extension/core/transcript-index.js:7-18` caps one record at 200,000 characters; `extension/ytkit.js:45563-45564` caps the store at 1,000 records and uses a 2 MiB migration chunk. The popup’s storage card measures `chrome.storage.local` only (`extension/popup.js:2011-2055`), and `storageQuotaLRU` prunes selected top-level storage stores but not the transcript IndexedDB. Chrome documents 10 MiB for `storage.session`, approximately 100 KiB for sync, and immediate failures on quota violations; `navigator.storage.estimate()` can expose page-origin usage but its values are approximate. A user can therefore see a healthy extension-storage number while the research index is the dominant local store.
- **[Verified, strength] Existing boundary defenses are substantial.** `background.js` validates extension senders, allowlists origins and redirects, strips credential-bearing headers except for explicitly permitted origins, caps response bytes/time, and blocks arbitrary Cobalt/remote redirects. `core/trusted-html.js`, the no-eval gate, redacted diagnostics, native-first companion token, schema validation, export credential scrub, and reset/undo snapshots are aligned with Chrome and Firefox extension security guidance.
- **[Verified, existing roadmap] Permission, provenance, and dependency gaps remain.** The Firefox data-consent manifest is hard-coded too broadly; the Chromium-store profile removes capabilities but still inherits the wrong consent classification. The development dependency graph contains the two `image-size` advisories currently excepted by policy. SponsorBlock/DeArrow attribution is absent. These are already actionable P1 items and should remain ahead of novelty.
- **Recovery requirements:** every remote list must preserve a last-known-good copy and an explicit stale/error state; transcript refresh must never reuse a different video’s player response and must label cached text as stale; transcript-index eviction must be deterministic and exportable; cookie handoff must be denied on failed identity/protocol checks; release promotion must dereference active and rollback assets and compare recorded digests. Existing settings/import/reset and companion binary rollback patterns are useful templates.

## Architecture Assessment

- **Runtime graph:** `extension/runtime-core-loader.mjs`, `runtime-bootstrap.js`, and `ytkit.js` still mix a split module graph with a compatibility monolith, but the dependency-ready handoff now loads peeled factories before the monolith constructs its feature array and the runtime resource catalogue uses dynamic URLs. The remaining risk is vehicle drift: the userscript is separately authored and its startup failures were invisible until the new artifact smoke executed both distributables together.
- **Data boundaries:** `extension/core/data-flow.js` is a useful origin catalogue and `background.js` is the correct owner for network/cookie/native privileges. Remote list metadata, transcript source metadata, and cookie capability proofs should be added there rather than recreated in individual feature modules. Keep predicates and remote filter payloads data-only; do not introduce a plugin or remote-code loader.
- **Persistence boundaries:** `chrome.storage.local`, extension IndexedDB, page-origin transcript IndexedDB, session recovery, and exported backup domains are separately implemented. The persisted-domain catalogue is a good migration seam, but storage health needs a cross-area view and transcript-specific byte/age policy. The count-based LRU should not be treated as a quota guarantee.
- **UI boundaries:** popup and sidepanel contain diagnostics, storage, permission, and schema controls; the Firefox sidebar clones sidepanel markup. `surface-system.css`, `popup.css`, and `sidepanel.css` duplicate token/focus systems. Current headless coverage checks dark/light/forced-colors, 200% overflow, and RTL on sidepanel/sidebar, but not all locales or all primary surfaces at a 320 CSS-pixel reflow width. WCAG 2.2 SC 1.4.10 requires non-exempt content to reflow without two-dimensional scrolling at 320 CSS pixels.
- **Testing gaps:** static and fixture coverage is dense, and this pass adds real-artifact userscript rendering plus live staged-extension DNR/settings verification. Remaining high-value integration gaps are cookie filtering, remote-list stale/rollback states, transcript expiry/SPA refresh, transcript storage pressure, all-locale reflow, Firefox live rendering, and userscript-manager grant behavior.
- **Observability and offline resilience:** selector health, feature health snapshots, the local diagnostic ring, import/reset rollback, and local-first storage are strong primitives, but they are split across popup/sidepanel surfaces. The roadmap’s unified feature-health item, remote-list last-known-good semantics, and transcript byte budget are the evidence-backed path; hosted telemetry or cloud sync would contradict the current privacy model.
- **Upgrade and migration strategy:** settings imports already carry schema-version migrations and release channels record active/rollback artifacts. The v4.60.1 no-CRX set is locally ready, while tag publication and channel promotion remain operator-gated in `Roadmap_Blocked.md`; no auto-update claim should be made until those external steps and post-upload digest verification complete.
- **Documentation and distribution:** `docs/architecture.md` and `CONTRIBUTING.md` describe the intended split, while `HARDENING.md` remains stale to v4.46.0. The userscript `@require` now resolves to the published raw core, but no Greasy Fork/CWS/AMO publication is authorized in this pass. The ZIP builder stages files and creates archives with platform tools but does not make archive timestamps byte-reproducible; do not claim reproducible artifacts until the packaging item is implemented.
- **Verification at 2026-08-13:** before this pass, `npm test` produced 1,649 passes and one failure in the pre-existing uncommitted changed-settings test at `tests/hardening.test.js:8347`; the final tree produces 1,652 passes and that same sole failure across 1,653 tests. Lint, i18n, accessibility, contrast, dependency, Firefox package validation, all three no-CRX profiles, the split userscript, both settings smokes, and the live zero-ad smoke pass. The startup budget remains non-green under current machine load (99.15 ms first-feature-paint median versus an 88.80 ms limit), but an isolated clean `dfdc0534` copy reproduced 98.90 ms, so the pass did not introduce that overrun and the baseline was not loosened.

## Rejected Ideas

- **Mobile/native mobile client:** rejected for this roadmap; the README explicitly limits the product to desktop YouTube/desktop userscripts, while Flow and YouTube-No-Translation show that mobile is a separate platform and permission/test contract. Source: `https://github.com/A-EDev/Flow`, `https://github.com/YouG-o/YouTube-No-Translation`.
- **Cloud account, cross-device settings, or hosted transcript sync:** rejected for now; Readwise/Glasp prove the value, but Astra Deck’s privacy policy, no-server architecture, local exports, and no-account philosophy make it a product change rather than a missing local feature. Sources: `https://readwise.io/read`, `https://glasp.co/youtube-summary`.
- **Multi-user/shared workspaces:** rejected for this roadmap; the repository defines local browser storage, local exports, and no Astra account/server, so collaboration would require a new identity, synchronization, conflict-resolution, and privacy contract rather than a contained extension feature. Sources: `docs/privacy-policy.md`, `docs/architecture.md`.
- **General-purpose plugin marketplace or arbitrary remote scripts:** rejected; it would widen the existing WARS, content-script, permissions, and supply-chain attack surface and conflict with Chrome/Firefox remote-code restrictions. Keep selector/filter inputs versioned and data-only. Sources: `https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure`, `https://extensionworkshop.com/documentation/publish/add-on-policies/`.
- **Full-web ad blocking:** rejected; uBlock Origin is the mature adjacent product, while Astra Deck’s declared purpose and permissions are YouTube enhancement. Adding a general blocker would expand scope and review risk without strengthening the core workflows. Source: `https://github.com/gorhill/uBlock`.
- **Default cloud AI or silent provider switching:** rejected; current local browser AI, Ollama, and explicit BYO-key lanes are a coherent privacy contract. A hidden fallback to a remote provider would contradict the capability matrix and privacy policy. Sources: `build/browser-capability-matrix.json`, `docs/privacy-policy.md`, `https://developer.chrome.com/docs/webstore/program-policies/user-data-faq`.
- **Remote-code userscript/plugin execution:** rejected; the current data-only remote filter design is the safe boundary. Remote code would be incompatible with MV3/AMO policy and make generated artifacts non-auditable. Sources: `https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure`, `https://extensionworkshop.com/documentation/publish/add-on-policies/`.

## Sources

### OSS competitors and adjacent projects

- https://github.com/code-charity/youtube
- https://github.com/code-charity/youtube/releases
- https://github.com/code-charity/youtube/issues/4109
- https://github.com/amitbl/blocktube
- https://github.com/amitbl/blocktube/issues/304
- https://addons.mozilla.org/en-US/firefox/addon/blocktube/
- https://github.com/ajayyy/SponsorBlock
- https://github.com/ajayyy/SponsorBlock/releases
- https://github.com/ajayyy/DeArrow
- https://github.com/ajayyy/DeArrow/releases
- https://github.com/Anarios/return-youtube-dislike
- https://returnyoutubedislike.com/docs
- https://github.com/ParticleCore/Iridium
- https://github.com/YouTube-Enhancer/extension
- https://github.com/WofWca/jumpcutter
- https://github.com/polywock/globalSpeed
- https://github.com/YouG-o/YouTube-No-Translation
- https://github.com/lawrencehook/remove-youtube-suggestions
- https://github.com/LuanRT/YouTube.js
- https://github.com/gorhill/uBlock
- https://github.com/uBlockOrigin/uBOL-home
- https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-%28FAQ%29
- https://github.com/gorhill/uBlock/wiki/Dashboard:-Filter-lists
- https://github.com/violentmonkey/violentmonkey
- https://github.com/libredirect/browser_extension
- https://github.com/A-EDev/Flow
- https://github.com/awesome-soft/awesome-chrome-extensions
- https://github.com/runningcheese/Awesome-Userscripts
- https://github.com/iv-org/invidious/pull/5922
- https://github.com/TeamNewPipe/NewPipeExtractor/pull/1503

### Commercial products and market signals

- https://www.mrfdev.com/enhancer-for-youtube
- https://addons.mozilla.org/en-CA/firefox/addon/enhancer-for-youtube/reviews/
- https://unhook.app/
- https://addons.mozilla.org/en-US/firefox/addon/youtube-addon/
- https://glasp.co/youtube-summary
- https://readwise.io/read
- https://jump.watch/
- https://tubenotes.net/
- https://keepframe.one/
- https://boltbrief.com/en/
- https://youreaderapp.com/

### Community and implementation discussions

- https://news.ycombinator.com/item?id=41222577
- https://news.ycombinator.com/item?id=36273890
- https://news.ycombinator.com/item?id=47786791
- https://stackoverflow.com/questions/61732313/content-script-running-mutationobserver-conflicting-with-youtube
- https://stackoverflow.com/questions/57381120/what-is-the-best-current-way-to-get-youtube-captions-from-api
- https://stackoverflow.com/questions/64606533/how-to-get-youtube-transcript-url-with-chrome-dev-tools
- https://stackoverflow.com/questions/46864428/how-do-some-sites-download-youtube-captions
- https://stackoverflow.com/questions/78081057/how-can-i-download-youtube-captions-using-javascript
- https://stackoverflow.com/questions/63049859/flutter-checking-if-closed-captions-are-available-on-youtube-video

### Standards, platform APIs, and accessibility

- https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/reference/api/runtime
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/userScripts
- https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
- https://developer.chrome.com/docs/extensions/how-to/test/puppeteer
- https://developer.chrome.com/blog/new-in-chrome-151
- https://developer.chrome.com/blog/chrome-152-beta
- https://developer.chrome.com/blog/chrome-userscript?hl=en
- https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://extensionworkshop.com/documentation/publish/add-on-policies/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/declarative_net_request
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/RuleCondition
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html

### Security, research, and dependency health

- https://arxiv.org/abs/2406.12710
- https://doi.org/10.1145/3589334.3645683
- https://www.usenix.org/conference/usenixsecurity24/presentation/xie-qinge
- https://arxiv.org/abs/2503.04292
- https://arxiv.org/abs/1808.07359
- https://www.usenix.org/system/files/sec21-laperdrix.pdf
- https://research.google/pubs/assessing-web-fingerprinting-risk/
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/minimize-page-load-time-impact
- https://developer.chrome.com/blog/third-party-scripts?hl=en
- https://arxiv.org/abs/2201.11709
- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
- https://github.com/web-ext/web-ext
- https://github.com/eslint/eslint/releases
- https://github.com/websockets/ws
- https://www.npmjs.com/package/crx3
- https://nvd.nist.gov/vuln/detail/CVE-2026-16415
- https://nvd.nist.gov/vuln/detail/CVE-2026-28395
- https://github.com/imputnet/cobalt/blob/main/docs/api.md
- https://raw.githubusercontent.com/wiki/ajayyy/SponsorBlock/Database-and-API-License.md
- https://gist.github.com/ajayyy/4b27dfc66e33941a45aeaadccb51de71

## Open Questions

- **Needs external protocol coordination:** which minimum YouTube cookie names, domains, partitions, and maximum payload does the released Astra Downloader accept, and can it advertise that contract with a protocol version?
- **Needs live validation:** Firefox extension rendering, userscript-manager grants/pre-sandbox request behavior, a real cookie-bearing companion handoff, and account-specific transcript/download edge states were not exercised. Authenticated Chromium desktop routes and isolated distributable rendering were exercised on 2026-08-13.
- **Needs operator decision/credentials:** which of Greasy Fork, Chrome Web Store, and AMO will be published first, and who owns the signing/listing accounts for the profile-specific artifacts? The implementation plan can make artifacts truthful without assuming publication authority.
