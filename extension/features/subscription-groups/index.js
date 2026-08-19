(() => {
    'use strict';

    // extension/features/subscription-groups/index.js
    //
    // Monolith peel for Subscription Groups. The module owns the primary
    // subscriptionGroups runtime/state object; ytkit.js keeps the inline
    // object as a compatibility fallback and injects monolith-scoped helpers
    // through createSubscriptionGroupsFeature(deps).

    function createSubscriptionGroupsFeature(deps = {}) {
        const {
            PageTypes = { SUBSCRIPTIONS: 'subscriptions' },
            appState = { settings: {} },
            injectStyle = () => ({ remove() {} }),
            settingsManager = { save() {} },
            DebugManager = { log() {} },
            showToast = () => {},
            getVideoId = () => '',
            getUrlParam = () => '',
            storageReadJSON = (_key, fallbackValue) => fallbackValue,
            storageWriteJSON = () => {},
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            addMutationRule = () => {},
            removeMutationRule = () => {},
            addScopedMutationRule = () => {},
            removeScopedMutationRule = () => {},
            runBudgetedElementBatch = (items, callback) => {
                const list = Array.from(items || []);
                list.forEach(callback);
                return {
                    cancel() {},
                    promise: Promise.resolve({
                        label: t('subscriptionBatchFallbackLabel', 'subscription-groups:fallback'),
                        total: list.length,
                        processed: list.length,
                        chunks: 1,
                        durationMs: 0,
                        cancelled: false
                    })
                };
            },
            handleFileExport = () => {},
            isSafeObjectKey = (key) => /^[A-Za-z0-9_-]{1,128}$/.test(String(key || '')),
            MediaDLManager = null,
            extensionFetchJson = null,
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'subscriptionGroups',
            name: t('feature_subscriptionGroups_name', 'Subscription Groups'),
            description: t(
                'feature_subscriptionGroups_desc',
                'PocketTube-grade local groups for your subscriptions feed. Create named groups, add channels via the Edit Channels panel, sort by date/duration/unwatched/new-since-last-visit, and back up or migrate groups with JSON, CSV, or OPML.'
            ),
            group: 'Subscriptions',
            icon: 'folder-tree',
            pages: [PageTypes.SUBSCRIPTIONS],
            _styleElement: null,
            _toolbar: null,
            _digestPanel: null,
            _healthPanel: null,
            _membersPanel: null,
            _activeGroupId: '',     // '' = all subscriptions
            _observer: null,
            _navRule: null,
            _GROUPS_KEY: 'subscriptionGroupData',
            _LAST_VISIT_KEY: 'subscriptionLastVisitData',
            _UNSUB_STAGE_KEY: 'subscriptionUnsubscribeStagingData',
            _UNSUB_STAGE_TTL_MS: 30 * 24 * 60 * 60 * 1000,
            // Import already enforced this ceiling; membership edits
            // sliced past it instead, which is how adding channel 1001
            // reported success and changed nothing.
            _MAX_GROUP_CHANNELS: 1000,
            _UNSUBSCRIBE_BATCH_CAP: 25,
            _UNSUBSCRIBE_PACE_MS: 400,
            _UNSUBSCRIBE_LOG_KEY: 'ytkit-subscription-unsubscribe-sessions',
            _UNSUBSCRIBE_LOG_MAX: 20,
            _STALE_CHANNEL_MIN_AGE_DAYS: 365,
            _SORT_MODES: Object.freeze([
                'default',
                ...(globalThis.YTKitFeatures?.subscriptionView?.extractLoadedAgeMs ? ['newest-loaded'] : []),
                'date-desc',
                'duration-asc',
                'unwatched',
                'new-since-last-visit',
                'popular'
            ]),
            _budgetHandles: null,
            _lastScanDiagnostics: null,
            _unsubscribeRunning: false,
            _unsubscribeSessionToken: null,
            _lifecycleToken: 0,

            _ensureBudgetHandles() {
                if (!this._budgetHandles) this._budgetHandles = new Map();
                return this._budgetHandles;
            },

            _cancelBudgetedScan(label) {
                const handles = this._budgetHandles;
                const handle = handles?.get(label);
                handle?.cancel?.();
                handles?.delete(label);
            },

            _cancelAllBudgetedScans() {
                if (!this._budgetHandles) return;
                for (const handle of this._budgetHandles.values()) handle?.cancel?.();
                this._budgetHandles.clear();
            },

            _recordScanDiagnostics(result) {
                if (!result) return;
                this._lastScanDiagnostics = {
                    label: result.label || 'subscription-groups',
                    total: result.total || 0,
                    processed: result.processed || 0,
                    chunks: result.chunks || 0,
                    durationMs: Math.round((result.durationMs || 0) * 10) / 10,
                    cancelled: !!result.cancelled
                };
                if ((result.chunks || 0) > 1 || (result.durationMs || 0) > 16) {
                    DebugManager.log('SubGroups', `Budgeted scan ${this._lastScanDiagnostics.label}: ${this._lastScanDiagnostics.processed}/${this._lastScanDiagnostics.total} cards in ${this._lastScanDiagnostics.chunks} chunks (${this._lastScanDiagnostics.durationMs}ms)`);
                }
            },

            _runCardBatch(label, cards, callback, onComplete = null) {
                const list = Array.from(cards || []);
                const safeLabel = String(label || 'cards').slice(0, 64);
                this._cancelBudgetedScan(safeLabel);
                const handle = runBudgetedElementBatch(list, callback, {
                    // i18n-static: internal scan label, not rendered copy.
                    label: `subscription-groups:${safeLabel}`,
                    chunkSize: 80,
                    budgetMs: 8,
                    warnAfterMs: 16
                });
                const handles = this._ensureBudgetHandles();
                handles.set(safeLabel, handle);
                Promise.resolve(handle.promise).then((result) => {
                    if (handles.get(safeLabel) !== handle) return;
                    handles.delete(safeLabel);
                    this._recordScanDiagnostics(result);
                    if (!result?.cancelled && typeof onComplete === 'function') onComplete(result);
                });
                return handle;
            },

            _ensureStyles() {
                if (this._styleElement) return;
                this._styleElement = injectStyle(`
                    .ytkit-sub-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);}
                    .ytkit-sub-toolbar__label{font:600 11px/1 Roboto,Arial,sans-serif;color:rgba(255,255,255,0.55);letter-spacing:.04em;text-transform:uppercase;}
                    .ytkit-sub-toolbar select,.ytkit-sub-toolbar button{min-height:30px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#e5e7eb;font:600 12px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-sub-toolbar button:hover{background:rgba(255,255,255,0.1);}
                    .ytkit-sub-toolbar select:focus-visible,.ytkit-sub-toolbar button:focus-visible,.ytkit-sub-group-chip:focus-visible,.ytkit-sub-digest-close:focus-visible,.ytkit-sub-digest-row button:focus-visible,.ytkit-sub-group-dialog button:focus-visible,.ytkit-sub-group-dialog input:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(124,58,237,0.32);outline:none;}
                    .ytkit-sub-toolbar button[data-action="export"]{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.32);}
                    .ytkit-sub-toolbar button[data-action="scan-stale"]{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.32);color:#bfdbfe;}
                    .ytkit-sub-toolbar button[data-action="digest"]{background:rgba(14,165,233,0.12);border-color:rgba(14,165,233,0.32);color:#bae6fd;}
                    .ytkit-sub-toolbar button[data-action="health"]{background:rgba(124,58,237,0.14);border-color:rgba(124,58,237,0.36);color:#ddd6fe;}
                    .ytkit-sub-toolbar button[data-action="stage-unsubscribe"]{background:rgba(245,158,11,0.13);border-color:rgba(245,158,11,0.34);color:#fde68a;}
                    .ytkit-sub-toolbar button[data-action="undo-staged-unsubscribe"]{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.32);color:#bbf7d0;}
                    .ytkit-sub-toolbar button[data-action="unsubscribe-staged"]{background:rgba(239,68,68,0.14);border-color:rgba(239,68,68,0.36);color:#fecaca;}
                    .ytkit-sub-toolbar button[data-action="export-unsubscribe-log"]{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.32);color:#bbf7d0;}
                    .ytkit-sub-toolbar button[disabled]{opacity:.45;cursor:not-allowed;}
                    .ytkit-sub-group-chip{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:4px 10px;border-radius:6px;background:rgba(124,58,237,0.16);border:1px solid rgba(124,58,237,0.32);color:#e9d5ff;font:600 11px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-sub-group-chip[data-active="1"]{background:#7c3aed;color:#fff;}
                    .ytkit-sub-group-chip[data-depth="1"]{margin-inline-start:10px;background:rgba(59,130,246,0.13);border-color:rgba(59,130,246,0.28);color:#bfdbfe;}
                    .ytkit-sub-new-badge{display:inline-block;margin-inline-start:6px;padding:1px 6px;border-radius:4px;background:#22c55e;color:#022c14;font:700 10px/1.4 Roboto,Arial,sans-serif;letter-spacing:.04em;}
                    .ytkit-sub-digest-panel{margin:-6px 0 14px;padding:12px;border-radius:8px;background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#e5e7eb;font:12px/1.45 Roboto,Arial,sans-serif;box-shadow:0 14px 28px rgba(0,0,0,0.24);}
                    .ytkit-sub-digest-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}
                    .ytkit-sub-digest-title{margin:0;color:#f8fafc;font:700 13px/1.2 Roboto,Arial,sans-serif;}
                    .ytkit-sub-digest-meta{color:rgba(226,232,240,0.62);font:11px/1.3 Roboto,Arial,sans-serif;}
                    .ytkit-sub-digest-close,.ytkit-sub-digest-row button{min-height:28px;padding:5px 8px;border-radius:6px;border:1px solid rgba(148,163,184,0.22);background:rgba(255,255,255,0.04);color:#e5e7eb;font:700 11px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-sub-digest-close:hover,.ytkit-sub-digest-row button:hover{background:rgba(255,255,255,0.08);}
                    .ytkit-sub-group-dialog input{min-height:34px;outline:none;}
                    .ytkit-sub-group-dialog button{min-height:30px;outline:none;touch-action:manipulation;}
                    .ytkit-sub-digest-list{display:flex;flex-direction:column;gap:6px;}
                    .ytkit-sub-digest-row{display:grid;grid-template-columns:minmax(160px,1fr) auto auto auto;align-items:center;gap:8px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.055);}
                    .ytkit-sub-digest-row[data-depth="1"]{margin-inline-start:16px;}
                    .ytkit-sub-digest-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f8fafc;font-weight:700;}
                    .ytkit-sub-digest-count{font-variant-numeric:tabular-nums;color:#bae6fd;font-weight:700;}
                    .ytkit-sub-digest-muted{color:rgba(226,232,240,0.58);font-variant-numeric:tabular-nums;}
                    .ytkit-sub-digest-empty{padding:10px;border-radius:6px;background:rgba(255,255,255,0.035);color:rgba(226,232,240,0.62);}
                    .ytkit-sub-health-stats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
                    .ytkit-sub-health-stat{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.07);color:rgba(226,232,240,0.78);font:600 11px/1.4 Roboto,Arial,sans-serif;}
                    .ytkit-sub-health-stat b{color:#f8fafc;font-variant-numeric:tabular-nums;}
                    .ytkit-sub-health-stat[data-tone="warn"] b{color:#fde68a;}
                    .ytkit-sub-health-stat[data-tone="staged"] b{color:#bbf7d0;}
                    .ytkit-sub-health-section{margin:12px 0 6px;color:rgba(226,232,240,0.66);font:700 11px/1.3 Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;}
                    .ytkit-sub-health-row{display:grid;grid-template-columns:minmax(160px,1fr) auto auto;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.055);}
                    .ytkit-sub-health-row button{min-height:26px;padding:4px 8px;border-radius:6px;border:1px solid rgba(148,163,184,0.22);background:rgba(255,255,255,0.04);color:#e5e7eb;font:700 11px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;}
                    .ytkit-sub-health-row button:hover{background:rgba(255,255,255,0.08);}
                    .ytkit-sub-health-row button:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(124,58,237,0.32);}
                    .ytkit-sub-health-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
                    .ytkit-sub-health-actions button{min-height:28px;padding:5px 10px;border-radius:6px;border:1px solid rgba(148,163,184,0.22);background:rgba(255,255,255,0.04);color:#e5e7eb;font:700 11px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;}
                    .ytkit-sub-health-actions button:hover{background:rgba(255,255,255,0.08);}
                    .ytkit-sub-health-actions button:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(124,58,237,0.32);}
                    .ytkit-sub-health-error{padding:10px;border-radius:6px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#fecaca;}
                    .ytkit-sub-dead-card{outline:1px solid rgba(245,158,11,0.34);outline-offset:-1px;}
                    .ytkit-sub-staged-card{outline:1px solid rgba(34,197,94,0.42);outline-offset:-1px;}
                    .ytkit-sub-dead-badge,.ytkit-sub-staged-badge{display:inline-block;margin-inline-start:6px;padding:1px 6px;border-radius:4px;font:700 10px/1.4 Roboto,Arial,sans-serif;letter-spacing:.04em;}
                    .ytkit-sub-dead-badge{background:#f59e0b;color:#1f1300;}
                    .ytkit-sub-staged-badge{background:#22c55e;color:#022c14;}
                    .ytkit-sub-hidden-by-group,.ytkit-sub-hidden-by-type{display:none !important;}
                    .ytkit-sub-group-empty{margin:-6px 0 14px;padding:12px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.28);color:#fde68a;font:12px/1.45 Roboto,Arial,sans-serif;}
                    .ytkit-sub-members-panel{margin:-6px 0 14px;padding:12px;border-radius:8px;background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#e5e7eb;font:12px/1.45 Roboto,Arial,sans-serif;box-shadow:0 14px 28px rgba(0,0,0,0.24);}
                    .ytkit-sub-members-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}.ytkit-sub-members-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}.ytkit-sub-members-action{min-height:30px;padding:6px 10px;border-radius:6px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.14));background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.06));color:var(--yt-spec-text-primary,#f8fafc);font:700 12px/1 Roboto,Arial,sans-serif;cursor:pointer;}.ytkit-sub-members-action:hover{background:var(--yt-spec-10-percent-layer,rgba(255,255,255,0.12));}.ytkit-sub-members-action--danger{color:#fecaca;border-color:rgba(239,68,68,0.4);}html:not([dark]) .ytkit-sub-members-action{background:rgba(0,0,0,0.05);color:var(--yt-spec-text-primary,#0f0f0f);border-color:rgba(0,0,0,0.18);}html:not([dark]) .ytkit-sub-members-action--danger{color:#991b1b;border-color:rgba(153,27,27,0.35);}
                    .ytkit-sub-members-title{margin:0;color:#f8fafc;font:700 13px/1.2 Roboto,Arial,sans-serif;}
                    .ytkit-sub-members-meta{color:rgba(226,232,240,0.62);font:11px/1.3 Roboto,Arial,sans-serif;}
                    .ytkit-sub-members-close{min-height:28px;padding:5px 8px;border-radius:6px;border:1px solid rgba(148,163,184,0.22);background:rgba(255,255,255,0.04);color:#e5e7eb;font:700 11px/1 Roboto,Arial,sans-serif;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-sub-members-close:hover{background:rgba(255,255,255,0.08);}
                    .ytkit-sub-members-close:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(124,58,237,0.32);}
                    .ytkit-sub-members-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px;max-height:280px;overflow:auto;}
                    .ytkit-sub-members-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.055);cursor:pointer;}
                    .ytkit-sub-members-row:hover{background:rgba(255,255,255,0.07);}
                    .ytkit-sub-members-row input{accent-color:#7c3aed;cursor:pointer;}
                    .ytkit-sub-members-row input:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(124,58,237,0.32);outline:none;}
                    .ytkit-sub-members-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f8fafc;font-weight:600;}
                    .ytkit-sub-members-empty{padding:10px;border-radius:6px;background:rgba(255,255,255,0.035);color:rgba(226,232,240,0.62);}
                    .ytkit-sub-group-dialog{position:fixed;inset:0;z-index:9300;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.55);font-family:Roboto,Arial,sans-serif;}
                    .ytkit-sub-group-dialog__card{width:min(420px,100%);min-width:min(320px,100%);box-sizing:border-box;padding:18px;border-radius:12px;background:var(--yt-spec-menu-background,#0f0f10);color:var(--yt-spec-text-primary,#e5e7eb);border:1px solid var(--yt-spec-10-percent-layer,#3f3f46);font:13px/1.5 Roboto,Arial,sans-serif;box-shadow:0 22px 48px rgba(0,0,0,.6);}
                    .ytkit-sub-group-dialog__title{font:600 14px/1.3 Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#fafafa);margin-bottom:10px;}
                    .ytkit-sub-group-dialog__input{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.14));background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.04));color:var(--yt-spec-text-primary,#fff);font:13px Roboto,Arial,sans-serif;box-sizing:border-box;}
                    .ytkit-sub-group-dialog__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
                    .ytkit-sub-group-dialog__button{padding:6px 12px;border-radius:6px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,0.14));background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.04));color:var(--yt-spec-text-primary,#e5e7eb);cursor:pointer;font:600 12px/1 Roboto,Arial,sans-serif;}
                    .ytkit-sub-group-dialog__button--primary{border-color:rgba(var(--ytkit-accent-rgb,124,58,237),0.5);background:var(--ytkit-accent,#7c3aed);color:var(--ytkit-accent-contrast,#fff);}
                    /* YouTube light theme: cards and dialog must not inherit dark-only text. */
                    html:not([dark]) .ytkit-sub-toolbar{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,0.04));border-color:rgba(0,0,0,0.1);}
                    html:not([dark]) .ytkit-sub-toolbar__label{color:var(--yt-spec-text-secondary,#606060);}
                    html:not([dark]) .ytkit-sub-toolbar select,html:not([dark]) .ytkit-sub-toolbar button{background:rgba(0,0,0,0.05);border-color:rgba(0,0,0,0.12);color:var(--yt-spec-text-primary,#0f0f0f);}
                    html:not([dark]) .ytkit-sub-toolbar button:hover{background:rgba(0,0,0,0.1);}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="scan-stale"]{color:#1d4ed8;}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="digest"]{color:#075985;}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="health"]{color:#5b21b6;}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="stage-unsubscribe"]{color:#92400e;}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="undo-staged-unsubscribe"]{color:#166534;}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="unsubscribe-staged"]{color:#b91c1c;}
                    html:not([dark]) .ytkit-sub-toolbar button[data-action="export-unsubscribe-log"]{color:#166534;}
                    html:not([dark]) .ytkit-sub-group-chip{background:rgba(124,58,237,0.1);border-color:rgba(124,58,237,0.38);color:#5b21b6;}
                    html:not([dark]) .ytkit-sub-group-chip[data-active="1"]{background:#7c3aed;color:#fff;}
                    html:not([dark]) .ytkit-sub-group-chip[data-depth="1"]{background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.34);color:#1d4ed8;}
                    html:not([dark]) .ytkit-sub-group-empty{background:rgba(245,158,11,0.1);border-color:rgba(180,83,9,0.4);color:#92400e;}
                    html:not([dark]) .ytkit-sub-digest-panel,html:not([dark]) .ytkit-sub-members-panel,html:not([dark]) .ytkit-sub-group-dialog__card{background:var(--yt-spec-raised-background,#fff);border-color:rgba(15,23,42,0.16);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 14px 32px rgba(15,23,42,0.18);}
                    html:not([dark]) .ytkit-sub-digest-title,html:not([dark]) .ytkit-sub-members-title{color:var(--yt-spec-text-primary,#0f0f0f);}
                    html:not([dark]) .ytkit-sub-digest-meta,html:not([dark]) .ytkit-sub-members-meta,html:not([dark]) .ytkit-sub-digest-muted{color:var(--yt-spec-text-secondary,#606060);}
                    html:not([dark]) .ytkit-sub-digest-close,html:not([dark]) .ytkit-sub-digest-row button,html:not([dark]) .ytkit-sub-health-row button,html:not([dark]) .ytkit-sub-health-actions button,html:not([dark]) .ytkit-sub-members-close,html:not([dark]) .ytkit-sub-group-dialog__button{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,0.04));border-color:rgba(15,23,42,0.16);color:var(--yt-spec-text-primary,#0f0f0f);}
                    html:not([dark]) .ytkit-sub-digest-close:hover,html:not([dark]) .ytkit-sub-digest-row button:hover,html:not([dark]) .ytkit-sub-health-row button:hover,html:not([dark]) .ytkit-sub-health-actions button:hover,html:not([dark]) .ytkit-sub-members-close:hover,html:not([dark]) .ytkit-sub-group-dialog__button:hover{background:rgba(15,23,42,0.08);}
                    html:not([dark]) .ytkit-sub-digest-row,html:not([dark]) .ytkit-sub-health-row,html:not([dark]) .ytkit-sub-members-row,html:not([dark]) .ytkit-sub-digest-empty,html:not([dark]) .ytkit-sub-members-empty,html:not([dark]) .ytkit-sub-health-stat{background:rgba(15,23,42,0.035);border-color:rgba(15,23,42,0.1);}
                    html:not([dark]) .ytkit-sub-digest-name,html:not([dark]) .ytkit-sub-members-name{color:var(--yt-spec-text-primary,#0f0f0f);}
                    html:not([dark]) .ytkit-sub-digest-count{color:#075985;}
                    html:not([dark]) .ytkit-sub-digest-empty,html:not([dark]) .ytkit-sub-members-empty{color:var(--yt-spec-text-secondary,#606060);}
                    html:not([dark]) .ytkit-sub-health-stat{color:var(--yt-spec-text-secondary,#606060);}
                    html:not([dark]) .ytkit-sub-health-stat b{color:var(--yt-spec-text-primary,#0f0f0f);}
                    html:not([dark]) .ytkit-sub-health-section{color:var(--yt-spec-text-secondary,#606060);}
                    html:not([dark]) .ytkit-sub-health-error{background:rgba(220,38,38,0.08);border-color:rgba(185,28,28,0.28);color:#991b1b;}
                    html:not([dark]) .ytkit-sub-group-dialog{background:rgba(15,23,42,0.28);}
                    html:not([dark]) .ytkit-sub-group-dialog__input{background:#fff;border-color:rgba(15,23,42,0.2);color:var(--yt-spec-text-primary,#0f0f0f);}
                    html:not([dark]) .ytkit-sub-group-dialog__button--primary{background:var(--ytkit-accent,#7c3aed);color:var(--ytkit-accent-contrast,#fff);}
                    html:not([dark]) .ytkit-sub-toolbar select:focus-visible,html:not([dark]) .ytkit-sub-toolbar button:focus-visible,html:not([dark]) .ytkit-sub-group-chip:focus-visible,html:not([dark]) .ytkit-sub-digest-close:focus-visible,html:not([dark]) .ytkit-sub-digest-row button:focus-visible,html:not([dark]) .ytkit-sub-group-dialog button:focus-visible,html:not([dark]) .ytkit-sub-group-dialog input:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(124,58,237,0.42);}
                `, 'subscription-groups', true);
            },

            _readGroups() {
                const data = appState?.settings?.[this._GROUPS_KEY];
                return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
            },

            _writeGroups(next) {
                appState.settings[this._GROUPS_KEY] = next;
                try { settingsManager.save(appState.settings); }
                catch (e) { DebugManager.log('SubGroups', `Save failed: ${e.message}`); }
            },

            _readLastVisit() {
                const data = appState?.settings?.[this._LAST_VISIT_KEY];
                return (data && typeof data === 'object') ? data : {};
            },

            _writeLastVisit(next) {
                appState.settings[this._LAST_VISIT_KEY] = next;
                try { settingsManager.save(appState.settings); }
                catch (e) { DebugManager.log('SubGroups', `Save failed: ${e.message}`); }
            },

            _capLastVisitMap(lastVisit) {
                const LAST_VISIT_CAP = 2000;
                const next = { ...(lastVisit || {}) };
                const keys = Object.keys(next);
                if (keys.length <= LAST_VISIT_CAP) return next;
                const sorted = keys.sort((a, b) => (next[a] || 0) - (next[b] || 0));
                const drop = sorted.slice(0, keys.length - LAST_VISIT_CAP);
                for (const key of drop) delete next[key];
                return next;
            },

            _readUnsubscribeStaging() {
                const data = appState?.settings?.[this._UNSUB_STAGE_KEY];
                const staged = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
                // Enforce the 30-day undo deadline that is stored/displayed but
                // was never enforced: drop expired records so the staging map
                // can't grow forever and the badge/toolbar reflect reality.
                const now = Date.now();
                const pruned = {};
                let dropped = 0;
                for (const [channelId, record] of Object.entries(staged)) {
                    const undoUntil = Number(record?.undoUntil) || 0;
                    if (undoUntil && now > undoUntil) { dropped++; continue; }
                    pruned[channelId] = record;
                }
                if (dropped > 0) this._writeUnsubscribeStaging(pruned);
                return pruned;
            },

            _writeUnsubscribeStaging(next) {
                appState.settings[this._UNSUB_STAGE_KEY] = next;
                try { settingsManager.save(appState.settings); }
                catch (e) { DebugManager.log('SubGroups', `Unsubscribe staging save failed: ${e.message}`); }
            },

            _normalizeSubscriptionSortMode(mode) {
                const value = String(mode || 'default');
                return this._SORT_MODES.includes(value) ? value : 'default';
            },

            _getActiveSortMode(groups = this._readGroups()) {
                const groupSortMode = this._activeGroupId && groups[this._activeGroupId]?.sortMode;
                if (groupSortMode) return this._normalizeSubscriptionSortMode(groupSortMode);
                return this._normalizeSubscriptionSortMode(appState?.settings?.subscriptionSortMode || 'default');
            },

            _setActiveSortMode(mode) {
                const normalized = this._normalizeSubscriptionSortMode(mode);
                const groups = this._readGroups();
                if (this._activeGroupId && groups[this._activeGroupId]) {
                    const next = {
                        ...groups,
                        [this._activeGroupId]: {
                            ...groups[this._activeGroupId],
                            sortMode: normalized,
                            updatedAt: Date.now()
                        }
                    };
                    this._writeGroups(next);
                    return normalized;
                }
                appState.settings.subscriptionSortMode = normalized;
                try { settingsManager.save(appState.settings); }
                catch (e) { DebugManager.log('SubGroups', `Sort save failed: ${e.message}`); }
                return normalized;
            },

            _getGroupParentId(groupId, groups = this._readGroups()) {
                const id = String(groupId || '');
                const parentId = String(groups[id]?.parentId || '');
                if (!id || !parentId || parentId === id || !groups[parentId]) return '';
                const grandParentId = String(groups[parentId]?.parentId || '');
                return grandParentId && groups[grandParentId] ? '' : parentId;
            },

            _normalizeNewGroupParentId(parentId, groups = this._readGroups()) {
                const value = String(parentId || '');
                if (!value || !groups[value]) return '';
                return this._getGroupParentId(value, groups) ? '' : value;
            },

            _getTopLevelGroupIds(groups = this._readGroups()) {
                return Object.keys(groups).filter(id => !this._getGroupParentId(id, groups));
            },

            _getChildGroupIds(parentId, groups = this._readGroups()) {
                return Object.keys(groups).filter(id => this._getGroupParentId(id, groups) === parentId);
            },

            _getGroupChannelIdSet(groupId, groups = this._readGroups()) {
                const group = groups[groupId];
                const ids = new Set(Array.isArray(group?.channelIds) ? group.channelIds : []);
                if (group && !this._getGroupParentId(groupId, groups)) {
                    for (const childId of this._getChildGroupIds(groupId, groups)) {
                        const child = groups[childId];
                        if (Array.isArray(child?.channelIds)) child.channelIds.forEach(id => ids.add(id));
                    }
                }
                return ids;
            },

            _playGroupAsQueue(groupId) {
                const MAX_IDS = 50;
                const groups = this._readGroups();
                const allowed = this._getGroupChannelIdSet(groupId, groups);
                if (!allowed?.size) return;
                const ids = [];
                const cards = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
                for (const card of cards) {
                    if (card.classList.contains('ytkit-sub-hidden-by-group')) continue;
                    const channelId = this._extractChannelIdFromCard(card);
                    if (!channelId || !allowed.has(channelId)) continue;
                    const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
                    if (!link) continue;
                    const m = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                    if (m && !ids.includes(m[1])) ids.push(m[1]);
                    if (ids.length >= MAX_IDS) break;
                }
                if (!ids.length) {
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionGroupNoVideos',
                        'No videos visible in this group'
                    ), '#6b7280', { tone: 'neutral' });
                    return;
                }
                const url = `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`;
                window.open(url, '_blank', 'noopener,noreferrer');
                const groupName = groups[groupId]?.name || groupId;
                const truncated = ids.length >= MAX_IDS
                    ? t('subscriptionQueueCappedTpl', ' (capped at {count})').replace('{count}', MAX_IDS)
                    : '';
                if (typeof showToast === 'function') showToast(t(
                    'subscriptionGroupPlayingTpl',
                    'Playing {count} videos from {group}{truncated}'
                ).replace('{count}', ids.length).replace('{group}', groupName).replace('{truncated}', truncated), '#22c55e');
            },

            _exportGroups() {
                const payload = {
                    schemaVersion: 2,
                    exportedAt: new Date().toISOString(),
                    groups: this._readGroups()
                };
                const json = JSON.stringify(payload, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `astra-deck-subscription-groups-${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                if (typeof showToast === 'function') showToast(t(
                    'subscriptionGroupsExported',
                    'Exported subscription groups'
                ), '#22c55e');
            },

            _csvEscape(value) {
                const s = String(value ?? '');
                if (/[",\r\n]/.test(s) || s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@') || s.startsWith('\t')) {
                    return '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            },

            _exportGroupsCsv() {
                const groups = this._readGroups();
                const rows = ['Group,Channel,Handle,URL'];
                for (const [id, group] of Object.entries(groups)) {
                    const name = group.name || id;
                    // Groups persist membership as `channelIds` (UC.../@handle
                    // strings), never a `channels` object array. Derive the
                    // handle column and canonical URL from the id so exports
                    // actually carry channel data.
                    const channelIds = Array.isArray(group.channelIds) ? group.channelIds : [];
                    if (channelIds.length === 0) {
                        rows.push(this._csvEscape(name) + ',,,');
                        continue;
                    }
                    for (const channelId of channelIds) {
                        const id = String(channelId || '').trim();
                        if (!id) continue;
                        const handle = id.startsWith('@') ? id : '';
                        const url = handle
                            ? `https://www.youtube.com/${handle}`
                            : `https://www.youtube.com/channel/${id}`;
                        rows.push([name, id, handle, url].map(v => this._csvEscape(v)).join(','));
                    }
                }
                const csv = rows.join('\r\n') + '\r\n';
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `astra-deck-subscription-groups-${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                if (typeof showToast === 'function') showToast(t(
                    'subscriptionGroupsExportedCsv',
                    'Exported subscription groups as CSV'
                ), '#22c55e');
            },

            _exportGroupsOpml() {
                const opml = this._buildGroupsOpml();
                const blob = new Blob([opml], { type: 'text/x-opml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `astra-deck-subscription-groups-${new Date().toISOString().slice(0,10)}.opml`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                if (typeof showToast === 'function') showToast(t(
                    'subscriptionGroupsExportedOpml',
                    'Exported subscription groups as OPML'
                ), '#22c55e');
                return opml;
            },

            _importGroups(json, options = {}) {
                try {
                    const data = JSON.parse(json);
                    if (!data || typeof data !== 'object' || !data.groups) throw new Error('Missing groups field');
                    const sanitized = {};
                    const rawParentById = {};
                    let skippedGroups = 0;
                    let skippedChannels = 0;
                    let duplicateChannels = 0;
                    let importedChannels = 0;
                    for (const [id, raw] of Object.entries(data.groups)) {
                        if (typeof id !== 'string' || id.length > 64 || !isSafeObjectKey(id)) {
                            skippedGroups++;
                            continue;
                        }
                        if (!raw || typeof raw !== 'object') {
                            skippedGroups++;
                            continue;
                        }
                        const name = String(raw.name || '').slice(0, 80);
                        const color = /^#[0-9a-fA-F]{6}$/.test(raw.color || '') ? raw.color : '#7c3aed';
                        const rawChannelIds = Array.isArray(raw.channelIds) ? raw.channelIds : [];
                        const channelIds = [];
                        const seenChannels = new Set();
                        for (let i = 0; i < rawChannelIds.length; i++) {
                            if (channelIds.length >= 1000) {
                                skippedChannels += rawChannelIds.length - i;
                                break;
                            }
                            const channelId = typeof rawChannelIds[i] === 'string' ? rawChannelIds[i].trim() : '';
                            if (!channelId || channelId.length >= 64) {
                                skippedChannels++;
                                continue;
                            }
                            if (seenChannels.has(channelId)) {
                                duplicateChannels++;
                                continue;
                            }
                            seenChannels.add(channelId);
                            channelIds.push(channelId);
                            importedChannels++;
                        }
                        sanitized[id] = {
                            name,
                            color,
                            channelIds,
                            parentId: '',
                            sortMode: this._normalizeSubscriptionSortMode(raw.sortMode),
                            updatedAt: Date.now()
                        };
                        const parentId = String(raw.parentId || '');
                        if (parentId && parentId !== id && parentId.length <= 64 && isSafeObjectKey(parentId)) rawParentById[id] = parentId;
                    }
                    for (const [id, parentId] of Object.entries(rawParentById)) {
                        if (sanitized[id] && sanitized[parentId] && !rawParentById[parentId]) {
                            sanitized[id].parentId = parentId;
                        }
                    }
                    return this._commitImportedGroups(sanitized, 'JSON', {
                        skippedGroups,
                        skippedChannels,
                        duplicateChannels,
                        importedChannels
                    }, options);
                } catch (e) {
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionGroupsImportFailedTpl',
                        'Import failed: {error}'
                    ).replace('{error}', e.message), '#ef4444');
                    return { ok: false, error: e.message };
                }
            },

            _importGroupsOpml(opmlText, options = {}) {
                try {
                    const parsed = this._parseGroupsOpml(opmlText);
                    return this._commitImportedGroups(parsed.groups, 'OPML', {
                        duplicateChannels: parsed.duplicateChannels,
                        importedChannels: parsed.importedChannels
                    }, options);
                } catch (e) {
                    const message = `OPML import failed: ${e.message}`;
                    if (typeof showToast === 'function') showToast(message, '#ef4444', { duration: 6, tone: 'error' });
                    return { ok: false, error: e.message };
                }
            },

            _extractChannelIdFromCard(card) {
                const link = card.querySelector('a[href*="/channel/"], a[href*="/@"]');
                if (!link) return '';
                const href = link.getAttribute('href') || '';
                const m = href.match(/\/channel\/([A-Za-z0-9_-]+)/);
                if (m) return m[1];
                const h = href.match(/^\/@([A-Za-z0-9._-]+)/);
                if (h) return '@' + h[1];
                return '';
            },

            _applyGroupFilter() {
                const groups = this._readGroups();
                const active = this._activeGroupId;
                const allowed = active && groups[active] ? this._getGroupChannelIdSet(active, groups) : null;
                const cards = Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer'));
                return this._runCardBatch('group-filter', cards, card => {
                    if (!allowed) {
                        card.classList.remove('ytkit-sub-hidden-by-group');
                        return;
                    }
                    const channelId = this._extractChannelIdFromCard(card);
                    if (!channelId || !allowed.has(channelId)) card.classList.add('ytkit-sub-hidden-by-group');
                    else card.classList.remove('ytkit-sub-hidden-by-group');
                }, () => this._renderGroupEmptyState(allowed));
            },

            _applyContentTypeFilter() {
                const filterLive = !!appState?.settings?.subscriptionFilterLive;
                const filterStreamed = !!appState?.settings?.subscriptionFilterStreamed;
                const cards = Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer'));
                return this._runCardBatch('content-type-filter', cards, card => {
                    if (!filterLive && !filterStreamed) {
                        card.classList.remove('ytkit-sub-hidden-by-type');
                        return;
                    }
                    const isLive = filterLive && !!card.querySelector(
                        'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"],' +
                        'ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"],' +
                        '.badge-style-type-live-now, [aria-label*="LIVE"]'
                    );
                    const isStreamed = filterStreamed && /\b(?:Streamed|Streamed live)\b/i.test(
                        card.querySelector('#metadata-line, ytd-video-meta-block, #meta')?.textContent || ''
                    );
                    if (isLive || isStreamed) card.classList.add('ytkit-sub-hidden-by-type');
                    else card.classList.remove('ytkit-sub-hidden-by-type');
                });
            },

            _applyNewSinceMarkers() {
                document.querySelectorAll('.ytkit-sub-new-badge').forEach(el => el.remove());
                if (!appState?.settings?.subscriptionShowNewSinceLastVisit) return;
                const lastVisit = this._sessionLastVisit || this._readLastVisit();
                const cards = Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer'));
                return this._runCardBatch('new-since-markers', cards, card => {
                    const channelId = this._extractChannelIdFromCard(card);
                    if (!channelId) return;
                    if (this._isCardNewSinceLastVisit(card, channelId, lastVisit)) {
                        const target = card.querySelector('#metadata-line, ytd-video-meta-block, #meta');
                        if (target) {
                            const badge = document.createElement('span');
                            badge.className = 'ytkit-sub-new-badge';
                            badge.textContent = t('subscriptionNewBadge', 'NEW');
                            target.appendChild(badge);
                        }
                    }
                });
            },

            _stampLastVisit() {
                const lastVisit = { ...this._readLastVisit() };
                const now = Date.now();
                const cards = Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer'));
                return this._runCardBatch('stamp-last-visit', cards, card => {
                    const channelId = this._extractChannelIdFromCard(card);
                    if (channelId) lastVisit[channelId] = now;
                }, () => {
                    this._writeLastVisit(this._capLastVisitMap(lastVisit));
                    if (this._digestPanel) this._renderDigestPanel();
                });
            },

            _getCardMetaText(card) {
                return [
                    card.querySelector('#metadata-line')?.textContent,
                    card.querySelector('ytd-video-meta-block')?.textContent,
                    card.querySelector('#meta')?.textContent,
                    card.querySelector('[aria-label*="ago"]')?.getAttribute?.('aria-label'),
                    card.querySelector('[aria-label*="view"]')?.getAttribute?.('aria-label'),
                    card.textContent
                ].filter(Boolean).join(' ');
            },

            _extractCardAgeMs(text) {
                const raw = String(text || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
                if (!raw) return null;
                const match = raw.match(/\b(\d+(?:[,.]\d+)?)\s*(minute|hour|day|week|month|year)s?\s+ago\b/);
                if (!match) return null;
                const value = Number.parseFloat(match[1].replace(',', '.'));
                if (!Number.isFinite(value) || value < 0) return null;
                const unitMs = {
                    minute: 60 * 1000,
                    hour: 60 * 60 * 1000,
                    day: 24 * 60 * 60 * 1000,
                    week: 7 * 24 * 60 * 60 * 1000,
                    month: 30 * 24 * 60 * 60 * 1000,
                    year: 365 * 24 * 60 * 60 * 1000
                }[match[2]];
                return unitMs ? Math.round(value * unitMs) : null;
            },

            _extractCardAgeDays(text) {
                const ageMs = this._extractCardAgeMs(text);
                if (ageMs === null) return null;
                return Math.round(ageMs / (24 * 60 * 60 * 1000));
            },

            _extractChannelNameFromCard(card, channelId = '') {
                const selectors = [
                    'ytd-channel-name #text a',
                    'ytd-channel-name a',
                    '#channel-name a',
                    'a[href*="/channel/"]',
                    'a[href*="/@"]'
                ];
                for (const selector of selectors) {
                    const text = (card.querySelector(selector)?.textContent || '').trim();
                    if (text) return text.slice(0, 120);
                }
                return String(channelId || '').slice(0, 120);
            },

            _extractVideoTitleFromCard(card) {
                const selectors = ['#video-title', '[id="video-title"]', 'a#video-title-link', 'a[href*="/watch"]'];
                for (const selector of selectors) {
                    const text = (card.querySelector(selector)?.textContent || '').trim();
                    if (text) return text.slice(0, 160);
                }
                return '';
            },

            _isCardNewSinceLastVisit(card, channelId, lastVisit = this._sessionLastVisit || this._readLastVisit()) {
                const id = String(channelId || '');
                if (!id) return false;
                const lastSeen = Number(lastVisit?.[id]) || 0;
                if (!lastSeen) return true;
                const ageMs = this._extractCardAgeMs(this._getCardMetaText(card));
                if (ageMs === null) return false;
                return (Date.now() - ageMs) > lastSeen;
            },

            _collectRenderedCardSummaries(lastVisit = this._sessionLastVisit || this._readLastVisit()) {
                return Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer'))
                    .map(card => {
                        const channelId = this._extractChannelIdFromCard(card);
                        if (!channelId) return null;
                        return {
                            card,
                            channelId,
                            channelName: this._extractChannelNameFromCard(card, channelId),
                            title: this._extractVideoTitleFromCard(card),
                            isNew: this._isCardNewSinceLastVisit(card, channelId, lastVisit)
                        };
                    })
                    .filter(Boolean);
            },

            _buildGroupDigestEntries(groups = this._readGroups(), lastVisit = this._readLastVisit()) {
                const summaries = this._collectRenderedCardSummaries(lastVisit);
                const buildEntry = (groupId, depth) => {
                    const allowed = this._getGroupChannelIdSet(groupId, groups);
                    const matches = summaries.filter(item => allowed.has(item.channelId));
                    const newMatches = matches.filter(item => item.isNew);
                    return {
                        groupId,
                        name: groups[groupId]?.name || groupId,
                        depth,
                        renderedVideos: matches.length,
                        newVideos: newMatches.length,
                        newChannels: new Set(newMatches.map(item => item.channelId)).size
                    };
                };
                const entries = [];
                for (const id of this._getTopLevelGroupIds(groups)) {
                    entries.push(buildEntry(id, 0));
                    for (const childId of this._getChildGroupIds(id, groups)) {
                        entries.push(buildEntry(childId, 1));
                    }
                }
                return entries;
            },

            _closeDigestPanel() {
                this._digestPanel?.remove();
                this._digestPanel = null;
            },

            _markGroupDigestRead(groupId = '') {
                const groups = this._readGroups();
                const safeGroupId = groupId && groups[groupId] ? groupId : '';
                const allowed = safeGroupId ? this._getGroupChannelIdSet(safeGroupId, groups) : null;
                const summaries = this._collectRenderedCardSummaries();
                const next = { ...this._readLastVisit() };
                const now = Date.now();
                // Count distinct CHANNELS (the toast says "channels") — the
                // summaries list has one entry per rendered VIDEO, so a plain
                // counter over-reports when a channel has several cards.
                const markedChannels = new Set();
                for (const item of summaries) {
                    if (allowed && !allowed.has(item.channelId)) continue;
                    next[item.channelId] = now;
                    markedChannels.add(item.channelId);
                }
                if (allowed && markedChannels.size === 0) {
                    for (const channelId of allowed) {
                        next[channelId] = now;
                        markedChannels.add(channelId);
                    }
                }
                const marked = markedChannels.size;
                if (this._sessionLastVisit) {
                    for (const channelId of markedChannels) {
                        this._sessionLastVisit[channelId] = now;
                    }
                }
                this._writeLastVisit(this._capLastVisitMap(next));
                this._applyNewSinceMarkers();
                this._applySort();
                this._renderDigestPanel();
                if (typeof showToast === 'function') {
                    const label = safeGroupId
                        ? (groups[safeGroupId]?.name || safeGroupId)
                        : t('subscriptionRenderedSubscriptions', 'rendered subscriptions');
                    const channelLabel = marked === 1
                        ? t('subscriptionChannelSingular', 'channel')
                        : t('subscriptionChannelPlural', 'channels');
                    showToast(t(
                        'subscriptionChannelsMarkedReadTpl',
                        'Marked {count} {channels} read for {group}'
                    ).replace('{count}', marked).replace('{channels}', channelLabel).replace('{group}', label), '#22c55e', { duration: 4 });
                }
            },

            _toggleDigestPanel() {
                if (this._digestPanel) {
                    this._closeDigestPanel();
                    return;
                }
                this._renderDigestPanel();
            },

            _closeHealthPanel() {
                this._healthPanel?.remove();
                this._healthPanel = null;
            },

            _toggleHealthPanel() {
                if (this._healthPanel) {
                    this._closeHealthPanel();
                    return;
                }
                this._renderHealthPanel();
            },

            // One coherent subscriptions health/action center: stale-channel
            // candidates, staged-unsubscribe recovery, new-since-last-visit
            // counts, bounded unsubscribe actions, and export actions — all
            // read from the same local data the toolbar actions maintain.
            _renderHealthPanel() {
                if (!this._toolbar?.isConnected) this._renderToolbar();
                if (!this._toolbar?.isConnected) return;
                this._closeHealthPanel();

                const panel = document.createElement('section');
                panel.className = 'ytkit-sub-digest-panel';
                panel.setAttribute('role', 'region');
                panel.setAttribute('aria-label', t('subscriptionHealthRegionAria', 'Subscription health center'));

                const head = document.createElement('div');
                head.className = 'ytkit-sub-digest-head';
                const titleWrap = document.createElement('div');
                const title = document.createElement('h3');
                title.className = 'ytkit-sub-digest-title';
                title.textContent = t('subscriptionHealthTitle', 'Subscription Health');
                const meta = document.createElement('div');
                meta.className = 'ytkit-sub-digest-meta';
                titleWrap.append(title, meta);
                const headActions = document.createElement('div');
                const rescan = document.createElement('button');
                rescan.type = 'button';
                rescan.className = 'ytkit-sub-digest-close';
                rescan.textContent = t('subscriptionHealthRescan', 'Rescan');
                rescan.setAttribute('aria-label', t('subscriptionHealthRescanAria', 'Rescan the rendered feed for subscription health'));
                rescan.addEventListener('click', () => this._renderHealthPanel());
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'ytkit-sub-digest-close';
                close.textContent = t('commonClose', 'Close');
                close.setAttribute('aria-label', t('subscriptionHealthCloseAria', 'Close subscription health center'));
                close.addEventListener('click', () => this._closeHealthPanel());
                headActions.append(rescan, ' ', close);
                head.append(titleWrap, headActions);
                panel.appendChild(head);

                try {
                    const lastVisit = this._readLastVisit();
                    const summaries = this._collectRenderedCardSummaries(lastVisit);
                    const groups = this._readGroups();
                    const candidates = this._renderDeadChannelMarkers();
                    const staged = this._readUnsubscribeStaging();
                    const stagedEntries = Object.values(staged);
                    const newVideos = summaries.filter(item => item.isNew);
                    const renderedChannels = new Set(summaries.map(item => item.channelId)).size;
                    meta.textContent = t('subscriptionHealthMetaTpl', '{channels} rendered channels · {groups} groups')
                        .replace('{channels}', String(renderedChannels))
                        .replace('{groups}', String(Object.keys(groups).length));

                    const stats = document.createElement('div');
                    stats.className = 'ytkit-sub-health-stats';
                    const addStat = (label, value, tone = '') => {
                        const chip = document.createElement('span');
                        chip.className = 'ytkit-sub-health-stat';
                        if (tone) chip.dataset.tone = tone;
                        const strong = document.createElement('b');
                        strong.textContent = String(value);
                        chip.append(strong, ` ${label}`);
                        stats.appendChild(chip);
                    };
                    addStat(t('subscriptionHealthStatStale', 'stale candidates'), candidates.length, candidates.length ? 'warn' : '');
                    addStat(t('subscriptionHealthStatStaged', 'staged for review'), stagedEntries.length, stagedEntries.length ? 'staged' : '');
                    addStat(t('subscriptionHealthStatNewVideos', 'new videos'), newVideos.length);
                    addStat(t('subscriptionHealthStatNewChannels', 'new channels'), new Set(newVideos.map(item => item.channelId)).size);
                    panel.appendChild(stats);

                    // ── Stale / dead-channel candidates ──
                    const staleHeading = document.createElement('div');
                    staleHeading.className = 'ytkit-sub-health-section';
                    staleHeading.textContent = t('subscriptionHealthStaleHeadingTpl', 'Stale channels (≥{days} days, rendered feed)')
                        .replace('{days}', String(this._STALE_CHANNEL_MIN_AGE_DAYS));
                    panel.appendChild(staleHeading);
                    const staleList = document.createElement('div');
                    staleList.className = 'ytkit-sub-digest-list';
                    if (!candidates.length) {
                        const empty = document.createElement('div');
                        empty.className = 'ytkit-sub-digest-empty';
                        empty.textContent = t('subscriptionHealthStaleEmpty', 'No stale channels detected among the rendered cards. Scroll to load more of the feed, then Rescan.');
                        staleList.appendChild(empty);
                    } else {
                        for (const candidate of candidates.slice(0, 12)) {
                            const row = document.createElement('div');
                            row.className = 'ytkit-sub-health-row';
                            const name = document.createElement('div');
                            name.className = 'ytkit-sub-digest-name';
                            name.textContent = candidate.channelName || candidate.channelId;
                            const age = document.createElement('div');
                            age.className = 'ytkit-sub-digest-muted';
                    age.textContent = t('subscriptionAgeDaysShortTpl', '{days}d')
                        .replace('{days}', candidate.ageDays);
                            const action = document.createElement('button');
                            action.type = 'button';
                            if (staged[candidate.channelId]) {
                                action.textContent = t('subscriptionHealthUndoStage', 'Undo stage');
                                action.setAttribute('aria-label', t('subscriptionHealthUndoStageAriaTpl', 'Undo staged unsubscribe for {channel}')
                                    .replace('{channel}', name.textContent));
                                action.addEventListener('click', () => {
                                    this._undoStagedUnsubscribes([candidate.channelId]);
                                    this._renderHealthPanel();
                                });
                            } else {
                                action.textContent = t('subscriptionHealthStage', 'Stage');
                                action.setAttribute('aria-label', t('subscriptionHealthStageAriaTpl', 'Stage {channel} for unsubscribe review')
                                    .replace('{channel}', name.textContent));
                                action.addEventListener('click', () => {
                                    const now = Date.now();
                                    const next = { ...this._readUnsubscribeStaging() };
                                    next[candidate.channelId] = {
                                        channelId: candidate.channelId,
                                        channelName: candidate.channelName || candidate.channelId,
                                        ageDays: candidate.ageDays,
                                        stagedAt: now,
                                        undoUntil: now + this._UNSUB_STAGE_TTL_MS,
                                        reason: `${candidate.ageDays} days since newest rendered upload`,
                                        source: 'health-center'
                                    };
                                    this._writeUnsubscribeStaging(next);
                                    this._renderDeadChannelMarkers();
                                    this._renderHealthPanel();
                                });
                            }
                            row.append(name, age, action);
                            staleList.appendChild(row);
                        }
                        if (candidates.length > 12) {
                            const more = document.createElement('div');
                            more.className = 'ytkit-sub-digest-empty';
                            more.textContent = t('subscriptionHealthMoreTpl', '+{count} more — use Stage Stale in the toolbar to stage every candidate at once.')
                                .replace('{count}', String(candidates.length - 12));
                            staleList.appendChild(more);
                        }
                    }
                    panel.appendChild(staleList);

                    // ── Staged unsubscribe recovery ──
                    const stagedHeading = document.createElement('div');
                    stagedHeading.className = 'ytkit-sub-health-section';
                    stagedHeading.textContent = t('subscriptionHealthStagedHeading', 'Staged unsubscribes (review before applying, 30-day recovery window)');
                    panel.appendChild(stagedHeading);
                    const stagedList = document.createElement('div');
                    stagedList.className = 'ytkit-sub-digest-list';
                    if (!stagedEntries.length) {
                        const empty = document.createElement('div');
                        empty.className = 'ytkit-sub-digest-empty';
                        empty.textContent = t('subscriptionHealthStagedEmpty', 'Nothing staged. Stage stale channels to review them before a bounded unsubscribe session.');
                        stagedList.appendChild(empty);
                    } else {
                        for (const entry of stagedEntries.slice(0, 12)) {
                            const row = document.createElement('div');
                            row.className = 'ytkit-sub-health-row';
                            const name = document.createElement('div');
                            name.className = 'ytkit-sub-digest-name';
                            name.textContent = entry.channelName || entry.channelId;
                            name.title = entry.reason || '';
                            const until = document.createElement('div');
                            until.className = 'ytkit-sub-digest-muted';
                            until.textContent = entry.undoUntil
                                ? t('subscriptionHealthUndoByTpl', 'undo by {date}')
                                    .replace('{date}', new Date(entry.undoUntil).toLocaleDateString())
                                : t('subscriptionHealthStaged', 'staged');
                            const undo = document.createElement('button');
                            undo.type = 'button';
                            undo.textContent = t('toastActionUndo', 'Undo');
                            undo.setAttribute('aria-label', t('subscriptionHealthUndoStageAriaTpl', 'Undo staged unsubscribe for {channel}')
                                .replace('{channel}', name.textContent));
                            undo.addEventListener('click', () => {
                                this._undoStagedUnsubscribes([entry.channelId]);
                                this._renderHealthPanel();
                            });
                            row.append(name, until, undo);
                            stagedList.appendChild(row);
                        }
                        const undoAllWrap = document.createElement('div');
                        undoAllWrap.className = 'ytkit-sub-health-actions';
                        const undoAll = document.createElement('button');
                        undoAll.type = 'button';
                        undoAll.textContent = t('subscriptionHealthUndoAllTpl', 'Undo all staged ({count})')
                            .replace('{count}', String(stagedEntries.length));
                        undoAll.setAttribute('aria-label', t('subscriptionHealthUndoAllAria', 'Undo every staged unsubscribe'));
                        undoAll.addEventListener('click', () => {
                            this._undoStagedUnsubscribes(Object.keys(this._readUnsubscribeStaging()));
                            this._renderHealthPanel();
                        });
                        undoAllWrap.appendChild(undoAll);
                        stagedList.appendChild(undoAllWrap);
                        const stagedActions = document.createElement('div');
                        stagedActions.className = 'ytkit-sub-health-actions';
                        const unsubscribe = document.createElement('button');
                        unsubscribe.type = 'button';
                        unsubscribe.textContent = t('subscriptionUnsubscribeRunTpl', 'Unsubscribe staged ({count})')
                            .replace('{count}', String(stagedEntries.length));
                        unsubscribe.setAttribute('aria-label', t('subscriptionUnsubscribeRunAriaTpl', 'Unsubscribe up to {count} staged channels in this bounded session')
                            .replace('{count}', String(this._UNSUBSCRIBE_BATCH_CAP)));
                        unsubscribe.title = t('subscriptionUnsubscribeRunTitleTpl', 'Apply YouTube unsubscribe only to the staged review list, up to {count} channels at 400 ms pacing.')
                            .replace('{count}', String(this._UNSUBSCRIBE_BATCH_CAP));
                        unsubscribe.disabled = this._unsubscribeRunning;
                        unsubscribe.addEventListener('click', () => { void this._runStagedUnsubscribeSession(); });
                        stagedActions.appendChild(unsubscribe);
                        stagedList.appendChild(stagedActions);
                    }
                    panel.appendChild(stagedList);

                    // ── New since last visit ──
                    const newHeading = document.createElement('div');
                    newHeading.className = 'ytkit-sub-health-section';
                    newHeading.textContent = t('subscriptionHealthNewHeading', 'New since last visit');
                    panel.appendChild(newHeading);
                    const newActions = document.createElement('div');
                    newActions.className = 'ytkit-sub-health-actions';
                    const newSummary = document.createElement('div');
                    newSummary.className = 'ytkit-sub-digest-empty';
                    newSummary.textContent = newVideos.length
                        ? t('subscriptionHealthNewSummaryTpl', '{videos} new videos from {channels} channels since your last visit.')
                            .replace('{videos}', String(newVideos.length))
                            .replace('{channels}', String(new Set(newVideos.map(item => item.channelId)).size))
                        : t('subscriptionHealthNewEmpty', 'Nothing new since your last visit stamp.');
                    const openDigest = document.createElement('button');
                    openDigest.type = 'button';
                    openDigest.textContent = t('subscriptionDigestOpen', 'Open Digest');
                    openDigest.setAttribute('aria-label', t('subscriptionDigestOpenAria', 'Open the per-group notifications digest'));
                    openDigest.addEventListener('click', () => this._renderDigestPanel());
                    const markRead = document.createElement('button');
                    markRead.type = 'button';
                    markRead.textContent = t('subscriptionDigestMarkAllRead', 'Mark all read');
                    markRead.disabled = newVideos.length === 0;
                    // A disabled control with no explanation reads as broken.
                    markRead.title = markRead.disabled
                        ? t('subscriptionDigestMarkAllReadEmpty', 'Nothing new since your last visit')
                        : '';
                    markRead.setAttribute(
                        'aria-label',
                        markRead.disabled
                            ? t('subscriptionDigestMarkAllReadEmpty', 'Nothing new since your last visit')
                            : t('subscriptionDigestMarkAllReadAria', 'Mark every rendered channel as read')
                    );
                    markRead.addEventListener('click', () => {
                        this._markGroupDigestRead('');
                        this._renderHealthPanel();
                    });
                    newActions.append(openDigest, markRead);
                    panel.append(newSummary, newActions);

                    // ── Export actions ──
                    const exportHeading = document.createElement('div');
                    exportHeading.className = 'ytkit-sub-health-section';
                    exportHeading.textContent = t('commonExport', 'Export');
                    panel.appendChild(exportHeading);
                    const exportActions = document.createElement('div');
                    exportActions.className = 'ytkit-sub-health-actions';
                    for (const [label, handler, aria] of [
                        ['JSON', () => this._exportGroups(), t('subscriptionExportJsonAria', 'Export subscription groups as JSON')],
                        ['CSV', () => this._exportGroupsCsv(), t('subscriptionExportCsvAria', 'Export subscription groups as CSV')],
                        ['OPML', () => this._exportGroupsOpml(), t('subscriptionExportOpmlAria', 'Export subscription groups as OPML')],
                        [t('subscriptionUnsubscribeLogButton', 'Unsubscribe log'), () => this._exportUnsubscribeLog(), t('subscriptionUnsubscribeLogAria', 'Export the local unsubscribe session log as JSON')]
                    ]) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.textContent = label;
                        btn.setAttribute('aria-label', aria);
                        btn.addEventListener('click', handler);
                        exportActions.appendChild(btn);
                    }
                    panel.appendChild(exportActions);
                } catch (err) {
                    const errorBox = document.createElement('div');
                    errorBox.className = 'ytkit-sub-health-error';
                    errorBox.textContent = t('subscriptionHealthFailedTpl', 'Health scan failed: {error}. The feed may still be loading — try Rescan.')
                        .replace('{error}', err?.message || t('commonUnexpectedError', 'unexpected error'));
                    panel.appendChild(errorBox);
                }

                this._toolbar.insertAdjacentElement('afterend', panel);
                this._healthPanel = panel;
            },

            _renderDigestPanel() {
                if (!this._toolbar?.isConnected) this._renderToolbar();
                if (!this._toolbar?.isConnected) return;
                const lastVisit = this._sessionLastVisit || this._readLastVisit();
                const summaries = this._collectRenderedCardSummaries(lastVisit);
                const entries = this._buildGroupDigestEntries(this._readGroups(), lastVisit);
                const allNew = summaries.filter(item => item.isNew);
                this._closeDigestPanel();

                const panel = document.createElement('section');
                panel.className = 'ytkit-sub-digest-panel';
                panel.setAttribute('role', 'region');
                panel.setAttribute('aria-label', t('subscriptionDigestRegionAria', 'Group notifications digest'));

                const head = document.createElement('div');
                head.className = 'ytkit-sub-digest-head';
                const titleWrap = document.createElement('div');
                const title = document.createElement('h3');
                title.className = 'ytkit-sub-digest-title';
                title.textContent = t('subscriptionDigestTitle', 'Group Digest');
                const meta = document.createElement('div');
                meta.className = 'ytkit-sub-digest-meta';
                meta.textContent = t('subscriptionDigestMetaTpl', '{newCount} new of {renderedCount} rendered videos')
                    .replace('{newCount}', String(allNew.length))
                    .replace('{renderedCount}', String(summaries.length));
                titleWrap.append(title, meta);
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'ytkit-sub-digest-close';
                close.textContent = t('commonClose', 'Close');
                close.setAttribute('aria-label', t('subscriptionDigestCloseAria', 'Close group notifications digest'));
                close.addEventListener('click', () => this._closeDigestPanel());
                head.append(titleWrap, close);

                const list = document.createElement('div');
                list.className = 'ytkit-sub-digest-list';

                const appendRow = (entry) => {
                    const row = document.createElement('div');
                    row.className = 'ytkit-sub-digest-row';
                    row.dataset.depth = String(entry.depth || 0);
                    const name = document.createElement('div');
                    name.className = 'ytkit-sub-digest-name';
                    name.textContent = entry.name;
                    const count = document.createElement('div');
                    count.className = 'ytkit-sub-digest-count';
                    count.textContent = t('subscriptionDigestNewTpl', '{count} new').replace('{count}', String(entry.newVideos));
                    const rendered = document.createElement('div');
                    rendered.className = 'ytkit-sub-digest-muted';
                    rendered.textContent = t('subscriptionDigestRenderedTpl', '{shown} shown / {channels} channels')
                        .replace('{shown}', String(entry.renderedVideos))
                        .replace('{channels}', String(entry.newChannels));
                    const actions = document.createElement('div');
                    const mark = document.createElement('button');
                    mark.type = 'button';
                    mark.textContent = t('subscriptionDigestMarkRead', 'Mark read');
                    mark.disabled = entry.newVideos === 0;
                    mark.setAttribute('aria-label', t('subscriptionDigestMarkReadAriaTpl', 'Mark {group} digest as read')
                        .replace('{group}', entry.name));
                    mark.addEventListener('click', () => this._markGroupDigestRead(entry.groupId || ''));
                    const view = document.createElement('button');
                    view.type = 'button';
                    view.textContent = t('subscriptionDigestView', 'View');
                    view.setAttribute('aria-label', t('subscriptionDigestViewAriaTpl', 'View {group} subscriptions')
                        .replace('{group}', entry.name));
                    view.addEventListener('click', () => {
                        this._activeGroupId = entry.groupId || '';
                        this._renderToolbar();
                        this._applyGroupFilter();
                        this._applyNewSinceMarkers();
                        this._renderDeadChannelMarkers();
                        this._applySort();
                    });
                    actions.append(mark, view);
                    row.append(name, count, rendered, actions);
                    list.appendChild(row);
                };

                appendRow({
                    groupId: '',
                    name: t('subscriptionAllSubscriptions', 'All subscriptions'),
                    depth: 0,
                    renderedVideos: summaries.length,
                    newVideos: allNew.length,
                    newChannels: new Set(allNew.map(item => item.channelId)).size
                });
                entries.forEach(appendRow);
                if (!entries.length) {
                    const empty = document.createElement('div');
                    empty.className = 'ytkit-sub-digest-empty';
                    empty.textContent = t('subscriptionDigestEmpty', 'Create subscription groups with + Group to split new-video counts by topic.');
                    list.appendChild(empty);
                }

                panel.append(head, list);
                this._toolbar.insertAdjacentElement('afterend', panel);
                this._digestPanel = panel;
            },

            _collectDeadChannelCandidates() {
                const candidates = new Map();
                document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').forEach(card => {
                    if (card.classList.contains('ytkit-sub-hidden-by-group')) return;
                    const channelId = this._extractChannelIdFromCard(card);
                    if (!channelId) return;
                    const ageDays = this._extractCardAgeDays(this._getCardMetaText(card));
                    if (ageDays === null || ageDays < this._STALE_CHANNEL_MIN_AGE_DAYS) return;
                    const current = candidates.get(channelId);
                    if (current && current.ageDays >= ageDays) return;
                    candidates.set(channelId, {
                        channelId,
                        channelName: this._extractChannelNameFromCard(card, channelId),
                        ageDays,
                        card
                    });
                });
                return Array.from(candidates.values()).sort((a, b) => b.ageDays - a.ageDays);
            },

            _renderDeadChannelMarkers(candidates = this._collectDeadChannelCandidates()) {
                const byId = new Map(candidates.map(candidate => [candidate.channelId, candidate]));
                const staged = this._readUnsubscribeStaging();
                document.querySelectorAll('.ytkit-sub-dead-badge, .ytkit-sub-staged-badge').forEach(el => el.remove());
                document.querySelectorAll('[data-ytkit-dead-channel], [data-ytkit-staged-unsubscribe]').forEach(card => {
                    card.classList.remove('ytkit-sub-dead-card', 'ytkit-sub-staged-card');
                    delete card.dataset.ytkitDeadChannel;
                    delete card.dataset.ytkitChannelAgeDays;
                    delete card.dataset.ytkitStagedUnsubscribe;
                });
                const cards = Array.from(document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer'));
                this._runCardBatch('dead-channel-markers', cards, card => {
                    const channelId = this._extractChannelIdFromCard(card);
                    if (!channelId) return;
                    const target = card.querySelector('#metadata-line, ytd-video-meta-block, #meta');
                    const candidate = byId.get(channelId);
                    if (candidate) {
                        card.classList.add('ytkit-sub-dead-card');
                        card.dataset.ytkitDeadChannel = '1';
                        card.dataset.ytkitChannelAgeDays = String(candidate.ageDays);
                        if (target) {
                            const badge = document.createElement('span');
                            badge.className = 'ytkit-sub-dead-badge';
                            badge.textContent = t('subscriptionStaleBadge', 'STALE');
                            badge.title = t(
                                'subscriptionStaleAgeTitleTpl',
                                '{days} days since the newest rendered upload on this card'
                            ).replace('{days}', candidate.ageDays);
                            target.appendChild(badge);
                        }
                    }
                    if (staged[channelId]) {
                        card.classList.add('ytkit-sub-staged-card');
                        card.dataset.ytkitStagedUnsubscribe = '1';
                        if (target) {
                            const undoDate = Number(staged[channelId].undoUntil) || 0;
                            const badge = document.createElement('span');
                            badge.className = 'ytkit-sub-staged-badge';
                            badge.textContent = t('subscriptionStagedBadge', 'STAGED');
                            badge.title = undoDate
                                ? t(
                                    'subscriptionStagedUndoTitleTpl',
                                    'Unsubscribe staged. Undo window ends {date}.'
                                ).replace('{date}', new Date(undoDate).toLocaleDateString())
                                : t('subscriptionStagedReviewTitle', 'Unsubscribe staged for review.');
                            target.appendChild(badge);
                        }
                    }
                });
                return candidates;
            },

            _stageDeadChannelUnsubscribes() {
                const candidates = this._collectDeadChannelCandidates();
                this._renderDeadChannelMarkers(candidates);
                if (!candidates.length) {
                    if (typeof showToast === 'function') {
                        showToast(t('subscriptionHealthNoStaleCards', 'No stale subscription cards found in the rendered feed.'), '#6b7280');
                    }
                    return;
                }
                const now = Date.now();
                const current = this._readUnsubscribeStaging();
                const next = { ...current };
                const stagedIds = [];
                for (const candidate of candidates) {
                    const channelId = candidate.channelId;
                    if (!channelId) continue;
                    next[channelId] = {
                        channelId,
                        channelName: candidate.channelName || channelId,
                        ageDays: candidate.ageDays,
                        stagedAt: current[channelId]?.stagedAt || now,
                        undoUntil: now + this._UNSUB_STAGE_TTL_MS,
                        reason: `${candidate.ageDays} days since newest rendered upload`,
                        source: 'dead-channel'
                    };
                    stagedIds.push(channelId);
                }
                this._writeUnsubscribeStaging(next);
                this._renderDeadChannelMarkers(candidates);
                this._renderToolbar();
                if (typeof showToast === 'function') {
                    showToast(t('subscriptionHealthStagedCountTpl', 'Staged {count} stale channels for unsubscribe review')
                        .replace('{count}', String(stagedIds.length)), '#f59e0b', {
                        duration: 8,
                        tone: 'warning',
                        action: {
                            text: 'Undo',
                            onClick: () => this._undoStagedUnsubscribes(stagedIds)
                        }
                    });
                }
            },

            _undoStagedUnsubscribes(channelIds) {
                const ids = new Set(Array.isArray(channelIds) ? channelIds : [channelIds]);
                const current = this._readUnsubscribeStaging();
                const next = { ...current };
                let removed = 0;
                for (const id of ids) {
                    if (id && next[id]) {
                        delete next[id];
                        removed++;
                    }
                }
                if (!removed) return;
                this._writeUnsubscribeStaging(next);
                this._renderDeadChannelMarkers();
                this._renderToolbar();
                if (typeof showToast === 'function') {
                    showToast(t('subscriptionHealthRemovedStagedTpl', 'Removed {count} staged unsubscribes')
                        .replace('{count}', String(removed)), '#22c55e', { duration: 4 });
                }
            },

            _readUnsubscribeLog() {
                const log = storageReadJSON(this._UNSUBSCRIBE_LOG_KEY, []);
                return Array.isArray(log)
                    ? log.filter(entry => entry && typeof entry === 'object').slice(-this._UNSUBSCRIBE_LOG_MAX)
                    : [];
            },

            _appendUnsubscribeSession(session) {
                const entries = Array.isArray(session?.entries) ? session.entries : [];
                const normalizedEntries = entries.slice(0, this._UNSUBSCRIBE_BATCH_CAP).map(entry => ({
                    channelId: String(entry?.channelId || '').slice(0, 128),
                    channelName: String(entry?.channelName || '').slice(0, 120),
                    unsubscribed: !!entry?.unsubscribed,
                    reason: String(entry?.reason || '').slice(0, 160)
                })).filter(entry => entry.channelId);
                const log = this._readUnsubscribeLog();
                log.push({
                    ts: Number(session?.ts) || Date.now(),
                    requested: Math.max(0, Number(session?.requested) || normalizedEntries.length),
                    removed: normalizedEntries.filter(entry => entry.unsubscribed).length,
                    failed: normalizedEntries.filter(entry => !entry.unsubscribed).length,
                    skippedOverCap: Math.max(0, Number(session?.skippedOverCap) || 0),
                    partial: !!session?.partial,
                    entries: normalizedEntries
                });
                while (log.length > this._UNSUBSCRIBE_LOG_MAX) log.shift();
                try { storageWriteJSON(this._UNSUBSCRIBE_LOG_KEY, log); }
                catch (e) { DebugManager.log('SubGroups', `Unsubscribe log save failed: ${e.message}`); }
            },

            _exportUnsubscribeLog() {
                const log = this._readUnsubscribeLog();
                if (!log.length) {
                    if (typeof showToast === 'function') showToast(t('subscriptionUnsubscribeLogEmpty', 'No unsubscribe sessions recorded yet.'), '#6b7280');
                    return;
                }
                handleFileExport(
                    `astra-deck-subscription-unsubscribe-log-${new Date().toISOString().slice(0, 10)}.json`,
                    JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), sessions: log }, null, 2)
                );
                if (typeof showToast === 'function') {
                    showToast(t('subscriptionUnsubscribeLogExportedTpl', 'Exported {count} unsubscribe sessions')
                        .replace('{count}', String(log.length)), '#22c55e');
                }
            },

            _getUnsubscribeControlLabel(node) {
                return [
                    node?.getAttribute?.('aria-label'),
                    node?.getAttribute?.('title'),
                    node?.getAttribute?.('data-tooltip-text'),
                    node?.dataset?.tooltipText,
                    node?.textContent
                ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            },

            _findUnsubscribeMenuItem() {
                const localizedLabel = String(t('subscriptionMenuUnsubscribe', 'Unsubscribe') || '').trim().toLowerCase();
                const items = document.querySelectorAll([
                    'ytd-menu-service-item-renderer',
                    'ytd-menu-navigation-item-renderer',
                    '[role="menuitem"]'
                ].join(','));
                return Array.from(items).find(item => {
                    if (item.getAttribute?.('aria-hidden') === 'true') return false;
                    const popup = item.closest?.('tp-yt-iron-dropdown, ytd-popup-container');
                    if (popup?.getAttribute?.('aria-hidden') === 'true') return false;
                    const iconType = String(
                        item?.data?.icon?.iconType || item?.data?.iconType || item?.getAttribute?.('data-icon-type') || ''
                    ).toUpperCase();
                    if (iconType.includes('UNSUBSCRIBE')) return true;
                    const label = this._getUnsubscribeControlLabel(item).toLowerCase();
                    return (localizedLabel && label.includes(localizedLabel)) || /\bunsubscrib(?:e|ed|ing)\b/i.test(label);
                });
            },

            _clickUnsubscribeMenuItem() {
                return new Promise(resolve => {
                    const tryClick = (attempt) => {
                        const item = this._findUnsubscribeMenuItem();
                        if (item) {
                            item.click?.();
                            resolve(true);
                            return;
                        }
                        if (attempt < 2) {
                            setTimeout(() => tryClick(attempt + 1), 250);
                            return;
                        }
                        const dropdown = document.querySelector('tp-yt-iron-dropdown[aria-hidden="false"]');
                        if (dropdown && document.body?.click) document.body.click();
                        resolve(false);
                    };
                    setTimeout(() => tryClick(0), 250);
                });
            },

            // `#confirm-button` is YouTube's GENERIC confirm id — clearing watch
            // history, deleting a playlist and discarding a comment all use it.
            // A staged session paces 25 removals over ~40s while the user can
            // still interact, so the dialog is only ever confirmed when the
            // dialog itself is about unsubscribing.
            _dialogConfirmsUnsubscribe(dialog) {
                if (!dialog) return false;
                const localizedLabel = String(t('subscriptionMenuUnsubscribe', 'Unsubscribe') || '').toLowerCase();
                const text = String(dialog.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (!text) return false;
                return (localizedLabel && text.includes(localizedLabel)) || /\bunsubscrib/i.test(text);
            },

            async _confirmUnsubscribeDialog() {
                for (let attempt = 0; attempt < 3; attempt++) {
                    const dialog = document.querySelector('ytd-confirm-dialog-renderer');
                    if (this._dialogConfirmsUnsubscribe(dialog)) {
                        // Only YouTube's own confirm id, and never a bare
                        // [role="button"]. querySelector returns the FIRST
                        // document-order match, and in dialog variants without
                        // #confirm-button that is typically Cancel — so the
                        // helper clicked Cancel, returned true, and the caller
                        // deleted the 30-day staging record for a channel that
                        // was still subscribed. Matching on the visible label
                        // is not an option either: it is translated.
                        const confirmRoot = dialog.querySelector('#confirm-button');
                        const button = confirmRoot
                            ? (confirmRoot.querySelector?.('button') || confirmRoot)
                            : null;
                        // Belt and braces: if YouTube ever nests the confirm id
                        // inside the dismiss control, refuse rather than guess.
                        if (button && button.closest?.('#cancel-button')) return false;
                        // A verification or consent surface can be open over
                        // the same popup container; answering one on the
                        // user's behalf is an account action, never a
                        // convenience. Refusing here costs one unconfirmed
                        // removal, which the caller already handles by
                        // checking the card's own subscribe control.
                        const safeToClick = globalThis.YTKitCore && globalThis.YTKitCore.isSafeToAutoClick;
                        if (button && (typeof safeToClick !== 'function' || safeToClick(button))) {
                            button.click?.();
                            return true;
                        }
                    }
                    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200));
                }
                return false;
            },

            // The control was SELECTED because its label was unsubscribe-ish, so
            // that same element losing that label is genuine positive evidence
            // the unsubscribe landed. Tested by absence rather than by matching a
            // localized "Subscribe" so it holds in every locale — note fr's
            // "S'abonner" / "Se désabonner" share a stem, which is why the
            // unsubscribe label is what gets excluded, never the subscribe one.
            _labelIndicatesUnsubscribed(label) {
                const value = String(label || '').replace(/\s+/g, ' ').trim();
                if (!value) return false;
                if (/\bunsubscrib/i.test(value) || /\bsubscribed\b/i.test(value)) return false;
                const localizedUnsubscribe = String(t('subscriptionMenuUnsubscribe', 'Unsubscribe') || '').toLowerCase();
                if (localizedUnsubscribe && value.toLowerCase().includes(localizedUnsubscribe)) return false;
                return true;
            },

            async _awaitUnsubscribedControl(control) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    if (!control?.isConnected) return false;
                    if (this._labelIndicatesUnsubscribed(this._getUnsubscribeControlLabel(control))) return true;
                    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200));
                }
                return false;
            },

            _findStagedChannelCard(channelId) {
                const cards = document.querySelectorAll([
                    'ytd-channel-renderer',
                    'ytd-subscription-card-renderer',
                    'ytd-rich-item-renderer',
                    'ytd-video-renderer'
                ].join(','));
                return Array.from(cards).find(card => this._extractChannelIdFromCard(card) === channelId) || null;
            },

            async _applyNativeUnsubscribeAction(card) {
                if (!card?.isConnected) return false;
                const controls = card.querySelectorAll?.([
                    'ytd-subscribe-button-renderer button',
                    'ytd-subscribe-button-renderer tp-yt-paper-button',
                    '#subscribe-button button',
                    '#subscribe-button tp-yt-paper-button',
                    '[data-subscription-state="subscribed"]'
                ].join(',')) || [];
                const localizedLabel = String(t('subscriptionMenuUnsubscribe', 'Unsubscribe') || '').toLowerCase();
                const control = Array.from(controls).find(candidate => {
                    const label = this._getUnsubscribeControlLabel(candidate).toLowerCase();
                    return label.includes(localizedLabel) || /\bunsubscrib(?:e|ed|ing)\b|\bsubscribed\b/i.test(label);
                });
                if (control) {
                    control.click?.();
                    // Clicking the menu item is not evidence: YouTube still shows
                    // a confirm dialog afterwards. Reporting success here deleted
                    // the 30-day recovery record for a subscription that survived.
                    const menuClicked = await this._clickUnsubscribeMenuItem();
                    const confirmed = menuClicked ? await this._confirmUnsubscribeDialog() : false;
                    if (confirmed) return true;
                    // No dialog in this flow (or it was missed) — the only other
                    // acceptable evidence is the control flipping to "Subscribe".
                    return await this._awaitUnsubscribedControl(control);
                }

                const menuButton = card.querySelector?.([
                    'ytd-menu-renderer yt-icon-button',
                    'ytd-menu-renderer button',
                    'ytd-menu-renderer [role="button"]'
                ].join(','));
                if (!menuButton) return false;
                menuButton.click?.();
                const menuClicked = await this._clickUnsubscribeMenuItem();
                if (!menuClicked) return false;
                const confirmed = await this._confirmUnsubscribeDialog();
                if (confirmed) return true;
                // Fall back to positive evidence on the card's own subscribe
                // control rather than assuming the confirm landed.
                const stateControl = card.querySelector?.([
                    'ytd-subscribe-button-renderer button',
                    'ytd-subscribe-button-renderer tp-yt-paper-button',
                    '#subscribe-button button',
                    '#subscribe-button tp-yt-paper-button'
                ].join(',')) || null;
                if (!stateControl) return false;
                return await this._awaitUnsubscribedControl(stateControl);
            },

            async _runStagedUnsubscribeSession() {
                if (this._unsubscribeRunning) {
                    if (typeof showToast === 'function') showToast(t('subscriptionUnsubscribeRunning', 'An unsubscribe session is already running.'), '#f59e0b');
                    return { requested: 0, removed: 0, failed: 0, skippedOverCap: 0, results: [], running: true };
                }
                const staged = this._readUnsubscribeStaging();
                const stagedEntries = Object.entries(staged);
                if (!stagedEntries.length) {
                    if (typeof showToast === 'function') showToast(t('subscriptionUnsubscribeEmpty', 'Nothing is staged for unsubscribe.'), '#6b7280');
                    return { requested: 0, removed: 0, failed: 0, skippedOverCap: 0, results: [] };
                }

                const picked = stagedEntries.slice(0, this._UNSUBSCRIBE_BATCH_CAP);
                const skippedOverCap = stagedEntries.length - picked.length;
                const sessionToken = this._lifecycleToken;
                const next = { ...staged };
                const results = [];
                this._unsubscribeRunning = true;
                this._unsubscribeSessionToken = sessionToken;
                try {
                    for (const [channelId, record] of picked) {
                        if (this._lifecycleToken !== sessionToken) break;
                        const card = this._findStagedChannelCard(channelId);
                        let unsubscribed = false;
                        let reason = '';
                        if (!card) {
                            reason = 'channel-card-not-rendered';
                        } else {
                            try {
                                unsubscribed = await this._applyNativeUnsubscribeAction(card);
                                if (!unsubscribed) reason = 'unsubscribe-control-not-found';
                            } catch (error) {
                                reason = String(error?.message || 'unsubscribe-action-failed').slice(0, 160);
                                DebugManager.log('SubGroups', `Unsubscribe action failed for ${channelId}: ${reason}`);
                            }
                        }
                        results.push({
                            channelId,
                            channelName: record?.channelName || channelId,
                            unsubscribed,
                            reason
                        });
                        if (unsubscribed) {
                            delete next[channelId];
                            this._writeUnsubscribeStaging(next);
                        }
                        if (this._lifecycleToken !== sessionToken) break;
                        await new Promise(resolve => setTimeout(resolve, this._UNSUBSCRIBE_PACE_MS));
                    }
                } finally {
                    if (this._unsubscribeSessionToken === sessionToken) {
                        this._unsubscribeRunning = false;
                        this._unsubscribeSessionToken = null;
                    }
                }

                const partial = this._lifecycleToken !== sessionToken;
                this._appendUnsubscribeSession({
                    ts: Date.now(),
                    requested: picked.length,
                    skippedOverCap,
                    partial,
                    entries: results
                });
                const removed = results.filter(entry => entry.unsubscribed).length;
                const failed = results.filter(entry => !entry.unsubscribed).length;
                if (partial) return { requested: picked.length, removed, failed, skippedOverCap, results, partial: true };

                this._renderDeadChannelMarkers();
                this._renderToolbar();
                const remaining = Object.keys(this._readUnsubscribeStaging()).length;
                const capNote = skippedOverCap > 0
                    ? ` ${t('subscriptionUnsubscribeCapTpl', '{count} remain staged beyond the {cap}-per-run cap.')
                        .replace('{count}', String(skippedOverCap)).replace('{cap}', String(this._UNSUBSCRIBE_BATCH_CAP))}`
                    : '';
                if (typeof showToast === 'function') {
                    showToast(t('subscriptionUnsubscribeSessionTpl', '{removed} unsubscribed, {failed} unchanged; {remaining} remain staged.')
                        .replace('{removed}', String(removed))
                        .replace('{failed}', String(failed))
                        .replace('{remaining}', String(remaining)) + capNote,
                    removed ? '#22c55e' : '#f59e0b', { duration: 8, tone: removed ? 'success' : 'warning' });
                }
                return { requested: picked.length, removed, failed, skippedOverCap, results, remaining };
            },

            _parseCompactViewCount(text) {
                // Canonical implementation lives in core/text-metrics.js.
                const fn = globalThis.YTKitCore && globalThis.YTKitCore.parseCompactCount;
                return fn ? fn(text, 0) : 0;
            },

            // The stamp below describes ONE video. Cards are recycled by
            // continuations, so the stamp has to name what it was made for or
            // "restore YouTube's order" restores an order that no longer
            // corresponds to anything.
            _cardVideoId(card) {
                const href = card.querySelector('a#thumbnail[href], a[href*="/watch?v="]')?.getAttribute?.('href') || '';
                const match = /[?&]v=([A-Za-z0-9_-]{11})/.exec(href);
                return match ? match[1] : '';
            },

            _applySort(modeOverride) {
                const mode = this._normalizeSubscriptionSortMode(modeOverride || this._getActiveSortMode());
                const container = document.querySelector('ytd-rich-grid-renderer #contents, ytd-section-list-renderer #contents');
                if (!container) return;
                const cards = Array.from(container.querySelectorAll(':scope > ytd-rich-item-renderer, :scope > ytd-video-renderer'));
                if (!cards.length) return;
                if (mode === 'default') {
                    // Restore YouTube's native order. Cards carry an original
                    // index stamped before the first re-append; without this,
                    // switching back to 'default' kept the previous mode's DOM
                    // order until the next navigation.
                    const stamped = cards.filter(card => card.dataset.ytkitOrigIdx !== undefined);
                    if (!stamped.length) return;
                    cards.sort((a, b) =>
                        (Number(a.dataset.ytkitOrigIdx) || 0) - (Number(b.dataset.ytkitOrigIdx) || 0));
                    const frag = document.createDocumentFragment();
                    cards.forEach(card => frag.appendChild(card));
                    container.appendChild(frag);
                    return;
                }
                // Stamp original DOM order once per card so 'default' can be
                // restored later. Cards rendered after a sort get appended
                // after the highest existing stamp (their native position).
                let nextOrigIdx = cards.reduce((max, card) => {
                    const idx = Number(card.dataset.ytkitOrigIdx);
                    return Number.isFinite(idx) && idx >= max ? idx + 1 : max;
                }, 0);
                cards.forEach(card => {
                    const videoId = this._cardVideoId(card);
                    if (card.dataset.ytkitOrigIdx !== undefined && card.dataset.ytkitOrigId === videoId) return;
                    // Either never stamped, or recycled into a different
                    // video. A recycled card arrived with a continuation, so
                    // the end of the native order is where it belongs.
                    card.dataset.ytkitOrigIdx = String(nextOrigIdx++);
                    card.dataset.ytkitOrigId = videoId;
                });
                const lastVisit = mode === 'new-since-last-visit' ? this._readLastVisit() : null;
                const score = (card) => {
                    const text = card.textContent || '';
                    if (mode === 'newest-loaded') {
                        const age = globalThis.YTKitFeatures?.subscriptionView?.extractLoadedAgeMs?.(card);
                        return age == null ? Number.POSITIVE_INFINITY : age;
                    }
                    if (mode === 'duration-asc') {
                        // Prefer the duration badge (classic renderer + newer
                        // lockup badge-shape surfaces) so a title timestamp
                        // ("10:30") can't be mistaken for runtime.
                        const badge = card.querySelector('ytd-thumbnail-overlay-time-status-renderer #text, ytd-thumbnail-overlay-time-status-renderer, yt-thumbnail-badge-view-model, .badge-shape__text, .yt-badge-shape__text');
                        const source = badge?.textContent || text;
                        // Whole-card text fallback: take the LAST duration-shaped
                        // match — titles precede the badge in text order.
                        const matches = badge?.textContent
                            ? [source.match(/(\d+):(\d+)(?::(\d+))?/)].filter(Boolean)
                            : Array.from(source.matchAll(/(\d+):(\d+)(?::(\d+))?/g));
                        const m = matches.length ? matches[matches.length - 1] : null;
                        if (!m) return Number.POSITIVE_INFINITY;
                        // Score in SECONDS for both MM:SS and HH:MM:SS — the old
                        // formula mixed units and sorted long videos wrong.
                        return m[3] !== undefined
                            ? (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)
                            : (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
                    }
                    if (mode === 'unwatched') {
                        return card.querySelector('ytd-thumbnail-overlay-resume-playback-renderer') ? 1 : 0;
                    }
                    if (mode === 'date-desc') {
                        // Keep YouTube's native order; this is the upstream sort.
                        return 0;
                    }
                    if (mode === 'new-since-last-visit') {
                        const channelId = this._extractChannelIdFromCard(card);
                        return this._isCardNewSinceLastVisit(card, channelId, lastVisit) ? 0 : 1;
                    }
                    if (mode === 'popular') {
                        // v3.29 deferred: heuristic popularity = view count desc.
                        // Reads the card's metadata-line text; falls back to 0
                        // when YouTube hasn't hydrated the count yet.
                        const meta = card.querySelector('#metadata-line, ytd-video-meta-block, [aria-label*="view"]');
                        const views = this._parseCompactViewCount(`${meta?.textContent || ''} ${meta?.getAttribute?.('aria-label') || ''}`);
                        return -views;  // higher view count → lower score → earlier in DOM
                    }
                    return 0;
                };
                cards.sort((a, b) => {
                    const left = score(a);
                    const right = score(b);
                    if (left !== right) {
                        if (!Number.isFinite(left)) return 1;
                        if (!Number.isFinite(right)) return -1;
                        return left - right;
                    }
                    return (Number(a.dataset.ytkitOrigIdx) || 0) - (Number(b.dataset.ytkitOrigIdx) || 0);
                });
                const sortFrag = document.createDocumentFragment();
                cards.forEach(card => sortFrag.appendChild(card));
                container.appendChild(sortFrag);
            },

            _readAiTagData() {
                const data = appState?.settings?.subscriptionAiTagData;
                return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
            },

            _writeAiTagData(next) {
                appState.settings.subscriptionAiTagData = next;
                try { settingsManager.save(appState.settings); }
                catch (e) { DebugManager.log('SubGroups', `AI tag save failed: ${e.message}`); }
            },

            async _archiveActiveGroup() {
                const groups = this._readGroups();
                const group = this._activeGroupId && groups[this._activeGroupId];
                const channelIds = Array.from(new Set(group?.channelIds || []))
                    .map(id => String(id || '').trim())
                    .filter(id => /^[A-Za-z0-9_-]{1,80}$/.test(id))
                    .slice(0, 100);
                if (!channelIds.length) {
                    showToast(t('subscriptionArchiveNoChannels', 'Add channels to this group before scheduling downloads.'), '#f59e0b');
                    return;
                }
                if (!MediaDLManager?.check || !MediaDLManager?.baseUrl || typeof extensionFetchJson !== 'function') {
                    showToast(t('subscriptionArchiveUnavailable', 'The Astra Downloader companion is not available.'), '#f59e0b');
                    return;
                }
                let status;
                try {
                    status = await MediaDLManager.check();
                } catch (error) {
                    DebugManager.log('SubGroups', `Companion subscription check failed: ${error.message}`);
                    showToast(t('subscriptionArchiveUnavailable', 'The Astra Downloader companion is not available.'), '#f59e0b');
                    return;
                }
                if (!status?.ok || !status.token) {
                    showToast(t('subscriptionArchiveStartCompanion', 'Start Astra Downloader before scheduling channel downloads.'), '#f59e0b');
                    return;
                }
                let added = 0;
                let existing = 0;
                for (const channelId of channelIds) {
                    try {
                        await extensionFetchJson({
                            method: 'POST',
                            url: `${MediaDLManager.baseUrl()}/subscriptions`,
                            headers: MediaDLManager._headers?.({
                                'Content-Type': 'application/json',
                                'X-Auth-Token': status.token,
                            }) || {
                                'Content-Type': 'application/json',
                                'X-Auth-Token': status.token,
                            },
                            data: JSON.stringify({
                                url: `https://www.youtube.com/channel/${channelId}`,
                                intervalMinutes: 60,
                            }),
                        });
                        added++;
                    } catch (error) {
                        if (error?.response?.status === 409) existing++;
                        else DebugManager.log('SubGroups', `Companion subscription request failed: ${error.message}`);
                    }
                }
                const archiveMessage = `${t('subscriptionArchiveAdded', 'Scheduled')} ${added} · ${t('subscriptionArchiveExisting', 'already configured')} ${existing}`;
                showToast(archiveMessage, added ? '#22c55e' : '#f59e0b', { duration: 6 });
            },

            async _generateAiTagsForGroup(groupId) {
                if (!appState?.settings?.subscriptionAiTags) {
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionAiTagsRequired',
                        'Enable "AI Tags For Subscription Groups" first.'
                    ), '#f59e0b');
                    return;
                }
                const groups = this._readGroups();
                const group = groups[groupId];
                if (!group) return;
                // Reuse Chrome's built-in Summarizer when available — same
                // never-fall-through-to-remote contract as localAiSummary.
                const factory = window.Summarizer || window.ai?.summarizer;
                if (!factory?.create) {
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionSummarizerUnavailable',
                        'Local Summarizer not available; enable the Chrome AI origin trial.'
                    ), '#f59e0b');
                    return;
                }
                if (typeof showToast === 'function') showToast(t(
                    'subscriptionAiTagsGeneratingTpl',
                    'Generating tags for "{group}"…'
                ).replace('{group}', group.name || groupId), '#7c3aed', { duration: 6 });
                // Gather titles from the rendered subscription feed cards for
                // channels in this group. Title-only — never transcripts here.
                const allowed = this._getGroupChannelIdSet(groupId, groups);
                const titles = [];
                document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').forEach(card => {
                    const id = this._extractChannelIdFromCard(card);
                    if (!id || !allowed.has(id)) return;
                    const t = (card.querySelector('#video-title, [id="video-title"]')?.textContent || '').trim();
                    if (t) titles.push(t);
                });
                if (!titles.length) {
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionAiTagsNoCards',
                        'No matching cards rendered yet — scroll the feed and try again.'
                    ), '#f59e0b');
                    return;
                }
                const summary = titles.slice(0, 40).join('\n');
                let tags = [];
                try {
                    const summarizer = await factory.create({ type: 'key-points', length: 'short', format: 'plain-text' });
                    const output = await summarizer.summarize(`Suggest 5 single-word topic tags (lowercase, comma-separated) for this list of YouTube titles:\n\n${summary}`);
                    summarizer.destroy?.();
                    tags = String(output || '')
                        .replace(/^[\s\S]*?(?=\b)/, '')
                        .split(/[,\n]/)
                        .map(s => s.trim().toLowerCase().replace(/[^a-z0-9\- ]+/g, ''))
                        .filter(s => s && s.length <= 24)
                        .slice(0, 8);
                } catch (e) {
                    DebugManager.log('SubGroups', `AI tag generation failed: ${e.message}`);
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionAiTagsGenerationFailedTpl',
                        'Tag generation failed: {error}'
                    ).replace('{error}', e.message), '#ef4444');
                    return;
                }
                if (!tags.length) {
                    if (typeof showToast === 'function') showToast(t(
                        'subscriptionAiTagsNoUsable',
                        'Summarizer returned no usable tags.'
                    ), '#f59e0b');
                    return;
                }
                const next = { ...this._readAiTagData(), [groupId]: { tags, generatedAt: Date.now() } };
                this._writeAiTagData(next);
                if (typeof showToast === 'function') showToast(t(
                    'subscriptionAiTagsTaggedTpl',
                    'Tagged "{group}": {tags}'
                ).replace('{group}', group.name || groupId).replace('{tags}', tags.join(', ')), '#22c55e', { duration: 6 });
                this._renderToolbar();
            },

            _showNewGroupDialog(anchorEl, parentId = '') {
                // Audit-pass replacement for window.prompt — modal blocks the
                // page, ships unstyled, and is deprecated in some contexts.
                // This inline dialog reuses Astra surface CSS, focus-traps to
                // the input, and dismisses on Esc / outside click.
                const groups = this._readGroups();
                const safeParentId = this._normalizeNewGroupParentId(parentId, groups);
                document.querySelector('.ytkit-sub-group-dialog')?.remove();
                const overlay = document.createElement('div');
                overlay.className = 'ytkit-sub-group-dialog';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');
                overlay.setAttribute('aria-label', safeParentId
                    ? t('subscriptionCreateSubgroupDialogAria', 'Create subscription subgroup')
                    : t('subscriptionCreateGroupDialogAria', 'Create subscription group'));
                const card = document.createElement('div');
                card.className = 'ytkit-sub-group-dialog__card';
                const h = document.createElement('div');
                h.className = 'ytkit-sub-group-dialog__title';
                h.textContent = safeParentId
                    ? t('subscriptionSubgroupNameTpl', 'Name a subgroup under {group}')
                        .replace('{group}', groups[safeParentId]?.name || safeParentId)
                    : t('subscriptionGroupDialogTitle', 'Name this group');
                const input = document.createElement('input');
                input.className = 'ytkit-sub-group-dialog__input';
                input.type = 'text';
                input.maxLength = 80;
                input.placeholder = safeParentId
                    ? t('subscriptionSubgroupPlaceholder', 'e.g. Frontend, DevOps, Jazz')
                    : t('subscriptionGroupPlaceholder', 'e.g. Coding, Music, News');
                input.setAttribute('aria-label', t('subscriptionGroupNameAria', 'Group name'));
                const actions = document.createElement('div');
                actions.className = 'ytkit-sub-group-dialog__actions';
                const cancel = document.createElement('button');
                cancel.className = 'ytkit-sub-group-dialog__button';
                cancel.type = 'button';
                cancel.textContent = t('subscriptionDialogCancel', 'Cancel');
                const create = document.createElement('button');
                create.className = 'ytkit-sub-group-dialog__button ytkit-sub-group-dialog__button--primary';
                create.type = 'button';
                create.textContent = t('subscriptionDialogCreate', 'Create');
                actions.append(cancel, create);
                card.append(h, input, actions);
                overlay.appendChild(card);
                document.body.appendChild(overlay);
                setTimeout(() => input.focus(), 30);

                const dismiss = () => {
                    overlay.remove();
                    if (anchorEl?.focus) try { anchorEl.focus(); } catch { /* reason: focus restore is best-effort */ }
                };
                const submit = () => {
                    const name = (input.value || '').trim().slice(0, 80);
                    if (!name) { input.focus(); return; }
                    const id = 'g_' + Math.random().toString(36).slice(2, 9);
                    const next = {
                        ...this._readGroups(),
                        [id]: {
                            name,
                            color: '#7c3aed',
                            channelIds: [],
                            parentId: safeParentId,
                            sortMode: this._getActiveSortMode(),
                            updatedAt: Date.now()
                        }
                    };
                    this._writeGroups(next);
                    dismiss();
                    this._renderToolbar();
                };
                cancel.addEventListener('click', dismiss);
                create.addEventListener('click', submit);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submit(); }
                });
                overlay.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
                });
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) dismiss();
                });
            },

            _renderToolbar() {
                const target = document.querySelector('ytd-rich-grid-renderer, ytd-section-list-renderer');
                if (!target || !target.parentElement) return;
                const hadDigestPanel = Boolean(this._digestPanel);
                const hadHealthPanel = Boolean(this._healthPanel);
                this._closeDigestPanel();
                this._closeHealthPanel();
                this._closeMembersPanel();
                this._toolbar?.remove();
                const bar = document.createElement('div');
                bar.className = 'ytkit-sub-toolbar';
                bar.setAttribute('role', 'toolbar');
                bar.setAttribute('aria-label', t('subscriptionToolbarAria', 'Subscription group controls'));

                const groupLabel = document.createElement('span');
                groupLabel.className = 'ytkit-sub-toolbar__label';
                groupLabel.textContent = t('subscriptionToolbarGroups', 'Groups');
                bar.appendChild(groupLabel);

                const groups = this._readGroups();
                const stagedUnsubscribes = this._readUnsubscribeStaging();
                const allChip = document.createElement('button');
                allChip.type = 'button';
                allChip.className = 'ytkit-sub-group-chip';
                allChip.dataset.active = this._activeGroupId ? '0' : '1';
                allChip.textContent = t('commonAll', 'All');
                allChip.setAttribute('aria-pressed', String(!this._activeGroupId));
                allChip.setAttribute('aria-label', t('subscriptionToolbarAllAria', 'Show all subscriptions'));
                allChip.addEventListener('click', () => {
                    this._activeGroupId = '';
                    this._renderToolbar();
                    this._applyGroupFilter();
                    this._applySort();
                    this._renderDeadChannelMarkers();
                });
                bar.appendChild(allChip);

                const aiTagData = this._readAiTagData();
                const renderGroupChip = (id) => {
                    const group = groups[id];
                    if (!group) return;
                    const depth = this._getGroupParentId(id, groups) ? 1 : 0;
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'ytkit-sub-group-chip';
                    chip.dataset.active = this._activeGroupId === id ? '1' : '0';
                    chip.setAttribute('aria-pressed', String(this._activeGroupId === id));
                    chip.dataset.depth = String(depth);
                    chip.style.borderColor = group.color || '#7c3aed';
                    const groupName = group.name || id;
                    const tagSuffix = aiTagData[id]?.tags?.length ? ` · ${aiTagData[id].tags.slice(0, 3).join(' ')}` : '';
                    const prefix = depth ? '- ' : '';
                    const channelCount = group.channelIds?.length || 0;
                    chip.textContent = t(
                        'subscriptionGroupChipTpl',
                        '{prefix}{name} ({count}){tags}'
                    ).replace('{prefix}', prefix).replace('{name}', groupName)
                        .replace('{count}', channelCount).replace('{tags}', tagSuffix);
                    const channelLabel = channelCount === 1
                        ? t('subscriptionChannelSingular', 'channel')
                        : t('subscriptionChannelPlural', 'channels');
                    const subgroupSuffix = depth ? t('subscriptionSubgroupSuffix', '. Subgroup') : '';
                    chip.setAttribute('aria-label', t(
                        'subscriptionGroupChipAriaTpl',
                        '{name}. {count} {channels}{subgroup}'
                    ).replace('{name}', groupName).replace('{count}', channelCount)
                        .replace('{channels}', channelLabel).replace('{subgroup}', subgroupSuffix));
                    if (aiTagData[id]?.tags?.length) {
                        chip.title = t(
                            'subscriptionAiTagsRegenerateTitleTpl',
                            'AI tags: {tags} · Shift+click to regenerate'
                        ).replace('{tags}', aiTagData[id].tags.join(', '));
                    } else if (appState?.settings?.subscriptionAiTags) {
                        chip.title = t('subscriptionAiTagsGenerateTitle', 'Shift+click to generate AI tags');
                    }
                    chip.addEventListener('click', (e) => {
                        if (e.shiftKey && appState?.settings?.subscriptionAiTags) {
                            e.preventDefault();
                            this._generateAiTagsForGroup(id);
                            return;
                        }
                        this._activeGroupId = this._activeGroupId === id ? '' : id;
                        this._renderToolbar();
                        this._applyGroupFilter();
                        this._applySort();
                        this._renderDeadChannelMarkers();
                    });
                    bar.appendChild(chip);
                };

                for (const id of this._getTopLevelGroupIds(groups)) {
                    renderGroupChip(id);
                    for (const childId of this._getChildGroupIds(id, groups)) renderGroupChip(childId);
                }

                const newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.textContent = t('subscriptionToolbarNewGroup', '+ Group');
                newBtn.setAttribute('aria-label', t('subscriptionToolbarNewGroupAria', 'Create subscription group'));
                newBtn.addEventListener('click', () => this._showNewGroupDialog(newBtn));
                bar.appendChild(newBtn);

                if (this._activeGroupId && groups[this._activeGroupId] && !this._getGroupParentId(this._activeGroupId, groups)) {
                    const subBtn = document.createElement('button');
                    subBtn.type = 'button';
                    subBtn.textContent = t('subscriptionToolbarNewSubgroup', '+ Subgroup');
                    subBtn.setAttribute('aria-label', t('subscriptionToolbarNewSubgroupAria', 'Create subscription subgroup'));
                    subBtn.addEventListener('click', () => this._showNewGroupDialog(subBtn, this._activeGroupId));
                    bar.appendChild(subBtn);
                }

                if (this._activeGroupId && groups[this._activeGroupId]) {
                    const activeGroupId = this._activeGroupId;
                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.dataset.action = 'edit-channels';
                    editBtn.textContent = t('subscriptionToolbarEditChannels', 'Edit Channels');
                    editBtn.setAttribute('aria-label', t(
                        'subscriptionMembersRegionAriaTpl',
                        'Edit channels in {group}'
                    ).replace('{group}', groups[activeGroupId].name || activeGroupId));
                    editBtn.setAttribute('aria-haspopup', 'dialog');
                    editBtn.addEventListener('click', () => this._toggleMembersPanel(activeGroupId));
                    bar.appendChild(editBtn);

                    const playBtn = document.createElement('button');
                    playBtn.type = 'button';
                    playBtn.dataset.action = 'play-all';
                    playBtn.textContent = t('subscriptionToolbarPlayAll', 'Play All');
                    playBtn.setAttribute('aria-label', t(
                        'subscriptionToolbarPlayAllAriaTpl',
                        'Play all videos from {group}'
                    ).replace('{group}', groups[activeGroupId].name || activeGroupId));
                    playBtn.addEventListener('click', () => this._playGroupAsQueue(activeGroupId));
                    bar.appendChild(playBtn);

                    const archiveBtn = document.createElement('button');
                    archiveBtn.type = 'button';
                    archiveBtn.dataset.action = 'archive-group';
                    archiveBtn.textContent = t('subscriptionToolbarArchive', 'Auto-download');
                    archiveBtn.setAttribute('aria-label', t('subscriptionToolbarArchiveAriaTpl', 'Schedule new uploads from {group}').replace('{group}', groups[activeGroupId].name || activeGroupId));
                    archiveBtn.title = t('subscriptionToolbarArchiveTitle', 'Schedule this group in Astra Downloader. Existing uploads are deduplicated by the companion archive.');
                    archiveBtn.addEventListener('click', () => this._archiveActiveGroup());
                    bar.appendChild(archiveBtn);
                }

                const sortLabel = document.createElement('span');
                sortLabel.className = 'ytkit-sub-toolbar__label';
                sortLabel.textContent = t('subscriptionToolbarSort', 'Sort');
                bar.appendChild(sortLabel);

                const sortSelect = document.createElement('select');
                sortSelect.setAttribute('aria-label', t('subscriptionToolbarSortAria', 'Sort subscriptions'));
                const activeSortMode = this._getActiveSortMode(groups);
                const sortOptions = [
                    ['default', 'YouTube default'],
                    ['date-desc', 'Latest first'],
                    ['duration-asc', 'Shortest first'],
                    ['unwatched', 'Unwatched first'],
                    ['new-since-last-visit', 'New since last visit'],
                    ['popular', 'Most popular (views)']
                ];
                if (globalThis.YTKitFeatures?.subscriptionView?.extractLoadedAgeMs) {
                    sortOptions.splice(1, 0, ['newest-loaded', t('subscriptionOrderNewestLoaded', 'Newest first (loaded only)')]);
                    sortSelect.setAttribute('aria-description', t('subscriptionLoadedOnlyHint', 'Newest first sorts only videos loaded on this page. Scroll to load more.'));
                }
                for (const [v, label] of sortOptions) {
                    const opt = document.createElement('option');
                    opt.value = v; opt.textContent = label;
                    if (activeSortMode === v) opt.selected = true;
                    sortSelect.appendChild(opt);
                }
                sortSelect.addEventListener('change', () => {
                    const mode = this._setActiveSortMode(sortSelect.value);
                    this._applySort(mode);
                    this._renderDeadChannelMarkers();
                });
                bar.appendChild(sortSelect);

                const healthBtn = document.createElement('button');
                healthBtn.type = 'button';
                healthBtn.dataset.action = 'health';
                const healthStagedCount = Object.keys(stagedUnsubscribes).length;
                healthBtn.textContent = healthStagedCount > 0
                    ? t('subscriptionToolbarHealthCountTpl', 'Health ({count})').replace('{count}', String(healthStagedCount))
                    : t('subscriptionToolbarHealth', 'Health');
                healthBtn.title = t('subscriptionToolbarHealthTitle', 'Stale channels, staged unsubscribes, new-video counts, and exports in one panel.');
                healthBtn.setAttribute('aria-label', t('subscriptionHealthOpenAria', 'Open the subscription health center'));
                healthBtn.addEventListener('click', () => this._toggleHealthPanel());
                bar.appendChild(healthBtn);

                const digestBtn = document.createElement('button');
                digestBtn.type = 'button';
                digestBtn.dataset.action = 'digest';
                digestBtn.textContent = t('subscriptionToolbarDigest', 'Digest');
                digestBtn.setAttribute('aria-label', t('subscriptionDigestOpenAria', 'Open group notifications digest'));
                digestBtn.addEventListener('click', () => this._toggleDigestPanel());
                bar.appendChild(digestBtn);

                const exportBtn = document.createElement('button');
                exportBtn.type = 'button';
                exportBtn.dataset.action = 'export';
                exportBtn.textContent = t('commonExport', 'Export');
                exportBtn.setAttribute('aria-label', t('subscriptionExportJsonAria', 'Export subscription groups as JSON'));
                exportBtn.addEventListener('click', () => this._exportGroups());
                bar.appendChild(exportBtn);

                const csvBtn = document.createElement('button');
                csvBtn.type = 'button';
                csvBtn.dataset.action = 'export-csv';
                csvBtn.textContent = t('subscriptionExportCsvLabel', 'CSV');
                csvBtn.setAttribute('aria-label', t('subscriptionExportCsvAria', 'Export subscription groups as CSV'));
                csvBtn.addEventListener('click', () => this._exportGroupsCsv());
                bar.appendChild(csvBtn);

                const opmlBtn = document.createElement('button');
                opmlBtn.type = 'button';
                opmlBtn.dataset.action = 'export-opml';
                opmlBtn.textContent = t('subscriptionExportOpmlLabel', 'OPML');
                opmlBtn.setAttribute('aria-label', t('subscriptionExportOpmlAria', 'Export subscription groups as OPML'));
                opmlBtn.addEventListener('click', () => this._exportGroupsOpml());
                bar.appendChild(opmlBtn);

                const importBtn = document.createElement('button');
                importBtn.type = 'button';
                importBtn.textContent = t('commonImport', 'Import');
                importBtn.setAttribute('aria-label', t('subscriptionImportAria', 'Import subscription groups'));
                importBtn.title = t(
                    'subscriptionImportTitle',
                    'Import subscription groups (merges with your groups; Shift+click replaces them)'
                );
                importBtn.addEventListener('click', (event) => {
                    // Import merges by default. Replacing every group is the
                    // destructive path, so it takes a deliberate Shift+click.
                    const mode = event.shiftKey ? 'replace' : 'merge';
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = 'application/json,.json,.opml,.xml,application/xml,text/xml,text/x-opml';
                    inp.addEventListener('change', () => {
                        const file = inp.files?.[0];
                        if (!file) return;
                        file.text().then(text => {
                            const name = String(file.name || '').toLowerCase();
                            if (name.endsWith('.opml') || name.endsWith('.xml') || /^\s*<\?xml|^\s*<opml/i.test(text)) {
                                this._importGroupsOpml(text, { mode });
                            } else {
                                this._importGroups(text, { mode });
                            }
                        });
                    });
                    inp.click();
                });
                bar.appendChild(importBtn);

                const staleLabel = document.createElement('span');
                staleLabel.className = 'ytkit-sub-toolbar__label';
                staleLabel.textContent = t('subscriptionToolbarStale', 'Stale');
                bar.appendChild(staleLabel);

                const scanBtn = document.createElement('button');
                scanBtn.type = 'button';
                scanBtn.dataset.action = 'scan-stale';
                scanBtn.textContent = t('subscriptionToolbarScanStale', 'Scan Stale');
                scanBtn.setAttribute('aria-label', t('subscriptionToolbarScanStaleAria', 'Scan rendered subscriptions for stale channels'));
                scanBtn.addEventListener('click', () => {
                    const candidates = this._renderDeadChannelMarkers();
                    if (typeof showToast === 'function') {
                        showToast(t('subscriptionToolbarStaleFlaggedTpl', '{count} stale channels flagged')
                            .replace('{count}', String(candidates.length)), candidates.length ? '#f59e0b' : '#6b7280', {
                            duration: 5,
                            tone: candidates.length ? 'warn' : 'neutral'
                        });
                    }
                });
                bar.appendChild(scanBtn);

                const stageBtn = document.createElement('button');
                stageBtn.type = 'button';
                stageBtn.dataset.action = 'stage-unsubscribe';
                stageBtn.textContent = t('subscriptionToolbarStageStale', 'Stage Stale');
                stageBtn.title = t('subscriptionToolbarStageStaleTitle', 'Stage rendered stale channels for review. No YouTube unsubscribe buttons are clicked.');
                stageBtn.setAttribute('aria-label', t('subscriptionToolbarStageStaleAria', 'Stage rendered stale channels for unsubscribe review'));
                stageBtn.addEventListener('click', () => this._stageDeadChannelUnsubscribes());
                bar.appendChild(stageBtn);

                const stagedCount = Object.keys(stagedUnsubscribes).length;
                if (stagedCount > 0) {
                    const undoStageBtn = document.createElement('button');
                    undoStageBtn.type = 'button';
                    undoStageBtn.dataset.action = 'undo-staged-unsubscribe';
                    undoStageBtn.textContent = t('subscriptionToolbarUndoStagedTpl', 'Undo Staged ({count})')
                        .replace('{count}', String(stagedCount));
                    undoStageBtn.setAttribute('aria-label', t('subscriptionToolbarUndoStagedAriaTpl', 'Undo {count} staged unsubscribe items')
                        .replace('{count}', String(stagedCount)));
                    undoStageBtn.addEventListener('click', () => this._undoStagedUnsubscribes(Object.keys(this._readUnsubscribeStaging())));
                    bar.appendChild(undoStageBtn);

                    const unsubscribeBtn = document.createElement('button');
                    unsubscribeBtn.type = 'button';
                    unsubscribeBtn.dataset.action = 'unsubscribe-staged';
                    unsubscribeBtn.textContent = t('subscriptionUnsubscribeRunTpl', 'Unsubscribe staged ({count})')
                        .replace('{count}', String(stagedCount));
                    unsubscribeBtn.setAttribute('aria-label', t('subscriptionUnsubscribeRunAriaTpl', 'Unsubscribe up to {count} staged channels in this bounded session')
                        .replace('{count}', String(this._UNSUBSCRIBE_BATCH_CAP)));
                    unsubscribeBtn.title = t('subscriptionUnsubscribeRunTitleTpl', 'Apply YouTube unsubscribe only to the staged review list, up to {count} channels at 400 ms pacing.')
                        .replace('{count}', String(this._UNSUBSCRIBE_BATCH_CAP));
                    unsubscribeBtn.disabled = this._unsubscribeRunning;
                    unsubscribeBtn.addEventListener('click', () => { void this._runStagedUnsubscribeSession(); });
                    bar.appendChild(unsubscribeBtn);
                }

                if (this._readUnsubscribeLog().length > 0) {
                    const exportUnsubscribeLogBtn = document.createElement('button');
                    exportUnsubscribeLogBtn.type = 'button';
                    exportUnsubscribeLogBtn.dataset.action = 'export-unsubscribe-log';
                    exportUnsubscribeLogBtn.textContent = t('subscriptionUnsubscribeLogButton', 'Unsubscribe log');
                    exportUnsubscribeLogBtn.setAttribute('aria-label', t('subscriptionUnsubscribeLogAria', 'Export the local unsubscribe session log as JSON'));
                    exportUnsubscribeLogBtn.addEventListener('click', () => this._exportUnsubscribeLog());
                    bar.appendChild(exportUnsubscribeLogBtn);
                }

                target.parentElement.insertBefore(bar, target);
                this._toolbar = bar;
                if (hadDigestPanel) this._renderDigestPanel();
                if (hadHealthPanel) this._renderHealthPanel();
            },

            init() {
                // No init-level pathname guard: the settings-panel 'toggle'
                // path calls initFeatureLifecycle from ANY page and marks
                // _initialized unconditionally, so an early return here left
                // the feature permanently inert (the page tracker skips init
                // because _initialized is already true). The navigate rule and
                // every deferred callback below re-check the path themselves.
                this._lifecycleToken += 1;
                this._unsubscribeRunning = false;
                this._unsubscribeSessionToken = null;
                this._ensureStyles();
                this._navRule = () => {
                    if (window.location.pathname !== '/feed/subscriptions') {
                        this._lifecycleToken += 1;
                        this._cancelAllBudgetedScans();
                        return;
                    }
                    this._lifecycleToken += 1;
                    // Track + clear these so a navigation away within the delay
                    // can't fire them on the wrong page. The 8s _stampLastVisit
                    // in particular would otherwise stamp lastVisit for whatever
                    // cards are showing (e.g. Home), corrupting NEW-badge state.
                    if (this._renderTimer) clearTimeout(this._renderTimer);
                    if (this._stampTimer) clearTimeout(this._stampTimer);
                    this._renderTimer = setTimeout(() => {
                        this._renderTimer = null;
                        if (window.location.pathname !== '/feed/subscriptions') return;
                        this._renderToolbar();
                        this._applyGroupFilter();
                        this._applyContentTypeFilter();
                        this._applyNewSinceMarkers();
                        this._renderDeadChannelMarkers();
                        this._applySort();
                    }, 1200);
                    // Freeze the pre-stamp map for this pageview: markers and
                    // digest re-renders keep using it after the 8s stamp so
                    // badges survive the whole visit.
                    this._sessionLastVisit = this._readLastVisit();
                    this._stampTimer = setTimeout(() => {
                        this._stampTimer = null;
                        if (window.location.pathname !== '/feed/subscriptions') return;
                        this._stampLastVisit();
                    }, 8000);
                };
                addNavigateRule(this.id, this._navRule);
                addScopedMutationRule(this.id, 'ytd-rich-item-renderer, ytd-video-renderer', () => {
                    if (window.location.pathname !== '/feed/subscriptions') return;
                    this._applyGroupFilter();
                    // Infinite-scroll cards were group-filtered but never
                    // live/streamed-filtered until the next navigation.
                    this._applyContentTypeFilter();
                    this._applyNewSinceMarkers();
                    this._renderDeadChannelMarkers();
                    if (this._digestPanel) this._renderDigestPanel();
                });
                this._navRule();
            },

            destroy() {
                this._lifecycleToken += 1;
                this._unsubscribeRunning = false;
                this._unsubscribeSessionToken = null;
                this._sessionLastVisit = null;
                removeNavigateRule(this.id);
                removeScopedMutationRule(this.id);
                this._cancelAllBudgetedScans();
                if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
                if (this._stampTimer) { clearTimeout(this._stampTimer); this._stampTimer = null; }
                this._navRule = null;
                this._closeDigestPanel();
                this._closeHealthPanel();
                this._closeMembersPanel();
                document.querySelectorAll('.ytkit-sub-group-empty').forEach(el => el.remove());
                this._toolbar?.remove();
                this._toolbar = null;
                document.querySelectorAll('.ytkit-sub-hidden-by-group').forEach(el => el.classList.remove('ytkit-sub-hidden-by-group'));
                document.querySelectorAll('.ytkit-sub-hidden-by-type').forEach(el => el.classList.remove('ytkit-sub-hidden-by-type'));
                document.querySelectorAll('.ytkit-sub-new-badge').forEach(el => el.remove());
                document.querySelectorAll('.ytkit-sub-dead-badge, .ytkit-sub-staged-badge').forEach(el => el.remove());
                document.querySelectorAll('[data-ytkit-dead-channel], [data-ytkit-staged-unsubscribe]').forEach(el => {
                    el.classList.remove('ytkit-sub-dead-card', 'ytkit-sub-staged-card');
                    delete el.dataset.ytkitDeadChannel;
                    delete el.dataset.ytkitChannelAgeDays;
                    delete el.dataset.ytkitStagedUnsubscribe;
                });
                document.querySelectorAll('[data-ytkit-orig-idx]').forEach(el => { delete el.dataset.ytkitOrigIdx; delete el.dataset.ytkitOrigId; });
                // Audit pass: kill any orphan new-group dialog so it can't outlive the feature.
                document.querySelector('.ytkit-sub-group-dialog')?.remove();
                this._styleElement?.remove();
                this._styleElement = null;
                this._activeGroupId = '';
            },

            // ── Group membership editor (NF: Edit Channels) ──
            // Kept below the lifecycle methods: the hardening suite pins
            // toolbar/digest/lifecycle behavior inside a fixed-size slice
            // of this feature block.
            _renderGroupEmptyState(allowed) {
                document.querySelectorAll('.ytkit-sub-group-empty').forEach(el => el.remove());
                // Only an EMPTY group warrants the notice — it hides the whole
                // feed with no visible reason. A populated group whose channels
                // simply aren't rendered yet fills in as the feed loads.
                if (!allowed || allowed.size > 0) return;
                if (!this._toolbar?.isConnected) return;
                const notice = document.createElement('div');
                notice.className = 'ytkit-sub-group-empty';
                notice.setAttribute('role', 'status');
                notice.textContent = t('subscriptionGroupEmpty', 'No channels in this group yet — click Edit Channels to add some.');
                this._toolbar.insertAdjacentElement('afterend', notice);
            },

            _closeMembersPanel(restoreFocus = false) {
                if (!this._membersPanel) return;
                this._membersPanel.remove();
                this._membersPanel = null;
                if (restoreFocus) {
                    const btn = this._toolbar?.querySelector('button[data-action="edit-channels"]');
                    if (btn) try { btn.focus(); } catch { /* reason: focus restore is best-effort */ }
                }
            },

            _toggleMembersPanel(groupId) {
                if (this._membersPanel) {
                    this._closeMembersPanel();
                    return;
                }
                this._renderMembersPanel(groupId);
            },

            _renderMembersPanel(groupId) {
                this._closeMembersPanel();
                const groups = this._readGroups();
                const group = groups[groupId];
                if (!group || !this._toolbar?.isConnected) return;
                const own = new Set(Array.isArray(group.channelIds) ? group.channelIds : []);
                // List the channels currently rendered in the feed, using the
                // same identity key the filter uses (_extractChannelIdFromCard
                // via _collectRenderedCardSummaries), deduped per channel.
                // Existing members that are not rendered right now still get a
                // row so they can be removed.
                const channels = new Map();
                for (const item of this._collectRenderedCardSummaries()) {
                    if (!channels.has(item.channelId)) channels.set(item.channelId, item.channelName || item.channelId);
                }
                for (const id of own) {
                    if (!channels.has(id)) channels.set(id, id);
                }

                const panel = document.createElement('section');
                panel.className = 'ytkit-sub-members-panel';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-label', t('subscriptionMembersRegionAriaTpl', 'Edit channels in {group}')
                    .replace('{group}', group.name || groupId));
                panel.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        this._closeMembersPanel(true);
                    }
                });

                const head = document.createElement('div');
                head.className = 'ytkit-sub-members-head';
                const titleWrap = document.createElement('div');
                const title = document.createElement('h3');
                title.className = 'ytkit-sub-members-title';
                title.textContent = t('subscriptionMembersTitleTpl', 'Edit channels — {group}')
                    .replace('{group}', group.name || groupId);
                const meta = document.createElement('div');
                meta.className = 'ytkit-sub-members-meta';
                meta.textContent = t('subscriptionMembersMeta', 'Check a channel to add it to this group. Changes save immediately. Scroll the feed to surface more channels.');
                titleWrap.append(title, meta);
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'ytkit-sub-members-close';
                close.textContent = t('commonDone', 'Done');
                close.setAttribute('aria-label', t('subscriptionMembersCloseAria', 'Close the channel membership editor'));
                close.addEventListener('click', () => {
                    this._closeMembersPanel(true);
                    this._renderToolbar();
                    this._applyGroupFilter();
                });

                // Rename and delete. Until now the only way to get rid of a
                // group was a Shift+click replace-import, which takes every
                // other group with it.
                const rename = document.createElement('button');
                rename.type = 'button';
                rename.className = 'ytkit-sub-members-action';
                rename.textContent = t('subscriptionGroupRename', 'Rename');
                rename.setAttribute('aria-label', t('subscriptionGroupRenameAriaTpl', 'Rename the group {group}')
                    .replace('{group}', group.name || groupId));
                rename.addEventListener('click', () => this._renameGroup(groupId));

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'ytkit-sub-members-action ytkit-sub-members-action--danger';
                remove.textContent = t('subscriptionGroupDelete', 'Delete');
                remove.setAttribute('aria-label', t('subscriptionGroupDeleteAriaTpl', 'Delete the group {group}')
                    .replace('{group}', group.name || groupId));
                remove.addEventListener('click', () => this._deleteGroup(groupId));

                const actions = document.createElement('div');
                actions.className = 'ytkit-sub-members-actions';
                actions.append(rename, remove, close);
                head.append(titleWrap, actions);

                const list = document.createElement('div');
                list.className = 'ytkit-sub-members-list';
                list.setAttribute('role', 'group');
                list.setAttribute('aria-label', t('subscriptionMembersListAria', 'Rendered channels'));

                if (!channels.size) {
                    const empty = document.createElement('div');
                    empty.className = 'ytkit-sub-members-empty';
                    empty.textContent = t('subscriptionMembersEmpty', 'No channels rendered yet — scroll the subscriptions feed, then reopen this panel.');
                    list.appendChild(empty);
                }

                const sorted = Array.from(channels.entries())
                    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), undefined, { sensitivity: 'base' }));
                for (const [channelId, channelName] of sorted) {
                    const row = document.createElement('label');
                    row.className = 'ytkit-sub-members-row';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = own.has(channelId);
                    checkbox.setAttribute('aria-label', t(
                        'subscriptionMembersIncludeChannelAriaTpl',
                        'Include {channel} in {group}'
                    ).replace('{channel}', channelName).replace('{group}', group.name || groupId));
                    checkbox.addEventListener('change', () => {
                        this._setGroupMembership(groupId, channelId, checkbox.checked);
                    });
                    const name = document.createElement('span');
                    name.className = 'ytkit-sub-members-name';
                    name.textContent = channelName;
                    name.title = channelId;
                    row.append(checkbox, name);
                    list.appendChild(row);
                }

                panel.append(head, list);
                this._toolbar.insertAdjacentElement('afterend', panel);
                this._membersPanel = panel;
                const firstFocusable = panel.querySelector('input, button');
                if (firstFocusable) try { firstFocusable.focus(); } catch { /* reason: focus is best-effort on detached re-renders */ }
            },

            _renameGroup(groupId) {
                const groups = this._readGroups();
                const group = groups[groupId];
                if (!group) return;
                const current = group.name || groupId;
                const raw = typeof prompt === 'function'
                    ? prompt(t('subscriptionGroupRenamePrompt', 'New name for this group'), current)
                    : null;
                if (raw === null) return;
                // Same shape the import path enforces, so a rename cannot
                // produce a group an import would have rejected.
                const name = String(raw).trim().slice(0, 64);
                if (!name || name === current) return;
                this._writeGroups({
                    ...groups,
                    [groupId]: { ...group, name, updatedAt: Date.now() }
                });
                this._renderToolbar();
                this._renderMembersPanel(groupId);
                if (typeof showToast === 'function') {
                    showToast(t('subscriptionGroupRenamed', 'Group renamed'), '#7c3aed', { duration: 2 });
                }
            },

            _deleteGroup(groupId) {
                const groups = this._readGroups();
                const group = groups[groupId];
                if (!group) return;
                const label = group.name || groupId;
                const count = Array.isArray(group.channelIds) ? group.channelIds.length : 0;
                // Deleting a group discards a membership list nothing else can
                // rebuild, so this one gets a confirm.
                const message = t('subscriptionGroupDeleteConfirmTpl', 'Delete "{group}" and its {count} channels? Your subscriptions are not affected.')
                    .replace('{group}', label)
                    .replace('{count}', String(count));
                if (typeof confirm === 'function' && !confirm(message)) return;
                const next = { ...groups };
                delete next[groupId];
                this._writeGroups(next);
                if (this._activeGroupId === groupId) this._activeGroupId = '';
                this._closeMembersPanel(true);
                this._renderToolbar();
                this._applyGroupFilter();
                if (typeof showToast === 'function') {
                    showToast(t('subscriptionGroupDeleted', 'Group deleted'), '#7c3aed', { duration: 2 });
                }
            },

            _setGroupMembership(groupId, channelId, included) {
                const groups = this._readGroups();
                const group = groups[groupId];
                if (!group || !channelId) return;
                const ids = new Set(Array.isArray(group.channelIds) ? group.channelIds : []);
                // Refuse at the cap instead of appending and slicing. The old
                // form added the channel, cut it straight back off, and still
                // toasted "added" — a silent drop reported as a success. A
                // removal is always allowed: it moves away from the limit.
                if (included && !ids.has(channelId) && ids.size >= this._MAX_GROUP_CHANNELS) {
                    if (typeof showToast === 'function') {
                        showToast(
                            t('subscriptionMembersCapped', 'Group is full at 1000 channels. Remove one first.'),
                            '#ef4444',
                            { role: 'alert', duration: 5 }
                        );
                    }
                    this._renderMembersPanel?.(groupId);
                    return;
                }
                if (included) ids.add(channelId);
                else ids.delete(channelId);
                const next = {
                    ...groups,
                    [groupId]: {
                        ...group,
                        channelIds: Array.from(ids).slice(0, this._MAX_GROUP_CHANNELS),
                        updatedAt: Date.now()
                    }
                };
                this._writeGroups(next);
                this._applyGroupFilter();
                this._applyNewSinceMarkers();
                if (typeof showToast === 'function') {
                    showToast(included
                        ? t('subscriptionMembersAdded', 'Channel added to group')
                        : t('subscriptionMembersRemoved', 'Channel removed from group'),
                    '#7c3aed', { duration: 2 });
                }
            },
            _xmlEscape(value) {
                return String(value ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            },

            _xmlUnescape(value) {
                return String(value ?? '')
                    .replace(/&apos;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&gt;/g, '>')
                    .replace(/&lt;/g, '<')
                    .replace(/&amp;/g, '&');
            },

            _sanitizeOpmlId(value, fallbackPrefix = 'opml') {
                const cleaned = String(value || '')
                    .trim()
                    .replace(/[^A-Za-z0-9_-]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 64);
                return cleaned && isSafeObjectKey(cleaned) ? cleaned : `${fallbackPrefix}_${Math.random().toString(36).slice(2, 9)}`;
            },

            _sanitizeOpmlChannelId(value) {
                const raw = String(value || '').trim();
                if (!raw || raw.length > 128) return '';
                return /^[A-Za-z0-9_@./:-]+$/.test(raw) ? raw : '';
            },

            _extractOpmlChannelId(attrs = {}) {
                const direct = this._sanitizeOpmlChannelId(attrs['astra:channelId'] || attrs.channelId || attrs.channelIdHash);
                if (direct) return direct;
                for (const key of ['xmlUrl', 'htmlUrl', 'url']) {
                    const raw = String(attrs[key] || '');
                    if (!raw) continue;
                    try {
                        const parsed = new URL(raw, 'https://www.youtube.com');
                        const channelId = parsed.searchParams.get('channel_id');
                        if (channelId) {
                            const normalized = this._sanitizeOpmlChannelId(channelId);
                            if (normalized) return normalized;
                        }
                        const path = parsed.pathname.replace(/^\/+/, '');
                        const channelMatch = path.match(/^channel\/([^/]+)/);
                        if (channelMatch) {
                            const normalized = this._sanitizeOpmlChannelId(channelMatch[1]);
                            if (normalized) return normalized;
                        }
                        const handleMatch = path.match(/^@[^/]+/);
                        if (handleMatch) {
                            const normalized = this._sanitizeOpmlChannelId(handleMatch[0]);
                            if (normalized) return normalized;
                        }
                    } catch (_) {
                        const textMatch = raw.match(/[?&]channel_id=([A-Za-z0-9_-]+)/);
                        if (textMatch) return this._sanitizeOpmlChannelId(textMatch[1]);
                    }
                }
                return '';
            },

            _parseOpmlAttributes(raw = '') {
                const attrs = {};
                const attrRe = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
                let match;
                while ((match = attrRe.exec(raw)) !== null) {
                    attrs[match[1]] = this._xmlUnescape(match[2] ?? match[3] ?? '');
                }
                return attrs;
            },

            _parseOpmlOutlineTree(opmlText) {
                const source = String(opmlText || '');
                if (!/<\s*opml\b/i.test(source)) throw new Error('Not an OPML document');
                const root = { attrs: {}, children: [] };
                const stack = [root];
                const tokenRe = /<\s*(\/?)\s*outline\b([^>]*?)(\/?)\s*>/gi;
                let match;
                while ((match = tokenRe.exec(source)) !== null) {
                    const closing = !!match[1];
                    const selfClosing = !!match[3] || /\/\s*$/.test(match[2] || '');
                    if (closing) {
                        if (stack.length === 1) throw new Error('Malformed OPML outline nesting');
                        stack.pop();
                        continue;
                    }
                    const node = { attrs: this._parseOpmlAttributes(match[2]), children: [] };
                    stack[stack.length - 1].children.push(node);
                    if (!selfClosing) stack.push(node);
                }
                if (stack.length !== 1) throw new Error('Malformed OPML outline nesting');
                if (!root.children.length) throw new Error('No OPML outline entries found');
                return root.children;
            },

            _buildGroupsOpml(groups = this._readGroups()) {
                const lines = [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<opml version="2.0" xmlns:astra="https://github.com/SysAdminDoc/Astra-Deck/opml">',
                    '  <head>',
                    '    <title>Astra Deck Subscription Groups</title>',
                    `    <dateCreated>${this._xmlEscape(new Date().toISOString())}</dateCreated>`,
                    '  </head>',
                    '  <body>'
                ];
                const renderChannel = (channelId, depth) => {
                    const safeId = this._xmlEscape(channelId);
                    const label = safeId;
                    const pad = '  '.repeat(depth);
                    // i18n-static: OPML export mirrors the channel identifier as its title.
                    lines.push(`${pad}<outline type="rss" text="${label}" title="${label}" astra:channelId="${safeId}" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=${safeId}" htmlUrl="https://www.youtube.com/channel/${safeId}" />`);
                };
                const renderGroup = (id, depth) => {
                    const group = groups[id];
                    if (!group) return;
                    const pad = '  '.repeat(depth);
                    const name = this._xmlEscape(group.name || id);
                    const color = this._xmlEscape(group.color || '#7c3aed');
                    const sortMode = this._xmlEscape(this._normalizeSubscriptionSortMode(group.sortMode));
                    // i18n-static: OPML export mirrors the user-entered group name as its title.
                    lines.push(`${pad}<outline text="${name}" title="${name}" astra:type="group" astra:id="${this._xmlEscape(id)}" astra:color="${color}" astra:sortMode="${sortMode}">`);
                    const seen = new Set();
                    for (const channelId of Array.isArray(group.channelIds) ? group.channelIds : []) {
                        const safeChannelId = this._sanitizeOpmlChannelId(channelId);
                        if (!safeChannelId || seen.has(safeChannelId)) continue;
                        seen.add(safeChannelId);
                        renderChannel(safeChannelId, depth + 1);
                    }
                    for (const childId of this._getChildGroupIds(id, groups)) renderGroup(childId, depth + 1);
                    lines.push(`${pad}</outline>`);
                };
                for (const id of this._getTopLevelGroupIds(groups)) renderGroup(id, 2);
                lines.push('  </body>', '</opml>');
                return lines.join('\n') + '\n';
            },

            _groupsFromOpmlTree(outlines) {
                const GROUP_LIMIT = 500;
                const CHANNEL_LIMIT = 1000;
                const now = Date.now();
                const groups = {};
                const usedIds = new Set();
                let duplicateChannels = 0;
                let importedChannels = 0;
                const makeUniqueGroupId = (base) => {
                    let candidate = this._sanitizeOpmlId(base || 'opml_group', 'opml');
                    let n = 2;
                    while (usedIds.has(candidate) || groups[candidate]) {
                        candidate = `${this._sanitizeOpmlId(base || 'opml_group', 'opml').slice(0, 58)}_${n++}`;
                    }
                    usedIds.add(candidate);
                    return candidate;
                };
                const ensureDefaultGroup = () => {
                    if (groups.imported_opml) return 'imported_opml';
                    usedIds.add('imported_opml');
                    groups.imported_opml = {
                        name: t('subscriptionImportedOpml', 'Imported OPML'),
                        color: '#7c3aed',
                        channelIds: [],
                        parentId: '',
                        sortMode: 'default',
                        updatedAt: now
                    };
                    return 'imported_opml';
                };
                const addChannel = (groupId, channelId) => {
                    const safeChannelId = this._sanitizeOpmlChannelId(channelId);
                    const group = groups[groupId];
                    if (!safeChannelId || !group) return;
                    if (group.channelIds.includes(safeChannelId)) {
                        duplicateChannels += 1;
                        return;
                    }
                    if (group.channelIds.length >= CHANNEL_LIMIT) return;
                    group.channelIds.push(safeChannelId);
                    importedChannels += 1;
                };
                const visit = (node, parentId = '') => {
                    if (Object.keys(groups).length >= GROUP_LIMIT) return;
                    const attrs = node.attrs || {};
                    const channelId = this._extractOpmlChannelId(attrs);
                    // A node with children is always a group (its subtree must
                    // be visited). If it also has a channel ID (some RSS readers
                    // emit folder outlines with an xmlUrl), add the channel to
                    // the group after creating it — don't silently drop the
                    // entire subtree.
                    const hasChildren = node.children?.length > 0;
                    const explicitGroup = attrs['astra:type'] === 'group' || hasChildren;
                    if (channelId && !explicitGroup) {
                        addChannel(parentId || ensureDefaultGroup(), channelId);
                        return;
                    }
                    const name = String(attrs.text || attrs.title || attrs['astra:id'] || 'Imported Group').trim().slice(0, 80) || 'Imported Group';
                    const groupId = makeUniqueGroupId(attrs['astra:id'] || name);
                    groups[groupId] = {
                        name,
                        color: /^#[0-9a-fA-F]{6}$/.test(attrs['astra:color'] || '') ? attrs['astra:color'] : '#7c3aed',
                        channelIds: [],
                        parentId: parentId && groups[parentId] && !groups[parentId].parentId ? parentId : '',
                        sortMode: this._normalizeSubscriptionSortMode(attrs['astra:sortMode']),
                        updatedAt: now
                    };
                    if (channelId) addChannel(groupId, channelId);
                    for (const child of node.children || []) visit(child, groupId);
                };
                for (const outline of outlines) visit(outline, '');
                return { groups, duplicateChannels, importedChannels };
            },

            _parseGroupsOpml(opmlText) {
                const outlines = this._parseOpmlOutlineTree(opmlText);
                const result = this._groupsFromOpmlTree(outlines);
                if (!Object.keys(result.groups).length) throw new Error('No subscription groups or channels found');
                return result;
            },

            // Merge imported groups into the existing set. Replacing was the
            // old behavior: importing any file deleted every group missing from
            // it, recoverable only through a six second toast.
            _mergeImportedGroups(previous, incoming) {
                const GROUP_LIMIT = 500;
                const CHANNEL_LIMIT = 1000;
                const merged = {};
                for (const [id, group] of Object.entries(previous)) {
                    merged[id] = { ...group, channelIds: [...(group.channelIds || [])] };
                }
                for (const [id, group] of Object.entries(incoming)) {
                    const existing = merged[id];
                    if (!existing) {
                        if (Object.keys(merged).length >= GROUP_LIMIT) continue;
                        merged[id] = { ...group, channelIds: [...(group.channelIds || [])] };
                        continue;
                    }
                    // The imported record wins on presentation, but a channel
                    // already in the group is never dropped by an import.
                    const channelIds = [...existing.channelIds];
                    const seen = new Set(channelIds);
                    for (const channelId of (group.channelIds || [])) {
                        if (seen.has(channelId) || channelIds.length >= CHANNEL_LIMIT) continue;
                        seen.add(channelId);
                        channelIds.push(channelId);
                    }
                    merged[id] = {
                        ...existing,
                        ...group,
                        channelIds,
                        updatedAt: Date.now()
                    };
                }
                return merged;
            },
            _commitImportedGroups(groups, label, meta = {}, options = {}) {
                const previous = this._readGroups();
                const replace = options.mode === 'replace';
                groups = replace ? groups : this._mergeImportedGroups(previous, groups);
                this._writeGroups(groups);
                const ids = Object.keys(groups);
                const previousIds = Object.keys(previous);
                const count = ids.length;
                const createdGroups = ids.filter(id => !Object.prototype.hasOwnProperty.call(previous, id)).length;
                const updatedGroups = ids.filter(id => (
                    Object.prototype.hasOwnProperty.call(previous, id) &&
                    JSON.stringify(previous[id]) !== JSON.stringify(groups[id])
                )).length;
                const removedGroups = previousIds.filter(id => !Object.prototype.hasOwnProperty.call(groups, id)).length;
                const totalChannels = ids.reduce((total, id) => {
                    const channelIds = groups[id]?.channelIds;
                    return total + (Array.isArray(channelIds) ? channelIds.length : 0);
                }, 0);
                const importedChannels = Number.isFinite(Number(meta.importedChannels)) ? Number(meta.importedChannels) : totalChannels;
                const skippedGroups = Math.max(0, Number(meta.skippedGroups) || 0);
                const skippedChannels = Math.max(0, Number(meta.skippedChannels) || 0);
                const duplicateChannels = Math.max(0, Number(meta.duplicateChannels) || 0);
                const detailParts = [
                    `${createdGroups} new`,
                    `${updatedGroups} updated`,
                    `${importedChannels} channel${importedChannels === 1 ? '' : 's'}`
                ];
                if (removedGroups) detailParts.push(`${removedGroups} removed`);
                const skipParts = [];
                if (skippedGroups) skipParts.push(`${skippedGroups} skipped group${skippedGroups === 1 ? '' : 's'}`);
                if (skippedChannels) skipParts.push(`${skippedChannels} skipped channel${skippedChannels === 1 ? '' : 's'}`);
                if (duplicateChannels) skipParts.push(`skipped ${duplicateChannels} duplicate channel${duplicateChannels === 1 ? '' : 's'}`);
                const mergeNote = replace ? ' Replaced all groups.' : '';
                const message = `Imported ${count} subscription group${count === 1 ? '' : 's'} from ${label} (${detailParts.join(', ')}).${mergeNote}${skipParts.length ? ` ${skipParts.join(', ')}.` : ''}`;
                if (typeof showToast === 'function') {
                    showToast(message, '#22c55e', {
                        duration: 6,
                        action: {
                            text: 'Undo',
                            onClick: () => {
                                this._writeGroups(previous);
                                this._renderToolbar();
                                this._applyGroupFilter();
                                this._renderDeadChannelMarkers();
                                showToast(t(
                                    'subscriptionGroupsRestored',
                                    'Restored previous subscription groups'
                                ), '#6b7280', { duration: 4, tone: 'neutral' });
                            }
                        }
                    });
                }
                this._renderToolbar();
                this._applyGroupFilter();
                this._renderDeadChannelMarkers();
                return {
                    ok: true,
                    importedGroups: count,
                    createdGroups,
                    updatedGroups,
                    removedGroups,
                    importedChannels,
                    skippedGroups,
                    skippedChannels,
                    duplicateChannels
                };
            },
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.subscriptionGroups = Object.freeze({
        createSubscriptionGroupsFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createSubscriptionGroupsFeature
        };
    }
})();
