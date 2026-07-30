import hashlib
import inspect
import io
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
import zipfile
from unittest import mock
from pathlib import Path

import astra_downloader as ad


class FakeConfig:
    def __init__(self, data=None):
        self.data = {
            "DownloadPath": str(Path(tempfile.gettempdir()) / "astra-downloader-tests"),
            "AudioDownloadPath": "",
            "ConcurrentFragments": 4,
            "EmbedMetadata": False,
            "EmbedThumbnail": False,
            "EmbedChapters": False,
            "EmbedSubs": False,
            "SponsorBlock": False,
            "RateLimit": "",
            "Proxy": "",
            # Keep tests hermetic: start_download now opens the throttled
            # yt-dlp auto-update window, and the real DownloadManager wires the
            # real network updater. Default it off here so exercising a
            # download never spawns a background `yt-dlp -U`. Auto-update tests
            # pass their own config with this enabled.
            "AutoUpdateYtDlp": False,
        }
        if data:
            self.data.update(data)

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value):
        self.data[key] = value

    def save(self):
        pass


class FakeHistory:
    def __init__(self):
        self.entries = []

    def add(self, entry):
        self.entries.append(entry)

    def load(self):
        return list(self.entries)


class NormalizationTests(unittest.TestCase):
    def test_normalize_url_rejects_invalid_or_ambiguous_values(self):
        for value in ("", "https://", "javascript:alert(1)", "https://exa mple.com"):
            with self.subTest(value=value):
                url, err = ad.normalize_url(value)
                self.assertIsNone(url)
                self.assertIsNotNone(err)

        url, err = ad.normalize_url("https://example.com/watch?v=abc")
        self.assertEqual(url, "https://example.com/watch?v=abc")
        self.assertIsNone(err)

    def test_normalize_url_rejects_overlong_values_without_truncating(self):
        value = "https://example.com/" + ("a" * 5000)
        url, err = ad.normalize_url(value)
        self.assertIsNone(url)
        self.assertEqual(err, "URL is too long to download safely.")

    def test_sanitize_config_clamps_and_normalizes_untrusted_values(self):
        cfg = ad.sanitize_config({
            "ServerPort": "999999",
            "ServerToken": "short",
            "ConcurrentFragments": "999",
            "RateLimit": "2m",
            "Proxy": "file:///tmp/nope",
            "EmbedMetadata": "false",
            "LegacyHealthTokenEcho": "false",
            "SubLangs": "en,es;<bad>",
        })
        self.assertEqual(cfg["ServerPort"], 65535)
        self.assertEqual(cfg["ConcurrentFragments"], 32)
        self.assertEqual(cfg["RateLimit"], "2M")
        self.assertEqual(cfg["Proxy"], "")
        self.assertEqual(cfg["JavaScriptRuntime"], "auto")
        self.assertFalse(cfg["EmbedMetadata"])
        self.assertFalse(cfg["LegacyHealthTokenEcho"])
        self.assertEqual(cfg["SubLangs"], "en,esbad")
        self.assertGreaterEqual(len(cfg["ServerToken"]), 16)

        node_cfg = ad.sanitize_config({"JavaScriptRuntime": "NODE"})
        self.assertEqual(node_cfg["JavaScriptRuntime"], "node")

    def test_output_directory_must_be_absolute(self):
        path, err = ad.normalize_output_dir("relative-folder")
        self.assertIsNone(path)
        self.assertEqual(err, "Choose an absolute output folder.")

    def test_output_directory_rejects_overlong_values(self):
        path, err = ad.normalize_output_dir("C:\\" + ("a" * 3000))
        self.assertIsNone(path)
        self.assertEqual(err, "Output folder path is too long.")

    def test_playlist_item_selection_is_bounded_normalized_and_injection_safe(self):
        items, err = ad.normalize_playlist_items(["5", 1, 3, 3])
        self.assertEqual(items, [1, 3, 5])
        self.assertIsNone(err)

        invalid = (
            [],
            "1,2",
            [0],
            [-1],
            [True],
            ["1-3"],
            ["1,3"],
            ["1 --exec calc.exe"],
            list(range(1, 202)),
        )
        for value in invalid:
            with self.subTest(value=value):
                items, err = ad.normalize_playlist_items(value)
                self.assertIsNone(items)
                self.assertTrue(err)


class PersistenceTests(unittest.TestCase):
    def test_owned_config_store_uses_injected_persistence_and_rolls_back(self):
        import importlib

        config_module = importlib.import_module("config")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "owned-config.json"
            durable = {"value": 1}
            errors = []

            def loader(_path, _default):
                return dict(durable)

            def writer(_path, data):
                if data.get("value") == 3:
                    raise OSError("disk full")
                durable.clear()
                durable.update(data)

            store = config_module.ConfigStore(
                install_dir=Path(tmp),
                path=path,
                sanitizer=lambda data: dict(data),
                loader=loader,
                writer=writer,
                logger=errors.append,
            )
            self.assertTrue(store.update({"value": 2}))
            self.assertEqual(store.get("value"), 2)
            self.assertFalse(store.update({"value": 3}))
            self.assertEqual(store.get("value"), 2)
            self.assertEqual(durable, {"value": 2})
            self.assertEqual(errors, ["Config save failed: disk full"])
            self.assertEqual(Path(config_module.__file__).name, "config.py")

    def test_session_override_is_never_persisted_by_later_saves(self):
        # Session-only port fallback regression: a bind conflict overrides
        # ServerPort for the running process, but ANY later full-config save
        # (e.g. the yt-dlp update-check timestamp write) must keep the user's
        # configured port on disk.
        import importlib

        config_module = importlib.import_module("config")
        with tempfile.TemporaryDirectory() as tmp:
            durable = {"ServerPort": 9751}

            def writer(_path, data):
                durable.clear()
                durable.update(data)

            store = config_module.ConfigStore(
                install_dir=Path(tmp),
                path=Path(tmp) / "cfg.json",
                sanitizer=lambda data: dict(data),
                loader=lambda _path, _default: dict(durable),
                writer=writer,
                logger=self.fail,
            )
            store.set_session("ServerPort", 9761)
            # Live readers see the fallback; persistence helpers do not.
            self.assertEqual(store.get("ServerPort"), 9761)
            self.assertEqual(store.data["ServerPort"], 9761)
            self.assertEqual(store.get_persisted("ServerPort"), 9751)
            # An unrelated timestamp save must not leak the fallback port.
            store.set("LastYtDlpUpdateCheck", "2026-07-27T00:00:00")
            self.assertTrue(store.save())
            self.assertEqual(durable["ServerPort"], 9751)
            self.assertTrue(store.update({"AutoUpdateYtDlp": False}))
            self.assertEqual(durable["ServerPort"], 9751)
            # Explicitly saving the key clears the override.
            self.assertTrue(store.update({"ServerPort": 9800}))
            self.assertEqual(durable["ServerPort"], 9800)
            self.assertEqual(store.get("ServerPort"), 9800)

    def test_start_server_port_fallback_uses_session_override(self):
        import inspect

        gui_module = __import__("gui")
        source = inspect.getsource(gui_module.MainWindowCore._start_server)
        self.assertIn('set_session("ServerPort", chosen_port)', source)
        self.assertNotIn('self.config.set("ServerPort"', source)
        save_source = inspect.getsource(gui_module.MainWindowCore._save_settings)
        self.assertIn('get_persisted', save_source)

    def test_owned_history_store_enforces_injected_retention_limit(self):
        import importlib

        config_module = importlib.import_module("config")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "owned-history.json"
            durable = []

            def loader(_path, _default):
                return list(durable)

            def writer(actual_path, data):
                durable[:] = data
                actual_path.touch(exist_ok=True)

            store = config_module.HistoryStore(
                path=path,
                sanitizer=lambda entries: list(entries),
                loader=loader,
                writer=writer,
                logger=self.fail,
                limit=2,
            )
            for value in (1, 2, 3):
                self.assertTrue(store.add({"value": value}))
            self.assertEqual(store.load(), [{"value": 2}, {"value": 3}])
            self.assertEqual(Path(config_module.__file__).name, "config.py")

    def test_history_load_backs_up_corrupt_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = ad.HISTORY_PATH
            try:
                ad.HISTORY_PATH = Path(tmp) / "history.json"
                ad.HISTORY_PATH.write_text("{not-json", encoding="utf-8")
                history = ad.History()
                self.assertEqual(history.load(), [])
                backups = list(Path(tmp).glob("history.json.corrupt-*"))
                self.assertEqual(len(backups), 1)
            finally:
                ad.HISTORY_PATH = original

    def test_json_loader_quarantines_oversized_state_before_parsing(self):
        import importlib

        config_module = importlib.import_module('config')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'history.json'
            path.write_bytes(b'[' + (b' ' * 32) + b']')
            result = config_module.load_json_file(path, ['fallback'], max_bytes=8)
            self.assertEqual(result, ['fallback'])
            self.assertFalse(path.exists())
            self.assertEqual(len(list(Path(tmp).glob('history.json.corrupt-*'))), 1)

    def test_history_replace_restores_cleared_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = ad.HISTORY_PATH
            try:
                ad.HISTORY_PATH = Path(tmp) / "history.json"
                history = ad.History()
                snapshot = [
                    {"id": "1", "url": "https://example.com/1", "title": "One"},
                    {"id": "2", "url": "https://example.com/2", "title": "Two"},
                ]
                expected = ad.sanitize_history_entries(snapshot)
                history.replace(snapshot)
                self.assertEqual(history.load(), expected)

                history.clear()
                self.assertEqual(history.load(), [])

                history.replace(snapshot)
                self.assertEqual(history.load(), expected)
            finally:
                ad.HISTORY_PATH = original

    def test_config_update_failure_rolls_back_memory_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = ad.CONFIG_PATH
            try:
                ad.CONFIG_PATH = Path(tmp) / "config.json"
                config = ad.Config()
                old_port = config.get("ServerPort")
                old_file = ad.CONFIG_PATH.read_text(encoding="utf-8")

                with mock.patch.object(ad, "atomic_write_json", side_effect=PermissionError("denied")):
                    saved = config.update({"ServerPort": old_port + 1})

                self.assertFalse(saved)
                self.assertEqual(config.get("ServerPort"), old_port)
                self.assertEqual(ad.CONFIG_PATH.read_text(encoding="utf-8"), old_file)
            finally:
                ad.CONFIG_PATH = original

    def test_history_write_failure_is_reported_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = ad.HISTORY_PATH
            try:
                ad.HISTORY_PATH = Path(tmp) / "history.json"
                history = ad.History()
                snapshot = [{"id": "1", "url": "https://example.com/1", "title": "One"}]
                self.assertTrue(history.replace(snapshot))
                old_file = ad.HISTORY_PATH.read_text(encoding="utf-8")

                with mock.patch.object(ad, "atomic_write_json", side_effect=OSError("disk full")):
                    self.assertFalse(history.clear())
                    self.assertFalse(history.replace([]))

                self.assertEqual(ad.HISTORY_PATH.read_text(encoding="utf-8"), old_file)
                self.assertEqual(history.load(), ad.sanitize_history_entries(snapshot))
            finally:
                ad.HISTORY_PATH = original


class CompanionGuiPolicyTests(unittest.TestCase):
    def test_companion_settings_flows_do_not_use_blocking_message_boxes(self):
        src = (
            Path(ad.__file__).read_text(encoding='utf-8')
            + Path(ad.__file__).with_name('gui.py').read_text(encoding='utf-8')
        )
        import inspect
        server_error_src = inspect.getsource(ad.MainWindow._show_server_error)
        self.assertNotIn(
            "QMessageBox",
            src,
            "Companion settings/uninstall flows must report through in-window status, tray toasts, and logs.",
        )
        self.assertIn("self.btn_undo_clear_history.show()", src)
        self.assertIn("self.history_mgr.replace(self._cleared_history_snapshot)", src)
        self.assertIn("restart_now = connection_changed and self.server_running", src)
        self.assertNotIn("raise_()", server_error_src)
        self.assertNotIn("activateWindow()", server_error_src)

    def test_companion_uses_premium_command_center_and_async_readiness(self):
        import inspect

        gui_source = Path(ad.__file__).with_name("gui.py").read_text(encoding="utf-8")
        source = Path(ad.__file__).read_text(encoding="utf-8") + gui_source
        probe_source = inspect.getsource(ad.ReadinessProbe.run)
        probe_wiring_source = inspect.getsource(ad.ReadinessProbe.__init__)
        download_card_source = inspect.getsource(ad.MainWindow._download_card)
        self.assertIn("#ff6552", ad.STYLESHEET)
        self.assertIn('QFrame[class="readiness"]', ad.STYLESHEET)
        self.assertIn('QLabel[class="errorCallout"]', ad.STYLESHEET)
        self.assertIn("self._runtime_probe", probe_source)
        self.assertIn("self._provider_probe", probe_source)
        self.assertIn("probe_javascript_runtime", probe_wiring_source)
        self.assertIn("probe_po_token_provider", probe_wiring_source)
        self.assertIn("self.readiness_worker.moveToThread", source)
        self.assertIn("if is_frozen_app() and not visual_smoke", source)
        # The throwaway smoke render must not delegate to a live companion.
        self.assertIn("if not visual_smoke:\n        try:\n            lock = check_single_instance", source)
        self.assertIn("if visual_smoke:", source)
        self.assertIn("dl.error_advice", download_card_source)
        renderer_path = Path(ad.__file__).parents[1] / "scripts" / "render-companion-gui.py"
        self.assertTrue(renderer_path.exists())
        renderer_source = renderer_path.read_text(encoding="utf-8")
        self.assertIn("btn.setCheckable(True)", source)
        self.assertIn("btn.setAutoExclusive(True)", source)
        self.assertIn('self._show_settings_status("Unsaved changes", "warning")', source)
        self.assertIn('make_line_icon("Downloads" if "Queue" in title else "History", size=36)', gui_source)
        self.assertIn('QFrame[class="settingsGroup"]', ad.STYLESHEET)
        self.assertIn('QLabel[class="stateLabel"]', ad.STYLESHEET)
        self.assertIn("window.grab().toImage()", renderer_source)
        self.assertIn("for nav_button in window.nav_buttons", renderer_source)
        self.assertIn("Companion navigation rail is incomplete", renderer_source)
        self.assertNotIn("QPainter(", renderer_source)
        self.assertNotIn("import QPainter", renderer_source)
        self.assertIn('ASTRA_COMPANION_RENDER_SCENARIO', renderer_source)
        self.assertIn('"dashboard-error-degraded"', renderer_source)
        self.assertIn('"downloads-recovery-terminal"', renderer_source)
        self.assertIn('"history-cleared-undo"', renderer_source)
        self.assertIn('"settings-save-failed"', renderer_source)
        self.assertIn('"settings-update-busy"', renderer_source)
        self.assertIn('"reflow-900x620-hidpi-large-font"', renderer_source)
        self.assertIn('os.environ.setdefault("QT_SCALE_FACTOR", "2")', renderer_source)
        self.assertTrue(callable(ad.make_line_icon))
        self.assertIn("self.btn_clear_history.setEnabled(bool(data))", source)
        self.assertIn('"Open dashboard"', source)
        self.assertIn('"View download queue"', source)

    def test_failed_settings_write_keeps_server_running_and_form_dirty(self):
        class TextField:
            def __init__(self, value=""):
                self.value_text = value
                self.accessible_description = ""
                self.focused = False

            def text(self):
                return self.value_text

            def setText(self, value):
                self.value_text = value

            def setAccessibleDescription(self, value):
                self.accessible_description = value

            def setFocus(self, _reason):
                self.focused = True

        class NumberField:
            def __init__(self, value):
                self.number = value

            def value(self):
                return self.number

        class CheckField:
            def isChecked(self):
                return False

        class ComboField:
            def __init__(self, value="remove"):
                self.value = value

            def currentData(self):
                return self.value

        class Button:
            def __init__(self):
                self.text_value = "Save changes"

            def setText(self, value):
                self.text_value = value

        class FailingConfig(FakeConfig):
            def update(self, mapping):
                self.attempted = mapping
                return False

        class Harness:
            pass

        window = Harness()
        window.config = FailingConfig({"ServerPort": ad.SERVER_PORT, "ServerToken": "a" * 32})
        window.server_running = True
        window.cfg_port = NumberField(ad.SERVER_PORT + 1)
        window.cfg_token = TextField("b" * 32)
        window.cfg_dl_path = TextField(window.config.get("DownloadPath"))
        window.cfg_audio_path = TextField("")
        window.cfg_outtmpl = TextField("")
        window.cfg_sublangs = TextField("en")
        window.cfg_ratelimit = TextField("")
        window.cfg_proxy = TextField("")
        window.cfg_metadata = CheckField()
        window.cfg_thumbnail = CheckField()
        window.cfg_chapters = CheckField()
        window.cfg_subs = CheckField()
        window.cfg_sponsorblock = CheckField()
        window.cfg_sb_action = ComboField()
        window.cfg_js_runtime = ComboField("auto")
        window.cfg_ytdlp_channel = ComboField("nightly")
        window.cfg_fragments = NumberField(4)
        window.cfg_maxconcurrent = NumberField(3)
        window.cfg_retries = NumberField(10)
        window.cfg_autoupdate = CheckField()
        window.cfg_closetotray = CheckField()
        window.cfg_startmin = CheckField()
        window.cfg_notify = CheckField()
        window.btn_save = Button()
        window.statuses = []
        window.logs = []
        window.server_calls = []
        window._set_input_error = lambda *_args: None
        window._show_settings_status = lambda message, tone="neutral": window.statuses.append((message, tone))
        window._append_log = window.logs.append
        window._sync_connection_ui = lambda: window.server_calls.append("sync")
        window._stop_server = lambda: window.server_calls.append("stop")
        window._start_server = lambda: window.server_calls.append("start")
        window._dependencies = {
            "clamp_int": ad.clamp_int,
            "normalize_output_dir": ad.normalize_output_dir,
            "normalize_proxy": ad.normalize_proxy,
            "normalize_rate_limit": ad.normalize_rate_limit,
            "normalize_sublangs": ad.normalize_sublangs,
        }
        values = {"DEFAULT_CONFIG": ad.DEFAULT_CONFIG, "SERVER_PORT": ad.SERVER_PORT}
        window._value = values.__getitem__

        ad.MainWindow._save_settings(window)

        self.assertEqual(window.server_calls, [])
        self.assertEqual(window.btn_save.text_value, "Save changes")
        self.assertEqual(window.statuses[-1][1], "danger")
        self.assertIn("Nothing changed", window.statuses[-1][0])
        self.assertIn("server state were preserved", window.logs[-1])

    def test_settings_validation_focuses_and_describes_first_invalid_field(self):
        class Field:
            def __init__(self, value=""):
                self.value_text = value
                self.description = None
                self.focused = False

            def text(self):
                return self.value_text

            def setText(self, value):
                self.value_text = value

            def setAccessibleDescription(self, value):
                self.description = value

            def setFocus(self, _reason):
                self.focused = True

        class NumberField:
            def value(self):
                return ad.SERVER_PORT

        class Harness:
            pass

        window = Harness()
        window.config = FakeConfig({"ServerPort": ad.SERVER_PORT, "ServerToken": "a" * 32})
        window.cfg_port = NumberField()
        window.cfg_token = Field("a" * 32)
        window.cfg_dl_path = Field("bad-video")
        window.cfg_audio_path = Field("bad-audio")
        window.cfg_sublangs = Field("en")
        window.cfg_ratelimit = Field("")
        window.cfg_proxy = Field("")
        window.cfg_outtmpl = Field("")
        window.statuses = []
        window._set_input_error = lambda field, value: setattr(field, "has_error", value)
        window._show_settings_status = lambda message, tone="neutral": window.statuses.append((message, tone))
        window._dependencies = {
            "clamp_int": ad.clamp_int,
            "normalize_output_dir": lambda value, fallback: (fallback, "invalid"),
            "normalize_output_template": ad.normalize_output_template,
            "normalize_proxy": ad.normalize_proxy,
            "normalize_rate_limit": ad.normalize_rate_limit,
            "normalize_sublangs": ad.normalize_sublangs,
        }
        window._value = {"DEFAULT_CONFIG": ad.DEFAULT_CONFIG, "SERVER_PORT": ad.SERVER_PORT}.__getitem__

        ad.MainWindow._save_settings(window)

        self.assertTrue(window.cfg_dl_path.has_error)
        self.assertTrue(window.cfg_audio_path.has_error)
        self.assertTrue(window.cfg_dl_path.focused)
        self.assertIn("video download folder", window.cfg_dl_path.description)
        self.assertEqual(window.statuses[-1][1], "danger")

    def test_manual_ytdlp_update_defers_while_downloads_are_active(self):
        class ExistingPath:
            @staticmethod
            def exists():
                return True

        class Manager:
            @staticmethod
            def active_count():
                return 2

        class Button:
            def setEnabled(self, _value):
                raise AssertionError("deferred update must not enter a busy state")

        class Harness:
            pass

        window = Harness()
        window.dl_manager = Manager()
        window.btn_check_updates = Button()
        window.logs = []
        window.statuses = []
        window._append_log = window.logs.append
        window._show_settings_status = lambda message, tone="neutral": window.statuses.append((message, tone))
        window._value = lambda name: ExistingPath() if name == "YTDLP_PATH" else None

        ad.MainWindow._force_ytdlp_update(window)

        self.assertIn("2 download(s)", window.logs[-1])
        self.assertIn("active downloads", window.statuses[-1][0])
        self.assertEqual(window.statuses[-1][1], "warning")

    def test_manual_ytdlp_completion_restores_button_and_reports_recovery(self):
        class Button:
            def __init__(self):
                self.enabled = False
                self.text = "Checking…"

            def setEnabled(self, value):
                self.enabled = value

            def setText(self, value):
                self.text = value

        class Harness:
            pass

        window = Harness()
        window.btn_check_updates = Button()
        window.logs = []
        window.statuses = []
        window.refreshes = 0
        window._append_log = window.logs.append
        window._show_settings_status = lambda message, tone="neutral": window.statuses.append((message, tone))
        window._refresh_tools_status = lambda: setattr(window, "refreshes", window.refreshes + 1)

        ad.MainWindow._finish_ytdlp_update(window, {
            "ok": False,
            "error": "staged update failed",
            "rolled_back": True,
            "version_after": "2026.07.01",
        })

        self.assertTrue(window.btn_check_updates.enabled)
        self.assertEqual(window.btn_check_updates.text, "Check yt-dlp Update")
        self.assertEqual(window.refreshes, 1)
        self.assertIn("Restored 2026.07.01", window.logs[-1])
        self.assertEqual(window.statuses[-1][1], "danger")

    def test_token_clipboard_clear_preserves_newer_user_content(self):
        class Clipboard:
            def __init__(self, text):
                self.value = text
                self.clear_calls = 0

            def text(self):
                return self.value

            def clear(self):
                self.value = ""
                self.clear_calls += 1

        class Harness:
            pass

        window = Harness()
        window.statuses = []
        window._show_settings_status = lambda message, tone="neutral": window.statuses.append((message, tone))
        clipboard = Clipboard("newer clipboard content")
        qapplication = ad.MainWindow._clear_copied_token.__globals__["QApplication"]
        with mock.patch.object(qapplication, "clipboard", return_value=clipboard):
            ad.MainWindow._clear_copied_token(window, "private-token")
            self.assertEqual(clipboard.clear_calls, 0)

            clipboard.value = "private-token"
            ad.MainWindow._clear_copied_token(window, "private-token")

        self.assertEqual(clipboard.clear_calls, 1)
        self.assertIn("cleared", window.statuses[-1][0])

    def test_failed_history_clear_and_undo_preserve_recovery_state(self):
        class History:
            def load(self):
                return [{"id": "1", "title": "One"}]

            def clear(self):
                return False

            def replace(self, _entries):
                return False

        class Button:
            def __init__(self):
                self.hidden = False

            def hide(self):
                self.hidden = True

            def show(self):
                self.hidden = False

        class Harness:
            pass

        window = Harness()
        window.history_mgr = History()
        window._cleared_history_snapshot = [{"id": "prior", "title": "Prior"}]
        window.btn_undo_clear_history = Button()
        window.logs = []
        window.refreshes = 0
        window._append_log = window.logs.append
        window._refresh_history = lambda: setattr(window, "refreshes", window.refreshes + 1)

        ad.MainWindow._clear_history(window)
        self.assertEqual(window._cleared_history_snapshot, [{"id": "prior", "title": "Prior"}])
        self.assertEqual(window.refreshes, 0)
        self.assertIn("preserved", window.logs[-1])

        ad.MainWindow._undo_clear_history(window)
        self.assertEqual(window._cleared_history_snapshot, [{"id": "prior", "title": "Prior"}])
        self.assertFalse(window.btn_undo_clear_history.hidden)
        self.assertEqual(window.refreshes, 0)
        self.assertIn("still available", window.logs[-1])


class InstanceCommandTests(unittest.TestCase):
    def test_startup_command_detects_protocol_launches(self):
        self.assertEqual(ad.startup_command_from_argv(["mediadl://start"]), "start")
        self.assertEqual(ad.startup_command_from_argv(["ytdl://download"]), "start")
        self.assertEqual(ad.startup_command_from_argv(["--start-server"]), "start")
        self.assertEqual(ad.startup_command_from_argv(["--uninstall"]), "")

    def test_send_instance_command_posts_start_to_listener(self):
        ready = threading.Event()
        received = []
        port_holder = []

        def run_server():
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
                server.bind(("127.0.0.1", 0))
                port_holder.append(server.getsockname()[1])
                server.listen(1)
                ready.set()
                conn, _addr = server.accept()
                with conn:
                    received.append(conn.recv(128).decode("ascii").strip())

        thread = threading.Thread(target=run_server, daemon=True)
        thread.start()
        self.assertTrue(ready.wait(2))
        self.assertTrue(ad.send_instance_command("start", port=port_holder[0], attempts=1))
        thread.join(2)
        self.assertEqual(received, ["start"])

    def test_send_instance_command_posts_show_to_listener(self):
        ready = threading.Event()
        received = []
        port_holder = []

        def run_server():
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
                server.bind(("127.0.0.1", 0))
                port_holder.append(server.getsockname()[1])
                server.listen(1)
                ready.set()
                conn, _addr = server.accept()
                with conn:
                    received.append(conn.recv(128).decode("ascii").strip())

        thread = threading.Thread(target=run_server, daemon=True)
        thread.start()
        self.assertTrue(ready.wait(2))
        self.assertTrue(ad.send_instance_command("show", port=port_holder[0], attempts=1))
        thread.join(2)
        self.assertEqual(received, ["show"])

    def test_occupied_source_lock_delegates_without_killing_existing_instance(self):
        class OccupiedSocket:
            def bind(self, _address):
                raise OSError("occupied")

            def close(self):
                return None

        with mock.patch.object(ad.sys, "platform", "linux"), \
             mock.patch.object(ad.socket, "socket", return_value=OccupiedSocket()), \
             mock.patch.object(ad, "send_instance_command", return_value=True) as send:
            result = ad.check_single_instance()

        self.assertIs(result, ad.INSTANCE_ALREADY_RUNNING)
        send.assert_called_once_with("show", attempts=1)

    def test_existing_window_show_command_restores_window(self):
        class Window:
            pass

        window = Window()
        events = []
        window._append_log = events.append
        window._show_from_tray = lambda: events.append("shown")

        ad.MainWindow._handle_instance_command(window, "show")

        self.assertEqual(events[-1], "shown")


class DiagnosticsBundleTests(unittest.TestCase):
    def test_bundle_is_allowlisted_bounded_and_redacts_seeded_secrets(self):
        secret = "seeded-secret-value-1234567890abcdef"
        logs = [
            {
                "ts": "2026-07-14 12:00:00",
                "msg": (
                    f"Request https://youtube.com/watch?v=private123 failed; "
                    f"token={secret}; cookie=SAPISID; path=C:\\Users\\private\\Videos\\clip.mp4; "
                    f"id={'a' * 32}"
                ),
            }
        ] * (ad.DIAGNOSTIC_LOG_ENTRY_LIMIT + 5)

        bundle = ad.build_diagnostics_bundle(
            server_running=True,
            endpoint="http://127.0.0.1:9751",
            active_downloads=2,
            completed_downloads=7,
            recent_logs=logs,
            secrets=(secret,),
        )
        serialized = json.dumps(bundle)

        self.assertEqual(set(bundle), {
            "schemaVersion", "application", "service", "dependencies", "recentLog"
        })
        self.assertEqual(len(bundle["recentLog"]), ad.DIAGNOSTIC_LOG_ENTRY_LIMIT)
        self.assertEqual(bundle["service"]["activeDownloads"], 2)
        self.assertNotIn(secret, serialized)
        self.assertNotIn("private123", serialized)
        self.assertNotIn("C:\\\\Users", serialized)
        self.assertNotIn("SAPISID", serialized)
        self.assertNotIn("a" * 32, serialized)
        self.assertIn("[redacted", serialized)


class UninstallCleanupTests(unittest.TestCase):
    def test_uninstall_shutdown_targets_only_companion_process_tree(self):
        with mock.patch.object(ad, "send_instance_command", return_value=True) as send, \
             mock.patch.object(ad.time, "sleep") as sleep, \
             mock.patch.object(ad.sys, "platform", "win32"), \
             mock.patch.object(ad.os, "getpid", return_value=4242), \
             mock.patch.object(ad.subprocess, "run") as run:
            self.assertTrue(ad.stop_running_companion_for_uninstall())

        send.assert_called_once_with("shutdown", attempts=3, delay=0.2)
        sleep.assert_called_once_with(0.75)
        run.assert_called_once()
        command = run.call_args.args[0]
        self.assertIn("AstraDownloader.exe", command)
        self.assertIn("/T", command)
        self.assertNotIn("yt-dlp.exe", command)
        self.assertNotIn("ffmpeg.exe", command)

    def test_shutdown_instance_command_closes_owned_window(self):
        class Window:
            pass

        window = Window()
        events = []
        window._append_log = events.append
        window._force_close = lambda: events.append("closed")

        ad.MainWindow._handle_instance_command(window, "shutdown")

        self.assertEqual(events[-1], "closed")

    def test_delayed_install_dir_removal_only_accepts_app_owned_dir_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(ad.is_safe_install_dir_for_removal(Path(tmp) / "AstraDownloader"))
            self.assertFalse(ad.is_safe_install_dir_for_removal(Path(tmp) / "NotAstraDownloader"))
            self.assertFalse(ad.is_safe_install_dir_for_removal(Path(tmp)))

    def test_delayed_install_dir_removal_uses_literal_path_not_cmd_rmdir(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "AstraDownloader"
            target.mkdir()
            with mock.patch.object(ad.sys, "platform", "win32"), \
                    mock.patch.object(ad.subprocess, "Popen") as popen:
                self.assertTrue(ad.spawn_delayed_install_dir_removal(target))
                args = popen.call_args.args[0]

        self.assertEqual(args[0], "powershell")
        self.assertTrue(any("Remove-Item -LiteralPath $args[0]" in part for part in args))
        self.assertNotIn("cmd", args)
        self.assertNotIn("rmdir", args)
        self.assertEqual(args[-1], str(target.resolve()))


class DownloadManagerTests(unittest.TestCase):
    def test_fourth_download_is_retained_pending_while_three_run(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        release = threading.Event()

        def hold_queued(download):
            download.status = 'downloading'
            release.wait(2)
            download.status = 'complete'
            download.mark_terminal()

        manager._run_download = hold_queued

        ids = []
        for i in range(ad.MAX_CONCURRENT + 1):
            dl_id, err = manager.start_download(f"https://example.com/{i}")
            self.assertIsNone(err)
            ids.append(dl_id)

        self.assertEqual(manager.active_count(), ad.MAX_CONCURRENT)
        self.assertEqual(manager.pending_count(), 1)
        self.assertEqual(manager.downloads[ids[-1]].status, 'pending')
        release.set()

    def test_cancel_does_not_relabel_completed_downloads(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        dl = ad.Download("done", "https://example.com/done")
        dl.status = "complete"
        manager.downloads[dl.id] = dl

        self.assertFalse(manager.cancel(dl.id))
        self.assertEqual(dl.status, "complete")

    def test_cancel_stamps_terminal_time(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        dl = ad.Download("active", "https://example.com/active")
        manager.downloads[dl.id] = dl

        self.assertTrue(manager.cancel(dl.id))
        self.assertEqual(dl.status, "cancelled")
        self.assertIsNotNone(dl.finished_time)

    def test_cleanup_old_uses_finished_time_not_start_time(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        now = time.time()

        recent_long_download = ad.Download("recent-long", "https://example.com/recent-long")
        recent_long_download.status = "complete"
        recent_long_download.start_time = now - 3600
        recent_long_download.finished_time = now

        old_terminal = ad.Download("old-terminal", "https://example.com/old-terminal")
        old_terminal.status = "failed"
        old_terminal.start_time = now - 3600
        old_terminal.finished_time = now - 360

        manager.downloads[recent_long_download.id] = recent_long_download
        manager.downloads[old_terminal.id] = old_terminal

        manager.cleanup_old()

        self.assertIn(recent_long_download.id, manager.downloads)
        self.assertNotIn(old_terminal.id, manager.downloads)

    def test_terminal_records_are_reclaimed_before_queue_cap(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())

        def finish_immediately(download):
            download.status = "complete" if manager._next_id % 2 else "cancelled"
            download.mark_terminal()

        class ImmediateThread:
            def __init__(self, target=None, args=(), daemon=None):
                self.target = target
                self.args = args

            def start(self):
                self.target(*self.args)

        manager._run_download = finish_immediately
        with mock.patch.object(ad.threading, "Thread", ImmediateThread):
            for index in range(ad.MAX_QUEUED_TOTAL + 5):
                dl_id, err = manager.start_download(f"https://example.com/{index}")
                self.assertIsNone(err)
                self.assertIsNotNone(dl_id)

            active = ad.Download("active-preserved", "https://example.com/active")
            active.status = "downloading"
            manager.downloads[active.id] = active
            dl_id, err = manager.start_download("https://example.com/after-cap")

        self.assertIsNone(err)
        self.assertIsNotNone(dl_id)
        self.assertIn(active.id, manager.downloads)
        self.assertLessEqual(len(manager.downloads), ad.MAX_QUEUED_TOTAL)

    def test_pause_reorder_cancel_and_resume_control_pending_intake(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        self.assertTrue(manager.pause_intake())
        ids = []
        for index in range(3):
            dl_id, err = manager.start_download(f"https://example.com/{index}")
            self.assertIsNone(err)
            ids.append(dl_id)

        self.assertEqual(manager.active_count(), 0)
        self.assertEqual(manager.pending_count(), 3)
        ok, err = manager.move_pending(ids[2], 0)
        self.assertTrue(ok, err)
        self.assertEqual(manager.queue_payload()['downloads'][0]['id'], ids[2])

        running = ad.Download('running', 'https://example.com/running')
        running.status = 'downloading'
        manager.downloads[running.id] = running
        ok, err = manager.move_pending(running.id, 0)
        self.assertFalse(ok)
        self.assertIn('pending', err.lower())

        ok, err = manager.move_pending(ids[0], 0.5)
        self.assertFalse(ok)
        self.assertIn('integer', err.lower())

        self.assertTrue(manager.cancel(ids[1]))
        self.assertEqual(manager.downloads[ids[1]].status, 'cancelled')

    def test_persisted_intake_pause_survives_restart_with_empty_queue(self):
        # Regression: intakePaused was serialized but never read back, so
        # pausing intake with an empty pending list silently un-paused after
        # an application restart.
        with tempfile.TemporaryDirectory() as tmp:
            queue_path = Path(tmp) / 'download-queue.json'
            config = FakeConfig({'DownloadPath': tmp, 'AudioDownloadPath': tmp})
            manager = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertTrue(manager.pause_intake())
            self.assertEqual(manager.pending_count(), 0)

            restored = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertTrue(restored.intake_paused)

    def test_persisted_queue_restores_paused_and_never_serializes_cookies(self):
        cookies = [{
            'domain': '.youtube.com', 'name': 'SID', 'value': 'top-secret-cookie',
            'path': '/', 'secure': True,
        }]
        with tempfile.TemporaryDirectory() as tmp:
            queue_path = Path(tmp) / 'download-queue.json'
            config = FakeConfig({
                'DownloadPath': tmp,
                'AudioDownloadPath': tmp,
            })
            manager = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertTrue(manager.pause_intake())
            plain_id, plain_err = manager.start_download(
                'https://www.youtube.com/watch?v=plainQueue',
                section={"start": "1:02.5", "end": "1:05"},
            )
            playlist_id, playlist_err = manager.start_download(
                'https://www.youtube.com/playlist?list=PLplaylistQueue',
                playlist_items=[5, 1, 3, 3],
            )
            auth_id, auth_err = manager.start_download(
                'https://www.youtube.com/watch?v=authQueue1',
                cookies=cookies,
            )
            self.assertIsNone(plain_err)
            self.assertIsNone(playlist_err)
            self.assertIsNone(auth_err)

            persisted = queue_path.read_text(encoding='utf-8')
            self.assertNotIn('top-secret-cookie', persisted)
            self.assertNotIn('cookies_file', persisted)
            self.assertNotIn('cookiesFile', persisted)
            self.assertNotIn('.cookies.', persisted)

            restored = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertEqual(restored.active_count(), 0)
            self.assertTrue(restored.intake_paused)
            self.assertEqual(restored.downloads[plain_id].status, 'paused')
            self.assertEqual(
                restored.downloads[plain_id].section,
                {"start": 62.5, "end": 65.0},
            )
            self.assertEqual(
                restored.downloads[playlist_id].playlist_items,
                [1, 3, 5],
            )
            self.assertEqual(restored.downloads[auth_id].status, 'needs-auth')

            started = []

            def complete(download):
                started.append(download.id)
                download.status = 'complete'
                download.mark_terminal()

            restored._run_download = complete
            self.assertTrue(restored.resume_intake())
            deadline = time.time() + 2
            while time.time() < deadline and plain_id not in started:
                time.sleep(0.01)
            self.assertIn(plain_id, started)
            self.assertNotIn(auth_id, started)
            self.assertEqual(restored.downloads[auth_id].status, 'needs-auth')

            ok, err = restored.resume_download(auth_id)
            self.assertFalse(ok)
            self.assertIn('Fresh YouTube cookies', err)

            before_count = len(restored.downloads)
            with mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)):
                recovered_id, recovery_err = restored.start_download(
                    'https://www.youtube.com/watch?v=authQueue1',
                    cookies=[{
                        'domain': '.youtube.com', 'name': 'SID', 'value': 'fresh-cookie',
                        'path': '/', 'secure': True,
                    }],
                )
            self.assertIsNone(recovery_err)
            self.assertEqual(recovered_id, auth_id)
            self.assertEqual(len(restored.downloads), before_count)
            self.assertNotIn('fresh-cookie', queue_path.read_text(encoding='utf-8'))

    def test_empty_paused_queue_restores_paused_intake(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue_path = Path(tmp) / 'download-queue.json'
            config = FakeConfig({'DownloadPath': tmp})
            manager = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertTrue(manager.pause_intake())

            restored = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)

        self.assertTrue(restored.intake_paused)
        self.assertEqual(restored.pending_count(), 0)

    def test_restore_rejects_non_youtube_and_outside_root_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue_path = Path(tmp) / 'download-queue.json'
            outside = str(Path(tmp).parent / 'outside-downloads')
            queue_path.write_text(json.dumps({
                'schemaVersion': ad.DOWNLOAD_QUEUE_SCHEMA_VERSION,
                'intakePaused': True,
                'downloads': [
                    {
                        'id': 'non-youtube',
                        'url': 'https://127.0.0.1/internal',
                        'outputDir': tmp,
                    },
                    {
                        'id': 'outside-root',
                        'url': 'https://www.youtube.com/watch?v=outsideRoot',
                        'outputDir': outside,
                    },
                ],
            }), encoding='utf-8')

            restored = ad.DownloadManager(
                FakeConfig({'DownloadPath': tmp}),
                FakeHistory(),
                queue_path=queue_path,
            )

        self.assertEqual(restored.downloads, {})
        self.assertTrue(restored.intake_paused)

    def test_future_queue_schema_is_preserved_and_blocks_destructive_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue_path = Path(tmp) / 'download-queue.json'
            future = {
                'schemaVersion': ad.DOWNLOAD_QUEUE_SCHEMA_VERSION + 1,
                'futureOnly': {'preserve': True},
                'downloads': [],
            }
            queue_path.write_text(json.dumps(future), encoding='utf-8')
            manager = ad.DownloadManager(
                FakeConfig({'DownloadPath': tmp}),
                FakeHistory(),
                queue_path=queue_path,
            )

            dl_id, err = manager.start_download('https://example.com/future-schema')
            self.assertIsNone(dl_id)
            # The surfaced error must name the real cause (schema mismatch),
            # not the generic disk-space/permissions advice.
            self.assertIn('incompatible Astra Downloader version', err)
            self.assertEqual(json.loads(queue_path.read_text(encoding='utf-8')), future)
            self.assertIn('incompatible', manager.queue_payload()['persistenceError'])

    def test_only_classified_transient_failures_can_retry(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        manager.pause_intake()
        transient = ad.Download('transient', 'https://example.com/transient')
        transient.status = 'failed'
        transient.error_code = 'network-unreachable'
        transient.mark_terminal()
        permanent = ad.Download('permanent', 'https://example.com/permanent')
        permanent.status = 'failed'
        permanent.error_code = 'ffmpeg-missing-or-stale'
        permanent.mark_terminal()
        manager.downloads[transient.id] = transient
        manager.downloads[permanent.id] = permanent

        ok, err = manager.retry(transient.id)
        self.assertTrue(ok, err)
        self.assertEqual(transient.status, 'pending')
        ok, err = manager.retry(permanent.id)
        self.assertFalse(ok)
        self.assertIn('recovery action', err)

    def test_total_running_and_pending_capacity_remains_bounded(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        manager.pause_intake()
        for index in range(ad.MAX_QUEUED_TOTAL):
            dl_id, err = manager.start_download(f"https://example.com/{index}")
            self.assertIsNone(err)
            self.assertIsNotNone(dl_id)

        dl_id, err = manager.start_download('https://example.com/overflow')
        self.assertIsNone(dl_id)
        self.assertIn(f'{ad.MAX_QUEUED_TOTAL}/{ad.MAX_QUEUED_TOTAL}', err)
        capacity = manager.capacity()
        self.assertEqual(capacity['total'], ad.MAX_QUEUED_TOTAL)
        self.assertEqual(capacity['available'], 0)
        failed = ad.Download('failed-retry', 'https://example.com/failed-retry')
        failed.status = 'failed'
        failed.error_code = 'network-unreachable'
        failed.mark_terminal()
        manager.downloads[failed.id] = failed
        ok, retry_err = manager.retry(failed.id)
        self.assertFalse(ok)
        self.assertIn('queue is full', retry_err.lower())
        self.assertEqual(manager.capacity()['total'], ad.MAX_QUEUED_TOTAL)


class DownloadFailureClassifierTests(unittest.TestCase):
    def test_classifies_recoverable_youtube_failures(self):
        cases = [
            ('ERROR: Missing PO Token for web client', 'po-token-required'),
            ('bgutil PO token provider failed to issue token: stale provider', 'po-provider-stale'),
            ('ERROR: requested format is not available; SABR only', 'sabr-limited'),
            ('Deno JavaScript runtime not found for n/sig signature solving', 'deno-runtime-missing'),
            ('ERROR: Sign in to confirm you are not a bot', 'sign-in-required'),
            ('ERROR: ffmpeg not found; install ffmpeg', 'ffmpeg-missing-or-stale'),
            ('ERROR: Unable to download webpage: HTTP Error 503', 'network-unreachable'),
        ]
        for message, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(ad.classify_download_failure(message), expected)

    def test_message_borne_cause_outranks_benign_warning_lines(self):
        # yt-dlp routinely emits a benign "PO Token which was not provided"
        # WARNING during extraction; it must never shadow the real failure
        # cause carried by the final error message.
        warn_tail = [
            '[youtube] Extracting URL',
            'WARNING: [youtube] xyz: some web formats require a PO Token '
            'which was not provided',
        ]
        cases = [
            ('ERROR: Connection reset by peer', 'network-unreachable'),
            ('ERROR: ffmpeg exited with code 1', 'ffmpeg-missing-or-stale'),
            ('ERROR: Sign in to confirm you are not a bot', 'sign-in-required'),
        ]
        for message, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(
                    ad.classify_download_failure(message, lines=warn_tail),
                    expected,
                )
        # An unrecognized message still falls back to the output tail.
        self.assertEqual(
            ad.classify_download_failure('exit code 1', lines=warn_tail),
            'po-token-required',
        )

    def test_benign_failure_noise_never_becomes_the_surfaced_error(self):
        import download
        noise = [
            'WARNING: Your yt-dlp version (2026.03.17) is older than 90 days!',
            '[youtube] dQw4w9WgXcQ: Downloading webpage',
            'WARNING: [youtube] some web formats require a PO Token',
            '[download] Destination: video.mp4',
            'MDLP_JSON {"downloaded_bytes": 1}',
        ]
        for line in noise:
            with self.subTest(line=line):
                self.assertTrue(download._is_benign_failure_noise(line))
        for line in (
            'ERROR: Video unavailable',
            'ERROR: Sign in to confirm you are not a bot',
            'ffmpeg exited with code 1',
        ):
            with self.subTest(line=line):
                self.assertFalse(download._is_benign_failure_noise(line))
        # The whole point: the version-age nag must never be the failure reason.
        meaningful = [ln for ln in noise if not download._is_benign_failure_noise(ln)]
        self.assertEqual(meaningful, [])

    def test_download_error_payload_keeps_legacy_code_and_action_fields(self):
        payload = ad.download_error_payload('po-token-required')

        self.assertEqual(payload['code'], 'po-token-required')
        self.assertEqual(payload['error_code'], 'po-token-required')
        self.assertEqual(payload['next_action'], 'start-po-token-provider')
        self.assertIn('PO token', payload['error'])
        self.assertIn('127.0.0.1:4416', payload['advice'])

    def test_download_to_dict_includes_failure_recovery_metadata(self):
        dl = ad.Download('dl_test', 'https://www.youtube.com/watch?v=abcdefghijk')

        ad.apply_download_failure_classification(dl, 'ffmpeg-missing-or-stale')
        payload = dl.to_dict()

        self.assertEqual(payload['error_code'], 'ffmpeg-missing-or-stale')
        self.assertEqual(payload['next_action'], 'refresh-ffmpeg')
        self.assertIn('ffmpeg', payload['advice'])


class PickFolderRouteTests(unittest.TestCase):
    """Flask-level coverage for /pick-folder.

    Regression: a nested route handler named ``queue`` shadowed the stdlib
    ``queue`` module inside create_api's closure scope, so every /pick-folder
    request died with an AttributeError-driven 500 before reaching the GUI
    bridge.
    """

    def test_pick_folder_round_trips_through_the_gui_bridge(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())

        while not ad._folder_pick_q.empty():
            ad._folder_pick_q.get_nowait()
        original_service = ad._folder_picker_service
        ad._folder_picker_service = object()  # non-None: picker "available"
        picked = tempfile.gettempdir()

        def serve_one_pick():
            request = ad._folder_pick_q.get(timeout=10)
            request['response'].put({'path': picked})

        worker = threading.Thread(target=serve_one_pick, daemon=True)
        worker.start()
        try:
            resp = api.test_client().post(
                "/pick-folder",
                json={},
                headers={"X-Auth-Token": token},
            )
        finally:
            worker.join(timeout=15)
            ad._folder_picker_service = original_service

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertEqual(body.get('path'), picked)
        self.assertIn('outsideAllowlist', body)


class ApiSecurityTests(unittest.TestCase):
    def test_health_advertises_service_identity(self):
        config = FakeConfig({"ServerToken": "a" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        body = resp.get_json()

        self.assertEqual(body["service"], ad.SERVICE_ID)
        self.assertEqual(body["api"], ad.SERVICE_API_VERSION)
        self.assertTrue(body["token_required"])
        self.assertFalse(body["legacyTokenEcho"])
        self.assertTrue(body["nativeChannelRequired"])
        self.assertIn("updateRecovery", body)
        self.assertNotIn("token", body)

    def test_health_recent_errors_require_auth(self):
        # Recent log lines can carry absolute paths / exception text, so the
        # otherwise-unauthenticated /health surface must only expose them to a
        # caller holding the bearer token.
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        ad.write_persistent_log("secret path C:/Users/tester/leak.txt")

        anon = client.get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(anon.get_json()["recentErrors"], [])

        authed = client.get("/health", headers={
            "X-MDL-Client": "MediaDL",
            "X-Auth-Token": token,
        })
        entries = authed.get_json()["recentErrors"]
        self.assertTrue(entries, "authenticated /health must expose recent log entries")
        self.assertIn("leak.txt", json.dumps(entries))

    def test_health_omits_local_runtime_paths_and_probes_once(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        runtime = {
            "runtime": "deno",
            "installed": True,
            "version": "2.4.1",
            "supported": True,
            "ejsReady": True,
            "source": "bundled",
            "path": "C:/Users/tester/AppData/Local/Astra Downloader/deno.exe",
            "ytdlpNeedsRuntime": True,
        }
        with mock.patch.object(ad, "probe_javascript_runtime", return_value=runtime) as probe:
            api = ad.create_api(config, manager, FakeHistory())
            body = api.test_client().get("/health").get_json()

        self.assertEqual(probe.call_count, 1)
        self.assertEqual(body["javascriptRuntime"], body["denoRuntime"])
        self.assertNotIn("path", body["javascriptRuntime"])
        self.assertEqual(body["javascriptRuntime"]["source"], "bundled")

    def test_evaluate_sabr_support_reflects_capability(self):
        import health as _health
        # Until the native SABR downloader (PR #13515) merges, the sentinel is
        # None and every version reports "limited".
        self.assertIsNone(_health.SABR_NATIVE_MIN_VERSION)
        self.assertEqual(_health.evaluate_sabr_support("2026.07.04"), "limited")
        self.assertEqual(_health.evaluate_sabr_support(""), "limited")
        # When the sentinel is set, capable versions flip to "supported".
        with mock.patch.object(_health, "SABR_NATIVE_MIN_VERSION", "2026.09.01"):
            self.assertEqual(_health.evaluate_sabr_support("2026.09.01"), "supported")
            self.assertEqual(_health.evaluate_sabr_support("2026.10.15"), "supported")
            self.assertEqual(_health.evaluate_sabr_support("2026.07.04"), "limited")

    def test_health_sabr_support_is_not_hardcoded(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        body = api.test_client().get("/health").get_json()
        self.assertIn(body.get("sabrSupport"), ("limited", "supported"))

    def test_summarize_ytdlp_formats_filters_and_shapes(self):
        info = {
            "id": "abc", "title": "T", "duration": 12,
            "formats": [
                {"format_id": "18", "ext": "mp4", "height": 360, "width": 640,
                 "vcodec": "avc1", "acodec": "mp4a", "filesize": 1000, "fps": 30},
                {"format_id": "251", "ext": "webm", "vcodec": "none", "acodec": "opus",
                 "filesize_approx": 500},
                {"format_id": "sb0", "ext": "mhtml", "vcodec": "none", "acodec": "none"},
                {"format_id": None, "ext": "mp4"},
            ],
        }
        summary = ad.summarize_ytdlp_formats(info)
        ids = [f["format_id"] for f in summary["formats"]]
        self.assertEqual(ids, ["18", "251"], "mhtml + null-id + empty entries dropped")
        muxed = summary["formats"][0]
        self.assertTrue(muxed["has_video"] and muxed["has_audio"])
        audio = summary["formats"][1]
        self.assertFalse(audio["has_video"])
        self.assertTrue(audio["has_audio"])
        self.assertEqual(audio["filesize"], 500)
        self.assertEqual(summary["id"], "abc")

    def test_summarize_ytdlp_playlist_is_bounded_and_ui_safe(self):
        entries = [
            {
                "playlist_index": index,
                "id": f"video-{index}",
                "title": f"Video {index}",
                "channel": "Fixture channel",
                "duration": "12.9",
                "availability": "public",
            }
            for index in range(1, ad.PLAYLIST_PREVIEW_LIMIT + 2)
        ]
        summary = ad.summarize_ytdlp_playlist({
            "id": "PLfixture",
            "title": "Fixture playlist",
            "channel": "Fixture channel",
            "playlist_count": 275,
            "entries": entries,
        })

        self.assertEqual(summary["id"], "PLfixture")
        self.assertEqual(summary["total"], 275)
        self.assertTrue(summary["truncated"])
        self.assertEqual(summary["limit"], ad.PLAYLIST_PREVIEW_LIMIT)
        self.assertEqual(len(summary["items"]), ad.PLAYLIST_PREVIEW_LIMIT)
        self.assertEqual(summary["items"][0]["index"], 1)
        self.assertEqual(summary["items"][0]["duration"], 12)
        self.assertEqual(summary["items"][-1]["index"], ad.PLAYLIST_PREVIEW_LIMIT)

    def test_playlist_endpoint_requires_auth_youtube_playlist_and_returns_preview(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        playlist_url = "https://www.youtube.com/playlist?list=PLfixture"
        self.assertEqual(client.post("/playlist", json={"url": playlist_url}).status_code, 401)
        rejected = client.post(
            "/playlist",
            json={"url": "https://example.com/playlist?list=PLfixture"},
            headers={"X-Auth-Token": token},
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.get_json()["code"], "non-youtube-url")

        preview = {
            "id": "PLfixture",
            "title": "Fixture",
            "total": 2,
            "truncated": False,
            "limit": 200,
            "items": [{"index": 1, "id": "one", "title": "One"}],
        }
        with mock.patch.object(manager, "preview_playlist", return_value=(preview, None)):
            response = client.post(
                "/playlist",
                json={"url": playlist_url},
                headers={"X-Auth-Token": token},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), preview)

    def test_playlist_preview_uses_flat_bounded_probe_and_shared_gate(self):
        captured = []

        class FakeProc:
            returncode = 0

            def communicate(self, timeout=None):
                self.timeout = timeout
                return json.dumps({
                    "id": "PLfixture",
                    "playlist_count": 1,
                    "entries": [{"id": "one", "title": "One"}],
                }), ""

        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        with mock.patch.object(ad, "spawn_ytdlp", side_effect=lambda args, **_kwargs: captured.append(list(args)) or FakeProc()), \
             mock.patch.object(ad, "probe_po_token_provider", return_value=None), \
             mock.patch.object(ad, "probe_javascript_runtime", return_value={}):
            result, err = manager.preview_playlist(
                "https://www.youtube.com/playlist?list=PLfixture",
                timeout=7,
            )

        self.assertIsNone(err)
        self.assertEqual(result["items"][0]["id"], "one")
        args = captured[0]
        self.assertIn("--flat-playlist", args)
        self.assertIn("--dump-single-json", args)
        self.assertIn("--skip-download", args)
        self.assertEqual(
            args[args.index("--playlist-end") + 1],
            str(ad.PLAYLIST_PREVIEW_LIMIT + 1),
        )
        self.assertNotIn("--yes-playlist", args)

        for _ in range(manager.FORMATS_PROBE_LIMIT):
            self.assertTrue(manager._formats_gate.acquire(blocking=False))
        try:
            result, err = manager.preview_playlist(
                "https://www.youtube.com/playlist?list=PLfixture"
            )
            self.assertIsNone(result)
            self.assertEqual(err, manager.PLAYLIST_BUSY_MESSAGE)
        finally:
            for _ in range(manager.FORMATS_PROBE_LIMIT):
                manager._formats_gate.release()

    def test_formats_endpoint_requires_auth_and_youtube(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()
        # no token
        self.assertEqual(client.post("/formats", json={"url": "https://youtube.com/watch?v=x"}).status_code, 401)
        # non-YouTube rejected before spawning yt-dlp
        resp = client.post("/formats", json={"url": "https://example.com/x"}, headers={"X-Auth-Token": token})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json().get("code"), "non-youtube-url")
        # missing url
        self.assertEqual(client.post("/formats", json={}, headers={"X-Auth-Token": token}).status_code, 400)

    def test_formats_endpoint_returns_summary(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        summary = {"id": "dQw4w9WgXcQ", "title": "T", "duration": 1,
                   "formats": [{"format_id": "18", "ext": "mp4", "has_video": True, "has_audio": True}]}
        with mock.patch.object(manager, 'list_formats', return_value=(summary, None)):
            api = ad.create_api(config, manager, FakeHistory())
            resp = api.test_client().post(
                "/formats", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
                headers={"X-Auth-Token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["formats"][0]["format_id"], "18")

    def test_formats_endpoint_surfaces_listing_error(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        with mock.patch.object(manager, 'list_formats', return_value=(None, "Video unavailable")):
            api = ad.create_api(config, manager, FakeHistory())
            resp = api.test_client().post(
                "/formats", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
                headers={"X-Auth-Token": token})
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(resp.get_json().get("error"), "Video unavailable")

    def test_formats_probe_concurrency_is_bounded(self):
        # Each `yt-dlp -J` probe holds a waitress worker thread for up to
        # 60s; the semaphore keeps saturating /formats calls from starving
        # /health, /status and /download.
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        # Occupy every probe slot.
        for _ in range(manager.FORMATS_PROBE_LIMIT):
            self.assertTrue(manager._formats_gate.acquire(blocking=False))
        try:
            result, err = manager.list_formats("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            self.assertIsNone(result)
            self.assertEqual(err, manager.FORMATS_BUSY_MESSAGE)
            api = ad.create_api(config, manager, FakeHistory())
            resp = api.test_client().post(
                "/formats", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
                headers={"X-Auth-Token": token})
            self.assertEqual(resp.status_code, 429)
            self.assertEqual(resp.get_json().get("code"), "formats-busy")
            self.assertTrue(resp.headers.get("Retry-After"))
        finally:
            for _ in range(manager.FORMATS_PROBE_LIMIT):
                manager._formats_gate.release()

    def test_shutdown_is_post_only(self):
        token = "a" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()
        # GET is no longer allowed (state-changing action must not be a safe method)
        self.assertEqual(client.get("/shutdown", headers={"X-Auth-Token": token}).status_code, 405)
        # POST still requires auth
        self.assertEqual(client.post("/shutdown").status_code, 401)
        # POST with auth returns a teardown status (202 when no werkzeug hook)
        self.assertIn(client.post("/shutdown", headers={"X-Auth-Token": token}).status_code, (200, 202))

    def test_config_response_is_allowlisted(self):
        token = "a" * 32
        config = FakeConfig({
            "ServerToken": token,
            "Proxy": "https://user:secret@example.invalid:8443",
            "NativeChromeExtensionIds": "private-extension-id",
        })
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/config", headers={"X-Auth-Token": token})
        body = resp.get_json()

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(body["downloadPath"], config.get("DownloadPath"))
        self.assertEqual(body["DownloadPath"], config.get("DownloadPath"))
        for private_key in ("ServerToken", "Proxy", "NativeChromeExtensionIds"):
            self.assertNotIn(private_key, body)

    def test_health_legacy_token_echo_is_origin_allowlisted(self):
        trusted_origin = "chrome-extension://trustedlegacyid"
        config = FakeConfig({
            "ServerToken": "a" * 32,
            "LegacyHealthTokenEcho": True,
            "LegacyHealthTokenOrigins": trusted_origin,
        })
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        null_origin = client.get("/health", headers={
            "Origin": "null",
            "X-MDL-Client": "MediaDL",
        })
        self.assertNotIn("Access-Control-Allow-Origin", null_origin.headers)
        self.assertNotIn("token", null_origin.get_json())

        arbitrary_origin = "chrome-extension://abcdefghijklmnop"
        arbitrary_resp = client.get("/health", headers={
            "Origin": arbitrary_origin,
            "X-MDL-Client": "MediaDL",
        })
        self.assertNotIn("Access-Control-Allow-Origin", arbitrary_resp.headers)
        self.assertNotIn("token", arbitrary_resp.get_json())

        trusted_resp = client.get("/health", headers={
            "Origin": trusted_origin,
            "X-MDL-Client": "MediaDL",
        })
        self.assertEqual(trusted_resp.headers.get("Access-Control-Allow-Origin"), trusted_origin)
        self.assertEqual(trusted_resp.get_json()["token"], "a" * 32)

        background_resp = client.get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(background_resp.get_json()["token"], "a" * 32)

        native_resp = client.get("/health", headers={
            "X-MDL-Client": "MediaDL",
            "X-MDL-Token-Source": "native",
        })
        native_body = native_resp.get_json()
        self.assertEqual(native_body["tokenSource"], "native")
        self.assertNotIn("token", native_body)

    def test_health_legacy_echo_allows_configured_native_chrome_id(self):
        extension_origin = "chrome-extension://configuredchromeid"
        config = FakeConfig({
            "ServerToken": "c" * 32,
            "LegacyHealthTokenEcho": True,
            "NativeChromeExtensionIds": "configuredchromeid",
        })
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={
            "Origin": extension_origin,
            "X-MDL-Client": "MediaDL",
        })
        self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), extension_origin)
        self.assertEqual(resp.get_json()["token"], "c" * 32)

    def test_health_legacy_token_echo_can_be_disabled(self):
        token = "b" * 32
        extension_origin = "chrome-extension://trustedlegacyid"
        config = FakeConfig({
            "ServerToken": token,
            "LegacyHealthTokenEcho": False,
            "LegacyHealthTokenOrigins": extension_origin,
        })
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        background_resp = client.get("/health", headers={"X-MDL-Client": "MediaDL"})
        background_body = background_resp.get_json()
        self.assertEqual(background_body["status"], "ok")
        self.assertFalse(background_body["legacyTokenEcho"])
        self.assertTrue(background_body["nativeChannelRequired"])
        self.assertNotIn("token", background_body)

        extension_resp = client.get("/health", headers={
            "Origin": extension_origin,
            "X-MDL-Client": "MediaDL",
        })
        extension_body = extension_resp.get_json()
        self.assertEqual(extension_resp.headers.get("Access-Control-Allow-Origin"), extension_origin)
        self.assertFalse(extension_body["legacyTokenEcho"])
        self.assertTrue(extension_body["nativeChannelRequired"])
        self.assertNotIn("token", extension_body)

        native_resp = client.get("/health", headers={
            "X-MDL-Client": "MediaDL",
            "X-MDL-Token-Source": "native",
        })
        native_body = native_resp.get_json()
        self.assertEqual(native_body["status"], "ok")
        self.assertEqual(native_body["tokenSource"], "native")
        self.assertNotIn("token", native_body)

        authenticated_resp = client.get("/history?limit=1", headers={
            "X-Auth-Token": token,
            "X-MDL-Token-Source": "native",
        })
        self.assertEqual(authenticated_resp.status_code, 200)

    def test_download_rejects_non_object_json_body(self):
        token = "c" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().post(
            "/download",
            json=["https://example.com/video"],
            headers={"X-Auth-Token": token},
        )

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["error"], "Missing download URL.")

    def test_queue_mutations_reject_non_object_json_bodies(self):
        token = "c" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        manager.pause_intake()
        dl_id, _ = manager.start_download(
            "https://www.youtube.com/watch?v=jsonBoundary",
        )
        api = ad.create_api(config, manager, FakeHistory())
        headers = {"X-Auth-Token": token}
        client = api.test_client()

        for endpoint in (
            f"/queue/{dl_id}/resume",
            f"/queue/{dl_id}/retry",
            f"/queue/{dl_id}/move",
        ):
            with self.subTest(endpoint=endpoint):
                resp = client.post(endpoint, json=["not", "an", "object"], headers=headers)
                self.assertEqual(resp.status_code, 400)
                self.assertIn("JSON object", resp.get_json()["error"])

        with mock.patch.object(ad, "_folder_picker_service", object()):
            resp = client.post(
                "/pick-folder",
                json=["not", "an", "object"],
                headers=headers,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["code"], "invalid-request-body")

    def test_download_request_body_allows_reviewed_extension_fields(self):
        body = {
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "audioOnly": False,
            "format": "mp4",
            "quality": "1080",
            "outputDir": str(Path(tempfile.gettempdir())),
            "title": "Fixture",
            "referer": "https://www.youtube.com/",
            "cookies": [],
            "section": {"start": "1:02.5", "end": "1:05"},
            "playlistItems": ["5", 1, 3, 3],
        }
        validated, err, code = ad.validate_download_request_body(body)
        self.assertEqual(validated["section"], {"start": 62.5, "end": 65.0})
        self.assertEqual(validated["playlistItems"], [1, 3, 5])
        self.assertIsNone(err)
        self.assertIsNone(code)

    def test_download_request_body_rejects_invalid_clip_ranges(self):
        invalid_sections = (
            {"start": "", "end": "1:00"},
            {"start": "1:00", "end": "0:59"},
            {"start": "0:00", "end": "25:00:00"},
            {"start": "0:00", "end": "1:00", "args": "--copy"},
            ["0:00", "1:00"],
        )
        for section in invalid_sections:
            with self.subTest(section=section):
                _validated, err, code = ad.validate_download_request_body({
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "section": section,
                })
                self.assertEqual(code, "invalid-download-section")
                self.assertTrue(err)

    def test_download_request_body_rejects_invalid_playlist_items(self):
        for playlist_items in ([], "1-3", [0], [1, "--exec"], list(range(1, 202))):
            with self.subTest(playlist_items=playlist_items):
                _validated, err, code = ad.validate_download_request_body({
                    "url": "https://www.youtube.com/playlist?list=PLfixture",
                    "playlistItems": playlist_items,
                })
                self.assertEqual(code, "invalid-playlist-items")
                self.assertTrue(err)

    def test_download_request_body_rejects_client_supplied_ytdlp_flags(self):
        hostile_args = ["--netrc-cmd", "calc.exe", *ad.YTDLP_FORBIDDEN_LINK_FLAGS]
        for field in ad.DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS:
            with self.subTest(field=field):
                _validated, err, code = ad.validate_download_request_body({
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    field: hostile_args,
                })
                self.assertEqual(code, "unsupported-ytdlp-flags")
                self.assertIn("Client-supplied yt-dlp flags are not allowed", err)

    def test_download_request_body_rejects_unknown_fields(self):
        _validated, err, code = ad.validate_download_request_body({
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "writeInfoJson": True,
        })
        self.assertEqual(code, "unsupported-download-fields")
        self.assertIn("writeInfoJson", err)

    def test_download_endpoint_rejects_ytdlp_args_before_queueing(self):
        token = "h" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().post(
            "/download",
            json={
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "ytDlpArgs": ["--netrc-cmd", "calc.exe"],
            },
            headers={"X-Auth-Token": token},
        )

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["code"], "unsupported-ytdlp-flags")
        self.assertEqual(manager.downloads, {})

    def test_download_endpoint_rejects_non_youtube_url_before_queueing(self):
        # SSRF hardening: the server must enforce the YouTube-only allowlist at
        # the trust boundary, not rely on the extension. A token-holder pointing
        # at an internal/LAN/metadata host must be rejected before yt-dlp (and
        # the cookie jar) is ever invoked.
        token = "n" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()
        for hostile in (
            "http://169.254.169.254/latest/meta-data/",
            "http://192.168.1.1/admin",
            "http://127.0.0.1:9999/",
            "https://example.com/watch?v=abc",
        ):
            resp = client.post(
                "/download",
                json={"url": hostile, "cookies": [{"name": "SID", "value": "secret"}]},
                headers={"X-Auth-Token": token},
            )
            self.assertEqual(resp.status_code, 400, hostile)
            self.assertEqual(resp.get_json()["code"], "non-youtube-url", hostile)
        self.assertEqual(manager.downloads, {})

    def test_download_endpoint_accepts_youtube_hosts(self):
        # The allowlist must still pass canonical YouTube hosts through to the
        # queue (guards against an over-tight regex regression).
        token = "y" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()
        with mock.patch.object(manager, 'start_download', return_value=('dl_test', None)) as start:
            for ok_url in (
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "https://youtu.be/dQw4w9WgXcQ",
                "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            ):
                resp = client.post(
                    "/download",
                    json={"url": ok_url},
                    headers={"X-Auth-Token": token},
                )
                # Must get PAST the YouTube allowlist without launching a real
                # yt-dlp worker from the unit suite.
                body = resp.get_json() or {}
                self.assertNotEqual(body.get("code"), "non-youtube-url", ok_url)
                self.assertEqual(resp.status_code, 200, ok_url)

        self.assertEqual(start.call_count, 3)

    def test_download_endpoint_queue_full_response_includes_capacity_and_remediation(self):
        token = 'q' * 32
        config = FakeConfig({'ServerToken': token})
        manager = ad.DownloadManager(config, FakeHistory())
        manager.intake_paused = True
        for index in range(ad.MAX_QUEUED_TOTAL):
            dl = ad.Download(
                f'pending-{index}',
                f'https://www.youtube.com/watch?v={index:011d}',
                output_dir=config.get('DownloadPath'),
                queue_order=index + 1,
            )
            manager.downloads[dl.id] = dl
        api = ad.create_api(config, manager, FakeHistory())
        with mock.patch.object(ad, 'probe_javascript_runtime', return_value={
            'ytdlpNeedsRuntime': False,
            'supported': True,
            'ejsReady': True,
        }):
            resp = api.test_client().post(
                '/download',
                json={'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},
                headers={'X-Auth-Token': token},
            )

        self.assertEqual(resp.status_code, 429)
        payload = resp.get_json()
        self.assertEqual(payload['code'], 'queue-full')
        self.assertEqual(payload['capacity']['total'], ad.MAX_QUEUED_TOTAL)
        self.assertEqual(payload['capacity']['available'], 0)
        self.assertIn('Cancel a pending item', payload['remediation'])

        failed = ad.Download(
            'failed-retry',
            'https://www.youtube.com/watch?v=failedRetry',
            output_dir=config.get('DownloadPath'),
        )
        failed.status = 'failed'
        failed.error_code = 'network-unreachable'
        failed.mark_terminal()
        manager.downloads[failed.id] = failed
        retry_resp = api.test_client().post(
            f'/queue/{failed.id}/retry',
            headers={'X-Auth-Token': token},
        )
        retry_payload = retry_resp.get_json()
        self.assertEqual(retry_resp.status_code, 429)
        self.assertEqual(retry_payload['code'], 'queue-full')
        self.assertEqual(retry_payload['capacity']['available'], 0)
        self.assertIn('Cancel a pending item', retry_payload['remediation'])

    def test_queue_api_controls_pause_reorder_and_fresh_auth_resume(self):
        token = 'r' * 32
        config = FakeConfig({'ServerToken': token})
        manager = ad.DownloadManager(config, FakeHistory())
        manager.pause_intake()
        first, _ = manager.start_download('https://www.youtube.com/watch?v=firstQueue1')
        second, _ = manager.start_download('https://www.youtube.com/watch?v=secondQueue')
        auth = ad.Download(
            'auth-recovery',
            'https://www.youtube.com/watch?v=authRecover',
            output_dir=config.get('DownloadPath'),
            requires_auth=True,
            queue_order=3,
        )
        auth.status = 'needs-auth'
        manager.downloads[auth.id] = auth
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()
        headers = {'X-Auth-Token': token}

        moved = client.post(f'/queue/{second}/move', json={'position': 0}, headers=headers)
        self.assertEqual(moved.status_code, 200)
        self.assertEqual(moved.get_json()['queue']['downloads'][0]['id'], second)

        missing = client.post(f'/queue/{auth.id}/resume', json={}, headers=headers)
        self.assertEqual(missing.status_code, 409)
        self.assertEqual(missing.get_json()['code'], 'fresh-auth-required')

        resumed = client.post(
            f'/queue/{auth.id}/resume',
            json={'cookies': [{
                'domain': '.youtube.com', 'name': 'SID', 'value': 'fresh-secret',
                'path': '/', 'secure': True,
            }]},
            headers=headers,
        )
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(manager.downloads[auth.id].status, 'pending')
        queue_payload = client.get('/queue', headers=headers).get_json()
        self.assertTrue(queue_payload['capacity']['intakePaused'])
        self.assertNotIn('fresh-secret', json.dumps(queue_payload))
        self.assertIn(first, {item['id'] for item in queue_payload['downloads']})

    def test_history_limit_is_clamped(self):
        token = "d" * 32
        history = FakeHistory()
        history.entries = [{"id": str(i), "url": "https://example.com", "title": str(i)} for i in range(3)]
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, history)
        api = ad.create_api(config, manager, history)

        resp = api.test_client().get("/history?limit=-5", headers={"X-Auth-Token": token})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["count"], 1)
        self.assertEqual(resp.get_json()["filteredTotal"], 3)
        self.assertEqual(resp.get_json()["total"], 3)

    def test_history_query_filters_sorts_and_pages_retained_rows(self):
        entries = ad.sanitize_history_entries([
            {
                "id": "1", "title": "Alpha lecture", "filename": "alpha.mp4",
                "format": "mp4", "quality": "1080", "date": "2026-07-27",
            },
            {
                "id": "2", "title": "Beta lecture", "filename": "beta.m4a",
                "format": "m4a", "quality": "best", "date": "2026-07-28",
            },
            {
                "id": "3", "title": "Beta follow-up", "filename": "follow-up.mp4",
                "format": "mp4", "quality": "720", "date": "2026-07-29",
            },
        ])

        result = ad.query_history_entries(
            entries,
            query="beta",
            status="complete",
            fmt="mp4",
            date_from="2026-07-28",
            date_to="2026-07-30",
            sort="oldest",
            offset=0,
            limit=1,
        )

        self.assertEqual([item["id"] for item in result["history"]], ["3"])
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["filteredTotal"], 1)
        self.assertFalse(result["hasMore"])
        self.assertEqual(entries[0]["status"], "complete")

    def test_history_route_exposes_filtered_page_metadata(self):
        token = "d" * 32
        history = FakeHistory()
        history.entries = [
            {
                "id": str(index),
                "title": f"Lecture {index}",
                "filename": f"lecture-{index}.mp4",
                "format": "mp4" if index % 2 else "m4a",
                "date": f"2026-07-{20 + index:02d}",
            }
            for index in range(1, 6)
        ]
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, history)
        client = ad.create_api(config, manager, history).test_client()

        response = client.get(
            "/history?q=lecture&format=mp4&sort=oldest&offset=1&limit=1"
            "&dateFrom=2026-07-20&dateTo=2026-07-29",
            headers={"X-Auth-Token": token},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual([item["id"] for item in body["history"]], ["3"])
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["total"], 5)
        self.assertEqual(body["filteredTotal"], 3)
        self.assertTrue(body["hasMore"])
        self.assertEqual(body["sort"], "oldest")

    def test_history_rejects_malformed_limit(self):
        token = "d" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())

        resp = api.test_client().get(
            "/history?limit=many",
            headers={"X-Auth-Token": token},
        )

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["code"], "invalid-limit")

        bad_date = api.test_client().get(
            "/history?dateFrom=07-29-2026",
            headers={"X-Auth-Token": token},
        )
        self.assertEqual(bad_date.status_code, 400)
        self.assertEqual(bad_date.get_json()["code"], "invalid-date")

    def test_cancel_finished_download_returns_conflict_not_not_found(self):
        token = "b" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        dl = ad.Download("done", "https://example.com/done")
        dl.status = "complete"
        manager.downloads[dl.id] = dl
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().delete(f"/cancel/{dl.id}", headers={"X-Auth-Token": token})

        self.assertEqual(resp.status_code, 409)
        self.assertIn("already finished", resp.get_json()["error"])

    def test_dns_rebinding_attack_is_rejected_before_handler(self):
        """Verify Host-header validation blocks DNS rebinding to attacker-controlled domains."""
        token = "e" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        # Simulate a DNS-rebinding attack: the browser resolved attacker.com
        # to 127.0.0.1 after the page loaded, but it still sends the attacker
        # hostname in the Host header. Legitimate local clients always send
        # 127.0.0.1 / localhost / ::1.
        for bad_host in ("attacker.com", "attacker.com:9751", "example.org:80"):
            with self.subTest(host=bad_host):
                resp = client.get(
                    "/health",
                    headers={"Host": bad_host, "X-MDL-Client": "MediaDL"},
                )
                self.assertEqual(resp.status_code, 421, f"Expected 421 Misdirected Request for Host={bad_host}")
                self.assertIn("Invalid Host", resp.get_json().get("error", ""))

        for good_host in ("127.0.0.1:9751", "localhost:9751", "[::1]:9751"):
            with self.subTest(host=good_host):
                resp = client.get(
                    "/health",
                    headers={"Host": good_host, "X-MDL-Client": "MediaDL"},
                )
                self.assertEqual(resp.status_code, 200, f"Expected 200 for Host={good_host}")

    def test_missing_source_dependency_message_requires_explicit_virtualenv_setup(self):
        error = ModuleNotFoundError("missing PyQt6", name="PyQt6")
        message = ad.source_dependency_error(error)
        self.assertIn("will not install packages during import", message)
        self.assertIn("py -3.12 -m venv .venv", message)
        self.assertIn("--require-virtualenv -r", message)
        self.assertIn(str(ad.REQUIREMENTS_PATH), message)

    def test_source_import_has_no_package_install_path(self):
        source = Path(ad.__file__).read_text(encoding="utf-8")
        self.assertNotIn("def _bootstrap", source)
        self.assertNotIn("--break-system-packages", source)
        self.assertNotIn("subprocess.check_call", source)
        self.assertIn("raise ImportError(source_dependency_error(exc))", source)

    def test_boundary_module_imports_do_not_load_gui_server_or_legacy_root(self):
        script = r'''
import importlib
import sys

for name in (
    "astra_downloader.config",
    "astra_downloader.download",
    "astra_downloader.health",
):
    module = importlib.import_module(name)
    assert module.__all__, f"{name} must expose its compatibility contract"

config = importlib.import_module("astra_downloader.config")
download = importlib.import_module("astra_downloader.download")
health = importlib.import_module("astra_downloader.health")
assert config.normalize_url("https://example.com/video") == (
    "https://example.com/video", None
)
assert config.validate_download_request_body({"url": "https://example.com"})[1] is None
assert config.sanitize_config({"ServerPort": 999999})["ServerPort"] == 65535
assert config.DEFAULT_CONFIG["JavaScriptRuntime"] == "auto"
model = download.Download("owned", "https://example.com", clock=lambda: 123.0)
assert model.start_time == 123.0
model.status = "complete"
model.mark_terminal()
assert model.finished_time == 123.0
assert download.classify_download_failure("connection timed out") == "network-unreachable"
assert health.is_youtube_url("https://youtu.be/abcdefghijk")
assert health.parse_ffmpeg_major("8.1.1") == 8
assert health.ytdlp_needs_external_runtime("2026.04.01")
runtime = health.evaluate_javascript_runtime(
    "deno",
    "/tools/deno",
    "test",
    runner=lambda args, timeout: "deno 2.3.0" if "--version" in args else "READY",
    marker="READY",
)
assert runtime["supported"] and runtime["ejsReady"]
assert download.build_subprocess_env(
    "/missing/deno", environ={"PATH": "safe", "SECRET": "drop"}
) == {"PATH": "safe"}

for forbidden in (
    "astra_downloader.astra_downloader",
    "PyQt6",
    "PyQt6.QtCore",
    "PyQt6.QtGui",
    "PyQt6.QtWidgets",
    "flask",
):
    assert forbidden not in sys.modules, f"boundary import loaded {forbidden}"
'''
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=Path(ad.__file__).resolve().parent.parent,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_boundary_modules_preserve_legacy_symbol_identity_on_access(self):
        import config
        import download
        import gui
        import health
        import routes

        self.assertIs(config.Config, ad.Config)
        self.assertIs(config.DEFAULT_CONFIG, ad.DEFAULT_CONFIG)
        self.assertIs(config.sanitize_config, ad.sanitize_config)
        self.assertIs(config.clean_text, ad.clean_text)
        self.assertIs(config.clamp_int, ad.clamp_int)
        self.assertIs(config.validate_download_request_body, ad.validate_download_request_body)
        self.assertIs(config.allowed_output_roots, ad.allowed_output_roots)
        self.assertIs(config.normalize_output_dir, ad.normalize_output_dir)
        self.assertIs(config.atomic_write_json, ad.atomic_write_json)
        self.assertIs(config.load_json_file, ad.load_json_file)
        self.assertIs(config.sanitize_history_entries, ad.sanitize_history_entries)
        self.assertIs(download.DownloadManager, download.DownloadManagerCore)
        self.assertTrue(issubclass(ad.DownloadManager, download.DownloadManagerCore))
        self.assertIs(download.Download, ad.Download)
        self.assertIs(download.DownloadQueueStore, ad.DownloadQueueStore)
        self.assertIs(download.build_video_format_args, ad.build_video_format_args)
        self.assertIs(download.classify_download_failure, ad.classify_download_failure)
        self.assertIs(download.DOWNLOAD_ACTIVE_STATES, ad.DOWNLOAD_ACTIVE_STATES)
        self.assertIs(health.get_ytdlp_version, ad.get_ytdlp_version)
        self.assertIs(health.is_youtube_url, ad.is_youtube_url)
        self.assertIs(health.parse_ffmpeg_major, ad.parse_ffmpeg_major)
        self.assertIs(health.build_youtube_extractor_args, ad.build_youtube_extractor_args)
        self.assertIs(health.build_javascript_runtime_args, ad.build_javascript_runtime_args)
        self.assertEqual(routes.create_api.__module__, routes.__name__)
        self.assertIsNot(routes.create_api, ad.create_api)
        self.assertIs(gui.MainWindow, gui.MainWindowCore)
        self.assertTrue(issubclass(ad.MainWindow, gui.MainWindowCore))
        self.assertIs(gui.make_label, ad.make_label)
        self.assertIs(gui.make_empty_state, ad.make_empty_state)
        self.assertIs(gui.human_status, ad.human_status)
        self.assertTrue(issubclass(ad.ReadinessProbe, gui.ReadinessProbe))
        self.assertTrue(issubclass(ad.FolderPickerService, gui.FolderPickerService))
        self.assertIs(gui.SetupWorker, gui.SetupWorkerCore)
        self.assertTrue(issubclass(ad.SetupWorker, gui.SetupWorkerCore))

    def test_pending_queue_states_share_the_warning_tone(self):
        # Every not-yet-running queue state must read as the same amber tone in
        # the Downloads list; 'pending' previously fell through to neutral and
        # showed a grey dot beside its amber 'paused'/'needs-auth' siblings.
        for status in sorted(ad.DOWNLOAD_PENDING_STATES):
            self.assertEqual(
                ad.download_status_tone(status), "warning",
                f"pending-set status {status!r} must use the warning tone",
            )
        self.assertEqual(ad.download_status_tone("queued"), "warning")
        self.assertEqual(ad.download_status_tone("complete"), "success")
        self.assertEqual(ad.download_status_tone("failed"), "danger")

    def test_gui_boundary_imports_pyqt_without_creating_application(self):
        script = r'''
import importlib
import sys

gui = importlib.import_module("astra_downloader.gui")
from PyQt6.QtWidgets import QApplication
assert QApplication.instance() is None
assert gui.human_status("needs-auth") == "Needs sign-in"
assert gui.format_duration(3660) == "1h 1m"
assert "astra_downloader.astra_downloader" not in sys.modules
'''
        env = os.environ.copy()
        env["QT_QPA_PLATFORM"] = "offscreen"
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=Path(ad.__file__).resolve().parent.parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_routes_boundary_owns_handlers_without_loading_legacy_root(self):
        script = r'''
import importlib
import sys

routes = importlib.import_module("astra_downloader.routes")
assert routes.create_api.__module__ == "astra_downloader.routes"
assert "astra_downloader.astra_downloader" not in sys.modules
try:
    routes.create_api(None, None, None, dependencies={})
except ValueError as error:
    assert "Missing API dependencies" in str(error)
else:
    raise AssertionError("missing route dependencies were accepted")
'''
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=Path(ad.__file__).resolve().parent.parent,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_health_version_probe_uses_injected_cache_dependencies(self):
        import health

        with tempfile.TemporaryDirectory() as tmp:
            executable = Path(tmp) / "tool.exe"
            executable.touch()
            calls = []
            current_time = [100.0]

            def run(args):
                calls.append(args)
                return "tool 1.2.3"

            probe = health.ExecutableVersionProbe(
                path=executable,
                args=("--version",),
                parser=lambda output: output.rsplit(" ", 1)[-1],
                runner=run,
                clock=lambda: current_time[0],
                ttl_seconds=60,
            )
            self.assertEqual(probe.get(), "1.2.3")
            current_time[0] += 30
            self.assertEqual(probe.get(), "1.2.3")
            self.assertEqual(len(calls), 1)
            self.assertEqual(probe.get(force=True), "1.2.3")
            self.assertEqual(len(calls), 2)

    def test_po_token_probe_caches_injected_http_result_and_resets(self):
        import health

        calls = []

        class Response:
            ok = True

            @staticmethod
            def json():
                return {"version": "1.2.0"}

        probe = health.PoTokenProviderProbe(
            http_get=lambda url, **kwargs: calls.append((url, kwargs)) or Response(),
            clock=lambda: 0.0,
            port=4416,
            min_version="1.3.0",
            ttl_seconds=30,
        )
        first = probe.probe()
        self.assertTrue(first["stale"])
        self.assertEqual(probe.probe(), first)
        self.assertEqual(len(calls), 1)
        probe.reset()
        self.assertEqual(probe.probe(), first)
        self.assertEqual(len(calls), 2)

    def test_ffmpeg_capability_probe_uses_injected_floor_and_cache(self):
        import health

        versions = iter(["6.1.1", "8.1.1"])
        probe = health.FfmpegCapabilitiesProbe(
            version_getter=lambda: next(versions),
            clock=lambda: 100.0,
            minimum_major=7,
            ttl_seconds=60,
        )
        first = probe.check()
        self.assertFalse(first["current"])
        first["current"] = True
        self.assertFalse(probe.check()["current"], "cached payload must be defensive")
        self.assertTrue(probe.check(force=True)["current"])

    def test_ffmpeg_capability_probe_enforces_exact_semver_floor(self):
        import health

        def probe_for(version):
            return health.FfmpegCapabilitiesProbe(
                version_getter=lambda: version,
                clock=lambda: 100.0,
                minimum_major=8,
                minimum_version="8.1.2",
                ttl_seconds=60,
            ).check()

        # Below the exact floor (RV60 OOB / MagicYUV RCE range) is flagged even
        # though the major (8) alone would pass a major-only check.
        below = probe_for("8.0.1-full_build-www.gyan.dev")
        self.assertFalse(below["current"])
        self.assertIn("8.1.2", below["message"])
        # An older major is likewise flagged.
        self.assertFalse(probe_for("7.1.1")["current"])
        # At or above the floor passes, build suffix ignored.
        self.assertTrue(probe_for("8.1.2-full_build")["current"])
        self.assertTrue(probe_for("9.0")["current"])
        # BtbN n-prefixed tagged builds compare like their bare version —
        # n8.0.1 must be flagged, n8.1.2 must pass (previously the n prefix
        # silently routed them to the never-flagged snapshot path).
        self.assertFalse(probe_for("n8.0.1-9-g1234567")["current"])
        self.assertTrue(probe_for("n8.1.2")["current"])
        # Master/snapshot builds carry no numeric version and must not be
        # flagged as below-floor — they are always newer than any tagged floor.
        snapshot = probe_for("N-119847-g1a2b3c4d-win64-gpl")
        self.assertIsNone(snapshot["current"])
        self.assertIsNone(snapshot["majorVersion"])

    def test_ffmpeg_probe_is_configured_with_the_security_floor(self):
        self.assertEqual(ad._FFMPEG_MIN_VERSION, "8.1.2")
        self.assertGreaterEqual(ad._FFMPEG_MIN_MAJOR, 8)

    def test_routes_module_owns_injected_wsgi_backend_selection_and_teardown(self):
        import routes

        calls = []

        class FakeServer:
            def run(self):
                calls.append("run")

            def close(self):
                calls.append("close")

        def make_waitress(api, **kwargs):
            calls.append((api, kwargs))
            return FakeServer()

        adapter = routes._build_wsgi_server(9751, "api", waitress_factory=make_waitress)
        self.assertIs(routes._ServerAdapter, ad._ServerAdapter)
        self.assertIs(routes._build_wsgi_server, ad._build_wsgi_server)
        self.assertEqual(adapter.backend, "waitress")
        self.assertEqual(calls[0][1], {
            "host": "127.0.0.1",
            "port": 9751,
            "threads": 8,
            "ident": "Astra Downloader",
        })
        adapter.run()
        adapter.stop()
        self.assertEqual(calls[-2:], ["run", "close"])

    def test_routes_module_normalizes_werkzeug_bind_abort_without_opening_socket(self):
        import routes

        def abort_bind(*_args, **_kwargs):
            raise SystemExit(1)

        with self.assertRaisesRegex(OSError, "Werkzeug aborted while binding port 9761"):
            routes._build_wsgi_server(
                9761,
                "api",
                waitress_factory=False,
                werkzeug_factory=abort_bind,
            )

    def test_importing_companion_modules_never_spawns_a_process(self):
        script = r'''
import importlib
import subprocess

def forbidden(*args, **kwargs):
    raise AssertionError(f"process launch during import: {args!r}")

subprocess.Popen = forbidden
subprocess.call = forbidden
subprocess.check_call = forbidden
subprocess.check_output = forbidden
subprocess.run = forbidden

for name in (
    "astra_downloader.astra_downloader",
    "astra_downloader.config",
    "astra_downloader.download",
    "astra_downloader.gui",
    "astra_downloader.health",
    "astra_downloader.routes",
):
    importlib.import_module(name)
'''
        env = os.environ.copy()
        env["QT_QPA_PLATFORM"] = "offscreen"
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=Path(ad.__file__).resolve().parent.parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


class CookieJarTests(unittest.TestCase):
    """Audit-pass coverage for write_cookies_netscape.

    The extension pushes Chrome cookie objects into the server's /download
    request and yt-dlp needs them in Netscape cookies.txt format. Regressing
    the converter would silently break logged-in/age-gated downloads, so each
    behaviour below is locked down by a dedicated test.
    """

    def _read(self, path):
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()

    def test_returns_none_for_empty_or_invalid_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            self.assertIsNone(ad.write_cookies_netscape(None, target))
            self.assertIsNone(ad.write_cookies_netscape([], target))
            self.assertIsNone(ad.write_cookies_netscape("not a list", target))
            # All entries invalid (missing name/domain) → no jar written.
            self.assertIsNone(ad.write_cookies_netscape(
                [{"name": ""}, {"domain": ".youtube.com"}],
                target,
            ))
            self.assertFalse(target.exists())

    def test_writes_netscape_format_with_httponly_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            cookies = [
                {
                    "domain": ".youtube.com", "name": "SID", "value": "abc",
                    "path": "/", "secure": True, "httpOnly": True,
                    "expirationDate": 1700000000,
                },
                {
                    "domain": "youtube.com", "name": "PREF", "value": "tz=UTC",
                    "path": "/", "secure": False, "httpOnly": False,
                    # Session cookie (no expirationDate) — must serialize as 0
                    "expirationDate": None,
                },
            ]
            result = ad.write_cookies_netscape(cookies, target)
            self.assertEqual(result, str(target))
            body = self._read(target)
            self.assertIn("# Netscape HTTP Cookie File", body)
            # httpOnly cookie gets the #HttpOnly_ prefix yt-dlp expects.
            self.assertIn("#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1700000000\tSID\tabc", body)
            self.assertIn("youtube.com\tFALSE\t/\tFALSE\t0\tPREF\ttz=UTC", body)

    def test_non_finite_expiry_degrades_to_session_cookie(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            result = ad.write_cookies_netscape([{
                "domain": ".youtube.com",
                "name": "SID",
                "value": "secret",
                "expirationDate": float("inf"),
            }], target)

            self.assertEqual(result, str(target))
            self.assertIn("\t0\tSID\tsecret", self._read(target))

    def test_strips_control_chars_that_would_corrupt_tsv(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            cookies = [
                # Tabs/newlines in a value would shift columns in the TSV and
                # make yt-dlp fail to parse the jar. Control-char stripping
                # produces a well-formed single-line value.
                {"domain": ".youtube.com", "name": "X", "value": "a\tb\nc"},
                {"domain": ".youtube.com", "name": "Y", "value": "ok"},
            ]
            self.assertEqual(ad.write_cookies_netscape(cookies, target), str(target))
            body = self._read(target)
            # The line for X must end with a clean value containing no raw
            # tabs or newlines beyond the column separator.
            x_line = [line for line in body.splitlines() if "\tX\t" in line][0]
            self.assertTrue(x_line.endswith("abc"))
            self.assertEqual(x_line.count("\t"), 6)  # 7 columns → 6 separators
            self.assertIn("Y\tok", body)

    def test_rejects_malformed_expiration_without_failing_whole_jar(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            cookies = [
                {"domain": ".youtube.com", "name": "A", "value": "a", "expirationDate": "bogus"},
                {"domain": ".youtube.com", "name": "B", "value": "b", "expirationDate": -42},
                {"domain": ".youtube.com", "name": "C", "value": "c", "expirationDate": 100},
            ]
            self.assertEqual(ad.write_cookies_netscape(cookies, target), str(target))
            body = self._read(target)
            self.assertIn("\tA\ta", body)  # bogus → 0
            self.assertIn("\t0\tA\ta", body)
            self.assertIn("\t0\tB\tb", body)  # negative → 0
            self.assertIn("\t100\tC\tc", body)


class PathConfinementTests(unittest.TestCase):
    """v1.2.0 S1 — outputDir allowlist.

    The server accepts a client-supplied `outputDir` on /download. Before
    v1.2.0 it only checked that the path was absolute — a compromised
    extension could write anywhere the server user had access to. These
    tests lock down the rejection path and the permissive subfolder path.
    """

    def test_confinement_accepts_subfolder_of_allowed_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "downloads"
            root.mkdir()
            subfolder = root / "channel-a" / "2026"
            out, err = ad.normalize_output_dir(
                str(subfolder),
                default_dir=str(root),
                allowed_roots=[root.resolve()],
            )
            self.assertIsNone(err)
            self.assertTrue(Path(out).resolve() == subfolder.resolve())
            self.assertTrue(subfolder.exists())

    def test_confinement_rejects_path_outside_allowed_roots(self):
        with tempfile.TemporaryDirectory() as allowed_tmp, tempfile.TemporaryDirectory() as forbidden_tmp:
            allowed_root = Path(allowed_tmp).resolve()
            forbidden = Path(forbidden_tmp) / "escape" / "target"
            out, err = ad.normalize_output_dir(
                str(forbidden),
                default_dir=str(allowed_root),
                allowed_roots=[allowed_root],
            )
            self.assertIsNone(out)
            self.assertEqual(err, "Output folder is outside the configured download locations.")
            # Critical: confinement must reject BEFORE mkdir; a rejected
            # request should not create the forbidden directory.
            self.assertFalse(forbidden.exists())

    def test_confinement_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            allowed_root = Path(tmp) / "downloads"
            allowed_root.mkdir()
            # .. traversal: resolve() normalizes before the check.
            traversal = str(allowed_root / ".." / ".." / "somewhere")
            out, err = ad.normalize_output_dir(
                traversal,
                default_dir=str(allowed_root),
                allowed_roots=[allowed_root.resolve()],
            )
            self.assertIsNone(out)
            self.assertEqual(err, "Output folder is outside the configured download locations.")

    def test_allowed_output_roots_dedupes_and_resolves(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "videos"
            audio = Path(tmp) / "audio"
            video.mkdir()
            audio.mkdir()

            class _Cfg:
                def get(self, key, default=None):
                    return {
                        "DownloadPath": str(video),
                        # Same dir under DownloadPath and ExtraOutputRoots
                        # must collapse in the final list.
                        "AudioDownloadPath": str(video),
                        "ExtraOutputRoots": [str(audio), str(audio)],
                    }.get(key, default)

            roots = ad.allowed_output_roots(_Cfg())
            resolved_video = video.resolve()
            resolved_audio = audio.resolve()
            self.assertIn(resolved_video, roots)
            self.assertIn(resolved_audio, roots)
            self.assertEqual(len(roots), 2)


class RateLimiterTests(unittest.TestCase):
    """v1.2.0 S2 — sliding-window rate limit on /download."""

    def test_allows_up_to_max_events_then_rejects(self):
        limiter = ad.RateLimiter(max_events=3, window_seconds=60)
        for _ in range(3):
            allowed, retry = limiter.allow('download')
            self.assertTrue(allowed)
            self.assertEqual(retry, 0.0)
        allowed, retry = limiter.allow('download')
        self.assertFalse(allowed)
        self.assertGreater(retry, 0.0)

    def test_separate_bucket_keys_are_independent(self):
        limiter = ad.RateLimiter(max_events=1, window_seconds=60)
        self.assertTrue(limiter.allow('a')[0])
        # Second call to 'a' rejected, but 'b' gets its own budget.
        self.assertFalse(limiter.allow('a')[0])
        self.assertTrue(limiter.allow('b')[0])

    def test_routes_owns_rate_limiter_and_clock_is_injectable(self):
        import routes

        now = [100.0]
        limiter = routes.RateLimiter(1, 10, clock=lambda: now[0])
        self.assertIs(routes.RateLimiter, ad.RateLimiter)
        self.assertTrue(limiter.allow('download')[0])
        self.assertFalse(limiter.allow('download')[0])
        now[0] = 111.0
        self.assertTrue(limiter.allow('download')[0])


class Sha256VerifyTests(unittest.TestCase):
    """v1.2.0 S3 — binary integrity verification for yt-dlp/ffmpeg."""

    def test_verify_accepts_matching_hash(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bin.exe"
            path.write_bytes(b"hello world")
            expected = hashlib.sha256(b"hello world").hexdigest()
            self.assertTrue(ad.verify_file_sha256(path, expected))

    def test_verify_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bin.exe"
            path.write_bytes(b"tampered bytes")
            wrong = "0" * 64
            with self.assertRaises(RuntimeError) as ctx:
                ad.verify_file_sha256(path, wrong)
            self.assertIn("SHA-256 mismatch", str(ctx.exception))

    def test_verify_returns_false_on_missing_or_malformed_sidecar(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bin.exe"
            path.write_bytes(b"hi")
            self.assertFalse(ad.verify_file_sha256(path, None))
            self.assertFalse(ad.verify_file_sha256(path, ""))
            self.assertFalse(ad.verify_file_sha256(path, "not-a-hash"))

    def test_parse_sha256_sums_with_multiple_assets(self):
        doc = (
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  yt-dlp.exe\n"
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  yt-dlp\n"
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  yt-dlp_macos\n"
        )
        self.assertEqual(
            ad._parse_sha256_sums(doc, target_asset="yt-dlp.exe"),
            "a" * 64,
        )

    def test_parse_sha256_sums_accepts_single_line_sidecar(self):
        digest = "d" * 64
        self.assertEqual(ad._parse_sha256_sums(f"{digest}\n"), digest)

    def test_ffmpeg_checksum_manifest_selects_the_named_archive(self):
        digest = "f" * 64
        manifest = (
            f"{'e' * 64}  ffmpeg-master-latest-win64-gpl-shared.zip\n"
            f"{digest}  ffmpeg-master-latest-win64-gpl.zip\n"
        )
        self.assertEqual(
            ad._parse_sha256_sums(manifest, target_asset=ad.FFMPEG_SHA256_ASSET),
            digest,
        )
        self.assertEqual(ad.FFMPEG_SHA256_ASSET, "ffmpeg-master-latest-win64-gpl.zip")
        self.assertTrue(ad.FFMPEG_SHA256_URL.endswith("/checksums.sha256"))

    class _SidecarResponse:
        def __init__(self, chunks, *, status_code=200, headers=None):
            self._chunks = list(chunks)
            self.status_code = status_code
            self.headers = headers or {}

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def iter_content(self, _chunk_size):
            return iter(self._chunks)

    def test_checksum_sidecar_fetch_is_streamed_and_bounded(self):
        digest = b"e" * 64
        valid = self._SidecarResponse([digest[:20], digest[20:] + b"  yt-dlp.exe\n"])
        with mock.patch.object(ad.http_requests, 'get', return_value=valid) as get:
            result = ad.fetch_expected_sha256(
                "https://example.invalid/SHA2-256SUMS", target_asset="yt-dlp.exe",
            )
        self.assertEqual(result, "e" * 64)
        self.assertTrue(get.call_args.kwargs['stream'])

        oversized = self._SidecarResponse(
            [b"x" * (ad.CHECKSUM_SIDECAR_MAX_BYTES + 1)],
        )
        with mock.patch.object(ad.http_requests, 'get', return_value=oversized):
            self.assertIsNone(ad.fetch_expected_sha256("https://example.invalid/sums"))

    def test_checksum_sidecar_rejects_oversized_content_length_before_reading(self):
        response = self._SidecarResponse(
            [b"f" * 64],
            headers={'content-length': str(ad.CHECKSUM_SIDECAR_MAX_BYTES + 1)},
        )
        with mock.patch.object(ad.http_requests, 'get', return_value=response):
            self.assertIsNone(ad.fetch_expected_sha256("https://example.invalid/sums"))


class SetupChecksumTests(unittest.TestCase):
    def test_setup_worker_preserves_auto_update_preference(self):
        self.assertFalse(ad.SetupWorker(auto_update_ytdlp=False).auto_update_ytdlp)
        self.assertTrue(ad.SetupWorker(auto_update_ytdlp=True).auto_update_ytdlp)

    def test_forced_ffmpeg_refresh_preserves_existing_binary_on_download_failure(self):
        original_install_dir = ad.INSTALL_DIR
        original_ytdlp_path = ad.YTDLP_PATH
        original_ffmpeg_path = ad.FFMPEG_PATH
        original_download_path = ad.DEFAULT_CONFIG["DownloadPath"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ad.INSTALL_DIR = root
            ad.YTDLP_PATH = root / "yt-dlp.exe"
            ad.FFMPEG_PATH = root / "ffmpeg.exe"
            ad.DEFAULT_CONFIG["DownloadPath"] = str(root / "downloads")
            ad.YTDLP_PATH.write_bytes(b"existing yt-dlp")
            ad.FFMPEG_PATH.write_bytes(b"known working ffmpeg")
            worker = ad.SetupWorker(force_ffmpeg=True)
            try:
                with mock.patch.object(ad.http_requests, 'get', side_effect=RuntimeError('offline')), \
                        mock.patch.object(ad, 'log_crash'):
                    worker.run()
                self.assertEqual(ad.FFMPEG_PATH.read_bytes(), b"known working ffmpeg")
            finally:
                ad.INSTALL_DIR = original_install_dir
                ad.YTDLP_PATH = original_ytdlp_path
                ad.FFMPEG_PATH = original_ffmpeg_path
                ad.DEFAULT_CONFIG["DownloadPath"] = original_download_path

    def test_setup_worker_rejects_missing_helper_checksum_sidecar(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "yt-dlp.exe"
            path.write_bytes(b"helper")
            worker = ad.SetupWorker()
            with mock.patch.object(ad, 'fetch_expected_sha256', return_value=None), \
                    mock.patch.object(ad, 'write_persistent_log') as log:
                with self.assertRaises(RuntimeError) as ctx:
                    worker._verify_required_checksum(
                        path, "https://example.invalid/SHA2-256SUMS",
                        asset_name="yt-dlp.exe", label="yt-dlp",
                    )
            self.assertIn("sidecar", str(ctx.exception))
            self.assertFalse(path.exists())
            log.assert_called()

    def test_setup_worker_accepts_matching_helper_checksum(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "yt-dlp.exe"
            payload = b"helper"
            path.write_bytes(payload)
            expected = hashlib.sha256(payload).hexdigest()
            worker = ad.SetupWorker()
            with mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected):
                self.assertTrue(worker._verify_required_checksum(
                    path, "https://example.invalid/SHA2-256SUMS",
                    asset_name="yt-dlp.exe", label="yt-dlp",
                ))
            self.assertTrue(path.exists())

    def test_setup_worker_deletes_helper_on_checksum_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ffmpeg.zip"
            path.write_bytes(b"wrong")
            worker = ad.SetupWorker()
            with mock.patch.object(ad, 'fetch_expected_sha256', return_value="0" * 64):
                with self.assertRaises(RuntimeError):
                    worker._verify_required_checksum(
                        path, "https://example.invalid/ffmpeg.zip.sha256",
                        label="ffmpeg",
                    )
            self.assertFalse(path.exists())

    def test_setup_worker_passes_ffmpeg_asset_name_to_checksum_manifest(self):
        source = Path(ad.__file__).with_name('gui.py').read_text(encoding='utf-8')
        self.assertIn("asset_name=self._value('FFMPEG_SHA256_ASSET')", source)

    def test_setup_worker_routes_updates_through_staged_rollback_updater(self):
        config = FakeConfig({'AutoUpdateYtDlp': True})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ytdlp = root / 'yt-dlp.exe'
            ffmpeg = root / 'ffmpeg.exe'
            icon = root / 'icon.ico'
            for path in (ytdlp, ffmpeg, icon):
                path.write_bytes(b'existing')
            download_path = root / 'downloads'
            with mock.patch.object(ad, 'INSTALL_DIR', root), \
                    mock.patch.object(ad, 'YTDLP_PATH', ytdlp), \
                    mock.patch.object(ad, 'FFMPEG_PATH', ffmpeg), \
                    mock.patch.object(ad, 'ICON_PATH', icon), \
                    mock.patch.dict(ad.DEFAULT_CONFIG, {'DownloadPath': str(download_path)}), \
                    mock.patch.object(ad, 'get_ytdlp_version', return_value='2026.07.04'), \
                    mock.patch.object(ad, 'ytdlp_needs_external_runtime', return_value=False), \
                    mock.patch.object(ad, '_run_ytdlp_self_update', return_value={
                        'ok': True, 'version_after': '2026.07.05',
                    }) as update, \
                    mock.patch.object(ad, '_set_integrations_stamp'), \
                    mock.patch.object(ad, 'register_desktop_shortcut'), \
                    mock.patch.object(ad, 'register_startup_task'), \
                    mock.patch.object(ad, 'register_protocol_handlers'), \
                    mock.patch.object(ad, 'register_uninstall_entry'):
                worker = ad.SetupWorker(config=config)
                worker.run()

        update.assert_called_once_with(config, source_tag='setup')


class CookieJarSweepTests(unittest.TestCase):
    """v1.2.0 S4 — orphaned .cookies.*.txt cleanup on server start.

    When the downloader is killed mid-run (power loss, taskkill /F), session
    cookies leak into INSTALL_DIR. A stale sweep on DownloadManager init
    keeps session cookies from outliving the process that needed them.
    """

    def test_cleanup_removes_old_cookie_jars_and_spares_fresh_ones(self):
        with tempfile.TemporaryDirectory() as tmp:
            install_dir = Path(tmp)
            original = ad.INSTALL_DIR
            try:
                ad.INSTALL_DIR = install_dir
                stale = install_dir / ".cookies.abc123.txt"
                fresh = install_dir / ".cookies.def456.txt"
                unrelated = install_dir / "config.json"
                stale.write_text("stale", encoding="utf-8")
                fresh.write_text("fresh", encoding="utf-8")
                unrelated.write_text("{}", encoding="utf-8")
                # Backdate the stale entry to beyond the cleanup horizon.
                old_mtime = time.time() - 3600
                import os as _os
                _os.utime(stale, (old_mtime, old_mtime))
                ad.cleanup_stale_cookie_jars(older_than_seconds=300)
                self.assertFalse(stale.exists(), "stale cookie jar should be removed")
                self.assertTrue(fresh.exists(), "fresh cookie jar should be preserved")
                self.assertTrue(unrelated.exists(), "non-cookie files must not be touched")
            finally:
                ad.INSTALL_DIR = original


class CookieThreatModelDocTests(unittest.TestCase):
    """Keep the cookie-risk documentation tied to live mitigations."""

    def test_doc_records_advisory_and_companion_cookie_controls(self):
        doc_path = Path(__file__).resolve().parent.parent / "docs" / "yt-dlp-cookie-threat-model.md"
        body = doc_path.read_text(encoding="utf-8")
        for needle in [
            "CVE-2023-35934",
            "GHSA-v8mc-9377-rwjj",
            "2023.07.06",
            "yt-dlp==2026.6.9",
            "ALLOWED_COOKIE_DOMAINS",
            ".youtube.com",
            "write_cookies_netscape()",
            "--cookies",
            "200 entries",
            "cleanup_stale_cookie_jars()",
            "300 seconds",
            "127.0.0.1",
        ]:
            self.assertIn(needle, body)


class ApiRateLimitTests(unittest.TestCase):
    """End-to-end /download rate limit via the Flask test client."""

    def test_download_endpoint_returns_429_after_burst(self):
        token = "f" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        # Force a low limit so we can exhaust it without actually starting
        # 30 real downloads (which would be blocked by MAX_CONCURRENT first).
        # We replicate the burst at the HTTP layer by patching the limiter
        # state after construction.
        # Simpler: send many OPTIONS-bypassed requests with invalid bodies.
        # The rate check runs after auth but BEFORE body parsing, so a
        # missing body still consumes a token.
        saw_429 = False
        for _ in range(ad.RATE_LIMIT_DOWNLOAD_MAX + 2):
            resp = client.post(
                "/download",
                headers={"X-Auth-Token": token, "Content-Type": "application/json"},
                data="{}",
            )
            if resp.status_code == 429:
                saw_429 = True
                self.assertIn("Retry-After", resp.headers)
                break
        self.assertTrue(saw_429, "rate limiter should reject eventually")


class CorsHeaderTests(unittest.TestCase):
    def test_response_advertises_max_age(self):
        token = "g" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(resp.headers.get("Access-Control-Max-Age"), str(ad.CORS_MAX_AGE_SECONDS))

    def test_preflight_advertises_supported_auth_headers(self):
        token = "g" * 32
        origin = "chrome-extension://trustedlegacyid"
        config = FakeConfig({
            "ServerToken": token,
            "LegacyHealthTokenOrigins": origin,
        })
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().options(
            "/provision-deno",
            headers={
                "Origin": origin,
                "Access-Control-Request-Headers": "X-MDL-Token,X-MDL-Token-Source",
            },
        )
        allowed = {
            header.strip().lower()
            for header in resp.headers.get("Access-Control-Allow-Headers", "").split(",")
        }
        self.assertEqual(resp.status_code, 200)
        self.assertTrue({"x-mdl-token", "x-mdl-token-source"}.issubset(allowed))

    def test_response_disables_intermediary_caching(self):
        # v1.4.0 NX11: defense-in-depth against intermediary caching of
        # auth-bearing responses (CVE-2026-27205 class). Every cors_response
        # must declare Cache-Control: no-store and Vary: Cookie so a future
        # session-bearing variant can't ride on a stale cache entry.
        token = "n" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
        vary = resp.headers.get("Vary", "")
        self.assertIn("Cookie", vary)

    def test_response_disables_caching_on_extension_origin_too(self):
        # The Origin-allow path adds "Vary: Origin"; the no-store + Cookie
        # token must compose with it, not overwrite it.
        token = "p" * 32
        extension_origin = "chrome-extension://trustedlegacyid"
        config = FakeConfig({
            "ServerToken": token,
            "LegacyHealthTokenOrigins": extension_origin,
        })
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get(
            "/health",
            headers={
                "X-MDL-Client": "MediaDL",
                "Origin": extension_origin,
            },
        )
        self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
        vary = resp.headers.get("Vary", "")
        self.assertIn("Cookie", vary)
        self.assertIn("Origin", vary)


class HealthAdditionsTests(unittest.TestCase):
    """v1.2.0 additions to /health schema — version strings + rate-limit policy."""

    def test_health_surface_includes_rate_limit_policy(self):
        token = "h" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        body = resp.get_json()
        self.assertIn("rateLimit", body)
        self.assertEqual(body["rateLimit"]["downloadMaxPerWindow"], ad.RATE_LIMIT_DOWNLOAD_MAX)
        self.assertEqual(body["rateLimit"]["downloadWindowSeconds"], ad.RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS)
        # ytDlpVersion / ffmpegVersion are present but may be None in CI; the
        # wire contract is "key exists, value is string or null" — assert both.
        self.assertIn("ytDlpVersion", body)
        self.assertIn("ffmpegVersion", body)


class AutoUpdateThrottleTests(unittest.TestCase):
    """v1.2.0 B3 — yt-dlp auto-update runs at most once per 24h."""

    def test_should_check_returns_true_with_no_prior_stamp(self):
        class _C:
            def get(self, key, default=None):
                return "" if key == "LastYtDlpUpdateCheck" else default
        self.assertTrue(ad.should_check_ytdlp_update(_C()))

    def test_should_check_returns_false_with_recent_stamp(self):
        recent = (ad.datetime.now() - ad.datetime.now().__class__.min.__class__.min.__class__.resolution).strftime("%Y-%m-%d %H:%M:%S")
        # Simpler form: use "now" as the stamp.
        import datetime as _dt
        recent = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        class _C:
            def get(self, key, default=None):
                return recent if key == "LastYtDlpUpdateCheck" else default
        self.assertFalse(ad.should_check_ytdlp_update(_C()))

    def test_should_check_handles_corrupt_stamp(self):
        class _C:
            def get(self, key, default=None):
                return "not-a-date" if key == "LastYtDlpUpdateCheck" else default
        # Malformed stamps should not wedge the update path — default to True
        # so the next launch can re-establish a valid stamp.
        self.assertTrue(ad.should_check_ytdlp_update(_C()))


class AutoUpdateActiveDownloadGuardTests(unittest.TestCase):
    """v4.47.0 NF26 — yt-dlp's ``-U`` flag atomically replaces the binary.
    On Windows an in-flight ``subprocess.Popen([YTDLP_PATH, ...])`` of an
    active download can race the replace with file-in-use errors. The
    guard takes a caller-supplied ``active_count_fn`` and defers the
    update when the function reports any in-flight downloads.
    """

    def _fake_config(self, last_check_stamp=""):
        # Empty stamp triggers should_check_ytdlp_update -> True.
        class _C:
            def __init__(self, stamp):
                self._d = {
                    "AutoUpdateYtDlp": True,
                    "LastYtDlpUpdateCheck": stamp,
                }
            def get(self, key, default=None):
                return self._d.get(key, default)
            def set(self, key, value):
                self._d[key] = value
            def save(self):
                pass
        return _C(last_check_stamp)

    def test_update_fires_when_no_active_downloads(self):
        # active_count_fn returning 0 must NOT defer the update; the
        # threading.Thread must be spawned (we mock it to track the spawn
        # without actually running yt-dlp).
        spawned = {"count": 0}
        orig_thread = ad.threading.Thread
        try:
            class _FakeThread:
                def __init__(self, target=None, daemon=None):
                    self._target = target
                def start(self):
                    spawned["count"] += 1
                    # Don't actually run -U; this tests the guard, not the
                    # subprocess invocation.
            ad.threading.Thread = _FakeThread
            # YTDLP_PATH must exist for the guard to fall through to the
            # active-count check; patch its existence check.
            ad.YTDLP_PATH = type(ad.YTDLP_PATH)(ad.YTDLP_PATH)
            with mock.patch.object(ad.YTDLP_PATH.__class__, 'exists', return_value=True):
                ad.maybe_auto_update_ytdlp(self._fake_config(), active_count_fn=lambda: 0)
        finally:
            ad.threading.Thread = orig_thread
        self.assertEqual(spawned["count"], 1,
                         "Update thread must spawn when active_count == 0")

    def test_update_defers_when_active_downloads_in_flight(self):
        # active_count_fn returning > 0 must defer the update; no thread
        # should spawn.
        spawned = {"count": 0}
        log_lines = []
        orig_thread = ad.threading.Thread
        orig_log = ad.write_persistent_log
        try:
            class _FakeThread:
                def __init__(self, target=None, daemon=None):
                    pass
                def start(self):
                    spawned["count"] += 1
            ad.threading.Thread = _FakeThread
            ad.write_persistent_log = lambda msg: log_lines.append(msg)
            with mock.patch.object(ad.YTDLP_PATH.__class__, 'exists', return_value=True):
                ad.maybe_auto_update_ytdlp(self._fake_config(), active_count_fn=lambda: 3)
        finally:
            ad.threading.Thread = orig_thread
            ad.write_persistent_log = orig_log
        self.assertEqual(spawned["count"], 0,
                         "Update thread must NOT spawn when active_count > 0")
        self.assertTrue(any("auto-update deferred" in line for line in log_lines),
                        f"Defer log line must surface in persistent log; got {log_lines!r}")
        self.assertTrue(any("3 active download" in line for line in log_lines),
                        f"Defer log must include the count; got {log_lines!r}")

    def test_update_defers_when_active_count_fn_raises(self):
        # Replacing the binary while activity is unknown is unsafe. A broken
        # caller-supplied probe must fail closed and defer the update.
        spawned = {"count": 0}
        log_lines = []
        orig_thread = ad.threading.Thread
        orig_log = ad.write_persistent_log
        try:
            class _FakeThread:
                def __init__(self, target=None, daemon=None):
                    pass
                def start(self):
                    spawned["count"] += 1
            ad.threading.Thread = _FakeThread
            ad.write_persistent_log = lambda msg: log_lines.append(msg)

            def broken_probe():
                raise RuntimeError("probe boom")
            with mock.patch.object(ad.YTDLP_PATH.__class__, 'exists', return_value=True):
                ad.maybe_auto_update_ytdlp(self._fake_config(), active_count_fn=broken_probe)
        finally:
            ad.threading.Thread = orig_thread
            ad.write_persistent_log = orig_log
        self.assertEqual(spawned["count"], 0,
                         "Update thread must not spawn when activity is unknown")
        self.assertTrue(any("deferred" in line and "probe failed" in line for line in log_lines),
                        f"Probe-failure log line must surface; got {log_lines!r}")

    def test_update_without_active_count_fn_proceeds(self):
        # Back-compat: existing callers without the new arg must still work.
        spawned = {"count": 0}
        orig_thread = ad.threading.Thread
        try:
            class _FakeThread:
                def __init__(self, target=None, daemon=None):
                    pass
                def start(self):
                    spawned["count"] += 1
            ad.threading.Thread = _FakeThread
            with mock.patch.object(ad.YTDLP_PATH.__class__, 'exists', return_value=True):
                ad.maybe_auto_update_ytdlp(self._fake_config())
        finally:
            ad.threading.Thread = orig_thread
        self.assertEqual(spawned["count"], 1,
                         "Update must still fire when no active_count_fn provided")


class FolderPickerWatchdogTests(unittest.TestCase):
    """v4.47.0 NF35 — the folder picker dialog can hang on slow file
    systems or stalled Qt event loops. Previously the Flask handler
    timed out at 120s with no GUI-side diagnostic pointing at the
    cause. The watchdog times the QFileDialog.exec() call and emits
    a persistent log line when the dialog blocks past the documented
    threshold (60s).
    """

    def test_threshold_constant_is_60_seconds(self):
        # Pin the threshold so it can't be silently raised to the
        # point of uselessness or lowered to spam the log.
        self.assertEqual(
            ad.FolderPickerService.DIALOG_WATCHDOG_THRESHOLD_SECONDS,
            60,
            "Watchdog threshold must be 60 seconds — leaves a 60s "
            "margin before the Flask handler's 120s timeout, so the "
            "log line gets written before the HTTP request gives up.",
        )

    def test_watchdog_emits_log_when_dialog_blocks_past_threshold(self):
        # Source-pin the log emission shape: when elapsed exceeds
        # the threshold, write_persistent_log must be called with a
        # message that names the elapsed time and the threshold so an
        # operator reading the log can correlate.
        import inspect
        src = inspect.getsource(ad.FolderPickerService._tick)
        self.assertIn(
            "elapsed > self.DIALOG_WATCHDOG_THRESHOLD_SECONDS",
            src,
            "FolderPickerService._tick must check elapsed time against the threshold",
        )
        self.assertIn(
            "FolderPickerService: dialog blocked for",
            src,
            "Watchdog log message must use the documented prefix so log scraping works",
        )
        self.assertIn(
            "Possible Qt event-loop or file-system hang.",
            src,
            "Watchdog log message must surface the suspected cause",
        )

    def test_watchdog_does_not_log_for_fast_dialogs(self):
        # The threshold gate ensures fast dialog interactions don't
        # spam the log. We pin this via source-shape rather than a
        # live Qt test — the gate is a single boolean check.
        import inspect
        src = inspect.getsource(ad.FolderPickerService._tick)
        # The log call must sit INSIDE the `if elapsed > ...`
        # block, not outside. We test this by ensuring the log line
        # is preceded by the watchdog conditional within a reasonable
        # window.
        log_line = "FolderPickerService: dialog blocked for"
        cond_line = "elapsed > self.DIALOG_WATCHDOG_THRESHOLD_SECONDS"
        log_idx = src.find(log_line)
        cond_idx = src.find(cond_line)
        self.assertGreater(log_idx, cond_idx,
                           "Log line must appear after the threshold check, not before")
        # And within 500 characters — proving they're in the same block.
        self.assertLess(log_idx - cond_idx, 500,
                        "Log line and threshold check must be in the same control block")


class DenoRuntimeHardGateTests(unittest.TestCase):
    """Runtime-required downloads fail closed on the capability contract."""

    def _create_api(self, deno_probe_result):
        # Build a fresh create_api(config, dl_manager, history) instance with
        # the deno probe patched to the given dict. Returns the Flask test
        # client. Mirrors the existing ApiSecurityTests setup.
        cfg = FakeConfig({'ServerToken': 'test-token-1234567890abcdef1234567890ab'})
        dl_manager = ad.DownloadManager(cfg, FakeHistory())

        with mock.patch.object(ad, 'probe_javascript_runtime', return_value=deno_probe_result):
            api = ad.create_api(cfg, dl_manager, FakeHistory())
        api.config['TESTING'] = True
        return api.test_client(), cfg

    def _auth_header(self, cfg):
        return {'X-Auth-Token': cfg.get('ServerToken', '')}

    def test_download_rejected_when_yt_dlp_needs_runtime_and_deno_absent(self):
        client, cfg = self._create_api({
            'installed': False,
            'version': None,
            'path': None,
            'ytdlpNeedsRuntime': True,
            'advice': 'winget install DenoLand.Deno',
        })
        # Note: even though we patched probe_deno_runtime at create_api time,
        # the handler calls it on every request, so re-patch for the request.
        with mock.patch.object(ad, 'probe_javascript_runtime', return_value={
            'installed': False,
            'supported': False,
            'ejsReady': False,
            'reason': 'runtime-not-installed',
            'ytdlpNeedsRuntime': True,
            'advice': 'winget install DenoLand.Deno',
        }):
            resp = client.post(
                '/download',
                headers={**self._auth_header(cfg), 'Host': '127.0.0.1'},
                json={'url': 'https://www.youtube.com/watch?v=abcdefghijk'},
            )
        self.assertEqual(resp.status_code, 422,
                         f"Expected 422, got {resp.status_code} body={resp.data!r}")
        body = resp.get_json() or {}
        self.assertEqual(body.get('code'), 'js-runtime-missing')
        self.assertEqual(body.get('error_code'), 'js-runtime-missing')
        self.assertEqual(body.get('next_action'), 'configure-javascript-runtime',
                         'Payload must include the recovery action for the extension UI')
        self.assertIn('Deno', body.get('error', ''),
                      'Error message must mention Deno so the extension can surface it')
        self.assertIn('winget install', body.get('advice', ''),
                      'Advice field must carry the install command verbatim')

    def test_download_allowed_when_deno_installed(self):
        # ytdlpNeedsRuntime=True but installed=True → guard passes through.
        client, cfg = self._create_api({
            'installed': True,
            'runtime': 'deno',
            'version': '2.3.0',
            'path': '/usr/bin/deno',
            'supported': True,
            'ejsReady': True,
            'reason': 'ready',
            'ytdlpNeedsRuntime': True,
            'advice': '',
        })
        with mock.patch.object(ad, 'probe_javascript_runtime', return_value={
            'installed': True,
            'runtime': 'deno',
            'supported': True,
            'ejsReady': True,
            'reason': 'ready',
            'ytdlpNeedsRuntime': True,
        }):
            resp = client.post(
                '/download',
                headers={**self._auth_header(cfg), 'Host': '127.0.0.1'},
                json={'url': 'https://www.youtube.com/watch?v=abcdefghijk'},
            )
        # We expect the download to proceed past the Deno gate; the request
        # may fail later (yt-dlp.exe likely missing in the test env) but
        # NOT with our 422. Specifically check that the response is not
        # 422 with code='deno-runtime-missing'.
        if resp.status_code == 422:
            body = resp.get_json() or {}
            self.assertNotEqual(body.get('code'), 'deno-runtime-missing',
                                'Deno-installed path must pass through the NF27 gate')

    def test_download_allowed_when_runtime_not_needed(self):
        # Pre-cutoff yt-dlp (ytdlpNeedsRuntime=False) — guard MUST allow
        # regardless of Deno installed state, so older pins keep working.
        client, cfg = self._create_api({
            'installed': False,
            'ytdlpNeedsRuntime': False,
        })
        with mock.patch.object(ad, 'probe_javascript_runtime', return_value={
            'installed': False,
            'supported': False,
            'ejsReady': False,
            'ytdlpNeedsRuntime': False,
        }):
            resp = client.post(
                '/download',
                headers={**self._auth_header(cfg), 'Host': '127.0.0.1'},
                json={'url': 'https://www.youtube.com/watch?v=abcdefghijk'},
            )
        # As above: not 422 with code='deno-runtime-missing'.
        if resp.status_code == 422:
            body = resp.get_json() or {}
            self.assertNotEqual(body.get('code'), 'deno-runtime-missing',
                                'Pre-cutoff yt-dlp path must skip the NF27 gate')

    def test_download_rejected_when_deno_is_below_runtime_floor(self):
        client, cfg = self._create_api({
            'installed': True,
            'version': '2.2.9',
            'supported': False,
            'ejsReady': False,
            'reason': 'runtime-version-unsupported',
            'stale': True,
            'minVersion': '2.3.0',
            'ytdlpNeedsRuntime': True,
            'advice': 'upgrade Deno',
        })
        with mock.patch.object(ad, 'probe_javascript_runtime', return_value={
            'installed': True,
            'version': '2.2.9',
            'supported': False,
            'ejsReady': False,
            'reason': 'runtime-version-unsupported',
            'stale': True,
            'minVersion': '2.3.0',
            'ytdlpNeedsRuntime': True,
            'advice': 'upgrade Deno',
        }):
            resp = client.post(
                '/download',
                headers={**self._auth_header(cfg), 'Host': '127.0.0.1'},
                json={'url': 'https://www.youtube.com/watch?v=abcdefghijk'},
            )
        self.assertEqual(resp.status_code, 422)
        body = resp.get_json() or {}
        self.assertEqual(body.get('code'), 'js-runtime-unsupported')
        self.assertEqual(body.get('next_action'), 'upgrade-javascript-runtime')

    def test_unknown_and_exception_runtime_states_have_stable_codes(self):
        cases = (
            ('runtime-version-unparseable', 'js-runtime-unverified'),
            ('runtime-probe-failed', 'js-runtime-unverified'),
            ('runtime-execution-failed', 'ejs-runtime-not-ready'),
        )
        for reason, expected_code in cases:
            runtime = {
                'installed': True,
                'runtime': 'deno',
                'supported': reason == 'runtime-execution-failed',
                'ejsReady': False,
                'reason': reason,
                'ytdlpNeedsRuntime': True,
                'advice': 'repair runtime',
            }
            client, cfg = self._create_api(runtime)
            with self.subTest(reason=reason), \
                 mock.patch.object(ad, 'probe_javascript_runtime', return_value=runtime):
                resp = client.post(
                    '/download',
                    headers={**self._auth_header(cfg), 'Host': '127.0.0.1'},
                    json={'url': 'https://www.youtube.com/watch?v=abcdefghijk'},
                )
            self.assertEqual(resp.status_code, 422)
            self.assertEqual((resp.get_json() or {}).get('code'), expected_code)


class NoArchiveLockTests(unittest.TestCase):
    """v1.3.0 removed the download-archive lock so re-downloads always
    run. These tests pin the invariants so the lock can't be silently
    re-introduced via a stray flag, config key, or yt-dlp argv branch.
    """

    def test_default_config_has_no_download_archive_key(self):
        self.assertNotIn('DownloadArchive', ad.DEFAULT_CONFIG,
                         'DownloadArchive must not be a default config key.')

    def test_source_does_not_pass_download_archive_to_ytdlp(self):
        # Hard sentinel: searching the source rather than mocking the
        # subprocess catches the case where someone re-adds the flag
        # without going through the config knob.
        src = Path(ad.__file__).read_text(encoding='utf-8')
        self.assertNotIn("'--download-archive'", src,
                         "yt-dlp argv must not include --download-archive.")
        self.assertNotIn('"--download-archive"', src,
                         "yt-dlp argv must not include --download-archive.")

    def test_source_passes_force_overwrites_to_ytdlp(self):
        import download

        src = inspect.getsource(download.DownloadManagerCore._run_download)
        self.assertIn("'--force-overwrites'", src,
                      "yt-dlp argv must include --force-overwrites so "
                      "re-downloads of the same URL aren't skipped because "
                      "the destination file already exists.")


class VideoFormatSelectorTests(unittest.TestCase):
    """Codec-aware format selection — the previous selector picked the
    highest-bitrate stream regardless of codec, then ``--merge-output-format
    mp4`` only swapped containers, leaving VP9/AV1 inside .mp4. Adobe Premiere
    rejects that combination as "unsupported compression". These tests pin
    the codec preferences per container so the regression can't return
    silently.
    """

    def _selector(self, args):
        # args is the full list returned by build_video_format_args.
        # Layout is ['-f', '<selector>', '--merge-output-format', '<container>']
        self.assertEqual(args[0], '-f')
        self.assertEqual(args[2], '--merge-output-format')
        return args[1], args[3]

    def test_mp4_prefers_avc1_video_and_m4a_audio(self):
        sel, container = self._selector(ad.build_video_format_args('mp4', 'best'))
        self.assertEqual(container, 'mp4')
        # Premiere requires H.264 (avc1) inside MP4. The first cascade tier
        # MUST be avc1+m4a — anything else means the regression is back.
        self.assertTrue(
            sel.startswith('bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/'),
            f'mp4 selector must lead with avc1+m4a, got: {sel}',
        )
        # Must terminate at plain `best` so download never fails purely on codec.
        self.assertTrue(sel.endswith('/best'))

    def test_mp4_with_quality_cap_applies_to_every_tier(self):
        sel, _ = self._selector(ad.build_video_format_args('mp4', '1080'))
        # Every cascade tier should respect the height cap, not just the first.
        # If a tier omits the filter, a 4K stream could leak through when the
        # user explicitly asked for 1080p.
        for tier in sel.split('/'):
            if tier == 'best':
                continue
            self.assertIn('[height<=1080]', tier,
                          f'tier missing height cap: {tier!r}')

    def test_webm_prefers_vp9_and_opus(self):
        sel, container = self._selector(ad.build_video_format_args('webm', 'best'))
        self.assertEqual(container, 'webm')
        self.assertTrue(
            sel.startswith('bestvideo[vcodec^=vp9]+bestaudio[ext=webm]/'),
            f'webm selector must lead with vp9+webm-audio, got: {sel}',
        )

    def test_mkv_has_no_codec_preference(self):
        sel, container = self._selector(ad.build_video_format_args('mkv', 'best'))
        self.assertEqual(container, 'mkv')
        # MKV is a universal container — codec filters here would needlessly
        # constrain quality with no compatibility benefit.
        self.assertNotIn('vcodec', sel)
        self.assertNotIn('acodec', sel)
        self.assertNotIn('[ext=', sel)

    def test_no_unfiltered_height_when_quality_is_best(self):
        # Sanity: when quality is 'best', no height filter should appear,
        # otherwise the cascade silently caps at the previous default.
        sel, _ = ad.build_video_format_args('mp4', 'best')[1], 'mp4'
        self.assertNotIn('[height<=', sel)


# v1.4.0 (N1): PO Token provider detection + extractor-args wiring.
class PoTokenProviderTests(unittest.TestCase):
    def setUp(self):
        ad.reset_po_token_provider_cache()

    def tearDown(self):
        ad.reset_po_token_provider_cache()

    def test_is_youtube_url_matches_canonical_hosts(self):
        for url in (
            "https://www.youtube.com/watch?v=abc",
            "https://youtube.com/watch?v=abc",
            "https://m.youtube.com/watch?v=abc",
            "https://youtu.be/abc",
            "https://www.youtube-nocookie.com/embed/abc",
            "http://youtube.com/",
        ):
            with self.subTest(url=url):
                self.assertTrue(ad.is_youtube_url(url))

    def test_is_youtube_url_rejects_non_youtube(self):
        for url in (
            "",
            None,
            "https://example.com/watch?v=abc",
            "https://fake-youtube.com.evil.example/",
            "https://youtubevideos.example.com/",
            "ftp://youtube.com/",
            "javascript:alert(1)",
        ):
            with self.subTest(url=url):
                self.assertFalse(ad.is_youtube_url(url))

    def test_build_youtube_extractor_args_empty_for_non_youtube(self):
        # Non-YouTube URLs must never receive YouTube-specific extractor args
        # so the helper stays safe to splat unconditionally in _run_download.
        for url in ("https://example.com/v/1", "https://vimeo.com/1"):
            self.assertEqual(
                ad.build_youtube_extractor_args(
                    url,
                    po_token_provider={'ok': True, 'port': 4416, 'version': None},
                ),
                [],
            )

    def test_build_youtube_extractor_args_always_includes_sabr_formats_duplicate(self):
        # N2: SABR-only adaptiveFormats silently break downloads on the
        # 2026 web client. ``youtube:formats=duplicate`` asks yt-dlp to
        # return both HTTPS and SABR families. Must be emitted whether or
        # not a PO Token provider is reachable, because SABR is a read-time
        # concern, not a token-mediated one.
        without_provider = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
        )
        with_provider = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
            po_token_provider={'ok': True, 'port': 4416, 'version': '1.2.3'},
        )
        for label, args in (("no-provider", without_provider),
                            ("with-provider", with_provider)):
            with self.subTest(label=label):
                self.assertIn('youtube:formats=duplicate', args)
                idx = args.index('youtube:formats=duplicate')
                self.assertEqual(args[idx - 1], '--extractor-args')

    def test_build_youtube_extractor_args_includes_only_sabr_when_provider_absent(self):
        # Validates that PO token routing is gated on provider availability
        # while SABR is unconditional. Prevents future regressions where
        # somebody short-circuits the helper to return [] on provider miss.
        for absent in (None, {'ok': False}, {}):
            with self.subTest(provider=absent):
                args = ad.build_youtube_extractor_args(
                    "https://www.youtube.com/watch?v=abc",
                    po_token_provider=absent,
                )
                self.assertIn('youtube:formats=duplicate', args)
                self.assertFalse(any(
                    a.startswith('youtubepot-bgutilhttp:') for a in args
                ))

    def test_build_youtube_extractor_args_routes_bgutil_when_provider_ok(self):
        args = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
            po_token_provider={'ok': True, 'port': 4416, 'version': '1.2.3'},
        )
        self.assertIn('--extractor-args', args)
        bgutil = next((a for a in args if a.startswith('youtubepot-bgutilhttp:')), None)
        self.assertIsNotNone(bgutil)
        self.assertIn('http://127.0.0.1:4416', bgutil)
        # SABR arg still present alongside provider routing.
        self.assertIn('youtube:formats=duplicate', args)

    def test_build_youtube_extractor_args_falls_back_to_token_exempt_clients(self):
        # Without a reachable PO-token provider the default web/mweb clients
        # need GVS tokens and fail; fall back to the token-exempt clients first
        # so extraction degrades instead of failing outright.
        fallback = 'youtube:player_client=tv,web_embedded,android_vr'
        for absent in (None, {'ok': False}, {}):
            with self.subTest(provider=absent):
                args = ad.build_youtube_extractor_args(
                    "https://www.youtube.com/watch?v=abc",
                    po_token_provider=absent,
                )
                self.assertIn(fallback, args)
                idx = args.index(fallback)
                self.assertEqual(args[idx - 1], '--extractor-args')
        # Chain hygiene: bare `web` is NOT token-exempt (SABR-only without a
        # GVS token), and android_vr is erratic so it must ride last.
        clients = fallback.split('=', 1)[1].split(',')
        self.assertNotIn('web', clients)
        self.assertEqual(clients[-1], 'android_vr')
        # When the provider IS reachable the web client + PO token is preferred,
        # so the exempt-client override must be omitted.
        ok_args = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
            po_token_provider={'ok': True, 'port': 4416},
        )
        self.assertNotIn(fallback, ok_args)
        self.assertFalse(any(a.startswith('youtube:player_client=') for a in ok_args))
        # A STALE provider may mint rejected tokens: treat it like absent so
        # the token-exempt chain still applies instead of routing to bgutil.
        stale_args = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
            po_token_provider={'ok': True, 'port': 4416, 'stale': True},
        )
        self.assertIn(fallback, stale_args)
        self.assertFalse(any(a.startswith('youtubepot-bgutilhttp:') for a in stale_args))
        # Non-YouTube URLs get no extractor args at all, fallback included.
        self.assertEqual(ad.build_youtube_extractor_args("https://example.com/x"), [])

    def test_probe_caches_negative_result(self):
        # The probe MUST cache None too — otherwise every download retries
        # the probe over the network, blocking startup behind 1 s timeouts.
        calls = []
        original_get = ad.http_requests.get

        def fake_get(url, **kwargs):
            calls.append(url)
            raise Exception("not running")

        ad.http_requests.get = fake_get
        try:
            self.assertIsNone(ad.probe_po_token_provider(force=True))
            self.assertIsNone(ad.probe_po_token_provider())
            # Two requests on the first force call (one per probe path), zero
            # on the cached call.
            self.assertGreater(len(calls), 0)
            cached_count = len(calls)
            ad.probe_po_token_provider()
            self.assertEqual(len(calls), cached_count)
        finally:
            ad.http_requests.get = original_get

    def test_probe_uses_ping_endpoint_first(self):
        # /ping is the documented liveness check. The fallback to / exists
        # only for older provider builds, so /ping must be tried first.
        seen_paths = []
        original_get = ad.http_requests.get

        class FakeResp:
            ok = True
            headers = {'content-type': 'application/json'}
            status_code = 200

            def json(self):
                return {'version': '2.0.0'}

        def fake_get(url, **kwargs):
            seen_paths.append(url)
            return FakeResp()

        ad.http_requests.get = fake_get
        try:
            result = ad.probe_po_token_provider(force=True)
        finally:
            ad.http_requests.get = original_get
        self.assertIsNotNone(result)
        self.assertEqual(result['port'], 4416)
        self.assertEqual(result['version'], '2.0.0')
        self.assertTrue(seen_paths[0].endswith('/ping'))

    # stale-version notice.
    def test_probe_flags_stale_when_provider_below_min_version(self):
        """If the running provider reports a version < BGUTIL_POT_MIN_VERSION,
        the probe result must set stale=True so the extension popup can
        surface an 'update bgutil-pot' notice."""
        original_get = ad.http_requests.get

        class FakeResp:
            ok = True
            headers = {'content-type': 'application/json'}
            status_code = 200
            def json(self):
                return {'version': '1.0.0'}  # well below 1.3.0

        ad.http_requests.get = lambda url, **k: FakeResp()
        try:
            result = ad.probe_po_token_provider(force=True)
        finally:
            ad.http_requests.get = original_get
        self.assertIsNotNone(result)
        self.assertEqual(result['version'], '1.0.0')
        self.assertTrue(result['stale'])
        self.assertEqual(result['minVersion'], ad.BGUTIL_POT_MIN_VERSION)

    def test_probe_does_not_flag_stale_when_version_meets_or_beats_min(self):
        original_get = ad.http_requests.get

        class FakeResp:
            ok = True
            headers = {'content-type': 'application/json'}
            status_code = 200
            def json(self):
                return {'version': '1.3.1'}  # at/above 1.3.0

        ad.http_requests.get = lambda url, **k: FakeResp()
        try:
            result = ad.probe_po_token_provider(force=True)
        finally:
            ad.http_requests.get = original_get
        self.assertIsNotNone(result)
        self.assertEqual(result['version'], '1.3.1')
        self.assertFalse(result['stale'])

    def test_compare_semver_handles_unusual_inputs(self):
        # Pre-release suffix is truncated at first non-digit segment.
        self.assertEqual(ad._compare_semver('1.3.1-rc.2', '1.3.1'), 0)
        # 'v' prefix is stripped.
        self.assertEqual(ad._compare_semver('v1.3.1', '1.3.1'), 0)
        # Different lengths normalize with zero-pad.
        self.assertEqual(ad._compare_semver('1.3', '1.3.0'), 0)
        self.assertEqual(ad._compare_semver('1.3', '1.3.1'), -1)
        # Garbage inputs compare as empty lists (equal).
        self.assertEqual(ad._compare_semver(None, None), 0)
        self.assertEqual(ad._compare_semver('', ''), 0)


# v1.4.0 (NX10): ffmpeg capabilities audit.
class FfmpegCapabilitiesTests(unittest.TestCase):
    def setUp(self):
        ad.reset_ffmpeg_capabilities_cache()

    def tearDown(self):
        ad.reset_ffmpeg_capabilities_cache()

    def test_parse_ffmpeg_major_extracts_integer_from_canonical_release(self):
        self.assertEqual(ad.parse_ffmpeg_major('8.1.1'), 8)
        self.assertEqual(ad.parse_ffmpeg_major('7.0-static'), 7)
        self.assertEqual(ad.parse_ffmpeg_major('6.1.1-essentials_build'), 6)
        # BtbN release builds carry a lowercase n tag prefix; they are tagged
        # releases and must be comparable against the security floor.
        self.assertEqual(ad.parse_ffmpeg_major('n8.0.1-9-g1234567'), 8)

    def test_parse_ffmpeg_major_returns_none_on_unparseable(self):
        # ffmpeg-master nightly / git builds report N-NNNNN-gXXXXXXX; not a
        # version we can interpret. None lets the caller degrade gracefully.
        for value in ('', None, 'N-118574-gabc1234', 'not-a-version'):
            with self.subTest(value=value):
                self.assertIsNone(ad.parse_ffmpeg_major(value))

    def test_check_ffmpeg_capabilities_treats_unparseable_as_unknown(self):
        # Monkeypatch get_ffmpeg_version to a snapshot-style string. The
        # audit must not return current=false in that case — snapshot
        # builds are intentionally non-numeric and we shouldn't alarm.
        original = ad.get_ffmpeg_version
        ad.get_ffmpeg_version = lambda *a, **k: 'N-118574-gabc1234'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertIsNone(result['majorVersion'])
        self.assertIsNone(result['current'])
        self.assertIn('not detected', result['message'].lower() + ' ' +
                      'or snapshot' if 'snapshot' not in result['message'].lower() else result['message'])

    def test_check_ffmpeg_capabilities_marks_current_when_at_or_above_floor(self):
        original = ad.get_ffmpeg_version
        # 8.1.2 is the exact security floor (CVE-2026-8461); at-floor passes.
        ad.get_ffmpeg_version = lambda *a, **k: '8.1.2'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertEqual(result['majorVersion'], 8)
        self.assertTrue(result['current'])
        self.assertIn('meets', result['message'])

    def test_check_ffmpeg_capabilities_flags_vulnerable_8_0_below_exact_floor(self):
        # 8.0.1 clears the major-8 bar but is inside the RV60 OOB-read range and
        # below the 8.1.2 MagicYUV-RCE fix, so the exact floor must flag it.
        original = ad.get_ffmpeg_version
        ad.get_ffmpeg_version = lambda *a, **k: '8.0.1'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertEqual(result['majorVersion'], 8)
        self.assertFalse(result['current'])
        self.assertIn('8.1.2', result['message'])

    def test_check_ffmpeg_capabilities_marks_stale_below_floor(self):
        original = ad.get_ffmpeg_version
        ad.get_ffmpeg_version = lambda *a, **k: '5.1.2'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertEqual(result['majorVersion'], 5)
        self.assertFalse(result['current'])
        self.assertIn('below', result['message'])

    def test_health_endpoint_exposes_ffmpeg_capabilities(self):
        # Pin the wire contract — the extension popup will key off
        # /health.ffmpegCapabilities.current to render the stale-ffmpeg
        # pill.
        config = FakeConfig({"ServerToken": "z" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get(
            "/health", headers={"X-MDL-Client": "MediaDL"},
        )
        body = resp.get_json()
        self.assertIn('ffmpegCapabilities', body)
        caps = body['ffmpegCapabilities']
        self.assertIsInstance(caps, dict)
        for key in ('majorVersion', 'current', 'message'):
            self.assertIn(key, caps)


class HealthPoTokenSurfaceTests(unittest.TestCase):
    def setUp(self):
        ad.reset_po_token_provider_cache()

    def tearDown(self):
        ad.reset_po_token_provider_cache()

    def test_health_includes_po_token_provider_field_null_when_absent(self):
        # The extension popup keys the amber "PO Token provider not detected"
        # pill off this exact field shape. Pin it so the wire contract is
        # explicit.
        config = FakeConfig({"ServerToken": "f" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())

        # Force the probe to return None without hitting the network.
        original_get = ad.http_requests.get
        ad.http_requests.get = lambda *a, **k: (_ for _ in ()).throw(Exception("offline"))
        try:
            resp = api.test_client().get(
                "/health", headers={"X-MDL-Client": "MediaDL"},
            )
        finally:
            ad.http_requests.get = original_get
        body = resp.get_json()
        self.assertIn("poTokenProvider", body)
        self.assertIsNone(body["poTokenProvider"])


class DenoRuntimeProbeTests(unittest.TestCase):
    """probe_deno_runtime, version-date cutoff parsing, and
    /health.denoRuntime field shape. The extension's downloadHealthPanel
    keys the 'Deno: missing' warn pill off exactly this wire contract."""

    def setUp(self):
        ad.reset_deno_runtime_cache()

    def tearDown(self):
        ad.reset_deno_runtime_cache()

    def test_parse_ytdlp_release_date_extracts_yyyy_mm_dd(self):
        self.assertEqual(ad._parse_ytdlp_release_date("2026.04.10"), (2026, 4, 10))
        self.assertEqual(ad._parse_ytdlp_release_date("2025.10.22"), (2025, 10, 22))
        # Builds may carry a nightly suffix like 2026.05.03.233852 — should
        # still parse the leading YYYY.MM.DD prefix.
        self.assertEqual(ad._parse_ytdlp_release_date("2026.05.03.233852"), (2026, 5, 3))

    def test_parse_ytdlp_release_date_returns_none_on_garbage(self):
        for bad in ["", "git-sha-abc123", None, "v1.2.3", "not-a-version", "0.0.0"]:
            self.assertIsNone(ad._parse_ytdlp_release_date(bad))

    def test_parse_ytdlp_release_date_rejects_out_of_range_components(self):
        # Defensive — out-of-range month / day mean we got something other
        # than a real release date and the runtime probe should NOT flag it.
        self.assertIsNone(ad._parse_ytdlp_release_date("2026.13.10"))
        self.assertIsNone(ad._parse_ytdlp_release_date("2026.04.99"))
        self.assertIsNone(ad._parse_ytdlp_release_date("2026.00.10"))

    def test_ytdlp_needs_external_runtime_at_or_past_cutoff(self):
        # Cutoff is 2026.04.01.
        self.assertTrue(ad.ytdlp_needs_external_runtime("2026.04.01"))
        self.assertTrue(ad.ytdlp_needs_external_runtime("2026.04.10"))
        self.assertTrue(ad.ytdlp_needs_external_runtime("2026.05.03.233852"))
        self.assertTrue(ad.ytdlp_needs_external_runtime("2027.01.01"))

    def test_ytdlp_needs_external_runtime_before_cutoff_returns_false(self):
        self.assertFalse(ad.ytdlp_needs_external_runtime("2026.03.31"))
        self.assertFalse(ad.ytdlp_needs_external_runtime("2025.10.22"))
        self.assertFalse(ad.ytdlp_needs_external_runtime("2024.12.31"))

    def test_ytdlp_needs_external_runtime_unparseable_is_false(self):
        # Important: we MUST NOT false-positive on first-run when
        # get_ytdlp_version() returns an empty string before bootstrap.
        for bad in ["", None, "git-sha", "unknown"]:
            self.assertFalse(ad.ytdlp_needs_external_runtime(bad))

    def test_probe_deno_runtime_returns_wire_contract_shape(self):
        # Fake the underlying primitives so the test has no PATH dep.
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        original_run_captured = ad._run_captured
        ad.shutil.which = lambda binary: '/usr/local/bin/deno' if binary == 'deno' else None
        ad.get_ytdlp_version = lambda force=False: '2026.05.03.233852'
        ad._run_captured = lambda args, timeout=5: (
            ad.JS_RUNTIME_CAPABILITY_MARKER if 'eval' in args
            else 'deno 2.4.1 (release, x86_64-pc-windows-msvc)\n'
        )
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad._run_captured = original_run_captured
        # Wire-contract shape pin — extension/ytkit.js consumes EXACTLY
        # these fields. Adding fields is safe (additive); renaming or
        # dropping any of these would break the downloadHealthPanel.
        self.assertEqual(set(result.keys()), {
            'installed', 'version', 'path', 'source', 'supported', 'stale',
            'minVersion', 'ytdlpNeedsRuntime', 'advice', 'runtime', 'ejsReady',
            'reason', 'configuredRuntime', 'canProvisionDeno'
        })
        self.assertTrue(result['installed'])
        self.assertEqual(result['version'], '2.4.1')
        self.assertIn(result['source'], ('bundled', 'system'))
        self.assertTrue(result['supported'])
        self.assertTrue(result['ejsReady'])
        self.assertEqual(result['reason'], 'ready')
        self.assertFalse(result['stale'])
        self.assertEqual(result['minVersion'], ad.DENO_MIN_VERSION)
        self.assertTrue(result['ytdlpNeedsRuntime'])
        self.assertEqual(result['advice'], '')

    def test_probe_deno_runtime_marks_stale_version_unsupported(self):
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        original_run_captured = ad._run_captured
        ad.shutil.which = lambda binary: '/usr/local/bin/deno' if binary == 'deno' else None
        ad.get_ytdlp_version = lambda force=False: '2026.06.09'
        ad._run_captured = lambda args, timeout=5: 'deno 2.2.9\n'
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad._run_captured = original_run_captured
        self.assertTrue(result['installed'])
        self.assertFalse(result['supported'])
        self.assertTrue(result['stale'])
        self.assertEqual(result['minVersion'], '2.3.0')
        self.assertIn('2.3.0', result['advice'])

    def test_probe_deno_runtime_fails_closed_when_version_cannot_be_verified(self):
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        original_run_captured = ad._run_captured
        ad.shutil.which = lambda binary: '/usr/local/bin/deno' if binary == 'deno' else None
        ad.get_ytdlp_version = lambda force=False: '2026.06.09'
        ad._run_captured = lambda args, timeout=5: ''
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad._run_captured = original_run_captured
        self.assertTrue(result['installed'])
        self.assertIsNone(result['version'])
        self.assertFalse(result['supported'])
        self.assertTrue(result['stale'])
        self.assertIn('could not verify', result['advice'])
        self.assertEqual(result['reason'], 'runtime-version-unparseable')

    def test_deno_version_support_rejects_missing_and_unparseable_values(self):
        for version in (None, '', 'unknown', 'deno canary', '2.3'):
            with self.subTest(version=version):
                self.assertFalse(ad._is_deno_version_supported(version))
        self.assertFalse(ad._is_deno_version_supported('2.2.9'))
        self.assertTrue(ad._is_deno_version_supported('2.3.0'))
        self.assertTrue(ad._is_deno_version_supported('3.0.0'))

    def test_probe_deno_runtime_surfaces_advice_when_needed_and_missing(self):
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        ad.shutil.which = lambda binary: None  # deno absent
        ad.get_ytdlp_version = lambda force=False: '2026.05.03.233852'
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
        self.assertFalse(result['installed'])
        self.assertIsNone(result['version'])
        self.assertIsNone(result['path'])
        self.assertTrue(result['ytdlpNeedsRuntime'])
        self.assertIn('Deno', result['advice'])
        self.assertIn('JavaScript runtime', result['advice'])

    def test_probe_deno_runtime_quiet_on_pre_cutoff_ytdlp(self):
        # Field installs running the pre-Deno-line yt-dlp don't need the
        # runtime — the pill should stay quiet (ytdlpNeedsRuntime=False)
        # AND advice should be empty regardless of Deno presence.
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        ad.shutil.which = lambda binary: None
        ad.get_ytdlp_version = lambda force=False: '2025.10.22'
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
        self.assertFalse(result['ytdlpNeedsRuntime'])
        self.assertEqual(result['advice'], '')

    def test_probe_deno_runtime_cached_within_ttl(self):
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        call_count = {'n': 0}
        def counting_which(binary):
            call_count['n'] += 1
            return None
        ad.shutil.which = counting_which
        ad.get_ytdlp_version = lambda force=False: '2026.05.03'
        try:
            ad.probe_deno_runtime(force=True)
            ad.probe_deno_runtime()  # cached
            ad.probe_deno_runtime()  # cached
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
        # Auto checks Deno and Node once; subsequent reads use the cache.
        self.assertEqual(call_count['n'], 2)

    def test_configured_node_22_is_recognized_and_emitted_to_ytdlp(self):
        with mock.patch.object(ad, 'DENO_PATH', Path(tempfile.gettempdir()) / 'astra-missing-deno-probe.exe'), \
             mock.patch.object(ad.shutil, 'which', side_effect=lambda binary: (
                 'C:/Program Files/nodejs/node.exe' if binary == 'node' else None
             )), \
             mock.patch.object(ad, 'get_ytdlp_version', return_value='2026.07.04'), \
             mock.patch.object(ad, '_run_captured', side_effect=lambda args, timeout=5: (
                 'v24.16.0' if '--version' in args else ad.JS_RUNTIME_CAPABILITY_MARKER
             )):
            result = ad.probe_javascript_runtime(force=True, configured_runtime='node')
        self.assertEqual(result['runtime'], 'node')
        self.assertEqual(result['version'], '24.16.0')
        self.assertTrue(result['supported'])
        self.assertTrue(result['ejsReady'])
        self.assertEqual(result['reason'], 'ready')
        self.assertEqual(ad.build_javascript_runtime_args(result), [
            '--no-js-runtimes', '--js-runtimes',
            'node:C:/Program Files/nodejs/node.exe',
        ])

    def test_supported_version_with_failed_execution_is_not_ejs_ready(self):
        def probe_output(args, timeout=5):
            if '--version' in args:
                return 'deno 2.7.11'
            raise RuntimeError('execution blocked')

        with mock.patch.object(ad, 'DENO_PATH', Path(tempfile.gettempdir()) / 'astra-missing-deno-probe.exe'), \
             mock.patch.object(ad.shutil, 'which', side_effect=lambda binary: (
                 '/usr/local/bin/deno' if binary == 'deno' else None
             )), \
             mock.patch.object(ad, 'get_ytdlp_version', return_value='2026.07.04'), \
             mock.patch.object(ad, '_run_captured', side_effect=probe_output):
            result = ad.probe_javascript_runtime(force=True, configured_runtime='deno')
        self.assertTrue(result['supported'])
        self.assertFalse(result['ejsReady'])
        self.assertEqual(result['reason'], 'runtime-execution-failed')
        self.assertEqual(ad.build_javascript_runtime_args(result), [])


class DenoProvisionTests(unittest.TestCase):
    """provision_deno auto-download and /provision-deno endpoint."""

    class _FakeResponse:
        def __init__(self, payload, status_code=200):
            self.payload = payload
            self.status_code = status_code
            self.text = payload.decode('utf-8', errors='replace') if isinstance(payload, bytes) else str(payload)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(f"HTTP {self.status_code}")

        def iter_content(self, _chunk_size):
            yield self.payload

    def test_provision_deno_returns_none_on_network_failure(self):
        original_get = ad.http_requests.get
        ad.http_requests.get = lambda *a, **k: (_ for _ in ()).throw(Exception("offline"))
        original_path = ad.DENO_PATH
        ad.DENO_PATH = Path('/nonexistent/deno.exe')
        try:
            result = ad.provision_deno()
            self.assertIsNone(result)
        finally:
            ad.http_requests.get = original_get
            ad.DENO_PATH = original_path

    def test_provision_deno_endpoint_requires_token(self):
        config = FakeConfig({"ServerToken": "f" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().post("/provision-deno")
        self.assertEqual(resp.status_code, 403)

    def test_provision_deno_endpoint_omits_local_install_path(self):
        token = "f" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        runtime = {
            "runtime": "deno",
            "installed": True,
            "supported": True,
            "ejsReady": True,
            "path": "C:/Users/tester/AppData/Local/Astra Downloader/deno.exe",
        }
        api = ad.create_api(config, manager, FakeHistory())
        with mock.patch.object(ad, "provision_deno", return_value=runtime["path"]), \
                mock.patch.object(ad, "probe_javascript_runtime", return_value=runtime):
            body = api.test_client().post(
                "/provision-deno",
                headers={"X-Auth-Token": token},
            ).get_json()

        self.assertTrue(body["ok"])
        self.assertNotIn("path", body)
        self.assertNotIn("path", body["denoRuntime"])

    def test_provision_deno_requires_sha256_sidecar_before_extracting(self):
        original_path = ad.DENO_PATH
        original_dir = ad.DENO_DIR
        with tempfile.TemporaryDirectory() as tmp:
            ad.DENO_DIR = Path(tmp)
            ad.DENO_PATH = ad.DENO_DIR / 'deno.exe'
            with mock.patch.object(ad, 'fetch_expected_sha256', return_value=None), \
                    mock.patch.object(ad.http_requests, 'get') as get_mock:
                result = ad.provision_deno()
            self.assertIsNone(result)
            get_mock.assert_not_called()
            error = ad.get_last_deno_provision_error()
            self.assertEqual(error['code'], 'deno-sha256-sidecar-missing')
            self.assertFalse(ad.DENO_PATH.exists())
        ad.DENO_PATH = original_path
        ad.DENO_DIR = original_dir

    def test_provision_deno_rejects_sha256_mismatch_and_deletes_archive(self):
        original_path = ad.DENO_PATH
        original_dir = ad.DENO_DIR
        with tempfile.TemporaryDirectory() as tmp:
            ad.DENO_DIR = Path(tmp)
            ad.DENO_PATH = ad.DENO_DIR / 'deno.exe'
            zip_path = Path(tmp) / 'deno.zip'
            with zipfile.ZipFile(zip_path, 'w') as zf:
                zf.writestr('deno.exe', b'MZ fake deno')
            payload = zip_path.read_bytes()
            with mock.patch.object(ad, 'fetch_expected_sha256', return_value='0' * 64), \
                    mock.patch.object(ad.http_requests, 'get', return_value=self._FakeResponse(payload)):
                result = ad.provision_deno()
            self.assertIsNone(result)
            error = ad.get_last_deno_provision_error()
            self.assertEqual(error['code'], 'deno-sha256-verification-failed')
            self.assertFalse(ad.DENO_PATH.exists())
            self.assertEqual(list(ad.DENO_DIR.glob('.deno.*.zip')), [])
        ad.DENO_PATH = original_path
        ad.DENO_DIR = original_dir

    def test_provision_deno_endpoint_returns_structured_failure_code(self):
        config = FakeConfig({"ServerToken": "f" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        with mock.patch.object(ad, 'provision_deno', return_value=None), \
                mock.patch.object(ad, 'get_last_deno_provision_error', return_value={
                    'code': 'deno-sha256-verification-failed',
                    'message': 'checksum mismatch',
                }):
            resp = api.test_client().post(
                "/provision-deno",
                headers={'X-MDL-Token': 'f' * 32},
            )
        self.assertEqual(resp.status_code, 500)
        body = resp.get_json() or {}
        self.assertFalse(body['ok'])
        self.assertEqual(body['code'], 'deno-sha256-verification-failed')
        self.assertIn('checksum', body['error'])

    def test_probe_includes_source_field(self):
        ad.reset_deno_runtime_cache()
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        ad.shutil.which = lambda binary: '/usr/local/bin/deno' if binary == 'deno' else None
        ad.get_ytdlp_version = lambda force=False: '2026.05.03'
        ad._run_captured_orig = ad._run_captured
        ad._run_captured = lambda args, timeout=5: 'deno 2.4.1\n'
        original_deno_path = ad.DENO_PATH
        ad.DENO_PATH = Path('/nonexistent/deno.exe')
        try:
            result = ad.probe_deno_runtime(force=True)
            self.assertIn('source', result)
            self.assertEqual(result['source'], 'system')
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad._run_captured = ad._run_captured_orig
            ad.DENO_PATH = original_deno_path
            ad.reset_deno_runtime_cache()


class HealthDenoRuntimeSurfaceTests(unittest.TestCase):
    """/health.denoRuntime field on the wire."""

    def setUp(self):
        ad.reset_deno_runtime_cache()
        ad.reset_po_token_provider_cache()

    def tearDown(self):
        ad.reset_deno_runtime_cache()
        ad.reset_po_token_provider_cache()

    def test_health_includes_deno_runtime_field(self):
        config = FakeConfig({"ServerToken": "f" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        original_po_get = ad.http_requests.get
        ad.shutil.which = lambda binary: None
        ad.get_ytdlp_version = lambda force=False: '2025.10.22'
        ad.http_requests.get = lambda *a, **k: (_ for _ in ()).throw(Exception("offline"))
        try:
            resp = api.test_client().get(
                "/health", headers={"X-MDL-Client": "MediaDL"},
            )
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad.http_requests.get = original_po_get
        body = resp.get_json()
        self.assertIn("denoRuntime", body)
        self.assertIn("javascriptRuntime", body)
        self.assertIsInstance(body["denoRuntime"], dict)
        for key in ("installed", "version", "ytdlpNeedsRuntime", "advice"):
            self.assertIn(key, body["denoRuntime"])
        self.assertNotIn("path", body["denoRuntime"])
        for key in ("runtime", "version", "supported", "ejsReady", "reason"):
            self.assertIn(key, body["javascriptRuntime"])

    def test_api_version_constant_at_2(self):
        # Adding fields to /health is additive — wire-major stays at 2.
        # Pin so a future bump is a deliberate, reviewed change.
        self.assertEqual(ad.SERVICE_API_VERSION, 2)

    def test_app_version_bumped_to_1_5_6(self):
        # v1.5.6 audit session: session-port persistence leak closed, racy
        # download-initiated updater trigger removed, /formats concurrency
        # cap, output-template validation feedback + printf-syntax checks,
        # minimized-window completion toasts, async SABR pill, palette sync.
        self.assertEqual(ad.APP_VERSION, "1.5.6")


class EndToEndDownloadTests(unittest.TestCase):
    """v1.5.1 / RESEARCH_FEATURE_PLAN EI14: end-to-end download flow with
    a faked yt-dlp subprocess.

    The 80 prior tests cover normalisation, security, rate-limiting, etc.
    but the full /download → spawn yt-dlp → parse progress → mark complete
    → write history flow was never exercised. A regression in the parsing
    loop (filename detection, progress regex, status transitions) would
    ship silently. This test exercises the whole flow with a fake
    subprocess.Popen — no real yt-dlp invocation — so it stays
    deterministic, sub-second, and hermetic.
    """

    def _make_fake_popen(self, lines, returncode=0):
        """Build a subprocess.Popen replacement that yields the given
        progress lines as if from yt-dlp stdout, then "exits" with
        returncode.
        """
        class FakeProc:
            def __init__(self, lines, rc):
                self._lines = list(lines)
                self.stdout = iter([line + "\n" for line in self._lines])
                self.returncode = rc
                self._waited = False

            def wait(self):
                self._waited = True
                return self.returncode

            def poll(self):
                return self.returncode if self._waited else None

            def terminate(self):
                # reason: cancel() path may call this; satisfy the API
                pass

            def kill(self):
                # reason: same as terminate
                pass

        def factory(args, **kwargs):
            return FakeProc(lines, returncode)
        return factory

    def _wait_for_terminal(self, dl, timeout=2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if dl.status in ad.DOWNLOAD_TERMINAL_STATES:
                return True
            time.sleep(0.01)
        return False

    def test_full_download_flow_marks_complete_and_writes_history(self):
        # Fake yt-dlp output: structured progress lines that the parsing
        # loop knows how to decode + a Merger line (sets filename) + a
        # final "100%" line. The real flow then waits on the process
        # and stamps "complete".
        token = "i" * 32
        fake_lines = [
            'MDLP_JSON {"downloaded_bytes": 5000, "total_bytes": 10000, "_speed_str": "1.2MiB/s", "_eta_str": "00:01"}',
            'MDLP_JSON {"downloaded_bytes": 10000, "total_bytes": 10000, "_speed_str": "1.2MiB/s", "_eta_str": "00:00"}',
            '[Merger] Merging formats into "fake-video.mp4"',
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            config = FakeConfig({
                "ServerToken": token,
                "DownloadPath": tmpdir,
                "AudioDownloadPath": tmpdir,
            })
            history = FakeHistory()
            manager = ad.DownloadManager(config, history)

            popen_factory = self._make_fake_popen(fake_lines, returncode=0)
            with mock.patch.object(ad.subprocess, 'Popen', popen_factory), \
                 mock.patch.object(ad, 'probe_po_token_provider', return_value=None), \
                 mock.patch.object(ad, 'write_persistent_log', return_value=None):
                dl_id, err = manager.start_download(
                    url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    audio_only=False,
                    fmt="mp4",
                    quality="best",
                )
                self.assertIsNone(err, f"start_download must succeed: {err}")
                self.assertIsNotNone(dl_id)
                dl = manager.downloads[dl_id]
                self.assertTrue(self._wait_for_terminal(dl),
                    f"download must reach a terminal state within timeout; status={dl.status}")

            self.assertEqual(dl.status, "complete",
                f"download must terminate as complete; got {dl.status} (error={dl.error})")
            self.assertEqual(dl.progress, 100, "complete download must have progress=100")
            self.assertEqual(dl.filename, "fake-video.mp4",
                "Merger line must be parsed into dl.filename")
            self.assertEqual(len(history.entries), 1,
                "completed download must write exactly one history entry")
            entry = history.entries[0]
            self.assertEqual(entry["id"], dl_id)
            self.assertEqual(entry["url"], "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            self.assertEqual(entry["filename"], "fake-video.mp4")
            self.assertEqual(entry["format"], "mp4")
            self.assertFalse(entry["audioOnly"])

    def test_accurate_section_recut_reencodes_then_atomically_replaces_source(self):
        captured = []

        class FakeFfmpeg:
            returncode = 0
            stdout = None

            def __init__(self, args):
                self.args = list(args)

            def communicate(self):
                Path(self.args[-1]).write_bytes(b"trimmed-media")
                return "", None

            def poll(self):
                return self.returncode

        def spawn(args, **_kwargs):
            captured.append(list(args))
            return FakeFfmpeg(args)

        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source.mp4"
            source.write_bytes(b"full-media")
            manager = ad.DownloadManager(
                FakeConfig({"DownloadPath": tmpdir, "AudioDownloadPath": tmpdir}),
                FakeHistory(),
            )
            download = ad.Download(
                "dl_section",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                output_dir=tmpdir,
                fmt="mp4",
                section={"start": 62.5, "end": 65.0},
            )
            download.filename = str(source)

            with mock.patch.object(ad, "FFMPEG_PATH", Path(tmpdir) / "ffmpeg.exe"), \
                 mock.patch.object(ad, "spawn_media_process", side_effect=spawn):
                self.assertTrue(manager._recut_section(download, {}))

            self.assertEqual(source.read_bytes(), b"trimmed-media")
            args = captured[0]
            self.assertLess(args.index("-i"), args.index("-ss"))
            self.assertEqual(args[args.index("-ss") + 1], "62.500")
            self.assertEqual(args[args.index("-t") + 1], "2.500")
            self.assertIn("libx264", args)
            self.assertNotIn("--download-sections", args)

    def test_saved_config_cannot_inject_link_file_flags_into_spawn(self):
        captured_args = []
        base_factory = self._make_fake_popen([], returncode=0)

        def capture(args, **kwargs):
            captured_args.append(list(args))
            return base_factory(args, **kwargs)

        with tempfile.TemporaryDirectory() as tmpdir:
            config = FakeConfig({
                "DownloadPath": tmpdir,
                "AudioDownloadPath": tmpdir,
                "ytDlpArgs": list(ad.YTDLP_FORBIDDEN_LINK_FLAGS),
                "extraArgs": ["--write-link"],
                "writeLink": True,
                "--write-desktop-link": True,
            })
            manager = ad.DownloadManager(config, FakeHistory())
            download = ad.Download(
                "dl_link_policy",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                output_dir=tmpdir,
            )
            download.status = "queued"  # the state _schedule() hands to the worker
            with mock.patch.object(ad.subprocess, 'Popen', capture), \
                 mock.patch.object(ad, 'probe_po_token_provider', return_value=None), \
                 mock.patch.object(ad, 'probe_javascript_runtime', return_value={
                     'runtime': 'deno', 'path': 'C:/Tools/deno.exe',
                     'supported': True, 'ejsReady': True,
                 }), \
                 mock.patch.object(ad, 'write_persistent_log', return_value=None):
                manager._run_download(download)

        self.assertEqual(download.status, "complete")
        self.assertEqual(len(captured_args), 1)
        options = {
            arg.split('=', 1)[0].casefold()
            for arg in captured_args[0][1:]
            if isinstance(arg, str) and arg.startswith('--')
        }
        self.assertTrue(options.isdisjoint(ad.YTDLP_FORBIDDEN_LINK_FLAGS))
        self.assertIn('--ignore-config', captured_args[0])
        self.assertIn('--no-js-runtimes', captured_args[0])
        self.assertIn('deno:C:/Tools/deno.exe', captured_args[0])

    def test_playlist_subset_is_the_only_playlist_selection_passed_to_ytdlp(self):
        captured_args = []
        base_factory = self._make_fake_popen([], returncode=0)

        def capture(args, **kwargs):
            captured_args.append(list(args))
            return base_factory(args, **kwargs)

        with tempfile.TemporaryDirectory() as tmpdir:
            manager = ad.DownloadManager(
                FakeConfig({"DownloadPath": tmpdir, "AudioDownloadPath": tmpdir}),
                FakeHistory(),
            )
            download = ad.Download(
                "dl_playlist_subset",
                "https://www.youtube.com/playlist?list=PLfixture",
                output_dir=tmpdir,
                playlist_items=[1, 3, 5],
            )
            download.status = "queued"
            with mock.patch.object(ad.subprocess, "Popen", capture), \
                 mock.patch.object(ad, "probe_po_token_provider", return_value=None), \
                 mock.patch.object(ad, "write_persistent_log", return_value=None):
                manager._run_download(download)

        self.assertEqual(download.status, "complete")
        args = captured_args[0]
        self.assertIn("--yes-playlist", args)
        self.assertEqual(args[args.index("--playlist-items") + 1], "1,3,5")
        self.assertNotIn("--playlist-start", args)
        self.assertNotIn("--playlist-end", args)

    def test_playlist_subset_rejects_video_urls_and_clip_combinations(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        download_id, err = manager.start_download(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            playlist_items=[1],
        )
        self.assertIsNone(download_id)
        self.assertIn("playlist URL", err)

        download_id, err = manager.start_download(
            "https://www.youtube.com/playlist?list=PLfixture",
            playlist_items=[1],
            section={"start": 1, "end": 2},
        )
        self.assertIsNone(download_id)
        self.assertIn("single-video", err)

    def test_completed_download_closes_subprocess_stdout(self):
        token = "z" * 32
        with tempfile.TemporaryDirectory() as tmpdir:
            config = FakeConfig({
                "ServerToken": token,
                "DownloadPath": tmpdir,
                "AudioDownloadPath": tmpdir,
            })
            manager = ad.DownloadManager(config, FakeHistory())
            dl = ad.Download(
                "dl_stdout_cleanup",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                output_dir=tmpdir,
            )
            dl.status = "queued"  # the state _schedule() hands to the worker

            class FakeProc:
                def __init__(self):
                    self.stdout = io.StringIO(
                        'MDLP_JSON {"downloaded_bytes": 1, "total_bytes": 1}\n'
                    )
                    self.returncode = 0

                def wait(self):
                    return self.returncode

                def poll(self):
                    return self.returncode

            fake_proc = FakeProc()
            with mock.patch.object(ad.subprocess, 'Popen', return_value=fake_proc), \
                 mock.patch.object(ad, 'probe_po_token_provider', return_value=None), \
                 mock.patch.object(ad, 'write_persistent_log', return_value=None):
                manager._run_download(dl)

            self.assertEqual(dl.status, "complete")
            self.assertTrue(fake_proc.stdout.closed,
                "download teardown must close the PIPE-backed stdout stream")
            self.assertIsNone(dl.process)

    def test_yt_dlp_nonzero_exit_with_error_marks_failed(self):
        # When the subprocess exits non-zero and progress never reached
        # 99 %, the download must transition to "failed" with the error
        # text taken from the last ERROR line (truncated to 240 chars
        # per the audit-pass fix).
        token = "j" * 32
        fake_lines = [
            'MDLP_JSON {"downloaded_bytes": 100, "total_bytes": 10000, "_speed_str": "10KiB/s", "_eta_str": "01:00"}',
            'ERROR: Sign in to confirm your age',
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            config = FakeConfig({
                "ServerToken": token,
                "DownloadPath": tmpdir,
                "AudioDownloadPath": tmpdir,
            })
            history = FakeHistory()
            manager = ad.DownloadManager(config, history)
            popen_factory = self._make_fake_popen(fake_lines, returncode=1)
            with mock.patch.object(ad.subprocess, 'Popen', popen_factory), \
                 mock.patch.object(ad, 'probe_po_token_provider', return_value=None), \
                 mock.patch.object(ad, 'write_persistent_log', return_value=None):
                dl_id, err = manager.start_download(
                    url="https://www.youtube.com/watch?v=ageGated",
                )
                self.assertIsNone(err)
                dl = manager.downloads[dl_id]
                self.assertTrue(self._wait_for_terminal(dl))

            self.assertEqual(dl.status, "failed",
                f"non-zero exit with low progress must fail; got {dl.status}")
            self.assertIn("Sign in to confirm", dl.error or "",
                "error must surface the yt-dlp ERROR text")
            self.assertEqual(dl.error_code, "sign-in-required",
                "sign-in failures must expose a stable recovery code")
            self.assertEqual(dl.to_dict().get("next_action"), "sign-in-and-retry",
                "status payload must expose the matching recovery action")
            self.assertEqual(len(history.entries), 0,
                "failed download must NOT write a history entry")

    def test_yt_dlp_nonzero_exit_after_full_progress_still_marks_failed(self):
        token = "p" * 32
        fake_lines = [
            'MDLP_JSON {"downloaded_bytes": 10000, "total_bytes": 10000, "_speed_str": "1.2MiB/s", "_eta_str": "00:00"}',
            'ERROR: Postprocessing: ffmpeg exited with code 1',
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            config = FakeConfig({
                "ServerToken": token,
                "DownloadPath": tmpdir,
                "AudioDownloadPath": tmpdir,
            })
            history = FakeHistory()
            manager = ad.DownloadManager(config, history)
            popen_factory = self._make_fake_popen(fake_lines, returncode=1)
            with mock.patch.object(ad.subprocess, 'Popen', popen_factory), \
                 mock.patch.object(ad, 'probe_po_token_provider', return_value=None), \
                 mock.patch.object(ad, 'write_persistent_log', return_value=None):
                dl_id, err = manager.start_download(
                    url="https://www.youtube.com/watch?v=postProcessFail",
                )
                self.assertIsNone(err)
                dl = manager.downloads[dl_id]
                self.assertTrue(self._wait_for_terminal(dl))

        self.assertEqual(dl.status, "failed",
            f"non-zero exit after full progress must fail; got {dl.status}")
        self.assertEqual(dl.progress, 100,
            "the parsed progress can remain complete, but status must not")
        self.assertEqual(dl.error_code, "ffmpeg-missing-or-stale",
            "late ffmpeg failures must expose the recovery code")
        self.assertEqual(dl.to_dict().get("next_action"), "refresh-ffmpeg",
            "status payload must expose the matching recovery action")
        self.assertEqual(len(history.entries), 0,
            "failed postprocessor exit must NOT write a history entry")

    def test_parse_loop_crash_terminates_orphan_and_purges_cookie_jar(self):
        """Audit fix: an unexpected exception inside the output-parsing loop
        must not orphan the still-running yt-dlp tree. The finally has to
        kill the process tree BEFORE unlinking the cookie jar, so the orphan
        never outlives (or holds open) the credential file."""
        token = "k" * 32

        class ExplodingStdout:
            def __iter__(self):
                return self

            def __next__(self):
                raise OSError("boom: stdout read failed mid-stream")

        class FakeProc:
            def __init__(self):
                self.stdout = ExplodingStdout()
                self.returncode = None

            def poll(self):
                # Still running — this is the orphan scenario.
                return None

            def wait(self, timeout=None):
                return None

            def terminate(self):
                pass

            def kill(self):
                pass

        fake_proc = FakeProc()
        cookies = [{
            "domain": ".youtube.com", "name": "SID", "value": "abc",
            "path": "/", "secure": True, "httpOnly": True,
            "expirationDate": 1700000000,
        }]
        with tempfile.TemporaryDirectory() as tmpdir:
            config = FakeConfig({
                "ServerToken": token,
                "DownloadPath": tmpdir,
                "AudioDownloadPath": tmpdir,
            })
            history = FakeHistory()
            with mock.patch.object(ad, 'INSTALL_DIR', Path(tmpdir)):
                manager = ad.DownloadManager(config, history)
                with mock.patch.object(ad.subprocess, 'Popen', return_value=fake_proc), \
                     mock.patch.object(ad, 'probe_po_token_provider', return_value=None), \
                     mock.patch.object(ad, 'write_persistent_log', return_value=None), \
                     mock.patch.object(ad, 'terminate_process_tree') as terminate:
                    dl_id, err = manager.start_download(
                        url="https://www.youtube.com/watch?v=crashCase",
                        cookies=cookies,
                    )
                    self.assertIsNone(err)
                    dl = manager.downloads[dl_id]
                    # Wait for the finally to finish (status flips to failed in
                    # the except, BEFORE the finally runs — so poll on the
                    # jar/process fields, not just the terminal status).
                    deadline = time.time() + 2.0
                    while time.time() < deadline:
                        if dl.cookies_file is None and dl.process is None:
                            break
                        time.sleep(0.01)

                    self.assertEqual(dl.status, "failed")
                    terminate.assert_called_once_with(fake_proc)
                    self.assertIsNone(dl.process,
                        "finally must null dl.process after the kill")
                    self.assertIsNone(dl.cookies_file,
                        "cookie jar reference must be cleared")
                    leftovers = list(Path(tmpdir).glob(".cookies.*.txt"))
                    self.assertEqual(leftovers, [],
                        "cookie jar file must be unlinked after the orphan is killed")
                    self.assertEqual(len(history.entries), 0)


class YtDlpLinkFilePolicyTests(unittest.TestCase):
    """Defense in depth for CVE-2026-55404 shortcut-file output."""

    def test_process_boundary_rejects_link_flags_and_abbreviations(self):
        hostile_options = {
            *ad.YTDLP_FORBIDDEN_LINK_FLAGS,
            '--write-l',
            '--write-u',
            '--write-d',
            '--write-w',
        }
        for option in hostile_options:
            for suffix in ('', '=true'):
                with self.subTest(option=option, suffix=suffix), \
                     mock.patch.object(ad.subprocess, 'Popen') as popen:
                    with self.assertRaisesRegex(ValueError, 'link-file output flag'):
                        ad.spawn_ytdlp(['yt-dlp.exe', option + suffix, 'https://example.test'])
                    popen.assert_not_called()

    def test_process_boundary_allows_reviewed_download_args(self):
        sentinel = object()
        with mock.patch.object(ad.subprocess, 'Popen', return_value=sentinel) as popen:
            result = ad.spawn_ytdlp([
                'yt-dlp.exe', '--write-subs', '--no-playlist',
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ], text=True)
        self.assertIs(result, sentinel)
        popen.assert_called_once()


class Aria2cExternalDownloaderBanTests(unittest.TestCase):
    """CVE-2026-50574: yt-dlp removed aria2c HLS/DASH support because
    aria2c manifest downloads allowed arbitrary code execution.  Verify
    the companion never passes --external-downloader aria2c."""

    def test_source_never_references_aria2c(self):
        src = Path(ad.__file__).read_text(encoding='utf-8')
        self.assertNotIn('aria2', src.lower(),
            "astra_downloader source must not reference aria2c "
            "(CVE-2026-50574: RCE via manifest downloads)")

    def test_source_never_passes_external_downloader_flag(self):
        src = Path(ad.__file__).read_text(encoding='utf-8')
        self.assertNotIn('--external-downloader', src,
            "astra_downloader must not pass --external-downloader to yt-dlp")


class DownloadSizeCeilingTests(unittest.TestCase):
    """Audit fix: download_file_atomic must enforce a byte ceiling while
    streaming so a misbehaving CDN can't fill the disk before the SHA-256
    check ever runs."""

    class _FakeResponse:
        def __init__(self, chunks, headers=None):
            self._chunks = list(chunks)
            self.headers = headers or {}

        def raise_for_status(self):
            pass

        def iter_content(self, _chunk_size):
            return iter(self._chunks)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def test_default_ceiling_constant_is_500_mb(self):
        self.assertEqual(ad.HELPER_DOWNLOAD_MAX_BYTES, 500 * 1024 * 1024)

    def test_rejects_oversized_content_length_before_streaming(self):
        resp = self._FakeResponse([b"x" * 4], headers={"content-length": "1000"})
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "asset.bin"
            with mock.patch.object(ad.http_requests, 'get', return_value=resp):
                with self.assertRaises(RuntimeError):
                    ad.download_file_atomic(
                        "https://example.invalid/asset", target, max_bytes=10,
                    )
            self.assertFalse(target.exists())
            self.assertEqual(list(Path(tmp).iterdir()), [],
                "no partial temp file may remain after the abort")

    def test_aborts_and_cleans_partial_when_stream_exceeds_limit(self):
        # No content-length header — the server lies by omission, so the
        # streamed byte count itself must trip the ceiling mid-download.
        resp = self._FakeResponse([b"x" * 8, b"y" * 8])
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "asset.bin"
            with mock.patch.object(ad.http_requests, 'get', return_value=resp):
                with self.assertRaises(RuntimeError):
                    ad.download_file_atomic(
                        "https://example.invalid/asset", target, max_bytes=10,
                    )
            self.assertFalse(target.exists())
            self.assertEqual(list(Path(tmp).iterdir()), [],
                "partial download must be cleaned up on ceiling breach")

    def test_download_within_limit_still_succeeds(self):
        resp = self._FakeResponse([b"hello", b"world"],
                                  headers={"content-length": "10"})
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "asset.bin"
            with mock.patch.object(ad.http_requests, 'get', return_value=resp):
                ad.download_file_atomic(
                    "https://example.invalid/asset", target, max_bytes=10,
                )
            self.assertEqual(target.read_bytes(), b"helloworld")

    def test_stream_copy_stops_at_limit_without_buffering_remainder(self):
        source = io.BytesIO(b"0123456789")
        destination = io.BytesIO()
        with self.assertRaises(RuntimeError):
            ad.copy_stream_limited(source, destination, max_bytes=5, chunk_size=1024)
        self.assertLessEqual(len(destination.getvalue()), 5)


class ArchiveExtractionBoundaryTests(unittest.TestCase):
    def _archive(self, root, entries):
        path = Path(root) / 'helper.zip'
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, payload in entries:
                archive.writestr(name, payload)
        return path

    def test_exact_nested_executable_extracts_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._archive(tmp, [('bundle/bin/deno.exe', b'MZ valid')])
            destination = Path(tmp) / 'deno.exe'
            result = ad.extract_archive_executable_atomic(
                archive, destination, 'deno.exe', max_bytes=32,
            )
            self.assertEqual(result, destination)
            self.assertEqual(destination.read_bytes(), b'MZ valid')

    def test_suffix_lookalike_is_rejected_and_existing_binary_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._archive(tmp, [('bundle/evildeno.exe', b'MZ evil')])
            destination = Path(tmp) / 'deno.exe'
            destination.write_bytes(b'known-good')
            with self.assertRaisesRegex(RuntimeError, 'was not found'):
                ad.extract_archive_executable_atomic(
                    archive, destination, 'deno.exe', max_bytes=32,
                )
            self.assertEqual(destination.read_bytes(), b'known-good')

    def test_duplicate_exact_executables_are_rejected_as_ambiguous(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._archive(tmp, [
                ('one/ffmpeg.exe', b'first'),
                ('two/ffmpeg.exe', b'second'),
            ])
            destination = Path(tmp) / 'ffmpeg.exe'
            with self.assertRaisesRegex(RuntimeError, 'multiple ffmpeg.exe'):
                ad.extract_archive_executable_atomic(
                    archive, destination, 'ffmpeg.exe', max_bytes=32,
                )
            self.assertFalse(destination.exists())

    def test_expanded_executable_over_limit_is_rejected_and_temp_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._archive(tmp, [('ffmpeg.exe', b'x' * 33)])
            destination = Path(tmp) / 'ffmpeg.exe'
            with self.assertRaisesRegex(RuntimeError, 'expands to 33 bytes'):
                ad.extract_archive_executable_atomic(
                    archive, destination, 'ffmpeg.exe', max_bytes=32,
                )
            self.assertFalse(destination.exists())
            self.assertEqual(list(Path(tmp).glob('.ffmpeg.exe.*.extract')), [])


class ResponseSizeCapTests(unittest.TestCase):
    """v1.5.1 / RESEARCH_FEATURE_PLAN EI12: bounded HTTP surface.

    Both sides of the wire must be capped so the Flask process can't be
    OOM'd by an oversized payload:

      • incoming: MAX_REQUEST_BYTES = 1 MB, enforced by Flask itself via
        app.config['MAX_CONTENT_LENGTH']
      • outgoing: MAX_RESPONSE_BYTES = 10 MB, enforced by cors_response
        replacing oversized payloads with a 413 error body before the
        wire layer transmits anything
    """

    def test_constants_declared_with_expected_values(self):
        # The values themselves are policy — assert the documented
        # numbers so a silent drift to 1 GB doesn't sneak through.
        self.assertEqual(ad.MAX_REQUEST_BYTES, 1 * 1024 * 1024)
        self.assertEqual(ad.MAX_RESPONSE_BYTES, 10 * 1024 * 1024)

    def test_request_size_cap_wired_into_flask(self):
        # Flask's MAX_CONTENT_LENGTH gates the body BEFORE the route
        # handler sees it, so an oversized POST gets a generic 413
        # without exercising our auth / validation logic. Assert
        # create_api wires the cap into app.config.
        token = "f" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        self.assertEqual(api.config['MAX_CONTENT_LENGTH'], ad.MAX_REQUEST_BYTES,
            "create_api must seed MAX_CONTENT_LENGTH so Flask itself caps incoming bodies")

    def test_request_body_exceeding_cap_returns_413(self):
        # End-to-end: send a body > MAX_REQUEST_BYTES against /download
        # and verify Flask emits 413 before our handler runs. The body
        # is just oversized JSON; the auth + validation logic in the
        # /download handler is never reached.
        token = "g" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        oversized = "x" * (ad.MAX_REQUEST_BYTES + 1024)
        resp = api.test_client().post(
            "/download",
            data=oversized,
            headers={
                "X-Auth-Token": token,
                "Content-Type": "application/json",
                "Host": "127.0.0.1:9751",
            },
        )
        self.assertEqual(resp.status_code, 413,
            "POST body > MAX_REQUEST_BYTES must return 413 (RequestEntityTooLarge)")

    def test_cors_response_has_outgoing_size_guard(self):
        # cors_response is an inner closure inside create_api, so we
        # can't call it directly from a test. Pin the guard at the
        # source level so a future refactor that drops the check fails
        # CI. The shape pinned here: len(resp.get_data()) > MAX_RESPONSE_BYTES
        # must short-circuit into a 413 jsonify response.
        import inspect
        import routes
        src = inspect.getsource(routes.create_api)
        self.assertIn("MAX_RESPONSE_BYTES", src,
            "create_api must reference MAX_RESPONSE_BYTES in cors_response")
        self.assertIn("status_code = 413", src,
            "cors_response must set status_code = 413 when the body exceeds the cap")
        self.assertIn("resp.get_data()", src,
            "cors_response must measure the actual serialised body length, not the input dict")


_qapp_singleton = None
_qapp_init_error = None


def _get_qapp_or_skip(test_case):
    """Lazily construct the QApplication singleton for GUI smoke tests.

    Qt requires exactly one QApplication per process; constructing
    a second one raises. We cache the first instance and reuse it.
    On a CI runner without a display server (Linux without xvfb,
    SSH session without X-forwarding), construction raises — the
    test is skipped rather than failing the whole pytest run.
    """
    global _qapp_singleton, _qapp_init_error
    if _qapp_singleton is not None:
        return _qapp_singleton
    if _qapp_init_error is not None:
        test_case.skipTest(f"QApplication unavailable: {_qapp_init_error}")
        return None
    try:
        from PyQt6.QtWidgets import QApplication
        _qapp_singleton = QApplication.instance() or QApplication([])
        return _qapp_singleton
    except Exception as e:  # noqa: BLE001
        _qapp_init_error = repr(e)
        test_case.skipTest(f"QApplication construction failed: {_qapp_init_error}")
        return None


class GuiSmokeTests(unittest.TestCase):
    """v4.47.0 NF22 — live Qt smoke tests for the downloader GUI.

    These tests construct a real QApplication and exercise the
    FolderPickerService timer-driven dispatch end-to-end. Previously
    the GUI side had only source-shape pins (FolderPickerWatchdogTests
    above) — a regression in the dialog code-path would only surface
    via the user reports it was supposed to make easier to file.

    Tests skip gracefully if QApplication can't be constructed
    (CI runner without a display server). The shared FolderPickerService
    tests cover both the happy paths (Accepted, Rejected) and the
    watchdog log path with a mocked-slow QFileDialog.exec.
    """

    _retained_windows = []

    def setUp(self):
        _get_qapp_or_skip(self)
        # Drain any leftover queue entries from prior test interactions
        # so each test starts from a clean slate.
        while True:
            try:
                ad._folder_pick_q.get_nowait()
            except Exception:  # queue.Empty or anything weird
                break

    def test_qapplication_constructs(self):
        # If we got past setUp without skipping, QApplication is alive.
        from PyQt6.QtWidgets import QApplication
        self.assertIsNotNone(QApplication.instance(),
                             "QApplication.instance() must be available after setUp")

    def test_main_window_construction_defers_executable_version_probes(self):
        from PyQt6.QtWidgets import QApplication

        calls = []

        def ytdlp_version(*_args, **_kwargs):
            calls.append("yt-dlp")
            return "2026.07.04"

        def ffmpeg_version(*_args, **_kwargs):
            calls.append("ffmpeg")
            return "8.1.2"

        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        with mock.patch.object(ad, "get_ytdlp_version", side_effect=ytdlp_version), \
                mock.patch.object(ad, "get_ffmpeg_version", side_effect=ffmpeg_version), \
                mock.patch.object(ad.MainWindow, "_start_instance_command_listener"), \
                mock.patch.object(ad.MainWindow, "_start_readiness_probe"), \
                mock.patch.object(ad.QSystemTrayIcon, "show"):
            window = ad.MainWindow(FakeConfig(), manager, FakeHistory())
            try:
                self.assertEqual(calls, [],
                                 "MainWindow construction must not shell out before first paint")
                self.assertEqual(window.tools_status.text(), "Checking installed tools…")

                deadline = time.monotonic() + 2
                while len(calls) < 2 and time.monotonic() < deadline:
                    QApplication.processEvents()
                    time.sleep(0.01)
                self.assertCountEqual(calls, ["yt-dlp", "ffmpeg"])

                deadline = time.monotonic() + 2
                while "yt-dlp 2026.07.04" not in window.tools_status.text() \
                        and time.monotonic() < deadline:
                    QApplication.processEvents()
                    time.sleep(0.01)
                self.assertEqual(
                    window.tools_status.text(),
                    "yt-dlp 2026.07.04    •    ffmpeg 8.1.2",
                )
            finally:
                window.update_timer.stop()
                window.cleanup_timer.stop()
                window.tray.hide()
                window._force_exit = True
                window.close()
                QApplication.processEvents()
                # Keep the closed C++ object alive for the remainder of the
                # shared-QApplication suite. Deleting a complex Qt window
                # immediately can invalidate queued animation callbacks owned
                # by Qt itself; application shutdown performs final disposal.
                self._retained_windows.append(window)

    def test_make_line_icon_renders_glyph_at_native_requested_size(self):
        from PyQt6.QtCore import QSize
        # The default 18 px icon cannot satisfy a 36 px request without
        # upscaling, so QIcon.actualSize caps at the stored 18 px pixmap.
        small = ad.make_line_icon("history")
        self.assertEqual(small.actualSize(QSize(36, 36)), QSize(18, 18))
        # Requesting size=36 authors the glyph natively, so the empty-state
        # rasterizes crisply instead of doubling an 18 px pixmap.
        native = ad.make_line_icon("history", size=36)
        self.assertEqual(native.actualSize(QSize(36, 36)), QSize(36, 36))
        self.assertFalse(native.pixmap(36, 36).isNull())

    def test_folder_picker_service_constructs_and_starts_timer(self):
        svc = ad.FolderPickerService()
        try:
            self.assertIsNotNone(svc._timer,
                                 "FolderPickerService must own a QTimer for the dispatch loop")
            self.assertTrue(svc._timer.isActive(),
                            "FolderPickerService timer must start active so the dispatch loop polls")
            # 150 ms cadence matches the pick-folder Flask handler's
            # expectation that the GUI side is responsive enough to
            # service a request within the 120 s overall timeout.
            self.assertEqual(svc._timer.interval(), 150,
                             "FolderPickerService timer cadence must be 150 ms")
        finally:
            svc._timer.stop()
            svc.deleteLater()

    def test_folder_picker_tick_no_pending_request_is_noop(self):
        # Empty queue must not raise and must not emit any response.
        svc = ad.FolderPickerService()
        try:
            # Verify queue is empty.
            self.assertTrue(ad._folder_pick_q.empty())
            # Direct tick call — no request enqueued, must return cleanly.
            svc._tick()
            # Queue still empty; no side effects.
            self.assertTrue(ad._folder_pick_q.empty())
        finally:
            svc._timer.stop()
            svc.deleteLater()

    def test_folder_picker_tick_returns_accepted_path(self):
        # Mock QFileDialog so .exec() returns Accepted + selectedFiles
        # without actually opening a dialog. The patch targets the
        # bound name in ad's namespace so the FolderPickerService
        # picks up the fake.
        import queue
        response_q = queue.Queue(maxsize=1)
        ad._folder_pick_q.put({'initial': '', 'response': response_q})

        from PyQt6.QtWidgets import QFileDialog as RealQFileDialog
        fake_dialog = mock.MagicMock()
        fake_dialog.exec.return_value = RealQFileDialog.DialogCode.Accepted
        fake_dialog.selectedFiles.return_value = ['/tmp/picked-folder']
        fake_dialog.windowFlags.return_value = 0
        with mock.patch.object(ad, 'QFileDialog', autospec=False) as FakeFileDialog:
            FakeFileDialog.return_value = fake_dialog
            # Re-export the DialogCode/FileMode enums the real class
            # carried so the source code's qualified-name references
            # still resolve.
            FakeFileDialog.DialogCode = RealQFileDialog.DialogCode
            FakeFileDialog.FileMode = RealQFileDialog.FileMode
            FakeFileDialog.Option = RealQFileDialog.Option
            svc = ad.FolderPickerService()
            try:
                svc._tick()
            finally:
                svc._timer.stop()
                svc.deleteLater()

        result = response_q.get(timeout=1.0)
        self.assertEqual(result.get('path'), '/tmp/picked-folder',
                         "Accepted dialog must enqueue the chosen path")
        self.assertFalse(result.get('cancelled'),
                         "Accepted dialog must report cancelled=False")

    def test_folder_picker_tick_returns_cancelled_on_reject(self):
        import queue
        response_q = queue.Queue(maxsize=1)
        ad._folder_pick_q.put({'initial': '', 'response': response_q})

        from PyQt6.QtWidgets import QFileDialog as RealQFileDialog
        fake_dialog = mock.MagicMock()
        fake_dialog.exec.return_value = RealQFileDialog.DialogCode.Rejected
        fake_dialog.windowFlags.return_value = 0
        with mock.patch.object(ad, 'QFileDialog', autospec=False) as FakeFileDialog:
            FakeFileDialog.return_value = fake_dialog
            FakeFileDialog.DialogCode = RealQFileDialog.DialogCode
            FakeFileDialog.FileMode = RealQFileDialog.FileMode
            FakeFileDialog.Option = RealQFileDialog.Option
            svc = ad.FolderPickerService()
            try:
                svc._tick()
            finally:
                svc._timer.stop()
                svc.deleteLater()

        result = response_q.get(timeout=1.0)
        self.assertIsNone(result.get('path'),
                          "Rejected dialog must enqueue path=None")
        self.assertTrue(result.get('cancelled'),
                        "Rejected dialog must report cancelled=True")

    def test_folder_picker_nested_timer_tick_does_not_stack_second_dialog(self):
        # dialog.exec() spins a nested Qt event loop that keeps delivering
        # the 150 ms QTimer. Before the _dialog_open guard, a /pick-folder
        # request arriving mid-exec was drained by the re-entrant tick and
        # opened a second native dialog stacked on the first. The nested
        # tick must now no-op, leaving the request queued for the first
        # tick after the open dialog closes.
        import queue as queue_mod
        response_a = queue_mod.Queue(maxsize=1)
        response_b = queue_mod.Queue(maxsize=1)
        ad._folder_pick_q.put({'initial': '', 'response': response_a})

        from PyQt6.QtWidgets import QFileDialog as RealQFileDialog
        created = []
        svc_ref = {}

        def fake_dialog(*_args, **_kwargs):
            dialog = mock.MagicMock()
            created.append(dialog)

            def nested_exec():
                if len(created) == 1:
                    # Simulate a second /pick-folder arriving and the QTimer
                    # firing inside the first dialog's nested event loop.
                    ad._folder_pick_q.put({'initial': '', 'response': response_b})
                    svc_ref['svc']._tick()
                return RealQFileDialog.DialogCode.Rejected

            dialog.exec.side_effect = nested_exec
            dialog.windowFlags.return_value = 0
            dialog.selectedFiles.return_value = []
            return dialog

        with mock.patch.object(ad, 'QFileDialog', autospec=False) as FakeFileDialog:
            FakeFileDialog.side_effect = fake_dialog
            FakeFileDialog.DialogCode = RealQFileDialog.DialogCode
            FakeFileDialog.FileMode = RealQFileDialog.FileMode
            FakeFileDialog.Option = RealQFileDialog.Option
            svc = ad.FolderPickerService()
            svc_ref['svc'] = svc
            try:
                svc._tick()
                self.assertEqual(len(created), 1,
                                 "the re-entrant tick must not stack a second dialog")
                result_a = response_a.get(timeout=1.0)
                self.assertTrue(result_a.get('cancelled'))
                # The second request stayed queued (not dropped, not answered)
                # and is serviced sequentially by the next tick.
                self.assertTrue(response_b.empty())
                self.assertFalse(ad._folder_pick_q.empty())
                svc._tick()
                self.assertEqual(len(created), 2)
                result_b = response_b.get(timeout=1.0)
                self.assertTrue(result_b.get('cancelled'))
            finally:
                svc._timer.stop()
                svc.deleteLater()

    def test_folder_picker_watchdog_fires_when_dialog_blocks_past_threshold(self):
        # Mock time.time so the watchdog believes the dialog blocked
        # for (threshold + 5) seconds. write_persistent_log is
        # spied so we can assert the log line shape.
        import queue
        response_q = queue.Queue(maxsize=1)
        ad._folder_pick_q.put({'initial': '/initial/path', 'response': response_q})

        from PyQt6.QtWidgets import QFileDialog as RealQFileDialog
        fake_dialog = mock.MagicMock()
        fake_dialog.exec.return_value = RealQFileDialog.DialogCode.Rejected
        fake_dialog.windowFlags.return_value = 0

        threshold = ad.FolderPickerService.DIALOG_WATCHDOG_THRESHOLD_SECONDS
        # Two ticks of time.time(): start, then end (start + threshold + 5)
        time_seq = iter([1000.0, 1000.0 + threshold + 5])

        log_lines = []
        orig_log = ad.write_persistent_log
        ad.write_persistent_log = lambda msg, path=None: log_lines.append(msg)
        try:
            with mock.patch.object(ad, 'QFileDialog', autospec=False) as FakeFileDialog, \
                 mock.patch.object(ad.time, 'time', side_effect=lambda: next(time_seq)):
                FakeFileDialog.return_value = fake_dialog
                FakeFileDialog.DialogCode = RealQFileDialog.DialogCode
                FakeFileDialog.FileMode = RealQFileDialog.FileMode
                FakeFileDialog.Option = RealQFileDialog.Option
                svc = ad.FolderPickerService()
                try:
                    svc._tick()
                finally:
                    svc._timer.stop()
                    svc.deleteLater()
        finally:
            ad.write_persistent_log = orig_log

        # Drain the response queue (the dialog code still enqueues
        # cancelled=True; the watchdog runs in parallel with the
        # normal completion path).
        response_q.get(timeout=1.0)
        self.assertTrue(
            any("FolderPickerService: dialog blocked for" in line for line in log_lines),
            f"Watchdog must emit the documented log prefix; got {log_lines!r}",
        )
        self.assertTrue(
            any(f"threshold {threshold}s" in line for line in log_lines),
            f"Watchdog log must surface the threshold; got {log_lines!r}",
        )


class UpdateYtdlpEndpointTests(unittest.TestCase):
    """v4.47.0 NF18 — on-demand `yt-dlp -U` via `/update-ytdlp` so a
    user can fix a broken-on-YouTube yt-dlp build without waiting up
    to 24 h for the auto-update throttle (NF26). Endpoint shares the
    `_run_ytdlp_self_update` runner with the auto-update path so a
    successful manual update also stamps the throttle marker and
    invalidates the version cache.
    """

    TOKEN = "u" * 32

    def _client(self, *, in_flight=0, ytdlp_present=True):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        install_dir = Path(temp_dir.name)
        ytdlp_path = install_dir / 'yt-dlp.exe'
        if ytdlp_present:
            ytdlp_path.write_bytes(b'old-ytdlp')
        path_patch = mock.patch.object(ad, 'YTDLP_PATH', ytdlp_path)
        install_patch = mock.patch.object(ad, 'INSTALL_DIR', install_dir)
        path_patch.start()
        install_patch.start()
        self.addCleanup(path_patch.stop)
        self.addCleanup(install_patch.stop)
        config = FakeConfig({"ServerToken": self.TOKEN})

        class _FakeManager:
            downloads = {}
            _lock = threading.Lock()

            def active_count(_self):
                return in_flight

        manager = _FakeManager()
        api = ad.create_api(config, manager, FakeHistory())
        return api.test_client()

    def test_unauthenticated_request_is_rejected(self):
        client = self._client()
        resp = client.post("/update-ytdlp")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("rejected", resp.get_json()["error"])

    def test_missing_ytdlp_returns_503(self):
        client = self._client(ytdlp_present=False)
        resp = client.post("/update-ytdlp", headers={"X-Auth-Token": self.TOKEN})
        self.assertEqual(resp.status_code, 503)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertIn("not installed", body["error"])

    def test_in_flight_downloads_block_update_with_409(self):
        client = self._client(in_flight=2)
        resp = client.post("/update-ytdlp", headers={"X-Auth-Token": self.TOKEN})
        self.assertEqual(resp.status_code, 409)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("inFlight"), 2)
        # Error must explain WHY the update is blocked so the popup
        # can render an actionable status string. The phrase
        # references the atomic-replace race documented in NF26.
        self.assertIn("in flight", body["error"])
        self.assertIn("atomically replaces", body["error"])

    def test_successful_self_update_returns_200_with_version_delta(self):
        client = self._client()
        old_payload = b'old-ytdlp'
        new_payload = b'new-ytdlp'

        def probe(path, timeout=15):
            payload = Path(path).read_bytes() if Path(path).exists() else b''
            return '2026.04.01' if payload == old_payload else ('2026.05.10' if payload == new_payload else '')

        def run_update(args, **_kwargs):
            self.assertEqual(args[1], '--update-to')
            self.assertEqual(args[2], 'nightly@latest')
            Path(args[0]).write_bytes(new_payload)
            return subprocess.CompletedProcess(args=args, returncode=0, stdout='updated', stderr='')

        with mock.patch.object(ad, '_probe_ytdlp_binary', side_effect=probe), \
             mock.patch.object(ad.subprocess, 'run', side_effect=run_update):
            resp = client.post("/update-ytdlp", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("exit_code"), 0)
        self.assertEqual(body.get("version_before"), '2026.04.01')
        self.assertEqual(body.get("version_after"), '2026.05.10')
        self.assertEqual(body.get("rollback_version"), '2026.04.01')
        self.assertEqual(ad.YTDLP_PATH.read_bytes(), new_payload)
        self.assertEqual((ad.INSTALL_DIR / ad.YTDLP_ROLLBACK_FILENAME).read_bytes(), old_payload)
        self.assertEqual(body.get("source"), 'manual')

    def test_nonzero_exit_returns_500_with_stderr(self):
        client = self._client()
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="Update failed: network unreachable",
        )
        with mock.patch.object(ad.subprocess, 'run', return_value=completed), \
             mock.patch.object(ad, '_probe_ytdlp_binary', return_value='2026.04.01'):
            resp = client.post("/update-ytdlp", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("exit_code"), 1)
        self.assertIn("network unreachable", body.get("error"))
        # version_before == version_after on failure (no replacement happened).
        self.assertEqual(body.get("version_before"), body.get("version_after"))

    def test_subprocess_timeout_returns_500_with_timeout_error(self):
        client = self._client()
        with mock.patch.object(
            ad.subprocess, 'run',
            side_effect=subprocess.TimeoutExpired(cmd=['yt-dlp', '-U'], timeout=120),
        ), mock.patch.object(ad, '_probe_ytdlp_binary', return_value='2026.04.01'):
            resp = client.post("/update-ytdlp", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("exit_code"), -1)
        self.assertIn("timed out", body.get("error"))

    def test_cached_version_cannot_bypass_live_binary_probe(self):
        client = self._client()
        with mock.patch.object(ad, '_probe_ytdlp_binary', return_value=''), \
             mock.patch.object(ad, 'get_ytdlp_version', return_value='2026.04.01'), \
             mock.patch.object(ad.subprocess, 'run') as run:
            resp = client.post('/update-ytdlp', headers={'X-Auth-Token': self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.get_json()['error_code'], 'active-version-unverified')
        run.assert_not_called()

    def test_post_activation_failure_restores_verified_backup(self):
        client = self._client()
        old_payload = b'old-ytdlp'
        new_payload = b'new-ytdlp'

        def probe(path, timeout=15):
            candidate = Path(path)
            payload = candidate.read_bytes() if candidate.exists() else b''
            if payload == old_payload:
                return '2026.04.01'
            if payload == new_payload and candidate.name.startswith('.yt-dlp.update.'):
                return '2026.05.10'
            # The same updated bytes fail only after activation at the live path.
            return ''

        def run_update(args, **_kwargs):
            Path(args[0]).write_bytes(new_payload)
            return subprocess.CompletedProcess(args=args, returncode=0, stdout='updated', stderr='')

        with mock.patch.object(ad, '_probe_ytdlp_binary', side_effect=probe), \
             mock.patch.object(ad.subprocess, 'run', side_effect=run_update):
            resp = client.post('/update-ytdlp', headers={'X-Auth-Token': self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body['ok'])
        self.assertTrue(body['rolled_back'])
        self.assertEqual(body['version_after'], '2026.04.01')
        self.assertEqual(body['rollback_version'], '2026.04.01')
        self.assertEqual(ad.YTDLP_PATH.read_bytes(), old_payload)
        state = ad.read_update_recovery_status()['ytDlp']
        self.assertEqual(state['status'], 'rolled-back')
        self.assertEqual(state['activeVersion'], '2026.04.01')

    def test_staged_version_failure_never_replaces_live_binary(self):
        client = self._client()

        def run_update(args, **_kwargs):
            Path(args[0]).write_bytes(b'broken-update')
            return subprocess.CompletedProcess(args=args, returncode=0, stdout='updated', stderr='')

        def probe(path, timeout=15):
            return '2026.04.01' if Path(path).read_bytes() == b'old-ytdlp' else ''

        with mock.patch.object(ad, '_probe_ytdlp_binary', side_effect=probe), \
             mock.patch.object(ad.subprocess, 'run', side_effect=run_update):
            resp = client.post('/update-ytdlp', headers={'X-Auth-Token': self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.get_json()['error_code'], 'staged-version-unverified')
        self.assertEqual(ad.YTDLP_PATH.read_bytes(), b'old-ytdlp')

    def test_shared_runner_returns_structured_dict(self):
        # _run_ytdlp_self_update is the shared subprocess runner used
        # by both the manual endpoint and the background auto-update
        # path. Asserting the exact key set keeps the wire schema
        # stable for the popup consumer.
        self._client()
        config = FakeConfig({"ServerToken": self.TOKEN, "LastYtDlpUpdateCheck": ""})
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="ok", stderr="",
        )
        with mock.patch.object(ad.subprocess, 'run', return_value=completed), \
             mock.patch.object(ad, '_probe_ytdlp_binary', return_value='2026.04.01'), \
             mock.patch.object(ad, 'get_ytdlp_version', return_value='2026.04.01'):
            result = ad._run_ytdlp_self_update(config.data, source_tag='unit-test')

        for required in ('ok', 'exit_code', 'stdout', 'stderr',
                         'version_before', 'version_after', 'source'):
            self.assertIn(required, result,
                          f"_run_ytdlp_self_update result must carry {required!r}")
        self.assertEqual(result['source'], 'unit-test')

    def test_self_update_targets_configured_channel(self):
        # v1.5.5: the updater must switch/track the configured channel via
        # --update-to <channel>@latest instead of the old channel-locked -U.
        self._client()
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout="ok", stderr="")
        captured = {}

        def _capture(args, **kwargs):
            captured['args'] = list(args)
            return completed

        cases = (("nightly", "nightly@latest"), ("stable", "stable@latest"), (None, "nightly@latest"))
        for channel, expected in cases:
            with self.subTest(channel=channel):
                cfg = {"ServerToken": self.TOKEN, "LastYtDlpUpdateCheck": ""}
                if channel is not None:
                    cfg["YtDlpUpdateChannel"] = channel
                with mock.patch.object(ad.subprocess, 'run', side_effect=_capture), \
                        mock.patch.object(ad, '_probe_ytdlp_binary', return_value='2026.04.01'), \
                        mock.patch.object(ad, 'get_ytdlp_version', return_value='2026.04.01'):
                    ad._run_ytdlp_self_update(cfg, source_tag='unit-test')
                self.assertIn('--update-to', captured['args'])
                target = captured['args'][captured['args'].index('--update-to') + 1]
                self.assertEqual(target, expected)
                self.assertNotIn('-U', captured['args'])

    def test_config_defaults_and_clamps_update_channel(self):
        import config as _config
        self.assertEqual(_config.DEFAULT_CONFIG["YtDlpUpdateChannel"], "nightly")
        self.assertEqual(_config.sanitize_config({"YtDlpUpdateChannel": "stable"})["YtDlpUpdateChannel"], "stable")
        self.assertEqual(_config.sanitize_config({"YtDlpUpdateChannel": "bogus"})["YtDlpUpdateChannel"], "nightly")
        self.assertEqual(_config.sanitize_config({})["YtDlpUpdateChannel"], "nightly")

    def test_config_defaults_and_clamps_concurrency_and_retries(self):
        import config as _config
        self.assertEqual(_config.DEFAULT_CONFIG["MaxConcurrentDownloads"], 3)
        self.assertEqual(_config.DEFAULT_CONFIG["DownloadRetries"], 10)
        self.assertEqual(_config.sanitize_config({"MaxConcurrentDownloads": 99})["MaxConcurrentDownloads"], 10)
        self.assertEqual(_config.sanitize_config({"MaxConcurrentDownloads": 0})["MaxConcurrentDownloads"], 1)
        self.assertEqual(_config.sanitize_config({"DownloadRetries": -5})["DownloadRetries"], 0)
        self.assertEqual(_config.sanitize_config({"DownloadRetries": 999})["DownloadRetries"], 50)

    def test_normalize_output_template_allows_safe_and_rejects_unsafe(self):
        import config as _config
        n = _config.normalize_output_template
        # valid
        self.assertEqual(n("%(uploader)s/%(title)s.%(ext)s"), "%(uploader)s/%(title)s.%(ext)s")
        self.assertEqual(n("%(title)s [%(id)s].%(ext)s"), "%(title)s [%(id)s].%(ext)s")
        self.assertEqual(n("%(title)s.%(ext)s".replace("/", "\\")), "%(title)s.%(ext)s")
        # empty -> ""
        self.assertEqual(n(""), "")
        self.assertEqual(n("   "), "")
        # missing %(ext)s -> rejected
        self.assertEqual(n("%(title)s"), "")
        # traversal / absolute -> rejected
        self.assertEqual(n("../%(title)s.%(ext)s"), "")
        self.assertEqual(n("/etc/%(title)s.%(ext)s"), "")
        self.assertEqual(n("C:/x/%(title)s.%(ext)s"), "")
        # non-allowlisted field -> rejected
        self.assertEqual(n("%(filepath)s.%(ext)s"), "")
        self.assertEqual(n("%(title)s.%(ext)s; rm -rf"), "")

    def test_normalize_output_template_rejects_broken_printf_syntax(self):
        # These passed the charset/field checks but made yt-dlp fail EVERY
        # download at startup with an opaque "Invalid output template".
        import config as _config
        n = _config.normalize_output_template
        self.assertEqual(n("%(title/%(ext)s"), "", "unclosed field must be rejected")
        self.assertEqual(n("50% %(title)s.%(ext)s"), "", "stray percent must be rejected")
        self.assertEqual(n("%(title)s.%(ext)"), "", "field without conversion must be rejected")
        # yt-dlp precision/padding conversions stay valid.
        self.assertEqual(n("%(title).200B.%(ext)s"), "%(title).200B.%(ext)s")
        self.assertEqual(n("%%/%(title)s.%(ext)s"), "%%/%(title)s.%(ext)s",
                         "literal %% is valid printf")

    def test_save_settings_flags_invalid_output_template(self):
        # A rejected template must surface as a field error, never a silent
        # "Settings saved." while sanitize blanks it to the default naming.
        import inspect

        gui_module = __import__("gui")
        source = inspect.getsource(gui_module.MainWindowCore._save_settings)
        self.assertIn("normalize_output_template", source)
        self.assertIn("mark_error(\n                self.cfg_outtmpl", source)
        self.assertIn('"OutputTemplate": outtmpl,', source)

    def test_manager_max_concurrent_reads_config(self):
        mgr = ad.DownloadManager(FakeConfig({"MaxConcurrentDownloads": 5}), FakeHistory())
        self.assertEqual(mgr._max_concurrent(), 5)
        self.assertEqual(mgr.capacity()["runningLimit"], 5)
        mgr2 = ad.DownloadManager(FakeConfig({"MaxConcurrentDownloads": 99}), FakeHistory())
        self.assertEqual(mgr2._max_concurrent(), 10, "clamped to the max")
        mgr3 = ad.DownloadManager(FakeConfig(), FakeHistory())
        self.assertEqual(mgr3._max_concurrent(), 3, "defaults to historical MAX_CONCURRENT")


class SabrReadinessTests(unittest.TestCase):
    """SABR support pill: derived by the async readiness probe, refreshed on
    every probe run — never a synchronous yt-dlp probe on the GUI thread."""

    def _window(self):
        calls = []
        win = types.SimpleNamespace(
            _set_readiness=lambda key, text, tone="neutral", tooltip="": calls.append((key, text, tone)),
            _dependencies={'evaluate_sabr_support': lambda v: self._sabr_result},
        )
        return win, calls

    def test_apply_readiness_updates_sabr_from_ytdlp_version(self):
        win, calls = self._window()
        self._sabr_result = "supported"
        ad.MainWindow._apply_readiness(win, {"ytDlp": "2026.07.04", "ffmpeg": "8.1.2"})
        self.assertIn(("sabr", "Supported", "success"), calls)
        calls.clear()
        self._sabr_result = "limited"
        ad.MainWindow._apply_readiness(win, {"ytDlp": "2026.07.04", "ffmpeg": "8.1.2"})
        self.assertIn(("sabr", "Limited", "warning"), calls)

    def test_apply_readiness_survives_a_broken_sabr_evaluator(self):
        win, calls = self._window()
        def boom(_v):
            raise RuntimeError("no")
        win._dependencies['evaluate_sabr_support'] = boom
        ad.MainWindow._apply_readiness(win, {"ytDlp": "2026.07.04", "ffmpeg": "8.1.2"})
        self.assertIn(("sabr", "Limited", "warning"), calls)

    def test_dashboard_build_never_probes_ytdlp_synchronously_for_sabr(self):
        import inspect

        gui_module = __import__("gui")
        source = inspect.getsource(gui_module.MainWindowCore._build_dashboard)
        self.assertNotIn("evaluate_sabr_support", source,
                         "SABR must come from the async readiness probe, not a cold GUI-thread subprocess")


class TrayCompletionNotifyTests(unittest.TestCase):
    """Download-complete tray notification: one-shot, out-of-sight-only,
    toggleable. 'Out of sight' = hidden to tray OR minimized to taskbar —
    both states where the user can't see the queue (the settings label says
    'while minimized')."""

    def _window(self, hidden=True, notify=True, minimized=False):
        msgs = []
        tray = types.SimpleNamespace(showMessage=lambda *a: msgs.append(a))
        win = types.SimpleNamespace(
            config=FakeConfig({"NotifyOnComplete": notify}),
            _seen_complete=set(),
            tray=tray,
            isHidden=lambda: hidden,
            isMinimized=lambda: minimized,
        )
        return win, msgs

    @staticmethod
    def _dl(dl_id, status, title="T"):
        return types.SimpleNamespace(id=dl_id, status=status, title=title)

    def test_notifies_once_per_completion_when_hidden(self):
        win, msgs = self._window(hidden=True)
        dls = [self._dl("a", "complete"), self._dl("b", "downloading")]
        ad.MainWindow._notify_completed_downloads(win, dls)
        ad.MainWindow._notify_completed_downloads(win, dls)  # second tick
        self.assertEqual(len(msgs), 1, "notifies exactly once, not every tick")

    def test_completion_seen_while_visible_never_notifies_later(self):
        win, msgs = self._window(hidden=False)
        dls = [self._dl("a", "complete")]
        ad.MainWindow._notify_completed_downloads(win, dls)
        self.assertEqual(len(msgs), 0)
        win.isHidden = lambda: True
        ad.MainWindow._notify_completed_downloads(win, dls)
        self.assertEqual(len(msgs), 0, "a completion seen while visible must not fire a stale toast")

    def test_toggle_off_suppresses_notification(self):
        win, msgs = self._window(hidden=True, notify=False)
        ad.MainWindow._notify_completed_downloads(win, [self._dl("a", "complete")])
        self.assertEqual(len(msgs), 0)

    def test_taskbar_minimized_window_notifies(self):
        # A minimized-but-not-hidden window (title-bar minimize, no
        # close-to-tray) is the most common "while minimized" state — the
        # user can't see the queue, so the toast must fire.
        win, msgs = self._window(hidden=False, minimized=True)
        ad.MainWindow._notify_completed_downloads(win, [self._dl("a", "complete")])
        self.assertEqual(len(msgs), 1)

    def test_seen_set_is_pruned_to_present_downloads(self):
        win, _ = self._window(hidden=True)
        ad.MainWindow._notify_completed_downloads(win, [self._dl("a", "complete")])
        self.assertIn("a", win._seen_complete)
        ad.MainWindow._notify_completed_downloads(win, [self._dl("b", "downloading")])
        self.assertNotIn("a", win._seen_complete, "reclaimed ids are pruned so the set can't grow")


class CompanionUpdateEndpointTests(unittest.TestCase):
    """v4.47.0 NF6 — on-demand Astra Downloader self-update via /update."""

    TOKEN = "v" * 32

    def _client(self, *, in_flight=0):
        probe_patch = mock.patch.object(ad, 'probe_companion_update_binary', return_value=True)
        probe_patch.start()
        self.addCleanup(probe_patch.stop)
        config = FakeConfig({"ServerToken": self.TOKEN})

        class _FakeManager:
            downloads = {}
            _lock = threading.Lock()

            def __init__(_self):
                # Sequence support: a list yields one value per active_count()
                # call (last value sticky) so tests can model downloads that
                # start during the update's download/verify window.
                _self._in_flight = (
                    list(in_flight) if isinstance(in_flight, (list, tuple))
                    else [in_flight]
                )
                _self.intake_paused = False
                _self.pause_calls = 0
                _self.resume_calls = 0
                _self.persisted_flags = []

            def active_count(_self):
                if len(_self._in_flight) > 1:
                    return _self._in_flight.pop(0)
                return _self._in_flight[0]

            def pause_intake(_self):
                _self.pause_calls += 1
                _self.intake_paused = True
                return True

            def resume_intake(_self):
                _self.resume_calls += 1
                _self.intake_paused = False
                return True

            def persist_intake_flag(_self, paused):
                _self.persisted_flags.append(bool(paused))
                return True

        manager = _FakeManager()
        self._manager = manager
        api = ad.create_api(config, manager, FakeHistory())
        return api.test_client()

    def test_parse_companion_version_source_extracts_app_version(self):
        self.assertEqual(
            ad.parse_companion_version_source('APP_VERSION = "1.2.3"\n'),
            "1.2.3",
        )
        self.assertEqual(ad.parse_companion_version_source("no version"), "")

    class _VersionSourceResponse:
        def __init__(self, chunks, headers=None):
            self._chunks = list(chunks)
            self.headers = headers or {}

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def raise_for_status(self):
            return None

        def iter_content(self, _chunk_size):
            return iter(self._chunks)

    def test_version_source_fetch_is_streamed_and_size_limited(self):
        response = self._VersionSourceResponse([
            b'header\nAPP_VER', b'SION = "9.9.9"\n',
        ])
        with mock.patch.object(ad.http_requests, 'get', return_value=response) as get:
            self.assertEqual(ad.fetch_latest_companion_version(), '9.9.9')
        self.assertTrue(get.call_args.kwargs['stream'])

        oversized = self._VersionSourceResponse([
            b'x' * (ad.COMPANION_VERSION_SOURCE_MAX_BYTES + 1),
        ])
        with mock.patch.object(ad.http_requests, 'get', return_value=oversized):
            with self.assertRaisesRegex(RuntimeError, 'size limit'):
                ad.fetch_latest_companion_version()

    def test_version_source_rejects_oversized_content_length_without_reading(self):
        response = self._VersionSourceResponse(
            [b'APP_VERSION = "9.9.9"\n'],
            headers={
                'content-length': str(ad.COMPANION_VERSION_SOURCE_MAX_BYTES + 1),
            },
        )
        with mock.patch.object(ad.http_requests, 'get', return_value=response):
            with self.assertRaisesRegex(RuntimeError, 'size limit'):
                ad.fetch_latest_companion_version()

    def test_unauthenticated_request_is_rejected(self):
        client = self._client()
        resp = client.post("/update")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("rejected", resp.get_json()["error"])

    def test_in_flight_downloads_block_companion_update_with_409(self):
        client = self._client(in_flight=3)
        resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})
        self.assertEqual(resp.status_code, 409)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("inFlight"), 3)
        self.assertIn("restart", body["error"])
        self.assertIn("atomically replacing", body["error"])

    def test_current_version_returns_200_without_download(self):
        client = self._client()
        with mock.patch.object(ad, 'fetch_latest_companion_version', return_value=ad.APP_VERSION), \
             mock.patch.object(ad, 'download_file_atomic') as download:
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body.get("ok"))
        self.assertFalse(body.get("update_available"))
        self.assertEqual(body.get("status"), "current")
        download.assert_not_called()

    def test_version_check_failure_returns_502(self):
        client = self._client()
        with mock.patch.object(ad, 'fetch_latest_companion_version', side_effect=RuntimeError("offline")):
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 502)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("error_code"), "version-check-failed")
        self.assertIn("Check Astra Downloader logs", body.get("error"))

    def test_concurrent_companion_update_is_rejected_before_network_work(self):
        client = self._client()
        self.assertTrue(ad._COMPANION_UPDATE_LOCK.acquire(blocking=False))
        try:
            with mock.patch.object(ad, 'fetch_latest_companion_version') as fetch:
                resp = client.post('/update', headers={'X-Auth-Token': self.TOKEN})
        finally:
            ad._COMPANION_UPDATE_LOCK.release()

        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.get_json()['error_code'], 'update-in-progress')
        fetch.assert_not_called()

    def test_successful_companion_update_schedules_replace_and_restart(self):
        client = self._client()
        payload = b"MZ" + (b"\0" * ad.COMPANION_UPDATE_MIN_BYTES)
        expected_hash = hashlib.sha256(payload).hexdigest()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(payload)

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected_hash), \
             mock.patch.object(ad, 'schedule_companion_update_restart',
                               return_value={'scheduled': True, 'target': str(Path(tmp) / "AstraDownloader.exe")}) as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit') as exit_later:
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body.get("ok"))
        self.assertTrue(body.get("update_available"))
        self.assertEqual(body.get("status"), "restart_scheduled")
        self.assertEqual(body.get("current_version"), ad.APP_VERSION)
        self.assertEqual(body.get("latest_version"), "9.9.9")
        schedule.assert_called_once()
        exit_later.assert_called_once()

    def test_download_started_during_update_window_aborts_restart_with_409(self):
        # TOCTOU regression: the route checks active_count() once at entry,
        # but the exe download + SHA fetch + staged probe can take minutes.
        # A /download accepted on another waitress thread in that window must
        # abort the restart (os._exit would orphan its yt-dlp tree). The
        # in_flight sequence models exactly that: 0 at route entry, 2 at the
        # pre-restart re-check.
        client = self._client(in_flight=[0, 2])
        payload = self._fake_payload()
        expected_hash = hashlib.sha256(payload).hexdigest()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(payload)

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected_hash), \
             mock.patch.object(ad, 'schedule_companion_update_restart') as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit') as exit_later:
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})
            leftovers = list(Path(tmp).glob("*.exe"))

        self.assertEqual(resp.status_code, 409)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("error_code"), "downloads-in-flight")
        self.assertEqual(body.get("inFlight"), 2)
        self.assertIn("in flight", body.get("error", ""))
        schedule.assert_not_called()
        exit_later.assert_not_called()
        self.assertEqual(leftovers, [], "aborted update must unlink the staged exe")
        # Intake was paused for the update window and resumed on abort.
        self.assertEqual(self._manager.pause_calls, 1)
        self.assertEqual(self._manager.resume_calls, 1)
        self.assertFalse(self._manager.intake_paused)

    def test_update_pauses_intake_and_persists_prior_flag_on_restart(self):
        client = self._client()
        payload = self._fake_payload()
        expected_hash = hashlib.sha256(payload).hexdigest()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(payload)

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected_hash), \
             mock.patch.object(ad, 'schedule_companion_update_restart',
                               return_value={'scheduled': True, 'target': str(Path(tmp) / "AstraDownloader.exe")}), \
             mock.patch.object(ad, 'schedule_companion_process_exit'):
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json().get("status"), "restart_scheduled")
        self.assertEqual(self._manager.pause_calls, 1)
        # The dying process must keep the live pause (nothing may spawn
        # yt-dlp between the re-check and os._exit) ...
        self.assertEqual(self._manager.resume_calls, 0)
        self.assertTrue(self._manager.intake_paused)
        # ... while the relaunched companion gets the user's pre-update flag.
        self.assertEqual(self._manager.persisted_flags, [False])

    def test_failed_update_resumes_intake(self):
        client = self._client()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(b"MZ" + (b"\0" * ad.COMPANION_UPDATE_MIN_BYTES))

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=None):
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        self.assertEqual(self._manager.pause_calls, 1)
        self.assertEqual(self._manager.resume_calls, 1)
        self.assertFalse(self._manager.intake_paused)
        self.assertEqual(self._manager.persisted_flags, [])

    def test_update_does_not_touch_a_user_paused_intake(self):
        client = self._client()
        self._manager.intake_paused = True
        with mock.patch.object(ad, 'fetch_latest_companion_version', return_value=ad.APP_VERSION):
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._manager.pause_calls, 0)
        self.assertEqual(self._manager.resume_calls, 0)
        self.assertTrue(self._manager.intake_paused)

    def test_companion_update_requires_sha256_sidecar(self):
        client = self._client()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(b"MZ" + (b"\0" * ad.COMPANION_UPDATE_MIN_BYTES))

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=None), \
             mock.patch.object(ad, 'schedule_companion_update_restart') as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit') as exit_later:
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertIn("SHA-256 sidecar", body.get("error", ""))
        schedule.assert_not_called()
        exit_later.assert_not_called()

    def test_companion_update_rejects_sha256_mismatch(self):
        """When the SHA-256 sidecar is reachable but doesn't match, the
        update must fail before scheduling a replace."""
        client = self._client()
        fake_hash = "a" * 64

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(b"MZ" + (b"\0" * ad.COMPANION_UPDATE_MIN_BYTES))

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=fake_hash), \
             mock.patch.object(ad, 'schedule_companion_update_restart') as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit') as exit_later:
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body.get("ok"))
        self.assertIn("SHA-256", body.get("error", ""))
        schedule.assert_not_called()
        exit_later.assert_not_called()

    def test_companion_update_rejects_failed_staged_startup_probe(self):
        client = self._client()
        payload = self._fake_payload()
        expected_hash = hashlib.sha256(payload).hexdigest()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(payload)

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value='9.9.9'), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected_hash), \
             mock.patch.object(ad, 'probe_companion_update_binary', return_value=False), \
             mock.patch.object(ad, 'schedule_companion_update_restart') as schedule:
            resp = client.post('/update', headers={'X-Auth-Token': self.TOKEN})

        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.get_json()['error_code'], 'staged-health-check-failed')
        schedule.assert_not_called()

    def test_companion_probe_cli_is_non_gui_and_version_strict(self):
        self.assertEqual(ad.companion_probe_exit_code(['--version']), 0)
        self.assertEqual(
            ad.companion_probe_exit_code(['--update-health-check', ad.APP_VERSION]), 0,
        )
        self.assertEqual(ad.companion_probe_exit_code(['--update-health-check', '9.9.9']), 3)
        self.assertEqual(ad.companion_probe_exit_code(['--update-health-check']), 2)
        self.assertIsNone(ad.companion_probe_exit_code(['--start-server']))

    def test_windowed_build_health_probe_does_not_require_stdout_or_qapplication(self):
        with mock.patch.object(ad.sys, 'argv', ['AstraDownloader.exe', '--update-health-check', ad.APP_VERSION]), \
             mock.patch.object(ad.sys, 'stdout', None), \
             mock.patch.object(ad, 'QApplication') as application:
            ad.main()
        application.assert_not_called()

    def test_windows_update_helper_contains_verified_backup_and_rollback_contract(self):
        payload = self._fake_payload()
        expected_hash = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad.sys, 'platform', 'win32'):
            root = Path(tmp)
            update = root / '.AstraDownloader.update.abc.exe'
            target = root / 'AstraDownloader.exe'
            update.write_bytes(payload)
            target.write_bytes(self._fake_payload(b'B'))
            with mock.patch.object(ad.subprocess, 'Popen') as popen:
                result = ad.schedule_companion_update_restart(
                    update, target, ['--start-server'], pid=123,
                    expected_sha256=expected_hash,
                    expected_version='9.9.9', previous_version=ad.APP_VERSION,
                )
                helper_args = popen.call_args.args[0]
            scripts = list(root.glob('.AstraDownloader.apply-update.*.ps1'))
            self.assertEqual(len(scripts), 1)
            helper_source = scripts[0].read_text(encoding='utf-8')
            if os.name == 'nt':
                escaped_script_path = str(scripts[0]).replace("'", "''")
                parser_command = (
                    "$tokens=$null; $errors=$null; "
                    f"[System.Management.Automation.Language.Parser]::ParseFile('{escaped_script_path}', "
                    "[ref]$tokens, [ref]$errors) | Out-Null; "
                    "if ($errors.Count) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }"
                )
                parsed = subprocess.run(
                    ['powershell', '-NoProfile', '-Command', parser_command],
                    capture_output=True, text=True, timeout=15,
                    creationflags=ad.CREATE_NO_WINDOW,
                )
                self.assertEqual(parsed.returncode, 0, parsed.stderr)

        self.assertTrue(result['scheduled'])
        self.assertEqual(result['rollback_version'], ad.APP_VERSION)
        self.assertIn('Copy-Verified $TargetPath $BackupPath', helper_source)
        self.assertIn("Write-RecoveryState 'rolled-back'", helper_source)
        self.assertIn("'--update-health-check'", helper_source)
        self.assertIn('-WindowStyle Hidden', helper_source)
        self.assertIn('-BackupPath', helper_args)

    def test_update_recovery_health_state_omits_paths_and_digests(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)):
            ad._write_update_state(
                ad._companion_update_state_path(), status='active',
                active_version='9.9.9', rollback_version=ad.APP_VERSION,
                active_sha256='a' * 64, source_path='C:/Users/secret/update.exe',
            )
            public = ad.read_update_recovery_status()['companion']
        self.assertEqual(public['activeVersion'], '9.9.9')
        self.assertEqual(public['rollbackVersion'], ad.APP_VERSION)
        self.assertNotIn('active_sha256', public)
        self.assertNotIn('source_path', public)

    # ── Audit fix: version-skew reinstall-loop guard ──
    # main's APP_VERSION can be bumped before the release asset exists; in
    # that window releases/latest serves the binary already installed. The
    # guard compares the asset digest against the last scheduled update (and
    # the running frozen binary) and refuses to re-schedule a no-op replace.

    @staticmethod
    def _fake_payload(tag=b"A"):
        return b"MZ" + tag + (b"\0" * ad.COMPANION_UPDATE_MIN_BYTES)

    def test_same_asset_as_last_installed_update_is_not_rescheduled(self):
        client = self._client()
        payload = self._fake_payload()
        expected_hash = hashlib.sha256(payload).hexdigest()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(payload)

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected_hash), \
             mock.patch.object(ad, 'schedule_companion_update_restart') as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit') as exit_later:
            # State file says: this exact digest was already installed.
            ad.record_last_installed_update_sha256(expected_hash)
            resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})
            leftovers = list(Path(tmp).glob(".AstraDownloader.update.*.exe"))

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body.get("ok"))
        self.assertFalse(body.get("update_available"),
            "re-serving the already-installed asset must not loop the update")
        self.assertEqual(body.get("status"), "release-pending")
        self.assertEqual(body.get("latest_version"), "9.9.9")
        schedule.assert_not_called()
        exit_later.assert_not_called()
        self.assertEqual(leftovers, [],
            "the downloaded duplicate asset must be deleted")

    def test_asset_matching_running_frozen_binary_is_not_rescheduled(self):
        client = self._client()
        payload = self._fake_payload()
        expected_hash = hashlib.sha256(payload).hexdigest()

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(payload)

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256', return_value=expected_hash), \
             mock.patch.object(ad, 'schedule_companion_update_restart') as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit') as exit_later, \
             mock.patch.object(ad, 'is_frozen_app', return_value=True):
            # Simulate the running frozen exe being byte-identical to the
            # releases/latest asset. No state file exists — the running-binary
            # digest alone must stop the loop.
            running = Path(tmp) / "AstraDownloader.exe"
            running.write_bytes(payload)
            with mock.patch.object(ad, 'current_executable_path', return_value=running):
                resp = client.post("/update", headers={"X-Auth-Token": self.TOKEN})

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body.get("ok"))
        self.assertFalse(body.get("update_available"))
        self.assertEqual(body.get("status"), "release-pending")
        schedule.assert_not_called()
        exit_later.assert_not_called()

    def test_successful_update_records_digest_and_newer_release_installs(self):
        client = self._client()
        payload_a = self._fake_payload(b"A")
        payload_b = self._fake_payload(b"B")
        hash_a = hashlib.sha256(payload_a).hexdigest()
        hash_b = hashlib.sha256(payload_b).hexdigest()
        serving = {'payload': payload_a, 'hash': hash_a}

        def fake_download(_url, path, **_kwargs):
            Path(path).write_bytes(serving['payload'])

        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
             mock.patch.object(ad, 'fetch_latest_companion_version', return_value="9.9.9"), \
             mock.patch.object(ad, 'download_file_atomic', side_effect=fake_download), \
             mock.patch.object(ad, 'fetch_expected_sha256',
                               side_effect=lambda *a, **k: serving['hash']), \
             mock.patch.object(ad, 'schedule_companion_update_restart',
                               return_value={'scheduled': True,
                                             'target': str(Path(tmp) / "AstraDownloader.exe")}) as schedule, \
             mock.patch.object(ad, 'schedule_companion_process_exit'):
            # First cycle: release A installs and its digest gets recorded.
            resp_a = client.post("/update", headers={"X-Auth-Token": self.TOKEN})
            self.assertEqual(resp_a.status_code, 200)
            self.assertTrue(resp_a.get_json().get("update_available"))
            self.assertEqual(schedule.call_count, 1)
            self.assertEqual(ad.read_last_installed_update_sha256(), hash_a,
                "the scheduled update's digest must be persisted")

            # Same release served again: refused (no reinstall loop).
            resp_repeat = client.post("/update", headers={"X-Auth-Token": self.TOKEN})
            self.assertEqual(resp_repeat.get_json().get("status"), "release-pending")
            self.assertEqual(schedule.call_count, 1)

            # A genuinely newer release (different bytes): installs normally.
            serving['payload'], serving['hash'] = payload_b, hash_b
            resp_b = client.post("/update", headers={"X-Auth-Token": self.TOKEN})
            self.assertEqual(resp_b.status_code, 200)
            self.assertTrue(resp_b.get_json().get("update_available"))
            self.assertEqual(schedule.call_count, 2)
            self.assertEqual(ad.read_last_installed_update_sha256(), hash_b)

    def test_update_state_helpers_tolerate_missing_and_garbage_state(self):
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)):
            # No state file yet.
            self.assertIsNone(ad.read_last_installed_update_sha256())
            # Garbage / wrong-shape contents must read as None, not raise.
            state = Path(tmp) / "companion-update-state.json"
            for garbage in (b"not json", b"[]", b'{"sha256": 42}',
                            b'{"sha256": "nothex"}'):
                state.write_bytes(garbage)
                self.assertIsNone(ad.read_last_installed_update_sha256())
            # Round trip normalizes to lowercase hex.
            digest = "A" * 64
            ad.record_last_installed_update_sha256(digest)
            self.assertEqual(ad.read_last_installed_update_sha256(), "a" * 64)


class NativeMessagingBootstrapTests(unittest.TestCase):
    """Token bootstrap over the browser-pinned native-messaging stdio channel."""

    def test_message_framing_round_trips(self):
        buf = io.BytesIO()
        ad.write_native_message(buf, {"type": "get-token", "n": 1})
        buf.seek(0)
        self.assertEqual(ad.read_native_message(buf), {"type": "get-token", "n": 1})
        # A second read at EOF returns None (clean pipe close), not an error.
        self.assertIsNone(ad.read_native_message(buf))

    def test_read_rejects_oversized_length_prefix(self):
        buf = io.BytesIO(struct.pack('<I', ad.NATIVE_MESSAGE_MAX_BYTES + 1) + b'{}')
        with self.assertRaises(ValueError):
            ad.read_native_message(buf)

    def test_handler_returns_token_only_for_get_token(self):
        ok = ad.handle_native_bootstrap_request({"type": "get-token"}, "tok-123")
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["token"], "tok-123")
        self.assertEqual(ok["service"], ad.SERVICE_ID)

        ping = ad.handle_native_bootstrap_request({"type": "ping"}, "tok-123")
        self.assertTrue(ping["ok"])
        self.assertNotIn("token", ping)

    def test_handler_rejects_unknown_and_malformed_requests(self):
        for bad in ({"type": "evil"}, {}, "not-a-dict", 42, None):
            resp = ad.handle_native_bootstrap_request(bad, "tok")
            self.assertFalse(resp["ok"])
            self.assertNotIn("token", resp)

    def test_handler_withholds_token_when_unconfigured(self):
        resp = ad.handle_native_bootstrap_request({"type": "get-token"}, "")
        self.assertFalse(resp["ok"])
        self.assertNotIn("token", resp)

    def test_run_host_serves_then_exits_on_eof(self):
        request = io.BytesIO()
        ad.write_native_message(request, {"type": "get-token"})
        request.seek(0)
        out = io.BytesIO()
        ad.run_native_messaging_host("tok-xyz", stdin=request, stdout=out)
        out.seek(0)
        reply = ad.read_native_message(out)
        self.assertEqual(reply["token"], "tok-xyz")

    def test_argv_gate_matches_only_extension_origins(self):
        self.assertTrue(ad.argv_requests_native_host(["chrome-extension://abc/", "--parent-window=9"]))
        self.assertTrue(ad.argv_requests_native_host(["moz-extension://uuid/"]))
        for normal in (["-Background"], ["--uninstall"], [], ["start"]):
            self.assertFalse(ad.argv_requests_native_host(normal))

    def test_parse_native_extension_ids_dedupes_comma_semicolon_and_lines(self):
        self.assertEqual(
            ad.parse_native_extension_ids(" aaa,bbb; aaa\nccc "),
            ["aaa", "bbb", "ccc"],
        )
        self.assertEqual(ad.parse_native_extension_ids("", fallback=("fallback",)), ["fallback"])

    def test_host_manifest_pins_allowed_extension_origins(self):
        m = ad.build_native_host_manifest("C:/x/AstraDownloader.exe", ["aaa", "bbb"], browser="chrome")
        self.assertEqual(m["name"], ad.NATIVE_HOST_NAME)
        self.assertEqual(m["type"], "stdio")
        self.assertEqual(
            m["allowed_origins"],
            ["chrome-extension://aaa/", "chrome-extension://bbb/"],
        )
        self.assertNotIn("allowed_extensions", m)

    def test_firefox_host_manifest_pins_allowed_extension_ids(self):
        m = ad.build_native_host_manifest(
            "C:/x/AstraDownloader.exe",
            ["ytkit@sysadmindoc.github.io"],
            browser="firefox",
        )
        self.assertEqual(m["name"], ad.NATIVE_HOST_NAME)
        self.assertEqual(m["type"], "stdio")
        self.assertEqual(m["allowed_extensions"], ["ytkit@sysadmindoc.github.io"])
        self.assertNotIn("allowed_origins", m)

    def test_register_native_messaging_hosts_writes_browser_manifests(self):
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(ad, "NATIVE_HOST_DIR", Path(tmp)), \
             mock.patch.object(ad.sys, "platform", "win32"), \
             mock.patch.object(ad, "register_native_host_registry_value") as reg:
            config = FakeConfig({
                "NativeChromeExtensionIds": "chromeaaa",
                "NativeFirefoxExtensionIds": "ytkit@sysadmindoc.github.io",
            })

            ad.register_native_messaging_hosts("C:/AstraDownloader.exe", [], config)

            chrome_manifest = Path(tmp) / f"{ad.NATIVE_HOST_NAME}.chrome.json"
            firefox_manifest = Path(tmp) / f"{ad.NATIVE_HOST_NAME}.firefox.json"
            self.assertTrue(chrome_manifest.exists())
            self.assertTrue(firefox_manifest.exists())
            self.assertEqual(
                json.loads(chrome_manifest.read_text(encoding="utf-8"))["allowed_origins"],
                ["chrome-extension://chromeaaa/"],
            )
            self.assertEqual(
                json.loads(firefox_manifest.read_text(encoding="utf-8"))["allowed_extensions"],
                ["ytkit@sysadmindoc.github.io"],
            )
            registry_keys = [call.args[0] for call in reg.call_args_list]
            self.assertIn(f"Software\\Google\\Chrome\\NativeMessagingHosts\\{ad.NATIVE_HOST_NAME}", registry_keys)
            self.assertIn(f"Software\\Mozilla\\NativeMessagingHosts\\{ad.NATIVE_HOST_NAME}", registry_keys)


class DownloadWorkerRaceGuardTests(unittest.TestCase):
    """Race guards between cancel()/worker teardown and (re)scheduling.

    cancel() can land between _schedule() releasing the manager lock and the
    worker thread's first statement, and retry()/resume_download() can land in
    the millisecond gap where a worker has stamped a terminal status but its
    finally block has not yet discarded the id from _running_ids. Both windows
    previously revived or double-scheduled downloads.
    """

    def _manager(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        manager.pause_intake()  # keep _schedule() from starting real workers
        return manager

    def _reserved_download(self, manager, url="https://www.youtube.com/watch?v=raceguard1"):
        """A download in the post-_schedule() state: queued + slot reserved."""
        dl_id, err = manager.start_download(url)
        self.assertIsNone(err)
        dl = manager.downloads[dl_id]
        with manager._lock:
            dl.status = 'queued'
            manager._running_ids.add(dl_id)
        return dl

    def test_start_download_does_not_race_the_ytdlp_updater(self):
        # Regression: the v1.5.4 'download-initiated' trigger fired BEFORE the
        # download was enqueued, so the updater passed its active_count()==0
        # idle gate and its binary swap raced the yt-dlp.exe this download
        # spawned milliseconds later (file-in-use failure + a wasted full
        # re-download of the release). Initiation must not trigger the
        # updater; the queue-idle hook in _worker_entry covers staleness.
        manager = self._manager()
        calls = []
        manager._dependencies['maybe_auto_update_ytdlp'] = (
            lambda config, active_count_fn: calls.append((config, active_count_fn))
        )
        dl_id, err = manager.start_download("https://www.youtube.com/watch?v=autoupd001")
        self.assertIsNone(err)
        self.assertEqual(calls, [], "initiation must not open the update window while the download is about to spawn")

    def test_worker_entry_triggers_ytdlp_update_at_queue_idle(self):
        import inspect
        import download as download_module

        source = inspect.getsource(download_module.DownloadManagerCore._worker_entry)
        self.assertIn("self.maybe_refresh_ytdlp('queue-idle')", source)
        self.assertIn('if self.active_count() == 0:', source)

    def test_maybe_refresh_ytdlp_is_a_safe_noop_without_the_hook(self):
        manager = self._manager()
        manager._dependencies.pop('maybe_auto_update_ytdlp', None)
        manager.maybe_refresh_ytdlp('test')  # must not raise

    def test_maybe_refresh_ytdlp_swallows_hook_failures(self):
        manager = self._manager()
        def boom(*_a, **_k):
            raise RuntimeError('updater exploded')
        manager._dependencies['maybe_auto_update_ytdlp'] = boom
        manager.maybe_refresh_ytdlp('test')  # a broken updater must never crash a download

    def test_run_download_bails_when_cancel_lands_before_worker_entry(self):
        manager = self._manager()
        dl = self._reserved_download(manager)
        self.assertTrue(manager.cancel(dl.id))
        self.assertEqual(dl.status, 'cancelled')

        manager._run_download(dl)  # the worker thread arrives after cancel()

        self.assertEqual(dl.status, 'cancelled',
                         "a cancelled download must not be revived to 'downloading'")
        self.assertIsNone(dl.process, "no yt-dlp subprocess may be spawned after cancel()")

    def test_launch_workers_releases_slot_for_already_cancelled_download(self):
        manager = self._manager()
        dl = self._reserved_download(manager)
        self.assertTrue(manager.cancel(dl.id))

        started = threading.Event()
        manager._worker_entry = lambda _dl: started.set()
        manager._launch_workers([dl])

        self.assertFalse(started.wait(0.2),
                         "no worker thread may start for a cancelled download")
        self.assertNotIn(dl.id, manager._running_ids,
                         "the reserved slot must be released — no finally block will do it")
        self.assertEqual(dl.status, 'cancelled')

    def test_launch_workers_unlinks_cookie_jar_when_cancel_lands_mid_write(self):
        import importlib
        download_module = importlib.import_module("download")
        manager = self._manager()
        dl_id, err = manager.start_download(
            "https://www.youtube.com/watch?v=raceguard2",
            cookies=[{"name": "SID", "value": "secret", "domain": ".youtube.com"}],
        )
        self.assertIsNone(err)
        dl = manager.downloads[dl_id]
        with manager._lock:
            dl.status = 'queued'
            manager._running_ids.add(dl_id)

        started = threading.Event()
        manager._worker_entry = lambda _dl: started.set()

        with tempfile.TemporaryDirectory() as tmp:
            def fake_write(cookies, jar_path, logger=None):
                Path(jar_path).write_text("jar", encoding="utf-8")
                # cancel() lands while the jar is being written; it cannot
                # unlink a jar it doesn't know about yet.
                self.assertTrue(manager.cancel(dl.id))
                return str(jar_path)

            with mock.patch.object(ad, 'INSTALL_DIR', Path(tmp)), \
                 mock.patch.object(download_module, 'write_cookies_netscape',
                                   side_effect=fake_write):
                manager._launch_workers([dl])

            jar = Path(tmp) / f".cookies.{dl.id}.txt"
            self.assertFalse(jar.exists(),
                             "a jar written after cancel() must be unlinked by the launcher")

        self.assertFalse(started.wait(0.2))
        self.assertIsNone(dl.cookies_file)
        self.assertNotIn(dl.id, manager._running_ids)
        self.assertEqual(dl.status, 'cancelled')

    def test_retry_is_rejected_while_worker_is_finalizing(self):
        manager = self._manager()
        dl = self._reserved_download(manager)
        # Worker stamped a retryable failure but its finally block has not
        # discarded the id from _running_ids yet.
        with manager._lock:
            dl.status = 'failed'
            dl.error_code = 'network-unreachable'

        ok, err = manager.retry(dl.id)
        self.assertFalse(ok)
        self.assertIn('still finalizing', err)
        self.assertEqual(dl.status, 'failed', "the finalizing item must not flip to pending")

        # Once the worker's finally block releases the slot, retry succeeds.
        with manager._lock:
            manager._running_ids.discard(dl.id)
        ok, err = manager.retry(dl.id)
        self.assertTrue(ok, err)
        self.assertEqual(dl.status, 'pending')

    def test_resume_is_rejected_while_worker_is_finalizing(self):
        manager = self._manager()
        dl = self._reserved_download(manager)
        with manager._lock:
            dl.status = 'pending'

        ok, err = manager.resume_download(dl.id)
        self.assertFalse(ok)
        self.assertIn('still finalizing', err)

        with manager._lock:
            manager._running_ids.discard(dl.id)
        ok, err = manager.resume_download(dl.id)
        self.assertTrue(ok, err)

    def test_retry_and_resume_routes_surface_409_download_finalizing(self):
        token = "z" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        manager.pause_intake()
        dl_id, err = manager.start_download("https://www.youtube.com/watch?v=raceguard3")
        self.assertIsNone(err)
        dl = manager.downloads[dl_id]
        with manager._lock:
            dl.status = 'failed'
            dl.error_code = 'network-unreachable'
            manager._running_ids.add(dl_id)
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()
        headers = {"X-Auth-Token": token}

        resp = client.post(f"/queue/{dl_id}/retry", json={}, headers=headers)
        self.assertEqual(resp.status_code, 409)
        body = resp.get_json()
        self.assertEqual(body["code"], "download-finalizing")
        self.assertIn("still finalizing", body["error"])

        with manager._lock:
            dl.status = 'pending'
        resp = client.post(f"/queue/{dl_id}/resume", json={}, headers=headers)
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.get_json()["code"], "download-finalizing")

    def test_persist_intake_flag_writes_flag_without_changing_live_pause(self):
        # Companion self-update support: persist the pre-update flag for the
        # relaunched process while the dying process stays paused.
        with tempfile.TemporaryDirectory() as tmp:
            queue_path = Path(tmp) / 'download-queue.json'
            config = FakeConfig({'DownloadPath': tmp, 'AudioDownloadPath': tmp})
            manager = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertTrue(manager.pause_intake())

            self.assertTrue(manager.persist_intake_flag(False))
            self.assertTrue(manager.intake_paused, "the live pause must be untouched")

            restored = ad.DownloadManager(config, FakeHistory(), queue_path=queue_path)
            self.assertFalse(restored.intake_paused,
                             "the relaunched manager must see the persisted flag")


if __name__ == "__main__":
    unittest.main()
