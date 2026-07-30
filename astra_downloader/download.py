"""Import-safe download domain model and policy boundary."""

import os
import json
import math
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver


__all__ = (
    "Download", "DownloadManager", "DownloadManagerCore", "build_video_format_args",
    "terminate_process_tree", "is_playlist_url", "write_cookies_netscape",
    "cleanup_stale_cookie_jars", "DOWNLOAD_ACTIVE_STATES",
    "DOWNLOAD_RUNNING_STATES", "DOWNLOAD_PENDING_STATES",
    "DOWNLOAD_TERMINAL_STATES", "DOWNLOAD_RETRYABLE_ERROR_CODES",
    "DOWNLOAD_QUEUE_PATH", "MAX_CONCURRENT", "MAX_QUEUED_TOTAL",
    "DOWNLOAD_STALL_TIMEOUT_SECONDS", "DOWNLOAD_WATCHDOG_POLL_SECONDS",
    "download_error_payload", "classify_download_failure",
    "apply_download_failure_classification", "DOWNLOAD_FAILURE_RECOVERY",
    "summarize_ytdlp_formats",
    "ALLOWED_COOKIE_DOMAINS", "build_subprocess_env",
    "DownloadQueueStore", "DOWNLOAD_QUEUE_SCHEMA_VERSION",
)

MAX_CONCURRENT = 3
MAX_QUEUED_TOTAL = 200
DOWNLOAD_STALL_TIMEOUT_SECONDS = 1800
DOWNLOAD_WATCHDOG_POLL_SECONDS = 15
DOWNLOAD_QUEUE_SCHEMA_VERSION = 1
DOWNLOAD_RUNNING_STATES = {'queued', 'downloading', 'merging', 'extracting', 'trimming'}
DOWNLOAD_PENDING_STATES = {'pending', 'paused', 'needs-auth'}
DOWNLOAD_ACTIVE_STATES = DOWNLOAD_RUNNING_STATES | DOWNLOAD_PENDING_STATES
DOWNLOAD_TERMINAL_STATES = {'complete', 'failed', 'cancelled'}
DOWNLOAD_RETRYABLE_ERROR_CODES = {
    'network-unreachable',
    'po-provider-stale',
    'po-token-required',
    'worker-start-failed',
}

DOWNLOAD_FAILURE_RECOVERY = {
    'po-token-required': {
        'error': (
            'YouTube requires a PO token for this video. Start the PO-token '
            'provider, then retry the download.'
        ),
        'advice': 'Start bgutil-ytdlp-pot-provider on 127.0.0.1:4416 and retry.',
        'next_action': 'start-po-token-provider',
    },
    'po-provider-stale': {
        'error': (
            'The PO-token provider is reachable but looks stale or failed to '
            'issue a usable token.'
        ),
        'advice': 'Update or restart bgutil-ytdlp-pot-provider, then retry.',
        'next_action': 'update-po-token-provider',
    },
    'sabr-limited': {
        'error': (
            'This video only exposes SABR-limited formats that this yt-dlp '
            'path cannot download yet.'
        ),
        'advice': 'Update yt-dlp when SABR support lands, or retry after YouTube exposes standard formats.',
        'next_action': 'update-ytdlp-or-retry-later',
    },
    'deno-runtime-missing': {
        'error': (
            'yt-dlp needs the Deno JavaScript runtime to solve recent YouTube '
            'signature challenges.'
        ),
        'advice': 'Install Deno with winget install DenoLand.Deno, then restart Astra Downloader.',
        'next_action': 'install-deno',
    },
    'deno-runtime-unsupported': {
        'error': (
            'The installed Deno runtime is too old for this yt-dlp build to '
            'solve recent YouTube signature challenges.'
        ),
        'advice': 'Upgrade Deno to 2.3.0 or newer with winget upgrade DenoLand.Deno, then retry.',
        'next_action': 'upgrade-deno',
    },
    'js-runtime-missing': {
        'error': 'yt-dlp needs a configured JavaScript runtime for YouTube challenges.',
        'advice': 'Provision Deno, or install Node 22+ and select it in companion settings.',
        'next_action': 'configure-javascript-runtime',
    },
    'js-runtime-unverified': {
        'error': 'Astra Downloader could not verify the configured JavaScript runtime.',
        'advice': 'Repair or replace the selected runtime, then retry.',
        'next_action': 'repair-javascript-runtime',
    },
    'js-runtime-unsupported': {
        'error': "The configured JavaScript runtime is below yt-dlp's supported floor.",
        'advice': 'Upgrade to Deno 2.3+ or Node 22+, then retry.',
        'next_action': 'upgrade-javascript-runtime',
    },
    'ejs-runtime-not-ready': {
        'error': 'The configured runtime could not execute the yt-dlp EJS capability probe.',
        'advice': 'Repair or replace the selected JavaScript runtime, then retry.',
        'next_action': 'repair-javascript-runtime',
    },
    'sign-in-required': {
        'error': (
            'Sign in to confirm YouTube access. Grant browser cookies or open '
            'the video while signed in, then retry.'
        ),
        'advice': 'Sign in to YouTube in this browser and allow Astra Deck to attach YouTube cookies.',
        'next_action': 'sign-in-and-retry',
    },
    'ffmpeg-missing-or-stale': {
        'error': 'ffmpeg is missing, stale, or failed during merge/extract.',
        'advice': 'Open Astra Downloader and refresh ffmpeg before retrying.',
        'next_action': 'refresh-ffmpeg',
    },
    'network-unreachable': {
        'error': 'Astra Downloader could not reach YouTube or a required provider.',
        'advice': 'Check the network, VPN, firewall, and provider process, then retry.',
        'next_action': 'check-network-and-retry',
    },
}

ALLOWED_COOKIE_DOMAINS = frozenset({
    ".youtube.com", "youtube.com", ".www.youtube.com", "www.youtube.com",
    ".m.youtube.com", "m.youtube.com", ".music.youtube.com", "music.youtube.com",
    ".youtube-nocookie.com", "youtube-nocookie.com",
    ".www.youtube-nocookie.com", "www.youtube-nocookie.com",
    ".youtu.be", "youtu.be", ".google.com", "google.com",
    ".accounts.google.com", "accounts.google.com",
})
_CONTROL_CHARS_RE = re.compile(r'[\x00-\x1f\x7f]')
_SUBPROCESS_ENV_ALLOWLIST = (
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC',
    'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'WINDIR',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
    'LANG', 'LC_ALL', 'LC_CTYPE',
)


def _sanitize_cookie_field(value, max_len=4096):
    if value is None:
        return ""
    value = _CONTROL_CHARS_RE.sub("", str(value))
    return value.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()[:max_len]


def _is_allowed_cookie_domain(domain):
    if not domain:
        return False
    domain = domain.lower().strip()
    return domain in ALLOWED_COOKIE_DOMAINS or any(
        domain.endswith(allowed)
        for allowed in ALLOWED_COOKIE_DOMAINS
        if allowed.startswith('.')
    )


def write_cookies_netscape(cookies, target_path, *, logger=None):
    """Persist allowlisted browser cookies as an atomic Netscape cookie jar."""
    if not isinstance(cookies, list) or not cookies:
        return None
    target_path = Path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Netscape HTTP Cookie File",
        "# Auto-generated by Astra Downloader — do not edit",
        "",
    ]
    for entry in cookies:
        if not isinstance(entry, dict):
            continue
        name = _sanitize_cookie_field(entry.get("name"), 256)
        domain = _sanitize_cookie_field(entry.get("domain"), 256)
        if not name or not _is_allowed_cookie_domain(domain):
            continue
        try:
            raw_expiry = entry.get("expirationDate")
            expiry = int(float(raw_expiry)) if raw_expiry not in (None, "") else 0
            expiry = max(0, expiry)
        except (TypeError, ValueError, OverflowError):
            expiry = 0
        lines.append(
            f"{'#HttpOnly_' if entry.get('httpOnly') else ''}{domain}\t"
            f"{'TRUE' if domain.startswith('.') else 'FALSE'}\t"
            f"{_sanitize_cookie_field(entry.get('path'), 512) or '/'}\t"
            f"{'TRUE' if entry.get('secure') else 'FALSE'}\t{expiry}\t{name}\t"
            f"{_sanitize_cookie_field(entry.get('value'), 4096)}"
        )
    if len(lines) == 3:
        return None

    temporary = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(lines) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target_path)
        try:
            os.chmod(target_path, 0o600)
        except OSError:
            pass
        return str(target_path)
    except Exception as error:
        if logger:
            logger(f"Cookie jar write failed: {error}")
        try:
            if temporary.exists():
                temporary.unlink()
        except OSError:
            pass
        return None


def cleanup_stale_cookie_jars(install_dir, older_than_seconds=300, *, clock=time.time):
    """Remove crash-orphaned cookie jars older than the supplied horizon."""
    try:
        now = clock()
        for entry in Path(install_dir).glob('.cookies.*.txt'):
            try:
                if now - entry.stat().st_mtime > older_than_seconds:
                    entry.unlink()
            except OSError:
                pass
    except OSError:
        pass


def build_subprocess_env(deno_path, deno_dir=None, *, environ=None):
    """Build the allowlisted environment used for untrusted media subprocesses."""
    environ = os.environ if environ is None else environ
    env = {key: environ[key] for key in _SUBPROCESS_ENV_ALLOWLIST if key in environ}
    deno_path = Path(deno_path)
    if deno_path.exists():
        directory = Path(deno_dir) if deno_dir is not None else deno_path.parent
        env['PATH'] = str(directory) + os.pathsep + env.get('PATH', '')
    return env


def terminate_process_tree(proc, timeout=3, *, platform=None, runner=None,
                           creationflags=0, timeout_error=None, logger=None):
    """Terminate a media subprocess and its children without orphaning ffmpeg."""
    if not proc or proc.poll() is not None:
        return
    platform = sys.platform if platform is None else platform
    runner = subprocess.run if runner is None else runner
    timeout_error = subprocess.TimeoutExpired if timeout_error is None else timeout_error
    if platform == 'win32':
        try:
            runner(
                ['taskkill', '/PID', str(proc.pid), '/T', '/F'],
                capture_output=True,
                creationflags=creationflags,
                timeout=5,
            )
            try:
                proc.wait(timeout=timeout)
            except Exception:
                pass
            return
        except Exception as error:
            if logger:
                logger(f"Process tree termination warning: {error}")
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
    try:
        proc.terminate()
        proc.wait(timeout=timeout)
        return
    except timeout_error:
        pass
    except Exception:
        pass
    try:
        proc.kill()
    except Exception:
        pass


def is_playlist_url(url):
    try:
        parsed = urlparse(url)
        params = {}
        for part in parsed.query.split('&'):
            if '=' in part:
                key, value = part.split('=', 1)
                params.setdefault(key, []).append(value)
        has_list = bool(params.get('list', [''])[0])
        has_video = bool(params.get('v', [''])[0])
        return has_list and not has_video
    except Exception:
        return False


def build_video_format_args(container, quality):
    """Return editor-compatible yt-dlp format selection arguments."""
    height_filter = '' if quality == 'best' else f'[height<={quality}]'
    if container == 'mp4':
        v_pref, a_pref = '[vcodec^=avc1]', '[ext=m4a]'
    elif container == 'webm':
        v_pref, a_pref = '[vcodec^=vp9]', '[ext=webm]'
    else:
        v_pref = a_pref = ''

    if v_pref or a_pref:
        selector = (
            f'bestvideo{height_filter}{v_pref}+bestaudio{a_pref}/'
            f'bestvideo{height_filter}{v_pref}+bestaudio/'
            f'bestvideo{height_filter}+bestaudio{a_pref}/'
            f'bestvideo{height_filter}+bestaudio/'
            f'best{height_filter}{v_pref}/'
            f'best{height_filter}/best'
        )
    else:
        selector = f'bestvideo{height_filter}+bestaudio/best{height_filter}/best'
    return ['-f', selector, '--merge-output-format', container]


def download_error_payload(error_code, error=None, advice=None):
    meta = DOWNLOAD_FAILURE_RECOVERY.get(error_code, {})
    return {
        'error': error or meta.get('error') or 'Download failed.',
        'code': error_code,
        'error_code': error_code,
        'advice': advice or meta.get('advice') or 'Retry after checking Astra Downloader diagnostics.',
        'next_action': meta.get('next_action', 'retry'),
    }


def summarize_ytdlp_formats(info):
    """Reduce a yt-dlp `-J` info dict to a concise, UI-ready format list:
    real available formats with id/ext/resolution/codec/size/audio-video flags.
    Storyboard (mhtml) and empty (no vcodec+acodec) entries are dropped."""
    if not isinstance(info, dict):
        return {'id': '', 'title': '', 'duration': 0, 'formats': []}
    out = []
    for f in (info.get('formats') or []):
        if not isinstance(f, dict) or f.get('format_id') is None:
            continue
        vcodec = f.get('vcodec') or 'none'
        acodec = f.get('acodec') or 'none'
        if f.get('ext') == 'mhtml' or (vcodec == 'none' and acodec == 'none'):
            continue
        out.append({
            'format_id': str(f.get('format_id')),
            'ext': f.get('ext') or '',
            'height': int(f.get('height') or 0),
            'width': int(f.get('width') or 0),
            'fps': f.get('fps') or 0,
            'vcodec': vcodec,
            'acodec': acodec,
            'has_video': vcodec != 'none',
            'has_audio': acodec != 'none',
            'filesize': int(f.get('filesize') or f.get('filesize_approx') or 0),
            'tbr': f.get('tbr') or 0,
            'format_note': (f.get('format_note') or '')[:80],
        })
    return {
        'id': str(info.get('id') or ''),
        'title': (info.get('title') or '')[:300],
        'duration': info.get('duration') or 0,
        'formats': out,
    }


def _is_benign_failure_noise(line):
    """True for yt-dlp output lines that must never be surfaced as the failure
    reason. These are informational/warning/progress lines that routinely
    appear in the tail of a failed run and would otherwise masquerade as the
    cause (most notoriously the "your yt-dlp version is older than 90 days"
    nag and the "PO Token which was not provided" web-formats warning)."""
    low = str(line or '').strip().lower()
    if not low:
        return True
    if low.startswith('warning:'):
        return True
    if 'is older than' in low and 'yt-dlp' in low:
        return True
    if low.startswith('[download]') or low.startswith('[youtube]'):
        return True
    if low.startswith('mdlp'):  # our own progress prefix
        return True
    return False


def classify_download_failure(message='', lines=None):
    # Two-pass: classify the definitive final error message first, and only
    # consult the output tail when the message alone is unrecognized. Without
    # this, a benign "PO Token which was not provided" WARNING anywhere in
    # the last 30 lines outranked the real cause (ffmpeg failure, connection
    # reset, disk full) carried by the message itself.
    primary = _classify_failure_text(str(message or '').lower())
    if primary:
        return primary
    text_parts = [str(message or '')]
    if lines:
        text_parts.extend(str(line or '') for line in lines)
    return _classify_failure_text(' '.join(text_parts).lower())


def _classify_failure_text(text):
    if not text.strip():
        return None
    if (
        'deno' in text
        and ('javascript runtime' in text or 'signature' in text or 'n/sig' in text
             or 'not found' in text or 'requires' in text)
    ):
        if any(marker in text for marker in ('stale', 'outdated', 'unsupported', 'too old', 'below')):
            return 'deno-runtime-unsupported'
        return 'deno-runtime-missing'
    if any(marker in text for marker in ('po token', 'po-token', 'potoken', 'po_token', 'bgutil')):
        if any(marker in text for marker in (
            'stale', 'expired', 'outdated', 'provider failed', 'failed to issue',
            'failed to fetch', 'unreachable', 'connection refused', 'invalid response',
        )):
            return 'po-provider-stale'
        return 'po-token-required'
    if any(marker in text for marker in (
        'sign in to confirm', 'please sign in', 'login required', 'not logged in',
        'confirm you are not a bot', 'cookies are required', 'use cookies',
        'authentication required',
    )):
        return 'sign-in-required'
    if 'ffmpeg' in text and any(marker in text for marker in (
        'not found', 'not installed', 'no such file', 'exited with code',
        'version', 'stale', 'unable to execute', 'failed',
    )):
        return 'ffmpeg-missing-or-stale'
    if any(marker in text for marker in (
        'sabr', 'no video formats', 'requested format is not available',
        'no formats available', 'only images are available',
    )):
        return 'sabr-limited'
    if any(marker in text for marker in (
        'network is unreachable', 'failed to establish a new connection',
        'connection refused', 'connection reset', 'connection timed out',
        'timed out', 'temporary failure in name resolution', 'name or service not known',
        'dns', 'unable to download webpage', 'http error 502', 'http error 503',
        'http error 504',
    )):
        return 'network-unreachable'
    return None


def apply_download_failure_classification(download, error_code, error=None, advice=None):
    if not error_code:
        return
    payload = download_error_payload(error_code, error=error, advice=advice)
    download.error_code = payload['error_code']
    download.error_advice = payload['advice']
    download.error_action = payload['next_action']
    download.error = payload['error']


class Download:
    def __init__(self, dl_id, url, audio_only=False, fmt=None, quality='best',
                 output_dir=None, title=None, referer=None, cookies_file=None,
                 requires_auth=False, created_at=None, queue_order=0, section=None,
                 clock=None):
        self._clock = clock or time.time
        self.id = dl_id
        self.url = url
        self.audio_only = audio_only
        self.format = fmt or ('mp3' if audio_only else 'mp4')
        self.quality = quality
        self.output_dir = output_dir
        self.title = title or "Unknown"
        self.referer = referer
        self.section = dict(section) if isinstance(section, dict) else None
        self.cookies_file = cookies_file
        self.requires_auth = bool(requires_auth)
        self._cookies = None
        self.status = "pending"
        self.progress = 0.0
        self.speed = ""
        self.eta = ""
        self.filename = ""
        self.error = ""
        self.error_code = ""
        self.error_advice = ""
        self.error_action = ""
        self.start_time = float(created_at if created_at is not None else self._clock())
        self.queue_order = max(0, int(queue_order or 0))
        self.finished_time = None
        self.process = None

    def mark_terminal(self):
        if self.status in DOWNLOAD_TERMINAL_STATES and self.finished_time is None:
            self.finished_time = self._clock()

    def to_dict(self):
        payload = {
            "id": self.id, "url": self.url, "title": self.title,
            "status": self.status, "progress": round(self.progress, 1),
            "speed": self.speed, "eta": self.eta, "filename": self.filename,
            "error": self.error, "audioOnly": self.audio_only,
            "format": self.format, "quality": self.quality,
            "requiresAuth": self.requires_auth,
            "retryable": bool(
                self.status == 'failed'
                and self.error_code in DOWNLOAD_RETRYABLE_ERROR_CODES
            ),
        }
        if self.error_code:
            payload["error_code"] = self.error_code
            payload["advice"] = self.error_advice
            payload["next_action"] = self.error_action
        if self.section:
            payload["section"] = dict(self.section)
        return payload


class DownloadQueueStore:
    """Schema-checked durable queue storage with injected JSON collaborators."""

    def __init__(self, *, path, reader, writer, logger, clean_text,
                 clean_path_text, schema_version=1, max_records=MAX_QUEUED_TOTAL):
        self.path = Path(path)
        self._reader = reader
        self._writer = writer
        self._logger = logger
        self._clean_text = clean_text
        self._clean_path_text = clean_path_text
        self.schema_version = int(schema_version)
        self.max_records = max(1, int(max_records))

    def load(self):
        raw = self._reader(self.path, {})
        if not isinstance(raw, dict):
            return {}, True
        compatible = not raw or raw.get('schemaVersion') == self.schema_version
        return raw, compatible

    def serialize(self, downloads, intake_paused=False):
        unfinished = sorted(
            (download for download in downloads if download.status in DOWNLOAD_ACTIVE_STATES),
            key=lambda download: (download.queue_order, download.start_time, download.id),
        )[:self.max_records]
        records = [{
            'id': self._clean_text(download.id, '', 120),
            'url': download.url,
            'title': self._clean_text(download.title, 'Unknown', 500) or 'Unknown',
            'audioOnly': bool(download.audio_only),
            'format': download.format,
            'quality': download.quality,
            'outputDir': self._clean_path_text(download.output_dir),
            'referer': download.referer,
            'requiresAuth': bool(download.requires_auth),
            **({'section': dict(download.section)} if download.section else {}),
            'createdAt': float(download.start_time),
            'order': int(download.queue_order),
        } for download in unfinished]
        return {
            'schemaVersion': self.schema_version,
            'intakePaused': bool(intake_paused),
            'downloads': records,
        }

    def save(self, downloads, intake_paused=False):
        try:
            self._writer(self.path, self.serialize(downloads, intake_paused))
            return True
        except Exception as error:
            self._logger(f"Download queue save failed: {error}")
            return False


_REQUIRED_MANAGER_DEPENDENCIES = frozenset({
    'CREATE_NEW_PROCESS_GROUP',
    'CREATE_NO_WINDOW',
    'FFMPEG_PATH',
    'INSTALL_DIR',
    'YTDLP_PATH',
    '_build_subprocess_env',
    'allowed_output_roots',
    'atomic_write_json',
    'build_javascript_runtime_args',
    'build_youtube_extractor_args',
    'clamp_int',
    'clean_path_text',
    'clean_text',
    'cleanup_stale_cookie_jars',
    'coerce_bool',
    'is_youtube_url',
    'load_json_file',
    'normalize_output_dir',
    'normalize_download_section',
    'normalize_url',
    'probe_javascript_runtime',
    'probe_po_token_provider',
    'spawn_media_process',
    'spawn_ytdlp',
    'terminate_process_tree',
    'write_persistent_log',
})


class DownloadManagerCore:
    ALLOWED_VIDEO_FMT = {'mp4', 'mkv', 'webm'}
    ALLOWED_AUDIO_FMT = {'mp3', 'm4a', 'opus', 'flac', 'wav'}
    ALLOWED_QUALITY = {'best', '2160', '1440', '1080', '720', '480'}
    FORMATS_PROBE_LIMIT = 2
    FORMATS_BUSY_MESSAGE = (
        'Astra Downloader is already looking up formats for other videos. '
        'Try again in a moment.'
    )

    def __init__(self, config, history, queue_path=None, *, dependencies, progress_updated, download_completed):
        missing = sorted(set(_REQUIRED_MANAGER_DEPENDENCIES) - set(dependencies))
        if missing:
            raise ValueError("Missing download manager dependencies: " + ", ".join(missing))
        self._dependencies = dict(dependencies)
        self.progress_updated = progress_updated
        self.download_completed = download_completed
        self.config = config
        self.history = history
        self.downloads = {}
        self._next_id = 0
        self._next_order = 0
        self._lock = threading.Lock()
        self._running_ids = set()
        # Bound concurrent `yt-dlp -J` format probes: each one holds a
        # waitress worker thread for up to 60s, and the pool only has 8 —
        # unbounded probes could starve /health, /status and /download.
        self._formats_gate = threading.Semaphore(self.FORMATS_PROBE_LIMIT)
        self._queue_path = Path(queue_path) if queue_path else None
        self._queue_store = (
            DownloadQueueStore(
                path=self._queue_path,
                reader=lambda path, fallback: self._dependencies['load_json_file'](path, fallback),
                writer=lambda path, data: self._dependencies['atomic_write_json'](path, data),
                logger=lambda message: self._dependencies['write_persistent_log'](message),
                clean_text=lambda *args, **kwargs: self._dependencies['clean_text'](*args, **kwargs),
                clean_path_text=lambda *args, **kwargs: self._dependencies['clean_path_text'](*args, **kwargs),
                schema_version=DOWNLOAD_QUEUE_SCHEMA_VERSION,
                max_records=MAX_QUEUED_TOTAL,
            )
            if self._queue_path is not None else None
        )
        self._persistence_error = ""
        self._persistence_compatible = True
        self.intake_paused = False
        self._closing = False
        self.total_completed = 0
        # v1.2.0: sweep any cookie jars left by a previous crash before any
        # new download starts. Session cookies shouldn't outlive the process
        # that needed them.
        self._dependencies['cleanup_stale_cookie_jars']()
        self._restore_pending_queue()

    def _restore_pending_queue(self):
        """Restore unfinished work without starting it or restoring secrets.

        A crash can leave both running and pending records in the durable
        queue. Every record is intentionally converted to an explicit recovery
        state: unauthenticated work becomes ``paused`` and work that previously
        used browser cookies becomes ``needs-auth``. This prevents duplicate
        downloads from silently starting after an application restart.
        """
        if self._queue_store is None:
            return
        raw, compatible = self._queue_store.load()
        if not compatible:
            self._persistence_compatible = False
            self._persistence_error = (
                'The pending queue was created by an incompatible Astra Downloader version.'
            )
            self._dependencies['write_persistent_log'](
                'Download queue schema is incompatible; preserving the file without changes.'
            )
            return
        persisted_pause = self._dependencies['coerce_bool'](
            raw.get('intakePaused'), False
        )
        records = raw.get('downloads', [])
        if not isinstance(records, list):
            self.intake_paused = persisted_pause
            return

        restored = []
        seen_ids = set()
        allowed_roots = self._dependencies['allowed_output_roots'](self.config)
        for index, item in enumerate(records[:MAX_QUEUED_TOTAL]):
            if not isinstance(item, dict):
                continue
            url, err = self._dependencies['normalize_url'](item.get('url'))
            if err or not self._dependencies['is_youtube_url'](url):
                continue
            output_dir = self._dependencies['clean_path_text'](item.get('outputDir'))
            try:
                if not output_dir or not Path(output_dir).expanduser().is_absolute():
                    continue
                resolved_output = Path(output_dir).expanduser().resolve()
                if not allowed_roots or not any(
                    resolved_output == root or resolved_output.is_relative_to(root)
                    for root in allowed_roots
                ):
                    continue
                output_dir = str(resolved_output)
            except (OSError, RuntimeError, ValueError):
                continue
            audio_only = self._dependencies['coerce_bool'](item.get('audioOnly'), False)
            if audio_only:
                fmt = item.get('format') if item.get('format') in self.ALLOWED_AUDIO_FMT else 'mp3'
            else:
                fmt = item.get('format') if item.get('format') in self.ALLOWED_VIDEO_FMT else 'mp4'
            quality = item.get('quality') if item.get('quality') in self.ALLOWED_QUALITY else 'best'
            section, section_error = self._dependencies['normalize_download_section'](
                item.get('section')
            )
            if section_error:
                section = None
            referer, _ = self._dependencies['normalize_url'](item.get('referer')) if item.get('referer') else (None, None)
            dl_id = self._dependencies['clean_text'](item.get('id'), '', 120)
            if not dl_id or dl_id in seen_ids:
                self._next_id += 1
                dl_id = f"dl_{self._next_id}_{uuid.uuid4().hex[:6]}"
            seen_ids.add(dl_id)
            requires_auth = self._dependencies['coerce_bool'](item.get('requiresAuth'), False)
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
                title=self._dependencies['clean_text'](item.get('title'), None, 500) or None,
                referer=referer,
                requires_auth=requires_auth,
                created_at=created_at,
                queue_order=self._next_order,
                section=section,
            )
            dl.status = 'needs-auth' if requires_auth else 'paused'
            dl.error = (
                'Fresh YouTube authentication is required before this recovered download can run.'
                if requires_auth else
                'Recovered after restart. Resume the queue when you are ready.'
            )
            restored.append(dl)

        if not restored:
            self.intake_paused = persisted_pause
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
        if self._queue_store is None:
            return {
                'schemaVersion': DOWNLOAD_QUEUE_SCHEMA_VERSION,
                'intakePaused': bool(self.intake_paused),
                'downloads': [],
            }
        return self._queue_store.serialize(self.downloads.values(), self.intake_paused)

    def _persist_locked(self):
        if self._queue_store is None or self._closing:
            return True
        if not self._persistence_compatible:
            return False
        if self._queue_store.save(self.downloads.values(), self.intake_paused):
            self._persistence_error = ''
            return True
        self._persistence_error = 'Could not save the pending download queue.'
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
            'runningLimit': self._max_concurrent(),
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
            with self._lock:
                if dl.status != 'queued':
                    # cancel() can land between _schedule() marking this item
                    # queued and this launch loop. The item is already
                    # terminal, and no worker thread will run its finally
                    # block, so release the reserved slot here.
                    self._running_ids.discard(dl.id)
                    dl._cookies = None
                    continue
                cookies = dl._cookies
                dl._cookies = None
            if cookies:
                jar_path = self._dependencies['INSTALL_DIR']() / f".cookies.{dl.id}.txt"
                dl.cookies_file = write_cookies_netscape(
                    cookies, jar_path,
                    logger=self._dependencies['write_persistent_log'],
                )
                with self._lock:
                    if dl.status != 'queued':
                        # Cancelled while the jar was being written. cancel()
                        # could not unlink a jar it didn't know about yet, so
                        # clean it up here and release the slot.
                        self._running_ids.discard(dl.id)
                        jar = dl.cookies_file
                        dl.cookies_file = None
                        if jar:
                            try:
                                Path(jar).unlink(missing_ok=True)
                            except Exception:
                                pass
                        continue
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
                self._dependencies['write_persistent_log'](f"Download worker {dl.id} failed to start: {exc}")
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
            self._dependencies['write_persistent_log'](f"Download worker {dl.id} escaped unexpectedly: {exc}")
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
                # Queue drained to idle: this is the race-free window to
                # actually apply a yt-dlp update that was deferred while
                # downloads were running. No yt-dlp.exe is in flight, so the
                # staged binary can be swapped in without a file-in-use race.
                if self.active_count() == 0:
                    self.maybe_refresh_ytdlp('queue-idle')

    def _max_concurrent(self):
        """Configured simultaneous-download limit, clamped. Defaults to the
        historical MAX_CONCURRENT (3) when unset."""
        try:
            return self._dependencies['clamp_int'](
                self.config.get('MaxConcurrentDownloads', MAX_CONCURRENT),
                MAX_CONCURRENT, 1, 10,
            )
        except Exception:  # noqa: BLE001
            return MAX_CONCURRENT

    def _schedule(self):
        to_start = []
        with self._lock:
            if self._closing or self.intake_paused:
                return
            available = max(0, self._max_concurrent() - len(self._running_ids))
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
                       output_dir=None, title=None, referer=None, cookies=None,
                       section=None):
        url, err = self._dependencies['normalize_url'](url)
        if err:
            return None, err
        audio_only = self._dependencies['coerce_bool'](audio_only, False)
        section, section_error = self._dependencies['normalize_download_section'](section)
        if section_error:
            return None, section_error

        # No update trigger here: firing before the download was enqueued let
        # the updater pass its active_count()==0 idle gate and then race the
        # yt-dlp.exe this very download spawns milliseconds later — the
        # binary swap hit file-in-use, failed, and re-downloaded the whole
        # release at the next window. The server-start hook plus the
        # queue-idle hook in _worker_entry (fires after every drain,
        # including failures) cover staleness without a race.

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
        roots = self._dependencies['allowed_output_roots'](self.config) if client_supplied_output else None
        output_dir, err = self._dependencies['normalize_output_dir'](
            output_dir,
            self.config.get("DownloadPath", str(Path.home() / "Videos")),
            allowed_roots=roots,
        )
        if err:
            return None, err
        title = self._dependencies['clean_text'](title, None, 500) or None
        referer, _ = self._dependencies['normalize_url'](referer) if referer else (None, None)

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
                    dl.title, dl.referer, dl.section, dl.requires_auth, dl.status,
                    dl.error, dl.error_code, dl.error_advice, dl.error_action,
                )
                dl.audio_only = audio_only
                dl.format = fmt
                dl.quality = quality
                dl.output_dir = output_dir
                dl.title = title or dl.title
                dl.referer = referer
                dl.section = dict(section) if section else None
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
                    section=section,
                )
                dl._cookies = list(cookies) if cookies else None
                self.downloads[dl_id] = dl
            if not self._persist_locked():
                if not auth_recovery:
                    del self.downloads[dl_id]
                else:
                    (
                        dl.audio_only, dl.format, dl.quality, dl.output_dir,
                        dl.title, dl.referer, dl.section, dl.requires_auth, dl.status,
                        dl.error, dl.error_code, dl.error_advice, dl.error_action,
                    ) = recovery_previous
                dl._cookies = None
                if not self._persistence_compatible:
                    # Disk/permission advice is wrong for a schema mismatch;
                    # surface the real cause so the user can recover.
                    return None, self._persistence_error
                return None, (
                    "Could not save the pending download queue. Check disk space and "
                    "permissions, then retry."
                )

        self._schedule()

        return dl_id, None

    def _recut_section(self, dl, env):
        """Replace a completed file with a frame-accurate ffmpeg re-cut."""
        if not dl.section:
            return True
        input_path = Path(dl.filename or "")
        try:
            input_path = input_path.resolve(strict=True)
            output_root = Path(dl.output_dir).resolve(strict=True)
            if input_path != output_root and not input_path.is_relative_to(output_root):
                raise ValueError("download output escaped its configured directory")
        except (OSError, RuntimeError, ValueError) as error:
            dl.status = "failed"
            dl.error = f"Accurate clip could not locate the downloaded file: {error}"
            return False

        start = float(dl.section["start"])
        duration = float(dl.section["end"]) - start
        temporary = input_path.with_name(
            f".{input_path.stem}.astra-section-{uuid.uuid4().hex}{input_path.suffix}"
        )
        ffmpeg = str(self._dependencies['FFMPEG_PATH']())
        args = [
            ffmpeg, '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
            '-i', str(input_path), '-ss', f'{start:.3f}', '-t', f'{duration:.3f}',
            '-map_metadata', '0',
        ]
        suffix = input_path.suffix.lower()
        if dl.audio_only:
            audio_codec_args = {
                '.mp3': ['-c:a', 'libmp3lame', '-q:a', '0'],
                '.m4a': ['-c:a', 'aac', '-b:a', '256k'],
                '.opus': ['-c:a', 'libopus', '-b:a', '192k'],
                '.flac': ['-c:a', 'flac'],
                '.wav': ['-c:a', 'pcm_s16le'],
            }
            args += ['-map', '0:a:0', '-vn']
            args += audio_codec_args.get(suffix, ['-c:a', 'aac', '-b:a', '256k'])
        elif suffix == '.webm':
            args += [
                '-map', '0:v:0?', '-map', '0:a:0?', '-map', '0:s?',
                '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0',
                '-c:a', 'libopus', '-b:a', '192k', '-c:s', 'webvtt',
            ]
        else:
            args += [
                '-map', '0:v:0?', '-map', '0:a:0?', '-map', '0:s?',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                '-c:a', 'aac', '-b:a', '192k',
                '-c:s', 'mov_text' if suffix == '.mp4' else 'copy',
            ]
            if suffix == '.mp4':
                args += ['-movflags', '+faststart']
        args.append(str(temporary))

        dl.status = 'trimming'
        dl.speed = ''
        dl.eta = ''
        self.progress_updated.emit()
        proc = None
        try:
            proc = self._dependencies['spawn_media_process'](
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=(
                    self._dependencies['CREATE_NO_WINDOW']
                    | self._dependencies['CREATE_NEW_PROCESS_GROUP']
                ),
                env=env,
            )
            dl.process = proc
            output, _ = proc.communicate()
            if dl.status == 'cancelled':
                return False
            if proc.returncode != 0 or not temporary.is_file():
                detail = " ".join(str(output or "").split())[-220:]
                dl.status = 'failed'
                dl.error = (
                    "ffmpeg could not create the requested clip."
                    + (f" {detail}" if detail else "")
                )
                apply_download_failure_classification(
                    dl, 'ffmpeg-missing-or-stale', error=dl.error
                )
                return False
            os.replace(temporary, input_path)
            dl.filename = str(input_path)
            return True
        finally:
            dl.process = None
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            if proc is not None and proc.poll() is None:
                try:
                    self._dependencies['terminate_process_tree'](proc)
                except Exception:
                    pass

    def _run_download(self, dl):
        with self._lock:
            if dl.status != 'queued':
                # cancel() can land between _schedule() releasing the lock and
                # this worker thread's first statement. The item is already
                # terminal (cancel() persisted it and unlinked its cookie jar),
                # so reviving it would run a download the user just cancelled.
                # _worker_entry's finally block releases the slot and
                # re-schedules; nothing else to tear down here.
                return
            dl.status = "downloading"
        self.progress_updated.emit()

        ytdlp = str(self._dependencies['YTDLP_PATH']())
        ffmpeg_dir = str(self._dependencies['FFMPEG_PATH']().parent)
        is_playlist = is_playlist_url(dl.url)

        # Output template. A user-configured template (already validated by
        # config.normalize_output_template — allowlisted fields, no traversal,
        # keeps %(ext)s) is always relative to the download root and, when set,
        # governs both single and playlist layout.
        custom_tpl = str(self.config.get("OutputTemplate", "") or "")
        if custom_tpl:
            out_tpl = str(Path(dl.output_dir) / custom_tpl)
        elif is_playlist:
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
                'download:MDLP_JSON %(progress)j',
                '--print', 'after_move:MDLP_FILEPATH %(filepath)j']

        frags = self._dependencies['clamp_int'](self.config.get("ConcurrentFragments", 4), 4, 1, 32)
        args += ['--concurrent-fragments', str(frags)]
        retries = self._dependencies['clamp_int'](self.config.get("DownloadRetries", 10), 10, 0, 50)
        args += ['--retries', str(retries), '--fragment-retries', str(retries)]
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
        # non-YouTube URLs; when the provider isn't running the builder falls
        # back to the token-exempt tv/web_embedded/android_vr clients so extraction degrades
        # instead of failing (the user-facing surface for that state is the
        # popup health banner and the dashboard "PO provider: Fallback" row).
        args += self._dependencies['build_youtube_extractor_args'](
            dl.url,
            po_token_provider=self._dependencies['probe_po_token_provider'](),
        )
        runtime = self._dependencies['probe_javascript_runtime'](
            configured_runtime=self.config.get('JavaScriptRuntime', 'auto')
        )
        args += self._dependencies['build_javascript_runtime_args'](runtime)

        args.append(dl.url)

        # Watchdog sentinels declared before the try so the finally can stop the
        # thread even if Popen() raises before the watchdog is created.
        stop_watchdog = None
        watchdog_thread = None
        watchdog_killed = {'value': None}
        try:
            env = self._dependencies['_build_subprocess_env']()
            proc = self._dependencies['spawn_ytdlp'](
                args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', bufsize=1,
                creationflags=self._dependencies['CREATE_NO_WINDOW'] | self._dependencies['CREATE_NEW_PROCESS_GROUP'],
                env=env,
            )
            dl.process = proc
            with self._lock:
                cancelled_pre_spawn = dl.status == 'cancelled'
            if cancelled_pre_spawn:
                # cancel() landed in the pre-spawn arg-building window: it saw
                # process None and armed no terminate thread, so kill the tree
                # we just spawned ourselves.
                try:
                    self._dependencies['terminate_process_tree'](proc)
                except Exception:
                    # reason: best-effort kill; process may already be gone
                    pass
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
                        if watched_proc.poll() is None:
                            watchdog_killed['value'] = 'cancelled'
                            try:
                                self._dependencies['terminate_process_tree'](watched_proc)
                            except Exception:
                                # reason: best-effort kill; process may already be gone
                                pass
                        return
                    if (time.monotonic() - activity['at']) > DOWNLOAD_STALL_TIMEOUT_SECONDS:
                        watchdog_killed['value'] = 'stall'
                        try:
                            self._dependencies['terminate_process_tree'](watched_proc)
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
                if line.startswith('MDLP_FILEPATH '):
                    try:
                        filepath = json.loads(line[len('MDLP_FILEPATH '):])
                        if isinstance(filepath, str) and filepath:
                            dl.filename = filepath
                            continue
                    except Exception:
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
                if dl.status == 'cancelled':
                    pass  # never resurrect a cancelled item from output lines
                elif '[Merger]' in line or 'Merging formats' in line:
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
                    else:
                        # No real `ERROR:` line. yt-dlp still emits benign
                        # WARNING noise (e.g. "Your yt-dlp version … is older
                        # than 90 days", "PO Token which was not provided",
                        # progress residue) that must NEVER be surfaced as the
                        # failure reason — doing so masks the true cause and
                        # reads as "the downloader is broken" when it merely
                        # exited. Drop that noise before falling back.
                        meaningful = [
                            ln for ln in last_lines
                            if ln and not _is_benign_failure_noise(ln)
                        ]
                        if meaningful:
                            dl.error = " ".join(meaningful)[-240:]
                        else:
                            dl.error = (
                                f"yt-dlp exited with code {proc.returncode} "
                                "without reporting a specific error. The video "
                                "may be unavailable, private, region-locked, or "
                                "require sign-in."
                            )
                    # Attach an actionable classification (error_code / advice /
                    # next_action) so the extension can render recovery guidance
                    # instead of raw yt-dlp text. Preserves the message above.
                    _failure_code = classify_download_failure(
                        last_error or dl.error, last_lines
                    )
                    if _failure_code:
                        apply_download_failure_classification(
                            dl, _failure_code, error=dl.error
                        )
                    combined = " ".join(last_lines).lower()
                    if 'live event has ended' in combined and dl.cookies_file:
                        self._dependencies['write_persistent_log'](
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
                        proc = self._dependencies['spawn_ytdlp'](
                            retry_args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding='utf-8', errors='replace', bufsize=1,
                            creationflags=self._dependencies['CREATE_NO_WINDOW'] | self._dependencies['CREATE_NEW_PROCESS_GROUP'],
                            env=env,
                        )
                        dl.process = proc
                        last_lines = []
                        last_error = None

                        def _retry_watchdog(ev=stop_watchdog, watched_proc=proc):
                            while not ev.wait(DOWNLOAD_WATCHDOG_POLL_SECONDS):
                                if dl.status == 'cancelled':
                                    if watched_proc.poll() is None:
                                        watchdog_killed['value'] = 'cancelled'
                                        try:
                                            self._dependencies['terminate_process_tree'](watched_proc)
                                        except Exception:
                                            # reason: best-effort kill; process may already be gone
                                            pass
                                    return
                                if (time.monotonic() - activity['at']) > DOWNLOAD_STALL_TIMEOUT_SECONDS:
                                    watchdog_killed['value'] = 'stall'
                                    try:
                                        self._dependencies['terminate_process_tree'](watched_proc)
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
                            if line.startswith('MDLP_FILEPATH '):
                                try:
                                    filepath = json.loads(line[len('MDLP_FILEPATH '):])
                                    if isinstance(filepath, str) and filepath:
                                        dl.filename = filepath
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
            if dl.status == "complete" and dl.section:
                if stop_watchdog is not None:
                    stop_watchdog.set()
                try:
                    if getattr(proc, 'stdout', None) is not None:
                        proc.stdout.close()
                except Exception:
                    pass
                if self._recut_section(dl, env):
                    dl.status = "complete"
                    dl.progress = 100

        except FileNotFoundError:
            if dl.status != "cancelled":
                dl.status = "failed"
                dl.error = "yt-dlp not found. Run setup first."
        except Exception as e:
            if dl.status != "cancelled":
                dl.status = "failed"
                dl.error = "Unexpected download error. Check Astra Downloader logs for details."
                self._dependencies['write_persistent_log'](f"Download {dl.id} failed unexpectedly: {e}")
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
                    self._dependencies['terminate_process_tree'](orphan)
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
                "section": dict(dl.section) if dl.section else None,
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

    def persist_intake_flag(self, paused):
        """Persist ``intakePaused`` as *paused* without changing the live flag.

        Used by the companion self-update immediately before the process
        exits: intake must stay paused in this process so nothing can spawn
        yt-dlp during the exit window, but the relaunched companion should
        restore the user's pre-update setting.
        """
        with self._lock:
            previous = self.intake_paused
            self.intake_paused = bool(paused)
            ok = self._persist_locked()
            self.intake_paused = previous
            return ok

    def resume_download(self, dl_id, cookies=None):
        with self._lock:
            dl = self.downloads.get(dl_id)
            if not dl:
                return False, 'Download no longer exists in the queue.'
            if dl_id in self._running_ids:
                # The worker that owns this id has not run its finally block
                # yet. Flipping the item back to pending now would let
                # _schedule() start a second worker whose slot registration
                # the first worker's teardown then discards.
                return False, 'Download is still finalizing — retry in a moment.'
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
            if dl_id in self._running_ids:
                # A worker can stamp a retryable failure milliseconds before
                # its finally block discards the id from _running_ids. A retry
                # accepted in that gap starts a second worker, then the first
                # worker's teardown discards the second worker's slot and
                # marks the retrying download failed.
                return False, 'Download is still finalizing — retry in a moment.'
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
            if isinstance(position, bool):
                return False, 'Queue position must be an integer.'
            if isinstance(position, int):
                target = position
            elif isinstance(position, str) and re.fullmatch(r'-?\d+', position.strip()):
                target = int(position.strip())
            else:
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
                self._dependencies['terminate_process_tree'](proc)
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
                    self._dependencies['terminate_process_tree'](proc)
                except Exception as e:
                    self._dependencies['write_persistent_log'](f"cancel_all termination warning: {e}")

    def active_count(self):
        with self._lock:
            return len(self._running_ids)

    def maybe_refresh_ytdlp(self, reason):
        """Open the throttled, race-safe yt-dlp auto-update window from the
        download path.

        Called when the queue drains to idle — the moment no yt-dlp.exe is in
        flight. The updater it delegates to is throttled (one check per interval),
        stages a *sibling* copy, verifies ``--version``, keeps a byte-verified
        rollback, and only atomically swaps the live binary when no download is
        running — so an in-flight download is never blocked or corrupted. This
        is what keeps yt-dlp current WITHOUT shipping a new extension or
        companion build: fresh yt-dlp releases land automatically the next time
        the user downloads, or the moment the queue goes idle. Best-effort and
        fully swallowed — an update hiccup must never fail a download."""
        hook = self._dependencies.get('maybe_auto_update_ytdlp')
        if hook is None:
            return
        try:
            hook(self.config, self.active_count)
        except Exception as exc:  # noqa: BLE001
            try:
                self._dependencies['write_persistent_log'](
                    f"yt-dlp auto-update trigger ({reason}) failed: {exc}"
                )
            except Exception:
                # reason: logging must not turn an update hiccup into a crash
                pass

    def list_formats(self, url, timeout=60):
        """Return `(summary, error)` of the real available formats for a single
        YouTube URL via `yt-dlp -J`, run under the same extractor + JS-runtime
        conditions as an actual download so the listing matches what would be
        downloaded."""
        url, err = self._dependencies['normalize_url'](url)
        if err:
            return None, err
        if not self._dependencies['is_youtube_url'](url):
            return None, 'Astra Downloader only lists formats for YouTube.'
        if not self._formats_gate.acquire(blocking=False):
            return None, self.FORMATS_BUSY_MESSAGE
        try:
            return self._list_formats_gated(url, timeout)
        finally:
            self._formats_gate.release()

    def _list_formats_gated(self, url, timeout):
        ytdlp = str(self._dependencies['YTDLP_PATH']())
        args = [ytdlp, '--ignore-config', '--no-colors', '--no-warnings',
                '--no-playlist', '-J', '--skip-download']
        args += self._dependencies['build_youtube_extractor_args'](
            url, po_token_provider=self._dependencies['probe_po_token_provider'](),
        )
        runtime = self._dependencies['probe_javascript_runtime'](
            configured_runtime=self.config.get('JavaScriptRuntime', 'auto')
        )
        args += self._dependencies['build_javascript_runtime_args'](runtime)
        args.append(url)
        try:
            env = self._dependencies['_build_subprocess_env']()
            proc = self._dependencies['spawn_ytdlp'](
                args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding='utf-8', errors='replace',
                creationflags=self._dependencies['CREATE_NO_WINDOW'],
                env=env,
            )
        except Exception as exc:  # noqa: BLE001
            return None, f'Could not start yt-dlp: {exc}'
        try:
            out, errout = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                self._dependencies['terminate_process_tree'](proc)
            except Exception:
                # reason: best-effort kill; process may already be gone
                pass
            return None, 'Timed out while listing formats.'
        if proc.returncode != 0:
            tail = [ln.strip() for ln in (errout or '').splitlines() if ln.strip()]
            msg = next((ln for ln in reversed(tail) if not _is_benign_failure_noise(ln)), '')
            return None, (msg or 'yt-dlp could not list formats.')[:240]
        try:
            info = json.loads(out)
        except Exception:  # noqa: BLE001
            return None, 'Could not parse yt-dlp output while listing formats.'
        return summarize_ytdlp_formats(info), None

    def exists(self, dl_id):
        """True while the download id is still tracked in the active queue."""
        with self._lock:
            return dl_id in self.downloads

    def status_of(self, dl_id, default=None):
        """Return the download's status string, or ``default`` when unknown."""
        with self._lock:
            dl = self.downloads.get(dl_id)
            return dl.status if dl else default

    def snapshot_of(self, dl_id):
        """Return a ``to_dict()`` snapshot taken under the manager lock, or None."""
        with self._lock:
            dl = self.downloads.get(dl_id)
            return dl.to_dict() if dl else None

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


DownloadManager = DownloadManagerCore


_OWNED_EXPORTS = {
    "Download", "build_video_format_args", "is_playlist_url",
    "download_error_payload", "classify_download_failure",
    "apply_download_failure_classification", "DOWNLOAD_FAILURE_RECOVERY",
    "summarize_ytdlp_formats",
    "DOWNLOAD_ACTIVE_STATES", "DOWNLOAD_RUNNING_STATES",
    "DOWNLOAD_PENDING_STATES", "DOWNLOAD_TERMINAL_STATES",
    "DOWNLOAD_RETRYABLE_ERROR_CODES", "MAX_CONCURRENT", "MAX_QUEUED_TOTAL",
    "DOWNLOAD_STALL_TIMEOUT_SECONDS", "DOWNLOAD_WATCHDOG_POLL_SECONDS",
    "write_cookies_netscape", "cleanup_stale_cookie_jars",
    "terminate_process_tree", "build_subprocess_env", "ALLOWED_COOKIE_DOMAINS",
    "DownloadQueueStore", "DownloadManager", "DownloadManagerCore",
    "DOWNLOAD_QUEUE_SCHEMA_VERSION",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
