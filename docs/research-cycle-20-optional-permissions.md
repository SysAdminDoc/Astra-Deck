# Project Research and Feature Plan - Cycle 20 Runtime Optional Permissions

Date: 2026-06-04

## Executive Summary

Astra Deck's public `store-safe` build now correctly strips GitHub-full AI,
Cobalt, Ollama, and local companion hosts, but it still grants every store-safe
enrichment host at install time. The affected hosts are tied to user-visible,
toggleable features such as thumbnail upgrades/downloads, SponsorBlock/DeArrow,
Return YouTube Dislike, and the Reddit discussion panel. Current docs already
describe several of these as optional enrichment calls, yet the generated
manifest and tests still require the hosts in `host_permissions`.

Recommended next item:

1. P2 - Convert optional enrichment hosts to runtime-granted host permissions.

This should be a careful minimization project, not a blanket manifest rewrite.
Keep core YouTube content-script hosts required. Move only hosts that can degrade
cleanly when the user has not enabled the related feature or has denied/revoked
the host grant.

## Evidence Reviewed

Local/current commands inspected:

- `git status --short --branch`
- `git pull --rebase`
- `git log -10 --oneline --decorate`
- `rg -n "optional_permissions|optional_host_permissions|permissions.request|chrome.permissions|browser.permissions|host_permissions|store-safe|GitHub-full|permission rationale|single-purpose|least privilege|permission warning" ROADMAP.md RESEARCH_REPORT.md README.md docs extension scripts build-extension.js`
- `rg -n "permissions\.request|permissions\.contains|optional_host_permissions|optional_permissions|chrome\.permissions|browser\.permissions|requestHost|granted host|site access|permission prompt" extension build-extension.js scripts tests docs ROADMAP.md RESEARCH_REPORT.md`
- `rg -n "host_permissions|optional_permissions|optional_host_permissions|permissions|sponsor|returnyoutubedislike|reddit|i.ytimg|GitHub-full|store-safe" docs/store-permission-rationale.md docs/cws-submission-checklist.md extension/manifest.json build-extension.js tests/hardening.test.js extension/core/data-flow.js`
- External search over Chrome, Mozilla, Edge, OWASP, Chrome Web Store, extension
  samples, competitor projects, and extension-permission research.

Observed repository state:

```json
{
  "runtime_permissions_request_path_present": false,
  "optional_host_permissions_present": false,
  "store_safe_profile_split_present": true,
  "store_safe_optional_enrichment_hosts_in_install_time_host_permissions": [
    "https://i.ytimg.com/*",
    "https://sponsor.ajay.app/*",
    "https://returnyoutubedislikeapi.com/*",
    "https://www.reddit.com/*",
    "https://old.reddit.com/*"
  ],
  "core_required_youtube_hosts": [
    "https://*.youtube.com/*",
    "https://*.youtube-nocookie.com/*",
    "https://youtu.be/*"
  ]
}
```

Current local evidence:

- `extension/manifest.json:31` defines install-time `host_permissions`; lines
  35-39 include `i.ytimg.com`, `sponsor.ajay.app`,
  `returnyoutubedislikeapi.com`, `www.reddit.com`, and `old.reddit.com`.
- `build-extension.js:258` builds profile host permissions by taking the shared
  content hosts and then appending every allowed `ORIGIN_CATALOGUE` entry.
- `build-extension.js:273` derives extension-page CSP `connect-src` from that
  install-time host list, so moving hosts to runtime grants needs an explicit CSP
  decision instead of accidentally dropping required fetch targets.
- `build-extension.js:285` writes the generated `host_permissions` into each
  profile manifest; there is no generated `optional_host_permissions` path.
- `extension/core/data-flow.js:46` maps `https://i.ytimg.com` to thumbnail
  upgrade/download features.
- `extension/core/data-flow.js:54` maps `https://sponsor.ajay.app` to
  SponsorBlock and DeArrow.
- `extension/core/data-flow.js:62` maps `https://returnyoutubedislikeapi.com` to
  Return YouTube Dislike count features.
- `extension/core/data-flow.js:70` maps `https://www.reddit.com` to the Reddit
  discussion panel.
- `docs/cws-submission-checklist.md:117` lists YouTube and `i.ytimg.com`
  together, while `docs/cws-submission-checklist.md:118` already labels
  SponsorBlock, Return YouTube Dislike, and Reddit hosts as optional
  user-visible enrichment calls.
- `docs/store-permission-rationale.md:104` through
  `docs/store-permission-rationale.md:108` justifies the same optional
  enrichment hosts as install-time store-safe host permissions.
- `tests/hardening.test.js:2165` through `tests/hardening.test.js:2171` assert
  that the store-safe manifest must include those hosts today, so the build
  change needs replacement assertions rather than a silent manifest drift.
- `rg` found no current `permissions.request`, `chrome.permissions`,
  `browser.permissions`, or generated `optional_host_permissions` implementation
  in runtime/build source; the only optional-permission hit was an external
  source URL in the previous research note.

## External Sources Reviewed

Primary platform and store-policy sources:

1. https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
2. https://developer.chrome.com/docs/extensions/reference/api/permissions
3. https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings
4. https://developer.chrome.com/docs/extensions/reference/permissions-list
5. https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
6. https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
7. https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
8. https://developer.chrome.com/docs/webstore/program-policies/policies
9. https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
10. https://support.google.com/chrome_webstore/answer/2664769
11. https://support.google.com/chrome_webstore/answer/186213
12. https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/declare-permissions

Mozilla / WebExtensions sources:

13. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions
14. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions
15. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions
16. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions
17. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request
18. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
19. https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
20. https://extensionworkshop.com/documentation/publish/add-on-policies/
21. https://support.mozilla.org/en-US/kb/extension-data-collection

Security, implementation samples, and adjacent project sources:

22. https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html
23. https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.permissions-addhostaccessrequest
24. https://github.com/mdn/webextensions-examples/tree/main/permissions
25. https://github.com/uBlockOrigin/uBOL-home/issues/326
26. https://github.com/gorhill/uBlock
27. https://github.com/ajayyy/SponsorBlock
28. https://wiki.sponsor.ajay.app/w/API_Docs
29. https://github.com/Anarios/return-youtube-dislike
30. https://chromewebstore.google.com/detail/return-youtube-dislike/gebbhagfogifgggkldgodflihgfeippi
31. https://addons.mozilla.org/en-US/firefox/addon/return-youtube-dislikes/
32. https://addons.mozilla.org/en-US/firefox/addon/sponsorblock/
33. https://chromewebstore.google.com/detail/dearrow-better-titles-and/enamippconapkdmgfgjchkhakpfinmaj
34. https://github.com/duckduckgo/duckduckgo-privacy-extension
35. https://github.com/AdguardTeam/AdguardBrowserExtension

Academic / long-form background:

36. https://research.chalmers.se/en/publication/532102
37. https://research.chalmers.se/publication/532102/file/532102_Fulltext.pdf
38. https://arxiv.org/abs/2406.12710
39. https://arxiv.org/abs/1901.03397
40. https://arxiv.org/abs/2503.04292

Relevant source facts:

- Chrome documents `optional_permissions` and `optional_host_permissions` as
  runtime grants, and recommends optional permissions where the feature shape
  permits user control over data/resource access.
- Chrome's Permissions API supports `request`, `contains`, `getAll`, `remove`,
  `onAdded`, and `onRemoved`; `request()` must be initiated from a user gesture.
- Chrome 133 adds `permissions.addHostAccessRequest`, but that API has newer
  browser-version constraints, so a baseline implementation should still plan
  around `permissions.request` plus clear UI affordances.
- Chrome Web Store policy requires the narrowest permissions necessary and warns
  against future-proofing permissions before implemented features need them.
- Chrome user help explicitly lets users manage extension site access, so runtime
  code needs denied/revoked handling even when a permission was granted earlier.
- Mozilla documents MV3 install-time host permissions under `host_permissions`
  and runtime host permissions under `optional_host_permissions`.
- Firefox Extension Workshop states that users can grant or revoke host
  permissions ad hoc and extensions should check availability when needed.
- OWASP's browser-extension guidance treats permission overreach as a security
  risk and recommends least privilege plus optional permissions where possible.
- The uBO Lite maintainers publicly reverted from optional host permissions to
  install-time host permissions because ad-blocking across the open web has
  different UX and deployment constraints. That is a caution, not a blocker for
  Astra Deck's narrower optional enrichment hosts.
- SponsorBlock, Return YouTube Dislike, DeArrow, DuckDuckGo, AdGuard, and uBlock
  show that extension-store users see and compare permission posture across
  mature adjacent projects.

## Current Feature Inventory

Core hosts that should stay required for now:

- `https://*.youtube.com/*`: content-script attachment, YouTube DOM reads,
  Innertube/transcript fallbacks, page-level controls, and the primary product
  surface.
- `https://*.youtube-nocookie.com/*`: privacy-enhanced embed origin support.
- `https://youtu.be/*`: short-link normalization and routing.

Candidate optional runtime hosts:

- `https://i.ytimg.com/*`: thumbnail max-resolution upgrade and explicit
  thumbnail-download workflows. This may stay required if implementation proves
  thumbnails are inseparable from baseline YouTube UI behavior, but the current
  data-flow catalogue ties it to explicit feature keys.
- `https://sponsor.ajay.app/*`: SponsorBlock/DeArrow enrichment.
- `https://returnyoutubedislikeapi.com/*`: Return YouTube Dislike counts and
  card counts.
- `https://www.reddit.com/*` and `https://old.reddit.com/*`: Reddit discussion
  panel.

GitHub-full-only hosts:

- `https://api.openai.com/*`, `https://api.anthropic.com/*`, and
  `https://generativelanguage.googleapis.com/*`: already withheld from the
  public store-safe build. Leave them as a separate future decision if the
  GitHub-full build needs a runtime-grant UX.
- `https://api.cobalt.tools/*`, `http://127.0.0.1:11434/*`, and
  `http://127.0.0.1:9751-9851/*`: already GitHub-full only and have additional
  local/companion trust constraints.

## Current Gap

Good current state:

- Store-safe and GitHub-full artifacts are generated from one source of truth.
- Store-safe strips AI provider, Cobalt, Ollama, and downloader loopback hosts
  from both manifest host grants and CSP.
- The store permission rationale documents every current host permission.
- Tests assert the profile split and prevent accidental broad host regressions.
- There is no `<all_urls>` grant.

Remaining gap:

- Store-safe still grants optional enrichment API hosts at install time.
- There is no manifest generation path for `optional_host_permissions`.
- There is no runtime helper for `permissions.contains` / `permissions.request`.
- There is no denied/revoked state in the settings UI, data-flow summary, or
  diagnostics export for host grants.
- Tests currently require the old install-time grant model.
- CSP is generated from install-time host permissions, so optional grants need
  explicit CSP handling to avoid breaking extension-page fetches.

## Recommended Roadmap Item

Add one P2 implementer-actionable item:

**Convert optional enrichment hosts to runtime-granted host permissions.**

Acceptance shape:

- Keep required YouTube content hosts in `host_permissions`.
- Add generated `optional_host_permissions` for eligible enrichment hosts in
  Chrome and Firefox store-safe manifests.
- Introduce a small permission helper around `chrome.permissions` /
  `browser.permissions` that can `contains`, `request`, observe revoke events,
  and report errors without assuming Chrome-only APIs.
- Request each optional host only from an explicit user gesture, such as enabling
  SponsorBlock/DeArrow, Return YouTube Dislike, Reddit comments, or thumbnail
  download/upgrade.
- If the user denies or revokes a grant, keep the feature disabled or degraded,
  show clear state in the relevant settings/control surface, and avoid repeated
  prompts.
- Update data-flow and diagnostics to distinguish required, optional-granted,
  optional-denied, and inactive destinations.
- Keep extension-page CSP compatible with permitted optional hosts, and document
  the chosen CSP strategy.
- Replace current tests that require store-safe install-time enrichment hosts
  with tests for required-vs-optional manifest generation and denied/granted
  runtime behavior.
- Update permission-rationale docs and the Chrome Web Store checklist.

## Scoring

| Candidate | Fit | Impact | Effort | Risk | Novelty | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime optional grants for store-safe enrichment hosts | High | Medium | Medium | Medium | Medium | P2 |
| Runtime optional grants for all GitHub-full hosts too | Medium | Medium | High | High | Medium | P3 |
| Make all YouTube hosts optional | Low | Medium | High | High | Low | Rejected |
| Add broad `https://*/*` optional host fallback | Low | Low | Small | High | Low | Rejected |
| Leave current install-time store-safe grants unchanged | Medium | Low | None | Medium | Low | Rejected as the next improvement |

Priority rationale:

- P2 is appropriate because current store-safe permissions are bounded and
  documented; there is no live store rejection or active vulnerability tied to
  these hosts.
- The item still matters because it narrows install-time warnings, aligns
  optional features with optional access, improves revocation handling, and makes
  the privacy/permission story stronger before store submission.

## Rejected or Deferred Ideas

- Make `youtube.com`, `youtube-nocookie.com`, and `youtu.be` optional. These are
  the product's core execution surface and content-script match set, so runtime
  grants would create first-run failure modes for baseline functionality.
- Use `https://*/*` as the optional host declaration. Chrome supports broad
  optional origin declarations, but Astra Deck already knows its exact external
  enrichment hosts, and a broad declaration weakens the narrow-permission story.
- Use Chrome 133 `addHostAccessRequest` as the only path. It is useful for a
  future enhanced Chrome UX, but the first implementation needs Chrome/Firefox
  compatibility and should use the established Permissions API.
- Rewrite GitHub-full AI/Cobalt/loopback hosts in the same pass. Those hosts are
  already excluded from public store-safe artifacts and have separate companion,
  BYO-key, and local-service UX decisions.

## Implementer Notes

- Start by splitting `ORIGIN_CATALOGUE` entries into required vs optional grant
  classes, not by hardcoding a second host list.
- Treat old settings imports carefully: enabling an optional feature from an old
  export should not silently prompt. It should render as "needs permission" until
  the user acts.
- Guard background fetch paths with both the existing allowlist and the runtime
  permission check, so a revoked permission cannot be bypassed by a stale setting.
- Keep rate limits and no-cookie policy unchanged for SponsorBlock, DeArrow,
  Return YouTube Dislike, and Reddit.
- Check Firefox behavior with `web-ext lint` and a clean profile because Firefox
  may expose host permissions as user-revocable site access.
- Preserve the existing public-store / GitHub-full split before adding any
  optional host logic.

## Validation Plan

Minimum expected verification after implementation:

- `npm run check`
- `npm test`
- `npm run build`
- `node sync-userscript.js`
- A targeted manifest test proving store-safe required hosts and optional hosts
  are separate for Chrome and Firefox.
- A targeted permission-helper test for grant, deny, revoke, and unsupported API
  fallback behavior.
- A manual Chrome unpacked-profile check that enabling each optional feature
  prompts once, works after grant, and degrades after revoke.
- A Firefox store-safe lint/load check once Firefox artifact gates are available.
- `rg -n "optional_host_permissions|permissions.request|permissions.contains|onRemoved|host_permissions" extension build-extension.js scripts tests docs` should show the new contract across source, tests, and docs.

## Cycle Output

Add a P2 roadmap item to convert optional store-safe enrichment hosts from
install-time host grants to runtime-granted optional host permissions, with
Chrome/Firefox manifest generation, UI/diagnostic denied-state handling, and
tests replacing the current install-time assertions.
