# Installing Astra Deck

Pick the method that fits you. The **userscript** is the easiest (one click), and
the **Load unpacked** method works on any Chromium browser without a store.

Every download is on the [latest release page](https://github.com/SysAdminDoc/Astra-Deck/releases/latest).

---

## Easiest: Userscript (Chrome, Edge, Firefox, Opera, Brave…)

Best if you just want it working in under a minute.

1. Install a userscript manager once:
   - **[Tampermonkey](https://www.tampermonkey.net/)** (recommended), or
   - **[Violentmonkey](https://violentmonkey.github.io/)**.
2. Click the userscript on the
   [latest release](https://github.com/SysAdminDoc/Astra-Deck/releases/latest)
   (the file ending in **`.user.js`**).
3. Your userscript manager opens an install tab. Click **Install**.
4. On Chrome, Edge or Brave 138 and newer, let the manager run scripts: open
   `chrome://extensions`, click **Details** on Tampermonkey (or Violentmonkey)
   and turn on **Allow User Scripts**. It's off for a fresh install, and nothing
   runs until it's on. Older versions use the **Developer mode** toggle at the
   top right of `chrome://extensions` instead. Firefox doesn't need this step.
5. Open YouTube. Done. It auto-updates when new versions ship.

---

## Full extension on Chrome / Edge / Brave / Opera (Load unpacked)

Gives you the toolbar popup and every feature.

1. On the [latest release](https://github.com/SysAdminDoc/Astra-Deck/releases/latest),
   download **`astra-deck-github-full-chrome-vX.Y.Z.zip`**.
2. **Unzip it** to a folder you'll keep (e.g. `Documents/AstraDeck`). The
   extension runs from this folder, so don't delete it after installing.
3. Open `chrome://extensions` (Edge: `edge://extensions`).
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the **unzipped folder**.
6. Pin Astra Deck from the puzzle-piece menu and open YouTube.

> There are three builds of the same extension. **`github-full`** has everything:
> downloads through Astra Downloader, the optional AI summary and the optional
> self-hosted Cobalt fallback. **`store-safe`** keeps Astra Downloader but drops the
> features that need extra site permissions. **`chromium-store`** is the
> download-free build, shaped like the Chrome Web Store and Edge package. Pick it
> if you don't want any download features at all. Each one comes as a Chrome
> `.zip` and a Firefox `.xpi` on the release page.

---

## Firefox

Firefox only runs extensions that are signed by Mozilla, so for now the smoothest
Firefox option is the **userscript** method above. To try the full extension
temporarily (it stays until you restart Firefox):

1. Download **`astra-deck-github-full-firefox-vX.Y.Z.xpi`** from the
   [latest release](https://github.com/SysAdminDoc/Astra-Deck/releases/latest).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the `.xpi`.

---

## Updating

- **Userscript:** updates automatically.
- **Load unpacked:** download the new ZIP, unzip over the same folder, then click
  the refresh icon on the card in `chrome://extensions`.

## Coming from another extension

Turn the old extension off once you've moved over. Two extensions changing the same player controls will get in each other's way.

### BlockTube

Your filters come across directly:

1. On BlockTube's options page, click **Export** and save the `.json` file.
2. In the Astra Deck popup, click **Import** and pick that file. It can be up to 8 MB.

The rules go into **Video Hider** and your settings stay as they were. Astra Deck saves an undo point first, and nothing already in your lists gets pushed out. ChannelSieve backups import the same way.

| In BlockTube | After the import |
| --- | --- |
| Channel IDs | Blocked channels |
| Video IDs | Hidden videos (regex lines in this list can't move) |
| Video titles and channel names | Keyword or regex rules, listed under imported rules in Video Hider |
| Comment rules | Left behind, so add them by hand in **Comment Filter** |
| Duration range | Left behind, and Video Hider has its own duration filter |
| JavaScript filter | Left behind, and never run or stored |

When it finishes you'll see how many filters were added, already there, invalid, not supported or over the limit.

### Iridium

Iridium's repository is archived, and its README says it's no longer actively maintained. Its settings don't import, so turn on what you used by hand:

| In Iridium | In Astra Deck |
| --- | --- |
| Ad options | The extension's built-in rules block ad requests, with nothing to turn on. The userscript doesn't have them. |
| Default quality | **Always Best Quality** or **Per-Context Quality** |
| Default speed | **Persistent Playback Speed** or **Per-Channel Speed Memory** |
| Scroll for volume | **Volume Wheel** |
| Loudness off | **Keep Volume At Full** |
| Ambient mode off | **Disable Ambient Mode** (already on) |
| Shorts on the home, search, subscription and watch pages | **Remove Shorts** and **Redirect Shorts** (both already on) |
| End screen and info cards | **Hide End Screen Cards** and **Hide Info Cards** |
| Creator merch | **Hide Merch Shelf** (already on) |
| Autoplay and channel trailers | **Prevent Autoplay** and **Disable Autoplay Next Video** |
| Default channel tab | **Channels → Videos Tab** |
| Logo goes to subscriptions | **Logo Click → Subscriptions** |
| Full titles | **Show Full Video Titles** (already on) |
| Reverse playlist | **Reverse Playlist Button** |
| Always visible player | **Mini Player Bar** |
| Focus mode | **Focused Mode** |
| Screenshots | **Video Screenshot** |
| Thumbnails | **Download Thumbnail Button** |
| Channel blacklist | **Video Hider** |

### Enhancer for YouTube

Enhancer's settings don't import either. These are the closest matches:

| In Enhancer | In Astra Deck |
| --- | --- |
| Playback speed | **Persistent Playback Speed**, **Fine Speed Control** and **Speed Preset Buttons** |
| Default quality | **Always Best Quality** or **Per-Context Quality** |
| Volume and volume booster | **Volume Boost** and **Volume Wheel** |
| Codecs and formats | **Codec Selector** or **Force H.264 Codec** |
| Autoplay | **Prevent Autoplay** and **Disable Autoplay Next Video** |
| Mini player and pop-up player | **Mini Player Bar** and **Pop-Out Player** |
| Loop | **Video Loop Button** and **A-B Loop** |
| Screenshots | **Video Screenshot** |
| Cinema mode and larger player | **Focused Mode** and **Auto Theater Mode** |
| Custom themes | **Color Theme** and **Accent Color** |
| Custom CSS | **Custom CSS**, in the GitHub-full build only |

Enhancer's keyboard shortcuts, custom script and brightness or contrast video filters have no match here. The closest filter is **Blue Light Filter**, which adds a warm tint.

## Removing

- Extension: open `chrome://extensions` and click **Remove**.
- Userscript: open your userscript manager's dashboard and delete Astra Deck.

## Trouble?

- Nothing appears on YouTube? Reload the YouTube tab after installing.
- The popup is empty? Make sure you loaded the **unzipped folder**, not the ZIP.
- Found a bug? Open an issue on the
  [tracker](https://github.com/SysAdminDoc/Astra-Deck/issues).
