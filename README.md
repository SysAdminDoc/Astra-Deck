<p align="center">
  <img src="assets/ytlogo.png" alt="YTKit Logo" width="80">
</p>

<h1 align="center">YTKit: YouTube Customization Suite</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.2.0-ff4e45?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox%20%7C%20Tampermonkey%20%7C%20Violentmonkey-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/YouTube-Desktop-ff0000?style=flat-square&logo=youtube&logoColor=white" alt="YouTube">
</p>

<p align="center">
  A Chrome/Firefox extension and userscript with 115+ features that transforms YouTube into a clean, ad-free, distraction-free experience with a premium dark interface — zero configuration required.
</p>

<p align="center">
  <a href="https://github.com/SysAdminDoc/YouTube-Kit/raw/refs/heads/main/YTKit.user.js"><strong>⬇ Install Userscript</strong></a>
</p>

---

## Installation

### Chrome Extension (Recommended)

1. Download or clone the `extension/` folder from this repo
2. Open `chrome://extensions/` in Chrome, Edge, or Brave
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `extension/` folder
5. Open YouTube — everything works immediately

The extension runs as a Manifest V3 Chrome extension with full cookie access, cross-origin fetch support, and no userscript manager required.

### Firefox Extension

1. Download the `.xpi` file from the [latest release](https://github.com/SysAdminDoc/YouTube-Kit/releases)
2. Open `about:addons` in Firefox
3. Click the gear icon and select **Install Add-on From File**
4. Select the `.xpi` file
5. Open YouTube — everything works immediately

Requires Firefox 128+. The Firefox build auto-patches the manifest for Gecko compatibility.

### Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. **[Click here to install YTKit](https://github.com/SysAdminDoc/YouTube-Kit/raw/refs/heads/main/YTKit.user.js)**
3. Confirm installation when prompted
4. Open YouTube — everything works immediately

The userscript auto-updates through your userscript manager. Every feature is enabled by default and fully configurable through the built-in settings panel.

---

## What It Does

YTKit replaces the need for multiple browser extensions by combining ad blocking, SponsorBlock, UI customization, download integration, and 79+ playback/enhancement features into one package. Available as a Chrome MV3 extension, Firefox extension, and Tampermonkey/Violentmonkey userscript. Every feature runs at `document-start` for instant ad prevention, and the entire settings panel is built in — no external dashboards or config files. New features added in v3.2.0 are all **off by default** to preserve a clean baseline.

---

## Features

### Ad Blocking

| Feature | Description | Default |
|---------|-------------|---------|
| YouTube Ad Blocker | Block video ads via API proxy interception, JSON response pruning, and cosmetic hiding | Off |
| Cosmetic Element Hiding | Hide ad slots, banners, merch shelves, and promoted content via CSS filter lists | On |
| SSAP Auto-Skip | Detect and auto-skip server-side ad stitching in videos | On |
| Anti-Detection Bypass | Block YouTube's ad-blocker detection and countermeasure scripts | On |

The ad blocker uses a split architecture: Phase 1 injects a proxy engine into the real page context (bypassing the userscript sandbox) to intercept `fetch`/`XMLHttpRequest` and prune ad payloads from YouTube's API responses. Phase 2 runs CSS cosmetic filters and a DOM mutation observer to remove ad elements that slip through. Supports remote filter lists with auto-update.

### SponsorBlock

| Feature | Description | Default |
|---------|-------------|---------|
| Skip Sponsors | Auto-skip sponsored segments, intros, outros, self-promo, interaction reminders, and filler using the SponsorBlock API | On |
| Hide SponsorBlock Labels | Hide the colored category labels on the seek bar | On |

### Interface

| Feature | Description | Default |
|---------|-------------|---------|
| Logo → Subscriptions | Clicking the YouTube logo navigates to subscriptions instead of home | On |
| Logo Quick Links | Hover over the YouTube logo to reveal a customizable dropdown with quick navigation links (History, Watch Later, Playlists, Liked Videos, Subscriptions, For You Page) | On |
| Edit Quick Links | Customize dropdown items via the settings panel — one link per line in `Label \| URL` format | — |
| Hide Create Button | Remove the "Create" button from the header toolbar | On |
| Hide Voice Search | Remove the microphone icon from the search bar | On |
| Widen Search Bar | Expand the search bar to use more available space | On |
| Subscriptions Grid | Use a denser grid layout on the subscriptions page | On |
| Homepage Grid Align | Force uniform thumbnail grid — prevents misaligned rows from variable title heights | On |
| Styled Filter Chips | Polished filter chips on the homepage with glassmorphism and hover effects | On |
| Hide Sidebar | Remove the left navigation sidebar | On |
| Videos Per Row | Set thumbnail columns per row (0 = dynamic, 3–8 = fixed) | Dynamic |

### Appearance

| Feature | Description | Default |
|---------|-------------|---------|
| UI Style | Choose rounded or square UI elements | Square |
| Watch Page Restyle | Polished watch page layout with glassmorphism accents, refined title/metadata/description styling | On |
| Refined Comments | Card-based comment layout with avatars and clean thread lines | On |
| Disable Ambient Mode | Turn off the glowing background effect that matches video colors | On |
| Compact Layout | Reduce spacing and padding for a denser interface | On |
| Thin Scrollbar | Slim, unobtrusive scrollbar | On |

### Content Filtering

| Feature | Description | Default |
|---------|-------------|---------|
| Remove Shorts | Hide all Shorts from feeds and recommendations | On |
| Redirect Shorts | Open Shorts URLs in the standard video player | On |
| Channels → Videos Tab | Open channel pages directly on the Videos tab | On |
| Hide Collaborations | Hide videos from channels you're not subscribed to in your subscriptions feed | On |
| Hide News Section | Remove news sections from the homepage | On |
| Hide Playlist Shelves | Remove playlist sections from the homepage | On |
| Hide Playables | Hide YouTube Playables gaming content | On |
| Hide Members Only | Hide members-only content from channels | On |
| Full-Width Subscriptions | Expand the subscription grid to fill the page | On |
| Hide Layout Options | Remove the "Latest" header and view toggles on subscriptions | On |
| Disable Hover Preview | Stop videos from auto-playing on thumbnail hover | On |
| Hide Promotion Badges | Remove "Includes paid promotion" overlays | On |
| Hide Info Panels | Remove Wikipedia/context info boxes (FEMA, COVID, etc.) | On |
| Clean Share URLs | Strip tracking params (`si`, `pp`, `feature`) from copied/shared YouTube links | On |

### Video Hider

| Feature | Description | Default |
|---------|-------------|---------|
| Hide Videos from Home | Hide individual videos or entire channels from feeds — click the X on thumbnails, right-click to block channels | On |
| Block Channels | Maintain a block list of channels whose videos are automatically hidden | On |
| Keyword Filter | Auto-hide videos matching keywords (comma-separated) or regex patterns (e.g. `/\[.*\]/i`). Prefix with `!` to whitelist | — |
| Duration Filter | Auto-hide videos shorter than a specified duration (in minutes) | Off |
| Subscriptions Load Limiter | Stop infinite scroll on subscriptions page when consecutive batches are all hidden | On |
| Hide All Button | Bulk-hide all visible videos on the subscriptions page | — |

The Video Hider settings panel provides a 4-tab interface: **Videos** (grid with thumbnails and unhide buttons), **Channels** (list with unblock), **Keywords** (textarea with regex support), and **Settings** (duration filter, load limiter, statistics). All data persists via `GM_setValue` with undo support.

### Video Player

| Feature | Description | Default |
|---------|-------------|---------|
| Theater Split | Fullscreen video on watch pages — scroll down to reveal comments side-by-side, scroll back up to return to fullscreen | On |
| Expand Video Width | Stretch the video to fill available space when sidebar is hidden | On |
| YTKit Player Controls | Replace native player right-controls with YouTube logo (quick links dropdown) and settings gear | On |
| Auto-Resume Position | Resume videos from where you left off | On |
| Resume Threshold | Seconds into a video before saving resume position | 15s |
| Monitor Switch Fix | Auto-recover video when moving browser between monitors (fixes black screen with audio) | On |
| Auto Quality | Automatically select preferred video quality (max, 4K, 1440p, 1080p, 720p, 480p) | Max |
| Enhanced Bitrate | Request higher bitrate streams when available | On |
| Hide Quality Popup | Suppress the quality selection popup during auto-selection | On |
| Hide Description | Remove the video description panel | On |
| Hide Related Videos | Remove the related videos panel | On |
| Hide Video End Content | Remove end cards, end screen, and video grid when videos finish | On |

### Clutter Removal

| Feature | Description | Default |
|---------|-------------|---------|
| Hide Merch Shelf | Remove merchandise promotions below videos | On |
| Hide AI Summary | Remove AI-generated summaries and Ask AI buttons | On |
| Hide Description Extras | Remove extra elements in the description area | On |
| Hide Hashtags | Remove hashtag links above video titles | On |
| Hide Pinned Comments | Remove pinned comments from the comments section | On |
| Hide Comment Actions | Remove action menu from individual comments | On |
| Condense Comments | Reduce spacing between comments | On |
| Hide Comment Teaser | Remove the "Scroll for comments" prompt | On |
| Hide Chat Engagement | Remove engagement prompts in live chat | On |
| Hide Paid Promotion | Remove "paid promotion" labels on watch pages | On |
| Hide Channel Join Button | Remove the Join/membership button | On |
| Hide Fundraisers | Remove fundraiser and donation badges | On |

### Configurable Element Managers

These features provide granular toggle controls through the settings panel:

| Manager | Controls |
|---------|----------|
| **Hide Action Buttons** | Like, Dislike, Share, Ask/AI, Clip, Thanks, Save, Join/Sponsor, More Actions |
| **Hide Player Controls** | SponsorBlock, Next, Autoplay, Subtitles, Captions, Miniplayer, PiP, Theater, Fullscreen |
| **Hide Watch Elements** | Join Button, Ask Button, Save Button, More Actions, Ask AI Section, Podcast Section, Transcript Section, Channel Info Cards |
| **Hide Chat Elements** | Header, Menu, Popout, Reactions, Timestamps, Polls, Ticker, Leaderboard, Support, Banner, Emoji, Top Fan, Super Chats, Level Up, Bots |
| **Chat Keyword Filter** | Comma-separated list of words to hide from live chat |

### Downloads & Streaming

| Feature | Description | Default |
|---------|-------------|---------|
| Video Context Menu | Right-click on video player for download options, VLC/MPV streaming, transcript download, embed player, copy URL/ID | On |
| Web Download Button | Add a Cobalt-based web download button below videos | Off |
| VLC Player Button | Stream video directly in VLC media player | Off |
| Local Download Button | Download video locally via `yt-dlp` | On |
| MP3 Download Button | Download audio as MP3 via `yt-dlp` | On |
| Configurable Cobalt URL | Set custom Cobalt instance URL | `cobalt.meowing.de` |

> **Note:** Local downloads use the built-in MediaDL server (installed via the YTKit settings panel) which bundles `yt-dlp` and `ffmpeg` — no manual setup required. The server runs locally and downloads videos in the background with real-time progress tracking. VLC/MPV streaming requires a URI protocol handler. The web download button uses [Cobalt](https://github.com/imputnet/cobalt) and works without any local tools.

### Playback Enhancement (v3.2.0)

All off by default.

| Feature | Description |
|---------|-------------|
| Auto-Dismiss "Still Watching?" | Automatically dismiss the idle popup |
| Remaining Time Display | Show time remaining next to current time |
| Show Playlist Duration | Display total duration of playlists |
| Show Time in Tab Title | Prepend video timestamp to the browser tab title |
| Custom Progress Bar Color | Color picker for the player progress bar |
| Reverse Playlist | Reverse playlist playback order |
| Precise View Counts | Show exact view counts instead of abbreviated |
| Video Screenshot | Capture the current video frame as PNG |
| Fine Speed Control | Granular 0.05x speed adjustment buttons |
| A-B Loop | Set loop start/end points on the video |
| Persistent Speed | Remember playback speed across videos |
| Per-Channel Speed | Set different playback speeds per channel |
| Codec Selector | Force H.264, VP9, or AV1 codec |
| Force H.264 | Force H.264 codec (conflicts with Codec Selector) |
| Force Standard FPS | Block 60fps streams |
| Speed Indicator Overlay | Show current speed when above 1x |
| Custom Speed Buttons | Preset speed buttons (0.5x-3x) below video |
| Disable Autoplay Next | Turn off auto-advance to next video |

### Audio Enhancement (v3.2.0)

All off by default. Audio features share a single Web Audio pipeline via SharedAudio manager.

| Feature | Description |
|---------|-------------|
| Volume Boost | Amplify volume up to 600% |
| Skip Silence | Auto-skip silent segments (adjustable threshold) |
| Audio Normalization | Even out volume differences |
| Audio Equalizer | 10-band EQ with 9 presets (Flat, Bass Boost, Treble, etc.) |
| Volume Scroll Wheel | Scroll on player to adjust volume (Ctrl+scroll reserved for zoom) |
| Remember Volume | Persist volume level across sessions |
| Mute Ad Audio | Auto-mute during ad segments |

### UI Enhancement (v3.2.0)

All off by default.

| Feature | Description |
|---------|-------------|
| Compact Unfixed Header | Reduce header height and remove sticky position |
| Return YouTube Dislike | Show dislike counts via RYD API |
| RSS Feed Link | Show RSS feed link on channel pages |
| Show Channel Video Count | Display total video count on channel pages |
| Redirect Home to Subs | YouTube logo goes to subscriptions feed |
| Not Interested Button | Quick "Not Interested" button on thumbnails |
| Blue Light Filter | Warm screen overlay (adjustable intensity 10-80%) |
| Disable Infinite Scroll | Stop infinite scroll, show "Load More" button |
| Always Show Progress Bar | Keep progress bar visible even when controls hide |
| Sort Comments Newest | Default comments to newest-first |
| Chapter Nav Buttons | Previous/next chapter buttons in player controls |
| Video Loop Button | One-click loop toggle in player controls |
| Sticky Chat | Keep live chat pinned when scrolling |
| Auto-Expand Description | Automatically expand video descriptions |
| Scroll to Player | Auto-scroll to player on page load |
| Hide End Cards | Hide end-screen cards (sub-feature of Hide Video End Content) |
| Hide Info Cards | Hide info card tooltips during playback |
| Key Moments | Highlight chapters in the progress bar |

### Power User (v3.2.0)

All off by default.

| Feature | Description |
|---------|-------------|
| Auto Theater Mode | Open videos in theater mode by default |
| Resume Playback | Save and restore playback positions (500-entry cap) |
| Mini Player Bar | Floating mini-bar with progress/play/pause when scrolled past video |
| Playback Stats Overlay | Show codec, resolution, dropped frames, bandwidth |
| Hide Notification Badge | Remove the red notification count badge |
| Auto-Pause on Tab Switch | Pause video when switching tabs, resume on return |
| Pause Other Tabs | Pause other YTKit tabs when playing in current tab |
| Creator Comment Highlight | Highlight channel owner's comments |
| Copy Video Title | Button to copy the video title |
| Channel Age Display | Show when a channel was created |
| Hide Autoplay Toggle | Remove the autoplay toggle switch |
| Fullscreen on Double-Click | Double-click video to toggle fullscreen |

### Media & Interaction (v3.2.0)

All off by default.

| Feature | Description |
|---------|-------------|
| PiP Button | One-click Picture-in-Picture in player controls |
| Pop-Out Player | Pop video into a floating Document PiP window |
| Auto Subtitles | Auto-enable closed captions |
| Focused Mode | Hide everything except video and comments |
| Thumbnail Quality Upgrade | Replace thumbnails with maxresdefault quality |
| Watch Later Quick Add | Clock overlay on thumbnails for quick Watch Later add |
| Playlist Enhancer | Shuffle and copy-all-URLs for playlists |
| Comment Search | Filter bar above comments section |
| Video Zoom | Ctrl+scroll to zoom video, drag to pan (up to 5x) |
| Force Dark Everywhere | Apply dark theme to all YouTube pages |

### Customization & Utilities (v3.2.0)

All off by default.

| Feature | Description |
|---------|-------------|
| Custom CSS Injection | Textarea for user-defined CSS rules |
| Share Menu Cleaner | Hide social share buttons in share dialog |
| Auto-Close Popups | Dismiss cookie/survey/premium popups automatically |
| Video Resolution Badge | Show 4K/HD badges on thumbnails |
| Like:View Ratio | Display like-to-view percentage badge |
| Download Thumbnail | Download maxres thumbnail button |
| Grayscale Thumbnails | Thumbnails are grayscale until hovered |
| Channel Sub Count | Prominent subscriber count badge on channel pages |
| Open in New Tab | Video links open in new tabs |
| Cinema Ambient Glow | Ambient glow effect around video matching content colors |
| Transcript Viewer | Sidebar with clickable timestamps from video captions |
| Search Filter Defaults | Set default search sort order |
| Timestamp Bookmarks | Save timestamped bookmarks with inline notes |
| Watch Time Tracker | Track total watch time (90-day retention) |
| Auto-Skip Chapters | Skip chapters matching keyword patterns |
| Age Restriction Bypass | Attempt to bypass age restrictions |
| Auto-Like Subscribed | Auto-like videos from subscribed channels |

### Restored Archive Features (v3.2.0 Wave 8)

All off by default. Features restored from archived userscript versions.

| Feature | Description |
|---------|-------------|
| Prevent Autoplay | Stop videos from auto-playing on page load |
| Auto-Open Chapters | Automatically expand chapter panel on watch pages |
| Auto-Open Transcript | Automatically open transcript panel on watch pages |
| Chronological Notifications | Sort notification bell dropdown newest-first |
| Adaptive Live Layout | Dynamic chat/video sizing for live streams |
| Comment Navigator | J/K keyboard navigation between comments |
| Shorts as Regular Video | Redirect /shorts/ URLs to /watch for full player |
| Theme Accent Color | Custom accent color picker for YouTube UI |
| Theater Auto-Scroll | Scroll to player automatically when entering theater mode |
| Scroll Wheel Speed | Shift+scroll to adjust playback speed (yields to volumeScrollWheel/videoZoom) |
| Playback Speed OSD | On-screen display when speed changes |
| CPU Tamer | Throttle background tab timers via requestAnimationFrame |
| Handle Revealer | Resolve and display @handles in comment sections |
| Nyan Cat Progress Bar | Rainbow animated video progress bar |

#### External Player Integration

| Feature | Description |
|---------|-------------|
| VLC Queue Button | Send video to VLC via `ytvlcq://` protocol |
| MPV Player Button | Send video to mpv via `ytmpv://` protocol |
| Download & Play Button | Download and play via `ytdlplay://` protocol |
| Auto-Download on Visit | Automatically trigger download when visiting a video |
| Subscriptions VLC Playlist | Export subscriptions feed as VLC playlist |
| Embed Player | Custom HTML5 embed player replacing YouTube's default |

#### DeArrow Integration

| Feature | Description |
|---------|-------------|
| DeArrow | Replace clickbait titles and thumbnails via DeArrow API |
| — Replace Titles | Use community-submitted titles (sub-setting) |
| — Replace Thumbnails | Use community-submitted thumbnails (sub-setting) |
| — Title Format | Sentence case or title case formatting |
| — Show Original on Hover | Reveal original title/thumbnail on hover |
| — Cache TTL | API response cache duration (hours) |

#### SponsorBlock Per-Category Controls

| Feature | Description |
|---------|-------------|
| Sponsor Segments | Toggle skipping of sponsor segments |
| Self-Promotion | Toggle skipping of self-promotion segments |
| Interaction Reminders | Toggle skipping of interaction reminders |
| Intros | Toggle skipping of intro segments |
| Outros | Toggle skipping of outro/endcard segments |
| Preview/Recap | Toggle skipping of preview/recap segments |
| Filler/Tangent | Toggle skipping of filler content |
| Non-Music in Music | Toggle skipping of non-music in music videos |

#### Additional UI & Layout

| Feature | Description |
|---------|-------------|
| Square Search Bar | Remove rounded corners from the search bar |
| Square Avatars | Make all channel avatars square instead of round |
| Fit Player to Window | Video player fills the entire browser viewport |
| Disable SPA Navigation | Force full page loads instead of smooth transitions |

#### Advanced

| Feature | Description |
|---------|-------------|
| Statistics Dashboard | Detailed extension stats panel (blocked ads, features active, etc.) |
| Settings Profiles | Save, load, and manage settings presets |
| Debug Mode | Verbose console logging for troubleshooting |

---

## Settings Panel

Access the settings panel by clicking the gear icon in the YouTube masthead or in the player controls. The panel features:

- **Searchable sidebar** with categorized feature groups
- **Toggle switches** for every feature with instant apply
- **Sub-feature controls** for granular element hiding
- **Textarea editors** for custom filter lists, quick links, and chat keywords
- **Quick access bar** at the bottom of the panel for frequently used toggles
- **Export/Import/Reset** for backing up and restoring your configuration

All settings persist across sessions via `chrome.storage.local` (extension) or `GM_setValue`/`GM_getValue` (userscript).

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  document-start (before YouTube loads)                          │
│                                                                 │
│  ┌──────────────────┐   ┌──────────────────┐                   │
│  │  Phase 1: Proxy   │   │  Phase 2: CSS    │                   │
│  │  Engine (page ctx) │   │  + DOM Observer  │                   │
│  │                    │   │  (sandbox ctx)   │                   │
│  │  • fetch proxy     │   │                  │                   │
│  │  • XHR proxy       │   │  • Cosmetic CSS  │                   │
│  │  • JSON pruning    │   │  • Ad element    │                   │
│  │  • Response rewrite│   │    removal       │                   │
│  │  • SSAP neutralizer│   │  • Filter lists  │                   │
│  └──────────────────┘   └──────────────────┘                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Main Script (after DOM ready)                            │   │
│  │                                                           │   │
│  │  Features → Settings Manager → Navigate/Mutation Rules    │   │
│  │                                                           │   │
│  │  • CSS features: inject/remove <style> elements           │   │
│  │  • JS features: DOM observers, event listeners, timers    │   │
│  │  • SPA-aware: re-runs on YouTube's client-side navigation │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

Key architectural decisions:

- **Split-context ad blocking** — The proxy engine runs in the real page context (`MAIN` world) so YouTube's player sees the modified responses. In the extension, this is a separate `adblock-main.js` content script; in the userscript, it's injected via `unsafeWindow`. The sandbox-side (`ISOLATED` world) handles CSS cosmetic filters and DOM mutation observers.
- **GM_* compatibility layer** — The Chrome extension includes `gm-compat.js` which bridges userscript APIs (`GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, `GM_cookie`) to Chrome extension APIs (`chrome.storage.local`, `chrome.runtime.sendMessage`, `chrome.cookies`). This lets the main `ytkit.js` code run identically in both environments.
- **SPA navigation handling** — YouTube is a single-page app. YTKit hooks into `yt-navigate-finish` events and uses a centralized navigate/mutation rule system so features re-apply on every page transition.
- **Lazy feature loading** — Critical features (ad blocking, Theater Split) load immediately. Network-bound features (SponsorBlock) are deferred via `requestIdleCallback`.
- **Trusted Types compliance** — All innerHTML operations use a `TrustedHTML` wrapper that creates a Trusted Types policy, preventing CSP violations on YouTube's strict pages.

---

## Compatibility

| Browser | Method | Status |
|---------|--------|--------|
| Chrome / Edge / Brave | Chrome Extension (MV3) | ✅ Fully supported (recommended) |
| Firefox 128+ | Firefox Extension (MV3) | ✅ Fully supported |
| Chrome / Edge / Brave | Tampermonkey | ✅ Fully supported |
| Firefox | Tampermonkey / Violentmonkey | ✅ Fully supported |
| Opera | Tampermonkey | ✅ Fully supported |
| Safari | Userscripts (App Store) | ⚠️ Limited (no `GM.xmlHttpRequest`) |

**Not supported:** Mobile browsers, YouTube Music, YouTube Studio, embedded players on other sites.

---

## Related Scripts

YTKit is a focused suite. Features that were removed in earlier versions to keep it lean live on in dedicated scripts:

| Script | What It's For | Install |
|--------|--------------|---------|
| **YTKit** *(this repo)* | All-in-one YouTube overhaul — UI, content filtering, player, ad blocking, downloads | [Install](https://github.com/SysAdminDoc/YouTube-Kit/raw/refs/heads/main/YTKit.user.js) |
| **[YoutubeAdblock](https://github.com/SysAdminDoc/YoutubeAdblock)** | Ad blocking only, with more aggressive proxy hooks than YTKit's built-in blocker (JSON.parse proxy, Promise.then proxy, property traps, appendChild proxy). Use this if you only want ads gone and nothing else. | [Install](https://github.com/SysAdminDoc/YoutubeAdblock/raw/refs/heads/main/YoutubeAdblock.user.js) |
| **[Chapterizer](https://github.com/SysAdminDoc/Chapterizer)** | Auto-generates chapters via local NLP (TF-IDF + cosine similarity), detects filler words, AutoSkips pauses — entirely offline, no external APIs. This was YTKit's ChapterForge feature before it was removed in v2.0. | [Install](https://raw.githubusercontent.com/SysAdminDoc/Chapterizer/main/Chapterizer.user.js) |
| **MediaDL** *(built-in)* | Full download suite for YouTube + 1800 sites — background PowerShell server, real-time progress, yt-dlp + ffmpeg turnkey installer. Built into YTKit's download integration. | Use the installer button in YTKit settings |

---

## FAQ

**Q: The ad blocker is off by default?**
A: Yes. YTKit's ad blocker uses aggressive API proxying that may conflict with other ad-blocking extensions. If you're already running uBlock Origin, you may not need it. Enable it in Settings → Ad Blocker if you want YTKit to handle ads instead. For a standalone ad blocker with more proxy hooks, see [YoutubeAdblock](https://github.com/SysAdminDoc/YoutubeAdblock).

**Q: How do I get VLC/MPV streaming working?**
A: Install [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and register a `vlc://` or `mpv://` URI protocol handler on your system. The buttons pass the video URL to your local player via URI scheme. For a full turnkey download solution with a background server and real-time progress, use YTKit's built-in installer button.

**Q: Can I use this with other YouTube extensions?**
A: Yes, but avoid running multiple ad blockers simultaneously. YTKit's cosmetic CSS filters and SponsorBlock integration work alongside most extensions without conflict.

**Q: My settings disappeared after an update.**
A: YTKit stores settings in your userscript manager's storage, which persists across updates. If settings are lost, your userscript manager's data was cleared. Use the Export button in the settings panel to back up your config.

**Q: Theater Split doesn't show comments.**
A: Scroll down. Theater Split starts in fullscreen video mode — scrolling reveals the comments panel side-by-side. Scroll back up to return to fullscreen.

**Q: Where did AI chapter generation go?**
A: It was removed from YTKit in v2.0 to reduce script size. It lives on as a dedicated script: [Chapterizer](https://github.com/SysAdminDoc/Chapterizer).

---

## Contributing

Issues and PRs welcome. If you find a YouTube layout change that breaks a feature, open an issue with the affected page URL and a screenshot.

When submitting a PR:
- Test the Chrome extension (load unpacked) and userscript (Tampermonkey/Violentmonkey) on Chrome and Firefox
- Maintain the existing code style (no external dependencies beyond CDN)
- Scope CSS selectors to avoid global side effects

---

## License

[MIT](LICENSE) — Matthew Parker
