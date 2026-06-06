# i18n Proofing CSV Hardening

Cycle 45 hardened the generated translator CSV files against spreadsheet
formula execution.

## Finding

The proofing exporter escaped commas, quotes, and newlines, but spreadsheet
tools can treat cells starting with `=`, `+`, `-`, or `@` as formulas. Current
feature copy does not depend on this behavior, but future source strings or
translator notes should not be able to create executable spreadsheet formulas
when the generated CSV files are opened for review.

## Change

- Added `csvSafeValue()` to prefix formula-like cells with a single quote before
  CSV escaping.
- Applied the guard to every exported CSV cell, including English source text,
  current locale text, proposed translations, and notes.
- Added a focused regression test for `=`, `+`, `-`, and `@` cells.

## Verification

- `node --check scripts/export-i18n-proofing.js`
- `node --test tests/i18n-proofing-export.test.js`
- `npm run i18n:proofing-export`
- `npm test`
- `npm run check`
- `npm run build`
- `rtk git diff --check`
