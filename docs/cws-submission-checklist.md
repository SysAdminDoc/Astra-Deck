# Astra Deck, Chrome Web Store Submission Checklist

> CWS reviews ran ~weeks-long in April 2026 and Google's privacy-policy
> review process for extensions using `downloads`, `cookies`, `tabs`, or
> `webRequest` permissions now requires a standardized vocabulary in
> the developer's privacy policy. Astra Deck self-distributes (CRX +
> ZIP) and is not listed on CWS today; this checklist captures what
> would be required if the maintainer ever decides to submit.

The public-store artifact is `chromium-store`: it keeps the YouTube
enhancement surface but removes the `downloads`, `cookies`, and
`nativeMessaging` permissions, all loopback origins, the user-selected HTTPS
capability (including self-hosted Cobalt), and the
downloader runtime module. The companion-capable `store-safe` artifact remains
available for self-hosted installs and any store submission whose policy
allows the optional local handoff.

---

## 1. Manifest preflight

Run before the first submission AND before every subsequent update.

- [ ] `manifest_version: 3`, CWS no longer accepts MV2.
- [ ] `permissions` array contains ONLY what's actually used. Audit
      with `node -e 'console.log(require("./extension/manifest.json").permissions)'`
      and grep for each in `extension/ytkit.js` + `extension/background.js`.
- [ ] `host_permissions` and `optional_host_permissions` arrays follow the same
      audit, every entry must appear in a content-script match, an optional
      runtime-grant map, or a `fetch` call site.
- [ ] `content_scripts` `matches` patterns are bounded, no `<all_urls>`.
- [ ] `default_locale` set (`"en"`); `_locales/<lang>/messages.json`
      present for every locale referenced in
      `__MSG_<key>__` strings.
- [ ] `content_security_policy.extension_pages` has no unsafe-inline,
      unsafe-eval, or wildcard sources. Astra Deck ships
      `script-src 'self'; object-src 'self'; connect-src <explicit list>`
      per H20 / NX11.
- [ ] `web_accessible_resources` lists only `icons/*` and `assets/*` for
      packaged icons plus bundled theme media, no source code, HTML, CSS, or
      unreviewed asset paths.

---

## 2. Privacy policy

CWS now requires a privacy policy URL on the listing page when the
extension uses any of the "sensitive permissions" (downloads, cookies,
tabs, webRequest, host_permissions for non-self origins). The policy
must use Google's standardized vocabulary to declare data categories.

- [ ] Privacy policy hosted at a stable URL (CWS will reject if the
      URL returns 404 during review).
- [ ] Tracked source for that policy is
      [docs/privacy-policy.md](privacy-policy.md); publish that content at the
      project homepage or another maintainer-controlled stable URL before
      filling the CWS/AMO listing fields.
- [ ] Copy the current single-purpose statement, data-handling statement, and
      third-party data attribution plus permission/host justifications from
      [store-permission-rationale.md](store-permission-rationale.md).
- [ ] Detailed CWS and AMO listing descriptions include the SponsorBlock
      API/database attribution and CC BY-NC-SA 4.0 licence link verbatim from
      [store-permission-rationale.md](store-permission-rationale.md).
- [ ] Declares EACH category Astra Deck uses against the [Chrome
      Web Store Permissions Justification template](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy):
  - **Authentication info**, four allowlisted secure `.youtube.com` sign-in
    cookie names via `chrome.cookies`, passed to local Astra Downloader only
    for a user-started authenticated download after native-host proof.
  - **Personal communications**, N/A.
  - **Financial info**, N/A.
  - **Health info**, N/A.
  - **Location**, N/A.
  - **Web history**, YouTube watch history mirror in
    `chrome.storage.local` for the watch-history-tracking feature.
  - **User activity**, Watch time tracker, resume playback, hidden
    videos / blocked channels lists. All local-only.
  - **Website content**, Comment text for the comment-search and
    comment-handle-revealer features; video transcripts for the
    transcript viewer + AI summary.
- [ ] Single-purpose statement matches the listing description.
- [ ] Data-handling disclosure: explicitly states data is local-only
      (no telemetry, no remote storage) for everything except
      user-initiated BYO-key AI summary calls.
- [ ] Limited Use disclosure: explicitly states Astra Deck's use and transfer of
      information received from Google APIs adheres to the Chrome Web Store User
      Data Policy, including Limited Use requirements.

---

## 3. Submission preflight

- [ ] Build clean via `node build-extension.js --profile chromium-store`, the CWS/Edge ZIP contains no downloader module, Cobalt host, loopback
      origin, or download-related manifest permission.
- [ ] Build the companion-capable profiles separately when required via
      `node build-extension.js --profile store-safe` or
      `node build-extension.js --profile github-full`.
- [ ] Release package built locally with the external CRX key path
      (`ASTRA_CRX_KEY_PATH` or the default
      `%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem`) via
      `npm run build:userscript`; CI build artifacts use
      `ASTRA_CRX_KEY_MODE=ephemeral` for provenance evidence, not the public
      CRX signing source.
- [ ] Release SBOM and checksums generated with
      `npm sbom --omit=dev --sbom-format cyclonedx > build/astra-deck-npm-sbom.cdx.json`
      and `npm run release:manifest`.
- [ ] `npm run check` passes (syntax / versions / i18n / lint /
      a11y / contrast).
- [ ] `npm test` passes (all `tests/*.test.js` + `tests/features/*.test.js`).
- [ ] `npm audit --omit=dev` clean.
- [ ] Python dependency auditing is green in https://github.com/SysAdminDoc/AstraDownloader;
      attach or link `build/astra-downloader-pip-audit.json` for release review.
- [ ] CHANGELOG entry for the new version.
- [ ] Screenshots captured at the current popup dimensions (system DPI
      must be 100 % for CWS, they reject scaled captures).
- [ ] Listing description references no other brand names (no
      "YouTube extension", "for YouTube" is fine; "YouTube" as a
      noun in the first word is fine; using YouTube's logo is not).

---

## 4. CWS-specific permissions justifications

Each permission needs a one-paragraph justification in the CWS dashboard. The
copy-paste source of truth is
[store-permission-rationale.md](store-permission-rationale.md), which is pinned
by `tests/hardening.test.js` against the live manifest and build-profile host
grants. Submit the `chromium-store` package to Chrome Web Store or Edge; use
`store-safe` only where the companion handoff is allowed, and reserve
`github-full` for GitHub/self-hosted installs.

| Permission | Justification |
|---|---|
| `storage` | Settings persistence and per-feature local caches (DeArrow branding, SponsorBlock segments, video / channel hide lists, transcript cache). All local. |
| `unlimitedStorage` | Long-term users accumulate DeArrow + SponsorBlock caches past Chrome's 10 MB `chrome.storage.local` default. The LRU cleanup task trims hot caches every 5 min; the cap exists only to prevent silent quota errors on a busy account. |
| `cookies` | For a user-started authenticated download, the extension uses a 20-second, one-use, tab/document-bound capability after native API v2 proof, queries only `.youtube.com`, and forwards only `LOGIN_INFO` plus available `SAPISID`/`__Secure-1PAPISID`/`__Secure-3PAPISID` values that satisfy the secure root-path and 4 KiB limits. Incomplete sets fail closed. Sent only to Astra Downloader on the documented `127.0.0.1` ports and never off-machine. |
| `downloads` | Triggering thumbnail + transcript exports + diagnostic-log save from the popup to the user's Downloads folder. |
| `host_permissions: youtube.com / youtu.be / youtube-nocookie.com` | Core content script attachment, YouTube page reads, and short-link/embed support. |
| `optional_host_permissions: sponsor.ajay.app / i.ytimg.com / returnyoutubedislikeapi.com / reddit.com` | SponsorBlock/DeArrow, thumbnail upgrade/download, estimated Return YouTube Dislike counts, and Reddit discussion panel calls. Requested from the popup when the user enables a matching feature, or through the Grant access banner when an already-enabled feature such as default-on SponsorBlock needs the runtime grant; the background proxy checks the current grant before fetching. No cookies are sent. |
| `optional_host_permissions: api.openai.com / api.anthropic.com / generativelanguage.googleapis.com` | GitHub-full only. BYO-key AI summary and transcript-translation fallback; the selected provider is requested at the user gesture, while Chrome's built-in AI lane uses no host permission or key. |
| `optional_host_permissions: https://*/*` | GitHub-full only and never requested as a whole. Supports one exact user-selected Video Hider list or authorized self-hosted Cobalt origin; the public Cobalt service is rejected. |
| `host_permissions: 127.0.0.1:9751-9851` | GitHub-full only. Astra Downloader local probe and explicit download handoff across six fallback ports. |
| `host_permissions: 127.0.0.1:11434` | GitHub-full only. Optional local Ollama for AI summary. |

For the `chromium-store` package, the `cookies`, `downloads`, and
`nativeMessaging` rows above are absent rather than merely optional. The
package also has no broad user-selected HTTPS capability, public Cobalt host,
or `127.0.0.1` host/CSP entries, and its
staged runtime graph does not contain `features/download-ui/index.js`.

---

## 5. Post-submission

- [ ] Track review status weekly. CWS doesn't notify on hold; the only
      signal is the dashboard.
- [ ] If rejected: read the rejection email carefully, the specific
      policy clause matters; reply with a remediation plan attached
      to the same item.
- [ ] If accepted: pin a comment on the GH release noting the CWS
      listing went live, and update README install instructions to
      list CWS first.

---

## 6. Things that will ALWAYS get rejected

- **Code obfuscation.** Minification is fine; obfuscation that hides
  intent (uglify with `mangle: true`, hex-encoded strings) is not.
  Astra Deck ships unminified by design.
- **"YouTube" as the listing name.** Use "Astra Deck" or "Astra Deck
  for YouTube."
- **Use of YouTube's official logo** in screenshots / icons.
- **Auto-downloading anything without user action.** The CWS/Edge
  `chromium-store` package contains no downloader runtime or download
  permission. Companion-capable profiles keep the auto-download-on-visit
  feature opt-in default-OFF and are not the public-store artifact.
- **Remote code execution.** The bundled `chrome.userScripts` API
  (we don't use it today; UC10 contemplates it) would require an
  additional dedicated justification.

---

## 7. AMO submission delta

The Mozilla AMO listing path (NX4) is similar but has these
differences:

- AMO accepts ZIP, not CRX. The XPI is a renamed ZIP, Firefox's
  native extension package.
- AMO has TWO review modes: "listed" (public store) and "unlisted"
  (signed, but private). Astra Deck targets unlisted (NX4) so the
  XPI auto-updates without going through public review.
- AMO's policy update June 2025 explicitly allows self-hosted
  privacy policies (CWS requires AMO-hosted text in some flows).
- AMO requires source code submission for any minified / obfuscated
  asset. Astra Deck ships readable so this is a no-op.
- Firefox artifacts require Firefox 142+ and use the built-in data collection
  consent prompt. `scripts/manifest-patch.js` derives
  `browser_specific_settings.gecko.data_collection_permissions` from each
  build profile's data-flow capabilities. All profiles require
  `browsingActivity`, `websiteContent`, and `websiteActivity`; only the
  companion-capable profiles also require `authenticationInfo` and optionally
  declare `technicalAndInteraction`. The download-free `chromium-store`
  artifact declares neither companion-only category.
- AMO reviewer notes should point at [privacy-policy.md](privacy-policy.md) and
  the Firefox Data Consent section of
  [store-permission-rationale.md](store-permission-rationale.md).
- AMO unlisted reviews land in 2-4 weeks at the time of writing.
