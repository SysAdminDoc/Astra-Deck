# Native-messaging token bootstrap

Status: **native-first bootstrap is implemented; legacy `/health` token echo is now gated.**

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

In `astra_downloader/astra_downloader.py`:

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

Coverage includes native framing tests, malformed-message tests, manifest-shape
tests, registry-write tests, downloader health token-suppression tests,
extension fallback tests, native-channel-required UI recovery tests, and
UI health-pill assertions.

## Remaining validation and retirement gates

1. **Chrome extension IDs.** Firefox uses the fixed Gecko ID by default. Chrome
   IDs must be configured through `NativeChromeExtensionIds` or
   `ASTRA_NATIVE_CHROME_EXTENSION_IDS` once the release/store IDs are known.
2. **Real browser validation.** Verify Chrome and Firefox can launch the
   registered native host from the packaged extension, receive the token over
   native messaging, and still detect the running HTTP service on the selected
   loopback port.
3. **Legacy default-off rollout.** After packaged Chrome/Firefox validation,
   set `LegacyHealthTokenEcho` false in the shipped companion defaults or
   installer-managed config, then remove the fallback branch after a compatibility
   window once legacy clients have migrated.
4. **Release packaging.** The companion setup path still requires both
   `AstraDownloader.exe` and `AstraDownloader.exe.sha256` on the GitHub release.
   Latest `v4.46.4` includes the EXE but is missing the hash sidecar.

Until the legacy branch is removed, native-capable clients get the stronger
browser-pinned token channel while controlled deployments can disable the
documented local-process residual risk with the gate above.
