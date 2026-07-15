# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

## Research-Driven Additions — 2026-07-09 (userscript competitive sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-09). Extension-first; userscript parity intentionally excluded. Every mutation feature must reuse the bulkCardActions bounded-session + Undo pattern and external-api-health degradation surfaces.

### P1 — root-cause reliability + highest-demand gaps

### P2 — live tooling, subtitles, filtering, hygiene

### P3 — insights, hygiene, and smaller bets
## Research-Driven Additions

### P0 — Now: lockout, data integrity, and vulnerable floors

### P1 — Next: recoverable runtimes, releases, and shared state

### P2 — Later: boundary fidelity, localization, and enforceable filtering

### P3 — Under consideration: validated viewer differentiators

## Research-Driven Additions — 2026-07-14 post-hardening refresh

### P0 — Release and workstation safety

### P1 — Security, data safety, and runtime correctness

### P2 — Resilience, accessibility, and maintainability

## Deep-audit backlog — 2026-07-15 (verified, unfixed)

- [ ] P2 — Settings-import transaction cannot observe async persistence failures
  Why: apply() is six StorageManager.setSync calls whose chrome.storage.local.set promises are discarded; a real IO failure returns ok:true with the success summary while the rollback/checkpoint paths stay unreachable. Make apply() return the aggregated immediate-write promise, await it in run(), and roll back on rejection.
  Where: extension/ytkit.js (~4008), extension/core/settings-import-transaction.js, extension/core/storage-manager.js
- [ ] P2 — Fold the settings panel's five stacked !important style layers into one
  Why: the v3 visual system wins by out-!important-ing four older load-time restyle passes; every tweak risks a silent cascade casualty (the lost switch focus ring was one). The settings-visual-system tests already pin v3 behavior, so the superseded command-center layers can be deleted.
  Where: extension/ytkit.js (lazy base sheets ~43499-44910; restyle passes ~50919, ~52167, ~52672, ~53776), extension/core/settings-visual-system.js
- [ ] P2 — EXT_FETCH bridge silently drops per-request credentials:'omit'
  Why: video-insights' InnerTube probe passes credentials:'omit' but the background forces credentials:'include' for youtube.com, so the "anonymous" metadata call is account-linked. Honor a downgrade-only credentials field through the bridge (never upgrade), or delete the misleading option.
  Where: extension/features/video-insights/index.js (~227), extension/ytkit.js (~357-365), extension/background.js (CREDENTIALED_FETCH_ORIGINS)
- [ ] P2 — Move AI summary artifacts out of the settings object
  Why: aiSummaryArtifactsData (≤1.5 MB) rides inside ytSuiteSettings, so every settings save/YTKIT_SETTINGS_REPLACED broadcast ships it to every YouTube tab, and the library search re-sanitizes + TextEncoder-measures the full store per keystroke. Give artifacts their own storage key and search a cached clean copy.
  Where: extension/core/ai-summary-artifacts.js (~231-267), extension/core/userscript-ai-summary.js (~187-213), extension/core/settings-schema.js
- [ ] P3 — Localize the Watch Later Workbench and reaction sender surfaces
  Why: both shipped fully hardcoded-English (panel labels, placeholders, sort options, toasts) and the literals were baselined into scripts/i18n-ui-copy-baseline.json; the live-chat module does not even receive t(). Route through locale keys and shrink the ratchet baseline.
  Where: extension/ytkit.js (watchLaterWorkbench ~32535-32830), extension/features/live-chat/index.js (reaction panel ~301-429)
- [ ] P3 — Search-hygiene reason matching and search status line are English-locked
  Why: the recommendation-reason regex ("because you watched" …) only matches English so reason-text interleaves pass through on 10 locales; the results status composes `count · label "query"` in fixed order with hardcoded curly quotes, unreorderable for RTL/CJK. Prefer structural renderer detection and a single {count}/{query} template message.
  Where: extension/features/search-hygiene/index.js (~41), extension/features/search-while-watching/index.js (~297-299)
- [ ] P3 — Live-chat English-only structural fallbacks need browser-gated verification
  Why: the popout-hide selector matches aria-label="Popout chat" and one tooltip test matches an English sentence; both degrade silently on non-English UI. Needs live-DOM verification of stable structural hooks before changing (browser-gated).
  Where: extension/features/live-chat/index.js (~20, ~146)
- [ ] P3 — New chat/workbench surfaces are hardcoded dark and use physical left/right properties
  Why: the parent-page chat shell, reaction panel, and workbench button clash with light YouTube (siblings use --yt-spec-* vars), and the live-chat message row (menu right-pinned, avatar left-pinned) is visibly broken in RTL (ar ships). Migrate to theme vars and logical properties (padding-inline, inset-inline-*).
  Where: extension/live-chat.css, extension/ytkit.js (premiumLiveChat source, workbench CSS), extension/core/settings-visual-system.js (~282-291, ~683-705, ~729-761)
- [ ] P3 — Insight-rail curation via positional nth-child across files
  Why: settings-visual-system hides/shows status rows by nth-child position while the row order is built in settings-panel/index.js and duplicated in ytkit.js; inserting one makeStatusRow call silently swaps which stats are visible, with no test coverage. Key on stable ids or data attributes.
  Where: extension/core/settings-visual-system.js (~769-828), extension/features/settings-panel/index.js (~2129-2134), extension/ytkit.js (~42244)
- [ ] P3 — Gemini ignores the aiSummaryModel setting
  Why: the model lives in the endpoint path and the default pins gemini-2.0-flash, so the setting silently does nothing while the artifact metadata records the unused model name. Substitute a validated model into the URL path or stamp artifacts from the endpoint.
  Where: extension/core/userscript-ai-summary.js (~36-49, ~449-457), extension/core/credential-vault.js (~22-27)
- [ ] P3 — Userscript credential dialog exposes the API key to page scripts while open
  Why: the password input is appended to document.body on youtube.com, so page scripts can read input.value or keylog while the dialog is open, contradicting the "stored outside Astra Deck" isolation copy. Render the dialog in a closed shadow root.
  Where: extension/core/userscript-ai-summary.js (~224-296)
- [ ] P3 — YouTube state reset hard-fails on >128 KB values
  Why: readRecords throws when any allowlisted key exceeds 128 KB — and bloated yt.innertube::requests is exactly what the feature targets, so the users who need it most get "too large to reset safely" with no degraded path. Skip-and-report oversized keys (clear without snapshot, flagged not-undoable).
  Where: extension/core/storage.js (~69-73)
- [ ] P3 — Resource-unlock queue drops YouTube lock callbacks past 128 and forced release breaks exclusivity
  Why: a full queue resolves navigator.locks.request as completed without running the callback (work silently lost), and forced release lets a visible tab acquire an "exclusive" lock while the hidden holder still runs. Opt-in via CPU Tamer, but the drop path could queue-and-replace-oldest, and CPU Tamer's description should mention lock/DB force-release. The ISOLATED-world twin bridge in the extension build is also redundant overhead (userscript-only path).
  Where: extension/core/resource-unlock.js (~86-126), extension/ytkit.js (~28204-28210)
- [ ] P3 — cleanShareUrls copy-event interception is dead code
  Why: clipboardData.getData('text/plain') is empty during dispatch for selection copies and YouTube's share button uses navigator.clipboard.writeText (no copy event) — the branch never fires; the feature works via the share-input mutation rule. Delete the handler or read window.getSelection().
  Where: extension/ytkit.js (cleanShareUrls init, ~8156-8168)
- [ ] P3 — Companion routes reach into DownloadManager private internals
  Why: /download, /status, /cancel acquire dl_manager._lock and read .downloads directly; the module move codified a cross-module contract on the manager's locking discipline. Add status_of()/exists() accessors.
  Where: astra_downloader/routes.py (~506-520, ~692-693), astra_downloader/download.py
