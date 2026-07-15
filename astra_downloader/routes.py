"""HTTP route and loopback server boundary for Astra Downloader."""

import hmac
import queue
import threading
import time
from collections import deque
from pathlib import Path

from flask import Flask, jsonify, request

try:
    from ._compat import make_legacy_resolver
except ImportError:  # Flat source-path compatibility.
    from _compat import make_legacy_resolver


__all__ = (
    "create_api", "_ServerAdapter", "_build_wsgi_server", "RateLimiter",
    "RATE_LIMIT_DOWNLOAD_MAX", "RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS",
    "RATE_LIMIT_PICKFOLDER_MAX", "RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS",
    "CORS_MAX_AGE_SECONDS", "MAX_REQUEST_BYTES", "MAX_RESPONSE_BYTES",
)

_LEGACY_EXPORTS = tuple(
    name for name in __all__
    if name not in {"create_api", "_ServerAdapter", "_build_wsgi_server", "RateLimiter"}
)
_resolve_legacy = make_legacy_resolver(_LEGACY_EXPORTS)

_PUBLIC_RUNTIME_FIELDS = (
    "runtime",
    "installed",
    "version",
    "supported",
    "ejsReady",
    "minVersion",
    "reason",
    "configuredRuntime",
    "canProvisionDeno",
    "ytdlpNeedsRuntime",
    "advice",
    "source",
)


def _public_runtime_status(status):
    """Return the runtime capability contract without local filesystem data."""
    if not isinstance(status, dict):
        return {}
    return {key: status[key] for key in _PUBLIC_RUNTIME_FIELDS if key in status}


class RateLimiter:
    """Thread-safe sliding-window limiter with an injectable monotonic clock."""

    def __init__(self, max_events, window_seconds, clock=None):
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._clock = clock or time.monotonic
        self._lock = threading.Lock()
        self._buckets = {}

    def allow(self, key="default"):
        """Return ``(allowed, retry_after_seconds)`` for one bucket."""
        now = self._clock()
        cutoff = now - self.window_seconds
        with self._lock:
            events = self._buckets.setdefault(key, deque())
            while events and events[0] < cutoff:
                events.popleft()
            if len(events) >= self.max_events:
                retry = max(0.0, self.window_seconds - (now - events[0]))
                return False, retry
            events.append(now)
            return True, 0.0


class _ServerAdapter:
    """Uniform run/stop contract over waitress and Werkzeug servers."""

    def __init__(self, backend, server):
        self.backend = backend
        self._server = server

    def run(self):
        if self.backend == "waitress":
            self._server.run()
        else:
            self._server.serve_forever()

    def stop(self):
        try:
            if self.backend == "waitress":
                self._server.close()
            else:
                self._server.shutdown()
                self._server.server_close()
        except Exception:
            # Server teardown is best-effort from the GUI thread.
            pass


def _build_wsgi_server(chosen_port, api, waitress_factory=None, werkzeug_factory=None):
    """Build a loopback-only WSGI server, preferring waitress.

    Factories are injectable so backend selection, bind errors, and teardown
    remain testable without opening sockets or starting server threads.
    """

    if waitress_factory is None:
        try:
            from waitress.server import create_server as waitress_factory
        except ImportError:
            waitress_factory = None

    if callable(waitress_factory):
        server = waitress_factory(
            api,
            host="127.0.0.1",
            port=chosen_port,
            threads=8,
            ident="Astra Downloader",
        )
        return _ServerAdapter("waitress", server)

    if werkzeug_factory is None:
        from werkzeug.serving import make_server as werkzeug_factory
    try:
        server = werkzeug_factory("127.0.0.1", chosen_port, api, threaded=True)
    except SystemExit as exc:
        raise OSError(f"Werkzeug aborted while binding port {chosen_port}") from exc
    return _ServerAdapter("werkzeug", server)


_REQUIRED_API_DEPENDENCIES = frozenset({
    'APP_NAME',
    'APP_VERSION',
    'CORS_MAX_AGE_SECONDS',
    'DEFAULT_CONFIG',
    'MAX_REQUEST_BYTES',
    'MAX_RESPONSE_BYTES',
    'RATE_LIMIT_DOWNLOAD_MAX',
    'RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS',
    'RATE_LIMIT_PICKFOLDER_MAX',
    'RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS',
    'SERVER_PORT',
    'SERVICE_API_VERSION',
    'SERVICE_ID',
    'YTDLP_PATH',
    '_folder_pick_q',
    '_folder_picker_service',
    '_run_companion_self_update',
    '_run_ytdlp_self_update',
    'allowed_output_roots',
    'check_ffmpeg_capabilities',
    'clamp_int',
    'clean_text',
    'coerce_bool',
    'download_error_payload',
    'get_ffmpeg_version',
    'get_last_deno_provision_error',
    'get_recent_log_entries',
    'get_ytdlp_version',
    'is_youtube_url',
    'legacy_health_token_origin_allowlist',
    'normalize_extension_origin',
    'normalize_url',
    'probe_javascript_runtime',
    'probe_po_token_provider',
    'provision_deno',
    'read_update_recovery_status',
    'validate_download_request_body',
})


def create_api(config, dl_manager, history, *, dependencies):
    if not isinstance(dependencies, dict):
        raise TypeError("dependencies must be a dict")
    missing = sorted(set(_REQUIRED_API_DEPENDENCIES) - set(dependencies))
    if missing:
        raise ValueError("Missing API dependencies: " + ", ".join(missing))
    APP_NAME = dependencies['APP_NAME']
    APP_VERSION = dependencies['APP_VERSION']
    CORS_MAX_AGE_SECONDS = dependencies['CORS_MAX_AGE_SECONDS']
    DEFAULT_CONFIG = dependencies['DEFAULT_CONFIG']
    MAX_REQUEST_BYTES = dependencies['MAX_REQUEST_BYTES']
    MAX_RESPONSE_BYTES = dependencies['MAX_RESPONSE_BYTES']
    RATE_LIMIT_DOWNLOAD_MAX = dependencies['RATE_LIMIT_DOWNLOAD_MAX']
    RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS = dependencies['RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS']
    RATE_LIMIT_PICKFOLDER_MAX = dependencies['RATE_LIMIT_PICKFOLDER_MAX']
    RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS = dependencies['RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS']
    SERVER_PORT = dependencies['SERVER_PORT']
    SERVICE_API_VERSION = dependencies['SERVICE_API_VERSION']
    SERVICE_ID = dependencies['SERVICE_ID']
    YTDLP_PATH = dependencies['YTDLP_PATH']
    _folder_pick_q = dependencies['_folder_pick_q']
    _folder_picker_service = dependencies['_folder_picker_service']
    _run_companion_self_update = dependencies['_run_companion_self_update']
    _run_ytdlp_self_update = dependencies['_run_ytdlp_self_update']
    allowed_output_roots = dependencies['allowed_output_roots']
    check_ffmpeg_capabilities = dependencies['check_ffmpeg_capabilities']
    clamp_int = dependencies['clamp_int']
    clean_text = dependencies['clean_text']
    coerce_bool = dependencies['coerce_bool']
    download_error_payload = dependencies['download_error_payload']
    get_ffmpeg_version = dependencies['get_ffmpeg_version']
    get_last_deno_provision_error = dependencies['get_last_deno_provision_error']
    get_recent_log_entries = dependencies['get_recent_log_entries']
    get_ytdlp_version = dependencies['get_ytdlp_version']
    is_youtube_url = dependencies['is_youtube_url']
    legacy_health_token_origin_allowlist = dependencies['legacy_health_token_origin_allowlist']
    normalize_extension_origin = dependencies['normalize_extension_origin']
    normalize_url = dependencies['normalize_url']
    probe_javascript_runtime = dependencies['probe_javascript_runtime']
    probe_po_token_provider = dependencies['probe_po_token_provider']
    provision_deno = dependencies['provision_deno']
    read_update_recovery_status = dependencies['read_update_recovery_status']
    validate_download_request_body = dependencies['validate_download_request_body']

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
        resp.headers["Access-Control-Allow-Headers"] = (
            "Content-Type,X-Auth-Token,X-MDL-Client,"
            "X-MDL-Token,X-MDL-Token-Source"
        )
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
        runtime_status = _public_runtime_status(probe_javascript_runtime(
            configured_runtime=config.get('JavaScriptRuntime', 'auto')
        ))
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
            "denoRuntime": runtime_status,
            "javascriptRuntime": runtime_status,
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
            return cors_response({
                "ok": True,
                "denoRuntime": _public_runtime_status(runtime),
            })
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
        video_path = config.get('DownloadPath', '')
        audio_path = config.get('AudioDownloadPath', '')
        c = {
            'DownloadPath': video_path,
            'AudioDownloadPath': audio_path,
            'videoFormats': ['mp4', 'mkv', 'webm'],
            'audioFormats': ['mp3', 'm4a', 'opus', 'flac', 'wav'],
            'qualities': ['best', '2160', '1440', '1080', '720', '480'],
        }
        # v1.2.2: expose camelCase aliases for the path keys so the extension
        # can use the conventional JS casing. Capital-case keys remain for
        # backward compatibility with older extension builds.
        c['downloadPath'] = video_path
        c['audioDownloadPath'] = audio_path
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
        if _folder_picker_service() is None:
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
            except (OSError, RuntimeError, TypeError, ValueError):
                # The hint is advisory, but an indeterminate path must not be
                # represented as trusted. /download independently enforces it.
                inside = False
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


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
