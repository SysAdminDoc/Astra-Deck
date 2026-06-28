# Roadmap - Astra Deck

## Research-Driven Additions

- [ ] P0 - Make current release readiness pass before the next public build
  Why: Local version surfaces are v4.46.14, but the latest public release is v4.46.4 and current readiness fails without the release manifest, SBOM, or SHA256SUMS that README promises.
  Evidence: `scripts/generate-release-readiness.js`; `README.md`; `gh release view v4.46.4`; local `npm run release:readiness -- --require-pass` failure.
  Touches: `build-extension.js`, `scripts/generate-release-manifest.js`, `scripts/generate-release-readiness.js`, `scripts/stage-companion-release.js`, `package.json`, `tests/release-readiness.test.js`
  Acceptance: A clean local build produces extension/userscript artifacts, `build/release-manifest.json`, `build/SHA256SUMS`, and `build/astra-deck-npm-sbom.cdx.json`; `npm run release:readiness -- --require-pass` passes; missing companion sidecar stays blocked in `Roadmap_Blocked.md` unless maintainer auth is restored.
  Complexity: M

- [ ] P0 - Harden storage-denied and BroadcastChannel-denied browser modes
  Why: Firefox privacy settings can make site-data APIs throw; Astra currently skips the crash guard when `localStorage` is unavailable and creates `BroadcastChannel('ytkit-pause-sync')` without a guard.
  Evidence: `extension/ytkit.js:20592`, `extension/ytkit.js:49781`; SponsorBlock issue 2473.
  Touches: `extension/ytkit.js`, `extension/core/storage.js`, `extension/core/diagnostic-log.js`, `tests/hardening.test.js`
  Acceptance: Simulated `localStorage` and `BroadcastChannel` `SecurityError` failures do not crash feature init; diagnostics record degraded storage/channel state; safe mode still has a non-persistent in-memory or `chrome.storage.session` fallback.
  Complexity: M

- [ ] P1 - Reduce userscript `not-yet-ported` parity gaps by portability tier
  Why: The userscript drift checker now classifies extension-only features, but 55 IDs are still `not-yet-ported`, leaving portability accidental rather than product-defined.
  Evidence: `scripts/check-userscript-drift.js`; local `node scripts/check-userscript-drift.js` output.
  Touches: `sync-userscript.js`, `YTKit.user.js`, `extension/features/*/index.js`, `extension/core/settings-schema.js`, `extension/default-settings.json`, `scripts/check-userscript-drift.js`, `tests/userscript-parity.test.js`
  Acceptance: Safe DOM/CSS/player features are ported in batches; remaining userscript gaps are classified as chrome API, native companion, unsafe, or intentional; `not-yet-ported` count drops below 20 without weakening drift tests.
  Complexity: L

- [ ] P1 - Add a shared player-state retry and reapply manager
  Why: Player quality, speed, audio, autoplay, theater, and related features depend on YouTube player readiness/state changes; competitor issue traffic shows one-off retry logic repeatedly regresses.
  Evidence: `extension/ytkit-main.js:142`, `extension/ytkit.js:14342`, `extension/ytkit.js:33727`; YouTube-Enhancer issue 1337.
  Touches: `extension/core/player.js`, `extension/ytkit-main.js`, `extension/ytkit.js`, `extension/features/player-dock/index.js`, `tests/hardening.test.js`, `tests/features/player-dock.test.js`
  Acceptance: A core player task manager waits for player/video readiness, cancels stale retries on SPA navigation, reapplies on `loadedmetadata`/player state changes, and has regression coverage for quality, speed, autoplay, and theater interactions.
  Complexity: L

- [ ] P1 - Budget large feed/channel scans to prevent YouTube DOM stalls
  Why: FreeTube's channel-home performance fix shows huge YouTube channel surfaces can freeze clients; Astra's feed filtering, selector health, and subscription tooling scan high-card-count surfaces.
  Evidence: FreeTube PR 9336; `extension/features/video-hider/index.js`, `extension/features/subscription-groups/index.js`, `extension/core/selector-health.js`.
  Touches: `extension/features/video-hider/index.js`, `extension/features/subscription-groups/index.js`, `extension/core/selector-health.js`, `extension/core/navigation.js`, `tests/features/video-hider.test.js`, `tests/selector-regression.test.js`
  Acceptance: Feed/channel scans process cards in bounded chunks, yield between batches, cancel on navigation, and expose timing diagnostics when a scan exceeds the budget.
  Complexity: M

- [ ] P1 - Gate i18n coverage report freshness and finish current placeholders
  Why: The generated coverage doc is stale against the live locale catalog, and unresolved feature-copy placeholders remain despite high overall coverage.
  Evidence: `docs/i18n-coverage.md`; `scripts/i18n-coverage.js`; local `node scripts/i18n-coverage.js --no-write` reports 901 EN keys while the doc reports 895.
  Touches: `scripts/i18n-coverage.js`, `scripts/generate-locales.js`, `docs/i18n-coverage.md`, `extension/_locales/*/messages.json`, `tests/i18n-coverage.test.js`
  Acceptance: `npm run check` fails when `docs/i18n-coverage.md` is stale; coverage is regenerated; remaining placeholder-identical feature names are translated or explicitly added to the reviewed do-not-translate list.
  Complexity: S

- [ ] P2 - Add YouTube experiment canaries for custom feeds, sponsored variants, and category chips
  Why: Competitor trackers show YouTube is changing sponsored-card, Playables, category-chip, and prompt-generated feed surfaces; Astra already hides related surfaces but needs drift canaries before selectors silently miss.
  Evidence: Control Panel for YouTube issues 300, 298, and 296; `extension/core/settings-schema.js:127`, `extension/ytkit.js:8590`, `extension/features/video-hider/index.js`.
  Touches: `extension/core/selector-packs/feed.js`, `extension/core/selector-packs/thumbnail.js`, `extension/features/video-hider/index.js`, `extension/features/home-subs-css/index.js`, `tests/selector-regression.test.js`, `tests/fixtures/*.tokens.txt`
  Acceptance: Selector packs include capture evidence for sponsored variants, Playables, custom prompt feeds, and category chips; diagnostics show misses by surface; hide/filter features continue to work when one selector variant changes.
  Complexity: M

- [ ] P2 - Add keyboard-path regression coverage for injected overlays
  Why: SponsorBlock's keyboard-only category bug shows mouse-path testing can miss extension UI failures; Astra has many injected dialogs, popovers, and menus with static a11y checks but limited keyboard-path behavior coverage.
  Evidence: SponsorBlock PR 2504; `docs/screen-reader-smoke.md`; `scripts/audit-overlays-a11y.js`.
  Touches: `scripts/audit-overlays-a11y.js`, `extension/features/settings-panel/index.js`, `extension/features/subscription-groups/index.js`, `extension/features/download-ui/index.js`, `tests/hardening.test.js`
  Acceptance: Local tests cover Tab/Shift-Tab focus movement, Enter/Space activation, Escape close behavior, select/typeahead paths, and aria-expanded/state updates for the main injected overlays without adding keyboard shortcuts.
  Complexity: M

- [ ] P2 - Add YouTube Takeout watch-history import for local analytics migration
  Why: FreeTube treats YouTube history import/export as a local-data ownership feature; Astra has watch analytics and study exports but no migration path from a user's existing Takeout history.
  Evidence: FreeTube PR 9204; `extension/ytkit.js` watch analytics/watch-time stores; `README.md` local-first data model.
  Touches: `extension/features/settings-panel/index.js`, `extension/ytkit.js`, `extension/core/storage-manager.js`, `extension/core/settings-schema.js`, `tests/settings-migration-roundtrip.test.js`, `tests/hardening.test.js`
  Acceptance: Users can import YouTube Takeout watch-history JSON locally; titles are normalized without adding trailing spaces; duplicates are merged by video ID/time; imported data feeds watch analytics without remote calls.
  Complexity: M
