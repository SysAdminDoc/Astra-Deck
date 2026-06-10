# Firefox executeScript Pre-Flight Audit

Date: 2026-06-04

## Trigger

Mozilla's 2026-04-23 WebExtensions update says Firefox 149 Nightly deprecates,
and Firefox 152 removes, `scripting` and `tabs` injection into
`moz-extension://` documents. MDN's `tabs.executeScript()` page also says MV3
extensions should use `scripting.executeScript()` and that extension pages
cannot be content-script injection targets.

Sources:

- https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/executeScript

## Local Audit

Command:

```powershell
node scripts/check-firefox-injection.js
```

Result:

- 0 call sites for `chrome.scripting.executeScript`,
  `browser.scripting.executeScript`, `chrome.tabs.executeScript`,
  `browser.tabs.executeScript`, or `scripting.registerContentScripts` under
  `extension/`.
- No `moz-extension://` injection target exists in current source.
- Popup and extension pages load their scripts with direct HTML `<script>` tags,
  not programmatic injection.

`Get-Command firefox, firefox-nightly, geckodriver` returned no local Firefox
Nightly runtime in this Windows workspace, so there was no browser-console run
to capture. Because the call-site inventory is empty, there is no runtime
injection path to exercise; the static pre-flight gate is now wired into
`npm run check` to block future additions until they are audited.

## Future Call-Site Rule

If `scripts/check-firefox-injection.js` fails, review every reported call site
before AMO submission:

1. Prove the target URL cannot be an extension page or `moz-extension://`
   document.
2. Prefer direct `<script>` tags, module imports, or a document-local
   `runtime.onMessage` listener for extension pages.
3. Record Firefox Nightly behavior and any console warning in this file.
4. If a real `moz-extension://` divergence exists, file it before release and
   keep the roadmap item open until the code path is changed.
