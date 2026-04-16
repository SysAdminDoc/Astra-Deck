# Claude Handoff Prompt

Paste the prompt below into Claude when handing off this repo.

```text
You are taking over an in-progress audit and repair pass in:

C:\Users\--\repos\YouTube-Kit

Work as an expert QA engineer, senior full-stack developer, and UX/UI specialist. Your job is to continue the wider audit, find real bugs/edge cases/design flaws/performance issues, repair them safely, verify them, and keep the handoff trail current.

Read first, in this order:
1. CODEX-CHANGELOG.md
2. CLAUDE.md
3. extension/ytkit.js
4. YTKit.user.js

Important context:
- This repo contains a Chrome + Firefox MV3 extension and userscript for YouTube enhancements.
- Codex already completed a large repair pass across popup/settings flows, the background fetch bridge, transcript/AI-summary networking, comment-feature settings recovery, modal/toast accessibility, timeout/teardown cleanup in `extension/ytkit.js`, and a newer hardening pass across the tracked userscript and build/release path.
- CODEX-CHANGELOG.md is the authoritative agent-facing record of what was already repaired. Start there instead of re-deriving history from git diff alone.
- The most recent Codex batch focused on:
  - case-safe userscript path handling in build/check/sync scripts
  - canonical userscript metadata URLs
  - `youtu.be` watch-page parity in core helpers and userscript route checks
  - extension request/download hardening
  - popup/options/background async error-handling cleanup
  - userscript teardown parity for CPU tamer and comment handle revealer
  - `_blank`/external-open safety hardening

Constraints:
- Do not revert unrelated local changes.
- Leave roadmap.md and ROADMAP-COMPLETED.md alone unless explicitly asked.
- Start by checking `git status`; assume the tree may or may not be clean depending on where the handoff happens.
- Treat CODEX-CHANGELOG.md as the running handoff log and update it after each meaningful repair batch.

Current verified state from Codex:
- npm test
- npm run check
- npm run build:userscript
- Latest successful artifacts were built for v3.10.2

What to do next:
1. Continue the wider audit with emphasis on real user-visible bugs, lifecycle leaks, cleanup gaps, and regressions in `extension/ytkit.js`, `YTKit.user.js`, and extension-owned UI surfaces.
2. Prioritize manual-behavior risk areas that still need real browser QA:
   - `youtu.be` short-link behavior in both extension and userscript mode
   - popup quick toggles, panel-open flow, and options fallback behavior
   - options import/export/reset plus storage-change syncing
   - userscript comment handle revealer on real comments
   - downloader/external-open buttons and install flows
3. Keep looking for teardown/race bugs in the two monolithic runtime files, especially delayed work, feature-specific route assumptions, and state that can outlive disable/navigation.
4. Repair issues directly instead of only reporting them when the fix is safe and local.
5. Re-run relevant verification commands after each batch.
6. Update CODEX-CHANGELOG.md with:
   - what you changed
   - what you verified
   - what still looks risky

Guidance:
- Prefer small, safe, teardown-aware fixes over speculative large refactors.
- Do not assume older notes in public docs are complete; use CODEX-CHANGELOG.md as the primary repair ledger.
- If you find stale docs that would mislead future agents, fix them.
- If a suspected issue was already repaired, avoid duplicating work unless you confirm a regression.

Your first concrete step should be:
- read the newest CODEX-CHANGELOG.md entries first, then skim backward for context
- inspect the current risk-heavy areas in extension/ytkit.js and YTKit.user.js
- pick the next highest-confidence repair target that affects real behavior
- continue the changelog as you go
```
