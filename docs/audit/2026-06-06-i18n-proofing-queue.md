# i18n Proofing Queue

Cycle 43 added a deterministic locale proofing report for identical-to-English
feature copy.

## Findings

- Chrome and MDN both document `messages.json` as the user-visible string source
  for localized extension copy.
- The previous coverage report counted all byte-identical EN matches together,
  mixing reviewed brand/technical strings with untranslated placeholders.
- Running `scripts/generate-locales.js` also showed the generator needed an
  explicit preservation path for proofed feature strings whose current EN source
  text had changed since the locale tables were first authored.

## Changes

- Added `scripts/i18n-policy.js` with the reviewed exact do-not-translate terms.
- Refactored `scripts/i18n-coverage.js` to emit translated, intentional exact
  identical, placeholder identical, and missing counts.
- Added a feature-copy proofing queue for `feature_*_(name|desc)` messages with
  per-locale name/description counts and sample keys.
- Added `npm run i18n:coverage:warn` with a 582-message unresolved feature-copy
  baseline.
- Updated `scripts/generate-locales.js` to share the reviewed policy and
  preserve proofed feature overrides while rewriting generated locales.
- Updated `CONTRIBUTING.md` with the native-speaker proofing workflow.

## Verification

- `node --check scripts/i18n-policy.js`
- `node --check scripts/i18n-coverage.js`
- `node --check scripts/generate-locales.js`
- `node scripts/generate-locales.js`
- `node --test tests/i18n-coverage.test.js`
- `npm run i18n:coverage:warn`
- `npm test`
- `npm run check`
- `npm run build`
- `rtk git diff --check`
