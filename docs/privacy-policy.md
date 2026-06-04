# Astra Deck Privacy Policy

Last updated: 2026-06-04

Astra Deck is a local-first browser extension and companion workflow for
YouTube. It improves playback, layout, comments, transcripts, notes, exports,
and explicit user-started download handoff. Astra Deck does not run ads, sell
data, broker data, inject affiliate tracking, or collect telemetry.

Summary: No telemetry. No advertising. No sale of data.

## Data Astra Deck Stores Locally

Astra Deck stores data in the user's browser profile or, for the optional local
companion, on the user's machine:

- Settings, feature flags, safe-store/GitHub-full profile choice, and UI state.
- Hidden-video lists, blocked channels, allowed restored videos, subscription
  groups, dead-channel staging records, and per-channel preferences.
- Watch progress, watch-time summaries, timestamp bookmarks, video notes,
  transcript index data, SponsorBlock/DeArrow/RYD caches, and thumbnail/cache
  metadata.
- Local diagnostic ring-buffer entries and selector-health snapshots used for
  user-downloaded support bundles.
- Astra Downloader local configuration, download history, logs, and temporary
  per-download cookie jars.

This data stays local unless the user manually exports it, downloads a support
bundle, or enables a feature that sends page/video context to a documented
external service.

## Chrome Web Store Data Categories

| Chrome category | Astra Deck use |
| --- | --- |
| Authentication information | YouTube cookies can be read only when the user starts an authenticated local download flow. Cookies are handed to Astra Downloader on `127.0.0.1` and are not sent to Astra Deck servers. |
| Personal communications | Not collected. |
| Financial information | Not collected. |
| Health information | Not collected. |
| Location | Not collected. |
| Web history | YouTube page URLs, video IDs, channel/page context, and watch-progress state are used for YouTube-only features. |
| User activity | Settings changes, watch progress, export/download actions, hidden videos, notes, subscription group state, and panel interactions are stored locally for user-visible features. |
| Website content | Astra Deck reads YouTube page text, titles, thumbnails, comments, captions/transcripts, video metadata, links, request/response data needed by enabled features, and YouTube cookies for local download handoff. |

## Data Transmissions

Store-safe builds can contact these origins for user-visible features:

| Destination | Data sent | When |
| --- | --- | --- |
| YouTube / YouTube-nocookie / youtu.be / i.ytimg.com | YouTube page requests, video IDs, caption/thumbnail requests, and page context needed by YouTube features. | When the extension runs on YouTube pages or the user uses transcript/thumbnail features. |
| SponsorBlock / DeArrow (`sponsor.ajay.app`) | Video IDs and feature requests for sponsor segments, titles, and thumbnails. | Only when SponsorBlock or DeArrow features are enabled. |
| Return YouTube Dislike | Video IDs for estimated dislike counts. | Only when RYD features are enabled. |
| Reddit | YouTube video URL or search context for Reddit discussion lookup. | Only when the Reddit discussion panel is enabled. |

GitHub-full builds can additionally contact these destinations when the user
explicitly chooses the broader profile and enables the relevant feature:

| Destination | Data sent | When |
| --- | --- | --- |
| OpenAI, Anthropic, Gemini, or user-configured AI endpoint | User-selected transcript/video context and the user's own API key or configured endpoint. | Only for opt-in BYO-key AI summary features. |
| Local Ollama (`127.0.0.1:11434`) | Transcript/video context for local summarization. | Only when the local AI feature is enabled and Ollama is running locally. |
| Astra Downloader (`127.0.0.1:9751-9851`) | Download request metadata, selected format/quality, health/history requests, and YouTube cookies for authenticated downloads. | Only for explicit local downloader actions or enabled download panels. |
| Cobalt API | Video URL/context for fallback downloads. | Only when GitHub-full Cobalt fallback is enabled and Astra Downloader is offline. |

Astra Deck does not send extension telemetry, analytics, crash reports, hidden
lists, notes, settings profiles, or diagnostic bundles to Astra Deck servers.
There are no Astra Deck servers.

## Cookies

Astra Deck uses the `cookies` permission only for YouTube-family cookies needed
by explicit authenticated download handoff. Cookies are sent to the local Astra
Downloader companion on `127.0.0.1`, written to per-download cookie jars, used by
yt-dlp for that download, and cleaned up afterward. Astra Deck does not send
YouTube cookies to remote AI providers, SponsorBlock, DeArrow, RYD, Reddit, or
Cobalt.

## Retention, Export, And Delete

Local browser data remains until the user changes settings, resets Astra Deck,
clears browser extension storage, uninstalls the extension, or triggers a
feature-specific cleanup. Large local stores are bounded by LRU caps. Diagnostic
logs are capped and are exported only when the user downloads a support bundle.

Users can export settings, notes, study/work data, transcripts, thumbnails, and
diagnostics from the extension UI where those features expose export controls.
Users can delete local data by using reset/clear controls in Astra Deck, clearing
extension storage in the browser, deleting Astra Downloader's local app data, or
uninstalling the extension/companion.

## Limited Use, Ads, And Sale

Astra Deck's use and transfer of information received from Google APIs adheres
to the Chrome Web Store User Data Policy, including Limited Use requirements.

Astra Deck uses user data only to provide or improve its single YouTube
workstation purpose. Astra Deck does not sell user data, transfer user data to
advertising platforms or data brokers, use user data for personalized ads, or
allow humans to read user data except when the user explicitly provides a
support bundle or other data for support.

## Firefox Data Collection Permissions

Firefox builds require Firefox 140+ and use Firefox's built-in data collection
and transmission consent prompt. The generated Firefox manifest declares these
required data categories:

- `browsingActivity`
- `websiteContent`
- `websiteActivity`
- `authenticationInfo`

`technicalAndInteraction` is not declared because Astra Deck does not transmit
telemetry, product metrics, crash reports, or diagnostic bundles automatically.

## Contact

Use GitHub issues on the Astra Deck repository for privacy questions, data
handling questions, or removal requests tied to repository-hosted content.
