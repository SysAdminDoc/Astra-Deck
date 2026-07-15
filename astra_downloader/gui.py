"""PyQt presentation helpers and lazy legacy GUI compatibility boundary."""

import os
import json
import queue
import socket
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from PyQt6.QtCore import (
    QEasingCurve, QObject, QPropertyAnimation, QSize, QThread, QTimer, Qt,
    pyqtSignal,
)
from PyQt6.QtGui import QIcon, QTextCursor
from PyQt6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QDialog, QDialogButtonBox, QFileDialog,
    QFrame, QGraphicsOpacityEffect, QHBoxLayout, QLabel, QLineEdit, QMainWindow,
    QMenu, QProgressBar, QPushButton, QScrollArea, QSizePolicy, QSpinBox, QStyle,
    QSystemTrayIcon, QTabWidget, QTextEdit, QVBoxLayout, QWidget,
)

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver


__all__ = (
    "MainWindow", "SetupWorker", "FolderPickerService", "repolish",
    "make_label", "make_section_label", "make_divider", "make_card",
    "make_stat", "make_empty_state", "STYLESHEET", "_folder_pick_q",
    "run_uninstall", "is_safe_install_dir_for_removal",
    "spawn_delayed_install_dir_removal", "check_single_instance", "main",
    "make_status_badge", "download_status_tone", "human_status",
    "format_duration",
    "ReadinessProbe",
    "SetupWorkerCore",
    "MainWindowCore",
)


def repolish(widget):
    widget.style().unpolish(widget)
    widget.style().polish(widget)
    widget.update()


def make_label(text, class_name=None, word_wrap=False):
    label = QLabel(text)
    if class_name:
        label.setProperty("class", class_name)
    label.setWordWrap(word_wrap)
    return label


def make_section_label(text):
    return make_label(text, "section")


def make_divider():
    divider = QFrame()
    divider.setProperty("class", "divider")
    return divider


def make_card(class_name="card"):
    frame = QFrame()
    frame.setProperty("class", class_name)
    return frame


def make_status_badge(text, tone="neutral"):
    badge = QLabel(text)
    badge.setProperty("class", "badge")
    badge.setProperty("tone", tone)
    badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
    badge.setMinimumHeight(22)
    return badge


def download_status_tone(status):
    if status == "complete":
        return "success"
    if status in ("failed", "cancelled"):
        return "danger"
    if status in ("merging", "extracting", "queued", "paused", "needs-auth"):
        return "warning"
    if status == "downloading":
        return "info"
    return "neutral"


def human_status(status):
    return {
        "queued": "Queued",
        "pending": "Pending",
        "paused": "Paused",
        "needs-auth": "Needs sign-in",
        "downloading": "Downloading",
        "merging": "Merging",
        "extracting": "Extracting",
        "complete": "Complete",
        "failed": "Failed",
        "cancelled": "Cancelled",
    }.get(status, str(status).title())


def format_duration(seconds):
    try:
        seconds = int(seconds or 0)
    except (TypeError, ValueError):
        return ""
    if seconds <= 0:
        return ""
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def make_empty_state(title, body, action_text=None, action=None):
    frame = make_card("empty")
    layout = QVBoxLayout(frame)
    layout.setContentsMargins(18, 18, 18, 18)
    layout.setSpacing(6)
    layout.addWidget(make_section_label("Ready when you are"))
    layout.addWidget(make_label(title, "emptyTitle"))
    layout.addWidget(make_label(body, "emptyBody", word_wrap=True))
    if action_text and callable(action):
        button = QPushButton(action_text)
        button.setProperty("class", "secondary")
        button.setAccessibleName(action_text)
        button.setCursor(Qt.CursorShape.PointingHandCursor)
        button.clicked.connect(action)
        layout.addSpacing(6)
        layout.addWidget(button, 0, Qt.AlignmentFlag.AlignLeft)
    return frame


def make_stat(label_text, value_text="0", hint_text=""):
    frame = QFrame()
    frame.setProperty("class", "stat")
    layout = QVBoxLayout(frame)
    layout.setContentsMargins(16, 14, 16, 14)
    layout.setSpacing(4)
    label = make_label(label_text, "section")
    value = QLabel(value_text)
    value.setAlignment(Qt.AlignmentFlag.AlignLeft)
    value.setStyleSheet("font-size: 25px; font-weight: 750; color: #f8fafc;")
    value.setObjectName(f"stat_{label_text.lower()}")
    layout.addWidget(label)
    layout.addWidget(value)
    if hint_text:
        layout.addWidget(make_label(hint_text, "fieldHint"))
    return frame, value


class ReadinessProbe(QObject):
    """Collect injected toolchain health away from the GUI thread."""

    completed = pyqtSignal(dict)

    def __init__(self, configured_runtime='auto', *, runtime_probe,
                 provider_probe, ytdlp_version, ffmpeg_version, logger):
        super().__init__()
        self.configured_runtime = configured_runtime
        self._runtime_probe = runtime_probe
        self._provider_probe = provider_probe
        self._ytdlp_version = ytdlp_version
        self._ffmpeg_version = ffmpeg_version
        self._logger = logger

    def run(self):
        try:
            runtime = self._runtime_probe(configured_runtime=self.configured_runtime)
            provider = self._provider_probe()
            payload = {
                "ytDlp": self._ytdlp_version() or "",
                "ffmpeg": self._ffmpeg_version() or "",
                "runtime": runtime or {},
                "deno": runtime or {},
                "provider": provider or {},
            }
        except Exception as error:
            self._logger(f"Readiness probe failed: {error}")
            payload = {"error": str(error)}
        self.completed.emit(payload)


class FolderPickerService(QObject):
    """Bridge HTTP folder requests onto the Qt GUI thread."""

    DIALOG_WATCHDOG_THRESHOLD_SECONDS = 60

    def __init__(self, *, request_queue, dialog_factory=None, dialog_types=None,
                 clock=time.time, logger=None, parent=None):
        super().__init__(parent)
        self._request_queue = request_queue
        self._dialog_factory = dialog_factory or QFileDialog
        self._dialog_types = dialog_types or (lambda: QFileDialog)
        self._clock = clock
        self._logger = logger or (lambda _message: None)
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(150)

    def _tick(self):
        try:
            request = self._request_queue.get_nowait()
        except queue.Empty:
            return
        response_queue = request['response']
        try:
            initial = request.get('initial') or str(Path.home() / "Videos")
            dialog_class = self._dialog_types()
            dialog = self._dialog_factory(None, "Choose download folder", initial)
            dialog.setFileMode(dialog_class.FileMode.Directory)
            dialog.setOption(dialog_class.Option.ShowDirsOnly, True)
            dialog.setOption(dialog_class.Option.DontResolveSymlinks, True)
            dialog.setWindowFlags(dialog.windowFlags() | Qt.WindowType.WindowStaysOnTopHint)
            dialog.activateWindow()
            dialog.raise_()
            started_at = self._clock()
            result = dialog.exec()
            elapsed = self._clock() - started_at
            if elapsed > self.DIALOG_WATCHDOG_THRESHOLD_SECONDS:
                self._logger(
                    f"FolderPickerService: dialog blocked for {elapsed:.1f}s "
                    f"(threshold {self.DIALOG_WATCHDOG_THRESHOLD_SECONDS}s; "
                    f"initial='{initial}'). Possible Qt event-loop or file-system hang."
                )
            if result == dialog_class.DialogCode.Accepted:
                paths = dialog.selectedFiles()
                response_queue.put({
                    'path': paths[0] if paths else None,
                    'cancelled': not bool(paths),
                })
            else:
                response_queue.put({'path': None, 'cancelled': True})
        except Exception:
            self._logger("FolderPickerService failed")
            response_queue.put({
                'error': 'Folder picker failed. Check Astra Downloader logs for details.'
            })


_REQUIRED_SETUP_DEPENDENCIES = frozenset({
    'DEFAULT_CONFIG',
    'FFMPEG_PATH',
    'FFMPEG_SHA256_URL',
    'FFMPEG_URL',
    'HELPER_DOWNLOAD_MAX_BYTES',
    'ICON_PATH',
    'ICON_URL',
    'INSTALL_DIR',
    'YTDLP_PATH',
    'YTDLP_SHA256_ASSET',
    'YTDLP_SHA256_URL',
    'YTDLP_URL',
    '_set_integrations_stamp',
    'download_file_atomic',
    'extract_archive_executable_atomic',
    'fetch_expected_sha256',
    'get_ytdlp_version',
    'http_get',
    'launch_command_parts',
    'log_crash',
    'probe_javascript_runtime',
    'provision_deno',
    'register_desktop_shortcut',
    'register_protocol_handlers',
    'register_startup_task',
    'register_uninstall_entry',
    'run_ytdlp_self_update',
    'verify_file_sha256',
    'write_persistent_log',
    'ytdlp_needs_external_runtime',
})


class SetupWorkerCore(QThread):
    log = pyqtSignal(str)
    progress = pyqtSignal(int)
    finished_ok = pyqtSignal()
    finished_err = pyqtSignal(str)

    def __init__(self, parent=None, force_ffmpeg=False, auto_update_ytdlp=True,
                 configured_runtime='auto', config=None, *, dependencies):
        missing = sorted(set(_REQUIRED_SETUP_DEPENDENCIES) - set(dependencies))
        if missing:
            raise ValueError("Missing setup worker dependencies: " + ", ".join(missing))
        super().__init__(parent)
        self._dependencies = dict(dependencies)
        self.force_ffmpeg = bool(force_ffmpeg)
        self.auto_update_ytdlp = bool(auto_update_ytdlp)
        self.configured_runtime = configured_runtime
        self.config = config if config is not None else {}

    def _value(self, name):
        value = self._dependencies[name]
        return value() if callable(value) else value

    def _ranged_progress_cb(self, low, high):
        """Return a progress callback that maps bytes into [low, high]% of overall.

        We can only report a bounded range because the setup flow has many
        steps; the callback closes over the ffmpeg zip's download bounds and
        emits integers so the Qt signal connection stays cheap.
        """
        def cb(downloaded, total):
            if total and total > 0:
                pct = low + ((high - low) * downloaded / total)
                self.progress.emit(int(max(low, min(high, pct))))
        return cb

    def _verify_required_checksum(self, path, sidecar_url, asset_name=None, label=""):
        """Fetch the SHA-256 sidecar and verify before trusting a helper exe."""
        label = label or Path(path).name
        expected = self._dependencies['fetch_expected_sha256'](sidecar_url, target_asset=asset_name)
        if not expected:
            message = (
                f"{label} SHA-256 sidecar missing or malformed; "
                "refusing to trust the downloaded helper."
            )
            self.log.emit(f"  {message}")
            self._dependencies['write_persistent_log'](f"{message} ({sidecar_url})")
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
            raise RuntimeError(message)
        try:
            self._dependencies['verify_file_sha256'](path, expected)
        except RuntimeError as e:
            # Mismatch: nuke the downloaded file so the next retry re-fetches
            # from scratch instead of trusting a poisoned copy on disk.
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
            raise
        self.log.emit(f"  {label} checksum OK")
        return True

    def run(self):
        try:
            self._value('INSTALL_DIR').mkdir(parents=True, exist_ok=True)
            dl_path = Path(self._value('DEFAULT_CONFIG')["DownloadPath"])
            dl_path.mkdir(parents=True, exist_ok=True)

            # yt-dlp (10-30% of overall progress)
            if not self._value('YTDLP_PATH').exists():
                self.log.emit("Downloading yt-dlp...")
                self.progress.emit(10)
                self._dependencies['download_file_atomic'](
                    self._value('YTDLP_URL'), self._value('YTDLP_PATH'), timeout=60, chunk_size=65536,
                    progress_cb=self._ranged_progress_cb(10, 28),
                )
                # Verify against the release SHA-256 sidecar before trusting
                # the binary — it'll be executed with user privileges for
                # every download from now on.
                self._verify_required_checksum(
                    self._value('YTDLP_PATH'), self._value('YTDLP_SHA256_URL'),
                    asset_name=self._value('YTDLP_SHA256_ASSET'), label="yt-dlp",
                )
                self.log.emit("  Done")
            else:
                self.log.emit("yt-dlp already installed")
            self.progress.emit(30)

            # ffmpeg (35-58% — the heaviest step, now byte-level progress)
            if self.force_ffmpeg or not self._value('FFMPEG_PATH').exists():
                self.log.emit("Downloading ffmpeg (this may take a moment)...")
                self.progress.emit(35)
                tmp_zip = self._value('INSTALL_DIR') / f".ffmpeg.{uuid.uuid4().hex}.zip"
                zip_progress_cb = self._ranged_progress_cb(35, 55)
                try:
                    with self._dependencies['http_get'](self._value('FFMPEG_URL'), stream=True, timeout=120) as r:
                        r.raise_for_status()
                        total = None
                        try:
                            total = int(r.headers.get('content-length', '') or 0) or None
                        except (TypeError, ValueError):
                            total = None
                        # Audit fix: same byte ceiling as self._dependencies['download_file_atomic'] —
                        # a misbehaving CDN must not fill the disk before the
                        # SHA-256 sidecar check. Breach raises; the outer
                        # finally removes the partial tmp_zip.
                        if total and total > self._value('HELPER_DOWNLOAD_MAX_BYTES'):
                            raise RuntimeError(
                                f"ffmpeg archive too large: server advertises {total} "
                                f"bytes (limit {self._value('HELPER_DOWNLOAD_MAX_BYTES')})"
                            )
                        downloaded = 0
                        last_cb = 0.0
                        with open(tmp_zip, 'wb') as data:
                            for chunk in r.iter_content(65536):
                                if chunk:
                                    data.write(chunk)
                                    downloaded += len(chunk)
                                    if downloaded > self._value('HELPER_DOWNLOAD_MAX_BYTES'):
                                        raise RuntimeError(
                                            f"ffmpeg archive exceeded the "
                                            f"{self._value('HELPER_DOWNLOAD_MAX_BYTES')} byte limit; aborted"
                                        )
                                    now = time.monotonic()
                                    if now - last_cb > 0.1:
                                        last_cb = now
                                        zip_progress_cb(downloaded, total)
                            data.flush()
                            os.fsync(data.fileno())
                    if tmp_zip.stat().st_size <= 0:
                        raise RuntimeError("Downloaded ffmpeg archive was empty")
                    # Verify the zip before we crack it open.
                    try:
                        self._verify_required_checksum(
                            tmp_zip, self._value('FFMPEG_SHA256_URL'), label="ffmpeg",
                        )
                    except RuntimeError:
                        # Verification failed — cleanup handled by finally + raise
                        raise
                    self.progress.emit(56)
                    self._dependencies['extract_archive_executable_atomic'](
                        tmp_zip,
                        self._value('FFMPEG_PATH'),
                        'ffmpeg.exe',
                        max_bytes=self._value('HELPER_DOWNLOAD_MAX_BYTES'),
                    )
                    self.log.emit("  Done")
                finally:
                    try:
                        if tmp_zip.exists():
                            tmp_zip.unlink()
                    except Exception:
                        pass
            else:
                self.log.emit("ffmpeg already installed")
            self.progress.emit(55)

            # JavaScript runtime (56-60% — only when yt-dlp needs one).
            ytdlp_ver = self._dependencies['get_ytdlp_version']()
            if self._dependencies['ytdlp_needs_external_runtime'](ytdlp_ver or ''):
                runtime = self._dependencies['probe_javascript_runtime'](
                    force=True, configured_runtime=self.configured_runtime
                )
                if not runtime.get('ejsReady') and runtime.get('canProvisionDeno'):
                    self.log.emit("Downloading Deno runtime...")
                    result = self._dependencies['provision_deno']()
                    if result:
                        self.log.emit("  Done")
                    else:
                        self.log.emit("  Deno download failed (non-critical)")
                elif runtime.get('ejsReady'):
                    label = str(runtime.get('runtime') or 'JavaScript').title()
                    self.log.emit(f"{label} runtime ready: {runtime.get('path')}")
                else:
                    self.log.emit("Configured Node runtime is unavailable or unsupported")
            self.progress.emit(60)

            # Icon
            if not self._value('ICON_PATH').exists():
                self.log.emit("Downloading icon...")
                try:
                    self._dependencies['download_file_atomic'](self._value('ICON_URL'), self._value('ICON_PATH'), timeout=10, chunk_size=65536)
                except Exception as e:
                    # reason: icon is cosmetic; a failure here shouldn't
                    # block the rest of setup. Log so it's debuggable.
                    self._dependencies['write_persistent_log'](f"Icon download skipped: {e}")
            self.progress.emit(70)

            # Desktop shortcut
            self.log.emit("Creating desktop shortcut...")
            self._create_shortcut()
            self.progress.emit(80)

            # Startup task
            self.log.emit("Registering startup task...")
            self._register_startup()
            self.progress.emit(85)

            # Protocol handlers
            self.log.emit("Registering protocol handlers...")
            self._register_protocols()
            self.progress.emit(90)

            # Add/Remove Programs
            self.log.emit("Registering in Apps & Features...")
            self._register_uninstall()
            self.progress.emit(95)

            # Persist the integrations stamp so subsequent launches skip the
            # shortcut/protocol/task re-registration pass (v1.2.0 idempotency).
            self._dependencies['_set_integrations_stamp']()

            # Verify/update yt-dlp through the staged health-check + rollback
            # path. Setup remains successful if this optional maintenance step
            # cannot run; the downloaded helper has already passed its release
            # checksum above.
            if self.auto_update_ytdlp:
                self.log.emit("Updating yt-dlp...")
                try:
                    update = self._dependencies['run_ytdlp_self_update'](
                        self.config, source_tag='setup',
                    )
                except Exception as exc:  # noqa: BLE001
                    self._dependencies['write_persistent_log'](
                        f"Safe yt-dlp update failed during setup: {exc}"
                    )
                    update = {
                        'ok': False,
                        'error': 'The update check failed; the verified installed copy was retained.',
                    }
                if update.get('ok'):
                    version = update.get('version_after') or 'current'
                    self.log.emit(f"  yt-dlp ready: {version}")
                else:
                    message = update.get('error') or 'The active yt-dlp copy was retained.'
                    self.log.emit(f"  Update skipped safely: {message}")

            self.progress.emit(100)
            self.log.emit("\nSetup complete!")
            self.finished_ok.emit()

        except Exception as e:
            self._dependencies['log_crash']("Setup worker")
            self.finished_err.emit(str(e))

    def _create_shortcut(self):
        target, base_args = self._dependencies['launch_command_parts'](prefer_installed=True)
        self._dependencies['register_desktop_shortcut'](target, base_args)

    def _register_startup(self):
        target, base_args = self._dependencies['launch_command_parts'](prefer_installed=True)
        self._dependencies['register_startup_task'](target, base_args)

    def _register_protocols(self):
        target, base_args = self._dependencies['launch_command_parts'](prefer_installed=True)
        self._dependencies['register_protocol_handlers'](target, base_args)

    def _register_uninstall(self):
        target, base_args = self._dependencies['launch_command_parts'](prefer_installed=True)
        self._dependencies['register_uninstall_entry'](target, base_args)

SetupWorker = SetupWorkerCore


_REQUIRED_MAIN_WINDOW_DEPENDENCIES = frozenset({
    'APP_NAME',
    'APP_VERSION',
    'DEFAULT_CONFIG',
    'DOWNLOAD_PENDING_STATES',
    'DOWNLOAD_RETRYABLE_ERROR_CODES',
    'DOWNLOAD_RUNNING_STATES',
    'FFMPEG_PATH',
    'ICON_PATH',
    'INSTALL_DIR',
    'INSTANCE_CONTROL_HOST',
    'INSTANCE_CONTROL_PORT',
    'MODULE_FILE',
    'PORT_FALLBACKS',
    'ReadinessProbe',
    'SERVER_PORT',
    'SetupWorker',
    'YTDLP_PATH',
    '_build_wsgi_server',
    '_ffmpeg_version_probe',
    '_run_ytdlp_self_update',
    'build_diagnostics_bundle',
    'clamp_int',
    'create_api',
    'get_ffmpeg_version',
    'get_recent_log_entries',
    'get_ytdlp_version',
    'maybe_auto_update_ytdlp',
    'normalize_output_dir',
    'normalize_proxy',
    'normalize_rate_limit',
    'normalize_sublangs',
    'reset_deno_runtime_cache',
    'reset_ffmpeg_capabilities_cache',
    'write_persistent_log',
})


class MainWindowCore(QMainWindow):
    log_message = pyqtSignal(str)
    instance_command = pyqtSignal(str)
    tools_update_finished = pyqtSignal(dict)

    def __init__(self, config, dl_manager, history, start_minimized=False, *, dependencies):
        missing = sorted(set(_REQUIRED_MAIN_WINDOW_DEPENDENCIES) - set(dependencies))
        if missing:
            raise ValueError("Missing main window dependencies: " + ", ".join(missing))
        self._dependencies = dict(dependencies)
        super().__init__()
        self.config = config
        self.dl_manager = dl_manager
        self.history_mgr = history
        self._force_exit = False
        self._page_anim = None
        self._setup_running = False
        self._tray_hint_shown = False
        self._cleared_history_snapshot = []
        self._downloads_signature = None
        self.log_message.connect(self._append_log)
        self.instance_command.connect(self._handle_instance_command)
        self.tools_update_finished.connect(self._finish_ytdlp_update)

        self.setWindowTitle(self._value('APP_NAME'))
        self.setMinimumSize(900, 620)
        self.resize(1120, 760)

        # Icon
        display_icon_path = self._value('ICON_PATH')
        source_icon_path = Path(self._value('MODULE_FILE')).resolve().parents[1] / "AstraDownloader.ico"
        if not display_icon_path.exists() and source_icon_path.exists():
            display_icon_path = source_icon_path
        if display_icon_path.exists():
            self.setWindowIcon(QIcon(str(display_icon_path)))

        # Central widget
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Sidebar
        sidebar = QFrame()
        sidebar.setProperty("class", "sidebar")
        sidebar.setFixedWidth(244)
        self.sidebar = sidebar
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)

        # Brand
        brand = QWidget()
        self.brand_widget = brand
        brand_layout = QHBoxLayout(brand)
        brand_layout.setContentsMargins(18, 22, 16, 24)
        brand_layout.setSpacing(11)
        brand_icon = QLabel()
        brand_icon.setFixedSize(36, 36)
        brand_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        if display_icon_path.exists():
            brand_pixmap = QIcon(str(display_icon_path)).pixmap(32, 32)
            if not brand_pixmap.isNull():
                brand_icon.setPixmap(brand_pixmap)
        if brand_icon.pixmap().isNull():
            brand_icon.setText("A")
            brand_icon.setStyleSheet(
                "background:#ff5f4b;color:#180706;border-radius:8px;"
                "font-size:18px;font-weight:800;"
            )
        brand_copy = QVBoxLayout()
        brand_copy.setSpacing(2)
        title_lbl = make_label("ASTRA DOWNLOADER")
        title_lbl.setStyleSheet("font-size: 13px; font-weight: 800; color: #fff8f2; letter-spacing: .7px;")
        ver_lbl = make_label(f"LOCAL COMPANION  ·  v{self._value('APP_VERSION')}", "muted")
        ver_lbl.setStyleSheet("font-size: 9px; color: #737d8b;")
        brand_copy.addWidget(title_lbl)
        brand_copy.addWidget(ver_lbl)
        brand_layout.addWidget(brand_icon)
        brand_layout.addLayout(brand_copy, 1)
        sidebar_layout.addWidget(brand)

        # Nav buttons
        self.nav_buttons = []
        nav_icons = {
            "Dashboard": QStyle.StandardPixmap.SP_ComputerIcon,
            "Downloads": QStyle.StandardPixmap.SP_ArrowDown,
            "History": QStyle.StandardPixmap.SP_FileDialogDetailedView,
            "Settings": QStyle.StandardPixmap.SP_FileDialogInfoView,
        }
        for name in ["Dashboard", "Downloads", "History", "Settings"]:
            btn = QPushButton(name)
            btn.setProperty("class", "nav")
            btn.setCheckable(True)
            btn.setAutoExclusive(True)
            btn.setAccessibleName(f"{name} page")
            btn.setIcon(self.style().standardIcon(nav_icons[name]))
            btn.setIconSize(QSize(15, 15))
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setToolTip(f"Open {name.lower()}")
            btn.clicked.connect(lambda checked, n=name: self._nav_click(n))
            sidebar_layout.addWidget(btn)
            self.nav_buttons.append(btn)

        sidebar_layout.addStretch()

        # Status dot
        status_row = QHBoxLayout()
        status_row.setContentsMargins(22, 0, 18, 20)
        status_row.setSpacing(8)
        self.status_dot = QLabel("\u2022")
        self.status_dot.setStyleSheet("color: #697381; font-size: 20px;")
        self.status_label = make_label("Stopped", "muted")
        self.status_label.setStyleSheet("font-size: 11px; color: #7f8997; font-weight: 650;")
        status_row.addWidget(self.status_dot)
        status_row.addWidget(self.status_label)
        status_row.addStretch()
        sidebar_layout.addLayout(status_row)

        main_layout.addWidget(sidebar)

        # Tab stack
        self.tabs = QTabWidget()
        self.tabs.tabBar().hide()
        self.tabs.setAccessibleName("Companion pages")
        main_layout.addWidget(self.tabs)

        self._build_dashboard()
        self._build_downloads()
        self._build_history()
        self._build_settings()

        self._nav_click("Dashboard")

        # System tray
        self.tray = QSystemTrayIcon(self)
        if self._value('ICON_PATH').exists():
            self.tray.setIcon(QIcon(str(self._value('ICON_PATH'))))
        else:
            self.tray.setIcon(self.style().standardIcon(self.style().StandardPixmap.SP_ComputerIcon))
        tray_menu = QMenu()
        show_action = tray_menu.addAction("Show Astra Downloader")
        show_action.triggered.connect(self._show_from_tray)
        self.tray_startstop = tray_menu.addAction("Stop Server")
        self.tray_startstop.triggered.connect(self._toggle_server)
        folder_action = tray_menu.addAction("Open Downloads Folder")
        folder_action.triggered.connect(self._open_folder)
        tray_menu.addSeparator()
        exit_action = tray_menu.addAction("Quit Astra Downloader")
        exit_action.triggered.connect(self._force_close)
        self.tray.setContextMenu(tray_menu)
        self.tray.activated.connect(self._tray_activated)
        self.tray.setToolTip(f"{self._value('APP_NAME')} - Running")
        self.tray.show()

        # Timer
        self.update_timer = QTimer(self)
        self.update_timer.timeout.connect(self._update_ui)
        self.update_timer.start(500)

        # Cleanup timer (every 60s)
        self.cleanup_timer = QTimer(self)
        self.cleanup_timer.timeout.connect(dl_manager.cleanup_old)
        self.cleanup_timer.start(60000)

        # Connect signals
        dl_manager.progress_updated.connect(self._update_ui)

        # Server state
        self.server_running = False
        self.server_thread = None
        self.server_obj = None
        self.server_start_time = None
        self.readiness_thread = None
        self.readiness_worker = None
        self._instance_command_stop = threading.Event()
        self._instance_command_thread = None
        self._start_instance_command_listener()
        self._start_readiness_probe()

        if start_minimized:
            QTimer.singleShot(100, self._minimize_to_tray)

    def _make_page_header(self, title, subtitle):
        header = QVBoxLayout()
        header.setSpacing(5)
        header.addWidget(make_label(title, "title"))
        header.addWidget(make_label(subtitle, "subtitle", word_wrap=True))
        return header

    def _make_tool_button(self, text, icon, class_name="secondary"):
        btn = QPushButton(text)
        btn.setProperty("class", class_name)
        btn.setIcon(self.style().standardIcon(icon))
        btn.setIconSize(QSize(15, 15))
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setAccessibleName(text)
        return btn

    def _make_readiness_row(self, key, label_text, value_text="Checking"):
        row = QFrame()
        row.setProperty("class", "readinessRow")
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(0, 8, 0, 8)
        row_layout.setSpacing(8)
        dot = make_label("●", "readinessDot")
        dot.setProperty("tone", "neutral")
        dot.setFixedWidth(12)
        row_layout.addWidget(dot)
        row_layout.addWidget(make_label(label_text, "fieldHint"), 1)
        value = make_label(value_text, "readinessValue")
        value.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        row_layout.addWidget(value)
        self.readiness_values[key] = (dot, value)
        return row

    def _set_readiness(self, key, text, tone="neutral"):
        widgets = self.readiness_values.get(key)
        if not widgets:
            return
        dot, value = widgets
        dot.setProperty("tone", tone)
        value.setText(text)
        repolish(dot)

    def _start_readiness_probe(self):
        if self.readiness_thread is not None:
            return
        self.readiness_thread = QThread(self)
        self.readiness_worker = self._dependencies['ReadinessProbe'](self.config.get('JavaScriptRuntime', 'auto'))
        self.readiness_worker.moveToThread(self.readiness_thread)
        self.readiness_thread.started.connect(self.readiness_worker.run)
        self.readiness_worker.completed.connect(self._apply_readiness)
        self.readiness_worker.completed.connect(self.readiness_thread.quit)
        self.readiness_thread.finished.connect(self.readiness_worker.deleteLater)
        self.readiness_thread.finished.connect(self._readiness_probe_finished)
        self.readiness_thread.start()

    def _readiness_probe_finished(self):
        thread = self.readiness_thread
        self.readiness_worker = None
        self.readiness_thread = None
        if thread is not None:
            thread.deleteLater()

    def _apply_readiness(self, payload):
        if payload.get("error"):
            for key in ("ytDlp", "ffmpeg", "deno", "provider"):
                self._set_readiness(key, "Unavailable", "danger")
            return

        yt_dlp = payload.get("ytDlp")
        ffmpeg = payload.get("ffmpeg")
        runtime = payload.get("runtime") or payload.get("deno") or {}
        provider = payload.get("provider") or {}
        self._set_readiness("ytDlp", yt_dlp or "Missing", "success" if yt_dlp else "danger")
        self._set_readiness("ffmpeg", ffmpeg or "Missing", "success" if ffmpeg else "danger")

        runtime_name = str(runtime.get('runtime') or 'JS').title()
        runtime_version = runtime.get("version")
        if runtime.get("supported") and runtime.get('ejsReady'):
            self._set_readiness("deno", f"{runtime_name} {runtime_version or 'ready'}", "success")
        elif runtime.get("installed"):
            self._set_readiness("deno", f"{runtime_name} {runtime_version or 'repair'}", "warning")
        elif runtime.get("ytdlpNeedsRuntime"):
            self._set_readiness("deno", "Required", "danger")
        else:
            self._set_readiness("deno", "Optional", "neutral")

        if provider.get("ok") and provider.get("stale"):
            self._set_readiness("provider", "Update", "warning")
        elif provider.get("ok"):
            self._set_readiness("provider", provider.get("version") or "Ready", "success")
        else:
            self._set_readiness("provider", "Optional", "neutral")


    def _value(self, name):
        value = self._dependencies[name]
        return value() if callable(value) else value

    def _build_dashboard(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(18)

        layout.addLayout(self._make_page_header(
            "Control Center",
            "Run the local Astra Deck download service, monitor activity, and keep the companion ready in the tray."
        ))

        # Server control
        ctrl = make_card()
        ctrl_layout = QVBoxLayout(ctrl)
        ctrl_layout.setContentsMargins(20, 18, 20, 18)
        ctrl_layout.setSpacing(14)

        top = QHBoxLayout()
        top.setSpacing(16)
        left = QVBoxLayout()
        left.setSpacing(5)
        self.dash_status = make_label("Server stopped")
        self.dash_status.setStyleSheet("font-size: 17px; font-weight: 750; color: #f8fafc;")
        self.dash_endpoint = make_label(f"http://127.0.0.1:{self.config.get('ServerPort', self._value('SERVER_PORT'))}", "secondary")
        self.dash_endpoint.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.dash_hint = make_label("Local-only API. Requests require your private Astra token.", "fieldHint", word_wrap=True)
        left.addWidget(self.dash_status)
        left.addWidget(self.dash_endpoint)
        left.addWidget(self.dash_hint)
        top.addLayout(left, 1)
        self.server_badge = make_status_badge("Stopped", "neutral")
        top.addWidget(self.server_badge, 0, Qt.AlignmentFlag.AlignTop)
        ctrl_layout.addLayout(top)

        actions = QHBoxLayout()
        actions.setSpacing(10)
        self.btn_startstop = self._make_tool_button("Start Server", QStyle.StandardPixmap.SP_MediaPlay, "primary")
        self.btn_startstop.clicked.connect(self._toggle_server)
        actions.addWidget(self.btn_startstop)
        btn_copy = self._make_tool_button("Copy URL", QStyle.StandardPixmap.SP_FileDialogContentsView)
        btn_copy.clicked.connect(self._copy_endpoint)
        actions.addWidget(btn_copy)
        btn_folder = self._make_tool_button("Open Folder", QStyle.StandardPixmap.SP_DirOpenIcon)
        btn_folder.clicked.connect(self._open_folder)
        actions.addWidget(btn_folder)
        actions.addStretch()
        ctrl_layout.addLayout(actions)

        self.setup_status = make_label("", "fieldHint")
        self.setup_status.hide()
        self.setup_progress = QProgressBar()
        self.setup_progress.setRange(0, 100)
        self.setup_progress.setValue(0)
        self.setup_progress.setTextVisible(False)
        self.setup_progress.hide()
        ctrl_layout.addWidget(self.setup_status)
        ctrl_layout.addWidget(self.setup_progress)
        self.readiness_values = {}
        readiness = make_card("readiness")
        readiness_layout = QVBoxLayout(readiness)
        readiness_layout.setContentsMargins(17, 15, 17, 15)
        readiness_layout.setSpacing(1)
        readiness_header = QHBoxLayout()
        readiness_header.addWidget(make_section_label("System pulse"))
        readiness_header.addStretch()
        readiness_header.addWidget(make_status_badge("Local", "neutral"))
        readiness_layout.addLayout(readiness_header)
        readiness_layout.addWidget(self._make_readiness_row("server", "Local API", "Stopped"))
        readiness_layout.addWidget(self._make_readiness_row("ytDlp", "yt-dlp"))
        readiness_layout.addWidget(self._make_readiness_row("ffmpeg", "FFmpeg"))
        readiness_layout.addWidget(self._make_readiness_row("deno", "JavaScript runtime"))
        readiness_layout.addWidget(self._make_readiness_row("provider", "PO provider"))
        readiness_layout.addWidget(self._make_readiness_row("sabr", "SABR", "Limited"))
        self._set_readiness("sabr", "Limited", "warning")

        hero = QHBoxLayout()
        hero.setSpacing(12)
        hero.addWidget(ctrl, 3)
        hero.addWidget(readiness, 2)
        layout.addLayout(hero)

        # Stats — keep refs to frames (else Python GC deletes the underlying Qt objects)
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(10)
        self._stat_frame_active, self.stat_active = make_stat("Active", "0", "In progress")
        self.stat_active.setStyleSheet("font-size: 25px; font-weight: 750; color: #ff7c68;")
        self._stat_frame_completed, self.stat_completed = make_stat("Completed", "0", "This session")
        self._stat_frame_uptime, self.stat_uptime = make_stat("Uptime", "--", "Since launch")
        self._stat_frame_port, self.stat_port = make_stat("Port", str(self.config.get("ServerPort", self._value('SERVER_PORT'))), "Local API")
        for frame in (self._stat_frame_active, self._stat_frame_completed,
                      self._stat_frame_uptime, self._stat_frame_port):
            stats_layout.addWidget(frame)
        layout.addLayout(stats_layout)

        log_header = QHBoxLayout()
        log_header.addWidget(make_section_label("Server log"))
        log_header.addStretch()
        btn_clear_log = self._make_tool_button("Clear Log", QStyle.StandardPixmap.SP_DialogResetButton, "ghost")
        btn_clear_log.clicked.connect(self._clear_log)
        log_header.addWidget(btn_clear_log)
        btn_diag = self._make_tool_button("Review Diagnostics", QStyle.StandardPixmap.SP_FileDialogContentsView, "ghost")
        btn_diag.setToolTip("Review the redacted support payload before copying it.")
        btn_diag.clicked.connect(self._copy_diagnostics)
        log_header.addWidget(btn_diag)
        log_header.addWidget(make_status_badge("Local only", "neutral"))
        layout.addLayout(log_header)
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setMinimumHeight(180)
        self.log_text.document().setMaximumBlockCount(300)
        self.log_text.setPlainText("Ready.")
        layout.addWidget(self.log_text, 1)

        self.tabs.addTab(page, "Dashboard")

    def _build_downloads(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(16)
        header = QHBoxLayout()
        header.addLayout(self._make_page_header(
            "Downloads",
            "A restart-safe queue with three concurrent jobs, controlled recovery, and clear failure guidance."
        ), 1)
        self.queue_capacity_badge = make_status_badge("0 / 200", "neutral")
        self.queue_capacity_badge.setToolTip("Running and pending downloads stored in the durable queue.")
        header.addWidget(self.queue_capacity_badge, 0, Qt.AlignmentFlag.AlignTop)
        self.btn_queue_pause = self._make_tool_button(
            "Pause Intake", QStyle.StandardPixmap.SP_MediaPause, "ghost"
        )
        self.btn_queue_pause.setToolTip(
            "Pause starting pending downloads. Downloads already running will continue."
        )
        self.btn_queue_pause.clicked.connect(self._toggle_queue_intake)
        header.addWidget(self.btn_queue_pause, 0, Qt.AlignmentFlag.AlignTop)
        layout.addLayout(header)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        self.downloads_list_layout = QVBoxLayout(content)
        self.downloads_list_layout.setContentsMargins(0, 0, 0, 0)
        self.downloads_list_layout.setSpacing(10)
        scroll.setWidget(content)
        layout.addWidget(scroll, 1)
        self.tabs.addTab(page, "Downloads")

    def _build_history(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(16)
        header = QHBoxLayout()
        header.addLayout(self._make_page_header(
            "History",
            "The latest completed downloads are kept here for quick confirmation."
        ), 1)
        self.btn_clear_history = self._make_tool_button("Clear History", QStyle.StandardPixmap.SP_TrashIcon, "danger")
        self.btn_clear_history.setToolTip("Remove saved history entries. Downloaded files are not deleted.")
        self.btn_clear_history.clicked.connect(self._clear_history)
        header.addWidget(self.btn_clear_history, 0, Qt.AlignmentFlag.AlignTop)
        self.btn_undo_clear_history = self._make_tool_button("Undo Clear", QStyle.StandardPixmap.SP_ArrowBack, "ghost")
        self.btn_undo_clear_history.setToolTip("Restore the history entries cleared in this session.")
        self.btn_undo_clear_history.clicked.connect(self._undo_clear_history)
        self.btn_undo_clear_history.hide()
        header.addWidget(self.btn_undo_clear_history, 0, Qt.AlignmentFlag.AlignTop)
        layout.addLayout(header)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        self.history_container = QVBoxLayout(content)
        self.history_container.setContentsMargins(0, 0, 0, 0)
        self.history_container.setSpacing(10)
        scroll.setWidget(content)
        layout.addWidget(scroll, 1)
        self.tabs.addTab(page, "History")

    def _build_settings(self):
        page = QWidget()
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(page)
        layout = QVBoxLayout(page)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        layout.addLayout(self._make_page_header(
            "Settings",
            "Tune storage, post-processing, performance, and tray behavior for the companion service."
        ))

        # Connection
        layout.addWidget(make_section_label("Connection"))
        conn_card = make_card()
        conn_l = QVBoxLayout(conn_card)
        conn_l.setContentsMargins(18, 16, 18, 16)
        conn_l.setSpacing(12)
        port_row = QHBoxLayout()
        port_copy = QVBoxLayout()
        port_copy.setSpacing(2)
        port_copy.addWidget(make_label("Local API port", "fieldLabel"))
        port_copy.addWidget(make_label("Astra Deck uses 9751 by default. Change this only for custom clients or troubleshooting.", "fieldHint", word_wrap=True))
        port_row.addLayout(port_copy, 1)
        self.cfg_port = QSpinBox()
        self.cfg_port.setAccessibleName("Local API port")
        self.cfg_port.setRange(1024, 65535)
        self.cfg_port.setValue(self._dependencies['clamp_int'](self.config.get("ServerPort", self._value('SERVER_PORT')), self._value('SERVER_PORT'), 1024, 65535))
        self.cfg_port.setFixedWidth(100)
        port_row.addWidget(self.cfg_port)
        conn_l.addLayout(port_row)
        conn_l.addWidget(make_divider())
        token_copy = QVBoxLayout()
        token_copy.setSpacing(2)
        token_copy.addWidget(make_label("Private token", "fieldLabel"))
        token_copy.addWidget(make_label("Required for extension requests. Regenerate only if you want to revoke the current token.", "fieldHint", word_wrap=True))
        conn_l.addLayout(token_copy)
        token_row = QHBoxLayout()
        token_row.setSpacing(8)
        self.cfg_token = QLineEdit(self.config.get("ServerToken", ""))
        self.cfg_token.setAccessibleName("Private API token")
        self.cfg_token.setReadOnly(True)
        self.cfg_token.setEchoMode(QLineEdit.EchoMode.Password)
        token_row.addWidget(self.cfg_token, 1)
        self.btn_token_reveal = self._make_tool_button("Reveal", QStyle.StandardPixmap.SP_FileDialogInfoView)
        self.btn_token_reveal.setAccessibleName("Reveal private token")
        self.btn_token_reveal.clicked.connect(self._toggle_token_visible)
        token_row.addWidget(self.btn_token_reveal)
        btn_token_copy = self._make_tool_button("Copy", QStyle.StandardPixmap.SP_FileDialogContentsView)
        btn_token_copy.clicked.connect(self._copy_token)
        token_row.addWidget(btn_token_copy)
        btn_token_reset = self._make_tool_button("Regenerate", QStyle.StandardPixmap.SP_BrowserReload, "danger")
        btn_token_reset.clicked.connect(self._regenerate_token)
        token_row.addWidget(btn_token_reset)
        conn_l.addLayout(token_row)
        layout.addWidget(conn_card)

        # Storage
        layout.addWidget(make_section_label("Storage"))
        paths_card = make_card()
        paths_l = QVBoxLayout(paths_card)
        paths_l.setContentsMargins(18, 16, 18, 16)
        paths_l.setSpacing(10)
        paths_l.addWidget(make_label("Video download folder", "fieldLabel"))
        paths_l.addWidget(make_label("Used for video downloads unless a request specifies a custom destination.", "fieldHint", word_wrap=True))
        row = QHBoxLayout()
        row.setSpacing(8)
        self.cfg_dl_path = QLineEdit(self.config.get("DownloadPath", ""))
        self.cfg_dl_path.setAccessibleName("Video download folder")
        self.cfg_dl_path.setPlaceholderText(str(Path.home() / "Videos" / "YouTube"))
        row.addWidget(self.cfg_dl_path, 1)
        btn = self._make_tool_button("Browse", QStyle.StandardPixmap.SP_DirOpenIcon)
        btn.clicked.connect(lambda: self._browse(self.cfg_dl_path))
        row.addWidget(btn)
        paths_l.addLayout(row)
        paths_l.addWidget(make_divider())
        paths_l.addWidget(make_label("Audio download folder", "fieldLabel"))
        paths_l.addWidget(make_label("Leave blank to save audio beside video downloads.", "fieldHint", word_wrap=True))
        row2 = QHBoxLayout()
        row2.setSpacing(8)
        self.cfg_audio_path = QLineEdit(self.config.get("AudioDownloadPath", ""))
        self.cfg_audio_path.setAccessibleName("Audio download folder")
        self.cfg_audio_path.setPlaceholderText("Same as video folder")
        row2.addWidget(self.cfg_audio_path, 1)
        btn2 = self._make_tool_button("Browse", QStyle.StandardPixmap.SP_DirOpenIcon)
        btn2.clicked.connect(lambda: self._browse(self.cfg_audio_path))
        row2.addWidget(btn2)
        paths_l.addLayout(row2)
        layout.addWidget(paths_card)

        # Post-processing
        layout.addWidget(make_section_label("Post-processing"))
        pp_card = make_card()
        pp_l = QVBoxLayout(pp_card)
        pp_l.setContentsMargins(18, 16, 18, 16)
        pp_l.setSpacing(8)
        self.cfg_metadata = QCheckBox("Embed metadata: title, artist, upload date")
        self.cfg_metadata.setChecked(self.config.get("EmbedMetadata", True))
        self.cfg_thumbnail = QCheckBox("Embed thumbnail as cover art")
        self.cfg_thumbnail.setChecked(self.config.get("EmbedThumbnail", True))
        self.cfg_chapters = QCheckBox("Embed chapter markers")
        self.cfg_chapters.setChecked(self.config.get("EmbedChapters", True))
        self.cfg_subs = QCheckBox("Embed subtitles when available")
        self.cfg_subs.setChecked(self.config.get("EmbedSubs", False))
        for w in [self.cfg_metadata, self.cfg_thumbnail, self.cfg_chapters, self.cfg_subs]:
            pp_l.addWidget(w)
        sub_row = QHBoxLayout()
        sub_row.setSpacing(8)
        sub_row.addSpacing(28)
        sub_row.addWidget(make_label("Subtitle languages", "fieldHint"))
        self.cfg_sublangs = QLineEdit(self.config.get("SubLangs", "en"))
        self.cfg_sublangs.setAccessibleName("Subtitle languages")
        self.cfg_sublangs.setPlaceholderText("en,es")
        self.cfg_sublangs.setFixedWidth(140)
        sub_row.addWidget(self.cfg_sublangs)
        sub_row.addStretch()
        pp_l.addLayout(sub_row)
        pp_l.addWidget(make_divider())
        self.cfg_sponsorblock = QCheckBox("Use SponsorBlock segments")
        self.cfg_sponsorblock.setChecked(self.config.get("SponsorBlock", False))
        pp_l.addWidget(self.cfg_sponsorblock)
        sb_row = QHBoxLayout()
        sb_row.setSpacing(8)
        sb_row.addSpacing(28)
        sb_row.addWidget(make_label("Action", "fieldHint"))
        self.cfg_sb_action = QComboBox()
        self.cfg_sb_action.setAccessibleName("SponsorBlock action")
        self.cfg_sb_action.addItem("Remove segments", "remove")
        self.cfg_sb_action.addItem("Mark segments", "mark")
        current_action = self.config.get("SponsorBlockAction", "remove")
        self.cfg_sb_action.setCurrentIndex(1 if current_action == "mark" else 0)
        self.cfg_sb_action.setEnabled(self.cfg_sponsorblock.isChecked())
        self.cfg_sponsorblock.toggled.connect(self.cfg_sb_action.setEnabled)
        sb_row.addWidget(self.cfg_sb_action)
        sb_row.addStretch()
        pp_l.addLayout(sb_row)
        layout.addWidget(pp_card)

        # Performance
        layout.addWidget(make_section_label("Performance"))
        perf_card = make_card()
        perf_l = QVBoxLayout(perf_card)
        perf_l.setContentsMargins(18, 16, 18, 16)
        perf_l.setSpacing(12)
        frag_row = QHBoxLayout()
        frag_copy = QVBoxLayout()
        frag_copy.setSpacing(2)
        frag_copy.addWidget(make_label("Concurrent fragments", "fieldLabel"))
        frag_copy.addWidget(make_label("Higher values may improve speed on fast connections.", "fieldHint", word_wrap=True))
        frag_row.addLayout(frag_copy, 1)
        self.cfg_fragments = QSpinBox()
        self.cfg_fragments.setAccessibleName("Concurrent fragments")
        self.cfg_fragments.setRange(1, 32)
        self.cfg_fragments.setValue(self._dependencies['clamp_int'](self.config.get("ConcurrentFragments", 4), 4, 1, 32))
        self.cfg_fragments.setFixedWidth(86)
        frag_row.addWidget(self.cfg_fragments)
        perf_l.addLayout(frag_row)
        perf_l.addWidget(make_divider())
        rate_row = QHBoxLayout()
        rate_copy = QVBoxLayout()
        rate_copy.setSpacing(2)
        rate_copy.addWidget(make_label("Rate limit", "fieldLabel"))
        rate_copy.addWidget(make_label("Optional yt-dlp limit such as 500K or 2M.", "fieldHint", word_wrap=True))
        rate_row.addLayout(rate_copy, 1)
        self.cfg_ratelimit = QLineEdit(self.config.get("RateLimit", ""))
        self.cfg_ratelimit.setAccessibleName("Rate limit")
        self.cfg_ratelimit.setPlaceholderText("No limit")
        self.cfg_ratelimit.setFixedWidth(120)
        rate_row.addWidget(self.cfg_ratelimit)
        perf_l.addLayout(rate_row)
        proxy_row = QHBoxLayout()
        proxy_copy = QVBoxLayout()
        proxy_copy.setSpacing(2)
        proxy_copy.addWidget(make_label("Proxy", "fieldLabel"))
        proxy_copy.addWidget(make_label("Optional http, https, or socks proxy URL.", "fieldHint", word_wrap=True))
        proxy_row.addLayout(proxy_copy, 1)
        self.cfg_proxy = QLineEdit(self.config.get("Proxy", ""))
        self.cfg_proxy.setAccessibleName("Proxy")
        self.cfg_proxy.setPlaceholderText("https://proxy.example:8080")
        self.cfg_proxy.setMinimumWidth(260)
        proxy_row.addWidget(self.cfg_proxy)
        perf_l.addLayout(proxy_row)
        perf_l.addWidget(make_divider())
        runtime_row = QHBoxLayout()
        runtime_copy = QVBoxLayout()
        runtime_copy.setSpacing(2)
        runtime_copy.addWidget(make_label("JavaScript runtime", "fieldLabel"))
        runtime_copy.addWidget(make_label(
            "Auto prefers Deno and falls back to Node 22+ for yt-dlp challenge solving.",
            "fieldHint", word_wrap=True,
        ))
        runtime_row.addLayout(runtime_copy, 1)
        self.cfg_js_runtime = QComboBox()
        self.cfg_js_runtime.setAccessibleName("JavaScript runtime")
        self.cfg_js_runtime.addItem("Auto", "auto")
        self.cfg_js_runtime.addItem("Deno", "deno")
        self.cfg_js_runtime.addItem("Node 22+", "node")
        selected_runtime = self.config.get("JavaScriptRuntime", "auto")
        self.cfg_js_runtime.setCurrentIndex(max(0, self.cfg_js_runtime.findData(selected_runtime)))
        runtime_row.addWidget(self.cfg_js_runtime)
        perf_l.addLayout(runtime_row)
        layout.addWidget(perf_card)

        # Behavior
        layout.addWidget(make_section_label("Behavior"))
        beh_card = make_card()
        beh_l = QVBoxLayout(beh_card)
        beh_l.setContentsMargins(18, 16, 18, 16)
        beh_l.setSpacing(8)
        self.cfg_autoupdate = QCheckBox("Update yt-dlp automatically when the server starts")
        self.cfg_autoupdate.setChecked(self.config.get("AutoUpdateYtDlp", True))
        self.cfg_closetotray = QCheckBox("Close to the system tray instead of quitting")
        self.cfg_closetotray.setChecked(self.config.get("CloseToTray", True))
        self.cfg_startmin = QCheckBox("Start minimized to the tray")
        self.cfg_startmin.setChecked(self.config.get("StartMinimized", False))
        for w in [self.cfg_autoupdate, self.cfg_closetotray, self.cfg_startmin]:
            beh_l.addWidget(w)
        layout.addWidget(beh_card)

        # Tools — v1.2.0 downloader-maintenance actions
        layout.addWidget(make_section_label("Tools"))
        tools_card = make_card()
        tools_l = QVBoxLayout(tools_card)
        tools_l.setContentsMargins(18, 16, 18, 16)
        tools_l.setSpacing(10)
        tools_l.addWidget(make_label("Installed tools", "fieldLabel"))
        self.tools_status = make_label(self._tools_status_text(), "fieldHint", word_wrap=True)
        tools_l.addWidget(self.tools_status)
        tools_row = QHBoxLayout()
        tools_row.setSpacing(8)
        self.btn_check_updates = self._make_tool_button(
            "Check yt-dlp Update", QStyle.StandardPixmap.SP_BrowserReload,
        )
        self.btn_check_updates.setToolTip("Check for a yt-dlp update. Active downloads must finish first.")
        self.btn_check_updates.clicked.connect(self._force_ytdlp_update)
        tools_row.addWidget(self.btn_check_updates)
        btn_reinstall_ffmpeg = self._make_tool_button(
            "Reinstall ffmpeg", QStyle.StandardPixmap.SP_DialogResetButton, "danger",
        )
        btn_reinstall_ffmpeg.setToolTip("Delete the installed ffmpeg and re-download from source with checksum verification.")
        btn_reinstall_ffmpeg.clicked.connect(self._reinstall_ffmpeg)
        tools_row.addWidget(btn_reinstall_ffmpeg)
        tools_row.addStretch()
        tools_l.addLayout(tools_row)
        layout.addWidget(tools_card)

        save_row = QHBoxLayout()
        self.settings_status = make_label("", "fieldHint")
        save_row.addWidget(self.settings_status, 1)
        btn_save = self._make_tool_button("Save Changes", QStyle.StandardPixmap.SP_DialogSaveButton, "primary")
        btn_save.clicked.connect(self._save_settings)
        self.btn_save = btn_save
        save_row.addWidget(btn_save)
        layout.addLayout(save_row)
        layout.addStretch()

        for signal in (
            self.cfg_port.valueChanged,
            self.cfg_token.textChanged,
            self.cfg_dl_path.textChanged,
            self.cfg_audio_path.textChanged,
            self.cfg_metadata.toggled,
            self.cfg_thumbnail.toggled,
            self.cfg_chapters.toggled,
            self.cfg_subs.toggled,
            self.cfg_sublangs.textChanged,
            self.cfg_sponsorblock.toggled,
            self.cfg_sb_action.currentIndexChanged,
            self.cfg_fragments.valueChanged,
            self.cfg_ratelimit.textChanged,
            self.cfg_proxy.textChanged,
            self.cfg_js_runtime.currentIndexChanged,
            self.cfg_autoupdate.toggled,
            self.cfg_closetotray.toggled,
            self.cfg_startmin.toggled,
        ):
            signal.connect(self._mark_settings_dirty)

        self.tabs.addTab(scroll, "Settings")

    # ── Navigation ──
    def _nav_click(self, name):
        idx = ["Dashboard", "Downloads", "History", "Settings"].index(name)
        self.tabs.setCurrentIndex(idx)
        for i, btn in enumerate(self.nav_buttons):
            btn.setChecked(i == idx)
            btn.setProperty("active", "true" if i == idx else "false")
            repolish(btn)
        self._animate_page()
        if name == "History":
            self._refresh_history()

    def _animate_page(self):
        widget = self.tabs.currentWidget()
        if not widget:
            return
        effect = QGraphicsOpacityEffect(widget)
        widget.setGraphicsEffect(effect)
        anim = QPropertyAnimation(effect, b"opacity", self)
        anim.setDuration(120)
        anim.setStartValue(0.86)
        anim.setEndValue(1.0)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.finished.connect(lambda: widget.setGraphicsEffect(None))
        self._page_anim = anim
        anim.start()

    # ── Server ──
    def _toggle_server(self):
        if self.server_running:
            self._stop_server()
        else:
            self._start_server()

    def _start_server(self):
        if self.server_running:
            return
        if self._setup_running:
            self._append_log("Setup is already running. The server will start when it finishes.")
            return
        if not self._value('YTDLP_PATH').exists() or not self._value('FFMPEG_PATH').exists():
            self._append_log("Required tools are missing. Starting setup...")
            self._run_setup()
            return

        configured_port = self._dependencies['clamp_int'](self.config.get("ServerPort", self._value('SERVER_PORT')), self._value('SERVER_PORT'), 1024, 65535)
        api = self._dependencies['create_api'](self.config, self.dl_manager, self.history_mgr)

        # Port discovery: try configured port first, then fall back to well-known
        # alternatives. Fixes systems where Windows/Hyper-V has blocked the default
        # (WinError 10013) or another process holds it (WinError 10048).
        fallback_ports = [configured_port] + [p for p in self._value('PORT_FALLBACKS') if p != configured_port]
        chosen_port = None
        last_err: Exception | None = None
        for candidate in fallback_ports:
            probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                probe.bind(('127.0.0.1', candidate))
                chosen_port = candidate
                break
            except OSError as e:
                last_err = e
                continue
            finally:
                try:
                    probe.close()
                except OSError:
                    pass

        if chosen_port is None:
            assert last_err is not None
            if getattr(last_err, 'winerror', None) == 10013:
                msg = ("All candidate ports are blocked by Windows.\n\n"
                       "Run as Administrator in PowerShell:\n"
                       "  net stop winnat\n"
                       "  netsh int ipv4 delete excludedportrange protocol=tcp "
                       f"startport={configured_port} numberofports=1\n"
                       "  net start winnat")
            elif getattr(last_err, 'winerror', None) == 10048:
                msg = "All candidate ports are already in use by other processes."
            else:
                msg = f"Cannot bind any server port: {last_err}"
            self._append_log(f"Server error: {msg}")
            self._show_server_error(msg)
            return

        if chosen_port != configured_port:
            self._append_log(
                f"Port {configured_port} is unavailable; using fallback port {chosen_port}."
            )
            # Persist so future starts prefer the working port.
            self.config.set("ServerPort", chosen_port)
            self.config.save()
            self._sync_connection_ui()

        try:
            # v1.2.0: prefer waitress (production-grade WSGI) and fall back
            # to werkzeug's dev server only when waitress isn't available
            # (legacy source environments can omit the declared dependency).
            self.server_obj = self._dependencies['_build_wsgi_server'](chosen_port, api)
        except Exception as e:
            self.server_obj = None
            self._append_log(f"Server error: {e}")
            self._show_server_error(str(e))
            return

        port = chosen_port

        def run():
            try:
                self.server_obj.run()
            except Exception as e:
                self.log_message.emit(f"Server error: {e}")

        self.server_thread = threading.Thread(target=run, daemon=True)
        self.server_thread.start()
        self.server_running = True
        self.server_start_time = time.time()
        self._append_log(
            f"Server started on http://127.0.0.1:{port} "
            f"(backend: {self.server_obj.backend})"
        )
        self._update_server_ui()

        # Auto-update yt-dlp — throttled (once per 24h) so we don't re-run
        # it on every single launch. Logs exit code instead of silently
        # discarding it.
        #
        # v4.47.0 NF26: pass the manager's active_count so an in-flight
        # download isn't raced by a yt-dlp.exe self-replace.
        self._dependencies['maybe_auto_update_ytdlp'](self.config, self.dl_manager.active_count)

    def _stop_server(self):
        if self.server_obj:
            try:
                self.server_obj.stop()
                if self.server_thread and self.server_thread.is_alive():
                    self.server_thread.join(timeout=2)
            except Exception as e:
                self._append_log(f"Server shutdown warning: {e}")
            self.server_obj = None
        self.server_thread = None
        self.server_running = False
        self.server_start_time = None
        self._append_log("Server stopped")
        self._update_server_ui()

    def _update_server_ui(self):
        if self.server_running:
            self.status_dot.setStyleSheet("color: #4cd6a2; font-size: 20px;")
            self.status_label.setText("Running")
            self.status_label.setStyleSheet("color: #aef2d5; font-size: 11px; font-weight: 650;")
            self.dash_status.setText("Server running")
            self.dash_hint.setText("Ready for Astra Deck requests. The service only listens on this computer.")
            self.server_badge.setText("Running")
            self.server_badge.setProperty("tone", "success")
            self.btn_startstop.setText("Stop Server")
            self.btn_startstop.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_MediaStop))
            self.btn_startstop.setProperty("class", "secondary")
            self.tray_startstop.setText("Stop Server")
            self.tray.setToolTip(f"{self._value('APP_NAME')} - Running")
            self._set_readiness("server", "Running", "success")
        else:
            self.status_dot.setStyleSheet("color: #697381; font-size: 20px;")
            self.status_label.setText("Stopped")
            self.status_label.setStyleSheet("color: #7f8997; font-size: 11px; font-weight: 650;")
            self.dash_status.setText("Server stopped")
            self.dash_hint.setText("Start the service before using download actions in Astra Deck.")
            self.server_badge.setText("Stopped")
            self.server_badge.setProperty("tone", "neutral")
            self.btn_startstop.setText("Start Server")
            self.btn_startstop.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_MediaPlay))
            self.btn_startstop.setProperty("class", "primary")
            self.tray_startstop.setText("Start Server")
            self.tray.setToolTip(f"{self._value('APP_NAME')} - Stopped")
            self._set_readiness("server", "Stopped", "neutral")
        repolish(self.btn_startstop)
        repolish(self.server_badge)

    def _clear_layout(self, layout):
        while layout.count():
            item = layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear_layout(item.layout())

    def _download_card(self, dl, recent=False):
        card = QFrame()
        card.setProperty("class", "download")
        if dl.status in ("failed", "complete"):
            card.setProperty("state", dl.status)
        card_l = QVBoxLayout(card)
        card_l.setContentsMargins(16, 13, 16, 13)
        card_l.setSpacing(9)

        top = QHBoxLayout()
        title = make_label(dl.title if dl.title and dl.title != "Unknown" else "Preparing download", "fieldLabel", word_wrap=True)
        top.addWidget(title, 1)
        top.addWidget(make_status_badge(human_status(dl.status), download_status_tone(dl.status)))
        if not recent and dl.status in self._value('DOWNLOAD_PENDING_STATES'):
            if dl.status != 'needs-auth':
                btn_up = self._make_tool_button("Up", QStyle.StandardPixmap.SP_ArrowUp, "ghost")
                btn_up.setToolTip("Move this pending download earlier.")
                btn_up.clicked.connect(
                    lambda checked=False, dl_id=dl.id: self._move_pending_download(dl_id, -1)
                )
                top.addWidget(btn_up)
                btn_down = self._make_tool_button("Down", QStyle.StandardPixmap.SP_ArrowDown, "ghost")
                btn_down.setToolTip("Move this pending download later.")
                btn_down.clicked.connect(
                    lambda checked=False, dl_id=dl.id: self._move_pending_download(dl_id, 1)
                )
                top.addWidget(btn_down)
            if dl.status == 'paused':
                btn_resume = self._make_tool_button("Resume Queue", QStyle.StandardPixmap.SP_MediaPlay, "ghost")
                btn_resume.setToolTip("Resume recovered, unauthenticated downloads explicitly.")
                btn_resume.clicked.connect(self._resume_download_queue)
                top.addWidget(btn_resume)
            btn_cancel = self._make_tool_button("Cancel", QStyle.StandardPixmap.SP_DialogCancelButton, "ghost")
            btn_cancel.clicked.connect(lambda checked=False, dl_id=dl.id: self.dl_manager.cancel(dl_id))
            top.addWidget(btn_cancel)
        elif not recent and dl.status in self._value('DOWNLOAD_RUNNING_STATES'):
            btn_cancel = self._make_tool_button("Cancel", QStyle.StandardPixmap.SP_DialogCancelButton, "ghost")
            btn_cancel.clicked.connect(lambda checked=False, dl_id=dl.id: self.dl_manager.cancel(dl_id))
            top.addWidget(btn_cancel)
        elif recent and dl.status == "failed" and dl.error_code in self._value('DOWNLOAD_RETRYABLE_ERROR_CODES'):
            btn_retry = self._make_tool_button("Retry", QStyle.StandardPixmap.SP_BrowserReload, "ghost")
            btn_retry.clicked.connect(lambda checked=False, item=dl: self._retry_download(item))
            top.addWidget(btn_retry)
        elif recent and dl.status == "complete" and dl.filename:
            btn_show = self._make_tool_button("Show", QStyle.StandardPixmap.SP_DirOpenIcon, "ghost")
            btn_show.clicked.connect(lambda checked=False, path=dl.filename: self._show_download_location(path))
            top.addWidget(btn_show)
        card_l.addLayout(top)

        if dl.status in self._value('DOWNLOAD_RUNNING_STATES'):
            bar = QProgressBar()
            bar.setRange(0, 100)
            bar.setValue(int(min(max(dl.progress, 0), 100)))
            bar.setTextVisible(False)
            card_l.addWidget(bar)

        meta_parts = []
        if dl.status in ("downloading", "merging", "extracting"):
            meta_parts.append(f"{dl.progress:.1f}%")
        if dl.speed:
            meta_parts.append(dl.speed)
        if dl.eta:
            meta_parts.append(f"ETA {dl.eta}")
        if dl.format:
            meta_parts.append(dl.format.upper())
        if dl.quality:
            meta_parts.append(str(dl.quality))
        if dl.error:
            meta_parts.append(dl.error)
        elif dl.filename:
            meta_parts.append(Path(dl.filename).name)
        meta = make_label("  /  ".join(meta_parts) if meta_parts else dl.url, "fieldHint", word_wrap=True)
        card_l.addWidget(meta)
        if dl.error and dl.error_advice:
            recovery = dl.error_advice
            if dl.error_action:
                recovery = f"{recovery}\nNext: {dl.error_action}"
            card_l.addWidget(make_label(recovery, "errorCallout", word_wrap=True))
        return card

    def _update_ui(self):
        if self.server_running and self.server_thread and not self.server_thread.is_alive():
            self.server_running = False
            self.server_start_time = None
            self.server_obj = None
            self._append_log("Server stopped unexpectedly")
            self._update_server_ui()

        # Stats
        self.stat_active.setText(str(self.dl_manager.active_count()))
        self.stat_completed.setText(str(self.dl_manager.total_completed))
        if self.server_start_time:
            elapsed = time.time() - self.server_start_time
            if elapsed >= 3600:
                self.stat_uptime.setText(f"{elapsed/3600:.0f}h")
            elif elapsed >= 60:
                self.stat_uptime.setText(f"{elapsed/60:.0f}m")
            else:
                self.stat_uptime.setText(f"{elapsed:.0f}s")
        else:
            self.stat_uptime.setText("--")

        # Downloads tab
        downloads = self.dl_manager.snapshot()
        active = [d for d in downloads if d.status in self._value('DOWNLOAD_RUNNING_STATES')]
        pending = [d for d in downloads if d.status in self._value('DOWNLOAD_PENDING_STATES')]
        recent = [d for d in downloads
                  if d.status in ('complete', 'failed', 'cancelled')]
        active.sort(key=lambda d: d.start_time)
        pending.sort(key=lambda d: (d.queue_order, d.start_time))
        recent.sort(key=lambda d: d.start_time, reverse=True)
        capacity = self.dl_manager.capacity()
        self.queue_capacity_badge.setText(
            f"{capacity['total']} / {capacity['totalLimit']}"
        )
        self.btn_queue_pause.setText(
            "Resume Queue" if capacity['intakePaused'] else "Pause Intake"
        )
        self.btn_queue_pause.setIcon(self.style().standardIcon(
            QStyle.StandardPixmap.SP_MediaPlay
            if capacity['intakePaused'] else QStyle.StandardPixmap.SP_MediaPause
        ))
        self.btn_queue_pause.setToolTip(
            "Resume pending downloads explicitly. Items needing sign-in remain paused."
            if capacity['intakePaused'] else
            "Pause starting pending downloads. Downloads already running will continue."
        )
        signature = tuple(
            (d.id, d.status, d.queue_order, round(d.progress, 1), d.speed, d.eta,
             d.title, d.error, d.filename)
            for d in active + pending + recent[:8]
        ) + ((capacity['intakePaused'], capacity['total']),)
        if signature == self._downloads_signature:
            return
        self._downloads_signature = signature

        self._clear_layout(self.downloads_list_layout)
        if not active and not pending and not recent:
            self.downloads_list_layout.addWidget(make_empty_state(
                "Queue is clear",
                "Start the local server, then use Astra Deck's download action on YouTube. Active jobs will show progress, speed, and recovery guidance here.",
                "Open Dashboard",
                lambda: self._nav_click("Dashboard"),
            ))
        if active:
            self.downloads_list_layout.addWidget(make_section_label("In progress"))
            for dl in active:
                self.downloads_list_layout.addWidget(self._download_card(dl))
        if pending:
            self.downloads_list_layout.addWidget(make_section_label("Pending"))
            for dl in pending:
                self.downloads_list_layout.addWidget(self._download_card(dl))
        if recent:
            self.downloads_list_layout.addWidget(make_section_label("Recent activity"))
            for dl in recent[:8]:
                self.downloads_list_layout.addWidget(self._download_card(dl, recent=True))
        self.downloads_list_layout.addStretch()

    def _refresh_history(self):
        self._clear_layout(self.history_container)

        data = self.history_mgr.load()
        self.btn_clear_history.setEnabled(bool(data))
        if not data:
            self.history_container.addWidget(make_empty_state(
                "No downloads yet",
                "Completed jobs appear here with format, quality, duration, and a direct path back to the saved file.",
                "View Download Queue",
                lambda: self._nav_click("Downloads"),
            ))
            self.history_container.addStretch()
            return

        for h in reversed(data[-50:]):
            card = make_card("download")
            card.setProperty("state", "complete")
            card_l = QVBoxLayout(card)
            card_l.setContentsMargins(16, 13, 16, 13)
            card_l.setSpacing(7)
            top = QHBoxLayout()
            title = make_label(h.get("title", "(untitled)"), "fieldLabel", word_wrap=True)
            top.addWidget(title, 1)
            top.addWidget(make_status_badge("Complete", "success"))
            if h.get("filename"):
                btn_show = self._make_tool_button("Show", QStyle.StandardPixmap.SP_DirOpenIcon, "ghost")
                btn_show.clicked.connect(lambda checked=False, path=h.get("filename"): self._show_download_location(path))
                top.addWidget(btn_show)
            card_l.addLayout(top)
            parts = [p for p in [
                h.get("date"),
                str(h.get("format", "")).upper() if h.get("format") else "",
                h.get("quality"),
                format_duration(h.get("duration", 0)),
            ] if p]
            filename = h.get("filename")
            if filename:
                parts.append(Path(filename).name)
            meta = make_label("  /  ".join(parts), "fieldHint", word_wrap=True)
            card_l.addWidget(meta)
            self.history_container.addWidget(card)
        self.history_container.addStretch()

    def _clear_history(self):
        snapshot = self.history_mgr.load()
        if not snapshot:
            self._refresh_history()
            self._append_log("Download history is already clear")
            return
        if not self.history_mgr.clear():
            self._append_log(
                "Could not clear download history. The existing history was preserved; "
                "check disk permissions and retry."
            )
            return
        self._cleared_history_snapshot = snapshot
        self._refresh_history()
        self.btn_undo_clear_history.show()
        self._append_log("Download history cleared. Downloaded files were not removed.")

    def _undo_clear_history(self):
        if not self._cleared_history_snapshot:
            self.btn_undo_clear_history.hide()
            self._append_log("No cleared history entries to restore")
            return
        if not self.history_mgr.replace(self._cleared_history_snapshot):
            self._append_log(
                "Could not restore download history. The Undo snapshot is still available; "
                "check disk permissions and retry."
            )
            return
        restored = len(self._cleared_history_snapshot)
        self._cleared_history_snapshot = []
        self.btn_undo_clear_history.hide()
        self._refresh_history()
        self._append_log(f"Restored {restored} download history entr{'y' if restored == 1 else 'ies'}")

    def _retry_download(self, dl):
        ok, err = self.dl_manager.retry(dl.id)
        if not ok:
            self._append_log(f"Retry failed: {err}")
            return
        self._append_log(f"Retry queued: {dl.title if dl.title != 'Unknown' else dl.url}")
        self._nav_click("Downloads")

    def _toggle_queue_intake(self):
        if self.dl_manager.capacity()['intakePaused']:
            self._resume_download_queue()
            return
        if self.dl_manager.pause_intake():
            self._append_log("Download intake paused. Running jobs will finish; new jobs will wait.")
        else:
            self._append_log("Could not persist the paused queue state. Check disk permissions.")

    def _resume_download_queue(self):
        if self.dl_manager.resume_intake():
            self._append_log("Download queue resumed. Items needing sign-in remain paused.")
        else:
            self._append_log("Could not persist the resumed queue state. Check disk permissions.")

    def _move_pending_download(self, dl_id, offset):
        ok, err = self.dl_manager.move_pending_by(dl_id, offset)
        if not ok:
            self._append_log(f"Could not reorder pending download: {err}")

    def _show_download_location(self, file_path):
        if not file_path:
            self._open_folder()
            return
        path = Path(file_path)
        try:
            target = path.parent if path.suffix else path
            if target.exists():
                os.startfile(str(target))
                return
            self._append_log("Download location is no longer available")
        except Exception as e:
            self._append_log(f"Could not open download location: {e}")

    def _set_input_error(self, widget, is_error):
        widget.setProperty("state", "error" if is_error else "")
        repolish(widget)

    def _show_settings_status(self, message, tone="neutral"):
        colors = {
            "success": "#9ff3bd",
            "danger": "#ffb8b8",
            "warning": "#ffe4a3",
            "neutral": "#7b8794",
        }
        self.settings_status.setText(message)
        self.settings_status.setStyleSheet(f"color: {colors.get(tone, colors['neutral'])}; font-size: 11px;")

    def _mark_settings_dirty(self, *_args):
        if not hasattr(self, "settings_status") or not hasattr(self, "btn_save"):
            return
        self._show_settings_status("Unsaved changes. Save when ready.", "warning")
        self.btn_save.setText("Save Changes")

    def _sync_connection_ui(self):
        port = self._dependencies['clamp_int'](self.config.get("ServerPort", self._value('SERVER_PORT')), self._value('SERVER_PORT'), 1024, 65535)
        self.dash_endpoint.setText(f"http://127.0.0.1:{port}")
        self.stat_port.setText(str(port))

    # ── Tools: yt-dlp / ffmpeg maintenance (v1.2.0) ──
    def _tools_status_text(self):
        ytv = self._dependencies['get_ytdlp_version']() or "not installed"
        ffv = self._dependencies['get_ffmpeg_version']() or "not installed"
        return f"yt-dlp {ytv}    •    ffmpeg {ffv}"

    def _refresh_tools_status(self):
        try:
            self.tools_status.setText(self._tools_status_text())
        except Exception:
            pass

    def _force_ytdlp_update(self):
        if not self._value('YTDLP_PATH').exists():
            self._append_log("yt-dlp is not installed yet — run setup first.")
            self._show_settings_status("Install yt-dlp before checking for updates.", "warning")
            return
        active_downloads = self.dl_manager.active_count()
        if active_downloads:
            self._append_log(
                f"yt-dlp update deferred: {active_downloads} download(s) are still active."
            )
            self._show_settings_status(
                "Wait for active downloads to finish before updating yt-dlp.",
                "warning",
            )
            return
        self._append_log("Forcing yt-dlp self-update…")
        self.btn_check_updates.setEnabled(False)
        self.btn_check_updates.setText("Checking…")
        self._show_settings_status(
            "Checking yt-dlp. The verified current copy stays available until the update passes.",
            "warning",
        )

        def run():
            try:
                result = self._dependencies['_run_ytdlp_self_update'](self.config, source_tag='gui')
            except Exception as e:
                result = {
                    'ok': False,
                    'error': f'Unexpected update error: {e}',
                    'error_code': 'unexpected-update-error',
                }
            # A queued Qt signal is the thread-safe boundary back to the GUI.
            # QTimer.singleShot created inside this worker has no event loop and
            # can silently strand the button in its busy state.
            self.tools_update_finished.emit(result)

        threading.Thread(target=run, daemon=True).start()

    def _finish_ytdlp_update(self, result):
        self.btn_check_updates.setEnabled(True)
        self.btn_check_updates.setText("Check yt-dlp Update")
        self._refresh_tools_status()
        if result.get('ok'):
            version = result.get('version_after') or 'current'
            rollback = result.get('rollback_version') or 'not retained yet'
            self._append_log(f"yt-dlp active {version}; rollback {rollback}.")
            self._show_settings_status(f"yt-dlp {version} is ready.", "success")
            return
        recovery = (
            f" Restored {result.get('version_after')}."
            if result.get('rolled_back') else ''
        )
        error = result.get('error') or 'Unknown update error.'
        self._append_log(f"yt-dlp update failed: {str(error).rstrip('.')}.{recovery}")
        self._show_settings_status(
            "yt-dlp update failed. The previous working copy was kept; check the log for details.",
            "danger",
        )

    def _reinstall_ffmpeg(self):
        """Stage and verify a fresh ffmpeg before replacing the live binary."""
        if self._setup_running:
            self._append_log("Setup is already running; wait for it to finish before reinstalling ffmpeg.")
            self._show_settings_status("Setup is already running.", "warning")
            return
        active_downloads = self.dl_manager.active_count()
        if active_downloads:
            self._append_log(
                f"ffmpeg refresh deferred: {active_downloads} download(s) are still active."
            )
            self._show_settings_status(
                "Wait for active downloads to finish before refreshing ffmpeg.",
                "warning",
            )
            return
        self._append_log("Reinstalling ffmpeg from source with checksum verification.")
        self._show_settings_status(
            "Refreshing ffmpeg. The current verified copy stays available until replacement succeeds.",
            "warning",
        )
        # self._dependencies['SetupWorker'] extracts into a unique temporary file and only calls
        # os.replace after the archive checksum and executable size checks pass.
        # `force_ffmpeg` bypasses the ordinary already-installed short circuit
        # without deleting the live binary first.
        self._run_setup(force_ffmpeg=True)

    def _save_settings(self):
        validated_fields = (
            self.cfg_token, self.cfg_dl_path, self.cfg_audio_path,
            self.cfg_sublangs, self.cfg_ratelimit, self.cfg_proxy,
        )
        for field in validated_fields:
            self._set_input_error(field, False)
            field.setAccessibleDescription("")

        old_port = self._dependencies['clamp_int'](self.config.get("ServerPort", self._value('SERVER_PORT')), self._value('SERVER_PORT'), 1024, 65535)
        old_token = self.config.get("ServerToken", "")
        new_port = self.cfg_port.value()
        new_token = self.cfg_token.text().strip()
        dl_path = self.cfg_dl_path.text().strip()
        audio_path = self.cfg_audio_path.text().strip()
        sublangs = self._dependencies['normalize_sublangs'](self.cfg_sublangs.text())
        rate = self._dependencies['normalize_rate_limit'](self.cfg_ratelimit.text())
        proxy = self.cfg_proxy.text().strip()
        has_error = False
        first_error = None

        def mark_error(field, message):
            nonlocal has_error, first_error
            self._set_input_error(field, True)
            field.setAccessibleDescription(message)
            has_error = True
            if first_error is None:
                first_error = field

        dl_path, dl_path_err = self._dependencies['normalize_output_dir'](dl_path, self._value('DEFAULT_CONFIG')["DownloadPath"])
        audio_path, audio_path_err = self._dependencies['normalize_output_dir'](audio_path, dl_path) if audio_path else ("", None)

        if dl_path_err:
            mark_error(self.cfg_dl_path, "Choose a valid local video download folder.")
        if audio_path_err:
            mark_error(self.cfg_audio_path, "Choose a valid local audio download folder.")
        if not sublangs:
            mark_error(self.cfg_sublangs, "Enter one or more language codes, such as en or en,es.")
        if self.cfg_ratelimit.text().strip() and not rate:
            mark_error(self.cfg_ratelimit, "Use a rate such as 500K or 2M, or leave this blank.")
        if proxy and not self._dependencies['normalize_proxy'](proxy):
            mark_error(self.cfg_proxy, "Enter an http, https, or socks proxy URL.")
        else:
            proxy = self._dependencies['normalize_proxy'](proxy)
        if not new_token:
            mark_error(self.cfg_token, "The private API token cannot be empty.")

        if has_error:
            self._show_settings_status("Check the highlighted fields before saving.", "danger")
            if first_error is not None:
                first_error.setFocus(Qt.FocusReason.OtherFocusReason)
            return

        connection_changed = new_port != old_port or new_token != old_token
        restart_now = connection_changed and self.server_running

        self.cfg_dl_path.setText(dl_path)
        self.cfg_audio_path.setText(audio_path)
        self.cfg_sublangs.setText(sublangs)
        self.cfg_ratelimit.setText(rate)
        self.cfg_proxy.setText(proxy)
        saved = self.config.update({
            "ServerPort": new_port,
            "ServerToken": new_token,
            "DownloadPath": dl_path,
            "AudioDownloadPath": audio_path,
            "EmbedMetadata": self.cfg_metadata.isChecked(),
            "EmbedThumbnail": self.cfg_thumbnail.isChecked(),
            "EmbedChapters": self.cfg_chapters.isChecked(),
            "EmbedSubs": self.cfg_subs.isChecked(),
            "SubLangs": sublangs,
            "SponsorBlock": self.cfg_sponsorblock.isChecked(),
            "SponsorBlockAction": self.cfg_sb_action.currentData(),
            "ConcurrentFragments": self.cfg_fragments.value(),
            "RateLimit": rate,
            "Proxy": proxy,
            "JavaScriptRuntime": self.cfg_js_runtime.currentData(),
            "AutoUpdateYtDlp": self.cfg_autoupdate.isChecked(),
            "CloseToTray": self.cfg_closetotray.isChecked(),
            "StartMinimized": self.cfg_startmin.isChecked(),
        })
        if not saved:
            self.btn_save.setText("Save Changes")
            self._show_settings_status(
                "Could not save settings. Nothing changed; check disk permissions and retry.",
                "danger",
            )
            self._append_log("Settings save failed. Existing settings and server state were preserved.")
            return

        self._dependencies['reset_deno_runtime_cache']()
        self._start_readiness_probe()

        self._sync_connection_ui()
        if restart_now:
            self._append_log("Connection settings changed; restarting local server.")
            self._stop_server()
            self._start_server()
            self._show_settings_status("Settings saved and server restarted.", "success")
        else:
            self._show_settings_status("Settings saved.", "success")
        self.btn_save.setText("Saved")
        QTimer.singleShot(1500, lambda: self.btn_save.setText("Save Changes"))
        QTimer.singleShot(3200, lambda: self._show_settings_status(""))

    def _browse(self, line_edit):
        path = QFileDialog.getExistingDirectory(self, "Select Folder", line_edit.text())
        if path:
            line_edit.setText(path)

    def _copy_endpoint(self):
        QApplication.clipboard().setText(self.dash_endpoint.text())
        self._append_log("Endpoint copied to clipboard")
        old = self.dash_hint.text()
        self.dash_hint.setText("Endpoint copied.")
        QTimer.singleShot(1600, lambda: self.dash_hint.setText(old))

    def _copy_token(self):
        token = self.cfg_token.text()
        QApplication.clipboard().setText(token)
        self._show_settings_status(
            "Token copied. It will clear from the clipboard in 60 seconds if unchanged.",
            "success",
        )
        QTimer.singleShot(60_000, lambda expected=token: self._clear_copied_token(expected))

    def _clear_copied_token(self, expected):
        clipboard = QApplication.clipboard()
        if clipboard.text() == expected:
            clipboard.clear()
            self._show_settings_status("Copied token cleared from the clipboard.", "neutral")

    def _copy_diagnostics(self):
        payload = self._dependencies['build_diagnostics_bundle'](
            server_running=self.server_running,
            endpoint=self.dash_endpoint.text(),
            active_downloads=self.dl_manager.active_count(),
            completed_downloads=self.dl_manager.total_completed,
            recent_logs=self._dependencies['get_recent_log_entries'](),
            secrets=(self.config.get('ServerToken', ''), self.cfg_token.text()),
        )
        text = json.dumps(payload, indent=2, ensure_ascii=False)

        dialog = QDialog(self)
        dialog.setWindowTitle("Review Diagnostics")
        dialog.setModal(True)
        dialog.resize(720, 520)
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(12)
        heading = make_label("Review the redacted support payload", "section")
        detail = make_label(
            "Paths, URLs, tokens, cookie-shaped values, and opaque identifiers are removed. "
            "Only copy this payload if you are comfortable sharing what remains.",
            "fieldHint",
            word_wrap=True,
        )
        preview = QTextEdit()
        preview.setReadOnly(True)
        preview.setPlainText(text)
        preview.setAccessibleName("Redacted diagnostics preview")
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        copy_button = buttons.addButton("Copy to Clipboard", QDialogButtonBox.ButtonRole.AcceptRole)
        copy_button.setDefault(True)
        copy_button.clicked.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(heading)
        layout.addWidget(detail)
        layout.addWidget(preview, 1)
        layout.addWidget(buttons)

        if dialog.exec() == QDialog.DialogCode.Accepted:
            QApplication.clipboard().setText(text)
            self._append_log("Redacted diagnostics copied to clipboard")

    def _clear_log(self):
        self.log_text.setPlainText("Ready.")

    def _toggle_token_visible(self):
        showing = self.cfg_token.echoMode() == QLineEdit.EchoMode.Normal
        self.cfg_token.setEchoMode(QLineEdit.EchoMode.Password if showing else QLineEdit.EchoMode.Normal)
        self.btn_token_reveal.setText("Reveal" if showing else "Hide")
        self.btn_token_reveal.setAccessibleName("Reveal private token" if showing else "Hide private token")

    def _regenerate_token(self):
        self.cfg_token.setText(uuid.uuid4().hex)
        self._append_log("New server token generated. Save settings to apply it.")
        self._show_settings_status("New token ready. Save settings to apply it.", "warning")

    def _open_folder(self):
        p = self.config.get("DownloadPath", "")
        try:
            target = Path(p) if p else self._value('INSTALL_DIR')
            if not target.exists():
                target.mkdir(parents=True, exist_ok=True)
            os.startfile(str(target))
        except Exception as e:
            self._append_log(f"Could not open folder: {e}")

    def _append_log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_text.append(f"{ts} {msg}")
        self._dependencies['write_persistent_log'](msg)
        cursor = self.log_text.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        self.log_text.setTextCursor(cursor)

    def _show_server_error(self, msg):
        """Report startup failures without stealing focus from the active desktop."""
        try:
            self._append_log(f"Server failed to start: {msg}")
            self.status_label.setText("Server error")
            self.status_label.setStyleSheet("color: #ffb8b8; font-size: 11px;")
            self.dash_hint.setText("Server failed to start. Check the log for details.")
            if self.tray.isVisible():
                self.tray.showMessage(
                    "Astra Downloader",
                    "Server failed to start. Check the log for details.",
                    QSystemTrayIcon.MessageIcon.Warning,
                    6000,
                )
        except Exception:
            pass

    def _start_instance_command_listener(self):
        if self._instance_command_thread and self._instance_command_thread.is_alive():
            return

        def run():
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
                    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    server.bind((self._value('INSTANCE_CONTROL_HOST'), self._value('INSTANCE_CONTROL_PORT')))
                    server.listen(4)
                    server.settimeout(0.5)
                    self._dependencies['write_persistent_log'](
                        f"Instance command listener started on {self._value('INSTANCE_CONTROL_HOST')}:{self._value('INSTANCE_CONTROL_PORT')}."
                    )
                    while not self._instance_command_stop.is_set():
                        try:
                            conn, _addr = server.accept()
                        except socket.timeout:
                            continue
                        except OSError:
                            if self._instance_command_stop.is_set():
                                break
                            raise
                        with conn:
                            try:
                                conn.settimeout(0.5)
                                raw = conn.recv(128)
                            except OSError:
                                continue
                        command = raw.decode('ascii', errors='ignore').strip().lower()
                        if command in {'show', 'start', 'shutdown'}:
                            self.instance_command.emit(command)
            except OSError as e:
                if not self._instance_command_stop.is_set():
                    self.log_message.emit(f"Instance command listener unavailable: {e}")

        self._instance_command_thread = threading.Thread(
            target=run,
            daemon=True,
            name="AstraDownloaderInstanceCommand"
        )
        self._instance_command_thread.start()

    def _stop_instance_command_listener(self):
        if not self._instance_command_thread:
            return
        self._instance_command_stop.set()
        try:
            with socket.create_connection((self._value('INSTANCE_CONTROL_HOST'), self._value('INSTANCE_CONTROL_PORT')), timeout=0.2):
                pass
        except OSError:
            pass
        if self._instance_command_thread.is_alive():
            self._instance_command_thread.join(timeout=1)
        self._instance_command_thread = None

    def _handle_instance_command(self, command):
        command = str(command).strip().lower()
        if command == 'show':
            self._append_log("Received request to show the existing window.")
            self._show_from_tray()
            return
        if command == 'shutdown':
            self._append_log("Received uninstall shutdown request.")
            self._force_close()
            return
        if command != 'start':
            return
        self._append_log("Received browser start request.")
        if self.server_running:
            self._append_log("Server already running.")
            return
        if self._setup_running:
            self._append_log("Setup is running. The server will start when setup finishes.")
            return
        self._start_server()

    # ── Tray ──
    def _tray_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self._show_from_tray()

    def _show_from_tray(self):
        self.show()
        self.setWindowState(self.windowState() & ~Qt.WindowState.WindowMinimized)
        self.activateWindow()

    def _minimize_to_tray(self):
        self.hide()

    def _force_close(self):
        self._force_exit = True
        self.close()

    def closeEvent(self, event):
        if not self._force_exit and self.config.get("CloseToTray", True):
            event.ignore()
            self.hide()
            if not self._tray_hint_shown and self.tray.isVisible():
                self.tray.showMessage(
                    self._value('APP_NAME'),
                    "Still running in the tray so Astra Deck can keep sending downloads.",
                    QSystemTrayIcon.MessageIcon.Information,
                    3000,
                )
                self._tray_hint_shown = True
        else:
            self._stop_instance_command_listener()
            if self.server_running:
                self._stop_server()
            self.dl_manager.cancel_all()
            worker = getattr(self, "setup_worker", None)
            if worker is not None and worker.isRunning():
                worker.requestInterruption()
                worker.quit()
                if not worker.wait(5000):
                    worker.terminate()
                    worker.wait()
            readiness_thread = getattr(self, "readiness_thread", None)
            if readiness_thread is not None and readiness_thread.isRunning():
                readiness_thread.requestInterruption()
                readiness_thread.quit()
                if not readiness_thread.wait(5000):
                    readiness_thread.terminate()
                    readiness_thread.wait()
            self.tray.hide()
            self.update_timer.stop()
            self.cleanup_timer.stop()
            event.accept()

    # ── First-run setup ──
    def _run_setup(self, force_ffmpeg=False):
        if self._setup_running:
            return
        self._setup_running = True
        self._append_log("Refreshing ffmpeg..." if force_ffmpeg else "Running first-time setup...")
        self.setup_status.setText("Installing required download tools...")
        self.setup_status.show()
        self.setup_progress.setValue(0)
        self.setup_progress.show()
        self.btn_startstop.setEnabled(False)
        self.btn_startstop.setText("Setting Up")
        self.setup_worker = self._dependencies['SetupWorker'](
            force_ffmpeg=force_ffmpeg,
            auto_update_ytdlp=self.config.get("AutoUpdateYtDlp", True),
            configured_runtime=self.config.get("JavaScriptRuntime", "auto"),
            config=self.config,
        )
        self.setup_worker.log.connect(self._append_log)
        self.setup_worker.progress.connect(self._setup_progress)
        self.setup_worker.finished_ok.connect(self._setup_done)
        self.setup_worker.finished_err.connect(self._setup_failed)
        self.setup_worker.start()

    def _setup_progress(self, value):
        self.setup_progress.setValue(value)
        if value < 30:
            self.setup_status.setText("Installing yt-dlp...")
        elif value < 70:
            self.setup_status.setText("Installing ffmpeg...")
        elif value < 95:
            self.setup_status.setText("Registering shortcuts and protocols...")
        else:
            self.setup_status.setText("Finishing setup...")

    def _setup_done(self):
        ffmpeg_refresh = bool(getattr(getattr(self, 'setup_worker', None), 'force_ffmpeg', False))
        self._setup_running = False
        self.btn_startstop.setEnabled(True)
        self.btn_startstop.setText("Stop Server" if self.server_running else "Start Server")
        self.setup_progress.setValue(100)
        self.setup_status.setText("ffmpeg refresh complete." if ffmpeg_refresh else "Setup complete.")
        self._append_log("ffmpeg refresh complete." if ffmpeg_refresh else "Setup complete. Starting server...")
        if ffmpeg_refresh:
            self._value('_ffmpeg_version_probe').reset()
            self._dependencies['reset_ffmpeg_capabilities_cache']()
            try:
                self.config.set("LastFfmpegCheck", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                self.config.save()
            except Exception as e:
                self._append_log(f"ffmpeg refreshed, but its check timestamp could not be saved: {e}")
        # v1.2.0: refresh the Tools panel version readout now that the
        # binaries are (re)installed.
        self._refresh_tools_status()
        if not self.server_running and not ffmpeg_refresh:
            self._start_server()
        QTimer.singleShot(1400, self.setup_status.hide)
        QTimer.singleShot(1400, self.setup_progress.hide)

    def _setup_failed(self, error):
        ffmpeg_refresh = bool(getattr(getattr(self, 'setup_worker', None), 'force_ffmpeg', False))
        self._setup_running = False
        self.btn_startstop.setEnabled(True)
        self.btn_startstop.setText("Stop Server" if self.server_running else "Start Server")
        self.setup_status.setText(
            "ffmpeg refresh failed. The previous copy is still installed."
            if ffmpeg_refresh else
            "Setup failed. Check the log for details."
        )
        self.setup_progress.hide()
        self._append_log(f"Setup error: {error}")

MainWindow = MainWindowCore


_OWNED_EXPORTS = {
    "repolish", "make_label", "make_section_label", "make_divider",
    "make_card", "make_status_badge", "download_status_tone",
    "human_status", "format_duration", "make_empty_state", "make_stat",
    "ReadinessProbe",
    "FolderPickerService",
    "SetupWorker", "SetupWorkerCore",
    "MainWindow", "MainWindowCore",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
