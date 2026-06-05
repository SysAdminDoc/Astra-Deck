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

    function setTrustedHTML(element, value) {
        if (!element) return null;
        const fragment = parseTrustedHTML(value);
        // Prefer the DOMParser path — it never hits a TrustedHTML sink and
        // therefore can't throw under YouTube's strict TrustedTypes CSP.
        if (fragment && typeof element.replaceChildren === 'function') {
            element.replaceChildren(fragment);
            return element;
        }
        element.textContent = '';
        // Last-resort fallback: append parsed children one by one so we never
        // pass a plain string into a sink that may be policed by TrustedTypes.
        // The previous insertAdjacentHTML('afterbegin', plainString) path could
        // throw silently and leave the element empty on TT-enforced pages.
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
