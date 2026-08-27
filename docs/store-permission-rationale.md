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

## Third-Party Data Attribution

Use this text in the detailed Chrome Web Store and AMO listing descriptions:

> Astra Deck's SponsorBlock and DeArrow features use SponsorBlock API/database
> data from https://sponsor.ajay.app/, licensed under CC BY-NC-SA 4.0:
> https://creativecommons.org/licenses/by-nc-sa/4.0/. Astra Deck may reformat
> titles and visualize segments; those presentation changes are made by Astra
> Deck and are not endorsed by SponsorBlock.

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
| `authenticationInfo` | Companion-capable profiles can read only four allowlisted `.youtube.com` sign-in cookie names for an explicit authenticated local-download handoff after registered native-host proof. The download-free `chromium-store` artifact cannot and does not declare this category. |
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
| `alarms` | Restores Astra's static ad rules at the visible deadline after a user explicitly pauses them for 15 minutes from an anti-adblock recovery card. The alarm stores only a fixed internal name and time. Detection never creates an alarm or changes blocking policy. |
| `unlimitedStorage` | Prevents silent quota failure for local YouTube caches and long-term user data; bounded LRU cleanup still trims large stores. |
| `declarativeNetRequest` | Enables the bundled static `astra_zero_ads` ruleset. Its five rules block known YouTube ad-serving domains and ad telemetry endpoints only when YouTube or YouTube No-Cookie initiated the request. Rules do not inspect request bodies, read browsing history, redirect traffic, or transmit data. |
| `cookies` | After fresh native API v2 proof, reads only `LOGIN_INFO`, `SAPISID`, `__Secure-1PAPISID`, and `__Secure-3PAPISID` from the secure root `.youtube.com` scope when the user starts an authenticated local download. A 20-second, one-use, tab/document-bound capability gates the read; each value is capped at 4 KiB, incomplete sets fail closed, and the first cookie-bearing handoff is disclosed in-product. Cookies are not sent to Astra Deck servers. |
| `downloads` | Saves user-requested exports, thumbnails, transcript files, diagnostic bundles, and media handoff files to the user's Downloads folder. |
| `nativeMessaging` | Enables secure token exchange with the optional local Astra Downloader companion via a browser-pinned stdio pipe. An exact `astra-downloader` API v2-or-newer response is also required before the background can issue a one-use authenticated-cookie capability. Only activates when the companion registers its native host manifest. |
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
| `https://raw.githubusercontent.com/*` | Repair paths only, both anonymous and data-only. (1) When a YouTube layout change breaks a feature, the user can run a selector refresh that downloads this extension's own published `selector-packs.json`, under a 256 KB cap. (2) Known-Breakage Notices reads this extension's own published `feature-disable-feed.csv` at most once every six hours, under a 64 KB cap, and stops running the features it names. Both are fetched from fixed URLs held in the background script, not caller-supplied ones, without cookies and with `redirect: 'error'`. Nothing is uploaded. The disable feed is the only automatic request to this host, it is off when the user turns the feature off, and it can only ever stop a feature running, see the section below. |

## GitHub-Full Additional Host Permissions

These are not part of the public store-safe host set. They are retained only in
GitHub/self-hosted builds for users who explicitly choose the full profile.

| Host permission | Store justification |
| --- | --- |
| `https://api.openai.com/*` | Runtime-optional GitHub-full fallback. Sends user-selected transcript/video context directly to OpenAI only after the selected BYO-key provider is granted; Chrome's built-in AI lane uses no host permission or key. |
| `https://api.anthropic.com/*` | Runtime-optional GitHub-full fallback. Sends user-selected transcript/video context directly to Anthropic only after the selected BYO-key provider is granted; Chrome's built-in AI lane uses no host permission or key. |
| `https://generativelanguage.googleapis.com/*` | Runtime-optional GitHub-full fallback. Sends user-selected transcript/video context directly to Gemini only after the selected BYO-key provider is granted; Chrome's built-in AI lane uses no host permission or key. |
| `https://*/*` | Runtime-optional, GitHub-full only, and never granted as a whole. It lets the browser prompt for **one** user-typed host for either a Video Hider filter list or an authorized self-hosted Cobalt instance; Astra Deck requests `https://<that host>/*` and the worker refuses an origin the user did not grant. Filter-list traffic is anonymous GET-only and capped at 1 MiB. A strict versioned parser rejects unknown or malformed fields and strips publisher predicate code before persistence. Successful content is recorded as a SHA-256-addressed last-known-good payload with ETag/Last-Modified validators; stale use is visible, user-disableable, and controllable with daily, weekly, or manual checks. Cobalt uses a separate fixed POST contract: the destination comes from validated settings, only the canonical YouTube watch URL is sent, credentials are omitted, redirects are refused, timeout is 15 s, and the JSON response is capped at 512 KiB. Origins must be root HTTPS URLs without credentials, query strings, fragments, IP literals, private/reserved addresses, or internal-only names. `api.cobalt.tools` is explicitly rejected because Astra Deck has no authorization to use that public service. This capability and its `https://*` CSP lane are stripped from store-safe artifacts. |
| `http://127.0.0.1:11434/*` | Talks to the user's local Ollama runtime for offline AI summaries; no remote host is contacted. |

## Known-Breakage Notices and the remote-logic rule

Mozilla forbids an add-on concealing functionality by making "control flow
decisions based on external resources". Chrome's policy is narrower and
concerns remote *code*. Known-Breakage Notices is a control-flow decision based
on an external resource, so it is worth stating plainly what it is and why it
ships in every profile rather than only in the GitHub build.

What the feed can do: name a feature ID that this extension already ships, an
issue number, and a version range, and thereby stop that feature activating.
That is the entire mechanism. It terminates in one `Set` in the content script
whose only consumer is a `return false` inside `shouldFeatureBeActive`, and it
is read *after* the user's own setting, never before it.

What the feed cannot do, enforced by `extension/core/feature-disable-feed.js`
and asserted by a hostile-row battery in `tests/feature-disable-feed.test.js`:

- It cannot enable a feature. There is no shape in the parser's output that
  means "on", so there is nothing for a hostile row to aim at.
- It cannot write, read, or change any setting. The user's toggle keeps its
  value; turning the feature off restores everything with no migration.
- It cannot introduce behaviour. It carries no code, no selectors, no rules,
  and no URLs.
- It cannot put its own words or its own links in front of the user. The row
  copy is a localized string in this extension, and the tracker link is built
  here from the row's issue *number*.
- It cannot name anything outside the shipped schema. An unrecognised ID is
  dropped, resolved through the same alias table stored settings use.
- It cannot come from anyone but the maintainer. Since v4.88.3 the feed carries
  a detached ECDSA P-256 signature at `feature-disable-feed.csv.sig`, verified
  in the service worker against a public key compiled into the package before
  the body is cached or parsed. A missing, malformed, or non-matching signature
  is refused and the previous copy is kept. `selector-packs.json` is signed and
  verified the same way; its in-band `sha256:` digest travels inside the asset
  and therefore proves integrity, not origin.

Why it ships everywhere. The alternative to a disable feed is not "no remote
influence", it is leaving a feature the maintainer *knows* is broken running
against a changed YouTube until a new version clears review, which is the
behaviour users experience as the extension breaking the site. Refined GitHub
ships this same mechanism on both AMO and the Chrome Web Store, which is the
practical evidence it passes review. Restricting it to the GitHub build would
withhold the repair channel from exactly the users who cannot self-update.

The feature is default-on, disclosed in the data-flow panel, and switchable off
in Settings under Advanced. With it off, no request to the feed is made.

## Reviewer Notes

- `rules/zero-ads.json` is a reviewable static ruleset. It does not use dynamic
  or session rules, excludes YouTube media/CDN hosts, and pairs network
  blocking with `early.css` collapse of empty ad containers so blocked slots do
  not leave layout gaps.
- A visible YouTube enforcement component is reported with its structural
  selector and sampled playback state. Only the recovery card's button can
  pause `astra_zero_ads`. The deadline is kept in `storage.session`, an alarm
  restores the rules after 15 minutes, and worker startup restores them if an
  expired or missing session record finds the ruleset disabled.
<!-- BEGIN GENERATED REVIEWER RESOURCE INVENTORY -->
### Generated web-accessible resource inventory

This block is generated from temporary package stages for every build profile and browser target. Run `node scripts/generate-reviewer-resource-docs.js --write` after changing the manifest or runtime graph.

The runtime loader and its packaged JavaScript modules are web-accessible because the isolated content runtime imports them through `runtime.getURL()`. They remain local extension code under `script-src 'self'`; no remote code is loaded. Chromium assigns per-session resource aliases through `use_dynamic_url: true`. Firefox omits that Chromium-only key and serves the same reviewed paths from its randomized extension origin.

| Build profile | Browser target | Exact resource set | Paths | `use_dynamic_url` |
| --- | --- | --- | ---: | --- |
| `store-safe` | chromium | A | 119 | `true` on every entry |
| `store-safe` | firefox | A | 119 | omitted |
| `chromium-store` | chromium | B | 118 | `true` on every entry |
| `chromium-store` | firefox | B | 118 | omitted |
| `github-full` | chromium | A | 119 | `true` on every entry |
| `github-full` | firefox | A | 119 | omitted |

#### Resource set A

Used by: `store-safe` chromium, `store-safe` firefox, `github-full` chromium, `github-full` firefox.

Entry 1 match patterns:

- `https://*.youtube.com/*`
- `https://*.youtube-nocookie.com/*`
- `https://youtu.be/*`

Entry 1 resource paths:

- `icons/32.png`
- `assets/cat.gif`

Entry 2 match patterns:

- `https://*.youtube.com/*`
- `https://*.youtube-nocookie.com/*`
- `https://youtu.be/*`

Entry 2 resource paths:

- `runtime-core-loader.mjs`
- `core/browser-api.js`
- `core/injection-guard.js`
- `core/env.js`
- `core/storage.js`
- `core/styles.js`
- `core/settings-visual-system.js`
- `core/registry.js`
- `core/runtime-flags.js`
- `core/local-ai.js`
- `core/capability-probe.js`
- `core/selector-packs/appShell.js`
- `core/selector-packs/nav.js`
- `core/selector-packs/search.js`
- `core/selector-packs/searchResults.js`
- `core/selector-packs/subscriptions.js`
- `core/selector-packs/leftNav.js`
- `core/selector-packs/feed.js`
- `core/selector-packs/feedCard.js`
- `core/selector-packs/feedExperimentChips.js`
- `core/selector-packs/feedPlayables.js`
- `core/selector-packs/feedPrompt.js`
- `core/selector-packs/feedSponsored.js`
- `core/selector-packs/thumbnail.js`
- `core/selector-packs/shortsShelf.js`
- `core/selector-packs/watch.js`
- `core/selector-packs/relatedSidebar.js`
- `core/selector-packs/player.js`
- `core/selector-packs/mainVideo.js`
- `core/selector-packs/playerChrome.js`
- `core/selector-packs/playerSettings.js`
- `core/selector-packs/sidebar.js`
- `core/selector-packs/modals.js`
- `core/selector-packs/comments.js`
- `core/selector-packs/commentComposer.js`
- `core/selector-packs/engagementPanels.js`
- `core/selector-packs/transcriptPanel.js`
- `core/selector-packs/settingsOverlay.js`
- `core/selector-packs/profile.js`
- `core/selector-packs/notifications.js`
- `core/selector-packs/media.js`
- `core/selector-packs/liveChatFrame.js`
- `core/selector-packs/liveChat.js`
- `core/selector-packs/liveChatPlaceholder.js`
- `core/selectors.js`
- `core/trusted-html.js`
- `core/diagnostic-log.js`
- `core/external-api-health.js`
- `core/regex-safety.js`
- `core/predicate-sandbox.js`
- `core/video-type.js`
- `core/playability.js`
- `core/transcript-service.js`
- `core/transcript-index.js`
- `core/ai-summary-artifacts.js`
- `core/remote-list-scope.js`
- `core/persisted-domains.js`
- `core/settings-import-transaction.js`
- `core/storage-manager.js`
- `core/icons.js`
- `core/url.js`
- `core/text-metrics.js`
- `core/date-time.js`
- `core/failure-copy.js`
- `core/page.js`
- `core/navigation.js`
- `core/player.js`
- `core/settings-schema.js`
- `core/feature-lifecycle.js`
- `core/policy-profile.js`
- `core/settings-controller.js`
- `core/selector-health.js`
- `core/feature-health.js`
- `core/feature-disable-feed.js`
- `core/feature-bisect.js`
- `core/chapters.js`
- `core/csv.js`
- `core/dialog-guard.js`
- `core/zero-ad-dom.js`
- `core/element-zapper.js`
- `core/hide-attribution.js`
- `core/heatmap.js`
- `core/youtube-thumbnails.js`
- `core/feature-schedule.js`
- `core/companion-ports.js`
- `core/cookie-handoff.js`
- `core/data-flow.js`
- `core/toast.js`
- `core/toast-dom.js`
- `core/lifecycle-route-bridge.js`
- `features/element-zapper/index.js`
- `features/subtitles/index.js`
- `features/video-filters/index.js`
- `features/blue-light-filter/index.js`
- `features/theme-css/index.js`
- `features/wave-8-css/index.js`
- `features/home-subs-css/index.js`
- `features/chat-style-comments/index.js`
- `features/sticky-video/index.js`
- `features/sticky-chat/index.js`
- `features/video-hider/index.js`
- `features/video-notes/index.js`
- `features/replay-chat-density/index.js`
- `features/subscription-view/index.js`
- `features/subscription-groups/index.js`
- `features/digital-wellbeing/index.js`
- `features/settings-panel/index.js`
- `features/player-dock/index.js`
- `features/youtube-music-compat/index.js`
- `features/search-hygiene/index.js`
- `features/search-while-watching/index.js`
- `features/video-insights/index.js`
- `features/return-dislike/index.js`
- `features/sponsorblock/index.js`
- `features/dearrow/index.js`
- `features/download-ui/index.js`
- `ytkit.js`

#### Resource set B

Used by: `chromium-store` chromium, `chromium-store` firefox.

Entry 1 match patterns:

- `https://*.youtube.com/*`
- `https://*.youtube-nocookie.com/*`
- `https://youtu.be/*`

Entry 1 resource paths:

- `icons/32.png`
- `assets/cat.gif`

Entry 2 match patterns:

- `https://*.youtube.com/*`
- `https://*.youtube-nocookie.com/*`
- `https://youtu.be/*`

Entry 2 resource paths:

- `runtime-core-loader.mjs`
- `core/browser-api.js`
- `core/injection-guard.js`
- `core/env.js`
- `core/storage.js`
- `core/styles.js`
- `core/settings-visual-system.js`
- `core/registry.js`
- `core/runtime-flags.js`
- `core/local-ai.js`
- `core/capability-probe.js`
- `core/selector-packs/appShell.js`
- `core/selector-packs/nav.js`
- `core/selector-packs/search.js`
- `core/selector-packs/searchResults.js`
- `core/selector-packs/subscriptions.js`
- `core/selector-packs/leftNav.js`
- `core/selector-packs/feed.js`
- `core/selector-packs/feedCard.js`
- `core/selector-packs/feedExperimentChips.js`
- `core/selector-packs/feedPlayables.js`
- `core/selector-packs/feedPrompt.js`
- `core/selector-packs/feedSponsored.js`
- `core/selector-packs/thumbnail.js`
- `core/selector-packs/shortsShelf.js`
- `core/selector-packs/watch.js`
- `core/selector-packs/relatedSidebar.js`
- `core/selector-packs/player.js`
- `core/selector-packs/mainVideo.js`
- `core/selector-packs/playerChrome.js`
- `core/selector-packs/playerSettings.js`
- `core/selector-packs/sidebar.js`
- `core/selector-packs/modals.js`
- `core/selector-packs/comments.js`
- `core/selector-packs/commentComposer.js`
- `core/selector-packs/engagementPanels.js`
- `core/selector-packs/transcriptPanel.js`
- `core/selector-packs/settingsOverlay.js`
- `core/selector-packs/profile.js`
- `core/selector-packs/notifications.js`
- `core/selector-packs/media.js`
- `core/selector-packs/liveChatFrame.js`
- `core/selector-packs/liveChat.js`
- `core/selector-packs/liveChatPlaceholder.js`
- `core/selectors.js`
- `core/trusted-html.js`
- `core/diagnostic-log.js`
- `core/external-api-health.js`
- `core/regex-safety.js`
- `core/predicate-sandbox.js`
- `core/video-type.js`
- `core/playability.js`
- `core/transcript-service.js`
- `core/transcript-index.js`
- `core/ai-summary-artifacts.js`
- `core/remote-list-scope.js`
- `core/persisted-domains.js`
- `core/settings-import-transaction.js`
- `core/storage-manager.js`
- `core/icons.js`
- `core/url.js`
- `core/text-metrics.js`
- `core/date-time.js`
- `core/failure-copy.js`
- `core/page.js`
- `core/navigation.js`
- `core/player.js`
- `core/settings-schema.js`
- `core/feature-lifecycle.js`
- `core/policy-profile.js`
- `core/settings-controller.js`
- `core/selector-health.js`
- `core/feature-health.js`
- `core/feature-disable-feed.js`
- `core/feature-bisect.js`
- `core/chapters.js`
- `core/csv.js`
- `core/dialog-guard.js`
- `core/zero-ad-dom.js`
- `core/element-zapper.js`
- `core/hide-attribution.js`
- `core/heatmap.js`
- `core/youtube-thumbnails.js`
- `core/feature-schedule.js`
- `core/companion-ports.js`
- `core/cookie-handoff.js`
- `core/data-flow.js`
- `core/toast.js`
- `core/toast-dom.js`
- `core/lifecycle-route-bridge.js`
- `features/element-zapper/index.js`
- `features/subtitles/index.js`
- `features/video-filters/index.js`
- `features/blue-light-filter/index.js`
- `features/theme-css/index.js`
- `features/wave-8-css/index.js`
- `features/home-subs-css/index.js`
- `features/chat-style-comments/index.js`
- `features/sticky-video/index.js`
- `features/sticky-chat/index.js`
- `features/video-hider/index.js`
- `features/video-notes/index.js`
- `features/replay-chat-density/index.js`
- `features/subscription-view/index.js`
- `features/subscription-groups/index.js`
- `features/digital-wellbeing/index.js`
- `features/settings-panel/index.js`
- `features/player-dock/index.js`
- `features/youtube-music-compat/index.js`
- `features/search-hygiene/index.js`
- `features/search-while-watching/index.js`
- `features/video-insights/index.js`
- `features/return-dislike/index.js`
- `features/sponsorblock/index.js`
- `features/dearrow/index.js`
- `ytkit.js`

<!-- END GENERATED REVIEWER RESOURCE INVENTORY -->
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
  page-driven message cannot escalate one user-selected origin into blanket web
  access. Generic proxy requests to dynamic hosts are anonymous GET/HEAD with
  no body; Cobalt POSTs use their own fixed message contract. Residual risk,
  accepted and documented: the denylist is literal-only,
  so a granted public hostname that later resolves to a private address is not
  re-checked at fetch time. Resolving at validation time would not fix this, DNS can change between the check and the request.
- GitHub-full is intentionally broader and should not be submitted as the public
  Chrome Web Store package.
- No `<all_urls>` host permission is requested.
- No `scripting.executeScript`, `tabs.executeScript`, or dynamic content-script
  registration call sites are present in `extension/`; `npm run check` enforces
  this through `scripts/check-firefox-injection.js`.
- No remote code is loaded. CSP keeps `script-src 'self'`; `npm run check`
  enforces the no-eval/no-string-timer rule.
