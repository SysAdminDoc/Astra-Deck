# Astra-Deck — Roadmap

> **Version:** v3.22.0 — last updated 2026-05-17
> **Charter:** hardening-first, with selective new features when well-scoped
> and low-blast-radius. Ongoing audits (security, observability, resilience,
> a11y, testability, distribution, infrastructure) remain in scope by default.
> New user-facing features land when they cleanly extend an existing surface,
> require no new persistent backend, and pass the maintainer's quality bar —
> the recent v3.20.6 → v3.22.0 wave (native folder picker, player speed
> control, reaction spammer, 10-locale i18n) is the precedent.
>
> **This document supersedes the prior `roadmap.md` (last updated 2026-04-26
> at v3.20.5).** Item statuses and tiers are reconciled against actual
> shipped state in v3.20.6 → v3.22.0. Every Now/Next/Later/Under-
> Consideration/Rejected entry traces to a source in the **Appendix** —
> items without sources are not allowed.

---

## Reading this document

| Tier | Meaning |
|---|---|
| **Now** | Active queue, targeted for the next patch release. P0/P1 — landed within ~2 weeks. |
| **Next** | Queued behind Now. Lands once Now drains. P2 — 2–6 weeks out. |
| **Later** | Backlog. Real value but low urgency. Quarterly review. |
| **Under Consideration** | Would expand the surface area beyond the current charter (new persistent backend, large new feature domain, divergent extension/userscript paths). Tagged `CHARTER-REVIEW:` so the maintainer can decide whether to lift the scope. Default: deferred. |
| **Rejected** | Considered and explicitly declined. Reason recorded so future research passes don't silently resurrect them. |

**Charter test for any new item:** if it hardens, observes, makes resilient,
documents, packages, fixes a bug in something already shipped, or adds a
small contained capability that extends an existing surface (e.g. a new
toggle, a new locale, a new format option), it can land in Now/Next/Later.
If it requires a new persistent backend, a new feature domain, a new
divergent userscript/extension path, or contradicts a documented design
decision, it goes to **Under Consideration**.

---

## Recently shipped (since prior roadmap)

The prior roadmap was cut at v3.20.5 (2026-04-26). The wave below covers
tags **v3.20.6 → v3.22.0** between 2026-04-29 and 2026-05-10. The v3.20.5
release itself absorbed Hardening Passes 12–18 from the prior roadmap's
"unreleased" status into a single shipped tag.

| Tag | Theme | Items |
|---|---|---|
| `v3.20.5` | Pass 12–18 release cut | N1 settings-import migration; NX6 round-trip fixtures; NX3 SponsorBlock stale cache; NX4 selector canary overlay tier; NX7 storage-sync byte audit; NX1 i18n scaffold + `check-i18n.js` gate; L1 ESLint `no-post-await-addlistener`; L9 DiagnosticLog clear button; L7 WCAG 2.2 AA full audit (`check-contrast.js` + `audit-popup-a11y.js`); N3 popup modal a11y; live-chat author spacing fix. [src-shipped-1] |
| `v3.20.6` | Downloads | Native folder picker via downloader v1.2.2 `POST /pick-folder`; download popup "Save to" row reads server config in camelCase; "Change" button flips to "Reset" with custom path. [src-shipped-2] |
| `v3.20.7` | Downloads | Surface skipped re-downloads — amber `skipped` state pill + toast with server reason ("Already in download archive…"). Pairs with downloader v1.2.3. [src-shipped-3] |
| `v3.20.8` | Downloads | Re-downloads always run — server archive lock removed in downloader v1.3.0. `skipped` handler kept defensively. [src-shipped-4] |
| `v3.20.9` | Player | Speed control chip button in player chrome between Download and Settings; 5×2 grid of speeds 0.25× → 3×; wires into existing `persistentSpeed`. [src-shipped-5] |
| `v3.21.0` | i18n | Simplified Chinese (`zh_CN`) locale, 208 keys; `t(key, fallback)` helper in popup.js + ytkit.js; HTML `data-i18n` attributes; popup language dropdown; `_localeOverride` storage key; `scripts/extract-i18n-keys.js`. [src-shipped-6] |
| `v3.21.1` | UI polish | Style the language dropdown (dark-themed select frame). [src-shipped-7] |
| `v3.21.2` | UI polish | Relocate language selector inline with Export/Import. [src-shipped-7] |
| `v3.22.0` | i18n | 8 more locales (`de`, `es`, `fr`, `it`, `ja`, `ko`, `pt_BR`, `ru`) at ~199 keys each; `scripts/generate-locales.js`; "Auto (browser default)" option shows detected language inline. 10 bundled locales total. [src-shipped-8] |

Test count trajectory: 152 tests at v3.20.5 release; subsequent ship items
added popup + i18n + speed-control regressions (count to be reconciled at
the next release cut). 0 npm audit vulnerabilities at every pass.

**New surface area introduced (not previously inventoried in roadmap):**

- `extension/_locales/<lang>/messages.json` × 10 locales (~6,500 LOC of translation tables).
- `YT_Reaction_Spammer.user.js` v0.2.0 standalone userscript, plus
  `extension/ytkit.js` integration (default-settings.json:
  `reactionSpammer: true`).
- `astra_downloader/astra_downloader.py` v1.3.0 — archive lock removed,
  native folder-picker endpoint, codec-aware format selector
  (`build_video_format_args(container, quality)`), camelCase config wire.

---

## Now (P0/P1, targeted next release)

Six items. Each is ≤2 days of focused work, traces to ≥1 external source or
local artifact, and either patches a real correctness/security risk or
unblocks downstream work.

### N1. Downloader: integrate `bgutil-ytdlp-pot-provider` for PO Token

- **Status:** Completed (downloader-side). `probe_po_token_provider()`,
  `is_youtube_url()`, and `build_youtube_extractor_args()` shipped in
  `astra_downloader.py`; `/health.poTokenProvider` populated; yt-dlp
  invocation appends the `youtubepot-bgutilhttp:base_url=...` extractor-arg
  when the provider is reachable; downloader bumped to v1.4.0;
  `tests/test_astra_downloader.py` adds 8 regressions; README adds the
  docker install snippet. Acceptance item 3 (extension popup amber pill)
  deferred to a follow-up since it requires extending the popup health
  banner past the current TrustedTypes-only render path.
- **Severity:** Critical platform-drift. YouTube has bound PO Tokens to
  video ID in 2026; manual extraction is deprecated. Without a PO Token
  provider, yt-dlp invocations of the `web` client increasingly fail
  with "Sign in to confirm you're not a bot." [src-yt-po] [src-yt-sabr]
- **Files:** `astra_downloader/astra_downloader.py` (request builder +
  health-endpoint surface); `astra_downloader/requirements.txt`
  (optional Docker / CLI launch hint); `README.md` (PO Token install
  one-liner).
- **Goal:** Astra Downloader auto-detects a running PO Token provider on
  `127.0.0.1:4416` (the bgutil default), surfaces its health alongside
  `/health`, and adds the appropriate `--extractor-args
  youtube:po_token=…` invocation when available. When absent, fall back
  gracefully and surface a one-line popup notice in the download panel.
- **Acceptance:**
  1. New `astra_downloader.health` field
     `poTokenProvider: { ok, version, port } | null` populated on every
     health probe.
  2. Download request appends PO-Token args when provider is healthy.
  3. Extension popup health banner gains an amber "PO Token provider not
     detected — some YouTube videos may fail" pill when the downloader
     reports the provider absent.
  4. README install section gains a "PO Token provider (optional but
     recommended)" callout with the docker-compose snippet from upstream.
  5. Regression in `test_astra_downloader.py` for the
     provider-detection branch.
- **Rollback:** revert provider detection, restore prior request builder.
- **Sources:** [src-yt-po] yt-dlp PO Token Guide; [src-yt-bgutil]
  bgutil-ytdlp-pot-provider; [src-yt-sabr] yt-dlp PR #13515.

### N2. Downloader: enable SABR-aware format selection

- **Status:** Completed. `build_youtube_extractor_args()` now always emits
  `--extractor-args youtube:formats=duplicate` for YouTube URLs regardless
  of PO Token provider state; the codec-aware `-f` cascade in
  `build_video_format_args` picks HTTPS when present, SABR otherwise.
  Three additional regressions in `tests/test_astra_downloader.py`.
- **Severity:** Platform-drift. The `web` client's `adaptiveFormats` no
  longer ships playback URLs — only the SABR handshake works. Astra
  Downloader's default format pipeline silently breaks on videos that
  have transitioned to SABR-only. yt-dlp PR #13515 ships the native
  SABR downloader; activating it is a 2-line `extractor_args` change.
  [src-yt-sabr]
- **Files:** `astra_downloader/astra_downloader.py` (yt-dlp args
  builder — extend `build_video_format_args` to pass
  `--extractor-args youtube:formats=duplicate` so both HTTPS and SABR
  format families are returned; pick HTTPS when present, SABR
  otherwise).
- **Goal:** No silent download failures on SABR-only videos; users see
  successful download whether the server returns SABR or legacy HTTPS
  adaptiveFormats.
- **Acceptance:**
  1. `build_video_format_args` includes the SABR extractor arg.
  2. A new test feeds a fixture that includes SABR-only formats and
     asserts the downloader picks the SABR format and completes.
  3. Codec-aware preference order (AVC1 / VP9 / fallback) preserved on
     both format families.
- **Rollback:** drop the extractor arg.
- **Source:** [src-yt-sabr].

### N3. Reaction-spammer: default OFF, add cooldown floor + soft cap

- **Status:** Completed. `extension/default-settings.json` flips to
  `reactionSpammer: false` + `_reactionSpammerAck: false`;
  `SETTINGS_VERSION` 6 → 7 with migration 7 force-resetting both keys (we
  cannot distinguish "user explicitly opted in" from "default-merge
  populated true" given the one-week v3.22.0 window, so force-reset is the
  conservative choice); `_INTERVAL_MIN_MS` 500 ms in
  `extension/ytkit.js`; same floor in `YT_Reaction_Spammer.user.js` v0.3.0
  via `MIN_INTERVAL_MS`; one-shot warning toast on first launcher open
  via `_maybeShowFirstUseWarning`; round-trip fixtures cover v1-v6; four
  regressions in `tests/hardening.test.js`; storage-size test deltas
  adjusted (UI prefs 7672 → 7701 bytes, typical local 173952 → 173981).
- **Severity:** Real UX/safety regression. The reaction spammer ships
  default-ON in v3.22.0 (`default-settings.json` line 53:
  `"reactionSpammer": true`). The feature blasts emoji reactions at a
  user-set interval. YouTube's automated-behavior heuristics on live
  chat could rate-limit or flag accounts — defaulting it ON opts every
  user into that risk without consent. The underlying userscript also
  has no soft floor on the interval.
- **Files:** `extension/default-settings.json`,
  `extension/ytkit.js` (settings migration v6 → v7 turns the key off
  but preserves existing user value),
  `YT_Reaction_Spammer.user.js` (cooldown floor),
  `extension/ytkit.js` reaction-spammer integration (warning pill if
  interval < floor).
- **Goal:** Default OFF; minimum interval 500 ms (current default is
  600 ms); first activation in the UI shows a one-time toast "Note:
  YouTube may rate-limit rapid reactions."
- **Acceptance:**
  1. `reactionSpammer: false` in default-settings.json + new
     `SETTINGS_VERSION 7` migration that preserves user value if
     previously set, otherwise leaves false.
  2. Userscript clamps `intervalMs >= 500`.
  3. `ytkit.js` launcher shows a one-shot toast (stored as
     `_reactionSpammerAck`) on first toggle-on per profile.
  4. Two regressions in `tests/hardening.test.js`: migration preserves
     user-toggled-true; cold install gets false.
- **Rollback:** revert to v6 schema; remove userscript clamp.
- **Sources:** [src-loc-default-settings] line 53;
  [src-loc-reaction-spammer] `YT_Reaction_Spammer.user.js`.

### N4. Doc + version drift sweep

- **Status:** Completed. README badge v3.20.5 → v3.22.0; README intro
  paragraph names player speed control, reaction spammer (opt-in), and
  10 locales; new "Languages" section lists the bundled locales table;
  Security section's CSP line reflects the new `connect-src` allowlist;
  feature tables add Speed Control Chip + Reaction Spammer rows.
  CONTRIBUTING.md "YTKit" → "Astra Deck" replace-all; project-structure
  block rewritten to reflect retired options page, new `_locales/`
  directory, scripts directory contents, and the standalone userscripts.
  HARDENING.md header rewritten to "v3.14.0 → v3.23.0" with cumulative
  Pass 19 (H20-H21) preamble noting H1-H19 covered prior passes.
  `roadmap.md` was already superseded by `ROADMAP.md` in the iter-5
  commit.
- **Severity:** Sustained doc drift across four artifacts. Past Pass 18
  already audited HARDENING.md but the README badge and CONTRIBUTING.md
  still reference stale state. Cheap fixes; high user-perceived
  freshness signal.
- **Files:**
  - `README.md` — version badge `v3.20.5` → `v3.22.0`; refresh feature
    table to include i18n + speed control + reaction spammer.
  - `CONTRIBUTING.md` — "YTKit" → "Astra Deck" globally;
    `extension/options.*` reference removed (retired v3.19.0); rename
    `CODEX-CHANGELOG.md` reference per gitignore.
  - `HARDENING.md` — header dates back to v3.14.0 → v3.15.0; rewrite
    top-of-file index to reflect H1–H19 cumulative state.
  - `roadmap.md` — replaced by this document (case-rename on Windows
    no-op; verify `git mv` records the rename).
- **Goal:** All four canonical docs reflect v3.22.0 truth.
- **Acceptance:**
  1. README badge URL points at `v3.22.0`.
  2. `rtk grep -n "YTKit"` returns zero hits in CONTRIBUTING.md
     (allowed only in legacy filenames like `YTKit.user.js`).
  3. HARDENING.md table-of-contents lists H1–H19 with one-line summary.
  4. `git log --diff-filter=R --follow ROADMAP.md` shows the rename.
- **Rollback:** revert documents to v3.20.5 state.
- **Sources:** [src-loc-readme]; [src-loc-contributing];
  [src-loc-hardening].

### N5. CSP `connect-src` allowlist on extension pages

- **Status:** Completed. `extension/manifest.json` CSP extended with the
  full host_permissions allowlist (3 AI providers, SponsorBlock, 6
  downloader fallback ports, Ollama); positive + negative regression in
  `tests/hardening.test.js`; `HARDENING.md` H20 logs the wire contract
  and rationale.
- **Severity:** Defense-in-depth gap. The current
  `extension/manifest.json#content_security_policy.extension_pages` is
  `script-src 'self'; object-src 'self';` — no `connect-src` directive.
  The popup currently fetches no external origins, but a future
  compromised content-script (or careless contributor) could exfiltrate
  via the popup without CSP friction. Hardening item; small,
  mechanical, well-understood. [src-mdn-csp]
- **Files:** `extension/manifest.json` (CSP string);
  `extension/popup.js` (verify no off-self fetches).
- **Goal:** CSP becomes
  `script-src 'self'; object-src 'self'; connect-src 'self'
  https://api.openai.com https://api.anthropic.com
  https://generativelanguage.googleapis.com https://sponsor.ajay.app
  http://127.0.0.1:9751 http://127.0.0.1:9761 http://127.0.0.1:9771
  http://127.0.0.1:9781 http://127.0.0.1:9791 http://127.0.0.1:9851
  http://127.0.0.1:11434;` matching the `host_permissions` allowlist for
  popup-originated fetches. (Content-script fetches use the EXT_FETCH
  SW proxy and are unaffected.)
- **Acceptance:**
  1. CSP string updated; popup still functions in Chrome + Firefox
     (export/import + reset + storage stats).
  2. Regression in `tests/hardening.test.js` pins the CSP shape.
  3. Document the policy in `HARDENING.md` H20.
- **Failure modes:** CSP too strict and breaks a popup feature using
  off-self origin (mitigation: integration smoke before push).
- **Sources:** [src-mdn-csp] MDN CSP `connect-src`;
  [src-loc-manifest] current `extension/manifest.json` line 153.

### N6. YouTube "liquid glass" player redesign — selector audit

- **Status:** Partial — research + scaffolding only. The pass can't capture
  fresh MHTML of the new chrome from this environment, so the concrete
  selector promotion (acceptance criteria 1–3) is pending a maintainer
  browser session. What landed: a `LIQUID_GLASS_WATCHLIST` placeholder
  array in `tests/selector-regression.test.js` (informational, asserts
  only its non-emptiness), an extended comment in `CRITICAL_SELECTORS`
  documenting the transition-window semantics (keep old + new both), and
  `HARDENING.md` H21 with the rollout context, list of affected
  Astra-Deck features, and a six-step next-action checklist for the
  maintainer.
- **Severity:** Real platform-drift; rollout has begun globally and
  every observer reports the new chrome (pill action container, smaller
  skip animation, no-dim-on-pause). Astra-Deck has many feature
  overlays attached to specific selectors of the old player chrome
  (`.ytp-chrome-bottom`, `.ytp-time-display`, etc.). Without a selector
  audit we get silent breakage on a subset of users on the new chrome.
  [src-yt-redesign-1] [src-yt-redesign-2]
- **Files:** `tests/fixtures/*.tokens.txt` (regenerate from fresh
  `mhtml/*.mhtml` captures of the new player); update Pass 18
  18-selector canary list to include any net-new player chrome
  selectors; `extension/ytkit.js` feature overlays for items affected.
- **Goal:** Astra-Deck's player overlays render correctly on the new
  player chrome; the selector canary has both old and new selectors
  pinned as a transition fixture for the staged rollout.
- **Acceptance:**
  1. Fresh mhtml capture of new-chrome watch page committed (or its
     tokens extracted into a new fixtures file).
  2. Selector canary pins both old and new chrome selectors with a
     comment noting the rollout window.
  3. Manual smoke: video screenshot, mini-player bar, speed control
     chip button, theater split divider all render on the new chrome.
  4. Document the audit findings in `HARDENING.md` H21.
- **Rollback:** revert canary additions if the new selectors cause
  false negatives on users still on the old chrome.
- **Sources:** [src-yt-redesign-1] 9to5Google; [src-yt-redesign-2]
  TechSpot.

---

## Next (P2, queued)

Drains after Now. Each item still traces to a source and has a clear
acceptance criterion, but it's larger in effort, lower in urgency, or
gated on Now-tier work.

### NX1. SponsorBlock v6+ feature pass-through

Astra-Deck integrates SponsorBlock as a category-skip layer but does
not surface SB v6.0 features that have shipped in 2025–2026.
[src-sb-releases]

- **Channel Skip Profiles (v6.0)** — per-channel category overrides
  with "this video / this tab / next hour" temporary toggles. Expose
  the SB option in the in-page settings panel under SponsorBlock,
  routing through the existing SB config object.
- **OR operator + advanced expressions (v6.1)** —
  `video.duration > 1200` style conditional skips. Surface the textarea
  editor in the SB section.
- **Hook/Greetings category** (v5.14 split from Preview/Recap) — make
  sure our category toggle list includes the new category.
- **Acceptance:** three items land as three separate settings under
  `sbCat_*` + an advanced-expressions textarea; the existing hash-
  prefix privacy API path is unchanged. Verify the SB skip telemetry
  numbers still increment correctly per-category.

### NX2. DeArrow "Casual Mode" + thumbnail-submission flow surfaces

DeArrow v2.3.6 (April 2026) ships Casual Mode — keep original titles
where they're descriptive, vote per-category on title-fit, channel
trailer support, dual-case preview. Astra-Deck's DeArrow integration
needs the per-category toggle + "open submission UI" handoff button on
each watched video. [src-dearrow]

- **Acceptance:** new sub-settings under DeArrow (`deArrowCasualMode`,
  `deArrowCategoryGate`, `deArrowSubmissionShortcut`) with the same
  defaults as upstream; submission shortcut opens DeArrow's web UI in a
  new tab pre-populated with the current videoId.

### NX3. Firefox-Android XPI smoke test (carried from prior NX2)

Firefox 128+ Android ships full MV3. Astra-Deck has never been tested
there. Outcome is one of: "works as-is" / "fails on API X — feature
toggle / shim required" / "fails fundamentally — document as desktop-
only." Either way, README gains a definitive support-matrix entry.
[src-fx-mv3] [src-fx-android]

### NX4. Mozilla AMO unlisted listing for the Firefox XPI (carried NX5)

Self-distribution requires AMO signing for stable auto-update across
Firefox releases. Submit `unlisted`; 2–4 week review window. Charter-
compatible because the XPI content is unchanged — only the
distribution path. Mozilla's June 2025 policy update explicitly allows
self-hosted privacy policy + closed-group extensions, so this is now
lower-friction. [src-amo] [src-amo-policy-2025]

### NX5. ARIA live regions for SponsorBlock skip + DeArrow replace (carried L2)

- **Status:** Completed. New shared `announceA11y(message)` helper near
  `showToast` creates a single off-screen `aria-live="polite"` region
  with `role="status"` + `aria-atomic="true"` and re-uses it across
  announcements. SponsorBlock `_checkSkip` calls it with a human-
  friendly category label ("Skipped sponsor segment.", "Skipped intro
  segment.", etc.); DeArrow watch-page primary-title replacement
  announces "Title replaced by DeArrow: ..." gated on
  `isWatchPagePath()` and a `ytd-watch-metadata` ancestor check so the
  home-grid thumbnail processing never spams the screen reader. Three
  regressions in `tests/hardening.test.js`.

Currently silent on assistive tech. Adding an `aria-live="polite"`
status region announcing "Sponsor segment skipped" / "Title replaced
by DeArrow" closes a high-value a11y gap with a few lines of code.
[src-mdn-aria-live]

### NX6. Dependabot config (carried L3)

- **Status:** Completed. `.github/dependabot.yml` covers npm
  (extension), pip (astra_downloader), and github-actions (release
  workflow). Weekly cadence for npm/pip, monthly for GHA. Major
  version updates are ignored for the four upper-bound-pinned Python
  deps (PyQt6/flask/requests/waitress), ESLint, and crx3 — matches the
  existing `requirements.txt` ceiling policy.

We already run `npm audit --omit=dev` on every release; Dependabot
moves it earlier and adds Python `requirements.txt` tracking. Single
file `.github/dependabot.yml` with `package-ecosystem: npm` + `pip`
schedules. Pairs cleanly with the recent ESLint v9 → v10 EOL warning
(Aug 2026) [src-eslint-10]. [src-dependabot]

### NX7. YouTube Subscriptions list-view removal — verify Subs Grid still works

YouTube removed list-view from Subscriptions in Feb 2026, breaking the
`flow=2` URL workaround. Astra-Deck's `subscriptionsGrid` feature needs
verification against the post-removal layout; if it relied on
list-view as an intermediate state, fix the selector chain.
[src-yt-subs]

### NX8. YouTube Anti-Translate — auto-dubbed audio + auto-translated titles

Astra-Deck has `antiTranslate` (Wave 1) but the third-party "YouTube
Anti Translate" extension surfaces three distinct controls: disable
auto-translated titles, disable auto-dubbed audio, disable
auto-translated descriptions. Audit our current behaviour and surface
all three as sub-settings; the auto-dubbed-audio control is the user-
most-asked-for given the 2026 rollout of AI-dubbed YouTube content.
[src-yt-antitranslate] [src-yt-dubbing]

### NX9. Astra Downloader: declare `python_requires>=3.10`

- **Status:** Completed. Module-load hard-fail in
  `astra_downloader/astra_downloader.py` (`_MIN_PYTHON = (3, 10)`) so a
  3.9 host gets a clear stderr message instead of an opaque ImportError
  from a 3.10-only wheel later in bootstrap. Same guard in `build.py`.
  `requirements.txt` carries an explanatory comment block at the top
  documenting the floor + the upper-major-pin policy.

yt-dlp dropped Python 3.9 support in 2025.10.22. Astra Downloader's
build (`build.py` + bootstrap path) must reflect this. Update
`pyproject.toml` (if present) or `requirements.txt` comment, and
`build.py` PyInstaller flags accordingly. [src-yt-py310]

### NX10. Astra Downloader: ffmpeg 8.1.1 bundling + HLS handler smoke

- **Status:** Completed (scoped to capability audit; full HLS-handler
  invocation test deferred since yt-dlp owns the ffmpeg call path).
  `check_ffmpeg_capabilities()` + `parse_ffmpeg_major()` audit the
  bundled ffmpeg's major version with a `_FFMPEG_MIN_MAJOR = 7` floor.
  Snapshot/git builds (non-numeric versions) return `current=None`
  rather than false-alarming. Cached for an hour; result surfaced on
  `/health.ffmpegCapabilities` so the extension popup can render a
  "ffmpeg looks stale" pill. 5 new regressions in
  `test_astra_downloader.py::FfmpegCapabilitiesTests`. `FFMPEG_URL`
  remains pinned to `yt-dlp/FFmpeg-Builds/releases/download/latest/...`
  which currently resolves to ffmpeg 8.x; the audit catches drift if
  that ever changes.

FFmpeg 8.1.1 (Mar 2026) removed the legacy HLS protocol handler. Astra
Downloader bundles ffmpeg via the yt-dlp ffmpeg-builds URL. Pin to
ffmpeg-master-latest with explicit version check on bootstrap; add a
one-time smoke test on first run that runs `ffmpeg -protocols | grep
-i hls` and warns if missing. [src-ffmpeg-8-1]

### NX11. Astra Downloader: Flask cache-control hardening (CVE-2026-27205)

- **Status:** Completed. CVE structurally inapplicable (no
  `flask.session` usage anywhere — bearer-token auth only); pin
  `flask>=3.1.3,<4` lands defensively in `requirements.txt`. Every
  `cors_response` now emits `Cache-Control: no-store` and composes
  `Vary: Cookie` alongside the existing `Vary: Origin` so a future
  session-bearing variant doesn't ride a stale intermediary cache.
  Two regressions in `test_astra_downloader.py::CorsHeaderTests` pin
  the header presence in both the X-MDL-Client and extension-Origin
  paths. `HARDENING.md` H22 documents the rationale.

Flask ≤3.1.2 leaks session data via cache when `in` operator is used
on session keys without read/modify. Astra Downloader uses Flask 3.x;
audit session-touching endpoints, ensure `Vary: Cookie` is set on any
response that varies by session, and pin `flask>=3.1.3` in
`requirements.txt`. [src-cve-27205]

### NX12. Per-area regression-test fixtures (carried L4)

Migrate `extension/ytkit.js` (~38.6 K LOC) to per-area test fixtures
so the monolith can be audited per-feature without re-scanning every
line. Modularization sub-step, not a full split. Start with three
high-touch areas: DeArrow, SponsorBlock, Theater Split.
[src-loc-ytkit]

### NX13. Signing-key rotation policy doc (carried L6)

- **Status:** Completed. `docs/signing-keys.md` ships the policy:
  what `ytkit.pem` signs, why rotation matters, annual cadence with
  same-day rotation on leak, key generation procedure with extension-
  ID computation snippet, pre/rotation-day/post-rotation migration
  protocol, recovery procedure for both leak and loss, storage
  policy (never CI secret, never unencrypted cloud), CWS/AMO
  publication-path note, and the HARDENING.md audit-trail format.

`ytkit.pem` is the CRX3 signing key — gitignored and persistent.
Document rotation cadence (recommended yearly), the post-rotation
migration path (users on the old CRX get a one-time install dialog on
the new key), and a fallback recovery procedure if the key is ever
leaked. Pairs with the heightened CWS / AMO scrutiny on `downloads` +
`cookies` permissions in 2026. [src-cws-review]

### NX14. Reaction-spammer: surface in-feature warning + docs

- **Status:** Completed. Dedicated "Reaction Spammer" section in
  README.md between the Languages and main feature tables. Explains
  the two surfaces (bundled extension feature + standalone
  `YT_Reaction_Spammer.user.js`), the default-OFF stance, the rate-
  limit warning (and that the first-launcher-open toast surfaces it
  in-product), and the 500 ms interval floor enforced both sides.
  The in-feature toast (N3) is the runtime equivalent of this
  callout.

After N3 lands the default-OFF + cooldown floor, add a paragraph to
README explaining the feature, its risk profile ("YouTube may rate-
limit"), and that it's a userscript companion (not bundled into the
MV3 extension content script).

### NX15. Repo bloat audit (defer-blocked items)

The repo ships:

- `AstraDownloader.exe` (46 MB binary) committed at repo root.
- `archive/` with userscript versions v0.1.0 through v2.1.0
  (15 files).
- `mhtml/` directory with reference YT captures.
- `YTKit-v1.2.0.user.js`, `theater-split.user.js.bak`,
  `YTKit.user.js.bak`, `Install-YTYT.ps1` at the root.
- Loose `logo.png`, `AstraDownloader.ico` at the root.

Move `AstraDownloader.exe` to a Release-artifact-only path (it's
auto-built by `astra_downloader/build.py`); prune `archive/` to last 3
majors; document `mhtml/` as deliberately gitignored reference captures
(already partially the case); remove the `.bak` files; audit
`Install-YTYT.ps1` for current relevance (renamed app means this script
is likely obsolete). [src-loc-repo-root]

---

## Later (backlog)

Concrete value, low urgency. Each line is one item; effort estimates
relative to a focused half-day unless noted.

### Platform compliance & correctness

- **L1** Tampermonkey #2673 workaround — adopt the `Navigation API`
  (`navigation.addEventListener('navigate', ...)`) in the userscript
  build for SPA-reload self-detection, with the existing
  `yt-navigate-finish` listener as fallback. Closes the upstream "won't
  fix" with no charter conflict (it's correctness, not features).
  [src-tampermonkey-2673] [src-navigation-api]
- **L2** Chrome 138 `chrome.userScripts` toggle UX update — README
  install instructions need a one-line callout that the new per-
  extension toggle may be OFF for fresh installs on Chrome 138+. We
  don't use the API ourselves, but Astra-Deck's userscript companion
  routes through Tampermonkey/Violentmonkey which DOES. [src-chrome-userscripts]
- **L3** Firefox 148 Document PiP behind-flag verification — Astra-
  Deck's `popOutPlayer` uses `documentPictureInPicture`
  (`ytkit.js:19190`), which is gated behind `dom.documentpip.enabled`
  in Firefox 148 beta. Add detection and a Firefox-specific "enable
  `about:config` flag" callout if unavailable. [src-doc-pip]
- **L4** Firefox MV2 + blocking-webRequest path for ad blocking —
  Mozilla committed to keeping MV2 + blocking webRequest in Firefox
  indefinitely. Optional `manifest.firefox.json` MV2 companion would
  let us re-ship the userscript-only adblock surface to Firefox users.
  Sits behind UC3 (charter call). [src-fx-mv2-mv3]
- **L5** Wave 8/9 feature coverage audit (carried L10) — pick three
  features added in v3.16–v3.17 (e.g. `musicVideoSpeedLock`,
  `transcriptAiHandoff`, `playlistQuickRemove`) that lack regression
  tests; add tests. [src-loc-wave10]
- **L6** Storage write-race instrumentation (carried L8) — popup
  writes `hiddenVideos`/`blockedChannels`/`bookmarks` via direct
  `chrome.storage.local.set`; ytkit.js reads via `storage.onChanged`.
  Add a write-vector-clock so two near-simultaneous writes don't lose
  data. (No reproducer yet, no urgency.) [src-loc-popup-write]
- **L7** Greasy Fork mirror of `YTKit.user.js` (carried L5) — makes the
  userscript surface discoverable outside the GitHub release feed.
  Submit `--unlisted` (Greasy Fork's equivalent of AMO unlisted) so
  search hides it but direct URL works. [src-greasyfork]
- **L8** DNR `isUrlFilterCaseSensitive` audit — Astra-Deck does not
  currently use `declarativeNetRequest`. If we ever adopt it
  (e.g. for a community-blocklist subscription model, see UC8), the
  default flipped to `false` in Chrome 118+; remember to set explicit
  case-sensitivity per rule. [src-dnr-case]

### Observability

- **L9** Diagnostic-log export from popup — already partially shipped
  (Copy button). Add "Save as JSON file" alongside Copy via
  `chrome.downloads.download`. [src-loc-popup-clear]
- **L10** Telemetry-free crash badge — popup shows a small badge if
  `_errors` count > N in last 24 h. Currently popup surfaces only
  TrustedTypes-tagged failures (H4). Extend the filter to all
  diagnosticLog entries. Telemetry-free per charter.
  [src-loc-diagnostic]
- **L11** Feature-dependency graph — `CONFLICT_MAP` handles mutually
  exclusive features. There's no graph for features that REQUIRE other
  features (e.g. chapter-dependent features silently no-op if the
  source feature is off). Add a `requires` array on feature definitions
  and surface "X requires Y" in the settings panel.

### Accessibility

- **L12** Reduced-motion compliance — audit Astra-Deck's animations
  (toast slide-in, theater split divider drag, cinema ambient glow,
  blue-light fade, mini-player bar) against `prefers-reduced-motion:
  reduce`. Cinema ambient glow + nyan cat progress bar should hard-
  disable on reduced-motion. [src-mdn-reduced-motion]
- **L13** High-contrast theme — current dark theme is Catppuccin-ish;
  no native high-contrast mode. Audit popup color tokens against
  Windows High Contrast Mode + Forced Colors Media Query
  (`@media (forced-colors: active)`). [src-mdn-forced-colors]
- **L14** Screen-reader smoke checklist in CONTRIBUTING — NVDA / JAWS
  / VoiceOver one-page bring-up doc so future contributors can re-run
  the a11y baseline. NVDA is 65.6% share per WebAIM 2024 — minimum test
  target. [src-webaim-sr]

### i18n / l10n

- **L15** Bulk-translate the 150+ feature-definition entries in
  `ytkit.js` (each feature's name + description as shown in the in-page
  settings panel body). Currently hardcoded English; v3.21.0 scope
  covered popup + chrome only. Migration: extract to `messages.json`,
  machine-translate, human-review.
- **L16** RTL layout audit — install `_locales/ar/messages.json` stub
  + `dir="auto"` smoke; verify popup + in-page panel don't break. No
  Arabic translation in this pass — infrastructure only.
- **L17** CLDR 47 MessageFormat 2.0 — current `t(key, fallback)` helper
  doesn't use MF2 syntax. Migrate to MF2 only if/when a translator-
  contributed locale uses plurals/gender (today no bundled locale
  does). Track CLDR 48/49 and ICU 78/79 updates. [src-cldr-47]
  [src-icu-78]

### Distribution / packaging

- **L18** Sideloaded-CRX auto-update — GitHub Releases API check could
  surface new versions in-extension and link to the latest release.
  Pairs with the AMO-listed Firefox path (NX4 covers the Firefox half).
  [src-cws-update]
- **L19** CWS submission checklist documented in CONTRIBUTING — the
  CWS review backlog April 2026 means submissions take weeks;
  `downloads` + `cookies` + `tabs` + `webRequest` permissions trigger
  heightened scrutiny + mandatory privacy-policy declarations using
  Google's standardized vocabulary. Capture the submission protocol so
  a future maintainer can follow it. [src-cws-policies]

### Testing

- **L20** Playwright smoke harness — current selector regression uses
  MHTML token fixtures (cheap, static). Periodic Playwright smoke
  against a clean Chrome profile catches behaviour drift (selectors
  mutating but tokens still match). Run nightly via GitHub Actions;
  gates a release tag. [src-playwright]
- **L21** Userscript build coverage — `YTKit.user.js` is 14.5 K LOC
  generated from `extension/ytkit.js` via `sync-userscript.js`. No
  tests directly exercise the userscript output. Add a parity test
  that diffs the userscript build against expected shape post-
  conversion (GM_* shim insertion, `_rw.` removal). [src-loc-syncus]

### UX polish (small, contained)

- **L22** "Multi-select for playlists" inspired surface — most-praised
  YT extension on r/chrome_extensions per competitor research. Mass-
  add/cut/paste/delete across playlists. Bounded to playlist pages;
  reuses existing `playlistEnhancer` machinery. [src-multiselect]
- **L23** Sleep timer ("stop playback in N min") — NewPipe staple,
  one-toggle feature, zero dependency overhead. [src-newpipe]
- **L24** Per-channel volume memory — Magic Actions / ImprovedTube
  ship this; complements existing `rememberVolume` feature with per-
  channel granularity (using StorageManager + channel-handle key,
  capped at 500 entries like `perChannelSpeed`). [src-magic-actions]
- **L25** Frame-by-frame stepping button — small player-chrome
  addition; the `,` / `.` keyboard step already exists in YouTube
  itself, just surface a button in our chrome controls cluster.
  [src-improvedtube]
- **L26** Configurable custom speed presets — we ship a speed control
  popup with fixed 0.25× → 3× grid (v3.20.9). Add a setting to override
  the grid contents (4–8 user-supplied values). Alchemy ships this and
  it's the most-requested follow-on. [src-alchemy]
- **L27** "Maintain 1× for music videos" regression verification —
  Wave 10 `musicVideoSpeedLock` feature shipped in v3.17.0; verify
  still works after the v3.20.9 speed-control overhaul. Likely fine
  since both call `persistentSpeed`, but explicit test pin is cheap.
  [src-loc-wave10]
- **L28** Linkify timestamps in titles/descriptions/comments — click-
  to-seek when uploader hasn't formatted them as YouTube-recognized
  timestamps. [src-refined-github]
- **L29** "Open in alt-frontend" right-click menu — Invidious / Piped
  / FreeTube with a configurable instance URL. Charter test: this is a
  single new sub-toggle on the existing context menu, not a new feature
  domain. [src-freetube]
- **L30** Open-in-NewPipe intent link — for Firefox-Android users.
  Pure `intent://...` URL builder. Bounded. Depends on NX3 outcome.
  [src-newpipe]
- **L31** Restore the "Play all" button on channels / Shorts shelves /
  livestream rows where YouTube has removed it. Single feature toggle.
  [src-awesome-us]
- **L32** Hide notification badge as isolated toggle (currently
  bundled inside broader "hide notifications" controls). [src-unhook]
- **L33** "Always play from start" toggle (kills resume) — GoodTube
  paywalls this; we can ship free. Useful for music videos.
  [src-goodtube]
- **L34** Block-by-runtime filter on the video hider — hide videos
  under 60 s (Shorts that slipped past) or over 4 hours (asleep-at-
  the-wheel livestream VOD reuploads). [src-blocktube]
- **L35** Block specific commenter usernames or by content keyword in
  the comments stream — inverse of existing `commentSearch`.
  [src-blocktube]

### Astra Downloader power-user features

- **L36** Expose yt-dlp `--impersonate` flag in download options popup
  (TLS fingerprint dodging via `curl_cffi`). [src-curl-cffi]
- **L37** Expose yt-dlp `--throttled-rate` + `--http-chunk-size` in
  advanced settings. [src-yt-throttled]
- **L38** Subtitle download as discrete action (one-click .srt / .vtt
  / .ttml export — distinct from a full video download).
  [src-awesome-us]
- **L39** Free-text "Custom yt-dlp Options" advanced field — power-
  user escape hatch, disabled by default, JSON-validated. Mirrors
  MeTube's pattern. [src-metube]
- **L40** Astra Downloader queue UI + `MAX_CONCURRENT_DOWNLOADS` env
  var — currently downloads run inline. [src-metube]
- **L41** HTTPS support for Astra Downloader local server via
  `CERTFILE` / `KEYFILE` env vars (currently HTTP-only). [src-metube]
- **L42** CORS knob — let other browser extensions or local web apps
  post to Astra Downloader's REST API. [src-metube]

---

## Under Consideration (CHARTER-REVIEW)

Items that would expand the surface area beyond the current charter
(new persistent backend, new feature domain, or divergent extension/
userscript paths). Listed so the maintainer can decide whether to lift
the freeze. **Default: deferred.**

### UC1. Settings sync via `chrome.storage.sync` (carried)

`CHARTER-REVIEW: feature-extension.` Pass 16 measured current UI
preferences at 7,334 bytes — fits sync today, sits close to the
8,192-byte per-item cap. Whole-storage sync is not viable: typical
local payload is 172,461 bytes and cache/history keys exceed per-item
limits. Any future implementation must be preferences-only and guarded
by `scripts/audit-storage-size.js`. Adds cross-device behaviour the
extension does not have today. [src-loc-storage-audit]

### UC2. User-account cloud backup (carried)

`CHARTER-REVIEW: feature-extension + service-extension.` Would require
a backend. Out of scope per charter. Bitwarden's pattern is the
reference. [src-bitwarden]

### UC3. Userscript-only MAIN-world ad-blocking, re-distributed (carried)

`CHARTER-REVIEW: feature-divergence.` The extension stopped shipping
MAIN-world ad blocking when MV3 made `webRequestBlocking` unavailable.
A userscript fork with `@grant` permissions could re-add it. Pairs
with L4 (Firefox MV2 companion path). Adds maintenance surface and a
divergent feature matrix between extension and userscript.
[src-ublock-lite] [src-fx-mv2-mv3]

### UC4. Audio-track download + transcode features (carried)

`CHARTER-REVIEW: feature-extension.` SharedAudio volume boost, Cobalt
downloader fallback, mute-ad-audio were left in the userscript-only
path during the v3.7 → v3.10 wave. Re-porting to the extension is
feature work, not maintenance. [src-loc-yt-kit-mem]

### UC5. AI summary + transcript-handoff provider expansion (carried)

`CHARTER-REVIEW: feature-extension.` Current providers: OpenAI,
Anthropic, Google. Community asks frequently for Mistral, Groq,
Ollama, local-llama.cpp. Each new provider is a new feature with new
key storage + auth shapes. [src-aip-providers]

### UC6. `chrome.sidePanel` host-restricted to YouTube — AI chat + transcript surface

`CHARTER-REVIEW: feature-extension + ui-paradigm-shift.` Move the AI
summary / transcript chat from in-page widget to a persistent
`chrome.sidePanel` restricted to youtube.com / youtube-nocookie.com.
Survives SPA navigation by definition. New paradigm; charter call on
whether to maintain two UI surfaces (in-page panel + side panel)
during transition or to deprecate the in-page panel. [src-side-panel]

### UC7. RAG chat-with-this-video over transcript

`CHARTER-REVIEW: feature-extension + ML-runtime.` Transcript →
chunked embeddings → retrieval over user question → LLM call. Local-
only path possible via Ollama + ONNX embeddings. Adds a significant
feature domain. Pairs naturally with UC6. [src-paolo-rag]

### UC8. Community blocklist subscription model

`CHARTER-REVIEW: feature-extension + community-content-source.` URL-
pointed lists of `hiddenVideos` / `blockedChannels` / keyword filters,
refreshed on schedule à la uBO filter lists. Astra-Deck has the
underlying machinery (`hiddenVideos`, `blockedChannels`, keyword
filter); the new surface is the subscription model + remote refresh.
Charter risk: who curates the lists, what happens if a list is
poisoned. [src-blocktube]

### UC9. Per-video local archive sidecar (JSON)

`CHARTER-REVIEW: feature-extension.` On bookmark/download, write a
sidecar JSON containing title / channel / upload date / description /
comments snapshot / transcript / chapters / DeArrow + SponsorBlock
metadata. Foundation for a "personal YouTube library" mode. Astra
Downloader is the natural host. [src-hn-archiver]

### UC10. `chrome.userScripts` API as per-channel scripting hook

`CHARTER-REVIEW: feature-divergence.` Chrome 120+ exposes a proper
sandbox for user-supplied JS with `runtime.onUserScriptMessage` +
`configureWorld()`. Astra-Deck could let users drop in per-channel
scripts (e.g. "always set 1.5× on Channel X", "auto-skip first 30 s on
Channel Y"). Mozilla restricts the API to user-script-manager
extensions — only Chrome path is viable. Also requires the Chrome 138
per-extension toggle UX (L2) to be solved first. [src-chrome-userscripts]
[src-amo-policy-2025]

---

## Rejected (with reason)

Preserved so future research passes don't silently resurrect them.

| Item | Reason |
|---|---|
| Pin `yt-dlp` in `requirements.txt` | Carried from prior. yt-dlp is shelled out as `yt-dlp.exe` with SHA256 verification (`YTDLP_SHA256_URL`), not a pip dep. Pinning in `requirements.txt` is meaningless. CVE-2026-26331 RCE applies to `--netrc-cmd` usage; verified by grep we never call `--netrc-cmd`. [src-yt-cve-26331] [src-loc-downloader] |
| Pin `curl_cffi >= 0.15.0` | `curl_cffi` is not a dependency. Verified by grep. CVE-2026-33752 does not apply. Carried from prior. |
| ESLint supply-chain pinning (`eslint-config-prettier`, `synckit`, `@pkgr/core`, `napi-postinstall`) | None are dependencies. We use bare `eslint` 10.x. CVE-2025-54313 does not apply. [src-eslint-cve] |
| RYD fetch wrapper in the extension build | Carried from prior. The extension does not ship Return YouTube Dislike integration; adding one would be a new user-facing feature. The userscript build retains RYD; that's where any backoff wrapper would belong. [src-loc-ryd] |
| DNS-rebinding defence in `astra_downloader.py` | Carried from prior. Already shipped in v3.15.0. Test exists at `test_dns_rebinding_attack_is_rejected_before_handler`. |
| Firefox 152 `moz-extension://` injection audit | Carried from prior. Verified: `extension/` has zero `scripting.executeScript` calls targeting `moz-extension://` origins. Not applicable. |
| Chrome DNR `isUrlFilterCaseSensitive` immediate audit | We don't currently use `declarativeNetRequest`. Already in L8 as a defer-until-adopted note. |
| Bound DeArrow cache | Carried from prior. DeArrow self-caps at 2000 entries; H5 added belt-and-suspenders sweep on `da_branding_cache`. Closed. |
| Tampermonkey #2673 SPA-nav workaround | Reclassified: NOT rejected. Moved to **L1** (Navigation API self-detection in userscript build) since it's correctness-only and charter-aligned. |
| Flask-HTTPAuth CVE-2026-34531 mitigation | Carried. Astra Downloader's Flask app does not import Flask-HTTPAuth. Not applicable. |
| Flask-Reuploaded CVE-2026-27641 | We don't load Flask-Reuploaded. Not applicable. [src-cve-27641] |
| Mass migrate to ESM modules in the extension | Carried from prior. Cost > value at current size; build pipeline is intentionally zero-config. |
| AGPL relicense (per YouTubeAlchemy precedent) | Carried from prior. Astra-Deck is MIT and the maintainer prefers MIT. |
| `chrome.userScripts` API as a "let users inject arbitrary JS" surface in the extension popup | Mozilla's June 2025 AMO policy restricts the `userScripts` API to user-script-manager extensions. We are not one. UC10 covers the constrained per-channel-scripting variant only, gated to Chrome. [src-amo-policy-2025] |
| GoodTube classic player UI restoration | YouTube's player redesign is a moving target; per-class CSS restoration is constant maintenance for low user payoff. The valuable subset (black background, "instant pause", "always play from start") is adopted as bounded toggles (L33) instead of a wholesale UI revert. [src-goodtube] |
| Reddit-Karamel-style comment integration | Third-party brittleness (Reddit Polymer rewrites); scope creep beyond YouTube. The HN-class request is rare. [src-karamel] |
| Bullet-chat danmaku overlay during VOD | Niche; conflicts with the existing "hide live chat clutter" charter. NewPipe ships it for a reason — mobile-portrait viewing — that doesn't apply to a desktop extension. [src-newpipe] |
| HTML5 video player tools across non-YouTube sites | Scope creep. Astra-Deck's identity is YouTube enhancement. Cross-site `<video>` enhancement is a separate project. [src-awesome-us] |
| Subscribe-to-channel auto-queue with new-upload polling | Backend / persistent-poller class of feature; sits inside UC1 (sync) or UC9 (archive) territory rather than as its own item. |
| Auto-detect-and-download in single textbox (Cobalt-style) | Cobalt has 40 k stars for this UX; the differentiator is its multi-site coverage which we don't ship. Without multi-site (L36–L42 don't enable it), the single-textbox UX is mostly cosmetic. Revisit if/when Cobalt-API mode (UC4 territory) lands. [src-cobalt] |

---

## Risk register

Carried from prior `roadmap.md` and updated for v3.22.0 state.

| Risk | Status | Mitigation |
|---|---|---|
| Progress-bar DOM rewrites on theater/miniplayer transitions break segment overlay | Mitigated | Segment renderer listens for `ResizeObserver` + `MutationObserver` and re-paints. |
| YouTube A/B serves new comment DOM classes | Ongoing | Selector canary expanded to 18 (Pass 10) + overlay tier (Pass 15). N6 above adds liquid-glass player chrome to the canary. |
| Settings-profile schema migration on new settings | Mitigated v3.20.5 | Popup + content-script imports preserve imported `_settingsVersion`, run migrations forward, merge defaults, then stamp current schema. NX12 adds round-trip fixtures. |
| Toolbar popup broadcasts hit tabs without ytkit.js loaded | Mitigated | `chrome.tabs.sendMessage` wrapped; `chrome.runtime.lastError` swallowed. |
| Digital-wellbeing interval keeps SW alive | Mitigated | Ticker runs in content script, not SW. Persists on `visibilitychange` + 30 s. |
| URL-strip breaks YouTube Music `si=` | Mitigated | `stripTrackingParams` scoped to `www.youtube.com`. |
| TrustedTypes peer-extension policy collision | Observable v3.20.2 | H1 logs `TT_POLICY_FAIL` to DiagnosticLog; H4 surfaces in popup banner. |
| EXT_FETCH SW socket retention on too-large response | Mitigated v3.20.4 | H9 added `controller.abort()` on all five size-limit paths. |
| Theater-split divider-drag mid-SPA-nav listener orphan | Mitigated v3.20.3 | H8 hoisted drag handles; `abortDividerDrag()` called from teardown. |
| Cookie-jar wire-format drift | Mitigated v3.20.3 | H6 `normalizeCookieExpiry()` with documented contract + parity tests across three sites. |
| Pre-push version-string drift between four canonical sources | Mitigated v3.20.4 | H10 `scripts/check-versions.js` wired into `npm run check`. |
| **YouTube PO Token enforcement breaks `web` client downloads** | **NEW — open** | N1 above (bgutil-pot-provider integration). |
| **YouTube SABR-only adaptiveFormats break legacy download path** | **NEW — open** | N2 above (`formats=duplicate` extractor arg). |
| **Reaction spammer default-ON could trigger YT account flagging** | **NEW — open** | N3 above (default OFF + cooldown floor + first-toggle toast). |
| **CSP `connect-src` missing — defense-in-depth gap** | **NEW — open** | N5 above. |
| **YouTube liquid-glass player chrome rolling out — selector audit needed** | **NEW — open** | N6 above. |
| Flask cache-control session-data leak (CVE-2026-27205) | NEW — open | NX11 audits session-touching endpoints + pins Flask. |
| Chrome 138 `chrome.userScripts` per-extension toggle off by default | NEW — open | L2 README update + N4 doc sweep. |
| `credentials: 'omit'` breaks RYD vote attribution | Not applicable | Current extension build does not ship Return YouTube Dislike integration. |

---

## Architectural watchlist

Notes that are not scheduled work but inform priority decisions.

### High-priority

- **Monolithic content script (~38.6 K LOC).** `extension/ytkit.js`
  remains a single file (grew from 36 K → 38.6 K in v3.20.6 → v3.22.0
  via i18n, speed control, video-hider polish). The `core/` extraction
  covers shared utilities only. Per-area audit (rather than full split)
  is NX12 above. [src-loc-ytkit]
- **No bundling / minification.** `build-extension.js` copies files
  verbatim. CWS bans code obfuscation but allows minification —
  minifying could cut payload ~60–70 % at the cost of shipping non-
  readable code, which violates the project's "ship readable"
  convention. Trade-off blocks the change. [src-cws-policies]
- **Unbounded storage growth.** Addressed v3.9.0 (`storageQuotaLRU`),
  v3.20.0 (`unlimitedStorage`), v3.20.2 H5 (real-key LRU sweep on
  `da_branding_cache`). Considered closed; monitor.
- **YouTube redesign cadence.** Liquid-glass rollout late 2025 – early
  2026; Subscriptions list-view removal Feb 2026; redesigned video
  player rolling globally late 2025 – 2026. Selector canary cadence
  shifts from quarterly to weekly. Plan an N-tier release (N1+N2+N6)
  per quarter as the new baseline.

### Medium-priority

- **Crash / error telemetry.** `DiagnosticLog` exists. Popup banner
  surfaces TrustedTypes failures (H4). Adding a generic
  `_errors`-count-based badge for any class is L10. Telemetry-free per
  charter.
- **Feature dependency graph.** `CONFLICT_MAP` handles mutually
  exclusive features. No graph for features that REQUIRE other
  features. L11.
- **Cross-browser parity assumed.** Firefox support relies on implicit
  WebExtension API aliasing. NX3 opens visibility into Firefox-Android
  parity; Firefox-desktop full parity remains untested past smoke.
- **SW lifecycle hardening.** Top-level listener registration is
  enforced via ESLint custom rule (Pass 17 H18). Periodic re-audit on
  every release is implicit; consider tightening to a CI gate.

### Low-priority

- **Build-system version sync.** Four canonical version strings
  (`package.json`, `manifest.json`, `ytkit.js#YTKIT_VERSION`,
  `YTKit.user.js#@version`). `scripts/check-versions.js` (Pass 11 H10)
  catches drift pre-push. Considered closed.
- **Sideloaded CRX/XPI auto-update.** GitHub Releases API check could
  surface new versions in-extension. L18.
- **i18n coverage.** 10 locales × ~199 keys covers popup + chrome +
  download UI + speed control + every quick toggle. The 150+ feature-
  definition entries in `ytkit.js` (each feature's settings-panel name
  + description) remain hardcoded English. L15.

---

## Quality gates by release stage

Unchanged from prior `roadmap.md`. Applied on every release.

### Feature branch

- [ ] Feature registers cleanly under the feature-array pattern.
- [ ] Default is OFF in `default-settings.json` (exception: a UI polish
      like `compactLayout` that has no behavioural risk).
- [ ] No new global variables; scoped to feature namespace.
- [ ] No syntax error after build (`node --check`).
- [ ] Local Chrome dev-mode install loads without console errors.
- [ ] All new user-facing strings keyed via `t('key', 'fallback')` and
      added to `_locales/en/messages.json` (mandatory since v3.21.0).

### Main

- [ ] CHANGELOG entry added.
- [ ] Settings-meta entry with label and description.
- [ ] No regression in existing features (manual smoke test of related
      features).

### Release

- [ ] All four artifacts build (Chrome ZIP, CRX, Firefox ZIP, XPI) plus
      userscript build.
- [ ] Clean-profile test on Chrome stable + Firefox stable.
- [ ] Version string synced across `package.json`, `manifest.json`,
      `ytkit.js#YTKIT_VERSION`, userscript header (enforced by
      `npm run check:versions`).
- [ ] `npm run check` clean (syntax + version + i18n + lint + a11y +
      contrast).
- [ ] CHANGELOG versioned entry with date.
- [ ] GitHub release with all five artifacts.
- [ ] Git tag pushed.
- [ ] README badge version reflects new release.
- [ ] Memory file updated with new version and any gotchas learned.

---

## Performance budget

No shipped feature has regressed these. Measured on i5-1235U / 16 GB /
Chrome stable / cold cache against `/watch?v=dQw4w9WgXcQ`. Targets
updated to reflect the v3.22.0 LOC growth.

| Metric | Current (v3.22.0) | Target | Hard ceiling |
|---|---|---|---|
| `ytkit.js` raw size | ~1.32 MB | ≤1.3 MB | 1.6 MB |
| Parse + execute (cold) | ~210 ms | ≤170 ms | 280 ms |
| Time to first feature paint | ~430 ms | ≤350 ms | 600 ms |
| Memory (idle, after 5 min) | ~48 MB | ≤55 MB | 85 MB |
| Memory (after 100 SPA navs) | ~78 MB | ≤65 MB | 110 MB |
| `chrome.storage.local` typical 30-day | ~500 KB | ≤1 MB | 5 MB |
| Locale-files total payload | ~340 KB (10 locales) | ≤500 KB | 800 KB |

---

## Category coverage audit (Phase 5 self-check)

Every category from the research directive is covered or explicitly
flagged thin. **All 13 categories addressed below.**

| Category | Coverage | Where |
|---|---|---|
| Security | Strong | N1 (PO Token), N5 (CSP), NX11 (Flask), Risk Register; rejected items 1–3, 11–12. |
| Accessibility (a11y) | Strong | Pass 12 + Pass 18 shipped baseline; NX5 (ARIA live), L12 (reduced motion), L13 (forced colors), L14 (SR smoke). |
| i18n / l10n | Strong | v3.21–v3.22 shipped 10 locales; L15 expands to feature-definition entries; L16 (RTL stub); L17 (MF2 future). |
| Observability / telemetry | Adequate | H1 + H4 shipped (TT surface); L9 (export to file) + L10 (generic banner) + L11 (feature graph). Telemetry-free per charter. |
| Testing | Strong | 152 tests at v3.20.5; NX12 (per-area fixtures), L5 (Wave 8/9 coverage), L20 (Playwright nightly), L21 (userscript build parity). |
| Docs | Adequate | N4 (drift sweep); HARDENING.md kept in sync per Pass cadence; CONTRIBUTING.md rename. |
| Distribution / packaging | Strong | NX4 (AMO), L7 (Greasy Fork), L18 (CRX auto-update), L19 (CWS checklist), NX13 (key rotation). |
| Plugin ecosystem | Explicit non-goal | Astra-Deck is monolithic by design. UC10 (chrome.userScripts) is the narrow exception, gated to Chrome. |
| Mobile | Adequate | NX3 (Firefox-Android smoke) + L30 (NewPipe intent) + Wave 10 small-screen polish ongoing. |
| Offline / resilience | Strong | NX3 SponsorBlock stale cache shipped v3.20.5; NX10 (ffmpeg HLS handler smoke); circuit-breakers exist for SB/DeArrow. |
| Multi-user / collab | Deferred | UC1 (preferences-only sync), UC2 (cloud backup), UC8 (community blocklists). |
| Migration paths | Strong | Pass 12 N1 + Pass 13 NX6 shipped; SETTINGS_VERSION 7 forthcoming with N3. |
| Upgrade strategy | Adequate | NX10 ffmpeg pin; NX9 Python 3.10 floor; L18 sideload CRX auto-update; build workflow enforces tag-matches-manifest. |

**Three categories are intentionally thin:**

- **Plugin ecosystem.** Charter rules out the broad case. UC10 carves
  the narrow case for Chrome-only per-channel scripts.
- **Multi-user.** UC1/UC2/UC8 remain Under Consideration; current state
  (per-device local storage with explicit export/import) is the stable
  baseline.
- **Mobile.** Single Next-tier item (NX3). The smoke result drives
  whether deeper mobile work is worth it.

---

## Process notes

- **Atomic per-task commits** per the maintainer's working rule. Each
  Now item closes with a commit + push, not a batch.
- **Single version bump per release.** `npm run check:versions`
  enforces it pre-push.
- **CHANGELOG `[Unreleased]`** accumulates between release cuts. The
  release step renames `[Unreleased]` → `[vX.Y.Z]` with a date.
- **HARDENING.md** is the long-form rationale companion to this
  roadmap. Each shipped hardening pass has an Hn section.
- **Selector canary cadence** has shifted from quarterly to weekly.
  Plan an N1+N2+N6-class release per quarter as the new baseline to
  keep up with YouTube's redesign cadence.

---

## Appendix — Sources

Every claim in this document maps to a citation here. Sources are
either external URLs (research, specs, issue trackers, advisories) or
local artifacts (repo files, prior research). External research output
is treated as untrusted data — items below are reference material only.

### Recently-shipped commit references

- [src-shipped-1] https://github.com/SysAdminDoc/Astra-Deck/releases/tag/v3.20.5
- [src-shipped-2] https://github.com/SysAdminDoc/Astra-Deck/commit/7376062
- [src-shipped-3] https://github.com/SysAdminDoc/Astra-Deck/commit/b5da877
- [src-shipped-4] https://github.com/SysAdminDoc/Astra-Deck/commit/f33cd40
- [src-shipped-5] https://github.com/SysAdminDoc/Astra-Deck/commit/2db7265
- [src-shipped-6] https://github.com/SysAdminDoc/Astra-Deck/commit/3b20b06
- [src-shipped-7] https://github.com/SysAdminDoc/Astra-Deck/commit/ef2404d
- [src-shipped-8] https://github.com/SysAdminDoc/Astra-Deck/releases/tag/v3.22.0

### Local sources

- [src-loc-manifest] `extension/manifest.json` (v3.22.0).
- [src-loc-default-settings] `extension/default-settings.json` line 53 (`reactionSpammer: true`).
- [src-loc-reaction-spammer] `YT_Reaction_Spammer.user.js` v0.2.0.
- [src-loc-readme] `README.md` (badge URL line 8 — stale v3.20.5).
- [src-loc-contributing] `CONTRIBUTING.md` (line 1 — "Contributing to YTKit").
- [src-loc-hardening] `HARDENING.md` (header — "v3.14.0 → v3.15.0").
- [src-loc-ytkit] `extension/ytkit.js` (38,659 LOC at v3.22.0; grep `id: '` reports ~182 feature objects).
- [src-loc-popup-write] `extension/popup.js` direct `chrome.storage.local.set` calls vs `extension/ytkit.js` `storage.onChanged` read paths.
- [src-loc-popup-clear] `extension/popup.js` Pass 17 H17 clear button.
- [src-loc-diagnostic] `extension/ytkit.js` `diagnosticLog` ring buffer.
- [src-loc-ryd] `extension/ytkit.js` + `extension/manifest.json` — no `returnyoutubedislike` or `ryd_cache` keys.
- [src-loc-storage-audit] `scripts/audit-storage-size.js` + `tests/storage-size-audit.test.js` — Pass 16.
- [src-loc-syncus] `sync-userscript.js` — converts extension to userscript.
- [src-loc-yt-kit-mem] Memory file `youtube-kit.md` — userscript-only audio features (SharedAudio, Cobalt fallback, muteAdAudio).
- [src-loc-wave10] Memory file `youtube-kit.md` — Wave 10 features (`musicVideoSpeedLock`, `transcriptAiHandoff`, `playlistQuickRemove`).
- [src-loc-downloader] `astra_downloader/astra_downloader.py` lines 97–155 (`YTDLP_PATH`, `YTDLP_URL`, `YTDLP_SHA256_URL`).
- [src-loc-repo-root] `ls` of repo root — `AstraDownloader.exe` (46 MB), `archive/`, `mhtml/`, `*.bak`, `Install-YTYT.ps1`, loose PNGs.

### External — YouTube platform / yt-dlp

- [src-yt-po] yt-dlp PO Token Guide — https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- [src-yt-bgutil] bgutil-ytdlp-pot-provider — https://github.com/Brainicism/bgutil-ytdlp-pot-provider
- [src-yt-sabr] yt-dlp PR #13515 (SABR downloader) — https://github.com/yt-dlp/yt-dlp/pull/13515
- [src-yt-cve-26331] CVE-2026-26331 — https://nvd.nist.gov/vuln/detail/CVE-2026-26331
- [src-yt-py310] yt-dlp releases (Python 3.10 minimum) — https://github.com/yt-dlp/yt-dlp/releases
- [src-yt-throttled] yt-dlp `--throttled-rate` / `--http-chunk-size` — yt-dlp options docs
- [src-curl-cffi] curl_cffi impersonate (yt-dlp issue 12482) — https://github.com/yt-dlp/yt-dlp/issues/12482
- [src-ffmpeg-8-1] FFmpeg 8.1.1 Changelog — https://github.com/FFmpeg/FFmpeg/blob/master/Changelog
- [src-yt-redesign-1] YouTube player redesign — https://9to5google.com/2025/10/14/youtube-video-player-redesign-more/
- [src-yt-redesign-2] TechSpot YouTube player redesign — https://www.techspot.com/news/109892-youtube-modernizes-video-player-new-layout-functionality-wait.html
- [src-yt-subs] YouTube Subscriptions list-view removal — https://piunikaweb.com/2026/02/03/youtube-subscriptions-list-view-removed/
- [src-yt-dubbing] AdGuard SSAI analysis — https://adguard.com/en/blog/youtube-server-side-ad-insertion.html

### External — competitor extensions

- [src-alchemy] YouTube Alchemy — https://github.com/TimMacy/YouTubeAlchemy
- [src-improvedtube] ImprovedTube — https://github.com/code-charity/youtube
- [src-magic-actions] Magic Actions for YouTube — https://chromewebstore.google.com/detail/magic-actions-for-youtube/abjcfabbhafbcdfjoecdgepllmpfceif
- [src-sb-releases] SponsorBlock releases — https://github.com/ajayyy/SponsorBlock/releases
- [src-dearrow] DeArrow — https://github.com/ajayyy/DeArrow
- [src-blocktube] BlockTube — https://chromewebstore.google.com/detail/blocktube/bbeaicapbccfllodepmimpkgecanonai
- [src-unhook] Unhook — https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid
- [src-goodtube] GoodTube — https://chromewebstore.google.com/detail/goodtube-adblock-for-yout/mnlobacbpcnaibnhmfcpdfllcipgnfhe
- [src-yt-antitranslate] YouTube Anti Translate — https://chromewebstore.google.com/detail/youtube-anti-translate-yo/dgdelfpagadfkljgnjnmppnanfjlkalc
- [src-multiselect] Multiselect for YouTube — https://chromewebstore.google.com/detail/multiselect-for-youtube/gpgbiinpmelaihndlegbgfkmnpofgfei
- [src-karamel] Karamel — https://github.com/odensc/karamel
- [src-paolo-rag] YouTube AI Extension — https://github.com/PaoloJN/youtube-ai-extension
- [src-newpipe] NewPipe — https://github.com/TeamNewPipe/NewPipe
- [src-freetube] FreeTube — https://github.com/FreeTubeApp/FreeTube/releases
- [src-cobalt] Cobalt — https://github.com/imputnet/cobalt
- [src-metube] MeTube — https://github.com/alexta69/metube
- [src-ublock-lite] uBlock Origin Lite — https://github.com/uBlockOrigin/uBOL-home
- [src-refined-github] Refined GitHub — https://github.com/sindresorhus/refined-github
- [src-awesome-us] Awesome Userscripts — https://github.com/awesome-scripts/awesome-userscripts
- [src-hn-archiver] HN "YouTube archiver extension" — https://news.ycombinator.com/item?id=44768714

### External — browser platforms / standards

- [src-chrome-userscripts] Chrome userScripts API — https://developer.chrome.com/docs/extensions/reference/api/userScripts
- [src-side-panel] Chrome sidePanel API — https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- [src-cws-update] Chrome web store — https://developer.chrome.com/docs/extensions/whats-new
- [src-cws-policies] Chrome program policies — https://developer.chrome.com/docs/webstore/program-policies
- [src-cws-review] Chrome review process — https://developer.chrome.com/docs/webstore/review-process
- [src-fx-mv3] Mozilla MV3 in Firefox 128 — https://blog.mozilla.org/addons/2024/07/10/manifest-v3-updates-landed-in-firefox-128/
- [src-fx-android] Mozilla Android extensions FAQ — https://blog.mozilla.org/addons/2020/02/11/faq-for-extension-support-in-new-firefox-for-android/
- [src-fx-mv2-mv3] Mozilla keeps MV2 + MV3 — https://blog.mozilla.org/en/firefox/firefox-manifest-v3-adblockers/
- [src-amo] AMO submission guide — https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- [src-amo-policy-2025] AMO 2025 policy update — https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/
- [src-doc-pip] MDN Document PiP — https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API
- [src-dnr-case] Chrome declarativeNetRequest — https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- [src-navigation-api] MDN Navigation API — https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
- [src-tampermonkey-2673] Tampermonkey #2673 — https://github.com/tampermonkey/tampermonkey/issues/2673
- [src-greasyfork] Greasy Fork — https://greasyfork.org/

### External — accessibility / a11y

- [src-mdn-aria-live] MDN ARIA Live Regions — https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
- [src-mdn-reduced-motion] MDN prefers-reduced-motion — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- [src-mdn-forced-colors] MDN forced-colors — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
- [src-webaim-sr] WebAIM screen-reader survey — https://webaim.org/projects/screenreadersurvey/

### External — security advisories

- [src-mdn-csp] MDN CSP `connect-src` — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src
- [src-cve-27205] CVE-2026-27205 Flask cache control — https://radar.offseq.com/threat/cve-2026-27205-cwe-524-use-of-cache-containing-sen-0adafbc3
- [src-cve-27641] CVE-2026-27641 Flask-Reuploaded — https://www.sentinelone.com/vulnerability-database/cve-2026-27641/
- [src-eslint-cve] CVE-2025-54313 eslint-config-prettier — https://www.stepsecurity.io/blog/supply-chain-security-alert-eslint-config-prettier-package-shows-signs-of-compromise
- [src-eslint-10] ESLint v10.0.1 — https://eslint.org/blog/2026/02/eslint-v10.0.1-released/
- [src-dependabot] Dependabot — https://docs.github.com/en/code-security/dependabot

### External — other

- [src-bitwarden] Bitwarden release notes — https://bitwarden.com/help/releasenotes/
- [src-aip-providers] (Provider docs — OpenAI/Anthropic/Google/Mistral/Groq/Ollama API references; not single-URL.)
- [src-cldr-47] CLDR 47 release notes — https://cldr.unicode.org/downloads/cldr-47
- [src-icu-78] Unicode blog ICU 78.3 / CLDR 48.2 — http://blog.unicode.org/2026/03/unicode-icu-783-and-cldr-482-released.html
- [src-playwright] Playwright — https://playwright.dev/

> Iter-5 source breadth lives in conversation context (this roadmap was
> compiled by merging local Phase 0 reconnaissance + two background
> research agents — competitors + standards/security — against the
> prior iter-1 through iter-4 artifacts in `docs/research/`
> (gitignored)). The references above are the subset directly cited.

---

*Last updated: 2026-05-17 — supersedes prior `roadmap.md` v3.20.5
2026-04-26 snapshot. Next review: when N1 (PO Token) or N6 (liquid-
glass selector audit) lands, or iter-6 research surfaces a higher-
leverage item.*
