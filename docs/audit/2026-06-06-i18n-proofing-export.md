# i18n Proofing Export

Cycle 44 converted the classified proofing queue into a translator-ready handoff
artifact.

## Findings

- `docs/i18n-coverage.md` is useful for summary counts and sample keys, but a
  native-speaker proofing pass needs a complete row-per-string export.
- The export should stay outside Git because it is generated from the current
  locale files and can be large.

## Changes

- Added `scripts/export-i18n-proofing.js`.
- Added `npm run i18n:proofing-export`.
- The exporter scans non-EN locale files, skips translated entries and exact
  reviewed do-not-translate messages, then writes:
  - `build/i18n-proofing/index.json`
  - `build/i18n-proofing/README.md`
  - one CSV file per locale
- CSV rows include `locale`, `key`, `kind`, `status`, `english`, `current`,
  `proposed_translation`, and `notes`.
- Added focused tests for queue filtering, CSV escaping, file output, strict CLI
  parsing, and package-script wiring.

## Verification

- `node --check scripts/export-i18n-proofing.js`
- `node --test tests/i18n-proofing-export.test.js`
- `npm run i18n:proofing-export`
- `npm test`
- `npm run check`
- `npm run build`
- `rtk git diff --check`
