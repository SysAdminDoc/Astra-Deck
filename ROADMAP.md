# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

Audit sweep findings (2026-10-27). Each item: fix, a test that fails before it, one commit.

- [ ] P2 — live-chat: reaction controller and start() run on after destroy
  `features/live-chat/index.js:511-522, 563-580`: `reactionController.init()` awaits `loadState()`; a toggle off meanwhile destroys a controller with no launcher yet, then init resumes and mounts a live launcher plus style nobody removes. Fix: a `disposed` flag checked after the await. `:618-631`: `start()` doesn't re-check `destroyed` after `await applySettings(await readSettings())`, so a re-injected runtime leaks a subtree observer, storage and pagehide listeners.
- [ ] P2 — sponsorblock: zero-ad async work after destroy, and double init
  `features/sponsorblock/index.js:746-811`: `_refreshZeroAdStatus`, `_pauseZeroAdRules`, `_resumeZeroAdRules` don't check `_generation` after awaits; a toggle off mid-request arms `_antiAdblockDeadlineTimer` and appends `#ytkit-anti-adblock-recovery`. `:946-1123`: a second `init()` stacks a second 30 s interval, 8 document listeners and a second `_barObserver` (ytkit.js ~43509 reconcile path calls init without `_initialized`). Fix: generation capture, and `destroy()` first in init.
- [ ] P3 — sticky-chat: double init leaks, floating props stay behind
  `features/sticky-chat/index.js:240-311` same double-init leak (observer, fullscreen and resize listeners). `:76-78, 211-217`: `--ytkit-floating-chat-*` inline properties stay on `ytd-live-chat-frame` after `_leaveFloatingMode`/destroy.
- [ ] P2 — navigation: watch-flexy observer and listener flag after stop
  `core/navigation.js:169-171, 211-217`: a pending `startViewTransition` callback runs the rules after `stopNavigateListener()` and re-creates `watchFlexyObserver` with nothing to disconnect it. `:287-302`: `isNavigateListenerAttached` is set after the first rule run, so a throwing rule or re-entry attaches a second listener set.
- [ ] P2 — player: destroy leaves in-flight tasks able to re-arm timers
  `core/player.js:760-775` with `597-602`: destroy clears the timer and task map but neither bumps `routeToken` nor cancels tasks, so an async task resolving `false`/`'retry'` re-arms a timer against the torn-down page.
- [ ] P3 — toast-dom: a toast made while the panel was open never auto-dismisses
  `core/toast-dom.js:113-115, 228-232`: `persistent` is computed once; `resumeDismiss` returns early after the panel closes.
- [ ] P2 — registry: replace and unregister skip cleanups
  `core/registry.js:144-146, 332-333`: `register(..., {replace:true})` and `unregister(id)` delete the cleanup list without running it.
- [ ] P3 — storage-manager: a second manager never flushes on unload
  `core/storage-manager.js:36, 171-188`: the unload hook is installed once per window and closes over the first manager only.
- [ ] P2 — trusted-html: block noscript and template
  `core/trusted-html.js` `_BLOCKED_TAGS` lacks `noscript` (DOMParser parses it as markup with scripting off; a live element re-parses it as raw text, the classic mXSS) and `template`. Latent: today's callers pass static SVG.
- [ ] P2 — credential-vault: removed credential comes back, abort after success
  `core/credential-vault.js:135-146`: `get` writes the awaited value to the session cache even if `remove` ran meanwhile. `:79-94`: `transact` resolves on `request.onsuccess`, so a commit-time abort (quota) reports a save that never persisted; resolve on `oncomplete`.
- [ ] P2 — settings-import-transaction: a superseded rollback still restores
  `core/settings-import-transaction.js:54-116`: only the checkpoint write checks the generation; `operation.restore(snapshot)` from import A can overwrite import B.
- [ ] P3 — hide-attribution: rule counts drift, reset keeps notes
  `core/hide-attribution.js:100-111`: `unmarkCardHidden` never decrements `entry.rules[...]`. `:175-177`: `resetHideAttribution` leaves the notes WeakMap.
- [ ] P3 — transcript-service: navigation mid-download and shared metadata
  `core/transcript-service.js:235-285`: an AbortError from navigating mid-download shows the generic failure toast. `~662`: `lastResultMetadata` is shared by off-page and on-page fetches. `:735-743`: `_method3_HTMLPageFetch` swallows the different-video error and falls through instead of aborting.

## Research-Driven Additions

### Now (P1)

### Next (P2)
