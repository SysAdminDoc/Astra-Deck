"""Import-safe runtime health policy and compatibility boundary."""

import re
import subprocess
import threading
import time
from pathlib import Path

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver


__all__ = (
    "get_ytdlp_version", "get_ffmpeg_version", "_run_captured",
    "probe_po_token_provider", "reset_po_token_provider_cache",
    "PO_TOKEN_PROVIDER_PORT", "BGUTIL_POT_MIN_VERSION", "probe_deno_runtime",
    "probe_javascript_runtime", "build_javascript_runtime_args",
    "reset_deno_runtime_cache", "provision_deno", "_parse_ytdlp_release_date",
    "ytdlp_needs_external_runtime", "YTDLP_EXTERNAL_RUNTIME_CUTOFF",
    "DENO_MIN_VERSION", "NODE_MIN_VERSION", "parse_ffmpeg_major",
    "check_ffmpeg_capabilities", "reset_ffmpeg_capabilities_cache",
    "build_youtube_extractor_args", "is_youtube_url", "should_check_ytdlp_update",
    "maybe_auto_update_ytdlp", "_run_ytdlp_self_update",
    "read_update_recovery_status", "atomic_copy_verified",
    "parse_companion_version_source", "fetch_latest_companion_version",
    "validate_companion_update_binary", "probe_companion_update_binary",
    "read_last_installed_update_sha256", "record_last_installed_update_sha256",
    "schedule_companion_update_restart", "schedule_companion_process_exit",
    "_compare_semver",
    "ExecutableVersionProbe", "parse_ytdlp_version_output",
    "parse_ffmpeg_version_output",
    "PoTokenProviderProbe",
    "FfmpegCapabilitiesProbe",
    "parse_javascript_runtime_version", "javascript_runtime_supported",
    "probe_javascript_execution", "evaluate_javascript_runtime",
)

PO_TOKEN_PROVIDER_PORT = 4416
BGUTIL_POT_MIN_VERSION = "1.3.0"
YTDLP_EXTERNAL_RUNTIME_CUTOFF = (2026, 4, 1)
DENO_MIN_VERSION = "2.3.0"
NODE_MIN_VERSION = "22.0.0"

_YOUTUBE_HOST_RE = re.compile(
    r'^https?://(?:[^/]+\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?:/|$|\?)',
    re.IGNORECASE,
)


def is_youtube_url(url):
    """Return whether a URL points at a supported YouTube property."""
    return bool(_YOUTUBE_HOST_RE.match(url or ''))


def _compare_semver(a, b):
    """Compare numeric release segments while conservatively ignoring suffixes."""
    def parts(value):
        if not isinstance(value, str):
            return []
        result = []
        for chunk in value.strip().lstrip('vV').split('.'):
            digits = ''
            for character in chunk:
                if not character.isdigit():
                    break
                digits += character
            if not digits:
                break
            result.append(int(digits))
            if digits != chunk:
                break
        return result

    left, right = parts(a), parts(b)
    length = max(len(left), len(right))
    left += [0] * (length - len(left))
    right += [0] * (length - len(right))
    return -1 if left < right else 1 if left > right else 0


def _parse_ytdlp_release_date(version_string):
    """Parse a yt-dlp date release into a comparable date tuple."""
    if not isinstance(version_string, str):
        return None
    match = re.match(r'(\d{4})\.(\d{1,2})\.(\d{1,2})', version_string.strip())
    if not match:
        return None
    try:
        year, month, day = (int(match.group(index)) for index in range(1, 4))
    except (TypeError, ValueError):
        return None
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return year, month, day


def ytdlp_needs_external_runtime(version_string, cutoff=YTDLP_EXTERNAL_RUNTIME_CUTOFF):
    """Return whether a yt-dlp release is new enough to require an external runtime."""
    parsed = _parse_ytdlp_release_date(version_string)
    return parsed is not None and parsed >= cutoff


def build_javascript_runtime_args(readiness):
    """Return explicit yt-dlp runtime selection for a verified capability probe."""
    if not isinstance(readiness, dict):
        return []
    if readiness.get('supported') is not True or readiness.get('ejsReady') is not True:
        return []
    runtime = readiness.get('runtime')
    path = readiness.get('path')
    if runtime not in {'deno', 'node'} or not path:
        return []
    return ['--no-js-runtimes', '--js-runtimes', f'{runtime}:{path}']


def build_youtube_extractor_args(url, po_token_provider=None,
                                 default_provider_port=PO_TOKEN_PROVIDER_PORT):
    """Build SABR and optional PO-token provider arguments for YouTube URLs."""
    if not is_youtube_url(url):
        return []
    args = ['--extractor-args', 'youtube:formats=duplicate']
    if po_token_provider and po_token_provider.get('ok'):
        port = po_token_provider.get('port') or default_provider_port
        args += [
            '--extractor-args',
            f'youtubepot-bgutilhttp:base_url=http://127.0.0.1:{port}',
        ]
    else:
        # No reachable PO-token provider: the default web/mweb clients now need
        # GVS proof-of-origin tokens and otherwise return SABR-only formats or
        # HTTP 403. Prefer the currently token-exempt clients (tv, android_vr)
        # so extraction degrades gracefully instead of failing outright, with
        # web kept last as a best-effort fallback. yt-dlp merges these youtube
        # extractor args with the formats=duplicate entry above.
        args += ['--extractor-args', 'youtube:player_client=tv,android_vr,web']
    return args


def parse_ffmpeg_major(version_string):
    """Extract the numeric major from a canonical ffmpeg release string."""
    if not version_string:
        return None
    match = re.match(r'(\d+)\.', str(version_string))
    return int(match.group(1)) if match else None


def parse_javascript_runtime_version(runtime, output):
    if not output:
        return None
    first_line = output.strip().splitlines()[0] if output.strip() else ''
    match = re.search(r'(\d+\.\d+\.\d+)', first_line)
    if match:
        return match.group(1)
    return first_line[:32] if runtime == 'deno' and first_line else None


def javascript_runtime_supported(runtime, version, *, deno_min=DENO_MIN_VERSION,
                                 node_min=NODE_MIN_VERSION):
    if runtime not in {'deno', 'node'}:
        return False
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version.strip()):
        return False
    minimum = deno_min if runtime == 'deno' else node_min
    return _compare_semver(version, minimum) >= 0


def probe_javascript_execution(runtime, executable, *, runner, marker,
                               timeout=1.5):
    if runtime == 'deno':
        args = [str(executable), 'eval', '--no-config', f"console.log('{marker}')"]
    elif runtime == 'node':
        args = [
            str(executable), '--input-type=commonjs', '-e',
            f"process.stdout.write('{marker}')",
        ]
    else:
        return False
    return marker in runner(args, timeout=timeout)


def evaluate_javascript_runtime(runtime, path, source, *, runner, marker,
                                timeout=1.5, deno_min=DENO_MIN_VERSION,
                                node_min=NODE_MIN_VERSION):
    minimum = deno_min if runtime == 'deno' else node_min
    try:
        output = runner([str(path), '--version'], timeout=timeout)
        version = parse_javascript_runtime_version(runtime, output)
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
    supported = javascript_runtime_supported(
        runtime, version, deno_min=deno_min, node_min=node_min
    )
    if not supported:
        return {
            'runtime': runtime, 'version': version, 'path': path, 'source': source,
            'supported': False, 'ejsReady': False, 'minVersion': minimum,
            'reason': 'runtime-version-unsupported',
        }
    try:
        ejs_ready = probe_javascript_execution(
            runtime, path, runner=runner, marker=marker, timeout=timeout
        )
    except Exception:
        ejs_ready = False
    return {
        'runtime': runtime, 'version': version, 'path': path, 'source': source,
        'supported': True, 'ejsReady': ejs_ready, 'minVersion': minimum,
        'reason': 'ready' if ejs_ready else 'runtime-execution-failed',
    }


def _run_captured(args, timeout=5, *, runner=None, creationflags=0):
    """Capture a diagnostic subprocess without raising into health endpoints."""
    runner = subprocess.run if runner is None else runner
    try:
        result = runner(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=creationflags,
        )
        return (result.stdout or '') + (result.stderr or '')
    except Exception:
        return ''


def parse_ytdlp_version_output(output):
    first = output.strip().splitlines()[0] if output and output.strip() else ''
    return first[:32] or None


def parse_ffmpeg_version_output(output):
    first = output.splitlines()[0] if output else ''
    match = re.search(r'ffmpeg version (\S+)', first)
    return (match.group(1) if match else '')[:64] or None


class ExecutableVersionProbe:
    """Thread-safe TTL cache for an injected executable version command."""

    def __init__(self, *, path, args, parser, runner, clock=time.time, ttl_seconds=3600):
        self._path = path
        self._args = tuple(args)
        self._parser = parser
        self._runner = runner
        self._clock = clock
        self._ttl_seconds = max(0, float(ttl_seconds))
        self._value = None
        self._checked_at = 0.0
        self._lock = threading.Lock()

    @staticmethod
    def _resolve(value):
        return value() if callable(value) else value

    def get(self, force=False):
        path = Path(self._resolve(self._path))
        if not path.exists():
            return None
        with self._lock:
            now = self._clock()
            if (
                not force
                and self._value is not None
                and (now - self._checked_at) < self._ttl_seconds
            ):
                return self._value
            self._value = self._parser(self._runner([str(path), *self._args]))
            self._checked_at = now
            return self._value

    def reset(self):
        with self._lock:
            self._value = None
            self._checked_at = 0.0

    def prime(self, value, checked_at=None):
        """Publish a version already verified by an update transaction."""
        with self._lock:
            self._value = value
            self._checked_at = self._clock() if checked_at is None else float(checked_at)


class PoTokenProviderProbe:
    """Cached liveness/version probe for an injected local PO-token provider."""

    def __init__(self, *, http_get, clock=time.time, port=PO_TOKEN_PROVIDER_PORT,
                 min_version=BGUTIL_POT_MIN_VERSION, ttl_seconds=30):
        self._http_get = http_get
        self._clock = clock
        self._port = int(port)
        self._min_version = str(min_version)
        self._ttl_seconds = max(0, float(ttl_seconds))
        self._value = None
        self._checked_at = 0.0
        self._has_checked = False
        self._lock = threading.Lock()

    def probe(self, force=False, timeout=1.0):
        with self._lock:
            now = self._clock()
            if (
                not force
                and self._has_checked
                and (now - self._checked_at) < self._ttl_seconds
            ):
                return self._value
            result = None
            for path in ('/ping', '/'):
                try:
                    response = self._http_get(
                        f'http://127.0.0.1:{self._port}{path}',
                        timeout=timeout,
                    )
                except Exception:
                    continue
                if not getattr(response, 'ok', False):
                    continue
                try:
                    payload = response.json()
                except (TypeError, ValueError):
                    payload = None
                version = None
                if isinstance(payload, dict):
                    raw = payload.get('version') or payload.get('plugin_version')
                    if raw is not None:
                        version = str(raw)[:32]
                stale = bool(
                    version and _compare_semver(version, self._min_version) < 0
                )
                result = {
                    'ok': True,
                    'port': self._port,
                    'version': version,
                    'stale': stale,
                    'minVersion': self._min_version,
                }
                break
            self._value = result
            self._checked_at = now
            self._has_checked = True
            return result

    def reset(self):
        with self._lock:
            self._value = None
            self._checked_at = 0.0
            self._has_checked = False


class FfmpegCapabilitiesProbe:
    """Cached ffmpeg support-floor assessment over an injected version source."""

    def __init__(self, *, version_getter, clock=time.time, minimum_major=7,
                 ttl_seconds=3600):
        self._version_getter = version_getter
        self._clock = clock
        self._minimum_major = max(0, int(minimum_major))
        self._ttl_seconds = max(0, float(ttl_seconds))
        self._value = None
        self._checked_at = 0.0
        self._lock = threading.Lock()

    def check(self, force=False):
        with self._lock:
            now = self._clock()
            if (
                not force
                and self._value is not None
                and (now - self._checked_at) < self._ttl_seconds
            ):
                return dict(self._value)
            major = parse_ffmpeg_major(self._version_getter())
            if major is None:
                result = {
                    'majorVersion': None,
                    'current': None,
                    'message': 'ffmpeg version not detected (first-run bootstrap or snapshot build)',
                }
            else:
                current = major >= self._minimum_major
                if current:
                    message = f'ffmpeg {major}.x meets the {self._minimum_major}+ floor'
                else:
                    message = (
                        f'ffmpeg {major}.x is below the {self._minimum_major}+ floor; '
                        'consider re-downloading via the bundled bootstrap'
                    )
                result = {
                    'majorVersion': major,
                    'current': current,
                    'message': message,
                }
            self._value = result
            self._checked_at = now
            return dict(result)

    def reset(self):
        with self._lock:
            self._value = None
            self._checked_at = 0.0


_OWNED_EXPORTS = {
    "PO_TOKEN_PROVIDER_PORT", "BGUTIL_POT_MIN_VERSION",
    "YTDLP_EXTERNAL_RUNTIME_CUTOFF", "DENO_MIN_VERSION", "NODE_MIN_VERSION",
    "is_youtube_url", "_compare_semver", "_parse_ytdlp_release_date",
    "ytdlp_needs_external_runtime", "build_javascript_runtime_args",
    "build_youtube_extractor_args", "parse_ffmpeg_major",
    "_run_captured", "ExecutableVersionProbe", "parse_ytdlp_version_output",
    "parse_ffmpeg_version_output",
    "PoTokenProviderProbe",
    "FfmpegCapabilitiesProbe",
    "parse_javascript_runtime_version", "javascript_runtime_supported",
    "probe_javascript_execution", "evaluate_javascript_runtime",
}
_resolve_legacy = make_legacy_resolver(
    name for name in __all__ if name not in _OWNED_EXPORTS
)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
