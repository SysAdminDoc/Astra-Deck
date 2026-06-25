# Roadmap — Astra Deck

## Research-Driven Additions (June 2026 Cycle 5)

### P0 — Critical / Root-Cause

- [ ] P0 — Verify companion never passes `--external-downloader aria2c` to yt-dlp
  Why: yt-dlp 2026.6.9 removed aria2c HLS/DASH support entirely due to CVE-2026-50574 (arbitrary code execution via manifest downloads). If the companion ever constructed this flag, downloads would silently fail or error.
  Evidence: yt-dlp 2026.06.09 release notes; CVE-2026-50574.
  Touches: `astra_downloader/download.py` (subprocess argv construction), `astra_downloader/test_astra_downloader.py`
  Acceptance: Grep confirms no `aria2c` references in download argv construction. Test added asserting `--external-downloader` is never `aria2c`.
  Complexity: S

### P1 — Security / Reliability

- [ ] P1 — Side Panel accessibility parity with popup
  Why: Side Panel (`sidepanel.html`) has 8 ARIA attributes vs popup's 50. The Side Panel now hosts a full settings panel and diagnostic dashboard but lacks equivalent screen reader support, focus management, and landmark roles.
  Evidence: `grep -c 'aria-\|role=\|tabindex' extension/sidepanel.html` → 8 vs popup's 50. Screen reader smoke doc (`docs/screen-reader-smoke.md`) does not cover the side panel.
  Touches: `extension/sidepanel.html`, `extension/sidepanel.js`, `extension/sidepanel.css`, `docs/screen-reader-smoke.md`
  Acceptance: Side Panel has landmark roles, ARIA labels on interactive controls, focus trap on open, keyboard navigation between sections. Screen reader smoke doc updated.
  Complexity: M

- [ ] P1 — SponsorBlock anti-detection monitoring
  Why: SponsorBlock issues #2290 and #2341 show YouTube now flags non-ad-blocking extensions that manipulate the player timeline. Astra Deck's SponsorBlock integration (skip + progress bar segments) inherits these detection vectors.
  Evidence: github.com/ajayyy/SponsorBlock/issues/2290 (open), #2341 (open). YouTube detection triggers on timeline manipulation patterns.
  Touches: `extension/features/sponsorblock/index.js`, `extension/ytkit.js` (SponsorBlock runtime), diagnostic log
  Acceptance: Diagnostic log records if YouTube serves an anti-adblock warning page. SponsorBlock skip timing is jittered (not frame-exact) to reduce detection fingerprint. Test validates jitter bounds.
  Complexity: M

### P2 — Quick Wins / Enhancement

- [ ] P2 — Russian locale completion (60 placeholder-identical keys)
  Why: Russian is the weakest locale at 92.2% (60 placeholder-identical keys). All other locales are 97-99%. Blocks credible multi-language store claims for Russian-speaking users.
  Evidence: `node scripts/i18n-coverage.js` output: `ru 92.2% translated (60 placeholder-identical)`.
  Touches: `extension/_locales/ru/messages.json`
  Acceptance: Russian locale reaches 97%+ with no more than 10 placeholder-identical keys. `npm run check:i18n` passes.
  Complexity: S

- [ ] P2 — DeArrow Casual Mode integration
  Why: DeArrow v2.0+ added Casual Mode — keeps descriptive original titles, only replaces clickbait. Astra Deck's integration uses all-or-nothing replacement, which is a worse UX for videos with already-descriptive titles.
  Evidence: DeArrow v2.3.9 release notes; github.com/ajayyy/DeArrow/releases.
  Touches: `extension/features/dearrow/index.js`, `extension/default-settings.json` (new `deArrowCasualMode` boolean), `extension/core/settings-schema.js`
  Acceptance: When `deArrowCasualMode` is enabled, titles that DeArrow API returns as "original" (no community submission) are kept unchanged. Test validates selective replacement.
  Complexity: S

- [ ] P2 — Customizable `<select>` adoption for settings panel
  Why: Chrome 135+ supports `appearance: base-select` for styled native dropdowns. The settings panel has 30+ `<select>` elements currently using unstyled browser defaults. Progressive enhancement brings visual consistency with the rest of the dark-theme UI.
  Evidence: developer.chrome.com/blog/a-customizable-select; Chrome 135+ stable.
  Touches: `extension/ytkit.js` (settings panel CSS), `extension/popup.css`, `extension/early.css`
  Acceptance: Settings panel `<select>` elements render with dark-theme styling on Chrome 135+. Unsupported browsers fall back to native `<select>`. `@supports` guard prevents breakage.
  Complexity: S

- [ ] P2 — `@starting-style` adoption for panel entry animations
  Why: Settings panel, download popup, and toast notifications currently use JavaScript timing hacks or `requestAnimationFrame` to animate from `display: none`. `@starting-style` (Baseline 2025: Chrome 117, Firefox 140, Safari 17.2) eliminates this with pure CSS.
  Evidence: caniuse.com — `@starting-style` Baseline 2025.
  Touches: `extension/ytkit.js` (panel CSS), `extension/popup.css`, `extension/core/toast-dom.js`
  Acceptance: Panel open/close animations use `@starting-style` with `transition-behavior: allow-discrete`. No JS timing code for these animations. Fallback degrades to instant show/hide.
  Complexity: S

- [ ] P2 — Exclusive Accordion for settings categories
  Why: The settings panel's 18 categories can all be expanded simultaneously, making navigation unwieldy with 383 entries. `<details name="settings">` (Baseline Newly Available: Chrome 120, Firefox 130, Safari 17.2) creates accordion behavior where only one category is open at a time.
  Evidence: MDN `<details>` `name` attribute; Baseline Newly Available.
  Touches: `extension/ytkit.js` (settings panel DOM construction)
  Acceptance: Settings categories use `<details name="ytkit-settings">`. Only one category is open at a time. Existing search/filter behavior is preserved.
  Complexity: S

- [ ] P2 — Subscription groups monolith peel
  Why: Subscription groups is the largest remaining inline feature cluster (~3K lines). It includes group CRUD, chip filtering, sort modes, digest panel, membership editor, CSV/JSON export/import, content-type filter, stale-channel detection, AI tags, and queue playback. Extracting it to `features/subscription-groups/index.js` continues the monolith decomposition.
  Evidence: Grep for `subscriptionGroup` in `extension/ytkit.js` — ~3K lines of inline code.
  Touches: `extension/features/subscription-groups/index.js` (new), `extension/ytkit.js` (delegation), `extension/manifest.json` (content_scripts), `sync-userscript.js` (V5_BUNDLE_MODULES)
  Acceptance: Subscription groups runtime extracted. Monolith delegates to factory with inline fallback. All existing tests pass plus 3+ new peel coverage tests.
  Complexity: L

- [ ] P2 — Digital wellbeing monolith peel
  Why: Digital wellbeing (~1.5K lines) handles watch time tracking, break reminders, daily limits, and statistics. It's self-contained and a clean peel candidate.
  Evidence: Grep for `digitalWellbeing` in `extension/ytkit.js`.
  Touches: `extension/features/digital-wellbeing/index.js` (new), `extension/ytkit.js`, `extension/manifest.json`, `sync-userscript.js`
  Acceptance: Digital wellbeing runtime extracted. Monolith delegates with inline fallback. Existing tests pass.
  Complexity: M

- [ ] P2 — Settings panel monolith peel
  Why: The in-page settings panel (~4K lines) handles rendering, search/filter, conflict management, and live sync. It's the second-largest remaining feature cluster and runs independently of other features.
  Evidence: Grep for `buildSettingsPanel\|_settingsPanel\|settingsPanelOpen` in `extension/ytkit.js`.
  Touches: `extension/features/settings-panel/index.js` (new), `extension/ytkit.js`, `extension/manifest.json`, `sync-userscript.js`
  Acceptance: Settings panel runtime extracted. Monolith delegates with inline fallback. Existing tests pass.
  Complexity: L

### P2 — Observability / Developer Experience

- [ ] P2 — Sync-userscript drift: add download-ui to V5_BUNDLE_MODULES
  Why: `check-userscript-drift` reports `download-ui/index.js` is in manifest but not in `V5_BUNDLE_MODULES`. Either add it to the bundle list or document the exclusion.
  Evidence: `node scripts/check-userscript-drift.js` → 1 drift issue.
  Touches: `sync-userscript.js`
  Acceptance: `npm run check:drift` passes with 0 issues.
  Complexity: S

- [ ] P2 — Sanitizer API progressive adoption
  Why: The HTML Sanitizer API (Chrome 146, Firefox 148) provides browser-native XSS protection via `setHTML()`. Astra Deck currently uses TrustedTypes + manual DOM construction. Where `setHTML()` is available, it can replace `createPolicy()` wrappers for simpler, safer DOM manipulation.
  Evidence: MDN Sanitizer API; Firefox 148 shipped Feb 2026; Chrome 146 shipped.
  Touches: `extension/core/trusted-html.js`, feature modules that construct HTML
  Acceptance: `trusted-html.js` feature-detects `Element.prototype.setHTML` and uses it when available. Falls back to existing TrustedTypes path. Test validates both paths.
  Complexity: M

### P3 — Later / Under Consideration

- [ ] P3 — Firefox `sidebarAction` fallback for diagnostic dashboard
  Why: Chrome Side Panel diagnostic dashboard is Chrome-only. Firefox uses `sidebarAction` API (incompatible with `sidePanel`). Firefox users have no equivalent persistent diagnostic surface. A `sidebarAction` fallback would give Firefox users feature parity.
  Evidence: MDN sidebarAction docs; blog.mozilla.org/addons Firefox MV3 updates confirm no `sidePanel` adoption planned.
  Touches: `extension/manifest.json` (add `sidebar_action` for Firefox), new `extension/sidebar.html` + `extension/sidebar.js`, `scripts/manifest-patch.js` (add `sidebar_action` to Firefox builds)
  Acceptance: Firefox build includes a sidebar with the same diagnostic sections as Chrome's Side Panel. Chrome builds are unaffected.
  Complexity: L

- [ ] P3 — Navigation API adoption for SPA route handling
  Why: Astra Deck currently uses `yt-navigate-finish` custom event listener + `popstate` + `pushState` interception for YouTube SPA navigation. The Navigation API (Baseline Newly Available, Jan 2026) provides a standardized `navigate` event with built-in transition handling, reducing custom code.
  Evidence: web.dev/blog/baseline-navigation-api; Chrome/Edge/Firefox 147/Safari 26.2 support.
  Touches: `extension/core/navigation.js`, `extension/ytkit.js` (route change dispatch)
  Acceptance: `navigation.js` feature-detects `navigation` API and uses `navigation.addEventListener('navigatesuccess')` when available. Falls back to existing `yt-navigate-finish` listener. Test validates both paths.
  Complexity: M

- [ ] P3 — Audio pan control
  Why: Tweaks for YouTube offers L/R audio pan control via Web Audio API. Astra Deck has mono-to-stereo, volume boost, and normalization but no stereo pan. Pan control is useful for users with hearing differences or monitoring setups.
  Evidence: Tweaks for YouTube feature page (inzk.dev/tweaks-for-youtube/features/).
  Touches: `extension/ytkit-main.js` (SharedAudio graph), `extension/ytkit.js` (settings + UI), `extension/core/settings-schema.js`
  Acceptance: New `audioPan` range setting (-1.0 to 1.0) adds a `StereoPannerNode` to the SharedAudio graph. Default 0 (center). UI shows a pan slider when feature is enabled.
  Complexity: S

- [ ] P3 — Video notes monolith peel
  Why: Video notes (~1K lines) handles per-video local note storage, export, and LRU eviction. Small and self-contained.
  Evidence: Grep for `videoNotes` in `extension/ytkit.js`.
  Touches: `extension/features/video-notes/index.js` (new), `extension/ytkit.js`, `extension/manifest.json`
  Acceptance: Video notes runtime extracted. Monolith delegates with inline fallback. Existing tests pass.
  Complexity: S

- [ ] P3 — Trust communication in README and store listings
  Why: Astra Deck's open-source audit trail, SBOM/attestation, credential scrub, profile-split permissions, and privacy policy are genuine differentiators — especially post-ShadyPanda (4.3M users compromised). These are not communicated in the README's feature list or any prospective store listing.
  Evidence: LayerX 2026 report (71% extensions lack privacy policies); ShadyPanda incident; Trust Wallet CWS key leak; RYD ad injection.
  Touches: `README.md` (trust/security section), store listing copy preparation
  Acceptance: README has a "Trust & Security" section listing: open-source, SBOM, attestation, no telemetry, credential scrub, profile-split permissions, external signing key, 26+ hardening passes. Concise — 5-8 bullet points.
  Complexity: S

- [ ] P3 — Focus preset for onboarding wizard
  Why: Unhook's 1M+ users prove "remove distractions" messaging converts far better than feature counts. Astra Deck has equivalent features (removeAllShorts, hideRelatedVideos, disableInfiniteScroll, Focused Mode, Zen Mode, Digital Wellbeing) but bundles them generically. Adding a "Focus" preset to the onboarding wizard would capture this audience.
  Evidence: Unhook CWS listing (1M+ users); existing presets are Privacy/Researcher/Power User.
  Touches: `extension/ytkit.js` (onboarding wizard preset definitions), `extension/_locales/*/messages.json`
  Acceptance: Onboarding wizard offers a 4th "Focus" preset that enables distraction-removal features. i18n keys added for all 11 locales.
  Complexity: S
