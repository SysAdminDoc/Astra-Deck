# Astra Deck Store Permission Rationale

This is the copy-paste source for Chrome Web Store and AMO review fields. It is
documentation only; the generated manifests remain controlled by
`build-extension.js`.

Source check 2026-08-13:

- Chrome Web Store Program Policies:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Chrome declarativeNetRequest API:
  https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Chrome Web Store quality guidelines FAQ:
  https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
- Chrome Web Store privacy fields:
  https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Firefox built-in consent for data collection and transmission:
  https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/

## Submission Profiles

Submit the download-free `chromium-store` package to Chrome Web Store or Edge:

- `astra-deck-chromium-store-chrome-v*.zip` for Chrome Web Store and Edge.
- `astra-deck-chromium-store-firefox-v*.xpi` only when a Firefox submission
  also needs the same no-companion posture.

The companion-capable `store-safe` package remains available for self-hosted
installs or a store review that explicitly allows the local handoff. Use the
`github-full` package only for GitHub/self-hosted installs. It keeps optional
BYO-key AI, Cobalt, local Ollama, and the Astra Downloader loopback hosts.

The `store-safe` package keeps only core YouTube access as install-time host
permissions. Enrichment hosts for SponsorBlock/DeArrow, YouTube thumbnails,
Return YouTube Dislike, and Reddit are declared as `optional_host_permissions`
and are requested from the popup only when the user explicitly enables the
matching feature or clicks the Grant access banner for an already-enabled
feature such as default-on SponsorBlock.

## Single-Purpose Statement

Astra Deck has one purpose: it turns YouTube into a local, privacy-first media
workstation by improving playback controls, feed layout, comments, transcripts,
research notes, and local exports. Companion-capable builds additionally support
an explicit user-initiated local handoff; the `chromium-store` build does not
ship that capability. Every permission supports that YouTube workstation
purpose. Astra Deck does not
track users, inject ads, sell or broker data, run remotely hosted code, or read
unrelated browsing surfaces.

## Data-Handling Statement

Astra Deck stores settings, caches, notes, hidden-video lists, watch progress,
diagnostics, and exports locally in the browser profile. Network calls are
limited to user-visible YouTube enhancement features. Third-party API calls are
feature-gated, use no extension telemetry, and avoid cookies unless explicitly
noted. BYO-key AI calls are GitHub-full only, opt-in, and sent directly from the
user's browser to the selected provider or local runtime.

Stable privacy policy source: [privacy-policy.md](privacy-policy.md).

## Firefox Data Consent

Firefox builds require Firefox 142+ so Astra Deck can use Firefox's built-in
data collection and transmission consent flow instead of a custom consent screen
for Firefox 128-141. `extension/core/data-flow.js` derives the generated
manifest declaration from each artifact's available origins:

| Firefox artifact | Required | Optional |
| --- | --- | --- |
| `chromium-store` | `browsingActivity`, `websiteContent`, `websiteActivity` | None |
| `store-safe` | `browsingActivity`, `websiteContent`, `websiteActivity`, `authenticationInfo` | `technicalAndInteraction` |
| `github-full` | `browsingActivity`, `websiteContent`, `websiteActivity`, `authenticationInfo` | `technicalAndInteraction` |

Reviewer mapping:

| Firefox category | Why it is required |
| --- | --- |
| `browsingActivity` | YouTube URLs, video IDs, channel/page context, and Reddit/SponsorBlock/RYD lookups are part of user-visible YouTube enhancement features. |
| `websiteContent` | Astra Deck reads visible YouTube text, captions/transcripts, thumbnails, comments, metadata, and cookies needed for enabled features. |
| `websiteActivity` | Astra Deck stores user actions such as settings changes, watch progress, note/export/download actions, hidden videos, and subscription group state. |
| `authenticationInfo` | Companion-capable profiles can read YouTube cookies for an explicit authenticated local-download handoff to Astra Downloader. The download-free `chromium-store` artifact cannot and does not declare this category. |
| `technicalAndInteraction` | Optional in companion-capable profiles because an explicit companion action can send the selected download format and quality outside the browser. The download-free `chromium-store` artifact omits it. |

Astra Deck does not transmit telemetry, usage metrics, crash reports, or
diagnostic bundles automatically. Diagnostics are local and exported only when
the user manually downloads a support bundle.

## Manifest Permissions

Both profiles can use the authenticated local companion: `store-safe` and
`github-full`. The separate `chromium-store` build removes the companion's cookie,
native-messaging, downloads, and loopback surface entirely; its profile marker
and runtime policy also hide the companion settings. Every profile marker is
stamped into its staged manifest and enforced by the runtime policy resolver, so
settings imports cannot turn a restricted artifact into a broader one.

| Permission | Store justification |
| --- | --- |
| `storage` | Saves Astra Deck settings, local feature state, local caches, notes, watch-progress data, and user-created exports in the browser profile. |
| `unlimitedStorage` | Prevents silent quota failure for local YouTube caches and long-term user data; bounded LRU cleanup still trims large stores. |
| `declarativeNetRequest` | Enables the bundled static `astra_zero_ads` ruleset. Its five rules block known YouTube ad-serving domains and ad telemetry endpoints only when YouTube or YouTube No-Cookie initiated the request. Rules do not inspect request bodies, read browsing history, redirect traffic, or transmit data. |
| `cookies` | Reads YouTube cookies only when the user starts an authenticated local download flow so yt-dlp can access media the user can already view. Cookies are not sent to Astra Deck servers. |
| `downloads` | Saves user-requested exports, thumbnails, transcript files, diagnostic bundles, and media handoff files to the user's Downloads folder. |
| `nativeMessaging` | Enables secure token exchange with the optional local Astra Downloader companion via a browser-pinned stdio pipe, replacing the HTTP `/health` token disclosure path. Only activates when the companion registers its native host manifest. |
| `sidePanel` | Provides an optional persistent dashboard panel (Chrome only) for diagnostics, selector health, storage stats, and settings so the popup stays compact. |

## Store-Safe Host Permissions

| Host permission | Store justification |
| --- | --- |
| `https://*.youtube.com/*` | Runs the content script on YouTube pages and reads YouTube page data needed for playback, layout, transcript, comment, and feed features. |
| `https://*.youtube-nocookie.com/*` | Supports YouTube's privacy-enhanced embed origin with the same bounded playback/layout controls as standard YouTube pages. |
| `https://youtu.be/*` | Recognizes and normalizes YouTube short links so features and exports attach to the correct video. |

## Store-Safe Companion Host Permissions

The authenticated local companion is available in both profiles. These literal
loopback grants are limited to the companion's six documented discovery ports;
the runtime still requires the companion service identity and bearer token.

| Host permission | Store justification |
| --- | --- |
| `http://127.0.0.1:9751/*` | Talks to the local Astra Downloader companion for explicit user-started downloads. |
| `http://127.0.0.1:9761/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9771/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9781/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9791/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9851/*` | Fallback local Astra Downloader port for explicit user-started downloads. |

The `chromium-store` profile has no companion host permissions and no loopback
origins in its extension-pages CSP. Its staged runtime graph omits
`features/download-ui/index.js`; companion settings are unavailable even if an
older settings backup contains downloader keys.

## Store-Safe Runtime Optional Host Permissions

These hosts are declared in `optional_host_permissions`, not install-time
`host_permissions`, for the public `store-safe` artifacts. Astra Deck requests
them from the popup when the user explicitly enables the matching feature, or
from the Grant access banner when an already-enabled feature needs the runtime
grant. The background fetch proxy also verifies the current runtime host grant
before proxying requests to these optional origins.

| Optional host permission | Store justification |
| --- | --- |
| `https://sponsor.ajay.app/*` | Fetches SponsorBlock segments and DeArrow metadata only for enabled SponsorBlock/DeArrow features. No cookies are sent. |
| `https://sponsorblock.kavin.rocks/*` | Fetches SponsorBlock-compatible hash-prefix segment data when configured as the approved fallback mirror. No cookies are sent. |
| `https://i.ytimg.com/*` | Loads and saves YouTube thumbnail images for thumbnail upgrade and explicit thumbnail-download features. |
| `https://returnyoutubedislikeapi.com/*` | Fetches estimated Return YouTube Dislike counts for the optional dislike-count restoration feature. |
| `https://www.reddit.com/*` | Fetches Reddit search results for the optional Reddit discussion panel under a YouTube video. |
| `https://old.reddit.com/*` | Allows Reddit permalink handling for the optional Reddit discussion panel without broad Reddit host access. |

## GitHub-Full Additional Host Permissions

These are not part of the public store-safe host set. They are retained only in
GitHub/self-hosted builds for users who explicitly choose the full profile.

| Host permission | Store justification |
| --- | --- |
| `https://api.openai.com/*` | Runtime-optional GitHub-full fallback. Sends user-selected transcript/video context directly to OpenAI only after the selected BYO-key provider is granted; Chrome's built-in AI lane uses no host permission or key. |
| `https://api.anthropic.com/*` | Runtime-optional GitHub-full fallback. Sends user-selected transcript/video context directly to Anthropic only after the selected BYO-key provider is granted; Chrome's built-in AI lane uses no host permission or key. |
| `https://generativelanguage.googleapis.com/*` | Runtime-optional GitHub-full fallback. Sends user-selected transcript/video context directly to Gemini only after the selected BYO-key provider is granted; Chrome's built-in AI lane uses no host permission or key. |
| `https://api.cobalt.tools/*` | Contacts a user-configurable Cobalt endpoint only when the GitHub-full Cobalt fallback is enabled and Astra Downloader is offline. |
| `https://*/*` | Runtime-optional, GitHub-full only, and never granted as a whole. It exists so the browser can prompt for **one** user-typed Video Hider filter-list origin at a time: Astra Deck requests `https://<that host>/*` and nothing else, and the background proxy refuses any origin the user has not granted. Requests are anonymous (`credentials: 'omit'`, no `Authorization`), `GET` only, 15 s timeout, capped at 1 MiB, and the response is parsed as a versioned data-only rule list — a fetched list can never supply executable predicate code. `extension/core/remote-list-scope.js` rejects non-HTTPS URLs, embedded credentials, fragments, bare IP literals, and loopback/RFC1918/CGNAT/link-local/reserved addresses plus single-label and `.local`/`.internal`/`.lan`/`.home.arpa` names before a prompt is shown. This permission is stripped from store-safe artifacts. |
| `http://127.0.0.1:11434/*` | Talks to the user's local Ollama runtime for offline AI summaries; no remote host is contacted. |

## Reviewer Notes

- `rules/zero-ads.json` is a reviewable static ruleset. It does not use dynamic
  or session rules, excludes YouTube media/CDN hosts, and pairs network
  blocking with `early.css` collapse of empty ad containers so blocked slots do
  not leave layout gaps.
- `web_accessible_resources` is intentionally restricted to `icons/*` and
  `assets/*`. The latter exists only for bundled theme media such as
  `assets/cat.gif`; JavaScript, HTML, CSS, source maps, and data exports are not
  web-accessible in any build profile.
- Store-safe excludes AI provider, Cobalt, and Ollama grants from the packaged
  manifest and CSP, while retaining the authenticated Astra Downloader
  loopback contract.
- Store-safe declares SponsorBlock/DeArrow, thumbnail, Return YouTube Dislike,
  and Reddit hosts as runtime optional grants instead of install-time host
  permissions, and the background fetch proxy checks the current grant before
  proxying them.
- If a user denies or later revokes an optional host grant, the popup marks the
  affected setting and data-flow row with a permission-needed state instead of
  retrying silently.
- The Grant access banner lets default-on SponsorBlock request its shared
  SponsorBlock/DeArrow host from an explicit user gesture.
- The broad `https://*/*` optional pattern is a capability the GitHub-full build
  declares, not a grant it asks for. `validateRuntimeOptionalHostRequest` in
  `background.js` explicitly rejects any request for the pattern itself, so a
  page-driven message cannot escalate one filter-list origin into blanket web
  access. Residual risk, accepted and documented: the denylist is literal-only,
  so a granted public hostname that later resolves to a private address is not
  re-checked at fetch time. Resolving at validation time would not fix this —
  DNS can change between the check and the request.
- GitHub-full is intentionally broader and should not be submitted as the public
  Chrome Web Store package.
- No `<all_urls>` host permission is requested.
- No `scripting.executeScript`, `tabs.executeScript`, or dynamic content-script
  registration call sites are present in `extension/`; `npm run check` enforces
  this through `scripts/check-firefox-injection.js`.
- No remote code is loaded. CSP keeps `script-src 'self'`; `npm run check`
  enforces the no-eval/no-string-timer rule.
