# Astra Deck Store Permission Rationale

This is the copy-paste source for Chrome Web Store and AMO review fields. It is
documentation only; the generated manifests remain controlled by
`build-extension.js`.

Source check 2026-06-04:

- Chrome Web Store Program Policies:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Chrome Web Store quality guidelines FAQ:
  https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
- Chrome Web Store privacy fields:
  https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Firefox built-in consent for data collection and transmission:
  https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/

## Submission Profile

Submit the `store-safe` package to public stores:

- `astra-deck-store-safe-chrome-v*.zip` for Chrome Web Store.
- `astra-deck-store-safe-firefox-v*.xpi` for AMO if using the same public-store
  posture.

Use the `github-full` package only for GitHub/self-hosted installs. It keeps
optional BYO-key AI, Cobalt, local Ollama, and Astra Downloader loopback hosts
that the public-store package strips from `host_permissions` and CSP.

The `store-safe` package keeps only core YouTube access as install-time host
permissions. Enrichment hosts for SponsorBlock/DeArrow, YouTube thumbnails,
Return YouTube Dislike, and Reddit are declared as `optional_host_permissions`
and are requested from the popup only when the user explicitly enables the
matching feature or clicks the Grant access banner for an already-enabled
feature such as default-on SponsorBlock.

## Single-Purpose Statement

Astra Deck has one purpose: it turns YouTube into a local, privacy-first media
workstation by improving playback controls, feed layout, comments, transcripts,
research notes, local exports, and explicit user-initiated download handoff.
Every permission supports that YouTube workstation purpose. Astra Deck does not
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

Firefox builds require Firefox 140+ so Astra Deck can use Firefox's built-in
data collection and transmission consent flow instead of a custom consent screen
for Firefox 128-139. The generated Firefox manifest declares:

```json
{
  "browser_specific_settings": {
    "gecko": {
      "strict_min_version": "140.0",
      "data_collection_permissions": {
        "required": [
          "browsingActivity",
          "websiteContent",
          "websiteActivity",
          "authenticationInfo"
        ]
      }
    }
  }
}
```

Reviewer mapping:

| Firefox category | Why it is required |
| --- | --- |
| `browsingActivity` | YouTube URLs, video IDs, channel/page context, and Reddit/SponsorBlock/RYD lookups are part of user-visible YouTube enhancement features. |
| `websiteContent` | Astra Deck reads visible YouTube text, captions/transcripts, thumbnails, comments, metadata, and cookies needed for enabled features. |
| `websiteActivity` | Astra Deck stores user actions such as settings changes, watch progress, note/export/download actions, hidden videos, and subscription group state. |
| `authenticationInfo` | YouTube cookies can be read for an explicit authenticated local-download handoff to Astra Downloader. |

`technicalAndInteraction` is not declared because Astra Deck does not transmit
telemetry, usage metrics, crash reports, or diagnostic bundles automatically.
Diagnostics are local and exported only when the user manually downloads a
support bundle.

## Manifest Permissions

| Permission | Store justification |
| --- | --- |
| `storage` | Saves Astra Deck settings, local feature state, local caches, notes, watch-progress data, and user-created exports in the browser profile. |
| `unlimitedStorage` | Prevents silent quota failure for local YouTube caches and long-term user data; bounded LRU cleanup still trims large stores. |
| `cookies` | Reads YouTube cookies only when the user starts an authenticated local download flow so yt-dlp can access media the user can already view. Cookies are not sent to Astra Deck servers. |
| `downloads` | Saves user-requested exports, thumbnails, transcript files, diagnostic bundles, and media handoff files to the user's Downloads folder. |

## Store-Safe Host Permissions

| Host permission | Store justification |
| --- | --- |
| `https://*.youtube.com/*` | Runs the content script on YouTube pages and reads YouTube page data needed for playback, layout, transcript, comment, and feed features. |
| `https://*.youtube-nocookie.com/*` | Supports YouTube's privacy-enhanced embed origin with the same bounded playback/layout controls as standard YouTube pages. |
| `https://youtu.be/*` | Recognizes and normalizes YouTube short links so features and exports attach to the correct video. |

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
| `https://i.ytimg.com/*` | Loads and saves YouTube thumbnail images for thumbnail upgrade and explicit thumbnail-download features. |
| `https://returnyoutubedislikeapi.com/*` | Fetches estimated Return YouTube Dislike counts for the optional dislike-count restoration feature. |
| `https://www.reddit.com/*` | Fetches Reddit search results for the optional Reddit discussion panel under a YouTube video. |
| `https://old.reddit.com/*` | Allows Reddit permalink handling for the optional Reddit discussion panel without broad Reddit host access. |

## GitHub-Full Additional Host Permissions

These are not part of the public store-safe host set. They are retained only in
GitHub/self-hosted builds for users who explicitly choose the full profile.

| Host permission | Store justification |
| --- | --- |
| `https://api.openai.com/*` | Sends user-selected transcript/video context directly to OpenAI for the opt-in BYO-key AI summary feature. |
| `https://api.anthropic.com/*` | Sends user-selected transcript/video context directly to Anthropic for the opt-in BYO-key AI summary feature. |
| `https://generativelanguage.googleapis.com/*` | Sends user-selected transcript/video context directly to Gemini for the opt-in BYO-key AI summary feature. |
| `https://api.cobalt.tools/*` | Contacts a user-configurable Cobalt endpoint only when the GitHub-full Cobalt fallback is enabled and Astra Downloader is offline. |
| `http://127.0.0.1:11434/*` | Talks to the user's local Ollama runtime for offline AI summaries; no remote host is contacted. |
| `http://127.0.0.1:9751/*` | Talks to the local Astra Downloader companion for explicit user-started downloads. |
| `http://127.0.0.1:9761/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9771/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9781/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9791/*` | Fallback local Astra Downloader port for explicit user-started downloads. |
| `http://127.0.0.1:9851/*` | Fallback local Astra Downloader port for explicit user-started downloads. |

## Reviewer Notes

- Store-safe excludes AI provider, Cobalt, Ollama, and Astra Downloader loopback
  host grants from the packaged manifest and CSP.
- Store-safe declares SponsorBlock/DeArrow, thumbnail, Return YouTube Dislike,
  and Reddit hosts as runtime optional grants instead of install-time host
  permissions, and the background fetch proxy checks the current grant before
  proxying them.
- If a user denies or later revokes an optional host grant, the popup marks the
  affected setting and data-flow row with a permission-needed state instead of
  retrying silently.
- The Grant access banner lets default-on SponsorBlock request its shared
  SponsorBlock/DeArrow host from an explicit user gesture.
- GitHub-full is intentionally broader and should not be submitted as the public
  Chrome Web Store package.
- No `<all_urls>` host permission is requested.
- No `scripting.executeScript`, `tabs.executeScript`, or dynamic content-script
  registration call sites are present in `extension/`; `npm run check` enforces
  this through `scripts/check-firefox-injection.js`.
- No remote code is loaded. CSP keeps `script-src 'self'`; `npm run check`
  enforces the no-eval/no-string-timer rule.
