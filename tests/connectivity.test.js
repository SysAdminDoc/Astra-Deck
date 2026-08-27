'use strict';

// Offline was unimplemented before v4.88.3.
//
// `navigator.onLine` was read in exactly one place — `core/failure-copy.js`,
// to choose a cause sentence after a request had already failed — and no file
// anywhere registered an `online` or `offline` listener. A user whose
// connection dropped got a generic failure with no cause, and reconnecting
// changed nothing until they closed and reopened the surface.
//
// These slice the connectivity block out of each surface and run it against a
// fake document, because loading either whole file needs the entire extension
// API surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const popupSource = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');
const sidepanelSource = fs.readFileSync(path.join(repoRoot, 'extension/sidepanel.js'), 'utf8');

function fakeElement(tag = 'div') {
    const node = {
        tagName: String(tag).toUpperCase(),
        children: [],
        dataset: {},
        attributes: {},
        className: '',
        textContent: '',
        parentNode: null,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        removeAttribute(name) { delete this.attributes[name]; delete this.dataset[name.replace('data-', '')]; },
        insertBefore(child, before) {
            child.parentNode = this;
            const at = before ? this.children.indexOf(before) : -1;
            if (at >= 0) this.children.splice(at, 0, child);
            else this.children.push(child);
            return child;
        },
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        remove() {
            const at = this.parentNode?.children.indexOf(this) ?? -1;
            if (at >= 0) this.parentNode.children.splice(at, 1);
            this.parentNode = null;
        },
        querySelector(selector) {
            const wanted = selector.replace(/^\./, '');
            return this.children.find((child) => child.className === wanted) || null;
        },
        get firstChild() { return this.children[0] || null; }
    };
    return node;
}

// Builds the shared environment both surfaces need, plus the event plumbing.
function makeEnvironment({ online = true } = {}) {
    const listeners = new Map();
    const sections = {
        '#external-health': fakeElement('section'),
        '#feature-health': fakeElement('section'),
        '.sp-main': fakeElement('main'),
        // The banner is the surface a user actually sees. Both health sections
        // ship `hidden` in the real markup, and #external-health is unhidden
        // only after a live content script answers — which a dropped
        // connection is what prevents.
        '#connectivity-banner': fakeElement('aside'),
        '#connectivity-banner-detail': fakeElement('span')
    };
    sections['#external-health'].hidden = true;
    sections['#feature-health'].hidden = true;
    sections['#connectivity-banner'].hidden = true;
    const refreshed = [];
    const dashboards = [];

    const context = {
        console,
        navigator: { onLine: online },
        document: {
            body: sections['.sp-main'],
            createElement: (tag) => fakeElement(tag),
            querySelector: (selector) => sections[selector] || null
        },
        t: (_key, fallback) => fallback,
        $: (selector) => sections[selector] || null,
        addEventListener(type, handler) {
            const list = listeners.get(type) || [];
            list.push(handler);
            listeners.set(type, list);
        },
        removeEventListener(type, handler) {
            const list = (listeners.get(type) || []).filter((entry) => entry !== handler);
            listeners.set(type, list);
        },
        renderExternalApiHealthDashboard: async () => { dashboards.push(Date.now()); },
        refresh: async () => { refreshed.push(Date.now()); },
        globalThis: null
    };
    context.globalThis = context;
    vm.createContext(context);

    return {
        context,
        sections,
        refreshed,
        dashboards,
        fire: (type) => {
            for (const handler of listeners.get(type) || []) handler();
        },
        listenerCount: (type) => (listeners.get(type) || []).length
    };
}

function loadConnectivity(source, env) {
    const start = source.indexOf('function isDeviceOffline() {');
    const end = source.indexOf('\n}', source.indexOf('function installConnectivityWatch()')) + 2;
    assert.ok(start > 0 && end > start, 'the connectivity block must be locatable');
    vm.runInContext(
        `${source.slice(start, end)}\n`
        + 'globalThis.__watch = installConnectivityWatch;\n'
        + 'globalThis.__render = renderConnectivityState;\n'
        + 'globalThis.__offline = isDeviceOffline;',
        env.context,
        { filename: 'connectivity-block' }
    );
    return env.context;
}

for (const [name, source, hostSelector, replayKey] of [
    ['popup', popupSource, '#external-health', 'dashboards'],
    ['side panel', sidepanelSource, '.sp-main', 'refreshed']
]) {
    test(`${name}: going offline names connectivity as the cause`, () => {
        const env = makeEnvironment({ online: false });
        const api = loadConnectivity(source, env);

        assert.equal(api.__offline(), true);
        assert.equal(api.__render(), true, 'the surface must report itself offline');

        const banner = env.sections['#connectivity-banner'];
        const detail = env.sections['#connectivity-banner-detail'];
        assert.equal(banner.hidden, false,
            'the banner must actually be shown — a notice inside a hidden section is not a notice');
        assert.match(detail.textContent, /offline/i, 'the banner must name connectivity');

        const host = env.sections[hostSelector];
        assert.equal(host.dataset.offline, 'true', 'the surface must be styleable as offline');
    });

    test(`${name}: an online device shows no notice`, () => {
        const env = makeEnvironment({ online: true });
        const api = loadConnectivity(source, env);

        assert.equal(api.__render(), false);
        assert.equal(env.sections['#connectivity-banner'].hidden, true,
            'a healthy connection must not show the banner');
        assert.equal(env.sections['#connectivity-banner-detail'].textContent, '');
    });

    test(`${name}: offline then online clears the notice and re-checks`, () => {
        const env = makeEnvironment({ online: true });
        const api = loadConnectivity(source, env);
        const stop = api.__watch();

        assert.equal(env.listenerCount('offline'), 1, 'the surface must listen for offline');
        assert.equal(env.listenerCount('online'), 1, 'and for online');

        env.context.navigator.onLine = false;
        env.fire('offline');
        const host = env.sections[hostSelector];
        const banner = env.sections['#connectivity-banner'];
        assert.equal(banner.hidden, false, 'the drop must surface immediately');
        assert.equal(env[replayKey].length, 0, 'going offline must not fire a doomed request');

        env.context.navigator.onLine = true;
        env.fire('online');
        assert.equal(banner.hidden, true, 'reconnecting must hide the banner');
        assert.equal(host.dataset.offline, undefined, 'and clear the offline marker');
        assert.equal(env[replayKey].length, 1,
            'reconnecting must re-check without the user reloading');

        stop();
        assert.equal(env.listenerCount('offline'), 0, 'the watch must be removable');
        assert.equal(env.listenerCount('online'), 0);
    });

    test(`${name}: repeated offline events do not stack notices`, () => {
        const env = makeEnvironment({ online: false });
        const api = loadConnectivity(source, env);
        api.__watch();
        env.fire('offline');
        env.fire('offline');

        const host = env.sections[hostSelector];
        const notices = host.children.filter((child) => child.className === 'connectivity-notice');
        assert.equal(notices.length, 1, 'the notice must be reused, not appended again');
        assert.equal(env.sections['#connectivity-banner'].hidden, false,
            'and the banner stays shown across repeated events');
    });
}

test('both surfaces install the watch at startup', () => {
    assert.match(popupSource, /installConnectivityWatch\(\);/,
        'the popup must start watching connectivity');
    assert.match(sidepanelSource, /installConnectivityWatch\(\);/,
        'the side panel must start watching connectivity');
});

test('the offline sentence is a translated key, not a new literal', () => {
    // failure-copy.js already owns this copy in all eleven catalogues; adding a
    // second string would have shipped one more untranslated row.
    const messages = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));
    assert.ok(messages.failureCauseOffline?.message, 'the shared key must exist');
    for (const source of [popupSource, sidepanelSource]) {
        assert.match(source, /t\('failureCauseOffline'/, 'both surfaces must reuse the shared key');
    }
    const german = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension/_locales/de/messages.json'), 'utf8'));
    assert.notEqual(german.failureCauseOffline.message, messages.failureCauseOffline.message,
        'the shared key is genuinely translated, which a new literal would not have been');
});
