# Research — Astra Deck
Date: 2026-08-02 — replaces all prior research (previous pass: 2026-07-29).

## Executive Summary

[Verified] Astra Deck at v4.51.1 is a 417-setting, 11-locale MV3 extension (`extension/`, 52,883-line `ytkit.js` monolith + 25 extracted feature modules + 42 core modules + 33 selector packs), a generated Tampermonkey userscript, and a Windows PyQt6/Flask yt-dlp companion. Baseline on 2026-08-02 is fully green: **1272 JS tests pass**, **356 Python tests + 131 subtests pass**, `npm audit` reports zero advisories at every severity, ESLint clean, `ROADMAP.md` drained to zero open items. The prior pass's eight opportunities have all shipped or been fixed (companion sync probes, `audioTrackLanguage` bridge, history 500-entry exposure, `docs/architecture.md` drift).

The project's engineering quality is no longer the constraint — **delivery and locale fidelity are**. The two structural findings this pass are that shipped work is not reaching users, and that an extension which localizes its own UI into 11 languages still reads YouTube almost entirely in English.

Top opportunities, in priority order:

1. **Ship what is already built.** CHANGELOG declares `[4.51.1] - 2026-08-02`; the newest git tag and GitHub release is **v4.50.7 (2026-07-28)**. Two versions — including durable scheduled subscriptions and ~36 hardening fixes — are undelivered on a hand-install channel with no auto-update.
2. **Video Hider type detection is English-only.** `isLive` / `isUpcoming` / `isMix` / `isPlaylist` are English regexes; localized *count* parsing shipped 2026-08-02 but type detection did not.
3. **Three documented predicate-DSL fields are permanently inert** (`ageDays`, `isShort`, `isMembersOnly` hardcoded to `0`/`false`).
4. **The companion's cookie-jar permission hardening does not work on Windows**, and its failure is swallowed.
5. **~60 English exact-match `aria-label` selectors** across shipped features, with no gate preventing more.
6. **Eight blocked items are blocked by a stale session constraint**, not by a real blocker.
7. **SponsorBlock integration is read-only** — Astra consumes the segment commons without a submission or voting path.
8. **Python has no swallowed-exception gate** where JavaScript has an enforced one (~28 bare `except: pass`, two security-relevant).
9. **Audio sync and EQ are one node each** on an audio graph Astra already owns and already routes through.
10. **Untranslated user-visible strings escape the i18n copy gate** — button text, `aria-label`s, toasts, and tooltip templates.

## Product Map

- **Core workflows:** customise YouTube playback/layout/discovery; filter feeds, comments and subscriptions; capture transcripts, notes, bookmarks and media; diagnose selector/API/storage health; download through the local companion.
- **User personas:** YouTube power users, focus/privacy users, researchers and note-takers, multilingual and accessibility users, Windows media archivists.
- **Platforms and distribution:** Chrome/Edge/Brave and Firefox 142+ MV3 packages in store-safe and GitHub-full profiles, a Tampermonkey/Violentmonkey userscript, and an unsigned Windows 10+ x64 PyInstaller companion. Distribution is GitHub Releases only — no store listing, no auto-update. Mobile browsers, YouTube Music, Studio and embeds are explicitly out of scope.
- **Key integrations and data flows:** YouTube DOM/player and InnerTube; SponsorBlock, DeArrow, Return YouTube Dislike, Reddit, Cobalt, BYO AI providers, Ollama. Extension→companion traffic is authenticated loopback HTTP on `127.0.0.1:9751` plus five fallback ports, bootstrapped native-messaging-first, **and — verified — routed entirely through the background service worker's `EXT_FETCH` bridge** (`extension/ytkit.js:376`), not from the content script. Companion work flows through yt-dlp 2026.7.4, ffmpeg, Deno/Node EJS and an optional bgutil PO-token provider.

## Competitive Landscape

- **BlockTube** (`github.com/amitbl/blocktube`) — the clearest migration target. Effectively stalled: last push 2026-02-07, 484 open issues, including a MV3 defect where filter listeners are registered inside an async callback and die after service-worker suspension, plus Firefox 151 breakage. **Learn:** rule discoverability and the `@handle`/multi-uploader blocking gaps its users keep filing. **Avoid:** a second rule language — Astra's predicate DSL plus keyword rules already cover it.
- **Iridium** (`github.com/ParticleCore/Iridium`) — archived 2026-01-31 with ~1.3K stars and both store listings; users are being redirected to Enhancer, Unhook and Zenith. **Learn:** the migration window is open now. **Avoid:** inheriting its old-UI-restoration feature class (see below).
- **Enhancer for YouTube** — abandoned Firefox/AMO in Aug 2025 over review latency, and is mid-rewrite with five open refactor RFCs filed 2026-06/07, so feature velocity is parked. **Learn:** its most-requested open enhancement is audio sync, which Astra can add as one `DelayNode`. **Avoid:** its recurring original-audio and selector regressions.
- **ImprovedTube** (`github.com/code-charity/youtube`) — the live issue tracker is the best public demand signal: list/compact feed view (#3593, 19 👍), persistent newest-comment sort (#3658/#3668), force original audio track (#2716), buffer/preload control (#581), channel RSS (#4089), time and low-view filters (#4126/#4145). **Learn:** demand ranking. **Avoid:** its option sprawl without per-control explanations.
- **SponsorBlock / DeArrow** — set the standard for transparent categories, per-video overrides and graceful API failure, and are the commons Astra reads from. Astra ships `deArrowVoting` and `casualMode` but SponsorBlock is `skipSegments` GET only (`extension/features/sponsorblock/index.js:257`). **Learn:** contribute back. **Avoid:** submission without abuse controls — writes carry reputation and account risk that reads never did.
- **Control Panel for YouTube** — ships old-player-UI restoration toggles that were **already reported broken 2026-07-27**, with the author warning the toggle dies when YouTube deletes the legacy path. **Learn:** nothing to copy. **Avoid:** the entire old-UI-restoration feature class — it is unmaintainable by construction.
- **PocketTube** (250K+ users, v18.7.1 2026-07-06) — subscription grouping plus bulk unsubscribe-by-inactivity and client-side watched-marking. **Learn:** both fit Astra's existing bounded-session + Undo `bulkCardActions` pattern and its stale-channel staging. **Avoid:** its Google-Drive sync coupling.
- **Return YouTube Dislike** — a cautionary tale, not a competitor: it injected premium-upsell ads into YouTube in Oct 2025 and lost user trust outright. **Learn:** Astra's no-telemetry, credential-scrub, SBOM posture is the differentiator users now explicitly shop for. **Avoid:** any post-install behaviour change that was not disclosed at install.

## Security, Privacy, and Reliability

- **[Verified] The companion's cookie-jar permission hardening is ineffective on its only supported platform, and fails silently.** `astra_downloader/download.py:214-217` writes the Netscape jar containing live YouTube `SAPISID`/`SID` cookies, then calls `os.chmod(target_path, 0o600)` inside `try: … except OSError: pass`. On Windows `os.chmod` only toggles the read-only bit — it cannot express POSIX 0600 — so the confidentiality control named in `docs/yt-dlp-cookie-threat-model.md` does not exist in practice, and any failure is unobservable. There is also a window between `os.replace` (`:212`) and the `chmod` where the file is at default inherited permissions.
- **[Verified] Python has no equivalent of the JavaScript `require-catch-reason` gate.** ESLint enforces a `// reason:` comment on all 159 empty JS catches and reports zero issues; the companion has ~28 bare `except: pass` with no comment. Two are security-relevant beyond the chmod above: cookie-jar unlink failures at `download.py:988`, `:1021`, `:1888`, `:2119` leave a jar with session cookies on disk with no record. Others hide watchdog and process-kill failures (`download.py:1770`, `:283`, `:287`, `:300`).
- **[Verified] Chrome Local Network Access is already mitigated architecturally.** Chrome 142 shipped LNA and Chrome 145 split it into `local-network` + `loopback-network`. Content-script-initiated loopback fetches are gated; extension requests with matching `host_permissions` are not. Astra's companion probe calls `extensionFetchJson` (`extension/features/download-ui/index.js:277`), which posts `EXT_FETCH` to the service worker (`extension/ytkit.js:375-378`), and `manifest.json` declares all six loopback origins. **No new work is warranted here** — the residual risk is live-browser confirmation, already tracked in `Roadmap_Blocked.md`.
- **[Verified] No dependency advisories.** `npm audit` reports `{critical:0, high:0, moderate:0, low:0, info:0}` on 2026-08-02. `requirements.txt` already pins above every 2025-2026 advisory floor: `curl_cffi==0.15.0` (CVE-2026-2431 redirect SSRF), `werkzeug>=3.1.6` (GHSA-29vq-49wr-vm6x), `flask>=3.1.3`, `requests>=2.33.0`, `yt-dlp==2026.7.4` (CVE-2026-55404). Overrides already carry `brace-expansion 5.0.8`, `shell-quote ^1.10.0`, `adm-zip ^0.6.0`. `ws` is pinned at 8.21.0, above the 8.20.1 fix for GHSA-58qx-3vcg-4xpx.
- **[Verified] Firefox data-collection consent is already handled** — `scripts/manifest-patch.js:32` emits `data_collection_permissions` under `browser_specific_settings.gecko`, which AMO has required for new submissions since 2025-11-03. No work needed.
- **[Verified] Distribution is the largest reliability risk to users.** `package.json`, `extension/manifest.json` and `docs/architecture.md` all state v4.51.1 and `CHANGELOG.md` dates it 2026-08-02, but `git tag` and `gh release list` both top out at v4.50.7. Users on a manual-install channel cannot receive scheduled subscriptions, the Firefox native-messaging bootstrap fix, the resume-playback persistence fix, or the download filename cap. The maintainer CRX key is absent from this machine (`%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem` not present, `ASTRA_CRX_KEY_PATH` unset), and repo policy forbids releasing ZIPs without CRX/XPI — so the CRX half is key-gated while tagging, building and XPI/userscript/SBOM staging are not.
- **[Verified] Working-tree corruption was found and repaired during this pass** (240 tracked source files truncated to 0 bytes with `.bak` sidecars byte-identical to `HEAD`). `git restore` recovered all of them and the full suite went green afterwards. Not a repo defect — recorded so a future reader does not treat the `.bak` files as meaningful.

## Architecture Assessment

- **[Verified] Three documented predicate-sandbox fields are permanently inert.** `docs/predicate-sandbox-investigation.md:137-142` documents `ageDays`, `isShort` and `isMembersOnly` as usable, but both implementation copies hardcode them (`extension/features/video-hider/index.js:1337,1340,1342` and `extension/ytkit.js:17559`). A user rule of `ageDays > 365` silently never matches. The detection logic already exists nearby — `_extractCardAgeDays` at `extension/ytkit.js:37291` powers the stale-channel scanner.
- **[Verified] YouTube-facing detection is English-only while the product ships 11 locales.** `extension/ytkit.js:17214-17221` derives `isLive`, `isUpcoming`, `isMix` and `isPlaylist` from English regexes over lowercased localized metadata, so on a non-English UI those predicates are permanently false. Only `hidePlannedLivestreams` was internationalized (`_NOTIFY_RE`/`_SCHEDULED_RE` at `extension/ytkit.js:33979,33990` carry ES/DE/FR/IT/RU/JA/KO/ZH/AR alternations) — which proves the pattern is understood and simply was not applied elsewhere. Roughly 60 further sites use English exact-match `aria-label` selectors, concentrated in `extension/ytkit.js:16381-16387` (the whole watch-action button map), `:15347-15360`, `:26915-26951` (consent dialogs) and `:33087-33610` (Watch Later workbench).
- **[Verified] The i18n copy gate has holes.** `npm run i18n:copy:gate` passes while these user-visible strings are hardcoded English: `extension/ytkit.js:33359` button text `'Remove Watched'` and its `aria-label`, `:25511` a `showToast` string that also names an English YouTube button, and `:24796` the `Scheduled for ${exactDate}` / `Published on ${exactDate}` tooltip that is also copied into `aria-label`. The gate is fingerprint/baseline-based rather than exhaustive.
- **[Verified] The companion port list is duplicated four ways** — `astra_downloader/astra_downloader.py:222`, `astra_downloader/config.py:91`, `extension/manifest.json` (host_permissions and CSP `connect-src`), and `build-extension.js:89-95`. Adding a fallback port requires four coordinated edits with no gate tying them together.
- **[Verified] Companion auto-start retry budgets are below the documented cold-start time.** `CLAUDE.md` records that a cold 40 MB one-file start needs ~12 s; `tryAutoStart(retries = 4)` defaults to ~6 s (`extension/features/download-ui/index.js:428`). The main download path was bumped to `8` (`:1154`) but every recovery path still passes `5` (`:639`, `:696`, `:1184`, `extension/ytkit.js:43347`), so the user-facing "try starting again" button gives up before a cold start finishes.
- **[Verified] The dual-artifact tax is the dominant maintenance cost.** `extension/ytkit.js` (52,883 lines) and `YTKit.user.js` (44,262) change together — 133 and 81 touches respectively across the last 300 commits — policed by `scripts/check-userscript-drift.js` rather than eliminated. The 11-locale fan-out adds ~14 files per copy change. `Roadmap_Blocked.md` already owns the canonicalisation work; do not open a second item.
- **[Verified] Eight of 28 items in `Roadmap_Blocked.md` are blocked by a stale session constraint**, not a real one — each cites "this run explicitly forbids staging Markdown other than `README.md` and `CHANGELOG.md`", a self-imposed rule from a prior pass. They include dual subtitles, allowlist hiding mode, the audio auto-gain/high-pass chain, enforced Shorts limits, the hide-AI-surfaces pack, comment intelligence, playlist power pack and notification controls. No such constraint applies now.
- **[Verified] Test coverage is strong in aggregate but thin per module.** 89 test files / 1272 tests cover `core/predicate-sandbox` and `core/navigation` indirectly (`tests/core-foundation.test.js`, `tests/long-session.test.js`, `tests/hardening.test.js`), so "no dedicated file" is mostly a naming artefact. The real gaps are `extension/features/download-ui/index.js` (2,818 lines, the entire download path, covered only by the adjacent `tests/download-health-boundary.test.js`) and `extension/features/subscription-groups/index.js` (2,453 lines).
- **[Likely] Startup cost is unmeasured.** `manifest.json` content-script entry 3 injects ~96 files into every YouTube page at `document_idle`. No budget, benchmark or regression gate exists for injection or first-feature-paint time, and competitor CPU complaints are a recurring review theme.

## Rejected Ideas

- **Old-player-UI restoration toggles** — [Rejected] Control Panel for YouTube's equivalent was already reported broken 2026-07-27 and its author warns it dies outright when YouTube removes the legacy path. Unmaintainable by construction.
- **Route loopback traffic through the service worker for Chrome LNA** — [Rejected] already the shipped architecture; verified at `extension/ytkit.js:375-378`. The generic advice does not apply here.
- **Astra on embedded YouTube players in third-party pages** — [Rejected 2026-08-06] The domains are already declared, so the gap is only `all_frames`, which makes this look like a one-line change. It is not: every YouTube embed on the web — news articles, blogs, documentation — would load the full ~80-file ISOLATED bundle. That is a large performance and attack-surface expansion in exchange for features an embed has no surfaces for (no feed, no comments, no watch metadata, no masthead). Doing it properly needs a build-time slim bundle, which was already deferred once for the live_chat frame on the same reasoning (2026-07-14 perf pass) and which contradicts the deliberate deep-equal invariant in `tests/build-fixes.test.js` that pins the live_chat bundle equal to the main-pages bundle. h5player ships this as its headline capability, but it is a cross-site video enhancer driven almost entirely by keyboard shortcuts, which this project does not ship. Revisit only if a slim embed bundle is wanted for its own sake.
- **Mobile-browser port** — [Rejected] README excludes it; NewPipe/LibreTube/SmartTube serve that use case natively.
- **Cloud accounts, multi-user companion, or Google-Drive settings sync** — [Rejected] adds identity, tenancy and remote attack surface to a single-user loopback process. Opt-in `storage.sync` is already tracked in `Roadmap_Blocked.md`.
- **Multi-site downloader (SoundCloud/PeerTube/Bandcamp)** — [Rejected] conflicts with `is_youtube_url` and the companion's deliberate SSRF boundary.
- **`chrome.userScripts`-based arbitrary JS plugins** — [Rejected] since Chrome 138 it needs a per-extension user toggle that defaults off, is Chromium-only, and undercuts the no-eval/CSP boundary.
- **Bundling a local SponsorBlock segment database for offline skipping** — [Rejected] segment accuracy is inherently server-fresh; a stale bundled DB would mis-skip and read as a defect. Contribute upstream instead.
- **aria2c / `--external-downloader`** — [Rejected] already banned in source over CVE-2026-50574, and yt-dlp 2026.06.09 removed aria2c HLS/DASH support anyway.
- **`.mailmap` to collapse author-name variants** — [Rejected] cosmetic; all variants are the same human with the same address, and no AI identity is present.
- **Remote telemetry or crash upload** — [Rejected] contradicts the published privacy policy; bounded local diagnostics already exist.
- **Enterprise `storage.managed` policy provisioning** — [Rejected for now] sourced only from a single BlockTube feature request with no evidence of demand among Astra's users; revisit if an actual deployment asks.

## Sources

### OSS competitors and adjacent projects
- https://github.com/amitbl/blocktube/issues
- https://github.com/ParticleCore/Iridium
- https://github.com/code-charity/youtube/issues
- https://github.com/YouTube-Enhancer/extension/issues
- https://github.com/ajayyy/SponsorBlock/issues
- https://dearrow.ajay.app/casual/
- https://github.com/Anarios/return-youtube-dislike/issues
- https://github.com/insin/control-panel-for-youtube/issues
- https://pockettube.io/
- https://github.com/CaptainYouz/FocusTube
- https://alternativeto.net/software/iridium-by-particlecore/

### Platform, standards and store policy
- https://developer.chrome.com/docs/extensions/whats-new
- https://developer.chrome.com/blog/local-network-access
- https://chromestatus.com/feature/5068298146414592
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/pUDh8RiTjJk
- https://developer.chrome.com/blog/cws-policy-updates-2026
- https://developer.chrome.com/blog/chrome-userscript
- https://developer.chrome.com/docs/ai/built-in-apis
- https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/
- https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/
- https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/
- https://webstatus.dev
- https://w3c.github.io/webextensions/specification/index.html

### Dependencies and security
- https://github.com/yt-dlp/yt-dlp/releases
- https://github.com/yt-dlp/yt-dlp/security/advisories
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/yt-dlp/yt-dlp/issues/15012
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider
- https://osv.dev
- https://docs.python.org/3/library/os.html#os.chmod

### Community signal and incidents
- https://iter.ca/post/yt-adblock/
- https://piunikaweb.com/2025/10/14/youtube-new-desktop-ui-rollout-complaints/
- https://www.ghacks.net/2025/08/18/enhancer-for-youtube-add-on-for-firefox-possibly-discontinued-due-to-problems-with-mozillas-review-process/
- https://www.ghacks.net/2026/01/10/youtube-adds-a-search-filter-to-hide-shorts-from-results/
- https://news.ycombinator.com/item?id=45696329
- https://www.island.io/blog/badblocker-11-million-users-one-server-call-away-from-compromise
- https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/
- https://9to5google.com/2026/09/16/youtube-lower-view-counts-ad-blockers/
- https://noahkarsky.com/2026/04/11/obsidian-youtube-clipper-breakdown.html
- https://sponsorblock.instatus.com/history/1

## Open Questions

- **SponsorBlock submission identity and abuse posture.** Adding `postSkipSegments`/`voteOnSponsorTime` requires generating and persisting a private `userID`, which is a new durable identifier and a new outbound write path. Whether Astra should carry submission at all — versus voting only, versus neither — is a maintainer product/liability call that changes the design, not something inspectable in the repo or resolvable from public sources.
- **Whether the maintainer CRX key (`ytkit.pem`) can be made available on this machine.** It determines whether the v4.51.1 release is an actionable roadmap item or belongs in `Roadmap_Blocked.md` alongside the other key-gated release work.
