# Roadmap Blocked Items

Items moved here from ROADMAP.md because they cannot be completed programmatically and require manual/external actions.

> **Companion-scoped items:** paths beginning `astra_downloader/` and the
> `scripts/*companion*` helpers left this repository in `a6bb685f` — the
> downloader now lives in **SysAdminDoc/AstraDownloader**. Items below that
> name those paths are implemented THERE, against that repo's tree; the paths
> are kept verbatim because they still resolve inside the companion repo.

## P1 — Premise disproven, needs a product decision (2026-08-27)

- [ ] P2 — Decide whether the YouTube tab honors the Store-safe / GitHub-full profile
  Why: `isFeatureAllowedByArtifact` in `extension/ytkit.js` (~39623) reads
  `globalThis.YTKitCore?.findSettingEntry`, which no module in the tab defines
  (the schema publishes it only on `__YTKIT_SETTINGS_SCHEMA__`), so it has
  returned true since `92cd08ac` (2026-08-11). The tab shows and runs all 17
  `profile: "github-full"` settings while the popup hides them. With default
  settings `resolveEffectiveProfile` says `store-safe` even in the GitHub-full
  build, so making the lookup work would hide AI Summary, Custom CSS, Auto
  Download on Visit, the Cobalt fallback, VLC/mpv handoff, the alternative
  frontend, Video Insights, Age Restriction Bypass and Reaction Spammer from
  everyone who hasn't switched the Full profile on, and stop them running.
  Found by verification agent #5 on 2026-10-06.
  Where: `extension/ytkit.js` `isFeatureAllowedByArtifact`,
  `extension/core/policy-profile.js` `resolveEffectiveProfile`,
  `tests/isolated-runtime-core.test.js` (`NOT_IN_ISOLATED.findSettingEntry`).
  Acceptance: either the tab reads the schema's `findSettingEntry` and a
  default-profile user sees exactly the popup's list (with a CHANGELOG line
  saying where the hidden features went), or the dead filter is removed and
  the popup stops hiding them; the exemption in the test goes either way.
  Complexity: S once decided
  Blocker: owner decision. Turning the filter on takes features away from
  people using them today; removing it drops the profile split in the tab.

- [ ] P1 — Give settings operations a live region
  Why: save, import, export, and sync produce no announcement, and the toast peel is explicitly blocked on this primitive.
  Evidence: zero `aria-live`/`role="status"` in `extension/core/settings-controller.js`, `settings-sync.js`, `settings-import-transaction.js`, and `features/subscription-groups/index.js`; `extension/core/toast.js:13-17` names the missing "live-region overlay primitive" as the reason the toast DOM layer stayed in the monolith.
  Touches: `extension/core/toast.js`, `extension/core/toast-dom.js`, `extension/core/settings-controller.js`, `extension/core/settings-sync.js`, `extension/core/settings-import-transaction.js`, `extension/ytkit.js`.
  Acceptance: one shared polite live region announces settings save, import, export, and sync outcomes in the overlay and the popup; `scripts/audit-overlays-a11y.js` asserts its presence; the toast DOM layer moves out of `ytkit.js` behind the same primitive.
  Complexity: M
  Blocker: the item's premise does not hold, so it cannot be implemented as
  written. Measured 2026-08-27: both surfaces already have a polite live
  region, and the named operations already reach one.

  - The overlay's `#ytkit-panel-status` is created with `role="status"` and
    `aria-live="polite"` (`extension/ytkit.js:42257-42261`) and is written by
    22 `setPanelStatus` call sites, including category reset and its undo
    (`:41789`, `:41798`), export (`:42966`), and import with its undo
    (`:43001`-`:43052`).
  - The popup's `#status` carries `aria-live="polite"`
    (`extension/popup.html:452`) and is written by 102 `showStatus` call sites.
  - Subscription-groups announces through 50 toast calls, and
    `core/toast-dom.js:122-123` sets `role` and `aria-live` on every toast.
  - The four modules the item cites as having "zero live regions" —
    `settings-controller.js`, `settings-sync.js`,
    `settings-import-transaction.js`, `subscription-groups` — are logic that
    also runs in the service worker and under Node. They correctly own no DOM;
    the UI layer announces their results.
  - An instant-apply toggle is announced by its own `aria-checked` transition,
    which is the standard behaviour. A second announcement would be noise.

  What did ship from it: `scripts/audit-overlays-a11y.js` now pins both live
  regions and the fact that settings outcomes route through them, so removing
  either attribute fails the gate instead of silently ending announcements
  (proved by mutation).

  The decision this needs from a human: whether to consolidate the two
  per-surface regions into one shared primitive anyway. That would be a
  refactor with no user-visible gain, and adding a third region while two
  already work would make readers compete. Retire the item or restate what it
  should deliver.

## P0: Channel promotion needs a human at a screen reader (verified 2026-09-14, again 2026-09-28 and 2026-09-29)

- [ ] P0: Make release currency a blocking gate and promote the current release
  Why: v4.93.0 is the latest public GitHub release while every active channel
  still serves 4.82.0. `npm run check` reports the channel lag as a notice
  rather than a failure.
  Evidence: `scripts/run-checks.js` calls `check-versions.js` without
  `--require-release-current`; `release-channels.json` shows `active: 4.82.0`
  on all five channels; `git tag --sort=-v:refname` starts at `v4.93.0`; and
  GitHub reports v4.93.0 as Latest with 15 public assets.
  Touches: `scripts/run-checks.js`, `release-channels.json`, `CHANGELOG.md`.
  Acceptance: `npm run check` fails while any channel trails the newest tag; the GitHub-full and userscript channels are promoted to the current version with digests verified by `npm run release:channels`. Store channels stay governed by the submission items in `Roadmap_Blocked.md`.
  Complexity: M
  Done: v4.88.3 is tagged and pushed. That half mattered on its own because the
  userscript's `@require` is pinned to the commit tag `v<version>` points at
  (jsDelivr since 2026-10-10), so the tag has to exist before the records can
  name it.

  Preparation on 2026-09-14: the v4.89.0 changelog now rolls up every v4.85.0
  through v4.89.0 change since public v4.84.3. The automated release run passed
  3,085 tests, all 38 repository gates, captured startup and idle budgets, and
  every isolated browser smoke. The no-CRX build produced all 13 expected
  manifest assets plus the release manifest and checksums. A replacement CRX
  key was not generated, so the established extension identity is unchanged.

  v4.89.0 was published on 2026-09-14 from release commit `491b8d27` with the
  complete 15-file package set. `npm run release:verify-digests -- --tag
  v4.89.0` confirms every public asset matches the local build. Publication is
  complete; channel promotion has not occurred.

  v4.92.1 was published on 2026-09-28 from release commit `e89222f4` the same
  way: no-CRX build, the same 15 files, `release:verify-digests -- --tag
  v4.92.1` matched all 15. `release:readiness -- --require-pass` failed only on
  `screen-reader-evidence` (signature is a warning), so the channels still sit
  at 4.82.0. v4.90.0 through v4.92.0 were tagged but never published.

  v4.93.0 (the userscript rebuilt from the extension) was published on
  2026-09-29 from release commit `85edebbc` the same way. All 15 digests
  matched, and readiness again failed only on `screen-reader-evidence`.
  Userscript installs update through `@updateURL` on main regardless, so the
  channel lag only affects the channel feeds.

  v4.94.0 (Player Dock Repeat) was published on 2026-10-05 from release
  commit `bdf9de5e` the same way. All 15 digests matched, readiness failed only
  on `screen-reader-evidence`, and `npm run check` was 38/39 with `deps` red on
  node-forge GHSA-86w9-cpqp-85rv, which v4.95.0 cleared.

  v4.96.0 (the #51 avatar and product-picture fixes, per-card Reset, the
  isolated-world helpers AI Summary and Feed Prefilter needed) was published on
  2026-10-06 from release commit `a928d28f` the same way. All 15 digests
  matched, `npm run check` was 39/39 and 3,398 tests passed, and readiness
  again failed only on `screen-reader-evidence`.

  Blocker: the channels cannot be promoted, so the gate cannot be made
  blocking without turning `npm run check` permanently red. The chain,
  measured again on 2026-09-14:

      npm run release:health   -> status fail, promotionEligible false
        artifact-readiness       -> fail
          release:readiness      -> fail
            screen-reader-evidence -> FAIL, docs/screen-reader-evidence.json is missing

  `scripts/screen-reader-evidence.js` refuses a release whose screen-reader
  evidence is missing, thin, or stale. The release line includes UI changes,
  and producing that record means running
  `docs/screen-reader-smoke.md` against NVDA, which is the existing
  "Needs a human at a screen reader" item above.

  `scripts/release-channels.js promote` refuses while `promotionEligible` is
  false, so nothing here can be forced without overriding a gate the project
  built deliberately for this exact case.

  Order once the evidence exists: rerun `npm run release:prepare:no-crx`, then
  run `npm run release:health` and `npm run release:promote`. Add
  `--require-release-current` to the `versions` gate in
  `scripts/run-checks.js` and confirm `npm run check` is green.

## P1 — Release signing, awaiting the maintainer's key (2026-08-21)

- [ ] P1 — Publish the release signing key so `SHA256SUMS` carries a verifiable signature
  Why: releases are built locally with no CI, so `SHA256SUMS` and the artifacts share one origin — anyone who can forge an artifact forges its hash, and the checksum file on its own proves only that a download was not corrupted.
  Status (2026-08-21): the machinery is built, tested, and wired in. `scripts/release-signature.js` signs `build/SHA256SUMS` with `ssh-keygen -Y sign` under the `astra-deck-release` namespace and verifies it against the committed `allowed-signers` file; `npm run release:sign` runs inside `build:userscript` after `release:manifest`; `npm run release:readiness` carries a `release-signature` check that FAILS on a missing or invalid signature; `README.md` §Verifying a download shows the exact two-command verify; `docs/signing-keys.md` §9 covers generation, publication, rotation, and the readiness matrix. `tests/release-signature.test.js` proves the whole path end to end against a throwaway key: a valid signature verifies, a one-byte edit to the checksum file breaks it, a signature from a different key is rejected, and a signature made under another namespace cannot be replayed as a release attestation.
  What is left, and why it is blocked: one line in `allowed-signers` naming the public half of a key whose private half only the maintainer should ever hold. Generating that key unattended would produce an unpassphrased secret with no offline backup and no revocation story, published as the project's release identity — a provenance claim the project could not actually back, which is worse than the current honest "no signing key is published yet". The custody decision (passphrase, offline backup, which machine holds it) is §7's, and it is the maintainer's.
  Do this: follow `docs/signing-keys.md` §9 — `ssh-keygen -t ed25519 -C 'Astra Deck release signing' -f "$KEY"` with a passphrase, back the private half up per §7, append `releases@astra-deck ssh-ed25519 AAAA...` to `allowed-signers`, and commit. Nothing else needs changing: the readiness check flips from warning to fail on its own the moment that line exists, and `npm run release:sign` stops skipping.
  Also update: the README paragraph that currently says "No signing key is published yet" and the closing note in `allowed-signers` that says the same.
  Acceptance: `allowed-signers` names a real key; `npm run release:sign` produces `build/SHA256SUMS.sig`; `npm run release:verify-signature` reports `verified`; `npm run release:readiness` reports `release-signature` as pass; the README paragraph no longer says no key is published.
  Complexity: S
  Blocker: requires a private key the maintainer must generate and own. No code change can substitute for it.

## P2 — Needs a human at a screen reader (2026-08-25)

- [ ] P2: Require dated screen-reader evidence for UI-changing releases
  Why: static a11y gates cannot prove announcement order, focus restoration, or Blink-versus-Gecko behavior, and the current NVDA, JAWS, and VoiceOver checklist has no completed evidence record.
  Evidence: `docs/screen-reader-smoke.md`, `scripts/audit-overlays-a11y.js`, `scripts/generate-release-readiness.js`, [NVDA](https://www.nvaccess.org/download/)
  Touches: screen-reader checklist, a structured evidence schema and validator under `scripts/`, release-readiness report, tests
  Acceptance: a dated record captures Astra version, browser version, assistive technology version, surface, expected announcement, observed announcement, and pass/fail; the first record covers popup, settings, Theater Split, Transcript Q&A, and one provider degradation in Chrome and Firefox with NVDA; release readiness rejects missing or stale evidence when those surfaces change, while allowing an explicit documented not-applicable result for JAWS or VoiceOver.
  Complexity: M
  Blocker (found 2026-08-25 while implementing it): everything except the evidence itself is done and on main. `scripts/screen-reader-evidence.js` defines the record schema, validates it, and computes the verdict; `scripts/generate-release-readiness.js` carries a `screen-reader-evidence` check that fails on a missing, unparseable, incomplete, failing, or stale record; `docs/screen-reader-smoke.md` gained a section 0 explaining how to produce one; `npm run a11y:evidence` and `npm run a11y:evidence:template` are wired; and `tests/screen-reader-evidence.test.js` covers the shape and every refusal, with eight baits confirming each one fires. Running it today reports FAIL, correctly, because no record exists.
  What is left is the one thing this repository cannot produce: somebody running NVDA against Chrome and Firefox, opening the popup, the settings panel, Theater Split, the Transcript Q&A modal and one provider-degradation path, and writing down what they heard. An observation nobody made is not evidence, and generating a plausible-looking record would defeat the entire point of the item — the record exists precisely because static gates and fake-DOM key presses cannot tell you what a screen reader said.
  To finish: `npm run a11y:evidence:template > docs/screen-reader-evidence.json`, fill in the rows during a real NVDA session on both browsers, then `npm run a11y:evidence` to validate. Staleness is automatic from there — readiness re-fails for any covered surface whose source is touched after the newest record for it.
  JAWS and VoiceOver are already handled: either may be recorded as `not-applicable` with a stated reason. NVDA may not, since it is the minimum target.

## P2 — Needs a live YouTube session (2026-08-21)

- [ ] P2 — Replace the hand-rolled focus traps with `<dialog>` + `showModal()`
  Why: focus-trap, inert-background, and Escape machinery is reimplemented in five places, which is five places for the trap to drift out of agreement with the a11y gates. `<dialog>` provides all three natively and has been Baseline widely available since 2022-03-14 (Chrome 37 / Firefox 98), far below both declared floors — this is the largest safe deletion currently available.
  Evidence: `showModal(`/`<dialog` appears nowhere in `extension/` (verified 2026-08-20), while `focusTrap`/`trapFocus`/`FOCUSABLE_SELECTOR` machinery appears in `extension/popup.js`, `extension/ytkit.js`, `extension/features/settings-panel/index.js`, `extension/features/subscription-groups/index.js`, and `extension/features/digital-wellbeing/index.js`. `popover` is already used in four places, so native dismissal primitives are not new to the codebase.
  Risk to check first: `showModal()` promotes the element to the **top layer**, which YouTube also uses for its own fullscreen and native dialogs — so convert an extension-page surface (`popup.js`) before an in-page one, and verify the in-page panel still stacks correctly over the player in fullscreen and theater mode before converting the rest. If a top-layer conflict appears on YouTube, keep the in-page surfaces hand-rolled and take the win on the extension pages only; that is a partial completion, not a failure.
  Touches: `extension/popup.js`, `extension/ytkit.js`, `extension/features/settings-panel/index.js`, `extension/features/subscription-groups/index.js`, `extension/features/digital-wellbeing/index.js`, `extension/popup.css`, `extension/surface-system.css`, `scripts/audit-overlays-a11y.js`
  Acceptance: one surface converts per commit; for each, `npm run audit:overlays` and `npm run smoke:a11y` pass and the source pins that asserted the hand-rolled trap are replaced by assertions on real modal behaviour (focus enters, background is inert, Escape closes, focus returns to the invoker); `::backdrop` styling preserves the current appearance, verified by `npm run audit:contrast` reporting unchanged ratios.
  Complexity: M
  Blocker (found 2026-08-21 while starting it): the item's own staging plan is "convert an extension-page surface (popup.js) before an in-page one", and that first stage does not exist. popup.js has no convertible modal — `popup.html:20` declares `role="dialog" aria-modal="true"` on `<body>`, so the popup IS the dialog, and `<body>` cannot be given `showModal()`. Its Tab handling is what makes that declaration true rather than a lie, and `hardening.test.js` pins it deliberately. `sidepanel.html` and `sidebar.html` declare no dialog at all. `subscription-groups` no longer carries a trap, so the evidence's five files are now three.
  What is left is exactly the risky half: `extension/ytkit.js:46143`, `extension/features/settings-panel/index.js:3225`, and `extension/features/digital-wellbeing/index.js:276`, all in-page. Every one of them would be promoted into the top layer that YouTube also uses for its own fullscreen, which is the conflict the item names — and the check for it ("the in-page panel still stacks correctly over the player in fullscreen and theater mode") needs a live YouTube session with the extension loaded, a video playing, and the panel opened over it. `npm run audit:overlays` and `npm run smoke:a11y` both run locally and would pass either way; neither can see a stacking-context failure.
  Converting without that check risks a settings panel that vanishes behind fullscreen, which is a worse outcome than the hand-rolled traps this replaces. Unblocked by the P2 "Extend the existing live-Chromium harness" item, which already loads the real extension against YouTube and is where a fullscreen/theater stacking assertion belongs.

## P2 — Research-driven, externally gated (2026-08-19)

- [ ] P3 — Verify the Document PiP pop-out on Firefox 151+ and advertise it honestly
  Why: Firefox 151 shipped the Document Picture-in-Picture API, which until now made `popOutPlayer` Chromium-only. If the existing capability probe lights up on Firefox the feature reaches the second browser for free; if it does not, the capability matrix should say so rather than imply parity.
  Evidence: RESEARCH.md 2026-08-20 §Sources (MDN Document PiP, Firefox 151); `extension/core/capability-probe.js` already probes `documentPictureInPicture`.
  Touches: `extension/core/capability-probe.js`, capability matrix, README feature tables, userscript classification
  Acceptance: a live Firefox 151+ session confirms whether `documentPictureInPicture` is exposed to the extension's context on YouTube; the capability matrix and README reflect the verified answer; the userscript classification for popOutPlayer is re-derived rather than assumed.
  Complexity: S
  Blocker: needs a live Firefox 151+ browser session. Whether a spec is implemented is not the question — whether it is reachable from an extension content script on youtube.com is, and that cannot be answered by reading MDN or the source. Advertising Firefox support for a pop-out player that turns out to be unreachable is worse than the current honest Chromium-only claim, so the matrix must not move until someone has actually opened the window.

- [ ] P3 — Re-derive the like-rate tone bands against post-2026-08-24 view counts
  Why: the bands (`>=8` excellent, `>=4` strong, `>=2` steady) were calibrated against YouTube's pre-2026-08-24 view metric. From that date a view is counted at the first frame with no minimum watch time, so every denominator inflates and real like rates fall as a group — the badge grades conservatively until the bands are re-derived. The code half of this shipped 2026-08-20: the bands are an explicit frozen constant carrying the calibration note, a test pins them so a guessed edit fails, and the badge reports the raw counts it divided so the verdict stays auditable.
  Evidence: `extension/ytkit.js` `likeViewRatio._TONE_BANDS`; `tests/features/like-view-ratio.test.js`; RESEARCH.md 2026-08-20 §Security (TechCrunch 2026-08-17).
  Touches: `extension/ytkit.js` (`likeViewRatio._TONE_BANDS`), `tests/features/like-view-ratio.test.js`
  Acceptance: a sample of real watch pages gathered on or after 2026-08-24 establishes the new like-rate distribution; the bands are moved to match it in one commit that also updates the pinned test and the calibration comment; the same videos are spot-checked either side of the change so the shift is measured rather than assumed.
  Complexity: S
  Blocker: needs live post-2026-08-24 watch-page data, which does not exist yet (the metric changes four days after this item was written) and requires a browser session this repository's local-only passes deliberately exclude. Re-calibrating by guess is explicitly worse than grading conservatively, so the numbers must not move until the data exists.


- [ ] P2 — Resolve DeArrow API licensing before any store submission
  Why: dearrow.ajay.app/payment and /free state the DeArrow API is free only for non-browser-extension use — extensions are expected to carry the $1 license-key flow. Astra's dearrow feature calls `GET /api/branding` with no license handling, which is fine for an unpublished GitHub build but a licensing posture problem the moment a store listing exists (and the store-safe profile ships the feature).
  Evidence: https://dearrow.ajay.app/payment ; https://dearrow.ajay.app/free ; `extension/features/dearrow/index.js:167`. Confidence: Likely — the exact wire contract (param/header, enforcement for read-only GETs) needs confirmation against https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow before implementing.
  Touches: `extension/features/dearrow/index.js`, `extension/core/settings-schema.js` (optional licenseKey entry, backup-excluded like other credentials), `extension/_locales/**`, docs/privacy-policy.md (disclosure)
  Acceptance: the DeArrow settings surface carries an optional license-key field passed per the documented contract plus honest copy about upstream's licensing; with no key the feature either uses the documented free tier or states its unlicensed status; RESEARCH.md Open Question resolved with the confirmed contract.
  Complexity: S
  Blocker: two things this pass cannot supply. (1) The exact wire contract for a
  DeArrow license key (parameter vs header, and whether read-only `GET /api/branding` is enforced at all) is not documented in-repo and could not be
  confirmed without submitting to the live service; shipping a settings field
  that silently does nothing would be worse than the current honest absence.
  (2) Whether Astra Deck should pay for / carry a license at all is a maintainer
  product and licensing decision, in the same family as the existing
  SponsorBlock-submission item.
  Unblock by: confirming the contract against https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow
  (or by asking upstream directly), then deciding whether the key is
  user-supplied, maintainer-supplied, or the feature stays free-tier with
  disclosure. The implementation itself is small once those two are settled.

- [ ] P2 — Hide the new AI surfaces: Ask-YouTube chatbot entry points and search AI carousels
  Why: YouTube rolled the "Ask" chatbot to ALL signed-in US users on 2026-08-12 with no documented opt-out, and tested AI search carousels/"Highlights" through July — top user complaint class, and no competitor ships toggles for these yet (Unhook/BrowseWell verified absent 2026-08-19). Astra already ships `hideAiSummary` + `hideAiContextPanels` (since 4.51.1), so this is an extension of shipped features into new whitespace, not new ground.
  Evidence: RESEARCH.md §Community (socialmediatoday 2026-08-12; dead Google support thread asking how to turn it off); `extension/core/settings-schema.js:192,195`.
  Touches: `extension/core/selector-packs/**`, `extension/ytkit.js`, `extension/core/settings-schema.js` (new key(s) via the nine-places checklist), `extension/_locales/**`, `YTKit.user.js`
  Acceptance: the Ask-YouTube entry button/panel and the search AI carousel are hidden when enabled, via structural selectors captured from the live post-2026-08-12 DOM (browser-gated capture first — do NOT guess selectors; the existing `hideAiSummary` selectors get re-verified in the same capture); hide-attribution marks the hidden nodes; userscript ported or classified.
  Complexity: M
  Blocker: the item's own acceptance requires capturing the post-2026-08-12 DOM
  from a live session before writing selectors, and this repository forbids
  shipping selectors it could not verify. The Ask-YouTube chatbot is gated to
  signed-in US accounts, so the capture needs an authenticated browser session
  that is not available to an autonomous pass. Guessing renderer names here
  would produce a feature that silently does nothing — the exact failure mode
  the anti-guessing rule exists to prevent.
  Unblock by: one authenticated capture of a watch page and a search results
  page with the Ask entry point and any AI carousel present, recording their
  outerHTML (tag names, ids, stable attributes) so the selectors can be written
  from evidence. The same capture should re-verify the existing `hideAiSummary`
  and `hideAiContextPanels` selectors, which have not been checked against the
  new surfaces.

## P2 — Greasy Fork publication (2026-08-11)

- [ ] P2 — Publish the YTKit userscript on Greasy Fork
  Why: the repository-side work is complete. `YTKit.user.js` and its three
  libraries stay below Greasy Fork's 2 MiB per-record limit. Since 2026-10-10
  every `@require` and `@resource` comes from jsDelivr's GitHub mirror at a
  40-hex commit with a `#sha256=` pin, which is on Greasy Fork's CDN list
  (https://greasyfork.org/en/help/cdns), so the libraries don't need records of
  their own. The header carries accurate homepage/support/license/icon
  metadata, `@connect 127.0.0.1`, and the optional Astra Downloader companion
  disclosure.
  Blocker: creating the live Greasy Fork script record requires the
  maintainer's Greasy Fork account, authentication/2FA, and the script ID
  assigned by that service. This workspace has no such credentials or external
  account authority; GitHub installation remains usable without it.
  Needs: publish `YTKit.user.js` after a release whose records name its commit,
  then verify the live listing and the auto-update path.

## P2 — Chromium store publication (2026-08-11)

- [ ] P2 — Submit the download-free Chromium artifact to Chrome Web Store and Edge
  Why: the repository now emits `astra-deck-chromium-store-chrome-v*.zip`,
  which removes the downloader module, `downloads`/companion permissions,
  Cobalt access, and loopback origins while retaining the core YouTube
  workstation features. The build and static store-profile gates pass.
  Blocker: creating or updating live Chrome Web Store and Edge listings
  requires the maintainer's store accounts, listing assets, authentication,
  and review submission authority; Edge additionally requires government-ID
  verification. Those external credentials and decisions are unavailable to
  an autonomous coding agent.
  Needs: submit the `chromium-store` ZIP, complete the CWS/Edge privacy and
  permission forms using `docs/cws-submission-checklist.md` and
  `docs/store-permission-rationale.md`, then record the live listing URLs and
  review outcomes.

## P2 — Firefox self-distribution signing (2026-08-11)

- [ ] P2 — Sign and activate the Firefox self-update channel
  Why: the release pipeline now emits `updates.json` with a SHA-256-pinned
  `store-safe` XPI link, and the matching Firefox manifest points at the
  stable feed. Firefox will not accept or auto-update the currently released
  unsigned XPI.
  Blocker: enabling the channel requires the maintainer to choose and
  authorize Mozilla signing/self-distribution (AMO listed or unlisted),
  authenticate the publisher account, and publish the signed XPI and
  `updates.json` release assets. Those account credentials and publication
  decisions are unavailable to an autonomous coding agent.
  Needs: complete Mozilla signing, upload the signed
  `astra-deck-store-safe-firefox-v*.xpi` and `updates.json`, then verify an
  installed signed copy discovers and applies a later release.

- [ ] P3 — aria2c external-downloader option
  Why: parallel external downloading could improve throughput for some large media, but the requested integration contradicts the repository's active security invariant.
  Evidence: `astra_downloader/test_astra_downloader.py` (`Aria2cExternalDownloaderBanTests`); `CHANGELOG.md` (CVE-2026-50574 external-downloader ban).
  Touches: `astra_downloader/download.py`, provisioning, `config.py`, `health.py`.
  Acceptance: reconsider only after an upstream design demonstrably removes the manifest-download arbitrary-code-execution condition and the repository can replace its source-level ban with a verified safe contract.
  Complexity: L
  Blocker: As of 2026-07-29, the companion deliberately rejects all aria2c and `--external-downloader` integration because CVE-2026-50574 allowed arbitrary code execution through manifest downloads. Implementing this roadmap item would remove an explicit, test-pinned security boundary.

- [ ] P1 — Native-messaging download-command transport as a Chrome-LNA fallback
  Why: Chrome 142 (Oct 2025) enforces Local Network Access, which can gate/block the extension's `127.0.0.1` fetch to the companion; the token path already rides native messaging but the *download command* path is HTTP-only, so downloads can fail while auth still works. Native messaging is the LNA-immune bridge (browserpass/KeePassXC/1Password pattern).
  Evidence: RESEARCH.md 2026-07-27 §Security/Reliability + Open Questions; `astra_downloader/astra_downloader.py` (`handle_native_bootstrap_request` serves only ping/get-token); https://developer.chrome.com/blog/local-network-access
  Touches: `astra_downloader/astra_downloader.py` (native host message loop → accept download/status/queue verbs), extension `MediaDLManager` (detect localhost-fetch blocked → fall back to native transport), native-host manifest.
  Acceptance: with the extension's `127.0.0.1` fetch blocked/denied by LNA, a download can still be initiated and its status polled over the native-messaging channel; when direct fetch works, behavior is unchanged.
  Complexity: L
  Blocker: Requires a live Chrome 142+ browser to reproduce LNA blocking and verify the native-transport fallback end-to-end — same live-browser dependency as the existing "Validate Chrome LNA exemption" item. Implement + verify together once a test browser is available.

## P2 — External-binary integration + live verification (2026-07-21)

- [ ] P2 — Auto-provision the bgutil PO-token provider (single-binary) the way Deno is provisioned
  Why: Deno is already auto-provisioned but the PO-token provider is left to the user, so token-gated downloads and bot-check bypass are not available out of the box.
  Evidence: https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs; `astra_downloader/astra_downloader.py` (Deno provisioning pattern), `astra_downloader/health.py` `PoTokenProviderProbe` (probes `/ping` on port 4416 for a `version` field).
  Where: `astra_downloader/astra_downloader.py` (provisioning + SetupWorker), `astra_downloader/health.py`, config/GUI readiness, checksum verification.
  Blocker: Requires the external project's exact Windows-x64 release-asset name and checksum-manifest contract (needs a live GitHub-releases fetch), plus a persistent sidecar-process lifecycle (launch on setup, stop on exit, port/health management) that cannot be verified end-to-end without downloading and running the real binary in this environment. Shipping a binary-downloader against guessed asset names/launch flags would be unverifiable. Lower urgency now that the 2026-07-21 token-exempt client fallback (`youtube:player_client=tv,android_vr,web`) already keeps downloads working when no provider is running — this item is an optimization (restore the web+PO-token path), not a fix for total failure.

## P3 — Browser-Gated Verification (2026-07-15 audit)

- [ ] P3 — Live-chat English-only structural fallbacks need browser-gated verification
  Why: the popout-hide selector matches aria-label="Popout chat" and one tooltip test matches an English sentence; both degrade silently on non-English UI.
  Where: `extension/features/live-chat/index.js` (~20, ~146)
  Acceptance: replacement selectors are structural (attribute/renderer-based, no English text), verified against the live YouTube live-chat DOM in at least one non-English UI locale.
  Complexity: S
  Blocker: needs live-DOM verification of stable structural hooks on an actual YouTube live stream (the live-chat iframe cannot be reproduced from fixtures); changing the selectors blind risks silently breaking popout hiding for all locales.

## P0 — Legal / Distribution Decision (2026-07-14)

- [ ] P0 — Select and record the PyQt6/Qt companion redistribution route
  Why: the artifact-linked license inventory and readiness gate now identify the exact embedded/runtime components, but binary release remains blocked until the maintainer chooses GPL-compatible distribution with corresponding source or records a valid Riverbank commercial entitlement and completes the Qt notice/source obligations.
  Where: `astra_downloader/license-policy.json`, the companion repo's license inventory, release SBOM/readiness output.
  Acceptance: `pyqt6` and `pyqt6-qt6` policy entries contain the selected license expressions, non-secret approval evidence, exact notice/source routes, and approved decisions; the companion license readiness check passes without suppressions after the exact helper versions/digests are also resolved.
  Complexity: S
  Blocker: Requires maintainer legal/commercial judgment and, for the commercial route, entitlement evidence unavailable to an autonomous coding agent.

## P2/P3 — Product Decisions (2026-07-12 audit)

- [ ] P2 — Bound companion playlist downloads
  Why: `is_playlist_url` adds `--yes-playlist` with no `--playlist-end`/`--max-downloads`, so one accepted `/download` can spawn an unbounded multi-hundred-item job that holds a MAX_CONCURRENT slot and fills the confined output root; the stall watchdog never fires because an active playlist keeps producing output. Rate limiting caps request count, not per-request work.
  Where: `astra_downloader/astra_downloader.py` (`is_playlist_url` ~2764; invocation ~3266/3317).
  Complexity: M
  Blocker: Product decision — choose a sane default cap (for example `MaxPlaylistItems`, with 0 meaning unlimited). Silently capping could surprise users who intentionally download full playlists, so the default and GUI/config surface require maintainer judgment.

- [ ] P3 — Native-host token handshake assumes a single message
  Why: `NATIVE_MSG_GET_TOKEN` responds on the first `port.onMessage` and disconnects; a native host that sends a hello/handshake frame before the token reply would consume the single response slot and the real token frame would never be read.
  Where: `extension/background.js` (~947-961).
  Complexity: S
  Blocker: Protocol decision — confirm the native host never sends a pre-token frame. If it can, the client must ignore non-terminal frames until a token/terminal-error arrives or the timeout fires.

- [ ] P3 — SponsorBlock segment submission and voting
  Why: Astra reads the SponsorBlock commons (`skipSegments` GET only) with no path to contribute, and reviewers of competing tools repeatedly ask for a local correction path when a segment is wrong. DeArrow casual mode is shipped as a UI precedent; DeArrow Voting was retired in v4.98.0 because its write path never worked (see the item below).
  Evidence: `extension/features/sponsorblock/index.js:242-306` (read-only); `casualMode` precedent in `extension/features/dearrow/index.js`; https://github.com/ajayyy/SponsorBlock/issues.
  Touches: `extension/features/sponsorblock/index.js`, `extension/core/credential-vault.js` or a new durable domain for the private user ID, `extension/core/data-flow.js`, settings schema and locales.
  Acceptance: off by default and GitHub-full only; a locally generated private user ID is stored in a backup-excluded, scrub-covered domain; voting works before submission is enabled; every write is rate-budgeted and surfaces failures through `external-api-health`.
  Complexity: L
  Blocker: Requires maintainer product/liability judgment on whether Astra should carry submission at all, versus voting only or neither. The choice changes the identity, durable-storage, and outbound-write design and cannot be inferred from the repository.

- [ ] P2 — DeArrow Voting posts to a nonexistent API route with the wrong payload shape — every vote fails
  Category: correctness
  Status (2026-10-10): the toggle is retired for v4.98.0. `deArrowVoting` is in `RETIRED_SHIPPED_IDS` and both runtime strip lists, so a stored value drops on load, and the feature code, strings and tests are gone. `features/dearrow` still writes `data-ytkit-dearrow-uuid` on replaced titles. A rebuild ships under a new feature id on the contract below, once a live vote can be verified.
  Where: was extension/ytkit.js:37861-37877 (deArrowVoting._vote), removed in the retirement commit
  Problem: Votes go to `POST https://sponsor.ajay.app/api/branding/vote/${type}` with body {UUID, userID}. SponsorBlockServer exposes no /api/branding/vote/<n> route; branding votes are `POST /api/branding` with {videoID, userID, title|thumbnail, downvote}; the {UUID, userID, type} shape belongs to the segment endpoint /api/voteOnSponsorTime. Every vote 404s, so both vote buttons always show "DeArrow vote failed." The v4.51.0 audit fixed the attribute wiring that makes these buttons appear — nothing verifies the vote round-trip.
  Evidence: The only other DeArrow API use is GET /api/branding?videoID= (features/dearrow/index.js:167, ytkit.js:31172); no test covers the vote endpoint (grep branding/vote tests/ → nothing).
  Fix: POST /api/branding with videoID + the existing title/thumbnail evidence + `downvote: type === 0` per the DeArrow API docs (or remove the vote buttons if submission is out of scope — align with the Roadmap_Blocked SponsorBlock-submission product decision). Add a fetch-fake test pinning URL + payload shape.
  Acceptance: Vote requests hit /api/branding with the documented shape (test-pinned); a live vote returns 200 when verified against the real API.
  Confidence: Likely (endpoint knowledge verified against SponsorBlockServer docs; not network-verified from here)
  Effort: S
  Blocker: Fixing this means sending an outbound WRITE to DeArrow's public crowdsourced
  database (sponsor.ajay.app), and the correct payload cannot be confirmed without
  actually submitting to that production commons — a wrong shape would publish garbage
  titles into a community dataset. The repository only ever calls `GET /api/branding`,
  so there is no in-repo evidence of the write contract. It also needs the same
  maintainer product/liability judgment as "P3 — SponsorBlock segment submission and
  voting" above: whether Astra should carry outbound contributions at all.
  Unblock by: (a) deciding whether voting stays, then (b) confirming the branding-vote
  contract against DeArrow's API docs and a test submission on a throwaway userID —
  the expected shape is `POST /api/branding` with
  `{videoID, userID, service, title: {title, original}, downvote: type === 0}`, NOT the
  current `/api/branding/vote/<n>` with `{UUID, userID}` (that UUID shape belongs to the
  segment endpoint `/api/voteOnSponsorTime`). Until then every vote 404s and both
  buttons always show "DeArrow vote failed", so the feature is inert, not merely
  degraded — dropping the buttons is an equally acceptable resolution.

## P1 — Trust / Reliability / Distribution

- [ ] P1 — Chrome Web Store submission (store-safe profile)
  Why: The store-safe build profile exists and strips AI/Cobalt/loopback permissions, but has never been submitted. Every major competitor (Enhancer, ImprovedTube, Tweaks, Unhook) is CWS-published. Side-loading requires developer mode, which most users won't enable.
  Evidence: CWS review process docs; `docs/cws-submission-checklist.md` and `docs/store-permission-rationale.md` already prepared; Enhancer for YouTube and ImprovedTube are CWS precedent for 100-200+ feature YouTube extensions.
  Touches: Chrome Web Store developer dashboard, `docs/cws-submission-checklist.md`, store listing assets (screenshots, description)
  Acceptance: Store-safe profile submitted and either approved or rejected with actionable feedback.
  Complexity: M
  Blocker: Requires manual Chrome Web Store developer dashboard interaction (screenshots, listing copy, human review submission). Cannot be automated.

- [ ] P1 — Firefox AMO submission (store-safe profile)
  Why: Firefox XPI distribution currently requires manual install. AMO listing provides auto-updates, trust signal, and discoverability. Firefox 142+ manifest patch is already automated.
  Evidence: AMO updated policies (August 2025); Enhancer for YouTube lost Firefox AMO presence, creating an opportunity gap.
  Touches: AMO developer dashboard, `scripts/manifest-patch.js` output verification, store listing assets
  Acceptance: Store-safe XPI submitted to AMO and either approved or rejected with actionable feedback.
  Complexity: M
  Blocker: Requires manual AMO developer dashboard interaction (screenshots, listing copy, human review submission). Cannot be automated.

- [ ] P1 — Companion release EXE + SHA256 sidecar + clean-machine verification
  Why: The updater/setup flow requires both `AstraDownloader.exe` and `AstraDownloader.exe.sha256` on the latest GitHub release. The current latest release ships extension/userscript artifacts only, so users cannot complete the one-click companion setup path.
  Evidence: README "Astra Downloader Companion Setup" section; the companion repo owns its build and release staging; `gh release view --json assets` on the latest release lists no companion assets.
  Touches: the companion repo's build + GitHub Release assets (SysAdminDoc/AstraDownloader)
  Acceptance: `AstraDownloader.exe` and `AstraDownloader.exe.sha256` attached to a GitHub Release; the EXE runs on a clean Windows 10 machine without Python installed; `/health` returns valid JSON.
  Complexity: M
  Blocker: Requires maintainer GitHub authentication to upload the sidecar (`gh auth status` reports the SysAdminDoc token is invalid in this environment) plus manual clean Windows verification that the EXE runs standalone.

## P2 — Product decision + browser-gated (2026-08-06)

- [ ] P2 — Skip-once and per-playback segment override
  Why: SponsorBlock categories are global booleans; the most-requested
  ergonomic fix is a one-time override without changing settings.
  Evidence: SponsorBlock #1997 (20 👍).
  Where: `extension/features/sponsorblock/index.js` (`_checkSkip` ~`:348`).
  Blocker: the item's stated acceptance — "the skip toast offers 'don't skip
  this one'" — is written against a UI that DOES NOT EXIST and was removed on
  purpose. `_checkSkip` carries the comment "Skip notification removed — toasts
  over the video are distracting", and v3.23.0 replaced it with an `announceA11y`
  aria-live announcement. Implementing the acceptance verbatim would reverse
  that decision silently.
  Unblock by deciding the surface first, then verifying it in a browser:
    (a) reinstate a skip toast carrying the override button, reversing the
        no-toast rule deliberately rather than by accident; or
    (b) hang the override on the segment markers the progress bar already
        renders (`_renderBarSegments`) — clicking a marker excludes that
        segment for the current playback only. Non-intrusive and needs no new
        surface, but it is a pointer interaction over the player, so it needs
        live-browser verification alongside the other browser-gated items.
  The per-playback state itself is trivial either way (a Set keyed by segment
  UUID, cleared on navigation); the surface is the whole decision.

## P3 — Discovery (2026-08-06)

- [ ] P3 — Set the repository social-preview image
  Why: the description, homepage and 14 topics were refreshed programmatically
  on 2026-08-06 and are recorded in `docs/repo-settings.md`; the social-preview
  image is the one remaining piece of discovery metadata still unset. It is what
  renders when the repo is linked from anywhere outside GitHub.
  Where: repository Settings -> General -> Social preview.
  Acceptance: an image is set and `docs/repo-settings.md` records what it is.
  Complexity: S
  Blocker: Upload-only. GitHub exposes no REST endpoint for the social-preview
  image, so it cannot be set from `gh api` — it needs a maintainer with the
  Settings page open. Everything else in that roadmap item is done.

## P2 — Documentation

- [ ] P2 — Competitor migration documentation
  Why: Iridium (1,300 GitHub stars) was archived Jan 2026 with orphaned users seeking alternatives. Enhancer for YouTube abandoned Firefox (510K users) in Aug 2025. Landing pages with settings-import guides would capture these users at zero feature development cost.
  Touches: `docs/migration-from-iridium.md`, `docs/migration-from-enhancer.md`, README.md
  Acceptance: Each migration doc maps the competitor's top features to Astra Deck equivalents with install instructions.
  Complexity: S
  Blocker: Requires creating new markdown documentation files. Maintainer-authored content for migration guides.

- [ ] P2 — Supply chain transparency documentation
  Why: Post-ShadyPanda (4.3M users compromised Dec 2025), Astra Deck's open-source audit trail and SBOM/attestation pipeline are differentiators not documented for end users.
  Touches: `docs/supply-chain-transparency.md`, README.md
  Acceptance: Page documents audit trail, SBOM, attestation, credential scrub, profile-split permissions, and release integrity verification.
  Complexity: S
  Blocker: Requires creating new markdown documentation files. Maintainer-authored trust documentation.

## P3 — Blocked on External API Stability

- [ ] P3 — Chrome Writer/Rewriter API for comment drafting
  Why: Chrome's Writer and Rewriter APIs offer on-device text generation and refinement. When stable, they could power comment drafting assistance without BYO keys.
  Touches: `extension/ytkit.js` (comment composer enhancement), `core/capability-probe.js`, settings schema
  Acceptance: When Writer API is available, a "Draft" button appears in YouTube's comment composer; responses generated on-device; feature off by default.
  Complexity: M
  Blocker: Chrome Writer/Rewriter APIs are in Developer Trial as of June 2026, not yet stable. Implementing against an unstable API surface creates maintenance burden.

## P1 — Browser-Gated

- [ ] P1 — Validate Chrome Local Network Access exemption for companion communication
  Why: Chrome 142+ gates content-script-to-localhost fetch behind a user permission prompt. Chrome 147+ extends this to WebSocket. The extension communicates with the companion via `fetch()` to `http://127.0.0.1:9751` (and 5 fallback ports). The manifest has explicit `host_permissions` for these origins, which should exempt the extension from the prompt — but this has never been verified on Chrome 147+. If the exemption doesn't hold, companion communication silently breaks for users on Chrome 147+.
  Evidence: Chrome What's New in Extensions (Local Network Access, Chrome 142/146/147); manifest.json `host_permissions` includes `http://127.0.0.1:9751/*` through `9851/*`.
  Touches: Manual testing on Chrome 147+. If exemption fails: `extension/manifest.json` (add `optional_host_permissions`), `extension/core/optional-host-permissions.js`, `extension/ytkit.js` (MediaDLManager.check flow).
  Acceptance: Companion health check and download flow work on Chrome 147+ without user-visible permission prompt. If prompt is needed, document the flow and surface a diagnostic message.
  Complexity: S (if exempted) / M (if not)
  Blocker: Requires loading the extension in Chrome 147+ and verifying companion communication with a running Astra Downloader instance. Cannot be tested without a live Chrome 147+ browser.

## P2 — Browser-Gated

- [ ] P2 — Selector fixture refresh for Delhi Modern player
  Why: YouTube's "Delhi Modern" player rollout (Oct 2025–Jan 2026) changed player button DOM to translucent overlay buttons. The selector packs have canaries for `ytp-delhi-modern` but the MHTML fixture may predate the completed rollout.
  Touches: `scripts/capture-watch-mhtml.js`, `scripts/build-selector-fixtures.js`, `tests/selector-regression.test.js`, `core/selector-packs/playerChrome.js`
  Acceptance: Selector fixture regenerated from a live 2026-era YouTube watch page. All critical playerChrome/playerSettings selectors match.
  Complexity: S
  Blocker: Requires a live Chrome browser to capture MHTML from YouTube. Browser binaries not available in this environment.

## P2 — Observability / Developer Experience

- [ ] P2 — Visual regression testing for popup
  Why: The popup is the primary user-facing control surface. CSS changes, i18n string length variations, and Chrome version differences can cause visual regressions that unit tests cannot catch.
  Evidence: No visual regression tests in the codebase; popup has been through multiple redesigns (v3.11, v3.19, v4.x).
  Touches: New `tests/visual/` directory, Puppeteer screenshot comparison, local visual test command
  Acceptance: Local visual tests capture popup screenshots in Chrome and Firefox; a baseline is committed; regressions fail the local check with a diff image.
  Complexity: M
  Blocker: Requires headless Chrome/Firefox with Puppeteer installed to capture baseline screenshots. Browser binaries not available in this environment.

## P2 — Browser-Gated (CSS Adoption)

- [ ] P2 — Customizable `<select>` adoption for settings panel
  Why: Chrome 135+ supports `appearance: base-select` for styled native dropdowns.
  Touches: `extension/ytkit.js`, `extension/popup.css`, `extension/early.css`
  Acceptance: Settings panel `<select>` elements render with dark-theme styling on Chrome 135+. Unsupported browsers fall back to native `<select>`.
  Complexity: S
  Blocker: Requires live browser testing on Chrome 135+ to verify progressive enhancement and cross-browser fallback. Cannot verify without a running browser.

- [ ] P2 — `@starting-style` adoption for panel entry animations
  Why: `@starting-style` (Baseline 2025) would replace JS rAF timing hacks for toast/panel animations with pure CSS.
  Touches: `extension/ytkit.js`, `extension/popup.css`, `extension/core/toast-dom.js`
  Acceptance: Panel/toast animations use `@starting-style` with `transition-behavior: allow-discrete`.
  Complexity: S
  Blocker: Toast CSS is duplicated in both the monolith and toast-dom.js (userscript parity). Requires live browser verification that the CSS fallback degrades gracefully on older browsers. Cannot verify without a running browser.

- [ ] P2 — Exclusive Accordion for settings categories
  Why: `<details name="settings">` would create accordion behavior for settings categories.
  Touches: `extension/ytkit.js` (settings panel DOM construction)
  Acceptance: Settings categories use `<details name="ytkit-settings">`.
  Complexity: S
  Blocker: The settings panel uses a sidebar-tab navigation model, not vertical collapsible sections. Adopting `<details name>` would require restructuring the panel's DOM architecture. Requires live browser verification of the new layout.

## P1 — Security Product Decisions (2026-07-08 audit)

- [ ] P1 — Companion `/health` echoes the auth token to any co-installed
  extension by default
  Why: `LegacyHealthTokenEcho` defaults on and `is_extension_origin` accepts any
  `chrome-extension://` / `moz-extension://` origin (no ID allowlist), and CORS
  reflects that origin — so any other installed extension can spoof the
  `X-MDL-Client: MediaDL` header, read the reflected `token`, and drive
  `/download`. Default the echo off once the native-messaging bootstrap is the
  confirmed primary path for existing users, or gate on a configured extension-ID
  allowlist. (Impact bounded: YouTube-only URL gate, output-dir confinement.)
  Where: astra_downloader/astra_downloader.py (~3661-3810)
  Blocker: Product decision — changing the default breaks any non-native-messaging
  client that relies on the HTTP token echo. Needs confirmation that the
  native-messaging bootstrap is the primary path before defaulting off.

- [ ] P3 — Unauthenticated `/health` leaks recent log lines (local paths / errors)
  Why: `recentErrors` (last 20 log messages, absolute paths and error text) is
  in the fully-unauthenticated `/health` payload. Gate behind auth or redact.
  Where: astra_downloader/astra_downloader.py (~3791)
  Blocker: Product decision — gating /health output behind auth changes the API
  surface used by extension diagnostics panels. Needs design decision on what
  to expose vs gate.

## P2 — Userscript Structural Drift (Browser-Gated)

- [ ] P2 — Establish one canonical implementation per extracted extension feature
  Why: The extension-only download UI is canonical as of commit `0ee9e49`, but every remaining extracted module is shared with the generated userscript; deleting those fallbacks before the stale userscript bundle is repaired would break a shipped vehicle.
  Evidence: `extension/manifest.json`, `extension/ytkit.js`, `extension/features/*`, `scripts/sync-userscript.js`, `scripts/check-userscript-drift.js`.
  Touches: feature registry/composition, extracted modules, monolith fallback blocks, userscript bundle generation, behavioral boundary tests.
  Acceptance: each migrated shared feature has one source implementation consumed by extension and userscript; explicit exclusions remain tested; duplicate fallback code is deleted; manifest/generated-bundle drift and lifecycle parity fail CI; migration proceeds in reviewable feature-sized batches.
  Complexity: XL
  Blocker: All remaining extracted modules are bundled into the userscript. Resolve the stale userscript settings/import contract below and verify the regenerated bundle in a Tampermonkey browser session before removing any remaining shared fallback.

- [ ] P2 — Verify the ported userscript settings/install-assist methods in Tampermonkey
  Why: NARROWED 2026-08-06. This item previously predicted that regenerating the
  bundle *would* break Import. That has already happened and shipped: the bundle
  was resynced, and `YTKit.user.js` now calls five methods it does not define
  (`importAllSettingsDetailed`, `undoLastSettingsImport`,
  `importYouTubeTakeoutWatchHistory`, `runInstallAssist`, `copyInstallCommand`) —
  each appearing exactly once, at the call site. The **porting work is programmatic
  and is now tracked in `ROADMAP.md` as "P0 — Port the five monolith methods the
  bundled settings panel calls but the userscript does not define"**; do not do it
  from here. What remains blocked is only the confirmation half.
  Where: YTKit.user.js, extension/features/settings-panel/index.js, sync-userscript.js
  Acceptance: after the P0 lands, a real Tampermonkey (or Violentmonkey) session
  drives Import, import-Undo, Takeout import, companion install-assist and
  copy-install-command and each returns a result rather than throwing.
  Blocker: Requires a running browser with a userscript manager installed. The
  static half is covered by the P0's symbol-resolution gate; only the in-browser
  behavioural confirmation needs the vehicle.

- [ ] P2 — Side-panel toggles bypass optional-host permission + profile gating
  Why: side-panel `writeSetting` does not call `requestOptionalHostsForSetting`,
  so enabling an API-backed feature (SponsorBlock/DeArrow) reports success while
  the feature silently no-ops without host access. Mirror the popup gating.
  Where: extension/sidepanel.js (~437-453)
  Blocker: Requires browser verification that `chrome.permissions.request()` works
  from the side panel's user-gesture context. Cannot verify without a running browser.

- [ ] P1 — MAIN-world audio graph reconnect needs browser verification
  Why: The WeakMap-cached source node fix (shipped in v4.46.29) is architecturally
  correct but needs verification that YouTube's persistent <video> element + SPA
  navigation actually triggers the reconnect path and that audio passthrough
  works correctly with the gain-bypass idle mode. Verify with any audio feature
  (volume boost, mono-to-stereo, normalization) across two video navigations.
  Where: extension/ytkit-main.js (~395-512)
  Blocker: Requires loading the extension in Chrome/Edge with audio features
  enabled and navigating between videos to verify audio continuity.

## P1 — Documentation Publication Constraint (2026-07-14)

- [ ] P3 — Filmot deleted-video title restore (GitHub-full)
  Why: Restoring titles of deleted/private playlist entries is uniquely valuable for old playlists; external API so GitHub-full only.
  Evidence: Filmot Title Restorer (Jopik1, 4.5k).
  Touches: playlist rendering path, data-flow registration, external-api-health.
  Acceptance: On playlists, [Deleted video] rows optionally resolve via Filmot with cache + rate budget; store-safe artifacts strip the host grant automatically.
  Complexity: M
  Blocker: Repository research names the userscript but contains no verified Filmot host, request/response schema, public API terms, or fallback contract. This development pass forbids fresh research, so implementing an endpoint would be speculative.

## Audit scope records (not implementable work)

These two entries are the honest scope records the 2026-08-05 and
2026-08-06 audit passes left behind: they say which surfaces were NOT
examined, so the next audit starts where the last one stopped. They are
kept verbatim.

Blocker: Not implementation work. Closing them means scheduling and
running an audit pass over the listed surfaces, which is a research /
planning activity rather than a roadmap item a coding agent can drain.
Every actionable finding those passes produced has been implemented and
deleted from ROADMAP.md; what remains here is the coverage ledger.

- [ ] P3 — Unaudited — needs a pass
  Category: docs
  Where: repo-wide
  Problem: This pass concentrated on the companion (Python, Qt GUI, HTTP routes) and the extension/userscript code paths that consume companion state. The following were not audited and should not be assumed clean: `extension/ytkit.js` feature internals beyond the download surface (~35k lines); the settings-panel, subscription-groups, video-hider, sponsorblock, dearrow and live-chat feature modules; `extension/popup.js` and `sidepanel.js` interaction flows; the MV3 background service-worker lifecycle; `build-extension.js` and the release/SBOM scripts; the extension's own theming across YouTube light/dark (its `audit:contrast` and `audit:a11y` gates pass, which is evidence but not a substitute for driving the surfaces); and Firefox-specific behaviour. The companion's own dark-only palette was checked for text contrast and passes (`muted`/`fieldHint` #8d97a4 → 6.57:1, `toolbarMeta` #aab2bd → 9.09:1 on the #0a0d12 window; disabled-state colours are below 4.5:1 but are WCAG-exempt), so no contrast finding is logged for it.
  Evidence: Scope of this pass, recorded honestly so the next audit starts where this one stopped.
  Fix: Schedule a pass per area, driving the extension surfaces in a real browser rather than reading them.
  Acceptance: Each listed area has either findings or an explicit "audited, clean" note with the method used.
  Confidence: Verified
  Effort: L

- [ ] P3 — Unaudited residue from this pass
  Category: docs
  Where: repo-wide
  Problem: Honest scope record. Not line-audited this pass: ~1,800 lines of pure-CSS template literals in ytkit.js (watchPageRestyle interior detail, chat-style premium layers, popup/dropdown theming — surveyed structurally only); the settings-panel module's full 3.4k lines (repeatedly audited before; skimmed); sticky-video's full 5k lines (lifecycle spot-checked); download-ui's full 2.9k lines (spot-checked); Firefox-specific runtime behavior beyond the manifest-patch/static gates; live-browser verification of every finding marked Needs-repro (the blocked "Live-browser behavioral audit" item covers the vehicle). The companion (AstraDownloader repo) is out of scope here by design.
  Fix: Fold the CSS-literal interiors into the light-theme lane work above; keep the rest on the existing blocked live-browser item.
  Acceptance: Next audit starts from this record.
  Confidence: Verified
  Effort: S

## Browser-gated — 2026-08-06

- [ ] P3 — Drive YouTube's native "Stable Volume" toggle
  Blocker: The Stable Volume control lives in the player's gear menu, which
  YouTube renders LAZILY on click. It is absent from every captured fixture in
  this repo (`tests/fixtures/yt-watch.tokens.txt` has the `ytp-menuitem*`
  classes but no menu contents), and the classic player chrome carries no
  Polymer `data`, so there is no iconType or endpoint to match on the way the
  feed menus offer. Writing a matcher without seeing the real markup would be
  guesswork of exactly the kind this repo's audit rules forbid — and matching
  the English label is what the v4.53.0 locale-independence pass just removed
  everywhere else.
  Needs: one live watch page with the settings menu open, capturing the
  Stable Volume menuitem's outerHTML (its icon path `d`, `role`, `aria-checked`
  and any stable class) in all of one LTR, one RTL and one CJK locale. With
  that, the matcher is small and this returns to ROADMAP.md.
  Shipped in the meantime (v4.54.0): the feature no longer CLAIMS to disable
  loudness normalization. It was renamed "Keep Volume At Full" and its
  description now states the limitation — the normalization gain runs in a Web
  Audio node neither world can reach, and the "MAIN-world bridge" its comment
  promised was never built. Pinned by
  `tests/features/audio-only-playback.test.js`.

- [ ] P3 — Drive YouTube's native "Stable Volume" instead of clamping video.volume
  Category: correctness
  Where: extension/ytkit.js `disableLoudnessNormalization` (`_apply`/`_detachVideo`)
  Problem: The feature name promises YouTube's loudness normalization is off; the implementation is a `volumechange` listener that clamps `video.volume` back to 1 when it lands between 0.99 and 1, plus a data attribute for a MAIN-world bridge that never consumed it. YouTube normalizes inside a Web Audio gainNode the ISOLATED world cannot reach, so the clamp does not disable normalization — it only stops one symptom. YouTube now exposes "Stable Volume" as a real toggle in the player settings menu, which is the actual control.
  Evidence: Enhancer for YouTube #730 (open) asks for exactly this. Local: the feature's own comment concedes "Best effort — YouTube clamps the gain through movie_player APIs".
  Fix: Drive the native Stable Volume menu item structurally (iconType / menu-item position, NOT English text — see the v4.53.0 locale-independence work), keep the clamp as a fallback, and correct the description to say what it does.
  Acceptance: A fixture test drives the menu path on a non-English UI; the clamp still applies when the menu item is absent.
  Confidence: Verified (mechanism); menu shape needs a live check
  Effort: S

## Roadmap cleanup — 2026-08-10 — ROADMAP.md

**Blocked on:** The source roadmap marked this work as parked, optional, or dependent on external input.

Blocked items moved from the actionable roadmap:

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.


- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope. Only the clean-Windows-machine verification half remains blocked, and the asset itself now ships from `SysAdminDoc/AstraDownloader`. Rewrite the blocker accordingly.


- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (last real commit 2024-09-18) and its users are being routed to Enhancer, Unhook and Zenith — none of which is OSS-and-maintained, so there is no OSS successor. BlockTube is stalled (last push 2026-02-07, 484 open issues). A BlockTube migration guide plus an Iridium-successor note is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.


- `Roadmap_Blocked.md` "P3 — Chrome Writer/Rewriter API" is correctly blocked (still Developer Trial), but it should **not** be read as covering Chrome's built-in AI generally: Translator, Language Detector, Summarizer and the Prompt API have been **stable in extensions since Chrome 138**. That lane is unblocked and is tracked separately below.

## P1 — Premise disproven, needs a product decision (2026-09-05)

- [ ] P1 — Retire the inert panel stylesheets from `ytkit.js`
  Why: `docs/architecture.md:157` §9 states the legacy panel sheets are overridden by
  `core/settings-visual-system.js` for almost every selector, that editing them changes
  nothing visible, and that panel CSS cannot be reasoned about by reading. Seven of the
  last 200 commits are light-theme and surface repair (`84b95890`, `9f9ae66f`,
  `9ed81851`, `42ad587a`, `b5a4950d`, `89660ce7`, `749f4eea`).
  Evidence: `injectPanelStyles()` spans `extension/ytkit.js:43790-45199` (1,410 lines);
  `scripts/probe-panel-colors.js:101-147` already reports, per surface, the computed
  value and the sheet index that supplied it. Distinct from the blocked item
  "Establish one canonical implementation per extracted extension feature", which owns
  the duplicate `buildSettingsPanel()` DOM builder and needs a live Tampermonkey session;
  this half is verifiable headlessly. `PALETTE_CSS` at `ytkit.js:43680` is eager and
  load-bearing and must not be touched.
  Touches: `extension/ytkit.js`, `extension/core/settings-visual-system.js`,
  `scripts/probe-panel-colors.js`, `tests/settings-visual-system.test.js`,
  `tests/ytkit-token-definitions.test.js`.
  Acceptance: `npm run probe:panel-colors` reports no surface whose winning carrier is a
  legacy sheet, every declaration that did win has been ported into
  `settings-visual-system.js`, the legacy sheets are deleted, the reported stylesheet
  count drops, and `audit:contrast`, `audit:light-theme`, `smoke:light-surfaces` and
  `smoke:theme-controls` all pass unchanged in both themes.
  Complexity: L
  Blocker: the sheets are not inert, so "retire" is not a deletion and the
  acceptance criterion as written would ship a broken panel. Measured
  2026-09-05 with `node scripts/probe-panel-colors.js --legacy-audit`, which
  was added for this item.

  - **206 rules carrying 1,544 declarations across 3 legacy sheets set
    properties the visual system sets on no element those rules match.** They
    are not colour: they are `min-height`, `flex-wrap`, `row-gap`/`column-gap`,
    `margin`, `padding`, `font-size`, `line-height`, `letter-spacing`,
    `text-transform`, `-webkit-line-clamp`, `white-space-collapse`, `position`,
    `transform` and `box-sizing`, on `.ytkit-badge`, `.ytkit-search-*`,
    `.ytkit-nav-meta` (11 elements), `.ytkit-feature-meta` (217 elements),
    `.ytkit-feature-badge` (220 elements) and the brand header.
  - The visual system covers **painting** — backgrounds, borders, shadows,
    accent surfaces — on the surfaces it claims. The legacy sheets still carry
    the panel's **structure**. `docs/architecture.md` §9 has been corrected in
    place to say so, with the measurement, so the next reader does not
    re-derive this.
  - The probe also disproves the narrower reading. Legacy `sheet#56` is still
    the only carrier of `.ytkit-nav-btn.active`'s background, and is the
    winning carrier of `transparent` for `.ytkit-content`,
    `.ytkit-feature-card` and `.ytkit-sub-card`.
  - What is actually available here is a **port**, not a retirement: move 1,544
    declarations into `settings-visual-system.js` in reviewable batches, each
    batch re-verified with `--legacy-audit` plus the contrast, light-theme and
    theme-control lanes, until the audit reports zero. That is a different item
    with a different size, and it needs a decision on whether a panel-CSS
    consolidation of that scale is worth the regression risk against a product
    whose release channels are already six versions behind.
  - Three defects in the probe itself were fixed to get this measurement
    (`1a4c384a`): a two-slash `file://` URL that parsed `C:` as the URL host, a
    missing `--allow-file-access-from-files` that stopped the module graph
    loading, and an EPERM from the cleanup `finally` that replaced every real
    error with a temp-path permission message.

## P2 — Needs a human at the machine (2026-09-05)

- [ ] P2 — Prove OS media controls survive the Web Audio graph
  Why: Astra routes YouTube's `<video>` through a Web Audio graph whenever any of six
  audio features is on, and has no Media Session code at all, so hardware media keys and
  the OS media panel are an untested casualty of a feature most users leave enabled.
  Evidence: `extension/ytkit-main.js:1549` calls `createMediaElementSource(video)` for
  mono-to-stereo, `volumeBoost`, normalization, auto-gain, high-pass and sync offset;
  `grep -ri "mediaSession|media key|SMTC"` returns zero hits across `extension/`,
  `docs/`, `ROADMAP.md` and `Roadmap_Blocked.md`; SponsorBlock issue #2543 (2026-09-01)
  reports exactly this failure class in a YouTube extension on Firefox.
  Touches: `extension/ytkit-main.js`, `extension/core/player.js`, a new probe under
  `scripts/`, `tests/`.
  Acceptance: a headless probe asserts that `navigator.mediaSession.metadata` and the
  play/pause/seek action handlers are still populated after the audio graph attaches and
  after it is torn down; if the graph is found to clear them, the MAIN world restores
  metadata and handlers from the player state; the manual result of pressing a media key
  with `volumeBoost` on and off, in Chrome and Firefox, is recorded in
  `docs/platform-api-adoption.md` with its date either way.
  Complexity: M
  Blocker: the headless half of the acceptance cannot substantiate the claim,
  and the half that can needs a person pressing a key. Determined 2026-09-05.

  - **Media Session is a write-only surface to the page.** `metadata`,
    `playbackState`, `setActionHandler` and `setPositionState` are all things a
    page *sets*. There is no API that reports whether the browser is currently
    publishing a media session to the OS, which is the thing at risk. A probe
    asserting `navigator.mediaSession.metadata` is populated would only be
    asserting that something in the page set it, and would pass or fail
    identically whether or not Windows SMTC had stopped receiving anything.
  - It would also read null in any fixture, because the code that sets it is
    YouTube's own player, not Astra. `grep -ri mediaSession extension/` is 0.
  - So the assertion as written is not a proof of the property. Writing it would
    produce a green check that means nothing, which is worse than no check.
  - **What actually settles it:** open a YouTube video, press the hardware
    play/pause key, then enable `volumeBoost` (which is what attaches
    `createMediaElementSource`) and press it again. Repeat in Firefox. If the
    key stops working, or the Windows media flyout stops showing the video, the
    graph is the cause and the fix is for the MAIN world to set
    `navigator.mediaSession.metadata` and the play/pause/seek handlers from the
    player state. Record the result either way, with its date, in
    `docs/platform-api-adoption.md`.
  - Recording a NEGATIVE result matters as much as a positive one here: an
    untested negative is how the next audio change breaks this silently.

## P2 — No verifiable fixture (2026-09-05)

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
  Blocker: the spec format cannot be verified against anything this repository
  holds, and the tool that would produce a fixture carrying one is itself
  broken. Measured 2026-09-05.

  - **No capture contains a storyboard spec.** `playerStoryboardSpecRenderer`
    appears in none of the seven files in `mhtml/`. The only "storyboard" hits
    are a `web_l3_storyboard` experiment flag in `WatchPage.mhtml` and
    `.ytPlayerStoryboardHost` CSS class names in `EmbedPlayer.mhtml`.
  - **A fresh capture cannot supply one either.** A live
    `capture-watch-mhtml.js --surface watch` run on Chrome 152.0.7977.83 wrote a
    4.4 MB file with **zero** `<script` tags, so it carries no player response at
    all. That regression is now its own P1 in `ROADMAP.md`; until it is fixed,
    the fixture path cannot produce the data this item needs.
  - What is NOT blocking, recorded so the next attempt does not re-derive it:
    the image origin is already permitted (`https://i.ytimg.com` is in
    `manifest.json` host permissions, the extension-pages `connect-src`, and the
    `data-flow.js` origin catalogue at `:148`), and the hook point is settled —
    `secondsFromClientX` in `extension/features/download-ui/index.js:658` already
    converts a pointer position to a timestamp for both hover and drag, and
    `getPlayerResponseGlobal()` is already an injected dependency of that module.
  - What would unblock it: either the capture tool preserving inline scripts
    again, or a decision that a fail-closed parser written against the published
    spec format is acceptable without a fixture proving the happy path. The
    second is a judgement call, not a coding one: every negative branch is
    testable today, and only the branch that actually draws a frame is not.

## P3 — Needs a browser run, which waits for the owner's word (2026-10-09)

Standing rule since 2026-10-07: no builds, test runs, smokes or browser launches
without the owner asking. Each item below has its code side done or has none, and
what's left is a live run.

- [ ] P3 — Userscript: confirm a blocked channel hides in the watch sidebar
  Why: the 2026-10-05 research pass said the userscript had no MAIN-world bridge, so
  sidebar cards would name no channel there. That premise was wrong: the host runs
  `core/bridge-token.js` and then injects the page-world bundle (bridge channel,
  `core/feed-prefilter.js`, `ytkit-main.js`) with `GM_addElement`, and the ISOLATED
  runtime loads `parseLockupChannels`. `tests/lockup-channel-tags.test.js` runs the
  tagger from the shipped `YTKit-core.user.js` bundle and sees the tag land once the
  hider publishes `data-ytkit-lockup-channels-on`.
  Blocker: the acceptance is a live run under a real manager (Tampermonkey or
  Violentmonkey), which needs the owner's word. A manager without `GM_addElement`
  runs the ISOLATED runtime alone and has no page-world features at all, sidebar
  tags included.
  Acceptance: WHEN the userscript runs and a blocked channel's video is in the watch
  sidebar, THEN it SHALL hide.

- [ ] P3 — Live-check the channel landing tab after an in-app move
  Why: 2026-10-09 shipped the fix code-only. The rule waits for the tab list
  `yt-navigate-finish` brings (`_rw.navigatedChannelTabs`), reads the document's load
  path from the Navigation Timing entry (`HARD_LOAD_PATH`), and lands on Videos after
  3 s if nothing arrives (ytkit.js booted after the move). The first attempt passed
  unit tests and failed live. Also check the URL forms a 2026-10-09 review flagged:
  `channelHasTab` compares the channel base as an exact string, so `/channel/UC…`,
  `/c/`, `/user/`, a differently capitalised handle or a percent-encoded one never
  equals the payload's `/@Handle` and lands on Videos even when the tab exists.
  Where: `extension/ytkit.js` (`documentLoadPath`, `captureNavigatedPageData`,
  `channelHasTab`, `redirectToVideosTab`), `tests/channel-landing-tab.test.js`.
  Blocker: headless Chromium with the staged extension on live YouTube.
  Acceptance: WHEN Channel Landing Tab is Live and the user clicks `/@NASA` from search
  results, THEN the page SHALL end on `/@NASA/streams`; WHEN the click lands before
  ytkit.js boots, THEN it SHALL end on `/@NASA/videos` within about 3 s; and a
  `/channel/UC…` link to a channel with a Live tab SHALL end on its Live tab.

- [ ] P3 — Follow-ups from the 2026-10-09 drain review
  Why: a read-only review raised these as plausible but unconfirmed. Each needs a live
  page to settle.
  - Upcoming wording: with bare "premiere" gone, a French or German premiere card with
    no "À venir"/"Bevorstehend" badge no longer reads as upcoming in Video Hider, and
    pt_BR has only "programado para" (`core/text-metrics.js` `UPCOMING_CARD_PATTERN`).
    The Arabic badge's real wording is unpinned too (قادم and قادمة both match now).
  - Still Watching: if YouTube reopens the same closed prompt, the `yt-popup-opened`
    handler may run before layout, the on-screen gate refuses it, and the observer
    (child-list only) never retries. Separately, the player's Play button is still
    tried before the prompt's own confirm button, and the confirm button isn't looked
    up inside the gated dialog (`autoDismissStillWatching` in `extension/ytkit.js`).
  - Audio track: a track list that fills in after `canplay` (paused or autoplay-off
    loads) gets no retry until a later `playing` or player-state event
    (`core/audio-track.js` `apply`).
  Blocker: each needs live YouTube in headless Chromium.
  Acceptance: each case reproduced live and either fixed with a fixture test or shown
  not to happen, with the result written here.

- [ ] P3 — Surfaces the 2026-09-28 polish pass didn't reach
  Why: that pass covered the Command Deck, popup, side panel, download panel, Video
  Hider, transcript states, comment search, toasts and the Theater Split captures.
  These got no light/dark and state review: the live chat enhancements, the AI summary
  and Transcript Q&A dialogs, the Subscription Groups manager, the player right-click
  menu, the SponsorBlock segment UI, the Digital Wellbeing prompts, and (new on
  2026-10-09) the userscript panel's release note.
  Where: `extension/live-chat.js` / `live-chat.css`, `extension/ytkit.js`
  (`aiVideoSummary`), `extension/features/subscription-groups`,
  `extension/features/sponsorblock`, `extension/features/digital-wellbeing`,
  `extension/core/settings-visual-system.js` (`.ytkit-release-note`).
  Blocker: headless captures in light and dark.
  Acceptance: each surface captured in light and dark (default, hover, focus,
  disabled, empty, error), with findings fixed or logged.

- [ ] P3 — Popup pseudo-locale lane of the headless a11y smoke fails
  Why: `node scripts/smoke-headless-a11y.js --fixture-states --surface popup` fails its
  pseudo lane with "popup/pseudo: pseudo-locale copy did not render". It failed on main
  before the 2026-10-06 light-theme change too, so the lane has been red unseen (the
  smoke isn't part of `npm run check`).
  Reading notes (2026-10-09, no run): the lane was added in f259c85e on 2026-08-19 and
  passed then. The pseudo stage sets `PSEUDO_LOCALE='es'` and checks for the `⟦` marker
  (~1786); `smoke-settings-overlay.js`'s stub seeds `_localeOverride` from `?locale`
  and resolves `getURL` as `new URL(p, document.baseURI)`; popup `initI18n` fetches
  `_locales/<locale>/messages.json`; Chromium launches with
  `--allow-file-access-from-files` (~2021). No code cause found. Leading hypothesis:
  newer Chromium refuses `fetch()` on `file://` even with that flag, so the catalogue
  never loads and the popup renders English. Likely fix: serve the popup and side panel
  from the smoke's fixture HTTP origin (`httpPath`) instead of `file://`.
  Where: `scripts/smoke-headless-a11y.js`, `scripts/generate-pseudolocale.js`,
  `extension/popup.js` locale selection.
  Blocker: confirming the hypothesis takes a smoke run.
  Acceptance: the pseudo lane renders pseudo-locale copy and passes, and a test fails if
  the lane quietly renders real copy.

- [ ] P3 — Headless Firefox 156 hangs at WebDriver session creation
  Why: on 2026-10-07 the system Firefox had auto-updated to 156.0.1. Every
  `startFirefoxSession` call (geckodriver 0.37.1, headless, with or without
  `--allow-system-access`, on 9222 or a free `--websocket-port`) printed "WebDriver BiDi
  listening" and then timed out at `POST /session`. Each left a firefox.exe that
  `taskkill /PID /T /F` reports as gone while CIM still lists it, still holding its BiDi
  port and locking its `astra-firefox-webdriver-*` profile. The heatmap check passed in
  Firefox 155 earlier the same drain. Blocks `npm run smoke:firefox`.
  Where: `scripts/firefox-webdriver.js` (`startFirefoxSession`),
  `scripts/smoke-firefox-webext.js`.
  Blocker: a Firefox run.
  Acceptance: `npm run smoke:firefox` passes on the installed Firefox, with any
  geckodriver or Firefox pin it needs written in the repo CLAUDE.md, and no firefox.exe
  left behind.

- [ ] P3 — Confirm the Firefox first-load module failure is gone
  Why: the runtime loader names the failing module and retries once when a load
  rejects with no value, aimed at the "Runtime module load failed undefined" line seen
  2026-09-29 on the first YouTube load after a temporary install. The race hasn't been
  reproduced since, so the retry guards the symptom and isn't a confirmed fix. On
  2026-10-09 `scripts/smoke-firefox-webext.js` learned to read the extension's console:
  it sets `devtools.console.stdout.content`, keeps `[YTKit]` lines from geckodriver's
  output (`captureLine` in `scripts/firefox-webdriver.js`), proves the pipe with a page
  probe line, and fails the first load on a module failure
  (`tests/firefox-console-capture.test.js`). Whether geckodriver forwards Firefox's
  stdout at `--log error` is unconfirmed; the probe fails closed if it doesn't.
  Blocker: a Firefox run, and the Firefox 156 session hang above blocks it today.
  Acceptance: a fresh temporary install's first YouTube load logs no module failure in
  the captured console, with the probe line seen.

- [ ] P3 — Open the awesome-userscripts pull request
  Why: users browse awesome-scripts/awesome-userscripts for scripts, and Astra isn't
  on it (checked 2026-10-09: no Astra, YTKit or SysAdminDoc entry). README now names
  the tested pairs (Firefox with Violentmonkey 2.47.0 and with Tampermonkey 5.5.0, from
  `npm run smoke:userscript-managers`).
  Blocker: its CONTRIBUTING.md asks that the script be confirmed working on a current
  browser and manager, with the pair named in the pull request. The manager smoke runs
  in Firefox, which hangs at session creation on 156 (above), and a run needs the
  owner's word. A public claim waits for a pass.
  Ready to send once it passes: fork, add the entry first in the YouTube section
  (alphabetical, ahead of "Disable YouTube Hotkeys…"), run `npm ci --ignore-scripts`
  and `npm run lint` there, open the PR naming the browser, manager and versions that
  passed. Entry, in their markup:
  `<details> <!-- Astra Deck -->` / `<summary><a href="https://github.com/SysAdminDoc/Astra-Deck">Astra Deck</a> - Adds a settings panel with about 480 YouTube options, including feed and channel filters, player controls, themes and SponsorBlock.</summary><br>`
  / a screenshot blockquote (the README's settings panel capture) / `💾 Install`
  (https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit.user.js) /
  `📖 Readme` (#userscript-tampermonkey--violentmonkey) / `🐛 Report bug` (issues).
  Acceptance: a pull request following that CONTRIBUTING.md is open.

- [ ] P3 — Submit Astra Deck to Lissy93/awesome-privacy's Browser Extensions section
  Why: that list (9,942 stars, pushed 2026-10-10) carries SponsorBlock and DeArrow side by
  side, accepts own-project submissions, and Astra meets its bar: open source, no telemetry,
  repo since 2025-07-12 and first release 2026-02-20 (both past the four-month rule), a
  stable release line.
  Blocker: the list's CONTRIBUTING.md (read 2026-10-10, "AI" section) says AI must not
  write the text people read or submit a pull request on its own, says low-effort
  self-promotion PRs get closed without feedback, and asks submitters to declare their
  affiliation. The entry and the pull request have to be the owner's own words.
  Ready for the owner: fork, add an entry at the bottom of Browser Extensions in
  `awesome-privacy.yml` (the only file to edit), run `make validate`, fill in every
  section of their PR template, and say the project is yours. Points worth making: no
  telemetry, settings stay in the browser, and release feeds are signed.
  Acceptance: the owner's pull request is open.

- [ ] P3 — Check the Shorts settings against Shorts Series on desktop web
  Why: YouTube began rolling Shorts Series out to the web on 2026-09-23. If series
  shelves or the series player use new renderers, `removeAllShorts`, `redirectShorts`
  and `shortsAsRegularVideo` may miss them.
  Evidence: https://www.droid-life.com/2026/09/23/youtube-teases-3-neat-new-features/.
  Blocker: not seen on desktop web as of 2026-10-05, and a capture needs a live session.
  Acceptance: once a series surface shows on desktop web, capture it. Each of the three
  settings either covers it, with a fixture test, or gets the selector it needs.

- [ ] P3 — Confirm Tampermonkey 5.5.1 refuses a library whose `#sha256=` doesn't match
  Why: Tampermonkey 5.5.1 (2026-10-01) lists "Corrected SRI enforce mode for `@require`".
  Astra's pins shipped in 4.97.0 under 5.5.0, and the CHANGELOG promises Tampermonkey
  refuses a changed file. Violentmonkey ignores the hashes (CHANGELOG 4.97.0).
  Evidence: https://www.tampermonkey.net/changelog.php
  Blocker: a manager run (`npm run smoke:userscript-managers` runs in Firefox, which hangs
  at session creation on 156, above).
  Acceptance: WHEN a loader with one wrong hash is installed in Tampermonkey 5.5.1, THEN
  that library SHALL not run and the manager SHALL report the mismatch; WHEN the hashes are
  right, THEN the manager smoke SHALL pass unchanged.

- [ ] P3 — Check Astra's scripted clicks after YouTube began rejecting synthetic Skip clicks
  Why: Remove YouTube Suggestions 4.3.84 (2026-10-08) says YouTube no longer honors scripted
  clicks on the ad Skip button. Astra's quality forcing drives `.ytp-settings-button` and the
  quality submenu by click (`extension/ytkit.js` ~13782), and Auto-Dismiss "Still Watching?"
  presses the prompt's button. If the rejection reaches those controls, both fail quietly.
  Evidence: https://github.com/lawrencehook/remove-youtube-suggestions/releases/tag/v4.3.84
  Blocker: live YouTube in headless Chromium.
  Acceptance: on a live watch page, Force Quality lands the chosen resolution and a Still
  Watching prompt is dismissed; if either fails, the fix moves to ROADMAP.md with the
  finding.
