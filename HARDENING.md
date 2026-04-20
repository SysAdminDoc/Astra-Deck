# Astra Deck — Hardening Audit (v3.14.0 → v3.15.0)

Deep engineering audit of the Astra Deck MV3 extension (Chrome + Firefox) and
companion Tampermonkey userscript. Findings are split into **real issues**
(verified in code) and **false positives** (items that looked like bugs from
the outside but turned out to already be mitigated). The false-positive list
is retained deliberately — it documents existing invariants so future audits
don't re-raise the same noise.

Scope:

- `extension/ytkit.js` (~31,400 lines, ISOLATED world)
- `extension/background.js` (MV3 service worker / EXT_FETCH proxy)
- `extension/ytkit-main.js` (MAIN world bridge)
- `extension/popup.js`, `extension/options.js`
- `extension/core/` (env, storage, styles, url, page, navigation, player)
- `extension/manifest.json`, `extension/early.css`

---

## Real Issues (Addressed in v3.14.0)

### Critical

**C1 — ReDoS guard in video-title filter is incomplete**
`ytkit.js` `videoHider._processVideoElement()` parses a user-supplied regex
when `hideVideosKeywordFilter` starts with `/`. The current guard rejects
`(a+)+` (nested group quantifier) and `a*+` (stacked quantifier) but does
not catch alternation-wrapped quantifier stacks such as `(a|b+)+` or
`(foo|bar*)+`. A malicious paste into the filter textarea could stall video
grid rendering.

Fix: broaden the guard to reject any group whose body contains a quantifier
when the group itself is followed by `+`, `*`, `?`, or `{`.

**C3 — Profile import stamps current `_settingsVersion` without migrating**
`options.js:312 applySettingsVersion()` overwrites `_settingsVersion` on every
imported payload. A profile exported at schema v2 imported into a v3 build
bypasses the migration path entirely and silently skips new-default
initialization for added settings.

Fix: preserve the imported `_settingsVersion`, run the migration chain from
that version forward, and only stamp the current version after migration.

### Medium

**C4 — 19 empty `catch (_) {}` blocks in `ytkit.js`**
Empty catches are correct in many cases (e.g. sandbox iframe `contentWindow`
access) but the pattern makes it impossible to distinguish intentional
silence from accidental swallowing. No single site is a bug today; the
pattern as a whole is the issue.

Fix: every `catch (_) {}` either carries a `// reason:` comment explaining
why the silence is safe, or routes through `DebugManager.log()` so
diagnosticLog captures it.

### Low

**L1 — `chrome.downloads.show()` fired via `setTimeout(900)`**
`background.js:477` schedules the file-reveal 900 ms after the download
starts, but the MV3 service worker can be terminated in that window. On
large or slow downloads the reveal silently fails.

Fix: listen to `chrome.downloads.onChanged` for the `complete` state and
fire `show()` from the event.

**L2 — `storageQuotaLRU` not triggered when `diagnosticLog` is toggled off**
The LRU sweeper runs every 5 minutes; disabling diagnosticLog mid-session
leaves `_errors` in storage until the next sweep.

Fix: when `diagnosticLog` transitions to off, clear `_errors` and run a
single LRU pass.

---

## Infrastructure Additions (v3.14.0)

**`getSetting(key, default)`**
Null-safe reader over `appState.settings`. Replaces the scattered
`appState.settings.X || default` / `appState?.settings?.X ?? default` pattern
with a single choke point. Reduces the surface area for future settings-race
classes of bug.

**`selectorChain(selectors, { root, onMiss })`**
Tries each selector in order; returns the first matching element. If all
miss, calls `onMiss` (default: log once per session to `diagnosticLog`).
Adopted at the highest-churn YouTube DOM regions so drift is detected
without user reports.

Initial adoption sites:

- Chip cloud (`yt-chip-cloud-chip-renderer` → fallback chain)
- Related videos (`ytd-watch-next-secondary-results-renderer` → fallback)
- Macro-markers list (chapter extraction)

---

## False Positives — Already Mitigated

Documented so future audits don't re-raise these.

| Claim | Reality |
|-------|---------|
| Settings-init race: TIER 1 rAF runs before settings load | `await preloadExtensionState()` at `ytkit.js:364` completes before `main()` is called. `settingsManager.load()` is synchronous against the preloaded cache. |
| `DiagnosticLog.record()` crashes on early init | Guard `if (!appState?.settings) return;` exists at `ytkit.js:233`. |
| Theater-split `_chatWatcherObs` leaks on destroy | `destroy()` at `ytkit.js:7212` disconnects and nulls the observer. |
| Theater-split `_chatObs` local leaks | Scoped to a closure and cleared by a 10 s safety timeout at `ytkit.js:6454` plus cleanup at `ytkit.js:6423`. |
| Resume-playback `_saveInterval` orphans on SPA nav | `destroy()` at `ytkit.js:14944` clears the interval; `init()` at `ytkit.js:14935` guards against stacking. Same pattern at `ytkit.js:11818-11825` for watchProgress. |
| Video-hider click-listener stacking | `_processVideoElement()` early-returns if `.ytkit-video-hide-btn` already exists in the thumbnail (`ytkit.js:10284`), preventing duplicate listeners. |
| Options JSON textarea needs debounce | Import is file-based (`file.text()` at `options.js:691`), not a live textarea. |
| `apiRetryBackoff` doesn't retry on SW timeout | `extensionRequestAsync` rejects with `isTimeout` error (`ytkit.js:195`); `extensionRequestWithRetry` catches and retries (`ytkit.js:216-220`). |
| DeArrow `_pending` race on first concurrent call | `_pending: {}` is declared in the feature object at `ytkit.js:19181`, not lazy-initialized. |

---

## YouTube Platform Drift Watchlist — 2024/2025

Regions where YouTube has shipped visible DOM changes in the last 18 months.
These are where drift is most likely and where `selectorChain` protection is
most valuable.

1. **Masthead** — three class-rotation events in 2024-2025.
2. **Watch-next sidebar** — A/B tested carousel vs. stacked grid.
3. **Comments** — "Top comments" grouping introduced late 2025.
4. **Shorts reel renderer** — `ytd-reel-video-renderer` class churn.
5. **Player chrome** — "Cinematic lighting" overlay can conflict with
   `cinemaAmbientGlow`.
6. **Innertube client version** — already extracted dynamically; monitor
   for constant renames.

## MV3 Lifecycle Notes

- **Service worker keepalive**: MV3 terminates the SW after ~30 s idle.
  Long EXT_FETCH reads stream the body (keepalive), but TTFB pauses on
  cold endpoints can still kill it. `apiRetryBackoff` covers the retry
  case for features that care.
- **Long-running operations**: nothing in background.js currently holds
  state across SW restarts. All stateful work lives in the content script.

## Recommended Invariants

1. **Single cleanup path** — every `feature.init()` that creates an
   interval/timeout/observer/listener registers a matching teardown in
   `destroy()`. Audited: no feature in ytkit.js creates resources without
   a destroy path.
2. **`getSetting()` for all settings reads** (new in v3.14.0) — single
   null-safe choke point.
3. **`selectorChain()` for all high-churn DOM regions** (new in v3.14.0) —
   miss detection funnels into `diagnosticLog`.
4. **No silent catches without justification** — every `catch (_) {}`
   carries a `// reason:` comment or routes through `DebugManager.log()`.
5. **Profile import preserves `_settingsVersion`** — migration chain runs
   from the imported version forward, not from current.

## Release Plan

### v3.14.0 — Hardening Pass 4

- C1: Strengthened ReDoS guard
- C3: Migration-aware profile import
- C4: Empty catches routed through DebugManager or documented
- L1: `chrome.downloads.show` via `onChanged` event
- L2: `storageQuotaLRU` wired to `diagnosticLog` off toggle
- Infrastructure: `getSetting()` and `selectorChain()` helpers + adoption
  at 3 highest-churn regions

### Follow-ups (not shipped this release)

- ESLint custom rule flagging `catch (_) {}` without `// reason:`
- Feature-level init/destroy/init smoke tests for top 20 features
- `unlimitedStorage` permission decision (trade-off with store review)
- Firefox-specific `commands` shortcut remap (Firefox reserves
  `Ctrl+Shift+Y`)
- Broader `selectorChain` adoption across comments, masthead, player
  controls

---

## v3.15.0 — Hardening Pass 5 (repo-wide deep audit)

Pass 4 focused on the extension content script. Pass 5 expands to the
three surfaces it didn't cover: the Python Flask downloader, the
build/release pipeline, and the userscript build artifacts.

### New Real Issues (Addressed in v3.15.0)

#### Security — Astra Downloader

**S1 — DNS-rebinding vulnerability on the token-discovery path**
A webpage whose host is rebound to `127.0.0.1:9751` after load could send
a `fetch('/health')` with `X-MDL-Client: MediaDL`. The rebound request is
treated as same-origin by the browser, so the `Origin` header is omitted
— which the original handler treated as "no origin, return the token".
The token is local-machine IPC only, but disclosure enables the attacker
page to submit download requests and write files anywhere the server has
write access.

Fix: `before_request` hook rejects any request whose `Host` header isn't
`127.0.0.1`, `localhost`, or `::1` (with or without port). Browsers
always send the literal hostname the user navigated to in `Host`, so the
rebound request presents `Host: attacker.com` and is rejected with
`421 Misdirected Request`.

#### Reliability — Astra Downloader

**R1 — `_bootstrap()` swallowed every install failure**
The three pip strategies iterated through bare `except Exception`, so a
missing pip, blocked registry, or proxy error produced a cryptic
`ImportError: No module named 'PyQt6'` at line 43. No diagnostic for
the user.

Fix: typed exception handling — `FileNotFoundError` (no pip on PATH) short-
circuits; `CalledProcessError` preserves the exit code; other exceptions
preserve the class name. If all strategies fail, a pointed stderr message
lists the missing packages and the exact manual `pip install` command.

#### Link / Rebrand Hygiene

**H1 — 12 hardcoded `SysAdminDoc/YouTube-Kit` URLs**
The repo was renamed to `Astra-Deck` before v3.12.0 but several URLs
still pointed at the old path and relied on GitHub's redirect. The
repro-critical ones are userscript `@updateURL` / `@downloadURL` —
Tampermonkey and Violentmonkey cache these and update-check failures
when the redirect hiccuped meant stale userscripts in the wild.

Fix: migrated every non-archival reference — build-extension.js, sync-
userscript.js, both userscript headers, userscript runtime `INSTALLER_URL`
+ `INSTALLER_COMMAND` + GitHub link + nyan cat asset + installer .bat
emission, CONTRIBUTING.md, package-lock.json, the CI workflow artifact
name, and the repo-paths test.

#### CI Release Safety

**CI1 — Tag-version check only covered `manifest.json`**
A release could be tagged with a version that matched `manifest.json` but
disagreed with `ytkit.js` `YTKIT_VERSION` or the userscript `@version`,
shipping artifacts where internal version reporting disagreed with the
store listing.

Fix: workflow now verifies all four sources match the tag
(`manifest.json`, `extension/ytkit.js`, `YTKit.user.js`, `package.json`)
before artifacts are uploaded. Any drift fails the build with a specific
error pointing at which file is out of sync.

### New Test Coverage

- **Python** — 2 new tests: DNS rebinding rejection (3 attack hosts, 3
  legit hosts including IPv6), bootstrap failure stderr surfacing.
  Total: 15 pass.
- **JS** — 10 new tests in `tests/hardening.test.js` capturing v3.14.0
  invariants (ReDoS guard, profile-import migration, `selectorChain`
  helper + adoption, `getSetting`, `downloads.onChanged`, zero empty
  catches, `diagnosticLog` destroy clearing). Total: 47 pass.

### Residual Trust Boundaries (documented, not bugs)

- **`/download` endpoint** accepts a client-supplied `outputDir`. The
  extension is trusted; any authenticated request can create directories
  and drop files anywhere the server user has write access. This is the
  intentional trust model for the local helper. If the extension is
  ever compromised, this boundary becomes the attack surface — consider
  gating `outputDir` to a config-allowed list in a future pass.
- **Protocol handlers (`ytdl://`, `mediadl://`)** launch the installed
  executable with a URL argument. The URL is passed as a single argv
  element (no shell), so command injection is not possible, but the
  target exe receives attacker-controlled input and must defend itself.

### Follow-ups (Pass 6 candidates)

- `outputDir` allowlist for `/download` (see residual boundary above).
- Rate limiting on `/download` to prevent runaway queueing from a
  compromised extension (currently gated only by `MAX_CONCURRENT=3`).
- CORS preflight cache headers (`Access-Control-Max-Age`) to reduce
  round-trips.
- Werkzeug → Waitress / Hypercorn (production WSGI) — currently running
  werkzeug dev server, which is acceptable for localhost-only but
  noted in werkzeug's own docs as not production-grade.
- Userscript parity audit — ensure the standalone `YTKit.user.js` has
  v3.14.0 hardening ported (most fixes are in the extension build only).
