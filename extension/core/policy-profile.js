(() => {
    'use strict';

    // extension/core/policy-profile.js
    //
    // v5.0.0 store-safe vs github-full profile resolver. Drives:
    //   - Which schema entries are allowed to apply in the current profile.
    //   - The popup gate that hides github-full-only toggles behind the
    //     `githubFullProfile` opt-in.
    //   - The data-flow panel's per-entry "available here" badge.
    //   - The export scrubber, which masks API keys + github-full-only
    //     keys when exporting under the store-safe profile.
    //
    // Profile resolution rules:
    //   - safeStoreProfile=true (default) AND githubFullProfile=false
    //       → effective profile = 'store-safe'
    //   - safeStoreProfile=false OR githubFullProfile=true
    //       → effective profile = 'github-full'
    //   - Both true is a contradictory user state — we resolve to
    //     'github-full' (most permissive) so the user's opt-in wins
    //     over the safer default; the popup is expected to surface a
    //     warning chip when both are set so the contradiction is visible.
    //
    // Entry visibility rules (given an effective profile):
    //   - profile === 'both'            → always visible
    //   - profile === 'store-safe'      → always visible (subset)
    //   - profile === 'github-full'     → visible only when effective is 'github-full'
    //
    // The resolver intentionally does NOT decide whether an API origin is
    // dialled; that lives in the data-flow panel. Policy-profile only
    // gates schema entries.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createPolicyProfile) return;

    const schemaScope = (typeof window !== 'undefined' && window.__YTKIT_SETTINGS_SCHEMA__)
        || (typeof module !== 'undefined' && module.exports && (function tryLoad() {
            try { return require('./settings-schema'); } catch (_) { return null; }
        })());

    function createPolicyProfile(options = {}) {
        const schema = options.schema || (schemaScope ? schemaScope.SETTINGS_SCHEMA : []);
        const findEntry = options.findSettingEntry
            || (schemaScope && schemaScope.findSettingEntry)
            || ((key) => schema.find((e) => e.key === key) || null);

        function resolveEffectiveProfile(settings = {}) {
            const safe = settings.safeStoreProfile !== false;          // default true
            const full = settings.githubFullProfile === true;          // default false
            if (full) return 'github-full';
            if (!safe) return 'github-full';
            return 'store-safe';
        }

        function isEntryAllowedInProfile(entry, effective) {
            if (!entry) return false;
            // Internal storage-only keys are always permitted — they
            // travel through import/export but are never surfaced as
            // user-visible toggles.
            if (entry.internal) return true;
            if (entry.profile === 'both') return true;
            if (entry.profile === 'store-safe') return true;
            if (entry.profile === 'github-full') return effective === 'github-full';
            return false;
        }

        function isKeyAllowedInProfile(key, effective) {
            return isEntryAllowedInProfile(findEntry(key), effective);
        }

        // Filter a {key: value} settings bag to the keys allowed under the
        // current profile. Used by the popup's visible-toggle list and by
        // the export scrubber when generating a store-safe snapshot.
        function filterSettingsForProfile(settings = {}, effective) {
            const eff = effective || resolveEffectiveProfile(settings);
            const out = {};
            for (const key of Object.keys(settings)) {
                if (isKeyAllowedInProfile(key, eff)) out[key] = settings[key];
            }
            return out;
        }

        // Identify keys whose VALUES should never be persisted in a
        // shared/sync export under any profile. Anything carrying a
        // secret (BYO API key) lands here regardless of the user's
        // sync allowlist.
        //
        // v4.47.0 R6: regex set broadened. Previous coverage only
        // matched the *suffix* `apiKey$` / `token$` plus the exact
        // `aiSummaryApiKey`. A user-supplied key named `apikey_v2`
        // or `bearerToken` would have slipped through because the
        // anchored suffix didn't fire on the underscore-separator or
        // the `bearer` prefix. New patterns:
        //
        //   apikey(?!_id$) anywhere  — catches apikey_v2 / apiKey1 / api_key
        //   bearer anywhere           — catches bearerToken / bearer_secret
        //   secret anywhere           — catches webhookSecret etc.
        //   ^auth / _auth / Auth$    — catches authToken / apiAuth / userAuth
        //
        // The negative-lookahead on `apikey(?!_id$)` prevents matching
        // benign keys that store an ID-of-API-key rather than the key
        // itself (none today, but a defensive carve-out).
        const ALWAYS_SCRUB_KEY_PATTERNS = Object.freeze([
            /apiKey$/i,
            /^aiSummaryApiKey$/,
            /token$/i,
            // Broader patterns added in v4.47.0 R6.
            /apikey(?!_id$)/i,
            /bearer/i,
            /secret/i,
            // Two patterns for camelCase "auth" coverage:
            //   /^auth/i        — settings starting with "auth" (authToken)
            //   /[a-z]Auth/     — camelCase "Auth" mid-word (userAuth)
            // Combined with the no-current-conflicting-keys check
            // (no schema key today contains "author" or similar) so
            // the broad coverage doesn't cause false positives.
            /^auth/i,
            /[a-z]Auth/,
        ]);

        function shouldScrubKey(key) {
            return ALWAYS_SCRUB_KEY_PATTERNS.some((re) => re.test(key));
        }

        // Build a scrubbed snapshot suitable for export. Removes
        // always-scrub keys and replaces github-full-only entries with
        // their schema default when exporting under store-safe.
        function buildExportSnapshot(settings = {}, options = {}) {
            const effective = options.effective || resolveEffectiveProfile(settings);
            const out = {};
            for (const key of Object.keys(settings)) {
                if (shouldScrubKey(key)) continue;
                const entry = findEntry(key);
                if (!entry) {
                    // Unknown keys travel through opaquely (forward-compat
                    // with newer schema versions); never scrubbed here.
                    out[key] = settings[key];
                    continue;
                }
                if (entry.profile === 'github-full' && effective === 'store-safe') {
                    out[key] = entry.defaultValue;
                    continue;
                }
                out[key] = settings[key];
            }
            return { settings: out, effective };
        }

        // Compute counts for the data-flow panel: how many keys are
        // visible vs hidden under the current profile.
        function countByProfile(effective) {
            const visible = [];
            const hidden = [];
            for (const entry of schema) {
                if (entry.internal) continue;
                if (isEntryAllowedInProfile(entry, effective)) visible.push(entry.key);
                else hidden.push(entry.key);
            }
            return { visible, hidden, effective };
        }

        return {
            resolveEffectiveProfile,
            isEntryAllowedInProfile,
            isKeyAllowedInProfile,
            filterSettingsForProfile,
            shouldScrubKey,
            buildExportSnapshot,
            countByProfile
        };
    }

    core.createPolicyProfile = createPolicyProfile;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createPolicyProfile };
    }
})();
