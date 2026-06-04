# Project Research and Feature Plan - Cycle 9 Privacy and Consent Readiness

Date: 2026-06-04

## Executive Summary

Astra Deck's store-safe / GitHub-full split materially reduces review risk, but
the next release still needs a concrete cross-store privacy and consent packet.
The repo has high-quality permission rationale and a CWS checklist, yet there is
no stable privacy-policy artifact to link from README/homepage/store fields, and
the Firefox manifest patch still targets Firefox 128 without declaring Mozilla's
new `data_collection_permissions` or a custom older-Firefox consent path.

This is not a request to widen the product. It is a release-readiness task that
turns the existing privacy posture into something a Chrome Web Store reviewer,
AMO reviewer, and end user can inspect consistently.

Top opportunities:

1. P1 - Publish a stable Astra Deck privacy policy source that can be linked
   from README/homepage/store submissions.
2. P1 - Convert `core/data-flow.js` and the existing permission rationale into a
   Chrome dashboard data-use matrix with exact categories.
3. P1 - Choose the Firefox path: require Firefox 140+ with built-in
   `data_collection_permissions`, or keep Firefox 128+ and ship a custom
   consent/control page for versions without built-in data consent.
4. P1 - Pin the chosen Firefox path in `scripts/manifest-patch.js` and
   hardening tests so generated XPI/ZIP artifacts cannot drift.
5. P2 - Add reviewer notes that explain store-safe vs GitHub-full data flows in
   one place, rather than scattering them across README, CWS docs, and manifest
   comments.

## Evidence Reviewed

Local files inspected:

- `extension/manifest.json`
- `build-extension.js`
- `scripts/manifest-patch.js`
- `docs/store-permission-rationale.md`
- `docs/cws-submission-checklist.md`
- `docs/architecture.md`
- `extension/core/data-flow.js`
- `extension/background.js`
- `extension/core/settings-schema.js`
- `tests/hardening.test.js`
- `README.md`

Local evidence:

- `docs/store-permission-rationale.md` already has a strong single-purpose
  statement, data-handling statement, per-permission justifications, and a clear
  store-safe vs GitHub-full split.
- `docs/cws-submission-checklist.md` already says a privacy-policy URL is needed
  and lists draft data categories, but the repo has no concrete policy page/file
  or publication checklist for that policy.
- `README.md` links the CWS checklist and permission rationale, but not a stable
  privacy-policy source.
- `scripts/manifest-patch.js` emits:

```js
browser_specific_settings: {
  gecko: {
    id: 'ytkit@sysadmindoc.github.io',
    strict_min_version: '128.0'
  }
}
```

- The Firefox patch path does not emit
  `browser_specific_settings.gecko.data_collection_permissions`.
- `extension/core/data-flow.js` catalogues 11 network/data-flow origins:
  YouTube, YouTube thumbnails, SponsorBlock/DeArrow, Return YouTube Dislike,
  Reddit, OpenAI, Anthropic, Gemini, local Ollama, Astra Downloader loopback,
  and Cobalt.
- Store-safe origins are currently YouTube, YouTube thumbnails,
  SponsorBlock/DeArrow, Return YouTube Dislike, and Reddit. GitHub-full adds
  BYO-key AI providers, local Ollama, Astra Downloader loopback, and Cobalt.
- `extension/background.js` allowlists remote origins, omits cookies for
  third-party API fetches, allows credentials only for local companion origins,
  and reads YouTube cookies for the authenticated local downloader handoff.

External sources reviewed:

- Chrome Web Store privacy fields:
  https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store program policies:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Chrome Web Store User Data FAQ:
  https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Chrome Web Store Use of Permissions policy:
  https://developer.chrome.com/docs/webstore/program-policies/permissions/
- Firefox Add-on Policies:
  https://extensionworkshop.com/documentation/publish/add-on-policies/
- Firefox built-in consent for data collection and transmission:
  https://www.extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- Firefox add-on submission guidance:
  https://extensionworkshop.com/documentation/publish/submitting-an-add-on/

## Current Policy Shape

### Chrome

Chrome's Privacy practices tab asks for:

- Single-purpose description.
- Permission justification for each manifest permission.
- Remote-code declaration.
- Data-use disclosure and certification.
- Privacy-policy URL.

Chrome program policy also requires an accurate, up-to-date privacy policy if a
product handles user data; the policy and in-product disclosures must disclose
how data is collected, used, and shared. Chrome also requires a Limited Use
statement on the extension's website or a page one click from the homepage, and
requires permissions to be the narrowest necessary for implemented features.

Current Astra status:

- Single-purpose and permission language exists in
  `docs/store-permission-rationale.md`.
- Data categories are partially listed in `docs/cws-submission-checklist.md`.
- No stable privacy-policy artifact exists in the repo.
- The store-safe package is the correct CWS submission package because it strips
  AI, Cobalt, Ollama, and local downloader loopback grants.

### Firefox / AMO

Mozilla policies define data transmission as data handled outside the add-on or
the local browser. The policy requires consent/control for data transmission and
opt-in before transmitting personal data such as cookies. AMO submission
guidance requires a privacy policy when data is transmitted from the user's
device.

Firefox's built-in data consent is available on desktop Firefox 140+ and Android
142+. From November 3, 2025, new extensions must adopt it. The built-in path
uses `browser_specific_settings.gecko.data_collection_permissions` and supports
required/optional data types such as:

- `authenticationInfo`
- `browsingActivity`
- `websiteContent`
- `websiteActivity`
- `technicalAndInteraction`
- `none`

Firefox 139-and-earlier installs need a custom data collection experience if
the extension collects/transmits data. Mozilla lists three options: raise the
minimum Firefox version, turn off data collection for older versions, or show a
custom consent experience.

Current Astra status:

- Generated Firefox artifacts support Firefox 128+.
- Generated Firefox artifacts do not declare data collection permissions.
- The extension has opt-in feature toggles for some data-transmitting features,
  but there is no single Firefox-specific consent/control path pinned for
  Firefox 128-139.

## Data-Flow Classification Draft

The implementer should treat this as a starting matrix, then tighten wording
against actual UI strings and profile output before publishing.

| Flow | Profile | Data category | Transmission | Current control |
| --- | --- | --- | --- | --- |
| YouTube page DOM / metadata / captions | store-safe | website content, website activity, browsing activity | YouTube page + extension runtime | Install permission and feature toggles |
| Thumbnail fetch / save | store-safe | website content | `i.ytimg.com` | Feature toggle / user action |
| SponsorBlock / DeArrow | store-safe | website content, browsing activity | `sponsor.ajay.app` | Feature toggles |
| Return YouTube Dislike | store-safe | website content | `returnyoutubedislikeapi.com` | Off by default |
| Reddit discussion panel | store-safe | website content / page URL-derived query | `www.reddit.com`, `old.reddit.com` | Feature toggle |
| YouTube cookies for downloader | GitHub-full behavior | authentication info, website content | Local extension path to local companion | User-started download flow |
| Astra Downloader health/history/stream links | GitHub-full | website activity / technical data | `127.0.0.1:9751-9851` | Feature toggles and local service |
| BYO-key AI summaries | GitHub-full | website content, authentication info for user key | selected provider | Opt-in + user key |
| Local Ollama summaries | GitHub-full | website content | `127.0.0.1:11434` | Opt-in local runtime |
| Cobalt fallback | GitHub-full | website content/current video URL | configured Cobalt endpoint | Off by default, only when companion offline |
| Diagnostics export | both | technical and interaction data | local download only unless user shares | User action |
| Settings/notes/history/export | both | website activity / local user content | local browser storage/download | User controls/export/reset |

## Recommended Roadmap Item

Add one P1 item:

**Ship cross-store privacy disclosure and Firefox data-consent packet.**

Acceptance shape:

- A stable privacy-policy source exists in the repo and is linkable from the
  project homepage/README and store submission fields.
- The policy covers local storage, third-party API calls, local companion
  handoff, cookie use, BYO-key provider behavior, retention/export/delete, and
  no telemetry/ads/sale.
- The policy includes Chrome's Limited Use statement.
- The Chrome dashboard matrix maps data categories to manifest permissions and
  store-safe host permissions.
- The Firefox build chooses one path and tests it:
  - raise minimum Firefox support to 140+ and add
    `data_collection_permissions`; or
  - keep Firefox 128+ and ship a custom consent/control surface before
    transmitting data on Firefox versions without built-in consent.
- GitHub-full data flows remain excluded from the store-safe public package.

## Implementation Notes

Potential Chrome dashboard categories for store-safe:

- Web history / browsing activity: current YouTube pages and video IDs used for
  user-visible features.
- User activity / website activity: watch progress, download/export actions,
  hidden videos, settings, notes, subscription group state.
- Website content: video metadata, transcripts, comments, thumbnails, page text.
- Authentication information: YouTube cookies only when the user starts an
  authenticated local download flow. Depending on final Chrome dashboard
  vocabulary, this may be a sensitive category even if it never leaves the
  user's machine except to `127.0.0.1`.

Potential Firefox categories:

- `browsingActivity`
- `websiteContent`
- `websiteActivity`
- `authenticationInfo`
- `technicalAndInteraction` only if diagnostic/error data is transmitted beyond
  the add-on/local browser. Local downloads alone should not be over-declared.

The implementer should avoid declaring `none` while any profile can transmit
video/page data to third-party APIs, a local companion outside the browser, or a
user-selected provider.

## Verification Ideas

- `npm run check`
- `npm test`
- `node build-extension.js --profile both`
- Inspect generated Firefox manifests for either:
  - `strict_min_version` at the chosen 140+ floor plus
    `data_collection_permissions`; or
  - a retained 128+ floor plus code/tests for the custom consent surface.
- Inspect store-safe generated manifests to confirm GitHub-full hosts remain
  stripped.
- `rg -n "privacy policy|Limited Use|data_collection_permissions" README.md docs extension scripts tests`
- For CWS prep, verify the privacy policy URL is stable and reachable before
  submission.
- For AMO prep, include reviewer notes explaining which data is transmitted by
  store-safe features and which is GitHub-full only.

## Explicit Non-Goals

- No new external data flows.
- No telemetry.
- No store submission until CI/release-channel recovery from Cycle 8 is handled.
- No relaxation of the store-safe / GitHub-full profile split.
- No change to downloader signing or release checksum work; that remains Cycle 8.

## Open Questions

- Should Firefox support be raised from 128 to 140 to use the built-in consent
  model cleanly, or is Firefox 128-139 support important enough to justify a
  custom consent/control page?
- Should the public CWS/AMO submission use store-safe only, while GitHub-full
  remains GitHub/self-hosted with a separate policy section?
- Where should the stable privacy policy live: tracked `docs/privacy-policy.md`
  rendered through GitHub Pages, project README one-click link, or another
  maintainer-controlled URL?
- Which data categories should be marked required vs optional in Firefox if the
  built-in consent path is chosen?
