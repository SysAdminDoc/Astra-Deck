# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — Three more UI strings render English in every locale
  Why: found while localizing the view counts. `extension/ytkit.js` still builds these with
  English words around an interpolation: the Comment Enhancements replies count
  (`repl${n === 1 ? 'y' : 'ies'}`, around line 11566, built in a `return`, which the UI-copy
  gate cannot see), the comment heat tooltip (`${count} likes`, around 11822) and the Reddit
  Comments result meta line (`pts` and `comments`, around 30506) with its `(untitled)`
  fallback. The last two sit at gate sinks but were grandfathered into the ratchet baseline.
  (Corrected 2026-09-23: this item first listed `wlwbStatusTpl` as missing from the
  catalogues; it is present and translated in all 11.)
  Touches: `extension/ytkit.js`, `extension/_locales/*/messages.json`, `tests/`.
  Acceptance: WHEN the UI locale is not English, the replies count, the heat tooltip and the
  Reddit meta line and untitled fallback SHALL render from catalogue keys present in all 11
  locales, with singular and plural counts chosen through `tCount`; the UI-copy baseline
  SHALL ratchet down by the removed literals.
  Complexity: S

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.
