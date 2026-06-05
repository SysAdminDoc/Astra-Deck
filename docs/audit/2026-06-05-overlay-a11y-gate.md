# In-Page Overlay Accessibility Gate - 2026-06-05

## Scope

- `extension/ytkit.js`
- `extension/core/toast-dom.js`
- `scripts/audit-overlays-a11y.js`
- `docs/screen-reader-smoke.md`
- `tests/hardening.test.js`
- `package.json`

## Finding

The popup already had automated accessibility and contrast gates, but runtime
in-page overlays were only covered by manual screen-reader smoke. That left
generated dialogs, toast actions, transcript/search panels, video notes,
subscription-group controls, and downloader panels without a CI-visible check
for accessible names, focus appearance, live-region semantics, or WCAG 2.2
24px target-size regressions.

## Fix

- Added `npm run audit:overlays` and wired it into `npm run check`.
- Added static overlay assertions for toast DOM/inline fallback, the local
  downloader install prompt, download options, transcript viewer/search,
  per-video notes, downloader health/history, and subscription group toolbar /
  digest / modal surfaces.
- Added mutation canaries that prove the audit fails for an unlabeled close
  button, a missing `:focus-visible` rule, and a sub-24px target.
- Tightened generated overlay controls with missing region/dialog names,
  polite status labels, explicit action names, focus-visible rules, and target
  minimums.
- Documented the automated/static boundary in the screen-reader smoke checklist.

## Verification

- `node scripts/audit-overlays-a11y.js --self-test`
- `node --test tests/hardening.test.js --test-name-pattern="audit:overlays|overlay|WCAG"`
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`
