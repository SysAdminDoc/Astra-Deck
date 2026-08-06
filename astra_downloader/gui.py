"""PyQt presentation helpers and lazy legacy GUI compatibility boundary."""

import os
import csv
import json
import queue
import socket
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from PyQt6.QtCore import (
    QCoreApplication, QEasingCurve, QObject, QPropertyAnimation, QSize,
    QThread, QTimer, Qt, pyqtSignal,
)
from PyQt6.QtGui import QColor, QIcon, QPainter, QPen, QPixmap, QTextCursor
from PyQt6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QDialog, QDialogButtonBox, QFileDialog,
    QFrame, QGraphicsOpacityEffect, QHBoxLayout, QLabel, QLineEdit, QMainWindow,
    QMenu, QProgressBar, QPushButton, QScrollArea, QSizePolicy, QSpinBox,
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
    "sanitize_csv_cell",
    "ReadinessProbe",
    "SetupWorkerCore",
    "MainWindowCore",
    "GUI_ACCESSIBILITY_COLORS", "system_reduced_motion_enabled",
)

GUI_ACCESSIBILITY_COLORS = {
    "surface": "#0a0d12",
    "sidebar": "#080b0f",
    "log_surface": "#0d1218",
    "primary": "#fff8f4",
    "muted": "#8d97a4",
    "neutral": "#9ca5b0",
    "neutral_indicator": "#747f8d",
    "readiness_text": "#d9dde2",
    "log_text": "#b4bcc6",
    "success": "#75dcb1",
    "warning": "#edbd76",
    "danger": "#ff8d82",
}

CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_csv_cell(value):
    """Keep untrusted history text literal when opened by a spreadsheet."""
    if isinstance(value, str) and value.startswith(CSV_FORMULA_PREFIXES):
        return "'" + value
    return value


def system_reduced_motion_enabled():
    """Honor the Windows animation accessibility preference.

    ``ASTRA_REDUCED_MOTION`` is an explicit test/automation override; the
    production path reads SPI_GETCLIENTAREAANIMATION, which is disabled by
    Windows when the user turns off UI animations.
    """
    override = str(os.environ.get("ASTRA_REDUCED_MOTION", "")).strip().lower()
    if override in {"1", "true", "yes", "on"}:
        return True
    if override in {"0", "false", "no", "off"}:
        return False
    if os.name != "nt":
        return False
    try:
        import ctypes
        animations_enabled = ctypes.c_bool(True)
        success = ctypes.windll.user32.SystemParametersInfoW(
            0x1042, 0, ctypes.byref(animations_enabled), 0
        )
        return bool(success) and not animations_enabled.value
    except Exception:
        return False


def repolish(widget):
    widget.style().unpolish(widget)
    widget.style().polish(widget)
    widget.update()


def tr(text):
    """Translate a static companion UI string through the installed catalogue."""
    return QCoreApplication.translate("AstraDownloader", str(text))


def make_label(text, class_name=None, word_wrap=False):
    label = QLabel(tr(text))
    # Plain text, always. Most strings reaching a label are not ours — video
    # and channel titles come from remote metadata and error text is yt-dlp
    # output, and `clean_text` deliberately preserves `<` and `>`. Qt's default
    # AutoText would parse those as HTML: a title like
    # `Clip <img src="http://host/beacon.png">` renders as rich text and Qt
    # fetches the image, turning a queue row into an outbound request from a
    # loopback-only app. Setting the format at the one construction point
    # covers every current and future caller.
    label.setTextFormat(Qt.TextFormat.PlainText)
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


def make_vertical_divider():
    divider = QFrame()
    divider.setProperty("class", "verticalDivider")
    return divider


def make_card(class_name="card"):
    frame = QFrame()
    frame.setProperty("class", class_name)
    return frame


def make_status_badge(text, tone="neutral"):
    translated = tr(text)
    badge = QLabel(translated)
    badge.setTextFormat(Qt.TextFormat.PlainText)
    badge.setProperty("class", "badge")
    badge.setProperty("tone", tone)
    badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
    badge.setMinimumHeight(22)
    badge.setAccessibleName(f"{tr('Status')}: {translated}")
    return badge


def make_state_label(text, tone="neutral"):
    translated = tr(text)
    label = QLabel(f"\u25cf  {translated}")
    label.setTextFormat(Qt.TextFormat.PlainText)
    label.setProperty("class", "stateLabel")
    label.setProperty("tone", tone)
    label.setAccessibleName(f"{tr('Status')}: {translated}")
    return label


def make_line_icon(name, size=18):
    """Draw the rail icons from one quiet monochrome system.

    Geometry is authored on an 18 px grid. Pass a larger ``size`` (e.g. the
    36 px empty-state glyph) to rasterize the same paths crisply instead of
    upscaling an 18 px pixmap — the painter is scaled so both the coordinates
    and the 1.5 px stroke grow proportionally.
    """
    key = str(name).lower()
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
    if size != 18:
        painter.scale(size / 18, size / 18)
    painter.setPen(QPen(QColor("#aab2bd"), 1.5, Qt.PenStyle.SolidLine,
                        Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin))
    if key == "dashboard":
        for x, y in ((2, 2), (10, 2), (2, 10), (10, 10)):
            painter.drawRoundedRect(x, y, 6, 6, 1, 1)
    elif key == "downloads" or "download" in key:
        painter.drawLine(9, 2, 9, 12)
        painter.drawLine(5, 9, 9, 13)
        painter.drawLine(13, 9, 9, 13)
        painter.drawLine(3, 16, 15, 16)
    elif key == "history":
        painter.drawEllipse(2, 2, 14, 14)
        painter.drawLine(9, 5, 9, 9)
        painter.drawLine(9, 9, 12, 11)
    elif "start" in key or "resume" in key:
        painter.drawLine(5, 3, 15, 9)
        painter.drawLine(15, 9, 5, 15)
        painter.drawLine(5, 15, 5, 3)
    elif "stop" in key:
        painter.drawRoundedRect(4, 4, 10, 10, 1, 1)
    elif "pause" in key:
        painter.drawLine(6, 3, 6, 15)
        painter.drawLine(12, 3, 12, 15)
    elif "copy" in key:
        painter.drawRoundedRect(5, 3, 9, 11, 1, 1)
        painter.drawRoundedRect(2, 6, 9, 10, 1, 1)
    elif "folder" in key or "browse" in key or key == "show":
        painter.drawLine(2, 6, 7, 6)
        painter.drawLine(7, 6, 9, 8)
        painter.drawLine(9, 8, 16, 8)
        painter.drawRoundedRect(2, 5, 14, 11, 1, 1)
    elif "clear" in key or "cancel" in key:
        painter.drawLine(5, 6, 6, 16)
        painter.drawLine(13, 6, 12, 16)
        painter.drawLine(6, 16, 12, 16)
        painter.drawLine(4, 5, 14, 5)
        painter.drawLine(7, 2, 11, 2)
    elif "save" in key:
        painter.drawRoundedRect(3, 2, 12, 14, 1, 1)
        painter.drawLine(6, 2, 6, 7)
        painter.drawLine(6, 7, 12, 7)
        painter.drawEllipse(6, 10, 6, 4)
    elif any(word in key for word in ("regenerate", "reinstall", "update", "retry")):
        painter.drawArc(3, 3, 12, 12, 35 * 16, 275 * 16)
        painter.drawLine(12, 2, 15, 4)
        painter.drawLine(15, 4, 14, 8)
    elif "reveal" in key:
        painter.drawEllipse(2, 5, 14, 8)
        painter.drawEllipse(7, 7, 4, 4)
    elif "diagnostic" in key:
        painter.drawRoundedRect(3, 2, 12, 14, 1, 1)
        painter.drawLine(6, 6, 12, 6)
        painter.drawLine(6, 9, 12, 9)
        painter.drawLine(6, 12, 10, 12)
    elif key in ("up", "down"):
        direction = -1 if key == "up" else 1
        y_tip = 4 if direction == -1 else 14
        y_tail = 14 if direction == -1 else 4
        painter.drawLine(9, y_tail, 9, y_tip)
        painter.drawLine(9, y_tip, 5, y_tip - (4 * direction))
        painter.drawLine(9, y_tip, 13, y_tip - (4 * direction))
    elif "previous" in key or "next" in key:
        direction = -1 if "previous" in key else 1
        x_tip = 5 if direction == -1 else 13
        x_tail = 12 if direction == -1 else 6
        painter.drawLine(x_tail, 3, x_tip, 9)
        painter.drawLine(x_tip, 9, x_tail, 15)
    elif "sign-in" in key or "signin" in key:
        painter.drawEllipse(2, 6, 7, 7)
        painter.drawLine(8, 9, 16, 9)
        painter.drawLine(13, 9, 13, 13)
        painter.drawLine(16, 9, 16, 12)
    elif "export" in key:
        painter.drawLine(9, 2, 9, 12)
        painter.drawLine(5, 6, 9, 2)
        painter.drawLine(13, 6, 9, 2)
        painter.drawLine(3, 10, 3, 16)
        painter.drawLine(3, 16, 15, 16)
        painter.drawLine(15, 16, 15, 10)
    else:
        painter.drawLine(2, 5, 16, 5)
        painter.drawLine(2, 9, 16, 9)
        painter.drawLine(2, 13, 16, 13)
        painter.drawEllipse(5, 3, 4, 4)
        painter.drawEllipse(10, 7, 4, 4)
        painter.drawEllipse(4, 11, 4, 4)
    painter.end()
    return QIcon(pixmap)


def download_status_tone(status):
    if status == "complete":
        return "success"
    if status in ("failed", "cancelled"):
        return "danger"
    if status == "skipped":
        return "warning"
    if status in ("merging", "extracting", "trimming", "queued", "pending", "paused", "needs-auth"):
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
        "trimming": "Trimming",
        "complete": "Complete",
        "failed": "Failed",
        "cancelled": "Cancelled",
        "skipped": "Nothing downloaded",
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
    frame.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
    layout = QVBoxLayout(frame)
    layout.setContentsMargins(36, 28, 36, 28)
    layout.setSpacing(9)
    layout.addStretch(2)
    glyph = QLabel()
    glyph.setProperty("class", "emptyGlyph")
    glyph.setPixmap(make_line_icon("Downloads" if "Queue" in title else "History", size=36).pixmap(36, 36))
    glyph.setAlignment(Qt.AlignmentFlag.AlignCenter)
    layout.addWidget(glyph)
    empty_title = make_label(title, "emptyTitle")
    empty_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
    layout.addWidget(empty_title)
    empty_body = make_label(body, "emptyBody", word_wrap=True)
    empty_body.setAlignment(Qt.AlignmentFlag.AlignCenter)
    layout.addWidget(empty_body)
    if action_text and callable(action):
        translated_action = tr(action_text)
        button = QPushButton(translated_action)
        button.setProperty("class", "secondary")
        button.setAccessibleName(translated_action)
        button.setCursor(Qt.CursorShape.PointingHandCursor)
        button.clicked.connect(action)
        layout.addSpacing(8)
        layout.addWidget(button, 0, Qt.AlignmentFlag.AlignCenter)
    layout.addStretch(3)
    return frame


def make_stat(label_text, value_text="0", hint_text=""):
    frame = QFrame()
    frame.setProperty("class", "stat")
    layout = QVBoxLayout(frame)
    layout.setContentsMargins(14, 10, 20, 10)
    layout.setSpacing(4)
    label = make_label(label_text, "metricLabel")
    value = QLabel(value_text)
    value.setTextFormat(Qt.TextFormat.PlainText)
    value.setAlignment(Qt.AlignmentFlag.AlignLeft)
    value.setProperty("class", "metricValue")
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
        self._dialog_open = False
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(150)

    def _tick(self):
        if self._dialog_open:
            # dialog.exec() below spins a nested event loop that keeps
            # delivering this 150 ms timer. Draining the queue here would
            # stack a second native dialog on top of the open one. Leave the
            # request queued — the bounded request queue keeps the route's
            # 409 "already open" contract for further callers — and service
            # it on the first tick after the open dialog closes.
            return
        try:
            request = self._request_queue.get_nowait()
        except queue.Empty:
            return
        cancellation = request.get('cancelled')
        if cancellation is not None:
            is_cancelled = (
                cancellation.is_set()
                if hasattr(cancellation, 'is_set')
                else bool(cancellation)
            )
            if is_cancelled:
                # The Flask caller can time out while an earlier dialog is
                # open.  Do not turn that orphaned request into a new native
                # dialog when the first one finally closes.
                return
        response_queue = request['response']
        self._dialog_open = True
        try:
            cancellation = request.get('cancelled')
            if cancellation is not None:
                is_cancelled = (
                    cancellation.is_set()
                    if hasattr(cancellation, 'is_set')
                    else bool(cancellation)
                )
                if is_cancelled:
                    return
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
        finally:
            self._dialog_open = False


_REQUIRED_SETUP_DEPENDENCIES = frozenset({
    'DEFAULT_CONFIG',
    'FFMPEG_PATH',
    'FFMPEG_SHA256_ASSET',
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
                # reason: an absent or locked failed download is already unusable
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
                # reason: checksum recovery cleanup is best-effort before the retry
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
                            tmp_zip, self._value('FFMPEG_SHA256_URL'),
                            asset_name=self._value('FFMPEG_SHA256_ASSET'), label="ffmpeg",
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
                        # reason: helper archive cleanup is best-effort after verification or failure
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
    'DOWNLOAD_TERMINAL_STATES',
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
    'evaluate_sabr_support',
    'get_ffmpeg_version',
    'get_recent_log_entries',
    'get_ytdlp_version',
    'SITE_LOGIN_BROWSERS',
    'is_youtube_url',
    'looks_like_media_link',
    'maybe_auto_update_ytdlp',
    'normalize_output_dir',
    'normalize_download_section',
    'normalize_output_template',
    'normalize_proxy',
    'normalize_rate_limit',
    'normalize_sublangs',
    'normalize_url',
    'query_history_entries',
    'reset_deno_runtime_cache',
    'reset_ffmpeg_capabilities_cache',
    'write_persistent_log',
})


class MainWindowCore(QMainWindow):
    log_message = pyqtSignal(str)
    instance_command = pyqtSignal(str)
    tools_update_finished = pyqtSignal(dict)
    tools_status_text_ready = pyqtSignal(str)
    site_login_finished = pyqtSignal(dict)

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
        # Download ids already accounted for by the completion notifier, so a
        # finished download notifies at most once and never re-fires each tick.
        self._seen_complete = set()
        self._cleared_history_snapshot = []
        self._history_offset = 0
        self._history_page_size = 50
        self._downloads_signature = None
        self._subscriptions_signature = None
        self._download_widgets = {}
        self._clipboard_last_seen = ""
        self._clipboard_staged_url = ""
        self.log_message.connect(self._append_log)
        self.instance_command.connect(self._handle_instance_command)
        self.tools_update_finished.connect(self._finish_ytdlp_update)
        self.tools_status_text_ready.connect(self._set_tools_status_text)
        self.site_login_finished.connect(self._finish_site_login_import)

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
        sidebar.setFixedWidth(232)
        self.sidebar = sidebar
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)

        # Brand
        brand = QWidget()
        self.brand_widget = brand
        brand_layout = QHBoxLayout(brand)
        brand_layout.setContentsMargins(20, 22, 16, 28)
        brand_layout.setSpacing(10)
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
                "background:#ff6552;color:#180706;border-radius:8px;"
                "font-size:18px;font-weight:800;"
            )
        brand_copy = QVBoxLayout()
        brand_copy.setSpacing(2)
        title_lbl = make_label("ASTRA DOWNLOADER")
        title_lbl.setStyleSheet(
            "font-size: 12px; font-weight: 750; "
            f"color: {GUI_ACCESSIBILITY_COLORS['primary']}; letter-spacing: .35px;"
        )
        ver_lbl = make_label(f"LOCAL  ·  v{self._value('APP_VERSION')}", "muted")
        ver_lbl.setStyleSheet(
            f"font-size: 11px; color: {GUI_ACCESSIBILITY_COLORS['muted']};"
        )
        brand_copy.addWidget(title_lbl)
        brand_copy.addWidget(ver_lbl)
        brand_layout.addWidget(brand_icon)
        brand_layout.addLayout(brand_copy, 1)
        sidebar_layout.addWidget(brand)

        # Nav buttons
        self.nav_buttons = []
        self._page_names = [
            "Dashboard", "Downloads", "History", "Subscriptions",
            "Sign-ins", "Settings",
        ]
        for name in self._page_names:
            translated_name = tr(name)
            btn = QPushButton(translated_name)
            btn.setProperty("class", "nav")
            btn.setCheckable(True)
            btn.setAutoExclusive(True)
            btn.setAccessibleName(f"{translated_name} {tr('page')}")
            btn.setIcon(make_line_icon(name))
            btn.setIconSize(QSize(18, 18))
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setToolTip(f"{tr('Open')} {translated_name}")
            btn.clicked.connect(lambda checked, n=name: self._nav_click(n))
            sidebar_layout.addWidget(btn)
            self.nav_buttons.append(btn)

        sidebar_layout.addStretch()

        # Status dot
        status_row = QHBoxLayout()
        status_row.setContentsMargins(22, 0, 18, 22)
        status_row.setSpacing(8)
        self.status_dot = make_label("\u2022", "stateDot")
        self.status_dot.setProperty("tone", "neutral")
        self.status_dot.setAccessibleName("Server status indicator: Stopped")
        self.status_label = make_state_label("Stopped", "neutral")
        self.status_label.setText("Stopped")
        self.status_label.setAccessibleName("Server status: Stopped")
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
        self._build_subscriptions()
        self._build_site_logins()
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
        self._clipboard = QApplication.clipboard()
        self._clipboard.dataChanged.connect(self._handle_clipboard_change)

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
        # Let the first window frame render before probing external tools.
        # Both getters can shell out for up to five seconds on a cold cache;
        # scheduling the existing worker-backed refresh after construction
        # keeps startup responsive without sacrificing version visibility.
        self.tools_status_timer = QTimer(self)
        self.tools_status_timer.setSingleShot(True)
        self.tools_status_timer.timeout.connect(self._refresh_tools_status)
        self.tools_status_timer.start(0)

        if start_minimized:
            QTimer.singleShot(100, self._minimize_to_tray)

    def _make_page_header(self, title, subtitle):
        header = QVBoxLayout()
        header.setSpacing(4)
        header.addWidget(make_label(title, "title"))
        if subtitle:
            header.addWidget(make_label(subtitle, "subtitle", word_wrap=True))
        return header

    def _make_settings_group(self, title):
        group = QFrame()
        group.setProperty("class", "settingsGroup")
        outer = QHBoxLayout(group)
        outer.setContentsMargins(0, 13, 0, 13)
        outer.setSpacing(24)
        heading = make_label(title, "settingsSection")
        heading.setFixedWidth(142)
        heading.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        outer.addWidget(heading)
        content = QVBoxLayout()
        content.setSpacing(9)
        outer.addLayout(content, 1)
        return group, content

    def _make_tool_button(self, text, class_name="secondary"):
        translated = tr(text)
        btn = QPushButton(translated)
        btn.setProperty("class", class_name)
        btn.setIcon(make_line_icon(text))
        btn.setIconSize(QSize(15, 15))
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setAccessibleName(translated)
        return btn

    def _make_readiness_row(self, key, label_text, value_text="Checking"):
        row = QFrame()
        row.setProperty("class", "readinessRow")
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(0, 8, 0, 8)
        row_layout.setSpacing(8)
        dot = make_label("●", "readinessDot")
        dot.setProperty("tone", "neutral")
        dot.setProperty("statusLabel", label_text)
        dot.setAccessibleName(f"{label_text} status indicator: {value_text}")
        dot.setFixedWidth(12)
        row_layout.addWidget(dot)
        name = make_label(label_text, "fieldHint")
        row_layout.addWidget(name, 1)
        value = make_label(value_text, "readinessValue")
        value.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        value.setAccessibleName(f"{label_text} status: {value_text}")
        row_layout.addWidget(value)
        self.readiness_values[key] = (dot, value)
        return row

    def _set_readiness(self, key, text, tone="neutral", tooltip=""):
        widgets = self.readiness_values.get(key)
        if not widgets:
            return
        dot, value = widgets
        dot.setProperty("tone", tone)
        value.setText(text)
        label_text = str(dot.property("statusLabel") or key)
        dot.setAccessibleName(f"{label_text} status indicator: {text}")
        value.setAccessibleName(f"{label_text} status: {text}")
        value.setToolTip(tooltip)
        dot.setToolTip(tooltip)
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

        try:
            sabr = self._dependencies['evaluate_sabr_support'](yt_dlp or "")
        except Exception:
            sabr = "limited"
        if sabr == "supported":
            self._set_readiness("sabr", "Supported", "success")
        else:
            self._set_readiness(
                "sabr", "Limited", "warning",
                "The installed yt-dlp streams SABR formats through fallback "
                "clients. Updates flip this automatically once native "
                "support ships.",
            )

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
            self._set_readiness(
                "provider", "Update", "warning",
                "Proof-of-origin provider is running but out of date. "
                "Downloads use the web client with PO tokens.",
            )
        elif provider.get("ok"):
            self._set_readiness(
                "provider", provider.get("version") or "Ready", "success",
                "Downloads use the web client with proof-of-origin tokens.",
            )
        else:
            self._set_readiness(
                "provider", "Fallback", "neutral",
                "No proof-of-origin provider is running. Downloads fall back to "
                "the token-exempt tv and android_vr clients.",
            )


    def _value(self, name):
        value = self._dependencies[name]
        return value() if callable(value) else value

    def _build_dashboard(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(38, 26, 38, 24)
        layout.setSpacing(16)

        layout.addLayout(self._make_page_header(
            "Dashboard",
            ""
        ))

        # Server control
        ctrl = make_card("serverControl")
        ctrl_layout = QVBoxLayout(ctrl)
        ctrl_layout.setContentsMargins(0, 10, 20, 14)
        ctrl_layout.setSpacing(13)

        state_row = QHBoxLayout()
        state_row.setSpacing(10)
        self.server_badge = make_label("\u25cf", "stateDot")
        self.server_badge.setProperty("tone", "neutral")
        self.server_badge.setAccessibleName("Dashboard server status indicator: Offline")
        self.dash_status = make_label("Server offline", "heroTitle")
        state_row.addWidget(self.server_badge)
        state_row.addWidget(self.dash_status)
        state_row.addStretch()
        ctrl_layout.addLayout(state_row)

        endpoint_row = QHBoxLayout()
        endpoint_row.setSpacing(14)
        self.dash_endpoint = make_label(f"http://127.0.0.1:{self.config.get('ServerPort', self._value('SERVER_PORT'))}", "secondary")
        self.dash_endpoint.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.dash_hint = make_label("Local only \u00b7 token required", "fieldHint")
        endpoint_row.addWidget(self.dash_endpoint)
        endpoint_row.addWidget(make_vertical_divider())
        endpoint_row.addWidget(self.dash_hint)
        endpoint_row.addStretch()
        ctrl_layout.addLayout(endpoint_row)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.btn_startstop = self._make_tool_button("Start Server", "primary")
        self.btn_startstop.clicked.connect(self._toggle_server)
        actions.addWidget(self.btn_startstop)
        btn_copy = self._make_tool_button("Copy endpoint")
        btn_copy.clicked.connect(self._copy_endpoint)
        actions.addWidget(btn_copy)
        btn_folder = self._make_tool_button("Open folder")
        btn_folder.clicked.connect(self._open_folder)
        actions.addWidget(btn_folder)
        actions.addStretch()
        ctrl_layout.addLayout(actions)

        self.setup_status = make_label("", "fieldHint")
        self.setup_status.setAccessibleName("Download tool setup status")
        self.setup_status.hide()
        self.setup_progress = QProgressBar()
        self.setup_progress.setRange(0, 100)
        self.setup_progress.setAccessibleName("Download tool setup progress")
        self.setup_progress.setValue(0)
        self.setup_progress.setTextVisible(False)
        self.setup_progress.hide()
        ctrl_layout.addWidget(self.setup_status)
        ctrl_layout.addWidget(self.setup_progress)
        self.readiness_values = {}
        readiness = make_card("readiness")
        readiness_layout = QVBoxLayout(readiness)
        readiness_layout.setContentsMargins(22, 10, 0, 8)
        readiness_layout.setSpacing(1)
        readiness_header = QHBoxLayout()
        readiness_header.addWidget(make_label("System readiness", "panelTitle"))
        readiness_header.addStretch()
        readiness_layout.addLayout(readiness_header)
        readiness_layout.addWidget(self._make_readiness_row("server", "Local API", "Stopped"))
        readiness_layout.addWidget(self._make_readiness_row("ytDlp", "yt-dlp"))
        readiness_layout.addWidget(self._make_readiness_row("ffmpeg", "FFmpeg"))
        readiness_layout.addWidget(self._make_readiness_row("deno", "JavaScript runtime"))
        # SABR support is derived from the yt-dlp version by the async
        # readiness probe (_apply_readiness) — never probe yt-dlp --version
        # synchronously here: this runs on the GUI thread before first paint
        # and a cold probe costs up to 5s. It also keeps the pill fresh after
        # setup installs or updates yt-dlp mid-session.
        readiness_layout.addWidget(self._make_readiness_row("sabr", "SABR", "Limited"))
        self._set_readiness("sabr", "Limited", "warning")

        hero = QHBoxLayout()
        hero.setSpacing(0)
        hero.addWidget(ctrl, 3)
        hero.addWidget(make_vertical_divider())
        hero.addWidget(readiness, 2)
        layout.addLayout(hero)

        layout.addWidget(make_divider())

        # Metrics — one strip, with rhythm supplied by separators rather than cards.
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(0)
        self._stat_frame_active, self.stat_active = make_stat("Active", "0", "In progress")
        self.stat_active.setProperty("tone", "accent")
        self._stat_frame_completed, self.stat_completed = make_stat("Completed", "0", "This session")
        self._stat_frame_uptime, self.stat_uptime = make_stat("Uptime", "--", "Since launch")
        self._stat_frame_port, self.stat_port = make_stat("Port", str(self.config.get("ServerPort", self._value('SERVER_PORT'))), "Local API")
        for frame in (self._stat_frame_active, self._stat_frame_completed,
                      self._stat_frame_uptime, self._stat_frame_port):
            stats_layout.addWidget(frame)
        self._stat_frame_port.setProperty("last", "true")
        layout.addLayout(stats_layout)
        layout.addWidget(make_divider())

        log_header = QHBoxLayout()
        log_header.addWidget(make_label("Server log", "panelTitle"))
        log_header.addStretch()
        btn_clear_log = self._make_tool_button("Clear", "ghost")
        btn_clear_log.clicked.connect(self._clear_log)
        log_header.addWidget(btn_clear_log)
        btn_diag = self._make_tool_button("Review diagnostics", "ghost")
        btn_diag.setToolTip("Review the redacted support payload before copying it.")
        btn_diag.clicked.connect(self._copy_diagnostics)
        log_header.addWidget(btn_diag)
        layout.addLayout(log_header)
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setAccessibleName("Server log")
        self.log_text.setAccessibleDescription(
            "Recent local companion events. Use Clear to remove visible entries."
        )
        self.log_text.setMinimumHeight(180)
        self.log_text.document().setMaximumBlockCount(300)
        self.log_text.setPlainText("Ready.")
        layout.addWidget(self.log_text, 1)

        self.tabs.addTab(page, "Dashboard")

    def _build_downloads(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(38, 26, 38, 24)
        layout.setSpacing(12)
        layout.addLayout(self._make_page_header("Downloads", ""))

        quick_card = make_card()
        quick_layout = QVBoxLayout(quick_card)
        quick_layout.setContentsMargins(16, 14, 16, 14)
        quick_layout.setSpacing(10)
        quick_layout.addWidget(make_section_label("Quick download"))
        url_row = QHBoxLayout()
        self.quick_download_url = QLineEdit()
        self.quick_download_url.setAccessibleName("Video URL")
        self.quick_download_url.setPlaceholderText(
            tr("Paste any video link — YouTube, Reddit, X, TikTok, Vimeo, "
               "or several at once")
        )
        self.quick_download_url.returnPressed.connect(self._start_quick_download)
        self.quick_download_url.textEdited.connect(self._quick_download_url_edited)
        url_row.addWidget(self.quick_download_url, 1)
        self.btn_quick_download = self._make_tool_button("Add to queue", "primary")
        self.btn_quick_download.clicked.connect(self._start_quick_download)
        url_row.addWidget(self.btn_quick_download)
        quick_layout.addLayout(url_row)

        options_row = QHBoxLayout()
        options_row.setSpacing(8)
        self.quick_download_type = QComboBox()
        self.quick_download_type.setAccessibleName("Download type")
        self.quick_download_type.addItem(tr("Video"), False)
        self.quick_download_type.addItem(tr("Audio"), True)
        self.quick_download_type.currentIndexChanged.connect(
            self._sync_quick_download_options
        )
        options_row.addWidget(self.quick_download_type)
        self.quick_download_format = QComboBox()
        self.quick_download_format.setAccessibleName("Download format")
        options_row.addWidget(self.quick_download_format)
        self.quick_download_quality = QComboBox()
        self.quick_download_quality.setAccessibleName("Download quality")
        for label, value in (
            (tr("Best"), "best"), ("2160p", "2160"), ("1440p", "1440"),
            ("1080p", "1080"), ("720p", "720"), ("480p", "480"),
        ):
            self.quick_download_quality.addItem(label, value)
        options_row.addWidget(self.quick_download_quality)
        options_row.addStretch()
        options_row.addWidget(make_label("Clip from", "fieldHint"))
        self.quick_download_start = QLineEdit()
        self.quick_download_start.setAccessibleName("Clip start timestamp")
        self.quick_download_start.setPlaceholderText("0:00")
        self.quick_download_start.setMaximumWidth(84)
        options_row.addWidget(self.quick_download_start)
        options_row.addWidget(make_label("to", "fieldHint"))
        self.quick_download_end = QLineEdit()
        self.quick_download_end.setAccessibleName("Clip end timestamp")
        self.quick_download_end.setPlaceholderText("1:30")
        self.quick_download_end.setMaximumWidth(84)
        options_row.addWidget(self.quick_download_end)
        quick_layout.addLayout(options_row)
        quick_layout.addWidget(make_label(
            tr("Any site yt-dlp supports works here. Clip ranges apply to a "
               "single link."),
            "fieldHint",
        ))
        self.quick_download_status = make_label("", "fieldHint")
        self.quick_download_status.setAccessibleName("Quick download status")
        self.quick_download_status.hide()
        quick_layout.addWidget(self.quick_download_status)
        layout.addWidget(quick_card)
        self._sync_quick_download_options()

        toolbar = QHBoxLayout()
        self.queue_capacity_badge = make_label("0 / 200 jobs", "toolbarMeta")
        self.queue_capacity_badge.setToolTip("Running and pending downloads stored in the durable queue.")
        toolbar.addWidget(self.queue_capacity_badge)
        toolbar.addStretch()
        self.btn_queue_pause = self._make_tool_button(
            "Pause intake", "ghost"
        )
        self.btn_queue_pause.setToolTip(
            "Pause starting pending downloads. Downloads already running will continue."
        )
        self.btn_queue_pause.clicked.connect(self._toggle_queue_intake)
        toolbar.addWidget(self.btn_queue_pause)
        layout.addLayout(toolbar)
        layout.addWidget(make_divider())

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        self.downloads_list_layout = QVBoxLayout(content)
        self.downloads_list_layout.setContentsMargins(0, 0, 0, 0)
        self.downloads_list_layout.setSpacing(10)
        scroll.setWidget(content)
        self.downloads_scroll = scroll
        layout.addWidget(scroll, 1)
        self.tabs.addTab(page, "Downloads")

    def _sync_quick_download_options(self, *_args):
        if not hasattr(self, "quick_download_format"):
            return
        audio_only = bool(self.quick_download_type.currentData())
        current = self.quick_download_format.currentData()
        values = (
            (("MP3", "mp3"), ("M4A", "m4a"), ("Opus", "opus"),
             ("FLAC", "flac"), ("WAV", "wav"))
            if audio_only else
            (("MP4", "mp4"), ("MKV", "mkv"), ("WebM", "webm"))
        )
        self.quick_download_format.blockSignals(True)
        self.quick_download_format.clear()
        for label, value in values:
            self.quick_download_format.addItem(label, value)
        restored = self.quick_download_format.findData(current)
        if restored >= 0:
            self.quick_download_format.setCurrentIndex(restored)
        self.quick_download_format.blockSignals(False)
        self.quick_download_quality.setEnabled(not audio_only)

    def _start_quick_download(self):
        # A URL can never contain whitespace (normalize_url rejects it), so
        # splitting on whitespace safely turns a multi-link paste — the common
        # case when the companion is used standalone — into a batch enqueue.
        urls = self.quick_download_url.text().split()
        start = self.quick_download_start.text().strip()
        end = self.quick_download_end.text().strip()
        section = None
        if not urls:
            self._set_quick_download_status(
                "Paste a video link first.", "error"
            )
            return
        if start or end:
            if len(urls) > 1:
                self._set_quick_download_status(
                    "Clip ranges apply to a single link. Remove the extra "
                    "links or clear the clip range.",
                    "error",
                )
                return
            section, error = self._dependencies['normalize_download_section']({
                "start": start,
                "end": end,
            })
            if error:
                self._set_quick_download_status(error, "error")
                return

        queued = []
        failures = []
        for url in urls:
            dl_id, error = self.dl_manager.start_download(
                url=url,
                audio_only=bool(self.quick_download_type.currentData()),
                fmt=self.quick_download_format.currentData(),
                quality=self.quick_download_quality.currentData() or "best",
                section=section,
            )
            if error:
                failures.append((url, error))
            else:
                queued.append(dl_id)

        if queued:
            if len(queued) == 1:
                message = f"Queued {queued[0]}" + (
                    " for an accurate ffmpeg clip." if section else "."
                )
            else:
                message = f"Queued {len(queued)} downloads."
            if failures:
                message += f" {len(failures)} link(s) rejected: {failures[0][1]}"
            self._set_quick_download_status(
                message, "warning" if failures else "success"
            )
            self._clipboard_staged_url = ""
            self.quick_download_url.clear()
            self.quick_download_start.clear()
            self.quick_download_end.clear()
            self._append_log(
                f"Queued {len(queued)} download(s) from the quick download box."
            )
            self._update_ui()
        else:
            self._set_quick_download_status(failures[0][1], "error")

    def _set_quick_download_status(self, message, state):
        self.quick_download_status.setText(message)
        self.quick_download_status.setProperty("state", state)
        self.quick_download_status.show()
        repolish(self.quick_download_status)

    def _build_history(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(38, 26, 38, 24)
        layout.setSpacing(12)
        header = QHBoxLayout()
        header.addLayout(self._make_page_header("History", ""), 1)
        self.btn_clear_history = self._make_tool_button("Clear history", "ghost")
        self.btn_clear_history.setToolTip("Remove saved history entries. Downloaded files are not deleted.")
        self.btn_clear_history.clicked.connect(self._clear_history)
        header.addWidget(self.btn_clear_history, 0, Qt.AlignmentFlag.AlignTop)
        self.btn_undo_clear_history = self._make_tool_button("Undo clear", "ghost")
        self.btn_undo_clear_history.setToolTip("Restore the history entries cleared in this session.")
        self.btn_undo_clear_history.clicked.connect(self._undo_clear_history)
        self.btn_undo_clear_history.hide()
        header.addWidget(self.btn_undo_clear_history, 0, Qt.AlignmentFlag.AlignTop)
        self.btn_export_history = self._make_tool_button("Export filtered", "secondary")
        self.btn_export_history.setToolTip("Export every row matching the current filters as CSV.")
        self.btn_export_history.clicked.connect(self._export_history)
        header.addWidget(self.btn_export_history, 0, Qt.AlignmentFlag.AlignTop)
        layout.addLayout(header)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        self.history_search = QLineEdit()
        self.history_search.setAccessibleName("Search download history")
        self.history_search.setPlaceholderText("Search title or filename")
        self.history_search.setClearButtonEnabled(True)
        filters.addWidget(self.history_search, 2)
        self.history_status = QComboBox()
        self.history_status.setAccessibleName("History status")
        self.history_status.addItem(tr("All statuses"), "")
        self.history_status.addItem(tr("Complete"), "complete")
        filters.addWidget(self.history_status)
        self.history_format = QComboBox()
        self.history_format.setAccessibleName("History format")
        self.history_format.addItem(tr("All formats"), "")
        for fmt in ("mp4", "mkv", "webm", "mp3", "m4a", "opus", "flac", "wav"):
            self.history_format.addItem(fmt.upper(), fmt)
        filters.addWidget(self.history_format)
        self.history_sort = QComboBox()
        self.history_sort.setAccessibleName("History sort order")
        self.history_sort.addItem(tr("Newest first"), "newest")
        self.history_sort.addItem(tr("Oldest first"), "oldest")
        filters.addWidget(self.history_sort)
        layout.addLayout(filters)

        range_row = QHBoxLayout()
        range_row.setSpacing(8)
        range_row.addWidget(make_label("Saved from", "fieldHint"))
        self.history_date_from = QLineEdit()
        self.history_date_from.setAccessibleName("History start date")
        self.history_date_from.setPlaceholderText("YYYY-MM-DD")
        self.history_date_from.setMaximumWidth(125)
        range_row.addWidget(self.history_date_from)
        range_row.addWidget(make_label("through", "fieldHint"))
        self.history_date_to = QLineEdit()
        self.history_date_to.setAccessibleName("History end date")
        self.history_date_to.setPlaceholderText("YYYY-MM-DD")
        self.history_date_to.setMaximumWidth(125)
        range_row.addWidget(self.history_date_to)
        range_row.addStretch()
        self.history_meta = make_label("0 of 0 retained", "toolbarMeta")
        range_row.addWidget(self.history_meta)
        self.btn_history_prev = self._make_tool_button("Previous", "ghost")
        self.btn_history_prev.clicked.connect(lambda: self._move_history_page(-1))
        range_row.addWidget(self.btn_history_prev)
        self.btn_history_next = self._make_tool_button("Next", "ghost")
        self.btn_history_next.clicked.connect(lambda: self._move_history_page(1))
        range_row.addWidget(self.btn_history_next)
        layout.addLayout(range_row)

        for signal in (
            self.history_search.textChanged,
            self.history_status.currentIndexChanged,
            self.history_format.currentIndexChanged,
            self.history_sort.currentIndexChanged,
            self.history_date_from.textChanged,
            self.history_date_to.textChanged,
        ):
            signal.connect(self._history_filters_changed)

        columns = QFrame()
        columns.setProperty("class", "listHeader")
        columns_layout = QHBoxLayout(columns)
        columns_layout.setContentsMargins(0, 8, 0, 10)
        columns_layout.setSpacing(12)
        columns_layout.addWidget(make_label("File", "columnLabel"), 4)
        for text in ("Format", "Quality", "Duration", "Saved"):
            label = make_label(text, "columnLabel")
            label.setFixedWidth(92)
            columns_layout.addWidget(label)
        columns_layout.addSpacing(54)
        layout.addWidget(columns)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        self.history_container = QVBoxLayout(content)
        self.history_container.setContentsMargins(0, 0, 0, 0)
        self.history_container.setSpacing(10)
        scroll.setWidget(content)
        layout.addWidget(scroll, 1)
        self.tabs.addTab(page, "History")

    def _subscription_manager(self):
        value = self._dependencies.get('subscription_manager')
        return value() if callable(value) else value

    def _build_subscriptions(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(38, 26, 38, 24)
        layout.setSpacing(14)
        layout.addLayout(self._make_page_header(
            "Subscriptions",
            "Watch YouTube channels or playlists on a schedule and queue only new uploads.",
        ))

        add_card, add_layout = self._make_settings_group("New subscription")
        url_row = QHBoxLayout()
        self.subscription_url = QLineEdit()
        self.subscription_url.setAccessibleName("Subscription channel or playlist URL")
        self.subscription_url.setPlaceholderText("https://www.youtube.com/@channel or playlist URL")
        url_row.addWidget(self.subscription_url, 1)
        interval_label = make_label("Every", "fieldHint")
        url_row.addWidget(interval_label)
        self.subscription_interval = QSpinBox()
        self.subscription_interval.setRange(5, 10080)
        self.subscription_interval.setValue(60)
        self.subscription_interval.setSuffix(" min")
        self.subscription_interval.setAccessibleName("Subscription scan interval in minutes")
        url_row.addWidget(self.subscription_interval)
        self.btn_add_subscription = self._make_tool_button("Add subscription", "primary")
        self.btn_add_subscription.clicked.connect(self._add_subscription)
        url_row.addWidget(self.btn_add_subscription)
        add_layout.addLayout(url_row)
        self.subscription_status = make_label("Subscriptions are ready when the local companion is running.", "toolbarMeta", word_wrap=True)
        add_layout.addWidget(self.subscription_status)
        layout.addWidget(add_card)

        self.subscription_scroll = QScrollArea()
        self.subscription_scroll.setWidgetResizable(True)
        content = QWidget()
        self.subscription_container = QVBoxLayout(content)
        self.subscription_container.setContentsMargins(0, 0, 0, 0)
        self.subscription_container.setSpacing(10)
        self.subscription_scroll.setWidget(content)
        layout.addWidget(self.subscription_scroll, 1)
        self.tabs.addTab(page, "Subscriptions")
        self._refresh_subscriptions(force=True)

    def _refresh_subscriptions(self, force=False):
        manager = self._subscription_manager()
        if manager is None:
            records = []
            payload = {}
        else:
            try:
                payload = manager.snapshot()
                records = payload.get("subscriptions", []) if isinstance(payload, dict) else []
            except Exception as error:  # noqa: BLE001
                payload = {}
                records = []
                self.subscription_status.setText(f"Could not read subscriptions: {error}")
        signature = json.dumps(records, sort_keys=True, default=str)
        if not force and signature == self._subscriptions_signature:
            return
        self._subscriptions_signature = signature
        self._clear_layout(self.subscription_container)
        if manager is None:
            self.subscription_container.addWidget(make_empty_state(
                "Subscriptions unavailable",
                "Start the Astra Downloader companion to manage scheduled channel scans.",
            ))
            self.subscription_container.addStretch()
            return
        archive = payload.get("archive", {}) if isinstance(payload, dict) else {}
        self.subscription_status.setText(
            f"{len(records)} configured · {archive.get('complete', 0)} archived · "
            f"{archive.get('queued', 0)} queued"
        )
        if not records:
            self.subscription_container.addWidget(make_empty_state(
                "No scheduled subscriptions",
                "Add a YouTube channel or playlist above. New uploads will be queued on its interval.",
            ))
            self.subscription_container.addStretch()
            return
        for record in records:
            row = QFrame()
            row.setProperty("class", "card")
            row_layout = QHBoxLayout(row)
            row_layout.setContentsMargins(16, 12, 16, 12)
            row_layout.setSpacing(10)
            enabled = QCheckBox()
            enabled.setChecked(bool(record.get("enabled", True)))
            enabled.setAccessibleName(f"Enable subscription {record.get('title') or record.get('url')}")
            enabled.toggled.connect(
                lambda checked, sub_id=record.get("id"): self._set_subscription_enabled(sub_id, checked)
            )
            row_layout.addWidget(enabled, 0, Qt.AlignmentFlag.AlignTop)
            copy_layout = QVBoxLayout()
            copy_layout.setSpacing(3)
            title = record.get("title") or record.get("url") or "Subscription"
            copy_layout.addWidget(make_label(title, "cardTitle"))
            copy_layout.addWidget(make_label(record.get("url", ""), "muted", word_wrap=True))
            next_scan = record.get("nextScanAt")
            if next_scan:
                try:
                    next_text = time.strftime("%Y-%m-%d %H:%M", time.localtime(float(next_scan)))
                except (TypeError, ValueError, OverflowError, OSError):
                    next_text = "pending"
            else:
                next_text = "paused"
            detail = (
                f"Every {record.get('intervalMinutes', 60)} min · next scan {next_text}"
            )
            if record.get("lastError"):
                detail += f" · {record['lastError']}"
            copy_layout.addWidget(make_label(detail, "toolbarMeta", word_wrap=True))
            row_layout.addLayout(copy_layout, 1)
            scan = self._make_tool_button("Scan now", "ghost")
            scan.clicked.connect(lambda checked=False, sub_id=record.get("id"): self._scan_subscription(sub_id))
            row_layout.addWidget(scan, 0, Qt.AlignmentFlag.AlignTop)
            remove = self._make_tool_button("Remove", "ghost")
            remove.clicked.connect(lambda checked=False, sub_id=record.get("id"): self._remove_subscription(sub_id))
            row_layout.addWidget(remove, 0, Qt.AlignmentFlag.AlignTop)
            self.subscription_container.addWidget(row)
        self.subscription_container.addStretch()

    # ── Site sign-ins ────────────────────────────────────────────────────
    def _build_site_logins(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(38, 26, 38, 24)
        layout.setSpacing(14)
        layout.addLayout(self._make_page_header(
            "Sign-ins",
            tr("Store a signed-in session so private or members-only videos "
               "download. Cookies stay on this PC and are only ever sent to "
               "the site they came from."),
        ))

        add_card, add_layout = self._make_settings_group(tr("Add a site sign-in"))
        site_row = QHBoxLayout()
        self.site_login_url = QLineEdit()
        self.site_login_url.setAccessibleName("Site address for the sign-in")
        self.site_login_url.setPlaceholderText(
            tr("Site address you signed in to — x.com, instagram.com, vimeo.com")
        )
        site_row.addWidget(self.site_login_url, 1)
        add_layout.addLayout(site_row)

        source_row = QHBoxLayout()
        source_row.setSpacing(8)
        source_row.addWidget(make_label(tr("Read from"), "fieldHint"))
        self.site_login_browser = QComboBox()
        self.site_login_browser.setAccessibleName("Browser to read cookies from")
        for browser in self._value('SITE_LOGIN_BROWSERS'):
            self.site_login_browser.addItem(browser.title(), browser)
        # Firefox is the one browser whose cookie store can still be read from
        # outside on Windows, so it is the default rather than whichever name
        # sorts first.
        firefox_index = self.site_login_browser.findData("firefox")
        if firefox_index >= 0:
            self.site_login_browser.setCurrentIndex(firefox_index)
        source_row.addWidget(self.site_login_browser)
        self.site_login_profile = QLineEdit()
        self.site_login_profile.setAccessibleName("Browser profile name or path")
        self.site_login_profile.setPlaceholderText(tr("Profile (optional)"))
        self.site_login_profile.setMaximumWidth(220)
        source_row.addWidget(self.site_login_profile)
        self.btn_site_login_browser = self._make_tool_button("Read from browser", "primary")
        self.btn_site_login_browser.clicked.connect(self._import_site_login_from_browser)
        source_row.addWidget(self.btn_site_login_browser)
        self.btn_site_login_file = self._make_tool_button("Import cookies.txt", "ghost")
        self.btn_site_login_file.clicked.connect(self._import_site_login_from_file)
        source_row.addWidget(self.btn_site_login_file)
        source_row.addStretch()
        add_layout.addLayout(source_row)

        add_layout.addWidget(make_label(
            tr("Chrome, Edge, and Brave 127+ encrypt their cookie store, so "
               "reading them from outside the browser usually fails — export a "
               "cookies.txt file from the browser and import that instead. "
               "Firefox can normally be read directly."),
            "toolbarMeta",
            word_wrap=True,
        ))
        self.site_login_status = make_label("", "fieldHint", word_wrap=True)
        self.site_login_status.setAccessibleName("Site sign-in status")
        self.site_login_status.hide()
        add_layout.addWidget(self.site_login_status)
        layout.addWidget(add_card)

        self.site_login_scroll = QScrollArea()
        self.site_login_scroll.setWidgetResizable(True)
        content = QWidget()
        self.site_login_container = QVBoxLayout(content)
        self.site_login_container.setContentsMargins(0, 0, 0, 0)
        self.site_login_container.setSpacing(10)
        self.site_login_scroll.setWidget(content)
        layout.addWidget(self.site_login_scroll, 1)
        self.tabs.addTab(page, "Sign-ins")
        self._refresh_site_logins(force=True)

    def _site_login_store(self):
        return getattr(self.dl_manager, "site_logins", None)

    def _open_site_login_for(self, url):
        """Jump to Sign-ins with the blocked download's site already filled in."""
        self._nav_click("Sign-ins")
        if url:
            self.site_login_url.setText(url)
            self.site_login_url.setFocus()
        self._show_site_login_status(
            tr("Import this site's cookies to unblock the download waiting on it."),
            "neutral",
        )

    def _refresh_site_logins(self, force=False):
        store = self._site_login_store()
        entries = []
        if store is not None:
            try:
                entries = store.entries()
            except Exception as error:  # noqa: BLE001
                self._show_site_login_status(
                    f"Could not read stored sign-ins: {error}", "error"
                )
        signature = json.dumps(entries, sort_keys=True, default=str)
        if not force and signature == getattr(self, "_site_logins_signature", None):
            return
        self._site_logins_signature = signature
        self._clear_layout(self.site_login_container)
        if not entries:
            self.site_login_container.addWidget(make_empty_state(
                tr("No stored sign-ins"),
                tr("Add one above for any site that only serves video to "
                   "signed-in viewers. YouTube downloads use the browser "
                   "extension instead and need nothing here."),
            ))
            self.site_login_container.addStretch()
            return
        for entry in entries:
            row = QFrame()
            row.setProperty("class", "card")
            row_layout = QHBoxLayout(row)
            row_layout.setContentsMargins(16, 12, 16, 12)
            row_layout.setSpacing(10)
            copy_layout = QVBoxLayout()
            copy_layout.setSpacing(3)
            copy_layout.addWidget(make_label(entry.get("site", ""), "cardTitle"))
            if entry.get("expired"):
                state = tr("Expired — sign in again to refresh it")
            elif not entry.get("stored"):
                state = tr("Missing on disk — import it again")
            elif entry.get("earliestExpiry"):
                try:
                    expires = time.strftime(
                        "%Y-%m-%d", time.localtime(float(entry["earliestExpiry"]))
                    )
                except (TypeError, ValueError, OverflowError, OSError):
                    expires = tr("unknown")
                state = f"{tr('First cookie expires')} {expires}"
            else:
                state = tr("Session cookies — valid until the site signs you out")
            count = int(entry.get("cookies", 0) or 0)
            copy_layout.addWidget(make_label(
                f"{count} {tr('cookie') if count == 1 else tr('cookies')} · "
                f"{tr('from')} {entry.get('source', 'import')} · {state}",
                "toolbarMeta",
                word_wrap=True,
            ))
            row_layout.addLayout(copy_layout, 1)
            remove = self._make_tool_button("Remove", "ghost")
            remove.clicked.connect(
                lambda checked=False, site=entry.get("site"): self._remove_site_login(site)
            )
            row_layout.addWidget(remove, 0, Qt.AlignmentFlag.AlignTop)
            self.site_login_container.addWidget(row)
        self.site_login_container.addStretch()

    def _show_site_login_status(self, message, state="neutral"):
        self.site_login_status.setText(message)
        self.site_login_status.setProperty("state", state)
        self.site_login_status.show()
        repolish(self.site_login_status)

    def _apply_site_login_result(self, result, error):
        if error:
            self._show_site_login_status(error, "error")
            return False
        site = (result or {}).get("site", "")
        count = (result or {}).get("cookies", 0)
        skipped = (result or {}).get("skipped", 0)
        message = f"{tr('Signed in to')} {site} — {count} {tr('cookies stored')}."
        if skipped:
            message += f" {skipped} {tr('cookies for other sites were discarded.')}"
        self._show_site_login_status(message, "success")
        self._append_log(f"Stored a site sign-in for {site} ({count} cookies).")
        self.site_login_url.clear()
        self._refresh_site_logins(force=True)
        return True

    def _import_site_login_from_browser(self):
        store = self._site_login_store()
        if store is None:
            self._show_site_login_status(
                tr("Site sign-ins are unavailable in this session."), "error"
            )
            return
        if getattr(self, "_site_login_reading", False):
            return
        # Reading a browser cookie store spawns yt-dlp and can take tens of
        # seconds (or hit a decryption failure), so it never runs on the GUI
        # thread — the window stays responsive and the result arrives by signal.
        self._site_login_reading = True
        self.btn_site_login_browser.setEnabled(False)
        self._show_site_login_status(tr("Reading cookies from the browser…"), "neutral")
        site = self.site_login_url.text()
        browser = self.site_login_browser.currentData()
        profile = self.site_login_profile.text()

        def worker():
            try:
                result, error = self.dl_manager.import_site_login_from_browser(
                    site, browser, profile
                )
            except Exception as exc:  # noqa: BLE001
                result, error = None, f"Reading browser cookies failed: {exc}"
            self.site_login_finished.emit({"result": result or {}, "error": error or ""})

        threading.Thread(target=worker, daemon=True).start()

    def _finish_site_login_import(self, payload):
        self._site_login_reading = False
        if hasattr(self, "btn_site_login_browser"):
            self.btn_site_login_browser.setEnabled(True)
        if not isinstance(payload, dict):
            return
        self._apply_site_login_result(
            payload.get("result") or None, payload.get("error") or None
        )

    def _import_site_login_from_file(self):
        store = self._site_login_store()
        if store is None:
            self._show_site_login_status(
                tr("Site sign-ins are unavailable in this session."), "error"
            )
            return
        path, _filter = QFileDialog.getOpenFileName(
            self,
            "Select the exported cookies.txt",
            str(Path.home()),
            "Cookie files (*.txt);;All files (*.*)",
        )
        if not path:
            return
        try:
            text = Path(path).read_text(encoding="utf-8", errors="replace")
        except OSError as error:
            self._show_site_login_status(f"Could not read that file: {error}", "error")
            return
        result, error = store.import_netscape_text(
            self.site_login_url.text(), text, source="cookies.txt"
        )
        self._apply_site_login_result(result, error)

    def _remove_site_login(self, site):
        store = self._site_login_store()
        if store is None or not site:
            return
        if store.remove(site):
            self._show_site_login_status(
                f"{tr('Removed the stored sign-in for')} {site}.", "neutral"
            )
            self._append_log(f"Removed the stored site sign-in for {site}.")
        self._refresh_site_logins(force=True)

    def _add_subscription(self):
        manager = self._subscription_manager()
        if manager is None:
            self.subscription_status.setText("Start the local companion before adding a subscription.")
            return
        record, error = manager.add_subscription(
            self.subscription_url.text(),
            interval_minutes=self.subscription_interval.value(),
        )
        if error:
            self.subscription_status.setText(error)
            return
        self.subscription_url.clear()
        self.subscription_status.setText(
            f"Added {record.get('title') or record.get('url')}. The first scan is scheduled now."
        )
        self._refresh_subscriptions(force=True)

    def _set_subscription_enabled(self, sub_id, enabled):
        manager = self._subscription_manager()
        if manager is None:
            return
        _record, error = manager.update_subscription(sub_id, enabled=enabled)
        if error:
            self.subscription_status.setText(error)
        self._refresh_subscriptions(force=True)

    def _scan_subscription(self, sub_id):
        manager = self._subscription_manager()
        if manager is None:
            return
        result, error = manager.request_scan(sub_id)
        if error:
            self.subscription_status.setText(error)
        else:
            self.subscription_status.setText("Subscription scan queued. New uploads will appear in Downloads.")
        self._refresh_subscriptions(force=True)

    def _remove_subscription(self, sub_id):
        manager = self._subscription_manager()
        if manager is None:
            return
        _removed, error = manager.remove_subscription(sub_id)
        if error:
            self.subscription_status.setText(error)
        else:
            self.subscription_status.setText("Subscription removed. Downloaded files were not deleted.")
        self._refresh_subscriptions(force=True)

    def _build_settings(self):
        page = QWidget()
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(page)
        layout = QVBoxLayout(page)
        layout.setContentsMargins(38, 26, 30, 24)
        layout.setSpacing(0)

        layout.addLayout(self._make_page_header("Settings", ""))
        layout.addSpacing(14)
        layout.addWidget(make_divider())

        # Connection
        conn_card, conn_l = self._make_settings_group("Connection")
        port_row = QHBoxLayout()
        port_copy = QVBoxLayout()
        port_copy.setSpacing(2)
        port_copy.addWidget(make_label("Local API port", "fieldLabel"))
        port_copy.addWidget(make_label("Default 9751. Change only for custom clients.", "fieldHint", word_wrap=True))
        # The dashboard shows the port actually bound, which during a bind
        # conflict is a session-only fallback. Without this line the spinbox
        # silently disagreed with it.
        self.cfg_port_session_hint = make_label("", "fieldHint", word_wrap=True)
        self.cfg_port_session_hint.setVisible(False)
        port_copy.addWidget(self.cfg_port_session_hint)
        port_row.addLayout(port_copy, 1)
        self.cfg_port = QSpinBox()
        self.cfg_port.setAccessibleName("Local API port")
        self.cfg_port.setRange(1024, 65535)
        # Read the PERSISTED port: a session fallback must never be echoed back
        # into the spinbox, or the next save would write it to disk.
        _persisted_get = getattr(self.config, 'get_persisted', self.config.get)
        self.cfg_port.setValue(self._dependencies['clamp_int'](_persisted_get("ServerPort", self._value('SERVER_PORT')), self._value('SERVER_PORT'), 1024, 65535))
        self.cfg_port.setFixedWidth(100)
        port_row.addWidget(self.cfg_port)
        conn_l.addLayout(port_row)
        conn_l.addWidget(make_divider())
        token_copy = QVBoxLayout()
        token_copy.setSpacing(2)
        token_copy.addWidget(make_label("Private token", "fieldLabel"))
        token_copy.addWidget(make_label("Authorizes extension requests on this computer.", "fieldHint", word_wrap=True))
        conn_l.addLayout(token_copy)
        token_row = QHBoxLayout()
        token_row.setSpacing(8)
        self.cfg_token = QLineEdit(self.config.get("ServerToken", ""))
        self.cfg_token.setAccessibleName("Private API token")
        self.cfg_token.setReadOnly(True)
        self.cfg_token.setEchoMode(QLineEdit.EchoMode.Password)
        token_row.addWidget(self.cfg_token, 1)
        self.btn_token_reveal = self._make_tool_button("Reveal")
        self.btn_token_reveal.setAccessibleName("Reveal private token")
        self.btn_token_reveal.clicked.connect(self._toggle_token_visible)
        token_row.addWidget(self.btn_token_reveal)
        btn_token_copy = self._make_tool_button("Copy")
        btn_token_copy.clicked.connect(self._copy_token)
        token_row.addWidget(btn_token_copy)
        btn_token_reset = self._make_tool_button("Regenerate", "danger")
        btn_token_reset.clicked.connect(self._regenerate_token)
        token_row.addWidget(btn_token_reset)
        conn_l.addLayout(token_row)
        layout.addWidget(conn_card)

        # Storage
        paths_card, paths_l = self._make_settings_group("Storage")
        paths_l.addWidget(make_label("Video download folder", "fieldLabel"))
        paths_l.addWidget(make_label("Default destination for video downloads.", "fieldHint", word_wrap=True))
        row = QHBoxLayout()
        row.setSpacing(8)
        self.cfg_dl_path = QLineEdit(self.config.get("DownloadPath", ""))
        self.cfg_dl_path.setAccessibleName("Video download folder")
        self.cfg_dl_path.setPlaceholderText(str(Path.home() / "Videos" / "YouTube"))
        row.addWidget(self.cfg_dl_path, 1)
        btn = self._make_tool_button("Browse")
        btn.clicked.connect(lambda: self._browse(self.cfg_dl_path))
        row.addWidget(btn)
        paths_l.addLayout(row)
        paths_l.addWidget(make_divider())
        paths_l.addWidget(make_label("Audio download folder", "fieldLabel"))
        paths_l.addWidget(make_label("Leave blank to use the video folder.", "fieldHint", word_wrap=True))
        row2 = QHBoxLayout()
        row2.setSpacing(8)
        self.cfg_audio_path = QLineEdit(self.config.get("AudioDownloadPath", ""))
        self.cfg_audio_path.setAccessibleName("Audio download folder")
        self.cfg_audio_path.setPlaceholderText("Same as video folder")
        row2.addWidget(self.cfg_audio_path, 1)
        btn2 = self._make_tool_button("Browse")
        btn2.clicked.connect(lambda: self._browse(self.cfg_audio_path))
        row2.addWidget(btn2)
        paths_l.addLayout(row2)
        paths_l.addWidget(make_divider())
        paths_l.addWidget(make_label("Filename template", "fieldLabel"))
        paths_l.addWidget(make_label(
            "Optional yt-dlp output template, relative to the folder above "
            "(e.g. %(uploader)s/%(title)s.%(ext)s). Must keep %(ext)s. "
            "Title and channel fields are length-bounded on save so long "
            "titles cannot overrun the maximum path length. "
            "Blank uses the default.",
            "fieldHint", word_wrap=True,
        ))
        self.cfg_outtmpl = QLineEdit(self.config.get("OutputTemplate", ""))
        self.cfg_outtmpl.setAccessibleName("Filename template")
        self.cfg_outtmpl.setPlaceholderText("%(title)s.%(ext)s")
        paths_l.addWidget(self.cfg_outtmpl)
        layout.addWidget(paths_card)

        # Post-processing
        pp_card, pp_l = self._make_settings_group("Post-processing")
        self.cfg_metadata = QCheckBox(tr("Embed metadata"))
        self.cfg_metadata.setChecked(self.config.get("EmbedMetadata", True))
        self.cfg_thumbnail = QCheckBox(tr("Embed thumbnail"))
        self.cfg_thumbnail.setChecked(self.config.get("EmbedThumbnail", True))
        self.cfg_chapters = QCheckBox(tr("Embed chapters"))
        self.cfg_chapters.setChecked(self.config.get("EmbedChapters", True))
        self.cfg_subs = QCheckBox(tr("Embed subtitles"))
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
        self.cfg_sponsorblock = QCheckBox(tr("Use SponsorBlock segments"))
        self.cfg_sponsorblock.setChecked(self.config.get("SponsorBlock", False))
        pp_l.addWidget(self.cfg_sponsorblock)
        sb_row = QHBoxLayout()
        sb_row.setSpacing(8)
        sb_row.addSpacing(28)
        sb_row.addWidget(make_label("Action", "fieldHint"))
        self.cfg_sb_action = QComboBox()
        self.cfg_sb_action.setAccessibleName("SponsorBlock action")
        self.cfg_sb_action.addItem(tr("Remove segments"), "remove")
        self.cfg_sb_action.addItem(tr("Mark segments"), "mark")
        current_action = self.config.get("SponsorBlockAction", "remove")
        self.cfg_sb_action.setCurrentIndex(1 if current_action == "mark" else 0)
        self.cfg_sb_action.setEnabled(self.cfg_sponsorblock.isChecked())
        self.cfg_sponsorblock.toggled.connect(self.cfg_sb_action.setEnabled)
        sb_row.addWidget(self.cfg_sb_action)
        sb_row.addStretch()
        pp_l.addLayout(sb_row)
        layout.addWidget(pp_card)

        # Performance
        perf_card, perf_l = self._make_settings_group("Performance")
        frag_row = QHBoxLayout()
        frag_copy = QVBoxLayout()
        frag_copy.setSpacing(2)
        frag_copy.addWidget(make_label("Concurrent fragments", "fieldLabel"))
        frag_copy.addWidget(make_label("More can improve fast connections.", "fieldHint", word_wrap=True))
        frag_row.addLayout(frag_copy, 1)
        self.cfg_fragments = QSpinBox()
        self.cfg_fragments.setAccessibleName("Concurrent fragments")
        self.cfg_fragments.setRange(1, 32)
        self.cfg_fragments.setValue(self._dependencies['clamp_int'](self.config.get("ConcurrentFragments", 4), 4, 1, 32))
        self.cfg_fragments.setFixedWidth(86)
        frag_row.addWidget(self.cfg_fragments)
        perf_l.addLayout(frag_row)
        perf_l.addWidget(make_divider())

        conc_row = QHBoxLayout()
        conc_copy = QVBoxLayout()
        conc_copy.setSpacing(2)
        conc_copy.addWidget(make_label("Simultaneous downloads", "fieldLabel"))
        conc_copy.addWidget(make_label("How many downloads run at once.", "fieldHint", word_wrap=True))
        conc_row.addLayout(conc_copy, 1)
        self.cfg_maxconcurrent = QSpinBox()
        self.cfg_maxconcurrent.setAccessibleName("Simultaneous downloads")
        self.cfg_maxconcurrent.setRange(1, 10)
        self.cfg_maxconcurrent.setValue(self._dependencies['clamp_int'](self.config.get("MaxConcurrentDownloads", 3), 3, 1, 10))
        self.cfg_maxconcurrent.setFixedWidth(86)
        conc_row.addWidget(self.cfg_maxconcurrent)
        perf_l.addLayout(conc_row)
        perf_l.addWidget(make_divider())

        retries_row = QHBoxLayout()
        retries_copy = QVBoxLayout()
        retries_copy.setSpacing(2)
        retries_copy.addWidget(make_label("Download retries", "fieldLabel"))
        retries_copy.addWidget(make_label("Retry attempts on transient network errors.", "fieldHint", word_wrap=True))
        retries_row.addLayout(retries_copy, 1)
        self.cfg_retries = QSpinBox()
        self.cfg_retries.setAccessibleName("Download retries")
        self.cfg_retries.setRange(0, 50)
        self.cfg_retries.setValue(self._dependencies['clamp_int'](self.config.get("DownloadRetries", 10), 10, 0, 50))
        self.cfg_retries.setFixedWidth(86)
        retries_row.addWidget(self.cfg_retries)
        perf_l.addLayout(retries_row)
        perf_l.addWidget(make_divider())
        rate_row = QHBoxLayout()
        rate_copy = QVBoxLayout()
        rate_copy.setSpacing(2)
        rate_copy.addWidget(make_label("Rate limit", "fieldLabel"))
        rate_copy.addWidget(make_label("Optional, such as 500K or 2M.", "fieldHint", word_wrap=True))
        rate_row.addLayout(rate_copy, 1)
        self.cfg_ratelimit = QLineEdit(self.config.get("RateLimit", ""))
        self.cfg_ratelimit.setAccessibleName("Rate limit")
        self.cfg_ratelimit.setPlaceholderText("No limit")
        self.cfg_ratelimit.setFixedWidth(120)
        rate_row.addWidget(self.cfg_ratelimit)
        perf_l.addLayout(rate_row)
        perf_l.addWidget(make_divider())
        # MaxFileSizeMB blocks downloads outright — a run that trips it exits
        # cleanly having written nothing and reports `skipped`, whose message
        # tells the user to change this. It needs a control to change.
        maxsize_row = QHBoxLayout()
        maxsize_copy = QVBoxLayout()
        maxsize_copy.setSpacing(2)
        maxsize_copy.addWidget(make_label("Max file size", "fieldLabel"))
        maxsize_copy.addWidget(make_label(
            "Skip anything larger. 0 means no limit.", "fieldHint", word_wrap=True
        ))
        maxsize_row.addLayout(maxsize_copy, 1)
        self.cfg_maxsize = QSpinBox()
        self.cfg_maxsize.setAccessibleName("Max file size in megabytes")
        self.cfg_maxsize.setRange(0, 102400)
        self.cfg_maxsize.setSuffix(" MB")
        self.cfg_maxsize.setSpecialValueText("No limit")
        self.cfg_maxsize.setValue(self._dependencies['clamp_int'](
            self.config.get("MaxFileSizeMB", 0), 0, 0, 102400
        ))
        self.cfg_maxsize.setFixedWidth(120)
        maxsize_row.addWidget(self.cfg_maxsize)
        perf_l.addLayout(maxsize_row)
        proxy_row = QHBoxLayout()
        proxy_copy = QVBoxLayout()
        proxy_copy.setSpacing(2)
        proxy_copy.addWidget(make_label("Proxy", "fieldLabel"))
        proxy_copy.addWidget(make_label("Optional HTTP(S) or SOCKS proxy.", "fieldHint", word_wrap=True))
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
            "Auto prefers Deno, then Node 22+.",
            "fieldHint", word_wrap=True,
        ))
        runtime_row.addLayout(runtime_copy, 1)
        self.cfg_js_runtime = QComboBox()
        self.cfg_js_runtime.setAccessibleName("JavaScript runtime")
        self.cfg_js_runtime.addItem(tr("Auto"), "auto")
        self.cfg_js_runtime.addItem("Deno", "deno")
        self.cfg_js_runtime.addItem("Node 22+", "node")
        selected_runtime = self.config.get("JavaScriptRuntime", "auto")
        self.cfg_js_runtime.setCurrentIndex(max(0, self.cfg_js_runtime.findData(selected_runtime)))
        runtime_row.addWidget(self.cfg_js_runtime)
        perf_l.addLayout(runtime_row)
        perf_l.addWidget(make_divider())
        channel_row = QHBoxLayout()
        channel_copy = QVBoxLayout()
        channel_copy.setSpacing(2)
        channel_copy.addWidget(make_label("yt-dlp update channel", "fieldLabel"))
        channel_copy.addWidget(make_label(
            "Nightly ships same-day YouTube fixes; stable lags by weeks.",
            "fieldHint", word_wrap=True,
        ))
        channel_row.addLayout(channel_copy, 1)
        self.cfg_ytdlp_channel = QComboBox()
        self.cfg_ytdlp_channel.setAccessibleName("yt-dlp update channel")
        self.cfg_ytdlp_channel.addItem(tr("Nightly (recommended)"), "nightly")
        self.cfg_ytdlp_channel.addItem(tr("Stable"), "stable")
        selected_channel = self.config.get("YtDlpUpdateChannel", "nightly")
        self.cfg_ytdlp_channel.setCurrentIndex(max(0, self.cfg_ytdlp_channel.findData(selected_channel)))
        channel_row.addWidget(self.cfg_ytdlp_channel)
        perf_l.addLayout(channel_row)
        layout.addWidget(perf_card)

        # Behavior
        beh_card, beh_l = self._make_settings_group("Tray behavior")
        language_row = QHBoxLayout()
        language_row.addWidget(make_label("Language", "fieldLabel"))
        language_row.addStretch()
        self.cfg_language = QComboBox()
        self.cfg_language.setAccessibleName(tr("Companion language"))
        for label, value in (
            ("System default", "system"),
            ("العربية", "ar"),
            ("Deutsch", "de"),
            ("English", "en"),
            ("Español", "es"),
            ("Français", "fr"),
            ("Italiano", "it"),
            ("日本語", "ja"),
            ("한국어", "ko"),
            ("Português (Brasil)", "pt_BR"),
            ("Русский", "ru"),
            ("简体中文", "zh_CN"),
        ):
            self.cfg_language.addItem(label, value)
        selected_language = self.config.get("Language", "system")
        self.cfg_language.setCurrentIndex(
            max(0, self.cfg_language.findData(selected_language))
        )
        self.cfg_language.setToolTip(
            tr("Language changes apply the next time Astra Downloader starts.")
        )
        language_row.addWidget(self.cfg_language)
        beh_l.addLayout(language_row)
        self.cfg_autoupdate = QCheckBox(tr("Keep yt-dlp up to date automatically"))
        self.cfg_autoupdate.setChecked(self.config.get("AutoUpdateYtDlp", True))
        # The real cadence: throttled to once per 12 hours, checked when the
        # server starts and again whenever the download queue goes idle (the
        # race-free moment to swap the binary).
        self.cfg_autoupdate.setToolTip(tr(
            "Checks at most once every 12 hours - when the server starts and "
            "when the download queue goes idle."
        ))
        self.cfg_closetotray = QCheckBox(tr("Close to the system tray"))
        self.cfg_closetotray.setChecked(self.config.get("CloseToTray", True))
        self.cfg_startmin = QCheckBox(tr("Start minimized to the tray"))
        self.cfg_startmin.setChecked(self.config.get("StartMinimized", False))
        self.cfg_notify = QCheckBox(tr("Notify when a download finishes (while minimized)"))
        self.cfg_notify.setChecked(self.config.get("NotifyOnComplete", True))
        self.cfg_clipboard = QCheckBox(tr("Stage copied video links for review"))
        self.cfg_clipboard.setChecked(self.config.get("ClipboardLinkGrabber", False))
        self.cfg_clipboard.setToolTip(
            "Watch clipboard changes for video links from any supported site. "
            "Matching links fill the Quick download field but are never "
            "downloaded until you confirm."
        )
        self.cfg_clipboard.setAccessibleDescription(
            "Off by default. Clipboard content that does not look like a video "
            "link is ignored, and a matching link is staged without starting a "
            "download."
        )
        for w in [
            self.cfg_autoupdate, self.cfg_closetotray, self.cfg_startmin,
            self.cfg_notify, self.cfg_clipboard,
        ]:
            beh_l.addWidget(w)
        layout.addWidget(beh_card)

        # Tools — v1.2.0 downloader-maintenance actions
        tools_card, tools_l = self._make_settings_group("Maintenance")
        tools_l.addWidget(make_label("Installed tools", "fieldLabel"))
        self.tools_status = make_label("Checking installed tools…", "fieldHint", word_wrap=True)
        self.tools_status.setAccessibleName("Installed tools status")
        tools_l.addWidget(self.tools_status)
        tools_row = QHBoxLayout()
        tools_row.setSpacing(8)
        self.btn_check_updates = self._make_tool_button(
            "Check yt-dlp Update",
        )
        self.btn_check_updates.setToolTip("Check for a yt-dlp update. Active downloads must finish first.")
        self.btn_check_updates.clicked.connect(self._force_ytdlp_update)
        tools_row.addWidget(self.btn_check_updates)
        btn_reinstall_ffmpeg = self._make_tool_button(
            "Reinstall ffmpeg", "danger",
        )
        # _reinstall_ffmpeg stages and verifies a fresh copy first; nothing is
        # deleted unless the replacement verifies.
        btn_reinstall_ffmpeg.setToolTip(
            "Download a fresh ffmpeg and verify its checksum. The installed copy "
            "stays in place until the replacement verifies."
        )
        btn_reinstall_ffmpeg.clicked.connect(self._reinstall_ffmpeg)
        tools_row.addWidget(btn_reinstall_ffmpeg)
        tools_row.addStretch()
        tools_l.addLayout(tools_row)
        layout.addWidget(tools_card)

        save_row = QHBoxLayout()
        save_row.setContentsMargins(166, 14, 0, 0)
        self.settings_status = make_label("", "fieldHint")
        self.settings_status.setAccessibleName("Settings status")
        save_row.addWidget(self.settings_status, 1)
        btn_save = self._make_tool_button("Save changes", "primary")
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
            self.cfg_outtmpl.textChanged,
            self.cfg_metadata.toggled,
            self.cfg_thumbnail.toggled,
            self.cfg_chapters.toggled,
            self.cfg_subs.toggled,
            self.cfg_sublangs.textChanged,
            self.cfg_sponsorblock.toggled,
            self.cfg_sb_action.currentIndexChanged,
            self.cfg_fragments.valueChanged,
            self.cfg_maxconcurrent.valueChanged,
            self.cfg_retries.valueChanged,
            self.cfg_maxsize.valueChanged,
            self.cfg_ratelimit.textChanged,
            self.cfg_proxy.textChanged,
            self.cfg_js_runtime.currentIndexChanged,
            self.cfg_ytdlp_channel.currentIndexChanged,
            self.cfg_language.currentIndexChanged,
            self.cfg_autoupdate.toggled,
            self.cfg_closetotray.toggled,
            self.cfg_startmin.toggled,
            self.cfg_notify.toggled,
            self.cfg_clipboard.toggled,
        ):
            signal.connect(self._mark_settings_dirty)

        self.tabs.addTab(scroll, "Settings")

    # ── Navigation ──
    def _nav_click(self, name):
        idx = self._page_names.index(name)
        self.tabs.setCurrentIndex(idx)
        for i, btn in enumerate(self.nav_buttons):
            btn.setChecked(i == idx)
            btn.setProperty("active", "true" if i == idx else "false")
            repolish(btn)
        self._animate_page()
        if name == "History":
            self._refresh_history()
        elif name == "Subscriptions":
            self._refresh_subscriptions(force=True)

    def _animate_page(self):
        widget = self.tabs.currentWidget()
        if not widget:
            return
        if system_reduced_motion_enabled():
            widget.setGraphicsEffect(None)
            self._page_anim = None
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
                    # reason: a failed bind may leave no closable probe socket
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
                f"Port {configured_port} is unavailable; using fallback port {chosen_port} for this session."
            )
            # Session-only override: the dashboard/health see the bound port,
            # but it is excluded from every save()/update() so a transient
            # conflict (e.g. a stale instance briefly holding the port) can
            # never permanently rewrite the user's configured ServerPort —
            # the next start retries the configured port. (A plain set() here
            # leaked to disk through any later full-config save, e.g. the
            # yt-dlp update-check timestamp write.)
            set_session = getattr(self.config, 'set_session', self.config.set)
            set_session("ServerPort", chosen_port)
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
        subscription_manager = self._subscription_manager()
        if subscription_manager is not None:
            subscription_manager.start()
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
        subscription_manager = self._subscription_manager()
        if subscription_manager is not None:
            subscription_manager.stop()
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
            self.status_dot.setProperty("tone", "success")
            self.status_dot.setAccessibleName("Server status indicator: Running")
            self.status_label.setText("Running")
            self.status_label.setProperty("tone", "success")
            self.status_label.setAccessibleName("Server status: Running")
            self.dash_status.setText("Server online")
            self.dash_hint.setText("Local only \u00b7 ready for Astra Deck")
            self.server_badge.setProperty("tone", "success")
            self.server_badge.setAccessibleName(
                "Dashboard server status indicator: Online"
            )
            self.btn_startstop.setText("Stop Server")
            self.btn_startstop.setIcon(make_line_icon("Stop Server"))
            self.btn_startstop.setProperty("class", "secondary")
            self.tray_startstop.setText("Stop Server")
            self.tray.setToolTip(f"{self._value('APP_NAME')} - Running")
            self._set_readiness("server", "Running", "success")
        else:
            self.status_dot.setProperty("tone", "neutral")
            self.status_dot.setAccessibleName("Server status indicator: Stopped")
            self.status_label.setText("Stopped")
            self.status_label.setProperty("tone", "neutral")
            self.status_label.setAccessibleName("Server status: Stopped")
            self.dash_status.setText("Server offline")
            self.dash_hint.setText("Local only \u00b7 start before downloading")
            self.server_badge.setProperty("tone", "neutral")
            self.server_badge.setAccessibleName(
                "Dashboard server status indicator: Offline"
            )
            self.btn_startstop.setText("Start Server")
            self.btn_startstop.setIcon(make_line_icon("Start Server"))
            self.btn_startstop.setProperty("class", "primary")
            self.tray_startstop.setText("Start Server")
            self.tray.setToolTip(f"{self._value('APP_NAME')} - Stopped")
            self._set_readiness("server", "Stopped", "neutral")
        repolish(self.btn_startstop)
        repolish(self.server_badge)
        repolish(self.status_dot)
        repolish(self.status_label)

    def _clear_layout(self, layout):
        while layout.count():
            item = layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear_layout(item.layout())

    def _download_card_structure(self, dl, recent=False):
        """Return the widget structure needed for a download's current state."""
        if recent:
            if dl.status == "failed" and dl.error_code in self._value(
                    'DOWNLOAD_RETRYABLE_ERROR_CODES'):
                action = "retry"
            elif dl.status == "skipped":
                # Nothing was written, so the whole recovery is "change the
                # setting the reason names, then run it again".
                action = "retry"
            elif dl.status == "complete" and dl.filename:
                action = "show"
            else:
                action = "none"
            phase = "recent"
        elif dl.status in self._value('DOWNLOAD_RUNNING_STATES'):
            action = "cancel"
            phase = "running"
        elif dl.status in self._value('DOWNLOAD_PENDING_STATES'):
            action = (
                "auth-cancel" if dl.status == "needs-auth"
                else "resume-cancel" if dl.status == "paused"
                else "reorder-cancel"
            )
            phase = "pending"
        else:
            action = "none"
            phase = "other"
        return recent, phase, action, bool(dl.error and dl.error_advice)

    def _download_meta_text(self, dl):
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
        return "  /  ".join(meta_parts) if meta_parts else dl.url

    def _update_download_card(self, card, dl):
        """Patch volatile card fields without replacing the focused widget."""
        refs = card._astra_refs
        card_state = dl.status if dl.status in ("failed", "complete") else ""
        if card.property("state") != card_state:
            card.setProperty("state", card_state)
            repolish(card)

        refs["title"].setText(
            dl.title if dl.title and dl.title != "Unknown"
            else "Preparing download"
        )
        state_label = refs["state"]
        state_label.setText(f"\u25cf  {human_status(dl.status)}")
        state_label.setAccessibleName(
            f"{dl.title or 'Download'} status: {human_status(dl.status)}"
        )
        tone = download_status_tone(dl.status)
        if state_label.property("tone") != tone:
            state_label.setProperty("tone", tone)
            repolish(state_label)

        progress = refs.get("progress")
        if progress is not None:
            progress.setValue(int(min(max(dl.progress, 0), 100)))
            progress.setAccessibleName(f"{dl.title or 'Download'} progress")
            progress.setAccessibleDescription(f"{dl.progress:.1f} percent complete")
        refs["meta"].setText(self._download_meta_text(dl))

        recovery = refs.get("recovery")
        if recovery is not None:
            recovery_text = dl.error_advice
            if dl.error_action:
                recovery_text = f"{recovery_text}\nNext: {dl.error_action}"
            recovery.setText(recovery_text)

    def _download_card(self, dl, recent=False):
        card = QFrame()
        card.setProperty("class", "download")
        card.setProperty("downloadId", dl.id)
        card.setObjectName(f"download_{dl.id}")
        card_l = QVBoxLayout(card)
        card_l.setContentsMargins(16, 13, 16, 13)
        card_l.setSpacing(9)

        top = QHBoxLayout()
        title = make_label(dl.title if dl.title and dl.title != "Unknown" else "Preparing download", "fieldLabel", word_wrap=True)
        top.addWidget(title, 1)
        state_label = make_state_label(human_status(dl.status), download_status_tone(dl.status))
        top.addWidget(state_label)
        if not recent and dl.status in self._value('DOWNLOAD_PENDING_STATES'):
            if dl.status != 'needs-auth':
                btn_up = self._make_tool_button("Up", "ghost")
                btn_up.setToolTip("Move this pending download earlier.")
                btn_up.clicked.connect(
                    lambda checked=False, dl_id=dl.id: self._move_pending_download(dl_id, -1)
                )
                top.addWidget(btn_up)
                btn_down = self._make_tool_button("Down", "ghost")
                btn_down.setToolTip("Move this pending download later.")
                btn_down.clicked.connect(
                    lambda checked=False, dl_id=dl.id: self._move_pending_download(dl_id, 1)
                )
                top.addWidget(btn_down)
            if dl.status == 'paused':
                btn_resume = self._make_tool_button("Resume Queue", "ghost")
                btn_resume.setToolTip("Resume recovered, unauthenticated downloads explicitly.")
                btn_resume.clicked.connect(self._resume_download_queue)
                top.addWidget(btn_resume)
            if (dl.status == 'needs-auth'
                    and not self._dependencies['is_youtube_url'](dl.url)):
                # The Sign-ins page is the fix for this state on every site the
                # extension's YouTube cookie bridge cannot reach, so the row
                # that reports it offers the way there instead of only Cancel.
                btn_signin = self._make_tool_button("Add sign-in", "ghost")
                btn_signin.setToolTip(
                    "Store this site's signed-in session so the download can run."
                )
                btn_signin.clicked.connect(
                    lambda checked=False, url=dl.url: self._open_site_login_for(url)
                )
                top.addWidget(btn_signin)
            btn_cancel = self._make_tool_button("Cancel", "ghost")
            btn_cancel.clicked.connect(lambda checked=False, dl_id=dl.id: self.dl_manager.cancel(dl_id))
            top.addWidget(btn_cancel)
        elif not recent and dl.status in self._value('DOWNLOAD_RUNNING_STATES'):
            btn_cancel = self._make_tool_button("Cancel", "ghost")
            btn_cancel.clicked.connect(lambda checked=False, dl_id=dl.id: self.dl_manager.cancel(dl_id))
            top.addWidget(btn_cancel)
        elif recent and (
            (dl.status == "failed"
             and dl.error_code in self._value('DOWNLOAD_RETRYABLE_ERROR_CODES'))
            or dl.status == "skipped"
        ):
            btn_retry = self._make_tool_button("Retry", "ghost")
            btn_retry.clicked.connect(lambda checked=False, item=dl: self._retry_download(item))
            top.addWidget(btn_retry)
        elif recent and dl.status == "complete" and dl.filename:
            btn_show = self._make_tool_button("Show", "ghost")
            btn_show.clicked.connect(lambda checked=False, path=dl.filename: self._show_download_location(path))
            top.addWidget(btn_show)
        card_l.addLayout(top)

        bar = None
        if dl.status in self._value('DOWNLOAD_RUNNING_STATES'):
            bar = QProgressBar()
            bar.setRange(0, 100)
            bar.setValue(int(min(max(dl.progress, 0), 100)))
            bar.setTextVisible(False)
            card_l.addWidget(bar)

        meta = make_label(self._download_meta_text(dl), "fieldHint", word_wrap=True)
        card_l.addWidget(meta)
        recovery_label = None
        if dl.error and dl.error_advice:
            recovery = dl.error_advice
            if dl.error_action:
                recovery = f"{recovery}\nNext: {dl.error_action}"
            recovery_label = make_label(recovery, "errorCallout", word_wrap=True)
            card_l.addWidget(recovery_label)
        card._astra_structure = self._download_card_structure(dl, recent)
        card._astra_refs = {
            "title": title,
            "state": state_label,
            "progress": bar,
            "meta": meta,
            "recovery": recovery_label,
        }
        self._update_download_card(card, dl)
        return card

    def _reconcile_download_list(self, active, pending, recent):
        """Key the queue layout by download id and retain unchanged widgets."""
        layout = self.downloads_list_layout
        scroll_bar = self.downloads_scroll.verticalScrollBar()
        scroll_value = scroll_bar.value()
        focused = QApplication.focusWidget()
        focused_entry = next((
            (key, widget) for key, widget in self._download_widgets.items()
            if focused is not None
            and (focused is widget or widget.isAncestorOf(focused))
        ), (None, None))
        focused_key, focused_owner = focused_entry
        desired = []

        def retain(key, factory):
            widget = self._download_widgets.get(key)
            if widget is None:
                widget = factory()
                self._download_widgets[key] = widget
            desired.append((key, widget))
            return widget

        if not active and not pending and not recent:
            retain(("empty",), lambda: make_empty_state(
                "Queue is clear",
                "Downloads sent from Astra Deck appear here.",
                "Open dashboard",
                lambda: self._nav_click("Dashboard"),
            ))
        for section_key, section_title, downloads, is_recent in (
            ("active", "In progress", active, False),
            ("pending", "Pending", pending, False),
            ("recent", "Recent activity", recent[:8], True),
        ):
            if not downloads:
                continue
            retain(("section", section_key), lambda title=section_title: make_section_label(title))
            for dl in downloads:
                key = ("download", dl.id)
                card = self._download_widgets.get(key)
                structure = self._download_card_structure(dl, is_recent)
                if card is None or getattr(card, "_astra_structure", None) != structure:
                    if card is not None:
                        layout.removeWidget(card)
                        card.deleteLater()
                    card = self._download_card(dl, recent=is_recent)
                    self._download_widgets[key] = card
                else:
                    self._update_download_card(card, dl)
                desired.append((key, card))

        def make_spacer():
            spacer = QWidget()
            spacer.setObjectName("downloads_list_spacer")
            spacer.setSizePolicy(
                QSizePolicy.Policy.Preferred,
                QSizePolicy.Policy.Expanding,
            )
            return spacer

        retain(("spacer",), make_spacer)
        desired_keys = {key for key, _widget in desired}
        for key in tuple(self._download_widgets):
            if key in desired_keys:
                continue
            widget = self._download_widgets.pop(key)
            layout.removeWidget(widget)
            widget.deleteLater()

        for index, (_key, widget) in enumerate(desired):
            item = layout.itemAt(index)
            if item is not None and item.widget() is widget:
                continue
            layout.removeWidget(widget)
            layout.insertWidget(index, widget)

        layout.activate()
        scroll_bar.setValue(min(scroll_value, scroll_bar.maximum()))
        if (
            focused_key in desired_keys
            and focused is not None
            and self._download_widgets.get(focused_key) is focused_owner
        ):
            focused.setFocus(Qt.FocusReason.OtherFocusReason)

    def _notify_completed_downloads(self, downloads):
        """Raise a one-shot tray notification when a download finishes while
        the window is hidden (tray) or minimized to the taskbar — the states
        where the user can't see the queue. Completions seen while the window
        is visible are marked as already-notified so they never fire a stale
        toast later."""
        present = {d.id for d in downloads}
        # Prune ids that left the active queue so the set can't grow unbounded.
        self._seen_complete &= present
        # `skipped` finishes the same way a completion does — the queue slot is
        # released and the user is done waiting — so it notifies too, with the
        # reason as the body. Without this a minimized companion said nothing
        # at all about a download that produced no file.
        newly_complete = [d for d in downloads
                          if d.status in ('complete', 'skipped')
                          and d.id not in self._seen_complete]
        if not newly_complete:
            return
        notify = (self.config.get("NotifyOnComplete", True)
                  and (self.isHidden() or self.isMinimized()))
        for d in newly_complete:
            self._seen_complete.add(d.id)
            if notify:
                title = (getattr(d, 'title', '') or '').strip() or 'Your download is finished.'
                skipped = d.status == 'skipped'
                if skipped:
                    heading = "Nothing downloaded"
                    body = (getattr(d, 'error', '') or '').strip() or title
                else:
                    heading = "Download complete"
                    body = title
                try:
                    self.tray.showMessage(
                        heading, body,
                        QSystemTrayIcon.MessageIcon.Warning if skipped
                        else QSystemTrayIcon.MessageIcon.Information,
                        4000,
                    )
                except Exception:
                    # reason: tray notifications are best-effort polish
                    pass

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
        if self.tabs.currentIndex() == self._page_names.index("Subscriptions"):
            self._refresh_subscriptions()
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
        self._notify_completed_downloads(downloads)
        active = [d for d in downloads if d.status in self._value('DOWNLOAD_RUNNING_STATES')]
        pending = [d for d in downloads if d.status in self._value('DOWNLOAD_PENDING_STATES')]
        # Every terminal status belongs here. A hardcoded tuple used to leave
        # `skipped` out of all three buckets, so a download that wrote no file
        # rendered nowhere at all — the silent outcome that status exists to
        # make visible.
        recent = [d for d in downloads
                  if d.status in self._value('DOWNLOAD_TERMINAL_STATES')]
        active.sort(key=lambda d: d.start_time)
        pending.sort(key=lambda d: (d.queue_order, d.start_time))
        recent.sort(key=lambda d: d.start_time, reverse=True)
        capacity = self.dl_manager.capacity()
        self.queue_capacity_badge.setText(
            f"{capacity['total']} / {capacity['totalLimit']} jobs"
        )
        self.btn_queue_pause.setText(
            "Resume queue" if capacity['intakePaused'] else "Pause intake"
        )
        self.btn_queue_pause.setIcon(make_line_icon(
            "Resume queue" if capacity['intakePaused'] else "Pause intake"
        ))
        self.btn_queue_pause.setToolTip(
            "Resume pending downloads explicitly. Items needing sign-in remain paused."
            if capacity['intakePaused'] else
            "Pause starting pending downloads. Downloads already running will continue."
        )
        signature = tuple(
            (d.id, d.status, d.queue_order, round(d.progress, 1), d.speed, d.eta,
             d.title, d.error, d.error_code, d.error_advice, d.error_action,
             d.filename, d.format, d.quality, d.url)
            for d in active + pending + recent[:8]
        ) + ((capacity['intakePaused'], capacity['total']),)
        if signature == self._downloads_signature:
            return
        self._downloads_signature = signature

        self._reconcile_download_list(active, pending, recent)

    def _history_query(self, *, entries=None, offset=None, limit=None):
        return self._dependencies['query_history_entries'](
            self.history_mgr.load() if entries is None else entries,
            query=self.history_search.text(),
            status=self.history_status.currentData() or "",
            fmt=self.history_format.currentData() or "",
            date_from=self.history_date_from.text().strip(),
            date_to=self.history_date_to.text().strip(),
            sort=self.history_sort.currentData() or "newest",
            offset=self._history_offset if offset is None else offset,
            limit=self._history_page_size if limit is None else limit,
        )

    def _history_filters_changed(self, *_args):
        self._history_offset = 0
        self._refresh_history()

    def _move_history_page(self, direction):
        direction = -1 if direction < 0 else 1
        next_offset = self._history_offset + (direction * self._history_page_size)
        self._history_offset = max(0, next_offset)
        self._refresh_history()

    def _export_history(self):
        result = self._history_query(offset=0, limit=500)
        rows = result["history"]
        if not rows:
            self._append_log("No filtered history rows are available to export.")
            return
        default_path = Path(self.config.get("DownloadPath", str(Path.home())))
        suggested = default_path / "astra-download-history.csv"
        path, _selected_filter = QFileDialog.getSaveFileName(
            self,
            "Export Download History",
            str(suggested),
            "CSV files (*.csv)",
        )
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8-sig", newline="") as output:
                writer = csv.DictWriter(
                    output,
                    fieldnames=(
                        "title", "filename", "format", "quality", "status",
                        "duration", "date", "url",
                    ),
                    extrasaction="ignore",
                )
                writer.writeheader()
                writer.writerows(
                    {
                        key: sanitize_csv_cell(value)
                        for key, value in row.items()
                    }
                    for row in rows
                )
        except OSError as error:
            self._append_log(f"Could not export download history: {error}")
            return
        self._append_log(f"Exported {len(rows)} filtered history row(s) to {path}")

    def _refresh_history(self):
        self._clear_layout(self.history_container)

        data = self.history_mgr.load()
        self.btn_clear_history.setEnabled(bool(data))
        result = self._history_query(entries=data)
        filtered_total = result["filteredTotal"]
        if self._history_offset and self._history_offset >= filtered_total:
            self._history_offset = max(
                0,
                ((max(0, filtered_total - 1)) // self._history_page_size)
                * self._history_page_size,
            )
            result = self._history_query(entries=data)
        rows = result["history"]
        start = result["offset"] + 1 if rows else 0
        end = result["offset"] + len(rows)
        self.history_meta.setText(
            f"{start}–{end} of {filtered_total} filtered · {result['total']} retained"
            if rows else
            f"0 of {filtered_total} filtered · {result['total']} retained"
        )
        self.btn_history_prev.setEnabled(result["offset"] > 0)
        self.btn_history_next.setEnabled(result["hasMore"])
        self.btn_export_history.setEnabled(filtered_total > 0)
        if not data:
            self.history_container.addWidget(make_empty_state(
                "No downloads yet",
                "Completed downloads will appear here.",
                "View download queue",
                lambda: self._nav_click("Downloads"),
            ))
            self.history_container.addStretch()
            return
        if not rows:
            self.history_container.addWidget(make_empty_state(
                "No matching downloads",
                "Adjust the search, status, format, or saved-date filters.",
            ))
            self.history_container.addStretch()
            return

        for h in rows:
            card = make_card("historyRow")
            card_l = QHBoxLayout(card)
            card_l.setContentsMargins(0, 12, 0, 12)
            card_l.setSpacing(12)
            file_copy = QVBoxLayout()
            file_copy.setSpacing(3)
            file_copy.addWidget(make_label(h.get("title", "(untitled)"), "fieldLabel", word_wrap=True))
            filename = h.get("filename")
            if filename:
                file_copy.addWidget(make_label(Path(filename).name, "fieldHint", word_wrap=True))
            card_l.addLayout(file_copy, 4)
            values = (
                str(h.get("format", "")).upper() if h.get("format") else "\u2014",
                h.get("quality") or "\u2014",
                format_duration(h.get("duration", 0)) or "\u2014",
                h.get("date") or "\u2014",
            )
            for value in values:
                label = make_label(str(value), "tableValue")
                label.setFixedWidth(92)
                card_l.addWidget(label)
            if filename:
                btn_show = self._make_tool_button("Show", "ghost")
                btn_show.clicked.connect(lambda checked=False, path=filename: self._show_download_location(path))
                card_l.addWidget(btn_show)
            else:
                card_l.addSpacing(54)
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
        # Each status write bumps the generation so a delayed clear (the
        # post-save 3.2s timer) never wipes a NEWER message — e.g. the
        # "Unsaved changes" indicator from an edit made right after saving.
        self._settings_status_generation = getattr(self, "_settings_status_generation", 0) + 1
        self.settings_status.setText(message)
        color = GUI_ACCESSIBILITY_COLORS.get(
            tone, GUI_ACCESSIBILITY_COLORS["neutral"]
        )
        self.settings_status.setStyleSheet(f"color: {color}; font-size: 12px;")
        self.settings_status.setAccessibleName(
            f"Settings status: {message or 'No current message'}"
        )

    def _clear_settings_status_if_current(self, generation):
        if getattr(self, "_settings_status_generation", 0) == generation:
            self._show_settings_status("")

    def _mark_settings_dirty(self, *_args):
        if not hasattr(self, "settings_status") or not hasattr(self, "btn_save"):
            return
        self._show_settings_status("Unsaved changes", "warning")
        self.btn_save.setText("Save changes")

    def _sync_connection_ui(self):
        clamp_int = self._dependencies['clamp_int']
        default_port = self._value('SERVER_PORT')
        port = clamp_int(self.config.get("ServerPort", default_port), default_port, 1024, 65535)
        self.dash_endpoint.setText(f"http://127.0.0.1:{port}")
        self.stat_port.setText(str(port))
        persisted_get = getattr(self.config, 'get_persisted', self.config.get)
        configured = clamp_int(persisted_get("ServerPort", default_port), default_port, 1024, 65535)
        hint = getattr(self, 'cfg_port_session_hint', None)
        if hint is None:
            return
        if port != configured:
            message = (
                f"Port {configured} was unavailable at startup; bound to "
                f"fallback port {port} for this session. Restart to retry {configured}."
            )
            hint.setText(message)
            hint.setVisible(True)
            self.cfg_port.setAccessibleDescription(message)
        else:
            hint.setText("")
            hint.setVisible(False)
            self.cfg_port.setAccessibleDescription("")

    # ── Tools: yt-dlp / ffmpeg maintenance (v1.2.0) ──
    def _tools_status_text(self):
        ytv = self._dependencies['get_ytdlp_version']() or "not installed"
        ffv = self._dependencies['get_ffmpeg_version']() or "not installed"
        return f"yt-dlp {ytv}    •    ffmpeg {ffv}"

    def _set_tools_status_text(self, text):
        try:
            self.tools_status.setText(text)
        except Exception:
            # reason: label may be gone during teardown; best-effort UI update
            pass

    def _refresh_tools_status(self):
        # The version getters shell out (up to 5s each on a cold cache, e.g.
        # right after _setup_done resets the ffmpeg probe) — never run them on
        # the GUI thread. Compute off-thread and marshal back via the signal.
        def run():
            try:
                text = self._tools_status_text()
            except Exception:
                # reason: version probes are best-effort; keep the old label
                return
            self.tools_status_text_ready.emit(text)

        threading.Thread(target=run, name='tools-status-refresh', daemon=True).start()

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
            self.cfg_outtmpl,
        )
        for field in validated_fields:
            self._set_input_error(field, False)
            field.setAccessibleDescription("")

        # Compare against the PERSISTED port: during a session-only fallback
        # (bind conflict) the live port differs from the configured one, and
        # an unrelated settings save must not read that as a port change and
        # surprise-restart the server.
        persisted_get = getattr(self.config, 'get_persisted', self.config.get)
        old_port = self._dependencies['clamp_int'](persisted_get("ServerPort", self._value('SERVER_PORT')), self._value('SERVER_PORT'), 1024, 65535)
        old_token = self.config.get("ServerToken", "")
        old_clipboard_grabber = self.config.get("ClipboardLinkGrabber", False)
        old_language = self.config.get("Language", "system")
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
        outtmpl_raw = self.cfg_outtmpl.text().strip()
        outtmpl = self._dependencies['normalize_output_template'](outtmpl_raw) if outtmpl_raw else ""
        if outtmpl_raw and not outtmpl:
            # Never silently drop a rejected template — the save used to
            # report success while sanitize blanked it to the default naming.
            mark_error(
                self.cfg_outtmpl,
                "Keep %(ext)s and use only safe yt-dlp fields such as "
                "%(title)s, %(id)s, %(uploader)s — no absolute paths or '..'.",
            )

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
        self.cfg_outtmpl.setText(outtmpl)
        saved = self.config.update({
            "ServerPort": new_port,
            "ServerToken": new_token,
            "DownloadPath": dl_path,
            "AudioDownloadPath": audio_path,
            "OutputTemplate": outtmpl,
            "EmbedMetadata": self.cfg_metadata.isChecked(),
            "EmbedThumbnail": self.cfg_thumbnail.isChecked(),
            "EmbedChapters": self.cfg_chapters.isChecked(),
            "EmbedSubs": self.cfg_subs.isChecked(),
            "SubLangs": sublangs,
            "SponsorBlock": self.cfg_sponsorblock.isChecked(),
            "SponsorBlockAction": self.cfg_sb_action.currentData(),
            "ConcurrentFragments": self.cfg_fragments.value(),
            "MaxConcurrentDownloads": self.cfg_maxconcurrent.value(),
            "DownloadRetries": self.cfg_retries.value(),
            "MaxFileSizeMB": self.cfg_maxsize.value(),
            "RateLimit": rate,
            "Proxy": proxy,
            "JavaScriptRuntime": self.cfg_js_runtime.currentData(),
            "YtDlpUpdateChannel": self.cfg_ytdlp_channel.currentData(),
            "Language": (
                self.cfg_language.currentData()
                if hasattr(self, "cfg_language")
                else old_language
            ),
            "AutoUpdateYtDlp": self.cfg_autoupdate.isChecked(),
            "CloseToTray": self.cfg_closetotray.isChecked(),
            "StartMinimized": self.cfg_startmin.isChecked(),
            "NotifyOnComplete": self.cfg_notify.isChecked(),
            "ClipboardLinkGrabber": (
                self.cfg_clipboard.isChecked()
                if hasattr(self, "cfg_clipboard")
                else old_clipboard_grabber
            ),
        })
        if not saved:
            self.btn_save.setText("Save changes")
            self._show_settings_status(
                "Could not save settings. Nothing changed; check disk permissions and retry.",
                "danger",
            )
            self._append_log("Settings save failed. Existing settings and server state were preserved.")
            return

        self._dependencies['reset_deno_runtime_cache']()
        self._start_readiness_probe()

        self._sync_connection_ui()
        language_changed = (
            hasattr(self, "cfg_language")
            and self.cfg_language.currentData() != old_language
        )
        if restart_now:
            self._append_log("Connection settings changed; restarting local server.")
            self._stop_server()
            self._start_server()
            self._show_settings_status("Settings saved and server restarted.", "success")
        elif language_changed:
            self._show_settings_status(
                "Settings saved. Restart Astra Downloader to apply the language.",
                "success",
            )
        else:
            self._show_settings_status("Settings saved.", "success")
        if (
            hasattr(self, "cfg_clipboard")
            and self.cfg_clipboard.isChecked()
            and not old_clipboard_grabber
        ):
            # Enabling is an explicit opt-in, so consider the current
            # clipboard value without making the user copy it again.
            self._handle_clipboard_change()
        self.btn_save.setText(tr("Saved"))
        QTimer.singleShot(1500, lambda: self.btn_save.setText(tr("Save changes")))
        status_generation = getattr(self, "_settings_status_generation", 0)
        QTimer.singleShot(3200, lambda: self._clear_settings_status_if_current(status_generation))

    def _browse(self, line_edit):
        path = QFileDialog.getExistingDirectory(self, "Select Folder", line_edit.text())
        if path:
            line_edit.setText(path)

    def _quick_download_url_edited(self, *_args):
        """Clear clipboard-specific guidance once the user edits a staged URL."""
        if not self._clipboard_staged_url:
            return
        self._clipboard_staged_url = ""
        self.quick_download_status.hide()

    def _handle_clipboard_change(self, clipboard_text=None):
        """Stage a copied media URL for review without starting a download."""
        if not self.config.get("ClipboardLinkGrabber", False):
            return
        if clipboard_text is None:
            clipboard_text = self._clipboard.text()
        if not isinstance(clipboard_text, str):
            return
        raw = clipboard_text.strip()
        if not raw or raw == self._clipboard_last_seen:
            return
        self._clipboard_last_seen = raw
        url, error = self._dependencies['normalize_url'](raw)
        # `looks_like_media_link` is a UX filter, not a security one: it keeps
        # the grabber from staging every copied http link (docs, tickets,
        # search results) while still covering any site whose URL reads like
        # media. The download itself is gated by the manager's policy check.
        if error or not self._dependencies['looks_like_media_link'](url):
            return
        if url == self._clipboard_staged_url:
            return

        self._clipboard_staged_url = url
        self.quick_download_url.setText(url)
        self.quick_download_status.setText(
            "Copied video link staged. Review the options, then choose Add to queue."
        )
        self.quick_download_status.setProperty("state", "success")
        self.quick_download_status.show()
        repolish(self.quick_download_status)
        self._append_log("Staged a copied video link for review.")
        if hasattr(self, "tray"):
            self.tray.showMessage(
                self._value('APP_NAME'),
                "Video link staged. Open Downloads to review it before adding it to the queue.",
                QSystemTrayIcon.MessageIcon.Information,
                5000,
            )

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
            self.status_label.setProperty("tone", "danger")
            self.status_label.setAccessibleName("Server status: Error")
            self.status_dot.setProperty("tone", "danger")
            self.status_dot.setAccessibleName("Server status indicator: Error")
            self.server_badge.setProperty("tone", "danger")
            self.server_badge.setAccessibleName(
                "Dashboard server status indicator: Error"
            )
            repolish(self.status_label)
            repolish(self.status_dot)
            repolish(self.server_badge)
            self.dash_hint.setText("Server failed to start. Check the log for details.")
            if self.tray.isVisible():
                self.tray.showMessage(
                    "Astra Downloader",
                    "Server failed to start. Check the log for details.",
                    QSystemTrayIcon.MessageIcon.Warning,
                    6000,
                )
        except Exception:
            # reason: server error reporting must not mask the startup failure
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
            # reason: the listener may already be stopped when the wake-up connection fails
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
            else:
                subscription_manager = self._subscription_manager()
                if subscription_manager is not None:
                    subscription_manager.stop()
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
            self.tools_status_timer.stop()
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
    "GUI_ACCESSIBILITY_COLORS", "system_reduced_motion_enabled",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
