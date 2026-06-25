"""
Astra Downloader — Health check probes and version detection.

Re-exports health/probe-related symbols from the main astra_downloader module:
yt-dlp/ffmpeg/Deno/PO-token probes, companion self-update, auto-update throttle.
"""

try:
    import astra_downloader.astra_downloader as _ad
except (ImportError, AttributeError):
    import astra_downloader as _ad

# Version probes
get_ytdlp_version = _ad.get_ytdlp_version
get_ffmpeg_version = _ad.get_ffmpeg_version
_run_captured = _ad._run_captured

# PO Token provider
probe_po_token_provider = _ad.probe_po_token_provider
reset_po_token_provider_cache = _ad.reset_po_token_provider_cache
PO_TOKEN_PROVIDER_PORT = _ad.PO_TOKEN_PROVIDER_PORT
BGUTIL_POT_MIN_VERSION = _ad.BGUTIL_POT_MIN_VERSION

# Deno runtime
probe_deno_runtime = _ad.probe_deno_runtime
reset_deno_runtime_cache = _ad.reset_deno_runtime_cache
provision_deno = _ad.provision_deno
_parse_ytdlp_release_date = _ad._parse_ytdlp_release_date
ytdlp_needs_external_runtime = _ad.ytdlp_needs_external_runtime
YTDLP_EXTERNAL_RUNTIME_CUTOFF = _ad.YTDLP_EXTERNAL_RUNTIME_CUTOFF

# ffmpeg capabilities
parse_ffmpeg_major = _ad.parse_ffmpeg_major
check_ffmpeg_capabilities = _ad.check_ffmpeg_capabilities
reset_ffmpeg_capabilities_cache = _ad.reset_ffmpeg_capabilities_cache

# YouTube extractor args
build_youtube_extractor_args = _ad.build_youtube_extractor_args
is_youtube_url = _ad.is_youtube_url

# yt-dlp auto-update
should_check_ytdlp_update = _ad.should_check_ytdlp_update
maybe_auto_update_ytdlp = _ad.maybe_auto_update_ytdlp
_run_ytdlp_self_update = _ad._run_ytdlp_self_update

# Companion self-update
parse_companion_version_source = _ad.parse_companion_version_source
fetch_latest_companion_version = _ad.fetch_latest_companion_version
validate_companion_update_binary = _ad.validate_companion_update_binary
read_last_installed_update_sha256 = _ad.read_last_installed_update_sha256
record_last_installed_update_sha256 = _ad.record_last_installed_update_sha256
schedule_companion_update_restart = _ad.schedule_companion_update_restart
schedule_companion_process_exit = _ad.schedule_companion_process_exit
