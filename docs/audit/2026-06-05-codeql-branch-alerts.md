# CodeQL Branch Alert Remediation - 2026-06-05

## Scope

- `extension/ytkit.js`
- `YTKit.user.js`
- `extension/core/transcript-service.js`
- `build-extension.js`
- `scripts/audit-popup-a11y.js`
- `scripts/extract-i18n-keys.js`
- `astra_downloader/astra_downloader.py`
- `tests/hardening.test.js`

## Finding

The branch-scoped CodeQL API reported open alerts on the feature branch after
the selector-fixture push even though the default-branch open-alert query was
clean. The alerts covered JavaScript remote property injection, incomplete URL
host/scheme checks, TrustedHTML-sensitive DOM writes, regex-based sanitization
patterns, file-system race patterns in version-bump reads, and Python stack
trace exposure from the folder picker response path.

## Fix

- Centralized exact YouTube hostname validation and replaced substring URL
  checks in channel normalization, share-URL cleaning, video-id parsing, and
  Disable SPA Navigation.
- Parsed navigation hrefs through `new URL(href, window.location.href)`, kept
  only `http:` / `https:` destinations, and required the parsed hostname to be
  a YouTube host before taking over navigation.
- Normalized Quick Links destinations through `URL`, allowed only YouTube-owned
  http(s) destinations, stored/rendered them as path/search/hash, and rebuilt
  anchors from a fixed `https://www.youtube.com` origin at the sink.
- Normalized Resume Playback Position storage through a `Map`, rejected unsafe
  object keys and invalid video IDs, and serialized the bounded map back to
  plain JSON.
- Replaced Quick Links SVG/label HTML injection with DOM-created SVG and text
  nodes in both extension and userscript paths.
- Removed the userscript-local TrustedHTML parser helper and replaced its
  static SVG, label, and progress-panel callsites with DOM construction and
  `textContent`.
- Swapped transcript XML regex tag stripping for an explicit scanner and
  decodes `&amp;` after other entities to avoid double-unescaping.
- Replaced chained fallback-string replacements in the i18n extractor with a
  single-pass decoder.
- Replaced regex tag stripping in the popup a11y text helper and matching
  hardening test with explicit scanners for static accessible-text checks.
- Replaced version-bump `existsSync` read races with `readUtf8IfPresent`.
- Replaced raw folder-picker exception exposure with a generic local failure
  marker plus a generic UI error response.
- Added hardening guardrails that pin these CodeQL-remediated shapes across the
  extension, userscript, scripts, build helper, and Python companion.

## Verification

- `node --check extension/ytkit.js`
- `node --check YTKit.user.js`
- `node --check build-extension.js`
- `node --check extension/core/transcript-service.js`
- `node --check scripts/audit-popup-a11y.js`
- `node --check scripts/extract-i18n-keys.js`
- `python -m py_compile astra_downloader\astra_downloader.py`
- `node --test tests/core-transcript-service.test.js tests/hardening.test.js tests/userscript-health.test.js`
- `python -m pytest astra_downloader\test_astra_downloader.py -q -k "FolderPickerService or GuiSmoke"`
- `npm run audit:a11y`
- `node --test tests/hardening.test.js`
- `npm test`
- `python -m pytest astra_downloader\test_astra_downloader.py -q`
- `npm run check`
- `npm run build`
- `git diff --check`

Hosted follow-up after `ff724d2`: branch-scoped CodeQL alert inspection for
`refs/heads/codex/research-feature-plan-2026-06-05` returned `0` open alerts.
PR checks passed for CodeQL, JS tests/check, Python dependency audit, and Python
downloader tests. Dependency review still fails because the repository
dependency graph is not enabled, which is a hosted repository-setting blocker
outside this code change.
