(() => {
    'use strict';

    // extension/core/hide-attribution.js
    //
    // v4.68.0 — one marker for every card Astra Deck hides.
    //
    // Video Hider has explained its own hides since v4.57.0. Nothing else
    // did. `hideCollaborations`, `hidePlannedLivestreams` and
    // `removeAllShorts` each hide feed cards through their own private CSS
    // class or inline style, with no trace of which feature did it — which
    // is why, during the v4.58.1 incident, turning Video Hider off cleared
    // nothing: the cards were being hidden by a different feature entirely
    // and there was no way for anyone, user or maintainer, to tell.
    //
    // Every hider now stamps the same two data attributes:
    //
    //   data-ytkit-hidden-by    the feature id that hid it
    //   data-ytkit-hidden-rule  the rule inside that feature which matched
    //
    // and increments a per-navigation counter. The marker is the contract:
    // the note beside the card, the "which feature hid these?" answer, and
    // the diagnostics-bundle counts all read from it, so a feature that
    // stamps it gets all three for free.
    //
    // Pure DOM + counters. No settings reads, no i18n — callers pass in the
    // already-translated note text so this module stays testable headless.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.markCardHidden) return;

    const HIDDEN_BY_ATTR = 'data-ytkit-hidden-by';
    const HIDDEN_RULE_ATTR = 'data-ytkit-hidden-rule';
    const NOTE_CLASS = 'ytkit-hidden-note';

    // Counters are per navigation, not per session: "42 cards hidden" is only
    // meaningful against one feed. Bounded so a pathological page cannot grow
    // the map without limit.
    const MAX_TRACKED_FEATURES = 64;
    const MAX_TRACKED_RULES = 32;
    let counts = new Map();

    // Notes are keyed by the card so a re-judged card updates its own note
    // instead of accumulating siblings. WeakMap: a card removed from the DOM
    // must not be retained by this module.
    const notes = new WeakMap();

    function normalizeId(value) {
        return String(value || '').trim().slice(0, 120);
    }

    function bump(featureId, featureName, rule) {
        let entry = counts.get(featureId);
        if (!entry) {
            if (counts.size >= MAX_TRACKED_FEATURES) return null;
            entry = { featureId, featureName: featureName || featureId, hidden: 0, rules: Object.create(null) };
            counts.set(featureId, entry);
        }
        if (featureName) entry.featureName = featureName;
        entry.hidden += 1;
        const ruleKey = normalizeId(rule) || 'matched';
        if (entry.rules[ruleKey] != null || Object.keys(entry.rules).length < MAX_TRACKED_RULES) {
            entry.rules[ruleKey] = (entry.rules[ruleKey] || 0) + 1;
        }
        return entry;
    }

    // Returns true when this call is the one that hid the card, so callers can
    // avoid re-doing work on every mutation tick.
    function markCardHidden(element, options = {}) {
        if (!element || element.nodeType !== 1) return false;
        const featureId = normalizeId(options.featureId);
        if (!featureId) return false;
        const rule = normalizeId(options.rule) || 'matched';
        const previousFeature = element.getAttribute(HIDDEN_BY_ATTR);
        const previousRule = element.getAttribute(HIDDEN_RULE_ATTR);
        if (previousFeature === featureId && previousRule === rule) return false;
        element.setAttribute(HIDDEN_BY_ATTR, featureId);
        element.setAttribute(HIDDEN_RULE_ATTR, rule);
        // Only count a genuine transition. A card re-judged by the SAME
        // feature under a different rule is one card, not two, so the count
        // moves between rules rather than inflating the feature total.
        if (previousFeature !== featureId) bump(featureId, options.featureName, rule);
        else {
            const entry = counts.get(featureId);
            const ruleKey = rule;
            if (entry) {
                if (previousRule && entry.rules[previousRule] > 0) entry.rules[previousRule] -= 1;
                if (entry.rules[ruleKey] != null || Object.keys(entry.rules).length < MAX_TRACKED_RULES) {
                    entry.rules[ruleKey] = (entry.rules[ruleKey] || 0) + 1;
                }
            }
        }
        return true;
    }

    // A feature may only clear a marker it owns. Without that check, two
    // hiders judging the same card would clear each other's attribution and
    // the note would flicker between them.
    function unmarkCardHidden(element, featureId) {
        if (!element || element.nodeType !== 1) return false;
        const id = normalizeId(featureId);
        const owner = element.getAttribute(HIDDEN_BY_ATTR);
        if (!owner || (id && owner !== id)) return false;
        element.removeAttribute(HIDDEN_BY_ATTR);
        element.removeAttribute(HIDDEN_RULE_ATTR);
        removeHiddenNote(element);
        const entry = counts.get(owner);
        if (entry && entry.hidden > 0) entry.hidden -= 1;
        return true;
    }

    function describeHiddenCard(element) {
        if (!element || element.nodeType !== 1) return null;
        const featureId = element.getAttribute(HIDDEN_BY_ATTR);
        if (!featureId) return null;
        return { featureId, rule: element.getAttribute(HIDDEN_RULE_ATTR) || 'matched' };
    }

    function removeHiddenNote(element) {
        const note = notes.get(element);
        if (note) {
            note.remove();
            notes.delete(element);
        }
    }

    // The note is a SIBLING, not a child: the card itself is display:none, so
    // anything inside it is invisible too. role="status" rather than a live
    // region — a feed pass can hide dozens of cards at once and announcing
    // each one would flood a screen reader.
    function syncHiddenNote(element, options = {}) {
        if (!element || element.nodeType !== 1) return null;
        const doc = element.ownerDocument;
        if (!options.enabled || !element.parentNode || !doc) {
            removeHiddenNote(element);
            return null;
        }
        const text = String(options.text || '').trim();
        if (!text) {
            removeHiddenNote(element);
            return null;
        }
        let note = notes.get(element);
        if (note && !note.isConnected) {
            notes.delete(element);
            note = null;
        }
        if (!note) {
            note = doc.createElement('div');
            note.className = NOTE_CLASS;
            note.setAttribute('role', 'status');
            notes.set(element, note);
            element.parentNode.insertBefore(note, element.nextSibling);
        }
        note.textContent = text;
        note.setAttribute('aria-label', text);
        const described = describeHiddenCard(element);
        if (described) {
            note.dataset.ytkitHiddenBy = described.featureId;
            note.dataset.ytkitHiddenRule = described.rule;
        }
        return note;
    }

    function getHideAttributionCounts() {
        return Array.from(counts.values(), (entry) => ({
            featureId: entry.featureId,
            featureName: entry.featureName,
            hidden: entry.hidden,
            rules: { ...entry.rules }
        })).sort((a, b) => b.hidden - a.hidden || (a.featureId < b.featureId ? -1 : 1));
    }

    function resetHideAttribution() {
        counts = new Map();
    }

    Object.assign(core, {
        HIDE_ATTRIBUTION_ATTRS: Object.freeze({
            feature: HIDDEN_BY_ATTR,
            rule: HIDDEN_RULE_ATTR,
            noteClass: NOTE_CLASS
        }),
        describeHiddenCard,
        getHideAttributionCounts,
        markCardHidden,
        removeHiddenNote,
        resetHideAttribution,
        syncHiddenNote,
        unmarkCardHidden
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            describeHiddenCard,
            getHideAttributionCounts,
            markCardHidden,
            removeHiddenNote,
            resetHideAttribution,
            syncHiddenNote,
            unmarkCardHidden
        };
    }
})();
