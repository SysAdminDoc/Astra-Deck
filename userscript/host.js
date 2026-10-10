// Astra Deck userscript host.
//
// The userscript runs the extension's own code. sync-userscript.js packs the
// extension sources into @require libraries that only REGISTER each file as a
// function; this host decides what runs where and when, the way the manifest
// does for the extension:
//
//   document-start  core/bridge-token.js and early.css, in the sandbox
//                   the MAIN-world scripts, injected into the page
//                   background.js, in the sandbox under its own scope
//   document-idle   the ISOLATED runtime, in the manifest's order
//   live_chat frame the live-chat content group, and nothing else
//
// Every chrome.* call the extension makes lands on an adapter built here from
// GM_* grants. The adapter lives in the userscript sandbox only: the page can
// never reach it, and nothing privileged is ever handed to the MAIN world.
(function astraDeckUserscriptHost(BUILD) {
    'use strict';

    const HOST_GLOBAL = globalThis;
    const HOST_WINDOW = typeof window !== 'undefined' ? window : HOST_GLOBAL;
    const HOST_SELF = typeof self !== 'undefined' ? self : HOST_WINDOW;
    const LOG_PREFIX = '[Astra Deck userscript]';
    const REGISTRY_KEY = '__astraDeckUserscriptModules';
    const STATE_KEY = '__astraDeckUserscript';
    const INTERNAL_PREFIX = '__astraDeck.';
    const JOURNAL_KEY = INTERNAL_PREFIX + 'journal';
    const INSTALLED_VERSION_KEY = INTERNAL_PREFIX + 'installedVersion';
    const RUNTIME_ID = BUILD.runtimeId;
    const PACKAGE_BASE_URL = 'https://' + RUNTIME_ID + '.userscript.invalid/';
    const TAB_ID = 1 + Math.floor(Math.random() * 2147483000);
    const INSTANCE_TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const nativeFetch = typeof HOST_GLOBAL.fetch === 'function' ? HOST_GLOBAL.fetch.bind(HOST_GLOBAL) : null;
    // A manager can't block a request before it's sent the way the extension's
    // declarativeNetRequest ruleset does, so the userscript states the narrower
    // contract it does keep: ad shells hidden from document-start.
    const AD_CONTRACT_ATTRIBUTE = 'data-ytkit-userscript-ad-contract';
    const AD_CONTRACT = 'document-start-shells-only';

    const hostState = {
        version: BUILD.version,
        route: 'pending',
        manager: describeManager(),
        phase: 'starting',
        startedAt: Date.now(),
        errors: []
    };
    HOST_GLOBAL[STATE_KEY] = hostState;

    function describeManager() {
        try {
            if (typeof GM_info === 'object' && GM_info) {
                return String(GM_info.scriptHandler || 'unknown') + ' ' + String(GM_info.version || '');
            }
        } catch (_) {
            // reason: GM_info is informational only
        }
        return 'unknown';
    }

    function recordError(stage, error) {
        const message = String(error?.message || error || 'unknown error').slice(0, 400);
        hostState.errors.push({ stage, message, at: Date.now() });
        if (hostState.errors.length > 50) hostState.errors.shift();
        try {
            console.error(LOG_PREFIX + ' ' + stage + ' failed:', error);
        } catch (_) {
            // reason: console may be unavailable in exotic sandboxes
        }
    }

    // ── Route ────────────────────────────────────────────────────────────────
    // Mirrors the manifest: the main groups run in the top frame of a YouTube
    // page, the live-chat group runs in every live_chat document (the iframe
    // and the pop-out window), and every other frame gets nothing.
    function classifyRoute() {
        const hostname = String(location.hostname || '').toLowerCase();
        const pathname = String(location.pathname || '');
        if (/^(m|music|studio)\.youtube\.com$/.test(hostname)) return 'skip';
        const youtube = hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
        if (youtube && pathname.startsWith('/live_chat')) return 'live-chat';
        let top = true;
        try {
            top = HOST_WINDOW.top === HOST_WINDOW.self;
        } catch (_) {
            top = false;
        }
        return top ? 'main' : 'skip';
    }

    const route = classifyRoute();
    hostState.route = route;
    if (route === 'skip') {
        hostState.phase = 'skipped';
        return;
    }

    // Only the modules the host can't boot without. Between releases this
    // file on main can be newer than the release libraries it pins, and a
    // feature module they don't carry yet is skipped and recorded by the
    // runtime instead (failedFeatureModules), not fatal for the whole script.
    const registry = HOST_GLOBAL[REGISTRY_KEY];
    hostState.missingOptionalModules = (BUILD.optionalModules || [])
        .filter((path) => typeof registry?.[path] !== 'function');
    const missingModules = BUILD.requiredModules.filter((path) => typeof registry?.[path] !== 'function');
    if (missingModules.length) {
        hostState.phase = 'failed';
        recordError('library check', new Error('The Astra Deck libraries did not load (missing '
            + missingModules.slice(0, 3).join(', ') + (missingModules.length > 3 ? ', ...' : '')
            + '). Reinstall the userscript or check that raw.githubusercontent.com is reachable.'));
        return;
    }

    // ── Small helpers ────────────────────────────────────────────────────────
    function cloneJson(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function sameJson(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function later(run) {
        Promise.resolve().then(run).catch((error) => recordError('deferred task', error));
    }

    function createEvent(label) {
        const listeners = new Set();
        return {
            addListener(listener) {
                if (typeof listener === 'function') listeners.add(listener);
            },
            removeListener(listener) {
                listeners.delete(listener);
            },
            hasListener(listener) {
                return listeners.has(listener);
            },
            hasListeners() {
                return listeners.size > 0;
            },
            dispatch(...args) {
                for (const listener of [...listeners]) {
                    try {
                        listener(...args);
                    } catch (error) {
                        recordError(label + ' listener', error);
                    }
                }
            },
            listeners() {
                return [...listeners];
            }
        };
    }

    // chrome.runtime.lastError is only meaningful inside a callback, exactly
    // as in the browser: it is set for the duration of the call and cleared.
    let activeLastError = null;

    function invokeCallback(callback, value, error) {
        activeLastError = error ? { message: String(error?.message || error) } : null;
        try {
            callback(value);
        } catch (callbackError) {
            recordError('api callback', callbackError);
        } finally {
            activeLastError = null;
        }
    }

    // Every method accepts a trailing callback (Chrome style) and otherwise
    // returns a promise (Firefox and MV3 style), and results always arrive
    // asynchronously, as they do from a real extension API.
    function apiMethod(implementation) {
        return function adaptedApiMethod(...args) {
            let callback = null;
            if (args.length && typeof args[args.length - 1] === 'function') callback = args.pop();
            let result;
            try {
                result = Promise.resolve(implementation(...args));
            } catch (error) {
                result = Promise.reject(error);
            }
            if (!callback) return result;
            result.then(
                (value) => invokeCallback(callback, value, null),
                (error) => invokeCallback(callback, undefined, error)
            );
            return undefined;
        };
    }

    function gm(name) {
        // Each grant is read by its literal name: a manager exposes only the
        // grants the header declares, as free identifiers in the sandbox.
        try {
            switch (name) {
                case 'getValue': return typeof GM_getValue === 'function' ? GM_getValue : null;
                case 'setValue': return typeof GM_setValue === 'function' ? GM_setValue : null;
                case 'deleteValue': return typeof GM_deleteValue === 'function' ? GM_deleteValue : null;
                case 'listValues': return typeof GM_listValues === 'function' ? GM_listValues : null;
                case 'addValueChangeListener': return typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null;
                case 'addStyle': return typeof GM_addStyle === 'function' ? GM_addStyle : null;
                case 'addElement': return typeof GM_addElement === 'function' ? GM_addElement : null;
                case 'xmlhttpRequest': return typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
                case 'download': return typeof GM_download === 'function' ? GM_download : null;
                case 'openInTab': return typeof GM_openInTab === 'function' ? GM_openInTab : null;
                case 'registerMenuCommand': return typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null;
                case 'setClipboard': return typeof GM_setClipboard === 'function' ? GM_setClipboard : null;
                case 'getResourceText': return typeof GM_getResourceText === 'function' ? GM_getResourceText : null;
                case 'cookie': return (typeof GM_cookie === 'object' || typeof GM_cookie === 'function') && GM_cookie ? GM_cookie : null;
                default: return null;
            }
        } catch (_) {
            return null;
        }
    }

    const GM_API = {
        getValue: gm('getValue'),
        setValue: gm('setValue'),
        deleteValue: gm('deleteValue'),
        listValues: gm('listValues'),
        addValueChangeListener: gm('addValueChangeListener'),
        addStyle: gm('addStyle'),
        addElement: gm('addElement'),
        xmlhttpRequest: gm('xmlhttpRequest'),
        download: gm('download'),
        openInTab: gm('openInTab'),
        registerMenuCommand: gm('registerMenuCommand'),
        setClipboard: gm('setClipboard'),
        getResourceText: gm('getResourceText'),
        cookie: gm('cookie')
    };

    // ── storage ──────────────────────────────────────────────────────────────
    // storage.local maps key for key onto GM values, the same keys the old
    // hand-written userscript used, so an existing install keeps its settings,
    // hidden videos, bookmarks and caches with no migration step. Other tabs
    // hear about a write through one journal key, because a GM value listener
    // has to name the key it watches.
    const storageChanged = createEvent('storage.onChanged');
    const contentStorageChanged = createEvent('content storage.onChanged');
    const localChanged = createEvent('storage.local.onChanged');
    const sessionChanged = createEvent('storage.session.onChanged');
    const lastKnownLocal = new Map();

    function normalizeKeyQuery(keys) {
        if (keys === null || keys === undefined) return { all: true, names: [], defaults: {} };
        if (typeof keys === 'string') return { all: false, names: [keys], defaults: {} };
        if (Array.isArray(keys)) return { all: false, names: keys.map(String), defaults: {} };
        if (typeof keys === 'object') return { all: false, names: Object.keys(keys), defaults: keys };
        throw new TypeError('storage.get: invalid keys argument');
    }

    // A macrotask, so the write's own promise settles first, as in Chrome.
    function emitStorageChange(changes, areaName) {
        if (!Object.keys(changes).length) return;
        setTimeout(() => {
            storageChanged.dispatch(cloneJson(changes), areaName);
            (areaName === 'local' ? localChanged : sessionChanged).dispatch(cloneJson(changes));
            if (areaName === 'local') contentStorageChanged.dispatch(cloneJson(changes), areaName);
        }, 0);
    }

    function localKeys() {
        const list = GM_API.listValues ? GM_API.listValues() : [];
        return (Array.isArray(list) ? list : []).filter((key) => !String(key).startsWith(INTERNAL_PREFIX));
    }

    const NO_VALUE = Symbol('no value');

    function readLocal(key) {
        const value = GM_API.getValue(key, NO_VALUE);
        if (value === NO_VALUE || value === undefined) {
            lastKnownLocal.delete(key);
            return NO_VALUE;
        }
        lastKnownLocal.set(key, cloneJson(value));
        return value;
    }

    function publishJournal(keys) {
        if (!keys.length) return;
        try {
            GM_API.setValue(JOURNAL_KEY, { source: INSTANCE_TOKEN, keys, at: Date.now(), nonce: Math.random() });
        } catch (error) {
            recordError('storage journal', error);
        }
    }

    const localArea = {
        QUOTA_BYTES: 1073741824,
        onChanged: localChanged,
        get: apiMethod((keys) => {
            const query = normalizeKeyQuery(keys);
            const names = query.all ? localKeys() : query.names;
            const out = {};
            for (const key of names) {
                const value = readLocal(key);
                if (value !== NO_VALUE) out[key] = cloneJson(value);
                else if (Object.hasOwn(query.defaults, key)) out[key] = cloneJson(query.defaults[key]);
            }
            return out;
        }),
        getKeys: apiMethod(() => localKeys()),
        set: apiMethod((items) => {
            if (!items || typeof items !== 'object') throw new TypeError('storage.set: items must be an object');
            const changes = {};
            for (const [key, raw] of Object.entries(items)) {
                if (raw === undefined || typeof raw === 'function') continue;
                const next = cloneJson(raw);
                const previous = readLocal(key);
                if (previous !== NO_VALUE && sameJson(previous, next)) continue;
                GM_API.setValue(key, next);
                lastKnownLocal.set(key, cloneJson(next));
                changes[key] = previous === NO_VALUE ? { newValue: next } : { oldValue: cloneJson(previous), newValue: next };
            }
            publishJournal(Object.keys(changes));
            emitStorageChange(changes, 'local');
        }),
        remove: apiMethod((keys) => {
            const names = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys.map(String) : []);
            const changes = {};
            for (const key of names) {
                const previous = readLocal(key);
                if (previous === NO_VALUE) continue;
                GM_API.deleteValue(key);
                lastKnownLocal.delete(key);
                changes[key] = { oldValue: cloneJson(previous) };
            }
            publishJournal(Object.keys(changes));
            emitStorageChange(changes, 'local');
        }),
        clear: apiMethod(() => {
            const changes = {};
            for (const key of localKeys()) {
                const previous = readLocal(key);
                GM_API.deleteValue(key);
                lastKnownLocal.delete(key);
                if (previous !== NO_VALUE) changes[key] = { oldValue: cloneJson(previous) };
            }
            publishJournal(Object.keys(changes));
            emitStorageChange(changes, 'local');
        }),
        getBytesInUse: apiMethod((keys) => {
            const query = normalizeKeyQuery(keys);
            const names = query.all ? localKeys() : query.names;
            let total = 0;
            for (const key of names) {
                const value = readLocal(key);
                if (value !== NO_VALUE) total += key.length + JSON.stringify(value).length;
            }
            return total;
        }),
        setAccessLevel: apiMethod(() => undefined)
    };

    if (GM_API.addValueChangeListener) {
        try {
            GM_API.addValueChangeListener(JOURNAL_KEY, (_name, _oldValue, entry, remote) => {
                if (!remote || !entry || entry.source === INSTANCE_TOKEN || !Array.isArray(entry.keys)) return;
                const changes = {};
                for (const key of entry.keys) {
                    if (typeof key !== 'string' || key.startsWith(INTERNAL_PREFIX)) continue;
                    const hadPrevious = lastKnownLocal.has(key);
                    const previous = lastKnownLocal.get(key);
                    const current = readLocal(key);
                    if (current === NO_VALUE) {
                        if (hadPrevious) changes[key] = { oldValue: previous };
                    } else if (!hadPrevious || !sameJson(previous, current)) {
                        changes[key] = hadPrevious
                            ? { oldValue: previous, newValue: cloneJson(current) }
                            : { newValue: cloneJson(current) };
                    }
                }
                emitStorageChange(changes, 'local');
            });
        } catch (error) {
            recordError('cross-tab storage listener', error);
        }
    }

    // storage.session lives as long as the tab, the closest a userscript gets
    // to a browser session. It is shared by this tab's content and background.
    const sessionValues = new Map();
    const sessionArea = {
        QUOTA_BYTES: 10485760,
        onChanged: sessionChanged,
        get: apiMethod((keys) => {
            const query = normalizeKeyQuery(keys);
            const names = query.all ? [...sessionValues.keys()] : query.names;
            const out = {};
            for (const key of names) {
                if (sessionValues.has(key)) out[key] = cloneJson(sessionValues.get(key));
                else if (Object.hasOwn(query.defaults, key)) out[key] = cloneJson(query.defaults[key]);
            }
            return out;
        }),
        getKeys: apiMethod(() => [...sessionValues.keys()]),
        set: apiMethod((items) => {
            if (!items || typeof items !== 'object') throw new TypeError('storage.set: items must be an object');
            const changes = {};
            for (const [key, raw] of Object.entries(items)) {
                if (raw === undefined || typeof raw === 'function') continue;
                const next = cloneJson(raw);
                const had = sessionValues.has(key);
                const previous = sessionValues.get(key);
                if (had && sameJson(previous, next)) continue;
                sessionValues.set(key, next);
                changes[key] = had ? { oldValue: cloneJson(previous), newValue: cloneJson(next) } : { newValue: cloneJson(next) };
            }
            emitStorageChange(changes, 'session');
        }),
        remove: apiMethod((keys) => {
            const names = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys.map(String) : []);
            const changes = {};
            for (const key of names) {
                if (!sessionValues.has(key)) continue;
                changes[key] = { oldValue: cloneJson(sessionValues.get(key)) };
                sessionValues.delete(key);
            }
            emitStorageChange(changes, 'session');
        }),
        clear: apiMethod(() => {
            const changes = {};
            for (const [key, value] of sessionValues) changes[key] = { oldValue: cloneJson(value) };
            sessionValues.clear();
            emitStorageChange(changes, 'session');
        }),
        getBytesInUse: apiMethod(() => {
            let total = 0;
            for (const [key, value] of sessionValues) total += key.length + JSON.stringify(value).length;
            return total;
        }),
        setAccessLevel: apiMethod(() => undefined)
    };

    const storageApi = {
        local: localArea,
        session: sessionArea,
        onChanged: storageChanged
    };

    // Chrome keeps storage.session away from content scripts unless the worker
    // opens it up, and the AI credential vault caches keys there.
    const contentStorageApi = {
        local: localArea,
        onChanged: contentStorageChanged
    };

    // ── i18n ─────────────────────────────────────────────────────────────────
    // English ships inside the main file so every label resolves even if a
    // locale resource failed to download; the others arrive as @resource
    // files. Lookup is case-insensitive and falls back to English per key,
    // as chrome.i18n does.
    const RTL_LOCALES = new Set(['ar', 'fa', 'he', 'ur']);
    const localeCache = new Map();

    function lowerKeyMap(flat) {
        const map = new Map();
        for (const [key, message] of Object.entries(flat || {})) map.set(key.toLowerCase(), message);
        return map;
    }

    function readBundledLocale(locale) {
        if (localeCache.has(locale)) return localeCache.get(locale);
        let flat = null;
        if (locale === BUILD.defaultLocale) {
            flat = BUILD.messages;
        } else if (BUILD.locales.includes(locale) && GM_API.getResourceText) {
            try {
                const text = GM_API.getResourceText(BUILD.localeResourcePrefix + locale);
                if (text) {
                    flat = {};
                    for (const [key, entry] of Object.entries(JSON.parse(text))) {
                        if (entry && typeof entry.message === 'string') flat[key] = entry.message;
                    }
                }
            } catch (error) {
                recordError('locale ' + locale, error);
            }
        }
        localeCache.set(locale, flat);
        return flat;
    }

    function resolveUiLocale() {
        const requested = String((HOST_GLOBAL.navigator && HOST_GLOBAL.navigator.language) || BUILD.defaultLocale);
        const tag = requested.replace(/-/g, '_');
        const exact = BUILD.locales.find((locale) => locale.toLowerCase() === tag.toLowerCase());
        if (exact) return exact;
        const base = tag.split('_')[0].toLowerCase();
        return BUILD.locales.find((locale) => locale.toLowerCase() === base) || BUILD.defaultLocale;
    }

    const uiLocale = resolveUiLocale();
    let activeMessages = null;
    let fallbackMessages = null;

    function messageTables() {
        if (!fallbackMessages) fallbackMessages = lowerKeyMap(readBundledLocale(BUILD.defaultLocale));
        if (!activeMessages) {
            const flat = uiLocale === BUILD.defaultLocale ? null : readBundledLocale(uiLocale);
            activeMessages = flat ? lowerKeyMap(flat) : fallbackMessages;
        }
        return [activeMessages, fallbackMessages];
    }

    function predefinedMessage(name) {
        const rtl = RTL_LOCALES.has(uiLocale.split('_')[0]);
        switch (name) {
            case '@@extension_id': return RUNTIME_ID;
            case '@@ui_locale': return uiLocale;
            case '@@bidi_dir': return rtl ? 'rtl' : 'ltr';
            case '@@bidi_reversed_dir': return rtl ? 'ltr' : 'rtl';
            case '@@bidi_start_edge': return rtl ? 'right' : 'left';
            case '@@bidi_end_edge': return rtl ? 'left' : 'right';
            default: return null;
        }
    }

    function getMessage(name, substitutions) {
        const key = String(name ?? '');
        const predefined = predefinedMessage(key.toLowerCase());
        if (predefined !== null) return predefined;
        const [active, fallback] = messageTables();
        const lower = key.toLowerCase();
        const template = active.has(lower) ? active.get(lower) : fallback.get(lower);
        if (typeof template !== 'string') return '';
        const values = substitutions === undefined || substitutions === null
            ? []
            : (Array.isArray(substitutions) ? substitutions : [substitutions]).map((value) => String(value));
        return template.replace(/\$(\$|[1-9])/g, (match, token) => (token === '$' ? '$' : (values[Number(token) - 1] ?? '')));
    }

    const i18nApi = {
        getMessage,
        getUILanguage: () => uiLocale.replace(/_/g, '-'),
        getAcceptLanguages: apiMethod(() => Array.from(HOST_GLOBAL.navigator?.languages || [uiLocale.replace(/_/g, '-')])),
        detectLanguage: apiMethod(() => ({ isReliable: false, languages: [] }))
    };

    // ── Packaged resources ───────────────────────────────────────────────────
    // runtime.getURL() hands out data: URLs for the small bundled images and a
    // private .invalid address for everything else. The content fetch below
    // answers those addresses from the bundle (locale files included), so the
    // extension's own `fetch(chrome.runtime.getURL(...))` works unchanged.
    function packagePath(path) {
        return String(path ?? '').replace(/^\/+/, '');
    }

    function getURL(path) {
        const relative = packagePath(path);
        if (Object.hasOwn(BUILD.assets, relative)) return BUILD.assets[relative];
        return PACKAGE_BASE_URL + relative;
    }

    function packagedResponse(relative) {
        const localeMatch = /^_locales\/([A-Za-z_]+)\/messages\.json$/.exec(relative);
        if (localeMatch) {
            const flat = readBundledLocale(localeMatch[1]);
            if (flat) {
                const body = {};
                for (const [key, message] of Object.entries(flat)) body[key] = { message };
                return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
            }
        }
        return new Response('Not found', { status: 404, statusText: 'Not Found' });
    }

    function requestUrlOf(input) {
        if (typeof input === 'string') return input;
        if (input && typeof input.url === 'string') return input.url;
        return String(input);
    }

    function contentFetch(input, init) {
        const url = requestUrlOf(input);
        if (url.startsWith(PACKAGE_BASE_URL)) {
            return Promise.resolve(packagedResponse(url.slice(PACKAGE_BASE_URL.length).split(/[?#]/)[0]));
        }
        if (!nativeFetch) return Promise.reject(new TypeError('fetch is unavailable'));
        return nativeFetch(input, init);
    }

    // ── Background fetch ─────────────────────────────────────────────────────
    // The service worker fetches cross-origin under host permissions. Here the
    // same calls go through GM_xmlhttpRequest (bounded by @connect) and come
    // back as real Response objects, so the worker's streaming size caps,
    // header checks and redirect refusal all run exactly as written.
    const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

    function headersToObject(headers) {
        const out = {};
        if (!headers) return out;
        if (typeof headers.forEach === 'function' && !Array.isArray(headers)) {
            headers.forEach((value, key) => { out[key] = value; });
            return out;
        }
        const entries = Array.isArray(headers) ? headers : Object.entries(headers);
        for (const [key, value] of entries) out[String(key)] = String(value);
        return out;
    }

    function parseResponseHeaders(raw) {
        const headers = new Headers();
        for (const line of String(raw || '').split(/\r?\n/)) {
            const at = line.indexOf(':');
            if (at <= 0) continue;
            try {
                headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
            } catch (_) {
                // reason: a header the Fetch API refuses is dropped, as a browser would
            }
        }
        return headers;
    }

    function abortError(signal) {
        const reason = signal?.reason;
        if (reason instanceof Error) return reason;
        try {
            return new DOMException('The operation was aborted.', 'AbortError');
        } catch (_) {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            return error;
        }
    }

    function sameOriginAsPage(url) {
        try {
            return new URL(url).origin === location.origin;
        } catch (_) {
            return false;
        }
    }

    function normalizedUrl(url) {
        try {
            return new URL(url).href;
        } catch (_) {
            return String(url);
        }
    }

    function backgroundFetch(input, init = {}) {
        const request = typeof Request === 'function' && input instanceof Request ? input : null;
        const url = normalizedUrl(new URL(requestUrlOf(input), location.href).href);
        if (url.startsWith(PACKAGE_BASE_URL)) return contentFetch(url, init);
        // The page's own origin needs no grant and keeps real streaming.
        if (sameOriginAsPage(url) && nativeFetch) return nativeFetch(input, init);
        if (!GM_API.xmlhttpRequest) return Promise.reject(new TypeError('Failed to fetch: GM_xmlhttpRequest is not granted'));

        return new Promise((resolve, reject) => {
            const signal = init.signal || request?.signal || null;
            if (signal?.aborted) {
                reject(abortError(signal));
                return;
            }
            const method = String(init.method || request?.method || 'GET').toUpperCase();
            const headers = headersToObject(init.headers || request?.headers);
            let data = init.body;
            if (typeof URLSearchParams === 'function' && data instanceof URLSearchParams) {
                if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
                    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
                }
                data = data.toString();
            }
            const redirectMode = init.redirect || request?.redirect || 'follow';
            let settled = false;
            let handle = null;
            const finish = (settle, value) => {
                if (settled) return;
                settled = true;
                if (signal) signal.removeEventListener('abort', onAbort);
                settle(value);
            };
            const onAbort = () => {
                try {
                    handle?.abort?.();
                } catch (_) {
                    // reason: the request may already have finished
                }
                finish(reject, abortError(signal));
            };
            if (signal) signal.addEventListener('abort', onAbort, { once: true });

            const details = {
                method,
                url,
                headers,
                responseType: 'arraybuffer',
                anonymous: (init.credentials || request?.credentials) === 'omit',
                onload(result) {
                    const status = Number(result?.status) || 0;
                    if (status < 200 || status > 599) {
                        finish(reject, new TypeError('Failed to fetch'));
                        return;
                    }
                    const finalUrl = result.finalUrl ? normalizedUrl(result.finalUrl) : url;
                    const redirected = finalUrl !== url;
                    if (redirected && redirectMode === 'error') {
                        finish(reject, new TypeError('Failed to fetch: redirect refused'));
                        return;
                    }
                    let response;
                    try {
                        // A redirect under 'manual' is reported as a 3xx for the
                        // requested address: the caller refuses it, fail closed.
                        const reportedStatus = redirected && redirectMode === 'manual' ? 302 : status;
                        const body = NULL_BODY_STATUSES.has(reportedStatus) || method === 'HEAD' || reportedStatus === 302 && redirected
                            ? null
                            : (result.response ?? null);
                        response = new Response(body, {
                            status: reportedStatus,
                            statusText: String(result.statusText || ''),
                            headers: parseResponseHeaders(result.responseHeaders)
                        });
                        Object.defineProperties(response, {
                            url: { value: redirected && redirectMode === 'manual' ? url : finalUrl },
                            redirected: { value: redirected && redirectMode === 'follow' },
                            type: { value: 'basic' }
                        });
                    } catch (error) {
                        finish(reject, error);
                        return;
                    }
                    finish(resolve, response);
                },
                onerror() {
                    finish(reject, new TypeError('Failed to fetch'));
                },
                ontimeout() {
                    finish(reject, new TypeError('Failed to fetch: timed out'));
                },
                onabort() {
                    finish(reject, abortError(signal));
                }
            };
            if (redirectMode === 'manual' || redirectMode === 'error') details.redirect = redirectMode;
            if (data !== undefined && data !== null && method !== 'GET' && method !== 'HEAD') details.data = data;
            try {
                handle = GM_API.xmlhttpRequest(details);
            } catch (error) {
                finish(reject, error);
            }
        });
    }

    // ── runtime messaging ────────────────────────────────────────────────────
    const contentOnMessage = createEvent('content runtime.onMessage');
    const backgroundOnMessage = createEvent('background runtime.onMessage');

    function pageSender() {
        return {
            id: RUNTIME_ID,
            url: location.href,
            origin: location.origin,
            frameId: 0,
            documentLifecycle: 'active',
            tab: currentTab()
        };
    }

    function extensionSender() {
        return { id: RUNTIME_ID, url: PACKAGE_BASE_URL + '_generated_background_page.html', origin: PACKAGE_BASE_URL.slice(0, -1) };
    }

    function currentTab() {
        return {
            id: TAB_ID,
            index: 0,
            windowId: 1,
            active: true,
            highlighted: true,
            incognito: false,
            pinned: false,
            url: location.href,
            title: document.title || ''
        };
    }

    function deliverMessage(event, message, sender) {
        return new Promise((resolve, reject) => {
            let payload;
            try {
                payload = cloneJson(message);
            } catch (error) {
                reject(new Error('Could not serialize message: ' + (error?.message || error)));
                return;
            }
            later(() => {
                const listeners = event.listeners();
                if (!listeners.length) {
                    reject(new Error('Could not establish connection. Receiving end does not exist.'));
                    return;
                }
                let settled = false;
                let keepOpen = false;
                const sendResponse = (value) => {
                    if (settled) return;
                    settled = true;
                    try {
                        resolve(cloneJson(value));
                    } catch (error) {
                        reject(error);
                    }
                };
                for (const listener of listeners) {
                    let result;
                    try {
                        result = listener(payload, sender, sendResponse);
                    } catch (error) {
                        recordError('onMessage listener', error);
                        continue;
                    }
                    if (result === true) {
                        keepOpen = true;
                    } else if (result && typeof result.then === 'function') {
                        keepOpen = true;
                        result.then((value) => sendResponse(value), (error) => {
                            if (settled) return;
                            settled = true;
                            reject(error instanceof Error ? error : new Error(String(error)));
                        });
                    }
                }
                if (!settled && !keepOpen) {
                    settled = true;
                    resolve(undefined);
                }
            });
        });
    }

    function sendMessageArgs(args) {
        // sendMessage(message) or sendMessage(extensionId, message, options)
        if (typeof args[0] === 'string' && args.length >= 2) return args[1];
        return args[0];
    }

    // ── alarms (background) ──────────────────────────────────────────────────
    const onAlarm = createEvent('alarms.onAlarm');
    const alarms = new Map();
    const MAX_TIMER_MS = 2147483000;

    function snapshotAlarm(alarm) {
        const out = { name: alarm.name, scheduledTime: alarm.scheduledTime };
        if (alarm.periodInMinutes) out.periodInMinutes = alarm.periodInMinutes;
        return out;
    }

    function armAlarm(alarm) {
        clearTimeout(alarm.timer);
        const wait = Math.max(0, alarm.scheduledTime - Date.now());
        alarm.timer = setTimeout(() => {
            if (alarms.get(alarm.name) !== alarm) return;
            if (Date.now() + 5 < alarm.scheduledTime) {
                armAlarm(alarm);
                return;
            }
            const fired = snapshotAlarm(alarm);
            if (alarm.periodInMinutes) {
                alarm.scheduledTime = Date.now() + alarm.periodInMinutes * 60000;
                armAlarm(alarm);
            } else {
                alarms.delete(alarm.name);
            }
            onAlarm.dispatch(fired);
        }, Math.min(wait, MAX_TIMER_MS));
    }

    const alarmsApi = {
        onAlarm,
        create: apiMethod((nameOrInfo, maybeInfo) => {
            const name = typeof nameOrInfo === 'string' ? nameOrInfo : '';
            const info = (typeof nameOrInfo === 'string' ? maybeInfo : nameOrInfo) || {};
            const period = Number(info.periodInMinutes) > 0 ? Number(info.periodInMinutes) : 0;
            let when = Number(info.when);
            if (!Number.isFinite(when)) {
                const delay = Number(info.delayInMinutes) > 0 ? Number(info.delayInMinutes) : period;
                when = Date.now() + delay * 60000;
            }
            const existing = alarms.get(name);
            if (existing) clearTimeout(existing.timer);
            const alarm = { name, scheduledTime: when, periodInMinutes: period, timer: null };
            alarms.set(name, alarm);
            armAlarm(alarm);
        }),
        get: apiMethod((name = '') => {
            const alarm = alarms.get(String(name));
            return alarm ? snapshotAlarm(alarm) : undefined;
        }),
        getAll: apiMethod(() => [...alarms.values()].map(snapshotAlarm)),
        clear: apiMethod((name = '') => {
            const alarm = alarms.get(String(name));
            if (!alarm) return false;
            clearTimeout(alarm.timer);
            alarms.delete(String(name));
            return true;
        }),
        clearAll: apiMethod(() => {
            for (const alarm of alarms.values()) clearTimeout(alarm.timer);
            const had = alarms.size > 0;
            alarms.clear();
            return had;
        })
    };

    // ── downloads (background) ───────────────────────────────────────────────
    const downloadsChanged = createEvent('downloads.onChanged');
    const downloadsErased = createEvent('downloads.onErased');
    let nextDownloadId = 1;

    function fileNameFromUrl(url) {
        try {
            const last = new URL(url).pathname.split('/').filter(Boolean).pop();
            return last ? decodeURIComponent(last) : 'download';
        } catch (_) {
            return 'download';
        }
    }

    const downloadsApi = {
        onChanged: downloadsChanged,
        onErased: downloadsErased,
        download: apiMethod((options = {}) => {
            const url = String(options.url || '');
            const id = nextDownloadId++;
            const name = String(options.filename || fileNameFromUrl(url)).split(/[\\/]/).pop();
            if (!GM_API.download) {
                if (!GM_API.openInTab) throw new Error('Downloads are not available in this userscript manager.');
                GM_API.openInTab(url, { active: true });
                return id;
            }
            GM_API.download({
                url,
                name,
                saveAs: options.saveAs === true,
                headers: options.headers ? headersToObject(Object.fromEntries((options.headers || []).map((h) => [h.name, h.value]))) : undefined,
                onload: () => downloadsChanged.dispatch({ id, state: { previous: 'in_progress', current: 'complete' } }),
                onerror: (result) => downloadsChanged.dispatch({
                    id,
                    state: { previous: 'in_progress', current: 'interrupted' },
                    error: { current: String(result?.error || 'FAILED') }
                })
            });
            return id;
        }),
        show: apiMethod(() => true),
        showDefaultFolder: apiMethod(() => undefined),
        search: apiMethod(() => []),
        erase: apiMethod(() => []),
        cancel: apiMethod(() => undefined)
    };

    // ── tabs, permissions, cookies, action (background) ──────────────────────
    let nextOpenedTabId = TAB_ID + 1;
    const tabsApi = {
        query: apiMethod(() => [currentTab()]),
        get: apiMethod((tabId) => {
            if (Number(tabId) !== TAB_ID) throw new Error('No tab with id: ' + tabId + '.');
            return currentTab();
        }),
        sendMessage: apiMethod((tabId, message) => {
            if (Number(tabId) !== TAB_ID) throw new Error('Could not establish connection. Receiving end does not exist.');
            return deliverMessage(contentOnMessage, message, extensionSender());
        }),
        create: apiMethod((properties = {}) => {
            const url = String(properties.url || '');
            if (!GM_API.openInTab) throw new Error('Opening tabs is not available in this userscript manager.');
            GM_API.openInTab(url, { active: properties.active !== false, insert: true, setParent: true });
            return { id: nextOpenedTabId++, index: 1, windowId: 1, active: properties.active !== false, url, pendingUrl: url };
        })
    };

    // Host permissions work as in the browser: the manifest's hosts are always
    // granted, optional ones only after permissions.request(), which the
    // extension only calls from the user's click on a "grant access" control.
    // Grants persist per install. Until one exists the worker refuses the host
    // before any request is made, so @connect * never becomes a silent proxy.
    const GRANTED_ORIGINS_KEY = INTERNAL_PREFIX + 'grantedOrigins';
    const permissionsAdded = createEvent('permissions.onAdded');
    const permissionsRemoved = createEvent('permissions.onRemoved');

    function grantedOrigins() {
        let value = [];
        try {
            value = GM_API.getValue(GRANTED_ORIGINS_KEY, []);
        } catch (_) {
            value = [];
        }
        return Array.isArray(value) ? value.filter((origin) => typeof origin === 'string') : [];
    }

    function parsePattern(pattern) {
        const match = /^(\*|https?|wss?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.exec(String(pattern || ''));
        return match ? { scheme: match[1], host: match[2].toLowerCase(), path: match[3] } : null;
    }

    function patternCovers(grant, wanted) {
        if (grant === '<all_urls>') return true;
        const outer = parsePattern(grant);
        const inner = parsePattern(wanted);
        if (!outer || !inner) return grant === wanted;
        const schemeOk = outer.scheme === inner.scheme
            || (outer.scheme === '*' && inner.scheme !== '*' && /^https?$/.test(inner.scheme));
        if (!schemeOk) return false;
        let hostOk = outer.host === '*' || outer.host === inner.host;
        if (!hostOk && outer.host.startsWith('*.')) {
            const base = outer.host.slice(2);
            const innerHost = inner.host.startsWith('*.') ? inner.host.slice(2) : inner.host;
            hostOk = innerHost === base || innerHost.endsWith('.' + base);
        }
        if (!hostOk) return false;
        const pathRe = new RegExp('^' + outer.path.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        return pathRe.test(inner.path.replace(/\*/g, ''));
    }

    function originGranted(origin) {
        return [...BUILD.hostPermissions, ...grantedOrigins()].some((grant) => patternCovers(grant, origin));
    }

    function isDeclaredOptional(origin) {
        return BUILD.optionalHostPermissions.some((declared) => patternCovers(declared, origin));
    }

    const permissionsApi = {
        onAdded: permissionsAdded,
        onRemoved: permissionsRemoved,
        contains: apiMethod((query = {}) => {
            const permissions = Array.isArray(query.permissions) ? query.permissions : [];
            const origins = Array.isArray(query.origins) ? query.origins : [];
            return permissions.every((permission) => BUILD.permissions.includes(permission))
                && origins.every(originGranted);
        }),
        request: apiMethod((query = {}) => {
            const origins = Array.isArray(query.origins) ? query.origins.map(String) : [];
            const permissions = Array.isArray(query.permissions) ? query.permissions : [];
            if (!permissions.every((permission) => BUILD.permissions.includes(permission))) return false;
            if (!origins.every(isDeclaredOptional)) return false;
            const current = grantedOrigins();
            const added = origins.filter((origin) => !originGranted(origin));
            if (added.length) {
                GM_API.setValue(GRANTED_ORIGINS_KEY, [...current, ...added]);
                permissionsAdded.dispatch({ permissions: [], origins: added });
            }
            return true;
        }),
        remove: apiMethod((query = {}) => {
            const origins = Array.isArray(query.origins) ? query.origins.map(String) : [];
            const current = grantedOrigins();
            const kept = current.filter((grant) => !origins.includes(grant));
            if (kept.length === current.length) return false;
            GM_API.setValue(GRANTED_ORIGINS_KEY, kept);
            permissionsRemoved.dispatch({ permissions: [], origins: current.filter((grant) => origins.includes(grant)) });
            return true;
        }),
        getAll: apiMethod(() => ({ permissions: [...BUILD.permissions], origins: [...BUILD.hostPermissions, ...grantedOrigins()] }))
    };

    const cookiesApi = {
        getAll: apiMethod((details = {}) => new Promise((resolve, reject) => {
            const list = GM_API.cookie?.list;
            if (typeof list !== 'function') {
                reject(new Error('Cookie access is not available in this userscript manager.'));
                return;
            }
            try {
                list.call(GM_API.cookie, details, (cookies, error) => {
                    if (error) reject(new Error(String(error)));
                    else resolve(Array.isArray(cookies) ? cookies : []);
                });
            } catch (error) {
                reject(error);
            }
        }))
    };

    const noop = apiMethod(() => undefined);
    const actionApi = {
        setBadgeText: noop,
        setBadgeBackgroundColor: noop,
        setBadgeTextColor: noop,
        setTitle: noop,
        setIcon: noop,
        getBadgeText: apiMethod(() => ''),
        onClicked: createEvent('action.onClicked')
    };

    // ── runtime ──────────────────────────────────────────────────────────────
    const onInstalled = createEvent('runtime.onInstalled');
    const onSuspend = createEvent('runtime.onSuspend');

    function createRuntime(kind) {
        const isBackground = kind === 'background';
        const runtime = {
            id: RUNTIME_ID,
            getURL,
            getManifest: () => cloneJson(BUILD.manifest),
            getPlatformInfo: apiMethod(() => ({ os: 'unknown', arch: 'unknown', nacl_arch: 'unknown' })),
            onMessage: isBackground ? backgroundOnMessage : contentOnMessage,
            onMessageExternal: createEvent('runtime.onMessageExternal'),
            onConnect: createEvent('runtime.onConnect'),
            onInstalled,
            onStartup: createEvent('runtime.onStartup'),
            onSuspend,
            onUpdateAvailable: createEvent('runtime.onUpdateAvailable'),
            sendMessage: apiMethod((...args) => {
                const message = sendMessageArgs(args);
                if (isBackground || route !== 'main') {
                    // The worker's own runtime.sendMessage targets extension
                    // pages, which a userscript does not have; so does a frame
                    // that runs no background.
                    throw new Error('Could not establish connection. Receiving end does not exist.');
                }
                return deliverMessage(backgroundOnMessage, message, pageSender());
            }),
            openOptionsPage: apiMethod(() => deliverMessage(contentOnMessage, { type: 'YTKIT_OPEN_PANEL' }, extensionSender()).catch(() => undefined)),
            reload: () => location.reload()
        };
        Object.defineProperty(runtime, 'lastError', {
            get: () => activeLastError || undefined,
            enumerable: true
        });
        return runtime;
    }

    function createApi(kind) {
        const api = {
            runtime: createRuntime(kind),
            storage: kind === 'background' ? storageApi : contentStorageApi,
            i18n: i18nApi
        };
        if (kind === 'background') {
            api.alarms = alarmsApi;
            api.downloads = downloadsApi;
            api.tabs = tabsApi;
            api.permissions = permissionsApi;
            api.cookies = cookiesApi;
            api.action = actionApi;
        }
        return api;
    }

    const contentApi = createApi('content');

    // ── Module execution ─────────────────────────────────────────────────────
    // Each registered file is `function (globalThis, self, window, chrome,
    // browser, fetch, importScripts, trustedTypes)`, so the same source runs
    // against whichever scope it needs.
    const contentScope = {
        global: HOST_GLOBAL,
        self: HOST_SELF,
        window: HOST_WINDOW,
        chrome: contentApi,
        browser: contentApi,
        fetch: contentFetch,
        importScripts: undefined,
        trustedTypes: HOST_GLOBAL.trustedTypes
    };

    function runModule(path, scope) {
        const moduleFunction = registry[path];
        if (typeof moduleFunction !== 'function') throw new Error('Module is not bundled: ' + path);
        moduleFunction.call(undefined, scope.global, scope.self, scope.window, scope.chrome, scope.browser,
            scope.fetch, scope.importScripts, scope.trustedTypes);
    }

    // The ISOLATED modules read chrome/browser from globalThis as well as by
    // name. Both point at the adapter, in the sandbox only.
    function exposeContentApi() {
        for (const name of ['chrome', 'browser']) {
            try {
                Object.defineProperty(HOST_GLOBAL, name, { value: contentApi, configurable: true, writable: true, enumerable: false });
            } catch (_) {
                try {
                    HOST_GLOBAL[name] = contentApi;
                } catch (__) {
                    // reason: checked below
                }
            }
        }
        if (HOST_GLOBAL.chrome !== contentApi || HOST_GLOBAL.browser !== contentApi) {
            throw new Error('Could not install the extension API adapter in this userscript sandbox');
        }
    }

    // Tampermonkey on Firefox hands scripts a window with addEventListener but
    // no dispatchEvent. Listeners added through it sit on the real window, so
    // dispatching there reaches them (storage-changed, the player resize nudge,
    // selector misses, runtime-ready).
    function completeEventTarget() {
        const realWindow = typeof document !== 'undefined' ? document.defaultView : null;
        if (!realWindow || typeof realWindow.dispatchEvent !== 'function') return;
        for (const target of new Set([HOST_GLOBAL, HOST_WINDOW])) {
            if (typeof target.dispatchEvent === 'function') continue;
            try {
                Object.defineProperty(target, 'dispatchEvent', {
                    value: (event) => realWindow.dispatchEvent(event),
                    configurable: true,
                    writable: true,
                    enumerable: false
                });
            } catch (error) {
                recordError('event target', error);
            }
        }
    }

    function addStyle(css, label) {
        try {
            if (GM_API.addStyle) {
                const node = GM_API.addStyle(css);
                if (node && typeof node.setAttribute === 'function') node.setAttribute('data-astra-deck-style', label);
                return;
            }
            const style = document.createElement('style');
            style.setAttribute('data-astra-deck-style', label);
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        } catch (error) {
            recordError('style ' + label, error);
        }
    }

    function whenDocumentElement(run) {
        if (document.documentElement) {
            run();
            return;
        }
        const observer = new MutationObserver(() => {
            if (!document.documentElement) return;
            observer.disconnect();
            run();
        });
        observer.observe(document, { childList: true });
    }

    function whenIdle(run) {
        const go = () => setTimeout(run, 0);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', go, { once: true });
        } else {
            go();
        }
    }

    // ── MAIN world ───────────────────────────────────────────────────────────
    // The page-world scripts are one registered function whose SOURCE is
    // injected; it never runs in the sandbox. GM_addElement is the only route
    // that clears YouTube's Trusted Types and script-src policy under every
    // manager; a manager without it gets the ISOLATED runtime alone.
    function injectMainWorld() {
        const mainWorld = registry[BUILD.mainWorldModule];
        if (typeof mainWorld !== 'function') throw new Error('MAIN-world bundle is missing');
        if (!GM_API.addElement) throw new Error('GM_addElement is not granted; page-world features are off');
        const code = '(' + Function.prototype.toString.call(mainWorld) + ')();';
        const node = GM_API.addElement(document.documentElement, 'script', { textContent: code });
        if (node && typeof node.remove === 'function') node.remove();
        document.documentElement.setAttribute('data-astra-deck-userscript', BUILD.version);
    }

    // ── Background ───────────────────────────────────────────────────────────
    // background.js runs in this tab's sandbox with its own global object, so
    // the core modules it loads through importScripts get a namespace of their
    // own, exactly as they would in the service worker.
    let backgroundStarted = false;

    // ── AI provider keys ─────────────────────────────────────────────────────
    // Kept where the old userscript kept them, in the manager's own storage,
    // which youtube.com's scripts can't read. Left alone, the extension's vault
    // falls back to IndexedDB, and in a userscript that is the page's. Keys the
    // old userscript saved sit under the same names, so they carry over.
    const CREDENTIAL_PREFIX = 'ytkit:ai-credential:';
    const CREDENTIAL_PROVIDERS = Object.freeze(['openai', 'anthropic', 'gemini']);
    const credentialStore = Object.freeze({
        get: async (provider) => {
            const value = GM_API.getValue(CREDENTIAL_PREFIX + provider, '');
            return typeof value === 'string' ? value : '';
        },
        set: async (provider, credential) => {
            GM_API.setValue(CREDENTIAL_PREFIX + provider, String(credential));
        },
        delete: async (provider) => {
            GM_API.deleteValue(CREDENTIAL_PREFIX + provider);
        }
    });

    function useManagerCredentialStore(core) {
        const create = core?.createCredentialVault;
        // Without the module, background.js runs with no vault, as it would in
        // the extension, and AI features report the vault unavailable.
        if (typeof create !== 'function') return;
        core.createCredentialVault = (options = {}) => create({ ...options, persistentStore: credentialStore });
    }

    function startBackground() {
        const backgroundApi = createApi('background');
        const backgroundGlobal = {
            chrome: backgroundApi,
            browser: undefined,
            crypto: HOST_GLOBAL.crypto,
            indexedDB: HOST_GLOBAL.indexedDB,
            IDBKeyRange: HOST_GLOBAL.IDBKeyRange,
            navigator: HOST_GLOBAL.navigator,
            location: { href: PACKAGE_BASE_URL + 'background.js', origin: PACKAGE_BASE_URL.slice(0, -1) }
        };
        backgroundGlobal.globalThis = backgroundGlobal;
        backgroundGlobal.self = backgroundGlobal;
        const scope = {
            global: backgroundGlobal,
            self: backgroundGlobal,
            window: undefined,
            chrome: backgroundApi,
            browser: undefined,
            fetch: backgroundFetch,
            importScripts: undefined,
            trustedTypes: undefined
        };
        for (const path of BUILD.modules.backgroundCore) runModule(path, scope);
        useManagerCredentialStore(backgroundGlobal.YTKitCore);
        runModule(BUILD.modules.background, scope);
        backgroundStarted = true;
        HOST_WINDOW.addEventListener('pagehide', () => onSuspend.dispatch(), { once: true });
        later(dispatchInstallEvent);
    }

    function dispatchInstallEvent() {
        let previous = null;
        try {
            previous = GM_API.getValue(INSTALLED_VERSION_KEY, null);
        } catch (_) {
            previous = null;
        }
        if (previous === BUILD.version) return;
        let reason = 'update';
        if (!previous) {
            // A settings object from the old hand-written userscript means this
            // is an upgrade, not a first run: no first-run onboarding.
            let legacy = null;
            try {
                legacy = GM_API.getValue('ytSuiteSettings', null);
            } catch (_) {
                legacy = null;
            }
            reason = legacy ? 'update' : 'install';
        }
        try {
            GM_API.setValue(INSTALLED_VERSION_KEY, BUILD.version);
        } catch (error) {
            recordError('install marker', error);
        }
        onInstalled.dispatch(previous ? { reason, previousVersion: String(previous) } : { reason });
    }

    // ── ISOLATED runtime ─────────────────────────────────────────────────────
    // The same sequence runtime-bootstrap.js runs in the extension, with the
    // same observable state, minus dynamic import().
    function shouldLoadFeature(modulePath, settings) {
        const keys = BUILD.featureSettings[modulePath];
        return !(Array.isArray(keys) && keys.length
            && keys.every((key) => Object.hasOwn(settings, key) && settings[key] === false));
    }

    async function startIsolatedRuntime() {
        const bootstrapState = {
            schemaVersion: 1,
            phase: 'starting',
            active: true,
            duplicateInjections: 0,
            generation: 1,
            startedAt: Date.now(),
            completedAt: null,
            failure: null,
            failedFeatureModules: [],
            host: 'userscript'
        };
        HOST_GLOBAL.__ytkitRuntimeBootstrap = bootstrapState;
        const stageTimings = Object.create(null);
        bootstrapState.stageTimings = stageTimings;
        const timeStage = (name, run) => {
            const startedAt = performance.now();
            try {
                return run();
            } finally {
                stageTimings[name] = Math.round((performance.now() - startedAt) * 100) / 100;
            }
        };

        contentApi.runtime.sendMessage({ type: 'YTKIT_ZERO_AD_STATUS' }).then((status) => {
            const state = status?.ok && status?.enabled ? 'enabled' : 'unavailable';
            document.documentElement?.setAttribute('data-ytkit-zero-ad-ruleset', state);
            bootstrapState.zeroAdRuleset = state;
        }, () => {
            bootstrapState.zeroAdRuleset = 'unavailable';
        });

        const settingsPromise = contentApi.storage.local.get('ytSuiteSettings')
            .then((result) => (result?.ytSuiteSettings && typeof result.ytSuiteSettings === 'object' ? result.ytSuiteSettings : {}))
            .catch(() => ({}));

        timeStage('coreLoaderMs', () => {
            for (const path of BUILD.modules.foundation) runModule(path, contentScope);
        });
        const routeBridgeInstalled = HOST_GLOBAL.YTKitCore?.installLifecycleRouteBridge?.() === true;
        if (!routeBridgeInstalled) {
            console.error('[YTKit] Lifecycle route bridge failed to install; SPA route tokens will not advance');
        }
        bootstrapState.routeBridgeInstalled = routeBridgeInstalled;
        const settingsStartedAt = performance.now();
        const settings = await settingsPromise;
        stageTimings.settingsReadMs = Math.round((performance.now() - settingsStartedAt) * 100) / 100;
        // A module the pinned libraries don't carry yet is a newer feature
        // than this release has; it's listed, not loaded and not an error.
        bootstrapState.unbundledFeatureModules = hostState.missingOptionalModules.slice();
        const featureModules = BUILD.modules.features.filter((path) => shouldLoadFeature(path, settings)
            && typeof registry[path] === 'function');
        stageTimings.featureModuleCount = featureModules.length;
        const failedFeatureModules = [];
        timeStage('featureModulesMs', () => {
            for (const path of featureModules) {
                try {
                    runModule(path, contentScope);
                } catch (error) {
                    failedFeatureModules.push(path);
                    const reason = error?.message || String(error || 'unknown error');
                    console.error('[YTKit] feature module failed to load: ' + path + ' - ' + reason);
                    HOST_GLOBAL.YTKitCore?.DiagnosticLog?.record?.('feature-module-load', 'feature module failed to load: ' + path + ' - ' + reason);
                }
            }
        });
        bootstrapState.failedFeatureModules = failedFeatureModules;
        stageTimings.featureModuleFailureCount = failedFeatureModules.length;
        timeStage('monolithMs', () => runModule(BUILD.modules.app, contentScope));
        HOST_GLOBAL.dispatchEvent?.(new CustomEvent('ytkit-runtime-ready'));
        bootstrapState.phase = 'ready';
        bootstrapState.completedAt = Date.now();
    }

    function startLiveChat() {
        whenIdle(() => {
            try {
                addStyle(BUILD.css.liveChat, 'live-chat');
                for (const path of BUILD.modules.liveChat) runModule(path, contentScope);
                hostState.phase = 'ready';
            } catch (error) {
                hostState.phase = 'failed';
                recordError('live chat runtime', error);
            }
        });
    }

    function hostText(key, fallback) {
        return getMessage(key) || fallback;
    }

    let hostToast = null;
    function notify(message, isError = false) {
        const core = HOST_GLOBAL.YTKitCore;
        if (!hostToast && core?.toastDom?.createToastSystem && core.toast) {
            hostToast = core.toastDom.createToastSystem({
                inferToastTone: core.toast.inferToastTone,
                getToastRgb: core.toast.getToastRgb,
                getToastBadgeLabel: core.toast.getToastBadgeLabel
            });
        }
        if (hostToast) hostToast.showToast(message, isError ? '#ef4444' : '#22c55e');
        else if (isError) recordError('ai credential', new Error(message));
    }

    function currentAiProvider() {
        const settings = GM_API.getValue('ytSuiteSettings', null);
        const provider = settings && typeof settings === 'object' ? settings.aiSummaryProvider : '';
        return CREDENTIAL_PROVIDERS.includes(provider) ? provider : CREDENTIAL_PROVIDERS[0];
    }

    // The manager menu is the userscript's toolbar popup: a sender with no tab,
    // the only kind the background accepts a key from. Prompts are the input a
    // userscript has there. An empty key removes the saved one, and the prompt
    // says so.
    async function manageAiCredential() {
        const title = hostText('aiCredentialTitle', 'AI provider credential');
        const providerLabel = hostText('aiCredentialProviderLabel', 'Provider');
        const choices = CREDENTIAL_PROVIDERS.join(', ');
        const answer = HOST_WINDOW.prompt(`${title}\n${providerLabel}: ${choices}`, currentAiProvider());
        if (answer === null) return;
        const provider = String(answer).trim().toLowerCase();
        if (!CREDENTIAL_PROVIDERS.includes(provider)) {
            notify(`${providerLabel}: ${choices}`, true);
            return;
        }
        const placeholder = hostText('aiCredentialInputPlaceholder', 'Paste your API key');
        const credential = HOST_WINDOW.prompt(`${placeholder} (${provider}). Leave it empty to remove the saved key.`, '');
        if (credential === null) return;
        const remove = !String(credential).trim();
        const message = remove
            ? { type: 'YTKIT_AI_CREDENTIAL_DELETE', provider }
            : { type: 'YTKIT_AI_CREDENTIAL_SET', provider, credential: String(credential), remember: true };
        const response = await deliverMessage(backgroundOnMessage, message, extensionSender());
        if (!response?.ok) {
            const fallback = remove
                ? hostText('aiCredentialDeleteFailed', 'Credential could not be deleted.')
                : hostText('aiCredentialSaveFailed', 'Credential could not be saved.');
            notify(response?.error?.message || fallback, true);
            return;
        }
        notify(remove
            ? hostText('aiCredentialDeleted', 'AI credential deleted.')
            : hostText('aiCredentialSaved', 'AI credential saved without exposing its value.'));
    }

    // A manager menu click gives the page no user activation, so the page
    // clipboard refuses it; GM_setClipboard doesn't need one.
    async function copyDiagnostics() {
        const response = await deliverMessage(contentOnMessage, { type: 'YTKIT_BUILD_BUG_REPORT' }, extensionSender());
        if (!response?.ok || !response.report) throw new Error(response?.error || 'diagnostics unavailable');
        const text = JSON.stringify(response.report, null, 2);
        // Awaited so a manager whose GM_setClipboard returns a promise can
        // report a refusal; the plain sync form only fails by throwing.
        if (GM_API.setClipboard) await GM_API.setClipboard(text);
        else await HOST_WINDOW.navigator.clipboard.writeText(text);
        notify(hostText('statusDiagCopied', 'Diagnostic copied to clipboard.'));
    }

    function registerMenu() {
        if (!GM_API.registerMenuCommand) return;
        try {
            GM_API.registerMenuCommand(BUILD.menuLabel, () => {
                deliverMessage(contentOnMessage, { type: 'YTKIT_OPEN_PANEL' }, extensionSender())
                    .catch((error) => recordError('open settings', error));
            });
            GM_API.registerMenuCommand(BUILD.diagnosticsMenuLabel, () => {
                copyDiagnostics().catch((error) => {
                    recordError('diagnostics', error);
                    notify(hostText(
                        'diagnosticsMenuCopyFailed',
                        "Couldn't copy the diagnostics. Open the settings panel and use the bug button under the sidebar."
                    ), true);
                });
            });
            GM_API.registerMenuCommand(BUILD.credentialMenuLabel, () => {
                manageAiCredential().catch((error) => {
                    recordError('ai credential', error);
                    notify(hostText('aiCredentialSaveFailed', 'Credential could not be saved.'), true);
                });
            });
        } catch (error) {
            recordError('menu command', error);
        }
    }

    // The old hand-written userscript kept Return YouTube Dislike under a key
    // the extension retired, so loading its settings would quietly turn the
    // feature off. Renamed once, on this host's first run over an old install.
    // Extension installs never pass through here, so a years-old retired key
    // there stays retired.
    const LEGACY_USERSCRIPT_RENAMES = Object.freeze({ returnYoutubeDislike: 'returnDislike' });

    function migrateLegacyUserscriptSettings() {
        if (GM_API.getValue(INSTALLED_VERSION_KEY, null)) return;
        const settings = GM_API.getValue('ytSuiteSettings', null);
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
        const next = { ...settings };
        let changed = false;
        for (const [from, to] of Object.entries(LEGACY_USERSCRIPT_RENAMES)) {
            if (!Object.prototype.hasOwnProperty.call(next, from)) continue;
            if (!Object.prototype.hasOwnProperty.call(next, to)) next[to] = next[from];
            delete next[from];
            changed = true;
        }
        if (changed) GM_API.setValue('ytSuiteSettings', next);
    }

    // ── Start ────────────────────────────────────────────────────────────────
    completeEventTarget();
    try {
        exposeContentApi();
    } catch (error) {
        hostState.phase = 'failed';
        recordError('adapter', error);
        return;
    }

    try {
        migrateLegacyUserscriptSettings();
    } catch (error) {
        recordError('settings migration', error);
    }

    if (route === 'live-chat') {
        startLiveChat();
        return;
    }

    try {
        startBackground();
    } catch (error) {
        recordError('background', error);
    }
    hostState.backgroundStarted = backgroundStarted;

    whenDocumentElement(() => {
        try {
            runModule(BUILD.modules.bridgeToken, contentScope);
        } catch (error) {
            recordError('bridge token', error);
        }
        addStyle(BUILD.css.early, 'early');
        document.documentElement.setAttribute(AD_CONTRACT_ATTRIBUTE, AD_CONTRACT);
        try {
            injectMainWorld();
        } catch (error) {
            recordError('page-world scripts', error);
        }
    });

    registerMenu();

    whenIdle(() => {
        HOST_GLOBAL.__ytkitRuntimePromise = startIsolatedRuntime().then(
            () => {
                hostState.phase = 'ready';
            },
            (error) => {
                hostState.phase = 'failed';
                const state = HOST_GLOBAL.__ytkitRuntimeBootstrap;
                if (state) {
                    state.phase = 'failed';
                    state.active = false;
                    state.completedAt = Date.now();
                    state.failure = String(error?.message || error || 'runtime-load-failed').slice(0, 240);
                }
                recordError('runtime', error);
            }
        );
    });
})(ASTRA_DECK_BUILD);
