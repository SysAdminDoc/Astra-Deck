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
3. Your userscript manager opens an install tab — click **Install**.
4. Open YouTube. Done. It auto-updates when new versions ship.

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

> **`github-full`** has everything (downloads, optional AI summary, Cobalt
> fallback). **`store-safe`** is the slimmer build with those extra-permission
> features removed — use it if you prefer the minimal permission set.

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

## Removing

- Extension: open `chrome://extensions` and click **Remove**.
- Userscript: open your userscript manager's dashboard and delete Astra Deck.

## Trouble?

- Nothing appears on YouTube? Reload the YouTube tab after installing.
- The popup is empty? Make sure you loaded the **unzipped folder**, not the ZIP.
- Found a bug? Open an issue on the
  [tracker](https://github.com/SysAdminDoc/Astra-Deck/issues).
