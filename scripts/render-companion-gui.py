#!/usr/bin/env python3
"""Render the companion dashboard offscreen for deterministic visual QA."""

import os
import shutil
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "build" / "companion-ui-smoke"


def main():
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    os.environ["ASTRA_DOWNLOADER_NO_BOOTSTRAP"] = "1"

    with tempfile.TemporaryDirectory(prefix="astra-companion-render-") as temp_dir:
        os.environ["LOCALAPPDATA"] = temp_dir
        sys.path.insert(0, str(ROOT))

        from astra_downloader import astra_downloader as app_module
        from PyQt6.QtCore import QTimer
        from PyQt6.QtGui import QColor, QFont, QFontDatabase, QIcon, QPixmap
        from PyQt6.QtWidgets import QApplication

        install_dir = Path(temp_dir) / "AstraDownloader"
        install_dir.mkdir(parents=True, exist_ok=True)
        source_icon = ROOT / "AstraDownloader.ico"
        if source_icon.exists():
            shutil.copy2(source_icon, install_dir / "AstraDownloader.ico")

        app = QApplication(["render-companion-gui"])
        app.setApplicationName(app_module.APP_NAME)
        app.setApplicationVersion(app_module.APP_VERSION)
        # The Windows offscreen plugin starts without a system font database.
        # Register the same Segoe faces used by the shipped native UI.
        for font_name in ("segoeui.ttf", "seguisb.ttf", "segoeuib.ttf"):
            font_path = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / font_name
            if font_path.exists():
                QFontDatabase.addApplicationFont(str(font_path))
        app.setFont(QFont("Segoe UI", 9))
        app.setStyleSheet(app_module.STYLESHEET)
        if app_module.ICON_PATH.exists():
            app.setWindowIcon(QIcon(str(app_module.ICON_PATH)))

        config = app_module.Config()
        config.update({"CloseToTray": False, "StartMinimized": False})
        history = app_module.History()
        manager = app_module.DownloadManager(config, history)
        window = app_module.MainWindow(config, manager, history)
        window._animate_page = lambda: None
        window.show()

        def capture():
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            for page_name in ("Dashboard", "Downloads", "History", "Settings"):
                window._nav_click(page_name)
                app.processEvents()
                window.repaint()
                app.processEvents()
                output = OUTPUT_DIR / f"{page_name.lower()}.png"
                pixmap = QPixmap(window.size())
                pixmap.fill(QColor("#080a0f"))
                window.render(pixmap)
                if not pixmap.save(str(output), "PNG"):
                    raise RuntimeError(f"Failed to save companion render: {output}")
            window._force_exit = True
            window.close()
            app.quit()

        QTimer.singleShot(1200, capture)
        exit_code = app.exec()
        outputs = [OUTPUT_DIR / f"{name}.png" for name in ("dashboard", "downloads", "history", "settings")]
        for output in outputs:
            if not output.exists() or output.stat().st_size < 10_000:
                raise RuntimeError(f"Companion render is missing or unexpectedly small: {output}")
        print(f"Rendered {len(outputs)} companion views in {OUTPUT_DIR}")
        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
