# Research Cycle 36 - Authenticated Capture Helper Safety

Date: 2026-06-06

## Research Area

Helper-only implementation slice for authenticated/menu-state selector captures
covering History, Watch Later, and opened notifications menu state.

## Local Files Changed

- `scripts/capture-watch-mhtml.js`
- `tests/selector-regression.test.js`
- `docs/selector-fixture-workflow.md`
- `.gitignore`
- `ROADMAP.md`
- `RESEARCH_REPORT.md`
- `AUTONOMOUS-LOOP-STATE.md`

## Implementation Summary

- Added `history`, `watch-later`, and `notifications` capture profiles to the
  existing Chrome DevTools Protocol helper.
- Added `--user-data-dir <path>` and `ASTRA_CAPTURE_PROFILE_DIR` support for
  authenticated captures.
- Required authenticated surfaces to use an absolute external Chrome profile
  path and fail before Chrome launch when no profile is supplied.
- Rejected profile paths under the repository worktree, including `.git`,
  `mhtml`, `tests/fixtures`, `playwright/.auth`, and `.auth`.
- Kept public captures on temporary profiles and external authenticated
  profiles out of the cleanup path.
- Added signed-in/content probes so History requires real feed/video-card
  selectors, Watch Later requires a populated list, and notifications requires
  an opened menu with at least one `ytd-notification-renderer`.
- Added a notification pre-capture action that clicks the topbar notification
  button and waits for `ytd-multi-page-menu-renderer` plus
  `ytd-notification-renderer` before snapshot.
- Wrapped parse-time errors so safety failures print a clear one-line message
  instead of a Node stack trace.
- Added ignore guards for `.auth/`, `playwright/.auth/`, `capture-profiles/`,
  and `*.storageState.json`.
- Updated selector fixture workflow docs and selector-regression tests for the
  helper CLI, safety refusals, ignore guards, and authenticated surface help.

## Intentional Non-Goals

- No raw `mhtml/History.mhtml`, `mhtml/WatchLater.mhtml`, or
  `mhtml/NotificationsMenu.mhtml` capture was generated.
- No fixture-builder `SOURCES` or `SURFACE_MATCH_SOURCES` registrations were
  added.
- No `tests/fixtures/*.tokens.txt` or `selector-surface-matches.json` rows were
  generated for authenticated surfaces.
- No selector-pack `captureEvidence`, `lastVerified`, stable selector, or
  fallback selector was promoted from unauthenticated evidence.
- No hosted repository settings, companion release assets, commits, or pushes
  were changed.

## Verification

Passed:

```powershell
node --check scripts/capture-watch-mhtml.js
node --check scripts/build-selector-fixtures.js
node --test tests/selector-regression.test.js
cmd.exe /v:on /d /c 'pushd "\\vmware-host\Shared Folders\repos\Astra-Deck" && (npm run capture:surface -- --surface history & set "code=!errorlevel!" & popd & exit /b !code!)'
cmd.exe /v:on /d /c 'pushd "\\vmware-host\Shared Folders\repos\Astra-Deck" && (npm run capture:surface -- --surface history --user-data-dir "\\vmware-host\Shared Folders\repos\Astra-Deck\.auth" & set "code=!errorlevel!" & popd & exit /b !code!)'
git status --ignored --short -- mhtml playwright .auth capture-profiles
```

Notes:

- The direct `npm run capture:surface -- --surface history` invocation from a
  UNC working directory still hits the known Windows `cmd.exe` UNC limitation.
  The verification therefore used `cmd pushd` to map the UNC path transiently.
- The npm negative check returned non-zero and printed the expected one-line
  message:
  `--surface history requires --user-data-dir <absolute external profile path> or ASTRA_CAPTURE_PROFILE_DIR`.
- The repo-local UNC profile-path check returned non-zero and refused
  `\\vmware-host\Shared Folders\repos\Astra-Deck\.auth` even when `cmd pushd`
  mapped the repo to a temporary drive letter.
- Ignored-file status reported `!! mhtml/`, confirming raw MHTML remains ignored.

## Next Leads

- Run positive captures from a maintainer-local, populated Chrome profile:
  `history`, `watch-later`, and `notifications`.
- After positive captures exist, add fixture-builder registrations atomically
  with derived token fixtures and selector-surface match rows.
- Promote selector-pack provenance only after the new match rows prove stable
  selectors for the authenticated surfaces.
