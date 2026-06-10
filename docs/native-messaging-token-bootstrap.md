# Native-messaging token bootstrap

Status: **scaffolding landed; cutover requires on-device validation.**

## Problem

The extension and the local Astra Downloader companion authenticate requests
with a shared `ServerToken`. The extension discovers that token by calling the
companion's HTTP `/health` endpoint, which returns the token to a caller that
sends `X-MDL-Client: MediaDL` **and** either an allowlisted extension `Origin`
or **no Origin at all** (the background service-worker bootstrap path).

The "no Origin" branch is the weak point: **any local process** — not just our
extension — can open `http://127.0.0.1:9751/health` with that header and read
the token, then drive every authenticated endpoint (`/download`, `/update`,
…). The Host-header anti-rebind guard only stops *browsers* doing DNS
rebinding; it does nothing against a local non-browser process. So on a
multi-process machine the token is not a real secret, and the auth model that
`/download` and `/update` rely on is only as strong as "no other local code is
hostile."

Verified in `astra_downloader/test_astra_downloader.py`
(`test_health_token_is_not_exposed_to_null_origin_pages`): a no-Origin
`/health` request *intentionally* receives the token today.

## Why native messaging fixes it

Chrome/Firefox native messaging gives a **browser-pinned** channel:

- The native-host **manifest** lists `allowed_origins` — only the extension IDs
  named there may launch and talk to the host. Other local processes cannot.
- The browser launches the host and talks to it over a **private stdio pipe**
  that no other process can read.

So the token is delivered to *our* extension and nothing else — the property
`/health` cannot provide.

## What has landed (testable, behind a gate)

In `astra_downloader/astra_downloader.py`:

- `read_native_message` / `write_native_message` — Chrome's framing (4-byte
  little-endian length prefix + UTF-8 JSON), with a 1 MB bound.
- `handle_native_bootstrap_request(request, token)` — pure handler:
  `{"type":"get-token"}` → `{ok, service, api, token}`; `{"type":"ping"}` →
  identity only; anything else → `{ok:false}` with **no token**.
- `run_native_messaging_host(token, stdin, stdout)` — serve until EOF.
- `argv_requests_native_host(argv)` — the browser launches a host with the
  calling extension origin as a positional argv (`chrome-extension://<id>/`),
  which normal launches and the test suite never carry, so the gate cannot
  misfire.
- `build_native_host_manifest(exe_path, extension_ids)` — emits the host
  manifest with `allowed_origins` pinned to the given IDs.
- `main()` runs the host and exits when `argv_requests_native_host(sys.argv)`,
  before any GUI/Flask logic.

Covered by `NativeMessagingBootstrapTests` (framing round-trip, oversized-length
rejection, token-only-for-get-token, malformed-request rejection,
unconfigured-token withholding, run-to-EOF, the argv gate, and origin pinning).

This changes **no runtime behavior** today: nothing launches the host until the
manifest is registered (below), and the HTTP `/health` bootstrap is untouched.

## Remaining cutover (needs a real browser + OS — not validatable in CI)

1. **Register the host manifest.**
   - Windows: write `build_native_host_manifest(exe, [<ext-id>])` to a JSON
     file and set
     `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.astra.deck.downloader`
     (and the Chromium/Edge equivalents) to its path. Firefox uses
     `HKCU\Software\Mozilla\NativeMessagingHosts\…` and `allowed_extensions`
     (the gecko ID) instead of `allowed_origins`.
   - Do this from the existing installer / `ensure_system_integrations`
     path, and remove it on `--uninstall`.
2. **Extension manifest:** add `"nativeMessaging"` to `permissions`. This is a
   new store-reviewed permission, so update `docs/store-permission-rationale.md`
   and the manifest-permission hardening tests, and gate it to the GitHub-full
   profile if store-safe should not ship the companion integration.
3. **Extension bootstrap:** replace the `fetch('http://127.0.0.1:…/health')`
   token discovery with `chrome.runtime.connectNative('com.astra.deck.downloader')`
   → send `{type:'get-token'}` → cache the returned token. Keep the HTTP health
   *probe* (is the server up? which port?) but stop trusting `/health` for the
   token.
4. **Companion `/health`:** once the extension no longer needs the token over
   HTTP, drop the token from the `/health` response entirely (remove the
   `not origin` disclosure branch and its test), closing the local-process
   leak for good.
5. **Extension-ID pinning:** `allowed_origins` needs the *published* extension
   IDs. Unpacked/dev installs have a different ID derived from the key, so the
   registration step must accept the running extension's ID (or ship the known
   release IDs) — coordinate with the signing/release flow.

Until 1–5 are done on-device, the native host is dormant and the documented
HTTP residual risk stands (see `the project notes` and the cookie/SSRF threat model).
