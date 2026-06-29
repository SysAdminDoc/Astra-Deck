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
        settingsPanel: overrides.settingsPanel ?? fs.readFileSync(path.join(ROOT, 'extension', 'features', 'settings-panel', 'index.js'), 'utf8'),
        subscriptionGroups: overrides.subscriptionGroups ?? fs.readFileSync(path.join(ROOT, 'extension', 'features', 'subscription-groups', 'index.js'), 'utf8'),
        downloadUi: overrides.downloadUi ?? fs.readFileSync(path.join(ROOT, 'extension', 'features', 'download-ui', 'index.js'), 'utf8'),
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

function createKeyboardEvent(key, options = {}) {
    return {
        key,
        shiftKey: Boolean(options.shiftKey),
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; }
    };
}

function createKeyboardControl(id) {
    return {
        id,
        disabled: false,
        hidden: false,
        activations: 0,
        attributes: Object.create(null),
        focusState: null,
        click() { if (!this.disabled) this.activations++; },
        focus() { if (this.focusState) this.focusState.active = this; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name]; }
    };
}

function trapSyntheticFocus(controls, focusState, event) {
    if (event.key !== 'Tab') return;
    const focusable = controls.filter((control) => !control.disabled && !control.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
        if (focusState.active === first || !focusable.includes(focusState.active)) {
            event.preventDefault();
            last.focus();
        }
    } else if (focusState.active === last || !focusable.includes(focusState.active)) {
        event.preventDefault();
        first.focus();
    }
}

function activateSyntheticButton(control, event) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    control.click();
}

function closeSyntheticDialogOnEscape(dialogState, event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dialogState.open = false;
}

function moveSyntheticTab(tabs, state, event) {
    const deltaByKey = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let nextIndex = state.index;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else if (Object.prototype.hasOwnProperty.call(deltaByKey, event.key)) {
        nextIndex = (state.index + deltaByKey[event.key] + tabs.length) % tabs.length;
    } else {
        return;
    }
    event.preventDefault();
    state.index = nextIndex;
    tabs.forEach((tab, index) => {
        tab.setAttribute('aria-selected', String(index === nextIndex));
        tab.tabIndex = index === nextIndex ? 0 : -1;
    });
    tabs[nextIndex].focus();
}

function applySyntheticTypeahead(selectState, event) {
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const needle = event.key.toLowerCase();
    const matchIndex = selectState.options.findIndex((option) =>
        option.label.toLowerCase().startsWith(needle)
    );
    if (matchIndex < 0) return;
    event.preventDefault();
    selectState.selectedIndex = matchIndex;
    selectState.value = selectState.options[matchIndex].value;
    selectState.changeCount++;
}

function setSyntheticExpanded(control, expanded) {
    control.setAttribute('aria-expanded', String(Boolean(expanded)));
}

function runKeyboardBehaviorChecks() {
    const checks = [];
    const add = (name, ok, failure) => checks.push({ name, ok: Boolean(ok), failure });

    const controls = ['first', 'middle', 'last'].map(createKeyboardControl);
    const focusState = { active: controls[2] };
    controls.forEach((control) => { control.focusState = focusState; });
    const forwardTab = createKeyboardEvent('Tab');
    trapSyntheticFocus(controls, focusState, forwardTab);
    add('Keyboard path: Tab/Shift-Tab focus movement behavior',
        focusState.active === controls[0] && forwardTab.defaultPrevented,
        'Tab from the final overlay control must wrap focus to the first control');
    const backwardTab = createKeyboardEvent('Tab', { shiftKey: true });
    trapSyntheticFocus(controls, focusState, backwardTab);
    add('Keyboard path: reverse Tab focus movement behavior',
        focusState.active === controls[2] && backwardTab.defaultPrevented,
        'Shift+Tab from the first overlay control must wrap focus to the final control');

    const action = createKeyboardControl('primary-action');
    const enter = createKeyboardEvent('Enter');
    const space = createKeyboardEvent(' ');
    activateSyntheticButton(action, enter);
    activateSyntheticButton(action, space);
    add('Keyboard path: Enter/Space activation behavior',
        action.activations === 2 && enter.defaultPrevented && space.defaultPrevented,
        'Button-like overlay controls must activate from both Enter and Space');

    const dialogState = { open: true };
    const escape = createKeyboardEvent('Escape');
    closeSyntheticDialogOnEscape(dialogState, escape);
    add('Keyboard path: Escape close behavior',
        dialogState.open === false && escape.defaultPrevented,
        'Escape must close modal or popover overlays and prevent page-level handling');

    const tabs = ['Video', 'Audio', 'Folder'].map(createKeyboardControl);
    const tabState = { index: 0 };
    tabs.forEach((tab, index) => {
        tab.focusState = tabState;
        tab.setAttribute('aria-selected', String(index === 0));
        tab.tabIndex = index === 0 ? 0 : -1;
    });
    const arrow = createKeyboardEvent('ArrowRight');
    moveSyntheticTab(tabs, tabState, arrow);
    const end = createKeyboardEvent('End');
    moveSyntheticTab(tabs, tabState, end);
    add('Keyboard path: tablist selected-state behavior',
        tabState.index === 2 &&
        tabs[0].getAttribute('aria-selected') === 'false' &&
        tabs[2].getAttribute('aria-selected') === 'true' &&
        tabs[2].tabIndex === 0 &&
        arrow.defaultPrevented &&
        end.defaultPrevented,
        'Overlay tablists must move keyboard focus and keep aria-selected/tabIndex synchronized');

    const selectState = {
        options: [
            { label: 'Video', value: 'video' },
            { label: 'Audio', value: 'audio' },
            { label: 'WebM', value: 'webm' }
        ],
        selectedIndex: 0,
        value: 'video',
        changeCount: 0
    };
    const typeAudio = createKeyboardEvent('a');
    const typeWebm = createKeyboardEvent('w');
    applySyntheticTypeahead(selectState, typeAudio);
    applySyntheticTypeahead(selectState, typeWebm);
    add('Keyboard path: select/typeahead behavior',
        selectState.value === 'webm' && selectState.changeCount === 2 &&
        typeAudio.defaultPrevented && typeWebm.defaultPrevented,
        'Select-like overlay controls must support typeahead selection and emit state changes');

    const disclosure = createKeyboardControl('disclosure');
    setSyntheticExpanded(disclosure, true);
    const opened = disclosure.getAttribute('aria-expanded') === 'true';
    setSyntheticExpanded(disclosure, false);
    add('Keyboard path: aria-expanded state behavior',
        opened && disclosure.getAttribute('aria-expanded') === 'false',
        'Disclosure and popover triggers must mirror expanded/collapsed state for assistive tech');

    return checks;
}

function audit(sources = readSources(), { quiet = false } = {}) {
    const issues = [];
    const checks = [];
    const add = (name, ok, failure) => checks.push({ name, ok: Boolean(ok), failure });

    const { ytkit, toastDom, settingsPanel, subscriptionGroups, downloadUi, smoke } = sources;
    for (const check of runKeyboardBehaviorChecks()) add(check.name, check.ok, check.failure);

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
    add('Download options popup mirrors aria-expanded on trigger open and close',
        downloadUi.includes("anchorEl?.setAttribute?.('aria-expanded', 'true')") &&
        downloadUi.includes("anchorEl?.setAttribute?.('aria-expanded', 'false')") &&
        ytkit.includes("anchorEl?.setAttribute?.('aria-expanded', 'true')") &&
        ytkit.includes("anchorEl?.setAttribute?.('aria-expanded', 'false')"),
        'Download options popup must mirror aria-expanded on open and close in the module and fallback');

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
        ytkit.includes("line.setAttribute('aria-label', `Jump to ${stamp} in the transcript`)"),
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
    add('Settings panel traps Tab and Shift+Tab in active dialogs',
        settingsPanel.includes("if (e.key === 'Tab' && activeDialog)") &&
        settingsPanel.includes('trapFocusWithin(activeDialog, e)') &&
        ytkit.includes('function trapFocusWithin(root, event)') &&
        ytkit.includes('event.shiftKey'),
        'Settings panel must trap Tab and Shift+Tab inside the active settings dialog');
    add('Settings panel tabs expose keyboard navigation and selected state',
        ['ArrowRight', 'ArrowLeft', 'Home', 'End'].every((key) => settingsPanel.includes(`event.key === '${key}'`)) &&
        settingsPanel.includes("button.setAttribute('aria-selected', String(isActive))") &&
        settingsPanel.includes('button.tabIndex = isActive ? 0 : -1'),
        'Settings panel tablists must support arrow/Home/End keyboard paths and selected state');
    add('Settings and subscription selects use native select/typeahead paths',
        settingsPanel.includes("const select = document.createElement('select')") &&
        settingsPanel.includes("select.className = 'ytkit-select'") &&
        settingsPanel.includes("if (e.target.matches('.ytkit-select'))") &&
        subscriptionGroups.includes("const sortSelect = document.createElement('select')") &&
        subscriptionGroups.includes("sortSelect.addEventListener('change'"),
        'Settings and subscription overlays must use native select controls so browser typeahead works');
    add('Subscription group modal covers Enter submit and Escape close',
        subscriptionGroups.includes("if (e.key === 'Enter') { e.preventDefault(); submit(); }") &&
        subscriptionGroups.includes("if (e.key === 'Escape') { e.preventDefault(); dismiss(); }"),
        'Subscription group modal must cover Enter submit and Escape close keyboard paths');
    add('Subscription membership editor restores focus and closes on Escape',
        subscriptionGroups.includes("editBtn.setAttribute('aria-haspopup', 'dialog')") &&
        subscriptionGroups.includes("if (e.key === 'Escape')") &&
        subscriptionGroups.includes('firstFocusable.focus()') &&
        subscriptionGroups.includes("button[data-action=\"edit-channels\"]"),
        'Subscription membership editor must expose dialog semantics, Escape close, first focus, and focus restore');
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

function mutateSource(sources, name, mutate, target = 'ytkit') {
    const next = { ...sources };
    next[target] = mutate(next[target]);
    if (next[target] === sources[target]) {
        throw new Error(`Self-test mutation did not change ${target}: ${name}`);
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
        },
        {
            name: 'missing Tab trap',
            target: 'settingsPanel',
            expected: 'Settings panel must trap Tab and Shift+Tab inside the active settings dialog',
            mutate: (source) => source.replace('trapFocusWithin(activeDialog, e);', '')
        },
        {
            name: 'missing aria-expanded close',
            target: 'downloadUi',
            expected: 'Download options popup must mirror aria-expanded on open and close in the module and fallback',
            mutate: (source) => source.replaceAll("anchorEl?.setAttribute?.('aria-expanded', 'false');", '')
        },
        {
            name: 'missing subscription Enter submit',
            target: 'subscriptionGroups',
            expected: 'Subscription group modal must cover Enter submit and Escape close keyboard paths',
            mutate: (source) => source.replace("if (e.key === 'Enter') { e.preventDefault(); submit(); }", '')
        }
    ];

    let failures = 0;
    for (const entry of cases) {
        const mutated = mutateSource(baseSources, entry.name, entry.mutate, entry.target || 'ytkit');
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
