"""Import-safe download domain model and policy boundary."""

import time
from urllib.parse import urlparse

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver


__all__ = (
    "Download", "DownloadManager", "build_video_format_args",
    "terminate_process_tree", "is_playlist_url", "write_cookies_netscape",
    "cleanup_stale_cookie_jars", "DOWNLOAD_ACTIVE_STATES",
    "DOWNLOAD_RUNNING_STATES", "DOWNLOAD_PENDING_STATES",
    "DOWNLOAD_TERMINAL_STATES", "DOWNLOAD_RETRYABLE_ERROR_CODES",
    "DOWNLOAD_QUEUE_PATH", "MAX_CONCURRENT", "MAX_QUEUED_TOTAL",
    "DOWNLOAD_STALL_TIMEOUT_SECONDS", "DOWNLOAD_WATCHDOG_POLL_SECONDS",
    "download_error_payload", "classify_download_failure",
    "apply_download_failure_classification", "DOWNLOAD_FAILURE_RECOVERY",
)

MAX_CONCURRENT = 3
MAX_QUEUED_TOTAL = 200
DOWNLOAD_STALL_TIMEOUT_SECONDS = 1800
DOWNLOAD_WATCHDOG_POLL_SECONDS = 15
DOWNLOAD_RUNNING_STATES = {'queued', 'downloading', 'merging', 'extracting'}
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


def classify_download_failure(message='', lines=None):
    text_parts = [str(message or '')]
    if lines:
        text_parts.extend(str(line or '') for line in lines)
    text = ' '.join(text_parts).lower()
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
                 requires_auth=False, created_at=None, queue_order=0, clock=None):
        self._clock = clock or time.time
        self.id = dl_id
        self.url = url
        self.audio_only = audio_only
        self.format = fmt or ('mp3' if audio_only else 'mp4')
        self.quality = quality
        self.output_dir = output_dir
        self.title = title or "Unknown"
        self.referer = referer
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
        return payload


_OWNED_EXPORTS = {
    "Download", "build_video_format_args", "is_playlist_url",
    "download_error_payload", "classify_download_failure",
    "apply_download_failure_classification", "DOWNLOAD_FAILURE_RECOVERY",
    "DOWNLOAD_ACTIVE_STATES", "DOWNLOAD_RUNNING_STATES",
    "DOWNLOAD_PENDING_STATES", "DOWNLOAD_TERMINAL_STATES",
    "DOWNLOAD_RETRYABLE_ERROR_CODES", "MAX_CONCURRENT", "MAX_QUEUED_TOTAL",
    "DOWNLOAD_STALL_TIMEOUT_SECONDS", "DOWNLOAD_WATCHDOG_POLL_SECONDS",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
