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
