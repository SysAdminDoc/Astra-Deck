# Roadmap — Astra Deck

## Research-Driven Additions

### P0 — Critical / Root-Cause

### P1 — Trust / Reliability / Distribution

(CWS submission, AMO submission, companion binary release moved to Roadmap_Blocked.md — require manual external actions.)

### P1 — Accessibility

### P2 — Quick Wins / Enhancement

- [ ] P2 — Monolith decomposition: Download UI peel
  Why: Download popup, progress panel, health panel, stream links panel, and Cobalt fallback total ~1500 lines. They have clear boundaries and a single integration surface (`ytKitDownload`).
  Evidence: Download UI is the largest unpelled feature domain; `MediaDLManager` singleton is already semi-isolated.
  Touches: New `extension/features/download-ui/index.js`, `extension/ytkit.js`, `extension/manifest.json`
  Acceptance: Download flows work identically; monolith shrinks by ~1500 lines.
  Complexity: L

- [ ] P2 — Companion module split
  Why: `astra_downloader/astra_downloader.py` (5.3K lines) mixes Flask routes, Qt GUI, download management, yt-dlp subprocess control, config management, and health probes in a single file. Splitting improves testability and maintainability.
  Evidence: H26 audit noted threading concerns; `test_astra_downloader.py` must mock deeply to test individual concerns.
  Touches: `astra_downloader/astra_downloader.py` (split into `routes.py`, `downloader.py`, `gui.py`, `health.py`, `config.py`), `astra_downloader/test_astra_downloader.py`
  Acceptance: All 111 Python tests pass; companion starts and serves downloads identically; each module is independently importable for testing.
  Complexity: L

(Competitor migration docs and supply chain transparency docs moved to Roadmap_Blocked.md — require creating new markdown files.)

### P2 — Observability / Developer Experience

(Visual regression testing moved to Roadmap_Blocked.md — requires headless browser environment.)

### P3 — Later / Under Consideration

- [ ] P3 — SharedAudio port to extension (MAIN world audio processing)
  Why: volumeBoost, skipSilence, audioNormalization, and audioEqualizer are userscript-only because they require MAIN world Web Audio API access. Tweaks for YouTube ships compressor, auto gain, and pan in-extension. The MAIN world bridge (`ytkit-main.js`) already exists for codec filtering.
  Evidence: CLAUDE.md "Not Yet Ported to Extension" section; Tweaks for YouTube features page lists advanced audio processing.
  Touches: `extension/ytkit-main.js` (MAIN world audio graph), `extension/ytkit.js` (data-attribute bridge), `extension/manifest.json`
  Acceptance: At least volumeBoost and audioNormalization work in the extension build via MAIN world bridge; feature toggles in settings panel.
  Complexity: XL



(Chrome Writer/Rewriter API moved to Roadmap_Blocked.md — API still in Developer Trial, not stable.)

## Research-Driven Additions (June 2026 Cycle 2)



### P2 — Quick Wins / Enhancement


(Selector fixture refresh moved to Roadmap_Blocked.md — requires live browser MHTML capture.)


### P2 — Observability / Developer Experience

### P3 — Later / Under Consideration

## Research-Driven Additions (June 2026 Cycle 3)

### P1 — Security / Reliability





### P2 — Quick Wins / Enhancement


- [ ] P2 — Subscription group features: port to userscript
  Why: Subscription groups (nesting, digest, stale-channel staging, CSV export, queue playback) are extension-only. The userscript has 65% feature parity; subscription management is a high-value gap alongside SponsorBlock.
  Evidence: `check-userscript-drift.js` reports 144/221 (65%) parity; `YTKit.user.js` has no `subscriptionGroupData` or group toolbar code.
  Touches: `YTKit.user.js`, `sync-userscript.js`
  Acceptance: Userscript renders group toolbar on /feed/subscriptions, supports create/edit/filter/sort, persists via GM_setValue.
  Complexity: L

### P2 — Observability / Developer Experience


### P3 — Later / Under Consideration

- [ ] P3 — Companion native-messaging token bootstrap
  Why: The current token exchange (extension reads `/health` with `X-MDL-Client` header) works but relies on the loopback network. Native messaging provides a direct, DNS-rebinding-immune channel for token exchange.
  Evidence: `docs/native-messaging-token-bootstrap.md` design doc exists. The companion Flask server already validates tokens via `hmac.compare_digest`.
  Touches: `astra_downloader/astra_downloader.py` (native messaging host), `extension/manifest.json` (nativeMessaging permission), `extension/background.js` (native messaging handler)
  Acceptance: Extension discovers companion token via native messaging when available, falling back to `/health` probe.
  Complexity: L


