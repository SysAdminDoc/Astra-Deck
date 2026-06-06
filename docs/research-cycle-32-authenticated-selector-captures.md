# Research Cycle 32 - Authenticated Selector Captures

Date: 2026-06-06

## Research Area

Authenticated and menu-state selector fixture coverage for the remaining
capture-week surfaces: History, Watch Later, and the opened notifications menu.

## Local Files Reviewed

- `scripts/capture-watch-mhtml.js`
- `scripts/build-selector-fixtures.js`
- `docs/selector-fixture-workflow.md`
- `ROADMAP.md`
- `AUTONOMOUS-LOOP-STATE.md`
- `docs/architecture.md`

## Findings

- The CDP capture helper now supports public `watch`, `search`, `shorts`,
  `channel`, and `embed` surfaces, but it has no `history`, `watch-later`, or
  `notifications` capture profiles.
- The selector workflow docs already identify the remaining captures as
  account or menu-state dependent. History and Watch Later need authenticated
  feed/list state; notifications needs the menu opened before snapshot.
- Unauthenticated capture attempts should not become fixtures for these
  surfaces because they settle on a generic `ytd-app` shell without proving the
  selectors Astra Deck depends on.
- The next useful implementation should add a safe authenticated capture lane,
  not more unauthenticated retries.

## External Sources

- Chrome DevTools Protocol Page domain:
  `https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureSnapshot`
  - `Page.captureSnapshot` returns a page snapshot as a string; MHTML includes
    iframes, shadow DOM, external resources, and inline styles.
- Playwright authentication:
  `https://playwright.dev/docs/auth`
  - Reusable authenticated browser state is a normal test pattern, but the state
    file can contain cookies and headers that impersonate a user and should not
    be checked into a repository.

## Roadmap Change

Added a P2 item to `ROADMAP.md` for an authenticated/menu-state selector capture
lane. Acceptance criteria require:

- explicit `history`, `watch-later`, and `notifications` capture profiles;
- caller-provided auth/profile state outside the repo;
- refusal to use auth/profile paths under the worktree;
- clear auth-required failure instead of false fixture generation;
- a clicked/opened notifications menu before capture;
- raw MHTML and auth state remaining untracked;
- selector-pack promotion only after stable matches are proven.

## Next Leads

- Decide whether the helper should use a persistent Chrome profile directory,
  Playwright-style storage state, or both.
- Add a read-only notification-menu opener that waits for
  `ytd-notification-renderer` before snapshot.
- Keep the authenticated profile path outside the repo and document it as a
  maintainer-local artifact.
