(() => {
    'use strict';

    // extension/features/digital-wellbeing/index.js
    //
    // Monolith peel for Digital Wellbeing. The module owns the active
    // playback timer, break-reminder overlay, daily-cap overlay, Shorts
    // budget overlay, and local day rollover handling; ytkit.js keeps the
    // legacy inline object as a compatibility fallback for the base timer.

    function createDigitalWellbeingFeature(deps = {}) {
        const {
            appState = { settings: {} },
            StorageManager = { get: (_key, fallbackValue) => fallbackValue, set() {} },
            settingsManager = { save() {} },
            DebugManager = { log() {} },
            injectStyle = () => ({ remove() {} }),
            trapFocusWithin = () => {},
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'digitalWellbeing',
            name: t('feature_digitalWellbeing_name', 'Digital Wellbeing'),
            description: t('feature_digitalWellbeing_desc', 'Break reminders every N minutes of active playback + optional daily watch-time cap. Timers persist across SPA navigation.'),
            group: 'Advanced',
            icon: 'clock',
            _timer: null,
            _overlay: null,
            _overlayKeyHandler: null,
            _sessionStart: 0,
            // v4.47.0 NF34: track the day key across tick calls so we can
            // detect midnight / DST boundaries and reset _sessionStart.
            // Without this, after midnight `today.seconds` flips to 0
            // (because _loadToday returns a fresh bucket) but _sessionStart
            // still holds yesterday's value, so `sessionElapsed` goes
            // negative and the "take a break" reminder never fires for the
            // rest of the day.
            _lastTodayKey: null,
            _capDismissKey: 'ytkit_dw_cap_dismissed_date',

            _todayKey() {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            },

            _formatMinutes(value) {
                return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
            },

            _isShortsRoute() {
                return /^\/shorts(?:\/|$)/.test(String(globalThis.location?.pathname || ''));
            },

            _getCapDismissDate() {
                return StorageManager.get(this._capDismissKey, '') || '';
            },

            _setCapDismissDate(value = '') {
                StorageManager.set(this._capDismissKey, value);
            },

            // Seconds this tab has counted but not yet merged into the shared
            // total. Two tabs each writing an absolute total meant the last
            // writer won and the daily cap undercounted every parallel session.
            _pendingSeconds: 0,
            _persistedToday() {
                const raw = appState.settings.dwWatchTimeToday || { date: '', seconds: 0 };
                const today = this._todayKey();
                if (raw.date !== today) return { date: today, seconds: 0 };
                return { date: today, seconds: raw.seconds || 0 };
            },
            _loadToday() {
                const persisted = this._persistedToday();
                return { date: persisted.date, seconds: persisted.seconds + this._pendingSeconds };
            },
            _flushToday() {
                if (!this._pendingSeconds) return;
                // Re-read before writing: another tab's flush may have landed
                // since this tab last looked, and its seconds must survive.
                const merged = this._loadToday();
                this._pendingSeconds = 0;
                this._saveToday(merged);
            },

            // Shorts watch time is tracked separately from the all-video
            // ledger so a user can budget the high-churn Shorts route without
            // changing the existing daily cap semantics.
            _pendingShortsSeconds: 0,
            _persistedShortsToday() {
                const raw = appState.settings.shortsWatchTimeToday || {};
                const today = this._todayKey();
                if (raw.date !== today) return { date: today, seconds: 0, snoozeUntil: 0 };
                const normalize = (value) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
                return {
                    date: today,
                    seconds: normalize(Number(raw.seconds)),
                    snoozeUntil: normalize(Number(raw.snoozeUntil))
                };
            },
            _loadShortsToday() {
                const persisted = this._persistedShortsToday();
                return { ...persisted, seconds: persisted.seconds + this._pendingShortsSeconds };
            },
            _flushShortsToday() {
                if (!this._pendingShortsSeconds) return;
                const merged = this._loadShortsToday();
                this._pendingShortsSeconds = 0;
                this._saveShortsToday(merged);
            },

            _saveShortsToday(state) {
                this._saveToday(state, 'shortsWatchTimeToday');
            },

            _setShortsSnooze(until = 0) {
                const merged = this._loadShortsToday();
                this._pendingShortsSeconds = 0;
                const snoozeValue = Number(until);
                this._saveShortsToday({
                    ...merged,
                    snoozeUntil: Number.isFinite(snoozeValue) ? Math.max(0, snoozeValue) : 0
                });
            },

            _clearOverlay() {
                if (this._overlayKeyHandler) {
                    document.removeEventListener('keydown', this._overlayKeyHandler, true);
                    this._overlayKeyHandler = null;
                }
                this._overlay?.remove();
                this._overlay = null;
            },

            _showShortsLimitOverlay(shortsToday, shortsLimit) {
                if (!shortsToday || shortsLimit <= 0 || shortsToday.seconds < shortsLimit
                    || shortsToday.snoozeUntil > Date.now() || this._overlay) return false;
                const snoozable = appState.settings.shortsDailyLimitMode === 'snooze';
                const minutes = this._formatMinutes(shortsToday.seconds / 60);
                const limitMinutes = this._formatMinutes(shortsLimit / 60);
                const leaveShorts = () => {
                    const target = globalThis.location;
                    if (!target || typeof target.assign !== 'function') return false;
                    try {
                        target.assign('/');
                        return true;
                    } catch (_) { return false; }
                };
                this._showOverlay('shorts-limit', {
                    title: t('dwShortsLimitTitle', 'Shorts Limit Reached'),
                    eyebrow: t('dwShortsLimitEyebrow', 'Shorts Guard'),
                    badge: `${minutes} Min Shorts`,
                    locked: !snoozable,
                    message: snoozable
                        ? t('dwShortsSnoozeMessage', 'You have watched {minutes} minutes of Shorts today. Take a break, or snooze the guard for five more minutes.').replace('{minutes}', minutes)
                        : t('dwShortsHardBlockMessage', 'You have reached your {limit}-minute Shorts budget for today. Leave Shorts to continue watching other YouTube videos.').replace('{limit}', limitMinutes),
                    hint: snoozable
                        ? t('dwShortsLimitResetHint', 'The Shorts budget resets at your next local midnight.')
                        : t('dwShortsHardBlockHint', 'This hard block resets at your next local midnight.'),
                    buttonText: snoozable
                        ? t('dwShortsSnoozeButton', 'Snooze 5 Minutes')
                        : t('dwShortsLeaveButton', 'Leave Shorts'),
                    resumeAfterDismiss: snoozable,
                    onAction: snoozable
                        ? () => this._setShortsSnooze(Date.now() + 5 * 60 * 1000)
                        : leaveShorts
                });
                return true;
            },

            _saveToday(state, key = 'dwWatchTimeToday') {
                appState.settings[key] = state;
                if (typeof settingsManager !== 'undefined' && settingsManager.save) {
                    try { settingsManager.save(appState.settings); } catch (e) {
                        DebugManager.log('DigitalWellbeing', `save failed: ${e.message}`);
                    }
                }
            },

            _showOverlay(kind, options = {}) {
                this._clearOverlay();
                const video = document.querySelector('video');
                const locked = options.locked === true;
                const resumeAfterDismiss = kind === 'break' && video && !video.paused
                    || (options.resumeAfterDismiss === true && video && !video.paused);
                if (video && !video.paused) video.pause();
                const titleText = options.title || (kind === 'break' ? 'Take a Break' : 'Daily Limit Reached');
                const messageText = options.message || '';
                const badgeText = options.badge || (kind === 'break' ? 'Break Reminder' : 'Daily Watch Limit');
                const eyebrowText = options.eyebrow || 'Digital Wellbeing';
                const buttonText = options.buttonText || (kind === 'break' ? 'Resume Video' : 'Dismiss Until Tomorrow');
                const hintText = options.hint || (kind === 'break'
                    ? 'Playback is paused until you are ready to continue.'
                    : 'This reminder will stay quiet until your next local day starts.');
                const o = document.createElement('div');
                o.className = 'ytkit-wellbeing-overlay';
                o.dataset.kind = kind;
                o.dataset.locked = locked ? 'true' : 'false';
                o.setAttribute('role', 'dialog');
                o.setAttribute('aria-modal', 'true');

                const card = document.createElement('div');
                card.className = 'ytkit-wellbeing-card';
                card.dataset.kind = kind;

                const topRow = document.createElement('div');
                topRow.className = 'ytkit-wellbeing-topline';
                const eyebrow = document.createElement('span');
                eyebrow.className = 'ytkit-wellbeing-eyebrow';
                eyebrow.textContent = eyebrowText;
                const badge = document.createElement('span');
                badge.className = 'ytkit-wellbeing-badge';
                badge.textContent = badgeText;
                topRow.append(eyebrow, badge);

                const iconWrap = document.createElement('div');
                iconWrap.className = 'ytkit-wellbeing-icon-wrap';
                const icon = document.createElement('div');
                icon.className = 'ytkit-wellbeing-icon';
                icon.textContent = kind === 'break' ? '☕' : '⏰';
                icon.setAttribute('aria-hidden', 'true');
                iconWrap.appendChild(icon);

                const title = document.createElement('h2');
                title.className = 'ytkit-wellbeing-title';
                title.id = `ytkit-wellbeing-title-${kind}`;
                title.textContent = titleText;

                const body = document.createElement('p');
                body.className = 'ytkit-wellbeing-msg';
                body.id = `ytkit-wellbeing-msg-${kind}`;
                body.textContent = messageText;

                const hint = document.createElement('p');
                hint.className = 'ytkit-wellbeing-hint';
                hint.textContent = hintText;

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'ytkit-wellbeing-btn';
                button.textContent = buttonText;

                o.setAttribute('aria-labelledby', title.id);
                o.setAttribute('aria-describedby', body.id);
                card.append(topRow, iconWrap, title, body, hint, button);
                o.appendChild(card);
                document.body.appendChild(o);
                this._overlay = o;

                const dismissOverlay = () => {
                    this._clearOverlay();
                    if (resumeAfterDismiss && video && video.paused) {
                        try {
                            const playPromise = video.play();
                            playPromise?.catch((error) => {
                                DebugManager.log('DigitalWellbeing', `Resume failed: ${error?.message || 'playback was blocked'}`);
                            });
                        } catch (error) {
                            DebugManager.log('DigitalWellbeing', `Resume failed: ${error?.message || 'playback was blocked'}`);
                        }
                    }
                    options.onDismiss?.();
                };

                const runAction = () => {
                    const result = typeof options.onAction === 'function' ? options.onAction() : undefined;
                    if (result !== false) dismissOverlay();
                };

                this._overlayKeyHandler = (event) => {
                    if (event.key === 'Tab') {
                        event.preventDefault();
                        trapFocusWithin(o, event);
                        return;
                    }
                    if (locked) {
                        event.preventDefault();
                        event.stopPropagation?.();
                        return;
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        dismissOverlay();
                    }
                };
                document.addEventListener('keydown', this._overlayKeyHandler, true);
                button.addEventListener('click', runAction);
                o.addEventListener('click', (event) => {
                    if (!locked && event.target === o) dismissOverlay();
                });
                requestAnimationFrame(() => button.focus({ preventScroll: true }));
            },

            _tick() {
                const shortsActive = this._isShortsRoute();
                if (!shortsActive) {
                    this._flushShortsToday();
                    if (this._overlay?.dataset?.kind === 'shorts-limit') this._clearOverlay();
                }
                const video = document.querySelector('video');
                if (!video || document.hidden) return;
                // v4.47.0 NF34: midnight / DST boundary detection. When
                // the local day key changes between two ticks we must
                // reset _sessionStart so the next break-reminder window
                // is anchored to the new day's accumulator. Without
                // this, sessionElapsed = today.seconds - _sessionStart
                // becomes negative across midnight, suppressing every
                // break reminder for the rest of the day.
                const currentTodayKey = this._todayKey();
                if (this._lastTodayKey && this._lastTodayKey !== currentTodayKey) {
                    DebugManager.log('DigitalWellbeing',
                        `Day rolled over (${this._lastTodayKey} -> ${currentTodayKey}); resetting session baseline.`);
                    this._sessionStart = 0;
                    this._pendingSeconds = 0;
                    this._pendingShortsSeconds = 0;
                    if (this._overlay?.dataset?.kind === 'shorts-limit') this._clearOverlay();
                }
                this._lastTodayKey = currentTodayKey;
                if (shortsActive
                    && this._overlay?.dataset?.kind === 'shorts-limit'
                    && this._overlay.dataset.locked === 'true') {
                    if (!video.paused) video.pause();
                    return;
                }
                const shortsLimit = (parseInt(appState.settings.shortsDailyLimitMin) || 0) * 60;
                if (video.paused) {
                    if (shortsActive && this._showShortsLimitOverlay(this._loadShortsToday(), shortsLimit)) return;
                    return;
                }
                this._pendingSeconds += 1;
                if (shortsActive) this._pendingShortsSeconds += 1;
                const today = this._loadToday();
                const shortsToday = shortsActive ? this._loadShortsToday() : null;
                // Batch storage writes to every 30 counted seconds.
                if (this._pendingSeconds >= 30) this._flushToday();
                if (this._pendingShortsSeconds >= 30) this._flushShortsToday();
                // NF34: use `??` so today.seconds === 0 (first tick of a
                // new day) correctly initializes _sessionStart instead of
                // letting the OR fall through to the next tick.
                if (!this._sessionStart) this._sessionStart = today.seconds ?? 0;
                const sessionElapsed = today.seconds - this._sessionStart;
                const breakEvery = (parseInt(appState.settings.dwBreakIntervalMin) || 0) * 60;
                const dailyCap   = (parseInt(appState.settings.dwDailyCapMin) || 0) * 60;
                const todayKey = this._todayKey();
                const capDismissedDate = this._getCapDismissDate();
                if (dailyCap > 0 && today.seconds >= dailyCap) {
                    if (!this._overlay && capDismissedDate !== todayKey) {
                        this._showOverlay('cap', {
                            title: t('dwDailyLimitTitle', 'Daily Limit Reached'),
                            badge: `${this._formatMinutes(today.seconds / 60)} Min Today`,
                            message: `You have watched ${this._formatMinutes(today.seconds / 60)} minutes today. Take the rest of the day off, or come back tomorrow with a fresh reset.`,
                            hint: 'Dismissing this reminder will keep it quiet until your next local day starts.',
                            buttonText: 'Dismiss Until Tomorrow',
                            onDismiss: () => this._setCapDismissDate(todayKey)
                        });
                        return;
                    }
                }
                if (shortsActive && this._showShortsLimitOverlay(shortsToday, shortsLimit)) return;
                if (breakEvery > 0 && sessionElapsed >= breakEvery && !this._overlay) {
                    this._sessionStart = today.seconds;
                    this._showOverlay('break', {
                        title: t('dwBreakTitle', 'Take a Break'),
                        badge: `${this._formatMinutes(breakEvery / 60)} Min Session`,
                        message: `You have been watching for ${this._formatMinutes(breakEvery / 60)} minutes. Rest your eyes, stretch, or look away from the screen for a moment before continuing.`,
                        hint: 'Playback is paused until you choose to resume.'
                    });
                }
            },

            init() {
                this._styleEl = injectStyle(`
                    .ytkit-wellbeing-overlay {
                        position: fixed; inset: 0; z-index: 2147483600;
                        padding: max(24px, env(safe-area-inset-top, 0px)) max(18px, env(safe-area-inset-right, 0px)) max(24px, env(safe-area-inset-bottom, 0px)) max(18px, env(safe-area-inset-left, 0px));
                        background:
                            radial-gradient(circle at top, rgba(99,102,241,0.12), transparent 28%),
                            rgba(8, 11, 16, 0.86);
                        display: flex; align-items: center; justify-content: center;
                        overscroll-behavior: contain;
                        animation: ytkit-wb-fade 220ms ease-out;
                    }
                    @keyframes ytkit-wb-fade { from { opacity: 0; } to { opacity: 1; } }
                    .ytkit-wellbeing-card {
                        width: min(480px, calc(100vw - 24px));
                        display: grid;
                        gap: 14px;
                        padding: 22px 22px 20px;
                        border-radius: 12px;
                        border: 1px solid rgba(137, 180, 250, 0.2);
                        background:
                            radial-gradient(circle at top right, rgba(137,180,250,0.16), transparent 36%),
                            linear-gradient(180deg, rgba(23,30,42,0.98), rgba(10,14,21,0.98));
                        color: #e2e8f0;
                        box-shadow: 0 26px 64px rgba(0,0,0,0.46);
                        text-align: left;
                    }
                    .ytkit-wellbeing-card[data-kind="cap"] {
                        border-color: rgba(251,191,36,0.24);
                        background:
                            radial-gradient(circle at top right, rgba(251,191,36,0.16), transparent 38%),
                            linear-gradient(180deg, rgba(30,24,16,0.98), rgba(15,11,8,0.98));
                    }
                    .ytkit-wellbeing-card[data-kind="shorts-limit"] {
                        border-color: rgba(167,139,250,0.3);
                        background:
                            radial-gradient(circle at top right, rgba(167,139,250,0.18), transparent 38%),
                            linear-gradient(180deg, rgba(27,22,45,0.98), rgba(12,10,23,0.98));
                    }
                    .ytkit-wellbeing-topline {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 10px;
                        flex-wrap: wrap;
                    }
                    .ytkit-wellbeing-eyebrow,
                    .ytkit-wellbeing-badge {
                        display: inline-flex;
                        align-items: center;
                        min-height: 26px;
                        padding: 0 10px;
                        border-radius: 10px;
                        border: 1px solid rgba(255,255,255,0.08);
                        background: rgba(255,255,255,0.05);
                        font-size: 10px;
                        font-weight: 800;
                        letter-spacing: 0.08em;
                        text-transform: uppercase;
                        white-space: nowrap;
                    }
                    .ytkit-wellbeing-eyebrow {
                        color: rgba(226,232,240,0.72);
                    }
                    .ytkit-wellbeing-badge {
                        color: rgba(255,255,255,0.92);
                    }
                    .ytkit-wellbeing-icon-wrap {
                        display: grid;
                        place-items: center;
                        width: 64px;
                        height: 64px;
                        border-radius: 12px;
                        border: 1px solid rgba(255,255,255,0.08);
                        background:
                            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
                            rgba(255,255,255,0.03);
                    }
                    .ytkit-wellbeing-icon { font-size: 34px; line-height: 1; }
                    .ytkit-wellbeing-title {
                        margin: 0;
                        color: rgba(248,250,252,0.96);
                        font: 700 27px/1.12 'Roboto', system-ui, sans-serif;
                        letter-spacing: 0;
                        text-wrap: balance;
                    }
                    .ytkit-wellbeing-msg {
                        margin: 0;
                        font-size: 15px;
                        line-height: 1.65;
                        color: rgba(226,232,240,0.74);
                        text-wrap: pretty;
                    }
                    .ytkit-wellbeing-hint {
                        margin: -4px 0 0;
                        color: rgba(226,232,240,0.48);
                        font-size: 12px;
                        line-height: 1.55;
                        text-wrap: pretty;
                    }
                    .ytkit-wellbeing-btn {
                        appearance: none;
                        -webkit-appearance: none;
                        justify-self: start;
                        min-height: 42px;
                        padding: 0 18px;
                        border-radius: 10px;
                        border: 1px solid rgba(137,180,250,0.18);
                        background: linear-gradient(135deg, #89b4fa, #b4befe);
                        color: #141a26;
                        font: 700 14px 'Roboto', system-ui, sans-serif;
                        letter-spacing: 0.01em;
                        cursor: pointer;
                        touch-action: manipulation;
                        transition: transform 120ms ease, box-shadow 160ms ease, filter 160ms ease;
                    }
                    .ytkit-wellbeing-card[data-kind="cap"] .ytkit-wellbeing-btn {
                        border-color: rgba(251,191,36,0.18);
                        background: linear-gradient(135deg, #fbbf24, #fde68a);
                        color: #1f140f;
                    }
                    .ytkit-wellbeing-btn:hover {
                        transform: translateY(-1px);
                        filter: brightness(1.03);
                    }
                    .ytkit-wellbeing-btn:focus-visible {
                        box-shadow: 0 0 0 2px rgba(8,11,16,0.92), 0 0 0 4px rgba(137,180,250,0.2);
                    }
                    .ytkit-wellbeing-card[data-kind="cap"] .ytkit-wellbeing-btn:focus-visible {
                        box-shadow: 0 0 0 2px rgba(8,11,16,0.92), 0 0 0 4px rgba(251,191,36,0.22);
                    }
                    @media (max-width: 560px) {
                        .ytkit-wellbeing-card {
                            padding: 18px 18px 16px;
                            border-radius: 12px;
                        }
                        .ytkit-wellbeing-title {
                            font-size: 24px;
                        }
                        .ytkit-wellbeing-btn {
                            width: 100%;
                            justify-self: stretch;
                            justify-content: center;
                        }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .ytkit-wellbeing-overlay { animation: none; }
                        .ytkit-wellbeing-btn { transition: none; }
                        .ytkit-wellbeing-btn:hover { transform: none; }
                    }
                `, this.id, true);
                this._timer = setInterval(() => this._tick(), 1000);
                // A closed or backgrounded tab used to drop up to 29 counted
                // seconds. pagehide is the last reliable moment to merge them.
                this._flushHandler = () => {
                    this._flushToday();
                    this._flushShortsToday();
                };
                this._visibilityHandler = () => {
                    if (document.visibilityState === 'hidden') this._flushHandler();
                };
                window.addEventListener('pagehide', this._flushHandler);
                document.addEventListener('visibilitychange', this._visibilityHandler);
            },
            destroy() {
                if (this._timer) clearInterval(this._timer);
                this._timer = null;
                // Flush any counted but unsaved watch time
                this._flushToday();
                this._flushShortsToday();
                if (this._flushHandler) {
                    window.removeEventListener('pagehide', this._flushHandler);
                    this._flushHandler = null;
                }
                if (this._visibilityHandler) {
                    document.removeEventListener('visibilitychange', this._visibilityHandler);
                    this._visibilityHandler = null;
                }
                if (this._overlayKeyHandler) {
                    document.removeEventListener('keydown', this._overlayKeyHandler, true);
                    this._overlayKeyHandler = null;
                }
                this._overlay?.remove(); this._overlay = null;
                this._styleEl?.remove(); this._styleEl = null;
                this._sessionStart = 0;
                this._pendingSeconds = 0;
                this._pendingShortsSeconds = 0;
                this._lastTodayKey = null;
            }
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.digitalWellbeing = Object.freeze({
        createDigitalWellbeingFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createDigitalWellbeingFeature
        };
    }
})();
