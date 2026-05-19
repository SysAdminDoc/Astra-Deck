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
                // Reuse the fallback below when another context owns the policy name.
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

        const template = document.createElement('template');
        template.innerHTML = trusted;
        return template.content;
    }

    function setTrustedHTML(element, value) {
        if (!element) return null;
        const fragment = parseTrustedHTML(value);
        if (fragment && typeof element.replaceChildren === 'function') {
            element.replaceChildren(fragment);
            return element;
        }
        element.textContent = '';
        if (typeof element.insertAdjacentHTML === 'function') {
            element.insertAdjacentHTML('afterbegin', toTrustedHTML(value));
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
