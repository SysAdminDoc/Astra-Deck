# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope, and `gh release view v4.50.7` shows `AstraDownloader.exe` + `AstraDownloader.exe.sha256` already attached to that release. Only the clean-Windows-machine verification half remains blocked. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (~1.3K stars, both store listings) and BlockTube is effectively stalled (last push 2026-02-07, 484 open issues, including a MV3 service-worker-suspension defect). Astra already ships BlockTube-grade filtering, so a BlockTube migration guide is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

## Research-Driven Additions — 2026-08-02

Source evidence and rejected alternatives: `RESEARCH.md` (2026-08-02). Baseline at research time was fully green (1272 JS tests, 356 Python tests + 131 subtests, `npm audit` zero advisories at every severity, ESLint clean), so every item below is a latent gap rather than a broken gate. Does not duplicate the 28 items in `Roadmap_Blocked.md`.

### P0 — Delivery

### P2 — Locale fidelity, capability, and maintainability

- [ ] P2 — Playlist power pack
  Why: Duration sorting, per-playlist resume, and auto-skip-watched are user-selected actions/policies that need clear accessible controls in the existing Playlist Enhancer toolbar.
  Evidence: Sort Youtube Playlist by Duration (KohGeek), playlists playback tracker (andrybak), Playlist Auto Skip Watched (neverlandeverland).
  Touches: playlistEnhancer runtime, resume storage, settings/localized UI copy.
  Acceptance: The playlist panel offers duration sort and last-video resume; an explicit persisted option auto-skips entries watched at least 90%.
  Complexity: M

### P3 — Under consideration

- [ ] P3 — Parametric EQ on the audio graph
  Why: rounds out the audio chain alongside the auto-gain/high-pass work currently in `Roadmap_Blocked.md` and the audio-sync item above; a `BiquadFilterNode` chain reuses the same reconnect-safe graph. Lower value than audio sync — cited by one competitor (Zenith), not a recurring request.
  Evidence: `extension/ytkit-main.js:586-594` (no `createBiquadFilter`); https://alternativeto.net/software/iridium-by-particlecore/.
  Touches: `extension/ytkit-main.js`, `extension/core/audio-track.js`, settings schema and locales.
  Acceptance: an off-by-default 3-to-5-band EQ applies live, never double-connects across SPA navigation, and is bypassed (not merely flat) when disabled.
  Complexity: M

- [ ] P3 — SponsorBlock segment submission and voting
  Why: Astra reads the SponsorBlock commons (`skipSegments` GET only) with no path to contribute, and reviewers of competing tools repeatedly ask for a local correction path when a segment is wrong. DeArrow voting and casual mode are already shipped, so the UI precedent exists.
  Evidence: `extension/features/sponsorblock/index.js:242-306` (read-only); `extension/ytkit.js` `deArrowVoting` / `casualMode` precedent; https://github.com/ajayyy/SponsorBlock/issues.
  Touches: `extension/features/sponsorblock/index.js`, `extension/core/credential-vault.js` or a new durable domain for the private user ID, `extension/core/data-flow.js`, settings schema and locales.
  Acceptance: off by default and GitHub-full only; a locally generated private user ID is stored in a backup-excluded, scrub-covered domain; voting works before submission is enabled; every write is rate-budgeted and surfaces failures through `external-api-health`.
  Complexity: L
  Note: gated on the Open Question in `RESEARCH.md` — whether Astra should carry submission at all, versus voting only. Decide that before implementing.

- [ ] P3 — Adopt the Navigation API for SPA route detection
  Why: route detection currently hooks `yt-navigate-finish`, `yt-page-data-updated`, `popstate` and `video-id` attribute changes — four YouTube-specific signals that have each broken before. The Navigation API became Baseline on 2026-01-13 and gives a platform-owned, YouTube-independent signal.
  Evidence: `extension/core/navigation.js`; https://webstatus.dev (Navigation API, newly available 2026-01-13).
  Touches: `extension/core/navigation.js`, `tests/long-session.test.js`.
  Acceptance: the Navigation API drives route dispatch where available, with the existing YouTube-event path retained as fallback; `tests/long-session.test.js` still passes its 1000-cycle observer and cleanup assertions under both paths.
  Complexity: M

- [ ] P3 — List (row) feed layout
  Why: the single most-upvoted open request on ImprovedTube. Astra ships Compact Layout, Videos Per Row and Dense Mode, which tune the grid but do not offer a row layout with metadata beside the thumbnail — a genuinely different information density, not a smaller grid.
  Evidence: https://github.com/code-charity/youtube/issues/3593 (19 reactions); `extension/features/home-subs-css/index.js` and `denseMode` cover grid density only.
  Touches: `extension/features/home-subs-css/index.js`, `extension/early.css`, settings schema and locales.
  Acceptance: an off-by-default layout renders home, subscriptions and search cards as rows with thumbnail-left / metadata-right, survives Polymer re-render, and is mutually exclusive with Videos Per Row through `CONFLICT_MAP`.
  Complexity: M

- [ ] P3 — Per-participant blocking on multi-uploader cards
  Why: a card crediting two or more channels evades per-channel blocking entirely, so a blocked channel reappears whenever it collaborates. Astra can hide collaborations wholesale but cannot block one participant. Filed against BlockTube 2026-07-17 and unfixed there.
  Evidence: https://github.com/amitbl/blocktube/issues; `extension/features/video-hider/index.js` `_isChannelBlocked` matches a single channel identity key per card.
  Touches: `extension/features/video-hider/index.js` (channel extraction + `_channelKeyCache`), `extension/ytkit.js` twin, `tests/features/video-hider.test.js`.
  Acceptance: channel extraction returns every credited channel for a card; the card is hidden when any credited channel is blocked; the existing precomputed key-set lookup stays O(1) per card and the allowlist override still wins.
  Complexity: M

- [ ] P3 — Buffer / preload control
  Why: a long-standing request on ImprovedTube; playback stalls on constrained connections are a recurring complaint and YouTube exposes no user control.
  Evidence: https://github.com/code-charity/youtube/issues/581 (13 reactions).
  Touches: `extension/ytkit-main.js` (MAIN-world player bridge), settings schema and locales.
  Acceptance: an off-by-default control raises the player's buffer target where the player API allows it, no-ops with a recorded degradation reason when the expected API shape is absent, and never changes behaviour on live streams.
  Complexity: M
