# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope, and `gh release view v4.50.7` shows `AstraDownloader.exe` + `AstraDownloader.exe.sha256` already attached to that release. Only the clean-Windows-machine verification half remains blocked. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (~1.3K stars, both store listings) and BlockTube is effectively stalled (last push 2026-02-07, 484 open issues, including a MV3 service-worker-suspension defect). Astra already ships BlockTube-grade filtering, so a BlockTube migration guide is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

- `Roadmap_Blocked.md` "P0 — Tag and publish the v4.51.1 release" is **version-stale as of 2026-08-06**: `gh release list` shows the latest published release is still v4.50.7 (2026-07-28), so the item itself is live, but the tree is now at v4.51.4 and the companion has moved to SysAdminDoc/AstraDownloader (a6bb685f) — the release must NOT carry `AstraDownloader.exe` (the `companion-not-republished` / `companion-not-manifested` readiness gates enforce this). Retarget the item to v4.51.4 (or current) with extension artifacts only. Note: several other `Roadmap_Blocked.md` items name `astra_downloader/*.py` paths that no longer exist in this repo — see the 2026-08-06 audit finding "Blocked-item tracker references files removed by the companion split" below.

## Status

No open items. The 2026-08-02 research additions and the 2026-08-05 /
2026-08-06 audit backlogs are fully drained — shipped work lives in
git history and `CHANGELOG.md`. The two audit coverage records moved to
`Roadmap_Blocked.md` under "Audit scope records"; everything else that
remains open is operator-gated and tracked there.
