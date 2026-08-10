# Research — Astra Deck

Date: 2026-08-08 — replaces all prior research.

## Executive Summary

Astra Deck is a local-first MV3 YouTube enhancement extension with a generated
userscript artifact, broad playback/filtering/diagnostics features, and a
companion downloader that now lives in a separate repository. The current
engineering baseline is strong, but the highest-value work is containment:
reduce the always-injected surface, make browser capability differences
explicit, prevent duplicate lifecycle state, expose external-data freshness
and privacy, and make bad releases reversible. The production dependency audit
is clean; the full verification gate is not, because the Firefox tooling chain
pulls in two high-severity, unpatched image-size advisories.

Prioritized opportunities from this pass:

1. P1 — Restore a clean dependency-security gate for Firefox tooling.
2. P1 — Maintain a browser capability matrix and fallback contract.
3. P1 — Prove idempotent injection across SPA navigation and extension updates.
4. P2 — Make external enrichment provenance and rate limits visible.
5. P2 — Add rollback-safe release channels and artifact health checks.

The active roadmap already contains the major feature opportunities found in
the ecosystem: lazy injection and real-page benchmarking, explainable hiding,
SponsorBlock/DeArrow fallback, title provenance, flash mitigation, local AI,
live latency, AI/slop filtering, community filter lists, timestamp highlights,
data-usage estimates, Shorts dislikes, sponsored-content filtering, Watch
Later, selector assets, Greasy Fork, store-safe Chromium, Firefox manifests,
platform APIs, i18n, light theme, rendered a11y, settings diffs, and
companion-split cleanup. Those items were not duplicated.

## Product Map

### Core workflows

- Watch YouTube with playback, audio, quality, subtitle, layout, ad, segment,
  sponsor, dislike, title, comment, and recommendation controls.
- Filter or annotate cards, Shorts, comments, descriptions, channels, and
  search/feed content using local settings and selector-aware feature modules.
- Use popup, sidepanel, settings, diagnostics, import/export, and bounded bulk
  actions to configure and repair the experience.
- Generate a userscript with a deliberately smaller parity boundary, or use
  the separate AstraDownloader companion for download workflows.

### Personas

- Privacy-conscious viewers who prefer local storage and local processing.
- Power users who need fine-grained YouTube controls and reversible filtering.
- Users who need transcript, highlight, playback, accessibility, or
  distraction-reduction workflows without a hosted account.
- Advanced users who can install a userscript or self-distributed Firefox
  artifact and diagnose browser/permission differences.

### Platforms and distribution

README.md documents full Chrome/Edge/Brave support, Firefox self-distribution
with Release/Beta limitations, Chrome/Firefox userscripts, limited Safari
support, and no supported mobile, YouTube Music, Studio, or embedded-player
target. The manifest is MV3 and includes popup, sidepanel, live-chat, MAIN and
ISOLATED content paths, optional loopback integrations, and web-accessible
assets.

### Integrations and data flows

The manifest and local adapters cover YouTube, SponsorBlock, Return YouTube
Dislike, Reddit, AI endpoints, Cobalt, Ollama, and the separate companion's
loopback ports. Data is primarily local, but third-party enrichment can send
video identifiers or request metadata. That boundary needs visible source,
cache-age, opt-out, and failure state.

## Competitive Landscape

### ImprovedTube

[ImprovedTube](https://github.com/code-charity/youtube/pulls) shows the
maintenance cost of a large YouTube DOM surface: active fixes repeatedly
address Firefox, layout, selectors, comments, autoplay, and newly moved
controls. Learn: keep selector health and release containment first-class.
Avoid: allowing feature breadth to hide a fragile lifecycle or unmeasured
steady-state cost.

### SponsorBlock and Return YouTube Dislike

[SponsorBlock](https://github.com/ajayyy/SponsorBlock) and its
[API/database documentation](https://github.com/ajayyy/SponsorBlock/wiki)
validate crowdsourced, cacheable enrichment. [Return YouTube
Dislike](https://github.com/Anarios/return-youtube-dislike) validates demand
for community estimates, while its [privacy
discussion](https://github.com/Anarios/return-youtube-dislike/issues/344)
shows that endpoint use is part of the trust model. Learn: expose source and
freshness. Avoid: silent third-party failure or opaque identifier sharing.

### BlockTube

[BlockTube](https://github.com/amitbl/blocktube) demonstrates early hiding,
channel/title/comment filters, regex rules, and reversible user control.
Learn: show why a card was hidden and keep rules local. Avoid: a rule language
whose cost and failure modes are not bounded.

### FilterTube

[FilterTube](https://github.com/varshneydevansh/FilterTube) combines local
keyword/channel/Shorts/comment rules with profile-oriented controls, and its
recent fix history calls out duplicate runtime injection. Learn: treat
idempotency as a product reliability property. Avoid: assuming one bootstrap
per tab in a long-lived SPA.

### Control Panel for YouTube and YouTube Enhancer

[Control Panel for YouTube](https://github.com/insin/control-panel-for-youtube)
and [YouTube Enhancer](https://github.com/YouTube-Enhancer/extension) show the
table stakes for configurable playback, layout, and localisation. Their issue
and release histories also show recurring breakage after YouTube layout
changes. Learn: maintain a small, testable boundary around each feature.
Avoid: copying every adjacent toggle into the always-on path.

### ZeroDelay and TubeSize

[ZeroDelay](https://github.com/joaogfc/ZeroDelay) makes live-stream latency
visible and actionable. [TubeSize](https://github.com/MohamedSayed0573/TubeSize_Extension)
turns quality choice into a data-usage estimate. Learn: put the metric beside
the decision, not in a separate dashboard. These signals already support
Astra's active latency and data-usage rows.

### Glasp and Readwise Reader

[Glasp](https://glasp.co/pricing) and [Readwise
Reader](https://readwise.io/pricing/reader) package transcript/highlight/export
workflows and offline/cache behaviour as paid value. [Readwise
documentation](https://docs.readwise.io/reader/docs) reinforces the demand for
cross-format capture and sync. Learn: make timestamped export useful and
portable. Avoid: introducing a hosted account or subscription requirement
against Astra's local-first philosophy.

### Invidious and YouTubeAlchemy

[Invidious](https://github.com/iv-org/invidious/blob/master/README.md) shows
the privacy value of an alternate frontend, while
[YouTubeAlchemy](https://github.com/TimMacy/YouTubeAlchemy) shows how a broad
userscript can combine transcript, chapters, playback, and Watch Later.
Learn: preserve local, exportable workflows. Avoid: changing Astra into a
separate frontend or duplicating the downloader product.

## Security, Privacy, and Reliability

### Verified repository risks

- The current generated content surface is approximately 96 files and
  4,978,068 bytes; extension/ytkit.js is approximately 2,901,388 bytes. A
  large document-injected surface amplifies parse, observer, listener, and
  update-state risk.
- npm test passes 1,481 tests. npm run build passes and produces Chrome and
  Firefox artifacts. npm run check passes its earlier gates but fails at the
  full development audit.
- The failing graph is web-ext 10.6.0 → addons-linter 10.10.0 →
  image-size 2.0.2. The [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
  and [JXL/HEIF advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
  both report high-severity infinite-loop conditions and no patched
  image-size version. npm audit fix --force proposes a breaking web-ext
  5.5.0 downgrade. Production-only audit is clean.
- The manifest has broad optional integrations and loopback origins. Each
  external adapter needs an explicit permission, opt-out, timeout, cache,
  retry, and user-visible status contract.
- Chrome documents that unregistering a content script does not remove code
  already injected into a page
  ([scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)).
  Update and SPA-navigation tests must therefore prove idempotency rather than
  relying on unregister alone.

### Missing guardrails

- A browser capability matrix is missing for Chrome-only APIs, conditional
  built-in AI, userScripts, optional permissions, and Firefox execution-world
  or timing differences. See [Chrome built-in AI
  APIs](https://developer.chrome.com/docs/ai/built-in-apis),
  [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts),
  [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions),
  and [Firefox content
  scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).
- External enrichment does not consistently expose source, age, stale state,
  rate-limit cooldown, or privacy-sensitive request scope.
- Selector updates need promotion health and rollback around the active
  hot-updatable selector-asset roadmap item. [uBlock's filter-list
  state](https://github.com/gorhill/uBlock/wiki/Dashboard%3A-Filter-lists/b902569784469ad2bf326efb82d9fd3f92f2fe8d)
  and [Firefox's update-link/hash
  model](https://extensionworkshop.com/documentation/manage/updating-your-extension/)
  are useful adjacent patterns.
- Photosensitive mitigation must use the [WCAG three-flashes-or-below
  threshold](https://w3c.github.io/wcag/understanding/three-flashes-or-below-threshold.html)
  and frame-oriented evidence such as
  [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
  This supports the existing flash item; it is not a new row.

### Recovery needs

Every release channel needs a last-known-good artifact, digest/version
identity, selector-pack parse check, startup budget, and a reversible
promotion decision. Firefox self-distribution specifically documents an HTTPS
update manifest with an update link and hash
([self-distribution](https://extensionworkshop.com/documentation/publish/self-distribution/);
[updating](https://extensionworkshop.com/documentation/manage/updating-your-extension/)).

## Architecture Assessment

### Boundaries and refactor candidates

- The manifest and extension/ytkit.js currently combine a large injected
  surface with peeled feature modules. The existing P1 lazy-injection item is
  the correct root-cause refactor; its acceptance should include observer and
  listener budgets, not only byte count.
- extension/core/registry.js, extension/core/feature-lifecycle.js,
  extension/core/capability-probe.js, and navigation/update fixtures are the
  natural boundary for idempotency and capability contracts.
- extension/core/selector-packs/, selectors.js, selector-health.js, and
  background.js are the natural boundary for signed rule assets, staged
  promotion, parse failure, and rollback.
- External service adapters and cache metadata should own provenance rather
  than making popup or feature code infer freshness from response shape.
- The generated userscript must remain a separate artifact contract. [Greasy
  Fork's code rules](https://greasyfork.org/en/help/code-rules) cap scripts at
  2 MB, prohibit minification as a size escape, and constrain remotely hosted
  executable code.

### Test, observability, and documentation gaps

- The existing startup baseline is synthetic: scripts/startup-performance-
  baseline.json reports a fixture rather than a real YouTube watch/feed
  session. The active roadmap already owns real-page and steady-state
  measurement.
- Static i18n, light-theme, overlay-a11y, and contrast gates are useful
  ratchets but do not replace rendered output. The active P3 rendered-a11y
  item owns that gap; current check output records 1,604 grandfathered
  English literals and 277 accepted light-theme-blind surfaces.
- The current checks report 159/270 feature-ID parity and 45 byte-identical
  userscript modules. Preserve those measurements while splitting artifacts.
- Release manifests, SBOMs, digests, and Firefox validation already exist.
  The new rollback item should compose them rather than add a second release
  identity system.
- Dependency changelog review found no safe reason to add a new runtime
  dependency. The direct crx3 and ws packages, ESLint 10.6.0 release, and
  Node release schedule should remain under routine maintenance review; the
  actionable current issue is the transitive Firefox-tooling audit failure.
  See the dependency URLs in Sources.

## Category Coverage

- Security and privacy: development-toolchain advisories, broad optional
  origins, external identifiers, MV3 remote-code policy, and data-collection
  guidance are covered.
- Reliability and testing: startup/steady-state, idempotent injection,
  capability branches, cache failures, release health, and rollback are
  covered by existing or new items.
- Accessibility and i18n/l10n: the active rendered-a11y, contrast, flash,
  light-theme, and English-literal debt rows remain the owners; no duplicate
  rows were added.
- Observability and docs: provenance/diagnostics and release health are new;
  README support boundaries and existing release documentation are touched
  where acceptance requires it.
- Distribution, packaging, userscripts, and upgrade strategy: Greasy Fork,
  store-safe Chromium, Firefox manifests, artifact digests, and rollback are
  covered. [Awesome-WebExtensions](https://github.com/fregante/Awesome-WebExtensions)
  was checked for testing, code-splitting, and publishing patterns; the
  repository already has equivalent local gates and scripts.
- Mobile: README explicitly excludes mobile and no credible evidence justified
  a native/mobile branch in this pass.
- Offline/resilience: local storage, cache age, external failure, and
  rollback are covered; hosted sync is not assumed.
- Multi-user: no evidence justified accounts, team sharing, or a server-side
  collaboration model for a local-first single-browser extension.
- Migration: the companion split and stale references are already tracked in
  the active roadmap; no second migration item was added.
- Plugin ecosystem: the userscript and selector/filter asset boundaries are
  covered; a general plugin marketplace would expand the attack surface
  without evidence of demand.

## Rejected Ideas

- Hosted AI summarisation or a required account: conflicts with the local-first
  boundary; [Glasp](https://glasp.co/pricing) and [Readwise
  Reader](https://readwise.io/pricing/reader) validate the market but not the
  fit.
- A separate Invidious-style frontend: [Invidious](https://github.com/iv-org/invidious/blob/master/README.md)
  is a different product architecture and would multiply hosting/parser risk.
- A new downloader or companion integration: the companion already has its
  own repository and roadmap; extending Astra would recreate the split.
- A new AI-label row: [YouTube's disclosure
  guidance](https://support.google.com/youtube/answer/14328491?hl=en-ca) says
  labels are conditional, while the active local AI/slop row already owns
  uncertainty and filtering.
- A separate data-usage, latency, flash, timestamp-highlight, Watch Later,
  Greasy Fork, store-build, Firefox-update, or platform-API row: each is
  already active and supported by the adjacent sources above.
- Multi-user cloud sync, native mobile clients, and a plugin marketplace:
  there is no repository or community evidence strong enough to justify the
  privacy, permission, and maintenance expansion.

## Sources

### Project and open-source competitors

https://github.com/SysAdminDoc/Astra-Deck

https://github.com/SysAdminDoc/AstraDownloader

https://github.com/code-charity/youtube/pulls

https://github.com/ajayyy/SponsorBlock

https://github.com/ajayyy/SponsorBlock/wiki

https://github.com/Anarios/return-youtube-dislike

https://github.com/Anarios/return-youtube-dislike/issues/344

https://github.com/amitbl/blocktube

https://github.com/insin/control-panel-for-youtube

https://github.com/ParticleCore/Iridium

https://github.com/YouTube-Enhancer/extension

https://github.com/joaogfc/ZeroDelay

https://github.com/MohamedSayed0573/TubeSize_Extension

https://github.com/BMHeades/combatslop-yt

https://github.com/varshneydevansh/FilterTube

https://github.com/iv-org/invidious/blob/master/README.md

https://github.com/TimMacy/YouTubeAlchemy

### Commercial, community, and user-control research

https://glasp.co/pricing

https://readwise.io/pricing/reader

https://docs.readwise.io/reader/docs

https://news.ycombinator.com/item?id=47422288

https://news.ycombinator.com/item?id=42398807

https://www.reddit.com/r/youtube/comments/1ufnuit/someone_seriously_needs_to_make_an_extension_that/

https://addons.mozilla.org/en-US/firefox/addon/regretsreporter/

https://www.mozillafoundation.org/en/research/library/user-controls/

### Awesome lists and userscript ecosystem

https://github.com/fregante/Awesome-WebExtensions

https://greasyfork.org/en/help/code-rules

### YouTube, browser, and platform documentation

https://support.google.com/youtube/answer/14106294?co=GENIE.Platform%3DDesktop&hl=en-EN

https://blog.youtube/creator-and-artist-stories/youtube-auto-dubbing-explained/

https://support.google.com/youtube/answer/14328491?hl=en-ca

https://blog.youtube/news-and-events/improving-ai-labels-viewers-creators/

https://github.com/yt-dlp/yt-dlp/releases

https://github.com/yt-dlp/yt-dlp/blob/master/README.md

https://github.com/gorhill/uBlock/wiki/Dashboard%3A-Filter-lists/b902569784469ad2bf326efb82d9fd3f92f2fe8d

https://developer.chrome.com/docs/extensions/reference/api/scripting

https://developer.chrome.com/docs/extensions/reference/api/userScripts

https://developer.chrome.com/docs/ai/built-in-apis

https://developer.chrome.com/docs/ai/summarizer-api

https://developer.chrome.com/docs/ai/prompt-api

https://developer.chrome.com/blog/local-network-access

https://developer.chrome.com/docs/extensions/reference/api/permissions

https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts

https://extensionworkshop.com/documentation/publish/self-distribution/

https://extensionworkshop.com/documentation/manage/updating-your-extension/

### Standards and academic research

https://w3c.github.io/wcag/understanding/three-flashes-or-below-threshold.html

https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback

https://arxiv.org/abs/2404.06827

https://arxiv.org/abs/2108.09491

### Security, policy, and dependency releases

https://github.com/mozilla/web-ext

https://github.com/advisories/GHSA-w3rx-r6r6-pgpr

https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/

https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

https://developer.chrome.com/docs/webstore/best-practices

https://support.mozilla.org/en-US/kb/extension-data-collection

https://arxiv.org/abs/2604.17668

https://eslint.org/blog/2026/06/eslint-v10.6.0-released/

https://github.com/nodejs/Release

https://www.npmjs.com/package/crx3

https://www.npmjs.com/package/ws?activeTab=versions

## Open Questions

No research question blocks implementation of the five new additions. Store
submission, signing, clean-machine verification, live-browser capture, native
companion transport, and external credentials remain operator-gated in
Roadmap_Blocked.md and are intentionally outside this pass.
