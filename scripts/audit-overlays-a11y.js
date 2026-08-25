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
        liveChat: overrides.liveChat ?? fs.readFileSync(path.join(ROOT, 'extension', 'features', 'live-chat', 'index.js'), 'utf8'),
        videoNotes: overrides.videoNotes ?? fs.readFileSync(path.join(ROOT, 'extension', 'features', 'video-notes', 'index.js'), 'utf8'),
        digitalWellbeing: overrides.digitalWellbeing ?? fs.readFileSync(path.join(ROOT, 'extension', 'features', 'digital-wellbeing', 'index.js'), 'utf8'),
        smoke: overrides.smoke ?? fs.readFileSync(path.join(ROOT, 'docs', 'screen-reader-smoke.md'), 'utf8'),
        // Every feature module, globbed. The named entries above are the ones
        // individual checks reach for by hand; this is the safety net that keeps
        // a peeled or renamed feature from leaving the gate's scope unnoticed.
        allFeatureModules: overrides.allFeatureModules ?? readAllFeatureModules()
    };
}

// A floor on the gate's own scope. Peeling video-notes out of ytkit.js dropped
// its overlay checks off this gate silently until the module was added to the
// list by hand; a shrinking scope must fail instead of quietly passing.
const MIN_FEATURE_MODULES = 20;

function readAllFeatureModules() {
    const featuresDir = path.join(ROOT, 'extension', 'features');
    if (!fs.existsSync(featuresDir)) return {};
    const out = {};
    for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const file = path.join(featuresDir, entry.name, 'index.js');
        if (fs.existsSync(file)) out[entry.name] = fs.readFileSync(file, 'utf8');
    }
    return out;
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

    const { ytkit, toastDom, settingsPanel, subscriptionGroups, downloadUi, liveChat, videoNotes, digitalWellbeing, smoke } = sources;
    const featureModuleCount = Object.keys(sources.allFeatureModules || {}).length;
    add('Overlay audit still covers the feature modules',
        featureModuleCount >= MIN_FEATURE_MODULES,
        `Overlay audit scope collapsed to ${featureModuleCount} feature module(s), below the floor of `
        + `${MIN_FEATURE_MODULES} — a renamed or moved feature would leave this gate silently`);
    for (const check of runKeyboardBehaviorChecks()) add(check.name, check.ok, check.failure);

    // Toast DOM and inline fallback.
    add('Toast DOM role switches error to alert and default to status',
        toastDom.includes("toast.setAttribute('role', options.role || ariaDefaults.role)") &&
        ytkit.includes("toast.setAttribute('role', options.role || ariaDefaults.role)"),
        'Toast role must switch errors to alert and default to status in both DOM builders');
    add('Toast DOM aria-live switches error to assertive and default to polite',
        toastDom.includes("toast.setAttribute('aria-live', options.ariaLive || ariaDefaults.ariaLive)") &&
        ytkit.includes("toast.setAttribute('aria-live', options.ariaLive || ariaDefaults.ariaLive)"),
        'Toast aria-live must switch errors to assertive and default to polite in both DOM builders');
    add('Toast DOM uses aria-atomic',
        toastDom.includes("toast.setAttribute('aria-atomic', 'true')") &&
        ytkit.includes("toast.setAttribute('aria-atomic', 'true')"),
        'Toast containers must set aria-atomic=true');
    add('Toast action buttons are real buttons',
        toastDom.includes("actionBtn.type = 'button'") && ytkit.includes("actionBtn.type = 'button'"),
        'Toast action buttons must be real button elements');
    add('Toast close button has aria-label',
        toastDom.includes("closeBtn.setAttribute('aria-label', t('toastDismissAria', 'Dismiss notification'))") &&
        ytkit.includes("closeBtn.setAttribute('aria-label', t('toastDismissAria', 'Dismiss notification'))"),
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
        downloadUi.includes("prompt.setAttribute('role', 'region')") &&
        downloadUi.includes("prompt.setAttribute('aria-labelledby', 'ytkit-install-prompt-title')") &&
        downloadUi.includes("prompt.setAttribute('aria-describedby', 'ytkit-install-prompt-desc')"),
        'Install prompt must be a labelled/described region');
    add('Install prompt close button has aria-label',
        downloadUi.includes("closeBtn.setAttribute('aria-label', t('dlInstallCloseAria', 'Close local downloader prompt'))"),
        'Install prompt close button must have aria-label Close local downloader prompt');
    add('Install prompt note is a polite status',
        downloadUi.includes("note.setAttribute('role', 'status')") &&
        downloadUi.includes("note.setAttribute('aria-live', 'polite')"),
        'Install prompt note must be role=status aria-live=polite');
    add('Install prompt buttons keep dynamic aria-labels',
        downloadUi.includes("b.setAttribute('aria-label', detail ? `${text}. ${detail}` : text)") &&
        downloadUi.includes("button.setAttribute('aria-label', detail ? `${label}. ${detail}` : label)"),
        'Install prompt buttons must set and update aria-label text');
    add('Install prompt controls have focus-visible and target size',
        ytkit.includes('.ytkit-install-prompt__close:focus-visible') &&
        ytkit.includes('.ytkit-install-prompt__btn:focus-visible') &&
        hasSquareTarget(ytkit, '.ytkit-install-prompt__close') &&
        hasMinTarget(ytkit, '.ytkit-install-prompt__btn'),
        'Install prompt close/buttons must declare focus-visible and at least 24px target size');

    // Download options dialog.
    add('Download options dialog has role, label, and Escape close',
        downloadUi.includes("popup.setAttribute('role', 'dialog')") &&
        downloadUi.includes("popup.setAttribute('aria-label', t('dlPopupAria', 'Download options'))") &&
        downloadUi.includes("if (e.key === 'Escape') _closeDlPopup();"),
        'Download options dialog must be labelled and close on Escape');
    add('Download options close button has aria-label',
        downloadUi.includes("closeBtn.setAttribute('aria-label', t('closeBtnAria', 'Close'))"),
        'Download options close button must have an aria-label');
    add('Download options tabs and chips expose state',
        downloadUi.includes("tabs.setAttribute('role', 'tablist')") &&
        downloadUi.includes("vidTab.setAttribute('role', 'tab')") &&
        downloadUi.includes("audTab.setAttribute('role', 'tab')") &&
        downloadUi.includes("vidTab.setAttribute('aria-selected', String(selectedMode === 'video'))") &&
        downloadUi.includes("chips.setAttribute('role', 'group')") &&
        downloadUi.includes("chip.setAttribute('aria-pressed', String(item.value === selected))"),
        'Download options tabs and chips must expose tab/pressed state');
    add('Download options path and CTA controls have accessible names',
        downloadUi.includes("dirWrap.setAttribute('role', 'group')") &&
        downloadUi.includes("dirToggle.setAttribute('aria-label', t('dlPopupChangeAria', 'Choose a download folder'))") &&
        downloadUi.includes("clipWrap.setAttribute('aria-labelledby', clipLabel.id)") &&
        downloadUi.includes("clipStartInput.setAttribute('aria-label', t('dlPopupClipStartAria', 'Clip start timestamp'))") &&
        downloadUi.includes("clipEndInput.setAttribute('aria-label', t('dlPopupClipEndAria', 'Clip end timestamp'))") &&
        downloadUi.includes("dlBtn.setAttribute("),
        'Download options folder, clip, and CTA controls must have accessible names');
    add('Download options controls have focus-visible styles and target size',
        ['.ytkit-dl-popup__close:focus-visible', '.ytkit-dl-popup__tab:focus-visible',
            '.ytkit-dl-popup__chip:focus-visible', '.ytkit-dl-popup__clip-input:focus-visible',
            '.ytkit-dl-popup__dir-btn:focus-visible',
            '.ytkit-dl-popup__go:focus-visible'].every((selector) => ytkit.includes(selector)) &&
        hasSquareTarget(ytkit, '.ytkit-dl-popup__close') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__tab') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__chip') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__clip-input') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__dir-btn') &&
        hasMinTarget(ytkit, '.ytkit-dl-popup__go'),
        'Download options controls must declare focus-visible and at least 24px target size');
    // The anchor is not always a widget: the context-menu path passes
    // #movie_player when no download button is on the page, purely for
    // positioning. Mirroring the state is required; mirroring it onto a plain
    // container is its own defect, so the guard is part of the contract.
    add('Download options popup mirrors aria-expanded on trigger open and close',
        downloadUi.includes("disclosureAnchor?.setAttribute?.('aria-expanded', 'true')") &&
        downloadUi.includes("disclosureAnchor?.setAttribute?.('aria-expanded', 'false')") &&
        downloadUi.includes('const disclosureAnchor = isDisclosureTrigger(anchorEl)') &&
        !downloadUi.includes("anchorEl?.setAttribute?.('aria-expanded'"),
        'Download options popup must mirror aria-expanded on open and close in the canonical module, and only onto a real disclosure trigger');

    // Transcript viewer and transcript search.
    add('Transcript viewer is a labelled region',
        ytkit.includes("panel.setAttribute('role', 'region')") &&
        ytkit.includes("panel.setAttribute('aria-labelledby', 'ytkit-transcript-title')") &&
        ytkit.includes("title.id = 'ytkit-transcript-title'"),
        'Transcript viewer must be a region labelled by its title');
    add('Transcript viewer status/export/body announce changes',
        ytkit.includes("meta.setAttribute('aria-live', 'polite')") &&
        ytkit.includes("exportBar.setAttribute('aria-label', t('transcriptExportActionsAria', 'Transcript export actions'))") &&
        ytkit.includes("b.setAttribute('aria-label', title)") &&
        ytkit.includes("body.setAttribute('aria-live', 'polite')"),
        'Transcript viewer must expose polite state updates and named export actions');
    // This used to require an aria-label ON the line, which is what broke it:
    // the label won the accessible-name computation over the button's own
    // timestamp and text spans, and a button is a leaf in browse mode, so the
    // transcript read back as a list of "Jump to 0:05" with no words in it.
    // The words are the name now; the jump hint is the title/description.
    add('Transcript lines and toggle are labelled',
        ytkit.includes("closeBtn.setAttribute('aria-label', t('transcriptCollapseAria', 'Collapse transcript'))") &&
        ytkit.includes("line.title = t('transcriptJumpAriaTpl', 'Jump to {time} in the transcript')") &&
        !ytkit.includes("line.setAttribute('aria-label'"),
        'Transcript lines must keep their own words as the accessible name');
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
    add('Transcript Q&A is modal, labelled, and citation-backed',
        ytkit.includes("inner.setAttribute('role', 'dialog')") &&
        ytkit.includes("inner.setAttribute('aria-modal', 'true')") &&
        ytkit.includes("inner.setAttribute('aria-labelledby', 'ytkit-ai-qa-title')") &&
        ytkit.includes("inner.setAttribute('aria-describedby', 'ytkit-ai-qa-description')") &&
        ytkit.includes("history.setAttribute('role', 'log')") &&
        ytkit.includes("link.setAttribute('aria-label', `${t('transcriptQaCitationLabel', 'Transcript citation')} ${cue.timestamp}`)"),
        'Transcript Q&A must be a labelled modal whose history and timestamp citations are exposed to assistive technology');
    add('Transcript Q&A traps focus, closes on Escape, and restores focus',
        ytkit.includes('this._dialogKeydown = (event) =>') &&
        ytkit.includes("if (event.key === 'Escape')") &&
        ytkit.includes("if (event.key !== 'Tab') return") &&
        ytkit.includes('controls[nextIndex].focus()') &&
        ytkit.includes("this._overlay.removeEventListener('keydown', this._dialogKeydown)") &&
        ytkit.includes('returnFocus?.focus?.({ preventScroll: true })'),
        'Transcript Q&A must contain Tab in the modal, close on Escape, remove its handler, and restore the launcher');
    add('Transcript Q&A reports busy and error state',
        ytkit.includes("status.setAttribute('role', 'status')") &&
        ytkit.includes("status.setAttribute('aria-live', 'polite')") &&
        ytkit.includes("this._dialog?.setAttribute('aria-busy', String(this._busy))") &&
        ytkit.includes("this._status.setAttribute('role', tone === 'error' ? 'alert' : 'status')"),
        'Transcript Q&A must expose polite progress, aria-busy, and assertive errors');
    add('Transcript Q&A busy state preserves modal focus containment',
        ytkit.includes('this._askBtn.disabled = false') &&
        ytkit.includes("this._askBtn.setAttribute('aria-disabled', String(this._busy))") &&
        ytkit.includes('this._input.disabled = false') &&
        ytkit.includes('this._input.readOnly = Boolean(this._busy && lockInput)') &&
        ytkit.includes('if (this._busy) return'),
        'Transcript Q&A busy state must preserve modal focus containment while blocking duplicate requests');
    add('Transcript Q&A controls have focus-visible styles and target size',
        ytkit.includes('.ytkit-ai-qa-btn:focus-visible,.ytkit-ai-qa-modal button:focus-visible,.ytkit-ai-qa-modal textarea:focus-visible,.ytkit-ai-qa-citation:focus-visible') &&
        hasMinTarget(ytkit, '.ytkit-ai-qa-btn') &&
        hasSquareTarget(ytkit, '.ytkit-ai-qa-close') &&
        hasMinTarget(ytkit, '.ytkit-ai-qa-input') &&
        hasMinTarget(ytkit, '.ytkit-ai-qa-citation') &&
        hasMinTarget(ytkit, '.ytkit-ai-qa-ask'),
        'Transcript Q&A controls must declare focus-visible and at least 24px target size');

    // Video notes. Peeled out of ytkit.js in v4.72.0; the monolith keeps only
    // a descriptor stub, so these read the feature module.
    add('Video notes panel is labelled and status is live',
        videoNotes.includes("this._container.setAttribute('role', 'region')") &&
        videoNotes.includes("this._container.setAttribute('aria-label', t('videoNotesRegionAria', 'Per-video notes'))") &&
        videoNotes.includes("status.setAttribute('role', 'status')") &&
        videoNotes.includes("status.setAttribute('aria-live', 'polite')"),
        'Video notes must be a labelled region with a polite status');
    add('Video notes controls have names, focus-visible, and target size',
        videoNotes.includes("textarea.setAttribute('aria-label', t('videoNotesInputAria', 'Notes for this video'))") &&
        videoNotes.includes("exportBtn.setAttribute('aria-label', t('videoNotesExportAria', 'Export all video notes'))") &&
        videoNotes.includes("deleteBtn.setAttribute('aria-label', t('videoNotesDeleteAria', 'Delete the note for this video'))") &&
        videoNotes.includes('.ytkit-video-notes-actions button:focus-visible') &&
        videoNotes.includes('.ytkit-video-notes-input:focus,.ytkit-video-notes-input:focus-visible') &&
        hasMinTarget(videoNotes, '.ytkit-video-notes-actions button') &&
        hasMinTarget(videoNotes, '.ytkit-video-notes-input'),
        'Video notes controls must be named, focus-visible, and at least 24px');

    // Download health and history.
    add('Downloader health is a polite named status',
        downloadUi.includes("this._container.setAttribute('role', 'status')") &&
        downloadUi.includes("this._container.setAttribute('aria-live', 'polite')") &&
        downloadUi.includes("this._container.setAttribute('aria-label', t('dlHealthRegionAria', 'Downloader health'))") &&
        downloadUi.includes("pill.setAttribute('aria-label', t('dlHealthPillAriaTpl', '{label} {value}')") &&
        downloadUi.includes(".replace('{label}', label)") &&
        downloadUi.includes(".replace('{value}', value)"),
        'Downloader health pills must expose a polite named status');
    add('Downloader health pills meet target-size floor',
        hasMinTarget(downloadUi, '.ytkit-download-health__pill'),
        'Downloader health pills must declare at least 24px height');
    add('Download history dialog is labelled and controls are named',
        downloadUi.includes("panel.setAttribute('aria-label', t('dlHistoryRegionAria', 'Recent downloads'))") &&
        downloadUi.includes("close.setAttribute('aria-label', t('dlHistoryCloseAria', 'Close recent downloads'))") &&
        downloadUi.includes("this._btn.setAttribute('aria-label', t('dlHistoryButtonTitle', 'View recent downloads'))"),
        'Download history panel and controls must have accessible names');
    add('Download history controls have focus-visible and target size',
        downloadUi.includes('.ytkit-dl-history-btn:focus-visible,.ytkit-dl-history-panel button:focus-visible,.ytkit-dl-history-panel input:focus-visible,.ytkit-dl-history-panel select:focus-visible') &&
        hasMinTarget(downloadUi, '.ytkit-dl-history-btn') &&
        hasMinTarget(downloadUi, '.ytkit-dl-history-panel__close') &&
        hasMinTarget(downloadUi, '.ytkit-dl-history-panel__action') &&
        hasMinTarget(downloadUi, '.ytkit-dl-history-panel input'),
        'Download history controls must declare focus-visible and at least 24px target size');

    // Subscription groups toolbar, digest, and modal.
    add('Subscription toolbar is labelled and uses pressed-state chips',
        subscriptionGroups.includes("bar.setAttribute('role', 'toolbar')") &&
        subscriptionGroups.includes("bar.setAttribute('aria-label', t('subscriptionToolbarAria', 'Subscription group controls'))") &&
        subscriptionGroups.includes("allChip.setAttribute('aria-pressed', String(!this._activeGroupId))") &&
        subscriptionGroups.includes("chip.setAttribute('aria-pressed', String(this._activeGroupId === id))"),
        'Subscription toolbar must be labelled and chips must expose aria-pressed');
    add('Subscription toolbar controls have accessible names',
        ['Create subscription group', 'Create subscription subgroup', 'Sort subscriptions',
            'Open group notifications digest', 'Export subscription groups',
            'Import subscription groups', 'Scan rendered subscriptions for stale channels',
            'Stage rendered stale channels for unsubscribe review'].every((text) => subscriptionGroups.includes(text)),
        'Subscription toolbar buttons/select must have accessible names');
    add('Subscription digest has named actions',
        subscriptionGroups.includes("panel.setAttribute('aria-label', t('subscriptionDigestRegionAria', 'Group notifications digest'))") &&
        subscriptionGroups.includes("close.setAttribute('aria-label', t('subscriptionDigestCloseAria', 'Close group notifications digest'))") &&
        subscriptionGroups.includes("mark.setAttribute('aria-label', t('subscriptionDigestMarkReadAriaTpl', 'Mark {group} digest as read')") &&
        subscriptionGroups.includes("view.setAttribute('aria-label', t('subscriptionDigestViewAriaTpl', 'View {group} subscriptions')"),
        'Subscription digest must expose named close, mark-read, and view actions');
    add('Subscription group modal is modal, labelled, and Escape-closeable',
        subscriptionGroups.includes("overlay.setAttribute('role', 'dialog')") &&
        subscriptionGroups.includes("overlay.setAttribute('aria-modal', 'true')") &&
        subscriptionGroups.includes("t('subscriptionCreateSubgroupDialogAria', 'Create subscription subgroup')") &&
        subscriptionGroups.includes("t('subscriptionCreateGroupDialogAria', 'Create subscription group')") &&
        subscriptionGroups.includes("input.setAttribute('aria-label', t('subscriptionGroupNameAria', 'Group name'))") &&
        subscriptionGroups.includes("if (e.key === 'Escape') { e.preventDefault(); dismiss(); }"),
        'Subscription group modal must be labelled, modal, and close on Escape');
    // The watch-time dashboard shipped with no dialog semantics, an unlabeled
    // close button and no Escape handling — it was simply absent from this
    // list, so nothing caught it.
    add('Watch-time dashboard is modal, labelled, and Escape-closeable',
        ytkit.includes("card.setAttribute('role', 'dialog')") &&
        ytkit.includes("card.setAttribute('aria-modal', 'true')") &&
        ytkit.includes("card.setAttribute('aria-labelledby', title.id)") &&
        ytkit.includes("close.setAttribute('aria-label', t('whaCloseAria', 'Close watch time dashboard'))") &&
        ytkit.includes("if (event.key === 'Escape')"),
        'Watch-time dashboard must be labelled, modal, and close on Escape');

    // The Reaction Sender was the only role="dialog" in the codebase with
    // neither Escape nor a trap — it was simply not in this gate's source list,
    // which is why nothing caught it. It is deliberately NON-modal (chat must
    // stay readable and reachable behind it), so a focus trap would be wrong;
    // Escape and a focus return to the launcher are what it owes the user.
    add('Reaction Sender is a labelled non-modal dialog that closes on Escape',
        liveChat.includes("panel.setAttribute('role', 'dialog')") &&
        liveChat.includes("panel.setAttribute('aria-modal', 'false')") &&
        liveChat.includes("panel.setAttribute('aria-labelledby', 'ytkit-rs-title')") &&
        liveChat.includes("panel.addEventListener('keydown', handlePanelKeydown)") &&
        liveChat.includes("if (event.key !== 'Escape' || event.defaultPrevented) return;") &&
        liveChat.includes('launcher?.focus?.({ preventScroll: true })'),
        'Reaction Sender must be labelled, declare its non-modality, close on Escape, and return focus to its launcher');
    add('Reaction Sender removes its key handler when closed',
        liveChat.includes("panel?.removeEventListener('keydown', handlePanelKeydown)"),
        'Reaction Sender must not leave a keydown listener bound to a removed panel');

    add('Settings panel traps Tab and Shift+Tab in active dialogs',
        settingsPanel.includes("if (e.key === 'Tab' && activeDialog)") &&
        settingsPanel.includes('trapFocusWithin(activeDialog, e, toastPortal ? [toastPortal] : [])') &&
        ytkit.includes('function trapFocusWithin(root, event, additionalRoots = [])') &&
        ytkit.includes('event.shiftKey'),
        'Settings panel must trap Tab and Shift+Tab inside the active settings dialog');
    add('Settings panel focus trap includes actionable toast recovery controls',
        settingsPanel.includes('.ytkit-global-toast[data-ytkit-focus-portal="true"]') &&
        settingsPanel.includes('trapFocusWithin(activeDialog, e, toastPortal ? [toastPortal] : [])') &&
        toastDom.includes("toast.setAttribute('data-ytkit-focus-portal', 'true')") &&
        toastDom.includes("document.body?.classList.contains('ytkit-panel-open')") &&
        ytkit.includes('(activeIndex + direction + focusable.length) % focusable.length') &&
        toastDom.includes('const persistent = options.persistent === true || keepActionReachable'),
        'Settings Undo toasts must join the focus trap and remain until dismissed or activated');
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
        subscriptionGroups.includes('.ytkit-sub-toolbar select:focus-visible,.ytkit-sub-toolbar button:focus-visible') &&
        subscriptionGroups.includes('.ytkit-sub-group-dialog button:focus-visible') &&
        hasMinTarget(subscriptionGroups, '.ytkit-sub-toolbar select,.ytkit-sub-toolbar button') &&
        hasMinTarget(subscriptionGroups, '.ytkit-sub-group-chip') &&
        hasMinTarget(subscriptionGroups, '.ytkit-sub-digest-close,.ytkit-sub-digest-row button') &&
        hasMinTarget(subscriptionGroups, '.ytkit-sub-group-dialog input') &&
        hasMinTarget(subscriptionGroups, '.ytkit-sub-group-dialog button'),
        'Subscription overlay controls must declare focus-visible and at least 24px target size');

    // Manual checklist must document the boundary left after static audit.
    // The break reminder pauses playback and takes focus. Entry focus, the Tab
    // trap and Escape were all present; only the restore was missing, so
    // dismissing it dropped focus to <body> and the reader lost their place on
    // the watch page. This module was outside the gate's named sources.
    add('Digital Wellbeing overlay returns focus to whatever opened it',
        digitalWellbeing.includes('_overlayReturnFocus')
        && digitalWellbeing.includes("this._overlayReturnFocus = typeof previouslyFocused?.focus === 'function' ? previouslyFocused : null;")
        && digitalWellbeing.includes('returnTo.focus({ preventScroll: true })'),
        'The break overlay must restore focus to its trigger when it closes');
    add('Digital Wellbeing overlay keeps its focus entry, trap and Escape',
        digitalWellbeing.includes('button.focus({ preventScroll: true })')
        && digitalWellbeing.includes('trapFocusWithin')
        && digitalWellbeing.includes("'Escape'"),
        'The break overlay must move focus in, trap it, and close on Escape');

    add('Screen-reader smoke checklist references the overlay audit gate',
        smoke.includes('npm run audit:overlays') &&
        smoke.includes('Download options') &&
        smoke.includes('Transcript search') &&
        smoke.includes('Transcript Q&A') &&
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
            target: 'downloadUi',
            expected: 'Install prompt close button must have aria-label Close local downloader prompt',
            mutate: (source) => source.replace("closeBtn.setAttribute('aria-label', t('dlInstallCloseAria', 'Close local downloader prompt'));", '')
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
            mutate: (source) => source.replace('trapFocusWithin(activeDialog, e, toastPortal ? [toastPortal] : []);', '')
        },
        {
            name: 'missing toast focus portal',
            target: 'settingsPanel',
            expected: 'Settings Undo toasts must join the focus trap and remain until dismissed or activated',
            mutate: (source) => source.replace('.ytkit-global-toast[data-ytkit-focus-portal="true"]', '.ytkit-global-toast')
        },
        {
            name: 'missing aria-expanded close',
            target: 'downloadUi',
            expected: 'Download options popup must mirror aria-expanded on open and close in the canonical module, and only onto a real disclosure trigger',
            mutate: (source) => source.replaceAll("disclosureAnchor?.setAttribute?.('aria-expanded', 'false');", '')
        },
        {
            name: 'aria-expanded stamped onto the positioning anchor',
            target: 'downloadUi',
            expected: 'Download options popup must mirror aria-expanded on open and close in the canonical module, and only onto a real disclosure trigger',
            mutate: (source) => source.replaceAll(
                "disclosureAnchor?.setAttribute?.('aria-expanded'",
                "anchorEl?.setAttribute?.('aria-expanded'")
        },
        {
            name: 'missing subscription Enter submit',
            target: 'subscriptionGroups',
            expected: 'Subscription group modal must cover Enter submit and Escape close keyboard paths',
            mutate: (source) => source.replace("if (e.key === 'Enter') { e.preventDefault(); submit(); }", '')
        },
        {
            name: 'missing Transcript Q&A focus restore',
            expected: 'Transcript Q&A must contain Tab in the modal, close on Escape, remove its handler, and restore the launcher',
            mutate: (source) => source.replace('returnFocus?.focus?.({ preventScroll: true });', '')
        },
        {
            name: 'disabled Transcript Q&A busy control',
            expected: 'Transcript Q&A busy state must preserve modal focus containment while blocking duplicate requests',
            mutate: (source) => source.replace(
                'this._askBtn.disabled = false;',
                'this._askBtn.disabled = Boolean(busy);'
            )
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
