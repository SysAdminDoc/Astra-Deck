(() => {
    'use strict';

    // Two one-click looks over the settings #52 made opt-in. They run on the
    // same recipe and backup machinery as the other presets, so turning one off
    // puts back what was there before, and the last one turned on wins for any
    // key both own.
    //
    //  - Astra Look: everything a fresh install used to start with.
    //  - Classic YouTube: today's defaults, for a profile that was migrated with
    //    the older look and wants the newer one without hunting for 18 toggles.
    const LOOKS = Object.freeze([
        Object.freeze({
            id: 'presetAstraLook',
            // i18n-static: resolved through feature_presetAstraLook_name at runtime
            name: 'Astra Look',
            // i18n-static: resolved through feature_presetAstraLook_desc at runtime
            description: 'Square corners, no left sidebar, denser grids, a restyled watch page, the Player Dock, and Theater Split. Toggle off to restore prior values.',
            icon: 'square',
            recipeKey: 'astraRecipe',
            backupKey: 'ytkit-preset-astra-look-backup',
            onKey: 'presetAstraLookOn',
            onFallback: 'Astra Look applied. Toggle off to restore.',
            offKey: 'presetAstraLookOff',
            offFallback: 'Astra Look off. Previous values restored.'
        }),
        Object.freeze({
            id: 'presetClassicLook',
            // i18n-static: resolved through feature_presetClassicLook_name at runtime
            name: 'Classic YouTube',
            // i18n-static: resolved through feature_presetClassicLook_desc at runtime
            description: "YouTube's own layout: rounded corners, the sidebar, avatars, related videos and the description, with Astra's clean-up still on. Toggle off to restore prior values.",
            icon: 'youtube',
            recipeKey: 'classicRecipe',
            backupKey: 'ytkit-preset-classic-look-backup',
            onKey: 'presetClassicLookOn',
            onFallback: 'Classic YouTube look applied. Toggle off to restore.',
            offKey: 'presetClassicLookOff',
            offFallback: 'Classic YouTube look off. Previous values restored.'
        })
    ]);

    function createLookPresetFeatures(deps = {}) {
        const {
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            buildPresetRecipeUpdate,
            buildPresetRestoreUpdate,
            commitPresetSettings,
            showToast = () => {},
            t = (_key, fallback) => fallback,
            logFailure = () => {}
        } = deps;
        if (typeof buildPresetRecipeUpdate !== 'function'
            || typeof buildPresetRestoreUpdate !== 'function'
            || typeof commitPresetSettings !== 'function') return [];

        return LOOKS.filter((look) => deps[look.recipeKey]).map((look) => ({
            id: look.id,
            name: look.name,
            description: look.description,
            group: 'Theme',
            icon: look.icon,
            _RECIPE: deps[look.recipeKey],
            _BACKUP_KEY: look.backupKey,
            _readBackup() {
                try {
                    return storageReadJSON(this._BACKUP_KEY, null) ?? null;
                } catch {
                    return null;
                }
            },
            _writeBackup(snapshot) {
                try {
                    storageWriteJSON(this._BACKUP_KEY, snapshot, { immediate: true });
                } catch (error) {
                    logFailure(`Backup write failed: ${error.message}`);
                }
            },
            _clearBackup() {
                try {
                    storageWriteJSON(this._BACKUP_KEY, null, { immediate: true });
                } catch {
                    // reason: an orphan record reads as "not a layer" while the
                    // preset is off (activePresetLayers), so this is non-critical
                }
            },
            _apply() {
                const { backup, next } = buildPresetRecipeUpdate(this._RECIPE, this.id);
                this._writeBackup(backup);
                commitPresetSettings(next);
                showToast(t(look.onKey, look.onFallback), '#22c55e', { duration: 5 });
            },
            _restore() {
                const backup = this._readBackup();
                if (!backup || typeof backup !== 'object') return;
                const next = buildPresetRestoreUpdate(this._RECIPE, backup, this.id);
                this._clearBackup();
                commitPresetSettings(next);
                showToast(t(look.offKey, look.offFallback), '#6b7280', { duration: 4 });
            },
            init() {
                if (this._readBackup()) return;
                this._apply();
            },
            destroy() {
                if (this._readBackup()) this._restore();
            }
        }));
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.lookPresets = Object.freeze({ createLookPresetFeatures, LOOKS });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createLookPresetFeatures, LOOKS };
    }
})();
