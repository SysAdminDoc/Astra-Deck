#!/usr/bin/env python3
"""Render deterministic companion operational states for visual QA."""

import os
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "build" / "companion-ui-smoke"
CAPTURE_NAMES = (
    "dashboard-starting",
    "dashboard-online",
    "dashboard-error-degraded",
    "downloads-active-pending",
    "downloads-recovery-terminal",
    "history-populated",
    "history-cleared-undo",
    "history-restored",
    "settings-dirty",
    "settings-invalid",
    "settings-save-failed",
    "settings-update-busy",
    "reflow-900x620-hidpi-large-font",
    "diagnostics-review",
)


def main():
    scenario = os.environ.get("ASTRA_COMPANION_RENDER_SCENARIO")
    if not scenario:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        for old_capture in OUTPUT_DIR.glob("*.png"):
            old_capture.unlink()
        for name in CAPTURE_NAMES:
            env = dict(os.environ)
            env["ASTRA_COMPANION_RENDER_SCENARIO"] = name
            subprocess.run([sys.executable, str(Path(__file__).resolve())], env=env, check=True)
        for name in CAPTURE_NAMES:
            output = OUTPUT_DIR / f"{name}.png"
            if not output.exists() or output.stat().st_size < 10_000:
                raise RuntimeError(f"Companion render is missing or unexpectedly small: {output}")
        print(f"Rendered {len(CAPTURE_NAMES)} companion states in {OUTPUT_DIR}")
        return 0
    if scenario not in CAPTURE_NAMES:
        raise RuntimeError(f"Unknown companion render scenario: {scenario}")

    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    os.environ.setdefault("QT_SCALE_FACTOR", "2")
    os.environ["ASTRA_DOWNLOADER_NO_BOOTSTRAP"] = "1"

    with tempfile.TemporaryDirectory(prefix="astra-companion-render-") as temp_dir:
        os.environ["LOCALAPPDATA"] = temp_dir
        sys.path.insert(0, str(ROOT))

        from astra_downloader import astra_downloader as app_module
        from PyQt6.QtCore import QTimer
        from PyQt6.QtGui import QFont, QFontDatabase, QIcon, QImage
        from PyQt6.QtTest import QTest
        from PyQt6.QtWidgets import QApplication, QLabel, QScrollArea

        install_dir = Path(temp_dir) / "AstraDownloader"
        install_dir.mkdir(parents=True, exist_ok=True)
        source_icon = ROOT / "AstraDownloader.ico"
        if source_icon.exists():
            shutil.copy2(source_icon, install_dir / "AstraDownloader.ico")

        app = QApplication(["render-companion-gui"])
        app.setQuitOnLastWindowClosed(False)
        app.setApplicationName(app_module.APP_NAME)
        app.setApplicationVersion(app_module.APP_VERSION)
        for font_name in ("segoeui.ttf", "seguisb.ttf", "segoeuib.ttf"):
            font_path = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / font_name
            if font_path.exists():
                QFontDatabase.addApplicationFont(str(font_path))
        default_font = QFont("Segoe UI", 9)
        app.setFont(default_font)
        app.setStyleSheet(app_module.STYLESHEET)
        if app_module.ICON_PATH.exists():
            app.setWindowIcon(QIcon(str(app_module.ICON_PATH)))
        retained_windows = []

        # Visual fixtures never listen on a real port or probe external tools.
        # The state application below still calls the production render paths.
        app_module.MainWindow._start_instance_command_listener = lambda self: None
        app_module.MainWindow._stop_instance_command_listener = lambda self: None
        app_module.MainWindow._start_readiness_probe = lambda self: None
        app_module.MainWindow._refresh_tools_status = (
            lambda self: self._set_tools_status_text("yt-dlp 2026.07.04    •    ffmpeg 7.1")
        )

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        def make_context():
            config = app_module.Config()
            config.update({
                "CloseToTray": False,
                "StartMinimized": False,
                "DownloadPath": str(Path(temp_dir) / "Videos"),
                "AudioDownloadPath": str(Path(temp_dir) / "Music"),
            })
            history = app_module.History()
            manager = app_module.DownloadManager(config, history)
            return config, history, manager

        def make_window(*, large_font=False, minimum_size=False):
            app.setFont(QFont("Segoe UI", 12 if large_font else 9))
            config, history, manager = make_context()
            window = app_module.MainWindow(config, manager, history)
            window._animate_page = lambda: None
            window.update_timer.stop()
            window.cleanup_timer.stop()
            window.tools_status_timer.stop()
            if minimum_size:
                window.resize(900, 620)
            window.show()
            app.processEvents()
            QTest.qWait(120)
            return window, config, history, manager

        def select_page(window, page_name):
            expected_index = ("Dashboard", "Downloads", "History", "Settings").index(page_name)
            window._nav_click(page_name)
            for nav_button in window.nav_buttons:
                nav_button.clearFocus()
            app.processEvents()
            window.repaint()
            app.processEvents()
            QTest.qWait(80)
            if window.tabs.currentIndex() != expected_index:
                raise RuntimeError(f"Companion navigation did not activate {page_name}")
            if not window.brand_widget.isVisible() or not all(
                    button.isVisible() for button in window.nav_buttons):
                raise RuntimeError(f"Companion navigation rail is incomplete on {page_name}")
            for nav_button in window.nav_buttons:
                if not window.sidebar.rect().contains(nav_button.geometry()):
                    raise RuntimeError(f"Navigation control escaped the native rail on {page_name}")

        def scroll_current_page_to_bottom(window):
            current = window.tabs.currentWidget()
            scroll = current if isinstance(current, QScrollArea) else current.findChild(QScrollArea)
            if scroll is not None:
                scroll.verticalScrollBar().setValue(scroll.verticalScrollBar().maximum())
                app.processEvents()
                QTest.qWait(40)

        def scroll_current_page_to_top(window):
            current = window.tabs.currentWidget()
            scroll = current if isinstance(current, QScrollArea) else current.findChild(QScrollArea)
            if scroll is not None:
                scroll.verticalScrollBar().setValue(0)
                app.processEvents()
                QTest.qWait(40)

        def visible_text(window):
            return {
                label.text()
                for label in window.findChildren(QLabel)
                if label.isVisible() and label.text()
            }

        def assert_visible_text(window, expected):
            rendered = visible_text(window)
            missing = [text for text in expected if text not in rendered]
            if missing:
                raise RuntimeError(f"Operational state text is not visible: {missing}")

        def capture_window(window, name, *, dpr=1):
            if name not in CAPTURE_NAMES:
                raise RuntimeError(f"Undeclared companion fixture: {name}")
            app.processEvents()
            window.repaint()
            app.processEvents()
            QTest.qWait(80)
            logical_size = window.size()
            # Grab the complete native backing store in one pass. This pins the
            # shipped rail/page composition instead of recreating it in QPainter.
            image = window.grab().toImage()
            if image.isNull() or image.deviceIndependentSize().toSize() != logical_size:
                raise RuntimeError(f"Companion capture geometry is invalid for {name}")
            actual_dpr = round(image.devicePixelRatio())
            if actual_dpr < dpr:
                raise RuntimeError(
                    f"Companion capture {name} expected {dpr}x DPI, got {image.devicePixelRatio():.1f}x"
                )
            rail_x = max(1, min(window.sidebar.width() - 1, 116)) * actual_dpr
            rail_colors = {
                image.pixelColor(rail_x, y * actual_dpr).name()
                for y in range(12, max(13, window.height() - 12), 24)
            }
            if len(rail_colors) < 3:
                raise RuntimeError(f"Native navigation rail did not paint for {name}")
            output = OUTPUT_DIR / f"{name}.png"
            if not image.save(str(output), "PNG"):
                raise RuntimeError(f"Failed to save companion render: {output}")
            print(f"captured {name}", flush=True)

        def fixture_download(manager, dl_id, title, status, order, **values):
            download = app_module.Download(
                dl_id,
                f"https://www.youtube.com/watch?v={dl_id:0<11}",
                fmt=values.pop("fmt", "mp4"),
                quality=values.pop("quality", "1080"),
                output_dir=str(Path(temp_dir) / "Videos"),
                title=title,
                created_at=1_750_000_000 + order,
                queue_order=order,
                clock=lambda: 1_750_001_000,
            )
            download.status = status
            for key, value in values.items():
                setattr(download, key, value)
            manager.downloads[download.id] = download
            if status in app_module.DOWNLOAD_RUNNING_STATES:
                manager._running_ids.add(download.id)
            return download

        def seed_download_matrix(manager):
            fixture_download(manager, "pending", "Queued lecture", "pending", 1)
            fixture_download(
                manager, "active", "Downloading documentary", "downloading", 2,
                progress=63.4, speed="8.2 MiB/s", eta="00:18",
            )
            fixture_download(
                manager, "paused", "Recovered interview", "paused", 3,
                error="Recovered after restart. Resume when ready.",
            )
            fixture_download(
                manager, "needsauth", "Members-only archive", "needs-auth", 4,
                requires_auth=True,
                error="Fresh YouTube authentication is required.",
            )
            fixture_download(
                manager, "failed", "Unavailable livestream", "failed", 5,
                error="The video is unavailable in this region.",
                error_code="network",
                error_advice="Check the video in your browser and retry.",
                error_action="Open the video, then send it to Astra Downloader again.",
            )
            fixture_download(
                manager, "complete", "Finished tutorial", "complete", 6,
                progress=100,
                filename=str(Path(temp_dir) / "Videos" / "Finished tutorial.mp4"),
            )
            manager.total_completed = 1

        def seed_history(history):
            history.replace([
                {
                    "id": "history-1",
                    "url": "https://www.youtube.com/watch?v=history00001",
                    "title": "Keyboard navigation deep dive",
                    "filename": str(Path(temp_dir) / "Videos" / "Keyboard navigation deep dive.mp4"),
                    "format": "mp4",
                    "quality": "1080",
                    "duration": 754,
                    "date": "2026-07-28",
                },
                {
                    "id": "history-2",
                    "url": "https://www.youtube.com/watch?v=history00002",
                    "title": "Offline media workflow",
                    "filename": str(Path(temp_dir) / "Music" / "Offline media workflow.m4a"),
                    "format": "m4a",
                    "quality": "best",
                    "duration": 263,
                    "date": "2026-07-29",
                },
            ])

        def capture_dashboard_state(window):
            select_page(window, "Dashboard")
            if scenario == "dashboard-starting":
                window.status_label.setText("Starting")
                window.dash_status.setText("Starting local server")
                window.dash_hint.setText("Checking the local API and installed tools…")
                window._set_readiness("server", "Starting", "warning")
                assert_visible_text(window, {"Starting", "Starting local server", "Checking"})
            elif scenario == "dashboard-online":
                window.status_label.setText("Running")
                window.status_label.setStyleSheet(
                    "color: #75dcb1; font-size: 12px; font-weight: 650;"
                )
                window.dash_status.setText("Server online")
                window.dash_hint.setText("Local only · ready for Astra Deck")
                window.server_badge.setProperty("tone", "success")
                window.btn_startstop.setText("Stop Server")
                app_module.repolish(window.server_badge)
                window._set_readiness("server", "Running", "success")
                window._set_readiness("ytDlp", "2026.07.04", "success")
                window._set_readiness("ffmpeg", "7.1", "success")
                window._set_readiness("deno", "Deno 2.7.11", "success")
                window._set_readiness("sabr", "Supported", "success")
                assert_visible_text(window, {"Running", "Server online", "2026.07.04", "7.1"})
            else:
                window.status_label.setText("Server error")
                window.dash_status.setText("Server unavailable")
                window.dash_hint.setText(
                    "Server failed to start. The configured port is already in use."
                )
                degraded = {
                    "server": "Error",
                    "ytDlp": "Missing",
                    "ffmpeg": "7.1",
                    "deno": "Update Deno",
                    "sabr": "Limited",
                }
                for key, text in degraded.items():
                    _dot, value = window.readiness_values[key]
                    value.setText(text)
                assert_visible_text(
                    window, {"Server error", "Server unavailable", "Missing", "Update Deno"}
                )
            capture_window(window, scenario)

        def capture_download_state(window, manager):
            seed_download_matrix(manager)
            if scenario == "downloads-recovery-terminal":
                manager.downloads = {
                    dl_id: manager.downloads[dl_id]
                    for dl_id in ("paused", "needsauth", "failed", "complete")
                }
                manager._running_ids.clear()
            elif scenario == "reflow-900x620-hidpi-large-font":
                manager.downloads = {
                    dl_id: manager.downloads[dl_id]
                    for dl_id in ("active", "needsauth", "failed", "complete")
                }
            window._downloads_signature = None
            window._update_ui()
            select_page(window, "Downloads")
            if scenario == "downloads-active-pending":
                scroll_current_page_to_top(window)
                assert_visible_text(window, {"Downloading documentary", "Queued lecture"})
            else:
                if scenario == "reflow-900x620-hidpi-large-font":
                    window.resize(900, 620)
                    app.setFont(QFont("Segoe UI", 12))
                    window.setFont(app.font())
                    window.style().unpolish(window)
                    window.style().polish(window)
                    app.processEvents()
                    if window.size().width() != 900 or window.size().height() != 620:
                        raise RuntimeError("Companion minimum-size fixture did not reach 900x620")
                scroll_current_page_to_top(window)
                if scenario == "downloads-recovery-terminal":
                    assert_visible_text(
                        window,
                        {
                            "Recovered interview",
                            "Members-only archive",
                            "Unavailable livestream",
                            "Finished tutorial",
                        },
                    )
            capture_window(
                window, scenario,
                dpr=2 if scenario == "reflow-900x620-hidpi-large-font" else 1,
            )
            if scenario == "reflow-900x620-hidpi-large-font":
                output = QImage(str(OUTPUT_DIR / f"{scenario}.png"))
                if output.width() != 1800 or output.height() != 1240:
                    raise RuntimeError("High-DPI fixture was not captured at 2x resolution")

        def capture_history_state(window, history):
            seed_history(history)
            select_page(window, "History")
            window._refresh_history()
            if scenario == "history-cleared-undo":
                window._clear_history()
                app.processEvents()
                QTest.qWait(40)
                assert_visible_text(window, {"No downloads yet"})
                if not window.btn_undo_clear_history.isVisible():
                    raise RuntimeError("History clear fixture does not expose Undo")
            elif scenario == "history-restored":
                window._clear_history()
                window._undo_clear_history()
                app.processEvents()
                QTest.qWait(40)
                assert_visible_text(
                    window, {"Keyboard navigation deep dive", "Offline media workflow"}
                )
            else:
                assert_visible_text(
                    window, {"Keyboard navigation deep dive", "Offline media workflow"}
                )
            capture_window(window, scenario)

        def capture_settings_state(window, config):
            select_page(window, "Settings")
            expected = ""
            if scenario == "settings-dirty":
                window.cfg_dl_path.setText(str(Path(temp_dir) / "Videos" / "Edited"))
                expected = "Unsaved changes"
            elif scenario == "settings-invalid":
                window.cfg_outtmpl.setText("../%(title)s")
                window._save_settings()
                if window.cfg_outtmpl.property("state") != "error":
                    raise RuntimeError("Invalid settings fixture did not highlight the field")
                expected = "Check the highlighted fields before saving."
            elif scenario == "settings-save-failed":
                config.update = lambda _mapping: False
                window._save_settings()
                expected = (
                    "Could not save settings. Nothing changed; "
                    "check disk permissions and retry."
                )
            else:
                window.btn_check_updates.setEnabled(False)
                window.btn_check_updates.setText("Checking…")
                expected = (
                    "Checking yt-dlp. The verified current copy stays available "
                    "until the update passes."
                )
                window._show_settings_status(expected, "warning")
            scroll_current_page_to_bottom(window)
            assert_visible_text(window, {expected})
            capture_window(window, scenario)

        def capture_diagnostics(window):
            diagnostics_output = OUTPUT_DIR / "diagnostics-review.png"

            def capture_dialog():
                dialog = app.activeModalWidget()
                if dialog is None or dialog.windowTitle() != "Review Diagnostics":
                    raise RuntimeError("Diagnostics review dialog did not open")
                preview = dialog.findChild(app_module.QTextEdit)
                if preview is None or '"schemaVersion": 1' not in preview.toPlainText():
                    raise RuntimeError("Diagnostics review does not expose the redacted payload")
                image = dialog.grab().toImage()
                if not image.save(str(diagnostics_output), "PNG"):
                    raise RuntimeError("Failed to save diagnostics review render")
                print("captured diagnostics-review", flush=True)
                dialog.reject()

            QTimer.singleShot(150, capture_dialog)
            window._copy_diagnostics()

        capture_failures = []

        def capture_all():
            try:
                window, config, history, manager = make_window()
                if scenario.startswith("dashboard-"):
                    capture_dashboard_state(window)
                elif scenario.startswith("downloads-") or scenario.startswith("reflow-"):
                    capture_download_state(window, manager)
                elif scenario.startswith("history-"):
                    capture_history_state(window, history)
                elif scenario.startswith("settings-"):
                    capture_settings_state(window, config)
                else:
                    capture_diagnostics(window)
                output = OUTPUT_DIR / f"{scenario}.png"
                if not output.exists() or output.stat().st_size < 10_000:
                    raise RuntimeError(
                        f"Companion render is missing or unexpectedly small: {output}"
                    )
            except BaseException as error:
                capture_failures.append(error)
                traceback.print_exc()
            finally:
                if "window" in locals():
                    window.hide()
                    retained_windows.append(window)
                app.quit()

        QTimer.singleShot(0, capture_all)
        exit_code = app.exec()
        if capture_failures:
            raise capture_failures[0]
        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
