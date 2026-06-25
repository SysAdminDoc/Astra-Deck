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

    function parseTrustedHTML(value) {
        const trusted = toTrustedHTML(value);
        if (typeof document === 'undefined') return null;

        if (typeof DOMParser === 'function') {
            const parser = new DOMParser();
            const parsed = parser.parseFromString(trusted, 'text/html');
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
