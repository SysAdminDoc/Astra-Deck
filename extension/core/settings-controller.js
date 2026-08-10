(() => {
    'use strict';

    const root = globalThis;
    const core = root.YTKitCore || (root.YTKitCore = {});
    if (core.createSettingsMutationController) return;

    const schemaScope = root.__YTKIT_SETTINGS_SCHEMA__
        || (typeof module !== 'undefined' && module.exports && (() => {
            try { return require('./settings-schema'); } catch (_) { return null; }
        })());
    const DEFAULT_STORAGE_KEY = 'ytSuiteSettings';
    const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function isSafeKey(key) {
        return typeof key === 'string' && key.length > 0 && !UNSAFE_KEYS.has(key);
    }

    function cloneValue(value) {
        if (value === undefined || value === null || typeof value !== 'object') return value;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (_) { /* reason: use the JSON fallback below */ }
        }
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    function sameValue(left, right) {
        if (Object.is(left, right)) return true;
        try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
    }

    function copySettings(value) {
        if (!isPlainObject(value)) return {};
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            if (isSafeKey(key)) out[key] = cloneValue(item);
        }
        return out;
    }

    function normalizeProfileModel(settings, intentKey = '', intentValue = undefined) {
        const next = copySettings(settings);
        if (intentKey === 'githubFullProfile') {
            next.githubFullProfile = intentValue === true;
            next.safeStoreProfile = !next.githubFullProfile;
            return next;
        }
        if (intentKey === 'safeStoreProfile') {
            next.safeStoreProfile = intentValue === true;
            next.githubFullProfile = !next.safeStoreProfile;
            return next;
        }
        if (next.githubFullProfile === true || next.safeStoreProfile === false) {
            next.githubFullProfile = true;
            next.safeStoreProfile = false;
        } else {
            next.githubFullProfile = false;
            next.safeStoreProfile = true;
        }
        return next;
    }

    function effectiveProfile(settings) {
        return settings.githubFullProfile === true || settings.safeStoreProfile === false
            ? 'github-full'
            : 'store-safe';
    }

    // This is the validation choke point for every cross-context settings
    // write, but it bounded numbers and enums only: a single oversized string,
    // array or object went straight into storage and left the quota failure to
    // be discovered later, by which point every write was in backoff.
    const MAX_SETTING_STRING_LENGTH = 256 * 1024;
    const MAX_SETTING_ITEMS = 20000;
    const MAX_SETTING_SERIALISED_BYTES = 1024 * 1024;

    function withinSizeBudget(value) {
        try {
            const serialised = JSON.stringify(value);
            return typeof serialised !== 'string' || serialised.length <= MAX_SETTING_SERIALISED_BYTES;
        } catch (_) {
            return false;
        }
    }

    function isValueValid(value, entry) {
        if (!entry) return false;
        switch (entry.type) {
        case 'boolean': return typeof value === 'boolean';
        case 'string': return typeof value === 'string' && value.length <= MAX_SETTING_STRING_LENGTH;
        case 'number': return typeof value === 'number' && Number.isFinite(value);
        case 'array': return Array.isArray(value)
            && value.length <= MAX_SETTING_ITEMS
            && withinSizeBudget(value);
        case 'object': return isPlainObject(value) && withinSizeBudget(value);
        case 'null': return value === null || Array.isArray(value) || isPlainObject(value);
        default: return false;
        }
    }

    function clampValue(value, entry) {
        if (Array.isArray(entry.enum) && entry.enum.length) {
            return entry.enum.includes(value) ? value : cloneValue(entry.defaultValue);
        }
        if (entry.type === 'number') {
            let next = value;
            if (typeof entry.min === 'number') next = Math.max(entry.min, next);
            if (typeof entry.max === 'number') next = Math.min(entry.max, next);
            return next;
        }
        return cloneValue(value);
    }

    function failure(code, message, details = {}) {
        return {
            ok: false,
            persisted: false,
            ...details,
            error: { code, message }
        };
    }

    function createSettingsMutationController(options = {}) {
        const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
        const findEntry = options.findSettingEntry
            || schemaScope?.findSettingEntry
            || ((key) => (schemaScope?.SETTINGS_SCHEMA || []).find((entry) => entry.key === key) || null);
        const storage = options.storage
            || root.YTKitBrowser?.storage?.local
            || root.chrome?.storage?.local
            || root.browser?.storage?.local
            || null;
        const runtime = options.runtime
            || root.YTKitBrowser?.runtime
            || root.chrome?.runtime
            || root.browser?.runtime
            || null;
        const source = String(options.source || 'unknown').slice(0, 48);
        const local = options.local === true
            || typeof options.readSettings === 'function'
            || typeof options.writeSettings === 'function';
        let chain = Promise.resolve();

        function enqueue(operation) {
            const task = chain.catch(() => undefined).then(operation);
            chain = task;
            return task;
        }

        async function readSettings() {
            if (typeof options.readSettings === 'function') {
                return copySettings(await options.readSettings());
            }
            if (!storage?.get) throw new Error('Extension settings storage is unavailable.');
            const result = await storage.get(storageKey);
            return copySettings(result?.[storageKey]);
        }

        async function writeSettings(settings) {
            if (typeof options.writeSettings === 'function') {
                await options.writeSettings(copySettings(settings));
                return;
            }
            if (!storage?.set) throw new Error('Extension settings storage is unavailable.');
            await storage.set({ [storageKey]: copySettings(settings) });
        }

        function validateReplacement(proposed, current) {
            if (!isPlainObject(proposed)) {
                return failure('INVALID_SETTINGS', 'Settings must be a plain object.', { settings: current });
            }
            const next = normalizeProfileModel(proposed);
            for (const [key, rawValue] of Object.entries(next)) {
                if (!isSafeKey(key)) {
                    return failure('INVALID_SETTING_KEY', `Unsafe setting key: ${key}`, { settings: current });
                }
                if (key === '_settingsVersion') {
                    if (!Number.isInteger(rawValue) || rawValue < 1) {
                        return failure('INVALID_SETTING_VALUE', 'The settings version must be a positive integer.', {
                            key, previous: current[key], value: current[key], settings: current
                        });
                    }
                    continue;
                }
                const entry = findEntry(key);
                if (!entry) {
                    if (Object.prototype.hasOwnProperty.call(current, key) && sameValue(current[key], rawValue)) continue;
                    return failure('UNKNOWN_SETTING', `Unknown setting: ${key}`, {
                        key, previous: current[key], value: current[key], settings: current
                    });
                }
                if (!isValueValid(rawValue, entry)) {
                    return failure('INVALID_SETTING_VALUE', `Invalid value for ${key}; expected ${entry.type}.`, {
                        key, previous: current[key], value: current[key], settings: current
                    });
                }
                next[key] = clampValue(rawValue, entry);
            }

            const profile = effectiveProfile(next);
            for (const [key, value] of Object.entries(next)) {
                const entry = findEntry(key);
                if (!entry || sameValue(current[key], value)) continue;
                if (entry.profile === 'github-full' && profile !== 'github-full'
                    && !sameValue(value, entry.defaultValue)) {
                    return failure('PROFILE_BLOCKED', `${key} requires the GitHub-full profile.`, {
                        key, previous: current[key], value: current[key], settings: current
                    });
                }
            }
            return { ok: true, settings: next };
        }

        async function localMutate(key, requestedValue) {
            let current = {};
            try {
                current = await readSettings();
                if (!isSafeKey(key)) {
                    return failure('INVALID_SETTING_KEY', 'The setting key is invalid.', {
                        key, previous: undefined, value: undefined, settings: current
                    });
                }
                const entry = findEntry(key);
                if (!entry) {
                    return failure('UNKNOWN_SETTING', `Unknown setting: ${key}`, {
                        key, previous: current[key], value: current[key], settings: current
                    });
                }
                if (!isValueValid(requestedValue, entry)) {
                    return failure('INVALID_SETTING_VALUE', `Invalid value for ${key}; expected ${entry.type}.`, {
                        key, previous: current[key], value: current[key], settings: current
                    });
                }
                const value = clampValue(requestedValue, entry);
                let next = { ...current, [key]: value };
                next = normalizeProfileModel(next, key, value);
                if (entry.profile === 'github-full' && effectiveProfile(next) !== 'github-full'
                    && !sameValue(value, entry.defaultValue)) {
                    return failure('PROFILE_BLOCKED', `${key} requires the GitHub-full profile.`, {
                        key, previous: current[key], value: current[key], settings: current
                    });
                }
                await writeSettings(next);
                const result = {
                    ok: true,
                    persisted: true,
                    key,
                    previous: cloneValue(current[key]),
                    value: cloneValue(next[key]),
                    settings: copySettings(next)
                };
                if (typeof options.onPersisted === 'function') await options.onPersisted(result);
                return result;
            } catch (error) {
                return failure('STORAGE_WRITE_FAILED', error?.message || 'Settings could not be saved.', {
                    key, previous: current[key], value: current[key], settings: current
                });
            }
        }

        async function localReplace(proposed) {
            let current = {};
            try {
                current = await readSettings();
                const validation = validateReplacement(proposed, current);
                if (!validation.ok) return validation;
                await writeSettings(validation.settings);
                const result = {
                    ok: true,
                    persisted: true,
                    previous: current,
                    value: copySettings(validation.settings),
                    settings: copySettings(validation.settings)
                };
                if (typeof options.onPersisted === 'function') await options.onPersisted(result);
                return result;
            } catch (error) {
                return failure('STORAGE_WRITE_FAILED', error?.message || 'Settings could not be saved.', {
                    previous: current,
                    value: current,
                    settings: current
                });
            }
        }

        async function localMutateMany(changes) {
            let current = {};
            try {
                current = await readSettings();
                if (!isPlainObject(changes)) {
                    return failure('INVALID_SETTINGS', 'Setting changes must be a plain object.', {
                        previous: current, value: current, settings: current
                    });
                }

                let next = { ...current };
                for (const [key, value] of Object.entries(changes)) {
                    if (!isSafeKey(key)) {
                        return failure('INVALID_SETTING_KEY', `Unsafe setting key: ${key}`, {
                            key, previous: current[key], value: current[key], settings: current
                        });
                    }
                    next[key] = cloneValue(value);
                }

                if (Object.prototype.hasOwnProperty.call(changes, 'githubFullProfile')) {
                    next = normalizeProfileModel(next, 'githubFullProfile', changes.githubFullProfile);
                } else if (Object.prototype.hasOwnProperty.call(changes, 'safeStoreProfile')) {
                    next = normalizeProfileModel(next, 'safeStoreProfile', changes.safeStoreProfile);
                }

                const validation = validateReplacement(next, current);
                if (!validation.ok) return validation;
                if (!sameValue(validation.settings, current)) {
                    await writeSettings(validation.settings);
                }
                const result = {
                    ok: true,
                    persisted: true,
                    previous: current,
                    value: copySettings(validation.settings),
                    settings: copySettings(validation.settings)
                };
                if (typeof options.onPersisted === 'function') await options.onPersisted(result);
                return result;
            } catch (error) {
                return failure('STORAGE_WRITE_FAILED', error?.message || 'Settings could not be saved.', {
                    previous: current,
                    value: current,
                    settings: current
                });
            }
        }

        async function sendRequest(message) {
            if (!runtime?.sendMessage) {
                return failure('MUTATION_SERVICE_UNAVAILABLE', 'The settings service is unavailable.', {
                    key: message.key, previous: undefined, value: undefined, settings: null
                });
            }
            try {
                const result = await runtime.sendMessage({ ...message, source });
                if (!result || typeof result.ok !== 'boolean' || typeof result.persisted !== 'boolean') {
                    return failure('INVALID_MUTATION_RESPONSE', 'The settings service returned an invalid response.', {
                        key: message.key, previous: undefined, value: undefined, settings: null
                    });
                }
                return result;
            } catch (error) {
                return failure('MUTATION_SERVICE_UNAVAILABLE', error?.message || 'The settings service is unavailable.', {
                    key: message.key, previous: undefined, value: undefined, settings: null
                });
            }
        }

        return Object.freeze({
            mutate(key, value) {
                return enqueue(() => local
                    ? localMutate(key, value)
                    : sendRequest({ type: 'YTKIT_MUTATE_SETTING', key, value }));
            },
            mutateMany(changes) {
                return enqueue(() => local
                    ? localMutateMany(changes)
                    : sendRequest({ type: 'YTKIT_MUTATE_SETTINGS', changes }));
            },
            replace(settings) {
                return enqueue(() => local
                    ? localReplace(settings)
                    : sendRequest({ type: 'YTKIT_REPLACE_SETTINGS', settings }));
            }
        });
    }

    Object.assign(core, {
        createSettingsMutationController,
        normalizeSettingsProfileModel: normalizeProfileModel
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createSettingsMutationController,
            effectiveProfile,
            normalizeProfileModel
        };
    }
})();
