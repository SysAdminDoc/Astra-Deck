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
                        return String(value ?? '');
                    }
                });
                return policy;
            } catch (_) {
                // reason: reuse the fallback below when another context owns the policy name.
            }
        }
        policy = {
            createHTML(value) {
                return String(value ?? '');
            }
        };
        return policy;
    }

    function toTrustedHTML(value) {
        return createTrustedHtmlPolicy().createHTML(value);
    }

    const _URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data'];
    const _DANGEROUS_URL = /^\s*(?:javascript|data|vbscript):/i;

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
        if (tag === 'script') { el.remove(); return; }
        const attrs = el.attributes ? Array.from(el.attributes) : [];
        for (const attr of attrs) {
            const name = attr.name || '';
            if (/^on/i.test(name)) { el.removeAttribute(name); continue; }
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
        if (_hasSetHTML) {
            try {
                element.setHTML(String(value ?? ''));
                return element;
            } catch (_) {
                // reason: setHTML may throw on malformed input in early
                // implementations; fall through to the DOMParser path.
            }
        }
        const fragment = parseTrustedHTML(value);
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
        toTrustedHTML,
        parseTrustedHTML,
        setTrustedHTML
    });
})();
