(() => {
    'use strict';

    // extension/features/download-ui/index.js
    //
    // Monolith peel for Download UI. The module owns the primary
    // MediaDLManager singleton, download entry point, download popup,
    // progress panel, and the four download feature objects;
    // ytkit.js requires this factory and supplies the shared runtime
    // dependencies; this file is the extension's canonical implementation.

    const DOWNLOAD_HEALTH_SCHEMA_VERSION = 2;
    // Rows one CSV export will carry. The user is told when it truncates.
    const EXPORT_ROW_LIMIT = 500;
    const COOKIE_HANDOFF_DISCLOSURE_KEY = 'ytkit_cookie_handoff_disclosed_v1';
    const COOKIE_HANDOFF_PROTOCOL_VERSION = 1;
    const COOKIE_HANDOFF_MINIMUM_API = 2;
    // A cold 40 MB one-file companion start can take roughly 12 seconds.
    // Eight 1.5-second polls gives the normal and recovery paths the same
    // documented window to finish unpacking, initialize Qt, and bind HTTP.
    const AUTO_START_RETRY_BUDGET = 8;

    function getCompanionPortCatalogue() {
        const catalogue = globalThis.YTKitCore?.companionPorts;
        if (catalogue?.ports?.length) return catalogue;
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                return require('../../core/companion-ports');
            } catch (_) {
                // reason: direct Node tests do not execute the manifest bootstrap.
            }
        }
        return null;
    }

    const COMPANION_PORT_CATALOGUE = getCompanionPortCatalogue();
    const COMPANION_PORTS = Object.freeze(
        Array.isArray(COMPANION_PORT_CATALOGUE?.ports)
            ? COMPANION_PORT_CATALOGUE.ports.slice()
            : []
    );

    function normalizeCookieExpiry(value) {
        const normalized = Number(value);
        return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
    }

    function parseSectionTimestampInput(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const parts = raw.split(':');
        if (parts.length > 3 || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return null;
        const values = parts.map(Number);
        if (values.some((part, index) => !Number.isFinite(part)
            || part < 0
            || (index > 0 && part >= 60))) return null;
        const seconds = values.reduce(
            (total, part, index) => total + (part * (60 ** (values.length - index - 1))),
            0
        );
        return seconds <= 86400 ? Math.round(seconds * 1000) / 1000 : null;
    }

    const FORMAT_ESTIMATE_QUALITY_VALUES = Object.freeze([
        'best', '2160', '1440', '1080', '720', '480'
    ]);
    const FORMAT_ESTIMATE_CACHE_TTL_MS = 5 * 60 * 1000;
    const FORMAT_ESTIMATE_FAILURE_TTL_MS = 15 * 1000;
    const FORMAT_ESTIMATE_CACHE_MAX_ENTRIES = 12;
    const FORMAT_ESTIMATE_KEY_MAX_LENGTH = 256;

    function normalizeFormatSize(value) {
        const bytes = Number(value);
        return Number.isFinite(bytes) && bytes > 0 && bytes <= Number.MAX_SAFE_INTEGER
            ? Math.round(bytes)
            : 0;
    }

    function formatByteSize(value) {
        const bytes = normalizeFormatSize(value);
        if (!bytes) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let scaled = bytes;
        let unitIndex = 0;
        while (scaled >= 1024 && unitIndex < units.length - 1) {
            scaled /= 1024;
            unitIndex += 1;
        }
        if (unitIndex === 0) return `${bytes} B`;
        const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${scaled.toFixed(digits)} ${units[unitIndex]}`;
    }

    function formatSizeCandidate(format) {
        if (!format || typeof format !== 'object') return null;
        const exact = normalizeFormatSize(format.filesize);
        if (exact) return { bytes: exact, approximate: false };
        const approximate = normalizeFormatSize(format.filesize_approx);
        return approximate ? { bytes: approximate, approximate: true } : null;
    }

    function largerFormatSize(current, candidate) {
        if (!candidate) return current;
        if (!current || candidate.bytes > current.bytes) return candidate;
        if (candidate.bytes === current.bytes && candidate.approximate) {
            return { ...current, approximate: true };
        }
        return current;
    }

    function addFormatSizes(video, audio) {
        if (!video || !audio) return null;
        return {
            bytes: video.bytes + audio.bytes,
            approximate: video.approximate || audio.approximate
        };
    }

    /**
     * Mirror the companion's conservative format-size preflight. A quality
     * estimate is only returned when yt-dlp reported a size for a muxed
     * stream or for both sides of a separate video/audio pair. Bitrate and
     * duration are deliberately ignored: they are not a trustworthy download
     * size for the selected format.
     */
    function estimateFormatSize(formats, quality = 'best') {
        const cap = quality === 'best' ? null : Number(quality);
        const entries = (Array.isArray(formats) ? formats : [])
            .map(format => ({
                format,
                size: formatSizeCandidate(format),
                height: Number(format?.height)
            }))
            .filter(entry => entry.size && entry.format?.has_video && entry.height > 0)
            .filter(entry => cap === null || (Number.isFinite(cap) && cap > 0 && entry.height <= cap));
        if (!entries.length) return null;

        const muxed = entries
            .filter(entry => entry.format.has_audio)
            .reduce((best, entry) => largerFormatSize(best, entry.size), null);
        const videoOnly = entries
            .filter(entry => !entry.format.has_audio)
            .reduce((best, entry) => largerFormatSize(best, entry.size), null);
        const audioOnly = (Array.isArray(formats) ? formats : [])
            .filter(format => format?.has_audio && !format?.has_video)
            .map(formatSizeCandidate)
            .reduce((best, candidate) => largerFormatSize(best, candidate), null);
        return largerFormatSize(muxed, addFormatSizes(videoOnly, audioOnly));
    }

    /**
     * Reduce a companion `POST /formats` payload to what the quality ladder
     * needs to know.
     *
     * A rung can only be honored when a stream exists at or below it (asking
     * for 480p on a 1080p-only upload silently returns 1080p) and when it does
     * not sit above everything on offer (asking for 4K on a 720p upload
     * silently returns 720p). Both cases used to render as a selectable chip.
     */
    function summarizeFormatProbe(probe) {
        const formats = Array.isArray(probe?.formats) ? probe.formats : [];
        const heights = Array.from(new Set(
            formats
                .filter(format => format && format.has_video && Number(format.height) > 0)
                .map(format => Number(format.height))
        )).sort((a, b) => b - a);
        const maxHeight = heights[0] || 0;
        const minHeight = heights.length ? heights[heights.length - 1] : 0;
        const qualitySizes = Object.fromEntries(
            FORMAT_ESTIMATE_QUALITY_VALUES.map(value => [value, estimateFormatSize(formats, value)])
        );
        return {
            heights,
            maxHeight,
            minHeight,
            formatCount: formats.length,
            qualitySizes,
            canHonor(value) {
                if (value === 'best') return true;
                const rung = Number(value);
                if (!Number.isFinite(rung) || rung <= 0 || !heights.length) return false;
                return rung <= maxHeight && heights.some(height => height <= rung);
            }
        };
    }

    function formatEstimateKey(videoId, url) {
        const raw = String(videoId || url || '').trim();
        return raw ? raw.slice(0, FORMAT_ESTIMATE_KEY_MAX_LENGTH) : '';
    }

    function createFormatEstimateStore({
        check = async () => ({ ok: false }),
        fetchJson = async () => ({ data: null }),
        baseUrl = () => '',
        now = () => Date.now(),
    } = {}) {
        const entries = new Map();
        const pending = new Map();

        function remember(key, entry) {
            // Delete first so a refresh becomes the newest item in the small
            // session cache; old video probes then fall out deterministically.
            entries.delete(key);
            entries.set(key, entry);
            while (entries.size > FORMAT_ESTIMATE_CACHE_MAX_ENTRIES) {
                entries.delete(entries.keys().next().value);
            }
        }

        function get(videoId, url) {
            const key = formatEstimateKey(videoId, url);
            if (!key) return null;
            const entry = entries.get(key);
            if (!entry) return null;
            if (entry.expiresAt <= now()) {
                entries.delete(key);
                return null;
            }
            return entry;
        }

        function setAvailable(videoId, url, probe) {
            const key = formatEstimateKey(videoId, url);
            if (!key) return null;
            const entry = {
                status: 'ready',
                summary: summarizeFormatProbe(probe),
                error: '',
                expiresAt: now() + FORMAT_ESTIMATE_CACHE_TTL_MS
            };
            remember(key, entry);
            return entry;
        }

        function setUnavailable(videoId, url, error) {
            const key = formatEstimateKey(videoId, url);
            if (!key) return null;
            const entry = {
                status: 'unavailable',
                summary: null,
                error: String(error?.message || error || 'Format sizes unavailable').slice(0, 160),
                expiresAt: now() + FORMAT_ESTIMATE_FAILURE_TTL_MS
            };
            remember(key, entry);
            return entry;
        }

        async function probe(videoId, url, { force = false } = {}) {
            const key = formatEstimateKey(videoId, url);
            if (!key) return setUnavailable('', '', 'Video unavailable');
            if (pending.has(key)) return pending.get(key);
            if (!force) {
                const cached = get(videoId, url);
                if (cached) return cached;
            } else {
                entries.delete(key);
            }

            const request = (async () => {
                try {
                    const status = await check();
                    if (!status?.ok || !status.token) throw new Error('Downloader not running');
                    const { response, data } = await fetchJson({
                        method: 'POST',
                        url: baseUrl() + '/formats',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Auth-Token': status.token,
                        },
                        data: JSON.stringify({ url }),
                        timeout: 65000,
                    });
                    if (!response || response.status < 200 || response.status >= 300 || !Array.isArray(data?.formats)) {
                        throw new Error(data?.error || 'Format list unavailable.');
                    }
                    return setAvailable(videoId, url, data);
                } catch (error) {
                    setUnavailable(videoId, url, error);
                    throw error;
                } finally {
                    pending.delete(key);
                }
            })();
            pending.set(key, request);
            return request;
        }

        function clear(videoId, url) {
            const key = formatEstimateKey(videoId, url);
            if (key) entries.delete(key);
        }

        return {
            get,
            probe,
            clear,
            formatBytes: formatByteSize,
            qualityValues: FORMAT_ESTIMATE_QUALITY_VALUES,
        };
    }

    function normalizeSectionInput(startValue, endValue) {
        const startRaw = String(startValue ?? '').trim();
        const endRaw = String(endValue ?? '').trim();
        if (!startRaw && !endRaw) return { section: null, error: '' };
        const start = parseSectionTimestampInput(startRaw);
        const end = parseSectionTimestampInput(endRaw);
        if (start === null || end === null) {
            return { section: null, error: 'Enter both clip times as seconds, MM:SS, or HH:MM:SS.' };
        }
        if (end <= start) {
            return { section: null, error: 'Clip end must be later than its start.' };
        }
        if (end - start < 0.1) {
            return { section: null, error: 'Clip must be at least 0.1 seconds long.' };
        }
        return { section: { start, end }, error: '' };
    }

    // A 426 carries its own explanation in the body; extensionFetchJson throws
    // on it, so the payload has to be recovered from the error rather than the
    // resolved response. Module scope so the boundary can be tested without
    // driving the whole feature.
    function companionApiMismatchFromError(error) {
        if (!error || error.response?.status !== 426) return null;
        const data = error.data && typeof error.data === 'object' ? error.data : {};
        if (data.code && data.code !== 'client-api-too-old') return null;
        return {
            error_code: 'client-api-too-old',
            error: typeof data.error === 'string' && data.error
                ? data.error.slice(0, 220)
                : undefined,
            advice: typeof data.remediation === 'string' && data.remediation
                ? data.remediation.slice(0, 220)
                : undefined,
            next_action: 'update-extension',
            companionApi: Number.isInteger(data.api) ? data.api : null,
            minimumClientApi: Number.isInteger(data.minimumClientApi) ? data.minimumClientApi : null,
        };
    }

    function normalizeDownloadHealthSnapshot(raw, authenticatedStatus = {}) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const port = Number(raw.port);
        const legacyIdentity = raw.token_required === true && Number.isInteger(port);
        if (raw.service !== 'astra-downloader' && !legacyIdentity) return null;
        const api = raw.api == null ? 1 : Number(raw.api);
        if (!Number.isInteger(api) || api < 1) return null;
        if (api > DOWNLOAD_HEALTH_SCHEMA_VERSION) {
            // The other half of the handshake. Returning null here read as
            // "that is not Astra Downloader" and the user got the install
            // prompt for a companion that was simply newer than this build.
            return { companionApiTooNew: true, api, minimumClientApi: null };
        }
        const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
        const boundedText = (value, maxLength = 64) => typeof value === 'string'
            ? value.slice(0, maxLength)
            : null;
        const ffmpeg = isObject(raw.ffmpegCapabilities) ? {
            version: boundedText(raw.ffmpegCapabilities.version),
            current: raw.ffmpegCapabilities.current !== false,
        } : null;
        const poTokenProvider = raw.poTokenProvider == null
            ? null
            : (isObject(raw.poTokenProvider) ? { ok: raw.poTokenProvider.ok === true } : null);
        const normalizeRuntime = (runtime) => isObject(runtime) ? {
            runtime: boundedText(runtime.runtime, 32),
            installed: runtime.installed === true,
            version: boundedText(runtime.version),
            supported: runtime.supported === true,
            ejsReady: runtime.ejsReady === true,
            ytdlpNeedsRuntime: runtime.ytdlpNeedsRuntime === true,
            source: boundedText(runtime.source, 32),
            advice: boundedText(runtime.advice, 240),
            canProvisionDeno: runtime.canProvisionDeno === true,
        } : null;
        const token = typeof authenticatedStatus.token === 'string' && authenticatedStatus.token
            ? authenticatedStatus.token
            : null;
        return {
            schemaVersion: api,
            service: 'astra-downloader',
            api,
            port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null,
            version: boundedText(raw.version),
            ytDlpVersion: boundedText(raw.ytDlpVersion),
            ffmpegCapabilities: ffmpeg,
            poTokenProvider,
            sabrSupport: raw.sabrSupport === 'native' || raw.sabrSupport === 'limited'
                ? raw.sabrSupport
                : null,
            javascriptRuntime: normalizeRuntime(raw.javascriptRuntime),
            denoRuntime: normalizeRuntime(raw.denoRuntime),
            token,
            tokenSource: token
                ? (authenticatedStatus.tokenSource === 'native' ? 'native' : 'legacy-health')
                : null
        };
    }

    function createDownloadUIFeature(deps = {}) {
        const {
            appState = { settings: {} },
            extensionFetchJson = async () => ({ data: null }),
            extensionFetchText = async () => '',
            showToast = () => {},
            DebugManager = { log() {} },
            DiagnosticLog = { record() {} },
            storageRead = () => null,
            storageWrite = () => {},
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            getVideoId = () => null,
            isWatchPagePath = () => false,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            TrustedHTML = { createHTML: (s) => s },
            openExternalUrl = async () => {},
            openProtocol = () => {},
            triggerDownload = async () => {},
            requestCobaltDownload = async () => ({
                ok: false,
                error: { code: 'COBALT_REQUEST_UNAVAILABLE', message: 'Self-hosted Cobalt requests are unavailable.' }
            }),
            requestNativeDownloaderToken = async () => ({ token: null, error: 'Native messaging unavailable' }),
            getExtensionRuntimeId = () => '',
            browserCookies = {},
            getProfileExportMode = () => 'safe-store',
            PageTypes = { WATCH: 'watch' },
            ICONS = {},
            BRAND = {},
            t = (_key, fallback) => fallback,
            getPlayerResponseGlobal = () => null,
            supportsPopover = () => false,
            createCloseWatcher = () => null,
            destroyCloseWatcher = () => {},
            setTimeoutFn = setTimeout,
            clearTimeoutFn = clearTimeout,
            setIntervalFn = setInterval,
            clearIntervalFn = clearInterval,
        } = deps;

        // Failure copy: name one of the localized causes in
        // extension/core/failure-copy.js and the next action it implies. The
        // companion's own error text never reaches the reader; it goes to
        // DebugManager and DiagnosticLog.
        const describeFailureCause = (error) => {
            const describe = globalThis.YTKitCore?.describeFailure;
            if (typeof describe === 'function') return describe(error, t);
            return t('failureCauseUnknown', 'Something unexpected went wrong. The diagnostic log has the details.');
        };
        const describeFailureWithLabel = (label, error) => {
            const withLabel = globalThis.YTKitCore?.describeFailureWithLabel;
            if (typeof withLabel === 'function') return withLabel(label, error, t);
            return label ? `${String(label).replace(/[.:]\s*$/, '')}: ${describeFailureCause(error)}` : describeFailureCause(error);
        };
        const logFailure = (context, error) => {
            try {
                DebugManager?.log?.('Download', `${context}: ${globalThis.YTKitCore?.failureDiagnosticText?.(error) || String(error?.message || error)}`);
            } catch (_) { /* reason: diagnostics must never break the surface reporting them */ }
        };

        // Newer extension-only releases have no companion asset, so GitHub's
        // /releases/latest/download route returns a 404 HTML page. Pin the
        // newest release that actually carries AstraDownloader.exe.
        const ASTRA_DOWNLOADER_RELEASE_EXE_URL = 'https://github.com/SysAdminDoc/AstraDownloader/releases/latest/download/AstraDownloader.exe';

        // ── MediaDL Server Manager ──
        // Caches server availability, provides install/status helpers, and auto-start logic.
        const MediaDLManager = {
            _status: null, // null = unknown, 'running', 'not-installed'
            _token: null,
            _tokenSource: null,
            _nativeTokenError: null,
            _nativeChannelRequired: false,
            // A non-Astra server answering /health on a companion port (e.g. a
            // stale/legacy downloader squatting 9751). Recorded so we can tell
            // the user exactly what is shadowing the companion instead of
            // failing with a generic "not installed" message. { port, version }.
            _foreignServer: null,
            _apiMismatch: null,
            _lastCheck: 0,
            _serverVersion: null,
            _autoStartAttempted: false,
            _checkPromise: null,
            _CHECK_INTERVAL: 30000, // Re-check every 30s

            // GitHub Release URL for the compiled installer exe
            INSTALLER_URL: ASTRA_DOWNLOADER_RELEASE_EXE_URL,
            INSTALLER_FILE_NAME: 'AstraDownloader.exe',
            INSTALLER_COMMAND: `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $out=Join-Path $env:TEMP 'AstraDownloader.exe'; Invoke-WebRequest -UseBasicParsing -Uri '${ASTRA_DOWNLOADER_RELEASE_EXE_URL}' -OutFile $out; Start-Process $out"`,
            INSTALLER_RUN_HINT: 'Open Downloads and double-click the setup file to install.',

            // Ports the server may have bound to. The shared catalogue is
            // loaded before this module in the extension manifest and in the
            // userscript bundle.
            _PORT_CANDIDATES: COMPANION_PORTS,
            _port: COMPANION_PORT_CATALOGUE?.primaryPort || null,
            _SERVICE_ID: 'astra-downloader',

            // Base URL for server calls. Always reflects the currently discovered port.
            baseUrl() { return 'http://127.0.0.1:' + this._port; },

            _isAstraDownloaderHealth(data) {
                if (!data) return false;
                if (data.service === this._SERVICE_ID) return true;
                // Backward-compatible acceptance for hardened builds that predate
                // the explicit service id but still expose the Astra-only health schema.
                return data.token_required === true && Number.isInteger(data.port);
            },

            _headers(extra = {}) {
                const headers = {
                    'X-MDL-Api': String(DOWNLOAD_HEALTH_SCHEMA_VERSION),
                    ...extra
                };
                if (this._tokenSource) headers['X-MDL-Token-Source'] = this._tokenSource;
                return headers;
            },

            async _requestNativeToken(options = {}) {
                try {
                    const result = await requestNativeDownloaderToken(options);
                    if (result && result.token) {
                        return {
                            token: result.token,
                            service: result.service || null,
                            api: Number.isInteger(result.api) ? result.api : null,
                            cookieCapability: result.cookieCapability || null,
                            error: null
                        };
                    }
                    return { token: null, error: result?.error || 'Native messaging token unavailable' };
                } catch (e) {
                    return { token: null, error: e?.message || 'Native messaging token failed' };
                }
            },

            // Quick health check — returns { ok, token, version, port } or { ok: false }.
            // Tries the cached port first, then probes the fallback list.
            async check(force) {
                const now = Date.now();
                if (!force && this._status === 'running' && this._token && (now - this._lastCheck < this._CHECK_INTERVAL)) {
                    return {
                        ok: true,
                        token: this._token,
                        tokenSource: this._tokenSource || 'legacy-health',
                        nativeTokenError: this._nativeTokenError,
                        nativeChannelRequired: this._nativeChannelRequired,
                        version: this._serverVersion,
                        port: this._port
                    };
                }
                if (this._checkPromise) return this._checkPromise;
                this._checkPromise = this._checkImpl(force).finally(() => { this._checkPromise = null; });
                return this._checkPromise;
            },

            async _pairWithCompanion(port) {
                const extensionId = String(getExtensionRuntimeId() || '').trim();
                if (!extensionId) return false;
                try {
                    const { data } = await extensionFetchJson({
                        method: 'POST',
                        url: 'http://127.0.0.1:' + port + '/pair-extension',
                        headers: this._headers({
                            'Content-Type': 'application/json',
                            'X-MDL-Client': 'MediaDL'
                        }),
                        data: JSON.stringify({ id: extensionId }),
                        timeout: 2000
                    });
                    if (data?.ok === true && data?.paired === true) {
                        DebugManager.log('MediaDL', `Paired extension ${extensionId} with Astra Downloader on port ${port}`);
                        return true;
                    }
                } catch (error) {
                    DebugManager.log('MediaDL', `Pairing failed on port ${port}: ${error?.message || error}`);
                }
                return false;
            },

            async _checkImpl(force) {
                const now = Date.now();
                let nativeToken = await this._requestNativeToken();
                // First non-Astra server found squatting a companion port, if any.
                let foreignServer = null;
                const tryPort = async (port) => {
                    try {
                        const headers = this._headers({ 'X-MDL-Client': 'MediaDL' });
                        if (nativeToken.token) headers['X-MDL-Token-Source'] = 'native';
                        const { data } = await extensionFetchJson({
                            method: 'GET',
                            url: 'http://127.0.0.1:' + port + '/health',
                            headers,
                            timeout: 1500
                        });
                        if (this._isAstraDownloaderHealth(data)) return data;
                        // Something answered /health here but it is NOT Astra
                        // Downloader — most often a stale/legacy downloader
                        // (e.g. an old YTYT-Downloader on 9751) that shadows the
                        // real companion. Remember the first one so the repair
                        // prompt can name the exact port instead of failing
                        // silently.
                        if (data && (data.token || data.status === 'ok' || data.version) && !foreignServer) {
                            foreignServer = { port, version: (data && data.version) || null };
                            DebugManager.log('MediaDL', `Port ${port} is occupied by a non-Astra downloader (v${foreignServer.version || '?'}); skipping`);
                        }
                    } catch (_) {
                        // reason: port may be occupied by unrelated local service; skip
                    }
                    return null;
                };

                // Try previously-known port first, then all others.
                const order = [this._port, ...this._PORT_CANDIDATES.filter(p => p !== this._port)];
                let nativeRequiredStatus = null;
                for (const port of order) {
                    const data = await tryPort(port);
                    if (data) {
                        // Pair only against the STRONG identity, not the
                        // legacy `token_required + port` heuristic that
                        // _isAstraDownloaderHealth also accepts. Anything
                        // local can squat a companion port and answer an
                        // unauthenticated /health — the foreignServer branch
                        // below exists because that is a real condition here —
                        // and the runtime ID of an unpacked install is derived
                        // from its path, so it identifies the machine. Only a
                        // server that names itself gets it.
                        if (!nativeToken.token && !data.token && data.service === this._SERVICE_ID) {
                            const paired = await this._pairWithCompanion(port);
                            if (paired) nativeToken = await this._requestNativeToken();
                        }
                        const token = nativeToken.token || data.token || null;
                        if (!token) {
                            if (data.nativeChannelRequired === true || data.legacyTokenEcho === false) {
                                nativeRequiredStatus = {
                                    ok: false,
                                    nativeChannelRequired: true,
                                    nativeTokenError: nativeToken.error,
                                    tokenSource: 'native-required',
                                    version: data.version || null,
                                    port,
                                };
                                DebugManager.log('MediaDL', `Astra Downloader on port ${port} requires native messaging for token bootstrap (${nativeToken.error || 'no native token'})`);
                                continue;
                            }
                            DebugManager.log('MediaDL', `Astra Downloader on port ${port} did not provide an auth token`);
                            continue;
                        }
                        this._port = port;
                        this._status = 'running';
                        this._token = token;
                        this._tokenSource = nativeToken.token ? 'native' : 'legacy-health';
                        this._nativeTokenError = nativeToken.token ? null : nativeToken.error;
                        this._nativeChannelRequired = false;
                        // Keep any squatter we passed on the way to the real
                        // companion: it still shadows a companion port and may
                        // win the race on the next restart. Fresh every check.
                        this._foreignServer = foreignServer;
                        this._serverVersion = data.version || null;
                        this._lastCheck = now;
                        DebugManager.log('MediaDL', `Server running on port ${port} (v${this._serverVersion || '?'}, auth=${this._tokenSource}, ${data.downloads || 0} active)`);
                        return {
                            ok: true,
                            token,
                            tokenSource: this._tokenSource,
                            nativeTokenError: this._nativeTokenError,
                            nativeChannelRequired: false,
                            version: this._serverVersion,
                            port
                        };
                    }
                }

                if (nativeRequiredStatus) {
                    this._port = nativeRequiredStatus.port;
                    this._status = 'native-required';
                    this._token = null;
                    this._tokenSource = null;
                    this._nativeTokenError = nativeRequiredStatus.nativeTokenError;
                    this._nativeChannelRequired = true;
                    this._foreignServer = foreignServer;
                    this._serverVersion = nativeRequiredStatus.version || null;
                    this._lastCheck = now;
                    return { ...nativeRequiredStatus, foreignServer };
                }

                this._status = 'not-installed';
                this._token = null;
                this._tokenSource = null;
                this._nativeTokenError = nativeToken.error;
                this._nativeChannelRequired = false;
                this._foreignServer = foreignServer;
                return { ok: false, foreignServer };
            },

            // v4.47.0 NF18: on-demand yt-dlp self-update via the
            // companion's /update-ytdlp endpoint.
            async updateYtdlp() {
                const probe = await this.check(true);
                if (!probe.ok) {
                    return {
                        ok: false,
                        status: 0,
                        error: 'Astra Downloader is not running. Start it and try again.',
                    };
                }
                try {
                    const { response, data } = await extensionFetchJson({
                        method: 'POST',
                        url: this.baseUrl() + '/update-ytdlp',
                        headers: this._headers({ 'Content-Type': 'application/json', 'X-Auth-Token': probe.token }),
                        data: '{}',
                        timeout: 130000,
                    });
                    if (data && typeof data === 'object') {
                        return { ...data, status: response.status };
                    }
                    return { ok: false, status: response.status, error: 'Empty response from /update-ytdlp.' };
                } catch (e) {
                    DebugManager.log('MediaDL', `updateYtdlp failed: ${e.message}`);
                    return { ok: false, status: 0, error: e.message || 'Network error while calling /update-ytdlp.' };
                }
            },

            // v4.47.0 NF6: on-demand Astra Downloader companion update.
            async updateCompanion() {
                const probe = await this.check(true);
                if (!probe.ok) {
                    return {
                        ok: false,
                        status: 0,
                        error: 'Astra Downloader is not running. Start it and try again.',
                    };
                }
                try {
                    const { response, data } = await extensionFetchJson({
                        method: 'POST',
                        url: this.baseUrl() + '/update',
                        headers: this._headers({ 'Content-Type': 'application/json', 'X-Auth-Token': probe.token }),
                        data: '{}',
                        timeout: 180000,
                    });
                    if (data && typeof data === 'object') {
                        return { ...data, status: response.status };
                    }
                    return { ok: false, status: response.status, error: 'Empty response from /update.' };
                } catch (e) {
                    DebugManager.log('MediaDL', `updateCompanion failed: ${e.message}`);
                    return { ok: false, status: 0, error: e.message || 'Network error while calling /update.' };
                }
            },

            // Try to auto-start the server via mediadl:// protocol and wait for it.
            async tryAutoStart(retries = AUTO_START_RETRY_BUDGET) {
                const current = await this.check(true);
                if (current.ok || current.nativeChannelRequired) return current;
                if (this._autoStartAttempted) {
                    return current;
                }
                this._autoStartAttempted = true;
                DebugManager.log('MediaDL', 'Attempting auto-start via mediadl:// protocol…');
                showToast(t('toastDlStarting', 'Starting Astra Downloader…'), '#3b82f6', { duration: 4 });
                openProtocol('mediadl://start');
                for (let i = 0; i < retries; i++) {
                    await new Promise(r => setTimeout(r, 1500));
                    const result = await this.check(true);
                    if (result.ok) {
                        showToast(t('toastDlStarted', 'Astra Downloader started!'), '#22c55e', { duration: 2 });
                        return result;
                    }
                    if (result.nativeChannelRequired) return result;
                }
                DebugManager.log('MediaDL', 'Auto-start failed — server did not respond');
                return { ok: false };
            },

            resetAutoStart() { this._autoStartAttempted = false; this._status = null; this._nativeChannelRequired = false; this._foreignServer = null; this._apiMismatch = null; },

            async copyInstallCommand() {
                try {
                    await navigator.clipboard.writeText(this.INSTALLER_COMMAND);
                    return true;
                } catch (_) {
                    return false;
                }
            },

            async downloadInstaller() {
                try {
                    await triggerDownload(this.INSTALLER_URL, this.INSTALLER_FILE_NAME, { showInFolder: true });
                    return true;
                } catch (_) {
                    return false;
                }
            },

            async runInstallAssist() {
                const copied = await this.copyInstallCommand();
                const downloaded = await this.downloadInstaller();
                if (!downloaded) {
                    void openExternalUrl(this.INSTALLER_URL).catch(() => {});
                }
                showToast(
                    copied
                        ? `Setup file ready. ${this.INSTALLER_RUN_HINT} The fallback command was copied too.`
                        : `Setup file ready. ${this.INSTALLER_RUN_HINT}`,
                    '#22c55e',
                    { duration: 8 }
                );
                return { copied, downloaded };
            },

            get isRunning() { return this._status === 'running'; },
            get token() { return this._token; },

            // Raise an element into the top layer when the platform supports
            // it, so it cannot be covered by the settings-panel popover. Falls
            // back to its stylesheet z-index when the API is missing or the
            // show call is rejected.
            _raiseOverlay(el) {
                if (!el) return false;
                let usePopover = false;
                try {
                    usePopover = supportsPopover() === true;
                } catch (_) {
                    // reason: feature detection must never block the overlay.
                }
                if (!usePopover || typeof el.showPopover !== 'function') return false;
                el.setAttribute('popover', 'manual');
                try {
                    el.showPopover();
                    return true;
                } catch (_) {
                    // reason: a browser can expose the API and still reject the call.
                    el.removeAttribute('popover');
                    return false;
                }
            },

            // Show install / retry prompt panel.
            showInstallPrompt(mode) {
                const existing = document.getElementById('ytkit-mediadl-install-prompt');
                if (existing) existing.remove();

                const isRetryMode = mode === 'retry';

                const prompt = document.createElement('div');
                prompt.id = 'ytkit-mediadl-install-prompt';
                prompt.className = 'ytkit-install-prompt';
                prompt.dataset.mode = isRetryMode ? 'repair' : 'install';
                prompt.dataset.state = isRetryMode ? 'warning' : 'ready';
                prompt.setAttribute('role', 'region');
                prompt.setAttribute('aria-labelledby', 'ytkit-install-prompt-title');
                prompt.setAttribute('aria-describedby', 'ytkit-install-prompt-desc');

                // ── Header ──
                const header = document.createElement('div');
                header.className = 'ytkit-install-prompt__header';
                const heading = document.createElement('div');
                heading.className = 'ytkit-install-prompt__heading';
                const eyebrow = document.createElement('span');
                eyebrow.className = 'ytkit-install-prompt__eyebrow';
                eyebrow.textContent = isRetryMode
                    ? t('dlInstallConnectionCheck', 'Connection check')
                    : t('dlInstallLocalDownloads', 'Local downloads');
                const titleEl = document.createElement('span');
                titleEl.id = 'ytkit-install-prompt-title';
                titleEl.className = 'ytkit-install-prompt__title';
                titleEl.textContent = isRetryMode
                    ? t('dlInstallReconnectTitle', 'Reconnect Astra Downloader')
                    : t('dlInstallSetupTitle', 'Set up local downloads');
                const closeBtn = document.createElement('button');
                closeBtn.className = 'ytkit-install-prompt__close';
                closeBtn.type = 'button';
                closeBtn.setAttribute('aria-label', t('dlInstallCloseAria', 'Close local downloader prompt'));
                closeBtn.textContent = '✕';
                closeBtn.onclick = () => prompt.remove();
                heading.appendChild(eyebrow);
                heading.appendChild(titleEl);
                header.appendChild(heading);
                header.appendChild(closeBtn);

                // ── Description ──
                const desc = document.createElement('p');
                desc.id = 'ytkit-install-prompt-desc';
                desc.className = 'ytkit-install-prompt__desc';
                const baseDesc = isRetryMode
                    ? t('dlInstallRepairDesc', 'Astra Deck cannot reach the downloader service right now. Start it again if it is installed, or run setup to repair the local service.')
                    : t('dlInstallSetupDesc', 'Enable reliable audio and video downloads by installing Astra Downloader on this device. One setup covers future downloads.');

                // A stale/legacy downloader squatting a companion port is a
                // common, confusing failure: /health answers, so the extension
                // used to just fail generically. Name the exact port + version
                // and point at Startup apps so the user can evict it. Rendered
                // as a closure so the retry/recheck handlers refresh it —
                // the squatter state changes when the user evicts it (or a
                // new one appears), and a stale blame line sent users chasing
                // a program that was already gone.
                const renderPromptDesc = () => {
                    const mismatch = this._apiMismatch;
                    if (mismatch) {
                        // The downloader is running and reachable. Saying
                        // "install it" here is the wrong instruction.
                        desc.textContent = t('dlInstallApiMismatchTpl',
                            'Astra Downloader is running, but this Astra Deck speaks an older API than it accepts{versions}. Update the extension, then choose Check again.')
                            .replace('{versions}', Number.isInteger(mismatch.minimumClientApi)
                                ? t('dlInstallApiVersionsTpl', ' (it needs at least API {minimum})')
                                    .replace('{minimum}', String(mismatch.minimumClientApi))
                                : '');
                        prompt.dataset.state = 'error';
                        return;
                    }
                    const foreign = this._foreignServer;
                    if (foreign && foreign.port) {
                        desc.textContent = t('dlInstallPortConflictTpl',
                            'Another program is answering on Astra Downloader’s port {port}{version}. It is usually a leftover downloader from an earlier install. Close it, remove it from Startup apps (look for “YTYT-Downloader” or “Astra Deck Downloader”), then start Astra Downloader and choose Check again.')
                            .replace('{port}', String(foreign.port))
                            .replace('{version}', foreign.version
                                ? t('dlInstallPortVersionTpl', ' (reporting version {version})').replace('{version}', foreign.version)
                                : '');
                        prompt.dataset.state = 'error';
                    } else {
                        desc.textContent = baseDesc;
                        if (prompt.dataset.state === 'error') delete prompt.dataset.state;
                    }
                };
                renderPromptDesc();

                const note = document.createElement('div');
                note.className = 'ytkit-install-prompt__note';
                note.setAttribute('role', 'status');
                note.setAttribute('aria-live', 'polite');
                note.textContent = isRetryMode
                    ? t('dlInstallRepairHint', 'Fastest path: start the service again first. If it still does not respond, run setup to repair the install.')
                    : t('dlInstallSetupHint', 'Recommended path: download setup, open the file, then return here and check again.');

                const steps = document.createElement('ol');
                steps.className = 'ytkit-install-prompt__steps';
                [
                    isRetryMode
                        ? t('dlInstallStepStart', 'Start the service again if the downloader is already installed.')
                        : t('dlInstallStepDownload', 'Download the Astra Downloader setup file.'),
                    t('dlInstallStepOpen', 'Open the setup file from Downloads and finish installation.'),
                    t('dlInstallStepCheck', 'Choose Check again so Astra Deck can confirm the service is ready.')
                ].forEach((copy) => {
                    const item = document.createElement('li');
                    item.className = 'ytkit-install-prompt__step';
                    item.textContent = copy;
                    steps.appendChild(item);
                });

                // ── Buttons ──
                const btnCol = document.createElement('div');
                btnCol.className = 'ytkit-install-prompt__actions';

                const setPromptButtonState = (button, label, tone = '') => {
                    const labelEl = button.querySelector('.ytkit-install-prompt__btn-label');
                    if (labelEl) labelEl.textContent = label;
                    const detail = button.dataset.detail || '';
                    button.setAttribute('aria-label', detail ? `${label}. ${detail}` : label);
                    button.classList.remove('is-success', 'is-danger');
                    if (tone === 'success') button.classList.add('is-success');
                    if (tone === 'danger') button.classList.add('is-danger');
                };

                const setPromptNote = (message, tone = 'ready') => {
                    prompt.dataset.state = tone;
                    note.textContent = message;
                };

                const makeBtn = (text, variant, onClick, detail = '') => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = `ytkit-install-prompt__btn ytkit-install-prompt__btn--${variant}`;
                    b.dataset.detail = detail;
                    b.setAttribute('aria-label', detail ? `${text}. ${detail}` : text);
                    const copy = document.createElement('span');
                    copy.className = 'ytkit-install-prompt__btn-copy';
                    const label = document.createElement('span');
                    label.className = 'ytkit-install-prompt__btn-label';
                    label.textContent = text;
                    copy.appendChild(label);
                    if (detail) {
                        const meta = document.createElement('span');
                        meta.className = 'ytkit-install-prompt__btn-meta';
                        meta.textContent = detail;
                        copy.appendChild(meta);
                    }
                    b.appendChild(copy);
                    b.onclick = onClick;
                    return b;
                };

                // 1. Retry / Start Server
                if (isRetryMode) {
                    const retryBtn = makeBtn(t('dlInstallStartService', 'Start service'), 'primary', async () => {
                        setPromptNote(t('dlInstallStartingService', 'Starting the Astra Downloader service…'), 'warning');
                        setPromptButtonState(retryBtn, t('dlInstallStarting', 'Starting…'));
                        retryBtn.disabled = true;
                        retryBtn.setAttribute('aria-busy', 'true');
                        this.resetAutoStart();
                        const result = await this.tryAutoStart(AUTO_START_RETRY_BUDGET);
                        if (result.ok) {
                            showToast(t('toastDlRunning', 'Astra Downloader is running!'), '#22c55e', { duration: 3 });
                            prompt.remove();
                        } else {
                            retryBtn.setAttribute('aria-busy', 'false');
                            renderPromptDesc();
                            setPromptNote(t('dlInstallNoResponse', 'The service did not respond. Run setup below to repair Astra Downloader, then check again.'), 'error');
                            setPromptButtonState(retryBtn, t('commonTryAgain', 'Try again'), 'danger');
                            retryBtn.disabled = false;
                        }
                    }, t('dlInstallStartDetail', 'Fastest fix if the downloader is installed but idle.'));
                    btnCol.appendChild(retryBtn);
                }

                // 2. Download setup
                const copyBtn = makeBtn(t('dlInstallDownloadSetup', 'Download setup'), 'accent', async () => {
                    setPromptNote(t('dlInstallDownloadingSetup', 'Downloading the setup file…'), 'warning');
                    setPromptButtonState(copyBtn, t('dlInstallDownloadingSetupShort', 'Downloading setup…'));
                    copyBtn.disabled = true;
                    copyBtn.setAttribute('aria-busy', 'true');
                    const result = await this.runInstallAssist();
                    copyBtn.setAttribute('aria-busy', 'false');
                    setPromptButtonState(copyBtn, result.downloaded
                        ? t('dlInstallSetupReady', 'Setup ready')
                        : t('dlInstallOpenSetup', 'Open setup file'), result.downloaded ? 'success' : '');
                    setPromptNote(
                        result.downloaded
                            ? t('dlInstallDownloadedHint', 'Setup downloaded. Open the file, finish installation, then choose Check again.')
                            : t('dlInstallOpenedHint', 'The setup file should be open. Finish installation, then choose Check again.'),
                        'success'
                    );
                    copyBtn.disabled = false;
                }, t('dlInstallDownloadDetail', 'Recommended. Installs or repairs Astra Downloader.'));
                btnCol.appendChild(copyBtn);

                // 3. Copy PowerShell command
                const dlBtn = makeBtn(t('dlInstallCopyCommand', 'Copy fallback command'), 'ghost', async () => {
                    const copied = await this.copyInstallCommand();
                    if (copied) {
                        setPromptButtonState(dlBtn, t('dlInstallCommandCopied', 'Command copied'), 'success');
                        setPromptNote(t('dlInstallCommandCopiedHint', 'Fallback command copied. Use it in PowerShell only if the setup file cannot run.'), 'success');
                        showToast(t('toastDlCmdCopied', 'Fallback install command copied. Use it only if you cannot run the downloaded setup file.'), '#3b82f6', { duration: 6 });
                        setTimeout(() => { setPromptButtonState(dlBtn, t('dlInstallCopyCommand', 'Copy fallback command')); }, 3500);
                    } else {
                        void openExternalUrl(this.INSTALLER_URL).catch(() => {});
                    }
                }, t('dlInstallCommandDetail', 'Use only if the downloaded setup file cannot run.'));
                btnCol.appendChild(dlBtn);

                // 4. "I just installed it" — re-check
                const recheckBtn = makeBtn(t('dlInstallCheckAgain', 'Check again'), 'ghost', async () => {
                    setPromptNote(t('dlInstallCheckingService', 'Checking for the Astra Downloader service…'), 'warning');
                    setPromptButtonState(recheckBtn, t('commonChecking', 'Checking…'));
                    recheckBtn.disabled = true;
                    recheckBtn.setAttribute('aria-busy', 'true');
                    this.resetAutoStart();
                    const result = await this.tryAutoStart(AUTO_START_RETRY_BUDGET);
                    if (result.ok) {
                        showToast(t('toastDlReady', 'Astra Downloader is ready.'), '#22c55e', { duration: 4 });
                        prompt.remove();
                    } else {
                        recheckBtn.setAttribute('aria-busy', 'false');
                        renderPromptDesc();
                        setPromptButtonState(recheckBtn, t('dlInstallNotDetected', 'Not detected yet'), 'danger');
                        setPromptNote(t('dlInstallNotDetectedHint', 'Setup was not detected yet. Make sure the installer finished, then check again.'), 'error');
                        recheckBtn.disabled = false;
                        setTimeout(() => { setPromptButtonState(recheckBtn, t('dlInstallCheckAgain', 'Check again')); }, 4000);
                    }
                }, t('dlInstallCheckDetail', 'Use this after running the setup file.'));
                btnCol.appendChild(recheckBtn);

                // 5. Dismiss
                if (!isRetryMode) {
                    const dismissBtn = makeBtn(t('dlInstallSkip', 'Skip for now'), 'quiet', () => {
                        prompt.remove();
                        storageWrite('ytkit_mediadl_prompt_dismissed', true);
                    });
                    btnCol.appendChild(dismissBtn);
                }

                prompt.appendChild(header);
                prompt.appendChild(desc);
                prompt.appendChild(note);
                prompt.appendChild(steps);
                prompt.appendChild(btnCol);
                document.body.appendChild(prompt);
                this._raiseOverlay(prompt);
            }
        };

        const downloadFormatEstimates = createFormatEstimateStore({
            check: () => MediaDLManager.check(),
            fetchJson: extensionFetchJson,
            baseUrl: () => MediaDLManager.baseUrl(),
        });
        if (globalThis.YTKitCore && typeof globalThis.YTKitCore === 'object') {
            globalThis.YTKitCore.downloadFormatEstimates = downloadFormatEstimates;
        }

        // Legacy wrapper
        function mediaDLDownload(videoUrl, audioOnly) {
            DebugManager.log('MediaDL', `Download requested (legacy): ${videoUrl} (audio=${audioOnly})`);
            ytKitDownload(videoUrl, audioOnly);
        }

        // Show a persistent download progress bar anchored to the bottom of the page.
        function showDownloadProgress(id, token, audioOnly) {
            const panelId = 'ytkit-dl-progress-' + id;
            document.getElementById(panelId)?.remove();

            const panel = document.createElement('div');
            panel.id = panelId;
            panel.className = 'ytkit-dl-progress';
            panel.setAttribute('role', 'status');
            panel.setAttribute('aria-live', 'polite');
            panel.setAttribute('aria-atomic', 'true');
            panel.setAttribute('aria-label', audioOnly
                ? t('dlProgressAriaAudio', 'Audio download progress')
                : t('dlProgressAriaVideo', 'Video download progress'));

            if (!document.getElementById('ytkit-dl-anim')) {
                const s = document.createElement('style');
                s.id = 'ytkit-dl-anim';
                // i18n-static: animation CSS payload, not user-visible copy.
                s.textContent = `
                    @keyframes ytkit-slide-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
                `;
                document.head.appendChild(s);
            }

            const header = document.createElement('div');
            header.className = 'ytkit-dl-progress__header';
            const badge = document.createElement('span');
            badge.className = 'ytkit-dl-progress__badge';
            badge.textContent = audioOnly
                ? t('dlProgressBadgeAudio', 'Audio Download')
                : t('dlProgressBadgeVideo', 'Video Download');
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'ytkit-dl-progress__close';
            closeBtn.setAttribute('aria-label', t('dlProgressDismissAria', 'Dismiss download progress'));
            closeBtn.textContent = '✕';
            header.appendChild(badge);
            header.appendChild(closeBtn);

            const title = document.createElement('div');
            title.className = 'ytkit-dl-progress__title';
            title.textContent = t('dlProgressPreparing', 'Preparing download…');

            const statusRow = document.createElement('div');
            statusRow.className = 'ytkit-dl-progress__status';
            const statePill = document.createElement('span');
            statePill.className = 'ytkit-dl-progress__state';
            statePill.textContent = t('dlProgressStatePreparing', 'Preparing');
            const statusCopy = document.createElement('span');
            statusCopy.className = 'ytkit-dl-progress__status-copy';
            statusCopy.textContent = audioOnly
                ? t('dlProgressConnectAudio', 'Connecting to Astra Downloader.')
                : t('dlProgressConnectVideo', 'Connecting to Astra Downloader.');
            statusRow.appendChild(statePill);
            statusRow.appendChild(statusCopy);

            const bar = document.createElement('div');
            bar.className = 'ytkit-dl-progress__bar';
            const fill = document.createElement('div');
            fill.className = 'ytkit-dl-progress__fill';
            bar.appendChild(fill);

            const meta = document.createElement('div');
            meta.className = 'ytkit-dl-progress__meta';
            const pct = document.createElement('span');
            pct.className = 'ytkit-dl-progress__stat';
            pct.textContent = '0%';
            const spd = document.createElement('span');
            spd.className = 'ytkit-dl-progress__stat';
            spd.textContent = t('dlProgressWaiting', 'Waiting');
            const eta = document.createElement('span');
            eta.className = 'ytkit-dl-progress__stat';
            eta.textContent = t('dlProgressQueue', 'Queue');
            meta.appendChild(pct);
            meta.appendChild(spd);
            meta.appendChild(eta);

            const actions = document.createElement('div');
            actions.className = 'ytkit-dl-progress__actions';
            actions.hidden = true;
            const repairBtn = document.createElement('button');
            repairBtn.type = 'button';
            repairBtn.className = 'ytkit-dl-progress__action';
            repairBtn.textContent = t('dlRepairBtn', 'Repair downloader');
            repairBtn.setAttribute('aria-label', t('dlRepairAria', 'Open Astra Downloader repair steps'));
            repairBtn.addEventListener('click', () => MediaDLManager.showInstallPrompt('retry'));
            actions.appendChild(repairBtn);

            const setProgressState = (tone, label, copy, showRepair = false) => {
                panel.dataset.state = tone;
                statePill.textContent = label;
                statusCopy.textContent = copy;
                actions.hidden = !showRepair;
            };
            setProgressState(
                'pending',
                t('dlProgressStatePreparing', 'Preparing'),
                audioOnly
                    ? t('dlProgressConnectAudio', 'Connecting to Astra Downloader.')
                    : t('dlProgressConnectVideo', 'Connecting to Astra Downloader.')
            );

            panel.appendChild(header);
            panel.appendChild(title);
            panel.appendChild(statusRow);
            panel.appendChild(bar);
            panel.appendChild(meta);
            panel.appendChild(actions);
            document.body.appendChild(panel);
            MediaDLManager._raiseOverlay(panel);

            let pollTimer = null;
            let stopped = false;
            let consecutiveErrors = 0;
            let unknownStatusStrikes = 0;
            const MAX_CONSECUTIVE_ERRORS = 5;

            const stopPolling = () => {
                stopped = true;
                if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
            };

            closeBtn.addEventListener('click', () => {
                stopPolling();
                panel.remove();
            });

            async function poll() {
                pollTimer = null;
                if (stopped) return;
                if (!panel.isConnected) { stopPolling(); return; }
                try {
                    const { data } = await extensionFetchJson({
                        method: 'GET',
                        url: MediaDLManager.baseUrl() + '/status/' + id,
                        headers: { 'X-Auth-Token': token },
                        timeout: 3000
                    });
                    if (stopped || !fill.isConnected) { stopPolling(); return; }
                    consecutiveErrors = 0;

                    if (data.title) title.textContent = data.title;
                    const rawProgress = Number(data.progress);
                    const p = Number.isFinite(rawProgress) ? Math.max(0, Math.min(rawProgress, 100)) : 0;
                    fill.style.width = p + '%';
                    pct.textContent = p.toFixed(1) + '%';
                    const pendingStatus = ['pending', 'queued', 'paused', 'needs-auth'].includes(data.status);
                    if (pendingStatus) {
                        pct.textContent = data.status === 'needs-auth'
                            ? t('dlProgressStateNeedsAttention', 'Needs Attention')
                            : t('dlProgressWaiting', 'Waiting');
                        spd.textContent = '';
                        eta.textContent = '';
                        setProgressState(
                            data.status === 'needs-auth' ? 'error' : 'active',
                            data.status === 'needs-auth'
                                ? t('dlProgressStateNeedsAttention', 'Needs Attention')
                                : t('dlProgressQueue', 'Queue'),
                            data.error || t('dlProgressWaiting', 'Waiting')
                        );
                    } else {
                        spd.textContent = data.speed || t('dlProgressLocal', 'Local');
                        eta.textContent = data.eta ? t('dlProgressEtaPrefix', 'ETA') + ' ' + data.eta : (p >= 99 ? t('dlProgressWrappingUp', 'Wrapping up') : t('dlProgressInProgress', 'In progress'));
                        setProgressState(
                            'active',
                            data.status === 'processing' ? t('dlProgressStateFinishing', 'Finishing') : t('dlProgressStateDownloading', 'Downloading'),
                            data.eta
                                ? t('dlProgressActiveEtaTpl', `${p.toFixed(1)}% complete. ${data.eta} remaining.`).replace('{pct}', p.toFixed(1)).replace('{eta}', data.eta)
                                : t('dlProgressActiveTpl', `${p.toFixed(1)}% complete. Stay on YouTube while Astra Downloader finishes.`).replace('{pct}', p.toFixed(1))
                        );
                    }

                    if (data.status === 'done' || data.status === 'complete') {
                        stopPolling();
                        DiagnosticLog?.record?.('download-outcome', 'success');
                        fill.style.width = '100%';
                        fill.classList.remove('is-error');
                        fill.classList.add('is-success');
                        pct.textContent = '100%';
                        spd.textContent = '';
                        eta.textContent = t('dlProgressReady', 'Ready');
                        setProgressState('success', t('dlProgressStateComplete', 'Complete'), t('dlProgressCompleteCopy', 'Astra Downloader finished successfully.'));
                        setTimeout(() => panel.remove(), 4000);
                        return;
                    }
                    if (data.status === 'skipped') {
                        stopPolling();
                        // `skipped` used to mean "this URL is already in
                        // archive.txt"; that feature was removed in companion
                        // v1.3.0 and v1.8.0 gave the status the opposite
                        // meaning — nothing was written, because every format
                        // exceeded the size limit or the page held no media.
                        // The copy has to say that, and the bar must not read
                        // as a finished download.
                        const skipReason = data.error || t('dlProgressSkippedDefault', 'Nothing was downloaded.');
                        DiagnosticLog?.record?.('download-outcome', `skipped: ${skipReason.slice(0, 200)}`);
                        fill.style.width = '0%';
                        fill.classList.remove('is-error');
                        title.textContent = skipReason;
                        pct.textContent = t('dlProgressStateSkipped', 'Skipped');
                        spd.textContent = '';
                        eta.textContent = '';
                        setProgressState('warning', t('dlProgressStateNothingDownloaded', 'Nothing Downloaded'), skipReason);
                        showToast(skipReason, '#f59e0b', { duration: 8 });
                        setTimeout(() => panel.remove(), 8000);
                        return;
                    }
                    if (data.status === 'error' || data.status === 'failed' || data.status === 'cancelled') {
                        stopPolling();
                        const failureReason = data.error || t('dlProgressFailureDefault', 'Astra Downloader failed');
                        DiagnosticLog?.record?.('download-outcome', `${data.status}: ${failureReason.slice(0, 200)}`);
                        fill.classList.remove('is-success');
                        fill.classList.add('is-error');
                        title.textContent = failureReason;
                        pct.textContent = t('dlProgressStateFailed', 'Failed');
                        spd.textContent = '';
                        eta.textContent = '';
                        const needsRepair = /cookie|yt-dlp|unauthorized|local downloader|astra downloader/i.test(failureReason);
                        setProgressState('error', t('dlProgressStateNeedsAttention', 'Needs Attention'), failureReason, needsRepair);
                        showToast(failureReason, '#ef4444', { duration: 6 });
                        if (needsRepair) {
                            MediaDLManager.showInstallPrompt('retry');
                        }
                        return;
                    }
                    const knownStatuses = ['pending', 'queued', 'paused', 'needs-auth', 'downloading', 'processing', 'merging', 'extracting', 'trimming', 'retrying'];
                    if (data.status && !knownStatuses.includes(data.status)) {
                        unknownStatusStrikes += 1;
                        if (unknownStatusStrikes >= 8) {
                            stopPolling();
                            title.textContent = t('dlProgressLostTrackTitle', 'Lost track of this download');
                            pct.textContent = '';
                            spd.textContent = '';
                            eta.textContent = '';
                            setProgressState('warning', t('dlProgressStateUnknown', 'Status Unknown'), t('dlProgressLostTrackCopy', 'Astra Downloader reported an unrecognized status. Check its window for the result.'));
                            setTimeout(() => panel.remove(), 8000);
                            return;
                        }
                    } else {
                        unknownStatusStrikes = 0;
                    }
                } catch (err) {
                    consecutiveErrors += 1;
                    DebugManager.log(
                        'Download',
                        `Poll failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err.message}`
                    );
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        stopPolling();
                        fill.classList.remove('is-success');
                        fill.classList.add('is-error');
                        title.textContent = t('dlProgressLostTitle', 'Connection to Astra Downloader lost');
                        pct.textContent = t('dlProgressStateError', 'Error');
                        spd.textContent = '';
                        eta.textContent = '';
                        setProgressState('error', t('dlProgressStateLost', 'Connection Lost'), t('dlProgressLostCopy', 'Astra Deck lost contact with Astra Downloader. Choose Repair downloader to recover.'), true);
                        showToast(t('dlProgressLostToast', 'Lost contact with Astra Downloader.'), '#ef4444', { duration: 5 });
                        return;
                    }
                    setProgressState(
                        'active',
                        t('dlProgressStateReconnecting', 'Reconnecting'),
                        t('dlProgressReconnectingCopy', 'Momentary hiccup with Astra Downloader — retrying automatically.')
                    );
                }
                if (!stopped && panel.isConnected) {
                    const nextDelay = consecutiveErrors > 0 ? 1500 : 750;
                    pollTimer = setTimeout(poll, nextDelay);
                }
            }

            poll();
        }

        // ── Download entry point ──
        let _downloadInProgress = false;
        let _cookieHandoffDisclosedThisSession = false;

        function recordCookieHandoffDiagnostic(status, diagnostics = {}) {
            const safeStatus = String(status || 'unknown')
                .replace(/[^a-z0-9_-]/gi, '')
                .slice(0, 80) || 'unknown';
            const protocolVersion = Number(diagnostics.protocolVersion) || COOKIE_HANDOFF_PROTOCOL_VERSION;
            const acceptedCount = Math.max(0, Number(diagnostics.acceptedCount) || 0);
            const acceptedBytes = Math.max(0, Number(diagnostics.acceptedBytes) || 0);
            const droppedCount = Math.max(0, Number(diagnostics.droppedCount) || 0);
            DiagnosticLog.record(
                'cookie-handoff',
                `status=${safeStatus} protocol=${protocolVersion} accepted=${acceptedCount} bytes=${acceptedBytes} dropped=${droppedCount}`
            );
        }

        async function discloseCookieHandoffOnce() {
            if (_cookieHandoffDisclosedThisSession
                || storageRead(COOKIE_HANDOFF_DISCLOSURE_KEY, false) === true) return;
            _cookieHandoffDisclosedThisSession = true;
            showToast(t(
                'toastCookieHandoffDisclosure',
                'Authenticated download: only the required YouTube sign-in cookies are being sent to Astra Downloader on this device.'
            ), '#3b82f6', { duration: 8 });
            try {
                await storageWrite(COOKIE_HANDOFF_DISCLOSURE_KEY, true);
            } catch (_) {
                recordCookieHandoffDiagnostic('disclosure-storage-failed');
            }
        }

        function _isDownloaderConnectionError(error) {
            const message = String(error?.message || error?.detail?.error || '').toLowerCase();
            return !!error?.isTimeout
                || message.includes('failed to fetch')
                || message.includes('networkerror')
                || message.includes('request aborted')
                || message.includes('extension request timed out')
                || message.includes('extension request failed');
        }

        const DOWNLOADER_FAILURE_COPY = Object.freeze({
            // Two independently-versioned products share one port catalogue.
            // Without these the mismatch surfaced as an unexplained connection
            // failure and the user was told to repair a downloader that was
            // running fine.
            'client-api-too-old': {
                message: 'This Astra Deck is older than the installed Astra Downloader accepts.',
                advice: 'Update the Astra Deck extension, then retry.',
                tone: '#f59e0b',
                duration: 12,
            },
            'companion-api-too-new': {
                message: 'The installed Astra Downloader speaks a newer API than this Astra Deck understands.',
                advice: 'Update the Astra Deck extension, then retry.',
                tone: '#f59e0b',
                duration: 12,
            },
            'po-token-required': {
                message: 'YouTube requires a PO token for this video.',
                advice: 'Start the PO-token provider on 127.0.0.1:4416, then retry.',
                tone: '#f59e0b',
                duration: 10,
            },
            'po-provider-stale': {
                message: 'The PO-token provider returned a stale or unusable token.',
                advice: 'Update or restart bgutil-ytdlp-pot-provider, then retry.',
                tone: '#f59e0b',
                duration: 10,
            },
            'sabr-limited': {
                message: 'This video is currently SABR-limited.',
                advice: 'Update yt-dlp when SABR support lands, or retry after YouTube exposes standard formats.',
                tone: '#f59e0b',
                duration: 12,
            },
            'deno-runtime-missing': {
                message: 'Deno is required for this yt-dlp build.',
                advice: 'Install Deno or click the Deno health pill to provision it, then restart Astra Downloader.',
                tone: '#f59e0b',
                duration: 15,
            },
            'deno-runtime-unsupported': {
                message: 'Deno needs an update for this yt-dlp build.',
                advice: 'Upgrade Deno to 2.3.0 or newer, or click the Deno health pill to provision the bundled runtime.',
                tone: '#f59e0b',
                duration: 15,
            },
            'js-runtime-missing': {
                message: 'A JavaScript runtime is required for this yt-dlp build.',
                advice: 'Provision Deno, or install Node 22+ and select it in Astra Downloader settings.',
                tone: '#f59e0b',
                duration: 15,
            },
            'js-runtime-unverified': {
                message: 'The selected JavaScript runtime could not be verified.',
                advice: 'Repair or replace the runtime in Astra Downloader, then retry.',
                tone: '#f59e0b',
                duration: 15,
            },
            'js-runtime-unsupported': {
                message: 'The selected JavaScript runtime needs an update.',
                advice: 'Upgrade to Deno 2.3+ or Node 22+, then retry.',
                tone: '#f59e0b',
                duration: 15,
            },
            'ejs-runtime-not-ready': {
                message: 'The JavaScript runtime failed yt-dlp readiness checks.',
                advice: 'Repair or replace the selected runtime in Astra Downloader, then retry.',
                tone: '#f59e0b',
                duration: 15,
            },
            'sign-in-required': {
                message: 'YouTube needs signed-in browser access for this video.',
                advice: 'Sign in to YouTube, allow the cookie bridge, then retry.',
                tone: '#f59e0b',
                duration: 10,
            },
            'ffmpeg-missing-or-stale': {
                message: 'ffmpeg is missing, stale, or failed during merge.',
                advice: 'Refresh ffmpeg from Astra Downloader before retrying.',
                tone: '#ef4444',
                duration: 10,
            },
            'network-unreachable': {
                message: 'Astra Downloader could not reach YouTube or a required provider.',
                advice: 'Check your network, VPN, firewall, and provider process, then retry.',
                tone: '#ef4444',
                duration: 8,
            },
            'native-channel-required': {
                message: 'Astra Downloader needs browser native messaging to share its private token.',
                advice: 'Reload the extension, verify the native host registration, then retry.',
                tone: '#f59e0b',
                duration: 12,
            },
        });

        function classifyDownloaderFailureResponse(resp = {}) {
            const rawCode = resp?.error_code || resp?.errorCode || resp?.code || 'download-failed';
            const code = String(rawCode || 'download-failed');
            const preset = DOWNLOADER_FAILURE_COPY[code] || {};
            // The companion's own `error`/`advice` strings are raw server text:
            // English whatever locale the reader runs, and shaped for a log.
            // Keep them for the diagnostic record and show the mapped copy.
            const detail = String(resp?.error || '').slice(0, 300);
            const message = String(preset.message || describeFailureCause({ code, message: detail })).slice(0, 220);
            const advice = String(preset.advice || 'Open Astra Downloader diagnostics, then retry.').slice(0, 220);
            return {
                code,
                detail,
                message,
                advice,
                nextAction: String(resp?.next_action || resp?.nextAction || preset.nextAction || 'retry'),
                tone: preset.tone || '#ef4444',
                duration: preset.duration || 6,
            };
        }

        function showDownloaderFailure(resp = {}) {
            // `mapped`, not `failure`: everything on it is the copy chosen for
            // the reader. The companion's own text is on `mapped.detail` and
            // only reaches the diagnostic record.
            const mapped = classifyDownloaderFailureResponse(resp);
            DiagnosticLog?.record?.('download-failure', `${mapped.code}: ${mapped.detail || mapped.message} | ${mapped.advice}`);
            showToast(t('dlFailureTpl', 'Astra Downloader: {error} {advice}')
                .replace('{error}', mapped.message)
                .replace('{advice}', mapped.advice), mapped.tone, {
                duration: mapped.duration,
            });
            return mapped;
        }

        function showNativeChannelRequired(status = {}) {
            // The native token error is a host-registration diagnostic, not
            // something the reader can act on; the preset advice already says
            // what to do.
            if (status.nativeTokenError) logFailure('native-token', status.nativeTokenError);
            return showDownloaderFailure({
                error_code: 'native-channel-required',
                error: status.nativeTokenError || '',
                next_action: 'repair-native-host',
            });
        }

        async function ytKitDownload(videoUrl, audioOnly, opts = {}) {
            if (_downloadInProgress) {
                showToast(t('toastDlInProgress', 'A download is already in progress.'), '#f59e0b', { duration: 3 });
                return;
            }
            _downloadInProgress = true;
            DebugManager.log('Download', `Download requested: ${videoUrl} (audio=${audioOnly}, format=${opts.format || 'default'}, dir=${opts.outputDir || 'default'})`);
            showToast(audioOnly
                ? t('toastDlPreparingAudio', 'Preparing your audio download…')
                : t('toastDlPreparingVideo', 'Preparing your video download…'),
            '#3b82f6', { duration: 2 });

            let mdl = await MediaDLManager.check(true);
            let likelyNeverInstalled = false;
            if (!mdl.ok && !mdl.nativeChannelRequired) {
                // Server isn't running: fire mediadl://start and wait. This is a
                // COLD start of the 40 MB PyInstaller one-file companion (self
                // unpack + Qt init + server bind), which can take ~8–10s — so
                // give it a generous poll window (8 × 1.5s = 12s) rather than the
                // default. A warm restart mid-download can afford to be shorter.
                // Exception: no native messaging host AND nothing answering on
                // any port means the companion has almost certainly never been
                // installed — the mediadl:// launch is a silent no-op then, so
                // don't hold the user under a false "Starting…" toast for 12s.
                likelyNeverInstalled = !!MediaDLManager._nativeTokenError && !MediaDLManager._foreignServer;
                mdl = await MediaDLManager.tryAutoStart(likelyNeverInstalled ? 2 : AUTO_START_RETRY_BUDGET);
            }
            if (!mdl.ok) {
                if (mdl.nativeChannelRequired) {
                    DebugManager.log('Download', `Astra Downloader requires native messaging token bootstrap (${mdl.nativeTokenError || 'no native token'})`);
                    showNativeChannelRequired(mdl);
                    _downloadInProgress = false;
                    return;
                }
                DebugManager.log('Download', 'Local yt-dlp server unavailable');
                showToast(t('toastDlInstallPrompt', 'Install Astra Downloader to enable downloads.'), '#f59e0b', { duration: 4 });
                if (!storageRead('ytkit_mediadl_prompt_dismissed', false)) {
                    // The old `_autoStartAttempted ? 'retry' : 'install'` was
                    // always 'retry' here (tryAutoStart just set the flag), so
                    // first-time users never saw the install copy or its
                    // persisted "Skip for now" dismissal.
                    MediaDLManager.showInstallPrompt(likelyNeverInstalled ? 'install' : 'retry');
                }
                _downloadInProgress = false;
                return;
            }

            try {
                await _mediaDLSendDownload(videoUrl, audioOnly, mdl.token, opts);
            } catch (e) {
                let finalError = e;
                if (_isDownloaderConnectionError(e)) {
                    DebugManager.log('Download', 'Local downloader request failed; attempting one server restart');
                    showToast(t('toastDlStopped', 'Astra Downloader stopped. Starting it again…'), '#3b82f6', { duration: 4 });
                    MediaDLManager.resetAutoStart();
                    const restarted = await MediaDLManager.tryAutoStart(AUTO_START_RETRY_BUDGET);
                    if (restarted.ok) {
                        try {
                            await _mediaDLSendDownload(videoUrl, audioOnly, restarted.token, opts);
                            return;
                        } catch (retryError) {
                            finalError = retryError;
                        }
                    }
                }
                DebugManager.log('Download', `MediaDL download failed: ${finalError.message}`);
                showToast(t('toastDlRequestFailed', 'Astra Downloader request failed.'), '#ef4444', { duration: 4 });
                MediaDLManager.showInstallPrompt('retry');
            } finally {
                _downloadInProgress = false;
            }
        }

        async function _mediaDLSendDownload(videoUrl, audioOnly, token, opts = {}) {
            DebugManager.log('MediaDL', `Sending download: ${videoUrl} (audio=${audioOnly})`);
            const s = appState?.settings;
            const payload = {
                url: videoUrl,
                audioOnly: !!audioOnly,
                quality: s?.downloadQuality || 'best',
                format: opts.format || (audioOnly ? (s?.downloadAudioFormat || 'mp3') : (s?.downloadVideoFormat || 'mp4'))
            };
            if (opts.outputDir) payload.outputDir = opts.outputDir;
            if (opts.section) payload.section = opts.section;
            if (Array.isArray(opts.playlistItems)) payload.playlistItems = opts.playlistItems;

            const sendDownload = async () => {
                try {
                    const { response, data: resp } = await extensionFetchJson({
                        method: 'POST',
                        url: MediaDLManager.baseUrl() + '/download',
                        headers: MediaDLManager._headers({
                            'Content-Type': 'application/json',
                            'X-Auth-Token': token
                        }),
                        data: JSON.stringify(payload),
                        timeout: 5000
                    });
                    DebugManager.log('MediaDL', `Download response: ${response.status} - ${response.responseText}`);
                    // An empty or non-JSON 2xx body yields a null resp. Reading
                    // .id off it threw a TypeError that the catch below rethrew
                    // into the CONNECTION-error handler, so the user was told
                    // "Astra Downloader stopped. Starting it again..." and shown
                    // a repair prompt for a downloader that was running fine and
                    // had simply answered with nothing. The else branch was
                    // already correct; it was just unreachable.
                    if (resp?.id) {
                        showDownloadProgress(resp.id, token, audioOnly);
                    } else {
                        showDownloaderFailure(resp || {});
                    }
                } catch (error) {
                    DebugManager.log('MediaDL', `Download request error: ${error.message}`);
                    const mismatch = companionApiMismatchFromError(error);
                    if (mismatch) {
                        // Rethrowing sends this to the CONNECTION-error handler,
                        // which tells the user the downloader stopped and offers
                        // to repair it. The downloader is fine; the extension is
                        // the thing that is out of date.
                        MediaDLManager._apiMismatch = mismatch;
                        showDownloaderFailure(mismatch);
                        return;
                    }
                    throw error;
                }
            };

            // SECURITY: cookie access is a separate one-use capability. The
            // background issues it only after a fresh native-host proof and
            // binds it to this tab/document. Legacy /health tokens can still
            // start unauthenticated downloads but can never unlock cookies.
            if (typeof browserCookies.getDownloadHandoff === 'function'
                && MediaDLManager._tokenSource === 'native') {
                try {
                    const proof = await MediaDLManager._requestNativeToken({ cookieHandoff: true });
                    const capability = proof.cookieCapability;
                    const proofIsCurrent = proof.token === token
                        && proof.service === MediaDLManager._SERVICE_ID
                        && Number.isInteger(proof.api)
                        && proof.api >= COOKIE_HANDOFF_MINIMUM_API
                        && typeof capability?.token === 'string'
                        && capability.protocolVersion === COOKIE_HANDOFF_PROTOCOL_VERSION;
                    if (!proofIsCurrent) {
                        recordCookieHandoffDiagnostic('native-proof-incomplete');
                        DebugManager.log('MediaDL', 'Cookies withheld: fresh native proof did not match the active download session');
                    } else {
                        const handoff = await browserCookies.getDownloadHandoff(capability);
                        const cookies = Array.isArray(handoff?.cookies) ? handoff.cookies : [];
                        recordCookieHandoffDiagnostic('ok', handoff?.diagnostics);
                        if (cookies.length > 0) {
                            payload.cookies = cookies.map(c => ({
                                domain: c.domain, name: c.name, value: c.value,
                                path: c.path || '/', secure: !!c.secure,
                                httpOnly: !!c.httpOnly,
                                expirationDate: normalizeCookieExpiry(c.expirationDate)
                            }));
                            await discloseCookieHandoffOnce();
                            DebugManager.log(
                                'MediaDL',
                                `Attached ${cookies.length} contract-filtered cookies (${Number(handoff?.diagnostics?.acceptedBytes) || 0} bytes) for yt-dlp`
                            );
                        } else {
                            DebugManager.log('MediaDL', 'Authenticated cookie contract returned no complete sign-in set');
                        }
                    }
                } catch (e) {
                    const code = typeof e?.code === 'string' ? e.code : 'cookie-handoff-failed';
                    recordCookieHandoffDiagnostic(code);
                    DebugManager.log('MediaDL', `Cookies withheld: authenticated handoff failed (${String(code).slice(0, 80)})`);
                }
            } else if (typeof browserCookies.getDownloadHandoff === 'function') {
                recordCookieHandoffDiagnostic('legacy-token-withheld');
                DebugManager.log('MediaDL', 'Cookies withheld: companion identity not native-verified (legacy health token)');
            }

            await sendDownload();
        }

        // ── Download Options Popup ──
        const VIDEO_FORMATS = [
            // i18n-static: technical format token.
            { value: 'mp4',  label: 'MP4',  desc: t('dlFormatVideoUniversal', 'Universal, best compat') },
            // i18n-static: technical format token.
            { value: 'mkv',  label: 'MKV',  desc: t('dlFormatVideoLossless', 'Lossless container') },
            // i18n-static: technical format token.
            { value: 'webm', label: 'WebM', desc: t('dlFormatVideoWeb', 'Web-optimized') }
        ];
        const AUDIO_FORMATS = [
            // i18n-static: technical format token.
            { value: 'mp3',  label: 'MP3',  desc: t('dlFormatAudio320', '320kbps, universal') },
            // i18n-static: technical format token.
            { value: 'm4a',  label: 'M4A',  desc: t('dlFormatAudioAac', 'AAC, Apple-friendly') },
            // i18n-static: technical format token.
            { value: 'opus', label: 'Opus', desc: t('dlFormatAudioOpus', 'Smaller, high quality') },
            // i18n-static: technical format token.
            { value: 'flac', label: 'FLAC', desc: t('dlFormatAudioLossless', 'Lossless audio') },
            // i18n-static: technical format token.
            { value: 'wav',  label: 'WAV',  desc: t('dlFormatAudioPcm', 'Uncompressed PCM') }
        ];
        const QUALITY_OPTIONS = [
            // i18n-static: technical quality token.
            { value: 'best', label: 'Best' },
            // i18n-static: technical quality token.
            { value: '2160', label: '4K' },
            // i18n-static: technical quality token.
            { value: '1440', label: '1440p' },
            // i18n-static: technical quality token.
            { value: '1080', label: '1080p' },
            // i18n-static: technical quality token.
            { value: '720',  label: '720p' },
            // i18n-static: technical quality token.
            { value: '480',  label: '480p' }
        ];

        // Gutter kept between the download panel and the viewport edges, and
        // the floor the panel is never shrunk below when space runs out.
        const MIN_VIEWPORT_GAP_PX = 8;
        const MIN_POPUP_HEIGHT_PX = 200;

        // Rule id for the popup's own navigate teardown. Registered when the
        // popup opens, removed by its cleanup closure.
        const DL_POPUP_NAV_RULE_ID = 'downloadPopupNavClose';
        let _dlPopup = null;
        let _dlPopupCleanup = null;
        let _dlPopupReturnFocus = null;
        let _dlPopupCloseWatcher = null;

        // aria-expanded belongs on the widget that owns the disclosure. A
        // <button>, or anything explicitly given a button/widget role, qualifies;
        // an arbitrary container passed only for positioning does not.
        function isDisclosureTrigger(el) {
            if (!el || typeof el.getAttribute !== 'function') return false;
            if (el.tagName === 'BUTTON') return true;
            const role = el.getAttribute('role');
            return role === 'button' || role === 'combobox';
        }

        function _closeDlPopup() {
            const returnFocus = _dlPopupReturnFocus;
            _dlPopupReturnFocus = null;
            if (_dlPopupCloseWatcher) {
                const watcher = _dlPopupCloseWatcher;
                _dlPopupCloseWatcher = null;
                destroyCloseWatcher(watcher);
            }
            if (_dlPopupCleanup) { _dlPopupCleanup(); _dlPopupCleanup = null; }
            if (_dlPopup) {
                try { if (_dlPopup.hidePopover) _dlPopup.hidePopover(); } catch (_) { /* reason: already hidden or not a popover */ }
                _dlPopup.remove(); _dlPopup = null;
            }
            if (returnFocus?.isConnected) returnFocus.focus();
        }

        async function _fetchServerConfig(token) {
            try {
                const { data } = await extensionFetchJson({
                    method: 'GET',
                    url: MediaDLManager.baseUrl() + '/config',
                    headers: { 'X-Auth-Token': token },
                    timeout: 2000
                });
                return data;
            } catch (_) { return null; }
        }

        function showDownloadPopup(anchorEl) {
            _closeDlPopup();

            const s = appState?.settings || {};
            let selectedMode = 'video';
            let selectedVideoFormat = s.downloadVideoFormat || 'mp4';
            let selectedAudioFormat = s.downloadAudioFormat || 'mp3';
            let selectedQuality = s.downloadQuality || 'best';
            let customDir = '';
            let clipStartInput = null;
            let clipEndInput = null;
            let playlistSelection = null;
            let dlBtn = null;
            let chipRowCount = 0;
            // The video this popup describes. Formats, size estimates, playlist
            // preview and the clip range are all captured for THIS url; the
            // download CTA used to re-read window.location.href at click time,
            // so a YouTube autoplay transition (which fires no user gesture and
            // therefore never light-dismisses the popover) left the popup
            // showing video A's formats while the button downloaded video B.
            const openedUrl = window.location.href;
            let playlistId = '';
            try {
                playlistId = new URL(openedUrl).searchParams.get('list') || '';
            } catch (_) { /* reason: malformed navigation URL; playlist UI stays hidden */ }
            const playlistUrl = playlistId
                ? `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
                : '';
            const syncDownloadCta = () => {
                if (!dlBtn) return;
                const isAudio = selectedMode === 'audio';
                const format = isAudio ? selectedAudioFormat : selectedVideoFormat;
                const quality = QUALITY_OPTIONS.find(q => q.value === selectedQuality)?.label || selectedQuality;
                dlBtn.textContent = isAudio ? t('dlPopupCtaAudio', 'Download audio') : t('dlPopupCtaVideo', 'Download video');
                dlBtn.setAttribute(
                    'aria-label',
                    isAudio
                        ? t('dlPopupCtaAudioAriaTpl', `Download audio as ${format.toUpperCase()}`).replace('{format}', format.toUpperCase())
                        : t('dlPopupCtaVideoAriaTpl', `Download video as ${format.toUpperCase()} at ${quality}`).replace('{format}', format.toUpperCase()).replace('{quality}', quality)
                );
            };

            const popup = document.createElement('div');
            popup.className = 'ytkit-dl-popup';
            popup.setAttribute('role', 'dialog');
            popup.setAttribute('aria-modal', 'true');
            popup.setAttribute('aria-label', t('dlPopupAria', 'Download options'));
            let _usePopover = false;
            try {
                _usePopover = supportsPopover() === true;
            } catch (_) {
                // reason: host feature detection must not prevent download options.
            }
            const _useCssAnchor = Boolean(
                anchorEl?.matches?.('.ytkit-po-dl')
                && CSS.supports?.('anchor-name: --x')
            );
            if (_useCssAnchor) popup.classList.add('ytkit-dl-popup--anchored');
            if (_usePopover) popup.setAttribute('popover', 'auto');

            // ── Toolbar: tabs + close in one row ──
            const toolbar = document.createElement('div');
            toolbar.className = 'ytkit-dl-popup__toolbar';
            const tabs = document.createElement('div');
            tabs.className = 'ytkit-dl-popup__tabs';
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', t('dlPopupTypeAria', 'Download type'));
            const vidTab = document.createElement('button');
            vidTab.type = 'button';
            vidTab.className = 'ytkit-dl-popup__tab is-active';
            vidTab.setAttribute('role', 'tab');
            vidTab.setAttribute('aria-selected', 'true');
            vidTab.textContent = t('dlPopupTabVideo', 'Video');
            const audTab = document.createElement('button');
            audTab.type = 'button';
            audTab.className = 'ytkit-dl-popup__tab';
            audTab.setAttribute('role', 'tab');
            audTab.setAttribute('aria-selected', 'false');
            audTab.textContent = t('dlPopupTabAudioOnly', 'Audio');

            const updateTabs = () => {
                vidTab.classList.toggle('is-active', selectedMode === 'video');
                audTab.classList.toggle('is-active', selectedMode === 'audio');
                vidTab.setAttribute('aria-selected', String(selectedMode === 'video'));
                audTab.setAttribute('aria-selected', String(selectedMode === 'audio'));
                qualityRow.hidden = selectedMode === 'audio';
                videoFormatRow.hidden = selectedMode !== 'video';
                audioFormatRow.hidden = selectedMode !== 'audio';
                syncDownloadCta();
            };
            vidTab.addEventListener('click', () => { selectedMode = 'video'; updateTabs(); });
            audTab.addEventListener('click', () => { selectedMode = 'audio'; updateTabs(); });
            tabs.appendChild(vidTab);
            tabs.appendChild(audTab);
            toolbar.appendChild(tabs);
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'ytkit-dl-popup__close';
            closeBtn.setAttribute('aria-label', t('closeBtnAria', 'Close'));
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', _closeDlPopup);
            toolbar.appendChild(closeBtn);
            popup.appendChild(toolbar);

            // ── Body ──
            const body = document.createElement('div');
            body.className = 'ytkit-dl-popup__body';

            const makeChipRow = (label, items, selected, onSelect) => {
                const row = document.createElement('div');
                row.className = 'ytkit-dl-popup__row';
                const lbl = document.createElement('div');
                lbl.className = 'ytkit-dl-popup__label';
                lbl.id = `ytkit-dl-popup-row-${++chipRowCount}`;
                lbl.textContent = label;
                row.appendChild(lbl);
                const chips = document.createElement('div');
                chips.className = 'ytkit-dl-popup__chips';
                chips.setAttribute('role', 'group');
                chips.setAttribute('aria-labelledby', lbl.id);
                row._chips = chips;
                items.forEach(item => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'ytkit-dl-popup__chip' + (item.value === selected ? ' is-active' : '');
                    chip.dataset.value = item.value;
                    chip.title = item.desc || '';
                    chip.textContent = item.label;
                    chip.setAttribute('aria-pressed', String(item.value === selected));
                    chip.setAttribute('aria-label', item.desc ? `${item.label}. ${item.desc}` : item.label);
                    chip.addEventListener('click', () => {
                        chips.querySelectorAll('.ytkit-dl-popup__chip').forEach(c => {
                            c.classList.remove('is-active');
                            c.setAttribute('aria-pressed', 'false');
                        });
                        chip.classList.add('is-active');
                        chip.setAttribute('aria-pressed', 'true');
                        onSelect(item.value);
                        syncDownloadCta();
                    });
                    chips.appendChild(chip);
                });
                row.appendChild(chips);
                return row;
            };

            const videoFormatRow = makeChipRow(t('dlPopupFormat', 'Format'), VIDEO_FORMATS, selectedVideoFormat, v => { selectedVideoFormat = v; });
            const audioFormatRow = makeChipRow(t('dlPopupFormat', 'Format'), AUDIO_FORMATS, selectedAudioFormat, v => { selectedAudioFormat = v; });
            audioFormatRow.hidden = true;
            const qualityRow = makeChipRow(t('dlPopupQuality', 'Quality'), QUALITY_OPTIONS, selectedQuality, v => { selectedQuality = v; });

            // ── Real-format probe ──
            // The ladder above is static, so it promised 4K on a 720p upload
            // and 480p on a video whose lowest stream is 1080p — in both cases
            // yt-dlp quietly downloads something else. The companion can
            // enumerate what YouTube actually serves for this video, so the
            // rungs it cannot honor are disabled instead of lying.
            const qualityChips = qualityRow._chips;
            const qualityActions = document.createElement('div');
            qualityActions.className = 'ytkit-dl-popup__playlist-actions';
            const probeBtn = document.createElement('button');
            probeBtn.type = 'button';
            probeBtn.className = 'ytkit-dl-popup__dir-btn';
            probeBtn.textContent = t('dlPopupFormatsProbe', 'Check available');
            qualityActions.appendChild(probeBtn);
            qualityRow.appendChild(qualityActions);
            const qualityStatus = document.createElement('div');
            qualityStatus.className = 'ytkit-dl-popup__playlist-meta';
            qualityStatus.setAttribute('role', 'status');
            qualityStatus.setAttribute('aria-live', 'polite');
            qualityStatus.textContent = t(
                'dlPopupFormatsHint',
                'Ask Astra Downloader which resolutions this video actually has.'
            );
            qualityRow.appendChild(qualityStatus);

            const chipFor = (value) => qualityChips.querySelector(`.ytkit-dl-popup__chip[data-value="${value}"]`);
            const renderQualitySizeLabels = (summary) => {
                QUALITY_OPTIONS.forEach((option) => {
                    const chip = chipFor(option.value);
                    if (!chip) return;
                    const estimate = summary?.qualitySizes?.[option.value];
                    const size = estimate?.bytes ? formatByteSize(estimate.bytes) : '';
                    const sizeText = size
                        ? `${estimate.approximate ? '~' : ''}${size}`
                        : t('dlPopupQualitySizeUnavailable', 'Size unavailable');
                    const label = t('dlPopupQualitySizeTpl', '{quality} · {size}')
                        .replace('{quality}', option.label)
                        .replace('{size}', sizeText);
                    const title = size
                        ? t('dlPopupQualitySizeTitleTpl', 'Estimated download size: {size}')
                            .replace('{size}', sizeText)
                        : t('dlPopupQualitySizeUnavailable', 'Size unavailable');
                    chip.textContent = label;
                    chip.title = title;
                    chip.setAttribute('aria-label', label);
                });
            };
            renderQualitySizeLabels(null);
            const applyFormatProbe = (probe) => {
                const summary = probe?.qualitySizes && typeof probe?.canHonor === 'function'
                    ? probe
                    : summarizeFormatProbe(probe);
                renderQualitySizeLabels(summary);
                if (!summary.heights.length) {
                    qualityStatus.textContent = t(
                        'dlPopupFormatsNone',
                        'Astra Downloader reported no video streams for this URL.'
                    );
                    return;
                }
                const { maxHeight, minHeight } = summary;
                let adjusted = false;
                QUALITY_OPTIONS.forEach((option) => {
                    const chip = chipFor(option.value);
                    if (!chip || option.value === 'best') return;
                    const honored = summary.canHonor(option.value);
                    chip.disabled = !honored;
                    chip.classList.toggle('is-unavailable', !honored);
                    chip.setAttribute('aria-disabled', String(!honored));
                    chip.title = honored
                        ? ''
                        : t('dlPopupFormatsRungUnavailableTpl', 'Not available — this video tops out at {max}p')
                            .replace('{max}', String(maxHeight));
                    if (!honored && selectedQuality === option.value) {
                        adjusted = true;
                        selectedQuality = 'best';
                    }
                });
                if (adjusted) {
                    qualityChips.querySelectorAll('.ytkit-dl-popup__chip').forEach((chip) => {
                        const isBest = chip.dataset.value === 'best';
                        chip.classList.toggle('is-active', isBest);
                        chip.setAttribute('aria-pressed', String(isBest));
                    });
                    syncDownloadCta();
                }
                const summaryCopy = t(
                    'dlPopupFormatsSummaryTpl',
                    '{count} formats · {min}p to {max}p available'
                )
                    .replace('{count}', String(summary.formatCount))
                    .replace('{min}', String(minHeight))
                    .replace('{max}', String(maxHeight));
                qualityStatus.textContent = adjusted
                    ? `${summaryCopy} · ${t('dlPopupFormatsAdjusted', 'switched to Best')}`
                    : summaryCopy;
            };

            const runFormatProbe = async (force = false) => {
                const videoId = typeof getVideoId === 'function' ? getVideoId() : '';
                const videoUrl = openedUrl;
                if (downloadFormatEstimates?.probe) {
                    const entry = await downloadFormatEstimates.probe(videoId, videoUrl, { force });
                    if (entry?.status !== 'ready') {
                        throw new Error(entry?.error || t('dlPopupFormatsUnavailable', 'Format list unavailable.'));
                    }
                    applyFormatProbe(entry.summary);
                    return;
                }

                // Compatibility fallback for direct module tests and older
                // extension pages that did not create the shared store.
                const status = await MediaDLManager.check();
                if (!status.ok) throw new Error(t('dlPopupDownloaderOffline', 'Downloader not running'));
                const { response, data } = await extensionFetchJson({
                    method: 'POST',
                    url: MediaDLManager.baseUrl() + '/formats',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Auth-Token': status.token,
                    },
                    data: JSON.stringify({ url: videoUrl }),
                    timeout: 65000,
                });
                if (!response || response.status < 200 || response.status >= 300 || !Array.isArray(data?.formats)) {
                    throw new Error(data?.error || t('dlPopupFormatsUnavailable', 'Format list unavailable.'));
                }
                applyFormatProbe(data);
            };

            probeBtn.addEventListener('click', async () => {
                probeBtn.disabled = true;
                probeBtn.textContent = t('dlPopupFormatsLoading', 'Checking…');
                qualityStatus.textContent = t('dlPopupFormatsLoading', 'Checking…');
                try {
                    await runFormatProbe(true);
                } catch (error) {
                    renderQualitySizeLabels(null);
                    logFailure('format-probe', error);
                    qualityStatus.textContent = describeFailureWithLabel(t('dlPopupFormatsUnavailable', 'Format list unavailable.'), error);
                } finally {
                    probeBtn.disabled = false;
                    probeBtn.textContent = t('dlPopupFormatsRecheck', 'Check again');
                }
            });

            body.appendChild(videoFormatRow);
            body.appendChild(audioFormatRow);
            body.appendChild(qualityRow);

            // ── Directory row ──
            const dirRow = document.createElement('div');
            dirRow.className = 'ytkit-dl-popup__row';
            const dirLabel = document.createElement('div');
            dirLabel.className = 'ytkit-dl-popup__label';
            dirLabel.id = 'ytkit-dl-popup-save-to-label';
            dirLabel.textContent = t('dlPopupSaveTo', 'Save to');
            dirRow.appendChild(dirLabel);
            const dirWrap = document.createElement('div');
            dirWrap.className = 'ytkit-dl-popup__dir-wrap';
            dirWrap.setAttribute('role', 'group');
            dirWrap.setAttribute('aria-labelledby', dirLabel.id);
            const dirDisplay = document.createElement('span');
            dirDisplay.className = 'ytkit-dl-popup__dir-path';
            dirDisplay.textContent = t('dlPopupLoading', 'Loading…');
            let serverDefaultPath = '';
            const dirToggle = document.createElement('button');
            dirToggle.type = 'button';
            dirToggle.className = 'ytkit-dl-popup__dir-btn';
            dirToggle.textContent = t('dlPopupChange', 'Change');
            dirToggle.setAttribute('aria-label', t('dlPopupChangeAria', 'Choose a download folder'));
            const setDirState = (path, isCustom) => {
                customDir = isCustom ? (path || '') : '';
                dirDisplay.textContent = path || t('dlPopupDefault', 'Default');
                dirDisplay.title = path || '';
                if (isCustom) {
                    dirToggle.textContent = t('dlPopupReset', 'Reset');
                    dirToggle.setAttribute('aria-label', t('dlPopupResetAria', 'Reset to default download folder'));
                } else {
                    dirToggle.textContent = t('dlPopupChange', 'Change');
                    dirToggle.setAttribute('aria-label', t('dlPopupChangeAria', 'Choose a download folder'));
                }
            };
            dirToggle.addEventListener('click', async () => {
                if (customDir) {
                    setDirState(serverDefaultPath, false);
                    return;
                }
                const prevLabel = dirToggle.textContent;
                dirToggle.textContent = t('dlPopupPicking', 'Picking…');
                dirToggle.disabled = true;
                try {
                    const mdl = await MediaDLManager.check();
                    if (!mdl.ok) {
                        dirDisplay.textContent = t('dlPopupDownloaderOffline', 'Downloader not running');
                        return;
                    }
                    const { data } = await extensionFetchJson({
                        method: 'POST',
                        url: MediaDLManager.baseUrl() + '/pick-folder',
                        headers: {
                            'X-Auth-Token': mdl.token,
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify({ initial: customDir || serverDefaultPath || '' }),
                        timeout: 130000
                    });
                    if (data?.path) {
                        setDirState(data.path, true);
                        if (data.outsideAllowlist) {
                            showToast(t('dlPopupOutsideRoots', 'That folder is outside the allowed download locations and will be rejected. Add it to ExtraOutputRoots or pick a subfolder of your download path.'), '#f59e0b', { duration: 8 });
                        }
                    } else if (data?.error) {
                        dirDisplay.textContent = data.error;
                    }
                } catch (_) {
                    dirDisplay.textContent = t('dlPopupPickerUnavailable', 'Folder picker unavailable');
                } finally {
                    dirToggle.disabled = false;
                    if (dirToggle.textContent === t('dlPopupPicking', 'Picking…')) dirToggle.textContent = prevLabel;
                }
            });
            dirWrap.appendChild(dirDisplay);
            dirWrap.appendChild(dirToggle);
            dirRow.appendChild(dirWrap);
            body.appendChild(dirRow);

            const clipRow = document.createElement('div');
            clipRow.className = 'ytkit-dl-popup__row';
            const clipLabel = document.createElement('div');
            clipLabel.className = 'ytkit-dl-popup__label';
            clipLabel.id = 'ytkit-dl-popup-clip-label';
            clipLabel.textContent = t('dlPopupClipRange', 'Clip range (optional)');
            clipRow.appendChild(clipLabel);
            const clipWrap = document.createElement('div');
            clipWrap.className = 'ytkit-dl-popup__clip-wrap';
            clipWrap.setAttribute('role', 'group');
            clipWrap.setAttribute('aria-labelledby', clipLabel.id);
            clipStartInput = document.createElement('input');
            clipStartInput.type = 'text';
            clipStartInput.inputMode = 'decimal';
            clipStartInput.className = 'ytkit-dl-popup__clip-input';
            clipStartInput.placeholder = t('dlPopupClipStartPlaceholder', 'Start · 0:00');
            clipStartInput.setAttribute('aria-label', t('dlPopupClipStartAria', 'Clip start timestamp'));
            clipStartInput.autocomplete = 'off';
            const clipSeparator = document.createElement('span');
            clipSeparator.className = 'ytkit-dl-popup__clip-separator';
            clipSeparator.textContent = '→';
            clipSeparator.setAttribute('aria-hidden', 'true');
            clipEndInput = document.createElement('input');
            clipEndInput.type = 'text';
            clipEndInput.inputMode = 'decimal';
            clipEndInput.className = 'ytkit-dl-popup__clip-input';
            clipEndInput.placeholder = t('dlPopupClipEndPlaceholder', 'End · 1:30');
            clipEndInput.setAttribute('aria-label', t('dlPopupClipEndAria', 'Clip end timestamp'));
            clipEndInput.autocomplete = 'off';
            const clearClipValidity = () => {
                clipStartInput.setCustomValidity('');
                clipEndInput.setCustomValidity('');
            };
            clipStartInput.addEventListener('input', clearClipValidity);
            clipEndInput.addEventListener('input', clearClipValidity);
            clipWrap.appendChild(clipStartInput);
            clipWrap.appendChild(clipSeparator);
            clipWrap.appendChild(clipEndInput);
            clipRow.appendChild(clipWrap);
            const clipHint = document.createElement('span');
            clipHint.className = 'ytkit-dl-popup__clip-hint';
            clipHint.textContent = t(
                'dlPopupClipHint',
                'Leave blank for the full video. Clips are frame-accurately re-cut after download.'
            );
            clipRow.appendChild(clipHint);
            body.appendChild(clipRow);

            if (playlistUrl) {
                const playlistRow = document.createElement('div');
                playlistRow.className = 'ytkit-dl-popup__row';
                const playlistLabel = document.createElement('div');
                playlistLabel.className = 'ytkit-dl-popup__label';
                playlistLabel.id = 'ytkit-dl-popup-playlist-label';
                playlistLabel.textContent = t('dlPopupPlaylistItems', 'Playlist items');
                playlistRow.appendChild(playlistLabel);
                const playlistActions = document.createElement('div');
                playlistActions.className = 'ytkit-dl-popup__playlist-actions';
                playlistActions.setAttribute('role', 'group');
                playlistActions.setAttribute('aria-labelledby', playlistLabel.id);
                const previewBtn = document.createElement('button');
                previewBtn.type = 'button';
                previewBtn.className = 'ytkit-dl-popup__dir-btn';
                previewBtn.textContent = t('dlPopupPlaylistPreview', 'Preview playlist');
                const selectAllBtn = document.createElement('button');
                selectAllBtn.type = 'button';
                selectAllBtn.className = 'ytkit-dl-popup__dir-btn';
                selectAllBtn.textContent = t('dlPopupPlaylistSelectAll', 'Select all');
                selectAllBtn.hidden = true;
                playlistActions.appendChild(previewBtn);
                playlistActions.appendChild(selectAllBtn);
                playlistRow.appendChild(playlistActions);
                const playlistMeta = document.createElement('div');
                playlistMeta.className = 'ytkit-dl-popup__playlist-meta';
                playlistMeta.setAttribute('role', 'status');
                playlistMeta.setAttribute('aria-live', 'polite');
                playlistMeta.textContent = t(
                    'dlPopupPlaylistHint',
                    'Preview to choose a bounded subset. Without a selection, this video downloads normally.'
                );
                playlistRow.appendChild(playlistMeta);
                const playlistList = document.createElement('div');
                playlistList.className = 'ytkit-dl-popup__playlist-list';
                playlistList.setAttribute('role', 'group');
                playlistList.setAttribute('aria-label', t('dlPopupPlaylistListAria', 'Playlist item selection'));
                playlistList.hidden = true;
                playlistRow.appendChild(playlistList);

                const syncPlaylistMeta = (preview) => {
                    const selected = playlistSelection?.size || 0;
                    playlistMeta.textContent = t(
                        'dlPopupPlaylistSelectionTpl',
                        '{selected} selected · {shown} shown · {total} total'
                    )
                        .replace('{selected}', String(selected))
                        .replace('{shown}', String(preview.items.length))
                        .replace('{total}', String(preview.total || preview.items.length));
                };
                selectAllBtn.addEventListener('click', () => {
                    const inputs = Array.from(playlistList.querySelectorAll('input[type="checkbox"]'));
                    const shouldSelect = inputs.some(input => !input.checked);
                    playlistSelection = new Set();
                    inputs.forEach((input) => {
                        input.checked = shouldSelect;
                        if (shouldSelect) playlistSelection.add(Number(input.value));
                    });
                    selectAllBtn.textContent = shouldSelect
                        ? t('dlPopupPlaylistClear', 'Clear')
                        : t('dlPopupPlaylistSelectAll', 'Select all');
                    const preview = playlistList._preview;
                    if (preview) syncPlaylistMeta(preview);
                });
                previewBtn.addEventListener('click', async () => {
                    previewBtn.disabled = true;
                    previewBtn.textContent = t('dlPopupPlaylistLoading', 'Loading…');
                    playlistMeta.textContent = t('dlPopupPlaylistLoading', 'Loading…');
                    try {
                        const status = await MediaDLManager.check();
                        if (!status.ok) throw new Error(t('dlPopupDownloaderOffline', 'Downloader not running'));
                        const { response, data } = await extensionFetchJson({
                            method: 'POST',
                            url: MediaDLManager.baseUrl() + '/playlist',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Auth-Token': status.token,
                            },
                            data: JSON.stringify({ url: playlistUrl }),
                            timeout: 65000,
                        });
                        if (!response || response.status < 200 || response.status >= 300 || !Array.isArray(data?.items)) {
                            throw new Error(data?.error || t('dlPopupPlaylistUnavailable', 'Playlist preview unavailable.'));
                        }
                        playlistList.replaceChildren();
                        playlistSelection = new Set();
                        const currentVideoId = getVideoId();
                        data.items.forEach((item) => {
                            const option = document.createElement('label');
                            option.className = 'ytkit-dl-popup__playlist-item';
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.value = String(item.index);
                            checkbox.checked = Boolean(currentVideoId && item.id === currentVideoId);
                            if (checkbox.checked) playlistSelection.add(Number(item.index));
                            checkbox.addEventListener('change', () => {
                                const index = Number(checkbox.value);
                                if (checkbox.checked) playlistSelection.add(index);
                                else playlistSelection.delete(index);
                                selectAllBtn.textContent = t('dlPopupPlaylistSelectAll', 'Select all');
                                syncPlaylistMeta(data);
                            });
                            const copy = document.createElement('span');
                            copy.className = 'ytkit-dl-popup__playlist-item-copy';
                            // i18n-static: dynamic ordinal/title composition; both values are already localized or user-authored.
                            copy.textContent = `${item.index}. ${item.title || t('commonUntitled', 'Untitled')}`;
                            option.appendChild(checkbox);
                            option.appendChild(copy);
                            playlistList.appendChild(option);
                        });
                        playlistList._preview = data;
                        playlistList.hidden = false;
                        selectAllBtn.hidden = false;
                        syncPlaylistMeta(data);
                    } catch (error) {
                        playlistSelection = null;
                        playlistList.hidden = true;
                        selectAllBtn.hidden = true;
                        logFailure('playlist-preview', error);
                        playlistMeta.textContent = describeFailureWithLabel(t('dlPopupPlaylistUnavailable', 'Playlist preview unavailable.'), error);
                    } finally {
                        previewBtn.disabled = false;
                        previewBtn.textContent = t('dlPopupPlaylistRefresh', 'Refresh preview');
                    }
                });
                body.appendChild(playlistRow);
            }

            popup.appendChild(body);

            // ── Footer: Download button ──
            const footer = document.createElement('div');
            footer.className = 'ytkit-dl-popup__footer';
            dlBtn = document.createElement('button');
            dlBtn.type = 'button';
            dlBtn.className = 'ytkit-dl-popup__go';
            syncDownloadCta();
            dlBtn.addEventListener('click', () => {
                const isAudio = selectedMode === 'audio';
                const format = isAudio ? selectedAudioFormat : selectedVideoFormat;
                const opts = { format };
                if (customDir) opts.outputDir = customDir;
                const clip = normalizeSectionInput(clipStartInput.value, clipEndInput.value);
                if (clip.error) {
                    const message = t('dlPopupClipInvalid', clip.error);
                    clipStartInput.setCustomValidity(message);
                    clipEndInput.setCustomValidity(message);
                    (clipStartInput.value.trim() ? clipEndInput : clipStartInput).reportValidity();
                    return;
                }
                if (clip.section) opts.section = clip.section;
                let requestUrl = openedUrl;
                if (playlistSelection instanceof Set) {
                    if (clip.section) {
                        showToast(
                            t('dlPopupPlaylistClipConflict', 'Choose either a clip range or playlist items.'),
                            '#f59e0b'
                        );
                        return;
                    }
                    // An empty selection falls through to the single video,
                    // which is exactly what the hint above the button promises:
                    // "Without a selection, this video downloads normally."
                    // Hard-blocking here contradicted that and created a
                    // dead end -- reachable with zero effort when the playlist
                    // has no items, when the current video is outside the shown
                    // subset, or when the user simply unchecks everything. The
                    // only escape was closing and reopening the popup.
                    if (playlistSelection.size) {
                        opts.playlistItems = Array.from(playlistSelection).sort((a, b) => a - b);
                        requestUrl = playlistUrl;
                    }
                }
                if (appState?.settings) {
                    appState.settings.downloadQuality = selectedQuality;
                    if (isAudio) appState.settings.downloadAudioFormat = selectedAudioFormat;
                    else appState.settings.downloadVideoFormat = selectedVideoFormat;
                    storageWriteJSON('ytSuiteSettings', appState.settings);
                }
                _closeDlPopup();
                ytKitDownload(requestUrl, isAudio, opts);
            });
            footer.appendChild(dlBtn);
            popup.appendChild(footer);

            document.body.appendChild(popup);
            _dlPopup = popup;
            _dlPopupReturnFocus = anchorEl?.isConnected ? anchorEl : null;
            // The context-menu path passes #movie_player when no download
            // button is on the page. That is a positioning anchor, not a
            // widget, and aria-expanded on a plain div announces a disclosure
            // state for something that has none. Only stamp real triggers.
            const disclosureAnchor = isDisclosureTrigger(anchorEl) ? anchorEl : null;
            disclosureAnchor?.setAttribute?.('aria-expanded', 'true');

            // Nothing else closes this popup on SPA navigation: YouTube's
            // autoplay advances the page with no user gesture, so the
            // popover's own light-dismiss never fires. Without this the popup
            // sits over the next video still showing the previous one's
            // formats, sizes and playlist preview.
            addNavigateRule(DL_POPUP_NAV_RULE_ID, () => { _closeDlPopup(); });

            const dialogKeydown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    _closeDlPopup();
                    return;
                }
                if (event.key !== 'Tab') return;
                const controls = Array.from(popup.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
                )).filter((control) => !control.closest('[hidden], [inert]') && control.offsetParent !== null);
                if (!controls.length) return;
                event.preventDefault();
                const activeIndex = controls.indexOf(document.activeElement);
                const nextIndex = event.shiftKey
                    ? (activeIndex <= 0 ? controls.length - 1 : activeIndex - 1)
                    : (activeIndex < 0 || activeIndex === controls.length - 1 ? 0 : activeIndex + 1);
                controls[nextIndex].focus();
            };
            popup.addEventListener('keydown', dialogKeydown);

            let popupToggleHandler = null;
            if (_usePopover) {
                try {
                    popup.showPopover();
                    popupToggleHandler = (e) => {
                        if (e.newState !== 'closed') return;
                        popup.removeEventListener('toggle', popupToggleHandler);
                        _closeDlPopup();
                    };
                    popup.addEventListener('toggle', popupToggleHandler);
                    _dlPopupCloseWatcher = createCloseWatcher(() => _closeDlPopup());
                } catch (_) {
                    // reason: a browser can expose Popover but reject this show call.
                    popup.removeAttribute('popover');
                    _usePopover = false;
                }
            }

            if (anchorEl && !_useCssAnchor) {
                const r = anchorEl.getBoundingClientRect();
                const pw = popup.offsetWidth;
                const ph = popup.offsetHeight;
                let left = r.left + r.width / 2 - pw / 2;
                let top = r.top - ph - 8;
                if (top < 8) top = r.bottom + 8;
                if (left < 8) left = 8;
                if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
                if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
                popup.style.inset = 'auto';
                popup.style.margin = '0';
                popup.style.translate = 'none';
                popup.style.left = left + 'px';
                popup.style.top = top + 'px';
            } else if (anchorEl) {
                // CSS anchoring pins the panel to the trigger but does not
                // keep it inside the viewport on its own: position-try only
                // swaps which side of the trigger the panel sits on, it never
                // shrinks the panel and it does not act on the inline axis at
                // all. Two clamps close that gap. Both are measured after the
                // anchor has resolved and neither rewrites an inset, so
                // anchor() and the flip-block fallback stay intact.
                const triggerRect = anchorEl.getBoundingClientRect();

                // Block axis: cap the panel to the taller of the two sides so
                // one of them can actually hold it. Without this a panel
                // taller than the space above a mid-screen trigger runs off
                // the top of the viewport, taking the tabs and close button
                // with it. The body scrolls, so nothing becomes unreachable.
                // Two gutters each: one between panel and trigger, one
                // between panel and the viewport edge.
                const spaceAbove = triggerRect.top - MIN_VIEWPORT_GAP_PX * 2;
                const spaceBelow = window.innerHeight - triggerRect.bottom - MIN_VIEWPORT_GAP_PX * 2;
                const heightCap = Math.max(MIN_POPUP_HEIGHT_PX, spaceAbove, spaceBelow);
                // Applied unconditionally, not only when the popup already
                // overflows. Playlist preview rows and two-line quality-chip
                // labels render after open, and the popup is pinned
                // bottom:anchor(top) so late growth extends UPWARD -- the
                // toolbar leaves the viewport top and the fixed popup cannot
                // be scrolled back (only its body scrolls).
                popup.style.maxHeight = heightCap + 'px';

                // Inline axis: the panel is centred on the trigger, so a
                // trigger near a viewport edge overhangs it. Nudge it back
                // with a margin shift rather than an inset rewrite.
                const rect = popup.getBoundingClientRect();
                let shift = 0;
                if (rect.right > window.innerWidth - MIN_VIEWPORT_GAP_PX) {
                    shift = (window.innerWidth - MIN_VIEWPORT_GAP_PX) - rect.right;
                }
                if (rect.left + shift < MIN_VIEWPORT_GAP_PX) shift = MIN_VIEWPORT_GAP_PX - rect.left;
                // marginLeft, NOT marginInlineStart. The shift is measured in
                // physical coordinates from getBoundingClientRect, and the
                // popup is positioned by physical `left` with `right:auto`. On
                // an RTL page the logical property maps to margin-right -- the
                // slack side of a left-constrained fixed box -- so the clamp
                // silently did nothing and an edge trigger left the panel
                // partly offscreen for ar/he/fa/ur users.
                if (shift) popup.style.marginLeft = shift + 'px';
            }

            if (!_usePopover) {
                const outsideClick = (e) => {
                    if (!popup.contains(e.target) && e.target !== anchorEl) _closeDlPopup();
                };
                const escHandler = (e) => { if (e.key === 'Escape') _closeDlPopup(); };
                setTimeout(() => {
                    // If the popup was closed inside the 50ms arm window its
                    // cleanup already ran — attaching now would leak both
                    // capture-phase listeners for the rest of the page.
                    if (!popup.isConnected) return;
                    document.addEventListener('click', outsideClick, true);
                    document.addEventListener('keydown', escHandler);
                }, 50);
                _dlPopupCleanup = () => {
                    document.removeEventListener('click', outsideClick, true);
                    document.removeEventListener('keydown', escHandler);
                    popup.removeEventListener('keydown', dialogKeydown);
                    if (popupToggleHandler) popup.removeEventListener('toggle', popupToggleHandler);
                    removeNavigateRule(DL_POPUP_NAV_RULE_ID);
                    disclosureAnchor?.setAttribute?.('aria-expanded', 'false');
                };
            } else {
                _dlPopupCleanup = () => {
                    popup.removeEventListener('keydown', dialogKeydown);
                    if (popupToggleHandler) popup.removeEventListener('toggle', popupToggleHandler);
                    removeNavigateRule(DL_POPUP_NAV_RULE_ID);
                    disclosureAnchor?.setAttribute?.('aria-expanded', 'false');
                };
            }
            queueMicrotask(() => { if (popup.isConnected) vidTab.focus(); });

            // Populate the size labels as soon as the picker opens. The
            // explicit button remains available for a fresh companion probe;
            // both paths share the same per-video request and cache.
            (async () => {
                qualityStatus.textContent = t('dlPopupFormatsLoading', 'Checking…');
                try {
                    await runFormatProbe(false);
                } catch (error) {
                    renderQualitySizeLabels(null);
                    logFailure('format-probe', error);
                    if (qualityStatus.isConnected) {
                        qualityStatus.textContent = describeFailureWithLabel(t(
                            'dlPopupFormatsUnavailable',
                            'Format list unavailable.'
                        ), error);
                    }
                }
            })();

            // Fetch server config to show current directory.
            (async () => {
                const mdl = await MediaDLManager.check();
                if (!mdl.ok) {
                    if (dirDisplay.isConnected) dirDisplay.textContent = t('dlPopupDownloaderOffline', 'Downloader not running');
                    return;
                }
                const cfg = await _fetchServerConfig(mdl.token);
                const path = cfg?.downloadPath || cfg?.DownloadPath || '';
                if (path && dirDisplay.isConnected && !customDir) {
                    serverDefaultPath = path;
                    dirDisplay.textContent = path;
                    dirDisplay.title = path;
                } else if (!path && dirDisplay.isConnected) {
                    dirDisplay.textContent = t('dlPopupDefault', 'Default');
                }
            })();
        }

        // ── Feature objects ──

        const downloadHealthPanel = {
            id: 'downloadHealthPanel',
            name: t('feature_downloadHealthPanel_name', 'Downloader Health Pills'),
            description: t('feature_downloadHealthPanel_desc', 'Show pills for Astra Downloader yt-dlp version, ffmpeg freshness, and PO Token provider state next to the download button. Reads /health every 30 s; no extra storage.'),
            group: 'Downloads',
            icon: 'activity',
            pages: [PageTypes.WATCH],
            _styleElement: null,
            _container: null,
            _pollTimer: null,
            _navTimer: null,
            _destroyed: false,

            _ensureStyles() {
                if (this._styleElement) return;
                this._styleElement = injectStyle(`
                    .ytkit-download-health{display:inline-flex;gap:6px;align-items:center;margin-inline-start:8px;font:600 11px/1 Roboto,Arial,sans-serif;}
                    .ytkit-download-health__pill{display:inline-flex;align-items:center;gap:4px;min-height:24px;padding:4px 8px;border-radius:6px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.06));color:var(--yt-spec-text-primary,rgba(255,255,255,0.78));border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.08));font-variant-numeric:tabular-nums;}
                    .ytkit-download-health__pill[data-tone="ok"]{background:rgba(34,197,94,0.12);color:#bbf7d0;border-color:rgba(34,197,94,0.32);}
                    .ytkit-download-health__pill[data-tone="warn"]{background:rgba(251,146,60,0.14);color:#fed7aa;border-color:rgba(251,146,60,0.36);}
                    .ytkit-download-health__pill[data-tone="err"]{background:rgba(239,68,68,0.14);color:#fecaca;border-color:rgba(239,68,68,0.36);}
                    html:not([dark]) .ytkit-download-health__pill[data-tone="ok"]{color:#166534;border-color:rgba(21,128,61,0.4);}
                    html:not([dark]) .ytkit-download-health__pill[data-tone="warn"]{color:#9a3412;border-color:rgba(154,52,18,0.4);}
                    html:not([dark]) .ytkit-download-health__pill[data-tone="err"]{color:#991b1b;border-color:rgba(153,27,27,0.4);}
                `, 'download-health', true);
            },

            async _fetchHealth() {
                try {
                    const status = await MediaDLManager.check();
                    if (!status?.ok) return null;
                    const { data } = await extensionFetchJson({
                        method: 'GET',
                        url: MediaDLManager.baseUrl() + '/health',
                        headers: MediaDLManager._headers({ 'X-MDL-Client': 'MediaDL', Authorization: 'Bearer ' + (status.token || '') })
                    });
                    return normalizeDownloadHealthSnapshot(data, status);
                } catch (e) {
                    DebugManager.log('DownloadHealth', `Fetch failed: ${e.message}`);
                    return null;
                }
            },

            _renderPill(label, value, tone) {
                const pill = document.createElement('span');
                pill.className = 'ytkit-download-health__pill';
                pill.dataset.tone = tone;
                pill.textContent = t('dlHealthPillTpl', '{label}: {value}')
                    .replace('{label}', label)
                    .replace('{value}', value);
                pill.setAttribute('aria-label', t('dlHealthPillAriaTpl', '{label} {value}')
                    .replace('{label}', label)
                    .replace('{value}', value));
                return pill;
            },

            async _render() {
                const data = await this._fetchHealth();
                if (!this._container?.isConnected) return;
                this._container.replaceChildren();
                if (data?.companionApiTooNew) {
                    MediaDLManager._apiMismatch = {
                        error_code: 'companion-api-too-new',
                        next_action: 'update-extension',
                        companionApi: data.api,
                        minimumClientApi: null,
                    };
                    this._container.appendChild(this._renderPill(
                        t('dlHealthDownloader', 'Downloader'),
                        t('dlHealthApiTooNew', 'newer than this extension'),
                        'warn'
                    ));
                    return;
                }
                if (!data) {
                    this._container.appendChild(this._renderPill(
                        t('dlHealthDownloader', 'Downloader'),
                        t('dlHealthOffline', 'offline'),
                        'warn'
                    ));
                    return;
                }
                if (data.tokenSource) {
                    const authTone = data.tokenSource === 'native' ? 'ok' : 'warn';
                    const authLabel = data.tokenSource === 'native'
                        ? t('dlHealthNative', 'native')
                        : t('dlHealthLegacy', 'legacy');
                    const authPill = this._renderPill(t('dlHealthAuth', 'Auth'), authLabel, authTone);
                    authPill.title = data.tokenSource === 'native'
                        ? t('dlHealthNativeAuthTitle', 'Token received over browser native messaging; /health token echo suppressed.')
                        : t('dlHealthLegacyAuthTitle', 'Using legacy /health token bootstrap because native messaging is unavailable.');
                    this._container.appendChild(authPill);
                }
                if (data.ytDlpVersion) {
                    this._container.appendChild(this._renderPill('yt-dlp', String(data.ytDlpVersion), 'ok'));
                }
                if (data.ffmpegCapabilities) {
                    const cap = data.ffmpegCapabilities;
                    const tone = cap.current === false ? 'warn' : 'ok';
                    this._container.appendChild(this._renderPill('ffmpeg', cap.version || t('dlHealthUnknown', 'unknown'), tone));
                }
                const po = data.poTokenProvider;
                if (po === null || po === undefined) {
                    this._container.appendChild(this._renderPill('PO Token', t('dlHealthNotRunning', 'not running'), 'warn'));
                } else if (po && po.ok) {
                    this._container.appendChild(this._renderPill('PO Token', t('dlHealthLive', 'live'), 'ok'));
                } else {
                    this._container.appendChild(this._renderPill('PO Token', t('dlHealthUnreachable', 'unreachable'), 'err'));
                }
                if (data.sabrSupport) {
                    const sabrTone = data.sabrSupport === 'native' ? 'ok' : 'warn';
                    const sabrLabel = data.sabrSupport === 'native' ? 'native' : 'limited';
                    const sabrPill = this._renderPill('SABR', sabrLabel, sabrTone);
                    if (data.sabrSupport !== 'native') {
                        sabrPill.title = t('dlHealthSabrLimitedTitle', 'Some YouTube videos use SABR-only formats that yt-dlp cannot yet download natively. See yt-dlp issue #12482.');
                    }
                    this._container.appendChild(sabrPill);
                }
                const deno = data.javascriptRuntime || data.denoRuntime;
                if (deno && deno.ytdlpNeedsRuntime) {
                    const supported = deno.supported === true && deno.ejsReady === true;
                    const runtimeName = deno.runtime
                        ? deno.runtime.charAt(0).toUpperCase() + deno.runtime.slice(1)
                        : 'JavaScript';
                    const tone = supported ? 'ok' : 'warn';
                    const label = !deno.installed
                        ? 'missing'
                        : !supported
                            ? `${deno.version ? `v${deno.version}` : 'unverified'} · repair`
                            : (deno.version ? `v${deno.version}` : 'ready');
                    const suffix = deno.source === 'bundled' ? ' (bundled)' : '';
                    const pill = this._renderPill(runtimeName, label + suffix, tone);
                    if (!supported) {
                        pill.title = deno.advice || `Repair the configured ${runtimeName} runtime`;
                        if (deno.canProvisionDeno) {
                            pill.style.cursor = 'pointer';
                            pill.addEventListener('click', async () => {
                                pill.textContent = t('dlHealthProvisioning', 'Provisioning…');
                                try {
                                    const { data: resp } = await extensionFetchJson({
                                        method: 'POST',
                                        // X-Auth-Token: every other authenticated
                                        // companion call uses it. X-MDL-Token
                                        // appears nowhere else in the repo, so
                                        // this request always 401'd.
                                        url: `${MediaDLManager.baseUrl()}/provision-deno`,
                                        headers: { 'X-Auth-Token': data.token }
                                    });
                                    if (resp?.ok) {
                                        showToast(t('dlHealthDenoProvisioned', 'Deno provisioned successfully'), '#22c55e');
                                        this._render();
                                    } else {
                                        showToast(resp?.error || t('dlHealthDenoFailed', 'Deno provision failed'), '#ef4444');
                                        pill.textContent = t('dlHealthDenoFailedLabel', 'Deno: failed');
                                    }
                                } catch (e) {
                                    logFailure('deno-provision', e);
                                    showToast(t('dlHealthDenoFailedTpl', 'Deno provision failed: {error}').replace('{error}', describeFailureCause(e)), '#ef4444');
                                    pill.textContent = t('dlHealthDenoFailedLabel', 'Deno: failed');
                                }
                            }, { once: true });
                        }
                    }
                    this._container.appendChild(pill);
                }
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const anchor = document.querySelector('.ytkit-local-dl-btn, .ytkit-download-btn, .ytp-right-controls .ytkit-local-dl-btn');
                if (!anchor) return;
                // Parent-wide, not nextElementSibling: the sibling panels
                // (stream links, cobalt, history) insert at this same anchor
                // and would push the health container out of that slot,
                // producing a duplicate with a stale aria-live region.
                const existing = anchor.parentElement?.querySelector('.ytkit-download-health');
                if (existing) {
                    // Adopt the container we actually found. nextElementSibling
                    // is whatever sibling panel inserted itself most recently,
                    // which is exactly the confusion this dedupe is fixing.
                    this._container = existing;
                    return;
                }
                this._container = document.createElement('span');
                this._container.className = 'ytkit-download-health';
                this._container.setAttribute('role', 'status');
                this._container.setAttribute('aria-live', 'polite');
                this._container.setAttribute('aria-label', t('dlHealthRegionAria', 'Downloader health'));
                anchor.insertAdjacentElement('afterend', this._container);
            },

            init() {
                this._destroyed = false;
                this._ensureStyles();
                addNavigateRule(this.id, () => {
                    if (this._navTimer) clearTimeoutFn(this._navTimer);
                    this._navTimer = setTimeoutFn(() => {
                        this._navTimer = null;
                        if (this._destroyed) return;
                        this._attach();
                        this._render();
                    }, 1500);
                });
                this._attach();
                this._render();
                this._pollTimer = setIntervalFn(() => {
                    if (this._destroyed) return;
                    if (typeof isWatchPagePath === 'function' && !isWatchPagePath()) return;
                    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                    this._render();
                }, 30000);
            },

            destroy() {
                this._destroyed = true;
                removeNavigateRule(this.id);
                if (this._navTimer) clearTimeoutFn(this._navTimer);
                this._navTimer = null;
                if (this._pollTimer) clearIntervalFn(this._pollTimer);
                this._pollTimer = null;
                this._container?.remove();
                this._container = null;
                this._styleElement?.remove();
                this._styleElement = null;
            }
        };

        const downloadStreamLinksPanel = {
            id: 'downloadStreamLinksPanel',
            name: t('feature_downloadStreamLinksPanel_name', 'Stream Links Panel'),
            description: t('feature_downloadStreamLinksPanel_desc', 'Advanced: expose the raw adaptive video/audio stream URLs (mp4/webm) parsed from ytInitialPlayerResponse. Local-only — no telemetry. Useful for yt-dlp / VLC handoff. Default off.'),
            group: 'Downloads',
            icon: 'link',
            pages: [PageTypes.WATCH],
            _btn: null,
            _panel: null,
            _styleElement: null,
            _navTimer: null,

            _ensureStyles() {
                if (this._styleElement) return;
                this._styleElement = injectStyle(`
                    .ytkit-stream-links-btn{display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;margin-inline-start:8px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.12));background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.04));color:var(--yt-spec-text-primary,#e5e7eb);font:600 12px/1 'YouTube Sans',system-ui;cursor:pointer;}
                    .ytkit-stream-links-btn:hover{background:rgba(255,255,255,0.1);}
                    .ytkit-stream-links-panel{position:fixed;right:24px;top:80px;z-index:9000;width:480px;max-height:60vh;overflow:auto;padding:14px;border-radius:12px;background:#0f0f10;color:#e5e7eb;border:1px solid #3f3f46;font:13px/1.5 system-ui;box-shadow:0 18px 48px rgba(0,0,0,.55);}
                    .ytkit-stream-links-panel h4{margin:0 0 8px;font-size:13px;font-weight:700;color:#fafafa;}
                    .ytkit-stream-links-panel ul{margin:0 0 12px;padding:0;list-style:none;}
                    .ytkit-stream-links-panel li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-variant-numeric:tabular-nums;font-size:12px;}
                    .ytkit-stream-links-panel button{padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e5e7eb;font:600 11px/1 system-ui;cursor:pointer;}
                    .ytkit-stream-links-panel button:hover{background:rgba(255,255,255,0.12);}
                    .ytkit-stream-links-panel__close{position:absolute;top:8px;right:8px;}
                    .ytkit-stream-links-panel__warn{color:#fbbf24;font-size:11px;margin-top:8px;}
                `, 'stream-links-panel', true);
            },

            _parsePlayerResponse() {
                const scripts = document.querySelectorAll('script:not([src])');
                for (const s of scripts) {
                    const t = s.textContent;
                    if (!t || !t.includes('ytInitialPlayerResponse')) continue;
                    const m = t.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*(?:var |window\.|$)/);
                    if (!m) continue;
                    try { return JSON.parse(m[1]); }
                    catch { /* reason: invalid player-response JSON; try next script tag */ }
                }
                return null;
            },

            _extractFormats() {
                const data = getPlayerResponseGlobal()
                    || this._parsePlayerResponse();
                if (data?.videoDetails?.videoId !== getVideoId()) {
                    return { formats: [], adaptive: [] };
                }
                const formats = data?.streamingData?.formats || [];
                const adaptive = data?.streamingData?.adaptiveFormats || [];
                return { formats, adaptive };
            },

            _formatLabel(f) {
                const mime = String(f.mimeType || '').split(';')[0];
                if (f.qualityLabel) return `${f.qualityLabel} ${mime}`;
                if (f.audioQuality) return `audio (${f.audioQuality.replace('AUDIO_QUALITY_', '').toLowerCase()}) ${mime}`;
                return mime || 'unknown';
            },

            _renderPanel() {
                if (this._panel) { this._panel.remove(); this._panel = null; return; }
                const { formats, adaptive } = this._extractFormats();
                const panel = document.createElement('div');
                panel.className = 'ytkit-stream-links-panel';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-label', t('dlStreamLinksTitle', 'Stream Links'));

                const heading = document.createElement('h4');
                heading.textContent = t('dlStreamLinksTitle', 'Stream Links');
                panel.appendChild(heading);

                const close = document.createElement('button');
                close.className = 'ytkit-stream-links-panel__close';
                close.type = 'button';
                close.textContent = t('commonClose', 'Close');
                close.addEventListener('click', () => {
                    // No async token and no search timer on this panel -- those
                    // belong to the History panel this handler was copied from.
                    panel.remove();
                    this._panel = null;
                });
                panel.appendChild(close);

                const renderList = (title, list) => {
                    if (!list?.length) return;
                    const h = document.createElement('h4');
                    h.textContent = title + ` (${list.length})`;
                    panel.appendChild(h);
                    const ul = document.createElement('ul');
                    for (const f of list) {
                        const li = document.createElement('li');
                        const label = document.createElement('span');
                        label.textContent = this._formatLabel(f);
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.textContent = f.url ? t('dlStreamCopyUrl', 'Copy URL') : t('dlStreamSabrOnly', 'SABR-only');
                        btn.disabled = !f.url;
                        if (f.url) {
                            btn.addEventListener('click', () => {
                                navigator.clipboard?.writeText(f.url).then(
                                    () => typeof showToast === 'function' && showToast(t('dlStreamCopied', 'Stream URL copied'), '#22c55e'),
                                    () => typeof showToast === 'function' && showToast(t('commonCopyFailed', 'Copy failed'), '#ef4444')
                                );
                            });
                        }
                        li.append(label, btn);
                        ul.appendChild(li);
                    }
                    panel.appendChild(ul);
                };

                if (!formats.length && !adaptive.length) {
                    const empty = document.createElement('div');
                    empty.textContent = t('dlStreamEmpty', 'No stream URLs parsed. YouTube may have served SABR-only formats — Astra Downloader handles these via youtube:formats=duplicate.');
                    panel.appendChild(empty);
                } else {
                    renderList('Combined (legacy)', formats);
                    renderList('Adaptive', adaptive);
                }
                const warn = document.createElement('div');
                warn.className = 'ytkit-stream-links-panel__warn';
                warn.textContent = t('dlStreamWarning', 'URLs are short-lived and may not work in your browser. Use Astra Downloader or hand off to yt-dlp/VLC instead.');
                panel.appendChild(warn);

                document.body.appendChild(panel);
                this._panel = panel;
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const anchor = document.querySelector('.ytkit-local-dl-btn, .ytkit-download-btn');
                if (!anchor) return;
                if (anchor.parentElement?.querySelector('.ytkit-stream-links-btn')) {
                    this._btn = anchor.parentElement.querySelector('.ytkit-stream-links-btn');
                    return;
                }
                this._btn = document.createElement('button');
                this._btn.type = 'button';
                this._btn.className = 'ytkit-stream-links-btn';
                this._btn.textContent = t('dlStreamLinksTitle', 'Stream Links');
                this._btn.title = t('dlStreamButtonTitle', 'Show adaptive format URLs');
                this._btn.addEventListener('click', () => this._renderPanel());
                anchor.insertAdjacentElement('afterend', this._btn);
            },

            init() {
                this._ensureStyles();
                addNavigateRule(this.id, () => {
                    this._panel?.remove();
                    this._panel = null;
                    if (this._navTimer) clearTimeout(this._navTimer);
                    this._navTimer = setTimeout(() => this._attach(), 1500);
                });
                this._attach();
            },

            destroy() {
                removeNavigateRule(this.id);
                if (this._navTimer) clearTimeout(this._navTimer);
                this._navTimer = null;
                this._btn?.remove();
                this._btn = null;
                this._panel?.remove();
                this._panel = null;
                this._styleElement?.remove();
                this._styleElement = null;
            }
        };

        const downloadCobaltFallback = {
            id: 'downloadCobaltFallback',
            name: t('feature_downloadCobaltFallback_name', 'Self-hosted Cobalt fallback'),
            description: t('feature_downloadCobaltFallback_desc', 'When Astra Downloader is unreachable, use a self-hosted Cobalt HTTPS instance after setting its origin in the toolbar popup and granting access to that one site. No public Cobalt instance is included.'),
            group: 'Downloads',
            icon: 'download-cloud',
            pages: [PageTypes.WATCH],
            _hooked: false,
            _navTimer: null,

            _isAllowed() {
                const mode = getProfileExportMode(appState?.settings || {});
                return mode === 'github-full';
            },

            _diagnosticInstanceLabel(instance) {
                try {
                    const u = new URL(instance);
                    return u.origin || 'configured Cobalt instance';
                } catch (_) {
                    // reason: malformed custom instance values still need an actionable diagnostic
                    return 'configured Cobalt instance';
                }
            },

            _recordFailureDiagnostic(instance, error) {
                const endpoint = this._diagnosticInstanceLabel(instance);
                const reason = String(error?.message || 'unknown error').slice(0, 180);
                DiagnosticLog?.record?.('cobalt-fallback',
                    `Cobalt fallback unreachable (${endpoint}). Astra Downloader was offline; check downloadCobaltInstance or start Astra Downloader. Last error: ${reason}`);
            },

            async _trigger() {
                if (!this._isAllowed()) {
                    if (typeof showToast === 'function') showToast(t('dlCobaltProfileOnly', 'Cobalt fallback is only enabled in the GitHub/full profile.'), '#f59e0b');
                    return;
                }
                const mdl = await MediaDLManager.check();
                if (mdl?.ok) {
                    if (typeof showToast === 'function') showToast(t('dlCobaltRunningSkip', 'Astra Downloader is running; fallback skipped.'), '#6b7280');
                    return;
                }
                const instance = String(appState?.settings?.downloadCobaltInstance || '').trim();
                const described = globalThis.YTKitCore?.describeCobaltInstanceUrl?.(instance)
                    || { ok: false, reason: 'scope-service-unavailable' };
                if (!described.ok) {
                    const message = t('dlCobaltInstanceRequired',
                        'Configure a self-hosted Cobalt HTTPS origin in the toolbar popup Settings Overview, then grant access to that site.');
                    DiagnosticLog?.record?.('cobalt-fallback',
                        `Cobalt fallback blocked: self-hosted instance is not configured (${String(described.reason || 'invalid').slice(0, 60)}).`);
                    if (typeof showToast === 'function') showToast(message, '#f59e0b', { duration: 6 });
                    return;
                }
                try {
                    const result = await requestCobaltDownload();
                    if (!result?.ok) {
                        const requestError = new Error(result?.error?.message || 'Self-hosted Cobalt request failed.');
                        requestError.code = result?.error?.code || 'COBALT_REQUEST_FAILED';
                        throw requestError;
                    }
                    const data = result.data;
                    if (data?.status === 'redirect' || data?.status === 'tunnel') {
                        const mediaUrl = data.url;
                        // Only open web URLs — the instance is remote/user-set
                        // and its response must not steer us to another scheme.
                        let mediaProtocol = '';
                        let parsedMediaUrl = null;
                        try { parsedMediaUrl = new URL(mediaUrl); } catch (e) { void e; }
                        mediaProtocol = parsedMediaUrl?.protocol || '';
                        if ((mediaProtocol === 'https:' || mediaProtocol === 'http:')
                            && !parsedMediaUrl.username && !parsedMediaUrl.password) {
                            await openExternalUrl(parsedMediaUrl.toString());
                            if (typeof showToast === 'function') showToast(t('dlCobaltOpened', 'Cobalt fallback: opened media URL in new tab.'), '#22c55e');
                            return;
                        }
                    }
                    if (data?.status === 'error') {
                        throw new Error(data.error?.code || 'Cobalt rejected the request');
                    }
                    throw new Error('Cobalt returned a response that requires a full Cobalt client.');
                } catch (e) {
                    DebugManager.log('CobaltFallback', `Failed: ${e.message}`);
                    this._recordFailureDiagnostic(instance, e);
                    if (typeof showToast === 'function') showToast(t('dlCobaltFailedTpl', 'Cobalt fallback failed: {error}')
                        .replace('{error}', describeFailureCause(e)), '#ef4444', { duration: 6 });
                }
            },

            init() {
                this._hooked = true;
                addNavigateRule(this.id, () => {
                    if (this._navTimer) clearTimeout(this._navTimer);
                    this._navTimer = setTimeout(() => {
                        this._navTimer = null;
                        if (!this._hooked) return;
                        if (!isWatchPagePath()) return;
                        const anchor = document.querySelector('.ytkit-local-dl-btn, .ytkit-download-btn');
                        if (!anchor || anchor.parentElement?.querySelector('.ytkit-cobalt-fallback-btn')) return;
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'ytkit-cobalt-fallback-btn ytkit-stream-links-btn';
                        // i18n-static: Cobalt is a brand/product name.
                        btn.textContent = 'Cobalt';
                        btn.title = t('dlCobaltButtonTitle', 'Try your self-hosted Cobalt instance when Astra Downloader is offline');
                        btn.addEventListener('click', () => this._trigger());
                        anchor.insertAdjacentElement('afterend', btn);
                    }, 1500);
                });
            },

            destroy() {
                removeNavigateRule(this.id);
                if (this._navTimer) clearTimeout(this._navTimer);
                this._navTimer = null;
                document.querySelectorAll('.ytkit-cobalt-fallback-btn').forEach(b => b.remove());
                this._hooked = false;
            }
        };

        const downloadHistoryPanel = {
            id: 'downloadHistoryPanel',
            name: t('feature_downloadHistoryPanel_name', 'Download History Panel'),
            description: t('feature_downloadHistoryPanel_desc', 'Adds a searchable, pageable, exportable view of download history recorded by Astra Downloader. Local-only — fetched from the local /history endpoint per session.'),
            group: 'Downloads',
            icon: 'history',
            pages: [PageTypes.WATCH],
            _btn: null,
            _panel: null,
            _styleElement: null,
            _searchTimer: null,
            _requestToken: 0,
            _pageSize: 50,
            _filters: {
                q: '', status: '', format: '', dateFrom: '', dateTo: '',
                sort: 'newest', offset: 0
            },

            _ensureStyles() {
                if (this._styleElement) return;
                this._styleElement = injectStyle(`
                    .ytkit-dl-history-panel{position:fixed;inset-inline-end:24px;top:80px;z-index:9000;width:min(680px,calc(100vw - 32px));max-height:72vh;display:flex;flex-direction:column;padding:16px;border-radius:12px;background:var(--yt-spec-base-background,#0f0f10);color:var(--yt-spec-text-primary,#e5e7eb);border:1px solid var(--yt-spec-10-percent-layer,#3f3f46);font:13px/1.5 Roboto,Arial,sans-serif;box-shadow:0 18px 48px rgba(0,0,0,.55);}
                    .ytkit-dl-history-panel h4{margin:0 0 10px;font-size:16px;font-weight:700;color:var(--yt-spec-text-primary,#fafafa);}
                    .ytkit-dl-history-panel__filters{display:grid;grid-template-columns:minmax(180px,2fr) repeat(3,minmax(110px,1fr));gap:8px;margin-block-end:8px;}
                    .ytkit-dl-history-panel__dates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-block-end:10px;}
                    .ytkit-dl-history-panel input,.ytkit-dl-history-panel select{box-sizing:border-box;min-height:36px;width:100%;padding:7px 9px;border-radius:7px;border:1px solid var(--yt-spec-10-percent-layer,#3f3f46);background:var(--yt-spec-menu-background,#18181b);color:var(--yt-spec-text-primary,#f4f4f5);font:inherit;outline:none;color-scheme:dark;}
                    .ytkit-dl-history-panel__body{min-height:120px;overflow:auto;border-block:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.08));}
                    .ytkit-dl-history-panel ul{margin:0;padding:0;list-style:none;}
                    .ytkit-dl-history-panel li{padding:9px 2px;border-block-end:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.05));font-size:12px;}
                    .ytkit-dl-history-panel .meta{color:var(--yt-spec-text-secondary,rgba(255,255,255,0.62));font-size:11px;font-variant-numeric:tabular-nums;}
                    .ytkit-dl-history-panel__empty{padding:24px 4px;color:var(--yt-spec-text-secondary,rgba(255,255,255,0.65));font-style:italic;}
                    .ytkit-dl-history-panel__footer{display:flex;align-items:center;gap:8px;padding-block-start:10px;}
                    .ytkit-dl-history-panel__count{margin-inline-end:auto;color:var(--yt-spec-text-secondary,rgba(255,255,255,.65));font-variant-numeric:tabular-nums;}
                    .ytkit-dl-history-panel__action,.ytkit-dl-history-panel__close{min-height:32px;padding:5px 10px;border-radius:7px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.12));background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.06));color:var(--yt-spec-text-primary,#e5e7eb);font:600 12px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;}
                    .ytkit-dl-history-panel__close{position:absolute;top:10px;inset-inline-end:10px;}
                    .ytkit-dl-history-panel__action:disabled{opacity:.45;cursor:default;}
                    .ytkit-dl-history-btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;margin-inline-start:8px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.12));background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.04));color:var(--yt-spec-text-primary,#e5e7eb);font:600 12px/1 'YouTube Sans',system-ui;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-dl-history-btn:hover,.ytkit-dl-history-panel__action:not(:disabled):hover,.ytkit-dl-history-panel__close:hover{background:var(--yt-spec-10-percent-layer,rgba(255,255,255,0.1));}
                    .ytkit-dl-history-btn:focus-visible,.ytkit-dl-history-panel button:focus-visible,.ytkit-dl-history-panel input:focus-visible,.ytkit-dl-history-panel select:focus-visible{box-shadow:0 0 0 2px var(--yt-spec-base-background,#080b10),0 0 0 4px rgba(124,58,237,0.5);}
                    @media(max-width:700px){.ytkit-dl-history-panel{inset-inline:16px;width:auto}.ytkit-dl-history-panel__filters{grid-template-columns:1fr 1fr}.ytkit-dl-history-panel__dates{grid-template-columns:1fr}}
                `, 'dl-history-panel', true);
            },

            async _fetchHistory({ offset = this._filters.offset, limit = this._pageSize } = {}) {
                try {
                    const status = await MediaDLManager.check();
                    if (!status?.ok) return null;
                    const params = new URLSearchParams({
                        limit: String(limit),
                        offset: String(offset),
                        sort: this._filters.sort
                    });
                    for (const key of ['q', 'status', 'format', 'dateFrom', 'dateTo']) {
                        if (this._filters[key]) params.set(key, this._filters[key]);
                    }
                    const { data } = await extensionFetchJson({
                        method: 'GET',
                        url: MediaDLManager.baseUrl() + '/history?' + params.toString(),
                        headers: MediaDLManager._headers({ 'X-MDL-Client': 'MediaDL', Authorization: 'Bearer ' + (status.token || '') })
                    });
                    return data && Array.isArray(data.history) ? data : null;
                } catch (e) {
                    DebugManager.log('DownloadHistory', `Fetch failed: ${e.message}`);
                    return null;
                }
            },

            _makeControl(tag, ariaLabel, value, options = null) {
                const control = document.createElement(tag);
                control.setAttribute('aria-label', ariaLabel);
                if (options) {
                    for (const [label, optionValue] of options) {
                        const option = document.createElement('option');
                        option.textContent = label;
                        option.value = optionValue;
                        control.appendChild(option);
                    }
                }
                control.value = value;
                return control;
            },

            _csvCell(value) {
                // Shared writer: neutralizes spreadsheet formula injection
                // before quoting. Titles and filenames are uploader-controlled
                // text, so a cell can legitimately begin with `=`.
                const shared = globalThis.YTKitCore && globalThis.YTKitCore.csvCell;
                if (typeof shared === 'function') return shared(value);
                const text = String(value ?? '');
                const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
                return `"${safe.replaceAll('"', '""')}"`;
            },

            async _exportFiltered(button) {
                const oldText = button.textContent;
                button.disabled = true;
                button.textContent = t('dlHistoryExporting', 'Exporting…');
                try {
                    const data = await this._fetchHistory({ offset: 0, limit: EXPORT_ROW_LIMIT });
                    if (!data) {
                        showToast(t('dlHistoryUnreachable', 'Astra Downloader unreachable. Start Astra Downloader and try again.'), '#ef4444');
                        return;
                    }
                    if (!data.history.length) {
                        showToast(t('dlHistoryNoMatches', 'No downloads match these filters.'), '#f59e0b');
                        return;
                    }
                    const fields = ['title', 'filename', 'format', 'quality', 'status', 'duration', 'date', 'url'];
                    const lines = [
                        fields.map(field => this._csvCell(field)).join(','),
                        ...data.history.map(entry => fields.map(field => this._csvCell(entry[field])).join(','))
                    ];
                    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
                    const href = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = href;
                    anchor.download = 'astra-download-history.csv';
                    anchor.hidden = true;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    setTimeout(() => URL.revokeObjectURL(href), 0);
                    // The fetch above is capped at 500 rows. Saying so is the
                    // difference between a truncated export and a silently
                    // incomplete one the user believes is their full history.
                    if (data.history.length >= EXPORT_ROW_LIMIT) {
                        showToast(
                            t('dlHistoryExportTruncatedTpl', `Exported the most recent ${EXPORT_ROW_LIMIT} downloads. Narrow the filters to export older entries.`)
                                .replace('{count}', String(EXPORT_ROW_LIMIT)),
                            '#f59e0b',
                            { duration: 6 }
                        );
                    }
                } finally {
                    button.disabled = false;
                    button.textContent = oldText;
                }
            },

            async _renderHistory() {
                const panel = this._panel;
                if (!panel) return;
                const body = panel.querySelector('.ytkit-dl-history-panel__body');
                const count = panel.querySelector('.ytkit-dl-history-panel__count');
                const previous = panel.querySelector('[data-history-action="previous"]');
                const next = panel.querySelector('[data-history-action="next"]');
                const exportButton = panel.querySelector('[data-history-action="export"]');
                const requestToken = ++this._requestToken;
                body.replaceChildren();
                const loading = document.createElement('div');
                loading.className = 'ytkit-dl-history-panel__empty';
                loading.textContent = t('commonLoading', 'Loading…');
                body.appendChild(loading);
                const data = await this._fetchHistory();
                if (!this._panel || requestToken !== this._requestToken) return;
                body.replaceChildren();
                if (!data) {
                    const error = document.createElement('div');
                    error.className = 'ytkit-dl-history-panel__empty';
                    error.textContent = t('dlHistoryUnreachable', 'Astra Downloader unreachable. Start Astra Downloader and try again.');
                    body.appendChild(error);
                    count.textContent = t('dlHistoryUnavailableCount', 'History unavailable');
                    previous.disabled = true;
                    next.disabled = true;
                    exportButton.disabled = true;
                    return;
                }
                const history = data.history;
                const start = history.length ? data.offset + 1 : 0;
                const end = data.offset + history.length;
                count.textContent = t(
                    'dlHistoryCount',
                    '{start}–{end} of {filtered} filtered · {total} retained'
                )
                    .replace('{start}', String(start))
                    .replace('{end}', String(end))
                    .replace('{filtered}', String(data.filteredTotal))
                    .replace('{total}', String(data.total));
                previous.disabled = data.offset <= 0;
                next.disabled = !data.hasMore;
                exportButton.disabled = data.filteredTotal <= 0;
                if (!history.length) {
                    const empty = document.createElement('div');
                    empty.className = 'ytkit-dl-history-panel__empty';
                    empty.textContent = data.total
                        ? t('dlHistoryNoMatches', 'No downloads match these filters.')
                        : t('dlHistoryEmpty', 'No completed downloads yet.');
                    body.appendChild(empty);
                    return;
                }
                const list = document.createElement('ul');
                for (const entry of history) {
                    const item = document.createElement('li');
                    const title = document.createElement('div');
                    title.textContent = entry.title || entry.filename || entry.url || t('commonUntitled', 'Untitled');
                    const meta = document.createElement('div');
                    meta.className = 'meta';
                    meta.textContent = [
                        entry.format?.toUpperCase(),
                        entry.quality,
                        entry.status,
                        entry.date
                    ].filter(Boolean).join(' • ');
                    item.append(title, meta);
                    list.appendChild(item);
                }
                body.appendChild(list);
            },

            async _open() {
                if (this._panel) {
                    this._requestToken++;
                    if (this._searchTimer) clearTimeout(this._searchTimer);
                    this._searchTimer = null;
                    this._panel.remove();
                    this._panel = null;
                    return;
                }
                const panel = document.createElement('div');
                panel.className = 'ytkit-dl-history-panel';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-label', t('dlHistoryRegionAria', 'Recent downloads'));
                const heading = document.createElement('h4');
                heading.textContent = t('dlHistoryTitle', 'Recent Downloads');
                panel.appendChild(heading);

                const filters = document.createElement('div');
                filters.className = 'ytkit-dl-history-panel__filters';
                const search = this._makeControl('input', t('dlHistorySearchAria', 'Search download history'), this._filters.q);
                search.type = 'search';
                search.placeholder = t('dlHistorySearchPlaceholder', 'Search title or filename');
                const status = this._makeControl('select', t('dlHistoryStatusAria', 'Filter history by status'), this._filters.status, [
                    [t('dlHistoryAllStatuses', 'All statuses'), ''],
                    [t('dlHistoryComplete', 'Complete'), 'complete']
                ]);
                const format = this._makeControl('select', t('dlHistoryFormatAria', 'Filter history by format'), this._filters.format, [
                    [t('dlHistoryAllFormats', 'All formats'), ''],
                    ...['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'opus', 'flac', 'wav'].map(value => [value.toUpperCase(), value])
                ]);
                const sort = this._makeControl('select', t('dlHistorySortAria', 'Sort download history'), this._filters.sort, [
                    [t('dlHistoryNewest', 'Newest first'), 'newest'],
                    [t('dlHistoryOldest', 'Oldest first'), 'oldest']
                ]);
                filters.append(search, status, format, sort);
                panel.appendChild(filters);

                const dates = document.createElement('div');
                dates.className = 'ytkit-dl-history-panel__dates';
                const dateFrom = this._makeControl('input', t('dlHistoryDateFromAria', 'Filter history saved from date'), this._filters.dateFrom);
                dateFrom.type = 'date';
                const dateTo = this._makeControl('input', t('dlHistoryDateToAria', 'Filter history saved through date'), this._filters.dateTo);
                dateTo.type = 'date';
                dates.append(dateFrom, dateTo);
                panel.appendChild(dates);

                const body = document.createElement('div');
                body.className = 'ytkit-dl-history-panel__body';
                panel.appendChild(body);
                const footer = document.createElement('div');
                footer.className = 'ytkit-dl-history-panel__footer';
                const count = document.createElement('span');
                count.className = 'ytkit-dl-history-panel__count';
                count.setAttribute('aria-live', 'polite');
                footer.appendChild(count);
                const makeAction = (text, action) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'ytkit-dl-history-panel__action';
                    button.dataset.historyAction = action;
                    button.textContent = text;
                    return button;
                };
                const previous = makeAction(t('dlHistoryPrevious', 'Previous'), 'previous');
                const next = makeAction(t('dlHistoryNext', 'Next'), 'next');
                const exportButton = makeAction(t('commonExport', 'Export'), 'export');
                footer.append(previous, next, exportButton);
                panel.appendChild(footer);

                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'ytkit-dl-history-panel__close';
                close.textContent = t('commonClose', 'Close');
                close.setAttribute('aria-label', t('dlHistoryCloseAria', 'Close recent downloads'));
                close.addEventListener('click', () => { panel.remove(); this._panel = null; });
                panel.appendChild(close);

                const updateFilter = (key, value) => {
                    this._filters[key] = value;
                    this._filters.offset = 0;
                    this._renderHistory();
                };
                search.addEventListener('input', () => {
                    if (this._searchTimer) clearTimeout(this._searchTimer);
                    this._searchTimer = setTimeout(() => {
                        this._searchTimer = null;
                        updateFilter('q', search.value.trim());
                    }, 250);
                });
                status.addEventListener('change', () => updateFilter('status', status.value));
                format.addEventListener('change', () => updateFilter('format', format.value));
                sort.addEventListener('change', () => updateFilter('sort', sort.value));
                dateFrom.addEventListener('change', () => updateFilter('dateFrom', dateFrom.value));
                dateTo.addEventListener('change', () => updateFilter('dateTo', dateTo.value));
                previous.addEventListener('click', () => {
                    this._filters.offset = Math.max(0, this._filters.offset - this._pageSize);
                    this._renderHistory();
                });
                next.addEventListener('click', () => {
                    this._filters.offset += this._pageSize;
                    this._renderHistory();
                });
                exportButton.addEventListener('click', () => this._exportFiltered(exportButton));

                document.body.appendChild(panel);
                this._panel = panel;
                this._renderHistory();
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const anchor = document.querySelector('.ytkit-local-dl-btn, .ytkit-download-btn');
                if (!anchor || anchor.parentElement?.querySelector('.ytkit-dl-history-btn')) return;
                this._btn = document.createElement('button');
                this._btn.type = 'button';
                this._btn.className = 'ytkit-dl-history-btn';
                this._btn.textContent = t('dlHistoryButton', 'History');
                this._btn.title = t('dlHistoryButtonTitle', 'View recent downloads');
                this._btn.setAttribute('aria-label', t('dlHistoryButtonTitle', 'View recent downloads'));
                this._btn.addEventListener('click', () => this._open());
                anchor.insertAdjacentElement('afterend', this._btn);
            },

            init() {
                this._destroyed = false;
                this._ensureStyles();
                addNavigateRule(this.id, () => {
                    if (this._navTimer) clearTimeout(this._navTimer);
                    this._navTimer = setTimeout(() => {
                        this._navTimer = null;
                        if (this._destroyed) return;
                        this._attach();
                    }, 1500);
                });
                this._attach();
            },

            destroy() {
                this._destroyed = true;
                removeNavigateRule(this.id);
                if (this._navTimer) { clearTimeout(this._navTimer); this._navTimer = null; }
                if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
                this._requestToken++;
                this._btn?.remove();
                this._btn = null;
                this._panel?.remove();
                this._panel = null;
                this._styleElement?.remove();
                this._styleElement = null;
            }
        };

        return {
            showDownloadPopup,
            ytKitDownload,
            showDownloadProgress,
            MediaDLManager,
            downloadFormatEstimates,
            mediaDLDownload,
            _closeDlPopup,
            _mediaDLSendDownload,
            _fetchServerConfig,
            _isDownloaderConnectionError,
            classifyDownloaderFailureResponse,
            showDownloaderFailure,
            showNativeChannelRequired,
            normalizeCookieExpiry,
            VIDEO_FORMATS,
            AUDIO_FORMATS,
            QUALITY_OPTIONS,
            downloadHealthPanel,
            downloadStreamLinksPanel,
            downloadCobaltFallback,
            downloadHistoryPanel,
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createDownloadUIFeature = createDownloadUIFeature;
    ns.normalizeDownloadHealthSnapshot = normalizeDownloadHealthSnapshot;
    ns.companionApiMismatchFromError = companionApiMismatchFromError;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createDownloadUIFeature,
            normalizeDownloadHealthSnapshot,
            companionApiMismatchFromError,
            summarizeFormatProbe,
            estimateFormatSize,
            formatByteSize,
            createFormatEstimateStore,
            DOWNLOAD_HEALTH_SCHEMA_VERSION,
            AUTO_START_RETRY_BUDGET
        };
    }
})();
