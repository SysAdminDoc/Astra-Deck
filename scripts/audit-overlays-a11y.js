#!/usr/bin/env node
'use strict';

/**
 * In-page overlay a11y audit.
 *
 * This is intentionally static: most Astra overlays are runtime-created from
 * ytkit.js, so the gate pins the source contracts that make those generated
 * controls accessible without depending on a live YouTube page.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIN_TARGET = 24;

function readSources(overrides = {}) {
    return {
        ytkit: overrides.ytkit ?? fs.readFileSync(path.join(ROOT, 'extension', 'ytkit.js'), 'utf8'),
        toastDom: overrides.toastDom ?? fs.readFileSync(path.join(ROOT, 'extension', 'core', 'toast-dom.js'), 'utf8'),
        smoke: overrides.smoke ?? fs.readFileSync(path.join(ROOT, 'docs', 'screen-reader-smoke.md'), 'utf8')
    };
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssBlocks(source, selector) {
    const blocks = [];
    let index = source.indexOf(selector);
    while (index >= 0) {
        const brace = source.indexOf('{', index);
        const nextIndex = source.indexOf(selector, index + selector.length);
        if (brace >= 0 && (nextIndex < 0 || brace < nextIndex)) {
            const end = source.indexOf('}', brace);
            if (end >= 0) blocks.push(source.slice(brace + 1, end));
        }
        index = nextIndex;
    }
    return blocks;
}

function numericCssValue(source, selector, property) {
    for (const block of cssBlocks(source, selector)) {
        const match = block.match(new RegExp(`${escapeRegex(property)}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i'));
        if (match) return Number(match[1]);
    }
    return null;
}

function hasMinTarget(source, selector, min = MIN_TARGET) {
    return ['min-height', 'height'].some((property) => {
        const value = numericCssValue(source, selector, property);
        return value !== null && value >= min;
    });
}

function hasSquareTarget(source, selector, min = MIN_TARGET) {
    const width = ['min-width', 'width'].some((property) => {
        const value = numericCssValue(source, selector, property);
        return value !== null && value >= min;
    });
    const height = ['min-height', 'height'].some((property) => {
        const value = numericCssValue(source, selector, property);
        return value !== null && value >= min;
    });
    return width && height;
}

function includesAny(source, needles) {
    return needles.some((needle) => source.includes(needle));
}

function audit(sources = readSources(), { quiet = false } = {}) {
    const issues = [];
    const checks = [];
    const add = (name, ok, failure) => checks.push({ name, ok: Boolean(ok), failure });

    const { ytkit, toastDom, smoke } = sources;

    // Toast DOM and inline fallback.
    add('Toast DOM role switches error to alert and default to status',
        toastDom.includes("color === '#ef4444' ? 'alert' : 'status'") &&
        ytkit.includes("color === '#ef4444' ? 'alert' : 'status'"),
        'Toast role must switch errors to alert and default to status in both DOM builders');
    add('Toast DOM aria-live switches error to assertive and default to polite',
        toastDom.includes("color === '#ef4444' ? 'assertive' : 'polite'") &&
        ytkit.includes("color === '#ef4444' ? 'assertive' : 'polite'"),
        'Toast aria-live must switch errors to assertive and default to polite in both DOM builders');
    add('Toast DOM uses aria-atomic',
        toastDom.includes("toast.setAttribute('aria-atomic', 'true')") &&
        ytkit.includes("toast.setAttribute('aria-atomic', 'true')"),
        'Toast containers must set aria-atomic=true');
    add('Toast action buttons are real buttons',
        toastDom.includes("actionBtn.type = 'button'") && ytkit.includes("actionBtn.type = 'button'"),
        'Toast action buttons must be real button elements');
    add('Toast close button has aria-label',
        toastDom.includes("closeBtn.setAttribute('aria-label', 'Dismiss notification')") &&
        ytkit.includes("closeBtn.setAttribute('aria-label', 'Dismiss notification')"),
        'Toast close button must have aria-label Dismiss notification');
    add('Toast actions and close controls have focus-visible styles',
        ytkit.includes('.ytkit-toast-action:focus-visible') &&
        ytkit.includes('.ytkit-toast-close:focus-visible'),
        'Toast actions and close controls must have focus-visible CSS');
    add('Toast actions meet WCAG 2.2 target size',
        hasMinTarget(ytkit, '.ytkit-toast-action') && hasSquareTarget(ytkit, '.ytkit-toast-close'),
        'Toast actions and close controls must declare at least 24px target size');

    // Local downloader install prompt.
    add('Install prompt is labelled and described',
        ytkit.includes("prompt.setAttribute('role', 'region')") &&
        ytkit.includes("prompt.setAttribute('aria-labelledby', 'ytkit-install-prompt-title')") &&
        ytkit.includes("prompt.setAttribute('aria-describedby', 'ytkit-install-prompt-desc')"),
        'Install prompt must be a labelled/described region');
    add('Install prompt close button has aria-label',
        ytkit.includes("closeBtn.setAttribute('aria-label', 'Close local downloader prompt')"),
        'Install prompt close button must have aria-label Close local downloader prompt');
    add('Install prompt note is a polite status',
        ytkit.includes("note.setAttribute('role', 'status')") &&
        ytkit.includes("note.setAttribute('aria-live', 'polite')"),
        'Install prompt note must be role=status aria-live=polite');
    add('Install prompt buttons keep dynamic aria-labels',
        ytkit.includes("b.setAttribute('aria-label', detail ? `${text}. ${detail}` : text)") &&
        ytkit.includes("button.setAttribute('aria-label', detail ? `${label}. ${detail}` : label)"),
        'Install prompt buttons must set and update aria-label text');
    add('Install prompt controls have focus-visible and target size',
        ytkit.includes('.ytkit-install-prompt__close:focus-visible') &&
        ytkit.includes('.ytkit-install-prompt__btn:focus-visible') &&
        hasSquareTarget(ytkit, '.ytkit-install-prompt__close') &&
        hasMinTarget(ytkit, '.ytkit-install-prompt__btn'),
        'Install prompt close/buttons must declare focus-visible and at least 24px target size');

    // Download options dialog.
    add('Download options dialog has role, label, and Escape close',
        ytkit.includes("popup.setAttribute('role', 'dialog')") &&
        ytkit.includes("popup.setAttribute('aria-label', t('dlPopupAria', 'Download options'))") &&
        ytkit.includes("if (e.key === 'Escape') _closeDlPopup();"),
        'Download options dialog must be labelled and close on Escape');
    add('Download options close button has aria-label',
        ytkit.includes("closeBtn.setAttribute('aria-label', t('closeBtnAria', 'Close'))"),
        'Download options close button must have an aria-label');
    add('Download options tabs and chips expose state',
        ytkit.includes("tabs.setAttribute('role', 'tablist')") &&
        ytkit.includes("vidTab.setAttribute('role', 'tab')") &&
        ytkit.includes("audTab.setAttribute('role', 'tab')") &&
        ytkit.includes("vidTab.setAttribute('aria-selected', String(selectedMode === 'video'))") &&
        ytkit.includes("chips.setAttribute('role', 'group')") &&
        ytkit.includes("chip.setAttribute('aria-pressed', String(item.value === selected))"),
        'Download options tabs and chips must expose tab/pressed state');
    add('Download options path and CTA controls have accessible names',
        ytkit.includes("dirWrap.setAttribute('role', 'group')") &&
        ytkit.includes("dirToggle.setAttribute('aria-label', t('dlPopupChangeAria', 'Choose a download folder'))") &&
        ytkit.includes("dlBtn.setAttribute("),
        'Download options folder and CTA controls must have accessible names');
    add('Download options controls have focus-visible styles and target size',
        ['.ytkit-dl-popup__close:focus-visible', '.ytkit-dl-popup__tab:focus-visible',
            '.ytkit-dl-popup__chip:focus-visible', '.ytkit-dl-popup__dir-btn:focus-visible',
            '.ytkit-dl-popup__go:focus-visible'].every((selector) => ytkit.includes(selector)) &&
        hasSquareTarget(ytkit, '.ytkit-dl-popup__close') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__tab') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__chip') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__dir-btn') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__go'),
        'Download options controls must declare focus-visible and at least 24px target size');

    // Transcript viewer and transcript search.
    add('Transcript viewer is a labelled region',
        ytkit.includes("panel.setAttribute('role', 'region')") &&
        ytkit.includes("panel.setAttribute('aria-labelledby', 'ytkit-transcript-title')") &&
        ytkit.includes("title.id = 'ytkit-transcript-title'"),
        'Transcript viewer must be a region labelled by its title');
    add('Transcript viewer status/export/body announce changes',
        ytkit.includes("meta.setAttribute('aria-live', 'polite')") &&
        ytkit.includes("exportBar.setAttribute('aria-label', 'Transcript export actions')") &&
        ytkit.includes("b.setAttribute('aria-label', title)") &&
        ytkit.includes("body.setAttribute('aria-live', 'polite')"),
        'Transcript viewer must expose polite state updates and named export actions');
    add('Transcript lines and toggle are labelled',
        ytkit.includes("closeBtn.setAttribute('aria-label', 'Collapse transcript')") &&
        ytkit.includes("line.setAttribute('aria-label', `Jump to ${mins}:${secs.toString().padStart(2, '0')} in the transcript`)"),
        'Transcript toggle and lines must have accessible names');
    add('Transcript viewer controls have focus-visible and target size',
        ytkit.includes('.ytkit-transcript-toggle:focus-visible') &&
        ytkit.includes('.ytkit-transcript-export__btn:focus-visible') &&
        ytkit.includes('.ytkit-transcript-line:focus-visible') &&
        hasMinTarget(ytkit, '.ytkit-transcript-toggle') &&
        hasMinTarget(ytkit, '.ytkit-transcript-export__btn') &&
        hasMinTarget(ytkit, '.ytkit-transcript-line'),
        'Transcript controls must declare focus-visible and at least 24px target size');
    add('Transcript search dialog is labelled and closes on Escape',
        ytkit.includes("panel.setAttribute('aria-label', 'Search local transcript index')") &&
        ytkit.includes("input.setAttribute('aria-label', 'Search transcript index')") &&
        ytkit.includes("if (event.key === 'Escape')") &&
        ytkit.includes("closeBtn.setAttribute('aria-label', 'Close transcript search')"),
        'Transcript search dialog must be labelled and close on Escape');
    add('Transcript search actions have focus-visible and target size',
        ytkit.includes('.ytkit-transcript-search-btn:focus-visible') &&
        ytkit.includes('.ytkit-transcript-search-panel input:focus-visible') &&
        ytkit.includes('.ytkit-transcript-search-panel__footer button:focus-visible') &&
        hasMinTarget(ytkit, '.ytkit-transcript-search-btn') &&
        hasMinTarget(ytkit, '.ytkit-transcript-search-panel input') &&
        hasMinTarget(ytkit, '.ytkit-transcript-search-panel__footer button'),
        'Transcript search controls must declare focus-visible and at least 24px target size');

    // Video notes.
    add('Video notes panel is labelled and status is live',
        ytkit.includes("this._container.setAttribute('role', 'region')") &&
        ytkit.includes("this._container.setAttribute('aria-label', 'Per-video notes')") &&
        ytkit.includes("status.setAttribute('role', 'status')") &&
        ytkit.includes("status.setAttribute('aria-live', 'polite')"),
        'Video notes must be a labelled region with a polite status');
    add('Video notes controls have names, focus-visible, and target size',
        ytkit.includes("textarea.setAttribute('aria-label', 'Notes for this video')") &&
        ytkit.includes("exportBtn.setAttribute('aria-label', 'Export all video notes')") &&
        ytkit.includes("deleteBtn.setAttribute('aria-label', 'Delete the note for this video')") &&
        ytkit.includes('.ytkit-video-notes-actions button:focus-visible') &&
        ytkit.includes('.ytkit-video-notes-input:focus,.ytkit-video-notes-input:focus-visible') &&
        hasMinTarget(ytkit, '.ytkit-video-notes-actions button') &&
        hasMinTarget(ytkit, '.ytkit-video-notes-input'),
        'Video notes controls must be named, focus-visible, and at least 24px');

    // Download health and history.
    add('Downloader health is a polite named status',
        ytkit.includes("this._container.setAttribute('role', 'status')") &&
        ytkit.includes("this._container.setAttribute('aria-live', 'polite')") &&
        ytkit.includes("this._container.setAttribute('aria-label', 'Downloader health')") &&
        ytkit.includes("pill.setAttribute('aria-label', `${label} ${value}`)"),
        'Downloader health pills must expose a polite named status');
    add('Downloader health pills meet target-size floor',
        hasMinTarget(ytkit, '.ytkit-download-health__pill'),
        'Downloader health pills must declare at least 24px height');
    add('Download history dialog is labelled and controls are named',
        ytkit.includes("panel.setAttribute('aria-label', 'Recent downloads')") &&
        ytkit.includes("close.setAttribute('aria-label', 'Close recent downloads')") &&
        ytkit.includes("this._btn.setAttribute('aria-label', 'View recent downloads')"),
        'Download history panel and controls must have accessible names');
    add('Download history controls have focus-visible and target size',
        ytkit.includes('.ytkit-dl-history-btn:focus-visible,.ytkit-dl-history-panel__close:focus-visible') &&
        hasMinTarget(ytkit, '.ytkit-dl-history-btn') &&
        hasMinTarget(ytkit, '.ytkit-dl-history-panel__close'),
        'Download history controls must declare focus-visible and at least 24px target size');

    // Subscription groups toolbar, digest, and modal.
    add('Subscription toolbar is labelled and uses pressed-state chips',
        ytkit.includes("bar.setAttribute('role', 'toolbar')") &&
        ytkit.includes("bar.setAttribute('aria-label', 'Subscription group controls')") &&
        ytkit.includes("allChip.setAttribute('aria-pressed', String(!this._activeGroupId))") &&
        ytkit.includes("chip.setAttribute('aria-pressed', String(this._activeGroupId === id))"),
        'Subscription toolbar must be labelled and chips must expose aria-pressed');
    add('Subscription toolbar controls have accessible names',
        ['Create subscription group', 'Create subscription subgroup', 'Sort subscriptions',
            'Open group notifications digest', 'Export subscription groups',
            'Import subscription groups', 'Scan rendered subscriptions for stale channels',
            'Stage rendered stale channels for unsubscribe review'].every((text) => ytkit.includes(text)),
        'Subscription toolbar buttons/select must have accessible names');
    add('Subscription digest has named actions',
        ytkit.includes("panel.setAttribute('aria-label', 'Group notifications digest')") &&
        ytkit.includes("close.setAttribute('aria-label', 'Close group notifications digest')") &&
        ytkit.includes("mark.setAttribute('aria-label', `Mark ${entry.name} digest as read`)") &&
        ytkit.includes("view.setAttribute('aria-label', `View ${entry.name} subscriptions`)"),
        'Subscription digest must expose named close, mark-read, and view actions');
    add('Subscription group modal is modal, labelled, and Escape-closeable',
        ytkit.includes("overlay.setAttribute('role', 'dialog')") &&
        ytkit.includes("overlay.setAttribute('aria-modal', 'true')") &&
        ytkit.includes("overlay.setAttribute('aria-label', safeParentId ? 'Create subscription subgroup' : 'Create subscription group')") &&
        ytkit.includes("input.setAttribute('aria-label', 'Group name')") &&
        ytkit.includes("if (e.key === 'Escape') { e.preventDefault(); dismiss(); }"),
        'Subscription group modal must be labelled, modal, and close on Escape');
    add('Subscription controls have focus-visible and target size',
        ytkit.includes('.ytkit-sub-toolbar select:focus-visible,.ytkit-sub-toolbar button:focus-visible') &&
        ytkit.includes('.ytkit-sub-group-dialog button:focus-visible') &&
        hasMinTarget(ytkit, '.ytkit-sub-toolbar select,.ytkit-sub-toolbar button') &&
        hasMinTarget(ytkit, '.ytkit-sub-group-chip') &&
        hasMinTarget(ytkit, '.ytkit-sub-digest-close,.ytkit-sub-digest-row button') &&
        hasMinTarget(ytkit, '.ytkit-sub-group-dialog input') &&
        hasMinTarget(ytkit, '.ytkit-sub-group-dialog button'),
        'Subscription overlay controls must declare focus-visible and at least 24px target size');

    // Manual checklist must document the boundary left after static audit.
    add('Screen-reader smoke checklist references the overlay audit gate',
        smoke.includes('npm run audit:overlays') &&
        smoke.includes('Download options') &&
        smoke.includes('Transcript search') &&
        smoke.includes('Subscription group digest'),
        'docs/screen-reader-smoke.md must document audit:overlays coverage and manual boundaries');

    for (const check of checks) {
        if (!quiet) console.log(`${check.ok ? '[ok]' : '[fail]'} ${check.name}`);
        if (!check.ok) issues.push(check.failure);
    }
    return issues;
}

function mutateSource(sources, name, mutate) {
    const next = { ...sources };
    next.ytkit = mutate(next.ytkit);
    if (next.ytkit === sources.ytkit) {
        throw new Error(`Self-test mutation did not change ytkit.js: ${name}`);
    }
    return next;
}

function runSelfTest(baseSources) {
    const baseIssues = audit(baseSources, { quiet: true });
    if (baseIssues.length) {
        console.error('Base audit must pass before running mutation canaries.');
        baseIssues.forEach((issue) => console.error(`- ${issue}`));
        return 1;
    }

    const cases = [
        {
            name: 'unlabeled close button',
            expected: 'Install prompt close button must have aria-label Close local downloader prompt',
            mutate: (source) => source.replace("closeBtn.setAttribute('aria-label', 'Close local downloader prompt');", '')
        },
        {
            name: 'missing focus-visible',
            expected: 'Toast actions and close controls must have focus-visible CSS',
            mutate: (source) => source.replace('.ytkit-toast-action:focus-visible', '.ytkit-toast-action:focus-within')
        },
        {
            name: 'sub-24px target',
            expected: 'Toast actions and close controls must declare at least 24px target size',
            mutate: (source) => source.replace('min-height: 32px;', 'min-height: 20px;')
        }
    ];

    let failures = 0;
    for (const entry of cases) {
        const mutated = mutateSource(baseSources, entry.name, entry.mutate);
        const issues = audit(mutated, { quiet: true });
        const caught = issues.includes(entry.expected);
        console.log(`${caught ? '[ok]' : '[fail]'} mutation canary: ${entry.name}`);
        if (!caught) {
            failures++;
            console.error(`Expected issue: ${entry.expected}`);
            console.error(`Observed issues: ${issues.join('; ') || '(none)'}`);
        }
    }
    return failures ? 1 : 0;
}

const sources = readSources();
const issues = audit(sources);

if (issues.length) {
    console.error(`\n${issues.length} overlay a11y issue(s):`);
    issues.forEach((issue) => console.error(`- ${issue}`));
    process.exit(1);
}

if (process.argv.includes('--self-test')) {
    process.exit(runSelfTest(sources));
}

console.log('\nNo overlay a11y issues found.');
