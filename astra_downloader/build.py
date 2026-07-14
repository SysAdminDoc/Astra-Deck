#!/usr/bin/env python3
"""
Build AstraDownloader.exe using PyInstaller.
Outputs to ../AstraDownloader.exe alongside the logo/icon.
"""
import ast
import hashlib
import importlib.metadata
import importlib.util
import json
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

# v1.4.0 (NX9): yt-dlp dropped Python 3.9 support in release 2025.10.22.
# Astra Downloader auto-downloads the latest yt-dlp.exe at first run, so a
# Python 3.9 host would shell out fine to the bundled yt-dlp binary, but
# anyone running `python astra_downloader.py` directly (dev / source) needs
# 3.10+. Hard-fail early with a clear message rather than yielding a
# cryptic ImportError downstream when the build environment uses a newer
# wheel.
MIN_PYTHON = (3, 10)
if sys.version_info < MIN_PYTHON:
    raise SystemExit(
        f"Astra Downloader requires Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ "
        f"(yt-dlp dropped 3.9 in 2025.10.22). "
        f"You're on {sys.version_info.major}.{sys.version_info.minor}."
    )

HERE = Path(__file__).parent.resolve()
ROOT = HERE.parent
SCRIPT = HERE / "astra_downloader.py"
ICON = ROOT / "AstraDownloader.ico"
OUT_EXE = ROOT / "AstraDownloader.exe"

BUILD_DIR = HERE / "build"
DIST_DIR = HERE / "dist"
SPEC_DIR = BUILD_DIR / "spec"
BUILD_METADATA = BUILD_DIR / "companion-build-metadata.json"


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_toc_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from iter_toc_strings(item)


def distribution_license_files(dist):
    results = []
    for item in dist.files or ():
        lowered = str(item).replace("\\", "/").lower()
        name = Path(lowered).name
        if not any(token in name for token in ("license", "copying", "notice", "copyright")):
            continue
        path = Path(dist.locate_file(item))
        if not path.is_file():
            continue
        results.append({
            "path": str(item).replace("\\", "/"),
            "sha256": sha256_file(path),
        })
    return sorted(results, key=lambda item: item["path"].lower())


def distribution_record_hash(dist):
    for item in dist.files or ():
        if str(item).replace("\\", "/").lower().endswith(".dist-info/record"):
            path = Path(dist.locate_file(item))
            if path.is_file():
                return sha256_file(path)
    return None


def distribution_metadata(dist, scope):
    metadata = dist.metadata
    name = metadata.get("Name") or "unknown"
    project_urls = metadata.get_all("Project-URL") or []
    source_url = metadata.get("Home-page") or ""
    if not source_url and project_urls:
        source_url = project_urls[0].partition(",")[2].strip()
    return {
        "name": name,
        "version": dist.version,
        "scope": scope,
        "license": metadata.get("License-Expression") or metadata.get("License") or "",
        "sourceUrl": source_url,
        "recordSha256": distribution_record_hash(dist),
        "licenseFiles": distribution_license_files(dist),
    }


def write_build_metadata(exe_path):
    analysis_toc = BUILD_DIR / "AstraDownloader" / "Analysis-00.toc"
    if not analysis_toc.is_file():
        raise SystemExit(f"Missing PyInstaller analysis inventory: {analysis_toc}")
    try:
        toc = ast.literal_eval(analysis_toc.read_text(encoding="utf-8"))
    except (OSError, SyntaxError, ValueError) as exc:
        raise SystemExit(f"Could not parse PyInstaller analysis inventory: {exc}") from exc

    packaged_paths = {
        str(Path(value).resolve()).casefold()
        for value in iter_toc_strings(toc)
        if Path(value).is_absolute()
    }
    distributions = []
    pyinstaller = None
    for dist in importlib.metadata.distributions():
        name = (dist.metadata.get("Name") or "").casefold()
        if name == "pyinstaller":
            pyinstaller = distribution_metadata(dist, "build")
        included = any(
            str(Path(dist.locate_file(item)).resolve()).casefold() in packaged_paths
            for item in dist.files or ()
        )
        if included and name != "pyinstaller":
            distributions.append(distribution_metadata(dist, "embedded"))

    if pyinstaller is None:
        raise SystemExit("PyInstaller distribution metadata is unavailable after a PyInstaller build")
    if not any(item["name"].casefold() == "pyqt6" for item in distributions):
        raise SystemExit("PyInstaller analysis did not inventory the embedded PyQt6 distribution")
    distributions.append(pyinstaller)
    distributions.sort(key=lambda item: (item["name"].casefold(), item["scope"]))

    source = SCRIPT.read_text(encoding="utf-8")
    version_match = re.search(r'^APP_VERSION\s*=\s*["\']([^"\']+)["\']', source, re.MULTILINE)
    if not version_match:
        raise SystemExit(f"Could not read APP_VERSION from {SCRIPT}")

    payload = {
        "schemaVersion": 1,
        "version": version_match.group(1),
        "artifact": {
            "name": exe_path.name,
            "size": exe_path.stat().st_size,
            "sha256": sha256_file(exe_path),
        },
        "python": {
            "implementation": platform.python_implementation(),
            "version": platform.python_version(),
            "license": "Python-2.0",
            "sourceUrl": f"https://www.python.org/downloads/release/python-{platform.python_version().replace('.', '')}/",
        },
        "distributions": distributions,
    }
    BUILD_METADATA.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def assert_inside_workspace(path):
    resolved = path.resolve()
    if resolved != HERE and HERE not in resolved.parents:
        raise SystemExit(f"Refusing to clean path outside astra_downloader: {resolved}")


def clean():
    for d in (BUILD_DIR, DIST_DIR):
        if d.exists():
            assert_inside_workspace(d)
            shutil.rmtree(d, ignore_errors=True)


def preflight():
    if not SCRIPT.exists():
        raise SystemExit(f"Missing entry point: {SCRIPT}")
    if not ICON.exists():
        raise SystemExit(f"Missing icon: {ICON}")
    if importlib.util.find_spec("PyInstaller") is None:
        raise SystemExit(
            "PyInstaller is not installed in the active virtual environment. Run: "
            f"{sys.executable} -m pip install --require-virtualenv pyinstaller"
        )


def build():
    preflight()
    clean()
    SPEC_DIR.mkdir(parents=True, exist_ok=True)
    args = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name", "AstraDownloader",
        "--icon", str(ICON),
        "--specpath", str(SPEC_DIR),
        # Required hidden imports
        "--hidden-import", "PyQt6.QtCore",
        "--hidden-import", "PyQt6.QtGui",
        "--hidden-import", "PyQt6.QtWidgets",
        "--hidden-import", "flask",
        "--hidden-import", "werkzeug",
        "--hidden-import", "requests",
        # Exclude unused stdlib to shrink size
        "--exclude-module", "tkinter",
        "--exclude-module", "unittest",
        "--exclude-module", "pydoc",
        str(SCRIPT),
    ]
    print("Building AstraDownloader.exe...")
    subprocess.check_call(args, cwd=str(HERE))

    built = DIST_DIR / "AstraDownloader.exe"
    if not built.exists():
        raise SystemExit(f"Build failed: {built} not found")

    OUT_EXE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(built, OUT_EXE)
    write_build_metadata(OUT_EXE)
    size_mb = OUT_EXE.stat().st_size / (1024 * 1024)
    print(f"OK: {OUT_EXE} ({size_mb:.1f} MB)")
    print(f"License inventory input: {BUILD_METADATA}")


if __name__ == "__main__":
    build()
