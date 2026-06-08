# Astra Deck Roadmap

Astra Deck is a mature Chrome/Firefox extension (plus a userscript build) with
200+ YouTube enhancements. This page captures the directions we're working
toward. Shipped work is recorded in [CHANGELOG.md](CHANGELOG.md).

## Direction

- **Easy distribution.** Keep installs simple — the userscript is one click
  today, with Chrome Web Store and Firefox AMO listings as the goal for signed
  one-click installs.
- **Cross-browser parity.** Keep the Chrome (MV3) build, the Firefox build, and
  the userscript at feature parity, gated by automated smoke tests before each
  release.
- **Accessibility.** Maintain WCAG 2.2 AA across the popup and every in-page
  overlay — keyboard operability, focus management, and screen-reader
  announcements.
- **Privacy & permissions.** Keep the store-safe profile minimal, document every
  permission, and prefer optional/host-gated grants over broad ones.
- **Downloads.** Keep improving the local companion path (port discovery,
  format/quality controls) and the in-page download surfaces.
- **Feature depth & polish.** Ongoing refinement of the player, content
  filtering, subscriptions, transcript, and theming surfaces.

## Considering

- Per-context quality controls and additional player tweaks.
- Broader subscription-management and feed-triage tooling.
- Additional locales and translation coverage.

## Competitive references

A couple of broad-scope YouTube extensions we track for feature parity:

| # | Competitor | Owner | Surfaces | Scope | Overlapping Astra surface |
| --- | --- | --- | --- | --- | --- |
| 21 | Iridium for YouTube | iridiumio | Chrome, Edge, Firefox | broad | Codec/quality controls and player polish — overlaps `qualityProfileMatrix` + `forceH264`. |
| 22 | Control Panel for YouTube | Jasper de Groot | Chrome, Firefox | broad | Layout / Shorts / channel UI tweaks — overlaps Astra's UI and theming surfaces. |
