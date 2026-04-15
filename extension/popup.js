// Astra Deck — Toolbar Popup
// Quick-toggle 15 of the most-used features without opening the full panel.

const QUICK_TOGGLES = [
    { key: 'removeAllShorts',        name: 'Hide Shorts',            desc: 'Remove Shorts from feeds' },
    { key: 'hideRelatedVideos',      name: 'Hide Related',           desc: 'No related panel on watch' },
    { key: 'sponsorBlock',           name: 'SponsorBlock',           desc: 'Skip sponsored segments' },
    { key: 'deArrow',                name: 'DeArrow',                desc: 'Better titles & thumbnails' },
    { key: 'commentSearch',          name: 'Comment Search',         desc: 'Filter comments on watch pages' },
    { key: 'disableAutoplayNext',    name: 'No Autoplay',            desc: 'Stop auto-advance to next' },
    { key: 'disableInfiniteScroll',  name: 'Cap Scroll',             desc: 'Stop infinite scroll' },
    { key: 'persistentSpeed',        name: 'Persistent Speed',       desc: 'Remember playback rate' },
    { key: 'blueLightFilter',        name: 'Blue-Light Filter',      desc: 'Warmer colors' },
    { key: 'cleanShareUrls',         name: 'Clean URLs',             desc: 'Strip tracking params' },
    { key: 'autoTheaterMode',        name: 'Auto Theater',           desc: 'Default to theater view' },
    { key: 'transcriptViewer',       name: 'Transcript Sidebar',     desc: 'Clickable transcript + export' },
    { key: 'miniPlayerBar',          name: 'Mini Player Bar',        desc: 'Floating bar on scroll' },
    { key: 'digitalWellbeing',       name: 'Digital Wellbeing',      desc: 'Break reminders + daily cap' },
    { key: 'debugMode',              name: 'Debug Mode',             desc: 'Verbose console logging' },
];

const SETTINGS_STORAGE_KEY = 'ytSuiteSettings';
const PANEL_OPEN_MESSAGE = 'YTKIT_OPEN_PANEL';
const QUICK_TOGGLE_KEYS = QUICK_TOGGLES.map((toggle) => toggle.key);
const YOUTUBE_TAB_URLS = [
    '*://youtube.com/*',
    '*://*.youtube.com/*',
    '*://youtube-nocookie.com/*',
    '*://*.youtube-nocookie.com/*',
    '*://youtu.be/*'
];
const popupState = {
    settings: {}
};

const $ = (s) => document.querySelector(s);
const list = $('#toggles');
const q = $('#q');

function getVersion() {
    try { return (chrome.runtime.getManifest().version || '—'); } catch { return '—'; }
}
$('#version').textContent = 'v' + getVersion();

function storageGet(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (items) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve(items || {});
        });
    });
}

function storageSet(entries) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(entries, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve();
        });
    });
}

function storageRemove(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve();
        });
    });
}

function normalizeStoredSettings(items) {
    const rawSettings = items?.[SETTINGS_STORAGE_KEY];
    const settings = rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
        ? { ...rawSettings }
        : {};
    const legacyKeys = [];

    for (const key of QUICK_TOGGLE_KEYS) {
        if (typeof items?.[key] !== 'boolean') continue;
        legacyKeys.push(key);
        if (typeof settings[key] === 'undefined') {
            settings[key] = items[key];
        }
    }

    return { settings, legacyKeys };
}

async function loadSettings() {
    const items = await storageGet([SETTINGS_STORAGE_KEY, ...QUICK_TOGGLE_KEYS]);
    const normalized = normalizeStoredSettings(items);

    // Migrate previously broken popup writes from stray top-level keys into the
    // nested settings object the extension actually reads.
    if (normalized.legacyKeys.length > 0) {
        await storageSet({ [SETTINGS_STORAGE_KEY]: normalized.settings });
        await storageRemove(normalized.legacyKeys);
    }

    popupState.settings = normalized.settings;
    return popupState.settings;
}

async function writeSetting(key, value) {
    const items = await storageGet([SETTINGS_STORAGE_KEY, ...QUICK_TOGGLE_KEYS]);
    const normalized = normalizeStoredSettings(items);
    const nextSettings = {
        ...normalized.settings,
        [key]: value
    };

    await storageSet({ [SETTINGS_STORAGE_KEY]: nextSettings });
    if (normalized.legacyKeys.length > 0) {
        await storageRemove(normalized.legacyKeys);
    }

    popupState.settings = nextSettings;
    return nextSettings;
}

function isAnyYouTubeUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        return parsed.hostname === 'youtu.be'
            || parsed.hostname === 'youtube.com'
            || parsed.hostname === 'youtube-nocookie.com'
            || parsed.hostname.endsWith('.youtube.com')
            || parsed.hostname.endsWith('.youtube-nocookie.com');
    } catch {
        return false;
    }
}

function isSupportedInlinePanelUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        const hostname = parsed.hostname;

        if (hostname === 'm.youtube.com' || hostname === 'studio.youtube.com') {
            return false;
        }
        if (parsed.pathname.startsWith('/live_chat')) {
            return false;
        }

        return hostname === 'youtu.be'
            || hostname === 'youtube.com'
            || hostname === 'youtube-nocookie.com'
            || hostname.endsWith('.youtube.com')
            || hostname.endsWith('.youtube-nocookie.com');
    } catch {
        return false;
    }
}

function sendTabMessage(tabId, message) {
    return new Promise((resolve) => {
        if (!tabId) {
            resolve(false);
            return;
        }
        try {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                resolve(!chrome.runtime.lastError && response?.ok !== false);
            });
        } catch (_) {
            resolve(false);
        }
    });
}

async function broadcast(key, value) {
    try {
        const tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS });
        for (const tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_SETTING_CHANGED', key, value }, () => {
                    // Swallow "Receiving end does not exist" — tab may not have loaded ytkit.js yet
                    void chrome.runtime.lastError;
                });
            } catch (_) {}
        }
    } catch (_) {}
}

function render(settings, filter) {
    const term = (filter || '').toLowerCase().trim();
    const items = QUICK_TOGGLES.filter((t) =>
        !term || t.name.toLowerCase().includes(term) || t.desc.toLowerCase().includes(term) || t.key.toLowerCase().includes(term)
    );
    list.innerHTML = '';
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No toggles match.';
        list.appendChild(empty);
        return;
    }
    for (const t of items) {
        const on = Boolean(settings[t.key]);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'toggle' + (on ? ' on' : '');
        row.dataset.key = t.key;
        row.setAttribute('role', 'switch');
        row.setAttribute('aria-checked', String(on));
        row.innerHTML = `
            <div class="label">
                <div class="name"></div>
                <div class="desc"></div>
            </div>
            <div class="switch"></div>`;
        row.querySelector('.name').textContent = t.name;
        row.querySelector('.desc').textContent = t.desc;
        row.addEventListener('click', async () => {
            row.disabled = true;
            try {
                const next = !Boolean(popupState.settings[t.key]);
                await writeSetting(t.key, next);
                render(popupState.settings, q.value);
                void broadcast(t.key, next);
            } catch (error) {
                console.warn('[Astra Deck popup] Failed to toggle setting:', error);
            } finally {
                row.disabled = false;
            }
        });
        list.appendChild(row);
    }
}

(async () => {
    try {
        const settings = await loadSettings();
        render(settings, '');
    } catch (error) {
        console.warn('[Astra Deck popup] Failed to load settings:', error);
        render({}, '');
    }

    q.addEventListener('input', () => {
        render(popupState.settings, q.value);
    });

    if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (!changes[SETTINGS_STORAGE_KEY] && !QUICK_TOGGLE_KEYS.some((key) => changes[key])) return;
            void loadSettings().then((settings) => {
                render(settings, q.value);
            }).catch((error) => {
                console.warn('[Astra Deck popup] Failed to refresh settings:', error);
            });
        });
    }

    $('#openPanel').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id && isSupportedInlinePanelUrl(tab.url || '')) {
            const opened = await sendTabMessage(tab.id, { type: PANEL_OPEN_MESSAGE });
            if (opened) {
                window.close();
                return;
            }
        }

        if (isAnyYouTubeUrl(tab?.url || '')) {
            chrome.runtime.openOptionsPage();
            window.close();
            return;
        }

        await chrome.tabs.create({ url: 'https://www.youtube.com/' });
        window.close();
    });
    $('#openOptions').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });
})();
