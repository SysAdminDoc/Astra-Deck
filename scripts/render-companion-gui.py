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
        from PyQt6.QtCore import QRect, QTimer, Qt
        from PyQt6.QtGui import QColor, QFont, QFontDatabase, QIcon, QImage, QPainter
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
            # Prime Qt's offscreen style/icon caches before the first retained
            # frame. Without this disposable pass, the Windows plugin can omit
            # two rail rows from the initial Dashboard render even though the
            # live window and every subsequent page are complete.
            warmup = app_module.MainWindow(config, manager, history)
            warmup._animate_page = lambda: None
            warmup.show()
            app.processEvents()
            QTest.qWait(350)
            warmup._force_exit = True
            warmup.close()
            warmup.deleteLater()
            app.processEvents()
            page_names = ("Dashboard", "Downloads", "History", "Settings")
            # Retake Dashboard after the other pages have populated the raster
            # font cache. The first QImage text pass on Windows/offscreen can
            # omit previously unseen glyph runs even though later passes are
            # deterministic.
            capture_pages = tuple(enumerate(page_names)) + ((0, "Dashboard"),)
            for expected_index, page_name in capture_pages:
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
                if page_name == "Downloads":
                    if window.queue_capacity_badge.text() != "0 / 200 jobs":
                        raise RuntimeError("Download queue capacity did not render")
                    if not window.btn_queue_pause.isVisible():
                        raise RuntimeError("Download queue intake control is not visible")
                output = OUTPUT_DIR / f"{page_name.lower()}.png"
                image = QImage(window.size(), QImage.Format.Format_ARGB32)
                image.fill(QColor("#080a0f"))
                # QScrollArea viewports can paint over siblings in the Windows
                # offscreen plugin. Compose the two top-level surfaces from
                # isolated pixmaps so scroll pages cannot corrupt the rail or
                # move the page header into the sidebar.
                tab_image = QImage(window.tabs.size(), QImage.Format.Format_ARGB32)
                tab_image.fill(QColor("#0a0d12"))
                window.tabs.render(tab_image)
                app.processEvents()
                sidebar_image = QImage(window.sidebar.size(), QImage.Format.Format_ARGB32)
                sidebar_image.fill(QColor("#080a0f"))
                sidebar_painter = QPainter(sidebar_image)
                brand_icon = QIcon(str(app_module.ICON_PATH)).pixmap(32, 32)
                sidebar_painter.drawPixmap(20, 23, brand_icon)
                sidebar_painter.setPen(QColor("#fff8f2"))
                sidebar_painter.setFont(QFont("Segoe UI", 12, QFont.Weight.DemiBold))
                sidebar_painter.drawText(66, 36, "ASTRA DOWNLOADER")
                sidebar_painter.setPen(QColor("#818b98"))
                sidebar_painter.setFont(QFont("Segoe UI", 10))
                sidebar_painter.drawText(66, 55, f"LOCAL  ·  v{app_module.APP_VERSION}")
                # Do not read paint-time text/icon state back from offscreen
                # QPushButtons. The Windows plugin occasionally invalidates a
                # subset of those backing objects after a scroll page renders.
                # Geometry and labels are stable product contracts, so compose
                # them from their canonical definitions instead.
                for nav_index, nav_name in enumerate(page_names):
                    paint_rect = QRect(12, 86 + (69 * nav_index), 208, 69)
                    is_active = nav_name == page_name
                    if is_active:
                        sidebar_painter.fillRect(paint_rect, QColor("#202630"))
                        sidebar_painter.fillRect(
                            paint_rect.x(), paint_rect.y(), 3, paint_rect.height(), QColor("#ff6552")
                        )
                    sidebar_painter.drawPixmap(
                        paint_rect.x() + 15,
                        paint_rect.y() + ((paint_rect.height() - 18) // 2),
                        app_module.make_line_icon(nav_name).pixmap(18, 18),
                    )
                    sidebar_painter.setPen(QColor("#fff8f4") if is_active else QColor("#a6afba"))
                    sidebar_painter.setFont(QFont(
                        "Segoe UI", 11,
                        QFont.Weight.DemiBold if is_active else QFont.Weight.Normal,
                    ))
                    sidebar_painter.drawText(
                        paint_rect.adjusted(48, 0, -10, 0),
                        Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                        nav_name,
                    )
                sidebar_painter.setPen(QColor("#747f8d"))
                sidebar_painter.drawEllipse(23, sidebar_image.height() - 35, 6, 6)
                sidebar_painter.setFont(QFont("Segoe UI", 10))
                sidebar_painter.drawText(38, sidebar_image.height() - 28, window.status_label.text())
                sidebar_painter.setPen(QColor("#252c35"))
                sidebar_painter.drawLine(
                    sidebar_image.width() - 1, 0,
                    sidebar_image.width() - 1, sidebar_image.height(),
                )
                sidebar_painter.end()
                painter = QPainter(image)
                painter.drawImage(window.sidebar.width(), 0, tab_image)
                painter.drawImage(0, 0, sidebar_image)
                painter.end()
                if image.isNull() or image.size() != window.size():
                    raise RuntimeError(f"Companion capture geometry is invalid for {page_name}")
                if not image.save(str(output), "PNG"):
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
                dialog_image = QImage(dialog.size(), QImage.Format.Format_ARGB32)
                dialog_image.fill(QColor("#080a0f"))
                dialog.render(dialog_image)
                if not dialog_image.save(str(diagnostics_output), "PNG"):
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
