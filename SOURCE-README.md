# Building this add-on from source

This file is for Mozilla add-on reviewers. It explains how to rebuild the
uploaded package from this source tree and what to expect when you do.

## What to run

```
npm ci
npm run build-for-amo
```

That produces `build/astra-deck-store-safe-firefox-v<version>.xpi`, which is
the uploaded package. Pass `--profile github-full` or `--profile chromium-store`
if you are reviewing one of the other two builds; the profile is recorded in the
manifest under `x-ytkit-build-profile`, so you can read it off the package
rather than guess.

`npm ci` is the only step that touches the network, and it installs exactly what
`package-lock.json` pins. The build itself reads nothing but this tree.

## What the build does

`build-extension.js` stages `extension/` into `build/staging/`, rewrites the
manifest for the target browser and profile, and packages the result. The
rewrites are all removals or substitutions driven by the profile: the Firefox
manifest swaps the service worker for a background script, drops the Chrome-only
`side_panel` and `minimum_chrome_version` keys, adds `browser_specific_settings`,
and adds a `sidebar_action`. `scripts/manifest-patch.js` is the whole of that
delta and is small enough to read in one sitting.

No minifier runs. No transpiler runs. Every file in the package is either
copied verbatim from `extension/` or is the patched `manifest.json`, so you can
diff the package against this tree directly.

## Reproducibility

`npm run build-for-amo` builds twice and fails if the two artifacts differ, so a
non-reproducible build is caught here rather than during your review.

The archive is written by a small deterministic ZIP writer in
`build-extension.js` rather than by `zip` or `bsdtar`. Two reasons, and the
second is why you can trust the comparison:

- Both external packagers record per-entry timestamps that vary between runs.
  bsdtar records the file's *access* time, which reading the file to compress it
  is what changes, so no amount of normalising modification times fixed it.
- More importantly, they are not the same packager. Your environment would have
  run Info-ZIP against our bsdtar output. Two different implementations agreeing
  byte-for-byte would have been luck. Node's zlib is the same deflate on your
  machine and ours.

Every entry is stored with a fixed timestamp, a fixed mode, no extra fields, and
in sorted order. Set `SOURCE_DATE_EPOCH` if you want a different timestamp; the
default is a constant so a clean checkout reproduces with no environment setup.

## Environment

The reviewer environment on record is Ubuntu 24.04.4 LTS on ARM64 with Node
24.14.0 and npm 11.9.0. `npm run build-for-amo` prints both that and the
environment it actually ran in.

One deviation to declare: releases are built and this file is written on Windows
x64. The determinism work above exists specifically so that should not matter,
but a cross-architecture comparison has not been run by the maintainer, so if
your rebuild differs from the upload, that is the first thing to suspect and the
maintainer wants to hear about it. `.nvmrc` pins Node 22; the build runs on 24
as well and nothing in it depends on the version.

## What is deliberately not in the package

- `AstraDownloader.exe`. The optional local companion is a separate project at
  <https://github.com/SysAdminDoc/AstraDownloader> with its own releases. No
  Astra Deck package may carry it, and the release gates fail if one does.
- The userscript build (`YTKit.user.js`). Same source, different vehicle, not
  part of any extension package.
- The CRX. That is the Chrome self-distribution artifact and it is signed with a
  key the reviewer does not have, so `build-for-amo` never produces one.
