# yt-dlp Cookie Threat Model

Last reviewed: 2026-06-04.

This document covers how Astra Deck moves YouTube cookies from the browser
extension into the local Astra Downloader companion for authenticated yt-dlp
downloads. It is the store-review and maintainer-facing explanation for the
`cookies` permission and for the companion's cookie jar lifecycle.

## Source References

- yt-dlp advisory GHSA-v8mc-9377-rwjj / CVE-2023-35934:
  https://github.com/yt-dlp/yt-dlp/security/advisories/GHSA-v8mc-9377-rwjj
- yt-dlp 2023.07.06 release note for the cookie-leak fix:
  https://github.com/yt-dlp/yt-dlp/releases/tag/2023.07.06
- NVD CVE-2023-35934 record:
  https://nvd.nist.gov/vuln/detail/CVE-2023-35934

## Current Implementation

1. The extension requests cookies only through `extension/background.js`.
   `ALLOWED_COOKIE_DOMAINS` is limited to YouTube and YouTube-nocookie domains.
2. `extension/ytkit.js` requests `.youtube.com` cookies only when the user starts
   an explicit local download. It maps Chrome cookie objects to the companion
   payload and normalizes session-cookie expiry to `0`.
3. The companion `/download` handler accepts only reviewed request fields,
   caps the body at 1 MB, and truncates the `cookies` array to 200 entries.
4. `write_cookies_netscape()` writes a per-download `.cookies.{id}.txt` file in
   Netscape cookies.txt format for yt-dlp's `--cookies` flag. It strips control
   characters, rejects malformed entries, writes atomically, and best-effort
   chmods the jar to `0600`.
5. `DownloadManager._run_download()` passes the jar with `--cookies <path>`.
   It does not accept client-supplied yt-dlp argv, `--add-header Cookie:`, or
   `--load-info-json`.
6. The download `finally` block deletes the jar after yt-dlp exits. A startup
   sweep removes stale `.cookies.*.txt` files older than 300 seconds after a
   crash or forced process kill.

The CI package surface also pins `yt-dlp==2026.3.17` in
`astra_downloader/requirements.txt`, far newer than the 2023.07.06 patched
baseline for CVE-2023-35934.

## Threats And Controls

| Threat | Control |
| --- | --- |
| Cross-host redirect or fragmented-media cookie leak from CVE-2023-35934. | Astra uses a yt-dlp release newer than 2023.07.06 and passes cookies via `--cookies`, letting yt-dlp preserve cookie scope instead of injecting a raw `Cookie` header. |
| A compromised extension context tries to send arbitrary yt-dlp flags. | `/download` rejects client-supplied yt-dlp argv/flag fields before cookie writing or queueing; the server builds argv from reviewed config only. |
| A compromised extension context sends a huge cookie payload. | `/download` enforces the 1 MB request cap and truncates cookie lists to 200 entries before writing a jar. |
| Cookie jar persists after a successful or failed download. | The jar is per-download and deleted in the download `finally` block. |
| Cookie jar persists after a crash or taskkill. | `cleanup_stale_cookie_jars()` removes `.cookies.*.txt` files older than 300 seconds on server start. |
| Cookie jar is readable by other local users. | `write_cookies_netscape()` best-effort chmods the file to `0600`; Windows ACL inheritance still depends on the user's profile directory. |
| YouTube cookies leak to third-party APIs. | Background fetch policy sends credentials only to YouTube/nocookie and local companion origins; SponsorBlock, DeArrow, RYD, Reddit, AI providers, and Cobalt use credentialless requests. |
| DNS rebinding or localhost aliasing reaches another local service. | Extension and companion use literal `127.0.0.1` loopback ports, not `localhost`; the companion also validates Host headers. |

## Store-Review Copy

The `cookies` permission is used only for explicit, user-started YouTube
downloads. Astra Deck reads YouTube cookies so yt-dlp can download media the
signed-in user can already view, writes them to a temporary per-download local
cookie jar, passes that jar to yt-dlp with `--cookies`, then deletes it when the
download exits. Cookies are never sent to Astra Deck infrastructure.

## Residual Risk

- Any authenticated download tool that uses browser cookies can expose account
  session material to the local machine account running it. Astra reduces dwell
  time and scope but cannot make local malware safe.
- yt-dlp's redirect and fragment handling remains a dependency. The mitigation
  is to keep yt-dlp on or above patched releases through the exact-pinned smoke
  workflow and the visible `/update-ytdlp` action.
- The companion accepts YouTube cookies from the extension after bearer-token
  authentication; if the extension context is compromised, the cookie bridge is
  a sensitive path. The server-side argv allowlist and cookie caps limit blast
  radius but do not remove the need to trust the installed extension build.
