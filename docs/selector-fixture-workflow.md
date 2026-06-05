# Selector Fixture Refresh Workflow

Astra Deck treats saved YouTube MHTML captures as selector ground truth. Use this workflow whenever a feature silently stops attaching, YouTube rolls out a new player/UI variant, or `ytkit.selectorHealth()` reports recurring misses on high-churn surfaces.

## Capture

1. Use Chrome stable with a clean profile when possible.
2. Disable other YouTube-modifying extensions before capture.
3. Open the exact surface you need to validate: home, watch, subscriptions, search, channel, notifications menu, or live chat.
4. Let the page settle for at least 5 seconds.
5. Save with **File > Save Page As > Webpage, Single File**.
6. Replace the local gitignored capture under `mhtml/`:
   - `mhtml/YouTube.mhtml` for the home feed.
   - `mhtml/WatchPage.mhtml` for the watch page and player.
   - `mhtml/LiveChat.mhtml` for the live-chat popout iframe document.
7. For live chat, use a non-headless Chrome user-agent when capturing through
   DevTools automation. YouTube rejects `HeadlessChrome` on the popout chat URL
   as an old browser.

### Watch-page wrapper probe

Full watch-page MHTML snapshots can time out because the live video page keeps
loading media and chat resources. When refreshing live-chat wrapper selectors,
pair `mhtml/LiveChat.mhtml` with a rendered watch-page DOM probe for:

- `ytd-live-chat-frame#chat`
- `ytd-live-chat-frame`
- `iframe#chatframe`
- `ytd-live-chat-frame iframe`

Document the video id, date, and probe result in the changelog or hardening
notes when these wrapper selectors change.

### Watch-page CDP capture

For player-chrome refreshes, try the stopped-loading Chrome Stable helper before
falling back to a manual browser save:

```powershell
npm run capture:watch
npm run build:fixtures
```

`scripts/capture-watch-mhtml.js` launches a temporary Chrome profile, waits for
`ytd-watch-flexy`, `#movie_player`, and `.ytp-delhi-modern`, pauses/stops page
loading with `Page.stopLoading`, then calls `Page.captureSnapshot`. This avoids
many long-running media/ad requests that make a plain DevTools MHTML snapshot
time out. If Chrome still times out, the helper writes a single-part MHTML from
the settled rendered DOM (`captureMode: "dom-mhtml-fallback"`) so selector
fixtures can still be regenerated from browser evidence. The raw
`mhtml/WatchPage.mhtml` file remains gitignored; commit only the regenerated
`tests/fixtures/yt-watch.tokens.txt` and
`tests/fixtures/selector-surface-matches.json` deltas.

## Regenerate

Run:

```powershell
npm run build:fixtures
npm test -- --test-name-pattern "Selector"
```

The fixture builder decodes the MHTML text parts and regenerates committed token
signatures in `tests/fixtures/*.tokens.txt`. It also writes
`tests/fixtures/selector-surface-matches.json`, a DOM-subset match report for the
MHTML-backed surfaces listed in `SURFACE_MATCH_SOURCES` inside
`scripts/build-selector-fixtures.js`. Raw `.mhtml` files remain local and
gitignored.

## Review

1. Inspect the fixture diff for removed `ytd-*`, `yt-*`, `ytp-*`, `html5-*`, and `movie_player` tokens.
2. Inspect `tests/fixtures/selector-surface-matches.json`; every registered
   surface must have at least one matched stable selector, and any required
   release-blocking selector listed in `tests/selector-regression.test.js` must
   have `matched: true`.
3. Compare the diff with `ytkit.exportSelectorHealth()` from a live page when available.
4. Promote confirmed replacements into `extension/core/selectors.js` as stable selectors when they are structural, role/data/aria-based, or custom-element based.
5. Keep older selectors as fallbacks during A/B rollout windows.
6. Update `tests/selector-regression.test.js` when a promoted selector should become a release-blocking canary.

## Acceptance

- `npm run build:fixtures` completes without missing capture files.
- `npm test -- --test-name-pattern "Selector"` passes.
- `selector-surface-matches.json` stays synced to each capture-backed
  selector-pack stable/fallback array registered by the fixture builder.
- New player/UI variants keep legacy and new selectors in the chain.
- Live-chat wrapper-only changes are documented with the rendered watch-page
  probe when a full watch-page MHTML capture still times out.
