#!/usr/bin/env python3
"""Monthly yt-dlp extractor smoke test.

Downloads a tiny, stable YouTube test video with the pinned Python yt-dlp
package. This intentionally exercises the real extractor and media download
path, not only import/version checks, so Dependabot PRs and the scheduled
workflow fail before a broken extractor reaches users.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


DEFAULT_SMOKE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT_SECONDS = 300


def run_command(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd),
        text=True,
        capture_output=True,
        timeout=TIMEOUT_SECONDS,
        check=False,
    )


def main() -> int:
    smoke_url = os.environ.get("ASTRA_YTDLP_SMOKE_URL", DEFAULT_SMOKE_URL)
    with tempfile.TemporaryDirectory(prefix="astra-ytdlp-smoke-") as tmp:
        output_dir = Path(tmp)
        version = run_command([sys.executable, "-m", "yt_dlp", "--version"], output_dir)
        if version.returncode != 0:
            sys.stderr.write(version.stderr or version.stdout)
            return version.returncode or 1

        result = run_command(
            [
                sys.executable,
                "-m",
                "yt_dlp",
                "--no-playlist",
                "--no-progress",
                "--max-filesize",
                str(MAX_BYTES),
                "-f",
                "worst[filesize<25M]/worst",
                "--paths",
                str(output_dir),
                "-o",
                "%(id)s.%(ext)s",
                smoke_url,
            ],
            output_dir,
        )
        if result.returncode != 0:
            sys.stderr.write(result.stderr or result.stdout)
            return result.returncode or 1

        media_files = [
            path for path in output_dir.iterdir()
            if path.is_file() and path.suffix not in {".part", ".ytdl"}
        ]
        if not media_files:
            sys.stderr.write("yt-dlp smoke produced no media file\n")
            return 1

        largest = max(media_files, key=lambda path: path.stat().st_size)
        size = largest.stat().st_size
        if size <= 0:
            sys.stderr.write(f"yt-dlp smoke produced an empty file: {largest.name}\n")
            return 1
        if size > MAX_BYTES:
            sys.stderr.write(f"yt-dlp smoke exceeded max size: {size} > {MAX_BYTES}\n")
            return 1

        print(json.dumps({
            "ok": True,
            "ytDlpVersion": version.stdout.strip(),
            "url": smoke_url,
            "artifact": largest.name,
            "bytes": size,
        }, sort_keys=True))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
