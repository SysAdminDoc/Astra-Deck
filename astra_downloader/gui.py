"""PyQt presentation helpers and lazy legacy GUI compatibility boundary."""

import queue
import time
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, Qt, pyqtSignal
from PyQt6.QtWidgets import QFileDialog, QLabel, QPushButton, QFrame, QVBoxLayout

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


_OWNED_EXPORTS = {
    "repolish", "make_label", "make_section_label", "make_divider",
    "make_card", "make_status_badge", "download_status_tone",
    "human_status", "format_duration", "make_empty_state", "make_stat",
    "ReadinessProbe",
    "FolderPickerService",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
