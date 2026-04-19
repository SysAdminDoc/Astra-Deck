#!/usr/bin/env python3
"""
Build AstraDownloader.exe using PyInstaller.
Outputs to ../AstraDownloader.exe alongside the logo/icon.
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent.resolve()
ROOT = HERE.parent
SCRIPT = HERE / "astra_downloader.py"
ICON = ROOT / "AstraDownloader.ico"
OUT_EXE = ROOT / "AstraDownloader.exe"

BUILD_DIR = HERE / "build"
DIST_DIR = HERE / "dist"


def clean():
    for d in (BUILD_DIR, DIST_DIR):
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    for spec in HERE.glob("*.spec"):
        spec.unlink(missing_ok=True)


def build():
    clean()
    args = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name", "AstraDownloader",
        "--icon", str(ICON),
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
    size_mb = OUT_EXE.stat().st_size / (1024 * 1024)
    print(f"OK: {OUT_EXE} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    build()
