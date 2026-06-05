# Secret Scanning Alert 1 Audit - 2026-06-05

## Scope

- GitHub secret-scanning alert 1 (`google_api_key`)
- `extension/core/transcript-service.js`
- `YTKit.user.js`
- `archive/YTKit-v*.user.js`
- `tests/core-transcript-service.test.js`
- `tests/hardening.test.js`
- `docs/repo-settings.md`

## Finding

GitHub reported one open public-repository secret-scanning alert for a
Google-API-key-shaped value. The source context showed the value was used as an
intentional public YouTube/Innertube bootstrap fallback, not a private
quota-bearing provider credential. Keeping the literal in active source and
tracked archive snapshots still produced unresolved Security tab noise and made
future real findings harder to triage.

The secret value was not printed, pasted into documentation, or committed
during this cycle.

## Fix

- Removed the active `INNERTUBE_PUBLIC_FALLBACK_KEY` literal.
- Made the Innertube transcript method require a page-derived API key from
  YouTube script tags; if no key is available, it fails over to the existing
  HTML, caption-regex, and DOM transcript retrieval methods.
- Redacted tracked userscript/archive literals with
  `REDACTED_GOOGLE_API_KEY`.
- Added a hardening regression that scans repository text files for Google
  API-key-shaped literals.
- Added transcript-service regression coverage proving the Innertube API method
  does not call the fetch proxy without a page-derived key.
- Resolved GitHub secret-scanning alert 1 as `false_positive` with a redacted
  resolution comment.

## GitHub State

- `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts/1 --jq ...`
  reports:
  - `state: resolved`
  - `resolution: false_positive`
  - `resolved_at: 2026-06-05T07:09:49Z`
  - `validity: unknown`
  - `publicly_leaked: true`
  - `multi_repo: true`
- `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts?state=open --paginate --jq 'length'`
  returned `0`.
- Secret scanning and push protection remain enabled.
- Attempts to enable `secret_scanning_validity_checks` and
  `secret_scanning_non_provider_patterns` through the repository REST endpoint
  returned successfully but left both settings `disabled`; this is recorded in
  `docs/repo-settings.md` as unavailable/no-op through that endpoint.

## Verification

- Redacted-tree scan: no `AIza[0-9A-Za-z_-]{35}` matches under the current
  tree outside `.git`, `node_modules`, and `build`.
- `node --test tests/core-transcript-service.test.js --test-name-pattern="Innertube API method requires"`
- `node --test tests/hardening.test.js --test-name-pattern="Google API key literals"`
