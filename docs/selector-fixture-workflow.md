# Selector Fixture Refresh Workflow

Astra Deck treats saved YouTube MHTML captures as selector ground truth. Use this workflow whenever a feature silently stops attaching, YouTube rolls out a new player/UI variant, or `ytkit.selectorHealth()` reports recurring misses on high-churn surfaces.

## Capture

Try the helpers below first. A manual save is for what they can't reach.

1. Use Chrome stable with a clean profile when possible.
2. Disable other YouTube-modifying extensions before capture.
3. Open the exact surface you need to validate: home, watch, subscriptions, search, channel, notifications menu, or live chat.
4. Let the page settle for at least 5 seconds.
5. Save with **File > Save Page As > Webpage, Single File**.
6. Replace the local gitignored capture under `mhtml/`:
   - `mhtml/YouTube.mhtml` for the home feed.
   - `mhtml/WatchPage.mhtml` for the watch page and player.
   - `mhtml/LiveChat.mhtml` for the live-chat popout iframe document.
   - `mhtml/Shorts.mhtml` for the Shorts feed.
   - `mhtml/SearchResults.mhtml` for search results.
   - `mhtml/Channel.mhtml` for channel pages.
   - `mhtml/EmbedPlayer.mhtml` for embedded players.
   - `mhtml/History.mhtml`, `mhtml/WatchLater.mhtml`, and
     `mhtml/NotificationsMenu.mhtml` for account/menu-state captures when an
     authenticated profile can expose those surfaces.
7. For live chat through DevTools automation, send an ordinary Chrome user-agent.
   YouTube rejects `HeadlessChrome` on the chat URL as an old browser. The capture
   helper already does this.

A signed-out profile with no history gets no home feed, so `mhtml/YouTube.mhtml`
is the one capture that needs a manual save from a signed-in profile. Keep its
modified date when you copy it (`cp -p`), because the fixture header dates a
capture that carries no client version from that.

### Watch-page wrapper probe

Full watch-page MHTML snapshots can time out because the live video page keeps
loading media and chat resources. When refreshing live-chat wrapper selectors,
pair `mhtml/LiveChat.mhtml` with a rendered watch-page DOM probe for:

- `ytd-live-chat-frame#chat`
- `ytd-live-chat-frame`
- `iframe#chatframe`
- `ytd-live-chat-frame iframe`

Document the video id, date, and probe result in the changelog or hardening
notes when these wrapper selectors change. Last run: 2026-10-31 on `H_7jfyXeQ-I`,
all four matched with 78 chat rows. `#chat.ytd-live-chat-frame` no longer matches.

### Rendered surface probe

A capture only holds what a resting page had drawn. The guide needs a wide window,
the transcript and dialogs have to be opened, and the signed-out home page has no
feed, so a surface can look dead in every capture and still be live. This opens
those states in a headless browser with no extension loaded, then lists every
selector of every surface and where it was seen:

```powershell
npm run probe:selector-surfaces
npm run probe:selector-surfaces -- --surfaces feedCard,modals --chrome '<path>'
```

It doesn't sign in, so anything only an account can see prints as unproven. Comments,
the settings menu and live chat aren't on its route either, since the captures cover
those. A surface proved this way should cite
`docs/selector-fixture-workflow.md#rendered-surface-probe` in its `captureEvidence`.

### Watch-page CDP capture

For player-chrome refreshes, try the helper before falling back to a manual
browser save. It runs headless and muted, so it won't show up on your desktop:

```powershell
npm run capture:watch
npm run build:fixtures
```

`scripts/capture-watch-mhtml.js` launches a temporary Chrome profile, waits for
`ytd-watch-flexy`, `#movie_player`, and `.ytp-delhi-modern`, then scrolls to the
comments until they load and opens the player's settings menu, because neither
exists on a resting page. It pauses and stops page loading with `Page.stopLoading`,
then calls `Page.captureSnapshot`. This avoids many long-running media and ad
requests that make a plain DevTools MHTML snapshot time out.

A video with no comments fails the capture on purpose, and that includes every live
stream. Pass `--url` to pick a different video.

If Chrome still times out, the helper writes a single-part MHTML from the settled
rendered DOM (`captureMode: "dom-mhtml-fallback"`) so selector fixtures can still
be regenerated from browser evidence. Chromium 152 and later also leave `<script>`
out of a snapshot, which loses the inline data the fixtures read. The helper spots
that, rebuilds from the rendered DOM and keeps the snapshot's stylesheets
(`captureMode: "dom-mhtml-recovered"`). The raw
`mhtml/WatchPage.mhtml` file remains gitignored; commit only the regenerated
`tests/fixtures/yt-watch.tokens.txt` and
`tests/fixtures/selector-surface-matches.json` deltas.

### Surface CDP captures

The same helper can capture public non-watch surfaces with named profiles:

```powershell
npm run capture:surface -- --surface shorts
npm run capture:surface -- --surface search
npm run capture:surface -- --surface channel
npm run capture:surface -- --surface embed
npm run capture:surface -- --surface live-chat --url 'https://www.youtube.com/live_chat?v=<live video id>'
npm run build:fixtures
```

Live chat needs a stream that's on air right now, so it has no default video.

The `shorts`, `search`, `channel`, and `embed` profiles write
`mhtml/Shorts.mhtml`, `mhtml/SearchResults.mhtml`, `mhtml/Channel.mhtml`, and
`mhtml/EmbedPlayer.mhtml`. The helper records whether `Page.captureSnapshot`
or the rendered-DOM fallback produced the MHTML so the audit note can describe
the evidence source.

### Authenticated CDP captures

History, Watch Later, and the opened notifications menu require account or menu
state. Use a dedicated Chrome profile outside this repository; do not point the
helper at `.auth/`, `playwright/.auth/`, `mhtml/`, `tests/fixtures/`, `.git/`,
or any other path under the worktree. The helper refuses repo-local profile
paths and fails before writing MHTML when auth is missing, Watch Later is empty,
or the notifications menu does not expose a notification row.

```powershell
$env:ASTRA_CAPTURE_PROFILE_DIR = '<absolute external Chrome profile path>'
npm run capture:surface -- --surface history
npm run capture:surface -- --surface watch-later
npm run capture:surface -- --surface notifications
npm run build:fixtures
```

Equivalent per-command form:

```powershell
npm run capture:surface -- --surface history --user-data-dir '<absolute external Chrome profile path>'
```

The `history`, `watch-later`, and `notifications` profiles write
`mhtml/History.mhtml`, `mhtml/WatchLater.mhtml`, and
`mhtml/NotificationsMenu.mhtml`. The notifications profile clicks the topbar
notification button and waits for `ytd-multi-page-menu-renderer` plus
`ytd-notification-renderer` before snapshot. Add fixture-builder registrations
and selector-regression required matches only after the local raw captures are
populated and regenerated derived fixtures prove stable selector matches.

Current blockers for positive authenticated capture:

- `mhtml/YouTube.mhtml`: a signed-out profile with no history gets no home feed,
  so the checked-in tokens still come from the April capture.
- `mhtml/History.mhtml`: unauthenticated CDP probes settled on `ytd-app` but did
  not expose feed-card selectors.
- `mhtml/WatchLater.mhtml`: unauthenticated CDP probes settled on `ytd-app` but
  did not expose playlist/video-card selectors.
- `mhtml/NotificationsMenu.mhtml`: requires opening the notifications menu
  before capture and at least one notification row in the local profile.

Do not commit raw `.mhtml` files. Commit only regenerated token fixtures,
`selector-surface-matches.json`, selector-pack provenance metadata, and the
audit/roadmap notes that identify any blocked surfaces.

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

1. Inspect the fixture diff for removed `ytd-*`, `ytw-*`, `yt-*`, `ytp-*`, `html5-*`, and `movie_player` tokens. YouTube has started rewriting some `ytd-` elements under the `ytw-` prefix, and a rename looks like a removal here.
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
- `npm run check:selector-evidence` passes. Move a surface's `lastVerified` only
  when its selectors really matched that day, and move anything YouTube no longer
  draws from `stable` to `fallback`. Run `npm run record:selector-evidence` once
  dates change. It keeps each exception's reason and acceptance date, and a surface
  that's still owed should say what its capture needs.
