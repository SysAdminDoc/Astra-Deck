#!/usr/bin/env python3
"""
Astra Downloader — Desktop GUI + HTTP API server for Astra Deck.
Manages yt-dlp downloads with a PyQt6 GUI, system tray, and REST API on port 9751.

First run auto-downloads yt-dlp + ffmpeg. No separate installer needed.
"""

import sys, os, json, time, re, uuid, subprocess, threading, socket, shutil, traceback, hmac, struct, math
import queue
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

# v1.4.0 (NX9): yt-dlp dropped Python 3.9 in release 2025.10.22.
# Source runs need 3.10+; packaged builds carry their own interpreter.
_MIN_PYTHON = (3, 10)
if sys.version_info < _MIN_PYTHON:
    sys.stderr.write(
        f"[Astra Downloader] Python {_MIN_PYTHON[0]}.{_MIN_PYTHON[1]}+ "
        f"required (you're on "
        f"{sys.version_info.major}.{sys.version_info.minor}). yt-dlp "
        f"dropped Python 3.9 support in 2025.10.22.\n"
    )
    sys.exit(1)

# Source imports are deliberately side-effect free: dependency installation is
# an explicit virtual-environment setup step, never an import-time mutation.
REQUIREMENTS_PATH = Path(__file__).with_name("requirements.txt")


def source_dependency_error(error):
    missing = getattr(error, "name", None) or type(error).__name__
    return (
        f"Astra Downloader source dependencies are missing or unusable ({missing}). "
        "The application will not install packages during import. Create a virtual "
        "environment with `py -3.12 -m venv .venv`, then run "
        f"`.\\.venv\\Scripts\\python.exe -m pip install --require-virtualenv -r \"{REQUIREMENTS_PATH}\"`."
    )


try:
    from PyQt6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QLabel, QPushButton, QTabWidget, QScrollArea, QFrame, QCheckBox, QLineEdit,
        QFileDialog, QSystemTrayIcon, QMenu, QProgressBar, QTextEdit,
        QSpinBox, QComboBox, QGraphicsOpacityEffect, QStyle, QDialog,
        QDialogButtonBox
    )
    from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QObject, QThread, QSize, QPropertyAnimation, QEasingCurve
    from PyQt6.QtGui import QIcon, QFont, QTextCursor
    from flask import Flask, request, jsonify
    import requests as http_requests
except ImportError as exc:
    raise ImportError(source_dependency_error(exc)) from exc

try:
    from .routes import RateLimiter, _ServerAdapter, _build_wsgi_server
    from .config import (
        DEFAULT_CONFIG, ConfigStore, DOWNLOAD_REQUEST_ALLOWED_FIELDS,
        DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS,
        HistoryStore,
        allowed_output_roots, clamp_int, clean_path_text, clean_text, coerce_bool,
        normalize_output_dir, normalize_proxy,
        normalize_rate_limit, normalize_sublangs, normalize_url, sanitize_config,
        validate_download_request_body,
    )
    from .download import (
        DOWNLOAD_ACTIVE_STATES, DOWNLOAD_FAILURE_RECOVERY,
        DOWNLOAD_PENDING_STATES, DOWNLOAD_RETRYABLE_ERROR_CODES,
        DOWNLOAD_RUNNING_STATES, DOWNLOAD_STALL_TIMEOUT_SECONDS,
        DOWNLOAD_TERMINAL_STATES, DOWNLOAD_WATCHDOG_POLL_SECONDS,
        MAX_CONCURRENT, MAX_QUEUED_TOTAL, Download,
        apply_download_failure_classification, build_video_format_args,
        classify_download_failure, download_error_payload, is_playlist_url,
    )
    from .health import (
        BGUTIL_POT_MIN_VERSION, DENO_MIN_VERSION, NODE_MIN_VERSION,
        PO_TOKEN_PROVIDER_PORT, YTDLP_EXTERNAL_RUNTIME_CUTOFF,
        _compare_semver, _parse_ytdlp_release_date,
        build_javascript_runtime_args, build_youtube_extractor_args,
        is_youtube_url, parse_ffmpeg_major, ytdlp_needs_external_runtime,
    )
except ImportError:  # Direct script / flat source-path compatibility.
    from routes import RateLimiter, _ServerAdapter, _build_wsgi_server
    from config import (
        DEFAULT_CONFIG, ConfigStore, DOWNLOAD_REQUEST_ALLOWED_FIELDS,
        DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS,
        HistoryStore,
        allowed_output_roots, clamp_int, clean_path_text, clean_text, coerce_bool,
        normalize_output_dir, normalize_proxy,
        normalize_rate_limit, normalize_sublangs, normalize_url, sanitize_config,
        validate_download_request_body,
    )
    from download import (
        DOWNLOAD_ACTIVE_STATES, DOWNLOAD_FAILURE_RECOVERY,
        DOWNLOAD_PENDING_STATES, DOWNLOAD_RETRYABLE_ERROR_CODES,
        DOWNLOAD_RUNNING_STATES, DOWNLOAD_STALL_TIMEOUT_SECONDS,
        DOWNLOAD_TERMINAL_STATES, DOWNLOAD_WATCHDOG_POLL_SECONDS,
        MAX_CONCURRENT, MAX_QUEUED_TOTAL, Download,
        apply_download_failure_classification, build_video_format_args,
        classify_download_failure, download_error_payload, is_playlist_url,
    )
    from health import (
        BGUTIL_POT_MIN_VERSION, DENO_MIN_VERSION, NODE_MIN_VERSION,
        PO_TOKEN_PROVIDER_PORT, YTDLP_EXTERNAL_RUNTIME_CUTOFF,
        _compare_semver, _parse_ytdlp_release_date,
        build_javascript_runtime_args, build_youtube_extractor_args,
        is_youtube_url, parse_ffmpeg_major, ytdlp_needs_external_runtime,
    )

# ══════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════
APP_NAME = "Astra Downloader"
APP_VERSION = "1.5.1"
SERVICE_ID = "astra-downloader"
# SERVICE_API_VERSION is the wire-schema version. 1.2.0 adds /health fields
# (ytDlpVersion, ffmpegVersion, rateLimit); 1.4.0 adds /health.poTokenProvider
# for bgutil-ytdlp-pot-provider availability; 1.5.0 adds
# /health.denoRuntime for the external JS runtime that yt-dlp >= 2026.04
# requires on YouTube extractions. Older clients ignore unknown keys, so
# the major version stays at 2 (additive, backward-compatible).
SERVICE_API_VERSION = 2
SERVER_PORT = 9751
INSTANCE_CONTROL_HOST = '127.0.0.1'
INSTANCE_CONTROL_PORT = 9752
INSTANCE_LOCK_PORT = 9753
# Ordered fallback ports the server tries when the configured port is unavailable.
# The browser extension probes the same list to discover the running port.
PORT_FALLBACKS = [9751, 9761, 9771, 9781, 9791, 9851]
DIAGNOSTIC_LOG_ENTRY_LIMIT = 30
DIAGNOSTIC_TEXT_LIMIT = 600
# Stall watchdog for the download subprocess. `for line in proc.stdout` blocks
# forever if yt-dlp wedges on a dead socket — there is no other timeout on the
# download path, so a hung process permanently consumes one of MAX_CONCURRENT
# slots and leaks an OS process. A download making any progress streams output
# constantly (resetting the timer), so only a genuinely wedged process — zero
# output for this long — is killed. Deliberately generous so a slow ffmpeg merge
# of a large file (which can be silent for minutes) is never false-killed.
INSTALL_DIR = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'AstraDownloader'
CONFIG_PATH = INSTALL_DIR / 'config.json'
HISTORY_PATH = INSTALL_DIR / 'history.json'
DOWNLOAD_QUEUE_PATH = INSTALL_DIR / 'download-queue.json'
ARCHIVE_PATH = INSTALL_DIR / 'archive.txt'
LOG_PATH = INSTALL_DIR / 'server.log'
CRASH_LOG_PATH = INSTALL_DIR / 'crash.log'
YTDLP_PATH = INSTALL_DIR / 'yt-dlp.exe'
FFMPEG_PATH = INSTALL_DIR / 'ffmpeg.exe'
ICON_PATH = INSTALL_DIR / 'AstraDownloader.ico'
# v1.3.0: archive.txt path retained only so first-run on this build can
# delete the leftover file. The download-archive feature itself has
# been removed — re-downloads now always run.
ARCHIVE_PATH = INSTALL_DIR / 'archive.txt'

YTDLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
FFMPEG_URL = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
DENO_DIR = INSTALL_DIR / 'deno'
DENO_PATH = DENO_DIR / 'deno.exe'
NATIVE_HOST_DIR = INSTALL_DIR / 'native-hosts'
DEFAULT_FIREFOX_EXTENSION_IDS = ("ytkit@sysadmindoc.github.io",)
DENO_ZIP_URL = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"
DENO_SHA256_URL = DENO_ZIP_URL + ".sha256sum"
DENO_SHA256_ASSET = Path(urlparse(DENO_ZIP_URL).path).name
ICON_URL = "https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/AstraDownloader.ico"
COMPANION_UPDATE_VERSION_URL = "https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/astra_downloader/astra_downloader.py"
COMPANION_UPDATE_EXE_URL = "https://github.com/SysAdminDoc/Astra-Deck/releases/latest/download/AstraDownloader.exe"
COMPANION_UPDATE_SHA256_URL = "https://github.com/SysAdminDoc/Astra-Deck/releases/latest/download/AstraDownloader.exe.sha256"
COMPANION_UPDATE_TIMEOUT_SECONDS = 120
COMPANION_UPDATE_MIN_BYTES = 1024
YTDLP_ROLLBACK_FILENAME = '.yt-dlp.last-known-good.exe'
COMPANION_ROLLBACK_FILENAME = '.AstraDownloader.last-known-good.exe'
# Hard ceiling for any single helper download (companion exe, yt-dlp, ffmpeg
# zip, icon). The largest legitimate asset (the ffmpeg archive) is well under
# 200 MB; a misbehaving CDN, truncating proxy, or endless redirect body must
# not be able to fill the disk before the SHA-256 check ever runs.
HELPER_DOWNLOAD_MAX_BYTES = 500 * 1024 * 1024  # 500 MB


# v1.2.0: rate-limit for /download. Token-bucket sliding window — tuned so a
# legitimate user spamming the download button hits MAX_CONCURRENT long before
# this kicks in, but a compromised extension can't queue 10k /download calls
# in a burst.
RATE_LIMIT_DOWNLOAD_MAX = 30
RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS = 60
RATE_LIMIT_PICKFOLDER_MAX = 5
RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS = 60
# v1.2.0: CORS preflight cache horizon — keeps browsers from re-asking OPTIONS
# for every POST /download during a multi-video session.
CORS_MAX_AGE_SECONDS = 600
# v1.5.1 / RESEARCH_FEATURE_PLAN EI12: bounds on the HTTP surface so the
# Flask process can't be OOM'd by either side of an oversized payload.
#
# Incoming: 1 MB caps the body of POST /download / /config / /pick-folder.
# Real payloads are <2 KB (a yt-dlp URL + flags); 1 MB is a generous
# defensive margin that still blocks "POST a 1 GB blob" memory blowups.
# Flask honours this via app.config['MAX_CONTENT_LENGTH'] and emits 413
# itself before any handler sees the body.
#
# Outgoing: 10 MB caps the jsonify'd payload from cors_response. /history
# already caps to 500 entries (each ~500 bytes), /health is small,
# /config is bounded — but a future endpoint that streams logs or
# format-listings could blow past. cors_response checks the serialised
# body length and swaps oversized payloads for a 413 error response so
# the wire never carries the bloated content.
MAX_REQUEST_BYTES = 1 * 1024 * 1024
MAX_RESPONSE_BYTES = 10 * 1024 * 1024
# v1.2.0: upstream publishes per-release checksum sidecars. Executable helper
# downloads must fail closed when their sidecar is missing or malformed; using
# an unverified yt-dlp/ffmpeg binary is worse than a blocked first-run setup.
YTDLP_SHA256_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS"
YTDLP_SHA256_ASSET = "yt-dlp.exe"
FFMPEG_SHA256_URL = FFMPEG_URL + ".sha256"
# v1.2.0: stamp we write under HKCU so shortcut/protocol/task/uninstall
# registration is skipped on subsequent launches at the same version.
INTEGRATIONS_STAMP_KEY = r'Software\Classes\AstraDownloader'
INTEGRATIONS_STAMP_VALUE = 'IntegrationsVersion'

# v1.4.0 (N1): bgutil-ytdlp-pot-provider integration.
# YouTube binds PO tokens per video in 2026; manual extraction is deprecated.
# Without a PO Token provider, yt-dlp's `web` client increasingly fails with
# "Sign in to confirm you're not a bot." Astra Downloader detects the
# upstream provider's HTTP server on its default port and surfaces availability
# both in /health (for the extension banner) and in the yt-dlp invocation
# (via the youtubepot-bgutilhttp extractor-arg). The plugin itself is
# installed by the user via pip/docker; we only consume the HTTP endpoint.
# Refs:
#   https://github.com/Brainicism/bgutil-ytdlp-pot-provider
#   https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
PO_TOKEN_PROVIDER_PROBE_TIMEOUT = 1.0
_PO_TOKEN_PROVIDER_CACHE_TTL_SECONDS = 30
# v1.5.0: minimum bgutil-ytdlp-pot-provider version that is
# known to work cleanly with current yt-dlp. Bumped when upstream fixes
# something that materially changes our success rate (PO token format
# change, attestation extractor change, etc.). Older providers may still
# work but the extension popup surfaces a notice asking the user to update.
# Compare via the local _compare_semver helper — handles X.Y / X.Y.Z and
# pre-release suffixes by truncating at the first non-numeric segment.

# yt-dlp >= 2026.04 ships an `external n/sig solver` for YouTube
# (upstream PR #14157). Without an installed JavaScript runtime — Deno is
# the documented option — the `web` and `web_safari` clients return empty
# format lists on a growing share of videos. The /health endpoint surfaces
# Deno presence so the downloadHealthPanel can render a "Deno: missing"
# pill when the bundled yt-dlp.exe is recent enough to need it but Deno
# is absent from the system PATH.
#
# Cutoff is the first nightly that flipped the dep from optional to
# load-bearing — pinned conservatively at 2026.04.01 so newer-than-cutoff
# yt-dlps are flagged; older ones (the in-field-stable pre-Deno line)
# don't false-positive on a misconfigured PATH.
DENO_RUNTIME_PROBE_TIMEOUT = 1.5
_DENO_RUNTIME_CACHE_TTL_SECONDS = 60
JS_RUNTIME_CAPABILITY_MARKER = "ASTRA_EJS_RUNTIME_OK"

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
DOWNLOAD_QUEUE_SCHEMA_VERSION = 1
CONTROL_CHARS_RE = re.compile(r'[\x00-\x1f\x7f]')
MAX_TEXT_FIELD = 500
MAX_PATH_FIELD = 2048
LOG_MAX_BYTES = 1024 * 1024
_LOG_LOCK = threading.Lock()
_LOG_RING_MAX = 20
_log_ring = __import__('collections').deque(maxlen=_LOG_RING_MAX)
YTDLP_FORBIDDEN_LINK_FLAGS = frozenset({
    '--write-link',
    '--write-url-link',
    '--write-desktop-link',
    '--write-webloc-link',
})


def validate_ytdlp_spawn_args(args):
    """Fail closed if a shortcut-writing flag reaches the process boundary.

    Request fields and persisted settings are allowlisted earlier, but this
    final guard also catches future builder regressions and yt-dlp's accepted
    long-option abbreviations. These flags create files from remote metadata
    and were the affected surface in CVE-2026-55404.
    """
    safe_args = list(args)
    for raw_arg in safe_args[1:]:
        if not isinstance(raw_arg, str):
            continue
        option = raw_arg.strip().split('=', 1)[0].casefold()
        if option.startswith('--') and any(
                forbidden.startswith(option) for forbidden in YTDLP_FORBIDDEN_LINK_FLAGS):
            raise ValueError('Refusing unsafe yt-dlp link-file output flag.')
    return safe_args


def spawn_ytdlp(args, **kwargs):
    """Launch yt-dlp only after applying final process-boundary policy."""
    return subprocess.Popen(validate_ytdlp_spawn_args(args), **kwargs)


def write_persistent_log(message, path=LOG_PATH):
    """Best-effort disk log for diagnostics when the windowed exe has no console."""
    try:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with _LOG_LOCK:
            if path.exists() and path.stat().st_size > LOG_MAX_BYTES:
                backup = path.with_suffix(path.suffix + ".1")
                try:
                    if backup.exists():
                        backup.unlink()
                    path.replace(backup)
                except Exception:
                    pass
            with open(path, 'a', encoding='utf-8') as f:
                f.write(f"{ts} {message}\n")
            _log_ring.append({'ts': ts, 'msg': message[:MAX_TEXT_FIELD]})
    except Exception:
        pass


def get_recent_log_entries():
    with _LOG_LOCK:
        return list(_log_ring)


def redact_diagnostic_text(value, secrets=None):
    """Return bounded support text without paths, URLs, or secret-shaped values."""
    text = str(value or '')[:DIAGNOSTIC_TEXT_LIMIT]
    for secret in secrets or ():
        secret = str(secret or '')
        if secret:
            text = text.replace(secret, '[redacted secret]')

    replacements = (
        (str(INSTALL_DIR), '%LOCALAPPDATA%\\AstraDownloader'),
        (str(Path.home()), '%USERPROFILE%'),
    )
    for raw, replacement in replacements:
        if raw:
            text = re.sub(re.escape(raw), lambda _match: replacement, text, flags=re.IGNORECASE)

    # Support bundles do not need user/video URLs. Removing the whole value also
    # avoids leaking query tokens, video IDs, channel handles, and local callback
    # parameters while retaining the surrounding failure message.
    text = re.sub(r'https?://[^\s\]\[(){}<>"\']+', '[redacted URL]', text, flags=re.IGNORECASE)
    # Any remaining absolute Windows path is private even when it lives outside
    # the default install/home roots. Stop at common log delimiters.
    text = re.sub(r'(?<![A-Za-z0-9_])[A-Za-z]:\\[^\r\n\t,;]+', '[redacted path]', text)
    text = re.sub(
        r'(?i)\b(authorization|bearer|cookie|set-cookie|token|api[-_ ]?key)\b\s*[:=]?\s*[^\s,;]+',
        lambda match: f"{match.group(1)}=[redacted]",
        text,
    )
    # Long opaque hex/base64url values cover server tokens, API keys, cookie
    # fragments, request IDs, and download UUIDs. Keep short hashes/versions.
    text = re.sub(r'(?i)\b[a-f0-9]{24,}\b', '[redacted identifier]', text)
    text = re.sub(r'\b[A-Za-z0-9_-]{32,}\b', '[redacted identifier]', text)
    return text


def build_diagnostics_bundle(server_running=False, endpoint='', active_downloads=0,
                             completed_downloads=0, recent_logs=None, secrets=None):
    """Build the allowlisted, redacted diagnostics payload shown before copy."""
    safe_logs = []
    for entry in list(recent_logs or [])[-DIAGNOSTIC_LOG_ENTRY_LIMIT:]:
        if not isinstance(entry, dict):
            continue
        message = redact_diagnostic_text(entry.get('msg', ''), secrets=secrets)
        if not message:
            continue
        safe_logs.append({
            'timestamp': clean_text(entry.get('ts'), '', 32),
            'message': message,
        })
    return {
        'schemaVersion': 1,
        'application': {
            'name': APP_NAME,
            'version': APP_VERSION,
        },
        'service': {
            'state': 'running' if server_running else 'stopped',
            'endpoint': clean_text(endpoint, '', 128),
            'activeDownloads': max(0, int(active_downloads or 0)),
            'completedThisSession': max(0, int(completed_downloads or 0)),
        },
        'dependencies': {
            'ytDlpInstalled': YTDLP_PATH.exists(),
            'ffmpegInstalled': FFMPEG_PATH.exists(),
            'denoInstalled': DENO_PATH.exists() or bool(shutil.which('deno')),
        },
        'recentLog': safe_logs,
    }


def log_crash(context="Unhandled exception"):
    try:
        write_persistent_log(f"{context}\n{traceback.format_exc()}", CRASH_LOG_PATH)
    except Exception:
        pass


def _timestamp_suffix():
    return datetime.now().strftime("%Y%m%d%H%M%S")


def atomic_write_json(path, data):
    """Write JSON atomically so crashes do not leave truncated config/history files."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass


def atomic_copy_verified(source, destination):
    """Copy one file through a sibling temporary and verify byte identity.

    Update recovery depends on the backup remaining usable after a crash.  A
    normal ``copy2`` can leave a truncated destination, so copy, fsync, hash,
    and only then atomically replace the retained backup.
    """
    source = Path(source)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_digest = _compute_sha256(source)
    if not source_digest:
        raise RuntimeError(f'Could not verify source file {source.name}.')
    tmp = destination.with_name(f'.{destination.name}.{uuid.uuid4().hex}.tmp')
    try:
        with open(source, 'rb') as src, open(tmp, 'wb') as dst:
            shutil.copyfileobj(src, dst, length=1024 * 1024)
            dst.flush()
            os.fsync(dst.fileno())
        copied_digest = _compute_sha256(tmp)
        if copied_digest != source_digest:
            raise RuntimeError(f'Backup verification failed for {source.name}.')
        os.replace(tmp, destination)
        return source_digest
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


def download_file_atomic(url, path, timeout=60, chunk_size=65536, progress_cb=None,
                         max_bytes=HELPER_DOWNLOAD_MAX_BYTES):
    """Download with atomic replacement.

    progress_cb(downloaded_bytes, total_bytes_or_None) is fired roughly each
    chunk when supplied. It MUST be cheap and thread-safe — the caller is
    responsible for marshaling back to Qt.

    max_bytes caps the stream (audit fix): the byte count is checked while
    streaming so a server that lies about (or omits) content-length cannot
    fill the disk; on breach the partial temp file is removed and a
    RuntimeError raised before any SHA-256 verification would run.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.download")
    try:
        with http_requests.get(url, stream=True, timeout=timeout) as r:
            r.raise_for_status()
            total = None
            try:
                total = int(r.headers.get('content-length', '') or 0) or None
            except (TypeError, ValueError):
                total = None
            if max_bytes and total and total > max_bytes:
                raise RuntimeError(
                    f"Download too large: server advertises {total} bytes "
                    f"(limit {max_bytes})"
                )
            downloaded = 0
            last_cb = 0.0
            with open(tmp, 'wb') as f:
                for chunk in r.iter_content(chunk_size):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if max_bytes and downloaded > max_bytes:
                            raise RuntimeError(
                                f"Download exceeded the {max_bytes} byte limit; aborted"
                            )
                        if progress_cb is not None:
                            now = time.monotonic()
                            # Throttle to ~10 Hz so very fast downloads don't
                            # flood the Qt event loop with progress signals.
                            if now - last_cb > 0.1:
                                last_cb = now
                                try:
                                    progress_cb(downloaded, total)
                                except Exception:
                                    # reason: progress reporting must never
                                    # abort a successful download.
                                    pass
                f.flush()
                os.fsync(f.fileno())
            if progress_cb is not None:
                try:
                    progress_cb(downloaded, total)
                except Exception:
                    pass
        if tmp.stat().st_size <= 0:
            raise RuntimeError("Downloaded file was empty")
        os.replace(tmp, path)
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass


# ── v1.2.0 helpers: SHA-256 verification, path confinement, rate limiting ──
def _compute_sha256(path, chunk_size=65536):
    """Return lowercase hex SHA-256 of a file's contents, or None on error."""
    import hashlib
    try:
        h = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(chunk_size), b''):
                h.update(chunk)
        return h.hexdigest().lower()
    except Exception as e:
        write_persistent_log(f"SHA-256 compute failed for {path}: {e}")
        return None


def _parse_sha256_sums(body, target_asset=None):
    """Parse a SHA256SUMS-style document.

    Supports two formats:
      <hex>  <filename>
      <hex> *<filename>
      <hex>
    Returns the hex digest for target_asset, or the single digest if the file
    contains exactly one entry with no filename.
    """
    if not body:
        return None
    body = body.strip()
    if not body:
        return None
    # Single-line "<hex>" sidecar (some ffmpeg-builds assets ship this form).
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
    if len(lines) == 1 and re.fullmatch(r'[0-9A-Fa-f]{64}', lines[0]):
        return lines[0].lower()
    for line in lines:
        # Tolerate "<hex>  <name>" and "<hex> *<name>" variants.
        m = re.match(r'^([0-9A-Fa-f]{64})\s+\*?(.+)$', line)
        if not m:
            continue
        digest, name = m.group(1).lower(), m.group(2).strip()
        if target_asset and Path(name).name != target_asset:
            continue
        return digest
    return None


def fetch_expected_sha256(sidecar_url, target_asset=None, timeout=15):
    """Best-effort checksum fetch. Returns None when the sidecar is missing,
    malformed, or the request fails — caller decides whether to hard-fail."""
    try:
        with http_requests.get(sidecar_url, timeout=timeout) as r:
            if r.status_code != 200:
                return None
            return _parse_sha256_sums(r.text, target_asset=target_asset)
    except Exception:
        return None


def verify_file_sha256(path, expected_hex):
    """Raise RuntimeError on mismatch, return True on success, False when
    expected_hex is missing so callers can decide whether to fail closed."""
    if not expected_hex:
        return False
    expected = expected_hex.strip().lower()
    if not re.fullmatch(r'[0-9a-f]{64}', expected):
        return False
    actual = _compute_sha256(path)
    if actual is None:
        raise RuntimeError(f"Could not hash {path} for integrity verification")
    if actual != expected:
        raise RuntimeError(
            f"SHA-256 mismatch for {Path(path).name}: "
            f"expected {expected[:12]}…, got {actual[:12]}…. "
            "Delete the downloaded file and retry setup."
        )
    return True


def cleanup_stale_cookie_jars(older_than_seconds=300):
    """Sweep orphan .cookies.{id}.txt files left behind by a crash.

    Cookie jars normally clean up in the download's finally block. When the
    server is killed mid-download (power loss, taskkill /F), session cookies
    leak into INSTALL_DIR. This sweep runs on server start.
    """
    try:
        now = time.time()
        for entry in INSTALL_DIR.glob('.cookies.*.txt'):
            try:
                if now - entry.stat().st_mtime > older_than_seconds:
                    entry.unlink()
            except Exception:
                # reason: filesystem churn; we'll try again next start.
                pass
    except Exception:
        # reason: install dir unreadable — nothing actionable at this level.
        pass


# ── v1.2.0: cached version strings for /health ──
# Audit fix: lock-guarded like _po_token_provider_cache / _deno_runtime_cache.
# /health is served by concurrent waitress threads; the previous unguarded
# read-modify-write was a benign race (worst case: duplicate subprocess probe)
# but inconsistent with the other shared probe caches.
_version_cache = {
    'ytdlp': {'value': None, 'checked_at': 0.0},
    'ffmpeg': {'value': None, 'checked_at': 0.0},
}
_VERSION_CACHE_TTL_SECONDS = 3600
_VERSION_CACHE_LOCK = threading.Lock()


def _run_captured(args, timeout=5):
    """Capture subprocess output with CREATE_NO_WINDOW. Returns '' on failure."""
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
        return (result.stdout or '') + (result.stderr or '')
    except Exception:
        return ''


def get_ytdlp_version(force=False):
    if not YTDLP_PATH.exists():
        return None
    with _VERSION_CACHE_LOCK:
        cache = _version_cache['ytdlp']
        now = time.time()
        if not force and cache['value'] and (now - cache['checked_at']) < _VERSION_CACHE_TTL_SECONDS:
            return cache['value']
        output = _run_captured([str(YTDLP_PATH), '--version'])
        version = output.strip().splitlines()[0] if output.strip() else ''
        if re.match(r'^\d{4}\.\d{1,2}\.\d{1,2}', version):
            cache['value'] = version
        elif version:
            cache['value'] = version[:32]
        cache['checked_at'] = now
        return cache['value']


# v1.4.0 (N1): cached probe for bgutil-ytdlp-pot-provider.
# Caches for 30 s so the /health endpoint stays cheap under polling but a
# user starting the provider mid-session sees it surfaced within half a
# minute. Returns None when unreachable so the call site can branch
# clearly. The cache cell is shared across threads — the 30 s TTL races
# benignly (two probes in flight is fine).
_po_token_provider_cache = {'value': None, 'checked_at': 0.0}
_PO_TOKEN_PROVIDER_CACHE_LOCK = threading.Lock()

def probe_po_token_provider(force=False, timeout=PO_TOKEN_PROVIDER_PROBE_TIMEOUT):
    """Best-effort detection of a running bgutil-ytdlp-pot-provider.

    Returns ``{'ok': True, 'port': int, 'version': str | None, 'stale': bool,
    'minVersion': str}`` when the provider's HTTP server responds on
    ``127.0.0.1:4416``, ``None`` otherwise. Cached for 30 s. The probe uses
    a tight timeout so a stale firewall hold can't gum up health polling.

    The ``stale`` field is true when the detected version
    string compares less than ``BGUTIL_POT_MIN_VERSION``. The extension
    popup health surface renders an amber "update bgutil-pot" notice on
    stale, distinct from the absence notice when the provider isn't running
    at all.

    The provider's ``/ping`` endpoint is the documented liveness check; older
    builds expose ``/`` instead. We accept either as long as the body parses
    as JSON or the status is 2xx — false positives are harmless because the
    actual PO-token call is yt-dlp's responsibility.
    """
    with _PO_TOKEN_PROVIDER_CACHE_LOCK:
        cache = _po_token_provider_cache
        now = time.time()
        if not force and (now - cache['checked_at']) < _PO_TOKEN_PROVIDER_CACHE_TTL_SECONDS:
            return cache['value']
        result = None
        for path in ('/ping', '/'):
            try:
                r = http_requests.get(
                    f'http://127.0.0.1:{PO_TOKEN_PROVIDER_PORT}{path}',
                    timeout=timeout,
                )
            except Exception:
                continue
            if not getattr(r, 'ok', False):
                continue
            version = None
            try:
                payload = r.json()
            except ValueError:
                payload = None
            if isinstance(payload, dict):
                raw = payload.get('version') or payload.get('plugin_version')
                if raw is not None:
                    version = str(raw)[:32]
            # stale-version comparison. Stale is only set true
            # when the detected version parses cleanly AND compares less
            # than BGUTIL_POT_MIN_VERSION. Unknown version -> stale=False
            # (don't false-positive on older provider builds that don't
            # return a version field).
            stale = False
            if version:
                try:
                    if _compare_semver(version, BGUTIL_POT_MIN_VERSION) < 0:
                        stale = True
                except Exception:
                    stale = False
            result = {
                'ok': True,
                'port': PO_TOKEN_PROVIDER_PORT,
                'version': version,
                'stale': stale,
                'minVersion': BGUTIL_POT_MIN_VERSION,
            }
            break
        cache['value'] = result
        cache['checked_at'] = now
        return result


def reset_po_token_provider_cache():
    """Test hook + manual recheck path — clears the cached probe result."""
    with _PO_TOKEN_PROVIDER_CACHE_LOCK:
        _po_token_provider_cache['value'] = None
        _po_token_provider_cache['checked_at'] = 0.0


# Deno (or other external JS runtime) presence probe + cutoff
# evaluation for the bundled yt-dlp.exe.
_deno_runtime_cache = {'value': None, 'checked_at': 0.0}
_DENO_RUNTIME_CACHE_LOCK = threading.Lock()


class DenoProvisionError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


_last_deno_provision_error = {'code': None, 'message': ''}


def _set_deno_provision_error(code=None, message=''):
    _last_deno_provision_error['code'] = code
    _last_deno_provision_error['message'] = str(message or '')


def get_last_deno_provision_error():
    return dict(_last_deno_provision_error)


def _parse_deno_version(output):
    if not output:
        return None
    first_line = output.strip().splitlines()[0] if output.strip() else ''
    m = re.search(r'(\d+\.\d+\.\d+)', first_line)
    if m:
        return m.group(1)
    return first_line[:32] if first_line else None


def _is_deno_version_supported(version):
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version.strip()):
        return False
    try:
        return _compare_semver(version, DENO_MIN_VERSION) >= 0
    except Exception:
        return False


def _probe_deno_binary_version(deno_path):
    output = _run_captured([str(deno_path), '--version'], timeout=DENO_RUNTIME_PROBE_TIMEOUT)
    return _parse_deno_version(output)


def _parse_javascript_runtime_version(runtime, output):
    if runtime == 'deno':
        return _parse_deno_version(output)
    if not output:
        return None
    first_line = output.strip().splitlines()[0] if output.strip() else ''
    match = re.search(r'(\d+\.\d+\.\d+)', first_line)
    return match.group(1) if match else None


def _javascript_runtime_supported(runtime, version):
    minimum = DENO_MIN_VERSION if runtime == 'deno' else NODE_MIN_VERSION
    if runtime not in {'deno', 'node'}:
        return False
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version.strip()):
        return False
    try:
        return _compare_semver(version, minimum) >= 0
    except Exception:
        return False


def _probe_javascript_execution(runtime, executable):
    if runtime == 'deno':
        args = [str(executable), 'eval', '--no-config', f"console.log('{JS_RUNTIME_CAPABILITY_MARKER}')"]
    elif runtime == 'node':
        args = [
            str(executable), '--input-type=commonjs', '-e',
            f"process.stdout.write('{JS_RUNTIME_CAPABILITY_MARKER}')",
        ]
    else:
        return False
    output = _run_captured(args, timeout=DENO_RUNTIME_PROBE_TIMEOUT)
    return JS_RUNTIME_CAPABILITY_MARKER in output


def _javascript_runtime_candidates(configured_runtime):
    candidates = []
    if configured_runtime in {'auto', 'deno'}:
        if DENO_PATH.exists():
            candidates.append(('deno', str(DENO_PATH), 'bundled'))
        system_deno = shutil.which('deno')
        if system_deno and all(path != system_deno for _runtime, path, _source in candidates):
            candidates.append(('deno', system_deno, 'system'))
    if configured_runtime in {'auto', 'node'}:
        system_node = shutil.which('node')
        if system_node:
            candidates.append(('node', system_node, 'system'))
    return candidates


def _evaluate_javascript_runtime(runtime, path, source):
    minimum = DENO_MIN_VERSION if runtime == 'deno' else NODE_MIN_VERSION
    try:
        output = _run_captured([str(path), '--version'], timeout=DENO_RUNTIME_PROBE_TIMEOUT)
        version = _parse_javascript_runtime_version(runtime, output)
    except Exception:
        return {
            'runtime': runtime, 'version': None, 'path': path, 'source': source,
            'supported': False, 'ejsReady': False, 'minVersion': minimum,
            'reason': 'runtime-probe-failed',
        }
    if not version:
        return {
            'runtime': runtime, 'version': None, 'path': path, 'source': source,
            'supported': False, 'ejsReady': False, 'minVersion': minimum,
            'reason': 'runtime-version-unparseable',
        }
    supported = _javascript_runtime_supported(runtime, version)
    if not supported:
        return {
            'runtime': runtime, 'version': version, 'path': path, 'source': source,
            'supported': False, 'ejsReady': False, 'minVersion': minimum,
            'reason': 'runtime-version-unsupported',
        }
    try:
        ejs_ready = _probe_javascript_execution(runtime, path)
    except Exception:
        ejs_ready = False
    return {
        'runtime': runtime, 'version': version, 'path': path, 'source': source,
        'supported': True, 'ejsReady': ejs_ready, 'minVersion': minimum,
        'reason': 'ready' if ejs_ready else 'runtime-execution-failed',
    }


def provision_deno():
    """Download Deno into DENO_DIR if not already present.

    Returns the path to the provisioned deno.exe, or None on failure.
    Follows the same atomic-download pattern as yt-dlp and ffmpeg.
    """
    _set_deno_provision_error()
    if DENO_PATH.exists():
        version = _probe_deno_binary_version(DENO_PATH)
        if _is_deno_version_supported(version):
            return str(DENO_PATH)
        write_persistent_log(
            f"Bundled Deno {version or 'unknown'} is below required {DENO_MIN_VERSION}; refreshing"
        )
    DENO_DIR.mkdir(parents=True, exist_ok=True)
    import zipfile
    tmp_zip = DENO_DIR / f'.deno.{uuid.uuid4().hex}.zip'
    try:
        expected_hash = fetch_expected_sha256(DENO_SHA256_URL, target_asset=DENO_SHA256_ASSET)
        if not expected_hash:
            raise DenoProvisionError(
                'deno-sha256-sidecar-missing',
                'Deno checksum sidecar was missing or malformed; refusing to extract an unverified runtime.',
            )
        with http_requests.get(DENO_ZIP_URL, stream=True, timeout=120) as r:
            r.raise_for_status()
            total_bytes = 0
            with open(tmp_zip, 'wb') as f:
                for chunk in r.iter_content(65536):
                    if chunk:
                        f.write(chunk)
                        total_bytes += len(chunk)
                        if total_bytes > HELPER_DOWNLOAD_MAX_BYTES:
                            raise RuntimeError('Deno archive exceeded size limit')
                f.flush()
                os.fsync(f.fileno())
        if tmp_zip.stat().st_size <= 0:
            raise RuntimeError('Downloaded Deno archive was empty')
        try:
            verify_file_sha256(tmp_zip, expected_hash)
        except RuntimeError as e:
            try:
                tmp_zip.unlink(missing_ok=True)
            except OSError:
                pass
            raise DenoProvisionError('deno-sha256-verification-failed', str(e))
        tmp_exe = DENO_PATH.with_name(f'.deno.{uuid.uuid4().hex}.exe')
        with zipfile.ZipFile(tmp_zip) as zf:
            found = False
            for entry in zf.namelist():
                if entry.replace('\\', '/').endswith('deno.exe') or entry == 'deno.exe':
                    with zf.open(entry) as src, open(tmp_exe, 'wb') as dst:
                        shutil.copyfileobj(src, dst)
                        dst.flush()
                        os.fsync(dst.fileno())
                    if tmp_exe.stat().st_size <= 0:
                        raise RuntimeError('deno.exe in archive was empty')
                    os.replace(tmp_exe, DENO_PATH)
                    found = True
                    break
            if not found:
                raise RuntimeError('deno.exe not found in archive')
        installed_version = _probe_deno_binary_version(DENO_PATH)
        if not _is_deno_version_supported(installed_version):
            try:
                DENO_PATH.unlink(missing_ok=True)
            except OSError:
                pass
            raise DenoProvisionError(
                'deno-runtime-unsupported',
                (
                    f"Provisioned Deno {installed_version or 'unknown'} is below "
                    f"the required {DENO_MIN_VERSION} runtime floor."
                ),
            )
        reset_deno_runtime_cache()
        return str(DENO_PATH)
    except DenoProvisionError as e:
        _set_deno_provision_error(e.code, str(e))
        write_persistent_log(f"Deno provisioning failed: {e}")
        return None
    except Exception as e:
        _set_deno_provision_error('deno-provision-failed', str(e))
        write_persistent_log(f"Deno provisioning failed: {e}")
        return None
    finally:
        try:
            tmp_zip.unlink(missing_ok=True)
        except OSError:
            pass
        # Clean up partial extraction if tmp_exe was created but not moved
        try:
            if tmp_exe.exists():
                tmp_exe.unlink(missing_ok=True)
        except (OSError, NameError):
            # reason: NameError if tmp_exe was never assigned (zip download failed)
            pass


def probe_deno_runtime(force=False, configured_runtime='auto'):
    """Probe the configured yt-dlp JavaScript runtime capability.

    The historical function name remains for wire compatibility. The result
    now distinguishes version support from actual JavaScript execution and can
    select Node 22+ when configured. Unknown and exception states fail closed.
    """
    preference = str(configured_runtime or 'auto').strip().lower()
    if preference not in {'auto', 'deno', 'node'}:
        preference = 'auto'
    with _DENO_RUNTIME_CACHE_LOCK:
        cache = _deno_runtime_cache
        now = time.time()
        if (not force
                and cache.get('preference') == preference
                and (now - cache['checked_at']) < _DENO_RUNTIME_CACHE_TTL_SECONDS):
            return cache['value']
        ytdlp_version = get_ytdlp_version()
        parsed_ytdlp_version = _parse_ytdlp_release_date(ytdlp_version or '')
        # A present binary whose version cannot be verified is not evidence of
        # the pre-runtime line. Treat it as runtime-required; first-run remains
        # quiet because there is no binary yet.
        needs_runtime = (
            ytdlp_needs_external_runtime(ytdlp_version or '')
            if parsed_ytdlp_version is not None
            else YTDLP_PATH.exists()
        )
        evaluated = [
            _evaluate_javascript_runtime(runtime, path, source)
            for runtime, path, source in _javascript_runtime_candidates(preference)
        ]
        selected = next((item for item in evaluated if item['ejsReady']), None)
        if selected is None and evaluated:
            selected = evaluated[0]
        if selected is None:
            selected = {
                'runtime': preference if preference != 'auto' else None,
                'version': None,
                'path': None,
                'source': None,
                'supported': False,
                'ejsReady': False,
                'minVersion': NODE_MIN_VERSION if preference == 'node' else DENO_MIN_VERSION,
                'reason': 'runtime-not-installed',
            }

        installed = selected['path'] is not None
        ready = selected['supported'] and selected['ejsReady']
        runtime_label = (selected.get('runtime') or 'JavaScript runtime').title()
        advice = ''
        if needs_runtime and selected['reason'] == 'runtime-not-installed':
            advice = (
                'No configured JavaScript runtime was found. Select Auto or Deno and click '
                'Provision Deno, or select Node after installing Node 22 or newer.'
            )
        elif needs_runtime and selected['reason'] == 'runtime-version-unsupported':
            advice = (
                f"{runtime_label} {selected.get('version') or 'unknown'} is below the required "
                f"{selected['minVersion']} runtime floor. Update it, then retry."
            )
        elif needs_runtime and selected['reason'] in {'runtime-version-unparseable', 'runtime-probe-failed'}:
            advice = (
                f"Astra Downloader could not verify the configured {runtime_label} version. "
                'Repair or replace the runtime, then retry.'
            )
        elif needs_runtime and not ready:
            advice = (
                f"{runtime_label} reported a supported version but failed the JavaScript "
                'execution probe required by yt-dlp EJS. Repair or replace it, then retry.'
            )
        result = {
            **selected,
            'installed': installed,
            'stale': bool(installed and not ready),
            'configuredRuntime': preference,
            'canProvisionDeno': preference in {'auto', 'deno'},
            'ytdlpNeedsRuntime': needs_runtime,
            'advice': advice,
        }
        cache['value'] = result
        cache['checked_at'] = now
        cache['preference'] = preference
        return result


probe_javascript_runtime = probe_deno_runtime


def reset_deno_runtime_cache():
    """Test hook + manual recheck path — clears the cached probe result."""
    with _DENO_RUNTIME_CACHE_LOCK:
        _deno_runtime_cache['value'] = None
        _deno_runtime_cache['checked_at'] = 0.0
        _deno_runtime_cache['preference'] = None


def get_ffmpeg_version(force=False):
    if not FFMPEG_PATH.exists():
        return None
    with _VERSION_CACHE_LOCK:
        cache = _version_cache['ffmpeg']
        now = time.time()
        if not force and cache['value'] and (now - cache['checked_at']) < _VERSION_CACHE_TTL_SECONDS:
            return cache['value']
        output = _run_captured([str(FFMPEG_PATH), '-version'])
        first = output.splitlines()[0] if output else ''
        m = re.search(r'ffmpeg version (\S+)', first)
        cache['value'] = (m.group(1) if m else '')[:64] or None
        cache['checked_at'] = now
        return cache['value']


# v1.4.0 (NX10): ffmpeg 8.0 dropped OpenSSL <=1.1.0; 8.1.1 removed the
# legacy HLS protocol handler (HLS is still supported via the demuxer
# path that yt-dlp typically uses, but the old `hls://` URL form is
# gone). Both releases also flipped TLS peer-cert verification ON by
# default. We don't read ffmpeg's capabilities directly anywhere — yt-dlp
# handles invocation — but we can audit ffmpeg's reported major version
# at bootstrap and warn if it's stale. The check runs once per Astra
# Downloader launch (cached) and the result lands on /health.
_FFMPEG_MIN_MAJOR = 7  # ffmpeg 8.x is current as of 2026; 7.x is the
                       # acceptable floor (covers most distros' bundles
                       # without forcing immediate refresh).
_ffmpeg_capabilities_cache = {'value': None, 'checked_at': 0.0}
_FFMPEG_CAPABILITIES_LOCK = threading.Lock()
_FFMPEG_CAPABILITIES_TTL_SECONDS = 3600


def check_ffmpeg_capabilities(force=False):
    """One-shot bootstrap audit of the bundled ffmpeg.

    Returns a dict ``{majorVersion: int|None, current: bool, message: str}``
    suitable for the /health endpoint. Cached for an hour so subsequent
    polls are cheap; force=True bypasses the cache (used after a re-pull
    of ffmpeg.exe).
    """
    with _FFMPEG_CAPABILITIES_LOCK:
        cache = _ffmpeg_capabilities_cache
        now = time.time()
        if not force and cache['value'] and (now - cache['checked_at']) < _FFMPEG_CAPABILITIES_TTL_SECONDS:
            return cache['value']
        version = get_ffmpeg_version()
        major = parse_ffmpeg_major(version)
        if major is None:
            result = {
                'majorVersion': None,
                'current': None,
                'message': 'ffmpeg version not detected (first-run bootstrap or snapshot build)',
            }
        else:
            current = major >= _FFMPEG_MIN_MAJOR
            if current:
                message = f'ffmpeg {major}.x meets the {_FFMPEG_MIN_MAJOR}+ floor'
            else:
                message = (
                    f'ffmpeg {major}.x is below the {_FFMPEG_MIN_MAJOR}+ floor; '
                    f'consider re-downloading via the bundled bootstrap'
                )
            result = {
                'majorVersion': major,
                'current': current,
                'message': message,
            }
        cache['value'] = result
        cache['checked_at'] = now
        return result


def reset_ffmpeg_capabilities_cache():
    """Test hook + post-ffmpeg-refresh re-check trigger."""
    with _FFMPEG_CAPABILITIES_LOCK:
        _ffmpeg_capabilities_cache['value'] = None
        _ffmpeg_capabilities_cache['checked_at'] = 0.0


# ── v1.2.0: throttled yt-dlp auto-update helpers ──
_YTDLP_UPDATE_INTERVAL_HOURS = 24
_YTDLP_UPDATE_LOCK = threading.Lock()
_COMPANION_UPDATE_LOCK = threading.Lock()


def _ytdlp_update_state_path():
    return INSTALL_DIR / 'yt-dlp-update-state.json'


def _companion_update_state_path():
    return INSTALL_DIR / 'companion-update-state.json'


def _read_update_state(path):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _write_update_state(path, **fields):
    state = _read_update_state(path)
    state.update(fields)
    state['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    atomic_write_json(path, state)
    return state


def read_update_recovery_status():
    """Return the allowlisted, path-free updater state exposed by /health."""
    result = {}
    for wire_name, path in (
        ('ytDlp', _ytdlp_update_state_path()),
        ('companion', _companion_update_state_path()),
    ):
        state = _read_update_state(path)
        if not state:
            continue
        public = {}
        for source, target in (
            ('status', 'status'),
            ('active_version', 'activeVersion'),
            ('rollback_version', 'rollbackVersion'),
            ('error_code', 'errorCode'),
            ('updated_at', 'updatedAt'),
        ):
            value = state.get(source)
            if isinstance(value, str) and value:
                public[target] = value[:80]
        if public:
            result[wire_name] = public
    return result


def log_update_recovery_status():
    for product, state in read_update_recovery_status().items():
        write_persistent_log(
            f'Update recovery {product}: status {state.get("status", "unknown")}; '
            f'active {state.get("activeVersion", "unknown")}; '
            f'rollback {state.get("rollbackVersion", "not retained")}.'
        )


def _probe_ytdlp_binary(path, timeout=15):
    """Return a strict yt-dlp version only when the candidate can execute."""
    try:
        result = subprocess.run(
            [str(path), '--version'],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception:
        return ''
    if result.returncode != 0:
        return ''
    output = ((result.stdout or '') + (result.stderr or '')).strip()
    version = output.splitlines()[0].strip() if output else ''
    return version[:32] if re.fullmatch(r'\d{4}\.\d{1,2}\.\d{1,2}(?:[.\w+-]*)?', version) else ''


def _parse_iso_like(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def should_check_ytdlp_update(config, interval_hours=_YTDLP_UPDATE_INTERVAL_HOURS):
    last = config.get("LastYtDlpUpdateCheck", "") if config else ""
    parsed = _parse_iso_like(last)
    if parsed is None:
        return True
    return (datetime.now() - parsed).total_seconds() > interval_hours * 3600


def mark_ytdlp_update_check(config):
    if not config:
        return
    try:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(config, dict):
            config["LastYtDlpUpdateCheck"] = stamp
        else:
            config.set("LastYtDlpUpdateCheck", stamp)
            config.save()
    except Exception as e:
        write_persistent_log(f"Could not persist yt-dlp update timestamp: {e}")


def _run_ytdlp_self_update(config, source_tag):
    """Update a staged yt-dlp copy, then activate it with verified rollback.

    Running ``-U`` against the live executable made a valid-but-broken update
    irreversible.  The updater now mutates a sibling staging copy, verifies
    ``--version``, retains one byte-verified last-known-good copy, atomically
    activates, and restores the backup if the post-activation probe fails.
    """
    if not _YTDLP_UPDATE_LOCK.acquire(blocking=False):
        return {
            'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': '',
            'error': 'A yt-dlp update is already in progress.',
            'error_code': 'update-in-progress',
            'version_before': get_ytdlp_version() or '',
            'version_after': get_ytdlp_version() or '',
            'source': source_tag,
        }

    stage_path = INSTALL_DIR / f'.yt-dlp.update.{uuid.uuid4().hex}.exe'
    backup_path = INSTALL_DIR / YTDLP_ROLLBACK_FILENAME
    version_before = _probe_ytdlp_binary(YTDLP_PATH)
    base = {
        'exit_code': -1,
        'stdout': '',
        'stderr': '',
        'version_before': version_before,
        'version_after': version_before,
        'rollback_version': '',
        'rolled_back': False,
        'source': source_tag,
    }
    try:
        if not version_before:
            return {
                **base, 'ok': False,
                'error': 'The installed yt-dlp could not pass --version; update was not started.',
                'error_code': 'active-version-unverified',
            }
        try:
            atomic_copy_verified(YTDLP_PATH, stage_path)
        except Exception as exc:  # noqa: BLE001
            write_persistent_log(f'yt-dlp {source_tag} staging failed: {exc}')
            return {
                **base, 'ok': False,
                'error': 'Could not stage yt-dlp beside the active executable.',
                'error_code': 'staging-failed',
            }

        try:
            result = subprocess.run(
                [str(stage_path), '-U'],
                capture_output=True,
                text=True,
                timeout=120,
                creationflags=CREATE_NO_WINDOW,
            )
        except subprocess.TimeoutExpired:
            write_persistent_log(
                f'yt-dlp {source_tag} staged update timed out after 120 s.'
            )
            return {
                **base, 'ok': False,
                'error': 'yt-dlp -U timed out after 120 s',
                'error_code': 'update-timeout',
            }
        except Exception as exc:  # noqa: BLE001
            write_persistent_log(f'yt-dlp {source_tag} staged update error: {exc}')
            return {
                **base, 'ok': False,
                'error': 'yt-dlp -U could not be launched. Check Astra Downloader logs for details.',
                'error_code': 'update-launch-failed',
            }

        stdout = (result.stdout or '').strip()[:200]
        stderr = (result.stderr or '').strip()[:200]
        result_fields = {**base, 'exit_code': result.returncode, 'stdout': stdout, 'stderr': stderr}
        if result.returncode != 0:
            write_persistent_log(
                f'yt-dlp {source_tag} staged update failed (exit {result.returncode}): '
                f'{stderr or stdout}'
            )
            return {
                **result_fields, 'ok': False,
                'error': stderr or stdout or f'yt-dlp -U exited with code {result.returncode}',
                'error_code': 'update-command-failed',
            }

        staged_version = _probe_ytdlp_binary(stage_path)
        if not staged_version:
            write_persistent_log(f'yt-dlp {source_tag} staged binary failed --version; active copy retained.')
            return {
                **result_fields, 'ok': False,
                'error': 'Updated yt-dlp failed its staged --version check; the active copy was retained.',
                'error_code': 'staged-version-unverified',
            }

        if staged_version == version_before:
            mark_ytdlp_update_check(config)
            rollback_version = _probe_ytdlp_binary(backup_path) if backup_path.exists() else ''
            _write_update_state(
                _ytdlp_update_state_path(), status='current',
                active_version=version_before, rollback_version=rollback_version,
                active_sha256=_compute_sha256(YTDLP_PATH) or '', error_code='',
            )
            write_persistent_log(
                f'yt-dlp {source_tag} update checked: active {version_before}; '
                f'rollback {rollback_version or "not retained yet"}.'
            )
            return {
                **result_fields, 'ok': True, 'exit_code': 0,
                'version_after': version_before, 'rollback_version': rollback_version,
            }

        rollback_digest = atomic_copy_verified(YTDLP_PATH, backup_path)
        rollback_version = _probe_ytdlp_binary(backup_path)
        if rollback_version != version_before:
            raise RuntimeError('The retained yt-dlp backup failed its version check.')

        staged_digest = _compute_sha256(stage_path)
        if not staged_digest:
            raise RuntimeError('The staged yt-dlp update could not be hashed.')
        os.replace(stage_path, YTDLP_PATH)
        active_version = _probe_ytdlp_binary(YTDLP_PATH)
        active_digest = _compute_sha256(YTDLP_PATH)
        if active_version != staged_version or active_digest != staged_digest:
            atomic_copy_verified(backup_path, YTDLP_PATH)
            restored_version = _probe_ytdlp_binary(YTDLP_PATH)
            restored_digest = _compute_sha256(YTDLP_PATH)
            rollback_ok = restored_version == rollback_version and restored_digest == rollback_digest
            status = 'rolled-back' if rollback_ok else 'rollback-failed'
            error_code = 'post-update-health-failed' if rollback_ok else 'rollback-verification-failed'
            _write_update_state(
                _ytdlp_update_state_path(), status=status,
                active_version=restored_version, rollback_version=rollback_version,
                active_sha256=restored_digest or '', rollback_sha256=rollback_digest,
                error_code=error_code,
            )
            write_persistent_log(
                f'yt-dlp {source_tag} activation failed; rollback {rollback_version} '
                f'{"restored" if rollback_ok else "could not be verified"}.'
            )
            return {
                **result_fields, 'ok': False, 'version_after': restored_version,
                'rollback_version': rollback_version, 'rolled_back': rollback_ok,
                'error': (
                    f'Updated yt-dlp failed post-update health; '
                    f'{"restored " + rollback_version if rollback_ok else "automatic rollback could not be verified"}.'
                ),
                'error_code': error_code,
            }

        mark_ytdlp_update_check(config)
        with _VERSION_CACHE_LOCK:
            _version_cache['ytdlp']['value'] = active_version
            _version_cache['ytdlp']['checked_at'] = time.time()
        _write_update_state(
            _ytdlp_update_state_path(), status='active',
            active_version=active_version, rollback_version=rollback_version,
            active_sha256=active_digest, rollback_sha256=rollback_digest,
            error_code='',
        )
        write_persistent_log(
            f'yt-dlp {source_tag} update active {active_version}; '
            f'last-known-good rollback {rollback_version} retained.'
        )
        return {
            **result_fields, 'ok': True, 'exit_code': 0,
            'version_after': active_version, 'rollback_version': rollback_version,
        }
    except Exception as exc:  # noqa: BLE001
        write_persistent_log(f'yt-dlp {source_tag} recoverable update failed: {exc}')
        restored = False
        rollback_version = _probe_ytdlp_binary(backup_path) if backup_path.exists() else ''
        active_version = _probe_ytdlp_binary(YTDLP_PATH) if YTDLP_PATH.exists() else ''
        if rollback_version and active_version != version_before:
            try:
                atomic_copy_verified(backup_path, YTDLP_PATH)
                active_version = _probe_ytdlp_binary(YTDLP_PATH)
                restored = active_version == rollback_version
            except Exception as restore_exc:  # noqa: BLE001
                write_persistent_log(f'yt-dlp emergency rollback failed: {restore_exc}')
        error_code = 'safe-activation-failed' if active_version == version_before or restored else 'rollback-verification-failed'
        try:
            _write_update_state(
                _ytdlp_update_state_path(),
                status='rolled-back' if restored else ('active' if active_version == version_before else 'rollback-failed'),
                active_version=active_version, rollback_version=rollback_version,
                error_code=error_code,
            )
        except Exception as state_exc:  # noqa: BLE001
            write_persistent_log(f'Could not persist yt-dlp recovery state: {state_exc}')
        return {
            **base, 'ok': False, 'version_after': active_version,
            'rollback_version': rollback_version, 'rolled_back': restored,
            'error': (
                'Could not safely install the yt-dlp update. '
                + ('The last-known-good copy was restored.' if restored else 'The active copy was retained.')
            ),
            'error_code': error_code,
        }
    finally:
        try:
            stage_path.unlink(missing_ok=True)
        except Exception:
            pass
        _YTDLP_UPDATE_LOCK.release()


def maybe_auto_update_ytdlp(config, active_count_fn=None):
    """Background-run yt-dlp -U when more than a day has passed.

    Fire-and-forget in a daemon thread so startup isn't blocked. The exit code
    is logged (previously swallowed entirely).

    v4.47.0 NF26: when ``active_count_fn`` is provided and returns > 0, the
    update is deferred. yt-dlp's ``-U`` flag atomically replaces the binary,
    and on Windows the in-flight ``subprocess.Popen([YTDLP_PATH, ...])`` of
    an active download can race the replace with file-in-use errors. Callers
    in the GUI / server path pass ``dl_manager.active_count`` so the check
    consults the live queue without coupling this function to the manager
    instance.

    The check is racy by design — we accept that a download started during
    the millisecond between ``active_count_fn()`` returning 0 and ``-U``
    spawning the replacement process can still race. Mitigation in practice
    is that ``-U`` runs ahead of any user download (server-start hook), and
    a download starting in that micro-window is so unlikely we don't pay the
    cost of a hard cross-process lock.

    v4.47.0 NF18: the subprocess runner was extracted into
    ``_run_ytdlp_self_update`` so the on-demand ``/update-ytdlp`` endpoint
    can share the same logging + version-cache + throttle-marker semantics.
    """
    if not YTDLP_PATH.exists():
        return
    if not config.get("AutoUpdateYtDlp", True):
        return
    if not should_check_ytdlp_update(config):
        return
    if active_count_fn is not None:
        try:
            in_flight = int(active_count_fn() or 0)
        except Exception as e:  # noqa: BLE001
            # reason: active_count_fn is caller-supplied; if it raises we
            # must NOT block the update, since the caller's failure mode
            # is at least as bad as racing a self-replace.
            write_persistent_log(f"yt-dlp auto-update active-count probe failed: {e}")
            in_flight = 0
        if in_flight > 0:
            write_persistent_log(
                f"yt-dlp auto-update deferred — {in_flight} active download(s); "
                f"next check at the configured 24h throttle."
            )
            return

    threading.Thread(
        target=lambda: _run_ytdlp_self_update(config, source_tag='auto'),
        daemon=True,
    ).start()


# ── v4.47.0 NF6: companion self-update helpers ──
def parse_companion_version_source(source_text):
    """Extract APP_VERSION from the raw astra_downloader.py source."""
    if not isinstance(source_text, str):
        return ''
    m = re.search(r'^APP_VERSION\s*=\s*["\']([^"\']{1,32})["\']', source_text, re.MULTILINE)
    return m.group(1).strip() if m else ''


def fetch_latest_companion_version(timeout=15):
    """Read the latest companion APP_VERSION from the canonical repo source."""
    response = http_requests.get(COMPANION_UPDATE_VERSION_URL, timeout=timeout)
    response.raise_for_status()
    version = parse_companion_version_source((response.text or '')[:200000])
    if not version:
        raise RuntimeError('Could not read APP_VERSION from the update manifest.')
    return version


def validate_companion_update_binary(path):
    """Cheap integrity sanity check before scheduling an exe replacement."""
    path = Path(path)
    if not path.exists():
        raise RuntimeError('Downloaded Astra Downloader update is missing.')
    if path.stat().st_size < COMPANION_UPDATE_MIN_BYTES:
        raise RuntimeError('Downloaded Astra Downloader update is too small to trust.')
    with open(path, 'rb') as fh:
        header = fh.read(2)
    if header != b'MZ':
        raise RuntimeError('Downloaded Astra Downloader update is not a Windows executable.')
    return True


def probe_companion_update_binary(path, expected_version, timeout=30):
    """Run the staged companion's non-GUI startup check in the background."""
    expected_version = str(expected_version or '').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?', expected_version):
        return False
    try:
        result = subprocess.run(
            [str(path), '--update-health-check', str(expected_version)],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception as exc:  # noqa: BLE001
        write_persistent_log(f'Companion staged health check could not launch: {exc}')
        return False
    return result.returncode == 0


# Audit fix (version-skew loop): "update available" is decided by parsing
# APP_VERSION from the repo's main branch, but the artifact comes from
# releases/latest. When main is bumped before the release asset is published,
# releases/latest still serves the binary we're already running — every
# /update cycle would download the same exe, pass MZ/size/SHA validation,
# schedule a replace, restart, and report update_available again, forever.
# We persist the SHA-256 of the last update this install scheduled and refuse
# to schedule a replace whose digest matches it (or matches the running
# frozen binary). A genuinely newer release has a different digest, so it
# still installs normally.
def read_last_installed_update_sha256():
    """Lowercase hex digest of the last scheduled update, or None."""
    try:
        data = json.loads(_companion_update_state_path().read_text(encoding='utf-8'))
    except Exception:
        return None
    value = data.get('sha256') if isinstance(data, dict) else None
    if isinstance(value, str):
        value = value.strip().lower()
        if re.fullmatch(r'[0-9a-f]{64}', value):
            return value
    return None


def record_last_installed_update_sha256(digest):
    """Persist the digest of the update we just scheduled. Best-effort."""
    try:
        _write_update_state(
            _companion_update_state_path(),
            sha256=str(digest).strip().lower(),
            recorded_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            app_version=APP_VERSION,
        )
    except Exception as e:  # noqa: BLE001
        write_persistent_log(f"Could not persist companion update state: {e}")


def _safe_update_paths(update_path, target_path=None):
    install_root = INSTALL_DIR.resolve()
    update = Path(update_path).resolve()
    target = Path(target_path or install_target_exe()).resolve()
    if target.name != 'AstraDownloader.exe':
        raise RuntimeError(f'Refusing to update unexpected target: {target}')
    if target.parent != install_root:
        raise RuntimeError(f'Refusing to update outside install dir: {target}')
    if update.parent != install_root or not update.name.startswith('.AstraDownloader.update.'):
        raise RuntimeError(f'Refusing to apply untrusted update path: {update}')
    return update, target


def schedule_companion_update_restart(
    update_path, target_path=None, restart_args=None, pid=None,
    expected_sha256=None, expected_version='', previous_version='',
):
    """Schedule after-exit replacement and relaunch of AstraDownloader.exe.

    The running PyInstaller executable cannot be overwritten in-place on
    Windows. A detached helper waits for this PID to exit, re-verifies the
    staged binary's SHA-256 and startup check, retains one verified backup,
    atomically replaces the managed executable, repeats the startup check, and
    restores the backup before relaunch if post-activation health fails.
    """
    update, target = _safe_update_paths(update_path, target_path)
    restart_args = list(restart_args or ['--start-server'])
    current_pid = int(pid or os.getpid())
    expected_digest = str(expected_sha256 or '').strip().lower()
    expected_version = str(expected_version or '').strip()[:32]
    previous_version = str(previous_version or '').strip()[:32]
    if not re.fullmatch(r'[0-9a-f]{64}', expected_digest):
        raise RuntimeError('A verified SHA-256 is required to schedule the companion update.')
    version_pattern = r'\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?'
    if not re.fullmatch(version_pattern, expected_version) or not re.fullmatch(version_pattern, previous_version):
        raise RuntimeError('Both active and target companion versions are required for rollback.')
    backup = INSTALL_DIR / COMPANION_ROLLBACK_FILENAME
    state_path = _companion_update_state_path()
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    if sys.platform == 'win32':
        script = INSTALL_DIR / f".AstraDownloader.apply-update.{uuid.uuid4().hex}.ps1"
        script.write_text(r'''
param(
    [int] $ProcessId,
    [string] $SourcePath,
    [string] $TargetPath,
    [string] $BackupPath,
    [string] $StatePath,
    [string] $RestartArgs,
    [string] $ExpectedSHA256,
    [string] $ExpectedVersion,
    [string] $PreviousVersion
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AstraDeckMoveFile {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);
}
'@
$MOVEFILE_REPLACE_EXISTING = 0x1
$MOVEFILE_WRITE_THROUGH = 0x8
$flags = $MOVEFILE_REPLACE_EXISTING -bor $MOVEFILE_WRITE_THROUGH

function Move-Replace([string] $Source, [string] $Destination) {
    $ok = [AstraDeckMoveFile]::MoveFileEx($Source, $Destination, $flags)
    if (-not $ok) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "MoveFileEx failed with Win32 error $err"
    }
}

function Copy-Verified([string] $Source, [string] $Destination) {
    $temp = "$Destination.$([Guid]::NewGuid().ToString('N')).tmp"
    Copy-Item -LiteralPath $Source -Destination $temp -Force
    $sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLower()
    $copyHash = (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLower()
    if ($sourceHash -ne $copyHash) { throw 'Retained backup digest mismatch' }
    Move-Replace $temp $Destination
    return $sourceHash
}

function Test-Companion([string] $Path, [string] $Version) {
    $probe = Start-Process -FilePath $Path -ArgumentList @('--update-health-check', $Version) -WindowStyle Hidden -Wait -PassThru
    return $probe.ExitCode -eq 0
}

function Write-RecoveryState([string] $Status, [string] $ActiveVersion, [string] $RollbackVersion, [string] $ErrorCode) {
    $state = [ordered]@{
        sha256 = $ExpectedSHA256.ToLower()
        app_version = $ExpectedVersion
        status = $Status
        active_version = $ActiveVersion
        rollback_version = $RollbackVersion
        error_code = $ErrorCode
        updated_at = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    }
    $temp = "$StatePath.$([Guid]::NewGuid().ToString('N')).tmp"
    $json = $state | ConvertTo-Json
    [IO.File]::WriteAllText($temp, $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temp -Destination $StatePath -Force
}

$activated = $false
try {
    try { Wait-Process -Id $ProcessId -Timeout 45 } catch { Start-Sleep -Seconds 2 }
    $sourceHash = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLower()
    if ($sourceHash -ne $ExpectedSHA256.ToLower()) { throw 'Staged update digest changed before activation' }
    if (-not (Test-Companion $SourcePath $ExpectedVersion)) { throw 'Staged update health check failed' }
    if (-not (Test-Path -LiteralPath $TargetPath)) { throw 'Managed companion target is missing' }
    $rollbackHash = Copy-Verified $TargetPath $BackupPath
    Move-Replace $SourcePath $TargetPath
    $activated = $true
    $targetHash = (Get-FileHash -LiteralPath $TargetPath -Algorithm SHA256).Hash.ToLower()
    if ($targetHash -ne $ExpectedSHA256.ToLower() -or -not (Test-Companion $TargetPath $ExpectedVersion)) {
        throw 'Post-update companion health check failed'
    }
    Write-RecoveryState 'active' $ExpectedVersion $PreviousVersion ''
} catch {
    if ($activated -and (Test-Path -LiteralPath $BackupPath)) {
        try {
            Copy-Verified $BackupPath $TargetPath | Out-Null
            if (-not (Test-Companion $TargetPath $PreviousVersion)) { throw 'Restored companion health check failed' }
            Write-RecoveryState 'rolled-back' $PreviousVersion $PreviousVersion 'post-update-health-failed'
        } catch {
            Write-RecoveryState 'rollback-failed' '' $PreviousVersion 'rollback-verification-failed'
        }
    } else {
        Write-RecoveryState 'activation-failed' $PreviousVersion $PreviousVersion 'staged-health-failed'
    }
} finally {
    if (Test-Path -LiteralPath $TargetPath) {
        Start-Process -FilePath $TargetPath -ArgumentList $RestartArgs -WindowStyle Hidden
    }
    Remove-Item -LiteralPath $SourcePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
}
'''.lstrip(), encoding='utf-8')
        args = [
            'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', str(script),
            '-ProcessId', str(current_pid),
            '-SourcePath', str(update),
            '-TargetPath', str(target),
            '-BackupPath', str(backup),
            '-StatePath', str(state_path),
            '-RestartArgs', command_line(restart_args),
            '-ExpectedSHA256', expected_digest,
            '-ExpectedVersion', expected_version,
            '-PreviousVersion', previous_version,
        ]
        subprocess.Popen(args, creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
    else:
        script = INSTALL_DIR / f".AstraDownloader.apply-update.{uuid.uuid4().hex}.py"
        script.write_text('''\
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import uuid

pid = int(sys.argv[1])
source = sys.argv[2]
target = sys.argv[3]
backup = sys.argv[4]
state_path = sys.argv[5]
expected_sha256 = sys.argv[6]
expected_version = sys.argv[7]
previous_version = sys.argv[8]
restart_args = sys.argv[9:]

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest().lower()

def atomic_copy(source_path, destination_path):
    temp = destination_path + '.' + uuid.uuid4().hex + '.tmp'
    shutil.copyfile(source_path, temp)
    if digest(source_path) != digest(temp):
        raise RuntimeError('Retained backup digest mismatch')
    os.replace(temp, destination_path)

def healthy(path, version):
    return subprocess.run(
        [path, '--update-health-check', version],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
    ).returncode == 0

def write_state(status, active_version, rollback_version, error_code):
    payload = {
        'sha256': expected_sha256, 'app_version': expected_version,
        'status': status, 'active_version': active_version,
        'rollback_version': rollback_version, 'error_code': error_code,
        'updated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }
    temp = state_path + '.' + uuid.uuid4().hex + '.tmp'
    with open(temp, 'w', encoding='utf-8') as stream:
        json.dump(payload, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, state_path)

deadline = time.time() + 45
while time.time() < deadline:
    try:
        os.kill(pid, 0)
    except OSError:
        break
    time.sleep(0.25)
activated = False
try:
    if digest(source) != expected_sha256.lower() or not healthy(source, expected_version):
        raise RuntimeError('Staged companion verification failed')
    atomic_copy(target, backup)
    os.replace(source, target)
    activated = True
    if digest(target) != expected_sha256.lower() or not healthy(target, expected_version):
        raise RuntimeError('Post-update companion health check failed')
    write_state('active', expected_version, previous_version, '')
except Exception:
    if activated and os.path.exists(backup):
        try:
            atomic_copy(backup, target)
            if not healthy(target, previous_version):
                raise RuntimeError('Restored companion health check failed')
            write_state('rolled-back', previous_version, previous_version, 'post-update-health-failed')
        except Exception:
            write_state('rollback-failed', '', previous_version, 'rollback-verification-failed')
    else:
        write_state('activation-failed', previous_version, previous_version, 'staged-health-failed')
finally:
    if os.path.exists(target):
        subprocess.Popen([target] + restart_args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        os.remove(source)
    except OSError:
        pass
    try:
        os.remove(__file__)
    except OSError:
        pass
''', encoding='utf-8')
        subprocess.Popen([
            sys.executable, str(script), str(current_pid), str(update), str(target),
            str(backup), str(state_path), expected_digest, expected_version,
            previous_version,
        ] + restart_args)
    return {
        'scheduled': True, 'target': str(target), 'source': str(update),
        'rollback': str(backup), 'active_version': expected_version,
        'rollback_version': previous_version,
    }


def schedule_companion_process_exit(delay=0.6):
    """Exit after the HTTP response has a chance to flush."""
    def _exit_later():
        time.sleep(delay)
        write_persistent_log('Exiting for Astra Downloader self-update.')
        os._exit(0)

    threading.Thread(target=_exit_later, daemon=True, name='AstraDownloaderSelfUpdateExit').start()


def _run_companion_self_update(restart=True):
    if not _COMPANION_UPDATE_LOCK.acquire(blocking=False):
        return {
            'ok': False,
            'error': 'An Astra Downloader update is already in progress.',
            'error_code': 'update-in-progress',
            'current_version': APP_VERSION,
            'latest_version': '',
        }
    try:
        return _run_companion_self_update_unlocked(restart=restart)
    finally:
        _COMPANION_UPDATE_LOCK.release()


def _run_companion_self_update_unlocked(restart=True):
    current_version = APP_VERSION
    try:
        latest_version = fetch_latest_companion_version()
    except Exception as e:  # noqa: BLE001
        write_persistent_log(f"Companion update version check failed: {e}")
        return {
            'ok': False,
            'error': 'Could not check latest Astra Downloader version. Check Astra Downloader logs for details.',
            'error_code': 'version-check-failed',
            'current_version': current_version,
            'latest_version': '',
        }

    if _compare_semver(latest_version, current_version) <= 0:
        return {
            'ok': True,
            'update_available': False,
            'status': 'current',
            'current_version': current_version,
            'latest_version': latest_version,
        }

    update_path = INSTALL_DIR / f".AstraDownloader.update.{uuid.uuid4().hex}.exe"
    try:
        download_file_atomic(
            COMPANION_UPDATE_EXE_URL,
            update_path,
            timeout=COMPANION_UPDATE_TIMEOUT_SECONDS,
            chunk_size=65536,
        )
        validate_companion_update_binary(update_path)
        expected_hash = fetch_expected_sha256(
            COMPANION_UPDATE_SHA256_URL,
            target_asset='AstraDownloader.exe',
            timeout=15,
        )
        if not expected_hash:
            try:
                update_path.unlink(missing_ok=True)
            except Exception:
                pass
            return {
                'ok': False,
                'error': 'Could not install Astra Downloader update: SHA-256 sidecar unavailable.',
                'error_code': 'sha256-sidecar-missing',
                'current_version': current_version,
                'latest_version': latest_version,
            }
        try:
            verify_file_sha256(update_path, expected_hash)
        except Exception as e:  # noqa: BLE001
            write_persistent_log(f"Companion update SHA-256 verification failed: {e}")
            try:
                update_path.unlink(missing_ok=True)
            except Exception:
                pass
            return {
                'ok': False,
                'error': 'Could not install Astra Downloader update: SHA-256 verification failed.',
                'error_code': 'sha256-verification-failed',
                'current_version': current_version,
                'latest_version': latest_version,
            }
        if not probe_companion_update_binary(update_path, latest_version):
            try:
                update_path.unlink(missing_ok=True)
            except Exception:
                pass
            return {
                'ok': False,
                'error': 'Downloaded Astra Downloader update failed its staged startup check.',
                'error_code': 'staged-health-check-failed',
                'current_version': current_version,
                'latest_version': latest_version,
            }
        # Version-skew guard (see read_last_installed_update_sha256): the
        # artifact digest equals expected_hash — verify_file_sha256 just
        # proved it — so compare that against the running frozen binary and
        # the last update this install scheduled. A match means the
        # releases/latest asset has not actually changed (main's APP_VERSION
        # was bumped ahead of the release), and installing it again can only
        # loop, never advance the version.
        downloaded_digest = str(expected_hash).strip().lower()
        same_as_running = False
        if is_frozen_app():
            try:
                same_as_running = _compute_sha256(current_executable_path()) == downloaded_digest
            except Exception:
                same_as_running = False
        if same_as_running or downloaded_digest == read_last_installed_update_sha256():
            try:
                update_path.unlink(missing_ok=True)
            except Exception:
                pass
            write_persistent_log(
                f"Companion update skipped: releases/latest asset (sha256 "
                f"{downloaded_digest[:12]}...) matches the installed binary; the "
                f"release for {latest_version} is not published yet."
            )
            return {
                'ok': True,
                'update_available': False,
                'status': 'release-pending',
                'current_version': current_version,
                'latest_version': latest_version,
            }
        _write_update_state(
            _companion_update_state_path(), status='activation-pending',
            active_version=current_version, rollback_version=current_version,
            active_sha256='', rollback_sha256='', error_code='',
        )
        schedule = schedule_companion_update_restart(
            update_path, install_target_exe(), ['--start-server'],
            expected_sha256=downloaded_digest,
            expected_version=latest_version,
            previous_version=current_version,
        )
        record_last_installed_update_sha256(downloaded_digest)
        if restart:
            schedule_companion_process_exit()
        write_persistent_log(
            f"Companion update scheduled ({current_version} -> {latest_version}) via {update_path}"
        )
        return {
            'ok': True,
            'update_available': True,
            'status': 'restart_scheduled',
            'current_version': current_version,
            'latest_version': latest_version,
            'active_version': latest_version,
            'rollback_version': current_version,
            'restart': bool(restart),
            'target': schedule.get('target'),
        }
    except Exception as e:  # noqa: BLE001
        write_persistent_log(f"Companion update failed: {e}")
        try:
            update_path.unlink(missing_ok=True)
        except Exception:
            pass
        return {
            'ok': False,
            'error': 'Could not install Astra Downloader update. Check Astra Downloader logs for details.',
            'error_code': 'install-failed',
            'current_version': current_version,
            'latest_version': latest_version,
        }


# ── v1.2.0: integrations stamp (idempotent shortcut/protocol/task registration) ──
def _get_integrations_stamp():
    if sys.platform != 'win32':
        return None
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, INTEGRATIONS_STAMP_KEY)
        try:
            value, _ = winreg.QueryValueEx(key, INTEGRATIONS_STAMP_VALUE)
            return value
        finally:
            winreg.CloseKey(key)
    except FileNotFoundError:
        return None
    except Exception:
        return None


def _set_integrations_stamp():
    if sys.platform != 'win32':
        return
    try:
        import winreg
        key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, INTEGRATIONS_STAMP_KEY, 0, winreg.KEY_WRITE)
        try:
            winreg.SetValueEx(key, INTEGRATIONS_STAMP_VALUE, 0, winreg.REG_SZ, APP_VERSION)
        finally:
            winreg.CloseKey(key)
    except Exception as e:
        write_persistent_log(f"Could not persist integrations stamp: {e}")


def backup_corrupt_file(path):
    path = Path(path)
    if not path.exists():
        return
    backup = path.with_name(f"{path.name}.corrupt-{_timestamp_suffix()}")
    try:
        path.replace(backup)
    except Exception:
        pass


def load_json_file(path, fallback):
    path = Path(path)
    if not path.exists():
        return fallback
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        backup_corrupt_file(path)
        return fallback


def normalize_long_text(value, default="", max_len=MAX_TEXT_FIELD):
    if value is None:
        return default, False
    value = CONTROL_CHARS_RE.sub("", str(value)).strip()
    if len(value) > max_len:
        return value, True
    return value, False


def ps_single_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def _netscape_bool(value):
    return "TRUE" if value else "FALSE"


def _sanitize_cookie_field(value, max_len=4096):
    """Strip whitespace, tabs, and control chars — Netscape format is tab-separated."""
    if value is None:
        return ""
    value = CONTROL_CHARS_RE.sub("", str(value))
    # Netscape cookie format is tab-delimited; any internal tab or newline
    # corrupts the file. Spaces and semicolons are fine in values.
    value = value.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()
    if len(value) > max_len:
        value = value[:max_len]
    return value


ALLOWED_COOKIE_DOMAINS = frozenset({
    ".youtube.com", "youtube.com",
    ".www.youtube.com", "www.youtube.com",
    ".m.youtube.com", "m.youtube.com",
    ".music.youtube.com", "music.youtube.com",
    ".youtube-nocookie.com", "youtube-nocookie.com",
    ".www.youtube-nocookie.com", "www.youtube-nocookie.com",
    ".youtu.be", "youtu.be",
    ".google.com", "google.com",
    ".accounts.google.com", "accounts.google.com",
})


def _is_allowed_cookie_domain(domain):
    if not domain:
        return False
    d = domain.lower().strip()
    return d in ALLOWED_COOKIE_DOMAINS or any(
        d.endswith(allowed) for allowed in ALLOWED_COOKIE_DOMAINS if allowed.startswith(".")
    )


def write_cookies_netscape(cookies, target_path):
    """
    Persist browser-supplied cookies in the Netscape cookies.txt format
    consumed by yt-dlp's --cookies flag. Returns the path on success, None if
    the input list is empty or every entry is malformed. Intentionally
    defensive: the extension's cookie bridge pushes raw objects and a single
    malformed entry should not poison the whole file.
    """
    if not isinstance(cookies, list) or not cookies:
        return None
    target_path = Path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Netscape HTTP Cookie File",
        "# Auto-generated by Astra Downloader — do not edit",
        "",
    ]
    emitted = 0
    for entry in cookies:
        if not isinstance(entry, dict):
            continue
        name = _sanitize_cookie_field(entry.get("name"), 256)
        if not name:
            continue
        domain = _sanitize_cookie_field(entry.get("domain"), 256)
        if not domain or not _is_allowed_cookie_domain(domain):
            continue
        value = _sanitize_cookie_field(entry.get("value"), 4096)
        path_field = _sanitize_cookie_field(entry.get("path"), 512) or "/"
        secure = bool(entry.get("secure"))
        http_only = bool(entry.get("httpOnly"))
        # Session cookies arrive as 0 (missing expirationDate from Chrome).
        # Treat 0 as "session" per Netscape format.
        try:
            raw_expiry = entry.get("expirationDate")
            expiry = int(float(raw_expiry)) if raw_expiry not in (None, "") else 0
            if expiry < 0:
                expiry = 0
        except (TypeError, ValueError):
            expiry = 0
        include_subdomains = domain.startswith(".")
        prefix = "#HttpOnly_" if http_only else ""
        lines.append(
            f"{prefix}{domain}\t{_netscape_bool(include_subdomains)}\t{path_field}\t"
            f"{_netscape_bool(secure)}\t{expiry}\t{name}\t{value}"
        )
        emitted += 1
    if emitted == 0:
        return None
    tmp = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(lines) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, target_path)
        try:
            # Best-effort permission tightening. On POSIX this makes the jar
            # owner-read/write only; on Windows os.chmod() only toggles the
            # read-only attribute and does NOT restrict who can read the file.
            # The real same-user isolation boundary on Windows is the
            # inherited NTFS ACL of %LOCALAPPDATA% (the jar lives under
            # INSTALL_DIR), which already denies other non-admin users.
            os.chmod(target_path, 0o600)
        except OSError:
            pass
        return str(target_path)
    except Exception as exc:
        write_persistent_log(f"Cookie jar write failed: {exc}")
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        return None


def sanitize_history_entries(raw):
    if not isinstance(raw, list):
        return []
    entries = []
    for item in raw[-500:]:
        if not isinstance(item, dict):
            continue
        entries.append({
            "id": clean_text(item.get("id"), "", 120),
            "url": clean_text(item.get("url"), "", 4096),
            "title": clean_text(item.get("title"), "(untitled)", 500) or "(untitled)",
            "filename": clean_path_text(item.get("filename")),
            "format": clean_text(item.get("format"), "", 16),
            "quality": clean_text(item.get("quality"), "", 16),
            "audioOnly": coerce_bool(item.get("audioOnly"), False),
            "date": clean_text(item.get("date"), "", 40),
            "duration": max(0, clamp_int(item.get("duration"), 0, 0, 60 * 60 * 24 * 30)),
        })
    return entries


def is_frozen_app():
    return bool(getattr(sys, "frozen", False))


def current_executable_path():
    if is_frozen_app():
        return Path(sys.executable).resolve()
    return Path(__file__).resolve()


def install_target_exe():
    return INSTALL_DIR / "AstraDownloader.exe"


def ensure_installed_executable():
    """Copy a downloaded one-file exe into the managed install directory."""
    current = current_executable_path()
    if not is_frozen_app():
        return current

    target = install_target_exe()
    try:
        if current == target.resolve():
            return target
    except Exception:
        pass

    try:
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
        shutil.copy2(current, tmp)
        os.replace(tmp, target)
        write_persistent_log(f"Installed executable updated: {target}")
        return target
    except Exception as e:
        write_persistent_log(f"Could not update installed executable from {current}: {e}")
        try:
            if 'tmp' in locals() and tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        return current


def launch_command_parts(prefer_installed=True):
    if is_frozen_app():
        exe = ensure_installed_executable() if prefer_installed else current_executable_path()
        return str(exe), []
    return sys.executable, [str(Path(__file__).resolve())]


def command_line(parts):
    return subprocess.list2cmdline([str(p) for p in parts])


def startup_command_from_argv(argv=None):
    args = sys.argv[1:] if argv is None else list(argv)
    for arg in args:
        value = str(arg).strip().lower()
        if value in ('--start-server', '-start-server', 'start'):
            return 'start'
        if value.startswith('mediadl://') or value.startswith('ytdl://'):
            return 'start'
    return ''


def send_instance_command(command, host=INSTANCE_CONTROL_HOST, port=INSTANCE_CONTROL_PORT, attempts=5, delay=0.2):
    command = str(command or '').strip().lower()
    if command not in {'show', 'start', 'shutdown'}:
        return False
    payload = (command + '\n').encode('ascii')
    for attempt in range(max(1, int(attempts))):
        try:
            with socket.create_connection((host, int(port)), timeout=0.5) as conn:
                conn.sendall(payload)
            return True
        except OSError as e:
            last_err = e
            if attempt < attempts - 1:
                time.sleep(delay)
    write_persistent_log(f"Could not send instance command '{command}': {last_err}")
    return False


def register_desktop_shortcut(target, base_args):
    try:
        desktop = Path.home() / "Desktop"
        lnk = desktop / "Astra Downloader.lnk"
        ico = str(ICON_PATH) if ICON_PATH.exists() else ""
        arguments = command_line(base_args)
        workdir = str(Path(target).parent if Path(target).parent.exists() else INSTALL_DIR)
        ps_cmd = (
            f'$ws = New-Object -ComObject WScript.Shell; '
            f'$sc = $ws.CreateShortcut({ps_single_quote(lnk)}); '
            f'$sc.TargetPath = {ps_single_quote(target)}; '
            f'$sc.WorkingDirectory = {ps_single_quote(workdir)}; '
            f'$sc.Arguments = {ps_single_quote(arguments)}; '
            + (f'$sc.IconLocation = {ps_single_quote(ico)}; ' if ico else '')
            + f'$sc.Description = "Astra Deck Download Server"; '
            f'$sc.Save()'
        )
        subprocess.run(['powershell', '-NoProfile', '-Command', ps_cmd],
                       capture_output=True, creationflags=CREATE_NO_WINDOW)
    except Exception as e:
        write_persistent_log(f"Shortcut registration failed: {e}")


def register_startup_task(target, base_args):
    try:
        task_cmd = command_line([target] + list(base_args) + ['-Background'])
        subprocess.run([
            'schtasks', '/Create', '/TN', 'AstraDownloader',
            '/TR', task_cmd, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F'
        ], capture_output=True, creationflags=CREATE_NO_WINDOW)
    except Exception as e:
        write_persistent_log(f"Startup task registration failed: {e}")


def register_protocol_handlers(target, base_args):
    try:
        import winreg
        open_cmd = command_line([target] + list(base_args)) + ' "%1"'
        for proto in ('ytdl', 'mediadl'):
            key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, f'Software\\Classes\\{proto}', 0, winreg.KEY_WRITE)
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, f'URL:{proto} Protocol')
            winreg.SetValueEx(key, 'URL Protocol', 0, winreg.REG_SZ, '')
            winreg.CloseKey(key)
            cmd_key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, f'Software\\Classes\\{proto}\\shell\\open\\command', 0, winreg.KEY_WRITE)
            winreg.SetValueEx(cmd_key, '', 0, winreg.REG_SZ, open_cmd)
            winreg.CloseKey(cmd_key)
    except Exception as e:
        write_persistent_log(f"Protocol registration failed: {e}")


def register_uninstall_entry(target, base_args):
    try:
        import winreg
        uninstall_cmd = command_line([target] + list(base_args) + ['--uninstall'])
        key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AstraDownloader', 0, winreg.KEY_WRITE)
        winreg.SetValueEx(key, 'DisplayName', 0, winreg.REG_SZ, APP_NAME)
        winreg.SetValueEx(key, 'DisplayVersion', 0, winreg.REG_SZ, APP_VERSION)
        winreg.SetValueEx(key, 'Publisher', 0, winreg.REG_SZ, 'SysAdminDoc')
        winreg.SetValueEx(key, 'InstallLocation', 0, winreg.REG_SZ, str(INSTALL_DIR))
        if ICON_PATH.exists():
            winreg.SetValueEx(key, 'DisplayIcon', 0, winreg.REG_SZ, f'{ICON_PATH},0')
        winreg.SetValueEx(key, 'UninstallString', 0, winreg.REG_SZ, uninstall_cmd)
        winreg.SetValueEx(key, 'NoModify', 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, 'NoRepair', 0, winreg.REG_DWORD, 1)
        winreg.CloseKey(key)
    except Exception as e:
        write_persistent_log(f"Uninstall registration failed: {e}")


def parse_native_extension_ids(value, fallback=()):
    if isinstance(value, (list, tuple)):
        raw = value
    elif isinstance(value, str):
        raw = re.split(r'[\s,;]+', value)
    else:
        raw = []
    out = []
    for item in raw:
        text = str(item or '').strip()
        if text and text not in out:
            out.append(text)
    if out:
        return out
    for item in fallback or ():
        text = str(item or '').strip()
        if text and text not in out:
            out.append(text)
    return out


def normalize_extension_origin(origin):
    try:
        parsed = urlparse(str(origin or "").strip().rstrip("/"))
    except Exception:
        return ""
    scheme = (parsed.scheme or "").lower()
    host = (parsed.netloc or "").strip().lower()
    if scheme not in {"chrome-extension", "moz-extension"} or not host:
        return ""
    return f"{scheme}://{host}"


def parse_legacy_health_token_origins(value):
    origins = []
    for item in parse_native_extension_ids(value):
        normalized = normalize_extension_origin(item)
        if not normalized and re.fullmatch(r"[a-z]{8,64}", item.strip().lower()):
            normalized = normalize_extension_origin(f"chrome-extension://{item.strip().lower()}")
        if normalized and normalized not in origins:
            origins.append(normalized)
    return origins


def legacy_health_token_origin_allowlist(config):
    origins = []
    for chrome_id in parse_native_extension_ids(config.get("NativeChromeExtensionIds", "")):
        normalized = normalize_extension_origin(f"chrome-extension://{chrome_id.strip().lower()}")
        if normalized and normalized not in origins:
            origins.append(normalized)
    for origin in parse_legacy_health_token_origins(config.get("LegacyHealthTokenOrigins", "")):
        if origin not in origins:
            origins.append(origin)
    return frozenset(origins)


def register_native_host_registry_value(key_path, manifest_path):
    import winreg
    key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE)
    try:
        winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest_path))
    finally:
        winreg.CloseKey(key)


def register_native_messaging_hosts(target, base_args, config):
    if sys.platform != 'win32':
        return
    if base_args:
        write_persistent_log("Native messaging host registration skipped: source runs need an executable wrapper.")
        return
    chrome_ids = parse_native_extension_ids(config.get("NativeChromeExtensionIds", ""))
    firefox_ids = parse_native_extension_ids(
        config.get("NativeFirefoxExtensionIds", ""),
        DEFAULT_FIREFOX_EXTENSION_IDS,
    )
    if not chrome_ids and not firefox_ids:
        write_persistent_log("Native messaging host registration skipped: no extension IDs configured.")
        return
    try:
        NATIVE_HOST_DIR.mkdir(parents=True, exist_ok=True)
        if chrome_ids:
            chrome_manifest = NATIVE_HOST_DIR / f"{NATIVE_HOST_NAME}.chrome.json"
            atomic_write_json(chrome_manifest, build_native_host_manifest(target, chrome_ids, browser="chrome"))
            register_native_host_registry_value(
                f"Software\\Google\\Chrome\\NativeMessagingHosts\\{NATIVE_HOST_NAME}",
                chrome_manifest,
            )
        if firefox_ids:
            firefox_manifest = NATIVE_HOST_DIR / f"{NATIVE_HOST_NAME}.firefox.json"
            atomic_write_json(firefox_manifest, build_native_host_manifest(target, firefox_ids, browser="firefox"))
            register_native_host_registry_value(
                f"Software\\Mozilla\\NativeMessagingHosts\\{NATIVE_HOST_NAME}",
                firefox_manifest,
            )
    except Exception as e:
        write_persistent_log(f"Native messaging host registration failed: {e}")


def ensure_system_integrations(prefer_installed=True, force=False):
    """Register shortcut / startup task / protocol handlers / uninstall entry.

    v1.2.0: idempotent — writes a version stamp to HKCU after success and
    short-circuits on subsequent launches when the stamp matches APP_VERSION.
    Previously fired a PowerShell process + 3 winreg writes + schtasks on
    every launch, even when nothing had changed.
    """
    target, base_args = launch_command_parts(prefer_installed=prefer_installed)
    if not force and _get_integrations_stamp() == APP_VERSION:
        register_native_messaging_hosts(target, base_args, Config())
        return target, base_args
    register_desktop_shortcut(target, base_args)
    register_startup_task(target, base_args)
    register_protocol_handlers(target, base_args)
    register_uninstall_entry(target, base_args)
    register_native_messaging_hosts(target, base_args, Config())
    _set_integrations_stamp()
    return target, base_args

# ── Dark theme stylesheet ──
STYLESHEET = """
QMainWindow, QWidget {
    background-color: #0b0f14;
    color: #edf2f7;
    font-family: "Segoe UI", "Inter", "Arial";
    font-size: 12px;
}
QLabel { color: #edf2f7; background: transparent; }
QLabel[class="title"] { font-size: 23px; font-weight: 700; color: #f8fafc; }
QLabel[class="subtitle"] { color: #9aa6b2; font-size: 12px; line-height: 18px; }
QLabel[class="muted"] { color: #7b8794; }
QLabel[class="secondary"] { color: #aab5c2; }
QLabel[class="section"] {
    color: #7b8794;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.1px;
    text-transform: uppercase;
}
QLabel[class="fieldLabel"] { color: #edf2f7; font-size: 12px; font-weight: 600; }
QLabel[class="fieldHint"] { color: #7b8794; font-size: 11px; }
QLabel[class="emptyTitle"] { color: #edf2f7; font-size: 15px; font-weight: 700; }
QLabel[class="emptyBody"] { color: #8793a0; font-size: 12px; }
QLabel[class="badge"] {
    border-radius: 10px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 700;
}
QLabel[class="badge"][tone="success"] { color: #b9f6ce; background: #0f2c1e; border: 1px solid #1d5c39; }
QLabel[class="badge"][tone="warning"] { color: #ffe4a3; background: #30250e; border: 1px solid #6c5318; }
QLabel[class="badge"][tone="danger"] { color: #ffc8c8; background: #351718; border: 1px solid #773033; }
QLabel[class="badge"][tone="info"] { color: #b9dcff; background: #10283e; border: 1px solid #24567e; }
QLabel[class="badge"][tone="neutral"] { color: #b7c1cc; background: #111923; border: 1px solid #263241; }

QPushButton {
    background-color: #141b24;
    color: #d7dee7;
    border: 1px solid #263241;
    border-radius: 7px;
    padding: 8px 14px;
    min-height: 34px;
    font-size: 12px;
    font-weight: 650;
}
QPushButton:hover { background-color: #1b2531; border-color: #344457; color: #f8fafc; }
QPushButton:pressed { background-color: #111821; border-color: #233142; }
QPushButton:focus { border-color: #3ddc84; }
QPushButton:disabled { color: #5d6875; background-color: #101720; border-color: #1c2632; }
QPushButton[class="primary"] {
    background-color: #2dd36f;
    color: #06100a;
    border: 1px solid #38e984;
    font-weight: 750;
}
QPushButton[class="primary"]:hover { background-color: #38e984; }
QPushButton[class="secondary"] {
    background-color: #111821;
    color: #c7d0da;
    border: 1px solid #2a3747;
}
QPushButton[class="danger"] {
    background-color: #2a1517;
    color: #ffd1d1;
    border: 1px solid #6e2a2e;
    font-weight: 700;
}
QPushButton[class="danger"]:hover { background-color: #3b1c1f; border-color: #a34449; }
QPushButton[class="ghost"] {
    background-color: transparent;
    border-color: transparent;
    color: #9aa6b2;
    padding-left: 10px;
    padding-right: 10px;
}
QPushButton[class="ghost"]:hover { background-color: #121923; border-color: #263241; color: #edf2f7; }
QPushButton[class="nav"] {
    background-color: transparent;
    color: #9aa6b2;
    border: 1px solid transparent;
    text-align: left;
    padding: 10px 14px;
    margin: 0 10px 4px 10px;
    font-size: 13px;
    font-weight: 650;
    border-radius: 8px;
}
QPushButton[class="nav"]:hover { background-color: #111821; color: #edf2f7; }
QPushButton[class="nav"][active="true"] {
    color: #dfffea;
    background-color: #102117;
    border-color: #214d34;
    font-weight: 750;
}

QLineEdit, QSpinBox, QComboBox {
    background-color: #111821;
    color: #edf2f7;
    border: 1px solid #263241;
    border-radius: 7px;
    padding: 7px 9px;
    min-height: 34px;
    font-size: 12px;
    selection-background-color: #2dd36f;
    selection-color: #06100a;
}
QLineEdit:focus, QSpinBox:focus, QComboBox:focus { border-color: #3ddc84; background-color: #141d28; }
QLineEdit[state="error"], QSpinBox[state="error"] { border-color: #d25b61; background-color: #1d1216; }
QLineEdit:disabled, QSpinBox:disabled, QComboBox:disabled { color: #65717f; background: #0f151d; border-color: #1d2733; }
QComboBox::drop-down { border: none; width: 24px; }
QSpinBox::up-button, QSpinBox::down-button { width: 18px; border: none; background: transparent; }

QCheckBox { color: #c7d0da; font-size: 12px; spacing: 9px; min-height: 28px; }
QCheckBox::indicator { width: 18px; height: 18px; border-radius: 5px; border: 1px solid #2c3a4a; background: #111821; }
QCheckBox::indicator:hover { border-color: #3a4c60; }
QCheckBox::indicator:checked { background: #2dd36f; border-color: #38e984; }
QCheckBox:disabled { color: #677281; }

QFrame[class="card"] {
    background-color: #121922;
    border: 1px solid #243142;
    border-radius: 8px;
}
QFrame[class="sidebar"] {
    background-color: #080c11;
    border-right: 1px solid #1e2835;
}
QFrame[class="stat"] {
    background-color: #111821;
    border: 1px solid #243142;
    border-radius: 8px;
}
QFrame[class="empty"] {
    background-color: #0e141c;
    border: 1px dashed #2a3747;
    border-radius: 8px;
}
QFrame[class="download"] {
    background-color: #121922;
    border: 1px solid #243142;
    border-radius: 8px;
}
QFrame[class="download"][state="failed"] { border-color: #6e2a2e; background-color: #171315; }
QFrame[class="download"][state="complete"] { border-color: #1d5c39; background-color: #101915; }
QFrame[class="divider"] {
    background-color: #1e2835;
    border: none;
    min-height: 1px;
    max-height: 1px;
}

QTextEdit {
    background-color: #0e141c;
    color: #9aa6b2;
    border: 1px solid #243142;
    border-radius: 8px;
    font-family: "Cascadia Code", "Consolas", monospace;
    font-size: 11px;
    padding: 10px;
}

QScrollArea { border: none; background: transparent; }
QScrollBar:vertical { background: transparent; width: 10px; border: none; margin: 2px; }
QScrollBar::handle:vertical { background: #2a3747; border-radius: 4px; min-height: 24px; }
QScrollBar::handle:vertical:hover { background: #3a4c60; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }

QProgressBar { background: #0c1219; border: 1px solid #223042; border-radius: 5px; height: 8px; text-align: center; }
QProgressBar::chunk { background: #2dd36f; border-radius: 4px; }

QTabWidget::pane { border: none; }
QTabBar { background: transparent; }
QTabBar::tab { height: 0; width: 0; }

QMenu {
    background-color: #111821;
    color: #edf2f7;
    border: 1px solid #263241;
    border-radius: 8px;
    padding: 6px;
}
QMenu::item { padding: 7px 24px 7px 10px; border-radius: 6px; }
QMenu::item:selected { background-color: #182331; }
QToolTip {
    background-color: #111821;
    color: #edf2f7;
    border: 1px solid #2a3747;
    border-radius: 6px;
    padding: 6px 8px;
}
"""

# Premium command-center layer. Kept after the foundation rules so the visual
# system can evolve without disturbing behavior-specific selectors above.
STYLESHEET += """
QMainWindow, QWidget {
    background-color: #080a0f;
    color: #f5f1ed;
}
QLabel { color: #f5f1ed; background: transparent; }
QLabel[class="title"] { font-size: 25px; font-weight: 750; color: #fffaf5; }
QLabel[class="subtitle"] { color: #9ba3af; font-size: 12px; }
QLabel[class="muted"], QLabel[class="fieldHint"] { color: #7f8997; }
QLabel[class="secondary"] { color: #c2c8d0; }
QLabel[class="section"] { color: #db9b6d; font-size: 10px; letter-spacing: 1.35px; }
QLabel[class="badge"] { border-radius: 6px; padding: 3px 8px; }
QLabel[class="badge"][tone="success"] { color: #b9f8dc; background: #102921; border-color: #225b49; }
QLabel[class="badge"][tone="warning"] { color: #ffe2ad; background: #302315; border-color: #72502c; }
QLabel[class="badge"][tone="danger"] { color: #ffd0cb; background: #34191a; border-color: #7b3735; }
QLabel[class="badge"][tone="info"] { color: #c9e8ff; background: #14283a; border-color: #2c5874; }
QLabel[class="badge"][tone="neutral"] { color: #b4bcc7; background: #131922; border-color: #2a3442; }
QLabel[class="readinessValue"] { color: #f1ede9; font-size: 11px; font-weight: 700; }
QLabel[class="readinessDot"][tone="success"] { color: #4cd6a2; }
QLabel[class="readinessDot"][tone="warning"] { color: #f3ad62; }
QLabel[class="readinessDot"][tone="danger"] { color: #ff7164; }
QLabel[class="readinessDot"][tone="neutral"] { color: #697381; }
QLabel[class="errorCallout"] {
    color: #ffcbc5;
    background: #2c1719;
    border: 1px solid #6c3031;
    border-radius: 6px;
    padding: 9px 10px;
}

QPushButton {
    background-color: #151a22;
    color: #ddd8d3;
    border-color: #2a3441;
    border-radius: 6px;
    min-height: 36px;
}
QPushButton:hover { background-color: #1c222c; border-color: #465262; color: #fffaf5; }
QPushButton:focus { border-color: #ff7564; }
QPushButton[class="primary"] {
    background-color: #ff5f4b;
    color: #170705;
    border-color: #ff7867;
}
QPushButton[class="primary"]:hover { background-color: #ff7564; border-color: #ff8b7c; }
QPushButton[class="secondary"] { background-color: #121821; color: #d3d8de; border-color: #303b49; }
QPushButton[class="ghost"]:hover { background-color: #171d26; border-color: #303b49; }
QPushButton[class="primary"]:disabled,
QPushButton[class="secondary"]:disabled,
QPushButton[class="danger"]:disabled,
QPushButton[class="ghost"]:disabled {
    color: #5f6975;
    background-color: #0e1319;
    border-color: #202832;
}
QPushButton[class="nav"] {
    color: #929ba7;
    padding: 11px 14px;
    margin: 0 12px 5px 12px;
    border-radius: 6px;
}
QPushButton[class="nav"]:hover { background-color: #141922; color: #f4efea; }
QPushButton[class="nav"][active="true"] {
    color: #fff3ed;
    background-color: #291717;
    border-color: #603027;
}
QPushButton[class="nav"]:focus {
    color: #f4efea;
    background-color: #141922;
    border-color: #465262;
}
QPushButton[class="nav"][active="true"]:focus {
    background-color: #321919;
    border-color: #9a4637;
}

QLineEdit, QSpinBox, QComboBox {
    background-color: #11161e;
    color: #f1ede9;
    border-color: #303a47;
    border-radius: 6px;
    selection-background-color: #ff5f4b;
    selection-color: #170705;
}
QLineEdit:focus, QSpinBox:focus, QComboBox:focus { border-color: #ff7564; background-color: #151b24; }
QCheckBox::indicator:checked { background: #ff5f4b; border-color: #ff7564; }
QCheckBox { background: transparent; }

QFrame[class="sidebar"] { background-color: #07090d; border-right-color: #202733; }
QFrame[class="card"], QFrame[class="stat"], QFrame[class="download"] {
    background-color: #10151c;
    border-color: #272f3b;
    border-radius: 8px;
}
QFrame[class="readiness"] {
    background-color: #0d1218;
    border: 1px solid #2b333f;
    border-radius: 8px;
}
QFrame[class="readinessRow"] {
    background-color: transparent;
    border-bottom: 1px solid #202832;
}
QFrame[class="download"][state="failed"] { border-color: #743632; background-color: #181214; }
QFrame[class="download"][state="complete"] { border-color: #245948; background-color: #0e1916; }
QFrame[class="empty"] { background-color: #0c1117; border-color: #303946; }
QFrame[class="divider"] { background-color: #222a35; }
QTextEdit { background-color: #0b1016; color: #aeb6c1; border-color: #27303b; }
QProgressBar { background: #0c1117; border-color: #27313d; }
QProgressBar::chunk { background: #ff5f4b; }
QScrollBar::handle:vertical { background: #323b48; }
QMenu { background-color: #11161e; border-color: #303a47; }
QMenu::item:selected { background-color: #2b1919; }
"""

# ══════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════
class Config(ConfigStore):
    def __init__(self):
        super().__init__(
            install_dir=lambda: INSTALL_DIR,
            path=lambda: CONFIG_PATH,
            sanitizer=sanitize_config,
            loader=load_json_file,
            writer=lambda path, data: atomic_write_json(path, data),
            logger=lambda message: write_persistent_log(message),
        )

# ══════════════════════════════════════════════════════════════
# HISTORY
# ══════════════════════════════════════════════════════════════
class History(HistoryStore):
    def __init__(self):
        super().__init__(
            path=lambda: HISTORY_PATH,
            sanitizer=sanitize_history_entries,
            loader=load_json_file,
            writer=lambda path, data: atomic_write_json(path, data),
            logger=lambda message: write_persistent_log(message),
            limit=500,
        )


_SUBPROCESS_ENV_ALLOWLIST = (
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC',
    'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'WINDIR',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
    'LANG', 'LC_ALL', 'LC_CTYPE',
)


def _build_subprocess_env():
    env = {}
    for key in _SUBPROCESS_ENV_ALLOWLIST:
        val = os.environ.get(key)
        if val is not None:
            env[key] = val
    if DENO_PATH.exists():
        env['PATH'] = str(DENO_DIR) + os.pathsep + env.get('PATH', '')
    return env


def terminate_process_tree(proc, timeout=3):
    if not proc or proc.poll() is not None:
        return

    if sys.platform == 'win32':
        # Reap the entire process tree (yt-dlp + any ffmpeg child) unconditionally.
        # proc.terminate() only kills the single yt-dlp handle, orphaning ffmpeg
        # when yt-dlp exits promptly.
        try:
            subprocess.run(
                ['taskkill', '/PID', str(proc.pid), '/T', '/F'],
                capture_output=True,
                creationflags=CREATE_NO_WINDOW,
                timeout=5,
            )
            try:
                proc.wait(timeout=timeout)
            except Exception:
                pass
            return
        except Exception as e:
            write_persistent_log(f"Process tree termination warning: {e}")
        try:
            proc.terminate()
            proc.wait(timeout=timeout)
            return
        except Exception:
            pass
        try:
            proc.kill()
        except Exception:
            pass
        return

    # POSIX: graceful -> forceful
    try:
        proc.terminate()
        proc.wait(timeout=timeout)
        return
    except subprocess.TimeoutExpired:
        pass
    except Exception:
        pass
    try:
        proc.kill()
    except Exception:
        pass

# ══════════════════════════════════════════════════════════════
# DOWNLOAD MANAGER
# ══════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════
# v1.2.2: cross-thread native folder picker
# ══════════════════════════════════════════════════════════════
# Flask handlers run on waitress worker threads; Qt widgets are
# GUI-thread only. The extension popup's "Change" button needs to
# trigger a native folder dialog so users don't have to manually
# type a Windows path. Worker threads enqueue requests; a QTimer on
# the GUI thread pumps them through QFileDialog and returns results
# via per-request response queues. 150 ms tick is invisible to the
# user (HTTP request -> dialog appears within one frame).

_folder_pick_q = queue.Queue(maxsize=1)
_folder_picker_service = None  # set in main() once QApplication exists


class FolderPickerService(QObject):
    """Bridges Flask worker threads to the GUI thread's QFileDialog."""

    # v4.47.0 NF35: log a watchdog line when a single dialog
    # exec() blocks longer than this many seconds. Real folder
    # pickers complete in <30s in the worst case (slow drive, large
    # directory enumeration); blocking past 60s signals a hang in
    # the Qt event loop, file system, or user-side OS dialog that
    # the prior implementation swallowed silently. The Flask side
    # times out at 120s (see /pick-folder handler), so 60s gives a
    # mid-flight diagnostic before the HTTP request gives up.
    DIALOG_WATCHDOG_THRESHOLD_SECONDS = 60

    def __init__(self, parent=None):
        super().__init__(parent)
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(150)

    def _tick(self):
        try:
            req = _folder_pick_q.get_nowait()
        except queue.Empty:
            return
        response_q = req['response']
        try:
            initial = req.get('initial') or str(Path.home() / "Videos")
            dlg = QFileDialog(None, "Choose download folder", initial)
            dlg.setFileMode(QFileDialog.FileMode.Directory)
            dlg.setOption(QFileDialog.Option.ShowDirsOnly, True)
            dlg.setOption(QFileDialog.Option.DontResolveSymlinks, True)
            # Tray-only mode means there's no parent window to anchor the
            # dialog to; force it on top so the user actually sees it.
            dlg.setWindowFlags(dlg.windowFlags() | Qt.WindowType.WindowStaysOnTopHint)
            dlg.activateWindow()
            dlg.raise_()
            # v4.47.0 NF35: dialog watchdog. Time the .exec() call and
            # log a persistent diagnostic line if the dialog blocked
            # longer than DIALOG_WATCHDOG_THRESHOLD_SECONDS. Previously
            # the dialog could hang silently and the Flask handler would
            # time out at 120s with no GUI-side log entry pointing at
            # the cause.
            dialog_started_at = time.time()
            exec_result = dlg.exec()
            dialog_elapsed = time.time() - dialog_started_at
            if dialog_elapsed > self.DIALOG_WATCHDOG_THRESHOLD_SECONDS:
                write_persistent_log(
                    f"FolderPickerService: dialog blocked for {dialog_elapsed:.1f}s "
                    f"(threshold {self.DIALOG_WATCHDOG_THRESHOLD_SECONDS}s; "
                    f"initial='{initial}'). Possible Qt event-loop or file-system hang."
                )
            if exec_result == QFileDialog.DialogCode.Accepted:
                paths = dlg.selectedFiles()
                response_q.put({'path': paths[0] if paths else None,
                                'cancelled': not bool(paths)})
            else:
                response_q.put({'path': None, 'cancelled': True})
        except Exception as e:
            write_persistent_log("FolderPickerService failed")
            response_q.put({'error': 'Folder picker failed. Check Astra Downloader logs for details.'})


class DownloadManager(QObject):
    progress_updated = pyqtSignal()
    download_completed = pyqtSignal(str)

    ALLOWED_VIDEO_FMT = {'mp4', 'mkv', 'webm'}
    ALLOWED_AUDIO_FMT = {'mp3', 'm4a', 'opus', 'flac', 'wav'}
    ALLOWED_QUALITY = {'best', '2160', '1440', '1080', '720', '480'}

    def __init__(self, config, history, queue_path=None):
        super().__init__()
        self.config = config
        self.history = history
        self.downloads = {}
        self._next_id = 0
        self._next_order = 0
        self._lock = threading.Lock()
        self._running_ids = set()
        self._queue_path = Path(queue_path) if queue_path else None
        self._persistence_error = ""
        self._persistence_compatible = True
        self.intake_paused = False
        self._closing = False
        self.total_completed = 0
        # v1.2.0: sweep any cookie jars left by a previous crash before any
        # new download starts. Session cookies shouldn't outlive the process
        # that needed them.
        cleanup_stale_cookie_jars()
        self._restore_pending_queue()

    def _restore_pending_queue(self):
        """Restore unfinished work without starting it or restoring secrets.

        A crash can leave both running and pending records in the durable
        queue. Every record is intentionally converted to an explicit recovery
        state: unauthenticated work becomes ``paused`` and work that previously
        used browser cookies becomes ``needs-auth``. This prevents duplicate
        downloads from silently starting after an application restart.
        """
        if self._queue_path is None:
            return
        raw = load_json_file(self._queue_path, {})
        if not isinstance(raw, dict):
            return
        if raw and raw.get('schemaVersion') != DOWNLOAD_QUEUE_SCHEMA_VERSION:
            self._persistence_compatible = False
            self._persistence_error = (
                'The pending queue was created by an incompatible Astra Downloader version.'
            )
            write_persistent_log(
                'Download queue schema is incompatible; preserving the file without changes.'
            )
            return
        records = raw.get('downloads', [])
        if not isinstance(records, list):
            return

        restored = []
        seen_ids = set()
        for index, item in enumerate(records[:MAX_QUEUED_TOTAL]):
            if not isinstance(item, dict):
                continue
            url, err = normalize_url(item.get('url'))
            if err:
                continue
            output_dir = clean_path_text(item.get('outputDir'))
            try:
                if not output_dir or not Path(output_dir).expanduser().is_absolute():
                    continue
            except (OSError, ValueError):
                continue
            audio_only = coerce_bool(item.get('audioOnly'), False)
            if audio_only:
                fmt = item.get('format') if item.get('format') in self.ALLOWED_AUDIO_FMT else 'mp3'
            else:
                fmt = item.get('format') if item.get('format') in self.ALLOWED_VIDEO_FMT else 'mp4'
            quality = item.get('quality') if item.get('quality') in self.ALLOWED_QUALITY else 'best'
            referer, _ = normalize_url(item.get('referer')) if item.get('referer') else (None, None)
            dl_id = clean_text(item.get('id'), '', 120)
            if not dl_id or dl_id in seen_ids:
                self._next_id += 1
                dl_id = f"dl_{self._next_id}_{uuid.uuid4().hex[:6]}"
            seen_ids.add(dl_id)
            requires_auth = coerce_bool(item.get('requiresAuth'), False)
            self._next_order += 1
            try:
                created_at = float(item.get('createdAt') or time.time())
            except (TypeError, ValueError, OverflowError):
                created_at = time.time()
            if not math.isfinite(created_at) or created_at <= 0:
                created_at = time.time()
            dl = Download(
                dl_id,
                url,
                audio_only=audio_only,
                fmt=fmt,
                quality=quality,
                output_dir=output_dir,
                title=clean_text(item.get('title'), None, 500) or None,
                referer=referer,
                requires_auth=requires_auth,
                created_at=created_at,
                queue_order=self._next_order,
            )
            dl.status = 'needs-auth' if requires_auth else 'paused'
            dl.error = (
                'Fresh YouTube authentication is required before this recovered download can run.'
                if requires_auth else
                'Recovered after restart. Resume the queue when you are ready.'
            )
            restored.append(dl)

        if not restored:
            return
        with self._lock:
            for dl in restored:
                self.downloads[dl.id] = dl
            self.intake_paused = True
            # Normalize any legacy/running statuses on disk immediately. The
            # persisted form contains metadata only; cookie values and jar
            # paths are deliberately absent from _serialize_queue_locked().
            self._persist_locked()

    def _serialize_queue_locked(self):
        records = []
        unfinished = sorted(
            (
                dl for dl in self.downloads.values()
                if dl.status in DOWNLOAD_ACTIVE_STATES
            ),
            key=lambda dl: (dl.queue_order, dl.start_time, dl.id),
        )[:MAX_QUEUED_TOTAL]
        for dl in unfinished:
            records.append({
                'id': clean_text(dl.id, '', 120),
                'url': dl.url,
                'title': clean_text(dl.title, 'Unknown', 500) or 'Unknown',
                'audioOnly': bool(dl.audio_only),
                'format': dl.format,
                'quality': dl.quality,
                'outputDir': clean_path_text(dl.output_dir),
                'referer': dl.referer,
                'requiresAuth': bool(dl.requires_auth),
                'createdAt': float(dl.start_time),
                'order': int(dl.queue_order),
            })
        return {
            'schemaVersion': DOWNLOAD_QUEUE_SCHEMA_VERSION,
            'intakePaused': bool(self.intake_paused),
            'downloads': records,
        }

    def _persist_locked(self):
        if self._queue_path is None or self._closing:
            return True
        if not self._persistence_compatible:
            return False
        try:
            atomic_write_json(self._queue_path, self._serialize_queue_locked())
            self._persistence_error = ''
            return True
        except Exception as exc:
            self._persistence_error = 'Could not save the pending download queue.'
            write_persistent_log(f"Download queue save failed: {exc}")
            return False

    def _capacity_locked(self):
        running = len(self._running_ids)
        pending = sum(
            1 for dl in self.downloads.values()
            if dl.status in DOWNLOAD_PENDING_STATES
        )
        total = running + pending
        return {
            'running': running,
            'runningLimit': MAX_CONCURRENT,
            'pending': pending,
            'total': total,
            'totalLimit': MAX_QUEUED_TOTAL,
            'available': max(0, MAX_QUEUED_TOTAL - total),
            'intakePaused': bool(self.intake_paused),
        }

    def capacity(self):
        with self._lock:
            return self._capacity_locked()

    def _ordered_pending_locked(self):
        return sorted(
            (
                dl for dl in self.downloads.values()
                if dl.status in DOWNLOAD_PENDING_STATES
            ),
            key=lambda dl: (dl.queue_order, dl.start_time, dl.id),
        )

    def _auth_recovery_locked(self, url, cookies):
        if not cookies:
            return None
        return next((
            dl for dl in self._ordered_pending_locked()
            if dl.status == 'needs-auth' and dl.url == url
        ), None)

    def _launch_workers(self, downloads):
        for dl in downloads:
            cookies = dl._cookies
            dl._cookies = None
            if cookies:
                jar_path = INSTALL_DIR / f".cookies.{dl.id}.txt"
                dl.cookies_file = write_cookies_netscape(cookies, jar_path)
                if not dl.cookies_file:
                    with self._lock:
                        self._running_ids.discard(dl.id)
                        dl.status = 'failed'
                        dl.error = 'Could not prepare a protected YouTube cookie jar. Retry from Astra Deck.'
                        dl.error_code = 'cookie-jar-failed'
                        dl.error_advice = 'Retry from Astra Deck so fresh cookies can be supplied.'
                        dl.error_action = 'sign-in-and-retry'
                        dl.mark_terminal()
                        self._persist_locked()
                    self.progress_updated.emit()
                    self.download_completed.emit(dl.id)
                    continue
            try:
                thread = threading.Thread(
                    target=self._worker_entry,
                    args=(dl,),
                    daemon=True,
                )
                thread.start()
            except Exception as exc:
                with self._lock:
                    self._running_ids.discard(dl.id)
                    dl.status = 'failed'
                    dl.error = 'Could not start the download worker. Retry the download.'
                    dl.error_code = 'worker-start-failed'
                    dl.mark_terminal()
                    if dl.cookies_file:
                        try:
                            Path(dl.cookies_file).unlink(missing_ok=True)
                        except Exception:
                            pass
                        dl.cookies_file = None
                    self._persist_locked()
                write_persistent_log(f"Download worker {dl.id} failed to start: {exc}")
                self.progress_updated.emit()
                self.download_completed.emit(dl.id)
        # A worker preparation failure frees a slot synchronously.
        if downloads and not self._closing:
            self._schedule()

    def _worker_entry(self, dl):
        try:
            self._run_download(dl)
        except Exception as exc:
            # _run_download is defensive, but keep the scheduler correct if a
            # future implementation lets an exception escape its boundary.
            if dl.status not in DOWNLOAD_TERMINAL_STATES:
                dl.status = 'failed'
                dl.error = 'Unexpected download worker failure. Check Astra Downloader logs.'
                dl.mark_terminal()
            write_persistent_log(f"Download worker {dl.id} escaped unexpectedly: {exc}")
        finally:
            with self._lock:
                self._running_ids.discard(dl.id)
                if dl.status in DOWNLOAD_RUNNING_STATES:
                    dl.status = 'failed'
                    dl.error = 'Download worker stopped before reporting a result.'
                    dl.mark_terminal()
                self._persist_locked()
            if not self._closing:
                self._schedule()

    def _schedule(self):
        to_start = []
        with self._lock:
            if self._closing or self.intake_paused:
                return
            available = max(0, MAX_CONCURRENT - len(self._running_ids))
            if available <= 0:
                return
            candidates = [
                dl for dl in self._ordered_pending_locked()
                if dl.status == 'pending'
            ][:available]
            for dl in candidates:
                dl.status = 'queued'
                self._running_ids.add(dl.id)
                to_start.append(dl)
        if to_start:
            self.progress_updated.emit()
            self._launch_workers(to_start)

    def _reclaim_terminal_records_locked(self, required_slots=1):
        """Free only terminal records when the bounded queue needs capacity."""
        overflow = len(self.downloads) + max(0, required_slots) - MAX_QUEUED_TOTAL
        if overflow <= 0:
            return 0
        terminal = sorted(
            (
                (getattr(download, 'finished_time', None) or download.start_time, dl_id)
                for dl_id, download in self.downloads.items()
                if download.status in DOWNLOAD_TERMINAL_STATES
            ),
            key=lambda item: item[0],
        )
        removed = 0
        for _finished_at, dl_id in terminal[:overflow]:
            del self.downloads[dl_id]
            removed += 1
        return removed

    def start_download(self, url, audio_only=False, fmt=None, quality=None,
                       output_dir=None, title=None, referer=None, cookies=None):
        url, err = normalize_url(url)
        if err:
            return None, err
        audio_only = coerce_bool(audio_only, False)

        with self._lock:
            self._reclaim_terminal_records_locked()
            auth_recovery = self._auth_recovery_locked(url, cookies)
            if not auth_recovery and self._capacity_locked()['total'] >= MAX_QUEUED_TOTAL:
                return None, (
                    f"Download queue is full ({MAX_QUEUED_TOTAL}/{MAX_QUEUED_TOTAL}). "
                    "Cancel a pending item or wait for a running download to finish, then retry."
                )

        # Sanitize format/quality
        if audio_only:
            fmt = fmt if fmt in self.ALLOWED_AUDIO_FMT else 'mp3'
        else:
            fmt = fmt if fmt in self.ALLOWED_VIDEO_FMT else 'mp4'
        quality = quality if quality in self.ALLOWED_QUALITY else 'best'

        # Output directory — path-confined to the server's configured roots.
        # A compromised extension or malicious content script would otherwise
        # be able to hand us any absolute path and watch us mkdir + write
        # there. See HARDENING.md Pass 6 S2 (outputDir allowlist).
        client_supplied_output = bool(output_dir)
        if not output_dir:
            if audio_only and self.config.get("AudioDownloadPath"):
                output_dir = self.config.get("AudioDownloadPath")
            else:
                output_dir = self.config.get("DownloadPath", str(Path.home() / "Videos"))
        # Only enforce confinement when the client supplied the path. The
        # fallback defaults above are always inside the allowlist by
        # construction, and enforcing for them would create a chicken-and-egg
        # when the user is first setting DownloadPath from the Settings UI.
        roots = allowed_output_roots(self.config) if client_supplied_output else None
        output_dir, err = normalize_output_dir(
            output_dir,
            self.config.get("DownloadPath", str(Path.home() / "Videos")),
            allowed_roots=roots,
        )
        if err:
            return None, err
        title = clean_text(title, None, 500) or None
        referer, _ = normalize_url(referer) if referer else (None, None)

        with self._lock:
            # Re-check capacity under the lock. The first check released the
            # lock for URL/output normalization, so concurrent requests could
            # otherwise overfill the durable queue.
            self._reclaim_terminal_records_locked()
            auth_recovery = self._auth_recovery_locked(url, cookies)
            if not auth_recovery and self._capacity_locked()['total'] >= MAX_QUEUED_TOTAL:
                return None, (
                    f"Download queue is full ({MAX_QUEUED_TOTAL}/{MAX_QUEUED_TOTAL}). "
                    "Cancel a pending item or wait for a running download to finish, then retry."
                )
            recovery_previous = None
            if auth_recovery:
                dl = auth_recovery
                dl_id = dl.id
                recovery_previous = (
                    dl.audio_only, dl.format, dl.quality, dl.output_dir,
                    dl.title, dl.referer, dl.requires_auth, dl.status,
                    dl.error, dl.error_code, dl.error_advice, dl.error_action,
                )
                dl.audio_only = audio_only
                dl.format = fmt
                dl.quality = quality
                dl.output_dir = output_dir
                dl.title = title or dl.title
                dl.referer = referer
                dl.requires_auth = True
                dl._cookies = list(cookies)
                dl.status = 'pending'
                dl.error = ''
                dl.error_code = ''
                dl.error_advice = ''
                dl.error_action = ''
            else:
                self._next_id += 1
                dl_id = f"dl_{self._next_id}_{uuid.uuid4().hex[:6]}"
                self._next_order += 1
                dl = Download(
                    dl_id,
                    url,
                    audio_only,
                    fmt,
                    quality,
                    output_dir,
                    title,
                    referer,
                    requires_auth=bool(cookies),
                    queue_order=self._next_order,
                )
                dl._cookies = list(cookies) if cookies else None
                self.downloads[dl_id] = dl
            if not self._persist_locked():
                if not auth_recovery:
                    del self.downloads[dl_id]
                else:
                    (
                        dl.audio_only, dl.format, dl.quality, dl.output_dir,
                        dl.title, dl.referer, dl.requires_auth, dl.status,
                        dl.error, dl.error_code, dl.error_advice, dl.error_action,
                    ) = recovery_previous
                dl._cookies = None
                return None, (
                    "Could not save the pending download queue. Check disk space and "
                    "permissions, then retry."
                )

        self._schedule()

        return dl_id, None

    def _run_download(self, dl):
        dl.status = "downloading"
        self.progress_updated.emit()

        ytdlp = str(YTDLP_PATH)
        ffmpeg_dir = str(FFMPEG_PATH.parent)
        is_playlist = is_playlist_url(dl.url)

        # Output template
        if is_playlist:
            out_tpl = str(Path(dl.output_dir) / "%(playlist_title).200B" / "%(title).200B.%(ext)s")
        else:
            out_tpl = str(Path(dl.output_dir) / "%(title).200B.%(ext)s")

        # Build args. v1.2.0: emit progress as JSON alongside the legacy MDLP
        # line so we can parse robustly when yt-dlp tweaks its human-readable
        # format. We keep the legacy line as a fallback.
        args = [ytdlp, '--ignore-config', '--newline', '--progress', '--no-colors',
                '--trim-filenames', '180',
                '--replace-in-metadata', 'title,playlist_title',
                '[\":<>|*?/\\\\]', '_',
                '--ffmpeg-location', ffmpeg_dir, '-o', out_tpl,
                '--progress-template',
                'download:MDLP %(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s',
                '--progress-template',
                'download:MDLP_JSON %(progress)j']

        frags = clamp_int(self.config.get("ConcurrentFragments", 4), 4, 1, 32)
        args += ['--concurrent-fragments', str(frags)]
        if self.config.get("EmbedMetadata"):
            args.append('--embed-metadata')
        if self.config.get("EmbedThumbnail"):
            args.append('--embed-thumbnail')
        if self.config.get("EmbedChapters"):
            args.append('--embed-chapters')
        if self.config.get("EmbedSubs"):
            langs = re.sub(r'[^a-zA-Z0-9,\-]', '', self.config.get("SubLangs", "en"))
            args += ['--embed-subs', '--write-subs', '--write-auto-subs', '--sub-langs', langs]
        if self.config.get("SponsorBlock"):
            action = 'mark' if self.config.get("SponsorBlockAction") == 'mark' else 'remove'
            args += [f'--sponsorblock-{action}', 'all']
        # v1.3.0: --force-overwrites lets the user re-download the same URL
        # repeatedly. Without it, yt-dlp refuses to overwrite an existing
        # output file and prints "[download] Title.mp4 has already been
        # downloaded" — same UX failure mode as the now-removed
        # --download-archive feature.
        args.append('--force-overwrites')
        rate = str(self.config.get("RateLimit", "")).strip().upper()
        if rate and re.match(r'^\d+[KMG]?$', rate):
            args += ['--limit-rate', rate]
        proxy = self.config.get("Proxy", "")
        if proxy and re.match(r'^(socks(?:4a?|5h?)?|https?)://', proxy):
            args += ['--proxy', proxy]
        max_filesize = int(self.config.get("MaxFileSizeMB", 0) or 0)
        if max_filesize > 0:
            args += ['--max-filesize', f'{max_filesize}M']
        if dl.referer:
            args += ['--referer', dl.referer]
        if dl.cookies_file:
            args += ['--cookies', dl.cookies_file]
        if is_playlist:
            args.append('--yes-playlist')

        # Format selection
        if dl.audio_only:
            args += ['-f', 'bestaudio', '--extract-audio',
                     '--audio-format', dl.format, '--audio-quality', '0']
        else:
            args += build_video_format_args(dl.format, dl.quality)

        # v1.4.0 (N1): YouTube extractor-args — PO Token routing when the
        # bgutil-ytdlp-pot-provider HTTP server is reachable. No-op on
        # non-YouTube URLs and silently absent when the provider isn't
        # running (the user-facing surface for that absence is the popup
        # health banner driven by /health.poTokenProvider).
        args += build_youtube_extractor_args(
            dl.url,
            po_token_provider=probe_po_token_provider(),
        )
        runtime = probe_javascript_runtime(
            configured_runtime=self.config.get('JavaScriptRuntime', 'auto')
        )
        args += build_javascript_runtime_args(runtime)

        args.append(dl.url)

        # Watchdog sentinels declared before the try so the finally can stop the
        # thread even if Popen() raises before the watchdog is created.
        stop_watchdog = None
        watchdog_thread = None
        watchdog_killed = {'value': None}
        try:
            env = _build_subprocess_env()
            proc = spawn_ytdlp(
                args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', bufsize=1,
                creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP,
                env=env,
            )
            dl.process = proc
            last_lines = []
            last_error = None

            # Stall watchdog (see DOWNLOAD_STALL_TIMEOUT_SECONDS): kill a wedged
            # yt-dlp/ffmpeg tree that produces no output for too long so it can't
            # block a worker thread / hold a concurrency slot forever.
            activity = {'at': time.monotonic()}
            stop_watchdog = threading.Event()

            # Bind the stop event and process into the closure via default args.
            # The retry path (below) rebinds `stop_watchdog` and `proc`; without
            # this binding a still-running original watchdog would re-read those
            # names and start polling the retry's event/process, becoming a
            # duplicate watchdog that can cross-kill or mis-attribute a stall.
            def _stall_watchdog(ev=stop_watchdog, watched_proc=proc):
                while not ev.wait(DOWNLOAD_WATCHDOG_POLL_SECONDS):
                    if dl.status == 'cancelled':
                        return
                    if (time.monotonic() - activity['at']) > DOWNLOAD_STALL_TIMEOUT_SECONDS:
                        watchdog_killed['value'] = 'stall'
                        try:
                            terminate_process_tree(watched_proc)
                        except Exception:
                            # reason: best-effort kill; process may already be gone
                            pass
                        return

            watchdog_thread = threading.Thread(
                target=_stall_watchdog, name='download-stall-watchdog', daemon=True
            )
            watchdog_thread.start()

            for line in proc.stdout:
                activity['at'] = time.monotonic()
                line = line.strip()
                if not line:
                    continue
                last_lines.append(line)
                if len(last_lines) > 30:
                    last_lines = last_lines[-30:]
                if 'ERROR' in line.upper():
                    last_error = line

                # Preferred structured progress (JSON — robust to yt-dlp
                # format changes). Falls through to the legacy MDLP regex
                # only if JSON parsing fails.
                if line.startswith('MDLP_JSON '):
                    try:
                        payload = json.loads(line[len('MDLP_JSON '):])
                        total = payload.get('total_bytes') or payload.get('total_bytes_estimate') or 0
                        downloaded_bytes = payload.get('downloaded_bytes') or 0
                        if isinstance(total, (int, float)) and total > 0:
                            dl.progress = max(0.0, min(100.0, (downloaded_bytes / total) * 100.0))
                        spd = (payload.get('_speed_str') or '').strip()
                        eta = (payload.get('_eta_str') or '').strip()
                        if spd and spd not in ('NA', 'Unknown'):
                            dl.speed = spd
                        if eta and eta not in ('NA', 'Unknown'):
                            dl.eta = eta
                        self.progress_updated.emit()
                        continue
                    except Exception:
                        # reason: yt-dlp occasionally emits a malformed JSON
                        # line on extractor exit. Fall through to MDLP.
                        pass

                # Structured progress (MDLP prefix, legacy fallback)
                m = re.match(r'^MDLP\s+(\d+\.?\d*)%?\s+(\S+)\s+(\S+)', line)
                if m:
                    dl.progress = float(m.group(1))
                    spd, eta = m.group(2), m.group(3)
                    if spd not in ('NA', 'Unknown'):
                        dl.speed = spd
                    if eta not in ('NA', 'Unknown'):
                        dl.eta = eta
                    self.progress_updated.emit()
                    continue

                # Legacy progress
                m = re.match(r'\[download\]\s+(\d+\.?\d*)%', line)
                if m:
                    dl.progress = float(m.group(1))
                    m2 = re.search(r'at\s+(\S+)\s+ETA\s+(\S+)', line)
                    if m2:
                        dl.speed = m2.group(1)
                        dl.eta = m2.group(2)
                    self.progress_updated.emit()
                    continue

                # Status changes
                if '[Merger]' in line or 'Merging formats' in line:
                    dl.status = "merging"
                    self.progress_updated.emit()
                elif '[ExtractAudio]' in line or '[extract]' in line:
                    dl.status = "extracting"
                    self.progress_updated.emit()

                # Filename detection
                m = re.search(r'\[Merger\] Merging formats into "(.+)"', line)
                if m:
                    dl.filename = m.group(1)
                else:
                    m = re.search(r'\[download\] Destination: (.+)', line)
                    if m:
                        dl.filename = m.group(1)

            proc.wait()

            if dl.status != "complete":
                if dl.status == "cancelled":
                    dl.error = dl.error or "Cancelled by user."
                elif watchdog_killed['value'] == 'stall':
                    dl.status = "failed"
                    dl.error = (
                        "Download stalled (no progress for "
                        f"{DOWNLOAD_STALL_TIMEOUT_SECONDS // 60} minutes) and was stopped."
                    )
                    apply_download_failure_classification(dl, 'network-unreachable')
                elif proc.returncode == 0:
                    dl.status = "complete"
                    dl.progress = 100
                else:
                    dl.status = "failed"
                    # Audit pass: truncate the last ERROR line like the
                    # fallback branch already does. yt-dlp ERROR lines can
                    # carry a full Python traceback; an untruncated value used
                    # to round-trip through /status to the extension popup and
                    # blow past the JSON payload UI budget.
                    if last_error:
                        dl.error = last_error[-240:]
                    elif last_lines:
                        dl.error = " ".join(last_lines)[-240:]
                    else:
                        dl.error = "Unknown error"
                    combined = " ".join(last_lines).lower()
                    if 'live event has ended' in combined and dl.cookies_file:
                        write_persistent_log(
                            f"Download {dl.id}: 'live event has ended' with cookies — "
                            "retrying without cookies"
                        )
                        retry_args = [a for i, a in enumerate(args)
                                      if a != '--cookies' and (i == 0 or args[i - 1] != '--cookies')]
                        dl.status = "downloading"
                        dl.error = ""
                        dl.progress = 0
                        self.progress_updated.emit()
                        if stop_watchdog is not None:
                            stop_watchdog.set()
                        # Join the original watchdog before rebinding so it can't
                        # linger and poll the retry's process/event.
                        if watchdog_thread is not None:
                            watchdog_thread.join(timeout=DOWNLOAD_WATCHDOG_POLL_SECONDS + 1)
                        # The first process reached EOF, but Popen keeps the
                        # TextIOWrapper open until it is explicitly closed (or
                        # garbage-collected). Close it before rebinding `proc`
                        # so repeated cookie-less retries cannot leak one pipe
                        # handle per attempt.
                        previous_stdout = getattr(proc, 'stdout', None)
                        try:
                            if previous_stdout is not None:
                                previous_stdout.close()
                        except Exception:
                            # reason: test doubles and already-closed streams
                            # may not expose a conventional close operation
                            pass
                        activity['at'] = time.monotonic()
                        stop_watchdog = threading.Event()
                        proc = spawn_ytdlp(
                            retry_args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding='utf-8', errors='replace', bufsize=1,
                            creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP,
                            env=env,
                        )
                        dl.process = proc
                        last_lines = []
                        last_error = None

                        def _retry_watchdog(ev=stop_watchdog, watched_proc=proc):
                            while not ev.wait(DOWNLOAD_WATCHDOG_POLL_SECONDS):
                                if dl.status == 'cancelled':
                                    return
                                if (time.monotonic() - activity['at']) > DOWNLOAD_STALL_TIMEOUT_SECONDS:
                                    watchdog_killed['value'] = 'stall'
                                    try:
                                        terminate_process_tree(watched_proc)
                                    except Exception:
                                        pass
                                    return

                        watchdog_thread = threading.Thread(
                            target=_retry_watchdog, name='download-stall-watchdog-retry', daemon=True
                        )
                        watchdog_thread.start()

                        for line in proc.stdout:
                            activity['at'] = time.monotonic()
                            line = line.strip()
                            if not line:
                                continue
                            last_lines.append(line)
                            if len(last_lines) > 30:
                                last_lines = last_lines[-30:]
                            if 'ERROR' in line.upper():
                                last_error = line
                            if line.startswith('MDLP_JSON '):
                                try:
                                    payload = json.loads(line[len('MDLP_JSON '):])
                                    total = payload.get('total_bytes') or payload.get('total_bytes_estimate') or 0
                                    downloaded_bytes = payload.get('downloaded_bytes') or 0
                                    if isinstance(total, (int, float)) and total > 0:
                                        dl.progress = max(0.0, min(100.0, (downloaded_bytes / total) * 100.0))
                                    spd = (payload.get('_speed_str') or '').strip()
                                    eta = (payload.get('_eta_str') or '').strip()
                                    if spd and spd not in ('NA', 'Unknown'):
                                        dl.speed = spd
                                    if eta and eta not in ('NA', 'Unknown'):
                                        dl.eta = eta
                                    self.progress_updated.emit()
                                    continue
                                except Exception:
                                    pass
                            m = re.match(r'^MDLP\s+(\d+\.?\d*)%?\s+(\S+)\s+(\S+)', line)
                            if m:
                                dl.progress = float(m.group(1))
                                spd, eta = m.group(2), m.group(3)
                                if spd not in ('NA', 'Unknown'):
                                    dl.speed = spd
                                if eta not in ('NA', 'Unknown'):
                                    dl.eta = eta
                                self.progress_updated.emit()
                                continue
                            m = re.match(r'\[download\]\s+(\d+\.?\d*)%', line)
                            if m:
                                dl.progress = float(m.group(1))
                                m2 = re.search(r'at\s+(\S+)\s+ETA\s+(\S+)', line)
                                if m2:
                                    dl.speed = m2.group(1)
                                    dl.eta = m2.group(2)
                                self.progress_updated.emit()
                                continue
                            if '[Merger]' in line or 'Merging formats' in line:
                                dl.status = "merging"
                                self.progress_updated.emit()
                            elif '[ExtractAudio]' in line or '[extract]' in line:
                                dl.status = "extracting"
                                self.progress_updated.emit()
                            m = re.search(r'\[Merger\] Merging formats into "(.+)"', line)
                            if m:
                                dl.filename = m.group(1)
                            else:
                                m = re.search(r'\[download\] Destination: (.+)', line)
                                if m:
                                    dl.filename = m.group(1)

                        proc.wait()
                        if dl.status == 'cancelled':
                            dl.error = dl.error or "Cancelled by user."
                        elif watchdog_killed['value'] == 'stall':
                            dl.status = "failed"
                            dl.error = (
                                "Download stalled (no progress for "
                                f"{DOWNLOAD_STALL_TIMEOUT_SECONDS // 60} minutes) and was stopped."
                            )
                            apply_download_failure_classification(dl, 'network-unreachable')
                        elif proc.returncode == 0:
                            dl.status = "complete"
                            dl.progress = 100
                        else:
                            dl.status = "failed"
                            if last_error:
                                dl.error = last_error[-240:]
                            elif last_lines:
                                dl.error = " ".join(last_lines)[-240:]
                            else:
                                dl.error = "Unknown error"
                            apply_download_failure_classification(
                                dl,
                                classify_download_failure(dl.error, last_lines),
                            )
                    elif 'live event has ended' in combined:
                        dl.error = (
                            "YouTube reports this live stream has ended. "
                            "The VOD archive may still be processing — "
                            "try again in a few minutes."
                        )
                    elif ('sabr' in combined or 'no video formats' in combined
                            or 'requested format is not available' in combined):
                        apply_download_failure_classification(dl, 'sabr-limited')
                    else:
                        apply_download_failure_classification(
                            dl,
                            classify_download_failure(dl.error, last_lines),
                        )

        except FileNotFoundError:
            if dl.status != "cancelled":
                dl.status = "failed"
                dl.error = "yt-dlp not found. Run setup first."
        except Exception as e:
            if dl.status != "cancelled":
                dl.status = "failed"
                dl.error = "Unexpected download error. Check Astra Downloader logs for details."
                write_persistent_log(f"Download {dl.id} failed unexpectedly: {e}")
        finally:
            # Signal the watchdog to stop; it's a daemon thread that wakes from
            # its wait() the moment the event is set and exits on its own. We do
            # NOT join() it here — joining adds latency between status becoming
            # terminal (which unblocks observers/tests) and the post-finally
            # history write, which can let an observer see "complete" before the
            # history entry exists.
            if stop_watchdog is not None:
                stop_watchdog.set()
            # Audit fix: if we got here via the generic except (e.g. an
            # unexpected error inside the output-parsing loop), yt-dlp and any
            # ffmpeg child may still be running — without this they'd be
            # orphaned (holding a MAX_CONCURRENT slot's process alive and
            # keeping the cookie jar in use while we unlink it below). The
            # normal-completion and cancelled paths are unaffected:
            # terminate_process_tree() returns immediately when the process
            # has already exited, and the cancel() thread's own kill is
            # idempotent with this one.
            orphan = dl.process
            if orphan is not None and orphan.poll() is None:
                try:
                    terminate_process_tree(orphan)
                except Exception:
                    # reason: best-effort kill; never mask the original error
                    pass
            # Popen does not close PIPE-backed TextIOWrapper objects merely
            # because wait() reached EOF. Explicit closure prevents descriptor
            # leaks in the long-running GUI after each completed, failed, or
            # cancelled download.
            process_stdout = getattr(orphan, 'stdout', None)
            try:
                if process_stdout is not None:
                    process_stdout.close()
            except Exception:
                # reason: cleanup must never replace the download result
                pass
            dl.process = None
            # Cookie jar holds session credentials — purge it as soon as the
            # download process exits so it never outlives the one request that
            # needed it.
            if dl.cookies_file:
                try:
                    Path(dl.cookies_file).unlink(missing_ok=True)
                except Exception:
                    pass
                dl.cookies_file = None

        dl.mark_terminal()
        if dl.status == "complete":
            self.total_completed += 1
            duration = int(time.time() - dl.start_time)
            self.history.add({
                "id": dl.id, "url": dl.url, "title": dl.title,
                "filename": dl.filename, "format": dl.format,
                "quality": dl.quality, "audioOnly": dl.audio_only,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "duration": duration,
            })

        self.progress_updated.emit()
        self.download_completed.emit(dl.id)

    def pause_intake(self):
        with self._lock:
            if self.intake_paused:
                return True
            self.intake_paused = True
            if self._persist_locked():
                return True
            self.intake_paused = False
            return False

    def resume_intake(self):
        with self._lock:
            restored = []
            self.intake_paused = False
            for dl in self.downloads.values():
                if dl.status == 'paused':
                    restored.append((dl, dl.error))
                    dl.status = 'pending'
                    dl.error = ''
            if not self._persist_locked():
                self.intake_paused = True
                for dl, error in restored:
                    dl.status = 'paused'
                    dl.error = error
                return False
        self.progress_updated.emit()
        self._schedule()
        return True

    def resume_download(self, dl_id, cookies=None):
        with self._lock:
            dl = self.downloads.get(dl_id)
            if not dl:
                return False, 'Download no longer exists in the queue.'
            if dl.status not in DOWNLOAD_PENDING_STATES:
                return False, 'Only pending or recovered downloads can be resumed.'
            if dl.status == 'needs-auth' and not cookies:
                return False, (
                    'Fresh YouTube cookies are required. Retry from Astra Deck so the '
                    'browser can authorize this download.'
                )
            previous = (
                dl.status, dl.error, dl.error_code, dl.error_advice,
                dl.error_action, dl.requires_auth, dl._cookies,
            )
            if cookies:
                dl.requires_auth = True
                dl._cookies = list(cookies)
            dl.status = 'pending'
            dl.error = ''
            dl.error_code = ''
            dl.error_advice = ''
            dl.error_action = ''
            if not self._persist_locked():
                (
                    dl.status, dl.error, dl.error_code, dl.error_advice,
                    dl.error_action, dl.requires_auth, dl._cookies,
                ) = previous
                return False, self._persistence_error
        self.progress_updated.emit()
        self._schedule()
        return True, None

    def retry(self, dl_id, cookies=None):
        with self._lock:
            dl = self.downloads.get(dl_id)
            if not dl:
                return False, 'Download no longer exists in the queue.'
            if dl.status != 'failed':
                return False, 'Only failed downloads can be retried.'
            if dl.error_code not in DOWNLOAD_RETRYABLE_ERROR_CODES:
                return False, 'This failure needs its recovery action before it can be retried.'
            if self._capacity_locked()['total'] >= MAX_QUEUED_TOTAL:
                return False, (
                    f"Download queue is full ({MAX_QUEUED_TOTAL}/{MAX_QUEUED_TOTAL}). "
                    "Cancel a pending item or wait for a running download to finish, then retry."
                )
            previous = (
                dl.status, dl.progress, dl.speed, dl.eta, dl.filename,
                dl.error, dl.error_code, dl.error_advice, dl.error_action,
                dl.finished_time, dl.start_time, dl.queue_order,
                dl.requires_auth, dl._cookies,
            )
            if dl.requires_auth and not cookies:
                dl.status = 'needs-auth'
                dl.error = (
                    'Fresh YouTube authentication is required before this download can retry.'
                )
                dl.error_code = ''
                dl.error_advice = ''
                dl.error_action = 'sign-in-and-retry'
                dl.finished_time = None
                self._next_order += 1
                dl.queue_order = self._next_order
                if not self._persist_locked():
                    (
                        dl.status, dl.progress, dl.speed, dl.eta, dl.filename,
                        dl.error, dl.error_code, dl.error_advice, dl.error_action,
                        dl.finished_time, dl.start_time, dl.queue_order,
                        dl.requires_auth, dl._cookies,
                    ) = previous
                    return False, self._persistence_error
                return False, (
                    'Fresh YouTube cookies are required. Retry from Astra Deck so the '
                    'browser can authorize this download.'
                )
            if cookies:
                dl.requires_auth = True
                dl._cookies = list(cookies)
            dl.status = 'pending'
            dl.progress = 0.0
            dl.speed = ''
            dl.eta = ''
            dl.filename = ''
            dl.error = ''
            dl.error_code = ''
            dl.error_advice = ''
            dl.error_action = ''
            dl.finished_time = None
            dl.start_time = time.time()
            self._next_order += 1
            dl.queue_order = self._next_order
            if not self._persist_locked():
                (
                    dl.status, dl.progress, dl.speed, dl.eta, dl.filename,
                    dl.error, dl.error_code, dl.error_advice, dl.error_action,
                    dl.finished_time, dl.start_time, dl.queue_order,
                    dl.requires_auth, dl._cookies,
                ) = previous
                return False, self._persistence_error
        self.progress_updated.emit()
        self._schedule()
        return True, None

    def move_pending(self, dl_id, position):
        with self._lock:
            pending = self._ordered_pending_locked()
            current = next((index for index, dl in enumerate(pending) if dl.id == dl_id), None)
            if current is None:
                return False, 'Only pending downloads can be reordered.'
            try:
                target = int(position)
            except (TypeError, ValueError):
                return False, 'Queue position must be an integer.'
            target = max(0, min(target, len(pending) - 1))
            if target == current:
                return True, None
            previous_orders = {dl.id: dl.queue_order for dl in pending}
            item = pending.pop(current)
            pending.insert(target, item)
            for index, dl in enumerate(pending, start=1):
                dl.queue_order = index
            self._next_order = max(self._next_order, len(pending))
            if not self._persist_locked():
                for dl in pending:
                    dl.queue_order = previous_orders[dl.id]
                return False, self._persistence_error
        self.progress_updated.emit()
        return True, None

    def move_pending_by(self, dl_id, offset):
        with self._lock:
            pending = self._ordered_pending_locked()
            current = next((index for index, dl in enumerate(pending) if dl.id == dl_id), None)
        if current is None:
            return False, 'Only pending downloads can be reordered.'
        return self.move_pending(dl_id, current + int(offset))

    def cancel(self, dl_id):
        with self._lock:
            dl = self.downloads.get(dl_id)
            if not dl or dl.status in DOWNLOAD_TERMINAL_STATES:
                return False
            dl.status = "cancelled"
            dl.error = "Cancelled by user."
            dl._cookies = None
            if dl.cookies_file and dl.process is None:
                try:
                    Path(dl.cookies_file).unlink(missing_ok=True)
                except Exception:
                    pass
                dl.cookies_file = None
            dl.mark_terminal()
            proc = dl.process
            was_running = dl_id in self._running_ids
            self._persist_locked()
        if proc and proc.poll() is None:
            def terminate():
                terminate_process_tree(proc)
            threading.Thread(target=terminate, daemon=True).start()
        self.progress_updated.emit()
        if not was_running:
            self._schedule()
        return True

    def cancel_all(self):
        with self._lock:
            # Keep the last durable unfinished snapshot intact. A new process
            # will restore those records paused/needs-auth rather than silently
            # starting them or losing user intent.
            self._closing = True
            active = [d for d in self.downloads.values() if d.status in DOWNLOAD_ACTIVE_STATES]
        for dl in active:
            dl.status = "cancelled"
            dl.error = "Cancelled (app shutdown)."
            dl._cookies = None
            dl.mark_terminal()
            proc = dl.process
            if proc and proc.poll() is None:
                try:
                    terminate_process_tree(proc)
                except Exception as e:
                    write_persistent_log(f"cancel_all termination warning: {e}")

    def active_count(self):
        with self._lock:
            return len(self._running_ids)

    def pending_count(self):
        with self._lock:
            return sum(1 for d in self.downloads.values()
                       if d.status in DOWNLOAD_PENDING_STATES)

    def snapshot(self):
        with self._lock:
            return sorted(
                self.downloads.values(),
                key=lambda dl: (dl.queue_order, dl.start_time, dl.id),
            )

    def queue_payload(self):
        with self._lock:
            pending = self._ordered_pending_locked()
            pending_positions = {dl.id: index for index, dl in enumerate(pending)}
            items = []
            for dl in sorted(
                    self.downloads.values(),
                    key=lambda item: (item.queue_order, item.start_time, item.id)):
                payload = dl.to_dict()
                if dl.id in pending_positions:
                    payload['queuePosition'] = pending_positions[dl.id]
                items.append(payload)
            return {
                'downloads': items,
                'count': len(items),
                'capacity': self._capacity_locked(),
                'persistenceError': self._persistence_error or None,
            }

    def cleanup_old(self):
        cutoff = time.time() - 300  # 5 min
        with self._lock:
            to_remove = [k for k, d in self.downloads.items()
                         if d.status in DOWNLOAD_TERMINAL_STATES
                         and (getattr(d, 'finished_time', None) or d.start_time) < cutoff]
            for k in to_remove:
                del self.downloads[k]

# ══════════════════════════════════════════════════════════════
# HTTP SERVER (Flask in background thread)
# ══════════════════════════════════════════════════════════════
def create_api(config, dl_manager, history):
    api = Flask(__name__)
    api.logger.disabled = True
    import logging
    logging.getLogger('werkzeug').disabled = True
    # v1.5.1 EI12: cap request bodies BEFORE any route handler sees them.
    # Flask emits 413 itself when this is exceeded; we don't need a
    # custom errorhandler because all legitimate clients (the extension
    # popup + ytkit.js EXT_FETCH) post tiny payloads (<2 KB).
    api.config['MAX_CONTENT_LENGTH'] = MAX_REQUEST_BYTES

    token = config.get("ServerToken")
    legacy_health_token_echo = coerce_bool(
        config.get("LegacyHealthTokenEcho", DEFAULT_CONFIG["LegacyHealthTokenEcho"]),
        DEFAULT_CONFIG["LegacyHealthTokenEcho"],
    )
    legacy_health_token_origins = legacy_health_token_origin_allowlist(config)
    # v1.2.0: token-bucket rate limit on /download. Other endpoints are
    # cheap and read-only; we don't limit them (local-only service, no
    # realistic DoS vector beyond /download work queue).
    download_rate_limiter = RateLimiter(
        max_events=RATE_LIMIT_DOWNLOAD_MAX,
        window_seconds=RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS,
    )
    pickfolder_rate_limiter = RateLimiter(
        max_events=RATE_LIMIT_PICKFOLDER_MAX,
        window_seconds=RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS,
    )

    def check_auth():
        provided = request.headers.get("X-Auth-Token", "")
        return bool(token and provided and hmac.compare_digest(str(provided), str(token)))

    def is_allowed_extension_origin(origin):
        normalized = normalize_extension_origin(origin)
        return bool(normalized and normalized in legacy_health_token_origins)

    # v3.15.0: DNS-rebinding defense. A browser visiting attacker.com that
    # rebinds the host to 127.0.0.1 will send `Host: attacker.com` — legitimate
    # local clients always send `Host: 127.0.0.1:PORT` or `localhost:PORT`.
    # Werkzeug does not validate Host by default, so we have to do it ourselves.
    def is_allowed_host():
        host = (request.headers.get("Host") or "").strip().lower()
        if not host:
            return False
        # Strip the port so we compare hostnames reliably across port fallbacks.
        if host.startswith('['):  # ipv6 literal like "[::1]:9751"
            end = host.find(']')
            hostname = host[1:end] if end != -1 else host
        else:
            hostname = host.split(':', 1)[0]
        return hostname in {'127.0.0.1', 'localhost', '::1'}

    def cors_response(data, status=200, extra_headers=None):
        resp = jsonify(data)
        resp.status_code = status
        # v1.5.1 EI12: outgoing-payload size guard. Replace oversized
        # bodies with a 413 error response — the user-facing API
        # contract is "small JSON responses only"; a 10 MB ceiling
        # never trips for any current endpoint but stops a future
        # /streamlinks / /logs surface from streaming megabytes
        # through the Flask process unnoticed.
        try:
            body_len = len(resp.get_data())
        except Exception:
            # reason: get_data may fail on a non-bytes response; treat as
            # within-bound and let the wire layer surface any anomaly.
            body_len = 0
        if body_len > MAX_RESPONSE_BYTES:
            resp = jsonify({
                "error": "Response body exceeds the {} byte limit ({} bytes built).".format(
                    MAX_RESPONSE_BYTES, body_len
                )
            })
            resp.status_code = 413
        origin = request.headers.get("Origin", "")
        if is_allowed_extension_origin(origin):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Auth-Token,X-MDL-Client"
        # v1.2.0: cache preflight for 10 minutes. Multi-video downloads
        # previously re-negotiated OPTIONS on every POST /download.
        resp.headers["Access-Control-Max-Age"] = str(CORS_MAX_AGE_SECONDS)
        # v1.4.0 (NX11): Defense-in-depth against intermediary caching of
        # auth-bearing responses. CVE-2026-27205 specifically targets
        # Flask session cookies via the `in` operator; Astra Downloader
        # doesn't use Flask sessions (X-Auth-Token bearer model only),
        # so the CVE is structurally inapplicable — but the same class
        # of leak applies to any auth-bearing response cached by an
        # intermediary. `no-store` is the strongest no-cache directive
        # and is the right default for a local REST API that serves
        # tokenized payloads. Also signal `Vary: Cookie` so any future
        # cookie-bearing variant cannot land without explicit review.
        resp.headers["Cache-Control"] = "no-store"
        existing_vary = resp.headers.get("Vary", "")
        vary_tokens = {v.strip() for v in existing_vary.split(",") if v.strip()}
        vary_tokens.add("Cookie")
        resp.headers["Vary"] = ", ".join(sorted(vary_tokens))
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        if extra_headers:
            for k, v in extra_headers.items():
                resp.headers[k] = v
        return resp

    @api.before_request
    def guard_request():
        # Reject DNS-rebinding probes before any route handler sees them.
        if not is_allowed_host():
            return cors_response({"error": "Invalid Host header"}, 421)
        if request.method == 'OPTIONS':
            return cors_response({"ok": True})

    @api.route('/health')
    def health():
        resp = {
            "status": "ok", "service": SERVICE_ID, "api": SERVICE_API_VERSION,
            "name": APP_NAME, "version": APP_VERSION,
            "port": clamp_int(config.get("ServerPort", SERVER_PORT), SERVER_PORT, 1024, 65535),
            "downloads": dl_manager.active_count(),
            "queue": dl_manager.capacity(),
            "token_required": True,
            "legacyTokenEcho": legacy_health_token_echo,
            "nativeChannelRequired": not legacy_health_token_echo,
            # v1.2.0: surface tool versions so the extension can show
            # "yt-dlp 2026.04.01" in the repair panel + warn on stale binaries.
            "ytDlpVersion": get_ytdlp_version(),
            "ffmpegVersion": get_ffmpeg_version(),
            # v1.4.0 (N1): surface bgutil-ytdlp-pot-provider health so the
            # extension popup can render an amber "PO Token provider not
            # detected" pill. null = not running / unreachable; an object
            # with {ok, port, version} = running.
            "poTokenProvider": probe_po_token_provider(),
            # v1.4.0 (NX10): bundled ffmpeg freshness audit. The extension
            # popup can surface a "ffmpeg looks stale (X.x); update via
            # the Repair panel" pill when current=false. null = first-run
            # bootstrap before ffmpeg is on disk.
            "ffmpegCapabilities": check_ffmpeg_capabilities(),
            # External JavaScript runtime capability. The legacy denoRuntime
            # key remains during the additive migration to javascriptRuntime.
            "denoRuntime": probe_javascript_runtime(
                configured_runtime=config.get('JavaScriptRuntime', 'auto')
            ),
            "javascriptRuntime": probe_javascript_runtime(
                configured_runtime=config.get('JavaScriptRuntime', 'auto')
            ),
            # Verified updater state contains only versions/status codes; file
            # paths and digests remain local to the companion.
            "updateRecovery": read_update_recovery_status(),
            # v1.6.0: SABR (Server-Based Adaptive Bitrate) support status.
            # YouTube's web client now returns SABR-only streaming URLs for
            # a growing share of videos. yt-dlp PR #13515 adds native SABR
            # download support but is still in draft. Until it merges, the
            # companion passes formats=duplicate which surfaces both HTTPS
            # and SABR entries, but SABR entries cannot be downloaded. The
            # extension health panel surfaces "SABR: limited" when native
            # support is absent, so users understand why some downloads fail.
            "sabrSupport": "limited",
            "rateLimit": {
                "downloadMaxPerWindow": RATE_LIMIT_DOWNLOAD_MAX,
                "downloadWindowSeconds": RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS,
            },
            # Recent log lines can contain absolute paths (usernames), exception
            # text, and download IDs. /health is otherwise unauthenticated (only
            # Host-checked), so only expose diagnostics to a caller holding the
            # bearer token — an unauthenticated local process gets an empty list.
            "recentErrors": get_recent_log_entries() if check_auth() else [],
        }
        # Legacy token echo is an explicit compatibility path only. Browser
        # extension origins must be configured first; arbitrary installed
        # extensions must not be able to bootstrap the bearer token.
        origin = request.headers.get("Origin", "")
        token_source = clean_text(request.headers.get("X-MDL-Token-Source", ""), "", 32)
        if token_source:
            resp["tokenSource"] = token_source
        if (
            legacy_health_token_echo
            and token_source != "native"
            and request.headers.get("X-MDL-Client") == "MediaDL"
            and (not origin or is_allowed_extension_origin(origin))
        ):
            resp["token"] = token
        return cors_response(resp)

    @api.route('/provision-deno', methods=['POST'])
    def provision_deno_endpoint():
        # Constant-time comparison (was a plain != , the only mutating endpoint
        # not using a timing-safe check). Keep the legacy X-MDL-Token header for
        # client compatibility, but also accept the standard X-Auth-Token.
        legacy = request.headers.get('X-MDL-Token', '')
        legacy_ok = bool(token and legacy and hmac.compare_digest(str(legacy), str(token)))
        if not (check_auth() or legacy_ok):
            return cors_response({"error": "Unauthorized"}, 403)
        result = provision_deno()
        if result:
            runtime = probe_javascript_runtime(
                force=True,
                configured_runtime=config.get('JavaScriptRuntime', 'auto'),
            )
            return cors_response({"ok": True, "path": result, "denoRuntime": runtime})
        error = get_last_deno_provision_error()
        return cors_response({
            "ok": False,
            "code": error.get('code') or 'deno-provision-failed',
            "error": error.get('message') or "Failed to download Deno. Check network connection.",
        }, 500)

    @api.route('/download', methods=['POST'])
    def download():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        # v1.2.0: rate limit BEFORE we do any body parsing or normalization so
        # a burst can't burn CPU on 10k rejected requests.
        allowed, retry_after = download_rate_limiter.allow('download')
        if not allowed:
            return cors_response(
                {"error": "Too many download requests in a short period. Please wait a moment."},
                429,
                extra_headers={"Retry-After": str(int(retry_after) + 1)},
            )
        body, body_err, body_code = validate_download_request_body(request.get_json(silent=True))
        if body_err:
            payload = {"error": body_err}
            if body_code:
                payload["code"] = body_code
            return cors_response(payload, 400)
        url, url_err = normalize_url(body['url'])
        if url_err:
            return cors_response({"error": url_err}, 400)

        # SSRF / cookie-scope hardening: the companion is a YouTube downloader,
        # and the documented threat model promises a YouTube-only domain
        # allowlist. Enforce that allowlist here at the HTTP trust boundary —
        # `normalize_url` only checks scheme+netloc, so without this a caller
        # holding the token could point yt-dlp (and the attached session cookie
        # jar) at arbitrary internal/LAN/cloud-metadata hosts. The allowlist
        # lived only in the extension (an untrusted boundary) until now.
        if not is_youtube_url(url):
            return cors_response(
                {
                    "error": "Astra Downloader only downloads from YouTube.",
                    "code": "non-youtube-url",
                },
                400,
            )

        # Runtime capability hard gate. Presence is insufficient: downloads
        # require a supported version and a successful EJS execution probe.
        runtime = probe_javascript_runtime(
            configured_runtime=config.get('JavaScriptRuntime', 'auto')
        )
        runtime_usable = runtime.get('supported') is True and runtime.get('ejsReady') is True
        if runtime.get('ytdlpNeedsRuntime') and not runtime_usable:
            reason = runtime.get('reason')
            if reason == 'runtime-not-installed':
                error_code = 'js-runtime-missing'
            elif reason == 'runtime-version-unsupported':
                error_code = 'js-runtime-unsupported'
            elif reason in {'runtime-version-unparseable', 'runtime-probe-failed'}:
                error_code = 'js-runtime-unverified'
            else:
                error_code = 'ejs-runtime-not-ready'
            advice = runtime.get('advice') or 'Configure a supported JavaScript runtime and retry.'
            payload = download_error_payload(
                error_code,
                error=(
                    "yt-dlp requires a verified JavaScript runtime to solve "
                    "YouTube's signature challenges. " + advice
                ),
                advice=advice,
            )
            return cors_response(
                payload,
                422,
            )

        raw_cookies = body.get('cookies')
        cookies = raw_cookies if isinstance(raw_cookies, list) else None
        # Cap the cookie list so a hostile extension context can't cause the
        # server to write a multi-megabyte cookie jar. 200 is far higher than
        # a real YouTube session ever produces but still bounded.
        if cookies is not None and len(cookies) > 200:
            cookies = cookies[:200]
        dl_id, err = dl_manager.start_download(
            url=url,
            audio_only=body.get('audioOnly', False),
            fmt=body.get('format'),
            quality=body.get('quality', 'best'),
            output_dir=body.get('outputDir'),
            title=body.get('title'),
            referer=body.get('referer'),
            cookies=cookies,
        )
        if err:
            if 'queue is full' in err.lower():
                return cors_response({
                    "error": err,
                    "code": "queue-full",
                    "capacity": dl_manager.capacity(),
                    "remediation": (
                        "Cancel a pending item or wait for a running download to finish, "
                        "then retry."
                    ),
                }, 429)
            if 'could not save' in err.lower():
                return cors_response({"error": err, "code": "queue-persistence-failed"}, 503)
            return cors_response({"error": err}, 400)
        with dl_manager._lock:
            queued = dl_manager.downloads.get(dl_id)
            status_value = queued.status if queued else 'pending'
        return cors_response({
            "id": dl_id,
            "status": status_value,
            "capacity": dl_manager.capacity(),
        })

    @api.route('/status/<dl_id>')
    def status(dl_id):
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        with dl_manager._lock:
            dl = dl_manager.downloads.get(dl_id)
        if not dl:
            return cors_response({"error": "Download no longer exists in the active queue."}, 404)
        return cors_response(dl.to_dict())

    @api.route('/queue')
    def queue():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        return cors_response(dl_manager.queue_payload())

    @api.route('/queue/pause', methods=['POST'])
    def pause_queue():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        if not dl_manager.pause_intake():
            return cors_response({
                "error": "Could not save the paused queue state. Check disk space and permissions.",
                "code": "queue-persistence-failed",
            }, 503)
        return cors_response({"paused": True, "capacity": dl_manager.capacity()})

    @api.route('/queue/resume', methods=['POST'])
    def resume_queue():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        if not dl_manager.resume_intake():
            return cors_response({
                "error": "Could not save the resumed queue state. Check disk space and permissions.",
                "code": "queue-persistence-failed",
            }, 503)
        return cors_response({"paused": False, "capacity": dl_manager.capacity()})

    def _fresh_cookies_from_body():
        body = request.get_json(silent=True) or {}
        raw = body.get('cookies')
        if raw is None:
            return None, None
        if not isinstance(raw, list):
            return None, 'cookies must be a JSON array.'
        return raw[:200], None

    @api.route('/queue/<dl_id>/resume', methods=['POST'])
    def resume_queued_download(dl_id):
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        cookies, cookie_error = _fresh_cookies_from_body()
        if cookie_error:
            return cors_response({"error": cookie_error, "code": "invalid-cookies"}, 400)
        ok, err = dl_manager.resume_download(dl_id, cookies=cookies)
        if not ok:
            code = 'fresh-auth-required' if err and 'Fresh YouTube cookies' in err else 'queue-resume-rejected'
            status_code = 404 if err and 'no longer exists' in err else 409
            return cors_response({"error": err, "code": code}, status_code)
        return cors_response({"id": dl_id, "resumed": True, "capacity": dl_manager.capacity()})

    @api.route('/queue/<dl_id>/retry', methods=['POST'])
    def retry_queued_download(dl_id):
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        cookies, cookie_error = _fresh_cookies_from_body()
        if cookie_error:
            return cors_response({"error": cookie_error, "code": "invalid-cookies"}, 400)
        ok, err = dl_manager.retry(dl_id, cookies=cookies)
        if not ok:
            if err and 'queue is full' in err.lower():
                return cors_response({
                    "error": err,
                    "code": "queue-full",
                    "capacity": dl_manager.capacity(),
                    "remediation": (
                        "Cancel a pending item or wait for a running download to finish, "
                        "then retry."
                    ),
                }, 429)
            code = 'fresh-auth-required' if err and 'Fresh YouTube cookies' in err else 'retry-rejected'
            status_code = 404 if err and 'no longer exists' in err else 409
            return cors_response({"error": err, "code": code}, status_code)
        return cors_response({"id": dl_id, "retried": True, "capacity": dl_manager.capacity()})

    @api.route('/queue/<dl_id>/move', methods=['POST'])
    def move_queued_download(dl_id):
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        body = request.get_json(silent=True) or {}
        if 'position' not in body:
            return cors_response({"error": "position is required.", "code": "invalid-position"}, 400)
        ok, err = dl_manager.move_pending(dl_id, body.get('position'))
        if not ok:
            status_code = 400 if err and 'integer' in err else 409
            return cors_response({"error": err, "code": "queue-move-rejected"}, status_code)
        return cors_response({"id": dl_id, "moved": True, "queue": dl_manager.queue_payload()})

    @api.route('/history')
    def hist():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        h = history.load()
        limit = request.args.get('limit', type=int)
        if limit is not None:
            limit = clamp_int(limit, 50, 1, 500)
        if limit and len(h) > limit:
            h = h[-limit:]
        return cors_response({"history": h, "count": len(h)})

    @api.route('/config', methods=['GET'])
    def get_config():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        c = dict(config.data)
        c['videoFormats'] = ['mp4', 'mkv', 'webm']
        c['audioFormats'] = ['mp3', 'm4a', 'opus', 'flac', 'wav']
        c['qualities'] = ['best', '2160', '1440', '1080', '720', '480']
        # v1.2.2: expose camelCase aliases for the path keys so the extension
        # can use the conventional JS casing. Capital-case keys remain for
        # backward compatibility with older extension builds.
        c['downloadPath'] = c.get('DownloadPath', '')
        c['audioDownloadPath'] = c.get('AudioDownloadPath', '')
        return cors_response(c)

    @api.route('/pick-folder', methods=['POST'])
    def pick_folder():
        """v1.2.2: pop a native QFileDialog and return the selected path.

        The extension popup's "Change" button calls this so users don't
        have to manually type a Windows path. Blocks until the dialog is
        accepted or cancelled (up to 120 s); the dialog runs on the GUI
        thread via FolderPickerService.
        """
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        if _folder_picker_service is None:
            return cors_response({"error": "Folder picker is not available."}, 503)
        allowed, retry_after = pickfolder_rate_limiter.allow('pickfolder')
        if not allowed:
            return cors_response(
                {"error": "Too many folder-picker requests in a short period. Please wait a moment."},
                429,
                extra_headers={"Retry-After": str(int(retry_after) + 1)},
            )
        body = request.get_json(silent=True) or {}
        initial = clean_text(body.get('initial'), '', 1024)
        response_q = queue.Queue(maxsize=1)
        try:
            _folder_pick_q.put_nowait({'initial': initial, 'response': response_q})
        except queue.Full:
            return cors_response({"error": "A folder picker is already open. Close it before requesting another."}, 409)
        try:
            result = response_q.get(timeout=120)
        except queue.Empty:
            return cors_response({"error": "Folder picker timed out — was the dialog left open?"}, 504)
        if isinstance(result, dict) and result.get('path'):
            roots = allowed_output_roots(config)
            inside = False
            try:
                rp = Path(result['path']).resolve()
                for root in roots:
                    try:
                        rp.relative_to(root)
                        inside = True
                        break
                    except ValueError:
                        continue
            except Exception:
                inside = True  # advisory only; /download still enforces — fail open on the hint
            result['outsideAllowlist'] = not inside
        return cors_response(result)

    @api.route('/cancel/<dl_id>', methods=['DELETE'])
    def cancel(dl_id):
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        with dl_manager._lock:
            exists = dl_id in dl_manager.downloads
        if dl_manager.cancel(dl_id):
            return cors_response({"id": dl_id, "cancelled": True})
        if exists:
            return cors_response({"error": "Download is already finished and cannot be cancelled."}, 409)
        return cors_response({"error": "Download no longer exists in the active queue."}, 404)

    @api.route('/update-ytdlp', methods=['POST'])
    def update_ytdlp():
        """v4.47.0 NF18: on-demand ``yt-dlp -U`` so a user can fix a
        broken-on-YouTube yt-dlp build without waiting up to 24 h for
        the auto-update throttle (NF26).

        Gates:
        - 401 when the per-install token doesn't match.
        - 409 when at least one download is in flight; the user-visible
          error explains the reason. yt-dlp's ``-U`` atomically replaces
          the binary, and on Windows an in-flight
          ``subprocess.Popen([YTDLP_PATH, ...])`` can race the replace
          with a file-in-use error.
        - 503 when yt-dlp.exe is not present.

        Returns the structured result from ``_run_ytdlp_self_update``
        so the popup can show ``version_before -> version_after`` and
        the exit code on failure.
        """
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        if not YTDLP_PATH.exists():
            return cors_response({"error": "yt-dlp is not installed yet — finish the Astra Downloader setup first.", "ok": False}, 503)
        in_flight = dl_manager.active_count()
        if in_flight > 0:
            return cors_response(
                {
                    "error": f"{in_flight} download(s) in flight — wait for them to finish, then try again. "
                             f"yt-dlp -U atomically replaces the binary and would race the active subprocess.",
                    "ok": False,
                    "inFlight": in_flight,
                },
                409,
            )
        result = _run_ytdlp_self_update(config, source_tag='manual')
        # 200 with ok:true on success; 500 with ok:false otherwise so the
        # popup can branch on HTTP status as well as the body field.
        status = 200 if result.get('ok') else 500
        return cors_response(result, status)

    @api.route('/update', methods=['POST'])
    def update_companion():
        """v4.47.0 NF6: update the Astra Downloader companion itself.

        This is separate from /update-ytdlp. It compares the running
        APP_VERSION to the canonical repo source, downloads the latest
        AstraDownloader.exe into the managed install directory, schedules an
        after-exit atomic replace, then exits so the helper can relaunch the
        new companion. Active downloads block the update because a restart
        would terminate their yt-dlp subprocesses.
        """
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        in_flight = dl_manager.active_count()
        if in_flight > 0:
            return cors_response(
                {
                    "error": f"{in_flight} download(s) in flight — wait for them to finish, then try again. "
                             f"The companion update must restart Astra Downloader after atomically replacing the executable.",
                    "ok": False,
                    "inFlight": in_flight,
                },
                409,
            )
        result = _run_companion_self_update(restart=True)
        if result.get('ok'):
            return cors_response(result, 200)
        status = 502 if result.get('error_code') == 'version-check-failed' else 500
        return cors_response(result, status)

    @api.route('/shutdown')
    def shutdown():
        if not check_auth():
            return cors_response({"error": "Astra Downloader rejected the request. Refresh the private token in Astra Deck."}, 401)
        # Waitress has no in-handler shutdown hook (and werkzeug's was removed
        # in 2.1). The GUI's _stop_server() is the authoritative kill path;
        # this endpoint exists so the extension can *request* teardown and
        # know whether the app-level path must be used instead.
        func = request.environ.get('werkzeug.server.shutdown')
        if func:
            func()
            return cors_response({"status": "shutting_down"})
        return cors_response({"status": "stop_from_app_required"}, 202)

    return api

# ══════════════════════════════════════════════════════════════
# FIRST-RUN SETUP
# ══════════════════════════════════════════════════════════════
class SetupWorker(QThread):
    log = pyqtSignal(str)
    progress = pyqtSignal(int)
    finished_ok = pyqtSignal()
    finished_err = pyqtSignal(str)

    def __init__(self, parent=None, force_ffmpeg=False, auto_update_ytdlp=True,
                 configured_runtime='auto'):
        super().__init__(parent)
        self.force_ffmpeg = bool(force_ffmpeg)
        self.auto_update_ytdlp = bool(auto_update_ytdlp)
        self.configured_runtime = configured_runtime

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
        expected = fetch_expected_sha256(sidecar_url, target_asset=asset_name)
        if not expected:
            message = (
                f"{label} SHA-256 sidecar missing or malformed; "
                "refusing to trust the downloaded helper."
            )
            self.log.emit(f"  {message}")
            write_persistent_log(f"{message} ({sidecar_url})")
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
            raise RuntimeError(message)
        try:
            verify_file_sha256(path, expected)
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
            INSTALL_DIR.mkdir(parents=True, exist_ok=True)
            dl_path = Path(DEFAULT_CONFIG["DownloadPath"])
            dl_path.mkdir(parents=True, exist_ok=True)

            # yt-dlp (10-30% of overall progress)
            if not YTDLP_PATH.exists():
                self.log.emit("Downloading yt-dlp...")
                self.progress.emit(10)
                download_file_atomic(
                    YTDLP_URL, YTDLP_PATH, timeout=60, chunk_size=65536,
                    progress_cb=self._ranged_progress_cb(10, 28),
                )
                # Verify against the release SHA-256 sidecar before trusting
                # the binary — it'll be executed with user privileges for
                # every download from now on.
                self._verify_required_checksum(
                    YTDLP_PATH, YTDLP_SHA256_URL,
                    asset_name=YTDLP_SHA256_ASSET, label="yt-dlp",
                )
                self.log.emit("  Done")
            else:
                self.log.emit("yt-dlp already installed")
            self.progress.emit(30)

            # ffmpeg (35-58% — the heaviest step, now byte-level progress)
            if self.force_ffmpeg or not FFMPEG_PATH.exists():
                self.log.emit("Downloading ffmpeg (this may take a moment)...")
                self.progress.emit(35)
                import zipfile
                tmp_zip = INSTALL_DIR / f".ffmpeg.{uuid.uuid4().hex}.zip"
                zip_progress_cb = self._ranged_progress_cb(35, 55)
                try:
                    with http_requests.get(FFMPEG_URL, stream=True, timeout=120) as r:
                        r.raise_for_status()
                        total = None
                        try:
                            total = int(r.headers.get('content-length', '') or 0) or None
                        except (TypeError, ValueError):
                            total = None
                        # Audit fix: same byte ceiling as download_file_atomic —
                        # a misbehaving CDN must not fill the disk before the
                        # SHA-256 sidecar check. Breach raises; the outer
                        # finally removes the partial tmp_zip.
                        if total and total > HELPER_DOWNLOAD_MAX_BYTES:
                            raise RuntimeError(
                                f"ffmpeg archive too large: server advertises {total} "
                                f"bytes (limit {HELPER_DOWNLOAD_MAX_BYTES})"
                            )
                        downloaded = 0
                        last_cb = 0.0
                        with open(tmp_zip, 'wb') as data:
                            for chunk in r.iter_content(65536):
                                if chunk:
                                    data.write(chunk)
                                    downloaded += len(chunk)
                                    if downloaded > HELPER_DOWNLOAD_MAX_BYTES:
                                        raise RuntimeError(
                                            f"ffmpeg archive exceeded the "
                                            f"{HELPER_DOWNLOAD_MAX_BYTES} byte limit; aborted"
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
                            tmp_zip, FFMPEG_SHA256_URL, label="ffmpeg",
                        )
                    except RuntimeError:
                        # Verification failed — cleanup handled by finally + raise
                        raise
                    self.progress.emit(56)
                    found = False
                    tmp_ffmpeg = FFMPEG_PATH.with_name(f".{FFMPEG_PATH.name}.{uuid.uuid4().hex}.download")
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
                                    os.replace(tmp_ffmpeg, FFMPEG_PATH)
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
            ytdlp_ver = get_ytdlp_version()
            if ytdlp_needs_external_runtime(ytdlp_ver or ''):
                runtime = probe_javascript_runtime(
                    force=True, configured_runtime=self.configured_runtime
                )
                if not runtime.get('ejsReady') and runtime.get('canProvisionDeno'):
                    self.log.emit("Downloading Deno runtime...")
                    result = provision_deno()
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
            if not ICON_PATH.exists():
                self.log.emit("Downloading icon...")
                try:
                    download_file_atomic(ICON_URL, ICON_PATH, timeout=10, chunk_size=65536)
                except Exception as e:
                    # reason: icon is cosmetic; a failure here shouldn't
                    # block the rest of setup. Log so it's debuggable.
                    write_persistent_log(f"Icon download skipped: {e}")
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
            _set_integrations_stamp()

            # Auto-update yt-dlp (throttled: only if we don't have a recent stamp)
            if self.auto_update_ytdlp:
                self.log.emit("Updating yt-dlp...")
                try:
                    spawn_ytdlp([str(YTDLP_PATH), '-U'],
                                     creationflags=CREATE_NO_WINDOW)
                except Exception as e:
                    write_persistent_log(f"yt-dlp -U launch failed during setup: {e}")

            self.progress.emit(100)
            self.log.emit("\nSetup complete!")
            self.finished_ok.emit()

        except Exception as e:
            log_crash("Setup worker")
            self.finished_err.emit(str(e))

    def _create_shortcut(self):
        target, base_args = launch_command_parts(prefer_installed=True)
        register_desktop_shortcut(target, base_args)

    def _register_startup(self):
        target, base_args = launch_command_parts(prefer_installed=True)
        register_startup_task(target, base_args)

    def _register_protocols(self):
        target, base_args = launch_command_parts(prefer_installed=True)
        register_protocol_handlers(target, base_args)

    def _register_uninstall(self):
        target, base_args = launch_command_parts(prefer_installed=True)
        register_uninstall_entry(target, base_args)

# ══════════════════════════════════════════════════════════════
# UNINSTALL
# ══════════════════════════════════════════════════════════════
def run_uninstall():
    write_persistent_log("Uninstall requested; removing Astra Downloader components.")

    stop_running_companion_for_uninstall()

    # Remove scheduled task
    subprocess.run(['schtasks', '/Delete', '/TN', 'AstraDownloader', '/F'],
                   capture_output=True, creationflags=CREATE_NO_WINDOW)

    # Remove registry entries
    try:
        import winreg
        for path in [
            'Software\\Classes\\ytdl',
            'Software\\Classes\\mediadl',
            'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AstraDownloader',
            f'Software\\Google\\Chrome\\NativeMessagingHosts\\{NATIVE_HOST_NAME}',
            f'Software\\Mozilla\\NativeMessagingHosts\\{NATIVE_HOST_NAME}',
        ]:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path + '\\shell\\open\\command')
            except Exception:
                pass
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path + '\\shell\\open')
            except Exception:
                pass
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path + '\\shell')
            except Exception:
                pass
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
            except Exception:
                pass
    except Exception:
        pass

    if NATIVE_HOST_DIR.exists():
        shutil.rmtree(NATIVE_HOST_DIR, ignore_errors=True)

    # Remove desktop shortcut
    lnk = Path.home() / "Desktop" / "Astra Downloader.lnk"
    if lnk.exists():
        lnk.unlink()

    # Remove install directory
    if INSTALL_DIR.exists():
        try:
            shutil.rmtree(INSTALL_DIR, ignore_errors=False)
        except Exception:
            write_persistent_log("Install directory will be removed after exit.")
            if is_frozen_app():
                spawn_delayed_install_dir_removal(INSTALL_DIR)

    message = "Astra Downloader has been uninstalled. Downloaded videos were not removed."
    write_persistent_log(message)
    print(message)
    sys.exit(0)


def stop_running_companion_for_uninstall():
    """Stop only Astra Downloader and its child process tree before removal."""
    graceful = send_instance_command('shutdown', attempts=3, delay=0.2)
    if graceful:
        # Give closeEvent time to stop the local API and cancel owned jobs.
        time.sleep(0.75)
    if sys.platform == 'win32':
        current_pid = str(os.getpid())
        subprocess.run(
            ['taskkill', '/F', '/T', '/IM', 'AstraDownloader.exe', '/FI', f'PID ne {current_pid}'],
            capture_output=True,
            creationflags=CREATE_NO_WINDOW,
        )
    return graceful


def is_safe_install_dir_for_removal(path):
    """Return True only for the app-owned install directory shape."""
    try:
        resolved = Path(path).resolve()
    except Exception:
        return False
    if not resolved.is_absolute():
        return False
    if resolved.name != "AstraDownloader":
        return False
    # Avoid ever treating a drive root / user profile root as removable.
    return len(resolved.parts) >= 3


def spawn_delayed_install_dir_removal(path=INSTALL_DIR):
    """Remove the frozen app directory after this process exits."""
    if not is_safe_install_dir_for_removal(path):
        write_persistent_log(f"Refused delayed removal for unexpected install dir: {path}")
        return False
    target = str(Path(path).resolve())
    if sys.platform == 'win32':
        script = "Start-Sleep -Seconds 2; Remove-Item -LiteralPath $args[0] -Recurse -Force"
        subprocess.Popen(
            ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script, target],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
        )
    else:
        subprocess.Popen(
            [sys.executable, '-c', 'import shutil,sys,time; time.sleep(2); shutil.rmtree(sys.argv[1], ignore_errors=True)', target],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return True

# ══════════════════════════════════════════════════════════════
# GUI WIDGETS
# ══════════════════════════════════════════════════════════════
def repolish(widget):
    widget.style().unpolish(widget)
    widget.style().polish(widget)
    widget.update()


def make_label(text, class_name=None, word_wrap=False):
    lbl = QLabel(text)
    if class_name:
        lbl.setProperty("class", class_name)
    lbl.setWordWrap(word_wrap)
    return lbl


def make_section_label(text):
    return make_label(text, "section")


def make_divider():
    divider = QFrame()
    divider.setProperty("class", "divider")
    return divider


def make_card(class_name="card"):
    f = QFrame()
    f.setProperty("class", class_name)
    return f


def make_status_badge(text, tone="neutral"):
    badge = QLabel(text)
    badge.setProperty("class", "badge")
    badge.setProperty("tone", tone)
    badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
    badge.setMinimumHeight(22)
    return badge


def download_status_tone(status):
    if status in ("complete",):
        return "success"
    if status in ("failed", "cancelled"):
        return "danger"
    if status in ("merging", "extracting", "queued", "paused", "needs-auth"):
        return "warning"
    if status in ("downloading",):
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
    mins, secs = divmod(seconds, 60)
    hours, mins = divmod(mins, 60)
    if hours:
        return f"{hours}h {mins}m"
    if mins:
        return f"{mins}m {secs}s"
    return f"{secs}s"


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
    f = QFrame()
    f.setProperty("class", "stat")
    layout = QVBoxLayout(f)
    layout.setContentsMargins(16, 14, 16, 14)
    layout.setSpacing(4)
    lbl = make_label(label_text, "section")
    val = QLabel(value_text)
    val.setAlignment(Qt.AlignmentFlag.AlignLeft)
    val.setStyleSheet("font-size: 25px; font-weight: 750; color: #f8fafc;")
    val.setObjectName(f"stat_{label_text.lower()}")
    layout.addWidget(lbl)
    layout.addWidget(val)
    if hint_text:
        hint = make_label(hint_text, "fieldHint")
        layout.addWidget(hint)
    return f, val


class ReadinessProbe(QObject):
    """Collect toolchain health away from the GUI thread."""

    completed = pyqtSignal(dict)

    def __init__(self, configured_runtime='auto'):
        super().__init__()
        self.configured_runtime = configured_runtime

    def run(self):
        try:
            runtime = probe_javascript_runtime(configured_runtime=self.configured_runtime)
            provider = probe_po_token_provider()
            payload = {
                "ytDlp": get_ytdlp_version() or "",
                "ffmpeg": get_ffmpeg_version() or "",
                "runtime": runtime or {},
                "deno": runtime or {},
                "provider": provider or {},
            }
        except Exception as exc:
            write_persistent_log(f"Readiness probe failed: {exc}")
            payload = {"error": str(exc)}
        self.completed.emit(payload)

# ══════════════════════════════════════════════════════════════
# MAIN WINDOW
# ══════════════════════════════════════════════════════════════
class MainWindow(QMainWindow):
    log_message = pyqtSignal(str)
    instance_command = pyqtSignal(str)

    def __init__(self, config, dl_manager, history, start_minimized=False):
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

        self.setWindowTitle(APP_NAME)
        self.setMinimumSize(900, 620)
        self.resize(1120, 760)

        # Icon
        display_icon_path = ICON_PATH
        source_icon_path = Path(__file__).resolve().parents[1] / "AstraDownloader.ico"
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
        ver_lbl = make_label(f"LOCAL COMPANION  ·  v{APP_VERSION}", "muted")
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
        if ICON_PATH.exists():
            self.tray.setIcon(QIcon(str(ICON_PATH)))
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
        self.tray.setToolTip(f"{APP_NAME} - Running")
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
        self.readiness_worker = ReadinessProbe(self.config.get('JavaScriptRuntime', 'auto'))
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
        self.dash_endpoint = make_label(f"http://127.0.0.1:{self.config.get('ServerPort', SERVER_PORT)}", "secondary")
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
        self._stat_frame_port, self.stat_port = make_stat("Port", str(self.config.get("ServerPort", SERVER_PORT)), "Local API")
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
        self.cfg_port.setValue(clamp_int(self.config.get("ServerPort", SERVER_PORT), SERVER_PORT, 1024, 65535))
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
        self.cfg_fragments.setValue(clamp_int(self.config.get("ConcurrentFragments", 4), 4, 1, 32))
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
        btn_check_updates = self._make_tool_button(
            "Check yt-dlp Update", QStyle.StandardPixmap.SP_BrowserReload,
        )
        btn_check_updates.setToolTip("Force an immediate yt-dlp self-update and refresh the version readout.")
        btn_check_updates.clicked.connect(self._force_ytdlp_update)
        tools_row.addWidget(btn_check_updates)
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
        if not YTDLP_PATH.exists() or not FFMPEG_PATH.exists():
            self._append_log("Required tools are missing. Starting setup...")
            self._run_setup()
            return

        configured_port = clamp_int(self.config.get("ServerPort", SERVER_PORT), SERVER_PORT, 1024, 65535)
        api = create_api(self.config, self.dl_manager, self.history_mgr)

        # Port discovery: try configured port first, then fall back to well-known
        # alternatives. Fixes systems where Windows/Hyper-V has blocked the default
        # (WinError 10013) or another process holds it (WinError 10048).
        fallback_ports = [configured_port] + [p for p in PORT_FALLBACKS if p != configured_port]
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
            self.server_obj = _build_wsgi_server(chosen_port, api)
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
        maybe_auto_update_ytdlp(self.config, self.dl_manager.active_count)

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
            self.tray.setToolTip(f"{APP_NAME} - Running")
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
            self.tray.setToolTip(f"{APP_NAME} - Stopped")
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
        if not recent and dl.status in DOWNLOAD_PENDING_STATES:
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
        elif not recent and dl.status in DOWNLOAD_RUNNING_STATES:
            btn_cancel = self._make_tool_button("Cancel", QStyle.StandardPixmap.SP_DialogCancelButton, "ghost")
            btn_cancel.clicked.connect(lambda checked=False, dl_id=dl.id: self.dl_manager.cancel(dl_id))
            top.addWidget(btn_cancel)
        elif recent and dl.status == "failed" and dl.error_code in DOWNLOAD_RETRYABLE_ERROR_CODES:
            btn_retry = self._make_tool_button("Retry", QStyle.StandardPixmap.SP_BrowserReload, "ghost")
            btn_retry.clicked.connect(lambda checked=False, item=dl: self._retry_download(item))
            top.addWidget(btn_retry)
        elif recent and dl.status == "complete" and dl.filename:
            btn_show = self._make_tool_button("Show", QStyle.StandardPixmap.SP_DirOpenIcon, "ghost")
            btn_show.clicked.connect(lambda checked=False, path=dl.filename: self._show_download_location(path))
            top.addWidget(btn_show)
        card_l.addLayout(top)

        if dl.status in DOWNLOAD_RUNNING_STATES:
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
        active = [d for d in downloads if d.status in DOWNLOAD_RUNNING_STATES]
        pending = [d for d in downloads if d.status in DOWNLOAD_PENDING_STATES]
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
        port = clamp_int(self.config.get("ServerPort", SERVER_PORT), SERVER_PORT, 1024, 65535)
        self.dash_endpoint.setText(f"http://127.0.0.1:{port}")
        self.stat_port.setText(str(port))

    # ── Tools: yt-dlp / ffmpeg maintenance (v1.2.0) ──
    def _tools_status_text(self):
        ytv = get_ytdlp_version() or "not installed"
        ffv = get_ffmpeg_version() or "not installed"
        return f"yt-dlp {ytv}    •    ffmpeg {ffv}"

    def _refresh_tools_status(self):
        try:
            self.tools_status.setText(self._tools_status_text())
        except Exception:
            pass

    def _force_ytdlp_update(self):
        if not YTDLP_PATH.exists():
            self._append_log("yt-dlp is not installed yet — run setup first.")
            return
        self._append_log("Forcing yt-dlp self-update…")

        def run():
            try:
                result = _run_ytdlp_self_update(self.config, source_tag='gui')
                if result.get('ok'):
                    self.log_message.emit(
                        f"yt-dlp active {result.get('version_after') or '?'}; "
                        f"rollback {result.get('rollback_version') or 'not retained yet'}."
                    )
                else:
                    recovery = (
                        f" Restored {result.get('version_after')}."
                        if result.get('rolled_back') else ''
                    )
                    self.log_message.emit(
                        f"yt-dlp update failed: {result.get('error') or 'unknown error'}.{recovery}"
                    )
            except Exception as e:
                self.log_message.emit(f"yt-dlp update error: {e}")
            finally:
                # Marshal the UI refresh back to the Qt thread.
                QTimer.singleShot(0, self._refresh_tools_status)

        threading.Thread(target=run, daemon=True).start()

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
        # SetupWorker extracts into a unique temporary file and only calls
        # os.replace after the archive checksum and executable size checks pass.
        # `force_ffmpeg` bypasses the ordinary already-installed short circuit
        # without deleting the live binary first.
        self._run_setup(force_ffmpeg=True)

    def _save_settings(self):
        for field in (self.cfg_dl_path, self.cfg_audio_path, self.cfg_sublangs,
                      self.cfg_ratelimit, self.cfg_proxy):
            self._set_input_error(field, False)

        old_port = clamp_int(self.config.get("ServerPort", SERVER_PORT), SERVER_PORT, 1024, 65535)
        old_token = self.config.get("ServerToken", "")
        new_port = self.cfg_port.value()
        new_token = self.cfg_token.text().strip()
        dl_path = self.cfg_dl_path.text().strip()
        audio_path = self.cfg_audio_path.text().strip()
        sublangs = normalize_sublangs(self.cfg_sublangs.text())
        rate = normalize_rate_limit(self.cfg_ratelimit.text())
        proxy = self.cfg_proxy.text().strip()
        has_error = False

        dl_path, dl_path_err = normalize_output_dir(dl_path, DEFAULT_CONFIG["DownloadPath"])
        audio_path, audio_path_err = normalize_output_dir(audio_path, dl_path) if audio_path else ("", None)

        if dl_path_err:
            self._set_input_error(self.cfg_dl_path, True)
            has_error = True
        if audio_path_err:
            self._set_input_error(self.cfg_audio_path, True)
            has_error = True
        if not sublangs:
            self._set_input_error(self.cfg_sublangs, True)
            has_error = True
        if self.cfg_ratelimit.text().strip() and not rate:
            self._set_input_error(self.cfg_ratelimit, True)
            has_error = True
        if proxy and not normalize_proxy(proxy):
            self._set_input_error(self.cfg_proxy, True)
            has_error = True
        else:
            proxy = normalize_proxy(proxy)
        if not new_token:
            self._show_settings_status("Token cannot be empty.", "danger")
            has_error = True

        if has_error:
            self._show_settings_status("Check the highlighted fields before saving.", "danger")
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

        reset_deno_runtime_cache()
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
        QApplication.clipboard().setText(self.cfg_token.text())
        self._show_settings_status("Token copied to clipboard.", "success")
        QTimer.singleShot(2200, lambda: self._show_settings_status(""))

    def _copy_diagnostics(self):
        payload = build_diagnostics_bundle(
            server_running=self.server_running,
            endpoint=self.dash_endpoint.text(),
            active_downloads=self.dl_manager.active_count(),
            completed_downloads=self.dl_manager.total_completed,
            recent_logs=get_recent_log_entries(),
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

    def _regenerate_token(self):
        self.cfg_token.setText(uuid.uuid4().hex)
        self._append_log("New server token generated. Save settings to apply it.")
        self._show_settings_status("New token ready. Save settings to apply it.", "warning")

    def _open_folder(self):
        p = self.config.get("DownloadPath", "")
        try:
            target = Path(p) if p else INSTALL_DIR
            if not target.exists():
                target.mkdir(parents=True, exist_ok=True)
            os.startfile(str(target))
        except Exception as e:
            self._append_log(f"Could not open folder: {e}")

    def _append_log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_text.append(f"{ts} {msg}")
        write_persistent_log(msg)
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
                    server.bind((INSTANCE_CONTROL_HOST, INSTANCE_CONTROL_PORT))
                    server.listen(4)
                    server.settimeout(0.5)
                    write_persistent_log(
                        f"Instance command listener started on {INSTANCE_CONTROL_HOST}:{INSTANCE_CONTROL_PORT}."
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
            with socket.create_connection((INSTANCE_CONTROL_HOST, INSTANCE_CONTROL_PORT), timeout=0.2):
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
                    APP_NAME,
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
        self.setup_worker = SetupWorker(
            force_ffmpeg=force_ffmpeg,
            auto_update_ytdlp=self.config.get("AutoUpdateYtDlp", True),
            configured_runtime=self.config.get("JavaScriptRuntime", "auto"),
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
            with _VERSION_CACHE_LOCK:
                _version_cache['ffmpeg'] = {'value': None, 'checked_at': 0.0}
            with _FFMPEG_CAPABILITIES_LOCK:
                _ffmpeg_capabilities_cache['value'] = None
                _ffmpeg_capabilities_cache['checked_at'] = 0.0
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

# ══════════════════════════════════════════════════════════════
# SINGLE INSTANCE GUARD
# ══════════════════════════════════════════════════════════════
INSTANCE_ALREADY_RUNNING = object()


def check_single_instance(startup_command=''):
    """Prevent multiple GUI instances without relying on a TCP port."""
    if sys.platform == 'win32':
        try:
            import ctypes
            from ctypes import wintypes
            kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel32.CreateMutexW.argtypes = (wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR)
            kernel32.CreateMutexW.restype = wintypes.HANDLE
            kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
            handle = kernel32.CreateMutexW(None, False, "Local\\AstraDownloader.SingleInstance")
            if not handle:
                error = ctypes.get_last_error()
                raise OSError(error, f"single-instance mutex creation failed ({error})")
            if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
                kernel32.CloseHandle(handle)
                send_instance_command(startup_command or 'show')
                return INSTANCE_ALREADY_RUNNING
            return handle
        except Exception as e:
            write_persistent_log(f"Mutex single-instance guard unavailable: {e}")
            raise

    # Cross-platform fallback for source runs outside Windows.
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', INSTANCE_LOCK_PORT))
        s.listen(1)
        return s  # Keep alive
    except OSError as exc:
        try:
            s.close()
        except Exception:
            pass
        if send_instance_command(startup_command or 'show', attempts=1):
            return INSTANCE_ALREADY_RUNNING
        raise OSError(f"single-instance lock is occupied and the existing app did not respond: {exc}") from exc

# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
# ──────────────────────────────────────────────────────────────────────────
# Native-messaging token bootstrap (browser-pinned channel)
#
# Native messaging is the primary token bootstrap path: the host manifest's
# allowed_origins pins exactly which extension IDs may launch this process, and
# the browser delivers the message over a private stdio pipe no other process
# can read. The old HTTP /health echo remains behind an explicit compatibility
# switch plus extension-origin allowlist for older local installs.
#
# These functions are the testable core of that design.
# ──────────────────────────────────────────────────────────────────────────

NATIVE_HOST_NAME = "com.astra.deck.downloader"
NATIVE_MESSAGE_MAX_BYTES = 1024 * 1024  # Chrome caps host->browser at 1 MB


def read_native_message(stream):
    """Read one Chrome native message: 4-byte little-endian length + UTF-8 JSON.

    Returns the decoded object, or None at clean EOF (browser closed the pipe).
    """
    raw_len = stream.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    msg_len = struct.unpack('<I', raw_len)[0]
    if msg_len <= 0 or msg_len > NATIVE_MESSAGE_MAX_BYTES:
        raise ValueError("native message length out of range: %d" % msg_len)
    body = stream.read(msg_len)
    if len(body) < msg_len:
        raise ValueError("truncated native message")
    return json.loads(body.decode('utf-8'))


def write_native_message(stream, obj):
    """Write one Chrome native message (4-byte LE length prefix + UTF-8 JSON)."""
    body = json.dumps(obj, separators=(',', ':')).encode('utf-8')
    stream.write(struct.pack('<I', len(body)))
    stream.write(body)
    stream.flush()


def handle_native_bootstrap_request(request, token):
    """Pure handler for a parsed bootstrap request. No I/O — easy to unit test."""
    if not isinstance(request, dict):
        return {"ok": False, "error": "invalid request"}
    req_type = request.get("type")
    if req_type == "ping":
        return {"ok": True, "service": SERVICE_ID, "api": SERVICE_API_VERSION}
    if req_type == "get-token":
        if not token:
            return {"ok": False, "error": "no token configured"}
        return {
            "ok": True,
            "service": SERVICE_ID,
            "api": SERVICE_API_VERSION,
            "token": token,
        }
    return {"ok": False, "error": "unsupported request type"}


def run_native_messaging_host(token, stdin=None, stdout=None):
    """Serve bootstrap requests over stdio until the browser closes the pipe."""
    stdin = stdin if stdin is not None else getattr(sys.stdin, 'buffer', sys.stdin)
    stdout = stdout if stdout is not None else getattr(sys.stdout, 'buffer', sys.stdout)
    while True:
        request = read_native_message(stdin)
        if request is None:
            return
        write_native_message(stdout, handle_native_bootstrap_request(request, token))


def argv_requests_native_host(argv):
    """True when the browser launched us as a native-messaging host.

    Chrome/Firefox pass the calling extension's origin as a positional argv
    (chrome-extension://<id>/ or moz-extension://<uuid>/). Normal launches and
    the test suite never carry such an argument, so this gate cannot misfire.
    """
    return any(
        isinstance(a, str) and (a.startswith("chrome-extension://") or a.startswith("moz-extension://"))
        for a in (argv or [])
    )


def build_native_host_manifest(exe_path, extension_ids, browser="chrome"):
    """Build a browser native-messaging host manifest.

    Chrome uses `allowed_origins` with chrome-extension:// IDs. Firefox uses
    `allowed_extensions` with Gecko IDs. Both are the browser-pinned security
    boundary HTTP /health lacks.
    """
    ids = [e for e in (extension_ids or []) if isinstance(e, str) and e]
    manifest = {
        "name": NATIVE_HOST_NAME,
        "description": "Astra Downloader token bootstrap",
        "path": str(exe_path),
        "type": "stdio",
    }
    if browser == "firefox":
        manifest["allowed_extensions"] = ids
    else:
        manifest["allowed_origins"] = ["chrome-extension://%s/" % eid for eid in ids]
    return manifest


def companion_probe_exit_code(argv):
    """Return a non-GUI probe exit code, or None for a normal application run."""
    args = list(argv or [])
    if '--version' in args:
        return 0
    if '--update-health-check' not in args:
        return None
    index = args.index('--update-health-check')
    expected = args[index + 1].strip() if index + 1 < len(args) else ''
    if not expected or not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?', expected):
        return 2
    return 0 if hmac.compare_digest(expected, APP_VERSION) else 3


def main():
    probe_exit = companion_probe_exit_code(sys.argv[1:])
    if probe_exit is not None:
        if probe_exit == 0:
            output = getattr(sys, 'stdout', None)
            if output is not None:
                output.write(APP_VERSION + '\n')
                output.flush()
            return
        raise SystemExit(probe_exit)

    # Native-messaging host mode: the browser launches us with the extension
    # origin as an argv. Serve the token bootstrap over the private stdio pipe
    # and exit — before any GUI / single-instance / Flask logic.
    if argv_requests_native_host(sys.argv[1:]):
        try:
            run_native_messaging_host(Config().get("ServerToken"))
        except Exception as exc:  # noqa: BLE001 - host must never crash loudly
            write_persistent_log("native messaging host error: %s" % exc)
        return

    # Handle --uninstall flag
    if '--uninstall' in sys.argv:
        run_uninstall()
        return

    startup_command = startup_command_from_argv()
    start_minimized = '-Background' in sys.argv or '--background' in sys.argv or startup_command == 'start'
    log_update_recovery_status()

    if is_frozen_app():
        ensure_system_integrations(prefer_installed=True)

    # A second launch delegates to the healthy process and exits. Never kill a
    # live companion here: it may own active yt-dlp/ffmpeg jobs.
    try:
        lock = check_single_instance(startup_command)
    except Exception as exc:
        write_persistent_log(f"Could not establish the single-instance guard: {exc}")
        return
    if lock is INSTANCE_ALREADY_RUNNING:
        write_persistent_log("Existing Astra Downloader instance accepted the launch request.")
        return

    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(APP_VERSION)
    app.setFont(QFont("Segoe UI", 9))
    app.setStyleSheet(STYLESHEET)
    if ICON_PATH.exists():
        app.setWindowIcon(QIcon(str(ICON_PATH)))

    # Init
    config = Config()
    history = History()
    dl_manager = DownloadManager(config, history, queue_path=DOWNLOAD_QUEUE_PATH)

    # v1.2.2: GUI-thread folder picker bridge for /pick-folder requests.
    # Module-scoped reference keeps the QTimer alive for the app lifetime.
    global _folder_picker_service
    _folder_picker_service = FolderPickerService()

    # v1.3.0: archive feature is gone — sweep the leftover archive.txt
    # so it isn't visible in INSTALL_DIR after the upgrade.
    try:
        if ARCHIVE_PATH.exists():
            ARCHIVE_PATH.unlink()
    except OSError:
        pass

    start_min = start_minimized or config.get("StartMinimized", False)
    window = MainWindow(config, dl_manager, history, start_minimized=start_min)

    # First-run check
    needs_setup = not YTDLP_PATH.exists() or not FFMPEG_PATH.exists()
    if needs_setup:
        window.show()
        window._run_setup()
    else:
        if not start_min:
            window.show()
        window._start_server()

    sys.exit(app.exec())

if __name__ == '__main__':
    import multiprocessing
    multiprocessing.freeze_support()
    try:
        main()
    except Exception:
        log_crash("Fatal startup error")
        raise
