'use strict';

// web-ext loads its Android device bridge only for
// `web-ext run --target=firefox-android`, which this repository never runs:
// it lints and drives desktop Firefox. The real @devicefarmer/adbkit pulls in
// node-forge, whose newest release (1.4.0) still carries GHSA-86w9-cpqp-85rv,
// so package.json overrides it with this module and the dev audit stays
// clean. See scripts/dependency-overrides.json.
function unavailable() {
    throw new Error('Firefox for Android targets are not available in this checkout. '
        + 'See scripts/dependency-overrides.json (@devicefarmer/adbkit).');
}

const Adb = { createClient: unavailable };

module.exports = { default: Adb, Adb };
