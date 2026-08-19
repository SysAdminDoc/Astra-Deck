(() => {
    'use strict';

    // extension/core/dialog-guard.js
    //
    // v4.70.0 — the one rule every programmatic click on YouTube's own dialogs
    // has to obey: never click inside a dialog that exists to verify who the
    // user is.
    //
    // YouTube's AI age/identity-verification interstitials are COMPLIANCE
    // dialogs. Auto-answering one is not a UX shortcut, it is an account
    // action taken on the user's behalf without their knowledge, and the 2026
    // rollout produced documented account restrictions for exactly that. The
    // same applies to consent bumps and captcha/challenge surfaces.
    //
    // Why this is a denylist of SELF-DESCRIBING STRUCTURE and not a list of
    // renderer names: this repository will not ship selectors it could not
    // verify against a live DOM, and the verification surfaces cannot be
    // captured offline. So instead of guessing which renderer YouTube uses
    // this month, the guard matches non-localized structural tokens that
    // appear in element names, ids, and a small set of attributes — consent,
    // verify, identity, age gates, captcha, challenge, sign-in. Element names
    // and ids do not translate, so this holds in every locale, unlike a text
    // match.
    //
    // The asymmetry that makes this safe: a FALSE POSITIVE costs one skipped
    // auto-click, and every caller in this repository already handles "the
    // click did not happen" (they fall back to positive evidence, or simply
    // leave the dialog alone for the user). A FALSE NEGATIVE costs the user's
    // account standing. So the guard is deliberately eager, and callers must
    // treat a refusal as normal, never as an error.
    //
    // Pure and DOM-shaped only: it reads names/ids/attributes off nodes it is
    // handed. No settings, no network, no YouTube knowledge beyond the tokens
    // below.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.isComplianceDialog) return;

    // Structural tokens, matched against tag names, ids, and the attributes
    // listed below. All are English-rooted DOM identifiers, not UI copy —
    // YouTube ships the same element names to every locale.
    const COMPLIANCE_TOKENS = /(?:consent|captcha|challenge|verif|identity|ident-|age[-_]?(?:gate|check|verif|restrict)|birthday|date[-_]?of[-_]?birth|sign[-_]?in|signin|login|passkey|credential|payment|purchase|billing)/i;

    // Attributes worth reading. `is` and `class` catch view-model hosts (the
    // camelCase `...ViewModel` shells YouTube increasingly renders), the rest
    // are the stable hooks a dialog describes itself with.
    const SCANNED_ATTRIBUTES = ['id', 'class', 'is', 'role', 'aria-labelledby', 'aria-describedby', 'data-purpose', 'data-testid'];

    // How far up from a clicked node to look for a dialog host. Deep enough to
    // escape a button's own wrapper chain, bounded so a hostile or unusual
    // tree cannot turn this into a long walk on every click.
    const MAX_ANCESTOR_DEPTH = 24;

    function describesCompliance(element) {
        if (!element || typeof element !== 'object') return false;
        const tag = String(element.tagName || element.nodeName || '');
        if (tag && COMPLIANCE_TOKENS.test(tag)) return true;
        for (const name of SCANNED_ATTRIBUTES) {
            let value = '';
            try {
                value = typeof element.getAttribute === 'function' ? element.getAttribute(name) : null;
            } catch {
                // reason: a detached or exotic node can throw on attribute
                // access; treat it as carrying no evidence rather than
                // failing the whole guard.
                value = null;
            }
            if (value && COMPLIANCE_TOKENS.test(String(value))) return true;
        }
        return false;
    }

    // True when `element` is, or sits inside, something that self-describes as
    // a verification/consent/challenge surface.
    function isComplianceDialog(element) {
        let node = element;
        let depth = 0;
        while (node && depth < MAX_ANCESTOR_DEPTH) {
            if (describesCompliance(node)) return true;
            node = node.parentElement || null;
            depth += 1;
        }
        return false;
    }

    // Scan a subtree (default: the document) for an OPEN compliance surface.
    // Used by features that click a well-known control elsewhere on the page
    // and need to know that a verification dialog is currently up at all —
    // clicking anything while one is open can dismiss or answer it.
    function findComplianceDialog(root) {
        const scope = root || (typeof document !== 'undefined' ? document : null);
        if (!scope || typeof scope.querySelectorAll !== 'function') return null;
        let candidates;
        try {
            candidates = scope.querySelectorAll('tp-yt-paper-dialog, tp-yt-iron-overlay-backdrop, [role="dialog"], [role="alertdialog"], ytd-popup-container > *, [aria-modal="true"]');
        } catch {
            // reason: a scope without full selector support (a test double, a
            // detached fragment) yields no evidence; fail open on detection
            // but the per-click guard still applies.
            return null;
        }
        for (const candidate of candidates) {
            if (!candidate) continue;
            if (describesCompliance(candidate)) return candidate;
            let descendant = null;
            try {
                descendant = typeof candidate.querySelector === 'function'
                    ? candidate.querySelector('[id],[class],[is]')
                    : null;
            } catch {
                // reason: same as above — no evidence, not an error.
                descendant = null;
            }
            if (descendant && describesCompliance(descendant)) return candidate;
            // A dialog whose own host is unremarkable can still contain a
            // verification shell; check the immediate children rather than
            // walking the whole subtree on every scan.
            const children = candidate.children || [];
            for (let index = 0; index < children.length && index < 16; index += 1) {
                if (describesCompliance(children[index])) return candidate;
            }
        }
        return null;
    }

    // The call every auto-click site should make. Refuses when the target
    // itself sits in a compliance surface, and when one is open anywhere in
    // the document — because a click that lands elsewhere can still dismiss a
    // modal that is currently demanding an answer.
    function isSafeToAutoClick(element, options) {
        if (!element) return false;
        if (isComplianceDialog(element)) return false;
        const scanDocument = !options || options.scanDocument !== false;
        if (scanDocument && findComplianceDialog(options && options.root)) return false;
        return true;
    }

    core.isComplianceDialog = isComplianceDialog;
    core.findComplianceDialog = findComplianceDialog;
    core.isSafeToAutoClick = isSafeToAutoClick;
})();
