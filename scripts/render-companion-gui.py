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
        from PyQt6.QtGui import QColor, QFont, QFontDatabase, QIcon, QPainter, QPixmap
        from PyQt6.QtTest import QTest
        from PyQt6.QtWidgets import QApplication

        install_dir = Path(temp_dir) / "AstraDownloader"
        install_dir.mkdir(parents=True, exist_ok=True)
        source_icon = ROOT / "AstraDownloader.ico"
        if source_icon.exists():
            shutil.copy2(source_icon, install_dir / "AstraDownloader.ico")

        app = QApplication(["render-companion-gui"])
        app.setQuitOnLastWindowClosed(False)
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

        def capture():
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            page_names = ("Dashboard", "Downloads", "History", "Settings")
            for expected_index, page_name in enumerate(page_names):
                # Build every view in a fresh window. Qt's Windows offscreen
                # backing store can otherwise retain partial rail damage from
                # the previous tab and produce a misleading screenshot.
                window = app_module.MainWindow(config, manager, history)
                window._animate_page = lambda: None
                window.show()
                app.processEvents()
                window._nav_click(page_name)
                for nav_button in window.nav_buttons:
                    nav_button.clearFocus()
                app.processEvents()
                window.repaint()
                window.sidebar.repaint()
                window.sidebar.raise_()
                app.processEvents()
                QTest.qWait(1200)
                if window.tabs.currentIndex() != expected_index:
                    raise RuntimeError(f"Companion navigation did not activate {page_name}")
                if not window.brand_widget.isVisible() or not all(button.isVisible() for button in window.nav_buttons):
                    raise RuntimeError(f"Companion navigation rail is incomplete on {page_name}")
                if page_name == "History" and window.btn_clear_history.isEnabled():
                    raise RuntimeError("Clear History must be disabled when history is empty")
                output = OUTPUT_DIR / f"{page_name.lower()}.png"
                pixmap = QPixmap(window.size())
                pixmap.fill(QColor("#080a0f"))
                window.render(pixmap)
                # QScrollArea viewports can paint over sibling widgets in the
                # Windows offscreen plugin. Re-render the rail with the tab
                # stack hidden so every navigation state remains trustworthy.
                window.tabs.hide()
                window.sidebar.raise_()
                window.sidebar.repaint()
                app.processEvents()
                sidebar_pixmap = QPixmap(window.sidebar.size())
                sidebar_pixmap.fill(QColor("#080a0f"))
                window.sidebar.render(sidebar_pixmap)
                window.tabs.show()
                painter = QPainter(pixmap)
                painter.drawPixmap(window.sidebar.pos(), sidebar_pixmap)
                painter.end()
                if pixmap.isNull() or pixmap.size() != window.size():
                    raise RuntimeError(f"Companion capture geometry is invalid for {page_name}")
                if not pixmap.save(str(output), "PNG"):
                    raise RuntimeError(f"Failed to save companion render: {output}")
                window._force_exit = True
                window.close()
                window.deleteLater()
                app.processEvents()
            # Exercise the privacy-critical diagnostics review as a real modal,
            # capture the exact preview surface, then cancel without touching
            # the clipboard.
            window = app_module.MainWindow(config, manager, history)
            window._animate_page = lambda: None
            window.show()
            app.processEvents()
            diagnostics_output = OUTPUT_DIR / "diagnostics-review.png"

            def capture_diagnostics_dialog():
                dialog = app.activeModalWidget()
                if dialog is None or dialog.windowTitle() != "Review Diagnostics":
                    raise RuntimeError("Diagnostics review dialog did not open")
                preview = dialog.findChild(app_module.QTextEdit)
                if preview is None or '"schemaVersion": 1' not in preview.toPlainText():
                    raise RuntimeError("Diagnostics review does not expose the redacted payload")
                pixmap = QPixmap(dialog.size())
                pixmap.fill(QColor("#080a0f"))
                dialog.render(pixmap)
                if not pixmap.save(str(diagnostics_output), "PNG"):
                    raise RuntimeError("Failed to save diagnostics review render")
                dialog.reject()

            QTimer.singleShot(150, capture_diagnostics_dialog)
            window._copy_diagnostics()
            window._force_exit = True
            window.close()
            window.deleteLater()
            app.processEvents()
            app.quit()

        QTimer.singleShot(1200, capture)
        exit_code = app.exec()
        outputs = [OUTPUT_DIR / f"{name}.png" for name in ("dashboard", "downloads", "history", "settings")]
        outputs.append(OUTPUT_DIR / "diagnostics-review.png")
        for output in outputs:
            if not output.exists() or output.stat().st_size < 10_000:
                raise RuntimeError(f"Companion render is missing or unexpectedly small: {output}")
        print(f"Rendered {len(outputs)} companion views in {OUTPUT_DIR}")
        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
