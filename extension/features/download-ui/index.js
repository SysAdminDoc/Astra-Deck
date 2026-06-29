(() => {
    'use strict';

    // extension/features/download-ui/index.js
    //
    // Monolith peel for Download UI. The module owns the primary
    // MediaDLManager singleton, download entry point, download popup,
    // progress panel, and the four download feature objects;
    // ytkit.js keeps inline objects as compatibility fallbacks and
    // delegates to the factory when present.

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
            requestNativeDownloaderToken = async () => ({ token: null, error: 'Native messaging unavailable' }),
            browserCookies = {},
            getProfileExportMode = () => 'safe-store',
            normalizeCookieExpiry = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; },
            PageTypes = { WATCH: 'watch' },
            ICONS = {},
            BRAND = {},
            t = (_key, fallback) => fallback,
            getPlayerResponseGlobal = () => null,
        } = deps;

        const ASTRA_DOWNLOADER_RELEASE_EXE_URL = 'https://github.com/SysAdminDoc/Astra-Deck/releases/latest/download/AstraDownloader.exe';

        // ── MediaDL Server Manager ──
        // Caches server availability, provides install/status helpers, and auto-start logic.
        const MediaDLManager = {
            _status: null, // null = unknown, 'running', 'not-installed'
            _token: null,
            _tokenSource: null,
            _nativeTokenError: null,
            _nativeChannelRequired: false,
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

            // Ports the server may have bound to — must match AstraDownloader.PORT_FALLBACKS.
            // The server prefers 9751 but falls back when Windows (e.g. Hyper-V) blocks it.
            _PORT_CANDIDATES: [9751, 9761, 9771, 9781, 9791, 9851],
            _port: 9751,
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
                const headers = { ...extra };
                if (this._tokenSource) headers['X-MDL-Token-Source'] = this._tokenSource;
                return headers;
            },

            async _requestNativeToken() {
                try {
                    const result = await requestNativeDownloaderToken();
                    if (result && result.token) {
                        return { token: result.token, error: null };
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

            async _checkImpl(force) {
                const now = Date.now();
                const nativeToken = await this._requestNativeToken();
                const tryPort = async (port) => {
                    try {
                        const headers = { 'X-MDL-Client': 'MediaDL' };
                        if (nativeToken.token) headers['X-MDL-Token-Source'] = 'native';
                        const { data } = await extensionFetchJson({
                            method: 'GET',
                            url: 'http://127.0.0.1:' + port + '/health',
                            headers,
                            timeout: 1500
                        });
                        if (this._isAstraDownloaderHealth(data)) return data;
                        if (data && data.token) {
                            DebugManager.log('MediaDL', `Ignoring non-Astra downloader response on port ${port}`);
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
                    this._serverVersion = nativeRequiredStatus.version || null;
                    this._lastCheck = now;
                    return nativeRequiredStatus;
                }

                this._status = 'not-installed';
                this._token = null;
                this._tokenSource = null;
                this._nativeTokenError = nativeToken.error;
                this._nativeChannelRequired = false;
                return { ok: false };
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
                        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': probe.token },
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
                        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': probe.token },
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
            async tryAutoStart(retries = 4) {
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

            resetAutoStart() { this._autoStartAttempted = false; this._status = null; this._nativeChannelRequired = false; },

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
                eyebrow.textContent = isRetryMode ? 'Connection check' : 'Local downloads';
                const titleEl = document.createElement('span');
                titleEl.id = 'ytkit-install-prompt-title';
                titleEl.className = 'ytkit-install-prompt__title';
                titleEl.textContent = isRetryMode ? 'Reconnect Astra Downloader' : 'Set up local downloads';
                const closeBtn = document.createElement('button');
                closeBtn.className = 'ytkit-install-prompt__close';
                closeBtn.type = 'button';
                closeBtn.setAttribute('aria-label', 'Close local downloader prompt');
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
                desc.textContent = isRetryMode
                    ? 'Astra Deck cannot reach the downloader service right now. Start it again if it is installed, or run setup to repair the local service.'
                    : 'Enable reliable audio and video downloads by installing Astra Downloader on this device. One setup covers future downloads.';

                const note = document.createElement('div');
                note.className = 'ytkit-install-prompt__note';
                note.setAttribute('role', 'status');
                note.setAttribute('aria-live', 'polite');
                note.textContent = isRetryMode
                    ? 'Fastest path: start the service again first. If it still does not respond, run setup to repair the install.'
                    : 'Recommended path: download setup, open the file, then return here and check again.';

                const steps = document.createElement('ol');
                steps.className = 'ytkit-install-prompt__steps';
                [
                    isRetryMode
                        ? 'Start the service again if the downloader is already installed.'
                        : 'Download the Astra Downloader setup file.',
                    'Open the setup file from Downloads and finish installation.',
                    'Choose Check again so Astra Deck can confirm the service is ready.'
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
                    const retryBtn = makeBtn('Start service', 'primary', async () => {
                        setPromptNote('Starting the Astra Downloader service…', 'warning');
                        setPromptButtonState(retryBtn, 'Starting…');
                        retryBtn.disabled = true;
                        retryBtn.setAttribute('aria-busy', 'true');
                        this.resetAutoStart();
                        const result = await this.tryAutoStart(5);
                        if (result.ok) {
                            showToast(t('toastDlRunning', 'Astra Downloader is running!'), '#22c55e', { duration: 3 });
                            prompt.remove();
                        } else {
                            retryBtn.setAttribute('aria-busy', 'false');
                            setPromptNote('The service did not respond. Run setup below to repair Astra Downloader, then check again.', 'error');
                            setPromptButtonState(retryBtn, 'Try again', 'danger');
                            retryBtn.disabled = false;
                        }
                    }, 'Fastest fix if the downloader is installed but idle.');
                    btnCol.appendChild(retryBtn);
                }

                // 2. Download setup
                const copyBtn = makeBtn('Download setup', 'accent', async () => {
                    setPromptNote('Downloading the setup file…', 'warning');
                    setPromptButtonState(copyBtn, 'Downloading setup…');
                    copyBtn.disabled = true;
                    copyBtn.setAttribute('aria-busy', 'true');
                    const result = await this.runInstallAssist();
                    copyBtn.setAttribute('aria-busy', 'false');
                    setPromptButtonState(copyBtn, result.downloaded ? 'Setup ready' : 'Open setup file', result.downloaded ? 'success' : '');
                    setPromptNote(
                        result.downloaded
                            ? 'Setup downloaded. Open the file, finish installation, then choose Check again.'
                            : 'The setup file should be open. Finish installation, then choose Check again.',
                        'success'
                    );
                    copyBtn.disabled = false;
                }, 'Recommended. Installs or repairs Astra Downloader.');
                btnCol.appendChild(copyBtn);

                // 3. Copy PowerShell command
                const dlBtn = makeBtn('Copy fallback command', 'ghost', async () => {
                    const copied = await this.copyInstallCommand();
                    if (copied) {
                        setPromptButtonState(dlBtn, 'Command copied', 'success');
                        setPromptNote('Fallback command copied. Use it in PowerShell only if the setup file cannot run.', 'success');
                        showToast(t('toastDlCmdCopied', 'Fallback install command copied. Use it only if you cannot run the downloaded setup file.'), '#3b82f6', { duration: 6 });
                        setTimeout(() => { setPromptButtonState(dlBtn, 'Copy fallback command'); }, 3500);
                    } else {
                        void openExternalUrl(this.INSTALLER_URL).catch(() => {});
                    }
                }, 'Use only if the downloaded setup file cannot run.');
                btnCol.appendChild(dlBtn);

                // 4. "I just installed it" — re-check
                const recheckBtn = makeBtn('Check again', 'ghost', async () => {
                    setPromptNote('Checking for the Astra Downloader service…', 'warning');
                    setPromptButtonState(recheckBtn, 'Checking…');
                    recheckBtn.disabled = true;
                    recheckBtn.setAttribute('aria-busy', 'true');
                    this.resetAutoStart();
                    const result = await this.tryAutoStart(5);
                    if (result.ok) {
                        showToast(t('toastDlReady', 'Astra Downloader is ready.'), '#22c55e', { duration: 4 });
                        prompt.remove();
                    } else {
                        recheckBtn.setAttribute('aria-busy', 'false');
                        setPromptButtonState(recheckBtn, 'Not detected yet', 'danger');
                        setPromptNote('Setup was not detected yet. Make sure the installer finished, then check again.', 'error');
                        recheckBtn.disabled = false;
                        setTimeout(() => { setPromptButtonState(recheckBtn, 'Check again'); }, 4000);
                    }
                }, 'Use this after running the setup file.');
                btnCol.appendChild(recheckBtn);

                // 5. Dismiss
                if (!isRetryMode) {
                    const dismissBtn = makeBtn('Skip for now', 'quiet', () => {
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
            }
        };

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
                ? t('dlProgressConnectAudio', 'Connecting to the local audio downloader.')
                : t('dlProgressConnectVideo', 'Connecting to the local video downloader.');
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
                    ? t('dlProgressConnectAudio', 'Connecting to the local audio downloader.')
                    : t('dlProgressConnectVideo', 'Connecting to the local video downloader.')
            );

            panel.appendChild(header);
            panel.appendChild(title);
            panel.appendChild(statusRow);
            panel.appendChild(bar);
            panel.appendChild(meta);
            panel.appendChild(actions);
            document.body.appendChild(panel);

            let pollTimer = null;
            let stopped = false;
            let consecutiveErrors = 0;
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
                    const p = Math.min(data.progress || 0, 100);
                    fill.style.width = p + '%';
                    pct.textContent = p.toFixed(1) + '%';
                    spd.textContent = data.speed || t('dlProgressLocal', 'Local');
                    eta.textContent = data.eta ? t('dlProgressEtaPrefix', 'ETA') + ' ' + data.eta : (p >= 99 ? t('dlProgressWrappingUp', 'Wrapping up') : t('dlProgressInProgress', 'In progress'));
                    setProgressState(
                        'active',
                        data.status === 'processing' ? t('dlProgressStateFinishing', 'Finishing') : t('dlProgressStateDownloading', 'Downloading'),
                        data.eta
                            ? t('dlProgressActiveEtaTpl', `${p.toFixed(1)}% complete. ${data.eta} remaining.`).replace('{pct}', p.toFixed(1)).replace('{eta}', data.eta)
                            : t('dlProgressActiveTpl', `${p.toFixed(1)}% complete. Stay on YouTube while Astra Downloader finishes.`).replace('{pct}', p.toFixed(1))
                    );

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
                        const skipReason = data.error || t('dlProgressSkippedDefault', 'Already downloaded — skipped.');
                        DiagnosticLog?.record?.('download-outcome', `skipped: ${skipReason.slice(0, 200)}`);
                        fill.style.width = '100%';
                        fill.classList.remove('is-error');
                        title.textContent = skipReason;
                        pct.textContent = t('dlProgressStateSkipped', 'Skipped');
                        spd.textContent = '';
                        eta.textContent = '';
                        setProgressState('warning', t('dlProgressStateAlreadyDownloaded', 'Already Downloaded'), skipReason);
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
                        title.textContent = t('dlProgressLostTitle', 'Connection to downloader lost');
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
            const message = String(resp?.error || preset.message || 'Download failed.').slice(0, 220);
            const advice = String(resp?.advice || preset.advice || 'Open Astra Downloader diagnostics, then retry.').slice(0, 220);
            return {
                code,
                message,
                advice,
                nextAction: String(resp?.next_action || resp?.nextAction || preset.nextAction || 'retry'),
                tone: preset.tone || '#ef4444',
                duration: preset.duration || 6,
            };
        }

        function showDownloaderFailure(resp = {}) {
            const failure = classifyDownloaderFailureResponse(resp);
            DiagnosticLog?.record?.('download-failure', `${failure.code}: ${failure.message} | ${failure.advice}`);
            showToast(`Astra Downloader: ${failure.message} ${failure.advice}`, failure.tone, {
                duration: failure.duration,
            });
            return failure;
        }

        function showNativeChannelRequired(status = {}) {
            const reason = status.nativeTokenError ? ` Native error: ${status.nativeTokenError}` : '';
            return showDownloaderFailure({
                error_code: 'native-channel-required',
                error: 'Astra Downloader needs browser native messaging to share its private token.',
                advice: `Reload the extension, verify the native host registration, then retry.${reason}`,
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
            showToast(audioOnly ? 'Preparing your audio download…' : 'Preparing your video download…', '#3b82f6', { duration: 2 });

            let mdl = await MediaDLManager.check(true);
            if (!mdl.ok && !mdl.nativeChannelRequired) {
                mdl = await MediaDLManager.tryAutoStart();
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
                    MediaDLManager.showInstallPrompt(MediaDLManager._autoStartAttempted ? 'retry' : 'install');
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
                    const restarted = await MediaDLManager.tryAutoStart(5);
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

            const sendDownload = async () => {
                try {
                    const { response, data: resp } = await extensionFetchJson({
                        method: 'POST',
                        url: MediaDLManager.baseUrl() + '/download',
                        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
                        data: JSON.stringify(payload),
                        timeout: 5000
                    });
                    DebugManager.log('MediaDL', `Download response: ${response.status} - ${response.responseText}`);
                    if (resp.id) {
                        showDownloadProgress(resp.id, token, audioOnly);
                    } else {
                        showDownloaderFailure(resp || {});
                    }
                } catch (error) {
                    DebugManager.log('MediaDL', `Download request error: ${error.message}`);
                    throw error;
                }
            };

            if (browserCookies.listAsync) {
                try {
                    const cookies = await browserCookies.listAsync({ domain: '.youtube.com' });
                    if (cookies.length > 0) {
                        payload.cookies = cookies.map(c => ({
                            domain: c.domain, name: c.name, value: c.value,
                            path: c.path || '/', secure: !!c.secure,
                            httpOnly: !!c.httpOnly,
                            expirationDate: normalizeCookieExpiry(c.expirationDate)
                        }));
                        DebugManager.log('MediaDL', `Attached ${cookies.length} cookies for yt-dlp`);
                    } else {
                        DebugManager.log('MediaDL', 'Extension cookie bridge returned no cookies (permission may not be granted)');
                    }
                } catch (e) {
                    DebugManager.log('MediaDL', `Extension cookie bridge error: ${e.message}`);
                }
            }

            await sendDownload();
        }

        // ── Download Options Popup ──
        const VIDEO_FORMATS = [
            { value: 'mp4',  label: 'MP4',  desc: 'Universal, best compat' },
            { value: 'mkv',  label: 'MKV',  desc: 'Lossless container' },
            { value: 'webm', label: 'WebM', desc: 'Web-optimized' }
        ];
        const AUDIO_FORMATS = [
            { value: 'mp3',  label: 'MP3',  desc: '320kbps, universal' },
            { value: 'm4a',  label: 'M4A',  desc: 'AAC, Apple-friendly' },
            { value: 'opus', label: 'Opus', desc: 'Smaller, high quality' },
            { value: 'flac', label: 'FLAC', desc: 'Lossless audio' },
            { value: 'wav',  label: 'WAV',  desc: 'Uncompressed PCM' }
        ];
        const QUALITY_OPTIONS = [
            { value: 'best', label: 'Best' },
            { value: '2160', label: '4K' },
            { value: '1440', label: '1440p' },
            { value: '1080', label: '1080p' },
            { value: '720',  label: '720p' },
            { value: '480',  label: '480p' }
        ];

        let _dlPopup = null;
        let _dlPopupCleanup = null;

        function _closeDlPopup() {
            if (_dlPopupCleanup) { _dlPopupCleanup(); _dlPopupCleanup = null; }
            if (_dlPopup) {
                try { if (_dlPopup.hidePopover) _dlPopup.hidePopover(); } catch (_) { /* reason: already hidden or not a popover */ }
                _dlPopup.remove(); _dlPopup = null;
            }
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
            let dlBtn = null;
            let chipRowCount = 0;
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
            popup.setAttribute('aria-label', t('dlPopupAria', 'Download options'));
            const _usePopover = typeof HTMLElement.prototype.showPopover === 'function';
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
                if (appState?.settings) {
                    appState.settings.downloadQuality = selectedQuality;
                    if (isAudio) appState.settings.downloadAudioFormat = selectedAudioFormat;
                    else appState.settings.downloadVideoFormat = selectedVideoFormat;
                    storageWriteJSON('ytSuiteSettings', appState.settings);
                }
                _closeDlPopup();
                ytKitDownload(window.location.href, isAudio, opts);
            });
            footer.appendChild(dlBtn);
            popup.appendChild(footer);

            document.body.appendChild(popup);
            _dlPopup = popup;
            anchorEl?.setAttribute?.('aria-expanded', 'true');

            if (_usePopover) {
                popup.showPopover();
                popup.addEventListener('toggle', (e) => {
                    if (e.newState === 'closed') _closeDlPopup();
                }, { once: true });
            }

            if (anchorEl && !CSS.supports?.('anchor-name: --x')) {
                const r = anchorEl.getBoundingClientRect();
                const pw = popup.offsetWidth;
                const ph = popup.offsetHeight;
                let left = r.left + r.width / 2 - pw / 2;
                let top = r.top - ph - 8;
                if (top < 8) top = r.bottom + 8;
                if (left < 8) left = 8;
                if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
                popup.style.left = left + 'px';
                popup.style.top = top + 'px';
            }

            if (!_usePopover) {
                const outsideClick = (e) => {
                    if (!popup.contains(e.target) && e.target !== anchorEl) _closeDlPopup();
                };
                const escHandler = (e) => { if (e.key === 'Escape') _closeDlPopup(); };
                setTimeout(() => {
                    document.addEventListener('click', outsideClick, true);
                    document.addEventListener('keydown', escHandler);
                }, 50);
                _dlPopupCleanup = () => {
                    document.removeEventListener('click', outsideClick, true);
                    document.removeEventListener('keydown', escHandler);
                    anchorEl?.setAttribute?.('aria-expanded', 'false');
                };
            } else {
                _dlPopupCleanup = () => {
                    anchorEl?.setAttribute?.('aria-expanded', 'false');
                };
            }

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
            name: 'Downloader Health Pills',
            description: 'Show pills for Astra Downloader yt-dlp version, ffmpeg freshness, and PO Token provider state next to the download button. Reads /health every 30 s; no extra storage.',
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
                    .ytkit-download-health{display:inline-flex;gap:6px;align-items:center;margin-left:8px;font:600 11px/1 system-ui;}
                    .ytkit-download-health__pill{display:inline-flex;align-items:center;gap:4px;min-height:24px;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.78);border:1px solid rgba(255,255,255,0.08);font-variant-numeric:tabular-nums;}
                    .ytkit-download-health__pill[data-tone="ok"]{background:rgba(34,197,94,0.12);color:#bbf7d0;border-color:rgba(34,197,94,0.32);}
                    .ytkit-download-health__pill[data-tone="warn"]{background:rgba(251,146,60,0.14);color:#fed7aa;border-color:rgba(251,146,60,0.36);}
                    .ytkit-download-health__pill[data-tone="err"]{background:rgba(239,68,68,0.14);color:#fecaca;border-color:rgba(239,68,68,0.36);}
                `, 'download-health');
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
                    return data ? { ...data, token: status.token, tokenSource: status.tokenSource } : null;
                } catch (e) {
                    DebugManager.log('DownloadHealth', `Fetch failed: ${e.message}`);
                    return null;
                }
            },

            _renderPill(label, value, tone) {
                const pill = document.createElement('span');
                pill.className = 'ytkit-download-health__pill';
                pill.dataset.tone = tone;
                pill.textContent = `${label}: ${value}`;
                pill.setAttribute('aria-label', `${label} ${value}`);
                return pill;
            },

            async _render() {
                const data = await this._fetchHealth();
                if (!this._container?.isConnected) return;
                this._container.replaceChildren();
                if (!data) {
                    this._container.appendChild(this._renderPill('Downloader', 'offline', 'warn'));
                    return;
                }
                if (data.tokenSource) {
                    const authTone = data.tokenSource === 'native' ? 'ok' : 'warn';
                    const authLabel = data.tokenSource === 'native' ? 'native' : 'legacy';
                    const authPill = this._renderPill('Auth', authLabel, authTone);
                    authPill.title = data.tokenSource === 'native'
                        ? 'Token received over browser native messaging; /health token echo suppressed.'
                        : 'Using legacy /health token bootstrap because native messaging is unavailable.';
                    this._container.appendChild(authPill);
                }
                if (data.ytDlpVersion) {
                    this._container.appendChild(this._renderPill('yt-dlp', String(data.ytDlpVersion), 'ok'));
                }
                if (data.ffmpegCapabilities) {
                    const cap = data.ffmpegCapabilities;
                    const tone = cap.current === false ? 'warn' : 'ok';
                    this._container.appendChild(this._renderPill('ffmpeg', cap.version || 'unknown', tone));
                }
                const po = data.poTokenProvider;
                if (po === null || po === undefined) {
                    this._container.appendChild(this._renderPill('PO Token', 'not running', 'warn'));
                } else if (po && po.ok) {
                    this._container.appendChild(this._renderPill('PO Token', 'live', 'ok'));
                } else {
                    this._container.appendChild(this._renderPill('PO Token', 'unreachable', 'err'));
                }
                if (data.sabrSupport) {
                    const sabrTone = data.sabrSupport === 'native' ? 'ok' : 'warn';
                    const sabrLabel = data.sabrSupport === 'native' ? 'native' : 'limited';
                    const sabrPill = this._renderPill('SABR', sabrLabel, sabrTone);
                    if (data.sabrSupport !== 'native') {
                        sabrPill.title = 'Some YouTube videos use SABR-only formats that yt-dlp cannot yet download natively. See yt-dlp issue #12482.';
                    }
                    this._container.appendChild(sabrPill);
                }
                const deno = data.denoRuntime;
                if (deno && deno.ytdlpNeedsRuntime) {
                    const supported = deno.installed && deno.supported !== false;
                    const tone = supported ? 'ok' : 'warn';
                    const label = !deno.installed
                        ? 'missing'
                        : deno.supported === false
                            ? `stale ${deno.version ? `v${deno.version}` : ''}`.trim()
                            : (deno.version ? `v${deno.version}` : 'installed');
                    const suffix = deno.source === 'bundled' ? ' (bundled)' : '';
                    const pill = this._renderPill('Deno', label + suffix, tone);
                    if (!supported) {
                        pill.title = deno.advice || 'Click to auto-provision Deno';
                        pill.style.cursor = 'pointer';
                        pill.addEventListener('click', async () => {
                            pill.textContent = 'Provisioning...';
                            try {
                                const { data: resp } = await extensionFetchJson({
                                    method: 'POST',
                                    url: `http://127.0.0.1:${data.port}/provision-deno`,
                                    headers: { 'X-MDL-Token': data.token }
                                });
                                if (resp?.ok) {
                                    showToast('Deno provisioned successfully', '#22c55e');
                                    this._render();
                                } else {
                                    showToast(resp?.error || 'Deno provision failed', '#ef4444');
                                    pill.textContent = 'Deno: failed';
                                }
                            } catch (e) {
                                showToast('Deno provision failed: ' + e.message, '#ef4444');
                                pill.textContent = 'Deno: failed';
                            }
                        }, { once: true });
                    } else if (deno.path) {
                        pill.title = deno.path;
                    }
                    this._container.appendChild(pill);
                }
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const anchor = document.querySelector('.ytkit-download-btn, .ytp-right-controls .ytkit-download-btn');
                if (!anchor) return;
                if (anchor.nextElementSibling?.classList?.contains('ytkit-download-health')) {
                    this._container = anchor.nextElementSibling;
                    return;
                }
                this._container = document.createElement('span');
                this._container.className = 'ytkit-download-health';
                this._container.setAttribute('role', 'status');
                this._container.setAttribute('aria-live', 'polite');
                this._container.setAttribute('aria-label', 'Downloader health');
                anchor.insertAdjacentElement('afterend', this._container);
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
                        this._render();
                    }, 1500);
                });
                this._attach();
                this._render();
                this._pollTimer = setInterval(() => {
                    if (this._destroyed) return;
                    if (typeof isWatchPagePath === 'function' && !isWatchPagePath()) return;
                    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                    this._render();
                }, 30000);
            },

            destroy() {
                this._destroyed = true;
                removeNavigateRule(this.id);
                if (this._navTimer) clearTimeout(this._navTimer);
                this._navTimer = null;
                if (this._pollTimer) clearInterval(this._pollTimer);
                this._pollTimer = null;
                this._container?.remove();
                this._container = null;
                this._styleElement?.remove();
                this._styleElement = null;
            }
        };

        const downloadStreamLinksPanel = {
            id: 'downloadStreamLinksPanel',
            name: 'Stream Links Panel',
            description: 'Advanced: expose the raw adaptive video/audio stream URLs (mp4/webm) parsed from ytInitialPlayerResponse. Local-only — no telemetry. Useful for yt-dlp / VLC handoff. Default off.',
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
                    .ytkit-stream-links-btn{display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;margin-left:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:#e5e7eb;font:600 12px/1 'YouTube Sans',system-ui;cursor:pointer;}
                    .ytkit-stream-links-btn:hover{background:rgba(255,255,255,0.1);}
                    .ytkit-stream-links-panel{position:fixed;right:24px;top:80px;z-index:9000;width:480px;max-height:60vh;overflow:auto;padding:14px;border-radius:12px;background:#0f0f10;color:#e5e7eb;border:1px solid #3f3f46;font:13px/1.5 system-ui;box-shadow:0 18px 48px rgba(0,0,0,.55);}
                    .ytkit-stream-links-panel h4{margin:0 0 8px;font-size:13px;font-weight:700;color:#fafafa;}
                    .ytkit-stream-links-panel ul{margin:0 0 12px;padding:0;list-style:none;}
                    .ytkit-stream-links-panel li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-variant-numeric:tabular-nums;font-size:12px;}
                    .ytkit-stream-links-panel button{padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e5e7eb;font:600 11px/1 system-ui;cursor:pointer;}
                    .ytkit-stream-links-panel button:hover{background:rgba(255,255,255,0.12);}
                    .ytkit-stream-links-panel__close{position:absolute;top:8px;right:8px;}
                    .ytkit-stream-links-panel__warn{color:#fbbf24;font-size:11px;margin-top:8px;}
                `, 'stream-links-panel');
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
                panel.setAttribute('aria-label', 'Stream Links');

                const heading = document.createElement('h4');
                heading.textContent = 'Stream Links';
                panel.appendChild(heading);

                const close = document.createElement('button');
                close.className = 'ytkit-stream-links-panel__close';
                close.type = 'button';
                close.textContent = 'Close';
                close.addEventListener('click', () => { panel.remove(); this._panel = null; });
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
                        btn.textContent = f.url ? 'Copy URL' : 'SABR-only';
                        btn.disabled = !f.url;
                        if (f.url) {
                            btn.addEventListener('click', () => {
                                navigator.clipboard?.writeText(f.url).then(
                                    () => typeof showToast === 'function' && showToast('Stream URL copied', '#22c55e'),
                                    () => typeof showToast === 'function' && showToast('Copy failed', '#ef4444')
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
                    empty.textContent = 'No stream URLs parsed. YouTube may have served SABR-only formats — Astra Downloader handles these via youtube:formats=duplicate.';
                    panel.appendChild(empty);
                } else {
                    renderList('Combined (legacy)', formats);
                    renderList('Adaptive', adaptive);
                }
                const warn = document.createElement('div');
                warn.className = 'ytkit-stream-links-panel__warn';
                warn.textContent = 'URLs are short-lived and may not work in your browser. Use Astra Downloader or hand off to yt-dlp/VLC instead.';
                panel.appendChild(warn);

                document.body.appendChild(panel);
                this._panel = panel;
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const anchor = document.querySelector('.ytkit-download-btn');
                if (!anchor) return;
                if (anchor.parentElement?.querySelector('.ytkit-stream-links-btn')) {
                    this._btn = anchor.parentElement.querySelector('.ytkit-stream-links-btn');
                    return;
                }
                this._btn = document.createElement('button');
                this._btn.type = 'button';
                this._btn.className = 'ytkit-stream-links-btn';
                this._btn.textContent = 'Stream Links';
                this._btn.title = 'Show adaptive format URLs';
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
            name: 'Cobalt Fallback (GitHub profile)',
            description: 'When Astra Downloader is unreachable, fall back to a configurable cobalt.tools instance. Only runs in the GitHub/full profile and only when Astra Downloader is offline. POSTs the current video URL to the configured instance and opens the returned media URL in a new tab.',
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
                    if (typeof showToast === 'function') showToast('Cobalt fallback is only enabled in the GitHub/full profile.', '#f59e0b');
                    return;
                }
                const mdl = await MediaDLManager.check();
                if (mdl?.ok) {
                    if (typeof showToast === 'function') showToast('Astra Downloader is running; fallback skipped.', '#6b7280');
                    return;
                }
                const url = location.href;
                const instance = (appState?.settings?.downloadCobaltInstance || 'https://api.cobalt.tools/api/json').trim();
                try {
                    const { data } = await extensionFetchJson({
                        method: 'POST',
                        url: instance,
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        data: JSON.stringify({ url }),
                        timeout: 10000
                    });
                    if (data?.status === 'redirect' || data?.status === 'stream' || data?.status === 'tunnel') {
                        const mediaUrl = data.url || data.tunnel || data.stream;
                        if (mediaUrl) {
                            window.open(mediaUrl, '_blank', 'noopener,noreferrer');
                            if (typeof showToast === 'function') showToast('Cobalt fallback: opened media URL in new tab.', '#22c55e');
                            return;
                        }
                    }
                    if (data?.status === 'error' || data?.text) {
                        throw new Error(data.text || data.error || 'Cobalt rejected the request');
                    }
                    throw new Error('Cobalt returned no usable media URL');
                } catch (e) {
                    DebugManager.log('CobaltFallback', `Failed: ${e.message}`);
                    this._recordFailureDiagnostic(instance, e);
                    if (typeof showToast === 'function') showToast(`Cobalt fallback failed: ${e.message}`, '#ef4444', { duration: 6 });
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
                        const anchor = document.querySelector('.ytkit-download-btn');
                        if (!anchor || anchor.parentElement?.querySelector('.ytkit-cobalt-fallback-btn')) return;
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'ytkit-cobalt-fallback-btn ytkit-stream-links-btn';
                        btn.textContent = 'Cobalt';
                        btn.title = 'Try cobalt.tools when Astra Downloader is offline';
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
            name: 'Download History Panel',
            description: 'Adds a "History" button next to the download button on watch pages. Lists the last 50 downloads recorded by Astra Downloader. Local-only — fetched from the local /history endpoint per session.',
            group: 'Downloads',
            icon: 'history',
            pages: [PageTypes.WATCH],
            _btn: null,
            _panel: null,
            _styleElement: null,

            _ensureStyles() {
                if (this._styleElement) return;
                this._styleElement = injectStyle(`
                    .ytkit-dl-history-panel{position:fixed;right:24px;top:80px;z-index:9000;width:560px;max-height:60vh;overflow:auto;padding:14px;border-radius:12px;background:#0f0f10;color:#e5e7eb;border:1px solid #3f3f46;font:13px/1.5 system-ui;box-shadow:0 18px 48px rgba(0,0,0,.55);}
                    .ytkit-dl-history-panel h4{margin:0 0 8px;font-size:13px;font-weight:700;color:#fafafa;}
                    .ytkit-dl-history-panel ul{margin:0;padding:0;list-style:none;}
                    .ytkit-dl-history-panel li{padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;}
                    .ytkit-dl-history-panel .meta{color:rgba(255,255,255,0.55);font-size:11px;font-variant-numeric:tabular-nums;}
                    .ytkit-dl-history-panel__empty{color:rgba(255,255,255,0.6);font-style:italic;}
                    .ytkit-dl-history-panel__close{position:absolute;top:8px;right:8px;min-height:28px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e5e7eb;font:700 11px/1 system-ui;cursor:pointer;outline:none;}
                    .ytkit-dl-history-btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;margin-left:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:#e5e7eb;font:600 12px/1 'YouTube Sans',system-ui;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-dl-history-btn:hover,.ytkit-dl-history-panel__close:hover{background:rgba(255,255,255,0.1);}
                    .ytkit-dl-history-btn:focus-visible,.ytkit-dl-history-panel__close:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(124,58,237,0.32);}
                `, 'dl-history-panel');
            },

            async _fetchHistory() {
                try {
                    const status = await MediaDLManager.check();
                    if (!status?.ok) return null;
                    const { data } = await extensionFetchJson({
                        method: 'GET',
                        url: MediaDLManager.baseUrl() + '/history?limit=50',
                        headers: MediaDLManager._headers({ 'X-MDL-Client': 'MediaDL', Authorization: 'Bearer ' + (status.token || '') })
                    });
                    return data?.history || [];
                } catch (e) {
                    DebugManager.log('DownloadHistory', `Fetch failed: ${e.message}`);
                    return null;
                }
            },

            async _open() {
                if (this._panel) { this._panel.remove(); this._panel = null; return; }
                const panel = document.createElement('div');
                panel.className = 'ytkit-dl-history-panel';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-label', 'Recent downloads');
                const h = document.createElement('h4');
                h.textContent = 'Recent Downloads';
                panel.appendChild(h);
                const placeholder = document.createElement('div');
                placeholder.className = 'ytkit-dl-history-panel__empty';
                placeholder.textContent = 'Loading…';
                panel.appendChild(placeholder);
                document.body.appendChild(panel);
                this._panel = panel;

                const history = await this._fetchHistory();
                if (!this._panel) return;
                panel.replaceChildren();
                const heading = document.createElement('h4');
                heading.textContent = 'Recent Downloads';
                panel.appendChild(heading);

                if (!history) {
                    const err = document.createElement('div');
                    err.className = 'ytkit-dl-history-panel__empty';
                    err.textContent = 'Astra Downloader unreachable. Start Astra Downloader and try again.';
                    panel.appendChild(err);
                } else if (!history.length) {
                    const empty = document.createElement('div');
                    empty.className = 'ytkit-dl-history-panel__empty';
                    empty.textContent = 'No completed downloads yet.';
                    panel.appendChild(empty);
                } else {
                    const ul = document.createElement('ul');
                    for (const entry of history.slice().reverse()) {
                        const li = document.createElement('li');
                        const title = document.createElement('div');
                        title.textContent = entry.title || entry.filename || entry.url || 'Untitled';
                        const meta = document.createElement('div');
                        meta.className = 'meta';
                        const parts = [];
                        if (entry.format) parts.push(entry.format);
                        if (entry.quality) parts.push(entry.quality);
                        if (entry.completedAt || entry.timestamp) {
                            try {
                                const ts = new Date(entry.completedAt || entry.timestamp);
                                parts.push(ts.toLocaleString());
                            } catch { /* reason: invalid history timestamp; omit date metadata */ }
                        }
                        meta.textContent = parts.join(' • ');
                        li.append(title, meta);
                        ul.appendChild(li);
                    }
                    panel.appendChild(ul);
                }

                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'ytkit-dl-history-panel__close';
                close.textContent = 'Close';
                close.setAttribute('aria-label', 'Close recent downloads');
                close.addEventListener('click', () => { panel.remove(); this._panel = null; });
                panel.appendChild(close);
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const anchor = document.querySelector('.ytkit-download-btn');
                if (!anchor || anchor.parentElement?.querySelector('.ytkit-dl-history-btn')) return;
                this._btn = document.createElement('button');
                this._btn.type = 'button';
                this._btn.className = 'ytkit-dl-history-btn';
                this._btn.textContent = 'History';
                this._btn.title = 'View recent downloads';
                this._btn.setAttribute('aria-label', 'View recent downloads');
                this._btn.addEventListener('click', () => this._open());
                anchor.insertAdjacentElement('afterend', this._btn);
            },

            init() {
                this._ensureStyles();
                addNavigateRule(this.id, () => { setTimeout(() => this._attach(), 1500); });
                this._attach();
            },

            destroy() {
                removeNavigateRule(this.id);
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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createDownloadUIFeature };
    }
})();
