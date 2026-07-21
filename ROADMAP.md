# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

## Research-Driven Additions — 2026-07-09 (userscript competitive sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-09). Extension-first; userscript parity intentionally excluded. Every mutation feature must reuse the bulkCardActions bounded-session + Undo pattern and external-api-health degradation surfaces.

### P1 — root-cause reliability + highest-demand gaps

### P2 — live tooling, subtitles, filtering, hygiene

### P3 — insights, hygiene, and smaller bets
## Research-Driven Additions

### P0 — Now: lockout, data integrity, and vulnerable floors

### P1 — Next: recoverable runtimes, releases, and shared state

### P2 — Later: boundary fidelity, localization, and enforceable filtering

### P3 — Under consideration: validated viewer differentiators

## Research-Driven Additions — 2026-07-14 post-hardening refresh

### P0 — Release and workstation safety

### P1 — Security, data safety, and runtime correctness

### P2 — Resilience, accessibility, and maintainability

## Deep-audit backlog — 2026-07-15 (verified, unfixed)

## Deep-audit backlog — 2026-07-20 (companion pass, verified, unfixed)

## Research-Driven Additions — 2026-07-20 (competitive + yt-dlp ecosystem sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-20). Most competitor breadth is already shipped; these are the verified remaining gaps. Extension features reuse the external-api-health/degradation-surface pattern with per-feature auto-disable-on-DOM-miss.

### P1 — Extraction resilience (only category at risk of total failure)

- [ ] P1 — Token-exempt client fallback chain when PO tokens are unavailable
  Why: YouTube enforces PO tokens for the default `web`/`mweb` clients (SABR-only or HTTP 403 without them); the companion consumes a bgutil provider when present but has no fallback, so a missing/failed provider or a flagged residential IP means downloads fail entirely instead of degrading.
  Evidence: yt-dlp PO-Token Guide (client exemption table — `tv`/`android_vr`/`web_embedded` currently token-exempt); `astra_downloader/health.py:118` `build_youtube_extractor_args` (no `player_client` arg); grep found no `android_vr`/`player_client` fallback.
  Touches: `astra_downloader/health.py` (extractor-arg builder), `astra_downloader/download.py` (arg assembly ~1023-1078), companion health/readiness surfacing, `astra_downloader/test_astra_downloader.py`.
  Acceptance: when the PO-token provider probe is not `ok`, the download argv adds `--extractor-args "youtube:player_client=tv,android_vr,web"` (or equivalent exempt-first chain); a unit test asserts the fallback clients are added only when the provider is unavailable and omitted when it is `ok`; the dashboard reflects which client path is active.
  Complexity: M

### P2 — Provider provisioning

- [ ] P2 — Auto-provision the bgutil PO-token provider the way Deno is provisioned
  Why: Deno is already auto-provisioned (`DENO_ZIP_URL`, `DenoProvisionError`) but the PO-token provider is "Optional" and left to the user, so token-gated downloads and bot-check bypass silently degrade out of the box; the Rust single-binary provider (`bgutil-ytdlp-pot-provider-rs`) can be fetched and checksum-verified like Deno without a Node sidecar.
  Evidence: RESEARCH.md 2026-07-20 §Security/Reliability; https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs; `astra_downloader/astra_downloader.py:217-221` (Deno provisioning), `astra_downloader/health.py:289` `PoTokenProviderProbe`.
  Touches: `astra_downloader/astra_downloader.py` (provisioning + SetupWorker), `astra_downloader/health.py` (probe/launch), config/GUI readiness, checksum verification (reuse the existing `checksums.sha256`/exact-asset pattern), tests.
  Acceptance: first-run setup optionally fetches and checksum-verifies the single-binary provider, launches it on the existing loopback provider port, and the readiness dashboard shows "PO provider: Ready"; failure is non-fatal and surfaced, and the download path uses the provider when live.
  Complexity: L

### P3 — Hardening + small verified viewer gaps

- [ ] P3 — Enforce a minimum FFmpeg version floor in the readiness probe
  Why: FFmpeg is downloaded as "latest" and checksum-verified, but a stale FFmpeg selected from PATH is not rejected; CVE-2026-8461 (MagicYUV decoder RCE, CVSS 8.8) is fixed in FFmpeg ≥ 8.1.2 and the RV60 OOB-read cluster affects 8.0/8.0.1.
  Evidence: https://www.ffmpeg.org/security.html; `astra_downloader/health.py` `FfmpegCapabilitiesProbe`/`parse_ffmpeg_major`.
  Touches: `astra_downloader/health.py` (add a `FFMPEG_MIN_VERSION` floor to the capabilities probe), readiness surfacing, tests.
  Acceptance: the FFmpeg readiness probe reports a warning/degraded state (with the detected version) when the resolved FFmpeg is below the floor; a unit test covers a below-floor and an at-floor build.
  Complexity: S

- [ ] P3 — Exact (non-rounded) view/like/comment counts
  Why: Astra surfaces exact dislike counts via its Return-YouTube-Dislike integration but leaves YouTube's rounded "1.2M" view/like/comment labels; exact counts are a recurring viewer-side ask and a paywalled creator-tool feature.
  Evidence: https://github.com/Shraymonks/YouTube-Exact-Like-Count; YouTube Redux (precise like/dislike values); grep found no `exactCount`/`preciseCount` setting.
  Touches: `extension/ytkit.js` (or a small `extension/features/*` module), `extension/default-settings.json` (new off-by-default setting + i18n copy), locale catalogs, i18n coverage/copy gates.
  Acceptance: with the setting on, view/like/comment counts render un-abbreviated (from the player/metadata response, not by re-parsing "1.2M"); off by default; auto-disables and reports degradation if the source field shape drifts.
  Complexity: M

- [ ] P3 — Copy video URL at the current timestamp
  Why: quick, high-demand viewer utility absent from Astra's video context menu; competitors expose it as a one-click/hotkey action.
  Evidence: YouTube-Enhancer (VC fork) "copy URL with timestamp"; grep found no `copyTimestamp`/`urlWithTimestamp` setting or menu action.
  Touches: `extension/features/*` video context-menu surface (reuse the existing Video Context Menu), `extension/default-settings.json`, locales.
  Acceptance: a context-menu/action item copies `https://youtu.be/<id>?t=<seconds>` for the currently playing video at the current position; verified on a standard watch page; respects the existing menu enable/disable settings.
  Complexity: S

- [ ] P3 — Scroll-over-volume-area to adjust volume
  Why: scroll-to-change-volume was removed in the 2025 YouTube redesign and is a common restore in Enhancer/Iridium; Astra has volume boost but not this interaction.
  Evidence: RESEARCH.md 2026-07-20 §Competitive Landscape (Enhancer/Iridium; 2025 redesign complaint threads); grep found no `scrollVolume`/`wheelVolume` setting.
  Touches: `extension/features/*` player interaction module, `extension/default-settings.json`, locales.
  Acceptance: with the setting on, wheel events over the player volume area adjust volume in fixed steps without page scroll; off by default; auto-disables on player-DOM miss.
  Complexity: M
