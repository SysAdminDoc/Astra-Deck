# Companion Install Documentation Audit - 2026-06-05

## Scope

- `README.md`
- `docs/signing-keys.md`
- `tests/hardening.test.js`

## Finding

The README installed the browser extension and userscript first, then later
mentioned that downloads use the local Astra Downloader companion. It did not
give the companion a distinct setup section or state that latest release
`v4.46.0` lacks `AstraDownloader.exe` and `AstraDownloader.exe.sha256`.

That omission made the in-page setup prompt look release-ready even though the
release-channel proof still needs a public EXE and sidecar upload. Deno and
PO-token guidance also appeared without a parent companion setup context.

## Fix

- Added a standalone README companion setup section.
- Recorded that the current latest release `v4.46.0` does not include
  `AstraDownloader.exe` or `AstraDownloader.exe.sha256`.
- Documented the current Windows source-checkout launch path:
  `py -3.12 -m pip install -r astra_downloader/requirements.txt` and
  `py -3.12 astra_downloader/astra_downloader.py`.
- Linked the Downloads feature block back to the companion setup section.
- Clarified that PO-token provider and Deno setup are companion prerequisites,
  not browser extension install steps.
- Added release-checklist guardrails so README/release notes do not advertise a
  downloadable companion until both EXE and sidecar assets exist.
- Added a hardening regression for the docs contract.

## Remaining Work

- Public release upload/dry-run proof for `AstraDownloader.exe` and
  `AstraDownloader.exe.sha256` remains in the Cycle 22 release-channel item.
- Signed installer/MSI packaging remains a separate roadmap item.

## Verification

- `gh release view --repo SysAdminDoc/Astra-Deck --json tagName,publishedAt,assets,url`
- `rg -n "Astra Downloader|AstraDownloader.exe|Deno|PO Token" README.md docs/signing-keys.md docs`
- `node --test tests/hardening.test.js --test-name-pattern="companion setup|release manifest generation"`
- Full-cycle verification is recorded in `AUTONOMOUS-LOOP-STATE.md`.
