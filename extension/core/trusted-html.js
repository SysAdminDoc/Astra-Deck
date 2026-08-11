(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.toTrustedHTML) return;

    let policy = null;

    function createTrustedHtmlPolicy(name = 'astraDeck') {
        if (policy) return policy;
        if (typeof trustedTypes !== 'undefined' && trustedTypes?.createPolicy) {
            try {
                policy = trustedTypes.createPolicy(name, {
                    createHTML(value) {
                        return _sanitizeHtmlString(value);
                    }
                });
                return policy;
            } catch (_) {
                // reason: reuse the fallback below when another context owns the policy name.
            }
        }
        policy = {
            createHTML(value) {
                return _sanitizeHtmlString(value);
            }
        };
        return policy;
    }

    function toTrustedHTML(value) {
        return createTrustedHtmlPolicy().createHTML(value);
    }

    const _URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data'];
    const _DANGEROUS_URL = /^\s*(?:javascript|data|vbscript):/i;
    const _BLOCKED_TAGS = new Set([
        'base', 'embed', 'iframe', 'link', 'meta', 'object', 'script', 'style'
    ]);

    // Defense-in-depth for the DOMParser fallback (used on engines lacking the
    // Sanitizer API `setHTML`, which is most stable browsers today). Parsing
    // via text/html already prevents inline <script> from executing on
    // adoption, but it does NOT neutralize `onerror=`/`onclick=` handlers or
    // `javascript:` URLs. Today every caller passes static SVG literals, but
    // this guarantees any future untrusted input can't smuggle an XSS sink.
    function _isDangerousUrl(value) {
        // Browsers strip ASCII control characters (incl. \t\n\r) inside the
        // scheme when navigating, so `jav\nascript:` bypasses a plain regex.
        // Test against the control-char-stripped form.
        return _DANGEROUS_URL.test(String(value || '').replace(/[\u0000-\u0020]+/g, ''));
    }

    function _sanitizeParsedElement(el) {
        if (!el || el.nodeType !== 1) return;
        const tag = (el.tagName || '').toLowerCase();
        if (_BLOCKED_TAGS.has(tag)) { el.remove(); return; }
        const attrs = el.attributes ? Array.from(el.attributes) : [];
        for (const attr of attrs) {
            const name = attr.name || '';
            if (/^on/i.test(name)) { el.removeAttribute(name); continue; }
            if (name.toLowerCase() === 'style') { el.removeAttribute(name); continue; }
            // srcdoc is an inline document — script inside it executes when
            // the iframe is adopted, regardless of URL filtering.
            if (name.toLowerCase() === 'srcdoc') { el.removeAttribute(name); continue; }
            if (_URL_ATTRS.includes(name.toLowerCase()) && _isDangerousUrl(attr.value)) {
                el.removeAttribute(name);
            }
        }
    }

    function _sanitizeParsedTree(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const nodes = Array.from(root.querySelectorAll('*'));
        for (const node of nodes) {
            _sanitizeParsedElement(node);
            // <template> content lives in a separate DocumentFragment that
            // querySelectorAll('*') never visits — recurse or payloads
            // survive sanitization and fire when the template is stamped.
            if (node.content && typeof node.content.querySelectorAll === 'function') {
                _sanitizeParsedTree(node.content);
            }
        }
    }

    function _sanitizeHtmlString(value) {
        const html = String(value ?? '');
        if (typeof DOMParser === 'function') {
            try {
                const parser = new DOMParser();
                const parsed = parser.parseFromString(html, 'text/html');
                const body = parsed?.body;
                if (!body) return '';
                _sanitizeParsedTree(body);
                return typeof body.innerHTML === 'string' ? body.innerHTML : '';
            } catch (_) {
                // reason: fail closed when a parser rejects malformed input.
                return '';
            }
        }

        // Sanitizer API is the only safe parser available on a few engines
        // without DOMParser. Use it when present, then apply the same
        // defense-in-depth attribute/tag pass.
        try {
            const template = typeof document !== 'undefined'
                ? document.createElement?.('template')
                : null;
            if (template && typeof template.setHTML === 'function') {
                template.setHTML(html);
                _sanitizeParsedTree(template.content || template);
                return typeof template.innerHTML === 'string' ? template.innerHTML : '';
            }
        } catch (_) {
            // reason: fall through to the fail-closed return below.
        }
        return '';
    }

    function parseTrustedHTML(value) {
        const trusted = toTrustedHTML(value);
        if (typeof document === 'undefined') return null;

        if (typeof DOMParser === 'function') {
            const parser = new DOMParser();
            const parsed = parser.parseFromString(trusted, 'text/html');
            _sanitizeParsedTree(parsed.body);
            const fragment = document.createDocumentFragment();
            fragment.append(...Array.from(parsed.body?.childNodes || []));
            return fragment;
        }

        const fragment = document.createDocumentFragment();
        fragment.appendChild(document.createTextNode(String(trusted ?? '')));
        return fragment;
    }

    const _hasSetHTML = typeof Element !== 'undefined'
        && typeof Element.prototype.setHTML === 'function';

    function setTrustedHTML(element, value) {
        if (!element) return null;
        const safeValue = _sanitizeHtmlString(value);
        if (_hasSetHTML) {
            try {
                element.setHTML(safeValue);
                return element;
            } catch (_) {
                // reason: setHTML may throw on malformed input in early
                // implementations; fall through to the DOMParser path.
            }
        }
        const fragment = parseTrustedHTML(safeValue);
        if (fragment && typeof element.replaceChildren === 'function') {
            element.replaceChildren(fragment);
            return element;
        }
        element.textContent = '';
        if (fragment && typeof element.appendChild === 'function') {
            try {
                element.appendChild(fragment);
            } catch (_) {
                // reason: appendChild may reject a foreign-document fragment
                // in extremely old engines; nothing actionable left.
            }
        }
        return element;
    }

    Object.assign(core, {
        createTrustedHtmlPolicy,
        sanitizeTrustedHTML: _sanitizeHtmlString,
        toTrustedHTML,
        parseTrustedHTML,
        setTrustedHTML
    });
})();
