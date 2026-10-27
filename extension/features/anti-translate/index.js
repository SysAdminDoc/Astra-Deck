(() => {
    'use strict';

    // Anti-Translate titles and descriptions.
    //
    // YouTube translates a title in the card text AND in the card's title
    // attribute, so the original has to come from something that names it:
    // the legacy title attribute where an older renderer left it alone, the
    // watch page's own player response for that video, and otherwise one
    // bounded lookup per video through core/original-titles.js. Channel
    // exceptions are canonical UC ids only, read from what the page already
    // holds (lockup tags, /channel/ links) or from the lookup record, never
    // from a request of their own.
    //
    // DeArrow draws its crowd title as a copy in front of the real one. That
    // copy is never rewritten here. What changes is the original behind it:
    // the hidden backing title, the original its hover offers, and the
    // attributes its tab-title sync reads.

    const LOCKUP_TAGS_ATTR = 'data-ytkit-lockup-channels-titles';

    function createAntiTranslateFeatures(deps = {}) {
        const core = globalThis.YTKitCore || {};
        const {
            documentRef = globalThis.document,
            readSetting = () => undefined,
            getVideoId = () => null,
            isWatchPage = () => false,
            getPlayerResponse = () => null,
            getClientVersion = () => '',
            getApiKey = () => '',
            fetchImpl = (url, init) => globalThis.fetch(url, init),
            publishBridgeAttribute = () => {},
            addMutationRule = () => {},
            removeMutationRule = () => {},
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            log = () => {},
            setTimeoutFn = (callback, delay) => globalThis.setTimeout(callback, delay),
            clearTimeoutFn = (handle) => globalThis.clearTimeout(handle),
            createOriginalTitleResolver = core.createOriginalTitleResolver,
            parseChannelExceptions = core.parseChannelExceptions,
            parseLockupChannels = core.parseLockupChannels,
            titlesDiffer = core.titlesDiffer,
            t = (_key, fallback) => fallback
        } = deps;

        const titlesFeature = {
            id: 'antiTranslate',
            name: t('feature_antiTranslate_name', 'Anti-Translate (Original Titles + Descriptions)'),
            description: t('feature_antiTranslate_desc', 'Prevent YouTube from auto-translating video titles AND descriptions to your locale. Restores the original-language text on grid thumbnails + watch page.'),
            group: 'Content',
            icon: 'languages',
            _processTimer: null,
            // Card titles: older renderers' #video-title and the 2026 lockup
            // title anchor. DeArrow's crowd title carries the same classes
            // and is never ours to rewrite.
            _CARD_TITLE_SELECTOR: [
                '#video-title:not(.daCustomTitle):not([data-ytkit-dearrow-title])',
                'a.ytLockupMetadataViewModelTitle:not(.daCustomTitle):not([data-ytkit-dearrow-title])',
                'a.yt-lockup-metadata-view-model__title:not(.daCustomTitle):not([data-ytkit-dearrow-title])'
            ].join(', '),
            _CARD_HOST_SELECTOR: 'yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer',
            _PLAYLIST_ROW_SELECTOR: 'ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer',
            _WATCH_TITLE_SELECTOR: 'ytd-watch-metadata h1 yt-formatted-string:not(.daCustomTitle):not([data-ytkit-dearrow-title])',
            // A renderer that keeps putting the translation back would turn
            // every write into a mutation, a pass and another write.
            _MAX_WRITES_PER_TITLE: 3,
            // New lookups one pass may start. The resolver's own queue is the
            // hard bound; this keeps one long feed tick from filling it.
            _MAX_LOOKUPS_PER_PASS: 24,
            _MAX_LEARNED_HANDLES: 2000,
            _resolver: null,
            _written: null,
            _descriptions: null,
            _generation: 0,
            _exceptionsRaw: null,
            _exceptions: null,
            _handles: null,

            // No on-device language model here on purpose. This feature
            // compares the rendered title against a named source (the title
            // attribute, the player response, oEmbed), which is a string
            // comparison. A detector session used to be created from every
            // pass, so concurrent creates orphaned sessions that destroy()
            // never released, and its only consumer had no callers. See
            // tests/teardown-and-leaks.test.js.

            // Once per pending pass, not once per mutation: a busy page would
            // otherwise push the pass back forever.
            _scheduleProcess(delay = 1500) {
                if (this._processTimer) return;
                this._processTimer = setTimeoutFn(() => {
                    this._processTimer = null;
                    this._process();
                }, delay);
            },

            _videoIdFromHref(href) {
                const value = String(href || '');
                const match = /[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(value)
                    || /\/shorts\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(value);
                return match ? match[1] : null;
            },

            _cardVideoId(el) {
                const anchor = el.matches?.('a[href]') ? el : el.closest?.('a[href]');
                const href = anchor?.getAttribute?.('href') || '';
                // A Mix or playlist card links to its first video, whose title
                // isn't the card's. A row inside the playlist is that video.
                if (/[?&]list=/.test(href) && !el.closest?.(this._PLAYLIST_ROW_SELECTOR)) return null;
                return this._videoIdFromHref(href);
            },

            // A lockup title keeps its typography on one inner span.
            _textTarget(el) {
                const only = el.children?.length === 1 ? el.children[0] : null;
                return only?.tagName === 'SPAN' ? only : el;
            },

            _dearrowCopy(el) {
                const prior = el.previousElementSibling;
                return prior?.getAttribute?.('data-ytkit-dearrow-title') === '1' ? prior : null;
            },

            _syncExceptions() {
                const raw = String(readSetting('antiTranslateChannelExceptions') || '');
                if (raw === this._exceptionsRaw) return;
                this._exceptionsRaw = raw;
                this._exceptions = new Set(parseChannelExceptions?.(raw) || []);
                // Lockups name their channel only in their view model. The
                // MAIN world writes it on the card while someone needs it.
                try {
                    publishBridgeAttribute(LOCKUP_TAGS_ATTR, this._exceptions.size ? 'on' : 'off');
                } catch (error) {
                    log(`Lockup channel tags not published: ${error?.message || error}`);
                }
            },

            _learnHandle(handle, channelId) {
                if (!handle || !channelId) return;
                const key = String(handle).toLowerCase();
                if (this._handles.has(key)) return;
                if (this._handles.size >= this._MAX_LEARNED_HANDLES) this._handles.delete(this._handles.keys().next().value);
                this._handles.set(key, channelId);
            },

            // The card's canonical channel ids (a collab card names several)
            // from what the page already holds, then from the lookup record.
            // Never a request of its own.
            _channelsFor(el, videoId, record) {
                const host = el.closest?.(this._CARD_HOST_SELECTOR) || null;
                const lockup = host?.matches?.('yt-lockup-view-model')
                    ? host
                    : host?.querySelector?.('yt-lockup-view-model[data-ytkit-lockup-channels]');
                const tagged = parseLockupChannels?.(lockup?.getAttribute?.('data-ytkit-lockup-channels'));
                if (tagged && tagged.videoId === videoId) {
                    for (const channel of tagged.channels) this._learnHandle(channel.handle, channel.channelId);
                    return tagged.channels.map((channel) => channel.channelId);
                }
                const linked = [];
                for (const link of host?.querySelectorAll?.('a[href*="/channel/UC"]') || []) {
                    const id = /\/channel\/(UC[A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(link.getAttribute?.('href') || '')?.[1];
                    if (id) linked.push(id);
                }
                if (linked.length) return linked;
                if (record?.channelId) return [record.channelId];
                const learned = record?.handle ? this._handles.get(record.handle) : null;
                return learned ? [learned] : [];
            },

            _isExcepted(channelIds) {
                const ids = Array.isArray(channelIds) ? channelIds : [channelIds];
                return ids.some((channelId) => Boolean(channelId && this._exceptions?.has(channelId)));
            },

            // DeArrow copies whatever the heading shows when it draws, and
            // swaps its copy on a re-render. Every pass points the live copy
            // at both titles, so its hover and the tab-title sync stay right
            // whichever feature got there first.
            _syncDearrowCopy(el, state) {
                const copy = this._dearrowCopy(el);
                if (copy) {
                    copy.setAttribute('data-ytkit-orig-title', state.original);
                    copy.setAttribute('data-ytkit-rendered-title', state.translated);
                    if (copy.title === state.translated) copy.title = state.original;
                }
                state.dearrow = copy;
            },

            // Puts back what YouTube rendered, on teardown or when a channel
            // becomes an exception.
            _restoreTitle(el) {
                const state = this._written?.get(el);
                if (!state) return;
                this._written.delete(el);
                el.removeAttribute('ytkit-antitranslate');
                if (state.target?.textContent === state.original) state.target.textContent = state.translated;
                for (const [node, name, value] of state.attributes) node.setAttribute(name, value);
                // The live copy, in case DeArrow swapped it since the last pass.
                const copy = this._dearrowCopy(el) || state.dearrow;
                if (copy) {
                    copy.setAttribute('data-ytkit-orig-title', state.translated);
                    copy.removeAttribute('data-ytkit-rendered-title');
                    if (copy.title === state.original) copy.title = state.translated;
                }
            },

            _writeTitle(el, videoId, original) {
                const target = this._textTarget(el);
                const displayed = String(target.textContent || '').trim();
                const prior = this._written.get(el);
                const same = prior && prior.videoId === videoId ? prior : null;
                if (!titlesDiffer?.(displayed, original)) {
                    if (same) this._syncDearrowCopy(el, same);
                    return false;
                }
                const count = same ? same.count : 0;
                if (count >= this._MAX_WRITES_PER_TITLE) return false;
                const attributes = [];
                const swap = (node, name) => {
                    const value = node?.getAttribute?.(name);
                    if (typeof value !== 'string' || !value.includes(displayed)) return;
                    attributes.push([node, name, value]);
                    node.setAttribute(name, value.replace(displayed, () => original));
                };
                swap(el, 'title');
                swap(el, 'aria-label');
                swap(el.closest?.('h3[title]'), 'title');
                target.textContent = original;
                el.setAttribute('ytkit-antitranslate', videoId);
                const state = {
                    videoId,
                    target,
                    original,
                    translated: displayed,
                    attributes: same ? same.attributes.concat(attributes) : attributes,
                    dearrow: null,
                    count: count + 1
                };
                this._syncDearrowCopy(el, state);
                this._written.set(el, state);
                return true;
            },

            _applyRecord(el, videoId, record) {
                if (!record?.title) return;
                if (this._isExcepted(this._channelsFor(el, videoId, record))) return;
                this._writeTitle(el, videoId, record.title);
            },

            _lookup(el, videoId, budget) {
                if (budget.left <= 0) return;
                budget.left -= 1;
                const generation = this._generation;
                this._resolver.request(videoId).then((record) => {
                    // Teardown, a navigation, or YouTube reusing the card for
                    // another video since: this answer is for nobody.
                    if (!this._resolver || generation !== this._generation) return;
                    if (el.isConnected === false || this._cardVideoId(el) !== videoId) return;
                    this._applyRecord(el, videoId, record);
                }, (error) => {
                    log(`title lookup rejected: ${error?.message || error}`);
                });
            },

            _processCard(el, budget) {
                const videoId = this._cardVideoId(el);
                if (!videoId) return;
                const state = this._written.get(el);
                if (state && state.videoId !== videoId) {
                    // Renderer reuse: the old video's original has nothing to
                    // do with what the card shows now.
                    this._written.delete(el);
                    el.removeAttribute('ytkit-antitranslate');
                }
                const cached = this._resolver.peek(videoId);
                // The cached record counts too: an oEmbed answer may be the
                // only thing that named this card's channel.
                if (this._isExcepted(this._channelsFor(el, videoId, cached || null))) {
                    this._restoreTitle(el);
                    return;
                }
                const current = this._written.get(el);
                if (current) {
                    // Already restored. Only YouTube putting the translation
                    // back needs anything, and the original is known.
                    this._writeTitle(el, videoId, current.original);
                    return;
                }
                // Older cards keep the original in the title attribute. That
                // is free, so it goes first.
                const target = this._textTarget(el);
                const displayed = String(target.textContent || '').trim();
                const attribute = el.getAttribute?.('title') || '';
                if (attribute && titlesDiffer?.(displayed, attribute)) {
                    this._writeTitle(el, videoId, attribute);
                    return;
                }
                if (cached === undefined) this._lookup(el, videoId, budget);
                else if (cached) this._applyRecord(el, videoId, cached);
            },

            _playerDetails() {
                try {
                    return getPlayerResponse()?.videoDetails || null;
                } catch {
                    // reason: the page global can be unreadable; oEmbed covers it
                    return null;
                }
            },

            _processWatchTitle(budget) {
                const el = documentRef.querySelector(this._WATCH_TITLE_SELECTOR);
                const videoId = getVideoId();
                if (!el || !videoId) return;
                const state = this._written.get(el);
                if (state && state.videoId !== videoId) {
                    this._written.delete(el);
                    el.removeAttribute('ytkit-antitranslate');
                }
                // After an in-app navigation the global still describes the
                // first video, so it only counts for this one.
                const details = this._playerDetails();
                if (details?.videoId === videoId && typeof details.title === 'string' && details.title.trim()) {
                    if (this._isExcepted(details.channelId)) {
                        this._restoreTitle(el);
                        return;
                    }
                    this._writeTitle(el, videoId, details.title.trim());
                    return;
                }
                const cached = this._resolver.peek(videoId);
                if (cached === undefined) {
                    if (budget.left <= 0) return;
                    budget.left -= 1;
                    const generation = this._generation;
                    this._resolver.request(videoId).then((record) => {
                        if (!this._resolver || generation !== this._generation || getVideoId() !== videoId) return;
                        if (!record?.title || el.isConnected === false) return;
                        if (this._isExcepted(record.channelId || this._handles.get(record.handle))) return;
                        this._writeTitle(el, videoId, record.title);
                    }, (error) => {
                        log(`watch title lookup rejected: ${error?.message || error}`);
                    });
                } else if (cached?.title && !this._isExcepted(cached.channelId || this._handles.get(cached.handle))) {
                    this._writeTitle(el, videoId, cached.title);
                }
            },

            // v3.23.0 (NX8): watch page DESCRIPTION un-translate. The original
            // lives in the player response's `shortDescription`, and the
            // displayed one renders into `#description-inline-expander`
            // (collapsed) and `ytd-text-inline-expander` (expanded). Channel
            // exceptions are for titles only.
            _processDescription() {
                try {
                    const details = this._playerDetails();
                    const originalDesc = details?.videoId === getVideoId() ? details?.shortDescription : null;
                    if (!originalDesc) return;
                    const descTargets = documentRef.querySelectorAll(
                        '#description-inline-expander yt-attributed-string:not([ytkit-antitranslate]), ' +
                        'ytd-text-inline-expander yt-attributed-string:not([ytkit-antitranslate]), ' +
                        '#description yt-formatted-string:not([ytkit-antitranslate])'
                    );
                    descTargets.forEach(el => {
                        const displayed = el.textContent.trim();
                        // Skip identical (already original) and very short
                        // descriptions to avoid false positives on empty
                        // rollouts.
                        if (displayed && displayed !== originalDesc.trim() && originalDesc.length > 40) {
                            this._descriptions.set(el, { original: originalDesc, translated: el.textContent });
                            el.textContent = originalDesc;
                            el.setAttribute('ytkit-antitranslate', '1');
                        }
                    });
                } catch (_) {
                    // reason: best-effort un-translate; never break the page
                }
            },

            _process() {
                if (!this._resolver) return;
                this._syncExceptions();
                const budget = { left: this._MAX_LOOKUPS_PER_PASS };
                // The watch title first: it's the one the viewer is reading.
                if (isWatchPage()) this._processWatchTitle(budget);
                documentRef.querySelectorAll(this._CARD_TITLE_SELECTOR).forEach((el) => this._processCard(el, budget));
                this._processDescription();
            },

            // oEmbed answers 401 when embedding is off. The player fallback
            // uses the client version this page is running, and none at all
            // when that can't be read.
            _buildPlayerRequest(videoId) {
                const clientVersion = getClientVersion() || '';
                if (!clientVersion) return null;
                const apiKey = getApiKey() || '';
                const query = /^[A-Za-z0-9_-]{10,}$/.test(apiKey) ? `?key=${encodeURIComponent(apiKey)}&prettyPrint=false` : '?prettyPrint=false';
                return {
                    url: `https://www.youtube.com/youtubei/v1/player${query}`,
                    init: {
                        method: 'POST',
                        credentials: 'omit',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion } }, videoId })
                    }
                };
            },

            init() {
                this._written = new WeakMap();
                this._descriptions = new WeakMap();
                this._handles = new Map();
                this._exceptionsRaw = null;
                this._generation += 1;
                this._resolver = createOriginalTitleResolver?.({
                    fetch: fetchImpl,
                    buildPlayerRequest: (videoId) => this._buildPlayerRequest(videoId),
                    log
                }) || null;
                this._scheduleProcess(1500);
                addMutationRule(this.id, () => this._scheduleProcess(400));
                addNavigateRule('antiTranslate', () => {
                    // What was queued for the last page is for nobody now.
                    this._generation += 1;
                    this._resolver?.cancelPending();
                    // Descriptions are re-checked against the new video. Titles
                    // carry their video id, so a reused one is caught anyway.
                    documentRef.querySelectorAll('[ytkit-antitranslate="1"]').forEach(el => el.removeAttribute('ytkit-antitranslate'));
                    if (this._processTimer) clearTimeoutFn(this._processTimer);
                    this._processTimer = null;
                    this._scheduleProcess(2000);
                });
            },

            destroy() {
                if (this._processTimer) clearTimeoutFn(this._processTimer);
                this._processTimer = null;
                removeMutationRule(this.id);
                removeNavigateRule('antiTranslate');
                this._generation += 1;
                this._resolver?.close();
                this._resolver = null;
                documentRef.querySelectorAll('[ytkit-antitranslate]').forEach((el) => {
                    this._restoreTitle(el);
                    // A description YouTube re-rendered since is left as it is.
                    const description = this._descriptions?.get(el);
                    if (description && el.textContent === description.original) el.textContent = description.translated;
                    el.removeAttribute('ytkit-antitranslate');
                });
                try {
                    publishBridgeAttribute(LOCKUP_TAGS_ATTR, 'off');
                } catch (_) { /* reason: teardown must finish even if the bridge is gone */ }
                this._written = null;
                this._descriptions = null;
                this._handles = null;
                this._exceptions = null;
                this._exceptionsRaw = null;
            }
        };

        const exceptionsFeature = {
            id: 'antiTranslateChannelExceptions',
            name: t('feature_antiTranslateChannelExceptions_name', 'Keep Translated Titles For'),
            description: t('feature_antiTranslateChannelExceptions_desc', 'Channels whose translated titles stay as YouTube shows them. One channel ID (UC...) or /channel/ link per line. Handles aren\'t used, since one can change hands.'),
            group: 'Content',
            icon: 'languages',
            isSubFeature: true,
            parentId: 'antiTranslate',
            type: 'textarea',
            // i18n-static: an example channel id, not prose
            placeholder: 'UCxxxxxxxxxxxxxxxxxxxxxx',
            settingKey: 'antiTranslateChannelExceptions',
            dependsOn: 'antiTranslate',
            init() { /* the parent reads the list on every pass */ },
            destroy() { /* textarea, no runtime side effects of its own */ }
        };

        return [titlesFeature, exceptionsFeature];
    }

    const api = Object.freeze({
        createAntiTranslateFeatures,
        LOCKUP_TAGS_ATTR
    });
    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.antiTranslate = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
