# Runtime Settings Copy Audit - 2026-06-05

## Scope

- `extension/ytkit.js` AI summary missing-key path.
- Retired options-page references in shipped runtime code.
- Existing popup/settings-panel contracts in `README.md`, `docs/architecture.md`,
  and `extension/manifest.json`.

## Finding

The `aiVideoSummary` provider path still threw
`Set aiSummaryApiKey first (via options page)` when a remote provider required a
BYO key. The standalone extension options page was retired in v3.19.0, and the
manifest exposes the toolbar popup plus the in-page Astra Deck settings panel as
the current settings surfaces.

## Fix

The runtime error now tells users to set `aiSummaryApiKey` in Astra Deck
settings via the YouTube gear icon or the toolbar popup `Open Full Settings`
action. `tests/hardening.test.js` now asserts shipped runtime code does not
reintroduce `via options page` guidance and still exposes the current settings
surface copy.

## Verification

- `node sync-userscript.js`
- `node --test tests/hardening.test.js --test-name-pattern="runtime settings guidance|standalone options page"`

Broader cycle verification is tracked in the 2026-06-05 autonomous loop state.
