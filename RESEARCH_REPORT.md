# Astra Deck Research Report

This is the canonical research summary. Full pre-consolidation source documents
are archived at:

- `docs/archive/research/RESEARCH_FEATURE_PLAN.md`
- `docs/archive/research/RESEARCH_FEATURE_PLAN_PASS3.md`

## Current Findings

- Astra Deck is a mature YouTube enhancement layer with MV3 Chrome/Firefox,
  userscript, and local downloader surfaces.
- The active risk cluster is runtime DOM churn: selector fixtures exist, but
  live-chat and liquid-glass player captures still need maintainer/browser time.
- The largest engineering track remains gradual monolith peeling and lifecycle
  adoption for high-risk features such as `stickyVideo`, `hideVideosFromHome`,
  and `chatStyleComments`.
- The highest product gaps are subscription manager depth, per-video notes,
  companion updater/install polish, and store-safe versus GitHub-full artifact
  separation.

## Evidence Sources

- Local planning artifacts, manifest, settings schema, extension core modules,
  modular feature directories, userscripts, downloader service, tests, build
  scripts, workflows, and contributor docs.
- Prior competitor and parity work covering SponsorBlock, DeArrow, Return
  YouTube Dislike, Enhancer for YouTube, Unhook, Improve YouTube, PocketTube,
  UnTrap, BlockTube, YouTube Alchemy, YouFocus, and related tools.
- Existing local MHTML captures and selector fixtures, with live-chat and
  newer player-chrome captures still called out as gaps.

## Research Archive Use

- `RESEARCH_FEATURE_PLAN.md` preserves the detailed v4.46+ active backlog,
  evidence, non-goals, risks, and open questions as they existed before this
  consolidation.
- `RESEARCH_FEATURE_PLAN_PASS3.md` preserves the external-research pass,
  opportunity ranking, file inventory, ecosystem notes, and could-not-verify
  sections.

## Local Factory-Loop Research Pass (2026-04-24)

A separate L1 factory-loop research pass (charter: "maintenance mode only —
security focused") produced a 103-item harvest scored across six axes and
tiered into NOW / NEXT / LATER / under-consideration / rejected buckets. Its raw
artifacts (`iter-1-*.md`, `iter-4/5/8-*.md`, `PHASE-2-5-SUMMARY.md`, the
`docs/research/README.md` index) live under the gitignored `docs/research/`
tree and are intentionally local-only — they are working notes, not shipped
documentation.

On 2026-06-03 that pass was triaged into the canonical trio:

- All three NOW security items — yt-dlp/curl_cffi pins, the Flask
  DNS-rebinding Host-header defense, and the Trusted Types `createPolicy`
  collision guard — were verified already shipped and recorded in
  `COMPLETED.md`.
- NEXT-2/3 (`chrome.storage.session` migration) and NEXT-4 (the
  `no-post-await-addlistener` ESLint rule) were likewise verified shipped.
- The still-actionable remainder — yt-dlp smoke-test CI (NEXT-1 second half),
  the selector-resilience harness (NEXT-5), the Firefox 149 `executeScript`
  pre-flight audit (NEXT-6), and the yt-dlp flag allowlist — moved into
  `ROADMAP.md` under "Hardening And Cross-Browser".
- The "no further features" charter cap and the 18+ rejected landscape
  candidates were marked `[STALE]` in `COMPLETED.md`, superseded by the
  2026-05-21 v5.0.0 foundation sprint and current feature backlog.
