"""
Astra Downloader — Download management.

Re-exports download-related symbols from the main astra_downloader module:
DownloadManager, Download class, format selection, subprocess management.
"""

try:
    import astra_downloader.astra_downloader as _ad
except (ImportError, AttributeError):
    import astra_downloader as _ad

Download = _ad.Download
DownloadManager = _ad.DownloadManager
build_video_format_args = _ad.build_video_format_args
terminate_process_tree = _ad.terminate_process_tree
is_playlist_url = _ad.is_playlist_url
write_cookies_netscape = _ad.write_cookies_netscape
cleanup_stale_cookie_jars = _ad.cleanup_stale_cookie_jars
DOWNLOAD_ACTIVE_STATES = _ad.DOWNLOAD_ACTIVE_STATES
DOWNLOAD_RUNNING_STATES = _ad.DOWNLOAD_RUNNING_STATES
DOWNLOAD_PENDING_STATES = _ad.DOWNLOAD_PENDING_STATES
DOWNLOAD_TERMINAL_STATES = _ad.DOWNLOAD_TERMINAL_STATES
DOWNLOAD_RETRYABLE_ERROR_CODES = _ad.DOWNLOAD_RETRYABLE_ERROR_CODES
DOWNLOAD_QUEUE_PATH = _ad.DOWNLOAD_QUEUE_PATH
MAX_CONCURRENT = _ad.MAX_CONCURRENT
MAX_QUEUED_TOTAL = _ad.MAX_QUEUED_TOTAL
DOWNLOAD_STALL_TIMEOUT_SECONDS = _ad.DOWNLOAD_STALL_TIMEOUT_SECONDS
DOWNLOAD_WATCHDOG_POLL_SECONDS = _ad.DOWNLOAD_WATCHDOG_POLL_SECONDS
