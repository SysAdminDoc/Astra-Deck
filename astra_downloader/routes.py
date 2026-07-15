"""HTTP server boundary for Astra Downloader."""

import threading
import time
from collections import deque

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
    if name not in {"_ServerAdapter", "_build_wsgi_server", "RateLimiter"}
)
_resolve_legacy = make_legacy_resolver(_LEGACY_EXPORTS)


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


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
