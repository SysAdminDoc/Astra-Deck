# Project Research and Feature Plan - Cycle 17 Signing Key Custody

Date: 2026-06-04

## Executive Summary

The CRX signing key is not tracked in git, but the current local checkout still
contains an ignored `ytkit.pem` file in the repository root and the build script
is written to use or create that root path. This contradicts the key-management
policy that says `ytkit.pem` lives outside the repo. The implementation gap is
not a public repository leak; it is a local custody and build-contract gap that
should be closed before the next maintainer-local public CRX release.

Recommended next item:

1. P0 - Move CRX signing key custody out of the repo worktree.

## Evidence Reviewed

Local/current commands inspected:

- `git ls-files --stage -- ytkit.pem`
- `Get-Item -Path ytkit.pem | Select-Object Name,Length,LastWriteTime`
- Header-only boolean check for whether the first line looks like a private-key
  header. The key body was not printed.
- `git log --oneline -- ytkit.pem | Select-Object -First 10`
- `git check-ignore -v -- ytkit.pem`
- `Get-Content .gitignore`
- `Get-Content docs/signing-keys.md`
- `rg -n "CRX_KEY|ytkit\.pem|crx|sign|key" build-extension.js scripts/generate-release-manifest.js tests package.json`

Important handling note:

- The key body was not printed, pasted, copied into docs, or committed during
  this research pass.
- Only git tracking state, ignore-rule state, file size, and a boolean
  private-key-header check were recorded.

Observed local state:

```json
{
  "git_tracked": false,
  "git_history_for_path": false,
  "ignored_by": ".gitignore:3:*.pem",
  "local_file_name": "ytkit.pem",
  "local_file_size_bytes": 1732,
  "looks_like_private_key_header": true
}
```

Current build behavior:

- `build-extension.js` defines the CRX key path as
  `path.join(__dirname, 'ytkit.pem')`.
- The Chrome CRX build uses that path if it exists.
- If no key exists, the CRX builder may generate a key and the script moves the
  generated key into the repository root as `ytkit.pem`.
- The release manifest currently records that CRX artifacts must be built
  locally with `ytkit.pem`.

Current documentation behavior:

- `docs/signing-keys.md` says never to commit `ytkit.pem`.
- The same doc says the key lives outside the repo.
- The release checklist still tells maintainers to build from the machine that
  has `ytkit.pem`, without an explicit external key path.

External sources reviewed:

- Chrome Extensions docs - Manifest `key`:
  https://developer.chrome.com/docs/extensions/reference/manifest/key
- Chrome Extensions docs - Self-host for Linux:
  https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux
- GitHub Docs - Ignoring files:
  https://docs.github.com/git-ignore?platform=windows

Relevant source facts:

- Chrome documentation describes the generated `.pem` file as containing the
  extension's private key for packed/self-hosted extension flows.
- Chrome documentation also documents stable extension identity through public
  key material in the manifest.
- GitHub's ignore-file documentation describes `.gitignore` as a way to avoid
  checking files into GitHub; it does not make ignored files safe to keep inside
  a repo worktree.

## Current Gap

Good current state:

- `ytkit.pem` is ignored by `.gitignore`.
- The path is not tracked by git in the current checkout.
- No git history was found for that path.
- Existing key-management docs already describe rotation, leak response, and
  offline backup expectations.

Remaining gap:

- The real local key appears to reside in the repo worktree, contrary to the
  written custody model.
- The build script hardcodes the repo-root path and auto-moves generated key
  material into that root path.
- Local release commands therefore train maintainers to keep the key beside the
  source tree instead of in the external encrypted key location.

## Recommended Roadmap Item

Add one P0 manual-gated item:

**Move CRX signing key custody out of the repo worktree.**

Acceptance shape:

- Add an explicit external key path contract, for example `ASTRA_CRX_KEY_PATH`
  or a release-build CLI option.
- Stop auto-generating or auto-moving key material into the repo root during
  normal release builds.
- Fail release builds with a clear message when the external key path is
  missing.
- Move the real maintainer key outside the repo worktree to the encrypted
  local-key location named in `docs/signing-keys.md`.
- Preserve the old extension ID by verifying the CRX public-key-derived ID
  before publishing.
- Keep an offline backup and update release docs/checklists with the external
  key path.

## Implementation Notes

Suggested implementation order:

1. Add an external key-path option to `build-extension.js`.
2. Keep CI validation artifact builds from requiring the private key.
3. Make release CRX builds fail closed when no external key path is supplied.
4. Keep a guarded development-only key-generation command if needed, but write
   generated keys outside the repo or require an explicit destination path.
5. Move the local key out of the repo root.
6. Compare the generated CRX extension ID with the previous self-distributed ID
   before publishing.
7. Update `docs/signing-keys.md`, release checklist text, and manifest metadata
   to describe the external path.

## Verification Ideas

Root key absence:

```powershell
Test-Path ytkit.pem
git status --ignored --short -- ytkit.pem
```

Expected:

- `Test-Path ytkit.pem` is `False` in the release checkout.
- Git status does not show a root key file, even as ignored.

Missing-key build behavior:

```powershell
npm run build:userscript
```

Expected:

- Release CRX signing fails with a clear missing-key-path message when no
  external key path is supplied.
- Validation/CI artifact builds that do not need the private key still have a
  documented non-signing path.

External-key build behavior:

```powershell
$env:ASTRA_CRX_KEY_PATH = "C:\\path\\outside\\repo\\ytkit.pem"
npm run build:userscript
```

Expected:

- CRX artifacts are signed from the external path.
- No command prints PEM contents.
- The extension ID matches the expected self-distributed CRX identity.

## Explicit Non-Goals

- Do not print, paste, or commit the private key.
- Do not rotate the key unless custody verification finds a real leak.
- Do not put `ytkit.pem` into GitHub Actions secrets.

## Open Questions

- Should release builds use `ASTRA_CRX_KEY_PATH`, a CLI flag, or both?
- Should CI build only ZIP/userscript validation artifacts until the external
  key path is supplied locally?
- Where should the expected self-distributed extension ID be recorded so the
  release check can compare it without exposing private key material?
