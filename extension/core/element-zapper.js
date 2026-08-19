(() => {
    'use strict';

    // extension/core/element-zapper.js
    //
    // v4.72.0 — the pure decision half of the YouTube-semantic element zapper.
    //
    // Users who want a shelf gone today hand-write uBO cosmetic filters, and
    // the Chromium host for those dies with the MV2 purge. Every existing
    // picker (uBOL's included) emits whatever selector reproduces the click,
    // which on YouTube means a string full of Polymer-generated classes that
    // stops matching on the next deploy.
    //
    // This module does the opposite. It never emits a class, never emits a
    // localized attribute, and never emits an id that looks generated. What it
    // emits is a path of custom-element tag names, stable Polymer ids, and a
    // small curated set of structural attributes — the parts of YouTube's DOM
    // that survive a redeploy because Polymer's own code depends on them.
    //
    // WHAT THIS DELIBERATELY REFUSES
    //
    //   The player. Same reasoning as core/feed-prefilter.js: a hidden player
    //   subtree is a broken player, not a cleaner page.
    //
    //   Playlist item lists. Positional indices drive "N of M", next/previous
    //   and shuffle; hiding one renumbers the list from the user's point of
    //   view while the player still counts it.
    //
    //   Individual video cards. This is the interesting refusal. A card's
    //   nearest structural ancestor is `ytd-rich-item-renderer`, and a rule on
    //   that tag hides the ENTIRE feed — a fail-open guard would then catch it
    //   every single pass, which is a guard doing the work a refusal should
    //   have done. Per-video and per-channel hiding is Video Hider's job and it
    //   is metadata-based, so the click snaps UP to the enclosing shelf or
    //   section instead, and a click with no section above it is refused with a
    //   reason the UI can point at Video Hider.
    //
    //   Page containers. `ytd-app`, `ytd-browse`, `ytd-watch-flexy` and friends
    //   are scope roots, not targets.
    //
    //   Astra Deck's own UI. A picker that can zap the settings panel it was
    //   launched from is a picker that can lock the user out of turning it off.
    //
    // Pure functions over a minimal DOM surface (tagName, id, getAttribute,
    // parentElement, className, querySelectorAll). No settings reads, no i18n,
    // no storage — so the whole grammar is exercisable headless.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.deriveStructuralSelector) return;

    const FEATURE_ID = 'elementZapper';

    // ── Bounds ──────────────────────────────────────────────────────────────
    const MAX_ANCESTOR_WALK = 32;
    const MAX_SELECTOR_STEPS = 4;
    const MAX_SELECTOR_LENGTH = 240;
    const MAX_RULES = 200;
    const MAX_LABEL_LENGTH = 120;
    // A section-level rule matching more than this many nodes in one pass is
    // misfiring, not thorough. Refused for the pass and reported, never
    // silently applied — the same posture feed-prefilter takes on a list.
    const MAX_MATCHES_PER_RULE = 50;

    // ── Grammar ─────────────────────────────────────────────────────────────
    const TAG_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
    // Polymer's own ids are short lowercase words. Anything with uppercase, a
    // long digit run, or unusual length is a generated id and is dropped rather
    // than baked into a rule that will stop matching.
    const STABLE_ID_PATTERN = /^[a-z][a-z0-9-]{2,39}$/;
    const GENERATED_ID_HINT = /\d{3,}/;
    const ATTR_VALUE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

    // Structural only. Nothing here is user-visible text, so nothing here
    // changes when the interface language does — the reason `aria-label`,
    // `title` and `alt` are absent and must stay absent.
    const ALLOWED_ATTRIBUTES = Object.freeze([
        'page-subtype',
        'role',
        'is-shorts',
        'is-short',
        'is-shorts-grid',
        'section-identifier',
        'component-style',
        'rich-grid-style',
        'slot',
        'type',
        'layout',
        'modern-buttons',
        'has-badges'
    ]);
    const ALLOWED_ATTRIBUTE_SET = new Set(ALLOWED_ATTRIBUTES);

    // ── Refusals ────────────────────────────────────────────────────────────
    const PLAYER_TAGS = new Set([
        'video', 'ytd-player', 'ytd-miniplayer', 'yt-playability-error-supported-renderers'
    ]);
    const PLAYER_IDS = new Set(['movie_player', 'player', 'player-container', 'ytd-player', 'inline-preview-player']);
    const PLAYER_CLASSES = new Set(['html5-video-player', 'ytp-chrome-bottom', 'ytp-chrome-top']);

    const PLAYLIST_TAGS = new Set([
        'ytd-playlist-panel-renderer',
        'ytd-playlist-panel-video-renderer',
        'ytd-playlist-video-renderer',
        'ytd-playlist-video-list-renderer',
        'ytd-playlist-header-renderer',
        'yt-playlist-manager'
    ]);

    // Scope roots. Legal to appear as a SCOPE step, never as the target.
    const PAGE_CONTAINER_TAGS = new Set([
        'html', 'body', 'head',
        'ytd-app',
        'ytd-page-manager',
        'ytd-browse',
        'ytd-watch-flexy',
        'ytd-search',
        'ytd-two-column-browse-results-renderer',
        'ytd-two-column-search-results-renderer',
        'ytd-section-list-renderer',
        'ytd-rich-grid-renderer',
        'ytd-masthead'
    ]);

    // Per-item renderers. A rule on one of these hides every card of that kind,
    // which is Video Hider's territory and metadata-based there for a reason.
    const ITEM_RENDERER_TAGS = new Set([
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-reel-item-renderer',
        'ytd-video-with-context-renderer',
        'ytd-comment-thread-renderer',
        'ytd-comment-renderer',
        'ytd-compact-radio-renderer',
        'ytd-grid-playlist-renderer'
    ]);

    // Preferred anchors: the section, shelf, panel and promo renderers a zapper
    // exists to remove. Ordered by nothing — nearest ancestor wins.
    const SECTION_ANCHOR_TAGS = new Set([
        'ytd-rich-section-renderer',
        'ytd-rich-shelf-renderer',
        'ytd-shelf-renderer',
        'ytd-reel-shelf-renderer',
        'ytd-item-section-renderer',
        'ytd-horizontal-card-list-renderer',
        'ytd-statement-banner-renderer',
        'ytd-merch-shelf-renderer',
        'ytd-ad-slot-renderer',
        'ytd-display-ad-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-promoted-video-renderer',
        'ytd-carousel-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-action-companion-ad-renderer',
        'ytd-engagement-panel-section-list-renderer',
        'ytd-clarification-renderer',
        'ytd-info-panel-container-renderer',
        'ytd-emergency-onebox-renderer',
        'ytd-brand-video-shelf-renderer',
        'ytd-brand-video-singleton-renderer',
        'ytd-primetime-promo-renderer',
        'ytd-feed-nudge-renderer',
        'ytd-mealbar-promo-renderer',
        'ytd-inline-survey-renderer',
        'ytd-ticket-shelf-renderer',
        'ytd-movie-offer-module-renderer',
        'ytd-donation-shelf-renderer',
        'ytd-guide-section-renderer',
        'ytd-guide-entry-renderer',
        'ytd-feed-filter-chip-bar-renderer',
        'ytd-comments-header-renderer',
        'ytd-watch-metadata',
        'ytd-secondary-search-container-renderer',
        'ytd-background-promo-renderer',
        'ytd-message-renderer'
    ]);

    const REFUSAL_REASONS = Object.freeze({
        NOT_AN_ELEMENT: 'not-an-element',
        PLAYER: 'refused-player',
        PLAYLIST: 'refused-playlist',
        OWN_UI: 'refused-own-ui',
        TOO_BROAD: 'refused-too-broad',
        VIDEO_CARD: 'refused-video-card',
        NO_ANCHOR: 'no-anchor',
        UNDERIVABLE: 'underivable'
    });

    function isElement(node) {
        return !!node && node.nodeType === 1 && typeof node.tagName === 'string';
    }

    function tagOf(element) {
        return String(element.tagName || '').toLowerCase();
    }

    function classTokens(element) {
        const raw = typeof element.className === 'string'
            ? element.className
            : (element.getAttribute ? element.getAttribute('class') : '') || '';
        return String(raw).split(/\s+/).filter(Boolean);
    }

    // Astra Deck's own surfaces are prefixed. This is the one place a class is
    // read at all, and only to refuse — never to build a selector from.
    function isOwnUi(element) {
        const tag = tagOf(element);
        if (tag.startsWith('ytkit-')) return true;
        return classTokens(element).some((token) => token.startsWith('ytkit-'));
    }

    function isPlayerNode(element) {
        const tag = tagOf(element);
        if (PLAYER_TAGS.has(tag)) return true;
        const id = String(element.id || '');
        if (id && PLAYER_IDS.has(id)) return true;
        return classTokens(element).some((token) => PLAYER_CLASSES.has(token));
    }

    // Walks self-and-ancestors once and returns the first refusal found, or
    // null. Used at derive time AND at apply time: a stored selector could have
    // been hand-edited in a backup, and a rule that reaches the player must
    // fail at the moment it would hide something, not only when it was made.
    function refusalFor(element) {
        if (!isElement(element)) return REFUSAL_REASONS.NOT_AN_ELEMENT;
        let node = element;
        let steps = 0;
        while (isElement(node) && steps < MAX_ANCESTOR_WALK) {
            if (isPlayerNode(node)) return REFUSAL_REASONS.PLAYER;
            if (PLAYLIST_TAGS.has(tagOf(node))) return REFUSAL_REASONS.PLAYLIST;
            if (isOwnUi(node)) return REFUSAL_REASONS.OWN_UI;
            node = node.parentElement;
            steps += 1;
        }
        return null;
    }

    // ── Anchor selection ────────────────────────────────────────────────────

    function isCustomElement(element) {
        const tag = tagOf(element);
        return TAG_PATTERN.test(tag) && tag.includes('-');
    }

    // Snap the click to the nearest thing worth naming. Section anchors win
    // outright; a generic custom element is the fallback; an item renderer is
    // recorded so the refusal can name it rather than saying "no anchor".
    function findAnchor(element) {
        let node = element;
        let steps = 0;
        let fallback = null;
        let sawItemRenderer = false;
        while (isElement(node) && steps < MAX_ANCESTOR_WALK) {
            const tag = tagOf(node);
            if (SECTION_ANCHOR_TAGS.has(tag)) return { anchor: node, kind: 'section', sawItemRenderer };
            if (ITEM_RENDERER_TAGS.has(tag)) {
                // A card is a hard boundary. Everything at or below it is
                // per-card content, so the generic fallback collected on the
                // way up is thrown away — anchoring on `ytd-rich-grid-media`
                // or `ytd-thumbnail` would blank every thumbnail in the feed,
                // which is the same over-match the card refusal exists to
                // prevent, one tag lower. Above a card, only a shelf or
                // section will do.
                sawItemRenderer = true;
                fallback = null;
            } else if (!sawItemRenderer
                && !fallback
                && !PAGE_CONTAINER_TAGS.has(tag)
                && isCustomElement(node)) {
                fallback = node;
            }
            node = node.parentElement;
            steps += 1;
        }
        if (fallback) return { anchor: fallback, kind: 'generic', sawItemRenderer };
        return { anchor: null, kind: 'none', sawItemRenderer };
    }

    // ── Step encoding ───────────────────────────────────────────────────────

    function stableIdOf(element) {
        const id = String(element.id || '').trim();
        if (!id || !STABLE_ID_PATTERN.test(id) || GENERATED_ID_HINT.test(id)) return '';
        return id;
    }

    function structuralAttributes(element) {
        const out = [];
        if (typeof element.getAttribute !== 'function') return out;
        for (const name of ALLOWED_ATTRIBUTES) {
            const raw = element.getAttribute(name);
            if (raw === null || raw === undefined) continue;
            const value = String(raw);
            if (value === '') {
                out.push({ name, value: null });
                continue;
            }
            if (!ATTR_VALUE_PATTERN.test(value)) continue;
            out.push({ name, value });
            if (out.length >= 3) break;
        }
        return out;
    }

    function encodeStep(step) {
        let out = step.tag;
        if (step.id) out += `#${step.id}`;
        for (const attr of step.attributes || []) {
            out += attr.value === null ? `[${attr.name}]` : `[${attr.name}="${attr.value}"]`;
        }
        return out;
    }

    function describeStep(element) {
        const tag = tagOf(element);
        if (!TAG_PATTERN.test(tag)) return null;
        return { tag, id: stableIdOf(element), attributes: structuralAttributes(element) };
    }

    // A scope root makes the same shelf tag mean different things on different
    // pages — `ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer` will not
    // touch the subscriptions feed. Without one the rule is still valid, just
    // broader, and the confidence label says so.
    //
    // These four are worth naming even bare, because each one IS a page. The
    // other page containers are not: `ytd-app` and `ytd-page-manager` wrap
    // every page there is, so scoping to them narrows nothing while making the
    // rule longer and more fragile.
    const SCOPE_ROOT_TAGS = new Set(['ytd-browse', 'ytd-watch-flexy', 'ytd-search', 'ytd-masthead']);

    function findScopeStep(anchor) {
        let node = anchor.parentElement;
        let steps = 0;
        let bareRoot = null;
        while (isElement(node) && steps < MAX_ANCESTOR_WALK) {
            const step = describeStep(node);
            if (step) {
                // The nearest ancestor carrying real structure wins outright.
                if (step.attributes.length || step.id) return step;
                if (!bareRoot && SCOPE_ROOT_TAGS.has(step.tag)) bareRoot = step;
            }
            node = node.parentElement;
            steps += 1;
        }
        return bareRoot;
    }

    function deriveStructuralSelector(element, options = {}) {
        const refusal = refusalFor(element);
        if (refusal) return { ok: false, reason: refusal };

        const { anchor, kind, sawItemRenderer } = findAnchor(element);
        if (!anchor) {
            return { ok: false, reason: sawItemRenderer ? REFUSAL_REASONS.VIDEO_CARD : REFUSAL_REASONS.NO_ANCHOR };
        }
        const anchorTag = tagOf(anchor);
        if (PAGE_CONTAINER_TAGS.has(anchorTag)) return { ok: false, reason: REFUSAL_REASONS.TOO_BROAD };
        if (ITEM_RENDERER_TAGS.has(anchorTag)) return { ok: false, reason: REFUSAL_REASONS.VIDEO_CARD };

        const anchorStep = describeStep(anchor);
        if (!anchorStep) return { ok: false, reason: REFUSAL_REASONS.UNDERIVABLE };

        const steps = [];
        const scope = options.scoped === false ? null : findScopeStep(anchor);
        if (scope) steps.push(scope);
        steps.push(anchorStep);

        const selector = steps.slice(-MAX_SELECTOR_STEPS).map(encodeStep).join(' ');
        if (!selector || selector.length > MAX_SELECTOR_LENGTH) {
            return { ok: false, reason: REFUSAL_REASONS.UNDERIVABLE };
        }

        // `section` + a scope is the shape that survives redeploys; the other
        // combinations still work, they just carry more risk of over-matching,
        // and the UI shows this rather than hiding it.
        let confidence = 'low';
        if (kind === 'section') confidence = scope ? 'high' : 'medium';
        else if (scope) confidence = 'medium';

        return {
            ok: true,
            selector,
            anchor,
            anchorTag,
            anchorKind: kind,
            scoped: !!scope,
            confidence,
            steps
        };
    }

    // ── Selector validation ─────────────────────────────────────────────────
    //
    // Rules travel in backups. A stored selector is untrusted input by the time
    // it reaches querySelectorAll, so it is re-parsed against the same grammar
    // that produced it rather than merely length-checked. Anything the grammar
    // does not cover — a class, a pseudo-class, `*`, a combinator other than
    // descendant — is rejected whole.

    const STEP_PATTERN = /^([a-z][a-z0-9-]{1,63})(#[a-z][a-z0-9-]{2,39})?((?:\[[a-z-]{1,32}(?:="[A-Za-z0-9_-]{1,40}")?\])*)$/;
    const ATTR_PATTERN = /\[([a-z-]{1,32})(?:="([A-Za-z0-9_-]{1,40})")?\]/g;

    function parseStructuralSelector(selector) {
        if (typeof selector !== 'string') return null;
        const trimmed = selector.trim();
        if (!trimmed || trimmed.length > MAX_SELECTOR_LENGTH) return null;
        const rawSteps = trimmed.split(/\s+/);
        if (!rawSteps.length || rawSteps.length > MAX_SELECTOR_STEPS) return null;
        const parsed = [];
        for (const raw of rawSteps) {
            const match = STEP_PATTERN.exec(raw);
            if (!match) return null;
            const [, tag, rawId, rawAttrs] = match;
            const attributes = [];
            if (rawAttrs) {
                ATTR_PATTERN.lastIndex = 0;
                let attrMatch;
                let consumed = 0;
                while ((attrMatch = ATTR_PATTERN.exec(rawAttrs)) !== null) {
                    if (!ALLOWED_ATTRIBUTE_SET.has(attrMatch[1])) return null;
                    attributes.push({ name: attrMatch[1], value: attrMatch[2] === undefined ? null : attrMatch[2] });
                    consumed += attrMatch[0].length;
                    if (attributes.length > 3) return null;
                }
                // A partially-consumed attribute run means the grammar matched
                // a prefix of something it does not understand.
                if (consumed !== rawAttrs.length) return null;
            }
            parsed.push({ tag, id: rawId ? rawId.slice(1) : '', attributes });
        }
        const target = parsed[parsed.length - 1];
        if (PAGE_CONTAINER_TAGS.has(target.tag)
            || ITEM_RENDERER_TAGS.has(target.tag)
            || PLAYLIST_TAGS.has(target.tag)
            || PLAYER_TAGS.has(target.tag)
            || target.tag.startsWith('ytkit-')) {
            return null;
        }
        return { selector: parsed.map(encodeStep).join(' '), steps: parsed };
    }

    function isStructuralSelector(selector) {
        return parseStructuralSelector(selector) !== null;
    }

    // ── Rules ───────────────────────────────────────────────────────────────

    function normalizeLabel(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_LABEL_LENGTH);
    }

    function sanitizeZapperRule(rule) {
        const raw = rule && typeof rule === 'object' && !Array.isArray(rule) ? rule : {};
        const parsed = parseStructuralSelector(raw.selector);
        if (!parsed) return null;
        const createdAt = Number(raw.createdAt);
        return {
            selector: parsed.selector,
            label: normalizeLabel(raw.label),
            surface: /^[a-z][a-z0-9._-]{0,63}$/.test(String(raw.surface || '')) ? String(raw.surface) : '',
            confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low',
            enabled: raw.enabled !== false,
            createdAt: Number.isFinite(createdAt) && createdAt > 0 ? Math.floor(createdAt) : 0
        };
    }

    function sanitizeZapperRules(value) {
        const rows = Array.isArray(value) ? value : [];
        const bySelector = new Map();
        for (const row of rows) {
            const rule = sanitizeZapperRule(row);
            if (!rule || bySelector.has(rule.selector)) continue;
            bySelector.set(rule.selector, rule);
            if (bySelector.size >= MAX_RULES) break;
        }
        return [...bySelector.values()];
    }

    function createZapperRule(derivation, options = {}) {
        if (!derivation || derivation.ok !== true) return null;
        return sanitizeZapperRule({
            selector: derivation.selector,
            label: options.label,
            surface: options.surface,
            confidence: derivation.confidence,
            enabled: true,
            createdAt: Number(options.createdAt) || 0
        });
    }

    // ── Apply ───────────────────────────────────────────────────────────────
    //
    // Returns the nodes to hide plus a report. Never touches the DOM itself:
    // the feature module owns hiding and attribution so this stays exercisable
    // against a fake root.

    function collectZapTargets(root, rules, options = {}) {
        const report = {
            applied: 0,
            refusedRules: 0,
            refusedNodes: 0,
            skippedRules: 0,
            invalidRules: 0,
            byRule: []
        };
        const targets = [];
        if (!root || typeof root.querySelectorAll !== 'function') {
            report.skippedRules = Array.isArray(rules) ? rules.length : 0;
            return { targets, report };
        }
        const maxMatches = Number.isFinite(options.maxMatchesPerRule)
            ? Math.max(1, Math.floor(options.maxMatchesPerRule))
            : MAX_MATCHES_PER_RULE;
        const seen = new Set();
        for (const rule of Array.isArray(rules) ? rules.slice(0, MAX_RULES) : []) {
            if (!rule || rule.enabled === false) {
                report.skippedRules += 1;
                continue;
            }
            if (!isStructuralSelector(rule.selector)) {
                report.invalidRules += 1;
                continue;
            }
            let matches;
            try {
                matches = Array.from(root.querySelectorAll(rule.selector));
            } catch (_) {
                // reason: a selector that parses under our grammar but that the
                // engine rejects is a bug in the grammar, not a reason to stop
                // applying the other rules.
                report.invalidRules += 1;
                continue;
            }
            if (matches.length > maxMatches) {
                report.refusedRules += 1;
                report.byRule.push({ selector: rule.selector, matched: matches.length, hidden: 0, refused: true });
                continue;
            }
            let hidden = 0;
            let refusedNodes = 0;
            for (const node of matches) {
                if (refusalFor(node)) {
                    refusedNodes += 1;
                    continue;
                }
                if (seen.has(node)) continue;
                seen.add(node);
                targets.push({ node, rule });
                hidden += 1;
            }
            report.applied += hidden;
            report.refusedNodes += refusedNodes;
            report.byRule.push({ selector: rule.selector, matched: matches.length, hidden, refused: false });
        }
        return { targets, report };
    }

    const api = {
        ELEMENT_ZAPPER_FEATURE_ID: FEATURE_ID,
        ELEMENT_ZAPPER_MAX_RULES: MAX_RULES,
        ELEMENT_ZAPPER_MAX_MATCHES_PER_RULE: MAX_MATCHES_PER_RULE,
        ELEMENT_ZAPPER_REFUSAL_REASONS: REFUSAL_REASONS,
        ELEMENT_ZAPPER_ALLOWED_ATTRIBUTES: Object.freeze([...ALLOWED_ATTRIBUTES]),
        collectZapTargets,
        createZapperRule,
        deriveStructuralSelector,
        isStructuralSelector,
        parseStructuralSelector,
        sanitizeZapperRule,
        sanitizeZapperRules,
        zapperRefusalFor: refusalFor
    };

    Object.assign(core, api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
