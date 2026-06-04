# Astra Deck — Signing-Key Policy

> **Audience:** the project maintainer. This document is the authoritative
> reference for `ytkit.pem` rotation, recovery, and the post-rotation
> migration path. It is committed to the repo for archival; the key itself
> is gitignored.

---

## 1. What `ytkit.pem` signs

`ytkit.pem` is a 2048-bit RSA private key used by [`crx3`](https://www.npmjs.com/package/crx3)
to sign the Chrome `.crx` self-distribution artifact produced by
`build-extension.js`. The signing operation:

1. Stages `extension/` into `build/staging/`.
2. Computes a SHA-256 hash of every staged file.
3. Signs the file-hash digest with `ytkit.pem`.
4. Packages staging + signature into a CRX3 envelope.

The CRX3 envelope embeds the **public** key derived from `ytkit.pem`.
Chrome computes the extension ID by hashing that public key into 32
lowercase hex characters and mapping `[0-9a-f]` to `[a-p]`. This means
**the extension ID is permanent for the lifetime of `ytkit.pem`**.

The same key signs `.xpi` for self-distribution to Firefox installs that
sideload before the AMO unlisted listing (NX4) ships.

---

## 2. Why rotation matters

A signing key is a long-lived secret. Once you publish CRX/XPI artifacts
to GitHub Releases, the public key embedded in the artifact identifies
the project. If the key is ever leaked, any third party can publish a
malicious build with the same extension ID, and Chrome will treat it as
a legitimate update.

Rotation responsibilities:

- **Periodic** — even without a leak, generate a fresh key on a slow
  cadence to limit the blast radius of an undetected compromise.
- **On compromise** — immediate rotation if the key ever ends up in
  a public commit, a leaked archive, or any non-maintainer's hands.
- **On hardware replacement** — when the maintainer migrates between
  machines, the key transfers but a copy on the old machine should be
  securely deleted.

---

## 3. Rotation cadence

| Trigger | Action | Window |
|---|---|---|
| Time-based prophylactic | Rotate | Annually (calendar reminder; align with a slow release window) |
| Suspected leak | Rotate + revoke + retroactive audit | Same day |
| Confirmed leak | Rotate + revoke + publish security advisory | Within 24 h |
| Hardware change | Migrate the existing key securely; no rotation | N/A |

The slow annual cadence is a working compromise. The blast radius of a
forgotten rotation on a maintenance-mode extension is small (the user
installs are already pinned to the current key); the cost of frequent
rotation is real (every rotation invalidates auto-update for existing
users — see §5).

---

## 4. Generating a new key

```bash
# Required: OpenSSL 3.x (Windows: shipped with Git Bash; macOS: `brew install openssl`).
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ytkit.pem
```

Verify:

```bash
openssl rsa -in ytkit.pem -check -noout
# Expected: "RSA key ok"
```

Compute the resulting extension ID so you can pre-stage docs / store
references:

```bash
node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const pem = fs.readFileSync("ytkit.pem", "utf8");
  const key = crypto.createPrivateKey(pem);
  const der = key.export({ type: "spki", format: "der" });
  const hash = crypto.createHash("sha256").update(der).digest("hex").slice(0, 32);
  const id = hash.split("").map(c => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");
  console.log("Extension ID:", id);
'
```

**Never commit `ytkit.pem`.** The repo's `.gitignore` already excludes
`*.pem` at the root. Re-confirm before staging a build:

```bash
git status ytkit.pem 2>&1 | grep -v 'No such file' && echo "DO NOT COMMIT" || echo "ok"
```

---

## 5. Migration path on rotation

Rotating `ytkit.pem` produces a new extension ID. Chrome and Firefox both
treat the new ID as a completely separate extension — users on the old
CRX/XPI **will not** auto-update to the new build.

### Pre-rotation announcement (T-7 days)

1. Open an issue titled "Signing key rotation — required manual reinstall"
   on `SysAdminDoc/Astra-Deck` and pin it.
2. Add a section to README.md explaining what's about to happen and
   linking to the issue.
3. Tag a final release on the OLD key with a deprecation banner in the
   popup ("This build will not auto-update past vN.N.N — install the
   next release manually from GitHub").
4. Push a CHANGELOG entry under `[Unreleased]` documenting the planned
   rotation date.

### Rotation day

1. Generate the new key per §4.
2. Compute and record the new extension ID.
3. Build a release on the new key (`node build-extension.js --bump
   patch`) — this produces fresh `.crx` / `.xpi` / `.zip` artifacts.
4. Tag the release with a `--key-rotation-vN` suffix in the release
   notes so the GH Releases page makes the discontinuity legible.
5. Update README install instructions:
   - The `.zip` "Load unpacked" path is unchanged.
   - The `.crx` drag-and-drop path needs the user to **uninstall** the
     old extension first (otherwise they end up with both running
     side-by-side).
   - The `.xpi` install path is unchanged for self-distribution users;
     AMO-signed users get a one-time prompt accepting the new
     publisher identity.

### Post-rotation (T+30 days)

1. Audit GitHub Releases to confirm artifacts on the new key are
   downloading at the expected rate (proxy: install-via-zip
   complaints in Issues drop off).
2. Close the rotation tracking issue.
3. Securely delete copies of the old key on every maintainer machine.
   Recommended: shred + zero on disks where the key was stored.
4. Move HARDENING.md's rotation log entry from "in progress" to
   "complete".

---

## 6. Recovery procedure (key leaked or lost)

### Leaked

1. **Immediately** generate a new key per §4 — even before announcing.
2. Push a release on the new key the same day. Include a SECURITY.md
   section explaining the leak's blast radius (whoever has the key
   can publish a build with the existing extension ID that
   self-installs as a legitimate update).
3. Open a GitHub Security Advisory on the repo with the affected
   release IDs and the migration instructions.
4. Tell users to **uninstall** the old CRX/XPI, not just update.
5. If the leak vector is known (committed by mistake, exposed in a
   backup, etc.), document it in the HARDENING.md log so the failure
   mode doesn't recur.

### Lost (no longer have a copy of the existing key)

1. There is no recovery. Without the existing key, you cannot publish
   a build that auto-updates existing installs.
2. Generate a new key per §4.
3. Treat this as a forced rotation; follow §5's migration path.
4. Add a HARDENING.md note explaining how the loss happened (off-site
   backup hygiene, disk failure, etc.) so the failure mode informs
   the key-storage policy.

---

## 7. Key storage policy

`ytkit.pem` lives outside the repo. Specifically:

| Where | Why |
|---|---|
| Local primary build machine (encrypted home dir) | Daily build use. |
| Offline backup (encrypted external drive or 1Password / Bitwarden vault) | Disaster recovery. Restore takes hours, not days. |
| Never on cloud storage without zero-knowledge encryption | Cloud-storage providers can subpoena, leak, or accidentally publish files. |
| Never in a CI secret store | CI never receives `ytkit.pem` and does not publish GitHub Releases. The tag workflow builds validation artifacts, emits `release-manifest.json` / `SHA256SUMS`, and creates attestations for those CI-built artifacts only. The maintainer builds the public CRX artifacts locally with `ytkit.pem` and uploads them with the local checksum manifest. |

Refresh the offline backup whenever the primary key changes.

---

## 8. Local release checklist

Use this path for public GitHub Releases while `ytkit.pem` remains local-only:

1. Confirm the tree is clean and the version surfaces match:
   `node scripts/check-versions.js --tag vX.Y.Z`.
2. Run the local gates: `npm test`, `npm run check`, and
   `py -3.12 -m pytest astra_downloader`.
3. Build signed artifacts from the machine that has `ytkit.pem`:
   `npm run build:userscript`.
4. Emit the release SBOM:
   `npm sbom --omit=dev --sbom-format cyclonedx > build/astra-deck-npm-sbom.cdx.json`.
5. Generate checksums and manifest: `npm run release:manifest`.
6. Verify `build/SHA256SUMS` names every uploaded artifact and that
   `build/release-manifest.json` marks `localSigningRequired: true`.
7. Create or update the GitHub Release from local `build/*` assets.
8. After upload, compare `gh release view <tag> --json assets` digest values
   against `build/SHA256SUMS`.

## 9. CWS / AMO publication paths

Per the current roadmap NX4, Astra Deck does not have an AMO listing.
The self-distribution model is:

- **Chrome** — `chrome://extensions` "Load unpacked" (always works) +
  CRX sideload (works when Chrome's per-user-script-extension Allow
  toggle is on, post-Chrome 138 default-off requires a manual flip per
  the CONTRIBUTING.md note).
- **Firefox** — `.xpi` sideload via `about:addons` → gear → Install
  Add-on From File. Requires `xpinstall.signatures.required = false`
  in `about:config` on Firefox stable, OR a published unlisted
  signature from AMO (NX4 unblocks this).

If/when CWS or AMO publication happens, the published CRX/XPI uses a
**different** key managed by the Web Store / AMO infrastructure, not
`ytkit.pem`. The self-distribution `ytkit.pem` stays in place for the
sideload path. Maintaining two keys is the explicit policy: the store
key is the publishing identity; the local key is the
load-unpacked-friendly identity. Both are valid; users on the store
artifact ride the store-key updates, users on self-distribution ride
the `ytkit.pem` updates.

---

## 10. Audit trail

Every rotation lands in `HARDENING.md` with an Hn entry naming:

- The date.
- The trigger (annual, leak, hardware change).
- The OLD extension ID.
- The NEW extension ID.
- The release tag carrying the new key.
- Confirmation that the old key was securely deleted off all
  maintainer machines (or, for leaks, deliberately retained for
  forensics).

The audit trail is committed to the repo. `ytkit.pem` itself is not.
