# AGENTS.md — Astra Deck

Read these tracked sources at the start of every session:

- `AUTONOMOUS-LOOP-STATE.md` — active autonomous-loop state, current branch,
  recent verification, and next-cycle notes.
- `ROADMAP.md` — canonical planned work and research queue.
- `RESEARCH_REPORT.md` — current research evidence, risks, and remaining
  opportunities.
- `COMPLETED.md` and `CHANGELOG.md` — shipped work and release notes.
- `docs/architecture.md` — current component map and trust boundaries.
- `docs/signing-keys.md` — public release, CRX key custody, and maintainer-local
  release checklist.
- `docs/audit/` — implementation/audit notes from recent autonomous cycles.

`CLAUDE.md` is intentionally ignored by Git in this repo and may exist as local
scratch notes. Treat it as optional local context, not as the committed source
of truth.

Global rules and shared memory: see `~/.codex/AGENTS.md`, which references the
shared memory dir at `~/.claude/projects/c--Users----repos/memory/`.
