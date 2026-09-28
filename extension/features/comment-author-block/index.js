(() => {
    'use strict';

    // extension/features/comment-author-block/index.js
    //
    // Block Comment Authors. Adds a "Block @handle" item to the action menu
    // YouTube opens from a comment, and hides every comment and reply by a
    // blocked author. The list is the commentBlockedAuthors setting, one handle
    // or channel id per line, so it is editable in the panel and travels with
    // settings export and sync.
    //
    // Hiding is one generated stylesheet of :has() rules keyed on the author
    // link, not a scan that marks nodes. YouTube recycles comment elements for
    // new comments as the list scrolls, and a stylesheet follows the element's
    // current author where a per-node marker would stick to the old one.

    const ITEM_CLASS = 'ytkit-comment-block-item';
    const STYLE_ID = 'commentAuthorBlock';
    const MENU_STYLE_ID = 'commentAuthorBlock-menu';
    const SETTING_KEY = 'commentBlockedAuthors';
    const MAX_ENTRIES = 1000;
    // Matches the setting's maxLength in core/settings-schema.js. The settings
    // controller refuses a longer value outright, so the oldest entries go first.
    const MAX_CHARS = 20000;
    const POPUP_WAIT_MS = 1500;
    const POPUP_POLL_MS = 50;
    const HANDLE_PATTERN = /^@[\p{L}\p{N}\p{M}._\xB7-]{1,100}$/u;
    const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
    const COMMENT_SELECTOR = 'ytd-comment-view-model, ytd-comment-renderer';
    const BLOCK_ICON_PATH = 'M12 2a10 10 0 100 20 10 10 0 000-20Zm0 2a8 8 0 016.32 12.9L7.1 5.68A7.96 7.96 0 0112 4Zm-8 8c0-1.85.63-3.55 1.68-4.9L16.9 18.32A8 8 0 014 12Z';

    function keyFromPath(pathname) {
        const path = String(pathname || '');
        const handle = /^\/@([^/?#]+)/.exec(path);
        if (handle) {
            let raw = handle[1];
            try { raw = decodeURIComponent(raw); } catch (_) { /* reason: a malformed escape stays as typed and fails the pattern */ }
            const key = '@' + raw;
            return HANDLE_PATTERN.test(key) ? key : '';
        }
        const channel = /^\/channel\/(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/.exec(path);
        return channel ? channel[1] : '';
    }

    // One list entry: @handle, a bare handle, a UC channel id, or a pasted
    // channel URL. Anything after the first space or comma is a free note.
    function normalizeBlockedAuthor(value) {
        const text = String(value ?? '').trim();
        if (!text || text.startsWith('#')) return '';
        const token = text.split(/[\s,]+/)[0];
        if (token.includes('/')) {
            try {
                const url = new URL(token, 'https://www.youtube.com');
                if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return '';
                return keyFromPath(url.pathname);
            } catch (_) {
                return '';
            }
        }
        if (CHANNEL_ID_PATTERN.test(token)) return token;
        const handle = '@' + token.replace(/^@+/, '');
        return HANDLE_PATTERN.test(handle) ? handle : '';
    }

    function authorIdentity(key) {
        return key.startsWith('@') ? key.toLowerCase() : key;
    }

    function parseBlockedAuthors(text) {
        const keys = [];
        const seen = new Set();
        for (const line of String(text || '').split(/\r?\n/)) {
            const key = normalizeBlockedAuthor(line);
            if (!key || seen.has(authorIdentity(key))) continue;
            seen.add(authorIdentity(key));
            keys.push(key);
            if (keys.length >= MAX_ENTRIES) break;
        }
        return keys;
    }

    function serializeBlockedAuthors(keys) {
        const kept = keys.slice(-MAX_ENTRIES);
        let text = kept.join('\n');
        while (text.length > MAX_CHARS && kept.length) {
            kept.shift();
            text = kept.join('\n');
        }
        return text;
    }

    function isBlockedAuthor(keys, key) {
        if (!key) return false;
        const identity = authorIdentity(key);
        return keys.some((entry) => authorIdentity(entry) === identity);
    }

    // The author of one comment, read from its own header. A reply is its own
    // ytd-comment-view-model, so passing the reply reads the reply's author.
    function readCommentAuthor(comment) {
        const link = comment?.querySelector?.('#author-text');
        const name = String(link?.textContent || '').replace(/\s+/g, ' ').trim();
        const href = link?.getAttribute?.('href') || '';
        let key = '';
        if (href) {
            try { key = keyFromPath(new URL(href, 'https://www.youtube.com').pathname); } catch (_) { key = ''; }
        }
        if (!key && name.startsWith('@')) key = normalizeBlockedAuthor(name);
        if (!key) {
            const label = comment?.querySelector?.('#author-thumbnail-button')?.getAttribute?.('aria-label') || '';
            if (label.trim().startsWith('@')) key = normalizeBlockedAuthor(label);
        }
        if (!key) return null;
        return { key, label: key.startsWith('@') ? key : (name || key) };
    }

    function authorLinkMatchers(keys) {
        const matchers = [];
        for (const key of keys) {
            if (key.startsWith('@')) {
                matchers.push(`[href$="/${key}" i]`);
                const encoded = '@' + encodeURIComponent(key.slice(1));
                if (encoded !== key) matchers.push(`[href$="/${encoded}" i]`);
            } else if (CHANNEL_ID_PATTERN.test(key)) {
                matchers.push(`[href$="/channel/${key}"]`);
            }
        }
        return matchers;
    }

    // A top-level comment hides its whole thread, replies included. A reply
    // by a blocked author hides only that reply.
    function buildBlockedAuthorsCss(keys) {
        const matchers = authorLinkMatchers(Array.isArray(keys) ? keys.filter((key) => normalizeBlockedAuthor(key) === key) : []);
        if (!matchers.length) return '';
        const author = `#author-text:is(${matchers.join(', ')})`;
        return [
            `ytd-comment-thread-renderer:has(> #comment-container > #comment > #body ${author}),`,
            `ytd-comment-thread-renderer:has(> #comment > #body ${author}),`,
            `:is(ytd-comment-view-model, ytd-comment-renderer):has(> #body ${author}) {`,
            '    display: none !important;',
            '}'
        ].join('\n');
    }

    // Defaults follow YouTube's stock menu row. matchNativeItem() then copies
    // the live row's geometry, color and type onto the item, so it matches
    // whichever menu styling is active. Only hover differs by lane.
    function buildMenuItemCss() {
        return `
            .${ITEM_CLASS} {
                display: flex;
                align-items: center;
                box-sizing: border-box;
                width: 100%;
                min-height: 36px;
                padding: 0 12px 0 16px;
                gap: 12px;
                border: 0 solid transparent;
                cursor: pointer;
                color: inherit;
                font-family: "Roboto", "Arial", sans-serif;
                font-size: 14px;
                line-height: 20px;
                font-weight: 400;
                white-space: nowrap;
                user-select: none;
                outline: none;
            }
            .${ITEM_CLASS} span {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .${ITEM_CLASS}:hover,
            .${ITEM_CLASS}:focus-visible {
                background: color-mix(in srgb, currentColor 10%, transparent);
            }
            .${ITEM_CLASS}:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: -2px;
            }
            .${ITEM_CLASS} svg {
                flex: none;
                width: 24px;
                height: 24px;
                fill: currentColor;
            }
            html.ytkit-watch-restyle .${ITEM_CLASS} {
                transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
            }
            html.ytkit-watch-restyle .${ITEM_CLASS}:hover,
            html.ytkit-watch-restyle .${ITEM_CLASS}:focus-visible {
                border-color: var(--ytkit-native-menu-border);
                background: var(--ytkit-native-menu-row-hover);
                outline: none;
                transform: translateY(-1px);
            }
            @media (prefers-reduced-motion: reduce) {
                html.ytkit-watch-restyle .${ITEM_CLASS} { transition: none; }
                html.ytkit-watch-restyle .${ITEM_CLASS}:hover { transform: none; }
            }
        `;
    }

    // Copies the live menu row's look onto the new item. A YouTube restyle
    // (Astra's own or YouTube's) changes these values, and a hard-coded copy
    // drifts the moment either one ships.
    function matchNativeItem(item, listbox, view) {
        const getStyle = typeof view?.getComputedStyle === 'function' ? (el) => view.getComputedStyle(el) : null;
        if (!getStyle || !listbox) return;
        const set = (target, property, value) => {
            if (value && value !== 'auto') target.style.setProperty(property, value);
        };
        const host = listbox.querySelector('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer');
        const row = host?.querySelector('tp-yt-paper-item') || host;
        if (row) {
            const rowStyle = getStyle(row);
            // The host's box includes any border a restyle draws around the
            // row, and the item is border-box, so its height is the one to copy.
            const hostHeight = host.getBoundingClientRect?.().height || 0;
            set(item, 'min-height', hostHeight > 0 ? `${hostHeight}px` : rowStyle.minHeight);
            set(item, 'padding-left', rowStyle.paddingLeft);
            set(item, 'padding-right', rowStyle.paddingRight);
            set(item, 'color', rowStyle.color);
            const hostStyle = getStyle(host);
            set(item, 'border-radius', hostStyle.borderTopLeftRadius);
            set(item, 'border-width', hostStyle.borderTopWidth);
            const icon = row.querySelector('yt-icon');
            const svg = item.querySelector('svg');
            if (icon && svg) {
                const iconStyle = getStyle(icon);
                set(svg, 'width', iconStyle.width);
                set(svg, 'height', iconStyle.height);
                set(item, 'gap', iconStyle.marginRight);
            }
            const text = row.querySelector('yt-formatted-string');
            if (text) {
                const textStyle = getStyle(text);
                for (const property of ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']) {
                    set(item, property, textStyle.getPropertyValue(property));
                }
            }
        }
        // Stock YouTube pads the list, not the popup. Sit inside that padding
        // so the new row follows the last one directly.
        const pad = parseFloat(getStyle(listbox).paddingBottom) || 0;
        if (pad > 0) {
            set(item, 'margin-top', `-${pad}px`);
            set(item, 'margin-bottom', `${pad}px`);
        }
    }

    function isShown(node) {
        if (!node || node.getAttribute?.('aria-hidden') === 'true') return false;
        if (node.hidden || node.style?.display === 'none') return false;
        return true;
    }

    // The open menu for the button that was just pressed. YouTube renders it
    // into ytd-popup-container and reuses the dropdown between menus, so the
    // visible one with menu items in it is the one to extend.
    function findOpenMenu(documentRef) {
        const dropdowns = documentRef?.querySelectorAll?.('ytd-popup-container tp-yt-iron-dropdown') || [];
        for (const dropdown of dropdowns) {
            if (!isShown(dropdown)) continue;
            const popup = dropdown.querySelector('ytd-menu-popup-renderer');
            const listbox = popup?.querySelector?.('tp-yt-paper-listbox#items, tp-yt-paper-listbox');
            if (popup && listbox && listbox.querySelector('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item')) {
                return { dropdown, host: popup, after: listbox };
            }
            const list = dropdown.querySelector('yt-list-view-model');
            if (list && list.querySelector('yt-list-item-view-model')) {
                return { dropdown, host: list, after: null };
            }
        }
        return null;
    }

    function createCommentAuthorBlockFeatures(deps = {}) {
        const {
            documentRef = typeof document !== 'undefined' ? document : null,
            injectStyle = () => ({ remove() {} }),
            readSetting = () => '',
            writeSetting = () => {},
            showToast = () => {},
            setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
            clearTimeoutFn = (timer) => clearTimeout(timer),
            t = (_key, fallback) => fallback
        } = deps;

        const blockFeature = {
            id: 'commentAuthorBlock',
            name: t('feature_commentAuthorBlock_name', 'Block Comment Authors'),
            description: t('feature_commentAuthorBlock_desc', 'Adds Block to the menu on every comment. Comments and replies from a blocked author stay hidden on every video.'),
            group: 'Comments',
            icon: 'user-x',
            _styleEl: null,
            _menuStyleEl: null,
            _clickHandler: null,
            _settingsHandler: null,
            _popupTimer: null,
            _lastBlock: null,

            _blockedKeys() {
                return parseBlockedAuthors(readSetting(SETTING_KEY));
            },

            _applyStyles() {
                const css = buildBlockedAuthorsCss(this._blockedKeys());
                if (!css) {
                    this._styleEl?.remove?.();
                    this._styleEl = null;
                    return;
                }
                this._styleEl = injectStyle(css, STYLE_ID, true);
            },

            _saveKeys(keys) {
                writeSetting(SETTING_KEY, serializeBlockedAuthors(keys));
                this._applyStyles();
            },

            block(author) {
                const keys = this._blockedKeys();
                if (!author?.key || isBlockedAuthor(keys, author.key)) return false;
                this._saveKeys([...keys, author.key]);
                this._lastBlock = author;
                return true;
            },

            unblock(author) {
                const keys = this._blockedKeys();
                if (!author?.key || !isBlockedAuthor(keys, author.key)) return false;
                const identity = authorIdentity(author.key);
                this._saveKeys(keys.filter((key) => authorIdentity(key) !== identity));
                return true;
            },

            _removeMenuItems() {
                documentRef?.querySelectorAll?.(`.${ITEM_CLASS}`).forEach((item) => item.remove());
            },

            _closeMenu(dropdown) {
                // YouTube's overlay manager closes the top menu on Escape.
                const KeyboardEventCtor = documentRef?.defaultView?.KeyboardEvent || globalThis.KeyboardEvent;
                if (typeof KeyboardEventCtor === 'function') {
                    (dropdown || documentRef)?.dispatchEvent?.(new KeyboardEventCtor('keydown', {
                        key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, composed: true, cancelable: true
                    }));
                }
            },

            _activate(author, dropdown) {
                const label = author.label;
                const blocked = this.block(author);
                this._removeMenuItems();
                this._closeMenu(dropdown);
                if (!blocked) {
                    showToast(t('commentBlockAlreadyTpl', '{author} is already blocked').replace('{author}', () => label), '#6b7280', { tone: 'neutral' });
                    return;
                }
                showToast(t('commentBlockToastTpl', 'Blocked {author}. Their comments are hidden.').replace('{author}', () => label), '#6b7280', {
                    tone: 'neutral',
                    duration: 6,
                    // A single action, which both the extension and the
                    // userscript toast accept.
                    action: {
                        text: t('toastActionUndo', 'Undo'),
                        onClick: () => {
                            if (this.unblock(author)) {
                                showToast(t('commentBlockUndoneTpl', 'Unblocked {author}').replace('{author}', () => label), '#6b7280', { tone: 'neutral' });
                            }
                        }
                    }
                });
            },

            _buildMenuItem(author, dropdown) {
                const item = documentRef.createElement('div');
                item.className = ITEM_CLASS;
                item.setAttribute('role', 'menuitem');
                item.setAttribute('tabindex', '0');
                const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('aria-hidden', 'true');
                svg.setAttribute('focusable', 'false');
                const path = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', BLOCK_ICON_PATH);
                svg.appendChild(path);
                const text = documentRef.createElement('span');
                text.textContent = t('commentBlockMenuItemTpl', 'Block {author}').replace('{author}', () => author.label);
                item.append(svg, text);
                const activate = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this._activate(author, dropdown);
                };
                item.addEventListener('click', activate);
                item.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') activate(event);
                });
                return item;
            },

            _injectWhenOpen(author, startedAt) {
                this._popupTimer = null;
                const menu = findOpenMenu(documentRef);
                if (!menu) {
                    if (Date.now() - startedAt < POPUP_WAIT_MS) {
                        this._popupTimer = setTimeoutFn(() => this._injectWhenOpen(author, startedAt), POPUP_POLL_MS);
                    }
                    return;
                }
                this._removeMenuItems();
                const item = this._buildMenuItem(author, menu.dropdown);
                if (menu.after) {
                    menu.after.after(item);
                    matchNativeItem(item, menu.after, documentRef.defaultView);
                } else {
                    menu.host.appendChild(item);
                }
                // YouTube sizes the popup to its rows when it opens. Its
                // overlay refits on iron-resize, which grows it for the new
                // row and keeps it inside the viewport.
                const CustomEventCtor = documentRef.defaultView?.CustomEvent || globalThis.CustomEvent;
                if (typeof CustomEventCtor === 'function') {
                    menu.dropdown.dispatchEvent?.(new CustomEventCtor('iron-resize', { bubbles: false }));
                }
            },

            _onDocumentClick(event) {
                const target = event.target;
                if (target?.closest?.(`.${ITEM_CLASS}`)) return;
                if (this._popupTimer) { clearTimeoutFn(this._popupTimer); this._popupTimer = null; }
                this._removeMenuItems();
                const menuButton = target?.closest?.('#action-menu');
                const comment = menuButton?.closest?.(COMMENT_SELECTOR);
                if (!comment) return;
                const author = readCommentAuthor(comment);
                if (!author) return;
                this._injectWhenOpen(author, Date.now());
            },

            init() {
                this._applyStyles();
                this._menuStyleEl = injectStyle(buildMenuItemCss(), MENU_STYLE_ID, true);
                this._clickHandler = (event) => this._onDocumentClick(event);
                documentRef?.addEventListener?.('click', this._clickHandler, true);
                this._settingsHandler = (event) => {
                    const detail = event?.detail || {};
                    const keys = Array.isArray(detail.keys) ? detail.keys : detail.key ? [detail.key] : null;
                    if (!keys || keys.includes(SETTING_KEY)) this._applyStyles();
                };
                documentRef?.addEventListener?.('ytkit-settings-changed', this._settingsHandler);
            },

            destroy() {
                if (this._popupTimer) { clearTimeoutFn(this._popupTimer); this._popupTimer = null; }
                if (this._clickHandler) documentRef?.removeEventListener?.('click', this._clickHandler, true);
                if (this._settingsHandler) documentRef?.removeEventListener?.('ytkit-settings-changed', this._settingsHandler);
                this._clickHandler = null;
                this._settingsHandler = null;
                this._removeMenuItems();
                this._styleEl?.remove?.();
                this._menuStyleEl?.remove?.();
                this._styleEl = null;
                this._menuStyleEl = null;
                this._lastBlock = null;
            }
        };

        const listFeature = {
            id: 'commentBlockedAuthors',
            name: t('feature_commentBlockedAuthors_name', 'Blocked Comment Authors'),
            description: t('feature_commentBlockedAuthors_desc', 'One author per line: an @handle, a channel id, or a channel link. Delete a line to unblock that author.'),
            group: 'Comments',
            icon: 'user-x',
            isSubFeature: true,
            parentId: 'commentAuthorBlock',
            type: 'textarea',
            settingKey: SETTING_KEY,
            // i18n-static: example list entries (a handle and a channel id), not prose
            placeholder: '@handle\nUCxxxxxxxxxxxxxxxxxxxxxx',
            dependsOn: 'commentAuthorBlock',
            init() {
                if (blockFeature._menuStyleEl) blockFeature._applyStyles();
            },
            destroy() { /* textarea, no runtime side effects of its own */ }
        };

        return [blockFeature, listFeature];
    }

    const api = Object.freeze({
        createCommentAuthorBlockFeatures,
        normalizeBlockedAuthor,
        parseBlockedAuthors,
        serializeBlockedAuthors,
        readCommentAuthor,
        buildBlockedAuthorsCss,
        findOpenMenu
    });
    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.commentAuthorBlock = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
