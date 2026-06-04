# Research Cycle 24 - Retired Options Page Copy

Date: 2026-06-04

## Executive Summary

Astra Deck correctly retired the standalone extension options page in v3.19.0
and now routes settings through the toolbar popup plus the in-page full settings
panel. Tests already pin that the extension bundle does not ship
`options.html`, `options.js`, or `manifest.options_ui`.

One user-facing runtime error still says:

```text
Set aiSummaryApiKey first (via options page)
```

That copy is stale because the options page no longer exists. The fix is small
but user-facing: replace the message with the current settings-panel/popup path,
sync the userscript bundle, and add a targeted regression so retired options-page
copy cannot re-enter runtime strings.

## Scope And Anti-Duplication

- This is not the same as the v3.19.0 retired-options-page implementation. That
  work is already complete and tested.
- This is not a broad rewrite of historical `CLAUDE.md` sections that discuss
  the former options page. Historical references can stay if they are clearly
  historical.
- This cycle targets user-visible runtime copy in shipped extension/userscript
  source and the regression coverage needed to keep that copy aligned.

## Local Evidence

- `extension/ytkit.js:28979-28982` throws
  `Set aiSummaryApiKey first (via options page)` when a non-local summary
  provider is selected without a key.
- `extension/manifest.json:15-18` declares `action.default_popup =
  "popup.html"`.
- `extension/manifest.json` has no `options_ui` entry.
- `Get-ChildItem extension -File` lists `popup.html`, `popup.js`, and
  `popup.css`, but no `options.html` or `options.js`.
- `tests/hardening.test.js:536-545` asserts `manifest.options_ui` stays
  removed and says the toolbar popup is the only settings surface.
- `tests/hardening.test.js:546-550` asserts `extension/options.html` remains
  deleted.
- `README.md:241-252` tells users to click the gear icon in the YouTube
  masthead/player controls or use the toolbar popup's `Open Full Settings`
  action, and describes the toolbar popup as the lightweight control surface.
- `docs/architecture.md:10` says the toolbar popup is the only extension
  surface for settings management.
- `CLAUDE.md:16` and `CLAUDE.md:747-758` preserve the historical migration note
  that the standalone options page was retired in v3.19.0.

## External Sources Reviewed

1. Chrome for Developers - Add a popup:
   https://developer.chrome.com/docs/extensions/develop/ui/add-popup
2. Chrome for Developers - `chrome.action`:
   https://developer.chrome.com/docs/extensions/reference/api/action
3. Chrome for Developers - Manifest file format:
   https://developer.chrome.com/extensions/manifest
4. Chrome for Developers - Manifest reference:
   https://developer.chrome.com/docs/extensions/reference/manifest
5. Chrome for Developers - Extension UI:
   https://developer.chrome.com/docs/extensions/develop/ui
6. Chrome for Developers - Extension storage:
   https://developer.chrome.com/docs/extensions/reference/api/storage
7. Chrome for Developers - Message passing:
   https://developer.chrome.com/docs/extensions/develop/concepts/messaging
8. Chrome for Developers - Content scripts:
   https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
9. Chrome Web Store - MV3 requirements:
   https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
10. Chrome Web Store - Program policies:
    https://developer.chrome.com/docs/webstore/program-policies/policies
11. MDN - `options_ui`:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/options_ui
12. MDN - Options pages:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Options_pages
13. MDN - Popups:
    https://developer.mozilla.org/en-US/Add-ons/WebExtensions/user_interface/Popups
14. MDN - `browser_action`:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_action
15. MDN - `action`:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/action
16. MDN - WebExtensions storage:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage
17. MDN - WebExtensions messaging:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage
18. MDN - WebExtensions manifest:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json
19. W3C WAI WCAG 2.2 - Error identification:
    https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html
20. W3C WAI WCAG 2.2 - Error suggestion:
    https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html
21. W3C WAI WCAG 2.2 - Labels or instructions:
    https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html
22. W3C WAI WCAG 2.2 - Help:
    https://www.w3.org/WAI/WCAG22/Understanding/help.html
23. W3C WAI WCAG 2.2 - Status messages:
    https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
24. WAI ARIA Authoring Practices - Alert pattern:
    https://www.w3.org/WAI/ARIA/apg/patterns/alert/
25. WAI ARIA Authoring Practices - Dialog pattern:
    https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
26. Nielsen Norman Group - Error message guidelines:
    https://www.nngroup.com/articles/error-message-guidelines/
27. Nielsen Norman Group - Form design quick fixes:
    https://www.nngroup.com/articles/web-form-design/
28. GOV.UK Design System - Error message:
    https://design-system.service.gov.uk/components/error-message/
29. GOV.UK Design System - Hint text:
    https://design-system.service.gov.uk/styles/typography/#hint-text
30. Microsoft Fluent 2 - MessageBar:
    https://fluent2.microsoft.design/components/web/react/core/messagebar/usage
31. Material Design 3 - Snackbars:
    https://m3.material.io/components/snackbar/overview
32. Material Design 3 - Dialogs:
    https://m3.material.io/components/dialogs/overview
33. Apple Human Interface Guidelines - Alerts:
    https://developer.apple.com/design/human-interface-guidelines/alerts
34. Firefox Extension Workshop - User interface:
    https://extensionworkshop.com/documentation/develop/user-interface/
35. Firefox Extension Workshop - Manifest v3 migration:
    https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
36. Tampermonkey documentation:
    https://www.tampermonkey.net/documentation.php

## Landscape Findings

- Chrome and Mozilla document extension options pages as separate manifest
  surfaces from action popups. If `options_ui` is absent and the package lacks
  an options HTML file, runtime copy should not tell users to use that surface.
- Chrome's action popup docs support Astra's current `popup.html` entry point,
  while README points users to the in-page full settings panel for deeper
  configuration.
- Accessibility guidance for error identification and labels/instructions
  supports using concrete next-step language in error copy. A stale surface name
  makes the error less actionable.
- Design-system guidance consistently treats error/hint text as part of the
  task flow; messages should name a real control or path that exists.

## Fit Scoring

| Candidate | Fit | Impact | Effort | Risk | Priority | Decision |
|---|---:|---:|---:|---:|---:|---|
| Replace stale runtime options-page copy and add a regression | High | Medium | S | Low | P2 | Add |
| Reintroduce an options page | Low | Low | M | M | Reject | Contradicts shipped architecture |
| Sweep historical docs for every options-page mention | Medium | Low | M | Low | P3 | Defer; historical mentions are acceptable |
| Centralize the summary-provider key error in locale strings | Medium | Medium | M | Low | P3 | Optional follow-up if localization is desired |

## Recommended Roadmap Item

- [ ] P2 - Replace retired options-page runtime copy with current settings-panel guidance
  - Why: the standalone options page was removed in v3.19.0 and the toolbar
    popup/full settings panel are now the supported settings paths, but the
    summary-provider key error still tells users to set `aiSummaryApiKey` via an
    options page that does not ship.
  - Evidence: `extension/ytkit.js:28979-28982`;
    `extension/manifest.json:15-18`; no `manifest.options_ui`; no
    `extension/options.html` or `extension/options.js`; `tests/hardening.test.js:536-550`;
    `README.md:241-252`; `docs/architecture.md:10`. [Verified]
  - Touches: `extension/ytkit.js`, synced `YTKit.user.js`, and
    `tests/hardening.test.js` or another targeted copy-regression test.
  - Acceptance: the key-missing error points to the real in-page settings panel
    or toolbar popup `Open Full Settings` action; no shipped runtime string tells
    users to use an options page; the userscript bundle is synced after the
    source change; a regression test fails if `via options page` or equivalent
    retired runtime copy returns; historical comments/docs may keep clearly
    historical options-page references.
  - Verify: `rg -n "via options page|options page" extension/ytkit.js
    YTKit.user.js extension/_locales`; `node sync-userscript.js`;
    `npm run check`; `npm test`; manual or screenshot QA on the summary feature
    missing-key path confirms the copy names an existing settings path.
  - Complexity: S

## Rejections And Deferrals

- Reintroducing an options page would regress the current architecture and is
  not needed for this message.
- Historical docs/comments can retain old options-page references if the context
  clearly marks them as retired history.
- Locale centralization may be useful, but this pass only proves one English
  runtime string. The build lane can decide whether the string should become a
  locale key as part of the implementation.

## Self-Audit

- Recommendation count: 1 new roadmap item.
- Duplicates merged: v3.19.0 retired-options-page tests are cited rather than
  reopened.
- Done marks changed: none.
- Source coverage: 36 external URLs plus repo file references and live file-list
  evidence.
- Accessibility/UX covered: error identification, actionable guidance, and real
  settings-entry naming.
- Testing covered: targeted copy regression, userscript sync, check/test gates,
  and missing-key path QA.
