# Research — Astra Deck
Date: 2026-07-14 — replaces all prior research.

## Executive Summary

[Verified] Astra Deck is a mature, local-first YouTube enhancement suite spanning Chromium and Firefox MV3 extensions, a userscript, and a Windows PyQt/yt-dlp companion. Its strongest current shape is breadth with explicit local-data, policy-profile, permission, recovery, and external-service boundaries: 408 schema-backed settings, 19 extracted feature modules, 11 locales, dual store-safe/GitHub-full packaging, and focused hardening around downloads and updates. The highest-value direction is to make those boundaries enforceable rather than merely configurable: keep automation off the user's desktop, gate companion releases on a complete license inventory, encode an immutable artifact capability ceiling and verified permission matrix, protect BYO AI credentials, make backup/reset cover every durable domain, repair transcript indexing, and prove behavior across MV3 worker termination. After those trust fixes, the best product investments are a durable pending-download queue, smaller page-specific bundles, and continued extraction of the 55,172-line feature monolith.

Top opportunities, in priority order:

1. [Verified] Remove the Chromium smoke test's automatic headed-browser fallback.
2. [Needs legal validation] Inventory and gate the PyQt6/FFmpeg companion distribution posture.
3. [Verified] Stamp an immutable capability ceiling into each build and verify its documented permission matrix.
4. [Verified] Move AI credentials out of content-script settings and URLs into background-owned custody.
5. [Verified] Define one versioned, lossless archive/reset contract for every durable local-data domain.
6. [Verified] Rebuild transcript indexing around `TranscriptService`, cancellable ingestion, and truthful errors.
7. [Verified] Remove import-time `pip install --break-system-packages` and update the affected yt-dlp pin.
8. [Verified] Test critical workflows through real MV3 service-worker termination and restart.
9. [Verified] Add a persistent pending-download queue instead of rejecting work at three active jobs.
10. [Verified] Split live-chat delivery and complete module ownership so extracted features are not shadowed by monolithic fallbacks.

## Product Map

- **Core workflows:** customize YouTube playback, layout, feeds, comments, live chat, privacy, accessibility, and focus behavior through schema-driven controls; retain local notes, bookmarks, watch state, queues, transcript search, filters, and subscription groups; enrich pages through optional SponsorBlock, DeArrow, Return YouTube Dislike, Reddit, and BYO/local AI integrations; download media through an authenticated loopback companion.
- **User personas:** YouTube power viewers, privacy-conscious users, students/researchers, accessibility and distraction-reduction users, and Windows users who archive media locally.
- **Platforms and distribution:** Chrome-family and Firefox MV3 packages in store-safe and GitHub-full profiles, a generated userscript, and a Windows 10+ companion built with Python/PyQt6/PyInstaller; Node.js 22+ is the project tooling floor.
- **Key integrations and data flows:** content scripts exchange structured messages with the MV3 worker; optional hosts are granted per capability; settings and user artifacts live in extension storage/local storage/IndexedDB; the companion accepts loopback requests and delegates extraction to yt-dlp/FFmpeg; external metadata and AI calls transit the background fetch boundary.
- **Hard constraints:** MIT repository license, Chrome/Firefox MV3 lifecycles, YouTube's changing SPA/DOM contracts, browser-store policy profiles, local-first/no-account philosophy, and a Windows-only native companion.

## Competitive Landscape

- **ImprovedTube:** [Verified] Broad, categorized viewer customization and a long-lived extension architecture. Learn from its discoverable capability catalog and narrow preference controls. Avoid importing breadth without ownership boundaries; Astra already has more settings than its monolith can safely absorb.
- **YouTube Enhancer:** [Verified] Frequent releases responding to YouTube UI drift. Learn from short feedback loops and selector-facing release discipline. Avoid making reactive DOM patches the only compatibility layer; Astra should keep fixtures, capability probes, and teardown contracts.
- **BlockTube:** [Verified] Focused channel/video filtering with understandable user rules. Learn from simple identity-based controls and predictable failure behavior. Avoid duplicating its filtering surface where Astra's existing hider and direct-watch roadmap item already cover the need.
- **SponsorBlock and DeArrow:** [Verified] Mature optional community-data integrations with active compatibility release discipline. Learn to keep remote data optional, cached, and degradable. Avoid any remote executable selector or CSS channel that bypasses reviewed releases.
- **FreeTube:** [Verified] A privacy-first alternative client with explicit local data and instance choices. Learn clear privacy boundaries and resilient alternative data paths. Avoid becoming a replacement YouTube client; that conflicts with Astra's in-page enhancement model and multiplies platform maintenance.
- **MeTube and YTDLnis:** [Verified] Persistent queues, reordering, retries, and deliberate download state. Learn a pending-versus-active job model and restart-safe operator controls. Avoid accepting arbitrary yt-dlp command text through Astra's loopback trust boundary.
- **PocketTube and YTidy:** [Verified] Subscription productivity is valuable enough to sustain paid tiers, especially extension-owned grouping and list views that survive site redesigns. Learn durable, locally managed subscription workflows. Avoid cloud accounts and paid synchronization until the existing local subscription/list roadmap is proven.
- **TubeBuddy and vidIQ:** [Verified] Creator analytics, SEO, and optimization are the main commercial paywalls. Learn that high-value workflows explain state and outcomes clearly. Avoid creator-suite scope: Astra's code, copy, and users are viewer-oriented, and creator analytics would require unrelated data collection and maintenance.

## Security, Privacy, and Reliability

- [Verified] `scripts/smoke-chromium-optional-hosts.js:691` automatically retries with `headed: true` when headless Chromium omits `chrome.action.openPopup`; this can surface a browser and disturb the active desktop. The smoke must fail/skip explicitly or use a proven isolated headless path.
- [Needs legal validation] `LICENSE` declares MIT while `astra_downloader/requirements.txt` uses PyQt6 and the build downloads a GPL FFmpeg archive. Riverbank documents free PyQt under GPLv3 unless a commercial license applies; FFmpeg's enabled build options determine LGPL/GPL obligations. No documented companion compliance assessment, commercial-entitlement record, or artifact-linked license inventory was found in the repository. This is a release-gate question, not a conclusion of infringement.
- [Verified] `build-extension.js:491` changes hosts, CSP, and web-accessible resources but does not stamp the staged artifact's profile. `extension/core/policy-profile.js` derives the effective profile from mutable settings, so a store-safe package can expose GitHub-full UI behavior after installation. Store-safe intentionally supports the local companion and justifies `cookies`/`nativeMessaging`; the gap is an immutable ceiling for every schema/profile capability plus a machine-checked permission rationale, not blanket permission removal.
- [Verified] `aiSummaryApiKey` is an ordinary schema setting available to the content script, and `extension/ytkit.js:32429` places the Gemini key in a query string. Chrome recommends `storage.session` for sensitive in-memory data; Google recommends header-based keys and warns against client-side exposure. Extension credential injection belongs in the worker with an explicit opt-in persistence choice; the userscript needs a separate manager-isolated credential path.
- [Verified] `astra_downloader/astra_downloader.py:36` mutates the active Python environment during import and eventually invokes `pip install --break-system-packages`; PyPA reserves that override for explicit external-environment modification. Setup must be a deliberate command or isolated environment, never module import behavior.
- [Verified] `astra_downloader/requirements.txt` pins `yt-dlp==2026.6.9`, within the affected range for CVE-2026-55404; 2026.7.4 contains the fix. Astra's allowlisted argument construction limits practical exposure, but the vulnerable dependency should still be replaced and the dangerous link-writing flags regression-tested out of every argv path.
- [Verified] `extension/popup.js:3618` exports only settings, hidden/allowed videos, blocked channels, and bookmarks, while watch progress/time, the local queue, and `ytkit-transcript-index` are durable too. Export is intentionally uncapped, yet import rejects serialized writes above 4.5 MB; reset clears `storage.local` but not the YouTube-origin local/IndexedDB domains. A successful backup/reset message therefore does not currently mean complete recoverability.
- [Verified] `researchTranscriptIndex._ingestCurrent()` marks a video ingested before it sees transcript nodes, then reads only already-rendered transcript DOM. An unopened panel is permanently skipped for that visit; its delayed navigation timer is not cancellable, `_search()` lowercases/scans up to 1,000 large records per query without stale-result control, and `_clear()` reports success after transaction errors.
- [Verified] Chrome may terminate an idle extension service worker after 30 seconds. Current tests inspect lifecycle source but do not terminate and wake the real worker while exercising settings, permissions, pending download reveal, diagnostics, and updates.
- [Verified] `DownloadManager.start_download()` rejects the fourth active request rather than storing pending intent. MeTube and YTDLnis demonstrate the expected queue/reorder/retry model; Astra's repaired terminal-record reclamation is a foundation, not a pending queue. Persisted queue metadata must exclude cookie values and require fresh authentication after restart.
- [Verified] `npm audit --json` reported zero known npm vulnerabilities on 2026-07-14. Continue the existing dependency-audit and last-known-good update roadmap rather than adding a duplicate item.

## Architecture Assessment

- [Verified] `extension/ytkit.js` is 55,172 lines and still owns many implementations whose extracted modules load before it. Complete one feature at a time behind the existing behavioral-boundary-test roadmap item, delete the fallback copy, and keep userscript generation consuming the same canonical module graph.
- [Verified] The normal YouTube and `live_chat` manifest groups each load the same roughly 4.27 MB isolated-world list. Generate a chat-specific entry from declared feature scope so live chat receives only shared foundations and chat features.
- [Verified] `astra_downloader/config.py`, `download.py`, `gui.py`, `health.py`, and `routes.py` are compatibility re-exports over the 6,807-line `astra_downloader.py`. Move ownership behind explicit dependency objects while preserving import and PyInstaller contracts.
- [Verified] `web_accessible_resources` exposes static `icons/*` and `assets/*`. First remove resources without a page consumer; Chromium's `use_dynamic_url` can reduce the remaining stable extension-resource fingerprint, while Firefox should retain its native randomized extension origin without a Chromium-only key.
- [Verified] **Testing and accessibility:** existing checks cover static semantics and minimum target sizes, but not WCAG 2.2 Focus Not Obscured, 200% zoom/reflow, sticky-surface overlap, or end-to-end keyboard order. Add isolated headless coverage; do not rely on foreground desktop automation.
- [Verified] **Observability:** selector health, external-service health, diagnostic logs, and a redacted companion support bundle already exist. No new observability item is warranted until those diagnostics/recovery surfaces are exercised through worker restart.
- [Verified] **i18n, documentation, migration, and upgrades:** the existing roadmap already covers pseudolocale/translation ratchets, generated documentation truth, settings-mutation migration, dependency/SBOM reproducibility, last-known-good upgrades, optional sync, and behavioral boundary tests. Those areas were not duplicated in the additions.
- [Verified] **Offline/resilience:** complete local backup/reset and a restart-safe companion queue are the bounded fits; a browser media cache or always-on archive server is intentionally rejected below.
- [Likely] The strongest maintainable sequencing is: artifact/credential/data contracts first; worker and accessibility tests second; queue and bundle boundaries third; monolith extraction last. Reversing that order would make large refactors harder to prove and roll back.

## Rejected Ideas

- **Full alternative YouTube client** — FreeTube/NewPipe: conflicts with Astra's injected enhancement philosophy and creates a separate playback/API compatibility product.
- **Hosted multi-user backend** — TubeArchivist: accounts, server operations, authorization, and shared storage contradict the local-first single-user boundary.
- **Creator SEO/A/B analytics suite** — TubeBuddy/vidIQ: commercially validated but misaligned with Astra's viewer personas and privacy posture.
- **Remote plugin, selector, CSS, or custom-JavaScript marketplace** — adjacent extension ecosystems: an unsigned executable update channel would erase Astra's reviewed-release and CSP trust boundary.
- **Browser-side offline media cache/server** — TubeArchivist/NewPipe: browsers are the wrong durability and storage boundary; downloads belong in the companion.
- **Android, Firefox Android, and Safari ports now** — NewPipe/YTDLnis: no mobile or Safari shell/build/test infrastructure exists, and YouTube desktop DOM features do not transfer cheaply.
- **Always-on scheduled channel archiving** — TubeArchivist: requires a daemon/service lifecycle and storage policy the opt-in desktop companion does not have.
- **Arbitrary yt-dlp argument text** — yt-dlp GUI projects: unsafe across the authenticated loopback boundary; keep typed, allowlisted options.
- **Cloud-managed AI credits or proxy** — commercial summarizers: creates credential, billing, telemetry, abuse, and multi-user obligations; retain BYO/local explicit invocation.
- **Full light-theme redesign** — Dark Reader and theme tools: Astra already preserves a dark/OLED identity and supports YouTube theme variants; repair semantic tokens and nested surfaces incrementally rather than replacing the identity.

## Sources

### Open-source competitors and adjacent projects

- https://github.com/code-charity/youtube
- https://github.com/YouTube-Enhancer/extension/releases
- https://github.com/amitbl/blocktube
- https://github.com/ajayyy/SponsorBlock/releases
- https://github.com/ajayyy/DeArrow/releases
- https://github.com/FreeTubeApp/FreeTube
- https://github.com/alexta69/metube
- https://github.com/deniscerri/ytdlnis
- https://github.com/tubearchivist/tubearchivist

### Commercial products

- https://pockettube.io/pricing.html
- https://ytidy.com/
- https://www.tubebuddy.com/homepage-new/
- https://support.vidiq.com/en/articles/13928456-features-credits-by-plan

### Lists and community signal

- https://github.com/pluja/awesome-privacy
- https://github.com/awesome-selfhosted/awesome-selfhosted
- https://www.reddit.com/r/youtube/comments/1qudzz8/youtube_removed_the_list_layout_in_subscription/

### Standards, platform guidance, security, and research

- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources
- https://www.w3.org/TR/WCAG22/
- https://packaging.python.org/en/latest/specifications/externally-managed-environments/
- https://riverbankcomputing.com/software/pyqt
- https://www.ffmpeg.org/legal.html
- https://ai.google.dev/gemini-api/docs/api-key
- https://docs.cloud.google.com/docs/authentication/api-keys-best-practices
- https://nvd.nist.gov/vuln/detail/CVE-2026-55404
- https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04
- https://www.usenix.org/conference/usenixsecurity25/presentation/agarwal-shubham

## Open Questions

- [Needs legal validation] Does the maintainer hold a commercial PyQt license, or should the companion adopt a GPL-compatible distribution posture or migrate to PySide6 before any binary release after 2026-07-14?
