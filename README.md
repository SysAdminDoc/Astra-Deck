# YTKit: YouTube Customization Suite

![Version](https://img.shields.io/badge/version-25.11-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox%20%7C%20Edge-4285F4)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-00485B?logo=tampermonkey&logoColor=white)
![Status](https://img.shields.io/badge/status-active-success)

> A comprehensive Tampermonkey userscript that transforms YouTube into a distraction-free, privacy-respecting experience — with built-in ad blocking, AI-powered chapters, SponsorBlock, DeArrow, media player integration, and over 100 individually configurable features.

![YTKit Settings Panel](assets/screenshot.png)

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) for your browser
2. [**Click here to install YTKit**](https://github.com/SysAdminDoc/YTKit/raw/refs/heads/main/YTKit.user.js)
3. Confirm the installation prompt
4. Navigate to YouTube — the settings panel opens via the **⚙ YTKit** button in the top bar

---

## Features

### Ad Blocker
A split-architecture ad blocker that operates at the network, JSON, and DOM levels simultaneously. The proxy engine runs in the real page context to intercept YouTube's internal API calls before they reach the player, while a separate DOM observer removes any ad elements that slip through.

| Component | Description |
|-----------|-------------|
| JSON Pruner | Strips ad placements and slots from all YouTube API responses via a `JSON.parse` proxy |
| Fetch / XHR Proxy | Intercepts `/youtubei/v1/player` and related endpoints to remove ad data before delivery |
| DOM Cleaner | MutationObserver-based removal of ad renderer elements as they appear |
| SSAP Auto-Skip | Detects in-stream video ads and clicks skip buttons automatically |
| Anti-Detection | Neutralizes YouTube's ad blocker detection callbacks |
| Cosmetic Hiding | CSS-level suppression of masthead, shelf, and overlay ads |
| Remote Filter List | Loads and applies a remote EasyList-format filter list with auto-update |

### SponsorBlock
Native integration with the [SponsorBlock](https://sponsor.ajay.app) API. Skips user-submitted segments with per-category control.

| Category | Default |
|----------|---------|
| Sponsor | Enabled |
| Self Promotion | Enabled |
| Interaction Reminder | Enabled |
| Intro / Outro | Enabled |
| Off-Topic Music | Enabled |
| Preview / Recap | Enabled |
| Filler | Enabled |

### ChapterForge — AI Chapter Generation
Automatically generates chapters and points of interest for any video using its transcript. Supports multiple AI providers and transcript sources.

**AI Providers:** Built-in heuristic · Browser AI (local, via Transformers.js) · OpenAI · Ollama · OpenRouter · Custom endpoint

**Transcript Sources:** YouTube captions · Whisper (in-browser) · WhisperServer (local GPU via whisper.cpp)

**Features:**
- Auto mode processes videos on load; Manual mode adds a player button
- Filler word detection (`um`, `uh`, `you know`, etc.) with progress bar markers
- AI-powered video summarization (paragraph or timestamped format) with brief/standard/detailed length options
- SEO-optimized chapter title mode
- AI translation to any language
- AutoSkip modes (Gentle / Normal / Aggressive) to skip pauses and filler speech
- Chapter HUD overlay on the player (configurable position)
- Batch chapter generation for entire subscription feeds
- Points of interest (POI) markers on the progress bar
- Chapter-aware speed control
- Custom system prompts for both summaries and chapter generation

### DeArrow — Clickbait Removal
Integrates with the [DeArrow](https://dearrow.ajay.app) crowdsourced database to replace clickbait thumbnails and titles.

- Replace thumbnails with auto-generated video screenshots
- Replace titles in sentence case, title case, or original case
- Format original titles when no crowdsourced submission exists
- Hover over titles/thumbnails to preview the original
- Configurable cache TTL for branding data

### Video Hider
Persistent per-video and per-channel filtering across the homepage and subscription feeds.

- Right-click any video thumbnail to hide it or block its channel
- Keyword filter (plain text or `/regex/` format auto-detected)
- Minimum duration filter
- Subscription feed load limiting (reduces cluttered feeds)
- Bulk hide and export/import support

### Themes & Appearance
| Option | Values |
|--------|--------|
| Theme | System · Native Dark · Better Dark · Catppuccin Mocha |
| UI Style | Rounded · Square |
| Accent Color | Any hex color, or theme default |
| Compact Layout | Removes padding/margins for a denser layout |
| Thin Scrollbar | Minimal scrollbar styling |
| No Ambient Mode | Disables the glow/bloom behind the player |
| No Frosted Glass | Removes blur effects from overlays |

### Playback Enhancements
- **Speed Presets** — click-accessible speed buttons (0.5×–3×) with per-channel memory
- **Remember Speed** — persist playback speed across sessions
- **Watch Progress Bar** — visual read/unread progress overlay on thumbnails
- **Timestamp Bookmarks** — save named timestamps per video, with import/export
- **Auto-Resume** — remembers position per video and resumes from where you left off
- **Playback Speed OSD** — on-screen speed indicator during playback
- **Speed Indicator Badge** — badge on thumbnails showing saved per-channel speed
- **Auto Max Quality** — forces highest available resolution (up to 8K) with enhanced bitrate
- **Auto-Skip Intro/Outro** — skips intros and outros using video metadata
- **Auto-Skip "Still Watching?"** — dismisses the pause interruption prompt automatically
- **Sort Comments Newest First** — overrides YouTube's default comment sort
- **Preload Comments** — loads comments before scrolling to them
- **Clean Share URLs** — strips tracking parameters from copied links
- **Reverse Playlist** — plays playlists in reverse order
- **Per-Channel Settings** — override playback speed on a per-channel basis

### Media Player Integration
Action buttons are injected directly into the video watch page toolbar.

| Button | Function |
|--------|----------|
| VLC | Streams the current video in VLC |
| VLC Queue | Adds video to an existing VLC instance queue |
| Local Download (MP4) | Downloads video via Cobalt or direct |
| MP3 Download | Downloads audio only |
| Summarize | Triggers ChapterForge AI summary |
| Embed Player | Switches to the YouTube embed player |
| MPV | Streams in MPV |
| Download + Play | Downloads and immediately opens in player |

**Right-click context menu** on any video: stream in VLC/MPV, download MP4/MP3/transcript, copy URL/ID, use embed player.

**Subscriptions VLC Playlist** — generates an M3U playlist of your subscription feed for VLC.

**Download Providers:** Cobalt · Direct (yt-dlp compatible)

### Interface Cleanup
| Feature | Default |
|---------|---------|
| Hide Sidebar | On |
| Hide Create Button | On |
| Hide Voice Search | On |
| Logo → Subscriptions | On |
| Widen Search Bar | On |
| Subscriptions Grid Layout | On |
| 5 Videos Per Row | On |
| Hide Shorts | On |
| Redirect Shorts to Watch | On |
| Disable Hover Autoplay | On |
| Hide Paid Content Overlay | On |
| Redirect Channel → Videos Tab | On |
| Hide Playables | On |
| Hide Members-Only Content | On |
| Hide News on Homepage | On |
| Hide Playlist Shelves | On |
| Hide Merch Shelf | On |
| Hide AI Summary Section | On |
| Hide Collaborations | On |
| Hide Info Panels | On |

### Watch Page Element Control
Individual toggles for hiding any element on the video watch page:

Video title · View count · Upload date · Channel avatar · Channel name · Subscriber count · Subscribe button · Join button · Like/Dislike buttons · Share button · Ask button · Save button · More actions · Description box · Ask AI section · Podcast/Course section · Transcript section · Channel info cards

### Action Button Manager
Per-button hide toggles for the action bar below videos:
Like · Dislike · Share · Ask/AI · Clip · Thanks · Save · Join/Sponsor · More Actions

Also includes **Auto-like Videos** and **Replace Share with Cobalt Downloader**.

### Player Controls Manager
Per-control hide toggles for the video player bar:
SponsorBlock · Next Video · Autoplay Toggle · Subtitles · Captions · Miniplayer · Picture-in-Picture · Theater Mode · Fullscreen

### Live Chat Manager
Per-element toggles for live stream chat:
Header · Menu · Popout · Reactions · Timestamps · Polls · Ticker · Leaderboard · Support Buttons · Banner · Emoji · Fan Badges · Super Chats · Level Up · Bot Messages

Includes a **keyword filter** to hide messages containing specific words.

### Sticky Video Player
Floats the video player as a pip-style overlay when scrolling down the page. Supports drag repositioning and resize handles.

---

## Console API

YTKit exposes a `window.ytkit` object for debugging:

```javascript
ytkit.safe()           // Enable safe mode (all features disabled) and reload
ytkit.unsafe()         // Exit safe mode and reload
ytkit.diagCSS()        // Remove ad blocker CSS for diagnostics
ytkit.diagAdblock(false) // Disable the ad blocker and reload
ytkit.testOnly('featureId') // Enable only one feature and reload
ytkit.disableAll()     // Disable all features and reload
ytkit.list()           // Log all enabled/disabled feature IDs
```

**Safe mode** can also be activated by adding `?ytkit=safe` to any YouTube URL.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Document Start (run-at: document-start)                            │
│                                                                     │
│  ┌─────────────────────────────┐  ┌──────────────────────────────┐ │
│  │  Phase 1: Page Context      │  │  Phase 2: Sandbox (GM)       │ │
│  │  (unsafeWindow)             │  │                              │ │
│  │                             │  │  • Cosmetic CSS injection    │ │
│  │  • JSON.parse proxy         │  │  • DOM MutationObserver      │ │
│  │  • fetch() proxy            │  │  • SSAP skip delegation      │ │
│  │  • XHR proxy                │  │  • Feature init system       │ │
│  │  • DOM appendChild trap     │  │  • Settings panel UI         │ │
│  │  • setTimeout neutralizer   │  │  • SPA navigation rules      │ │
│  │  • Promise.then anti-detect │  │  • Button injection system   │ │
│  │  • Property traps           │  │                              │ │
│  └─────────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

The ad blocker uses a **split architecture**: the proxy engine runs directly on `unsafeWindow` so YouTube's internal code sees the intercepted functions, while all other features operate in Tampermonkey's sandbox with access to GM APIs. This avoids Trusted Types / CSP issues without injecting `<script>` tags.

---

## Settings Export / Import

All settings, hidden videos, blocked channels, and bookmarks can be exported to a JSON file and imported on another browser or profile via the Settings → Advanced panel.

---

## Compatibility

| Browser | Extension | Status |
|---------|-----------|--------|
| Chrome / Edge | Tampermonkey | Fully supported |
| Firefox | Tampermonkey / Violentmonkey | Fully supported |
| Chrome / Edge | Violentmonkey | Supported |

**Excluded pages:** `m.youtube.com` (mobile) · `studio.youtube.com`

---

## FAQ

**Features aren't loading after update.**
Open the YTKit settings panel and use the Export button to save your settings, then hard-reload the page (`Ctrl+Shift+R`).

**The ad blocker isn't working.**
Open the browser console and run `ytkit.diagAdblock(true)` to re-enable it, or check the Ad Blocker pane in settings to confirm it's toggled on.

**ChapterForge shows no transcript.**
Try changing the Transcript Source setting from `auto` to `captions-only`. If captions aren't available, Whisper (in-browser) or a local WhisperServer are required.

**Buttons aren't appearing on the watch page.**
Run `ytkit.list()` in the console to confirm the relevant button feature is enabled. If it is, the button injection system retries on every navigation — waiting a few seconds usually resolves timing issues.

**Something broke and the page is unusable.**
Add `?ytkit=safe` to the URL, or run `ytkit.safe()` in the console. This disables all features and lets you diagnose which one is causing the problem using `ytkit.testOnly('featureId')`.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Contributing

Issues and pull requests are welcome. For significant changes, please open an issue first to discuss the approach.

**Repository:** [github.com/SysAdminDoc/YTKit](https://github.com/SysAdminDoc/YTKit)
