'use strict';

// Three stragglers in the popup's feedback story. Every other async action in
// the file already carried disable + aria-busy, which is what made these three
// worth finding rather than a general shortcoming:
//
//  (a) "Open Full Settings" and "Open Dashboard" never went busy, and the
//      first waits up to 8s for a panel ack — so the button looked idle and
//      each extra click could fall through to tabs.create and open its own tab.
//  (b) .external-health-empty had a creation site but no CSS rule, so the third
//      dashboard's empty state rendered as a plain default list item.
//  (c) The copy-status aria-live regions never cleared, so a stale "Copied."
//      persisted for the popup's lifetime.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
const popupCss = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.css'), 'utf8');
// The comment above the fix names the class the fix adds, which is enough to
// satisfy a presence assertion on the raw file. Match against declarations.
const popupCssRules = popupCss.replace(/\/\*[\s\S]*?\*\//g, '');

function handlerBody(marker) {
    const at = popupJs.indexOf(marker);
    assert.ok(at > 0, `popup.js must still contain ${marker}`);
    // Anchor on the closing brace of the listener rather than a character
    // count: these bodies grow, and a fixed window silently stops reaching its
    // assertions once they do.
    const end = popupJs.indexOf('\n    });', at);
    const nested = popupJs.indexOf('\n            });', at);
    const stop = end > 0 && (nested < 0 || end < nested) ? end : nested;
    assert.ok(stop > at, `could not bound the handler at ${marker}`);
    return popupJs.slice(at, stop);
}

// ── (a) busy state on both open CTAs ──────────────────────────────────────

test('Open Full Settings goes busy for the panel-ack flight', () => {
    const body = handlerBody("openPanelButton.addEventListener('click'");
    assert.match(body, /if \(openPanelButton\.disabled\) return;/,
        'a re-entrant click must be refused, not queued behind the first');
    assert.match(body, /openPanelButton\.disabled = true;/);
    assert.match(body, /openPanelButton\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(body, /finally \{[\s\S]*openPanelButton\.disabled = false;/,
        'the button must be restored even when the ack path throws');
});

test('Open Dashboard carries the same guard', () => {
    const body = handlerBody("openSidePanelBtn.addEventListener('click'");
    assert.match(body, /if \(openSidePanelBtn\.disabled\) return;/);
    assert.match(body, /openSidePanelBtn\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(body, /finally \{[\s\S]*openSidePanelBtn\.disabled = false;/);
});

test('only one tab can be created per click', () => {
    // The duplicate-tab path: tabs.create is reachable from the same handler
    // the guard now protects.
    const body = handlerBody("openPanelButton.addEventListener('click'");
    assert.equal((body.match(/'create'/g) || []).length, 1,
        'the handler must have exactly one tab-creation path behind the guard');
});

// ── (b) the third dashboard's empty state ─────────────────────────────────

test('all three dashboard empty states share one rule', () => {
    for (const cls of ['selector-health-empty', 'external-health-empty', 'feature-perf-empty']) {
        assert.ok(popupJs.includes(`'${cls}'`), `popup.js must still create .${cls}`);
        assert.match(popupCssRules, new RegExp(`\\.${cls}[,\\s]`),
            `.${cls} must be styled, or its dashboard renders a bare list item`);
    }
    // One rule, not three copies that can drift apart the way this one did.
    const rules = [...popupCssRules.matchAll(/\.(?:selector-health|external-health|feature-perf)-empty[^{]*\{/g)];
    assert.equal(rules.length, 1,
        'the three empty states must share a single declaration');
});

// ── (c) copy-status regions clear themselves ──────────────────────────────

// makeCopyStatusSetter is where the auto-clear lives. Executing it is the only
// way to prove the timer is both set and cancelled: a source pin sees the
// setTimeout, not whether a second message clears the first one's timer.
function loadSetterFactory() {
    const at = popupJs.indexOf('const COPY_STATUS_CLEAR_MS');
    const end = popupJs.indexOf('\nlet _selectorHealthCopyInFlight', at);
    assert.ok(at > 0 && end > at, 'popup.js must define makeCopyStatusSetter');

    const timers = [];
    let now = 0;
    const sandbox = {
        WeakMap,
        setTimeout: (fn, ms) => {
            const handle = { fn, at: now + ms, cancelled: false };
            timers.push(handle);
            return handle;
        },
        clearTimeout: (handle) => { if (handle) handle.cancelled = true; }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${popupJs.slice(at, end)}\nglobalThis.__make = makeCopyStatusSetter;`, sandbox);
    const advance = (ms) => {
        now += ms;
        for (const handle of timers.slice()) {
            if (!handle.cancelled && handle.at <= now) { handle.cancelled = true; handle.fn(); }
        }
    };
    return { make: sandbox.__make, advance, pending: () => timers.filter((h) => !h.cancelled).length };
}

test('a terminal copy status clears itself', () => {
    const { make, advance } = loadSetterFactory();
    const el = { textContent: '' };
    const setStatus = make(el);

    setStatus('Copied.');
    assert.equal(el.textContent, 'Copied.');
    advance(3999);
    assert.equal(el.textContent, 'Copied.', 'it must stay long enough to be read');
    advance(1);
    assert.equal(el.textContent, '', 'a stale Copied. must not outlive its usefulness');
});

test('a pending status is exempt, because the work can outlast the timer', () => {
    const { make, advance } = loadSetterFactory();
    const el = { textContent: '' };
    const setStatus = make(el);

    setStatus('Building report…', { pending: true });
    advance(60000);
    assert.equal(el.textContent, 'Building report…',
        'clearing the pending line would leave a long build looking idle');
});

test('a new message cancels the previous clear timer', () => {
    // Without the cancel, the pending message would be wiped 4s after the
    // terminal message that preceded it.
    const { make, advance, pending } = loadSetterFactory();
    const el = { textContent: '' };
    const setStatus = make(el);

    setStatus('Copied.');
    advance(3000);
    setStatus('Building report…', { pending: true });
    assert.equal(pending(), 0, 'the first message\'s timer must be cancelled');
    advance(2000);
    assert.equal(el.textContent, 'Building report…');
});

test('both copy dashboards go through the shared setter', () => {
    assert.match(popupJs, /const setStatus = makeCopyStatusSetter\(selectorHealthCopyStatus\);/);
    assert.match(popupJs, /const setStatus = makeCopyStatusSetter\(externalHealthCopyStatus\);/);
    // Exactly the two pending lines opt out; every terminal line auto-clears.
    const exempt = [...popupJs.matchAll(/setStatus\([^;]*\{ pending: true \}\)/g)];
    assert.equal(exempt.length, 2, 'only the two "Building report…" lines may be sticky');
    for (const [call] of exempt) assert.match(call, /CopyPending/);
});
