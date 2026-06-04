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

## Regenerate

Run:

```powershell
npm run build:fixtures
npm test -- --test-name-pattern "Selector"
```

The fixture builder decodes the MHTML HTML part and regenerates committed token signatures in `tests/fixtures/*.tokens.txt`. Raw `.mhtml` files remain local and gitignored.

## Review

1. Inspect the fixture diff for removed `ytd-*`, `yt-*`, `ytp-*`, `html5-*`, and `movie_player` tokens.
2. Compare the diff with `ytkit.exportSelectorHealth()` from a live page when available.
3. Promote confirmed replacements into `extension/core/selectors.js` as stable selectors when they are structural, role/data/aria-based, or custom-element based.
4. Keep older selectors as fallbacks during A/B rollout windows.
5. Update `tests/selector-regression.test.js` when a promoted selector should become a release-blocking canary.

## Acceptance

- `npm run build:fixtures` completes without missing capture files.
- `npm test -- --test-name-pattern "Selector"` passes.
- New player/UI variants keep legacy and new selectors in the chain.
- Live-chat changes are documented as capture-needed until a committed fixture strategy exists.
