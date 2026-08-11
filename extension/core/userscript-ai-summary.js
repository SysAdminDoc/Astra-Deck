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
        const saveSettings = options.saveSettings || (() => {});
        const t = options.t || ((_key, fallback) => fallback);
        const request = options.request || root.GM_xmlhttpRequest || root.GM?.xmlHttpRequest;
        const vault = core.createUserscriptCredentialVault?.(options.credentialStore || {});
        const artifactService = core.aiSummaryArtifacts;

        if (!doc || typeof getSettings !== 'function' || typeof getVideoId !== 'function'
            || !transcriptService || !vault || !artifactService || typeof request !== 'function') {
            throw new Error('Userscript AI Summary dependencies are unavailable.');
        }

        function providerRequest(settings, prompt) {
            const provider = settings.aiSummaryProvider || 'openai';
            const policies = core.AI_PROVIDER_POLICIES || {};
            const knownDefaults = new Set(Object.values(policies).map((policy) => policy?.defaultEndpoint).filter(Boolean));
            const configuredEndpoint = knownDefaults.has(settings.aiSummaryEndpoint)
                ? policies[provider]?.defaultEndpoint
                : settings.aiSummaryEndpoint;
            let validated = core.validateAiProviderEndpoint(provider, configuredEndpoint);
            if (provider === 'gemini') {
                // Gemini's model lives in the URL path, not the payload — honor
                // aiSummaryModel by substituting a validated model segment so the
                // setting isn't silently ignored. Invalid names fall back to the
                // endpoint's model unchanged.
                const model = String(settings.aiSummaryModel || '').trim();
                if (model && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) {
                    const rewritten = validated.url.replace(
                        /\/models\/[^/:?#]+:generateContent/,
                        `/models/${model}:generateContent`
                    );
                    if (rewritten !== validated.url) {
                        validated = core.validateAiProviderEndpoint(provider, rewritten);
                    }
                }
            }
            const payload = provider === 'gemini'
                ? { contents: [{ parts: [{ text: prompt }] }] }
                : provider === 'anthropic'
                    ? {
                        model: settings.aiSummaryModel || 'claude-haiku-4-5-20251001',
                        max_tokens: 1400,
                        messages: [{ role: 'user', content: prompt }]
                    }
                    : {
                        model: settings.aiSummaryModel,
                        max_tokens: 1400,
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
            const result = await transcriptService.fetchTranscript(videoId);
            if (result?.status !== 'ready' || !result.segments?.length) {
                throw new Error('No captions are available for this video.');
            }
            return {
                videoId,
                title: result.title || videoId,
                language: result.language || '',
                prepared: artifactService.prepareCues(result.segments)
            };
        }

        // Identity-memoized clean copy: the library search calls
        // readArtifacts() per keystroke, and re-sanitizing (+ byte-measuring)
        // the full store each time was the hot path this cache removes.
        let artifactsClean = null;
        let artifactsCleanSource = null;

        // Hosts may supply dedicated store accessors (options.readArtifactStore
        // / options.writeArtifactStore) so artifacts live outside the settings
        // bag; the userscript's settings-bag path remains the default.
        const readArtifactStore = typeof options.readArtifactStore === 'function'
            ? options.readArtifactStore
            : () => getSettings()?.aiSummaryArtifactsData;

        function readArtifacts() {
            const raw = readArtifactStore();
            if (raw != null && raw === artifactsCleanSource && artifactsClean) return artifactsClean;
            artifactsClean = artifactService.sanitizeArtifactStore(raw);
            artifactsCleanSource = raw;
            return artifactsClean;
        }

        function writeArtifacts(next) {
            const clean = artifactService.sanitizeArtifactStore(next);
            artifactsClean = clean;
            artifactsCleanSource = null;
            const onWriteFailure = () => {
                showToast(t('aiSummarySaveFailed', 'Saving the summary failed — it may disappear after a reload.'), '#ef4444');
            };
            try {
                if (typeof options.writeArtifactStore === 'function') {
                    const write = options.writeArtifactStore(clean);
                    if (write?.then) write.then((result) => {
                        if (result && result.ok === false) onWriteFailure();
                    }, onWriteFailure);
                    return clean;
                }
                const settings = getSettings();
                if (!settings) return {};
                settings.aiSummaryArtifactsData = clean;
                const write = saveSettings(settings);
                // An async save rejection is otherwise unobserved while the
                // UI already shows the artifact as saved.
                if (write?.catch) write.catch(onWriteFailure);
            } catch (_) { /* reason: caller surfaces synchronous persistence failures */ }
            return clean;
        }

        function downloadArchive() {
            const payload = artifactService.exportArtifactStore(readArtifacts());
            if (!payload.count) {
                showToast(t('aiSummaryNoExport', 'No saved summaries to export.'), '#6b7280');
                return;
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = doc.createElement('a');
            anchor.href = url;
            anchor.download = `astra-deck-ai-summaries-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.style.display = 'none';
            doc.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast(t('aiSummaryExported', 'Saved summaries exported'), '#22c55e');
        }

        function citationLink(artifact, citationId) {
            const cue = artifact?.citations?.[citationId];
            if (!cue) return null;
            const link = doc.createElement('a');
            link.className = 'ytkit-us-ai-citation';
            link.href = artifactService.timestampUrl(artifact, cue);
            link.textContent = cue.timestamp;
            link.setAttribute('aria-label', t('aiSummaryCitationLabel', 'Transcript citation') + ' ' + cue.timestamp);
            link.addEventListener('click', (event) => {
                if (getVideoId() !== artifact.videoId) return;
                const video = doc.querySelector('video');
                if (!video) return;
                event.preventDefault();
                video.currentTime = cue.startSeconds;
                video.focus?.({ preventScroll: true });
            });
            return link;
        }

        function appendCitations(container, artifact, citations) {
            for (const citationId of citations || []) {
                const link = citationLink(artifact, citationId);
                if (link) container.appendChild(link);
            }
        }

        function appendLibrary(feature, container) {
            const details = doc.createElement('details');
            details.className = 'ytkit-us-ai-library';
            const summary = doc.createElement('summary');
            summary.textContent = t('aiSummaryLibrary', 'Saved summaries') + ` (${Object.keys(readArtifacts()).length})`;
            const search = doc.createElement('input');
            search.type = 'search';
            search.placeholder = t('aiSummarySearchPlaceholder', 'Search saved summaries…');
            search.setAttribute('aria-label', t('aiSummarySearchLabel', 'Search saved summaries'));
            const results = doc.createElement('div');
            results.className = 'ytkit-us-ai-library-results';
            const render = () => {
                results.textContent = '';
                const matches = artifactService.searchArtifacts(readArtifacts(), search.value);
                if (!matches.length) {
                    const empty = doc.createElement('p');
                    empty.textContent = t('aiSummaryNoSaved', 'No saved summaries match this search.');
                    results.appendChild(empty);
                    return;
                }
                for (const artifact of matches) {
                    const row = doc.createElement('div');
                    row.className = 'ytkit-us-ai-library-row';
                    const open = doc.createElement('button');
                    open.type = 'button';
                    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(artifact.generatedAt));
                    open.textContent = `${artifact.title} · ${date}`;
                    open.addEventListener('click', () => feature._renderArtifact(artifact));
                    const remove = doc.createElement('button');
                    remove.type = 'button';
                    remove.className = 'ytkit-us-ai-delete';
                    remove.textContent = t('aiSummaryDelete', 'Delete');
                    remove.addEventListener('click', () => feature._deleteArtifact(artifact.artifactId));
                    row.append(open, remove);
                    results.appendChild(row);
                }
            };
            search.addEventListener('input', render);
            details.append(summary, search, results);
            container.appendChild(details);
            render();
        }

        // Rendered inside a closed shadow root: the password input lives on
        // youtube.com, so an open DOM would let page scripts read
        // input.value or observe keystrokes while the dialog is up —
        // contradicting the "stored outside Astra Deck" isolation promise.
        const CREDENTIAL_DIALOG_CSS = ':host{all:initial}'
            + '.ytkit-us-ai-credential-shell{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.7);font:14px/1.5 Roboto,system-ui}'
            + '.ytkit-us-ai-credential-card{width:min(420px,calc(100vw - 40px));box-sizing:border-box;padding:20px;border:1px solid #45475a;border-radius:12px;background:#1e1e2e;color:#cdd6f4;box-shadow:0 16px 56px rgba(0,0,0,.65);font:14px/1.5 Roboto,system-ui}'
            + '.ytkit-us-ai-credential-card h3{margin:0 0 8px;color:#fff}'
            + '.ytkit-us-ai-credential-card p{color:#bac2de}'
            + '.ytkit-us-ai-credential-card label{display:block;margin:12px 0 5px;font-weight:600}'
            + '.ytkit-us-ai-credential-card input{box-sizing:border-box;width:100%;min-height:40px;padding:8px;border:1px solid #585b70;border-radius:7px;background:#11111b;color:#cdd6f4}'
            + '.ytkit-us-ai-credential-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}'
            + '.ytkit-us-ai-credential-actions button{min-height:38px;padding:7px 14px;border:1px solid #585b70;border-radius:6px;background:#313244;color:#cdd6f4;font-weight:700}'
            + '.ytkit-us-ai-credential-card :focus-visible{outline:3px solid #89b4fa;outline-offset:2px}'
            + '@media(forced-colors:active){.ytkit-us-ai-credential-card,.ytkit-us-ai-credential-actions button,.ytkit-us-ai-credential-card input{border:1px solid CanvasText;color:CanvasText;background:Canvas}}'
            + '@media(prefers-reduced-motion:reduce){.ytkit-us-ai-credential-card{scroll-behavior:auto}}';

        function manageCredential(provider, required = false) {
            if (provider === 'ollama') return Promise.resolve('');
            return vault.status(provider).then((state) => new Promise((resolve, reject) => {
                const previousFocus = doc.activeElement;
                const host = doc.createElement('div');
                const shadow = host.attachShadow({ mode: 'closed' });
                const dialogStyle = doc.createElement('style');
                dialogStyle.textContent = CREDENTIAL_DIALOG_CSS;
                shadow.appendChild(dialogStyle);
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
                shadow.appendChild(shell);
                doc.body.appendChild(host);

                let settled = false;
                const finish = (value, error) => {
                    if (settled) return;
                    settled = true;
                    host.remove();
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
            description: t('feature_aiVideoSummary_desc', 'Prefer the browser on-device Summarizer; fall back explicitly to the userscript-manager-isolated BYO-key provider'),
            group: 'Watch Page',
            icon: 'sparkles',
            pages: [options.watchPage || 'watch'],
            _button: null,
            _panel: null,
            _style: null,
            _rule: null,
            _timer: null,
            _runToken: 0,
            async _summarizeLocally(transcript) {
                const localAi = core.localAi;
                const factory = localAi?.getFactory?.('summarizer', root)
                    || root.Summarizer || root.ai?.summarizer;
                if (!factory?.create) return null;
                const availability = localAi?.availability
                    ? await localAi.availability('summarizer', {}, root)
                    : 'unknown';
                if (availability === 'unavailable') return null;
                let summarizer = null;
                try {
                    summarizer = localAi?.create
                        ? await localAi.create('summarizer', {
                            type: 'tldr',
                            length: 'medium',
                            format: 'plain-text'
                        }, root)
                        : await factory.create({ type: 'tldr', length: 'medium', format: 'plain-text' });
                    if (!summarizer?.summarize) return null;
                    const source = String(transcript?.prepared?.transcript || '').slice(0, 12000);
                    if (!source.trim()) return null;
                    const result = await summarizer.summarize(source);
                    return String(result || '').trim() || null;
                } catch (_) {
                    return null;
                } finally {
                    summarizer?.destroy?.();
                }
            },
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
            async _callLLM(prompt) {
                return this._call(prompt);
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
                close.addEventListener('click', () => { this._runToken += 1; panel.remove(); this._panel = null; });
                const body = doc.createElement('div');
                body.className = `ytkit-us-ai-body ytkit-us-ai-${tone}`;
                body.textContent = text;
                panel.append(close, body);
                doc.body.appendChild(panel);
                this._panel = panel;
                return body;
            },
            _deleteArtifact(artifactId) {
                const before = readArtifacts();
                const removed = before[artifactId];
                if (!removed) return;
                writeArtifacts(artifactService.deleteArtifact(before, artifactId));
                const body = this._showPanel('');
                appendLibrary(this, body);
                showToast(t('aiSummaryDeleted', 'Saved summary deleted'), '#6b7280', {
                    duration: 5,
                    tone: 'neutral',
                    action: {
                        text: t('undo', 'Undo'),
                        onClick: () => {
                            writeArtifacts(artifactService.mergeArtifact(readArtifacts(), removed));
                            this._renderArtifact(removed);
                            showToast(t('aiSummaryRestored', 'Saved summary restored'), '#22c55e');
                        }
                    }
                });
            },
            _renderArtifact(value) {
                const artifact = artifactService.sanitizeArtifact(value);
                if (!artifact) {
                    this._showPanel(t('aiSummaryInvalid', 'The saved summary is invalid and cannot be displayed.'), 'error');
                    return;
                }
                const body = this._showPanel('');
                const title = doc.createElement('h4');
                title.textContent = artifact.title;
                const meta = doc.createElement('p');
                meta.className = 'ytkit-us-ai-meta';
                const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(artifact.generatedAt));
                meta.textContent = [date, artifact.transcriptLanguage || '—', `${artifact.provider}/${artifact.model}`].join(' · ');
                const overview = doc.createElement('p');
                overview.textContent = artifact.summary;
                const bullets = doc.createElement('ul');
                for (const bullet of artifact.bullets) {
                    const item = doc.createElement('li');
                    const text = doc.createElement('span');
                    text.textContent = bullet.text;
                    const citations = doc.createElement('span');
                    citations.className = 'ytkit-us-ai-citations';
                    appendCitations(citations, artifact, bullet.citations);
                    item.append(text, citations);
                    bullets.appendChild(item);
                }
                const tldr = doc.createElement('p');
                tldr.className = 'ytkit-us-ai-tldr';
                tldr.hidden = !artifact.tldr.text;
                const label = doc.createElement('strong');
                label.textContent = t('aiSummaryTldr', 'TL;DR') + ': ';
                const tldrText = doc.createElement('span');
                tldrText.textContent = artifact.tldr.text;
                const tldrCitations = doc.createElement('span');
                tldrCitations.className = 'ytkit-us-ai-citations';
                appendCitations(tldrCitations, artifact, artifact.tldr.citations);
                tldr.append(label, tldrText, tldrCitations);
                const actions = doc.createElement('div');
                actions.className = 'ytkit-us-ai-actions';
                const copy = doc.createElement('button');
                copy.type = 'button';
                copy.textContent = t('aiSummaryCopy', 'Copy with citations');
                copy.addEventListener('click', () => {
                    let write;
                    try {
                        if (typeof root.navigator?.clipboard?.writeText !== 'function') throw new Error('Clipboard API unavailable');
                        write = root.navigator.clipboard.writeText(artifactService.artifactToMarkdown(artifact));
                    } catch (error) {
                        write = Promise.reject(error);
                    }
                    void write.then(
                        () => showToast(t('aiSummaryCopied', 'Summary copied with citations'), '#22c55e'),
                        () => showToast(t('clipboardWriteFailed', 'Clipboard write failed'), '#ef4444')
                    );
                });
                const exportAll = doc.createElement('button');
                exportAll.type = 'button';
                exportAll.textContent = t('aiSummaryExport', 'Export archive');
                exportAll.addEventListener('click', downloadArchive);
                const remove = doc.createElement('button');
                remove.type = 'button';
                remove.className = 'ytkit-us-ai-delete';
                remove.textContent = t('aiSummaryDelete', 'Delete');
                remove.addEventListener('click', () => this._deleteArtifact(artifact.artifactId));
                actions.append(copy, exportAll, remove);
                body.append(title, meta, overview, bullets, tldr, actions);
                appendLibrary(this, body);
            },
            async _run() {
                const runToken = ++this._runToken;
                this._showPanel(t('aiSummaryFetchingTranscript', 'Fetching transcript…'));
                try {
                    const transcript = await fetchTranscript();
                    if (runToken !== this._runToken || getVideoId() !== transcript.videoId) return;
                    const localSummary = await this._summarizeLocally(transcript);
                    if (runToken !== this._runToken || getVideoId() !== transcript.videoId) return;
                    if (localSummary) {
                        this._showPanel(`On-device summary (no provider credential)\n\n${localSummary}`);
                        return;
                    }
                    const fallbackNotice = t('feature_aiVideoSummary_desc', 'On-device Summarizer unavailable; using the configured BYO-key provider.');
                    showToast(fallbackNotice, '#f59e0b', { tone: 'warning' });
                    this._showPanel(`${fallbackNotice}\n\n${transcript.prepared.truncated
                        ? t('aiSummaryCallingTruncated', 'Calling AI provider with the first 120,000 transcript characters…')
                        : t('aiSummaryCalling', 'Calling AI provider…')}`);
                    const prompt = artifactService.buildPrompt({
                        title: transcript.title,
                        videoId: transcript.videoId,
                        language: transcript.language,
                        prepared: transcript.prepared
                    });
                    const response = await this._call(prompt);
                    if (runToken !== this._runToken || getVideoId() !== transcript.videoId) return;
                    const parsed = artifactService.parseSummaryResponse(response, transcript.prepared.cues);
                    const settings = getSettings();
                    const artifact = artifactService.createArtifact({
                        videoId: transcript.videoId,
                        title: transcript.title,
                        language: transcript.language,
                        provider: settings.aiSummaryProvider || 'openai',
                        model: settings.aiSummaryModel || '',
                        result: parsed,
                        cues: transcript.prepared.cues
                    });
                    writeArtifacts(artifactService.mergeArtifact(readArtifacts(), artifact));
                    this._renderArtifact(artifact);
                } catch (error) {
                    if (runToken !== this._runToken) return;
                    this._showPanel(error?.message || 'AI summary failed.', 'error');
                }
            },
            _inject() {
                const controls = doc.querySelector('.ytp-right-controls');
                if (!controls || controls.querySelector('.ytkit-us-ai-button')) return;
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'ytp-button ytkit-us-ai-button';
                button.title = t('aiSummaryUserscriptButtonTitle', 'AI Summary (right-click to manage the provider credential)');
                button.setAttribute('aria-label', t('aiSummaryTitle', 'AI Summary'));
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
                    .ytkit-us-ai-panel{position:fixed;top:80px;right:20px;z-index:2147483647;width:min(520px,calc(100vw - 40px));max-height:75vh;overflow:auto;box-sizing:border-box;padding:18px;border:1px solid #45475a;border-radius:12px;background:#1e1e2e;color:#cdd6f4;box-shadow:0 12px 44px rgba(0,0,0,.65);font:14px/1.5 Roboto,system-ui}.ytkit-us-ai-close{float:right;min-width:36px;min-height:36px;border:0;background:transparent;color:#cdd6f4;font-size:22px;cursor:pointer}.ytkit-us-ai-body h4{margin:0 0 4px;color:#fff}.ytkit-us-ai-meta{margin:0 0 10px;color:#bac2de;font-size:11px}.ytkit-us-ai-body ul{display:grid;gap:8px;padding-left:20px}.ytkit-us-ai-citations{display:inline-flex;gap:5px;margin-left:7px}.ytkit-us-ai-citation{padding:2px 6px;border:1px solid #585b70;border-radius:5px;color:#89b4fa;text-decoration:none;font:700 11px/1.3 system-ui}.ytkit-us-ai-tldr{padding:10px;border-left:3px solid #cba6f7;background:rgba(203,166,247,.08)}.ytkit-us-ai-actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.ytkit-us-ai-actions button,.ytkit-us-ai-library-row button{min-height:36px;padding:7px 10px;border:1px solid #585b70;border-radius:6px;background:#313244;color:#cdd6f4;font-weight:700}.ytkit-us-ai-delete{color:#fecaca!important;border-color:#7f1d1d!important}.ytkit-us-ai-library{margin-top:12px;border-top:1px solid #45475a;padding-top:10px}.ytkit-us-ai-library summary{min-height:36px;cursor:pointer;font-weight:700}.ytkit-us-ai-library input{box-sizing:border-box;width:100%;min-height:40px;margin:8px 0;padding:8px;border:1px solid #585b70;border-radius:6px;background:#11111b;color:#cdd6f4}.ytkit-us-ai-library-results{display:grid;gap:6px}.ytkit-us-ai-library-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.ytkit-us-ai-library-row button:first-child{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ytkit-us-ai-error{color:#fca5a5}.ytkit-us-ai-panel :focus-visible{outline:3px solid #89b4fa;outline-offset:2px}@media(max-width:600px){.ytkit-us-ai-panel{top:64px;right:8px;width:calc(100vw - 16px);max-height:calc(100vh - 72px)}}@media(forced-colors:active){.ytkit-us-ai-panel,.ytkit-us-ai-actions button,.ytkit-us-ai-library-row button,.ytkit-us-ai-library input,.ytkit-us-ai-citation{border:1px solid CanvasText;color:CanvasText;background:Canvas}}@media(prefers-reduced-motion:reduce){.ytkit-us-ai-panel{scroll-behavior:auto}.ytkit-us-ai-panel *{transition:none!important}}`, 'userscript-ai-summary', true);
                this._timer = setTimeout(() => { this._timer = null; this._inject(); }, 1500);
                this._rule = () => {
                    this._runToken += 1;
                    this._panel?.remove();
                    this._panel = null;
                    this._button = null;
                    clearTimeout(this._timer);
                    this._timer = setTimeout(() => { this._timer = null; this._inject(); }, 1200);
                };
                addNavigateRule('userscriptAiSummary', this._rule);
            },
            destroy() {
                this._runToken += 1;
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
