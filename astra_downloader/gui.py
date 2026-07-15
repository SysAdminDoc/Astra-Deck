"""PyQt presentation helpers and lazy legacy GUI compatibility boundary."""

import os
import queue
import shutil
import time
import uuid
import zipfile
from pathlib import Path

from PyQt6.QtCore import QObject, QThread, QTimer, Qt, pyqtSignal
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
    "SetupWorkerCore",
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
    'CREATE_NO_WINDOW',
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
    'spawn_ytdlp',
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
                 configured_runtime='auto', *, dependencies):
        missing = sorted(set(_REQUIRED_SETUP_DEPENDENCIES) - set(dependencies))
        if missing:
            raise ValueError("Missing setup worker dependencies: " + ", ".join(missing))
        super().__init__(parent)
        self._dependencies = dict(dependencies)
        self.force_ffmpeg = bool(force_ffmpeg)
        self.auto_update_ytdlp = bool(auto_update_ytdlp)
        self.configured_runtime = configured_runtime

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
                import zipfile
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
                    found = False
                    tmp_ffmpeg = self._value('FFMPEG_PATH').with_name(f".{self._value('FFMPEG_PATH').name}.{uuid.uuid4().hex}.download")
                    try:
                        with zipfile.ZipFile(tmp_zip) as zf:
                            for entry in zf.namelist():
                                normalized = entry.replace('\\', '/')
                                if normalized.endswith('/ffmpeg.exe') or normalized == 'ffmpeg.exe':
                                    with zf.open(entry) as src, open(tmp_ffmpeg, 'wb') as dst:
                                        shutil.copyfileobj(src, dst)
                                        dst.flush()
                                        os.fsync(dst.fileno())
                                    if tmp_ffmpeg.stat().st_size <= 0:
                                        raise RuntimeError("ffmpeg.exe in archive was empty")
                                    os.replace(tmp_ffmpeg, self._value('FFMPEG_PATH'))
                                    found = True
                                    break
                    finally:
                        try:
                            if tmp_ffmpeg.exists():
                                tmp_ffmpeg.unlink()
                        except Exception:
                            pass
                    if not found:
                        raise RuntimeError("ffmpeg.exe was not found in the downloaded archive")
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

            # Auto-update yt-dlp (throttled: only if we don't have a recent stamp)
            if self.auto_update_ytdlp:
                self.log.emit("Updating yt-dlp...")
                try:
                    self._dependencies['spawn_ytdlp']([str(self._value('YTDLP_PATH')), '-U'],
                                     creationflags=self._value('CREATE_NO_WINDOW'))
                except Exception as e:
                    self._dependencies['write_persistent_log'](f"yt-dlp -U launch failed during setup: {e}")

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


_OWNED_EXPORTS = {
    "repolish", "make_label", "make_section_label", "make_divider",
    "make_card", "make_status_badge", "download_status_tone",
    "human_status", "format_duration", "make_empty_state", "make_stat",
    "ReadinessProbe",
    "FolderPickerService",
    "SetupWorker", "SetupWorkerCore",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
