# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

## Research-Driven Additions

### Now (P1)

### Next (P2)

- [ ] P2 Give the settings sidebar tools a place in narrow windows. Under 901px the panel turns the categories into one row of tabs and hides the sidebar footer, so the GitHub link, Diagnostics, the downloader page and the version number can't be reached until the window is wider.
- [ ] P2 Earn back the startup debt. `scripts/startup-performance-baseline.json` carries 15 ms of `acceptedRegression` on first feature paint, because the core loader and feature module stages grew from 53 and 6 ms to about 78 and 15 ms as modules went from 9 to 32. Try not loading modules for features a default profile leaves off, then lower the debt to zero and delete it.
- [ ] P2 Translate the downloader failure copy. `DOWNLOADER_FAILURE_COPY` in `extension/features/download-ui/index.js` is English in every locale, and so are the repair prompt's pairing-closed description and its Check again note, which read from it. Give each entry a message key and an advice key in all 11 locales.
- [ ] P2 Name the stage on the download progress card. It says Finishing for merging, extracting audio, trimming and transcribing alike, and a download you cancel in Astra Downloader reads Failed and Needs Attention. Add a label per stage and a Cancelled state, which needs new keys in all 11 locales.
- [ ] P2 Keep the Firefox and userscript-manager smokes away from an installed Astra Downloader. Only the Chromium lanes go through `scripts/companion-fence.js`. Astra Downloader builds after 2.18.1 pair any copy that asks, so `smoke-userscript-managers.js` and `smoke-userscript-settings.js` can pair with the real install on the machine running them, and the Firefox lane has no block at all. Give Firefox a proxy or `network.dns.localDomains` rule for the companion ports and stop each lane before YouTube loads if a port answers.
- [ ] P2 Give the release zips the published extension ID. A zip loaded unpacked has no manifest `key`, so its ID comes from the folder path and Astra Downloader 2.18.1 and older won't pair it until you open Allow extension pairing. Put the CRX public key (the base64 SPKI `docs/signing-keys.md` derives `lgbiefafhjdbplelniclnflbbilennlg` from) in the Chrome zip's manifest as `key`, and check the Firefox build drops it.
- [ ] P2 Fit Theater Split's owner actions on one row. Like, Download, Add to Watch Feed and the two tool buttons need about 480 px and the column opens at 392 to 464 px, so they wrap. Showing Add to Watch Feed as its icon at that width would do it, and the zero-ads smoke's owner card and metadata limits can go back to 110 and 235 px.
