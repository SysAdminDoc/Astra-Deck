"""Configuration boundary for Astra Downloader.

Exports still owned by the legacy composition module resolve on first access.
Importing this boundary itself is dependency-light and never imports GUI/server
frameworks, which lets config tooling and tests run without PyQt or Flask.
"""

import os
import json
import math
import re
import threading
import uuid
from pathlib import Path
from urllib.parse import urlparse

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver

try:
    from .companion_ports import PORT_FALLBACKS, SERVER_PORT
except ImportError:  # Flat source-path compatibility.
    from companion_ports import PORT_FALLBACKS, SERVER_PORT


__all__ = (
    "APP_NAME", "APP_VERSION", "SERVICE_ID", "SERVICE_API_VERSION",
    "SERVER_PORT", "PORT_FALLBACKS", "MAX_CONCURRENT", "MAX_QUEUED_TOTAL",
    "DEFAULT_CONFIG", "INSTALL_DIR", "CONFIG_PATH", "HISTORY_PATH",
    "CORS_MAX_AGE_SECONDS", "RATE_LIMIT_DOWNLOAD_MAX",
    "RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS", "MAX_REQUEST_BYTES",
    "MAX_RESPONSE_BYTES", "HELPER_DOWNLOAD_MAX_BYTES", "sanitize_config",
    "normalize_url", "normalize_output_dir", "normalize_download_section",
    "normalize_playlist_items",
    "validate_download_request_body",
    "allowed_output_roots", "clean_text", "clean_path_text", "coerce_bool",
    "clamp_int", "normalize_rate_limit", "normalize_proxy", "normalize_sublangs",
    "write_persistent_log", "get_recent_log_entries", "log_crash",
    "atomic_write_json", "download_file_atomic", "load_json_file",
    "backup_corrupt_file", "sanitize_history_entries", "query_history_entries",
    "verify_file_sha256", "fetch_expected_sha256", "cleanup_stale_cookie_jars",
    "write_cookies_netscape", "RateLimiter", "Config", "History",
    "DOWNLOAD_REQUEST_ALLOWED_FIELDS", "DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS",
    "ConfigStore", "HistoryStore",
)

_OWNED_EXPORTS = {
    "clean_text", "clean_path_text", "coerce_bool", "clamp_int",
    "normalize_rate_limit", "normalize_proxy", "normalize_sublangs",
    "bound_output_template_fields",
    "normalize_output_template",
    "normalize_url", "normalize_download_section", "normalize_playlist_items",
    "validate_download_request_body",
    "normalize_output_dir", "allowed_output_roots",
    "DEFAULT_CONFIG", "sanitize_config",
    "ConfigStore", "HistoryStore", "atomic_write_json", "load_json_file",
    "backup_corrupt_file", "sanitize_history_entries",
    "DOWNLOAD_REQUEST_ALLOWED_FIELDS", "DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_MAX_TEXT_FIELD = 500
_MAX_PATH_FIELD = 2048
MAX_LOCAL_JSON_BYTES = 16 * 1024 * 1024
DOWNLOAD_REQUEST_ALLOWED_FIELDS = frozenset({
    "url", "audioOnly", "format", "quality", "outputDir", "title",
    "referer", "cookies", "section", "playlistItems",
})
DOWNLOAD_REQUEST_FORBIDDEN_YTDLP_ARG_FIELDS = frozenset({
    "args", "argv", "flags", "extraArgs", "extractorArgs",
    "postprocessorArgs", "postprocessor_args", "externalDownloaderArgs",
    "ytDlpArgs", "ytdlpArgs", "yt_dlp_args",
})


def _env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    lowered = str(value).strip().lower()
    if lowered in {"1", "true", "yes", "on"}:
        return True
    if lowered in {"0", "false", "no", "off"}:
        return False
    return default


DEFAULT_CONFIG = {
    "DownloadPath": str(Path.home() / "Videos"),
    "AudioDownloadPath": "",
    "ServerPort": SERVER_PORT,
    "ServerToken": "",
    "LegacyHealthTokenEcho": _env_bool("ASTRA_LEGACY_HEALTH_TOKEN_ECHO", False),
    "LegacyHealthTokenOrigins": os.environ.get("ASTRA_LEGACY_HEALTH_TOKEN_ORIGINS", ""),
    "EmbedMetadata": True,
    "EmbedThumbnail": True,
    "EmbedChapters": True,
    "EmbedSubs": False,
    "SubLangs": "en",
    "SponsorBlock": False,
    "SponsorBlockAction": "remove",
    "ConcurrentFragments": 4,
    # How many downloads run at once (was the hardcoded MAX_CONCURRENT=3).
    "MaxConcurrentDownloads": 3,
    # yt-dlp --retries / --fragment-retries. 10 matches yt-dlp's own default,
    # so the shipped value preserves current behavior while letting users on
    # flaky networks raise it.
    "DownloadRetries": 10,
    "JavaScriptRuntime": "auto",
    "AutoUpdateYtDlp": True,
    # yt-dlp release channel the self-updater tracks. Nightly is yt-dlp's own
    # recommendation for regular users: the monthly stable channel lags YouTube
    # breakage by weeks, while nightly ships same-day extractor fixes.
    "YtDlpUpdateChannel": "nightly",
    "RateLimit": "",
    "Proxy": "",
    "Language": "system",
    "StartMinimized": False,
    "CloseToTray": True,
    "NotifyOnComplete": True,
    # Privacy-sensitive clipboard monitoring is opt-in. Matching links are
    # staged in the GUI and never enqueued without an explicit user action.
    "ClipboardLinkGrabber": False,
    "LastYtDlpUpdateCheck": "",
    "ExtraOutputRoots": [],
    "LastFfmpegCheck": "",
    "MaxFileSizeMB": 0,
    # yt-dlp output template (filename + optional subdirs), relative to the
    # download root. Empty = the built-in default. Validated against a field
    # allowlist so a template can never drive the output path with arbitrary
    # fields/traversal (CVE-2024-38519 posture).
    "OutputTemplate": "",
    "NativeChromeExtensionIds": os.environ.get("ASTRA_NATIVE_CHROME_EXTENSION_IDS", ""),
    "NativeFirefoxExtensionIds": os.environ.get(
        "ASTRA_NATIVE_FIREFOX_EXTENSION_IDS",
        "ytkit@sysadmindoc.github.io",
    ),
}


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


_SAFE_OUTPUT_FIELDS = frozenset({
    "title", "id", "ext", "uploader", "uploader_id", "channel", "channel_id",
    "upload_date", "release_date", "playlist_title", "playlist", "playlist_index",
    "resolution", "height", "width", "fps", "format_id", "autonumber", "epoch",
    "duration_string", "season_number", "episode_number", "view_count", "like_count",
})
_OUTPUT_FIELD_RE = re.compile(r"%\((\w+)")
# Free-text fields whose expansion is attacker/uploader controlled in length.
# Everything else in the allowlist expands to a short id, number, or date.
_LONG_TEXT_OUTPUT_FIELDS = frozenset({
    "title", "uploader", "uploader_id", "channel", "channel_id",
    "playlist_title", "playlist",
})
_OUTPUT_TOKEN_RE = re.compile(r"%\((\w+)\)(0?\d+)?(?:\.(\d+))?([sdBjlqDSU])")
# Total bytes the free-text parts of a rendered template may consume. Windows
# MAX_PATH is 260, so a template must leave room for the download root, the
# separators, and the extension.
_OUTPUT_TEXT_BUDGET = 200
_OUTPUT_TEXT_FLOOR = 40


def bound_output_template_fields(template):
    """Cap every free-text expansion in an already-validated template.

    The built-in templates bound their fields (`%(title).200B`); a custom
    `%(uploader)s/%(title)s.%(ext)s` did not, so a 200+ character title under a
    deep DownloadPath rendered past MAX_PATH and failed with an opaque file
    error. Unbounded text fields gain a byte bound and over-generous explicit
    bounds are clamped, with the budget split across the fields the template
    actually uses. Idempotent: re-normalizing a saved template is a no-op.
    """
    # `%%` is a literal percent, so `%%(title)s` is literal text and must not
    # be rewritten. Split it out and rewrite only real expansion segments.
    segments = template.split("%%")
    tokens = [
        match
        for segment in segments
        for match in _OUTPUT_TOKEN_RE.finditer(segment)
        if match.group(1) in _LONG_TEXT_OUTPUT_FIELDS
    ]
    if not tokens:
        return template
    budget = max(_OUTPUT_TEXT_FLOOR, _OUTPUT_TEXT_BUDGET // len(tokens))

    def rewrite(match):
        field, pad, precision, conversion = match.groups()
        if field not in _LONG_TEXT_OUTPUT_FIELDS or conversion not in ("s", "B"):
            return match.group(0)
        limit = min(int(precision), budget) if precision else budget
        # An unbounded `%(field)s` becomes the byte-bounded form the built-in
        # templates use; an explicit `.Ns` keeps character semantics.
        conversion = "B" if precision is None else conversion
        return f"%({field}){pad or ''}.{limit}{conversion}"

    return "%%".join(_OUTPUT_TOKEN_RE.sub(rewrite, segment) for segment in segments)


def normalize_output_template(value):
    """Return a safe yt-dlp output template (relative to the download root) or
    "" when empty/invalid. Rejects absolute paths, `..` traversal, unsafe
    characters, and any field outside the allowlist; requires `%(ext)s` so the
    extension is always preserved. This keeps a user-supplied template from
    driving the output path with arbitrary fields (CVE-2024-38519 posture)."""
    tpl = clean_text(value, "", 300).strip()
    if not tpl:
        return ""
    norm = tpl.replace("\\", "/")
    if norm.startswith("/") or re.match(r"^[A-Za-z]:", norm) or ".." in norm.split("/"):
        return ""
    if not re.fullmatch(r"[A-Za-z0-9 %()._\-/\[\]]+", norm):
        return ""
    if "%(ext)s" not in norm:
        return ""
    fields = _OUTPUT_FIELD_RE.findall(norm)
    if not fields or any(f not in _SAFE_OUTPUT_FIELDS for f in fields):
        return ""
    # Printf-syntax check: after removing literal %% and every well-formed
    # %(field)[pad][.prec]conv token, no stray % may remain. Without this an
    # unclosed "%(title" or a lone "50%" passed the charset/field checks and
    # then failed EVERY download at yt-dlp startup with an opaque
    # "Invalid output template" error.
    stripped = re.sub(r"%\(\w+\)(?:0?\d+)?(?:\.\d+)?[sdBjlqDSU]", "", norm.replace("%%", ""))
    if "%" in stripped:
        return ""
    return bound_output_template_fields(norm)


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


def _parse_section_timestamp(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        seconds = float(value)
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        parts = raw.split(":")
        if len(parts) > 3:
            return None
        try:
            values = [float(part) for part in parts]
        except (TypeError, ValueError, OverflowError):
            return None
        if any(part < 0 for part in values):
            return None
        if len(values) > 1 and any(part >= 60 for part in values[1:]):
            return None
        seconds = sum(
            part * (60 ** (len(values) - index - 1))
            for index, part in enumerate(values)
        )
    else:
        return None
    if not math.isfinite(seconds) or seconds < 0 or seconds > 86400:
        return None
    return round(seconds, 3)


def normalize_download_section(value):
    """Normalize an accurate re-cut range expressed as seconds or HH:MM:SS."""
    if value in (None, ""):
        return None, None
    if not isinstance(value, dict):
        return None, "Section must contain start and end timestamps."
    unknown = sorted(str(key) for key in value if str(key) not in {"start", "end"})
    if unknown:
        return None, "Unsupported section field(s): {}.".format(", ".join(unknown))
    start = _parse_section_timestamp(value.get("start"))
    end = _parse_section_timestamp(value.get("end"))
    if start is None or end is None:
        return None, "Section start and end must be timestamps between 0:00 and 24:00:00."
    if end <= start:
        return None, "Section end must be later than its start."
    if end - start < 0.1:
        return None, "Section must be at least 0.1 seconds long."
    return {"start": start, "end": end}, None


def normalize_playlist_items(value):
    """Return a bounded, deduplicated list of positive yt-dlp playlist indexes."""
    if value in (None, ""):
        return None, None
    if not isinstance(value, (list, tuple)):
        return None, "Playlist items must be an array of item numbers."
    if not value:
        return None, "Select at least one playlist item."
    if len(value) > 200:
        return None, "Select no more than 200 playlist items at once."
    items = []
    seen = set()
    for raw in value:
        if isinstance(raw, bool):
            return None, "Playlist item numbers must be positive integers."
        if isinstance(raw, int):
            item = raw
        elif isinstance(raw, str) and re.fullmatch(r"\d+", raw.strip()):
            item = int(raw.strip())
        else:
            return None, "Playlist item numbers must be positive integers."
        if item < 1 or item > 100000:
            return None, "Playlist item numbers must be between 1 and 100000."
        if item not in seen:
            items.append(item)
            seen.add(item)
    if not items:
        return None, "Select at least one playlist item."
    return sorted(items), None


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
    if "format" in body and not isinstance(body["format"], str):
        return None, "Download format must be a string.", "invalid-download-format"
    if "quality" in body and not isinstance(body["quality"], str):
        return None, "Download quality must be a string.", "invalid-download-quality"
    if "section" in body:
        section, section_error = normalize_download_section(body.get("section"))
        if section_error:
            return None, section_error, "invalid-download-section"
        body = dict(body)
        body["section"] = section
    if "playlistItems" in body:
        playlist_items, items_error = normalize_playlist_items(body.get("playlistItems"))
        if items_error:
            return None, items_error, "invalid-playlist-items"
        body = dict(body)
        body["playlistItems"] = playlist_items
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


def sanitize_config(raw):
    """Return the bounded, schema-known companion configuration."""
    source = raw if isinstance(raw, dict) else {}
    data = {
        key: source.get(key, value)
        for key, value in DEFAULT_CONFIG.items()
    }
    data["DownloadPath"] = clean_path_text(data.get("DownloadPath")) or DEFAULT_CONFIG["DownloadPath"]
    data["AudioDownloadPath"] = clean_path_text(data.get("AudioDownloadPath"))
    data["ServerPort"] = clamp_int(data.get("ServerPort"), SERVER_PORT, 1024, 65535)
    token = clean_text(data.get("ServerToken"), "", 128)
    data["ServerToken"] = token if re.fullmatch(r"[A-Za-z0-9_\-]{16,128}", token) else uuid.uuid4().hex
    for key in (
        "EmbedMetadata", "EmbedThumbnail", "EmbedChapters", "EmbedSubs",
        "SponsorBlock", "AutoUpdateYtDlp", "StartMinimized", "CloseToTray",
        "NotifyOnComplete", "ClipboardLinkGrabber", "LegacyHealthTokenEcho",
    ):
        data[key] = coerce_bool(data.get(key), DEFAULT_CONFIG[key])
    data["SubLangs"] = normalize_sublangs(data.get("SubLangs"))
    data["SponsorBlockAction"] = "mark" if data.get("SponsorBlockAction") == "mark" else "remove"
    data["ConcurrentFragments"] = clamp_int(data.get("ConcurrentFragments"), 4, 1, 32)
    data["MaxConcurrentDownloads"] = clamp_int(data.get("MaxConcurrentDownloads"), 3, 1, 10)
    data["DownloadRetries"] = clamp_int(data.get("DownloadRetries"), 10, 0, 50)
    runtime = clean_text(data.get("JavaScriptRuntime"), "auto", 16).lower()
    data["JavaScriptRuntime"] = runtime if runtime in {"auto", "deno", "node"} else "auto"
    channel = clean_text(data.get("YtDlpUpdateChannel"), "nightly", 16).lower()
    data["YtDlpUpdateChannel"] = channel if channel in {"stable", "nightly"} else "nightly"
    data["RateLimit"] = normalize_rate_limit(data.get("RateLimit"))
    data["Proxy"] = normalize_proxy(data.get("Proxy"))
    language = clean_text(data.get("Language"), "system", 16).replace("-", "_")
    allowed_languages = {
        "system", "ar", "de", "en", "es", "fr", "it", "ja", "ko",
        "pt_BR", "ru", "zh_CN",
    }
    data["Language"] = language if language in allowed_languages else "system"
    data["LastYtDlpUpdateCheck"] = clean_text(data.get("LastYtDlpUpdateCheck"), "", 40)
    data["LastFfmpegCheck"] = clean_text(data.get("LastFfmpegCheck"), "", 40)
    data["MaxFileSizeMB"] = clamp_int(data.get("MaxFileSizeMB"), 0, 0, 102400)
    data["OutputTemplate"] = normalize_output_template(data.get("OutputTemplate"))
    data["NativeChromeExtensionIds"] = clean_text(data.get("NativeChromeExtensionIds"), "", 2048)
    data["NativeFirefoxExtensionIds"] = clean_text(data.get("NativeFirefoxExtensionIds"), "", 2048)
    data["LegacyHealthTokenOrigins"] = clean_text(data.get("LegacyHealthTokenOrigins"), "", 2048)
    extra = data.get("ExtraOutputRoots")
    if not isinstance(extra, list):
        extra = []
    data["ExtraOutputRoots"] = [
        cleaned
        for item in extra[:16]
        if isinstance(item, str) and (cleaned := clean_path_text(item))
    ]
    return data


def atomic_write_json(path, data):
    """Durably replace a JSON document without exposing partial contents."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(temporary, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            if temporary.exists():
                temporary.unlink()
        except OSError:
            # reason: JSON scratch cleanup is best-effort after replacement or failure
            pass


def backup_corrupt_file(path, timestamp=None):
    """Move malformed state aside for support and recovery."""
    path = Path(path)
    if not path.exists():
        return None
    if timestamp is None:
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup = path.with_name(f"{path.name}.corrupt-{timestamp}")
    try:
        path.replace(backup)
        return backup
    except OSError:
        return None


def load_json_file(path, fallback, *, backup=backup_corrupt_file,
                   max_bytes=MAX_LOCAL_JSON_BYTES):
    """Read bounded JSON state, quarantining malformed files before fallback."""
    path = Path(path)
    if not path.exists():
        return fallback
    try:
        if path.stat().st_size > max_bytes:
            backup(path)
            return fallback
        with open(path, 'r', encoding='utf-8') as handle:
            return json.load(handle)
    except (OSError, ValueError, TypeError):
        backup(path)
        return fallback


def sanitize_history_entries(raw, limit=500):
    """Normalize bounded download history from local or imported state."""
    if not isinstance(raw, list):
        return []
    entries = []
    for item in raw[-max(1, int(limit)):]:
        if not isinstance(item, dict):
            continue
        section, _section_error = normalize_download_section(item.get("section"))
        entry = {
            "id": clean_text(item.get("id"), "", 120),
            "url": clean_text(item.get("url"), "", 4096),
            "title": clean_text(item.get("title"), "(untitled)", 500) or "(untitled)",
            "filename": clean_path_text(item.get("filename")),
            "format": clean_text(item.get("format"), "", 16),
            "quality": clean_text(item.get("quality"), "", 16),
            "audioOnly": coerce_bool(item.get("audioOnly"), False),
            "date": clean_text(item.get("date"), "", 40),
            "duration": max(0, clamp_int(item.get("duration"), 0, 0, 60 * 60 * 24 * 30)),
            "status": clean_text(item.get("status"), "complete", 32) or "complete",
        }
        if section:
            entry["section"] = section
        entries.append(entry)
    return entries


def query_history_entries(entries, *, query="", status="", fmt="",
                          date_from="", date_to="", sort="newest",
                          offset=0, limit=50):
    """Filter, sort, and page a bounded sanitized history collection."""
    query = str(query or "").strip().casefold()
    status = str(status or "").strip().casefold()
    fmt = str(fmt or "").strip().casefold()
    date_from = str(date_from or "").strip()
    date_to = str(date_to or "").strip()
    sort = "oldest" if sort == "oldest" else "newest"
    try:
        offset = max(0, int(offset))
    except (TypeError, ValueError, OverflowError):
        offset = 0
    try:
        limit = max(1, min(500, int(limit)))
    except (TypeError, ValueError, OverflowError):
        limit = 50

    indexed = []
    for index, entry in enumerate(entries if isinstance(entries, list) else []):
        if not isinstance(entry, dict):
            continue
        entry_status = str(entry.get("status") or "complete").strip().casefold()
        entry_format = str(entry.get("format") or "").strip().casefold()
        entry_date = str(
            entry.get("date") or entry.get("completedAt") or entry.get("timestamp") or ""
        )[:10]
        haystack = "\n".join((
            str(entry.get("title") or ""),
            str(entry.get("filename") or ""),
        )).casefold()
        if query and query not in haystack:
            continue
        if status and status != "all" and entry_status != status:
            continue
        if fmt and fmt != "all" and entry_format != fmt:
            continue
        if date_from and (not entry_date or entry_date < date_from):
            continue
        if date_to and (not entry_date or entry_date > date_to):
            continue
        indexed.append((entry_date, index, entry))

    indexed.sort(
        key=lambda item: (item[0], item[1]),
        reverse=sort == "newest",
    )
    filtered_total = len(indexed)
    page = [item[2] for item in indexed[offset:offset + limit]]
    return {
        "history": page,
        "count": len(page),
        "total": len(entries) if isinstance(entries, list) else 0,
        "filteredTotal": filtered_total,
        "offset": offset,
        "limit": limit,
        "hasMore": offset + len(page) < filtered_total,
        "sort": sort,
    }


class ConfigStore:
    """Transactional config persistence with explicit filesystem dependencies."""

    def __init__(self, *, install_dir, path, sanitizer, loader, writer, logger,
                 read_only=False):
        self._install_dir = install_dir
        self._path = path
        self._sanitizer = sanitizer
        self._loader = loader
        self._writer = writer
        self._logger = logger
        self._read_only = bool(read_only)
        self._lock = threading.RLock()
        # Session-only overrides (e.g. a fallback ServerPort after a bind
        # conflict): visible through get()/data so the running process uses
        # them, but never serialized — save()/update() persist _data only.
        self._session_overrides = {}
        self._resolve(self._install_dir).mkdir(parents=True, exist_ok=True)
        self._data = self._sanitizer(self._loader(self._resolve(self._path), {}))
        self._persisted_data = dict(self._data)
        if not self._read_only:
            self.save()

    @staticmethod
    def _resolve(value):
        return value() if callable(value) else value

    def get(self, key, default=None):
        with self._lock:
            if key in self._session_overrides:
                return self._session_overrides[key]
            return self._data.get(key, default)

    def get_persisted(self, key, default=None):
        """The durable value, ignoring any session-only override."""
        with self._lock:
            return self._data.get(key, default)

    def set(self, key, value):
        with self._lock:
            self._data[key] = value

    def set_session(self, key, value):
        """Override a key for this process lifetime without persisting it."""
        with self._lock:
            self._session_overrides[key] = value

    def update(self, mapping):
        with self._lock:
            if self._read_only:
                return False
            candidate = dict(self._data)
            candidate.update(mapping)
            saved = self._save_candidate_unlocked(candidate)
            if saved:
                # An explicit write re-asserts these keys; a session override
                # must not keep shadowing the user's new value.
                for key in mapping:
                    self._session_overrides.pop(key, None)
            return saved

    def save(self):
        with self._lock:
            if self._read_only:
                return False
            return self._save_candidate_unlocked(self._data)

    def _save_candidate_unlocked(self, candidate):
        candidate = self._sanitizer(candidate)
        try:
            self._writer(self._resolve(self._path), candidate)
        except Exception as error:
            self._data = dict(self._persisted_data)
            self._logger(f"Config save failed: {error}")
            return False
        self._data = candidate
        self._persisted_data = dict(candidate)
        return True

    @property
    def data(self):
        with self._lock:
            merged = dict(self._data)
            merged.update(self._session_overrides)
            return merged


class HistoryStore:
    """Bounded history persistence with explicit serialization dependencies."""

    def __init__(self, *, path, sanitizer, loader, writer, logger, limit=500):
        self._path = path
        self._sanitizer = sanitizer
        self._loader = loader
        self._writer = writer
        self._logger = logger
        self._limit = max(1, int(limit))
        self._lock = threading.Lock()
        if not self._resolve_path().exists():
            self._write([])

    def _resolve_path(self):
        return self._path() if callable(self._path) else self._path

    def load(self):
        with self._lock:
            return self._sanitizer(self._loader(self._resolve_path(), []))

    def add(self, entry):
        with self._lock:
            data = self._sanitizer(self._loader(self._resolve_path(), []))
            data.append(entry)
            return self._write_unlocked(data[-self._limit:])

    def clear(self):
        with self._lock:
            return self._write_unlocked([])

    def replace(self, entries):
        with self._lock:
            return self._write_unlocked(entries)

    def _write(self, data):
        with self._lock:
            return self._write_unlocked(data)

    def _write_unlocked(self, data):
        try:
            self._writer(self._resolve_path(), self._sanitizer(data))
            return True
        except Exception as error:
            self._logger(f"History save failed: {error}")
            return False


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
