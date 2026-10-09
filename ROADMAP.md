# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — About 900 catalogue keys per locale are still English placeholders
  Why: `docs/i18n-coverage.md` shows 27.5–28.4% "placeholder identical" in every non-English
  locale (2026-10-09: 830 keys are English in all ten). Some are whole features: Watch Feed's
  name is still the retired "Persistent Queue" everywhere, and 19 `watchFeed*` keys plus
  `blockedWatch*`, `bulk*` and `aiSummary*` copy are untranslated. A user who picks German sees
  those surfaces in English.
  Where: `extension/_locales/*/messages.json`; `node scripts/i18n-coverage.js` lists them, and
  `scripts/export-i18n-proofing.js` exports a proofing sheet.
  Acceptance: placeholder-identical under 5% in every locale, starting with whole surfaces
  (Watch Feed, the blocked-channel watch page, bulk actions), with the coverage report and
  placeholder baseline regenerated.
  Complexity: L

- [ ] P3 — Finish the 2026-09-28 audit sweep
  Why: the pass covered the watch-page monolith features it touched, background, popup, side
  panel, Subscription Groups, Video Hider, Digital Wellbeing, Download UI, Video Notes and
  Studio Comments. Not yet read with the same care: `features/dearrow`, `element-zapper`,
  `player-dock`, `return-dislike`, `search-hygiene`, `sponsorblock`, `subtitles`,
  `video-insights`, `live-chat`, `sticky-chat`, `subscription-view`, and `extension/core/*`
  beyond heatmap, chapters and settings-schema.
  Where: the modules above.
  Acceptance: each module read for lifecycle symmetry, late async work after destroy, outside
  text in templates and unbound guards, with findings fixed or logged here.
  Complexity: L
