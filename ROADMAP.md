# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — Finish the English UI strings built outside the copy gate's sinks
  Why: the 2026-09-23 audit swept every untagged template literal with `${}` in extension
  code and found user-facing English the UI-copy gate cannot see (copy built in a `return`,
  passed to a helper, or set on a property it does not scan). The settings panel status line
  and the SponsorBlock skip announcement are fixed; these remain, each English in all 11
  locales: Digital Wellbeing's daily-limit and break messages
  (`features/digital-wellbeing/index.js` ~380, ~394); the Subscription Groups import summary
  and its "(s)" plurals (`features/subscription-groups/index.js` ~3061-3067) and the
  "N days since newest rendered upload" reason (~1006, ~1362); the settings import summary
  and Takeout import messages in `extension/ytkit.js` (~5107-5117, ~5416, ~5425); the popup's
  service-health age ("5m ago", "never", `popup.js` `formatExternalHealthAge`); the
  installer-ready status in `features/download-ui/index.js` ~1189; the feature-bisect summary
  (`core/feature-bisect.js` ~201) and the import preview line (`core/persisted-domains.js`
  ~897). Re-run the sweep before starting: an acorn walk over TemplateLiteral nodes whose
  static text carries English words, minus logs, errors and selectors.
  Where: the files above, `extension/_locales/*/messages.json`.
  Acceptance: WHEN the UI locale is not English, each string above SHALL render from catalogue
  keys present in all 11 locales, with counts through `tCount`.
  Complexity: M

- [ ] P3 — Retire the drifted settings-panel fallback copy in ytkit.js
  Why: `attachUIEventListeners()` in `extension/ytkit.js` (~43586) delegates to the
  settings-panel module and otherwise runs a full inline copy of the panel's handlers. That
  copy only runs when the module failed to load, and it has already drifted: its reset and
  export statuses are English literals where the module now routes them through `t()`. The
  same peel was finished for Theater Split, whose monolith copy is a descriptor stub.
  Where: `extension/ytkit.js` (the inline fallback around ~43586 onward),
  `tests/ux-theming-fixes.test.js` (pins the fallback's literals), `scripts/check-monolith-peel.js`.
  Acceptance: WHEN the settings-panel module is unavailable, ytkit.js SHALL fall back to a
  stub that reports the panel as unavailable rather than to a second implementation, and the
  monolith-peel gate SHALL record the removal.
  Complexity: M

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.
