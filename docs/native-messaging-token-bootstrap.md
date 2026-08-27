# Native-messaging token bootstrap

Status: **native-first bootstrap, paired-origin token recovery, and a versioned
authenticated-cookie capability with endpoint proof are implemented; legacy
`/health` token echo is gated.**

## Problem

The extension and the local Astra Downloader companion authenticate requests
with a shared `ServerToken`. Legacy clients discover that token by calling the
companion's HTTP `/health` endpoint with `X-MDL-Client: MediaDL`.

That legacy path is weaker than a browser-pinned channel because any local
process can reach loopback if it knows the header and port. The Host-header
anti-rebind guard blocks hostile web pages, but it does not turn the token into
a secret from other local processes.

## Native channel

Chrome and Firefox native messaging give the extension a browser-pinned token
channel:

- The native-host manifest lists allowed extension identities.
- The browser launches the host and talks over a private stdio pipe.
- Other local processes cannot launch the host through the browser grant.

## Implemented state

In the companion (SysAdminDoc/AstraDownloader, `astra_downloader.py`):

- `read_native_message` and `write_native_message` implement Chrome's 4-byte
  little-endian length framing with a 1 MB bound.
- `handle_native_bootstrap_request(request, token)` returns the token only for
  `{ "type": "get-token" }`, supports `{ "type": "ping" }`, and withholds the
  token for malformed or unsupported requests.
- `run_native_messaging_host(token, stdin, stdout)` serves requests until EOF.
- `argv_requests_native_host(argv)` gates native-host mode before GUI or Flask
  startup.
- `build_native_host_manifest(exe_path, extension_ids, browser)` emits Chrome
  `allowed_origins` or Firefox `allowed_extensions`.
- `register_native_messaging_hosts(target, base_args, config)` writes Chrome
  and Firefox host manifests under `%LOCALAPPDATA%\AstraDownloader\native-hosts`
  and registers the HKCU native-host registry values when the companion is
  running as an installed EXE.
- `ensure_system_integrations()` invokes native-host registration on matching
  version launches so configured extension IDs are repaired without a full
  reinstall.

In the extension:

- `extension/manifest.json` includes the `nativeMessaging` permission.
- `extension/background.js` handles `NATIVE_MSG_GET_TOKEN` with
  `chrome.runtime.connectNative('com.astra.deck.downloader')`, a timeout, and
  duplicate-response guards.
- `extension/features/download-ui/index.js` requests the native token before
  probing `/health`, sends `X-MDL-Token-Source: native` when native bootstrap
  succeeds, records `tokenSource: native|legacy-health`, and shows a
  `native-channel-required` recovery state when the companion no longer echoes
  a token over `/health`.
- `/health` suppresses `token` when the request declares
  `X-MDL-Token-Source: native`. The `LegacyHealthTokenEcho` config key and
  `ASTRA_LEGACY_HEALTH_TOKEN_ECHO=0` environment switch can suppress legacy
  token echo for all non-native callers, in which case `/health` reports
  `legacyTokenEcho: false` and `nativeChannelRequired: true`.

## Paired-origin token recovery (companion 2.13.0)

Shipping `LegacyHealthTokenEcho` false while Chrome and Edge still had no
registered native host left those browsers with no way to obtain a token at
all. Pairing wrote the extension ID and registered the host, and then `/health`
still refused the token because the origin had not been blessed by the legacy
switch, so the panel reported "Astra Downloader is not running" against a
companion that was running and answering.

`/health` now returns the token to any origin that completed `/pair-extension`,
independently of `LegacyHealthTokenEcho`, and reports `paired: true` with
`nativeChannelRequired: false`. This widens nothing. Pairing already writes the
ID into the native-host allowlist, so the same extension can read the same
token over the native channel; recognizing the paired origin only removes the
requirement that native messaging be reachable, which unpacked installs and
managed machines routinely break. An origin that has not paired still receives
no token, and a probe carrying `X-MDL-Token-Source: native` still receives no
echo.

Chrome only. A Firefox origin host is a per-profile UUID with no relationship
to the configured Gecko ID, so a `moz-extension` origin can never be matched
against `NativeFirefoxExtensionIds`.

On the extension side, `MediaDLManager._checkImpl` re-reads `/health`
immediately after a successful pair. Without that re-read the token the pair
had just authorized went unread until the next 30 second check, so the first
download after an install failed even though pairing had succeeded.

## Authenticated-cookie capability (protocol v1)

The bearer token and cookie grant are deliberately separate. A normal
`NATIVE_MSG_GET_TOKEN` request preserves token-bootstrap compatibility but does
not authorize cookie access. For a user-started authenticated download:

1. The top-level YouTube content runtime requests `NATIVE_MSG_GET_TOKEN` with
   `purpose: "cookie-handoff"` immediately before the download request.
2. The native host must return a non-empty token plus exact
   `service: "astra-downloader"` and integer `api: 2` or newer. Legacy native
   responses and HTTP `/health` tokens receive no cookie capability.
2a. **Endpoint proof (companion `api: 3` and newer).** A native token proves a
   native host is registered. It says nothing about which program is listening
   on the port the cookies are about to be posted to, and anything local can
   bind a companion port and answer `/health`. So the extension generates one
   random 32-hex challenge per attempt, sends it to the native host, and sends
   the same challenge to `GET /identity`. Both sides answer
   `HMAC-SHA256(ServerToken, challenge)` as 64 hex characters, and the cookies
   are released only when the two answers match. The answer proves possession
   of the token without putting the token on the wire, which is why `/identity`
   is safe to serve unauthenticated. A companion below `api: 3` cannot answer,
   so the handoff fails closed for cookies and only for cookies: the download
   still runs, without a signed-in session.
3. `background.js` creates a cryptographically random capability that expires
   after 20 seconds and is bound to the sender's tab, top frame, document ID
   when available, and Firefox cookie-store ID when available. Reissuing proof
   revokes the document's prior grant.
4. `YTKIT_COOKIE_HANDOFF` consumes the grant before calling the asynchronous
   cookies API. Wrong-context, wrong-version, expired, and replayed grants fail
   without reading cookies.
5. `core/cookie-handoff.js` queries only `.youtube.com` and releases only
   secure root-path `LOGIN_INFO`, `SAPISID`, `__Secure-1PAPISID`, and
   `__Secure-3PAPISID` values of at most 4,096 UTF-8 bytes each. A complete
   result requires `LOGIN_INFO` plus at least one SAPISID variant.

The content runtime sends the already-filtered set to the loopback companion,
shows a localized notice before the installation's first cookie-bearing
request, and records only protocol/count/byte diagnostics. Cookie names,
values, and capability tokens are excluded from diagnostics.

Coverage includes native framing tests, malformed-message tests, manifest-shape
tests, registry-write tests, downloader health token-suppression tests,
extension fallback tests, native-channel-required UI recovery tests, forged and
cross-document cookie grants, one-use replay rejection, cookie contract
filtering, redacted diagnostics, and UI health-pill assertions.

## Remaining validation and retirement gates

1. **Chrome extension IDs.** Firefox uses the fixed Gecko ID by default.
   Chrome and Edge pair automatically: Astra Deck posts its `chrome.runtime.id`
   to the companion's loopback `/pair-extension` route, which writes
   `NativeChromeExtensionIds` and refreshes the native-host manifest. Manual
   entry on the Browser extension page remains as a fallback. Store-profile
   artifacts that omit `nativeMessaging` still cannot use this channel.
2. **Real browser validation.** Verify Chrome and Firefox can launch the
   registered native host from the packaged extension, receive the token over
   native messaging, and still detect the running HTTP service on the selected
   loopback port.
3. **Legacy default-off rollout.** Done, and it is the reason companion 2.13.0
   exists. `LegacyHealthTokenEcho` shipped false before the packaged
   Chrome/Edge native path in gate 2 had actually been validated, which left
   those browsers with no token path at all. Paired-origin recovery above is
   what makes the default-off posture survivable, so do not remove it with the
   legacy branch. When the legacy branch does go, `LegacyHealthTokenEcho` and
   `LegacyHealthTokenOrigins` retire with it; the paired-origin path and the
   native channel are what remain.
4. **Release packaging.** The companion setup path requires both
   `AstraDownloader.exe` and `AstraDownloader.exe.sha256`, and since the split
   (a6bb685f) they ship from the companion's own repository,
   SysAdminDoc/AstraDownloader, check `gh release view --repo
   SysAdminDoc/AstraDownloader --json assets` for the live state. Astra Deck
   releases must NOT carry that pair: `npm run release:readiness` fails on it
   (`companion-not-republished` / `companion-not-manifested`).

Until the legacy branch is removed, native-capable clients get the stronger
browser-pinned token channel while controlled deployments can disable the
documented local-process residual risk with the gate above.
