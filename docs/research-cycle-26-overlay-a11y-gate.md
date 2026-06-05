# Research Cycle 26 - In-Page Overlay Accessibility Gate

Date: 2026-06-05

## Executive Summary

The popup accessibility gate did not cover Astra Deck's runtime-generated
in-page overlays. Local source review confirmed that the most important
surfaces are generated from `extension/ytkit.js` plus `core/toast-dom.js`:
toasts, the local downloader install prompt, download options, transcript
viewer/search, video notes, downloader health/history, and subscription group
controls.

Implementation update 2026-06-05:

- Added `scripts/audit-overlays-a11y.js` and `npm run audit:overlays`.
- Wired `audit:overlays` into `npm run check`.
- Added mutation canaries for unlabeled close controls, missing
  `:focus-visible`, and sub-24px targets.
- Added/verified ARIA labels, region/dialog semantics, polite status updates,
  focus-visible rules, and explicit target-size floors across the named
  generated overlays.
- Updated `docs/screen-reader-smoke.md` with the automated coverage boundary.
- Detailed implementation notes live in
  `docs/audit/2026-06-05-overlay-a11y-gate.md`.

## Local Evidence

- `package.json` previously ran `audit:a11y` and `audit:contrast` only for the
  popup path.
- `scripts/audit-popup-a11y.js` reads `extension/popup.html`,
  `extension/popup.js`, and `extension/popup.css`; it does not inspect
  generated in-page overlays.
- `docs/screen-reader-smoke.md` was manual-only for in-page overlays.
- `extension/core/toast-dom.js` and the inline fallback in `extension/ytkit.js`
  build `.ytkit-global-toast`.
- `extension/ytkit.js` renders the downloader install prompt, download options
  dialog, transcript viewer, transcript search dialog, video notes panel,
  download health/history panels, and subscription group toolbar/digest/modal.

## Recommended Roadmap Item

- [x] P2 - WCAG 2.2 AA audit pass for in-page overlays (beyond the popup)
  - Why: popup a11y gates existed, but runtime-generated overlays were not
    enforced by automated checks.
  - Evidence: `scripts/audit-popup-a11y.js`, `package.json`, generated overlay
    render paths in `extension/ytkit.js`, `extension/core/toast-dom.js`, and
    `docs/screen-reader-smoke.md`. [Verified]
  - Touches: `scripts/`, `tests/`, `package.json`, `docs/`, and targeted
    generated-overlay render/CSS paths.
  - Acceptance: `npm run check` runs a separate overlay audit; the audit emits
    concise per-contract output; it fails on missing names, missing
    focus-visible rules, invalid live regions, or target-size regressions; the
    manual smoke checklist documents what the static gate cannot prove.
  - Verify: `node scripts/audit-overlays-a11y.js --self-test`, targeted
    hardening, full `npm test`, `npm run check`, `npm run build`, and
    `git diff --check`.
  - Status 2026-06-05: shipped.
  - Complexity: M

## Self-Audit

- Recommendation count: 1 closed roadmap item.
- Duplicates merged: popup a11y and contrast gates were preserved; this adds a
  separate generated-overlay gate.
- Done marks changed: the overlay WCAG audit item is marked shipped after
  implementation and targeted verification.
- Source coverage: local source, generated overlay render paths, smoke docs,
  and package/test gates.
- Manual boundary: screen-reader announcement quality still requires NVDA /
  JAWS / VoiceOver smoke because static source checks cannot hear output.
