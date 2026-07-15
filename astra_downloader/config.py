"""Configuration boundary for Astra Downloader.

Exports still owned by the legacy composition module resolve on first access.
Importing this boundary itself is dependency-light and never imports GUI/server
frameworks, which lets config tooling and tests run without PyQt or Flask.
"""

import re
from pathlib import Path
from urllib.parse import urlparse

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
    "DOWNLOAD_REQUEST_ALLOWED_FIELDS", "DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS",
)

_OWNED_EXPORTS = {
    "clean_text", "clean_path_text", "coerce_bool", "clamp_int",
    "normalize_rate_limit", "normalize_proxy", "normalize_sublangs",
    "normalize_url", "validate_download_request_body",
    "normalize_output_dir", "allowed_output_roots",
    "DOWNLOAD_REQUEST_ALLOWED_FIELDS", "DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_MAX_TEXT_FIELD = 500
_MAX_PATH_FIELD = 2048
DOWNLOAD_REQUEST_ALLOWED_FIELDS = frozenset({
    "url", "audioOnly", "format", "quality", "outputDir", "title",
    "referer", "cookies",
})
DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS = frozenset({
    "args", "argv", "flags", "extraArgs", "extractorArgs",
    "postprocessorArgs", "postprocessor_args", "externalDownloaderArgs",
    "ytDlpArgs", "ytdlpArgs", "yt_dlp_args",
})


def clean_text(value, default="", max_len=_MAX_TEXT_FIELD):
    if value is None:
        return default
    cleaned = _CONTROL_CHARS_RE.sub("", str(value)).strip()
    return cleaned[:max_len].rstrip() if len(cleaned) > max_len else cleaned


def clean_path_text(value):
    return clean_text(value, "", _MAX_PATH_FIELD)


def _normalize_long_text(value, default="", max_len=_MAX_TEXT_FIELD):
    if value is None:
        return default, False
    cleaned = _CONTROL_CHARS_RE.sub("", str(value)).strip()
    return (cleaned, True) if len(cleaned) > max_len else (cleaned, False)


def coerce_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def normalize_rate_limit(value):
    cleaned = clean_text(value, "", 32).upper()
    return cleaned if re.fullmatch(r"\d+[KMG]?", cleaned) else ""


def normalize_proxy(value):
    cleaned = clean_text(value, "", 512)
    if not cleaned:
        return ""
    parsed = urlparse(cleaned)
    schemes = {"http", "https", "socks", "socks4", "socks4a", "socks5", "socks5h"}
    return cleaned if parsed.scheme.lower() in schemes and parsed.netloc else ""


def normalize_sublangs(value):
    cleaned = clean_text(value, "en", 80)
    cleaned = re.sub(r"[^a-zA-Z0-9,\-]", "", cleaned)
    return cleaned or "en"


def normalize_url(value):
    url, too_long = _normalize_long_text(value, "", 4096)
    if too_long:
        return None, "URL is too long to download safely."
    if not url or any(character.isspace() for character in url):
        return None, "Enter a valid http or https URL."
    parsed = urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return None, "Enter a valid http or https URL."
    return url, None


def validate_download_request_body(body):
    """Reject unreviewed client fields before any queue or process side effect."""
    if not isinstance(body, dict) or not body.get("url"):
        return None, "Missing download URL.", None
    keys = {str(key) for key in body}
    forbidden = sorted(keys & DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS)
    if forbidden:
        return (
            None,
            "Client-supplied yt-dlp flags are not allowed. The companion builds yt-dlp arguments server-side.",
            "unsupported-ytdlp-flags",
        )
    unknown = sorted(keys - DOWNLOAD_REQUEST_ALLOWED_FIELDS)
    if unknown:
        return (
            None,
            "Unsupported /download field(s): {}.".format(", ".join(unknown)),
            "unsupported-download-fields",
        )
    return body, None, None


def allowed_output_roots(config):
    """Return unique, resolved directories that downloads may target."""
    raw_roots = []
    for key in ("DownloadPath", "AudioDownloadPath"):
        value = config.get(key, "") if config else ""
        if value:
            raw_roots.append(value)
    extra = (config.get("ExtraOutputRoots", []) if config else []) or []
    if isinstance(extra, list):
        raw_roots.extend(str(value) for value in extra if isinstance(value, str) and value)

    resolved = []
    seen = set()
    for raw in raw_roots:
        try:
            path = Path(raw).expanduser()
            if not path.is_absolute():
                continue
            candidate = path.resolve()
        except (OSError, RuntimeError):
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        resolved.append(candidate)
    return resolved


def normalize_output_dir(value, default_dir=None, allowed_roots=None):
    """Validate, confine, create, and return an absolute output directory."""
    raw, too_long = _normalize_long_text(value, "", _MAX_PATH_FIELD)
    if too_long:
        return None, "Output folder path is too long."
    if not raw:
        raw, too_long = _normalize_long_text(default_dir, "", _MAX_PATH_FIELD)
        if too_long:
            return None, "Default output folder path is too long."
    if not raw:
        raw = str(Path.home() / "Videos")
    try:
        path = Path(raw).expanduser()
        if not path.is_absolute():
            return None, "Choose an absolute output folder."
        if allowed_roots:
            try:
                resolved = path.resolve()
            except (OSError, RuntimeError):
                return None, "Output folder path could not be resolved."
            if not any(_is_path_under(resolved, root) for root in allowed_roots):
                return None, "Output folder is outside the configured download locations."
        path.mkdir(parents=True, exist_ok=True)
        if not path.is_dir():
            return None, "Output path is not a folder."
        return str(path), None
    except (OSError, RuntimeError) as error:
        return None, f"Cannot use output folder: {error}"


def _is_path_under(child, root):
    try:
        child.resolve().relative_to(root)
        return True
    except (ValueError, OSError, RuntimeError):
        return False


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
