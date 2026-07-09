# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

- [ ] P3 — Migrate popup.js and background.js onto the cross-browser API wrapper (next bounded batches)
  Why: `core/browser-api.js` shipped with sidepanel.js as the first migrated batch; popup.js (~112 direct `chrome.*` call sites) and background.js (~42) still call the vendor namespace directly.
  Where: `extension/popup.js`, `extension/background.js`, `tests/browser-api.test.js`.
  Acceptance: Each batch routes one surface's calls through the wrapper (background.js needs an inline resolver — the SW cannot load core scripts), with the existing Chrome-only/Firefox-style namespace tests extended to the migrated surface.
  Complexity: M

## Research-Driven Additions — 2026-07-09 (userscript competitive sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-09). Extension-first; userscript parity intentionally excluded. Every mutation feature must reuse the bulkCardActions bounded-session + Undo pattern and external-api-health degradation surfaces.

### P1 — root-cause reliability + highest-demand gaps
- [ ] P1 — Watch Later workbench
  Why: WL is capped at 5,000 with no official API since 2016; bulk remove/sort/dedupe/export is the loudest sustained unmet demand (paid CWS tools exist). Astra already has watchLaterCleanup ("Remove Watched") to extend.
  Evidence: tidywl.com 5000-limit analysis; Watch-Later Playlist Nuker (GF); HN 39627895.
  Where: `extension/ytkit.js` watchLaterCleanup block, new `extension/features/` module, reuse bulkCardActions session pattern.
  Acceptance: On ?list=WL — bulk remove by filter (watched %, age, channel, duplicate videoId), sort preview, JSON/CSV export; sessions bounded (25/run, paced) with Undo log; all local.
  Complexity: L
- [ ] P1 — Scrollable fullscreen (comments under fullscreen video)
  Why: Reading comments/description without leaving fullscreen is a recurring ask YouTube removed; several scripts restore it.
  Evidence: "YouTube Restore Scrollable Fullscreen" (BK K), 4lrick variants.
  Where: `extension/ytkit.js` new CSS/behaviour feature; conflict-guard against stickyVideo and fitPlayerToWindow.
  Acceptance: In fullscreen, wheel scroll reveals page content below the video (video stays pinned); Escape and fullscreen exit restore normal state.
  Complexity: M

### P2 — live tooling, subtitles, filtering, hygiene
- [ ] P2 — Force DVR on live streams
  Why: Streams with DVR disabled can't rewind; flipping isLiveDvrEnabled in the player response restores seek — high-value live feature.
  Evidence: DVR-chan (copyMister, 5.6k installs).
  Where: MAIN-world bridge `extension/ytkit-main.js` (player-response interception); risk review for store-safe.
  Acceptance: On a DVR-disabled live fixture, seekbar becomes scrubable; feature off by default with degradation note when player-response shape drifts.
  Complexity: M
- [ ] P2 — Live-edge speed reset
  Why: With persistentSpeed >1x on a live stream, playback hits the live edge and stalls; competitor userscript auto-resets to 1x when caught up.
  Evidence: competitor userscript v10.16.
  Where: persistentSpeed / player task manager in `extension/core/player.js`.
  Acceptance: Speed >1x on live content reverts to 1x within 2s of reaching live edge; resumes user speed when they seek back; unit test on mocked live progress.
  Complexity: S
- [ ] P2 — Floating live chat in fullscreen
  Why: Live viewers lose chat in fullscreen; an overlay chat panel (draggable, opacity slider) is a proven ask.
  Evidence: CY Fung "Floating Chat Window on Fullscreen"; Bunnelby chat stylizer.
  Where: stickyChat/premiumLiveChat blocks, fullscreen change handling.
  Acceptance: In fullscreen on live/replay pages, optional chat overlay with drag position + opacity persisted; hidden automatically when chat iframe absent.
  Complexity: M
- [ ] P2 — Replay chat-density highlight chart
  Why: Chat-activity spikes locate VOD highlights; a local density chart with clickable jumps is a genuine differentiator no major suite ships.
  Evidence: VOD Highlight Analyzer (SkAnon), Live Replay Comment Collector (yuyuyzl).
  Where: new `extension/features/` module, chat replay frame observation, canvas sparkline over progress bar.
  Acceptance: On VODs with chat replay, a density sparkline renders above the progress bar; clicking a spike seeks there; sampling budgeted/cancellable per navigation rules.
  Complexity: L
- [ ] P2 — Subtitles: auto-enable while muted + flash-on-rewind
  Why: Contextual caption triggers (muted → captions on; rewind → captions for 10s) are smart defaults competitor userscript shipped in v11; complements autoSubtitles.
  Evidence: competitor userscript v11.0.
  Where: autoSubtitles block, volume/mute + seek event handlers.
  Acceptance: Muting enables CC and unmuting restores prior CC state; rewind shows CC for 10s then restores; both independent toggles, off by default.
  Complexity: S
- [ ] P2 — Dual-language subtitles
  Why: Simultaneous two-track captions is a ~30k-install userscript niche (language learners, international viewers) absent from every major suite.
  Evidence: YtDLS (CY Fung, 2.4k), Youtube dual subtitle (0xjax, 12.9k), vanadis bilingual persist (15.4k).
  Where: new feature using timedtext track fetch alongside native CC; subtitle styling pipeline (subStyle*).
  Acceptance: Second caption track renders below the native one with independent language pick; obeys subStyle settings; degrades cleanly when a track is unavailable.
  Complexity: M
- [ ] P2 — Comment intelligence pack (language filter, duplicate collapse, per-user block)
  Why: commentFilterRules is keyword-only; hiding non-selected-language comments, collapsing copypasta duplicates, and per-user blocklists are proven separate scripts to fold into commentFilterManager.
  Evidence: YouTube Comment Language Filter (GF 558814), Similar Comments Hider (hjk789), user-block scripts (CKylinMC/ChanthMiao).
  Where: commentFilterManager / commentEnhancements blocks.
  Acceptance: Language allowlist hides other-language comments (heuristic detection, no network); near-duplicate comments collapse under one expander; author blocklist persists with management UI in settings panel.
  Complexity: M
- [ ] P2 — Allowlist (whitelist) hiding mode
  Why: Inverse of channel blocking — hide everything except chosen channels; BlockTube's #2 most-reacted request, barely exists anywhere.
  Evidence: BlockTube issue #133; FocusTube HN thread subscriptions-only demand.
  Where: `extension/features/video-hider/`, hideVideosAllowChannelBlock data model.
  Acceptance: Mode toggle switches hider to allowlist semantics per scope (home/search/related); allowlist editable from card overflow + settings; clearly labeled to prevent accidental "empty YouTube".
  Complexity: M
- [ ] P2 — Opt-in settings/blocklist sync (storage.sync)
  Why: Blocklist sync across devices is BlockTube's top-reacted issue; Astra is storage.local-only. Opt-in sync of a scrubbed settings subset fits the privacy posture (browser-account storage, no third party).
  Evidence: BlockTube issue #59.
  Where: storage layer (`extension/core/gm-compat.js`), policy-profile scrub (safeStoreProfile), popup export/import surface.
  Acceptance: Opt-in toggle syncs schema-validated, secret-scrubbed settings + blocklists within storage.sync quota (chunked, LRU-guarded); conflict rule = newest-write-wins with local snapshot Undo.
  Complexity: L
- [ ] P2 — Logarithmic volume curve
  Why: YouTube's linear volume slider makes low volumes jumpy; an exponential/log curve option is a small change with a devoted audience.
  Evidence: "Youtube Music fix volume ratio" (Nemo64, 5.1k), Volume Curve Designer.
  Where: volume handling in the shared audio path / `extension/core/player.js`.
  Acceptance: Toggle remaps slider position to gain with a log curve (native UI still shows position); works with rememberVolume and volumeBoost without double-scaling.
  Complexity: S
- [ ] P2 — Audio chain completion: compressor + auto-gain + high-pass
  Why: Astra has volumeBoost/normalization/pan/mono; Tweaks for YouTube's full WebAudio chain (auto gain to target loudness, compressor, high-pass) is the remaining delta and reuses the existing graph.
  Evidence: inzk.dev/tweaks-for-youtube features.
  Where: shared audio graph (audioNormalization/volumeBoost blocks).
  Acceptance: Three new nodes toggleable independently with sane defaults; graph teardown verified (no double-connect on SPA nav); settings live-apply.
  Complexity: M
- [ ] P2 — Playlist power pack: sort-by-duration, per-playlist resume, auto-skip watched
  Why: Playlist math/memory is a proven long-tail cluster; extends existing playlistEnhancer + showPlaylistDuration + resumePlayback primitives.
  Evidence: Sort Youtube Playlist by Duration (KohGeek), playlists playback tracker (andrybak), Playlist Auto Skip Watched (neverlandeverland).
  Where: playlistEnhancer block, resumePlayback storage.
  Acceptance: Playlist panel gains client-side duration sort (display reorder); per-playlist last-video memory offers "resume where you left off"; optional auto-skip of >=90%-watched entries during playlist playback.
  Complexity: M
- [ ] P2 — Enforced Shorts daily limit
  Why: YouTube's native Shorts timer (2025-10) is dismissible and toothless; digitalWellbeing already tracks day state — add a non-dismissible Shorts budget.
  Evidence: TechCrunch 2025-10-22 Shorts timer coverage; Shorts Addiction Helper scripts.
  Where: digitalWellbeing feature block + Shorts route detection.
  Acceptance: Configurable daily Shorts minutes; at limit, Shorts routes show a block screen with override policy chosen at setup (hard block vs 5-min snooze); resets at local midnight.
  Complexity: M
- [ ] P2 — Hide AI surfaces pack
  Why: "Ask" button, AI summaries, Gemini buttons, and fact-check/context panels are new 2025-2026 chrome Astra has no toggles for; cheap CSS wins with demand.
  Evidence: Control Panel for YouTube (hide AI summaries/Ask); Remove YouTube Gemini buttons (MizuchiKun); "Youtube without fact checking".
  Where: early.css + hide-feature CSS blocks, selector packs.
  Acceptance: Independent toggles hide Ask/AI-summary surfaces, Gemini buttons, and context/clarification panels; selector canaries added to fixtures.
  Complexity: S
- [ ] P2 — Guide sidebar per-item hiding
  Why: sidebarOrder reorders but cannot hide individual You/Explore entries (History, Playlists, Trending, Music, ...); competitor userscript v11 does per-item granularity.
  Evidence: competitor userscript v11.0 guide-sidebar controls.
  Where: sidebarOrder feature block, settings panel list UI.
  Acceptance: Checklist hides any individual guide entry or whole section; composes with sidebarOrder; survives SPA nav.
  Complexity: S
- [ ] P2 — Notification menu controls: cap count + hide read
  Why: chronologicalNotifications exists; capping the list and hiding read entries completes the cluster.
  Evidence: competitor userscript notification options.
  Where: chronologicalNotifications block.
  Acceptance: Options limit rendered notifications to N and hide read ones; menu perf unaffected (no re-render loops).
  Complexity: S
- [ ] P2 — ageRestrictionBypass canary fixture
  Why: The upstream reference (zerodytrash) broke against 2026 player changes; Astra needs a regression signal before users hit it.
  Evidence: Simple-YouTube-Age-Restriction-Bypass README breakage notice.
  Where: `tests/` fixture with AGE_VERIFICATION_REQUIRED player response, feature block.
  Acceptance: Test pins the bypass path against a recorded restricted player-response fixture; degradation produces a diagnostic + settings-panel warning instead of silent failure.
  Complexity: S
- [ ] P2 — Transcript modern-panel fallback pinning
  Why: YouTube is rolling out a modern transcript panel (data-target-id PAmodern_transcript_view); competitor userscript v11.3-11.4 supports both variants — Astra's TranscriptService should too before it breaks.
  Evidence: competitor userscript v11.4 changelog.
  Where: TranscriptService, transcriptViewer, selector packs + `tests/fixtures/selector-surface-matches.json`.
  Acceptance: Transcript features work against both panel variants (fixture per variant); selector canaries fail loudly on drift.
  Complexity: S
- [ ] P2 — Per-page CSS injection scoping
  Why: Most feature CSS is injected globally; competitor userscript v11 cut perf cost by toggling CSS per page type. Astra's style lifecycle specs can carry a page-scope field.
  Evidence: competitor userscript v11.0 per-page CSS toggling; `extension/core/styles.js` lifecycle specs.
  Where: `extension/core/styles.js`, cssFeature() registrations, navigation events.
  Acceptance: Style specs declare page scopes (watch/home/subs/all); non-matching pages do not carry the style; long-session test confirms no leak/flicker on SPA nav.
  Complexity: M

### P3 — insights, hygiene, and smaller bets
- [ ] P3 — InnerTube insights cluster (GitHub-full)
  Why: Category, tags, exact upload timestamp, channel ID reveal, and country flag are data the DOM never shows; only Tube Insights ships them. Fits GitHub-full profile with external-api-health degradation.
  Evidence: exyezed Tube Insights; View YouTube tags (tfr, 7.5k).
  Where: new GitHub-full feature via `core/data-flow.js` registration; watch-page metadata panel.
  Acceptance: Opt-in panel shows category/tags/exact-date/channel-ID from the already-loaded player response where possible (no extra requests in store-safe); InnerTube fetch only in GitHub-full with health tracking.
  Complexity: M
- [ ] P3 — Filmot deleted-video title restore (GitHub-full)
  Why: Restoring titles of deleted/private playlist entries is uniquely valuable for old playlists; external API so GitHub-full only.
  Evidence: Filmot Title Restorer (Jopik1, 4.5k).
  Where: playlist rendering path, data-flow registration, external-api-health.
  Acceptance: On playlists, [Deleted video] rows optionally resolve via Filmot with cache + rate budget; store-safe artifacts strip the host grant automatically.
  Complexity: M
- [ ] P3 — Thumbnail like-ratio bars (RYD-backed)
  Why: Ratio bars under thumbnails pre-filter clickbait; Astra already caches RYD data — this extends it to feed cards with a strict budget.
  Evidence: RatingBars (knoa, 4.0k), SSmJaE ratio display.
  Where: RYD feature block + card decoration pipeline (videoAgeColors pattern).
  Acceptance: Opt-in ratio bar on visible cards only (budgeted batch fetch, cached, degradation-aware); no fetch storm on feed scroll.
  Complexity: M
- [ ] P3 — Link hygiene: de-redirect + strip tracking params
  Why: Outbound description links route through youtube.com/redirect and share URLs carry ?si= trackers; cleaning both is cheap and on-brand for privacy.
  Evidence: Direct links out (nokeya, 36k), YouTube Link Cleaner (tfr, 4.5k).
  Where: description/comment link handling, share-panel hooks (shareMenuCleaner block).
  Acceptance: Redirect wrappers unwrapped to target URLs; si/pp params stripped from copied/share links; toggles independent.
  Complexity: S
- [ ] P3 — Absolute upload dates everywhere
  Why: "3 years ago" becomes an exact date on watch + feed cards; complements preciseViewCounts using the same data sources.
  Evidence: Display upload dates as absolute (InMirrors), Youtube exact upload (Wissididom).
  Where: preciseViewCounts block, card decoration pipeline.
  Acceptance: Watch page shows exact date+time where available; optional feed-card absolute dates; locale-formatted.
  Complexity: S
- [ ] P3 — Search-while-watching palette
  Why: Searching without interrupting playback (inline results panel) keeps the video playing; proven standalone script.
  Evidence: Youtube - Search While Watching Video (Cptmathix, 3.4k).
  Where: new feature; header search hook; results via existing page data (no new hosts).
  Acceptance: Optional panel shows search results over the watch page without navigation; opening a result uses openInNewTab or replaces the current video per setting.
  Complexity: M
- [ ] P3 — Background-tab resource unlock
  Why: YouTube holds IndexedDB/WebLocks that keep background tabs from sleeping; releasing them cuts battery drain and pairs with enableCPU_Tamer.
  Evidence: Unhold YouTube Resource Locks (CY Fung, 3.9k).
  Where: MAIN-world bridge, gated by an enableCPU_Tamer-style opt-in.
  Acceptance: With toggle on, background watch tabs release locks (unit-level lock accounting + documented manual verification); no playback regression on foreground return.
  Complexity: M
- [ ] P3 — Maintenance action: reset stale YouTube local state
  Why: Corrupt yt.config/localStorage state causes layout breakage users blame on extensions; a one-click scoped reset is a support tool.
  Evidence: Reset YouTube Settings (CY Fung).
  Where: popup Maintenance disclosure, diagnostics module.
  Acceptance: Button clears documented YouTube localStorage/sessionStorage keys (never Astra settings) with toast + Undo snapshot; logs what was cleared.
  Complexity: S
