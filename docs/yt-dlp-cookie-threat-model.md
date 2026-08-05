# yt-dlp Cookie Threat Model

Last reviewed: 2026-08-05.

This document covers how Astra Deck moves YouTube cookies from the browser
extension into the local Astra Downloader companion for authenticated yt-dlp
downloads. It is the store-review and maintainer-facing explanation for the
`cookies` permission and for the companion's cookie jar lifecycle.

Companion v1.8.0 downloads from any public site yt-dlp supports, not only
YouTube. The extension's cookie bridge did not widen with it: that jar is still
built solely from `ALLOWED_COOKIE_DOMAINS` (YouTube/Google) and is attached
only to YouTube extractions. The SSRF control that the old YouTube-only URL
allowlist provided is preserved as an explicit private-network denylist — see
the threats table.

Companion v1.9.0 adds a second, separate cookie path: **site sign-ins**, a
durable per-site store the user populates deliberately (`SiteLoginStore`, one
jar per registrable domain under `%LOCALAPPDATA%\AstraDownloader\site-logins`).
It exists because sites other than YouTube serve media only to a signed-in
session and the extension bridge cannot reach them. Its scoping rules are
described below and are what keep it from becoming a general cookie dump.

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
4. `write_cookies_netscape()` creates a per-download `.cookies.{id}.txt` file in
   Netscape cookies.txt format for yt-dlp's `--cookies` flag. It strips control
   characters, rejects malformed entries, creates an empty temporary file,
   applies an owner-only ACL before writing any cookie bytes, verifies that
   inherited ACEs are gone, and then atomically renames the protected file into
   place. On Windows the ACL is applied and verified with `icacls
   /inheritance:r /grant:r <current-user>:F`; POSIX platforms use and verify
   mode `0600`. If the protection step fails, the temporary file is deleted and
   the download stops with the classified `cookie-jar-failed` error.
5. `DownloadManager._run_download()` passes the jar with `--cookies <path>`,
   and only when the target URL is a YouTube URL (`is_youtube_url`). Companion
   v1.8.0 downloads from any public site, so this scoping keeps a YouTube jar
   off every other extractor — `--cookies` is also a write path, and yt-dlp
   would otherwise persist a third-party site's session into a YouTube jar.
   The handler does not accept client-supplied yt-dlp argv,
   `--add-header Cookie:`, or `--load-info-json`.
6. The download `finally` block deletes the jar after yt-dlp exits. A startup
   sweep removes stale `.cookies.*.txt` files older than 300 seconds after a
   crash or forced process kill.

The CI package surface also pins `yt-dlp==2026.6.9` in
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
| Cookie jar is readable by other local users. | The writer creates an empty file, removes inherited Windows ACEs with `icacls /inheritance:r`, grants full control only to the current account, verifies the resulting ACL has no inherited entries, and only then writes cookie bytes. POSIX platforms require verified mode `0600`; ACL failure aborts the download. |
| YouTube cookies leak to third-party APIs. | Background fetch policy sends credentials only to YouTube/nocookie and local companion origins; SponsorBlock, DeArrow, RYD, Reddit, AI providers, and Cobalt use credentialless requests. |
| DNS rebinding or localhost aliasing reaches another local service. | Extension and companion use literal `127.0.0.1` loopback ports, not `localhost`; the companion also validates Host headers. |
| A token holder aims the downloader (and its cookie jar) at a LAN service or the cloud-metadata endpoint. | v1.8.0 replaced the YouTube-only URL allowlist with `media_url_block_reason()`: `/download`, `/formats`, `/playlist`, and `DownloadManagerCore.start_download()` reject loopback, private, link-local, reserved, multicast, single-label, `.local`/`.internal`/`.lan`, credential-bearing, and non-public-TLD targets before yt-dlp is spawned. Cookies are additionally YouTube-scoped (row above). |
| An imported browser export carries every site's cookies, not just the one being signed in to. | `SiteLoginStore` filters records to the target registrable domain three times over — at import, when the protected jar is written (`write_cookies_netscape(domain_filter=…)`), and again when the per-download copy is exported. `cookie_domain_in_site()` matches exactly or on a leading dot, so `notx.com` / `x.com.evil.net` never match `x.com`. The import result reports how many foreign cookies were discarded. |
| The full-browser jar produced while reading a browser's cookie store leaks. | `import_site_login_from_browser()` writes yt-dlp's `--cookies` output to a staging file inside the install dir, filters it, and deletes it in a `finally` — it never outlives the call and is never the file handed to a download. |
| A stored sign-in is sent to a site it does not belong to. | `Download.cookies_scope` records the site each jar was built for and `_cookie_jar_matches_target()` gates the `--cookies` flag, so a request pairing one site's URL with another site's cookies sends nothing. Verified by a mutation test: removing the gate fails the suite. |
| Stored cookie values are read back out through the local API or UI. | `/site-logins` GET, `SiteLoginStore.entries()`, the Sign-ins page, the log, and the diagnostics bundle expose only site, source, count, and expiry. There is no read path for names or values. |
| Two downloads for one site corrupt the stored session, or a CDN redirect appends foreign domains to it. | yt-dlp saves the jar back when it exits, so downloads always receive a per-download copy (`export_jar_for()`); the stored file is read-only from the download path's perspective. |
| A profile name smuggles yt-dlp cookie-source syntax (`chrome:profile+keyring`). | `build_browser_cookie_args()` rejects `:`, `+`, and `"` in profile names and accepts only the known browser list; an unknown browser never reaches a process spawn. |
| The store grows without bound or a site key escapes the store directory. | 50 sites, 400 cookies per site, 1 MB per import; `site_login_key()` reduces any input to a sanitized registrable domain (`../../etc/passwd` → empty, refused). |
| A public hostname resolves to a private address (DNS rebinding against the URL policy). | Not fully mitigated. The policy is literal-only by design — resolving at validation time proves nothing about resolution a millisecond later — so a name pointed at RFC1918 space still reaches yt-dlp. Residual risk is bounded by the loopback-only listener, the bearer token, and the YouTube-only cookie scope: no session credential accompanies the request. |

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
