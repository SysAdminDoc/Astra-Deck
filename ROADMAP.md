# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P2 — Show storyboard thumbnails under the clip timeline
  Why: the timeline gives the shape of the clip but not what is in it, and
  YouTube already ships the sprite sheets its own seek preview uses.
  Evidence: the player response carries `storyboards.playerStoryboardSpecRenderer.spec`;
  nothing in the repo parses it today (`grep -c storyboard extension/` is 0).
  Touches: `extension/features/download-ui/index.js`, `extension/core/`.
  Acceptance: WHEN a storyboard spec is present the track SHALL show the frame
  nearest the hovered or dragged position, and WHEN it is absent or fails to
  load the track SHALL keep working with no thumbnail and no error surfaced.
  Complexity: M

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P2 — Add non-default filtering, per-setting reset, and deep links to the settings overlay
  Why: the overlay owns all 484 settings but its diff view, field filters, and per-row reset exist only in the popup, so there is no way to answer "what did I change" or link a user to one control.
  Evidence: `extension/ytkit.js:42513` (substring search only); `location.hash` appears 0 times in `ytkit.js`; reset is category-wide at `ytkit.js:41732`; the diff view lives at `extension/popup.html:208-232`; the `risk:`/`category:`/`scope:` mini-DSL at `extension/popup.js:105` filters only 19 curated toggles.
  Touches: `extension/ytkit.js`, `extension/features/settings-panel/index.js`, `extension/core/settings-controller.js`, `extension/popup.js`.
  Acceptance: the overlay offers a "changed from defaults" filter with a count, a per-setting reset with the existing undo toast, and opens directly to a named setting from a URL fragment that the popup and failure copy can link to.
  Complexity: M

- [ ] P2 — Mark untranslated strings in non-English locales
  Why: about 29% of every non-English catalogue ships byte-identical English with nothing telling the user it is untranslated, so "11 locales" overstates what a user receives.
  Evidence: `docs/i18n-coverage.md` (833-859 placeholder-identical keys per locale, 0 missing); `extension/ytkit.js:39410` (`CATEGORY_META` is hardcoded English covering 10 of 18 schema categories).
  Touches: `scripts/i18n-coverage.js`, `extension/ytkit.js`, `extension/popup.js`, `extension/_locales/*/messages.json`.
  Acceptance: the language picker states each locale's translated percentage, `CATEGORY_META` resolves through `t()` for all 18 categories, and the coverage report is the single source for the number shown.
  Complexity: M

- [ ] P2 — Refresh selector packs on a schedule instead of only on a button press
  Why: the hot-update path exists and is verified, but a user whose install broke must know to press Refresh, so the mechanism helps only users who already diagnosed the problem.
  Evidence: `extension/background.js:990` fetches the asset with a SHA-256 check and rollback; the sole trigger is the popup control at `extension/ytkit.js:6914`; the `alarms` permission is already declared and used at `extension/background.js:305`.
  Touches: `extension/background.js`, `extension/core/selectors.js`, `extension/core/settings-schema.js`, `extension/popup.html`.
  Acceptance: an opt-in periodic refresh reuses the existing digest verification and rollback, respects the same 256 KB cap, records last-check and last-success times in the popup, and makes no request when disabled.
  Complexity: M

- [ ] P2 — Let the remote selector asset carry canary rules
  Why: only 9 of 33 packs declare a canary and the hot-update path cannot add one, so a newly broken surface stays undetectable until a release ships.
  Evidence: `grep -l "canary:" extension/core/selector-packs/*.js` returns 9 of 33; `extension/core/selectors.js:418-421` replaces `SurfaceSelectorMap`/`SurfaceSelectors` and never touches `SurfacePackRegistry`.
  Touches: `extension/core/selectors.js`, `extension/core/selector-health.js`, `scripts/build-selector-asset.js`, `selector-packs.json`, `tests/selector-health.test.js`.
  Acceptance: the asset schema accepts a `canary` block per surface, applying an asset installs those rules into the registry, the same digest verification and rollback apply, and a malformed canary block is rejected without disturbing shipped packs.
  Complexity: M
