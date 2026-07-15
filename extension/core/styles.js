(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.appendStyleSheet) return;

    function appendStyleSheet(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    function injectStyle(selector, featureId, isRawCss = false) {
        const id = `yt-suite-style-${featureId}`;
        document.getElementById(id)?.remove();
        const style = document.createElement('style');
        style.id = id;
        style.textContent = isRawCss ? selector : `${selector} { display: none !important; }`;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    const lifecycleStyleRecords = new Map();

    function createCssLifecycleSpec(options = {}) {
        const {
            id,
            category,
            buildCss,
            isRawCss,
            bodyClass = `ytkit-${id}`,
            pageScopes = ['all']
        } = options;

        const normalizedPageScopes = Object.freeze(
            [...new Set((Array.isArray(pageScopes) ? pageScopes : [pageScopes])
                .map((scope) => String(scope || '').trim().toLowerCase())
                .filter(Boolean))]
        );
        const resolvedPageScopes = normalizedPageScopes.length
            ? normalizedPageScopes
            : Object.freeze(['all']);
        const matchesPage = (page) => resolvedPageScopes.includes('all')
            || resolvedPageScopes.includes(String(page || '').trim().toLowerCase());

        function removeRecord() {
            const record = lifecycleStyleRecords.get(id);
            if (!record) return false;
            record.style?.remove();
            if (record.bodyClass && document.body) {
                document.body.classList.remove(record.bodyClass);
            }
            lifecycleStyleRecords.delete(id);
            return true;
        }

        return {
            id,
            category,
            buildCss,
            pageScopes: resolvedPageScopes,
            init(ctx = {}) {
                if (!matchesPage(ctx.currentPage)) return;
                const settings = ctx.settings || {};
                const css = typeof buildCss === 'function'
                    ? buildCss(settings, ctx)
                    : ctx.css;
                if (!css) return;
                const raw = typeof isRawCss === 'boolean'
                    ? isRawCss
                    : String(css).includes('{');
                const className = ctx.bodyClass || bodyClass;
                const style = injectStyle(css, id, raw);
                if (className && document.body) document.body.classList.add(className);
                lifecycleStyleRecords.set(id, { style, bodyClass: className });
            },
            apply(ctx = {}) {
                if (!matchesPage(ctx.currentPage)) {
                    removeRecord();
                    return;
                }
                if (typeof buildCss !== 'function') return;
                const record = lifecycleStyleRecords.get(id);
                const css = buildCss(ctx.settings || {}, ctx);
                if (!record) {
                    // init() skips creating a record when the initial CSS is
                    // falsy (e.g. a default color that yields no override). If
                    // the user later picks a non-default value, apply() must be
                    // able to inject it — otherwise the style is never applied.
                    if (!css) return;
                    const raw = typeof isRawCss === 'boolean'
                        ? isRawCss
                        : String(css).includes('{');
                    const className = ctx.bodyClass || bodyClass;
                    const style = injectStyle(css, id, raw);
                    if (className && document.body) document.body.classList.add(className);
                    lifecycleStyleRecords.set(id, { style, bodyClass: className });
                    return;
                }
                if (!css) {
                    record.style?.remove();
                    lifecycleStyleRecords.delete(id);
                    return;
                }
                record.style.textContent = css;
            },
            destroy(ctx = {}) {
                if (removeRecord()) return;
                const className = ctx.bodyClass || bodyClass;
                document.getElementById(`yt-suite-style-${id}`)?.remove();
                if (className && document.body) document.body.classList.remove(className);
            }
        };
    }

    function stripCommentRestyleCss(css = '') {
        if (!css) return css;
        const commentPattern = /(#comments\b|#simple-box\b|#placeholder-area\b|#action-buttons\b|#vote-count-middle\b|#reply-button-end\b|#header-author\b|#author-thumbnail\b|#contenteditable-textarea\b|#contenteditable-root\b|ytd-comments\b|ytd-comments-header-renderer\b|ytd-comment(?:-[a-z-]+)?\b|ytd-commentbox\b|ytd-comment-engagement-bar\b|ytd-comment-replies-renderer\b|yt-user-mention-autosuggest-input\b|ytkit-comment-|ytSubThread|thread-hitbox\.style-scope\.ytd-comment-thread-renderer|#author-text\b|#published-time-text\b|#content-text\b|#action-menu\.ytd-comment|\[data-ytkit-comment-current)/i;
        return css
            .split('}')
            .map((chunk) => chunk.trim())
            .filter(Boolean)
            .filter((chunk) => !commentPattern.test(chunk))
            .map((chunk) => `${chunk}}`)
            .join('');
    }

    function cleanupRetiredCommentUi(root = document) {
        if (!root?.querySelectorAll) return;
        [
            'chatStyleComments',
            'chatStyleComments-premium',
            'chatStyleComments-premium-2',
            'commentEnhancements',
            'commentNavigator',
            'autoExpandComments',
            'hideCommentDislikeButton',
            'hideCommentActionMenu',
            'condenseComments',
            'hideCommentTeaser',
            'watchPageRestyle-comments'
        ].forEach((styleId) => {
            root.querySelector(`#yt-suite-style-${styleId}`)?.remove();
        });
        root.querySelectorAll('.ytkit-comment-search, #ytkit-comment-nav, .ytkit-vote-badge, .ytkit-heat-indicator').forEach((el) => el.remove());
        root.querySelectorAll('[data-ytkit-chat], [data-ytkit-pinned], [data-ytkit-heart], [data-ytkit-linked], [data-ytkit-enhanced], [data-ytkit-creator], [data-ytkit-comment-current]').forEach((el) => {
            delete el.dataset.ytkitChat;
            delete el.dataset.ytkitPinned;
            delete el.dataset.ytkitHeart;
            delete el.dataset.ytkitLinked;
            delete el.dataset.ytkitEnhanced;
            delete el.dataset.ytkitCreator;
            delete el.dataset.ytkitCommentCurrent;
        });
        root.querySelectorAll('.ytkit-replying').forEach((el) => el.classList.remove('ytkit-replying'));
        root.querySelectorAll('ytd-comment-thread-renderer').forEach((thread) => {
            if (thread instanceof HTMLElement && thread.style.display === 'none' && thread.dataset.ytkitPinnedCommentHidden !== '1') {
                thread.style.display = '';
            }
        });
    }

    Object.assign(core, {
        appendStyleSheet,
        cleanupRetiredCommentUi,
        createCssLifecycleSpec,
        injectStyle,
        stripCommentRestyleCss
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            appendStyleSheet,
            cleanupRetiredCommentUi,
            createCssLifecycleSpec,
            injectStyle,
            stripCommentRestyleCss
        };
    }
})();
