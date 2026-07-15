"""Import-safe download boundary during the owned-module migration."""

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
)

_resolve_legacy = make_legacy_resolver(__all__)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
