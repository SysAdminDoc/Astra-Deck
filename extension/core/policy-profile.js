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

        function isPlainObject(value) {
            return !!value && typeof value === 'object' && !Array.isArray(value);
        }

        function isSafeObjectKey(key) {
            return typeof key === 'string'
                && key !== '__proto__'
                && key !== 'prototype'
                && key !== 'constructor';
        }

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
        //   api[_-]?key anywhere      — catches apikey_v2 / apiKey1 / api_key
        //   bearer anywhere           — catches bearerToken / bearer_secret
        //   secret anywhere           — catches webhookSecret etc.
        //   password/credential       — catches conventional auth stores
        //   private/access/etc. Key   — catches common keypair/token aliases
        //   cookies?/cookieJar        — catches accidental cookie snapshots
        //   ^auth / _auth / Auth$     — catches authToken / apiAuth / userAuth
        //
        // The negative-lookahead on `api[_-]?key(?![_-]?id$)` prevents matching
        // benign keys that store an ID-of-API-key rather than the key
        // itself (none today, but a defensive carve-out).
        const ALWAYS_SCRUB_KEY_PATTERNS = Object.freeze([
            /apiKey$/i,
            /^aiSummaryApiKey$/,
            /token$/i,
            // Broader patterns added in v4.47.0 R6.
            /api[_-]?key(?![_-]?id$)/i,
            /bearer/i,
            /secret/i,
            /password/i,
            /credential/i,
            /(?:^|[a-z])(?:private|access|refresh|session|signing)Key$/i,
            /cookies?$/i,
            /cookieJar$/i,
            // Two patterns for camelCase "auth" coverage:
            //   /^auth/i        — settings starting with "auth" (authToken)
            //   /[a-z]Auth/     — camelCase "Auth" mid-word (userAuth)
            // Combined with the no-current-conflicting-keys check
            // (no schema key today contains "author" or similar) so
            // the broad coverage doesn't cause false positives.
            /^auth/i,
            /[a-z]Auth/,
            /pinHash/i,
            /^ytkit-da-user-id$/,
        ]);

        function shouldScrubKey(key) {
            if (typeof key !== 'string' || key.length === 0) return false;
            return ALWAYS_SCRUB_KEY_PATTERNS.some((re) => re.test(key));
        }

        function isSettingValueValid(value, entry) {
            if (!entry || typeof entry.type !== 'string') return false;
            switch (entry.type) {
            case 'boolean':
                return typeof value === 'boolean';
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && Number.isFinite(value);
            case 'array':
                return Array.isArray(value);
            case 'object':
                return isPlainObject(value);
            case 'null':
                // Nullable-complex settings (e.g. `sidebarOrder` holds an array,
                // `lowPowerProfileBackup` holds an object) default to null but are
                // populated with an array/object at runtime once the user customizes
                // them. The schema models them as `type: "null"` because the default
                // IS null (check-settings enforces type==defaultValue runtime type),
                // so the validator must accept the populated runtime shapes — otherwise
                // export/import hard-fails for anyone who reordered their sidebar.
                return value === null || Array.isArray(value) || isPlainObject(value);
            default:
                return false;
            }
        }

        // Narrow an already-type-valid value to its schema constraints. We
        // CLAMP numbers into [min, max] and COERCE an unrecognized enum value
        // back to the schema default rather than rejecting — a corrupted or
        // hostile import (e.g. videosPerRow: 9999, videoRotationAngle: 47)
        // is sanitized into a safe value instead of breaking the whole import
        // (validateSettingsSnapshot rejects the entire snapshot on any error).
        function clampSettingValue(value, entry) {
            if (Array.isArray(entry.enum) && entry.enum.length) {
                return entry.enum.includes(value) ? value : entry.defaultValue;
            }
            if (entry.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
                let v = value;
                if (typeof entry.min === 'number' && v < entry.min) v = entry.min;
                if (typeof entry.max === 'number' && v > entry.max) v = entry.max;
                return v;
            }
            return value;
        }

        function validateSettingsSnapshot(settings = {}, options = {}) {
            const allowUnknown = options.allowUnknown === true;
            const errors = [];
            const out = {};

            if (!isPlainObject(settings)) {
                return {
                    ok: false,
                    errors: ['settings must be a plain object'],
                    settings: out
                };
            }

            for (const [key, value] of Object.entries(settings)) {
                if (!isSafeObjectKey(key)) {
                    errors.push(`unsafe setting key "${key}"`);
                    continue;
                }

                const entry = findEntry(key);
                if (!entry) {
                    if (allowUnknown) {
                        out[key] = value;
                    } else {
                        errors.push(`unknown setting "${key}"`);
                    }
                    continue;
                }

                if (!isSettingValueValid(value, entry)) {
                    errors.push(`invalid type for "${key}": expected ${entry.type}`);
                    continue;
                }

                out[key] = clampSettingValue(value, entry);
            }

            return {
                ok: errors.length === 0,
                errors,
                settings: out
            };
        }

        // Build a scrubbed snapshot suitable for export. Removes
        // always-scrub keys and replaces github-full-only entries with
        // their schema default when exporting under store-safe.
        function buildExportSnapshot(settings = {}, options = {}) {
            const effective = options.effective || resolveEffectiveProfile(settings);
            const schemaOnly = options.schemaOnly === true;
            const out = {};
            const scrubbedKeys = [];
            const defaultedKeys = [];
            for (const key of Object.keys(settings)) {
                if (shouldScrubKey(key)) {
                    scrubbedKeys.push(key);
                    continue;
                }
                const entry = findEntry(key);
                if (!entry) {
                    // Unknown non-secret keys travel through opaquely
                    // (forward-compat with newer schema versions). Unknown
                    // secret-shaped keys were already removed by the scrubber.
                    if (schemaOnly) continue;
                    out[key] = settings[key];
                    continue;
                }
                if (entry.profile === 'github-full' && effective === 'store-safe') {
                    out[key] = entry.defaultValue;
                    defaultedKeys.push(key);
                    continue;
                }
                out[key] = settings[key];
            }
            return { settings: out, effective, scrubbedKeys, defaultedKeys };
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
            isSettingValueValid,
            clampSettingValue,
            validateSettingsSnapshot,
            buildExportSnapshot,
            countByProfile
        };
    }

    core.createPolicyProfile = createPolicyProfile;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createPolicyProfile };
    }
})();
