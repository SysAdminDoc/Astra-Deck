(() => {
    'use strict';

    // extension/features/video-notes/index.js
    //
    // Monolith peel for the per-video notes runtime. The module owns local
    // note storage, export, LRU cap enforcement, panel rendering, and SPA
    // reattachment; ytkit.js keeps the inline object as a compatibility
    // fallback.

    function createVideoNotesFeature(deps = {}) {
        const {
            PageTypes = { WATCH: 'watch' },
            appState = { settings: {} },
            DebugManager = { log() {} },
            injectStyle = () => ({ remove() {} }),
            getVideoId = () => '',
            isWatchPagePath = () => false,
            settingsManager = { save() {} },
            showToast = () => {},
            handleFileExport = () => {},
            addNavigateRule = () => {},
            removeNavigateRule = () => {}
        } = deps;

        return {
            id: 'videoNotes',
            name: 'Per-Video Notes',
            description: 'Keep a local note for the current video, export the notes archive, and cap the store at the 1000 most recently edited videos.',
            group: 'Watch Page',
            icon: 'file-text',
            pages: [PageTypes.WATCH],
            _DATA_KEY: 'videoNotesData',
            _MAX_NOTES: 1000,
            _MAX_NOTE_CHARS: 5000,
            _styleEl: null,
            _container: null,
            _textarea: null,
            _statusEl: null,
            _saveTimer: null,
            _pendingSave: null,
            _attachTimer: null,
            _navRule: null,

            _ensureStyles() {
                if (this._styleEl) return;
                this._styleEl = injectStyle(`
                    .ytkit-video-notes-container{margin:0 0 14px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#e5e7eb;font:13px/1.45 system-ui;}
                    .ytkit-video-notes-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;}
                    .ytkit-video-notes-title{display:flex;flex-direction:column;gap:3px;min-width:0;}
                    .ytkit-video-notes-eyebrow{font:700 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);}
                    .ytkit-video-notes-name{font:700 14px/1.2 system-ui;color:#fff;}
                    .ytkit-video-notes-status{margin:0;color:rgba(255,255,255,0.58);font:12px/1.35 system-ui;}
                    .ytkit-video-notes-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
                    .ytkit-video-notes-actions button{min-height:30px;padding:6px 9px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e5e7eb;font:700 12px/1 system-ui;cursor:pointer;outline:none;touch-action:manipulation;}
                    .ytkit-video-notes-actions button:hover{background:rgba(255,255,255,0.1);}
                    .ytkit-video-notes-actions button:focus-visible{box-shadow:0 0 0 2px rgba(8,11,16,0.92),0 0 0 4px rgba(59,130,246,0.28);}
                    .ytkit-video-notes-actions button[data-action="export"]{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.34);color:#bbf7d0;}
                    .ytkit-video-notes-actions button[data-action="delete"]{background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.32);color:#fecaca;}
                    .ytkit-video-notes-input{display:block;width:100%;min-height:140px;resize:vertical;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.22);color:#f8fafc;font:13px/1.5 system-ui;outline:none;}
                    .ytkit-video-notes-input:focus,.ytkit-video-notes-input:focus-visible{border-color:rgba(59,130,246,0.55);box-shadow:0 0 0 2px rgba(59,130,246,0.16);}
                    .ytkit-video-notes-footer{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:rgba(255,255,255,0.48);font:11px/1.3 system-ui;}
                    .ytkit-video-notes-count{font-variant-numeric:tabular-nums;}
                `, 'video-notes', true);
            },

            _enforceNotesCap(notes) {
                const entries = [];
                for (const [videoId, raw] of Object.entries(notes || {})) {
                    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) continue;
                    if (!raw || typeof raw !== 'object') continue;
                    const note = String(raw.note || raw.text || '').slice(0, this._MAX_NOTE_CHARS);
                    if (!note.trim()) continue;
                    const updatedAt = Number(raw.updatedAt || raw.t || raw.createdAt || Date.now());
                    const createdAt = Number(raw.createdAt || updatedAt || Date.now());
                    entries.push([videoId, {
                        videoId,
                        title: String(raw.title || '').slice(0, 200),
                        note,
                        url: String(raw.url || `https://www.youtube.com/watch?v=${videoId}`).slice(0, 260),
                        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
                        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
                    }]);
                }
                entries.sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0));
                return Object.fromEntries(entries.slice(0, this._MAX_NOTES));
            },

            _readNotes() {
                const data = appState?.settings?.[this._DATA_KEY];
                return this._enforceNotesCap((data && typeof data === 'object' && !Array.isArray(data)) ? data : {});
            },

            _writeNotes(next) {
                const capped = this._enforceNotesCap(next);
                appState.settings[this._DATA_KEY] = capped;
                try { settingsManager.save(appState.settings); }
                catch (e) { DebugManager.log('VideoNotes', `Save failed: ${e.message}`); }
                return capped;
            },

            _currentTitle() {
                return (document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1')?.textContent || document.title || '').trim().slice(0, 200);
            },

            _currentUrl(videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            },

            _updateStatus(message) {
                if (this._statusEl) this._statusEl.textContent = message;
            },

            _updateCount(value) {
                const countEl = this._container?.querySelector('.ytkit-video-notes-count');
                if (countEl) countEl.textContent = `${String(value || '').length}/${this._MAX_NOTE_CHARS}`;
            },

            // videoId/title are captured at SCHEDULE time and passed through:
            // resolving getVideoId() when the debounce fires races SPA
            // navigation — typing on video A then clicking video B within the
            // 450ms window would save A's text under B (or, when the textarea
            // was just cleared, delete B's note).
            _saveCurrentNote(value, videoId = getVideoId(), title = this._currentTitle()) {
                if (!videoId) return;
                const now = Date.now();
                const notes = this._readNotes();
                const text = String(value || '').slice(0, this._MAX_NOTE_CHARS);
                if (!text.trim()) {
                    if (notes[videoId]) {
                        delete notes[videoId];
                        this._writeNotes(notes);
                    }
                    this._updateStatus('No note saved for this video.');
                    this._updateCount('');
                    return;
                }
                const existing = notes[videoId];
                notes[videoId] = {
                    videoId,
                    title,
                    note: text,
                    url: this._currentUrl(videoId),
                    createdAt: existing?.createdAt || now,
                    updatedAt: now
                };
                this._writeNotes(notes);
                this._updateStatus('Saved locally.');
                this._updateCount(text);
            },

            _scheduleSave(value) {
                if (this._saveTimer) clearTimeout(this._saveTimer);
                this._updateStatus('Saving...');
                this._updateCount(value);
                this._pendingSave = {
                    value,
                    videoId: getVideoId(),
                    title: this._currentTitle()
                };
                this._saveTimer = setTimeout(() => {
                    this._saveTimer = null;
                    this._flushPendingSave();
                }, 450);
            },

            _flushPendingSave() {
                const pending = this._pendingSave;
                this._pendingSave = null;
                if (this._saveTimer) {
                    clearTimeout(this._saveTimer);
                    this._saveTimer = null;
                }
                if (!pending) return;
                this._saveCurrentNote(pending.value, pending.videoId, pending.title);
            },

            _deleteCurrentNote() {
                const videoId = getVideoId();
                if (!videoId) return;
                const notes = this._readNotes();
                const removed = notes[videoId];
                if (!removed) {
                    if (typeof showToast === 'function') showToast('No note saved for this video.', '#6b7280');
                    return;
                }
                delete notes[videoId];
                this._writeNotes(notes);
                this._renderPanel();
                if (typeof showToast === 'function') {
                    showToast('Removed video note', '#6b7280', {
                        duration: 5,
                        tone: 'neutral',
                        action: {
                            text: 'Undo',
                            onClick: () => {
                                const next = this._readNotes();
                                next[videoId] = { ...removed, updatedAt: Date.now() };
                                this._writeNotes(next);
                                this._renderPanel();
                                showToast('Video note restored', '#22c55e');
                            }
                        }
                    });
                }
            },

            _exportNotes() {
                const notes = this._readNotes();
                const entries = Object.values(notes).sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
                if (!entries.length) {
                    if (typeof showToast === 'function') showToast('No video notes to export.', '#6b7280');
                    return;
                }
                const payload = {
                    schemaVersion: 1,
                    exportedAt: new Date().toISOString(),
                    count: entries.length,
                    notes: Object.fromEntries(entries.map(entry => [entry.videoId, entry]))
                };
                handleFileExport(`astra-deck-video-notes-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
                if (typeof showToast === 'function') showToast(`Exported ${entries.length} video note${entries.length === 1 ? '' : 's'}`, '#22c55e');
            },

            _renderPanel() {
                if (!this._container) return;
                const videoId = getVideoId();
                const notes = this._readNotes();
                const current = videoId ? notes[videoId] : null;
                this._container.textContent = '';

                const header = document.createElement('div');
                header.className = 'ytkit-video-notes-header';
                const titleWrap = document.createElement('div');
                titleWrap.className = 'ytkit-video-notes-title';
                const eyebrow = document.createElement('span');
                eyebrow.className = 'ytkit-video-notes-eyebrow';
                eyebrow.textContent = 'Local Notes';
                const title = document.createElement('span');
                title.className = 'ytkit-video-notes-name';
                title.textContent = 'Video Notes';
                const status = document.createElement('p');
                status.className = 'ytkit-video-notes-status';
                status.textContent = current ? 'Saved locally.' : 'No note saved for this video.';
                status.setAttribute('role', 'status');
                status.setAttribute('aria-live', 'polite');
                this._statusEl = status;
                titleWrap.append(eyebrow, title, status);

                const actions = document.createElement('div');
                actions.className = 'ytkit-video-notes-actions';
                const exportBtn = document.createElement('button');
                exportBtn.type = 'button';
                exportBtn.dataset.action = 'export';
                exportBtn.textContent = 'Export Notes';
                exportBtn.setAttribute('aria-label', 'Export all video notes');
                exportBtn.addEventListener('click', () => this._exportNotes());
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.dataset.action = 'delete';
                deleteBtn.textContent = 'Delete';
                deleteBtn.setAttribute('aria-label', 'Delete the note for this video');
                deleteBtn.addEventListener('click', () => this._deleteCurrentNote());
                actions.append(exportBtn, deleteBtn);
                header.append(titleWrap, actions);

                const textarea = document.createElement('textarea');
                textarea.className = 'ytkit-video-notes-input';
                textarea.maxLength = this._MAX_NOTE_CHARS;
                textarea.value = current?.note || '';
                textarea.placeholder = 'Write notes for this video...';
                textarea.setAttribute('aria-label', 'Notes for this video');
                textarea.addEventListener('input', () => this._scheduleSave(textarea.value));
                this._textarea = textarea;

                const footer = document.createElement('div');
                footer.className = 'ytkit-video-notes-footer';
                const scope = document.createElement('span');
                scope.textContent = videoId ? `Saved under ${videoId}` : 'Video ID unavailable';
                scope.setAttribute('translate', 'no');
                const count = document.createElement('span');
                count.className = 'ytkit-video-notes-count';
                count.textContent = `${textarea.value.length}/${this._MAX_NOTE_CHARS}`;
                footer.append(scope, count);

                this._container.append(header, textarea, footer);
            },

            _scheduleAttach(delay = 1600) {
                if (this._attachTimer) clearTimeout(this._attachTimer);
                this._attachTimer = setTimeout(() => {
                    this._attachTimer = null;
                    this._attach();
                }, delay);
            },

            _attach() {
                if (!isWatchPagePath()) return;
                const target = document.querySelector('#secondary-inner, #below');
                if (!target) return;
                document.querySelectorAll('.ytkit-video-notes-container').forEach(el => el.remove());
                this._container = document.createElement('section');
                this._container.className = 'ytkit-video-notes-container';
                this._container.setAttribute('role', 'region');
                this._container.setAttribute('aria-label', 'Per-video notes');
                const bookmarkPanel = target.querySelector('.ytkit-bookmarks-container');
                if (bookmarkPanel?.nextSibling) target.insertBefore(this._container, bookmarkPanel.nextSibling);
                else target.insertBefore(this._container, target.firstChild);
                this._renderPanel();
            },

            init() {
                this._ensureStyles();
                this._navRule = () => {
                    // Persist any debounced edit under the video it was typed
                    // on BEFORE tearing the panel down for the next video.
                    this._flushPendingSave();
                    document.querySelectorAll('.ytkit-video-notes-container').forEach(el => el.remove());
                    this._container = null;
                    this._textarea = null;
                    this._statusEl = null;
                    this._scheduleAttach();
                };
                addNavigateRule(this.id, this._navRule);
                this._navRule();
            },

            destroy() {
                this._flushPendingSave();
                if (this._attachTimer) clearTimeout(this._attachTimer);
                this._attachTimer = null;
                removeNavigateRule(this.id);
                this._navRule = null;
                this._container = null;
                this._textarea = null;
                this._statusEl = null;
                document.querySelectorAll('.ytkit-video-notes-container').forEach(el => el.remove());
                this._styleEl?.remove();
                this._styleEl = null;
            }
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.videoNotes = Object.freeze({
        createVideoNotesFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createVideoNotesFeature
        };
    }
})();
