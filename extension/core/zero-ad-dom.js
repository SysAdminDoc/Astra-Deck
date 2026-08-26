// Semantic fallback for sponsored recommendation cards whose renderer names
// no longer match YouTube's known ad-shell selectors.
(function () {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const MARKER_ATTRIBUTE = 'data-ytkit-zero-ad-semantic';
    const RAIL_SELECTOR = '#secondary, #related, ytd-watch-next-secondary-results-renderer';
    const KNOWN_SHELL_SELECTOR = [
        'ytd-ad-slot-renderer',
        'ytd-display-ad-renderer',
        'ytd-promoted-video-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-action-companion-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-in-feed-ad-layout-renderer',
        '[data-ad-renderer]',
        '[data-is-ad="true"]'
    ].join(', ');
    const ORGANIC_CARD_SELECTOR = [
        'ytd-compact-video-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-radio-renderer',
        'ytd-playlist-renderer'
    ].join(', ');
    const RAIL_ROOT_TAGS = new Set([
        'YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER'
    ]);
    const LIST_CONTAINER_IDS = new Set(['secondary', 'related', 'items', 'contents']);
    const SPONSORED_LABELS = new Set([
        'sponsored',
        'gesponsert',
        'patrocinado',
        'sponsorisé',
        'sponsorizzato',
        'реклама',
        'спонсировано',
        'スポンサー',
        '스폰서',
        '赞助',
        '赞助商',
        'إعلان',
        'برعاية'
    ]);
    const AD_ATTRIBUTE_HINT = /(?:^|[^a-z0-9])(?:ad|ads|advert|advertisement|promoted|promotion|companion)(?:[^a-z0-9]|$)|adslot|companionad/i;
    const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)$/i;
    const AD_TRANSPORT_HOST = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com)$/i;
    const MAX_BADGE_TEXT_LENGTH = 120;
    const MAX_TEXT_NODES_PER_RAIL = 12000;
    const MAX_LINKS_PER_CANDIDATE = 40;

    function isElement(node) {
        return !!node && node.nodeType === 1 && typeof node.tagName === 'string';
    }

    function normalizeSponsoredText(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseSponsoredBadgeText(value) {
        const text = normalizeSponsoredText(value);
        if (!text || text.length > MAX_BADGE_TEXT_LENGTH) return null;
        const parts = text.split(/\s*[·•]\s*/u);
        if (parts.length > 2) return null;
        const label = normalizeSponsoredText(parts[0]).toLocaleLowerCase();
        if (!SPONSORED_LABELS.has(label)) return null;
        const domainHint = normalizeSponsoredText(parts[1] || '');
        if (domainHint && (!/^[^\s/]+\.[^\s/]{2,}$/u.test(domainHint) || domainHint.length > 80)) {
            return null;
        }
        return Object.freeze({ text, label, domainHint });
    }

    function unwrapRedirectDestination(url) {
        if (!url || !YOUTUBE_HOST.test(url.hostname)) return null;
        for (const key of ['q', 'url', 'adurl']) {
            const nested = url.searchParams.get(key);
            if (!nested) continue;
            try {
                return new URL(nested, url.href);
            } catch (_) {
                // reason: malformed redirect targets are not proof of an ad.
            }
        }
        return null;
    }

    function isAdDestinationHref(value, base = 'https://www.youtube.com/') {
        let parsed;
        try {
            parsed = new URL(String(value || ''), base);
        } catch (_) {
            return false;
        }
        if (!/^https?:$/.test(parsed.protocol)) return false;
        const redirected = unwrapRedirectDestination(parsed);
        if (redirected) return isAdDestinationHref(redirected.href, base);
        if (AD_TRANSPORT_HOST.test(parsed.hostname)) return true;
        return !YOUTUBE_HOST.test(parsed.hostname);
    }

    function getRect(element) {
        if (!isElement(element) || typeof element.getBoundingClientRect !== 'function') return null;
        try {
            const rect = element.getBoundingClientRect();
            if (!rect || ![rect.width, rect.height].every(Number.isFinite)) return null;
            return rect;
        } catch (_) {
            return null;
        }
    }

    function elementDescriptor(element) {
        if (!isElement(element)) return '';
        const className = typeof element.className === 'string'
            ? element.className
            : String(element.getAttribute?.('class') || '');
        return `${element.tagName} ${element.id || ''} ${className}`;
    }

    function hasAdAttributeHint(element) {
        if (!isElement(element)) return false;
        if (AD_ATTRIBUTE_HINT.test(elementDescriptor(element))) return true;
        for (const name of ['data-ad-renderer', 'data-ad-id', 'data-is-ad', 'ad-slot', 'is-ad']) {
            const value = element.getAttribute?.(name);
            if (value !== null && value !== undefined && value !== 'false') return true;
        }
        return false;
    }

    function candidateLinks(element) {
        if (!isElement(element)) return [];
        const links = [];
        if (element.matches?.('a[href]')) links.push(element);
        try {
            links.push(...Array.from(element.querySelectorAll?.('a[href]') || []).slice(0, MAX_LINKS_PER_CANDIDATE));
        } catch (_) {
            // reason: a synthetic test node or transient custom element may
            // not support selector queries yet.
        }
        return links;
    }

    function candidateHasSemanticAdEvidence(element, badgeInfo, baseUrl) {
        if (!isElement(element) || !badgeInfo) return false;
        if (badgeInfo.domainHint) return true;
        if (hasAdAttributeHint(element)) return true;
        return candidateLinks(element).some((link) => isAdDestinationHref(
            link.href || link.getAttribute?.('href'),
            baseUrl
        ));
    }

    function organicCardCount(element) {
        if (!isElement(element) || typeof element.querySelectorAll !== 'function') return 0;
        try {
            return element.querySelectorAll(ORGANIC_CARD_SELECTOR).length;
        } catch (_) {
            return 0;
        }
    }

    function isRailRoot(element) {
        if (!isElement(element)) return false;
        return RAIL_ROOT_TAGS.has(element.tagName) || LIST_CONTAINER_IDS.has(String(element.id || '').toLowerCase());
    }

    function fitsRelatedCardGeometry(element, rail) {
        const rect = getRect(element);
        const railRect = getRect(rail);
        if (!rect || !railRect) return true;
        if (rect.width <= 0 || rect.height <= 0 || railRect.width <= 0) return false;
        const minimumWidth = Math.max(180, railRect.width * 0.55);
        return rect.width >= minimumWidth
            && rect.width <= railRect.width + 32
            && rect.height >= 56
            && rect.height <= 520;
    }

    function findKnownShell(badgeElement, rail) {
        if (!isElement(badgeElement) || typeof badgeElement.closest !== 'function') return null;
        let shell = null;
        try {
            shell = badgeElement.closest(KNOWN_SHELL_SELECTOR);
        } catch (_) {
            return null;
        }
        if (!shell || shell === rail || !rail?.contains?.(shell)) return null;
        return shell;
    }

    function findSemanticAdShell(badgeElement, badgeInfo, rail) {
        if (!isElement(badgeElement) || !isElement(rail) || !rail.contains?.(badgeElement)) return null;
        const baseUrl = badgeElement.ownerDocument?.location?.href || 'https://www.youtube.com/';
        let markedShell = null;
        try {
            markedShell = badgeElement.closest?.(`[${MARKER_ATTRIBUTE}]`) || null;
        } catch (_) {
            markedShell = null;
        }
        if (markedShell && markedShell !== rail && rail.contains?.(markedShell)
            && candidateHasSemanticAdEvidence(markedShell, badgeInfo, baseUrl)) {
            return markedShell;
        }
        const known = findKnownShell(badgeElement, rail);
        if (known) return known;

        let node = badgeElement;
        let candidate = null;
        let depth = 0;
        while (isElement(node) && node !== rail && depth < 14) {
            if (isRailRoot(node)) break;
            if (fitsRelatedCardGeometry(node, rail)
                && organicCardCount(node) <= 1
                && candidateHasSemanticAdEvidence(node, badgeInfo, baseUrl)) {
                candidate = node;
            }
            node = node.parentElement;
            depth += 1;
        }
        return candidate;
    }

    function collectSponsoredBadges(rail) {
        const badges = [];
        const seen = new Set();
        const doc = rail?.ownerDocument || globalThis.document;
        if (!isElement(rail) || typeof doc?.createTreeWalker !== 'function') return badges;
        const showText = doc.defaultView?.NodeFilter?.SHOW_TEXT
            || globalThis.NodeFilter?.SHOW_TEXT
            || 4;
        const walker = doc.createTreeWalker(rail, showText);
        let inspected = 0;
        for (let textNode = walker.nextNode(); textNode && inspected < MAX_TEXT_NODES_PER_RAIL; textNode = walker.nextNode()) {
            inspected += 1;
            const info = parseSponsoredBadgeText(textNode.nodeValue);
            if (!info) continue;
            const element = textNode.parentElement;
            if (!isElement(element) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(element.tagName)) continue;
            if (seen.has(element)) continue;
            seen.add(element);
            badges.push({ element, info });
        }
        return badges;
    }

    function collectRails(root) {
        if (!root) return [];
        const rails = [];
        const seen = new Set();
        const add = (element) => {
            if (!isElement(element) || seen.has(element)) return;
            seen.add(element);
            rails.push(element);
        };
        if (isElement(root)) {
            try {
                if (root.matches?.(RAIL_SELECTOR)) add(root);
            } catch (_) {
                // reason: selector support is optional for synthetic roots.
            }
        }
        try {
            for (const rail of root.querySelectorAll?.(RAIL_SELECTOR) || []) add(rail);
        } catch (_) {
            // reason: a detached document fragment may not be queryable.
        }
        return rails;
    }

    function scanSemanticAds(root = globalThis.document) {
        let badges = 0;
        let marked = 0;
        let cleared = 0;
        const rails = collectRails(root);
        for (const rail of rails) {
            const activeShells = new Set();
            for (const badge of collectSponsoredBadges(rail)) {
                badges += 1;
                const shell = findSemanticAdShell(badge.element, badge.info, rail);
                if (!shell) continue;
                activeShells.add(shell);
                if (!shell.hasAttribute?.(MARKER_ATTRIBUTE)) {
                    shell.setAttribute?.(MARKER_ATTRIBUTE, '1');
                    marked += 1;
                }
            }
            try {
                for (const shell of rail.querySelectorAll?.(`[${MARKER_ATTRIBUTE}]`) || []) {
                    if (activeShells.has(shell)) continue;
                    shell.removeAttribute?.(MARKER_ATTRIBUTE);
                    cleared += 1;
                }
            } catch (_) {
                // reason: cleanup is best effort on transient custom elements.
            }
        }
        return Object.freeze({ rails: rails.length, badges, marked, cleared });
    }

    function mutationTouchesRelatedRail(record) {
        const target = record?.target?.nodeType === 1 ? record.target : record?.target?.parentElement;
        try {
            if (target?.closest?.(RAIL_SELECTOR)) return true;
        } catch (_) {
            // reason: keep checking added nodes below.
        }
        for (const node of record?.addedNodes || []) {
            const element = node?.nodeType === 1 ? node : node?.parentElement;
            if (!isElement(element)) continue;
            try {
                if (element.matches?.(RAIL_SELECTOR)
                    || element.closest?.(RAIL_SELECTOR)
                    || element.querySelector?.(RAIL_SELECTOR)) return true;
            } catch (_) {
                // reason: an invalid transient node cannot contain the rail.
            }
        }
        return false;
    }

    function startSemanticAdHider(doc = globalThis.document) {
        if (!doc || typeof globalThis.MutationObserver !== 'function') return null;
        if (core.semanticZeroAdRuntime?.document === doc) return core.semanticZeroAdRuntime;

        let timer = null;
        const followups = new Set();
        const run = () => {
            timer = null;
            return scanSemanticAds(doc);
        };
        const schedule = (delay = 80) => {
            if (timer !== null) return;
            timer = setTimeout(run, Math.max(0, Number(delay) || 0));
        };
        const observer = new globalThis.MutationObserver((records) => {
            if (records.some(mutationTouchesRelatedRail)) schedule();
        });
        observer.observe(doc, { childList: true, subtree: true, characterData: true });

        const onNavigate = () => {
            schedule(0);
            for (const delay of [400, 1400]) {
                const id = setTimeout(() => {
                    followups.delete(id);
                    scanSemanticAds(doc);
                }, delay);
                followups.add(id);
            }
        };
        doc.addEventListener?.('yt-navigate-finish', onNavigate);
        doc.addEventListener?.('yt-page-data-updated', onNavigate);

        const runtime = {
            document: doc,
            observer,
            scan: run,
            schedule,
            stop() {
                observer.disconnect();
                if (timer !== null) clearTimeout(timer);
                timer = null;
                for (const id of followups) clearTimeout(id);
                followups.clear();
                doc.removeEventListener?.('yt-navigate-finish', onNavigate);
                doc.removeEventListener?.('yt-page-data-updated', onNavigate);
                if (core.semanticZeroAdRuntime === runtime) core.semanticZeroAdRuntime = null;
            }
        };
        core.semanticZeroAdRuntime = runtime;
        onNavigate();
        return runtime;
    }

    const api = Object.freeze({
        ZERO_AD_SEMANTIC_MARKER: MARKER_ATTRIBUTE,
        ZERO_AD_RELATED_RAIL_SELECTOR: RAIL_SELECTOR,
        candidateHasSemanticAdEvidence,
        collectSponsoredBadges,
        findSemanticAdShell,
        isAdDestinationHref,
        normalizeSponsoredText,
        parseSponsoredBadgeText,
        scanSemanticAds,
        startSemanticAdHider
    });

    core.zeroAdDom = api;
    Object.assign(core, api);
    startSemanticAdHider();

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
