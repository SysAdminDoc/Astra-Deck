# Astra Deck — Active Backlog

Last consolidated: 2026-05-25 (2nd pass) at HEAD `c1ffe18` (v4.46.0 + 24 autonomous-loop commits). The 2nd pass folded in the 2026-05-25 post-loop deep-audit findings (NF25-NF35 + EI-NEW1-6 + Phase V matrix sync) from `docs/research/2026-05-25-postloop-audit.md`, which was then deleted (folded back in here).

Companion: [RESEARCH_FEATURE_PLAN_PASS3.md](RESEARCH_FEATURE_PLAN_PASS3.md) — 2026-05-25 external research pass (Pass 3). Adds NEW-1..NEW-10 opportunities (bug-report bundle, userscript drift check, E2E Playwright gate, GUI smoke tests, long-session leak detector, per-key reset, SW lifecycle ring buffer, CHANGELOG rotation, live-chat archive export, README rewrite) and three new Open Questions. Carry-back into this file as items are picked up.

This file is the **single source of truth for what's left to ship.** It folds in the original v4.46.0 punch list and the 2026-05-25 reconciliation pass. Completed items live in [CHANGELOG.md](CHANGELOG.md); long-arc architecture lives in [ROADMAP.md](ROADMAP.md); contributor orientation lives in [docs/architecture.md](docs/architecture.md).

If you finish an item below, **delete it from this file and add a one-line entry under `[Unreleased]` in `CHANGELOG.md`** — don't leave it as a `[x]` checkbox.

## Open Items

Each item carries: priority, complexity, why, evidence, touches, acceptance, verify.

### Browser-bounded captures (need maintainer at a live browser)

- **P0 / S — Capture live-chat MHTML fixtures (EI8)**
  - Why: 3 selector packs ship `lastVerified: null, needsFreshCapture: true`; live-chat features ride on them.
  - Evidence: `extension/core/selector-packs/liveChat.js`, `liveChatFrame.js`, `liveChatPlaceholder.js`.
  - Touches: `mhtml/LiveChat.mhtml` (new, gitignored), `tests/fixtures/yt-live-chat.tokens.txt`, 3 selector pack `lastVerified` stamps.
  - Acceptance: `npm test -- --test-name-pattern "Selector"` passes; `lastVerified` non-null in all 3 packs.
  - Verify: `npm run build:fixtures && npm test`.

- **P0 / S — Capture YouTube liquid-glass player chrome (HARDENING H21, EI9)**
  - Why: H21 defers selector promotion until a fresh capture lands; `popOutPlayer`, `pipButton`, `fullscreenOnDoubleClick`, speed-control chip, theater split, ambient glow all sit on the affected surfaces.
  - Evidence: `HARDENING.md` H21 section; `tests/selector-regression.test.js:158–197` `LIQUID_GLASS_WATCHLIST`.
  - Touches: `mhtml/yt-watch-liquid-glass.mhtml`, `extension/core/selector-packs/playerChrome.js`, `playerSettings.js`.
  - Acceptance: `playerChrome.stable` includes the pill-shaped action container; `LIQUID_GLASS_WATCHLIST` items promote to `CRITICAL_SELECTORS`.

- **P2 / M — MHTML capture-week expansion (EI15 + NF19)**
  - Why: Shorts, channel page, search, history, watch-later, embedded player, notifications dropdown — none fixture-backed. Regressions only surface at runtime via selector-health.
  - Touches: 8 new MHTML files + matching token fixtures + 6 new selector packs (`channelPage`, `searchResults`, `notificationsDropdown`, `historyPage`, `embeddedPlayer`, `shortsPlayer`).

---

### CI / DX close-outs

---

### Settings / downloader hardening (P0 batch from 2026-05-25 audit)

---

### Polish / parity (P1-P2 batch from 2026-05-25 audit)

- **P2 / L — `stickyVideo` unify chat observer lifecycle (NF32)**
  - Why: `_chatWatcherObs` (`ytkit.js:9768`) and `_pendingChatObs` (`ytkit.js:9451`) are independent observers with separate stop timers — double-observer leak risk on rapid SPA nav.
  - Touches: `ytkit.js#stickyVideo` init + destroy.

- **P2 / M — `subscriptionGroups` per-group sort persistence (NF31)**
  - Why: sort mode is global (`subscriptionSortMode`) at `ytkit.js:30897-30914`. PocketTube parity gap for per-group override.
  - Touches: `extension/core/settings-schema.js` (`subscriptionGroupData` shape), `ytkit.js#subscriptionGroups`.

---

### Observability + competitive sync (P3 batch from 2026-05-25 audit)


- **P3 / M — `chatStyleComments` `@supports(selector(...))` fallbacks (EI-NEW1)**
  - Why: ~4500 lines of brittle CSS chains; YouTube class renames break the entire layout.
  - Touches: `ytkit.js#chatStyleComments` (`5965-7245`).


- **P3 / M — `hideVideosFromHome` channel-key cache (EI-NEW5)**
  - Why: `_isSameChannel` is O(channels) per card at `ytkit.js:15815-15819`. ~8ms+ per feed load on 500+ blocked channels.
  - Touches: build a `_blockedChannelKeys: Map<key, channelRecord>` at init.

- **P3 / M — `selector-health` attribute-drift detection (EI-NEW6)**
  - Why: per-surface miss counter misses class-rename churn (DeArrow's rapid patch cadence shows this is now baseline).
  - Touches: `extension/core/selector-health.js` + per-pack `expectedAttributes`.


---

### Lint surface widening

- **P2 / M — `require-catch-reason` to `extension/core/*.js`**
  - Prereq: per-file annotation pass on ~50 catches.

- **P3 / L — `require-catch-reason` to `ytkit.js`**
  - Prereq: per-file annotation pass on 175 catches. Largest scope; ship last.

---

### Lifecycle adoption

- **P2 / L — Wave 3: full delegate (move CSS injection ownership into the peel modules)**
  - Why: NF5 wave 2 (shipped) has cssFeature notify the lifecycle on init/destroy, so `snapshot()` matches production state. Full delegate means the peel-module spec OWNS the inject/cleanup work and `cssFeature` becomes a thin lifecycle pass-through. Requires moving `injectStyle` to a core helper or passing it via the lifecycle ctx.
  - Touches: `core/styles.js` (export injectStyle for non-ytkit consumers), `extension/features/*/index.js` (each spec's init/destroy does real work), `ytkit.js` `cssFeature` (simplified to register CSS string + delegate to lifecycle).
  - Acceptance: parity tests still byte-identical; lifecycle.start runs the real init; lifecycle.destroy runs the real destroy.

- **P2 / XL — Top-3 monolith peel (NF15-corrected order)**
  - Order: `stickyVideo` (4,780 lines) → `hideVideosFromHome` (1,367) → `chatStyleComments` (1,338).
  - Touches: `extension/features/<name>/index.js` (new), `manifest.json`, `sync-userscript.js`, `ytkit.js` glue.
  - Acceptance: byte-identical inline fallback; lifecycle adoption; per-feature tests.

- **P2 / L — Next-2 monolith peel**
  - `youtubeMusicCompat` (1,229 lines) and `floatingLogoOnWatch` (526).

---

### Companion service hardening

- **P1 / L — Astra Downloader `/update` endpoint + popup "Check for update" action (NF6 still-open)**
  - Why: the .exe is stuck at the version installed; no auto-update path.
  - Touches: `astra_downloader.py` `/update`, `popup.js` action, `MediaDLManager.check()`.
  - Acceptance: semver compare, atomic replace, restart succeeds.
  - Verify: pytest semver compare; manual install of older .exe + click "Update".


- **P2 / L — Astra Downloader signed installer + .msi + Add/Remove Programs entry**
  - From NF6. Cost-aware: defer until CWS submission intent is resolved (Open Question 2).

- **P3 / M — PyQt6 GUI smoke tests (NF22)**
  - Touches: `astra_downloader/requirements.txt` (`pytest-qt`), `test_astra_downloader.py` new GuiSmokeTests class.

---

### Subscription Manager v2 (PocketTube parity)

- **P2 / L — Nested subscription groups (depth 2) (NF2)**
  - Touches: `subscriptionGroups` peel into `features/subscriptions/`; new schema `subscriptionGroupsNested`; popup overview integration.
  - Acceptance: 100-channel JSON round-trip preserves nesting.

- **P2 / L — Dead-channel detection + bulk unsubscribe staging with 30-day undo**
  - Touches: peeled subscription module; new schema `subscriptionDeadChannelDetection`, `subscriptionBulkUnsubscribeStaging`.
  - Acceptance: simulate 410 on a channel page; flag rendered; unsubscribe staged; undoable until expiry.

- **P3 / M — Group notifications digest panel**
  - Acceptance: per-group "X new since last visit" digest with click-through to filtered feed.

---

### Research workspace

- **P2 / M — Per-video notes (`videoNotes` schema + UI) (NF1)**
  - Why: ROADMAP §5.6.0; competitive gap vs YouFocus.
  - Touches: `features/research/video-notes/index.js` (new), schema additions, popup integration, export rail.
  - Acceptance: round-trip a note via export; LRU caps at 1000.

- **P3 / M — Study/work mode export to Markdown/CSV**
  - Acceptance: 7-day session exports as RFC 4180 CSV + markdown.

---

### Polish and competitive parity


- **P3 / S — Header quick-links editor parity with YouTube Alchemy (10 slots)**

- **P3 / M — `i18n` feature-definition labels move out of `ytkit.js` (EI6)**
  - Touches: `scripts/extract-i18n-keys.js`, `_locales/*/messages.json` (regen), `ytkit.js` feature renderer.
  - Acceptance: `npm run check:i18n` passes; 10-locale parity test extends to feature labels.

---

### Quality / safety gates



---

### Store / contributor docs

- **P3 / M — Store-safe vs GitHub-full separate build artifacts**
  - Touches: `build-extension.js` — emit `astra-deck-chrome-store-safe-vX.zip` and `astra-deck-chrome-full-vX.zip`.
  - Acceptance: store-safe artifact has minimal host_permissions.

---

### Risks (carried over from R-series)

- **R4 (MED)** — `videoNotes` / `timestampBookmarks` / `videoHistory` storage unbounded between 5-min LRU sweeps.
- **R6 (LOW)** — `policy-profile.js` scrub regex set incomplete (see Polish above).
- **R8 (LOW)** — Cobalt fallback defaults to public instance; surface "unreachable" diagnostic.
- **G3** — No long-session memory leak test (ROADMAP §5.9.0).

---

## Explicit Non-Goals

Carried over from the prior research file; still binding.

- **Password-protected settings** (UnTrap parity) — false security; cookie bypass trivial.
- **Always-on background AI inference** — battery, privacy, cost.
- **Direct in-extension yt-dlp** — store-policy risk; local companion is the wall.
- **Universal HTML5 video speed control** (VSC scope) — outside Astra's YouTube-only scope.
- **Mobile YouTube support** (`m.youtube.com`) — diverges enough to need its own codebase.
- **YouTube Studio / YouTube Music as first-class** — Studio excluded; Music opt-in only.
- **Auto-engagement features** beyond existing `autoLikeSubscribed` (already `store-risk`).
- **Keyboard shortcuts** — house style ban; pointer/wheel/buttons only.
- **Confirmation dialogs** — house style ban; undo toasts only (NF14 retired the popup confirm-shell).
- **EI13 — Parallel yt-dlp via threading pool** — already shipped at `astra_downloader.py:2035`; prior audit was wrong.
- **EI5 — Manifest CSP `connect-src` Reddit addition** — popup is strict-by-design; background proxy handles Reddit. Asymmetry is correct.

---

## Open Questions (block prioritization or implementation)

1. **Astra Downloader code-signing budget** — if not budgeted, NF6 signed-installer ships without signing; README documents SmartScreen warning + SHA-256.
2. **CWS / AMO submission intent** — if on horizon, store-safe / GitHub-full split releases (last item above) jumps to P1.
3. **Subscription dead-channel detection method** — RSS feed vs channel page scrape. Maintainer call.
4. **Lifecycle migration cadence** — peel 1/week, 1/month, or batch?
5. **Live-chat capture availability** — fixture refresh needs a maintainer-side active live stream. Schedule window?
6. **i18n coverage policy (NF24)** — at what % "translated keys identical to EN" should we warn vs accept?
