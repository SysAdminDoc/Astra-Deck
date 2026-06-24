"""
Astra Downloader — Configuration, constants, and utility helpers.

Re-exports configuration-related symbols from the main astra_downloader module.
All implementation lives in astra_downloader.py to preserve test compatibility
(tests monkeypatch module-level globals on the main module).
"""

# Resolve the main module: when imported as a package submodule
# (from astra_downloader.config import ...) vs when the directory is on sys.path
# (test runner adds astra_downloader/ to sys.path).
try:
    import astra_downloader.astra_downloader as _ad  # package import
except (ImportError, AttributeError):
    import astra_downloader as _ad  # flat sys.path import

# ── Constants ──
APP_NAME = _ad.APP_NAME
APP_VERSION = _ad.APP_VERSION
SERVICE_ID = _ad.SERVICE_ID
SERVICE_API_VERSION = _ad.SERVICE_API_VERSION
SERVER_PORT = _ad.SERVER_PORT
PORT_FALLBACKS = _ad.PORT_FALLBACKS
MAX_CONCURRENT = _ad.MAX_CONCURRENT
MAX_QUEUED_TOTAL = _ad.MAX_QUEUED_TOTAL
DEFAULT_CONFIG = _ad.DEFAULT_CONFIG
INSTALL_DIR = _ad.INSTALL_DIR
CONFIG_PATH = _ad.CONFIG_PATH
HISTORY_PATH = _ad.HISTORY_PATH
CORS_MAX_AGE_SECONDS = _ad.CORS_MAX_AGE_SECONDS
RATE_LIMIT_DOWNLOAD_MAX = _ad.RATE_LIMIT_DOWNLOAD_MAX
RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS = _ad.RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS
MAX_REQUEST_BYTES = _ad.MAX_REQUEST_BYTES
MAX_RESPONSE_BYTES = _ad.MAX_RESPONSE_BYTES
HELPER_DOWNLOAD_MAX_BYTES = _ad.HELPER_DOWNLOAD_MAX_BYTES

# ── Config / normalization helpers ──
sanitize_config = _ad.sanitize_config
normalize_url = _ad.normalize_url
normalize_output_dir = _ad.normalize_output_dir
validate_download_request_body = _ad.validate_download_request_body
allowed_output_roots = _ad.allowed_output_roots
clean_text = _ad.clean_text
clean_path_text = _ad.clean_path_text
coerce_bool = _ad.coerce_bool
clamp_int = _ad.clamp_int
normalize_rate_limit = _ad.normalize_rate_limit
normalize_proxy = _ad.normalize_proxy
normalize_sublangs = _ad.normalize_sublangs

# ── Logging ──
write_persistent_log = _ad.write_persistent_log
get_recent_log_entries = _ad.get_recent_log_entries
log_crash = _ad.log_crash

# ── File I/O ──
atomic_write_json = _ad.atomic_write_json
download_file_atomic = _ad.download_file_atomic
load_json_file = _ad.load_json_file
verify_file_sha256 = _ad.verify_file_sha256
fetch_expected_sha256 = _ad.fetch_expected_sha256

# ── Cookie jar ──
cleanup_stale_cookie_jars = _ad.cleanup_stale_cookie_jars
write_cookies_netscape = _ad.write_cookies_netscape

# ── Rate limiter ──
RateLimiter = _ad.RateLimiter

# ── Config / History classes ──
Config = _ad.Config
History = _ad.History
