# Platform API Adoption Policy

Astra Deck supports Chrome 120 and Firefox 142. A newer browser API earns a
runtime path only when its capability probe lets the project remove more code
than the probe and fallback add. Browser novelty by itself isn't enough.

The executable record lives in
`extension/core/capability-probe.js` under `platformApiPolicy`. The generated
`build/browser-capability-matrix.json` carries the same decisions into release
diagnostics.

## August 2026 decisions

| Candidate | Decision | Probe | Supported-floor behavior |
|---|---|---|---|
| `runtime.getContexts()` | Defer | Check for `runtime.getContexts` | The API is asynchronous and lists extension contexts. It can't reject a second script execution inside the same world, so the synchronous world-local injection guard remains the only path. |
| Native `browser` namespace | Retain | Require `browser.runtime` | Call sites use the standards-track namespace when present. The resolver falls back to `chrome` and normalizes callback and Promise signatures for Chrome 120. |
| Media-state pseudo-classes | Defer | `CSS.supports('selector(video:playing)')` | `:playing` has limited browser availability and can only select state. Media events plus YouTube navigation and player events remain necessary for task callbacks. |
| `documentId` | Retain | Require a string on `MessageSender` | Cookie handoff binds to `documentId` when supplied. Firefox 142 uses the tested top-level tab, frame, document URL, and cookie-store binding. |
| Content-script `adoptedStyleSheets` | Defer | Check the document array and `CSSStyleSheet` constructor | Firefox content scripts gain direct document access in Firefox 153, above the project floor. Owned style elements remain the single lifecycle path for extensions and userscripts. |
| Firefox `sandbox` manifest key | Defer | Require a Firefox 154 or newer build target | Firefox 142 and the other vehicles still need the allowlisted predicate interpreter. A sandbox page would add an iframe and message lifecycle without deleting that interpreter. |

No new runtime branch was added in this pass. The retained paths were already
paying for themselves and now have explicit policy coverage. The four deferred
paths stay absent from startup code and the Firefox manifest.

## Primary references

- [Chrome `runtime.getContexts`](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts)
- [Chrome `browser` namespace](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace)
- [Chrome `MessageSender.documentId`](https://developer.chrome.com/docs/extensions/reference/api/runtime#property-MessageSender-documentId)
- [Mozilla `runtime.getContexts`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/getContexts)
- [Mozilla `documentId` guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Work_with_documentId)
- [Firefox 153 platform notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153)
- [Firefox 154 platform notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154)
- [Mozilla WebExtension `sandbox` key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/sandbox)
- [Mozilla `adoptedStyleSheets`](https://developer.mozilla.org/en-US/docs/Web/API/Document/adoptedStyleSheets)
- [Mozilla `:playing`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:playing)
