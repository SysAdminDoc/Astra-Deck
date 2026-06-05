# Research Cycle 27 - Firefox web-ext release gate

Date: 2026-06-05

## Research

Mozilla's current Extension Workshop `web-ext` documentation says `web-ext lint`
should be run before trying or submitting an extension, and its command
reference documents `--source-dir` for staged extension source directories.
The `web-ext run` documentation describes temporary clean-profile installs, a
stable fit for a pre-release Firefox smoke.

The repo already patched manifests for Firefox, but that patch was only covered
by unit tests. It did not run Mozilla's linter and did not start Firefox with
the staged store-safe profile.

## Consolidation

The existing ROADMAP P1 "Cross-browser parity gate" was the single source of
truth. No duplicate roadmap item was added.

## UX / GUI Audit

This cycle had a browser-runtime UX boundary rather than a popup visual change:
the AMO-bound store-safe extension now launches in a clean Firefox profile on a
stable YouTube watch URL before release upload.

## Code Audit

The first staged `web-ext lint` run failed on:

- Non-square manifest icons: `16.png`, `32.png`, `48.png`, `128.png`.
- Firefox data-consent floor below the current Firefox Android linter support
  level.
- Raw `innerHTML` sinks in `core/trusted-html.js` and `ytkit.js`.

## Implementation

- Added `scripts/check-firefox-webext.js`.
- Added `scripts/smoke-firefox-webext.js`.
- Exact-pinned `web-ext@10.3.0`.
- Wired `check:firefox` into `npm run check`.
- Wired release workflow Firefox smoke through pinned
  `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`.
- Padded PNG icons to square canvases.
- Raised Firefox support docs and manifest patching to Firefox 142+.
- Removed the linter-visible raw `innerHTML` write paths.

## Verification

- `npm run check:firefox`: both store-safe and GitHub-full lint passed with zero
  errors, warnings, or notices.
- `npm run smoke:firefox`: local Firefox 151.0.3 installed the store-safe staged
  manifest as a temporary add-on and held a clean 25-second startup window.
- `node --test tests/firefox-injection-audit.test.js`: passed.
- `node --test tests/hardening.test.js --test-name-pattern="Firefox|manifest PNG|TrustedTypes|workflow actions"`: passed.
