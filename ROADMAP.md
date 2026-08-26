# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Research-Driven Additions

### P3

- [ ] P3: Adopt platform APIs only where capability probes delete code
  Why: current browser floors cannot assume 2026 APIs, but feature-detected adoption can remove lifecycle, state-mirroring, and compatibility code without a forced floor increase.
  Evidence: `extension/core/capability-probe.js`; [Chrome extension updates](https://developer.chrome.com/docs/extensions/whats-new); [Chrome browser namespace](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace); [Firefox 153](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153); [Firefox 154](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154)
  Touches: browser API shim, injection guard, live-chat styling, MAIN-world player state, capability matrix, build-for-AMO path
  Acceptance: evaluate `runtime.getContexts`, native `browser`, media-state pseudo-classes, `documentId`, content-script `adoptedStyleSheets`, and Firefox `sandbox` independently; adopt only APIs that remove more compatibility code than they add; every path has a probe and tested fallback at Chrome 120 and Firefox 142; startup does not regress.
  Complexity: M

## Audit follow-ups (2026-08-25)

Found during a full audit pass, verified, and deliberately not fixed in it.

### P3
