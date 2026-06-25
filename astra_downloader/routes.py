"""
Astra Downloader — Flask route definitions and HTTP server.

Re-exports HTTP/API-related symbols from the main astra_downloader module:
create_api, CORS, rate limiting, DNS rebinding guard, server adapter.
"""

try:
    import astra_downloader.astra_downloader as _ad
except (ImportError, AttributeError):
    import astra_downloader as _ad

create_api = _ad.create_api
_ServerAdapter = _ad._ServerAdapter
_build_wsgi_server = _ad._build_wsgi_server
RateLimiter = _ad.RateLimiter
RATE_LIMIT_DOWNLOAD_MAX = _ad.RATE_LIMIT_DOWNLOAD_MAX
RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS = _ad.RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS
RATE_LIMIT_PICKFOLDER_MAX = _ad.RATE_LIMIT_PICKFOLDER_MAX
RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS = _ad.RATE_LIMIT_PICKFOLDER_WINDOW_SECONDS
CORS_MAX_AGE_SECONDS = _ad.CORS_MAX_AGE_SECONDS
MAX_REQUEST_BYTES = _ad.MAX_REQUEST_BYTES
MAX_RESPONSE_BYTES = _ad.MAX_RESPONSE_BYTES
