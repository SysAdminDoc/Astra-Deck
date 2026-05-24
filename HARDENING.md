# Astra Deck — Hardening Audit (v3.14.0 → v4.46.0)

> Cumulative hardening log. H1–H19 covered v3.20.x audit passes (Passes 7–18).
> H20 onward covers v3.23.0 (Pass 19). H25 covers v4.46.0 (extreme audit pass).

## H25 — Extreme audit cut (v4.46.0)

**Scope.** Deep audit of the three production-critical surfaces — the
extension service worker, the toolbar popup, and the Python Astra
Downloader companion — for hidden failure modes that an aggressive
senior-engineer review would flag before approval. Three real defensive
gaps closed; deep reads of four core modules turned up no actionable
issues at the current quality bar.

**Issues fixed.**

- **SW reveal-set cap bypass on hydration.** The in-memory
  `_pendingReveals` Set is cap-enforced at runtime via `_addPendingReveal`
  (defends against runaway growth if a flood of "show in folder"
  downloads stalls in a non-terminal state). The `_pendingRevealsReady`
  IIFE that hydrates from `chrome.storage.session` on SW cold-start was
  NOT cap-enforced — it iterated the persisted id list and called
  `.add(id)` directly. A corrupted / pre-cap-era / partial-write
  session-storage payload would re-introduce the runaway-growth class
  of bug the cap was added to prevent. Hydration now slices from the
  tail (`Math.max(0, ids.length - PENDING_REVEALS_CAP)`) and validates
  each entry is `typeof === 'number'`.
- **SW silent fallthrough on unknown message types.** The
  `chrome.runtime.onMessage` listener returned implicitly when none of
  the typed branches matched, leaving the caller's `sendMessage`
  Promise to reject with the unhelpful *"The message port closed
  before a response was received."* An in-extension typo
  (`EXT_FECTH` vs `EXT_FETCH`) was therefore much harder to diagnose
  than it should be. Listener now responds explicitly with
  `{ error: 'Unknown message type: <type>' }`.
- **Popup export anchor fallback Firefox safety.** The
  `chrome.downloads.download` path is always taken in production (the
  `downloads` permission is in the manifest), so the legacy anchor
  fallback only runs in degraded environments. Even so, the anchor was
  created via `Object.assign(document.createElement('a'), …)` and
  `.click()`-ed without being appended to the DOM — historically a
  no-op on Firefox. Anchor is now appended to `document.body`,
  clicked, and `.remove()`-d in a `try / finally` so the DOM stays
  clean.
- **Python test suite deprecation noise.** Every
  `python -m pytest astra_downloader` run printed a
  `PytestDeprecationWarning` about an unset
  `asyncio_default_fixture_loop_scope`. Pinned the value to `function`
  (the upcoming pytest-asyncio 1.0 default) in `pytest.ini` so the
  suite output is clean.

**Regression pins.** Four new `tests/hardening.test.js` blocks under
the `v4.46.0` banner:

- *background.js hydration respects PENDING_REVEALS_CAP* — asserts the
  `Math.max(0, ids.length - PENDING_REVEALS_CAP)` clamp + the
  `typeof ids[i] === 'number'` validation are both present in the
  hydration IIFE.
- *background.js returns an explicit error for unknown message types* —
  asserts the `Unknown message type:` string is present and the
  fallthrough returns `false` (no async work left).
- *popup.js export anchor fallback is attached to the document* —
  asserts the fallback path appends to `document.body` and removes
  after click.
- *pytest.ini pins asyncio_default_fixture_loop_scope* — asserts the
  ini file carries `asyncio_default_fixture_loop_scope = function`.

**Files audited but not changed.** Read deeply during this pass with
no actionable issues found at the current quality bar:

- `extension/core/trusted-html.js` — TrustedTypes policy is correctly
  name-scoped + falls back gracefully when `trustedTypes.createPolicy`
  throws (collision with another policy on the same page).
- `extension/core/storage-manager.js` — debounce + dirty-set + echo
  dedupe invariants hold under all observable interleavings of
  `set` / `_flush` / `beforeunload`.
- `extension/core/predicate-sandbox.js` — Option-C AST evaluator that
  explicitly rejects `eval`, `Function`, `with`, and arbitrary method
  calls. The allowlist (`includes` / `startsWith` / `endsWith` /
  `match` / `test`) and ReDoS guard cover the documented surface.
- `astra_downloader/astra_downloader.py` cookie/path/URL normalisers —
  `normalize_url` rejects non-http(s) and whitespace-bearing URLs;
  `normalize_output_dir` resolves + confines under `allowed_roots`
  before `mkdir`; `_sanitize_cookie_field` strips control + tab + CR +
  LF before emitting Netscape format; `ps_single_quote` correctly
  escapes the only PowerShell single-quote literal escape sequence.

**Verified for v4.46.0.** `npm test` (519/519, +4 new), `npm run check`
(lint + a11y + WCAG-AA contrast + i18n + version + syntax all green),
`python -m pytest astra_downloader` (82/82, no warnings),
`npm audit --omit=dev` (0 vulns), and the four-artifact build path
(Chrome ZIP/CRX, Firefox ZIP/XPI).

---

## H24 — Extreme audit hardening cut (v4.5.2)

**Scope.** Repo-wide production-readiness pass over extension permissions,
popup diagnostics/accessibility, release validation, and Astra Downloader
cleanup/test reliability.

**Issues fixed.**

- **Loopback trust boundary mismatch.** The background local-bridge
  allowlist had already rejected `localhost` aliases, but the manifest
  still requested wildcard `http://localhost:*` host permissions. Removed
  those host permissions and pinned the manifest to `127.0.0.1` loopback
  origins only.
- **Popup diagnostic HTML sink.** Selector-health metrics were assembled
  with `template.innerHTML` even though the values were diagnostic text.
  Rendering now uses DOM nodes and textContent.
- **A11y audit false green.** The popup accessibility audit could print a
  missing focus-visible selector while returning success. The script now
  parses actual popup buttons and fails on missing button labels,
  `role="switch"` focus-visible coverage, dialog semantics, and keyboard
  handlers.
- **Validation drift.** Syntax checking was a stale hardcoded list and
  omitted newer extracted modules. It now recursively checks JavaScript in
  `extension/` and `scripts/`, plus root build scripts. Version checks now
  include `package-lock.json`, and the build bump path updates the lockfile.
- **Downloader pytest import race.** `pytest-qt` could import PySide6 before
  app code imported PyQt6, failing collection with a Qt DLL mismatch.
  `pytest.ini` pins `qt_api = pyqt6`.
- **Frozen uninstall shell deletion.** Delayed install-dir cleanup used a
  string-built shell command. It now validates the install-dir shape and
  passes the literal path as a PowerShell argument to `Remove-Item`.

**Regression pins.** `tests/hardening.test.js` covers the manifest
permission boundary, popup DOM metric rendering, recursive syntax check
coverage, popup switch focus-visible style, package-lock version gating,
and lockfile bump behavior. `astra_downloader/test_astra_downloader.py`
covers safe/unsafe delayed uninstall cleanup paths.

**Verified for v4.5.2.** `npm test`, `npm run check`,
`python -m pytest astra_downloader`, `npm audit --omit=dev`, and the
five-artifact build path.

---

## H23 — Subscriptions list-view removal — audit-only (v3.23.0, NX7)

**Trigger.** YouTube removed list-view from Subscriptions in Feb 2026,
breaking the `flow=2` URL-param workaround that some third-party
extensions used to force list rendering.

**Audit result.** Astra Deck's `subscriptionsGrid` feature (`ytkit.js:4848`
+ rule block at `ytkit.js:7126`) does NOT depend on `flow=2` or the
list-view DOM shape. It exclusively re-styles
`ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer`
and tweaks the `--ytd-rich-grid-items-per-row` CSS token. The removal
is invisible to the feature.

**No code change.** Documented here so future audits don't re-raise
the regression risk.

---

## H22 — Astra Downloader response cache-control hardening (v3.23.0, NX11)

**CVE class.** CVE-2026-27205 — Flask ≤3.1.2 leaks session data via cache
when the `in` operator is used on session keys without read/modify (the
`Vary: Cookie` header isn't auto-added). Confirmed structurally
inapplicable to Astra Downloader (no `from flask import session`,
authentication is the X-Auth-Token bearer model only). The pin remains
defensive: a future feature that *does* use Flask sessions inherits a
non-vulnerable baseline.

**Defense-in-depth change.** Every `cors_response` now emits:

- `Cache-Control: no-store` — strongest no-cache directive. Auth-bearing
  responses (`/health` with token) must never be cached by intermediaries.
- `Vary: Cookie` (composed alongside the existing `Vary: Origin` when
  applicable) — signal cookies vary the response so any future session-
  bearing variant doesn't ride a stale entry.

**Files.** `astra_downloader/astra_downloader.py` (`cors_response`
helper), `astra_downloader/requirements.txt` (`flask>=3.1.3,<4`).

**Test pin.** Two new tests in
`astra_downloader/test_astra_downloader.py::CorsHeaderTests` cover the
header presence in both the X-MDL-Client probe path and the extension-
Origin path.

---

## H21 — YouTube "liquid glass" player chrome redesign audit (v3.23.0, N6)

**Status: deferred / partial.** This pass documents the rollout window but
cannot promote concrete selectors until a fresh MHTML capture lands. The
roadmap N6 acceptance criteria 1-3 (fresh capture, canary additions, manual
smoke) require the maintainer at a browser running the new chrome.

**What rolled out (public signal).** Late 2025 → early 2026, YouTube began
serving a redesigned video player with the following user-visible changes:

- Pill-shaped action container in the chrome (replaces the individual
  inline `ytp-*` buttons cluster).
- No dim on pause (the `ytp-paused-mode` overlay dimming is gone).
- Smaller double-tap-to-skip animation.
- Dynamic like animations.
- Threaded comments.
- Simplified Watch Later flow.

Refs:
- https://9to5google.com/2025/10/14/youtube-video-player-redesign-more/
- https://www.techspot.com/news/109892-youtube-modernizes-video-player-new-layout-functionality-wait.html
- https://www.engadget.com/entertainment/youtube/youtube-rolls-out-its-redesigned-video-player-globally-174609883.html

**Astra-Deck features touching the affected surfaces.**

- `popOutPlayer`, `pipButton`, `fullscreenOnDoubleClick` — inject into the
  chrome cluster.
- v3.20.9 player speed control chip — sits between Download and Settings.
- Theater split divider — relies on `ytp-chrome-bottom` for transition
  timing.
- Cinema Ambient Glow — samples player canvas; `ytp-paused-mode` was a
  signal for fade-out timing.
- Creator-Comment-Highlight + Premium Live Chat — comment-DOM rewrites
  may extend the `ytd-comment-view-model` shape with new sub-renderers.

**What this pass landed.**

- `tests/selector-regression.test.js` gains a `LIQUID_GLASS_WATCHLIST`
  array naming the surfaces most likely to break, with a documentation
  test that asserts the list stays non-empty during the transition
  window. Items here are placeholders — promote them to
  `CRITICAL_SELECTORS` once fresh MHTML captures + the build:fixtures
  regen confirm the new class names.
- Comment in `CRITICAL_SELECTORS` documenting the rollout window
  semantics (keep the old + new selector both during the transition so
  users on the legacy chrome don't regress).

**What's pending (concrete next-action checklist).**

1. Capture a watch-page MHTML on a profile served the new chrome
   (`File → Save Page As → MHTML` in Chrome stable).
2. Save under `mhtml/yt-watch-liquid-glass.mhtml` (gitignored alongside
   existing mhtml captures).
3. `npm run build:fixtures` to regenerate
   `tests/fixtures/yt-watch.tokens.txt`.
4. Grep the new tokens for the surfaces in `LIQUID_GLASS_WATCHLIST` and
   identify the real class names. Promote concrete winners to
   `CRITICAL_SELECTORS` (keep legacy + new both).
5. Manual smoke: screenshot, mini-player bar, speed control chip,
   theater split divider all render on the new chrome.
6. Update this section with the concrete deltas.

---

## H20 — CSP `connect-src` allowlist on extension pages (v3.23.0, N5)

**Why this is a real issue.** The extension's CSP previously declared only
`script-src 'self'; object-src 'self'`. A compromised content-script (XSS via
peer extension, or a future careless contributor wiring popup.js to off-self
origins) could exfiltrate freely from extension pages — CSP wouldn't catch it.
The fix is mechanical: add a `connect-src` directive matching the documented
host_permissions so legitimate flows keep working but anything off-allowlist
hits CSP.

**Wire contract.** The allowlist contains:

- `'self'` — extension pages legitimately call same-origin endpoints.
- `https://api.openai.com`, `https://api.anthropic.com`,
  `https://generativelanguage.googleapis.com` — AI summary / transcript-handoff
  providers (BYO key).
- `https://sponsor.ajay.app` — SponsorBlock + DeArrow hash-prefix API.
- `http://127.0.0.1:9751` and the documented fallback ports
  (`9761`/`9771`/`9781`/`9791`/`9851`) — Astra Downloader local probe.
- `http://127.0.0.1:11434` — local Ollama API for AI summary.

**Negative assertion.** No wildcards. `tests/hardening.test.js` pins the
CSP shape with explicit asserts both for required allowlist entries and for
the absence of `*`.

---



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
- ~~Firefox-specific `commands` shortcut remap~~ — moot in v4.5.3: the
  entire `commands` block was retired per the "no keyboard shortcuts"
  rule.
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

---

## v1.2.0 — Hardening Pass 6 (Astra Downloader companion)

Pass 6 is scoped to the Python/Flask companion (`astra_downloader.py`) and
its first-run setup. Five Pass 5 follow-ups landed in this release plus a
batch of new findings around trust on the yt-dlp / ffmpeg install path and
the install-day UX. The extension side is unchanged; `/health` gains three
additive fields but the wire contract is backward-compatible (older builds
ignore unknown keys).

### New Real Issues (Addressed in v1.2.0)

#### Security — Astra Downloader

**S1 — `outputDir` accepted any absolute path (Pass 5 follow-up)**
The `/download` endpoint passed a client-supplied `outputDir` straight into
`normalize_output_dir`, which called `mkdir(parents=True, exist_ok=True)`
on whatever it received and then let yt-dlp write there. A compromised
extension context or malicious content script running with extension
privileges could drop files anywhere the server user had write access —
the service runs as a normal user, but that's still home dir, Documents,
the Downloads folder, anywhere the user's profile can reach.

Fix: `normalize_output_dir` now takes an optional `allowed_roots`
argument; when supplied, the resolved path must sit inside one of those
roots or the request is rejected with 400 *before* `mkdir` runs. The
`/download` handler always enforces confinement when the client supplies
`outputDir`; it skips the check when the server falls back to its
configured defaults (those are always inside the allowlist by
construction, and skipping avoids a chicken-and-egg on first run). Users
who want a wider set of roots without widening `DownloadPath` itself can
add them via the new `ExtraOutputRoots` config list.

**S2 — No rate limit on `/download` (Pass 5 follow-up)**
`MAX_CONCURRENT=3` gated *running* jobs, but the HTTP endpoint itself had
no throughput ceiling. A compromised extension could POST 10k
`/download` requests per second, spending CPU on URL / cookie / path
normalization for every one. Each rejected request still ran through the
sanitize pipeline, so rejection didn't bound the cost.

Fix: token-bucket sliding window (`RateLimiter`, 30 req / 60 s by
default). Burst budget is far above what a real user can produce but
clamps a runaway client. Rejection runs early (after auth, before body
parsing) so CPU stays flat under attack. 429 responses include a
`Retry-After` header.

**S3 — First-run binaries not checksum-verified**
`SetupWorker` pulled `yt-dlp.exe` and the ffmpeg zip over TLS from GitHub
but never verified them against the release SHA-256 sidecars. Both
upstreams ship per-release checksums; a TLS-stripping proxy, a corrupted
cached copy at a CDN edge, or an incomplete download could install a
poisoned or broken binary that then executes with user privileges for
every subsequent download.

Fix: `verify_file_sha256` + `fetch_expected_sha256`. The setup worker
fetches the sidecar from the same release the binary came from, verifies
the SHA-256, and hard-fails the install on mismatch (the downloaded
file is unlinked before the error bubbles up, so the next retry
re-fetches). If the sidecar itself is 404 / rate-limited / unreachable,
we soft-fail (log + continue) so a sidecar outage doesn't block a
legitimate install. The "Reinstall ffmpeg" button in Settings →
Tools re-runs the same verified download path.

#### Reliability — Astra Downloader

**R1 — Werkzeug dev server in production (Pass 5 follow-up)**
werkzeug's own documentation warns that `make_server` / `serve_forever`
is a development server; acceptable on localhost but without the thread
pool, graceful drain, or graceful shutdown that a real WSGI needs.

Fix: switched to `waitress` (production-grade, battle-tested, single
wheel dependency) via a `_ServerAdapter` shim that presents a uniform
`run()` / `stop()` over both backends. Werkzeug is retained only as a
fallback when waitress isn't installed (legacy source runs, test
containers). The server start log now reports which backend is active.

**R2 — CORS preflight re-negotiated on every POST (Pass 5 follow-up)**
Every `POST /download` previously triggered a fresh `OPTIONS` preflight
because the server returned no `Access-Control-Max-Age`.

Fix: `cors_response()` now sets `Access-Control-Max-Age: 600`. Multi-
video sessions cut their preflight round-trips to once per 10 min.

**R3 — yt-dlp auto-update fired on every launch**
`AutoUpdateYtDlp` ran `yt-dlp.exe -U` every time the server started,
captured no exit code, and logged nothing. Update-check failures were
invisible until downloads silently regressed.

Fix: new `LastYtDlpUpdateCheck` config stamp gates the update to at most
once per 24 h; `maybe_auto_update_ytdlp()` runs it in a daemon thread
with a 2-minute timeout and logs the exit code + captured stdout/stderr
on both success and failure. Invalidates the `/health` version cache
on success so `/health` reports the new version within a minute.

**R4 — Orphan cookie jars leaked session credentials across crashes**
The per-download `.cookies.{id}.txt` files are cleaned in the `_run_download`
`finally` block, but that doesn't run if the server is killed with
`taskkill /F` or the host loses power mid-download. The jars accumulated
in `INSTALL_DIR` indefinitely, each holding a live YouTube session.

Fix: `cleanup_stale_cookie_jars()` sweeps any `.cookies.*.txt` older
than 5 minutes from `INSTALL_DIR` when the `DownloadManager` is
constructed. The 5-minute horizon is long enough that no legitimate
download-in-flight gets its jar stolen (running downloads refresh the
mtime by being open; new downloads are <5 min old by definition).

**R5 — `ensure_system_integrations()` ran on every launch**
Shortcut registration, the `schtasks /Create` call, protocol handler
writes, and the Apps-&-Features entry all re-fired on every launch of
the frozen exe. That spawned a PowerShell process + 3 `winreg` writes
+ a `schtasks.exe` invocation just to reconfirm state that hadn't
changed. Adds ~100 ms and a visible window flash on some Windows setups.

Fix: `HKCU\Software\Classes\AstraDownloader\IntegrationsVersion` stamp.
`ensure_system_integrations()` now short-circuits when the stamp equals
`APP_VERSION`. Force re-registration is available via `force=True`
(used after setup). Uninstall removes the stamp.

#### UX — Astra Downloader

**U1 — ffmpeg download had no byte-level progress**
The setup progress bar jumped 35 → 60 once the zip finished downloading,
which took a minute or more on slow connections with zero intermediate
feedback.

Fix: `download_file_atomic` now accepts a `progress_cb`; `SetupWorker`
passes a callback that maps downloaded bytes into the [35, 55] range of
the overall setup bar. Throttled to ~10 Hz so fast connections don't
flood the Qt event loop. Same helper is available to other callers
(icon download, future ffmpeg reinstall flows).

**U2 — Version readouts and tool maintenance moved to Settings**
Users had no in-app way to see which yt-dlp / ffmpeg they were running
or to force a yt-dlp update or reinstall ffmpeg. Both were only
reachable by poking at `%LOCALAPPDATA%\AstraDownloader` directly.

Fix: new Settings → Tools section showing live version strings plus
"Check yt-dlp Update" (runs `-U`, logs the result, refreshes the
version cache) and "Reinstall ffmpeg" (unlinks the current binary and
re-runs the verified download path). `/health` exposes the same
version strings so the extension's install/retry prompt can show them.

**U3 — JSON-parsed yt-dlp progress**
The existing MDLP regex on yt-dlp stdout still works but was fragile to
upstream format tweaks. Added a parallel JSON progress template
(`MDLP_JSON %(progress)j`) that emits the full progress dict; the
parser tries JSON first and falls back to the legacy regex on parse
failure. No behavioral change in the success path — just insulation
against yt-dlp drift.

### New Config Fields

| Key | Default | Purpose |
|-----|---------|---------|
| `LastYtDlpUpdateCheck` | `""` | ISO-ish timestamp of last yt-dlp `-U`. Gates the 24h throttle. |
| `LastFfmpegCheck` | `""` | Monthly ffmpeg refresh nag timestamp (reserved for future use). |
| `ExtraOutputRoots` | `[]` | Additional directories that may be passed as `outputDir` by the extension. |

### Wire Contract — `/health` Additions

```json
{
  "ytDlpVersion": "2026.04.01",
  "ffmpegVersion": "n7.0",
  "rateLimit": { "downloadMaxPerWindow": 30, "downloadWindowSeconds": 60 }
}
```

All three keys are optional in the extension's `_isAstraDownloaderHealth`
check; older builds ignore them.

### New Test Coverage

- `PathConfinementTests` (3) — allowlist accepts subfolders, rejects
  outside paths, rejects `..` traversal.
- `RateLimiterTests` (2) — exhausts window + separate-key isolation.
- `Sha256VerifyTests` (5) — match / mismatch / malformed sidecar /
  multi-asset parsing / single-line sidecar.
- `CookieJarSweepTests` (1) — stale jars removed, fresh jars + unrelated
  files preserved.
- `ApiRateLimitTests` (1) — end-to-end 429 via Flask test client.
- `CorsHeaderTests` (1) — `Access-Control-Max-Age` present on /health.
- `HealthAdditionsTests` (1) — new /health keys present.
- `AutoUpdateThrottleTests` (3) — no stamp → check / recent stamp → skip /
  corrupt stamp → check.

Python: 37 pass (was 19). JS: 81 pass (unchanged).

### Residual Trust Boundaries (still documented, still not bugs)

- **Protocol handlers (`ytdl://`, `mediadl://`)** — unchanged trust
  boundary. Single argv element, no shell. URL is attacker-controlled
  input that the app must validate before acting on.
- **yt-dlp executes with user privileges** — hardened by SHA-256
  verification at install time but not at run time. yt-dlp self-updates
  via `-U`; those updates are not re-verified. Upstream signs its
  updates internally (the `-U` path fetches + checksums).

### Follow-ups (Pass 7 candidates)

- Extend S3 to the yt-dlp `-U` self-update path — currently trusts
  yt-dlp's own update chain; we could cross-verify after it completes.
- Extension-side UI to show `/health.ytDlpVersion` in the repair prompt
  (the field is there, no consumer yet).
- Monthly ffmpeg freshness nag using `LastFfmpegCheck` (reserved but
  not yet wired to UI).
- Optional per-download output confinement log entry for defense-in-
  depth auditing.

---

## Hardening Pass 7 (v3.20.0 — 2026-04-24)

Audit-only release. Closes three of the six audit-pass open items from
2026-04-23 plus two platform-drift fixes (storage ceiling, Firefox
shortcut). No new features.

### Real Issues

**P7-C1 — `_pendingReveals` in-memory only across MV3 SW restarts**
`background.js#_pendingReveals` was a `const Set()`. When the user
queued a download with `showInFolder: true`, the id was added to the
Set; the `chrome.downloads.onChanged` listener then fired
`chrome.downloads.show(id)` on the `state.complete` transition. If
the MV3 service worker went idle between those two events (normal on
slow networks or when other extension work isn't keeping it alive),
the Set was recreated fresh on SW restart and the `.has(id)` check
returned false — silently dropping the reveal.

Fix: mirror writes into `chrome.storage.session` (MV3-only, survives
SW restart, cleared on browser restart — correct semantics for a
transient reveal intent). `_pendingRevealsReady` is a module-level
hydration promise awaited by the onChanged listener so a reveal
queued before a cold-start is still honoured when the event arrives.

Regression: `tests/hardening.test.js` →
`_pendingReveals is mirrored to chrome.storage.session for SW-restart survival`.

**P7-C2 — `astra_downloader._run_download` dead regex assignment**
Line 1613 had `m = re.search(r'\[download\] Downloading video (?:\d+ of \d+|\d+)', line)` — assigned but never read. Harmless, but masked
whether title detection was intentional or vestigial.

Fix: deleted the match. Filename detection (Merger merge target +
`[download] Destination: …`) keeps its matches; everything else
continues through the existing progress-parsing loop.

Regression: `_run_download no longer contains the dead "Downloading video" regex match`.

### Platform Drift / UX

**P7-D1 — `chrome.storage.local` 10 MB ceiling with no release valve**
`storageQuotaLRU` (Pass 1) trims hot caches on a 5-minute cadence but
cannot prevent steady-state growth from outpacing LRU eviction (long
watch-history windows, large DeArrow caches, diagnostic error
ring-buffer spikes).

Fix: declared `"unlimitedStorage"` in `manifest.permissions`.
Zero-risk — only effect is raising the storage.local ceiling. LRU is
retained so normal usage stays well under typical user-profile disk
budgets.

Regression: `manifest declares unlimitedStorage to exceed the 10 MB default quota`.

**P7-D2 — Firefox `Ctrl+Shift+Y` collision (superseded by v4.5.3 removal)**
Firefox reserves `Ctrl+Shift+Y` for "Show Downloads". The original P7
fix added a Firefox-only rebind to `Ctrl+Alt+Y` in
`scripts/manifest-patch.js`. v4.5.3 retires the entire `commands`
block in keeping with the "no keyboard shortcuts" project rule — there
is no shortcut left to collide with Firefox's browser-level binding.
The manifest-patch comment now documents the removal; the regression
test was rewritten to assert both Chrome and Firefox-patched
manifests contain no `commands` block.

Regression: `v4.5.3: manifest declares no keyboard shortcuts (Chrome + Firefox patched)`.

### Still Open (deferred to Pass 8)

- **SponsorBlock POI category semantics** — `poi_highlight` segments
  still get the skip treatment (`currentTime = end`) rather than
  jump-to-marker treatment. Mitigated by the zero-length segment
  filter dropping most of them on arrival; only matters if the
  category is ever re-enabled by default.
- **`ytkit.js` monolith uncovered paths** — DeArrow cache lifetime,
  theater-split cleanup on fast SPA navigations, Wave-8/9 restored
  features. Per-area audits rather than another whole-file pass.
- **Extension cookie `expirationDate || 0` fragility** — correct for
  the current Netscape-format server-side writer; flagged for
  re-review if the cookie wire format ever changes.

---

## Hardening Pass 8 (v3.20.1 — 2026-04-24)

Audit-only follow-up to Pass 7. Closes the two remaining roadmap
audit-pass items that had concrete, bounded fixes; leaves the
`ytkit.js` monolith audit and the extension-cookie expiration
fragility open (both are watchlist items, not active bugs).

### Real Issues (addressed in this pass)

**P8-1 — `_pendingReveals` had no prune path for erased downloads** (LOW security finding)
Pass 7's session-mirror guaranteed reveals survived a service-worker
restart, but an id could still outlive the download it referenced.
Specifically, if the user cancelled + erased a download (or crash
recovery wiped the row) before the download reached
`state.complete` / `state.interrupted`, the id stayed in both the
in-memory `Set` and the session mirror forever. Over a long browser
session with many interrupted downloads, the Set grew
unboundedly — bounded by session lifetime but not by anything
stronger.

Fix: new `chrome.downloads.onErased` listener that awaits the same
`_pendingRevealsReady` hydration promise as `onChanged`, calls
`_pendingReveals.delete(downloadId)`, and persists the delete via
`_persistPendingReveals()`. `Set.delete` is idempotent, so a normal
complete → erase sequence is a safe no-op on the second fire.
Listener is guarded behind `chrome.downloads?.onErased?.addListener`
so older Firefox builds (which didn't ship `onErased` until
129+) don't throw at load time.

Regression: `_pendingReveals is pruned when a tracked download is erased from history`.

**P8-2 — SponsorBlock `poi_highlight` auto-skipped instead of rendering as marker** (correctness)
The SponsorBlock API defines `poi_highlight` as a jump-to highlight
reference (the user can seek TO it), not a segment to skip PAST.
Both `sponsorBlock._checkSkip()` and `sponsorBlock._scheduleNextSkip()`
iterated the category list and treated every segment the same way:
if `currentTime >= start && currentTime < end - 0.3` set
`video.currentTime = end`. A user who enabled `sbCat_poi_highlight`
from the settings UI (off by default) would find the player
fast-forwarding past every highlight marker — exactly the opposite
of what the category is for.

Fix: both methods now `continue` past any segment whose `category`
is `poi_highlight`. The progress-bar renderer (`_renderBarSegments`)
is untouched and continues to paint the marker in its existing
`#ff1684` colour.

Mitigations that were already in place (and remain): zero-length
segments are rejected on ingest, the category is off by default,
and the enabled-category allowlist controls whether any logic
fires at all.

Regression: `SponsorBlock never auto-skips poi_highlight (API contract: marker, not skip)`.

### Still Open (deferred to Pass 9)

- **`ytkit.js` monolith uncovered paths** — DeArrow cache lifetime,
  theater-split cleanup on fast SPA navigations, Wave-8/9 restored
  features. Per-area audits rather than another whole-file pass.
- **Extension cookie `expirationDate || 0` fragility** — correct for
  the current Netscape-format server-side writer; flagged for
  re-review if the cookie wire format ever changes.

## Ongoing Hardening (Unreleased)

### H1 — TrustedTypes createPolicy failures are now observable

`extension/ytkit.js` formerly swallowed `createPolicy('ytkit-policy', …)`
throws in a silent catch block. Peer-extension collisions on the
policy name and CSP-forbidden policy creation were therefore invisible
in the field: the userscript fell back to DOMParser with no signal in
the diagnostic ring buffer.

The fallback reason is now captured at IIFE init and lazy-logged to
`DiagnosticLog` on the first `setHTML`/`create` call (after
`appState.settings` has loaded so `DiagnosticLog.record` is safe).
Two distinct tags make field logs diagnosable:

- `TT_UNAVAILABLE` — TrustedTypes API missing entirely (Firefox, older
  browsers).
- `TT_POLICY_FAIL: <ErrorName>: <message>` — `createPolicy` threw,
  either because another extension already claimed `'ytkit-policy'`
  or because CSP on the page disallows policy creation. `http(s)://`
  URLs in the error message are redacted to `<url>` before logging
  so diagnostic dumps do not leak page context.

The DOMParser + `replaceChildren()` fallback path is unchanged. Four
regressions in `tests/hardening.test.js` pin the observability
behaviour.

### H2 — Python dependency upper-major bounds

`astra_downloader/requirements.txt` now carries both lower and upper
bounds on every dep:

```
PyQt6>=6.6.0,<7
flask>=3.0.0,<4
requests>=2.31.0,<3
waitress>=3.0.0,<4
```

The downloader ships as a PyInstaller-frozen exe to users, but the
repo's own test/dev workflow resolves against whatever `pip install
-r requirements.txt` returns at that moment. Without upper bounds a
silent major-version bump (PyQt7, Flask 4.x, requests 3, waitress 4)
would surface first on a contributor's machine or in CI, never
having run against the downloader's tests. The bounds keep the
resolver inside the majors we have exercised; patch + minor bumps
still flow in automatically.

Rationale for the specific caps:

- **PyQt6<7** — Qt 7 is the next major binding rewrite; API breakage
  on signal/slot/QVariant is likely.
- **flask<4** — Flask's async handler surface has been churning;
  a major bump on a frozen companion app is not a place to discover
  that.
- **requests<3** — requests 3 is planned to drop chardet + shift to
  urllib3 2.x defaults; needs a deliberate migration pass.
- **waitress<4** — Waitress is a WSGI server; a major bump on a
  localhost listener is not worth absorbing without review.

### H3 — Selector-drift canary via MHTML token signatures

YouTube rolls out A/B selector renames without notice. Previously
the only signal was a user-filed bug "feature X stopped working."
The `mhtml/` directory has held reference snapshots of the home and
watch pages for a while but wasn't wired into tests. v3.20.x lights
them up as a regression canary.

- `scripts/build-selector-fixtures.js` decodes the quoted-printable
  HTML body out of each `mhtml/*.mhtml` capture (the raw 5 MB files
  are gitignored) and writes one token signature per page to
  `tests/fixtures/*.tokens.txt`. Tokens harvested: `ytd-*`, `ytp-*`,
  `yt-*`, `html5-*`, `movie_player`, and a handful of YT layout ids
  (`primary`, `secondary`, `contents`, `masthead-container`).
- `tests/selector-regression.test.js` maintains a 9-entry list of
  critical selectors (layout, player, feed grid, comments) and
  asserts each one appears in BOTH the fixture signatures AND
  `extension/ytkit.js`. The two-sided assertion catches both
  YouTube-side renames (when the fixture is refreshed and the
  selector drops) and our-side refactor loss (when ytkit.js stops
  referencing a selector we still canary).
- Refresh cycle: when YouTube A/B drift is suspected, recapture
  `mhtml/YouTube.mhtml` + `mhtml/WatchPage.mhtml` via Chrome
  "Save As → Webpage, Single File", then run
  `npm run build:fixtures` and commit the updated token files. The
  diff shows exactly which selectors entered/left YouTube's DOM
  since the last refresh.

### H4 — Popup surfaces the TrustedTypes diagnostic signal

H1 captured `TT_POLICY_FAIL` / `TT_UNAVAILABLE` in the diagnostic ring
buffer but the signal was only visible to users who deliberately
dumped the full diagnostic JSON. That meant a peer-extension
policy-name collision would silently degrade the userscript and
never surface in a bug report.

The toolbar popup now reads `ytSuiteSettings._errors` on render,
filters entries tagged `ctx === 'trusted-types'`, and paints a
conditional warning-toned banner between the storage grid and the
data-management actions row. The banner stays `hidden` on the happy
path; when ≥1 event exists it shows the event count and the latest
(already URL-redacted) reason message. A Copy button drops a
structured payload on the clipboard — event count, ISO timestamp of
the latest event, and the reason string — so a user filing a bug
report pastes the precise reason code instead of "something broke."

Implementation details:

- Banner element is `role="status"` with `aria-live="polite"` so
  screen readers announce it non-intrusively when it materializes.
- `healthCopyPayload` is reset to the empty string on every null /
  zero-count render, so a stale payload can never reach the
  clipboard on a later click.
- Clipboard fallback logs the payload to the console if
  `navigator.clipboard.writeText` throws (e.g. popup loaded over
  `file://` during development).
- Amber palette (not red) — this is a "fallback active" notice,
  not a destructive state. Existing features continue to work via
  the DOMParser path.

Four regressions in `tests/hardening.test.js` pin the HTML scaffold,
the `ctx === 'trusted-types'` filter predicate, the hidden-on-empty
guard (including payload reset), and the CSS + focus-visible
coverage for the Copy button.

### H5 — storageQuotaLRU swept a nonexistent key for a year

The `storageQuotaLRU` feature's cap list included
`['deArrowCache', 1000]`, iterated against
`appState.settings.deArrowCache`. That key has never existed —
DeArrow's branding cache is stored under the top-level
`chrome.storage.local` key `da_branding_cache`, written via
`storageWriteJSON('da_branding_cache', …)`, not inside the
settings object. The cap never matched anything regardless of
whether DeArrow was running.

Dead code by itself is a readability problem. Worse, the feature
description claimed to cover "deArrowCache," misleading anyone
auditing the quota story into thinking DeArrow's persisted cache
was bounded by the voluntary LRU sweep. It was — by DeArrow's own
`_schedulePersist` which caps at 2000 on every write — but the
external sweep was doing nothing.

Fix:

- Remove the dead `['deArrowCache', 1000]` entry from the in-settings
  cap list.
- Add a belt-and-suspenders sweep on the real `da_branding_cache`
  top-level key: read via `storageReadJSON`, sort entries by
  descending `_ts`, slice to 2000 most-recent, write back via
  `storageWriteJSON`. Triggers only when the on-disk set has
  drifted past 2000 entries (shouldn't happen under DeArrow's own
  cap, but catches any future regression that skips the persist
  path).
- Update the feature description to name `da_branding_cache` so a
  user auditing the quota feature sees what actually gets swept.

Two regressions in `tests/hardening.test.js` pin the absence of the
dead reference AND the presence of the real-key sweep.

### H6 — Cookie-jar wire contract is now explicit

Three sites previously inlined the cookie-expiry coercion as
`expirationDate: c.expirationDate || 0`:

- `extension/ytkit.js` (MediaDL cookie mapper, near line 2633)
- `extension/background.js` (`EXT_COOKIE_LIST` handler, near line 620)
- `YTKit.user.js` (GM_cookie fallback, near line 1851)

The wire contract — "send 0 for session cookies; send a positive
Number of seconds since epoch for persistent cookies" — was implicit:
JavaScript truthiness happened to coerce `null`, `undefined`,
negative numbers, and non-numeric strings to 0 because all of those
are falsy. Three problems with that:

1. The wire format is not documented in code; a future reader has
   to deduce it from JS truthiness rules.
2. `Number.isFinite(NaN)` is false, but `NaN || 0` returns `0`. Both
   land at the same wire value but the path is opaque.
3. If a future Chrome cookies API returns `expirationDate` as an
   ISO 8601 string (not currently planned, but not impossible),
   `'2026-01-01T00:00:00Z' || 0` evaluates to the truthy string and
   ships it raw to the Python side, which would then `int(float(…))`
   and throw. Defaulting to 0 on parse failure is the right behaviour
   but the code didn't show that.

Fix: a single named helper, defined in all three files (kept inline
rather than via shared module — extension/core/ is ISOLATED-world
only; userscript build pipeline doesn't import from core/):

```js
function normalizeCookieExpiry(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
}
```

Wire contract documented in the function name, the inline comment,
and the regression tests. The Python downloader at
`astra_downloader/astra_downloader.py:830-838` already implements
the matching defensive parsing; the existing
`test_dns_rebinding_attack_is_rejected_before_handler`-adjacent
tests at `test_astra_downloader.py:333-335` cover bogus-string and
negative-int inputs.

Three regressions in `tests/hardening.test.js`:

- The function is parsed out of each file via `Function()` and
  exercised against 15 input shapes (undefined, null, 0, positive
  int, positive float, negative int/float, NaN, ±Infinity, empty
  string, "bogus", numeric string, true, false). Output must match
  across all three sites — drift = test failure.
- The legacy `c.expirationDate || 0` literal must not appear at any
  cookie-mapper site.
- The JS output must round-trip through Python's `int(float(x))`
  truncation without value drift.

### H7 — Selector-drift canary widened to 18 selectors

H3 launched the canary with 9 critical selectors. Iter-3 research
(YouTube DOM-fingerprinting + server-side ad-injection arms race
escalating; selector-churn cadence moving from quarterly to weekly)
made the case for wider coverage.

Added 9 new selectors (already present in BOTH the watch + home
fixture token sets AND `extension/ytkit.js` source — verified before
adoption):

- Layout: `ytd-watch-metadata`, `ytd-comments`
- Player chrome / controls: `ytp-play-button`, `ytp-settings-button`,
  `ytp-fullscreen-button`, `ytp-time-display`
- Comments — new DOM shape: `ytd-comment-view-model` (alongside
  the existing `ytd-comment-thread-renderer`; YouTube ships both
  during the A/B period)
- Text rendering wrappers: `yt-formatted-string` (older shape, still
  widely used), `yt-attributed-string` (newer shape, recurring
  rewrite target — broke comment-text selection in v1.0.6)

The two-sided assertion (selector present in BOTH the fixtures AND
ytkit.js) catches:

- YouTube renaming a selector — fixture refresh drops it, test
  fails on the fixture side.
- Internal refactor losing a reference — test fails on the source
  side.

Refresh procedure unchanged from H3: recapture
`mhtml/YouTube.mhtml` + `mhtml/WatchPage.mhtml`, then
`npm run build:fixtures`, then commit the regenerated
`tests/fixtures/*.tokens.txt`. The diff shows exactly which
selectors entered or left the YouTube DOM since the last refresh.

### H8 — theater-split divider drag survives SPA navigation (v1.0.7)

The `theater-split.user.js` divider-drag handler attached
`mousemove` and `mouseup` listeners to `window` and a
position:fixed shield element to `document.body`. The only cleanup
path was the `mouseup` handler — but if a `yt-navigate-finish`
event fired between mousedown and mouseup (URL bar nav, browser
back, keyboard shortcut to next video), `teardown()` would remove
the splitWrapper while leaving the window listeners and the
dragShield orphaned. Those listeners would keep firing closures
over the disposed wrapper for the rest of the session, holding
references to GC'd DOM nodes.

Likelihood is low (requires the user to be mid-drag during the
navigation event), but the consequence — listeners that never
clean up until tab close — was a long-running memory leak.

Fix:

- Hoist `dragShield`, `dragOnMove`, `dragOnUp` to module-scope
  state vars in the same block where `splitWrapper`,
  `playerResizeObs`, `chatObserver`, etc. already live. This is
  the same pattern the rest of the userscript uses — closure-local
  state was the outlier.
- Add an idempotent `abortDividerDrag()` helper that removes the
  shield (try/catch in case it was already detached), removes the
  window listeners, and resets `cursor` / `userSelect` on
  `document.body`.
- Call `abortDividerDrag()` from `teardown()` so SPA-nav mid-drag
  is clean.
- Defensively pre-call from the `mousedown` handler so a re-entrant
  mousedown (rare — would require a browser bug or extension
  conflict) cannot stack listeners.

Theater Split userscript header bumped to v1.0.7. Three regressions
in `tests/hardening.test.js` pin: the version bump + helper +
hoisted state, the `teardown` → `abortDividerDrag` call, and the
mousedown defensive pre-clear.

### H9 — EXT_FETCH controller.abort() consistency on size-limit early returns

The EXT_FETCH proxy in `extension/background.js` has five
"responded = true; sendResponse(...); return" paths in the success
branch:

1. Timeout fires and the timer aborts the controller.
2. Redirect lands on a non-allowlisted origin → `controller.abort()`.
3. Declared content-length exceeds `MAX_RESPONSE_BYTES` → `controller.abort()`.
4. Streamed body exceeds the limit while reading → `reader.cancel()` only.
5. Non-streaming body exceeds the limit after measuring → no abort, no cancel.

Paths (4) and (5) leaked: we'd already responded to the content
script with "too large", but the SW kept reading bytes off the wire
until natural EOF. Wasted bandwidth; wasted SW lifetime under MV3's
30 s idle clock; a malicious upstream could keep the SW alive
indefinitely by trickling bytes after the cap.

`reader.cancel()` closes the reader but does not always tear down
the underlying network request — the spec leaves the behaviour to
the underlying Source. `controller.abort()` is the authoritative
signal that the request is done.

Fix: every "too large" early-return now calls `controller.abort()`
in addition to whatever else (reader.cancel, response.error path).
The four catches are wrapped in try/catch because the controller
may already be aborted by the timeout path.

One regression in `tests/hardening.test.js` counts the `abort()`
call sites in the EXT_FETCH handler (≥5 expected) and pins both
the streamed-too-large block and the non-streaming-too-large block
explicitly.

### H10 — `npm run check` catches pre-push version-string drift

The Build & Release workflow validates that the four canonical
version strings — `package.json#version`,
`extension/manifest.json#version`,
`extension/ytkit.js#YTKIT_VERSION`, and
`YTKit.user.js#@version` — all match the pushed tag. That gate
fires AFTER the tag has landed on remote. A developer who bumps
three of four locally and forgets to run `node sync-userscript.js`
will ship the drift to GitHub and watch CI fail post-tag.

`scripts/check-versions.js` ports the same comparison to local-
side. On the happy path it prints `[check-versions] All 4 sources
agree at v<...>` and exits 0. On drift it prints every source's
value side-by-side, a remediation hint pointing at
`node sync-userscript.js`, and exits 1.

Wired into `npm run check` so `npm test && npm run check` is now
sufficient pre-push. Also exposed standalone as
`npm run check:versions` for tight CI/dev loops.

A subtle implementation note pinned by a regression test: the
"all sources match" guard uses `sources[0].value !== ''` instead
of `!sources[0].value.includes('')`. The latter would always
evaluate true (every string contains the empty substring) and
would silently break the happy path — a draft-stage bug caught by
running the script before shipping. The test exists so a future
refactor can't regress it.

Two regressions in `tests/hardening.test.js`:

- The script exists, reads all four canonical sources, is wired
  into `npm run check`, and uses the correct empty-string guard.
- `execFileSync` against the current tree — if any source has
  drifted, this test fails before any other test runs.

### H11 — Settings import migration + popup dialog semantics

Two roadmap items shipped together because they both touch the toolbar
popup, which is the only extension-surface settings UI after v3.19.0.

**N1: profile-import migration.** The popup import path wrote imported
settings directly to `ytSuiteSettings`; the in-page settings manager did
the same through `importAllSettings()`. Both paths preserved only safe
object keys, but neither ran the `_settingsVersion` migration chain
before stamping the current schema. A profile exported before v6 could
therefore skip migrations for added/retired settings until a later load
path happened to repair it.

Fix:

- `extension/ytkit.js` now routes imported settings through
  `_prepareImportedSettings()`, which sanitizes, runs `_migrate(...,
  'profile-import')`, merges over current defaults, and stamps
  `_settingsVersion` only after migration.
- `extension/popup.js` now reads generated `default-settings.json` and
  `settings-meta.json` before import, applies the same migration steps
  locally, restores missing defaults, strips retired settings, and writes
  the migrated result in one storage update.
- Every migration step appends a small `ctx: 'settings-migration'`
  diagnostic entry. Future-version imports preserve safe unknown fields
  while clamping local schema metadata to the current build so later
  upgrades do not skip migrations.

**N3: popup modal semantics and focus management.** Chrome extension
popups are browser-hosted windows, but the DOM still needs the same
keyboard contract expected of a modal surface: a named dialog root,
initial focus inside the popup, Tab/Shift-Tab containment, and Escape
close. The popup already had visible focus styling and an aria-live
health banner; it lacked the root semantics and trap.

Fix:

- `extension/popup.html` sets `role="dialog"`,
  `aria-modal="true"`, and `aria-labelledby="popup-title"` on the
  popup body.
- `extension/popup.js` installs one dialog-level key handler. It moves
  initial focus to the first visible control after render, wraps Tab
  from the last control to the first, wraps Shift-Tab from the first
  control to the last, delegates to the nested confirmation dialog when
  it is open, and closes the popup on Escape when no nested control has
  handled the key.

Two regressions in `tests/hardening.test.js` pin the import migration
contract and the popup dialog/focus contract. `node --test
tests/hardening.test.js` reports 47/47 passing for this pass.

### H12 — Profile import migration round-trip fixtures

Pass 12 fixed the import path. This pass pins the behavior with
executable fixtures so a future settings-schema edit cannot silently
skip an older profile.

`tests/fixtures/settings-import-roundtrip.json` now contains one
known-shape settings profile for every historical schema before the
current v6 schema. The fixtures include user-overridden settings,
settings added by prior migrations, retired Auto Quality keys, safe
unknown fields that must survive forward, and unsafe object keys that
must be rejected.

`tests/settings-migration-roundtrip.test.js` extracts the real
`settingsManager` object from `extension/ytkit.js` with the same
brace-balanced helper used by the build catalog tests, then executes
`_prepareImportedSettings()` against each fixture. The test asserts:

- every generated default setting exists after import;
- v1-v2 profiles receive `hidePinnedComments` and
  `autoExpandComments` through the migration chain;
- v3+ user choices remain preserved when those settings already
  existed in the imported schema;
- retired keys (`preferredQuality`, `useEnhancedBitrate`,
  `hideQualityPopup`) and unsafe object keys are absent;
- every migration step emits both stored `_errors` diagnostics and
  `DiagnosticLog.record('settings-migration', ...)`;
- re-importing the migrated profile is idempotent.

`node --test tests/settings-migration-roundtrip.test.js` reports 1/1
passing for this pass.

### H13 — SponsorBlock segment cache + stale fallback

SponsorBlock previously depended on a fresh API response for every
video. That was correct when online, but a transient 5xx, timeout, or
offline session meant existing segment knowledge was discarded and the
seekbar had no continuity. NX3 keeps the current behavior on a healthy
network while making failure states recoverable.

`extension/ytkit.js` now stores normalized SponsorBlock segments under
the top-level `sb_segments_cache` key. Fresh entries are reused for
12 hours. Entries older than 12 hours but younger than 7 days are
eligible only when the network fetch fails, and that path emits a
`DiagnosticLog` breadcrumb so field reports can distinguish API failure
from "no segments exist".

The cache is intentionally conservative:

- It is keyed by videoId and the enabled category set used for the
  request. A cached entry is only reused when it covers the currently
  enabled categories.
- Segment payloads are normalized before storage and again before
  rendering so malformed times, negative spans, and missing categories
  cannot leak into skip logic.
- The in-memory cache is flushed on `destroy()` before the feature
  releases state, so an SPA navigation does not drop a pending persist.
- Both the SponsorBlock cache's own prune path and `storageQuotaLRU`
  cap `sb_segments_cache` at 500 newest video entries. Expired entries
  beyond the 7-day stale window are removed.

Stale UI is explicit but quiet. `_fetchSegments()` annotates stale
fallback segments with `_ytkitCacheSource: 'stale'` and
`_ytkitCachedAt`; `_renderBarSegments()` still filters every segment
through the current category toggles, and stale progress-bar markers
receive a `data-ytkit-cache-source="stale"` marker plus a tooltip of
`<category> (cached at <time>)`. Skip behavior stays compatible; stale
segments use the same scheduler and category checks as fresh segments.

Two regressions in `tests/hardening.test.js` pin the cache constants,
fresh-before-network lookup, stale fallback diagnostic path, destroy
flush, stale marker tooltip, and category-filtered rendering. The
storageQuotaLRU regressions now also assert that `sb_segments_cache`
is named in the description and pruned through the real top-level key.

### H14 — Selector canary covers player overlay anchors

Pass 10 widened the selector canary to 18 core YouTube DOM tokens.
NX4 extends that coverage to the player overlay tier that SponsorBlock,
chapter hover, Jump Ahead suppression, and progress-bar rendering all
depend on.

Two more watch-page tokens are now critical:

- `ytp-progress-bar-padding` — the padded player timeline wrapper that
  surrounds the real `.ytp-progress-bar` target. `core/player.js`
  now looks for `.ytp-progress-bar` through this wrapper before falling
  back to the broad progress-bar query.
- `ytp-tooltip-text` — the inner text node for player hover/overlay
  messages. `hideJumpAheadButton` now scans both `.ytp-tooltip-text`
  and `.ytp-tooltip-text-wrapper` so a wrapper-only rename does not
  hide text-bearing overlay nodes from the suppressor.

`tests/selector-regression.test.js` now checks 20 critical selectors
plus the fixture sanity test. The source-side assertion changed from a
plain substring check to a token-boundary check against the extension
runtime sources (`extension/ytkit.js` plus `extension/core/player.js`).
This matters because `ytp-tooltip-text` should not pass merely because
`ytp-tooltip-text-wrapper` contains the same substring.

The committed `tests/fixtures/yt-watch.tokens.txt` snapshot already
contains both overlay tokens, so this pass only widens the canary list
and strengthens matching. If a future `npm run build:fixtures` refresh
loses either token, the selector test fails before release and forces
an intentional runtime update.

### H15 — Storage sync eligibility audit

NX7 was decision-blocking for any future `chrome.storage.sync` work.
Chrome and MDN both document the sync quota as 102,400 bytes total,
8,192 bytes per item, and 512 items, measured as each key length plus
the JSON stringification of that key's value. Chrome local storage is
10 MB by default and can ignore that limit when the extension has
`unlimitedStorage`, which Astra Deck already declares.

`scripts/audit-storage-size.js` now makes that measurement
reproducible:

- `uiPreferences` is the current generated `ytSuiteSettings` payload
  with `_settingsVersion` included. It is 7,334 bytes, one item, and
  currently fits both the sync total cap and the 8,192-byte per-item
  cap.
- `typicalLocal` is a repo-defined long-term local-storage sample:
  settings, hidden videos, blocked channels, bookmarks, watch progress,
  resume positions, watch-time, DeArrow cache, SponsorBlock cache,
  stats, and scalar state. It is 172,461 bytes across 16 keys, and
  fails sync. Five keys exceed the per-item cap:
  `da_branding_cache` (62,826 bytes), `sb_segments_cache` (49,068),
  `ytkit-watch-progress` (18,395), `ytkit_resume_positions` (13,189),
  and `ytkit-bookmarks` (10,609).
- `capStressLocal` exercises existing local caps. It is 3,176,820
  bytes, still within local storage's 10 MB baseline, but far outside
  sync quotas.

Decision: full `chrome.storage.local` sync is not viable and should
not be built. A future charter-approved settings-sync feature may sync
UI preferences only, but it needs a per-item guard because the current
settings item is already about 90% of the 8 KB item limit. Histories,
caches, diagnostics, watch progress, resume positions, downloads, and
analytics stay local-only.

`npm run audit:storage` prints the current report. It also supports
`node scripts/audit-storage-size.js --file <storage-dump.json>` for
measuring a real browser-exported storage payload later. Four
regressions in `tests/storage-size-audit.test.js` pin the byte formula,
the 7,334-byte UI-preferences result, the 172,461-byte typical-local
result, and the final sync decision text.

### H16 — i18n scaffold: `_locales/en/messages.json` + build-time key validator

**Pass 17 · NX1**

The extension had no WebExtension i18n infrastructure. All user-visible
strings in `manifest.json` were hardcoded English. This is the minimum
scaffolding for community translation, without migrating any in-source
strings yet.

**What shipped:**

- `extension/_locales/en/messages.json` — the English message catalog.
  Three keys for the manifest fields that browsers substitute at load
  time: `extName`, `extDescription`, `extActionTitle`.
  _(The fourth original key, `toggleControlCenterDesc`, was removed in
  v4.5.3 together with the entire `commands` keyboard-shortcut block.)_
- `extension/manifest.json` updated: `name`, `description`, and
  `action.default_title` use `__MSG_<key>__` references;
  `default_locale: "en"` added.
- `scripts/check-i18n.js` — build-time consistency gate. Reads
  `_locales/en/messages.json`, scans all `extension/` JS files for
  `chrome.i18n.getMessage("key")` calls and the manifest for `__MSG_key__`
  references, and fails with exit 1 if any referenced key is absent from
  the catalog. Hooked into `npm run check`.
- `scripts/check-syntax.js` file list updated to cover the new script.
- Four regressions in `tests/hardening.test.js` pin: catalog exists and
  is valid JSON, all four required keys present, manifest uses `__MSG_`
  references, and `check-i18n` exits 0 on the current tree.

**Scope note:** Strings still hardcoded in `ytkit.js` and `popup.js` are
intentionally not migrated. The migration is incremental — the validator
only fires on `getMessage()` calls and `__MSG_` references that already
exist. New getMessage() calls added without a catalog entry will trip the
build gate immediately.

### H17 — DiagnosticLog clear button in popup health banner

**Pass 17 · L9**

Before this change, the only way to clear `_errors` from extension
storage was through the full Reset-all-data action or waiting for
`storageQuotaLRU` to evict it. The `_errors` array stores TrustedTypes
and migration-diagnostic breadcrumbs; it accumulates indefinitely on
affected installs and there was no user-visible escape hatch.

**What shipped:**

- `extension/popup.html` — a "Clear" button (`id="health-clear-btn"`,
  `class="health-clear-btn"`) added to the health banner alongside the
  existing Copy button, with `aria-label="Clear diagnostic log"`.
- `extension/popup.js` — `const healthClearBtn` element ref; async
  `clearDiagnosticLog()` function: reads `ytSuiteSettings` from storage,
  deletes `_errors`, writes back, calls `renderHealthBanner(null)` to
  dismiss the banner, and shows a success toast. Presents a
  `confirmAction()` dialog before acting. Wired in the bootstrap IIFE.
- `extension/popup.css` — `.health-clear-btn` / `.health-clear-btn:hover`
  / `.health-clear-btn:focus-visible` rules. Neutral-grey palette (not
  amber) to visually separate it from the warning-toned Copy button.
- Three regressions in `tests/hardening.test.js` pin: `health-clear-btn`
  exists in popup.html with correct aria-label, `clearDiagnosticLog` is
  defined and wires the listener, and `.health-clear-btn:focus-visible`
  exists in popup.css.

### H18 — ESLint custom rule: no non-top-level `addListener` in the SW

**Pass 17 · L1**

MV3 service workers must register all `chrome.*.addListener()` calls
synchronously at the top level of the script. Listeners registered inside
an `async` function or `.then()` callback are unreliable — the SW may be
terminated between the outer call and the `await` that precedes the
registration, so the listener silently never fires.

All four existing listener registrations in `background.js` are correct
(top-level). This change prevents future regressions.

**What shipped:**

- `eslint` installed as a devDependency (≥ 9.x flat config).
- `eslint.config.js` — flat config targeting `extension/background.js`,
  registers the local plugin.
- `scripts/eslint-rules/no-post-await-addlistener.js` — custom rule that
  flags `chrome.*.addListener()` calls whose call-site AST is nested
  inside an `async` function (declaration, expression, or arrow) or a
  `.then()` / `.catch()` / `.finally()` callback argument. Top-level
  registrations are allowed.
- `package.json` — `"lint": "eslint extension/background.js"` added;
  `npm run check` now chains `npm run lint` after `check-i18n`.
- `scripts/check-syntax.js` file list updated to cover `eslint.config.js`
  and `scripts/eslint-rules/no-post-await-addlistener.js`.
- Three regressions in `tests/hardening.test.js` pin: `eslint.config.js`
  references the rule name, the rule module is loadable with correct meta
  (`type: "problem"`, expected message ID), and `npm run lint` exits 0
  on the current `background.js`.

### H19 — WCAG 2.2 AA accessibility audit of the toolbar popup

Follow-up to Pass 12's N3 (dialog semantics and focus management). The popup
is the only extension-surface settings UI; it deserves comprehensive a11y.

Findings: color contrast (WCAG AA+), button labeling (aria-label or visible),
focus-visible CSS coverage, keyboard navigation traps all passing.

Deliverables:
- scripts/check-contrast.js — Build-time contrast validator for health banner
- scripts/audit-popup-a11y.js — Build-time popup a11y auditor (buttons, CSS)
- npm run audit:a11y, npm run audit:contrast wired into npm run check
- Six a11y regressions: dialog semantics, button labeling, focus-visible CSS,
  color contrast, a11y audit pass (subprocesses)

Result: check pipeline now includes 3 gates. Tests: 145 → 151 (+6 regressions).

