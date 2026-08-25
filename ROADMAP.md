# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Research-Driven Additions

### P2

- [ ] P2: Add native YouTube Theater to watch-theme conformance
  Why: live theme coverage verifies normal watch and Astra Theater Split in dark and light, but never toggles YouTube's distinct native Theater or full-bleed layout, where current experiments change scrolling, comments access, and player geometry.
  Evidence: `scripts/smoke-zero-ads-live.js`; `README.md`; [YouTube player sizing](https://support.google.com/youtube/answer/6052392); [full-bleed report](https://www.reddit.com/r/youtube/comments/1nb5pcc); [Theater experiment report](https://www.reddit.com/r/youtube/comments/1oidrvv)
  Touches: watch-theme CSS in `extension/ytkit.js` and `extension/features/chat-style-comments/index.js`, Theater Split coexistence rules, `scripts/smoke-zero-ads-live.js`, theme tests, README screenshots
  Acceptance: the smoke toggles the native size control independently of Theater Split and captures native Theater in dark and light; it asserts readable metadata, comments, related rail or live chat, usable scrolling, non-overlapping player geometry, and theme tokens on `#full-bleed-container` variants; switching normal, native Theater, and Theater Split repeatedly leaves no stale classes or inline geometry.
  Complexity: M

- [ ] P2: Key selector health to YouTube builds and add a critical-surface canary
  Why: per-selector telemetry exists, but failures are not correlated to `INNERTUBE_CLIENT_VERSION` and users receive no single warning when a YouTube deployment breaks several critical surfaces together.
  Evidence: `extension/core/selector-health.js`, `extension/core/transcript-service.js`, `extension/core/selector-packs/**`, 2026 view-model and template migrations in [ImprovedTube](https://github.com/code-charity/youtube), [DeArrow](https://github.com/ajayyy/DeArrow), and [Invidious](https://github.com/iv-org/invidious)
  Touches: selector health, selector packs, feature health payload, popup or in-page degradation notice, selector fixtures
  Acceptance: selector snapshots include the active YouTube client version; startup probes a bounded set of critical surfaces after route settle; aggregate failure names affected features once, links to diagnostics, and does not spam per selector; fixtures cover a camelCase view-model host, mixed children, template-stamped content, and a hidden prior-route tree.
  Complexity: M


- [ ] P2: Turn anti-adblock detection into evidence-based, reversible recovery
  Why: SponsorBlock currently logs a matching YouTube enforcement selector, but users get no plain-language state or safe session recovery when playback is degraded.
  Evidence: `extension/features/sponsorblock/index.js` `sb-anti-adblock`; `extension/core/feature-health.js`; [YouTube help](https://support.google.com/youtube/answer/14129599); [Adblock Plus help](https://help.adblockplus.org/adblock-plus-help-center/what-to-do-if-you-are-seeing-youtube-s-anti-adblocking-warning)
  Touches: SponsorBlock detection, feature health, popup or in-page recovery UI, session storage or alarms, locales, tests
  Acceptance: structural signals identify a visible enforcement warning and confirm whether playback is advancing, stalled, or blocked without dismissing native dialogs; uncertain stalls remain labeled unknown rather than blamed on YouTube; health UI reports the observed selector and playback state; a user action can pause Astra's ad rules for the current session and auto-restore after a visible deadline; detection never changes policy automatically.
  Complexity: M

### P3

- [ ] P3: Adopt platform APIs only where capability probes delete code
  Why: current browser floors cannot assume 2026 APIs, but feature-detected adoption can remove lifecycle, state-mirroring, and compatibility code without a forced floor increase.
  Evidence: `extension/core/capability-probe.js`; [Chrome extension updates](https://developer.chrome.com/docs/extensions/whats-new); [Chrome browser namespace](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace); [Firefox 153](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153); [Firefox 154](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154)
  Touches: browser API shim, injection guard, live-chat styling, MAIN-world player state, capability matrix, build-for-AMO path
  Acceptance: evaluate `runtime.getContexts`, native `browser`, media-state pseudo-classes, `documentId`, content-script `adoptedStyleSheets`, and Firefox `sandbox` independently; adopt only APIs that remove more compatibility code than they add; every path has a probe and tested fallback at Chrome 120 and Firefox 142; startup does not regress.
  Complexity: M

## Audit follow-ups (2026-08-25)

Found during a full audit pass, verified, and deliberately not fixed in it.

### P2

### P3
