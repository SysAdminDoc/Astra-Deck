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
what ships in the `chromium-store`, `store-safe` and `github-full`
builds. Not sure? Leave it blank and the maintainer will pick one.

- [ ] **safe**: local-only, no external network, no AI keys, no companion required. Ships in every build.
- [ ] **api**: uses a third-party API on the user's behalf (SponsorBlock, RYD, DeArrow and so on). Some are on by default (SponsorBlock and DeArrow), others are opt-in. Either way the extension asks for access to that host before its first request.
- [ ] **local-companion**: needs the Astra Downloader companion running on `127.0.0.1`. Ships in `store-safe` and `github-full`, never in `chromium-store`.
- [ ] **experimental**: works but is fragile against YouTube DOM churn or browser-API churn. Power users only.
- [ ] **store-risk**: likely to be rejected on store review (ad blocking, age bypass, auto-engagement). `github-full` only.
- [ ] **byo-key**: needs the user's own API key (OpenAI, Anthropic, Gemini and so on). `github-full` only.

**Competitive parity** (optional)
Is this feature shipped by any of these competitors? Linking to
their docs or source is the fastest way for the maintainer to spec
the behavior:
SponsorBlock, DeArrow, Return YouTube Dislike, Enhancer for YouTube,
Improve YouTube, Unhook, BlockTube, PocketTube, UnTrap,
YouTube Tweaks, Tweaks for YouTube, Video Speed Controller,
Iridium for YouTube, Control Panel for YouTube. (The fuller
comparison is in `RESEARCH.md` under Competitive Landscape.)

**Additional context**
Any other details, mockups, or references.
