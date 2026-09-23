# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P2 — View counts render in English in every locale
  Why: Theater Split's header builds its view count as a template literal ending in the
  word "views" (`_formatSplitViewCount` in `features/sticky-video-header/index.js`) and turns
  it into "watching now" for live streams with a regex on that English suffix. The Like/View
  Ratio badge in `extension/ytkit.js` (around line 25548) writes "likes from ... views" into
  its title and aria-label the same way. None of the i18n gates look inside an interpolated
  template literal, so all three passed while showing English to ar, de, ja and every other
  shipped locale, screen readers included.
  Touches: `extension/features/sticky-video-header/index.js`, `extension/ytkit.js`,
  `extension/_locales/*/messages.json`, `scripts/check-localizable-ui-copy.js`, `tests/`.
  Acceptance: WHEN the UI locale is not English, the split header's view count, its live
  "watching now" text and the like-ratio badge's title and aria-label SHALL come from locale
  keys present in all 11 locales, with the count formatted by the locale's number format;
  the live text SHALL no longer depend on matching an English suffix.
  Complexity: S

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
