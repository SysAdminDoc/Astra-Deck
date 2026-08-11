<p align="center">
  <img src="logo.png" alt="Astra Deck" width="100">
</p>

<h1 align="center">Astra Deck</h1>

<p align="center">
  <img src="https://img.shields.io/github/v/release/SysAdminDoc/Astra-Deck?style=flat-square&color=ff4e45&label=release" alt="Latest Release">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/manifest-V3-blue?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/YouTube-Desktop-ff0000?style=flat-square&logo=youtube&logoColor=white" alt="YouTube">
</p>

<p align="center">
  Premium YouTube enhancement extension for Chrome and Firefox with 200+ features — SponsorBlock, DeArrow, estimated Return YouTube Dislike counts, BlockTube-grade filtering, downloads with format/quality controls, transcript viewer + IndexedDB search, AI summary (BYO key or Chrome built-in), subscription groups, theater split, OLED token-bridge theming, and 11 bundled UI locales (extension only — the userscript ships no locale catalogues).
</p>

<!-- BEGIN GENERATED PROJECT FACTS -->
### Source-derived project facts

| Fact | Current source value |
| --- | --- |
| Release | `v4.59.1` |
| Runtime floors | Node `>=22`; Chrome 120+ / equivalent Chromium release; Firefox 142+ |
| Extension locales | `11`: `ar`, `de`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `pt_BR`, `ru`, `zh_CN` |
| Settings schema | `466` entries across `18` categories |
| Runtime graph | `99` modules, including `26` peeled feature modules and `284` declared feature IDs |
| Selector surfaces | `35` shipped surfaces from `33` selector packs (`2` aliases) |
| Build profiles | `store-safe`, `github-full`; github-full adds 5 full-only origins |
| Themes | `7` named color themes plus `oledTheme`, `denseMode`, `tokenThemeBridge` controls |
| Compatibility modes | Desktop YouTube extension; bounded YouTube Music theme/OLED/density compatibility; bounded /embed/:id player mode; mobile browsers and YouTube Studio; userscript follows the host desktop browser |
<!-- END GENERATED PROJECT FACTS -->

<p align="center">
  <a href="https://github.com/SysAdminDoc/Astra-Deck/releases/latest"><strong>Download Latest Release</strong></a>
  ·
  <a href="docs/privacy-policy.md"><strong>Privacy Policy</strong></a>
  ·
  <a href="SECURITY.md"><strong>Security Policy</strong></a>
</p>

---

## Installation

### Chrome / Edge / Brave

**Option A — Load unpacked from ZIP:**
1. Download `astra-deck-store-safe-chrome-v*.zip` or `astra-deck-github-full-chrome-v*.zip` from the [latest release](https://github.com/SysAdminDoc/Astra-Deck/releases/latest)
2. Extract it to a permanent folder
3. Open `chrome://extensions/`, enable **Developer mode**
4. Click **Load unpacked** and select the extracted folder

**Option B — Local folder:**
1. Download or clone the `extension/` folder
2. Open `chrome://extensions/`, enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder

Releases ship the ZIP, not a CRX. Self-hosted CRX installs are Linux-only on modern Chrome, so the ZIP + **Load unpacked** is the supported Chromium path.

### Firefox

**The released `.xpi` is unsigned.** Firefox Release and Beta install only
add-ons signed by Mozilla, and they reject an unsigned XPI with "This add-on
could not be installed because it appears to be corrupt" — so `about:addons` →
**Install Add-on From File** does not work on the Firefox most people run. Pick
one of these instead:

**Easiest — the userscript.** Works on every Firefox edition, installs in one
click, and auto-updates. See [Userscript](#userscript-tampermonkey--violentmonkey)
below.

**Temporary — any Firefox edition.** The add-on is removed when Firefox restarts.

1. Download `astra-deck-store-safe-firefox-v*.xpi` or `astra-deck-github-full-firefox-v*.xpi` from the [latest release](https://github.com/SysAdminDoc/Astra-Deck/releases/latest)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** and select the `.xpi`

**Permanent — Developer Edition, Nightly, or ESR only.** These builds can be
told to accept unsigned add-ons; Release and Beta cannot.

1. Open `about:config` and set `xpinstall.signatures.required` to `false`
2. Open `about:addons` → gear icon → **Install Add-on From File**
3. Select the `.xpi`

Requires Firefox 142+ (set by `strict_min_version` in
[`scripts/manifest-patch.js`](scripts/manifest-patch.js), so Firefox's built-in
data-consent permissions cover the documented collection categories).

### Userscript (Tampermonkey / Violentmonkey)

A userscript build is also available. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/), then **[click here to install](https://github.com/SysAdminDoc/Astra-Deck/raw/refs/heads/main/YTKit.user.js)**.

> SharedAudio remains userscript-only. Both extension profiles can use Astra Downloader; the GitHub-full artifact can also expose the optional Cobalt fallback when the local companion is offline.

### Astra Downloader Companion Setup

Video and audio downloads are handled by **[Astra Downloader](https://github.com/SysAdminDoc/AstraDownloader)**,
a separate program with its own repository, releases, and documentation. Astra
Deck and Astra Downloader are separate installs: the extension above works on
its own, and downloads need the companion running on this device.

Download `AstraDownloader.exe` from the
[latest Astra Downloader release](https://github.com/SysAdminDoc/AstraDownloader/releases/latest)
and run it, or use the in-page **Download setup** prompt, which points at the
same place. Then return to YouTube and choose **Check again**. The toolbar
popup also has recovery actions to re-enable the setup prompt and request an
on-demand companion update from a running service.

Everything about the companion — installing from source, building the
executable, the per-site sign-in store, subscriptions, the URL policy, and its
security model — is documented in
[its README](https://github.com/SysAdminDoc/AstraDownloader#readme). It
downloads from any site yt-dlp supports, not only YouTube.

Two details matter on this side of the boundary:

- **Discovery is by port, not configuration.** The extension probes
  `127.0.0.1` across the ports in `scripts/companion-port-catalogue.json`.
  That file is duplicated byte-for-byte in the Astra Downloader repository and
  checked in both, so changing the ports is a two-repository change.
- **Releases here never carry `AstraDownloader.exe`.** Publishing a second,
  independently versioned copy behind the same update check is how installs
  previously ended up four versions stale, so `npm run release:readiness`
  fails if the executable is staged in `build/` or listed in the release
  manifest.

The PO-token provider and Deno sections below are companion prerequisites. They
improve downloader reliability after Astra Downloader itself is running; they
are not browser extension install steps.

## Features

### Core

| Feature | Default |
|---------|---------|
| Theater Split — fullscreen video, scroll to reveal comments side-by-side | On |
| Video Hider — hide videos/channels from feeds with X buttons, keyword filter, regex, duration filter | On |
| Video Context Menu — right-click player for downloads, VLC/MPV streaming, transcript, screenshot | On |
| Settings Panel — searchable, categorized, instant-apply, export/import/reset | On |
| Comment Search — filter watch-page comments inline | Off |
| DeArrow — replace clickbait titles/thumbnails via crowdsourced database | Off |

### Interface

| Feature | Default |
|---------|---------|
| Logo Quick Links — hover dropdown with History, Watch Later, Playlists, Liked, Subs | On |
| Hide Sidebar / Hide Shorts / Hide Related / Hide Description | On |
| Subscriptions Grid / Homepage Grid Align / Videos Per Row | On |
| Styled Filter Chips / Compact Layout / Thin Scrollbar | On |
| Square Search Bar / Square Avatars | On |
| Compact Unfixed Header / Force Dark Everywhere | Off |

### Watch Page

| Feature | Default |
|---------|---------|
| Watch Page Restyle — glassmorphism accents, refined metadata | On |
| Native Comments Layout — keep YouTube comments clean without extension restyling | On |
| Expand Video Width / Disable Ambient Mode | On |
| Hide Merch, AI Summary, Hashtags, Pinned Comments, Info Panels | On |
| Clean Share URLs — strip tracking params | On |
| Return YouTube Dislike — estimated dislike count with `est.` disclosure + ratio | Off |
| Auto-Expand Description / Sticky Chat / Scroll to Player | Off |

### Video Player

| Feature | Default |
|---------|---------|
| Always Best Quality — picks highest available stream, prefers 1080p Premium when offered | On |
| Auto-Resume Position (configurable threshold) | On |
| Custom Progress Bar Color (color picker) | Off |
| Remaining Time Display / Time in Tab Title | Off |
| A-B Loop / Fine Speed Control / Persistent Speed / Per-Channel Speed | Off |
| Speed Control Chip (in-chrome popup: 0.25× → 3×, 10 presets) | On |
| Codec Selector (H.264/VP9/AV1) / Force Standard FPS | Off |
| Video Screenshot / Video Zoom (Ctrl+scroll, up to 5x) | Off |
| Cinema Ambient Glow / Nyan Cat Progress Bar | Off |
| Speed Indicator Overlay / Custom Speed Buttons (0.5x-3x) | Off |
| Pop-Out Player (Document PiP) / PiP Button / Fullscreen on Double-Click | Off |

### Content Filtering

| Feature | Default |
|---------|---------|
| Remove Shorts / Redirect Shorts to Regular Player | On |
| Channels open on Videos Tab | On |
| Hide Collaborations / News / Playlists / Playables / Members Only | On |
| Hide Watched Videos (dim or hide) / Grayscale Thumbnails | Off |
| Anti-Translate / Not Interested Button / Open in New Tab | Off |
| Disable Infinite Scroll / Disable SPA Navigation | Off |

### Downloads

| Feature | Default |
|---------|---------|
| Download Options Popup — format, quality, and save directory per download | On |
| Video Formats — MP4, MKV, WebM | MP4 |
| Audio Formats — MP3, M4A, Opus, FLAC, WAV | MP3 |
| Quality Selector — Best, 4K, 1440p, 1080p, 720p, 480p | Best |
| Custom Save Directory — override per download or set globally | Downloads |
| Context Menu — quick "Download Video" and "Download Audio" on right-click | On |
| Auto-Download on Visit | Off |
| Download Thumbnail (maxres) | Off |

> Downloads use Astra Downloader, the bundled local yt-dlp + ffmpeg companion. Both profiles probe `9751` plus fallback ports (`9761`, `9771`, `9781`, `9791`, `9851`) and only accept health responses that identify as the Astra downloader service. The store-safe ceiling keeps the companion handoff but excludes AI, Ollama, and Cobalt; GitHub-full can show the Cobalt fallback button when Astra Downloader is offline. See [Astra Downloader Companion Setup](#astra-downloader-companion-setup) for the current install and release-asset state.

The GitHub-full popup maintenance actions are recoverable. yt-dlp updates run
against a staged sibling executable; companion updates must pass checksum and
hidden startup checks. Each path retains one verified last-known-good binary,
activates atomically, and restores that backup automatically when the new
binary fails its post-update check. The popup and `/health.updateRecovery`
identify the active and rollback versions without exposing local paths or
digests.

### PO Token provider (optional but recommended)

YouTube binds PO tokens to video IDs in 2026; without a provider, the `web` client increasingly fails with "Sign in to confirm you're not a bot" on a subset of videos. Astra Downloader auto-detects a [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) HTTP server on `127.0.0.1:4416` and routes yt-dlp through it when available.

Quickest setup (Docker):

```bash
docker run --name bgutil-provider -d --restart unless-stopped -p 4416:4416 brainicism/bgutil-ytdlp-pot-provider
```

Then install the yt-dlp plugin so `yt-dlp.exe` knows to consult the provider:

```bash
pip install bgutil-ytdlp-pot-provider
```

Astra Downloader's `/health` endpoint will surface `poTokenProvider: { ok, port, version }` once the server is reachable. If absent, downloads still work on most videos — the provider is opt-in hardening, not a hard requirement.

### External JavaScript runtime (yt-dlp 2026+)

yt-dlp `>= 2026.04` uses external EJS challenge solvers for YouTube. Astra
Downloader defaults to Deno `>=2.3` and can fall back to Node `>=22`; choose
Auto, Deno, or Node in companion Settings. Runtime presence alone is not
enough: the companion verifies the version and executes a bounded JavaScript
capability probe before allowing a runtime-required download.

Install Deno once:

```bash
# Windows
winget install DenoLand.Deno

# macOS / Linux
curl -fsSL https://deno.land/install.sh | sh
```

(Or grab the installer from `https://deno.com/`. To use Node instead, install
Node 22 or newer and select **Node 22+** in companion Settings.)

Astra Downloader's `/health` endpoint surfaces `javascriptRuntime: { runtime, version, supported, ejsReady, reason }` while retaining `denoRuntime` as a compatibility alias. The download health panel names the selected runtime and offers one-click Deno provisioning only when Deno is an eligible choice. Unknown versions, probe failures, and unsupported runtimes stop with actionable errors; older pre-runtime yt-dlp builds remain allowed.

yt-dlp and its pins live in the
[Astra Downloader repository](https://github.com/SysAdminDoc/AstraDownloader), which runs the bounded media smoke against a
stable public fixture before accepting extractor dependency bumps.

### Comments

| Feature | Default |
|---------|---------|
| Sort Comments Newest First | Off |
| Creator Comment Highlight | Off |
| Comment Handle Revealer — show original channel name next to @handle | Off |
| Preload Comments | Off |

### Live Chat

| Feature | Default |
|---------|---------|
| Premium Live Chat styling | On |
| Configurable element hiding (header, emoji, super chats, polls, etc.) | On |
| Chat Keyword Filter | Off |
| Adaptive Live Layout | Off |
| Reaction Spammer — opt-in floating panel, randomized emoji loop (500 ms floor) | Off |

### Automation & Behavior

| Feature | Default |
|---------|---------|
| Auto-Dismiss "Still Watching?" | Off |
| Auto Theater Mode / Auto Subtitles / Auto-Like Subscribed | Off |
| Auto-Pause on Tab Switch / Pause Other Tabs | Off |
| Auto-Open Chapters / Auto-Open Transcript | Off |
| Auto-Close Popups (cookie/survey/premium) | Off |
| Prevent Autoplay / Disable Autoplay Next | Off |
| Redirect Home to Subscriptions | Off |
| Remember Volume / Persistent Speed | Off |

### Power User

| Feature | Default |
|---------|---------|
| Resume Playback (500-entry cap, 15s save interval) | Off |
| Mini Player Bar (floating progress/play/pause on scroll-past) | Off |
| Playback Stats Overlay (codec, resolution, dropped frames, bandwidth) | Off |
| Watch Time Tracker (90-day retention) + Analytics Dashboard | Off |
| Timestamp Bookmarks (inline notes, persistent storage) | Off |
| Transcript Viewer (sidebar with clickable timestamps) + Export | Off |
| AI Video Summary (OpenAI / Anthropic / Gemini / Ollama, BYO key) | Off |
| Subtitle Styling (font, size, color, background, position) | Off |
| Blue Light Filter (adjustable 10-80%) | Off |
| Focused Mode (hide everything except video + comments) | Off |
| Custom CSS Injection | Off |
| CPU Tamer (background tab timer throttling) | Off |
| Settings Profiles / Statistics Dashboard / Debug Mode | Off |
| Fit Player to Window | Off |

### Configurable Element Managers

Toggle individual elements on/off through the settings panel:

- **Action Buttons** — Like, Dislike, Share, Ask/AI, Clip, Thanks, Save, Sponsor, More Actions
- **Player Controls** — Next, Autoplay, Subtitles, Captions, Miniplayer, PiP, Theater, Fullscreen
- **Watch Elements** — Join Button, Ask Button, Save Button, Ask AI Section, Podcast Section, Transcript Section
- **Chat Elements** — Header, Menu, Popout, Reactions, Timestamps, Polls, Ticker, Leaderboard, Super Chats, Emoji, Bots

---

## Settings Panel

Click the gear icon in the YouTube masthead or player controls, or use the toolbar popup's **Open Full Settings** action.

<p align="center">
  <img src="outputs/astra-deck-settings-command-deck-video-player-v5.png" alt="Astra Deck Command Deck settings workspace" width="900">
</p>

- Command Deck workspace with a mission card and three live preference summaries on every category
- Searchable sidebar with enabled/total counts across all ten categorized pages
- Full-width semantic control sections with dependency rails for nested settings
- Toggle switches with instant apply
- Sub-feature controls for granular element hiding
- Textarea editors for keyword filters, quick links, custom CSS
- Schema-validated Export / Import / Reset with credential scrub
- Conflict detection (auto-disables conflicting features with toast notification)
- Responsive dark/light and RTL layouts for desktop, tablet, and narrow windows

The toolbar popup provides the lightweight control surface: polished quick toggles, YouTube-tab context, storage stats, schema-validated backups, diagnostics, and language selection.

---

## Architecture

```
document_start
  early.css          Anti-FOUC CSS (scoped to feature body classes)
  ytkit-main.js      MAIN world — canPlayType patching for codec/format filtering

document_idle
  runtime-bootstrap.js  ISOLATED world — reads settings and starts the guarded loader (<150 KB)
  runtime-core-loader.mjs  dynamic module graph — core + download bootstrap + ytkit
  features/*           dynamic, settings- and route-gated feature modules
  background.js      Service worker — fetch proxy, downloads, cookie bridge
```

- **Split-context model** — MAIN world for page API interception, ISOLATED world for extension APIs and DOM
- **Lazy runtime graph** — normal YouTube pages inject only the small bootstrap; the module catalogue is exposed through a per-session dynamic URL and loaded idempotently after the bootstrap turn
- **Settings and route gates** — persisted settings and existing selector-pack route boundaries decide which deferred feature modules are fetched; inline fallbacks preserve startup and userscript parity
- **SPA-aware** — hooks `yt-navigate-finish`, `yt-page-data-updated`, `popstate`, and `video-id` attribute changes
- **Tiered feature init** — critical features load synchronously, normal features in `requestAnimationFrame`, lazy features in `requestIdleCallback`
- **Crash recovery** — features that crash 3 times auto-disable with console warning
- **Conflict map** — 6 conflict pairs enforced at both toggle and init time
- **Trusted Types compliant** — all innerHTML via `TrustedHTML` policy wrapper
- **Safe mode** — append `?ytkit=safe` to any YouTube URL, or `ytkit.unsafe()` in console to exit

---

## Security

- Report sensitive security issues through [private vulnerability reporting](SECURITY.md), not public issues.
- **EXT_FETCH proxy** uses domain allowlist — blocks SSRF to private networks
- Request/response headers filtered (`Cookie`, `Set-Cookie`, etc. stripped globally; `Authorization` only forwarded to explicit BYO-key/local service origins such as OpenAI/Anthropic/Ollama/MediaDL)
- Response body capped at 10 MB, fetch timeout capped at 60s
- HTTP methods validated, download URLs protocol-checked (HTTP/S only)
- Quick Links blocks `javascript:`, `data:`, and `vbscript:` URIs and accepts
  only YouTube-owned destinations
- Explicit CSP: `script-src 'self'; object-src 'self'; connect-src` allowlists the documented required and optional provider origins (AI providers, SponsorBlock, six Astra Downloader fallback ports, Ollama) — no wildcards

### Trust & Transparency

- **Fully open-source** — every line of extension, companion, and build tooling is auditable
- **No telemetry, no analytics, no tracking** — zero data leaves the browser except to APIs you explicitly enable
- **SBOM + attestation** on every release build — verifiable software bill of materials
- **External CRX signing key** — maintainer-only, never in the repo or CI
- **Credential scrub** on settings export — API keys, tokens, and secrets are automatically stripped
- **Profile-split permissions** — store-safe builds retain the authenticated companion handoff but strip AI, Ollama, and Cobalt; GitHub-full builds keep the full catalogue
- **26+ hardening passes** documented in CHANGELOG with per-fix CVE/audit traceability
- **Privacy policy** covers data handling for every API origin the extension contacts

---

## Reaction Spammer

The optional Reaction Spammer feature lets you pick a set of YouTube
live-chat reactions and fire them in a randomized loop at a chosen
interval. It ships in two forms:

- **Bundled** in the MV3 extension as a Live Chat feature toggle —
  surfaces a floating launcher on `live_chat` pages.
- **Standalone** as `YT_Reaction_Spammer.user.js`, a Tampermonkey /
  Violentmonkey userscript with no extension dependency.

**Default: OFF, opt-in only.** Rapid synthetic reactions could trigger
YouTube's automated-behavior heuristics and result in account rate-
limiting or flagging. The first time you open the launcher per profile,
an amber toast surfaces this warning. The minimum interval is clamped
to 500 ms in both the extension and the standalone userscript — faster
than ~2 Hz is unsafe.

Use at your own risk.

---

## Languages

Astra Deck ships with 11 bundled UI locales. These are **extension only** —
`YTKit.user.js` bundles no locale catalogues, so the userscript tier is English:

| Code | Language |
|------|----------|
| `en` | English (default) |
| `ar` | العربية |
| `de` | Deutsch |
| `es` | Español |
| `fr` | Français |
| `it` | Italiano |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `pt_BR` | Português (Brasil) |
| `ru` | Русский |
| `zh_CN` | 简体中文 |

The popup language dropdown's "Auto (browser default)" option shows the
detected language inline. The selection writes
`chrome.storage.local._localeOverride`; the in-page YouTube workspace
picks up the override on next page navigation. Feature-definition entries
inside `ytkit.js` resolve through generated locale keys with English fallbacks;
community translations welcome via PR against `extension/_locales/<lang>/messages.json`.

---

## Compatibility

| Browser | Method | Status |
|---------|--------|--------|
| Chrome / Edge / Brave | Extension (MV3) | Fully supported |
| Firefox 142+ | Extension (MV3) | Supported — but the XPI is unsigned, so a permanent install needs Developer Edition / Nightly / ESR; Release and Beta can only load it temporarily (see [Firefox](#firefox)) |
| Chrome / Firefox | Tampermonkey / Violentmonkey | Supported (userscript) |
| Safari | Userscripts app | Limited |

**Not supported:** Mobile browsers and YouTube Studio. YouTube Music has
bounded theme/OLED/density compatibility; embedded `/embed/:id` pages have
bounded player/quality support, not full watch-page parity.

### Optional browser capabilities

Astra Deck probes optional APIs before using them. The popup diagnostics bundle
includes the same generated matrix used by the runtime at
`build/browser-capability-matrix.json`, so support reports identify both the
available capability and the promised fallback.

| Capability | Chromium | Firefox | Fallback when absent |
|------------|----------|---------|----------------------|
| Built-in Summarizer | Chrome 138+ when the local model is exposed | Not exposed | Local Summary uses the configured BYO-key lane explicitly |
| Built-in Translator | Chrome 138+ when the requested language pack is exposed | Not exposed | Transcript translation says so and uses the configured BYO-key lane |
| Astra Downloader | Companion health endpoint reachable | Same companion contract | Cobalt path when configured; companion-only panels stay unavailable |
| Ollama | Local server at `127.0.0.1:11434` | Same loopback contract | Selected remote/BYO provider, never an implicit provider switch |
| Document PiP | Chrome 116+ | Firefox 151+ | Standard video PiP |
| Language Detector | Chrome 138+ when the local model is exposed | Not exposed | Conservative text comparison |
| Prompt API | Chrome 138+ when Gemini Nano is ready | Not exposed | Transcript viewing/export remain available; no implicit remote Q&A |

---

## Building

```bash
npm ci
npm test
npm run check
# Python dependency auditing lives in the Astra Downloader repository
npm run build                             # Build store-safe + GitHub-full artifacts
npm run build:userscript                  # Include userscript, SBOM, manifest, and SHA256SUMS
npm run release:prepare                   # Build userscript artifacts and require readiness pass
npm run release:prepare:no-crx            # Same, without any CRX — needs no maintainer key
npm run release:sbom                      # Regenerate build/astra-deck-npm-sbom.cdx.json
npm run release:manifest                  # Regenerate release-manifest.json + SHA256SUMS
npm run release:readiness -- --require-pass # Generate release readiness JSON/Markdown
npm run release:verify-digests -- --tag vX.Y.Z # Compare uploaded asset digests after release upload
node build-extension.js --profile store-safe
node build-extension.js --profile github-full
node build-extension.js --bump patch      # Bump and build
node build-extension.js --bump minor --with-userscript
```

`npm run build` is safe for validation builds: if no maintainer key is
configured, CRX files are signed with ephemeral key material that is not
retained. Public release builds that include the userscript or bump a version
must use the external maintainer key via `ASTRA_CRX_KEY_PATH`, the default
`%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem` location, or
`node build-extension.js --crx-key <path>`.

**Or skip the CRX entirely.** `--no-crx` (equivalently `ASTRA_SKIP_CRX=1`)
produces the ZIP / XPI / userscript / SBOM / manifest / `SHA256SUMS` set with no
CRX at all, and therefore needs no key — without it a release build with no key
aborts before producing anything:

```bash
npm run release:prepare:no-crx            # one command: build + SBOM + manifest + readiness
node build-extension.js --with-userscript --no-crx   # or just the build
```

This is the normal path for this project. Self-hosted CRX installs are
Linux-only on modern Chrome, and the last two published releases (v4.50.2,
v4.50.7) shipped no CRX at all — so the maintainer key does not gate a release.
Release readiness records the build as `crxSigningMode: "none"` and verifies
that `build/` really contains no CRX before accepting it.

Outputs in `build/` (the `.crx` files only when the build was not run with `--no-crx`):
- `astra-deck-store-safe-chrome-v*.zip` + `.crx` (Chrome Web Store posture)
- `astra-deck-store-safe-firefox-v*.zip` + `.xpi`
- `astra-deck-github-full-chrome-v*.zip` + `.crx` (AI, local companion, Cobalt)
- `astra-deck-github-full-firefox-v*.zip` + `.xpi`
- `ytkit-v*.user.js` (with `--with-userscript` / `npm run build:userscript`)
- `astra-deck-npm-sbom.cdx.json`, `release-manifest.json`, and `SHA256SUMS`
- `release-readiness/release-readiness.json` and
  `release-readiness/release-readiness.md` after `npm run release:readiness`

Companion release assets are intentionally separate from the default extension
build output. Only a companion release/staging pass should add
`AstraDownloader.exe` and `AstraDownloader.exe.sha256` to `build/`. No
published release attaches the companion asset pair yet; verify the live
release asset list before promising the one-click setup path.

Requires Node 22+ (the `crx3` packager dependency needs it).

---

## Power-User Console Helpers

Most controls live in the settings panel; a few advanced flows are exposed only on `window.*` for power users:

| Entry point | What it does |
|-------------|--------------|
| `?ytkit=safe` URL parameter | Append to any YouTube URL to load with all features disabled (recovery mode). |
| `ytkit.unsafe()` | Exit safe mode from the DevTools console. |
| `window.__ytkitOpenAnalytics()` | Open the Watch History Analytics modal (30-day bar chart of `watchTimeTracker` data). |
| `window.__ytkitSearchTranscripts(query)` | Full-text search over the local IndexedDB transcript index (`researchTranscriptIndex` setting). Returns up to 200 hits. |
| `window.__ytkitClearTranscriptIndex()` | Wipe the local transcript index. |
| `window.__ytkitDiagnostics.download()` | Download a JSON bug report containing the diagnostic log ring buffer, selector-health snapshot, and active feature list. |
| `window.__ytkitProfiles` | Settings profile manager — `.save(name)`, `.load(name)`, `.delete(name)`, `.export()`, `.import(json)`. |
| `window.__ytkitAnnounce(message)` | Push a string into the polite screen-reader live region (requires `globalAriaLiveRegion`). |

---

## Documentation

| Doc | Audience |
|-----|----------|
| [ROADMAP.md](ROADMAP.md) | Single source of truth for planned work — existing plans plus research-driven additions. |
| [CHANGELOG.md](CHANGELOG.md) | Per-version release notes |
| [INSTALL.md](INSTALL.md) | How to install on Chrome, Edge, Firefox, or as a userscript |
| [HARDENING.md](HARDENING.md) | Cumulative hardening / audit log (H1 → H25) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Repo layout, build / test commands, "Adding a Feature" guide |
| [SECURITY.md](SECURITY.md) | Supported versions and private vulnerability reporting policy |
| [docs/architecture.md](docs/architecture.md) | Trust boundaries, data flow, where things live, conventions a new contributor needs |
| [docs/cws-submission-checklist.md](docs/cws-submission-checklist.md) | Chrome Web Store submission preflight (manifest, privacy policy, screenshots) |
| [docs/store-permission-rationale.md](docs/store-permission-rationale.md) | Copy-paste store-review permission, host, and single-purpose rationale |
| [docs/privacy-policy.md](docs/privacy-policy.md) | Stable privacy policy source for README, homepage, CWS, and AMO listing links |
| [docs/selector-fixture-workflow.md](docs/selector-fixture-workflow.md) | How to refresh MHTML captures when YouTube DOM changes |
| [docs/screen-reader-smoke.md](docs/screen-reader-smoke.md) | NVDA / JAWS / VoiceOver release-gate checklist |
| [docs/predicate-sandbox-investigation.md](docs/predicate-sandbox-investigation.md) | Threat model and design of the safe expression DSL for `advancedLocalPredicate` |
| [Astra Downloader cookie threat model](https://github.com/SysAdminDoc/AstraDownloader/blob/main/docs/yt-dlp-cookie-threat-model.md) | Cookie flow and redirect-leak mitigations for Astra Downloader / yt-dlp |
| [docs/signing-keys.md](docs/signing-keys.md) | CRX3 packaging key management |

---

## Related

| Project | Description |
|---------|-------------|
| [MediaDL](https://github.com/SysAdminDoc/MediaDL) | Local download server (yt-dlp + ffmpeg) with one-click installer |
| [YoutubeAdblock](https://github.com/SysAdminDoc/YoutubeAdblock) | Standalone aggressive ad blocker with deeper proxy hooks |
| [Chapterizer](https://github.com/SysAdminDoc/Chapterizer) | Offline AI chapter generation via NLP |

---

## License

[MIT](LICENSE) — Matthew Parker
