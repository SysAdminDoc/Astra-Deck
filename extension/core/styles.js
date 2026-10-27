(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.appendStyleSheet) return;

    function supportsCssScope() {
        if (typeof globalThis === 'undefined') return false;
        if (typeof globalThis.CSSScopeRule === 'function') return true;
        if (typeof globalThis.CSSRule?.SCOPE_RULE === 'number') return true;
        try {
            return globalThis.CSS?.supports?.('@scope (.ytkit-scope-probe) {}') === true;
        } catch (_) {
            return false;
        }
    }

    function canScopeCss(css) {
        const text = String(css || '').trim();
        if (!text || /@(?:font-face|(?:-webkit-)?keyframes|property|import|namespace|counter-style)\b/i.test(text)) {
            return false;
        }
        // Document-root selectors must stay global. Wrapping one of these in
        // a body-owned scope would silently turn a page-wide rule into a
        // descendant rule, so the compatibility path keeps that stylesheet
        // unwrapped instead.
        return !/(?:^|[,{])\s*(?:html|body|:root)\b/i.test(text);
    }

    function scopeCss(css, options = {}) {
        const text = String(css || '');
        const root = String(options.scopeRoot || '').trim();
        if (options.scope !== true || !root || !supportsCssScope() || !canScopeCss(text)) return text;
        return `@scope (${root}) {\n${text}\n}`;
    }

    function supportsCustomHighlight() {
        if (typeof globalThis === 'undefined') return false;
        return typeof globalThis.Highlight === 'function'
            && typeof globalThis.CSS?.highlights?.set === 'function'
            && typeof globalThis.CSS?.highlights?.delete === 'function';
    }

    function setCustomHighlight(name, ranges = []) {
        if (!supportsCustomHighlight() || !name) return false;
        try {
            if (!Array.isArray(ranges) || ranges.length === 0) {
                globalThis.CSS.highlights.delete(name);
                return true;
            }
            const highlight = new globalThis.Highlight(...ranges);
            globalThis.CSS.highlights.set(String(name), highlight);
            return true;
        } catch (_) {
            // reason: a host may expose the registry but reject a Range from a
            // detached or cross-document node; callers keep their DOM fallback.
            try {
                globalThis.CSS.highlights.delete(String(name));
            } catch (_) {
                // reason: cleanup of a failed highlight registration is best effort.
            }
            return false;
        }
    }

    function clearCustomHighlight(name) {
        if (!name || typeof globalThis === 'undefined') return false;
        try {
            return globalThis.CSS?.highlights?.delete?.(String(name)) === true;
        } catch (_) {
            return false;
        }
    }

    function appendStyleSheet(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    function injectStyle(selector, featureId, isRawCss = false, options = {}) {
        const id = `yt-suite-style-${featureId}`;
        document.getElementById(id)?.remove();
        const style = document.createElement('style');
        style.id = id;
        style.textContent = isRawCss
            ? scopeCss(selector, options)
            : `${selector} { display: none !important; }`;
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
            scope = true,
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
                if (className && document.body) document.body.classList.add(className);
                const style = injectStyle(css, id, raw, {
                    scope: scope && raw,
                    scopeRoot: className ? `.${className}` : ''
                });
                lifecycleStyleRecords.set(id, {
                    style,
                    bodyClass: className,
                    scope: scope && raw,
                    scopeRoot: className ? `.${className}` : '',
                    raw
                });
            },
            apply(ctx = {}) {
                if (!matchesPage(ctx.currentPage)) {
                    removeRecord();
                    return;
                }
                if (typeof buildCss !== 'function') return;
                const record = lifecycleStyleRecords.get(id);
                const css = buildCss(ctx.settings || {}, ctx);
                const raw = typeof isRawCss === 'boolean'
                    ? isRawCss
                    : String(css).includes('{');
                if (!record) {
                    // init() skips creating a record when the initial CSS is
                    // falsy (e.g. a default color that yields no override). If
                    // the user later picks a non-default value, apply() must be
                    // able to inject it — otherwise the style is never applied.
                    if (!css) return;
                    const className = ctx.bodyClass || bodyClass;
                    if (className && document.body) document.body.classList.add(className);
                    const style = injectStyle(css, id, raw, {
                        scope: scope && raw,
                        scopeRoot: className ? `.${className}` : ''
                    });
                    lifecycleStyleRecords.set(id, {
                        style,
                        bodyClass: className,
                        scope: scope && raw,
                        scopeRoot: className ? `.${className}` : '',
                        raw
                    });
                    return;
                }
                if (!css) {
                    record.style?.remove();
                    lifecycleStyleRecords.delete(id);
                    return;
                }
                record.style.textContent = raw
                    ? scopeCss(css, { scope: record.scope, scopeRoot: record.scopeRoot })
                    : `${css} { display: none !important; }`;
                record.raw = raw;
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

    // YouTube's 2026-10 side-panel watch page hides ytd-comments#comments
    // under the video and renders comments in an engagement panel, in a
    // ytd-comments with no id. scopeCommentsCss turns every comments-root
    // token (#comments, ytd-comments#comments, ytd-comments#comments#comments)
    // into :is(<token>, <panel root>). :is() takes its most specific
    // argument, and the panel argument has no id, so each rule keeps its
    // exact specificity and the classic page cascades as before. Rules
    // that also need #below or another classic-only ancestor still miss
    // the panel, which is what Theater Split's pane rules want.
    const COMMENTS_PANEL_ROOT = '[target-id="engagement-panel-comments-section"] ytd-comments';
    const COMMENTS_ROOT_TOKEN = /(?<![\w#-]|:is\()(?:ytd-comments)?(?:#comments)+(?![\w-])/g;

    function scopeCommentsCss(css = '') {
        if (!css) return css;
        return css.replace(COMMENTS_ROOT_TOKEN, (token) => `:is(${token},${COMMENTS_PANEL_ROOT})`);
    }

    // The comments root the page is using: the one holding threads, else
    // the panel when YouTube has hidden the classic root.
    function findCommentsRoot(doc = document) {
        const classic = doc?.querySelector?.('ytd-comments#comments') || null;
        const panel = doc?.querySelector?.(COMMENTS_PANEL_ROOT) || null;
        if (!panel || !classic) return classic || panel;
        if (classic.querySelector('ytd-comment-thread-renderer')) return classic;
        if (panel.querySelector('ytd-comment-thread-renderer') || classic.hasAttribute('hidden')) return panel;
        return classic;
    }

    Object.assign(core, {
        appendStyleSheet,
        canScopeCss,
        COMMENTS_PANEL_ROOT,
        createCssLifecycleSpec,
        findCommentsRoot,
        injectStyle,
        clearCustomHighlight,
        scopeCommentsCss,
        scopeCss,
        setCustomHighlight,
        stripCommentRestyleCss,
        supportsCustomHighlight,
        supportsCssScope
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            appendStyleSheet,
            canScopeCss,
            COMMENTS_PANEL_ROOT,
            createCssLifecycleSpec,
            findCommentsRoot,
            injectStyle,
            clearCustomHighlight,
            scopeCommentsCss,
            scopeCss,
            setCustomHighlight,
            stripCommentRestyleCss,
            supportsCustomHighlight,
            supportsCssScope
        };
    }
})();
