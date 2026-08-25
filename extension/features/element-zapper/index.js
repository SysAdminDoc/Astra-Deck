(() => {
    'use strict';

    // extension/features/element-zapper/index.js
    //
    // v4.72.0 — the apply path and picker for the YouTube-semantic zapper.
    //
    // core/element-zapper.js decides what a click means and what a stored rule
    // is allowed to be. This module is everything around that: reading rules,
    // hiding what they match, explaining the hides through the shared
    // attribution marker, and the click-to-pick overlay that creates them.
    //
    // Three things are deliberate here.
    //
    // Hides go through core/hide-attribution.js, not a private CSS class. That
    // is the v4.58.1 lesson: a feature that hides cards without stamping the
    // marker is a feature nobody can debug, and "turn it off and see" is not a
    // diagnostic. Every zapped element carries `data-ytkit-hidden-by` and shows
    // up in the per-navigation counts and the diagnostics bundle for free.
    //
    // The picker refuses on hover, not on click. A picker that lets you frame a
    // selection and only then says "no" has already wasted the interaction; the
    // outline turns red and names the reason while the pointer is still moving.
    //
    // Removing a rule un-hides immediately. `unmarkCardHidden` only clears a
    // marker the caller owns, so a card this feature hid is restored while a
    // card Video Hider hid is left alone.

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    if (ns.createElementZapperFeature) return;

    const FEATURE_ID = 'elementZapper';
    const STORAGE_KEY = 'ytkit-element-zapper-rules';
    const HIDDEN_ATTR = 'data-ytkit-zapped';
    const OVERLAY_CLASS = 'ytkit-zap-overlay';
    const HIGHLIGHT_CLASS = 'ytkit-zap-highlight';
    const HINT_CLASS = 'ytkit-zap-hint';

    const PANEL_STYLE_ID = 'ytkit-element-zapper-style';
    const PANEL_CSS = `
.${OVERLAY_CLASS} {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    cursor: crosshair;
    background: transparent;
}
.${HIGHLIGHT_CLASS} {
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    /* The picker's own blue, not Astra's accent: the highlight border and its
       wash are a matched pair, and the wash is not derived from the accent, so
       following a user-chosen accent would leave a purple border on a blue
       fill. The picker deliberately reads as part of YouTube's chrome — same
       reasoning as --ytkit-surface and --ytkit-text above it in the palette. */
    border: 2px solid var(--ytkit-picker-accent, #3ea6ff);
    background: var(--ytkit-picker-accent-soft, rgba(62, 166, 255, 0.16));
    border-radius: 6px;
    transition: all 60ms linear;
}
.${HIGHLIGHT_CLASS}[data-refused="1"] {
    border-color: #ff5c5c;
    background: rgba(255, 92, 92, 0.16);
}
.${HINT_CLASS} {
    position: fixed;
    z-index: 2147483647;
    left: 50%;
    top: 16px;
    transform: translateX(-50%);
    max-width: min(560px, calc(100vw - 32px));
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--ytkit-surface, #212121);
    color: var(--ytkit-text, #f1f1f1);
    border: 1px solid var(--ytkit-picker-border, rgba(255, 255, 255, 0.16));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 13px;
    line-height: 1.5;
    pointer-events: auto;
    display: flex;
    gap: 12px;
    align-items: center;
}
.${HINT_CLASS} code {
    font-size: 12px;
    opacity: 0.85;
    overflow-wrap: anywhere;
}
.ytkit-zap-rule {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid var(--ytkit-picker-divider, rgba(255, 255, 255, 0.1));
}
.ytkit-zap-rule__body { flex: 1 1 auto; min-width: 0; }
.ytkit-zap-rule__selector {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
}
.ytkit-zap-rule__meta { font-size: 11px; opacity: 0.7; }
`;

    function createElementZapperFeature(deps = {}) {
        const {
            appState,
            addMutationRule,
            removeMutationRule,
            addNavigateRule,
            removeNavigateRule,
            storageReadJSON,
            storageWriteJSON,
            injectStyle,
            showToast,
            DebugManager,
            DiagnosticLog,
            t = (_key, fallback) => fallback,
            documentRef = typeof document !== 'undefined' ? document : null
        } = deps;

        const zapperCore = () => globalThis.YTKitCore || {};

        function readRules() {
            const sanitize = zapperCore().sanitizeZapperRules;
            const raw = typeof storageReadJSON === 'function' ? storageReadJSON(STORAGE_KEY, []) : [];
            return typeof sanitize === 'function' ? sanitize(raw) : [];
        }

        function writeRules(rules) {
            const sanitize = zapperCore().sanitizeZapperRules;
            const clean = typeof sanitize === 'function' ? sanitize(rules) : [];
            if (typeof storageWriteJSON === 'function') storageWriteJSON(STORAGE_KEY, clean);
            return clean;
        }

        const feature = {
            id: FEATURE_ID,
            name: t('feature_elementZapper_name', 'Element Zapper'),
            description: t('feature_elementZapper_desc', 'Click a shelf, panel, or promo to hide it, and keep hiding it.'),
            group: 'Home / Subscriptions',
            _rules: [],
            _picker: null,

            _describeRefusal(reason) {
                const reasons = zapperCore().ELEMENT_ZAPPER_REFUSAL_REASONS || {};
                switch (reason) {
                case reasons.PLAYER:
                    return t('zapRefusePlayer', 'The player is off limits. Hiding part of it breaks playback.');
                case reasons.PLAYLIST:
                    return t('zapRefusePlaylist', 'Playlist items are off limits. Hiding one renumbers the list.');
                case reasons.VIDEO_CARD:
                    return t('zapRefuseVideoCard', 'That is a single video. Use Video Hider to hide videos and channels.');
                case reasons.OWN_UI:
                    return t('zapRefuseOwnUi', 'That is part of Astra Deck.');
                case reasons.TOO_BROAD:
                    return t('zapRefuseTooBroad', 'That is the whole page, not an element on it.');
                default:
                    return t('zapRefuseUnknown', 'Nothing here can be turned into a durable rule.');
                }
            },

            // ── Apply ───────────────────────────────────────────────────────

            _apply() {
                const core = zapperCore();
                if (typeof core.collectZapTargets !== 'function' || !documentRef) return null;
                const { targets, report } = core.collectZapTargets(documentRef, this._rules);
                for (const { node, rule } of targets) {
                    if (node.getAttribute(HIDDEN_ATTR) === '1') continue;
                    node.setAttribute(HIDDEN_ATTR, '1');
                    node.style.setProperty('display', 'none', 'important');
                    core.markCardHidden?.(node, {
                        featureId: FEATURE_ID,
                        featureName: feature.name,
                        rule: rule.label || rule.selector
                    });
                    core.syncHiddenNote?.(node, {
                        enabled: appState?.settings?.hideVideosShowFilterReason === true,
                        text: t('zapHiddenNote', 'Hidden by an element rule you made.')
                    });
                }
                if (report.refusedRules > 0) {
                    DebugManager?.log?.('Zapper', `${report.refusedRules} rule(s) refused this pass: too many matches`);
                    DiagnosticLog?.record?.('element-zapper', {
                        refusedRules: report.refusedRules,
                        refusedNodes: report.refusedNodes,
                        invalidRules: report.invalidRules
                    });
                }
                return report;
            },

            // Restores everything this feature hid, and only what it hid.
            _restoreAll() {
                if (!documentRef) return 0;
                const core = zapperCore();
                const nodes = documentRef.querySelectorAll(`[${HIDDEN_ATTR}="1"]`);
                for (const node of nodes) {
                    node.removeAttribute(HIDDEN_ATTR);
                    node.style.removeProperty('display');
                    core.unmarkCardHidden?.(node, FEATURE_ID);
                }
                return nodes.length;
            },

            // ── Rules ───────────────────────────────────────────────────────

            getRules() {
                return this._rules.map((rule) => ({ ...rule }));
            },

            addRule(rule) {
                const core = zapperCore();
                const clean = core.sanitizeZapperRule?.(rule);
                if (!clean) return null;
                if (this._rules.some((existing) => existing.selector === clean.selector)) return null;
                const max = core.ELEMENT_ZAPPER_MAX_RULES || 200;
                if (this._rules.length >= max) return null;
                this._rules = writeRules([...this._rules, clean]);
                this._apply();
                return clean;
            },

            removeRule(selector) {
                const before = this._rules.length;
                this._rules = writeRules(this._rules.filter((rule) => rule.selector !== selector));
                if (this._rules.length === before) return false;
                // Un-hide first, then re-apply: a node matched by two rules
                // must stay hidden when only one of them is deleted.
                this._restoreAll();
                this._apply();
                return true;
            },

            setRuleEnabled(selector, enabled) {
                let touched = false;
                this._rules = writeRules(this._rules.map((rule) => {
                    if (rule.selector !== selector) return rule;
                    touched = true;
                    return { ...rule, enabled: enabled !== false };
                }));
                if (!touched) return false;
                this._restoreAll();
                this._apply();
                return true;
            },

            // ── Picker ──────────────────────────────────────────────────────

            isPicking() {
                return !!this._picker;
            },

            startPicking() {
                if (!documentRef || this._picker) return false;
                const core = zapperCore();
                if (typeof core.deriveStructuralSelector !== 'function') return false;
                injectStyle?.(PANEL_CSS, PANEL_STYLE_ID);

                const overlay = documentRef.createElement('div');
                overlay.className = OVERLAY_CLASS;
                const highlight = documentRef.createElement('div');
                highlight.className = HIGHLIGHT_CLASS;
                const hint = documentRef.createElement('div');
                hint.className = HINT_CLASS;

                const label = documentRef.createElement('span');
                label.textContent = t('zapPickHint', 'Click a shelf, panel, or promo to hide it. Press Escape to cancel.');
                const cancel = documentRef.createElement('button');
                cancel.type = 'button';
                cancel.className = 'ytkit-zap-cancel';
                cancel.textContent = t('zapPickCancel', 'Cancel');
                hint.append(label, cancel);

                let current = null;

                const describe = (element) => {
                    const derivation = core.deriveStructuralSelector(element);
                    if (derivation.ok !== true) {
                        highlight.setAttribute('data-refused', '1');
                        label.textContent = this._describeRefusal(derivation.reason);
                        return null;
                    }
                    highlight.removeAttribute('data-refused');
                    label.textContent = derivation.selector;
                    return derivation;
                };

                const place = (element) => {
                    const rect = element.getBoundingClientRect?.();
                    if (!rect) return;
                    highlight.style.left = `${rect.left}px`;
                    highlight.style.top = `${rect.top}px`;
                    highlight.style.width = `${rect.width}px`;
                    highlight.style.height = `${rect.height}px`;
                };

                const onMove = (event) => {
                    // The overlay swallows pointer events by design, so the
                    // element under the cursor has to be asked for directly.
                    overlay.style.pointerEvents = 'none';
                    const under = documentRef.elementFromPoint?.(event.clientX, event.clientY);
                    overlay.style.pointerEvents = '';
                    if (!under || under === highlight || under === hint || hint.contains?.(under)) return;
                    const derivation = describe(under);
                    current = derivation;
                    place(derivation?.anchor || under);
                };

                const onClick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!current) {
                        showToast?.(label.textContent, 'error');
                        return;
                    }
                    const created = core.createZapperRule(current, {
                        label: current.anchorTag,
                        surface: current.anchorKind,
                        createdAt: Date.now()
                    });
                    this.stopPicking();
                    if (created && this.addRule(created)) {
                        showToast?.(t('zapRuleAdded', 'Element hidden. The rule is saved.'), 'success');
                    } else {
                        showToast?.(t('zapRuleDuplicate', 'A rule for that element already exists.'), 'info');
                    }
                };

                const onKey = (event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        this.stopPicking();
                    }
                };

                cancel.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.stopPicking();
                });
                overlay.addEventListener('mousemove', onMove, true);
                overlay.addEventListener('click', onClick, true);
                documentRef.addEventListener('keydown', onKey, true);

                documentRef.body?.append(overlay, highlight, hint);
                this._picker = { overlay, highlight, hint, onKey };
                return true;
            },

            stopPicking() {
                const picker = this._picker;
                if (!picker) return false;
                this._picker = null;
                documentRef?.removeEventListener('keydown', picker.onKey, true);
                picker.overlay.remove();
                picker.highlight.remove();
                picker.hint.remove();
                return true;
            },

            // ── Lifecycle ───────────────────────────────────────────────────

            init() {
                this._rules = readRules();
                this._apply();
                addMutationRule?.(this.id, () => this._apply());
                addNavigateRule?.(this.id, () => this._apply());
            },

            destroy() {
                this.stopPicking();
                removeMutationRule?.(this.id);
                removeNavigateRule?.(this.id);
                this._restoreAll();
            }
        };

        // The settings pane. Rendered from the Content category so the rules a
        // click created are listed, countable, and individually removable in
        // the place every other content filter already lives.
        function buildPane() {
            if (!documentRef) return null;
            injectStyle?.(PANEL_CSS, PANEL_STYLE_ID);
            const pane = documentRef.createElement('div');
            pane.className = 'ytkit-settings-section ytkit-zap-pane';

            const heading = documentRef.createElement('h3');
            heading.textContent = t('zapPaneTitle', 'Element Zapper');
            const blurb = documentRef.createElement('p');
            blurb.className = 'ytkit-settings-section__desc';
            blurb.textContent = t(
                'zapPaneDesc',
                'Hide a shelf, panel, or promo by clicking it. Rules are built from YouTube’s own element names, so they keep working after a redesign.'
            );

            const pick = documentRef.createElement('button');
            pick.type = 'button';
            pick.className = 'ytkit-vh-clear-btn';
            pick.textContent = t('zapPickStart', 'Pick an element to hide');

            const list = documentRef.createElement('div');
            list.className = 'ytkit-zap-list';

            const renderList = () => {
                list.textContent = '';
                const rules = feature.getRules();
                if (!rules.length) {
                    const empty = documentRef.createElement('p');
                    empty.className = 'ytkit-zap-rule__meta';
                    empty.textContent = t('zapNoRules', 'No rules yet.');
                    list.appendChild(empty);
                    return;
                }
                for (const rule of rules) {
                    const row = documentRef.createElement('div');
                    row.className = 'ytkit-zap-rule';

                    const toggle = documentRef.createElement('input');
                    toggle.type = 'checkbox';
                    toggle.checked = rule.enabled !== false;
                    // The row is a plain div, so nothing associates this control
                    // with the selector text beside it. Without a name a reader
                    // hears "checkbox, not checked" and has no way to tell which
                    // of their rules it belongs to.
                    toggle.setAttribute('aria-label',
                        t('zapRuleToggleAriaTpl', 'Apply the rule for {selector}')
                            .replace('{selector}', rule.selector));
                    toggle.addEventListener('change', () => {
                        feature.setRuleEnabled(rule.selector, toggle.checked);
                    });

                    const body = documentRef.createElement('div');
                    body.className = 'ytkit-zap-rule__body';
                    const selector = documentRef.createElement('div');
                    selector.className = 'ytkit-zap-rule__selector';
                    selector.textContent = rule.selector;
                    const meta = documentRef.createElement('div');
                    meta.className = 'ytkit-zap-rule__meta';
                    meta.textContent = rule.confidence === 'high'
                        ? t('zapConfidenceHigh', 'Scoped to one page section')
                        : t('zapConfidenceBroad', 'Matches this element anywhere it appears');
                    body.append(selector, meta);

                    const remove = documentRef.createElement('button');
                    remove.type = 'button';
                    remove.className = 'ytkit-vh-clear-btn ytkit-vh-clear-btn--danger';
                    remove.textContent = t('zapRuleRemove', 'Remove');
                    remove.setAttribute('aria-label',
                        t('zapRuleRemoveAriaTpl', 'Remove the rule for {selector}')
                            .replace('{selector}', rule.selector));
                    remove.addEventListener('click', () => {
                        feature.removeRule(rule.selector);
                        renderList();
                    });

                    row.append(toggle, body, remove);
                    list.appendChild(row);
                }
            };

            pick.addEventListener('click', () => {
                feature.startPicking();
            });

            renderList();
            pane.append(heading, blurb, pick, list);
            pane.refreshZapperRules = renderList;
            return pane;
        }

        // Published so the settings panel can reach the live instance without
        // the monolith and the peeled panel having to agree on a config field.
        // Both copies of the panel read the same global.
        const instance = { elementZapperFeature: feature, buildElementZapperPane: buildPane };
        ns.elementZapperInstance = instance;
        return instance;
    }

    ns.createElementZapperFeature = createElementZapperFeature;
    ns.ELEMENT_ZAPPER_STORAGE_KEY = STORAGE_KEY;
    ns.ELEMENT_ZAPPER_HIDDEN_ATTR = HIDDEN_ATTR;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createElementZapperFeature,
            ELEMENT_ZAPPER_STORAGE_KEY: STORAGE_KEY,
            ELEMENT_ZAPPER_HIDDEN_ATTR: HIDDEN_ATTR
        };
    }
})();
