---
name: Feature Request
about: Suggest a new feature or enhancement for Astra Deck
title: "[Feature] "
labels: enhancement
assignees: ''
---

**Describe the feature**
A clear and concise description of the feature you'd like.

**Use case**
Why would this be useful? What problem does it solve?

**Proposed solution**
If you have ideas on how it should work, describe them here.

**Alternatives considered**
Any alternative solutions or workarounds you've considered.

**Intended audience / risk profile** (helps triage)
Pick the one that best fits how the feature should be gated. The
schema's `risk:` + `profile:` fields are how Astra Deck decides
what ships to the Chrome / Firefox stores vs the GitHub-Full
build. Don't worry if you're not sure — leave blank and the
maintainer will assign one.

- [ ] **safe** — store-safe; local-only, no external network, no AI keys, no companion required.
- [ ] **api** — uses a third-party API on the user's behalf (SponsorBlock, RYD, DeArrow, etc.). Default-off; user must opt in.
- [ ] **local-companion** — requires the Astra Downloader companion process running on `127.0.0.1`. GitHub-Full only.
- [ ] **experimental** — works but is fragile against YouTube DOM churn or browser-API churn. Power users only.
- [ ] **store-risk** — likely to be rejected on review (ad blocking, age bypass, auto-engagement). GitHub-Full only.
- [ ] **byo-key** — requires the user to paste their own API key (OpenAI, Anthropic, Gemini, etc.). GitHub-Full only.

**Competitive parity** (optional)
Is this feature shipped by any of these competitors? Linking to
their docs / source is the fastest way for the maintainer to spec
the behavior:
SponsorBlock, DeArrow, Return YouTube Dislike, Enhancer for YouTube,
Improve YouTube, Unhook, BlockTube, PocketTube, UnTrap, YouTube
Alchemy, YouTube Tweaks, Tweaks for YouTube, Video Speed Controller,
Iridium for YouTube, Control Panel for YouTube. (Full competitor
table in `ROADMAP.md` § Phase 1.)

**Additional context**
Any other details, mockups, or references.
