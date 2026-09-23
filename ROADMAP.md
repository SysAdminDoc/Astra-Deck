# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — Four more UI strings are English template literals that no gate sees
  Why: found while localizing the view counts. `extension/ytkit.js` builds each of these with
  English words around an interpolation, which the UI-copy gate does not inspect:
  the comment replies count (`repl${n === 1 ? 'y' : 'ies'}`, around line 11566), the
  heatmap tooltip (`${count} likes`, around 11822), the Reddit result meta line
  (`pts` and `comments`, around 30506), and the Watch Later bulk status, whose
  `t('wlwbStatusTpl', ...)` key exists in no catalogue, so every locale gets the English
  fallback (around 32615).
  Touches: `extension/ytkit.js`, `extension/_locales/*/messages.json`,
  `scripts/check-localizable-ui-copy.js`, `tests/`.
  Acceptance: WHEN the UI locale is not English, those four strings SHALL render from
  catalogue keys present in all 11 locales; the UI-copy gate SHALL fail on a new template
  literal at a strict sink whose static text carries a word outside `t()`, and on a `t()`
  key that no catalogue defines.
  Complexity: M

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.
