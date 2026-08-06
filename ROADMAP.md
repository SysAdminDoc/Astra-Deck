# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope, and `gh release view v4.50.7` shows `AstraDownloader.exe` + `AstraDownloader.exe.sha256` already attached to that release. Only the clean-Windows-machine verification half remains blocked. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (~1.3K stars, both store listings) and BlockTube is effectively stalled (last push 2026-02-07, 484 open issues, including a MV3 service-worker-suspension defect). Astra already ships BlockTube-grade filtering, so a BlockTube migration guide is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

- `Roadmap_Blocked.md` "P0 — Tag and publish the v4.51.1 release" is **version-stale as of 2026-08-06**: `gh release list` shows the latest published release is still v4.50.7 (2026-07-28), so the item itself is live, but the tree is now at v4.51.4 and the companion has moved to SysAdminDoc/AstraDownloader (a6bb685f) — the release must NOT carry `AstraDownloader.exe` (the `companion-not-republished` / `companion-not-manifested` readiness gates enforce this). Retarget the item to v4.51.4 (or current) with extension artifacts only. Note: several other `Roadmap_Blocked.md` items name `astra_downloader/*.py` paths that no longer exist in this repo — see the 2026-08-06 audit finding "Blocked-item tracker references files removed by the companion split" below.

## Competitive Feature Additions — 2026-08-06

Sourced by diffing the top-voted OPEN feature requests of the three most
active competitors (ImprovedTube, Enhancer for YouTube, Control Panel for
YouTube — 52 issues) against Astra's 441 settings. Astra already ships ~90%
of them; only the items below survived that diff, and each was verified
absent in the tree rather than assumed. Extends the 2026-08-02 landscape in
`RESEARCH.md`, which surveyed the projects but not their backlogs.

Deliberately NOT logged, having been checked and found already shipped:
list/compact feed view, original audio track, hide watched, sub-1000-view
filter, reverse playlist, A-B loop, Shorts-to-regular-video, scroll-wheel
speed, disable hover previews, anti-translate (titles/descriptions/
transcripts), Watch Later cleanup, per-context quality, settings
import/export, popup search, Shorts scrubbing (`shortsAsRegularVideo`
already sets `video.controls = true`). Old-UI restoration remains rejected
per `RESEARCH.md` despite being ImprovedTube's #3 and #10 request — Control
Panel's equivalent broke again on 2026-07-27.

NEW-SETTING RECIPE (all 8 touchpoints or the gates fail — see repo
`CLAUDE.md`): ytkit.js defaults + feature object; `settings-schema.js` entry;
`default-settings.json`; `en/messages.json` feature_<id>_name/desc then
`node scripts/generate-locales.js`; `check-userscript-drift.js`
classification; fixture `expectedDefaulted`; the hardening SETTINGS_SCHEMA
count pin; the storage-size `totalBytes` pin. Then `npm run i18n:coverage`.

### P2 — Highest external demand

- [ ] P2 — Audio-only playback (bandwidth saver)
  Category: feature
  Where: no such setting exists — the only `audio-only` string in the tree is `downloadAudioFormat`'s description (extension/ytkit.js:30606). Adjacent: `qualityProfileMatrix`, `codecSelector`, the MAIN-world player bridge in `extension/ytkit-main.js`
  Problem: There is no way to play a video without downloading video frames. ImprovedTube #566 asks for it as a bandwidth control; it is also the single most requested capability that Astra's 441 settings do not touch in any form. The download path can already fetch audio-only, but playback cannot.
  Evidence: ImprovedTube #566 (open). Verified locally: `grep -ril audioOnly` hits only the download surface and locale files.
  Fix: Add `audioOnlyPlayback`. Prefer forcing the player to an audio-only itag through the MAIN-world bridge (the same channel `qualityProfileMatrix` uses); fall back to hiding the video element and pinning the lowest quality if the player refuses. Must survive SPA navigation and be a no-op on live streams. Show a visible state pill so a black player is never mistaken for a broken one.
  Acceptance: Toggling drops sustained bandwidth measurably on a long video; audio continues; a navigation keeps the mode; disabling restores video without a reload; live streams no-op cleanly.
  Confidence: Verified (gap); the player-API route needs a live probe
  Effort: M

### P3 — Smaller gaps

- [ ] P3 — Drive YouTube's native "Stable Volume" instead of clamping video.volume
  Category: correctness
  Where: extension/ytkit.js `disableLoudnessNormalization` (`_apply`/`_detachVideo`)
  Problem: The feature name promises YouTube's loudness normalization is off; the implementation is a `volumechange` listener that clamps `video.volume` back to 1 when it lands between 0.99 and 1, plus a data attribute for a MAIN-world bridge that never consumed it. YouTube normalizes inside a Web Audio gainNode the ISOLATED world cannot reach, so the clamp does not disable normalization — it only stops one symptom. YouTube now exposes "Stable Volume" as a real toggle in the player settings menu, which is the actual control.
  Evidence: Enhancer for YouTube #730 (open) asks for exactly this. Local: the feature's own comment concedes "Best effort — YouTube clamps the gain through movie_player APIs".
  Fix: Drive the native Stable Volume menu item structurally (iconType / menu-item position, NOT English text — see the v4.53.0 locale-independence work), keep the clamp as a fallback, and correct the description to say what it does.
  Acceptance: A fixture test drives the menu path on a non-English UI; the clamp still applies when the menu item is absent.
  Confidence: Verified (mechanism); menu shape needs a live check
  Effort: S

- [ ] P3 — Comment translation
  Category: feature
  Where: no such setting. Every existing language control is either ANTI-translate (`antiTranslate`, `antiTranslateTranscript`, `antiTranslateAudioTrack`) or track selection (`dualLanguageSubtitles`, `autoSubtitleLang`, `preferredAudioLang`, `commentLanguageAllowlist`)
  Problem: Astra can hide comments in languages you do not read (`commentLanguageAllowlist`, shipped) but cannot translate them. Subtitles are already covered by `dualLanguageSubtitles`, so the gap is comments specifically. No competitor ships this either — MouseTooltipTranslator (1.3k stars) does hover-translation generically and is the closest prior art.
  Evidence: Verified absent — `grep -ril translateComment extension/` returns nothing; the schema's language keys are enumerated above.
  Fix: `commentTranslate` + a target-language select, translating on demand per comment (a hover or click affordance, not a bulk pass). Route through the existing EXT_FETCH allowlist; a new provider origin needs a data-flow entry and a store-profile decision. The local-AI path (`localAiSummary`) is the no-new-origin option and should be evaluated first.
  Acceptance: A non-English comment translates in place and reverts; the original text is never destroyed; no new host permission in the store-safe profile.
  Confidence: Verified (gap); provider choice is the open question
  Effort: M

- [ ] P3 — Cross-tab Picture-in-Picture handoff
  Category: feature
  Where: extension/ytkit.js `popOutPlayer` (:23053-23058, Document PiP + `requestPictureInPicture`), `pipButton`, `pauseOtherTabs` (BroadcastChannel)
  Problem: `__ytkit_videoPopped` coordinates PiP between features in ONE page only. Opening a video in a second tab while a PiP window is live leaves two independent players; there is no handoff. h5player ships cross-tab PiP control and it is the one capability in that project not blocked by this repo's no-keyboard-shortcuts rule.
  Evidence: Verified locally — `__ytkit_videoPopped` is documented at ytkit.js:67 as a same-page coordination flag.
  Fix: Reuse the `pauseOtherTabs` BroadcastChannel (the transport already exists and already degrades gracefully when site-data APIs are denied) to announce PiP ownership, so a new tab can claim or decline it.
  Acceptance: Two tabs; opening PiP in the second releases the first; closing either leaves no orphan window; channel-open failure degrades to today's behaviour.
  Confidence: Verified (gap)
  Effort: M

- [ ] P3 — Configurable UI font family
  Category: feature
  Where: `uiFontSize` exists (numeric, 0 = off); `fontFamily` appears only as `subStyleFontFamily` for subtitle styling
  Problem: Font SIZE is configurable and font FAMILY is not, except for subtitles. Enhancer for YouTube #1060 asks for it; it is also an accessibility affordance for dyslexia-friendly faces.
  Evidence: Verified locally — `grep -n fontFamily extension/core/settings-schema.js` returns nothing; the only hit is the subtitles module.
  Fix: `uiFontFamily` as a constrained select (system / serif / mono / dyslexia-friendly), not a free-text field — arbitrary font-family strings are a CSS injection surface and this repo already routes user CSS through `customCssInjection` deliberately.
  Acceptance: Applies to injected surfaces and YouTube chrome; no layout break in the six rendered smoke states; empty/off is the default.
  Confidence: Verified (gap)
  Effort: S

- [ ] P3 — Decide whether embedded YouTube players on third-party pages are in scope
  Category: docs
  Where: extension/manifest.json content_scripts — matches are `*.youtube.com`, `*.youtube-nocookie.com`, `youtu.be`; `all_frames` is set ONLY on the live_chat block
  Problem: Astra does nothing to an embedded player on a third-party page. The domains are already declared, so the gap is `all_frames`, not permissions — but flipping it would run the full ~80-file bundle in every embed on the web, which contradicts the deliberate deep-equal bundle invariant in `build-fixes.test.js:41` and the performance posture. h5player's headline capability is exactly this (iframe + shadow-DOM video). It is a product decision, not a defect, and should be recorded either way so the next audit stops re-finding it.
  Evidence: Verified locally — manifest matches and `all_frames` enumerated above.
  Fix: Decide. If yes, it needs a build-time slim bundle (already deferred once, see the 2026-07-14 perf note in `CLAUDE.md`) rather than a manifest edit. If no, record the rejection in `RESEARCH.md` next to the mobile-port entry.
  Acceptance: A written decision; if rejected, a `RESEARCH.md` "Rejected Ideas" entry.
  Confidence: Verified (scope question, not a bug)
  Effort: S (decision) / L (if accepted)

### Unmined — needs its own pass

- [ ] P3 — Userscript-tier survey (Greasy Fork) — not yet performed
  Category: docs
  Where: research scope record
  Problem: The competitor diff above covers the EXTENSION tier only. The userscript tier is where experimental features appear first, and `RESEARCH.md` (2026-08-02) barely touches it. Greasy Fork returned HTTP 403 to every automated fetch during the 2026-08-06 pass, so install counts and source could not be read and no conclusion was drawn — this is an absence of evidence, not evidence of absence.
  Evidence: Named but unverified candidates: "Better YouTube Shorts", "YouTube Improvements – Layout & Video Enhancer", "YouTube Enhancer" (several unrelated scripts share the name), h5player (3.7k stars, ~80% keyboard-shortcut driven and therefore mostly out of scope under this repo's no-shortcuts rule).
  Fix: Survey via a route that is not blocked — the scripts' own GitHub repos where they exist, or a manual paste of the Greasy Fork listing. Diff against the 441-key schema the same way.
  Acceptance: Either findings logged as roadmap items, or an explicit "surveyed, nothing new" note with the method used.
  Confidence: Verified (the gap in coverage is real)
  Effort: M
