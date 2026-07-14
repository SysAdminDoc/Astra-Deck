(() => {
    'use strict';

    const root = globalThis;
    const core = root.YTKitCore || (root.YTKitCore = {});
    if (core.createUserscriptAiSummaryFeature) return;

    function createUserscriptAiSummaryFeature(options = {}) {
        const doc = options.document || root.document;
        const getSettings = options.getSettings;
        const getVideoId = options.getVideoId;
        const transcriptService = options.transcriptService;
        const addNavigateRule = options.addNavigateRule;
        const removeNavigateRule = options.removeNavigateRule;
        const injectStyle = options.injectStyle;
        const showToast = options.showToast || (() => {});
        const request = options.request || root.GM_xmlhttpRequest || root.GM?.xmlHttpRequest;
        const vault = core.createUserscriptCredentialVault?.(options.credentialStore || {});

        if (!doc || typeof getSettings !== 'function' || typeof getVideoId !== 'function'
            || !transcriptService || !vault || typeof request !== 'function') {
            throw new Error('Userscript AI Summary dependencies are unavailable.');
        }

        function providerRequest(settings, prompt) {
            const provider = settings.aiSummaryProvider || 'openai';
            const policies = core.AI_PROVIDER_POLICIES || {};
            const knownDefaults = new Set(Object.values(policies).map((policy) => policy?.defaultEndpoint).filter(Boolean));
            const configuredEndpoint = knownDefaults.has(settings.aiSummaryEndpoint)
                ? policies[provider]?.defaultEndpoint
                : settings.aiSummaryEndpoint;
            const validated = core.validateAiProviderEndpoint(provider, configuredEndpoint);
            const payload = provider === 'gemini'
                ? { contents: [{ parts: [{ text: prompt }] }] }
                : provider === 'anthropic'
                    ? {
                        model: settings.aiSummaryModel || 'claude-haiku-4-5-20251001',
                        max_tokens: 800,
                        messages: [{ role: 'user', content: prompt }]
                    }
                    : {
                        model: settings.aiSummaryModel,
                        max_tokens: 800,
                        messages: [{ role: 'user', content: prompt }]
                    };
            return { provider, validated, payload };
        }

        function requestJson(details, credential) {
            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (fn, value) => {
                    if (settled) return;
                    settled = true;
                    fn(value);
                };
                const requestDetails = {
                    method: 'POST',
                    url: details.validated.url,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(credential && details.validated.policy.credentialHeader
                            ? { [details.validated.policy.credentialHeader]: details.validated.policy.credentialPrefix + credential }
                            : {}),
                        ...(details.provider === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {})
                    },
                    data: JSON.stringify(details.payload),
                    timeout: details.provider === 'ollama' ? 300000 : 60000,
                    anonymous: true,
                    onload(response) {
                        const text = String(response?.responseText || '');
                        if (text.length > 2 * 1024 * 1024) {
                            finish(reject, new Error('AI response is too large.'));
                            return;
                        }
                        if (credential && text.includes(credential)) {
                            finish(reject, new Error('AI provider response contained credential material and was blocked.'));
                            return;
                        }
                        if (!response || response.status < 200 || response.status >= 300) {
                            finish(reject, new Error(`AI provider rejected the request (HTTP ${response?.status || 0}).`));
                            return;
                        }
                        try { finish(resolve, JSON.parse(text)); }
                        catch (_) { finish(reject, new Error('AI provider returned invalid JSON.')); }
                    },
                    onerror() { finish(reject, new Error('AI provider request failed.')); },
                    ontimeout() { finish(reject, new Error('AI provider request timed out.')); }
                };
                try {
                    const maybePromise = request(requestDetails);
                    if (maybePromise && typeof maybePromise.then === 'function') {
                        maybePromise.then(requestDetails.onload, requestDetails.onerror);
                    }
                } catch (error) {
                    finish(reject, error);
                }
            });
        }

        async function fetchTranscript() {
            const videoId = getVideoId();
            if (!videoId) throw new Error('No video ID found.');
            const trackData = await transcriptService._getCaptionTracks(videoId);
            if (!trackData?.tracks?.length) throw new Error('No captions are available for this video.');
            const track = transcriptService._selectBestTrack(trackData.tracks);
            const segments = await transcriptService._fetchTranscriptContent(track.baseUrl);
            const transcript = (segments || []).map((segment) => segment?.text || '').filter(Boolean).join(' ');
            if (!transcript) throw new Error('The transcript was empty.');
            return { videoId, transcript };
        }

        function manageCredential(provider, required = false) {
            if (provider === 'ollama') return Promise.resolve('');
            return vault.status(provider).then((state) => new Promise((resolve, reject) => {
                const previousFocus = doc.activeElement;
                const shell = doc.createElement('div');
                shell.className = 'ytkit-us-ai-credential-shell';
                shell.setAttribute('role', 'dialog');
                shell.setAttribute('aria-modal', 'true');
                shell.setAttribute('aria-labelledby', 'ytkit-us-ai-credential-title');
                const form = doc.createElement('form');
                form.className = 'ytkit-us-ai-credential-card';
                const title = doc.createElement('h3');
                title.id = 'ytkit-us-ai-credential-title';
                title.textContent = `${provider[0].toUpperCase()}${provider.slice(1)} credential`;
                const note = doc.createElement('p');
                note.textContent = state.configured
                    ? 'A credential is configured. Enter a new value to replace it; the stored value is never shown.'
                    : 'Stored only in your userscript manager, outside Astra Deck settings and exports.';
                const label = doc.createElement('label');
                label.htmlFor = 'ytkit-us-ai-credential-input';
                label.textContent = 'New credential';
                const input = doc.createElement('input');
                input.id = 'ytkit-us-ai-credential-input';
                input.type = 'password';
                input.autocomplete = 'new-password';
                input.maxLength = 4096;
                input.required = true;
                input.value = '';
                const actions = doc.createElement('div');
                actions.className = 'ytkit-us-ai-credential-actions';
                const save = doc.createElement('button');
                save.type = 'submit';
                save.textContent = state.configured ? 'Replace' : 'Save';
                const remove = doc.createElement('button');
                remove.type = 'button';
                remove.textContent = 'Delete';
                remove.disabled = !state.configured;
                const cancel = doc.createElement('button');
                cancel.type = 'button';
                cancel.textContent = 'Cancel';
                actions.append(save, remove, cancel);
                form.append(title, note, label, input, actions);
                shell.appendChild(form);
                doc.body.appendChild(shell);

                let settled = false;
                const finish = (value, error) => {
                    if (settled) return;
                    settled = true;
                    shell.remove();
                    try { previousFocus?.focus?.({ preventScroll: true }); } catch (_) { /* reason: prior control may be detached */ }
                    if (error) reject(error); else resolve(value);
                };
                input.addEventListener('input', () => input.setCustomValidity(''));
                form.addEventListener('submit', (event) => {
                    event.preventDefault();
                    save.disabled = true;
                    void vault.set(provider, input.value).then(
                        () => finish(input.value),
                        (error) => { save.disabled = false; input.setCustomValidity(error.message); input.reportValidity(); }
                    );
                });
                remove.addEventListener('click', () => {
                    remove.disabled = true;
                    void vault.remove(provider).then(
                        () => finish(''),
                        (error) => { remove.disabled = false; input.setCustomValidity(error.message); input.reportValidity(); }
                    );
                });
                cancel.addEventListener('click', () => finish('', required ? new Error(`No ${provider} credential is configured.`) : null));
                shell.addEventListener('keydown', (event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    finish('', required ? new Error(`No ${provider} credential is configured.`) : null);
                });
                input.focus({ preventScroll: true });
            }));
        }

        return {
            id: 'aiVideoSummary',
            name: 'AI Video Summary',
            description: 'Summarize the current transcript with a userscript-manager-isolated provider credential',
            group: 'Watch Page',
            icon: 'sparkles',
            pages: [options.watchPage || 'watch'],
            _button: null,
            _panel: null,
            _style: null,
            _rule: null,
            _timer: null,
            async _call(prompt) {
                const details = providerRequest(getSettings() || {}, prompt);
                let credential = await vault.get(details.provider);
                if (details.provider !== 'ollama' && !credential) {
                    credential = await manageCredential(details.provider, true);
                }
                const data = await requestJson(details, credential);
                if (details.provider === 'gemini') return data?.candidates?.[0]?.content?.parts?.[0]?.text || '[no content]';
                if (details.provider === 'anthropic') return data?.content?.[0]?.text || '[no content]';
                return data?.choices?.[0]?.message?.content || '[no content]';
            },
            _showPanel(text, tone = 'normal') {
                this._panel?.remove();
                const panel = doc.createElement('section');
                panel.className = 'ytkit-us-ai-panel';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-label', 'AI video summary');
                const close = doc.createElement('button');
                close.type = 'button';
                close.className = 'ytkit-us-ai-close';
                close.setAttribute('aria-label', 'Close AI summary');
                close.textContent = '×';
                close.addEventListener('click', () => { panel.remove(); this._panel = null; });
                const body = doc.createElement('div');
                body.className = `ytkit-us-ai-body ytkit-us-ai-${tone}`;
                body.textContent = text;
                panel.append(close, body);
                doc.body.appendChild(panel);
                this._panel = panel;
            },
            async _run() {
                this._showPanel('Fetching transcript…');
                try {
                    const { videoId, transcript } = await fetchTranscript();
                    this._showPanel('Calling AI provider…');
                    const title = doc.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() || '(video)';
                    const prompt = `Summarize this YouTube video transcript in 5-8 bullet points, then add a one-line TL;DR at the end.\n\nTitle: ${title}\nURL: https://youtu.be/${videoId}\n\nTranscript:\n${transcript.slice(0, 120000)}`;
                    this._showPanel(await this._call(prompt));
                } catch (error) {
                    this._showPanel(error?.message || 'AI summary failed.', 'error');
                }
            },
            _inject() {
                const controls = doc.querySelector('.ytp-right-controls');
                if (!controls || controls.querySelector('.ytkit-us-ai-button')) return;
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'ytp-button ytkit-us-ai-button';
                button.title = 'AI Summary (right-click to manage the provider credential)';
                button.setAttribute('aria-label', 'AI Summary');
                button.textContent = '✦';
                button.addEventListener('click', (event) => { event.stopPropagation(); void this._run(); });
                button.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const provider = getSettings()?.aiSummaryProvider || 'openai';
                    void manageCredential(provider).then(
                        () => showToast('AI credential updated', '#22c55e'),
                        (error) => showToast(error.message || 'AI credential update failed', '#ef4444')
                    );
                });
                controls.insertBefore(button, controls.firstChild);
                this._button = button;
            },
            init() {
                this._style = injectStyle(`
                    .ytkit-us-ai-panel{position:fixed;top:80px;right:20px;z-index:2147483647;width:min(420px,calc(100vw - 40px));max-height:70vh;overflow:auto;box-sizing:border-box;padding:18px;border:1px solid #45475a;border-radius:12px;background:#1e1e2e;color:#cdd6f4;box-shadow:0 12px 44px rgba(0,0,0,.65);font:14px/1.5 Roboto,system-ui;white-space:pre-wrap}.ytkit-us-ai-close{float:right;min-width:36px;min-height:36px;border:0;background:transparent;color:#cdd6f4;font-size:22px;cursor:pointer}.ytkit-us-ai-error{color:#fca5a5}.ytkit-us-ai-credential-shell{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.7)}.ytkit-us-ai-credential-card{width:min(420px,calc(100vw - 40px));box-sizing:border-box;padding:20px;border:1px solid #45475a;border-radius:12px;background:#1e1e2e;color:#cdd6f4;box-shadow:0 16px 56px rgba(0,0,0,.65);font:14px/1.5 Roboto,system-ui}.ytkit-us-ai-credential-card h3{margin:0 0 8px}.ytkit-us-ai-credential-card p{color:#bac2de}.ytkit-us-ai-credential-card label{display:block;margin:12px 0 5px;font-weight:600}.ytkit-us-ai-credential-card input{box-sizing:border-box;width:100%;min-height:40px;padding:8px;border:1px solid #585b70;border-radius:7px;background:#11111b;color:#cdd6f4}.ytkit-us-ai-credential-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ytkit-us-ai-credential-actions button{min-height:38px;padding:7px 14px}.ytkit-us-ai-panel :focus-visible,.ytkit-us-ai-credential-card :focus-visible{outline:3px solid #89b4fa;outline-offset:2px}@media(prefers-reduced-motion:reduce){.ytkit-us-ai-panel,.ytkit-us-ai-credential-card{scroll-behavior:auto}}`, 'userscript-ai-summary', true);
                this._timer = setTimeout(() => { this._timer = null; this._inject(); }, 1500);
                this._rule = () => {
                    this._button = null;
                    clearTimeout(this._timer);
                    this._timer = setTimeout(() => { this._timer = null; this._inject(); }, 1200);
                };
                addNavigateRule('userscriptAiSummary', this._rule);
            },
            destroy() {
                clearTimeout(this._timer);
                this._timer = null;
                removeNavigateRule('userscriptAiSummary');
                this._button?.remove();
                this._panel?.remove();
                this._style?.remove();
                this._button = this._panel = this._style = null;
            }
        };
    }

    core.createUserscriptAiSummaryFeature = createUserscriptAiSummaryFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createUserscriptAiSummaryFeature };
    }
})();
