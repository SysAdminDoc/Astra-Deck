"""Import-safe HTTP boundary during the owned-module migration."""

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

_resolve_legacy = make_legacy_resolver(__all__)


def __getattr__(name):
    return _resolve_legacy(name)


def __dir__():
    return sorted((*globals(), *__all__))
