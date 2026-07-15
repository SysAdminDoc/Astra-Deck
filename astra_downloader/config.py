"""Configuration boundary for Astra Downloader.

Exports still owned by the legacy composition module resolve on first access.
Importing this boundary itself is dependency-light and never imports GUI/server
frameworks, which lets config tooling and tests run without PyQt or Flask.
"""

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver


__all__ = (
    "APP_NAME", "APP_VERSION", "SERVICE_ID", "SERVICE_API_VERSION",
    "SERVER_PORT", "PORT_FALLBACKS", "MAX_CONCURRENT", "MAX_QUEUED_TOTAL",
    "DEFAULT_CONFIG", "INSTALL_DIR", "CONFIG_PATH", "HISTORY_PATH",
    "CORS_MAX_AGE_SECONDS", "RATE_LIMIT_DOWNLOAD_MAX",
    "RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS", "MAX_REQUEST_BYTES",
    "MAX_RESPONSE_BYTES", "HELPER_DOWNLOAD_MAX_BYTES", "sanitize_config",
    "normalize_url", "normalize_output_dir", "validate_download_request_body",
    "allowed_output_roots", "clean_text", "clean_path_text", "coerce_bool",
    "clamp_int", "normalize_rate_limit", "normalize_proxy", "normalize_sublangs",
    "write_persistent_log", "get_recent_log_entries", "log_crash",
    "atomic_write_json", "download_file_atomic", "load_json_file",
    "verify_file_sha256", "fetch_expected_sha256", "cleanup_stale_cookie_jars",
    "write_cookies_netscape", "RateLimiter", "Config", "History",
)

_resolve_legacy = make_legacy_resolver(__all__)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
