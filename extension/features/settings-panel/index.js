(() => {
    'use strict';

    // extension/features/settings-panel/index.js
    //
    // Monolith peel for the in-page settings panel. The module owns the
    // active panel open/close controller, renderer, search/filter state,
    // delegated UI listeners, and toggle state refresh path; ytkit.js keeps
    // the inline functions as a compatibility fallback.

    function createSettingsPanelRuntime(deps = {}) {
        const {
            BRAND,
            CATEGORY_CONFIG,
            CATEGORY_META,
            CONFLICT_MAP,
            DebugManager,
            FEATURE_PREVIEWS,
            ICONS,
            LEGACY_STORAGE_KEYS,
            MediaDLManager,
            PANEL_OPEN_CLASS,
            STORAGE_KEYS,
            StorageManager,
            YTKIT_VERSION,
            _i18n,
            _showPinDialog,
            _showPinManageDialog,
            appState,
            createBrandImage,
            createToast,
            destroyFeatureLifecycle,
            formatPageLabel,
            getFeatureById,
            getFeatureDescription,
            getFeatureName,
            getFocusableUiElements,
            handleExternalStorageChanges,
            handleFileExport,
            handleFileImport,
            initFeatureLifecycle,
            injectStyle,
            isBooleanFeature,
            isPinSet,
            liveFeatureList,
            normalizeSelectOptions,
            openExternalUrl,
            safeDestroyFeature,
            safeInitFeature,
            settingsManager,
            shouldBuildPrimaryUI,
            showToast,
            storageRead,
            storageReadJSON,
            storageWrite,
            t,
            trapFocusWithin
        } = deps;
        const getPinSessionUnlocked = typeof deps.getPinSessionUnlocked === 'function'
            ? deps.getPinSessionUnlocked
            : () => false;
        const getPageModalOpen = typeof deps.getPageModalOpen === 'function'
            ? deps.getPageModalOpen
            : () => false;
        const getFeatureCrashCounts = typeof deps.getFeatureCrashCounts === 'function'
            ? deps.getFeatureCrashCounts
            : () => ({});
        const persistCrashCounts = typeof deps.persistCrashCounts === 'function'
            ? deps.persistCrashCounts
            : () => {};

        let _panelCleanups = [];
        let _settingsPanelLastFocus = null;
        let _globalUIListenersAttached = false;
        let _panelUIListenersAttached = false;
        let _panelSearchUpdater = null;

function isSettingsPanelOpen() {
        return !!document.body?.classList.contains(PANEL_OPEN_CLASS);
    }

function setSettingsPanelOpen(open) {
        if (!document.body || !shouldBuildPrimaryUI()) return false;
        const wasOpen = isSettingsPanelOpen();
        if (open && !document.getElementById('ytkit-settings-panel')) buildSettingsPanel();
        const panel = document.getElementById('ytkit-settings-panel');
        if (open && !wasOpen && document.activeElement instanceof HTMLElement && !panel?.contains(document.activeElement)) {
            _settingsPanelLastFocus = document.activeElement;
        }
        document.body.classList.toggle(PANEL_OPEN_CLASS, !!open);
        document.getElementById('ytkit-overlay')?.setAttribute('aria-hidden', open ? 'false' : 'true');
        panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (open) {
            requestAnimationFrame(() => {
                const searchInput = document.getElementById('ytkit-search');
                const fallbackTarget = getFocusableUiElements(panel)[0];
                (searchInput || fallbackTarget)?.focus({ preventScroll: true });
            });
        } else if (wasOpen) {
            const restoreTarget = _settingsPanelLastFocus && document.contains(_settingsPanelLastFocus)
                ? _settingsPanelLastFocus
                : document.getElementById('ytkit-watch-btn') || document.getElementById('ytkit-masthead-btn');
            _settingsPanelLastFocus = null;
            requestAnimationFrame(() => restoreTarget?.focus({ preventScroll: true }));
        }
        return true;
    }

async function toggleSettingsPanel(force) {
        const wantOpen = force ?? !isSettingsPanelOpen();
        if (wantOpen && !getPinSessionUnlocked() && await isPinSet()) {
            _showPinDialog(() => setSettingsPanelOpen(true));
            return false;
        }
        return setSettingsPanelOpen(wantOpen);
    }

function countEnabledToggleFeatures(features) {
        return (features || []).filter((feature) => isBooleanFeature(feature) && appState.settings[feature.id]).length;
    }

function setPanelStatus(message, tone = 'idle') {
        const status = document.getElementById('ytkit-panel-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.tone = tone;
    }

function buildSettingsPanel() {
        if (!shouldBuildPrimaryUI()) return;
        if (document.getElementById('ytkit-settings-panel')) return;

        // Centralized cleanup when panel closes
        _panelCleanups.length = 0;
        let _wasPanelOpen = false;
        if (buildSettingsPanel._panelObs) buildSettingsPanel._panelObs.disconnect();
        buildSettingsPanel._panelObs = new MutationObserver(() => {
            const isOpen = document.body.classList.contains('ytkit-panel-open');
            if (_wasPanelOpen && !isOpen) {
                _panelCleanups.forEach(fn => { try { fn(); } catch(e) { /* reason: one panel cleanup must not block the rest */ } });
                _panelCleanups.length = 0;
                // Panel listeners persist on document with isSettingsPanelOpen() guards —
                // do NOT reset _panelUIListenersAttached here, or duplicates stack on each open.
            }
            _wasPanelOpen = isOpen;
        });
        buildSettingsPanel._panelObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        const categoryOrder = ['Video Player', 'Playback', 'Comments', 'Watch Page', 'Content', 'Home / Subscriptions', 'Theme', 'Live Chat', 'Downloads', 'Advanced'];

        // Group labels: maps first category of each group → label text
        const categoryGroupLabels = {};
        const featuresByCategory = categoryOrder.reduce((acc, cat) => ({...acc, [cat]: []}), {});
        liveFeatureList.forEach(f => {
            if (f.group && featuresByCategory[f.group]) featuresByCategory[f.group].push(f);
        });
        // v3.17.0: the sidebar "Workspace / Home controls" summary card was
        // removed to reclaim vertical space for feature toggles. The four
        // stats (enabled count, total features, populated sections,
        // current-page label) that it displayed were only consumed by that
        // card — computing them here is now dead weight.

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'ytkit-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.onclick = () => setSettingsPanelOpen(false);

        // Create panel
        const panel = document.createElement('div');
        panel.id = 'ytkit-settings-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'ytkit-panel-title');
        panel.setAttribute('aria-hidden', 'true');
        const _rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
        const _panelLocale = (_i18n.overrideLocale || (chrome?.i18n?.getUILanguage && chrome.i18n.getUILanguage()) || 'en').split(/[-_]/)[0].toLowerCase();
        panel.dir = _rtlLocales.has(_panelLocale) ? 'rtl' : 'ltr';

        // Header
        const header = document.createElement('header');
        header.className = 'ytkit-header';

        const brand = document.createElement('div');
        brand.className = 'ytkit-brand';

        const brandMark = document.createElement('div');
        brandMark.className = 'ytkit-brand-mark';
        brandMark.setAttribute('aria-hidden', 'true');
        brandMark.appendChild(createBrandImage('ytkit-brand-image'));

        const title = document.createElement('h1');
        title.className = 'ytkit-title';
        title.id = 'ytkit-panel-title';
        title.textContent = t('panelTitle', 'Settings');

        const eyebrow = document.createElement('div');
        eyebrow.className = 'ytkit-eyebrow';
        eyebrow.textContent = BRAND.name;

        const brandIntro = document.createElement('p');
        brandIntro.className = 'ytkit-brand-intro';
        brandIntro.textContent = t('panelIntro', 'Search, tune, and apply YouTube controls live without leaving the page.');

        const brandBadges = document.createElement('div');
        brandBadges.className = 'ytkit-brand-badges';
        [
            `v${YTKIT_VERSION}`,
            t('panelLiveApplyBadge', 'Live apply')
        ].forEach((label) => {
            const badge = document.createElement('span');
            badge.className = 'ytkit-badge';
            badge.textContent = label;
            brandBadges.appendChild(badge);
        });

        const brandCopy = document.createElement('div');
        brandCopy.className = 'ytkit-brand-copy';
        brandCopy.appendChild(eyebrow);
        brandCopy.appendChild(title);
        brandCopy.appendChild(brandIntro);
        brandCopy.appendChild(brandBadges);

        brand.appendChild(brandMark);
        brand.appendChild(brandCopy);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ytkit-close';
        closeBtn.type = 'button';
        closeBtn.title = t('panelCloseTitle', 'Close settings');
        closeBtn.setAttribute('aria-label', t('panelCloseAria', 'Close settings'));
        closeBtn.appendChild(ICONS.close());
        closeBtn.onclick = () => setSettingsPanelOpen(false);

        const pinBtn = document.createElement('button');
        pinBtn.className = 'ytkit-pin-btn';
        pinBtn.type = 'button';
        pinBtn.title = t('panelPinTitle', 'Manage settings PIN');
        pinBtn.setAttribute('aria-label', t('panelPinAria', 'Manage settings PIN lock'));
        const pinIcon = (ICONS.lock || ICONS.shield || ICONS.settings)();
        pinIcon.setAttribute('aria-hidden', 'true');
        const pinLabel = document.createElement('span');
        pinLabel.className = 'ytkit-pin-label';
        pinLabel.textContent = t('panelPinLabel', 'PIN');
        pinBtn.appendChild(pinIcon);
        pinBtn.appendChild(pinLabel);
        (async () => {
            const pinCopy = (await isPinSet())
                ? t('panelPinChangeTitle', 'Change or clear settings PIN')
                : t('panelPinSetTitle', 'Set a settings PIN');
            pinBtn.title = pinCopy;
            pinBtn.setAttribute('aria-label', pinCopy);
        })();
        pinBtn.onclick = () => _showPinManageDialog();

        const headerActions = document.createElement('div');
        headerActions.className = 'ytkit-header-actions';
        headerActions.appendChild(pinBtn);
        headerActions.appendChild(closeBtn);

        header.appendChild(brand);
        header.appendChild(headerActions);

        // Body
        const body = document.createElement('div');
        body.className = 'ytkit-body';

        // Sidebar
        const sidebar = document.createElement('nav');
        sidebar.className = 'ytkit-sidebar';
        sidebar.setAttribute('aria-label', t('panelSidebarAria', 'Settings categories'));

        const sidebarTop = document.createElement('div');
        sidebarTop.className = 'ytkit-sidebar-top';

        // v3.17.0: removed the "Workspace / Home controls" summary card
        // from the sidebar — the kicker, title, copy, 3 stat counters,
        // and "Live apply" footnote were wasting vertical space that's
        // better spent on the feature toggle list.

        // Search box
        const searchContainer = document.createElement('div');
        searchContainer.className = 'ytkit-search-container';
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'ytkit-search-input';
        searchInput.placeholder = t('panelSearchPlaceholder', 'Search settings, pages, controls...');
        searchInput.id = 'ytkit-search';
        searchInput.name = 'settingsSearch';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.setAttribute('enterkeyhint', 'search');
        searchInput.setAttribute('aria-label', t('panelSearchAria', 'Search settings by name, page, category, or control type'));
        const searchIcon = ICONS.search();
        searchIcon.setAttribute('class', 'ytkit-search-icon');
        searchIcon.setAttribute('aria-hidden', 'true');
        const searchActions = document.createElement('div');
        searchActions.className = 'ytkit-search-actions';
        const searchClearBtn = document.createElement('button');
        searchClearBtn.type = 'button';
        searchClearBtn.className = 'ytkit-search-clear';
        searchClearBtn.id = 'ytkit-search-clear';
        searchClearBtn.hidden = true;
        searchClearBtn.title = t('panelSearchClearTitle', 'Clear search');
        searchClearBtn.setAttribute('aria-label', t('panelSearchClearAria', 'Clear settings search'));
        searchClearBtn.appendChild(ICONS.close());
        const searchMeta = document.createElement('span');
        searchMeta.className = 'ytkit-search-meta';
        searchMeta.id = 'ytkit-search-count';
        searchMeta.textContent = 'All';
        searchContainer.appendChild(searchIcon);
        searchContainer.appendChild(searchInput);
        searchActions.appendChild(searchClearBtn);
        searchActions.appendChild(searchMeta);
        searchContainer.appendChild(searchActions);
        sidebarTop.appendChild(searchContainer);

        const searchHint = document.createElement('p');
        searchHint.className = 'ytkit-search-hint';
        searchHint.textContent = t('panelSearchHint', 'Search by name, page, category, control type, or description.');
        sidebarTop.appendChild(searchHint);
        sidebar.appendChild(sidebarTop);

        const navList = document.createElement('div');
        navList.className = 'ytkit-nav-list';
        sidebar.appendChild(navList);

        // Helper: create a sidebar nav button
        function makeNavBtn(cat, config, iconNode, countText, countTitle, extraClass) {
            const catId = cat.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ytkit-nav-btn' + (extraClass || '');
            btn.dataset.tab = catId;
            btn.setAttribute('aria-label', `${cat}. ${CATEGORY_META[cat]?.summary || ''}`);
            const iconWrap = document.createElement('span');
            iconWrap.className = 'ytkit-nav-icon';
            iconWrap.style.setProperty('--cat-color', config.color);
            iconWrap.appendChild(iconNode);
            btn.title = CATEGORY_META[cat]?.summary || cat;
            const copyWrap = document.createElement('span');
            copyWrap.className = 'ytkit-nav-copy';
            const labelSpan = document.createElement('span');
            labelSpan.className = 'ytkit-nav-label';
            labelSpan.textContent = cat;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'ytkit-nav-meta';
            metaSpan.textContent = CATEGORY_META[cat]?.summary || 'Category settings';
            const countSpan = document.createElement('span');
            countSpan.className = 'ytkit-nav-count';
            countSpan.textContent = countText;
            if (countTitle) countSpan.title = countTitle;
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'ytkit-nav-arrow';
            arrowSpan.appendChild(ICONS.chevronRight());
            copyWrap.appendChild(labelSpan);
            copyWrap.appendChild(metaSpan);
            btn.appendChild(iconWrap);
            btn.appendChild(copyWrap);
            btn.appendChild(countSpan);
            btn.appendChild(arrowSpan);
            return { btn, countSpan, catId };
        }

        // Helper: add drag-reorder support to a nav button
        function addDragReorder(btn, catId) {
            btn.draggable = true;
            btn.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', catId);
                btn.classList.add('ytkit-dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            btn.addEventListener('dragend', () => btn.classList.remove('ytkit-dragging'));
            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = btn.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                btn.classList.toggle('ytkit-drag-above', e.clientY < midY);
                btn.classList.toggle('ytkit-drag-below', e.clientY >= midY);
            });
            btn.addEventListener('dragleave', () => {
                btn.classList.remove('ytkit-drag-above', 'ytkit-drag-below');
            });
            btn.addEventListener('drop', (e) => {
                e.preventDefault();
                btn.classList.remove('ytkit-drag-above', 'ytkit-drag-below');
                const draggedCatId = e.dataTransfer.getData('text/plain');
                const draggedBtn = navList.querySelector('.ytkit-nav-btn[data-tab="' + draggedCatId + '"]');
                if (!draggedBtn || draggedBtn === btn) return;
                const rect = btn.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) btn.before(draggedBtn);
                else btn.after(draggedBtn);
                const newOrder = Array.from(navList.querySelectorAll('.ytkit-nav-btn')).map(b => b.dataset.tab);
                appState.settings.sidebarOrder = newOrder;
                settingsManager.save(appState.settings);
            });
        }

        categoryOrder.forEach((cat, index) => {
            // Insert group label before first category of each group
            if (categoryGroupLabels[cat]) {
                const groupLabel = document.createElement('div');
                groupLabel.className = 'ytkit-nav-group-label';
                groupLabel.textContent = categoryGroupLabels[cat];
                if (index > 0) groupLabel.style.marginTop = '6px';
                navList.appendChild(groupLabel);
            }



            const categoryFeatures = featuresByCategory[cat];
            if (!categoryFeatures || categoryFeatures.length === 0) return;

            const config = CATEGORY_CONFIG[cat] || { icon: 'settings', color: '#60a5fa' };
            const topLevelCategoryFeatures = categoryFeatures.filter((feature) => !feature.isSubFeature);
            const enabledCount = countEnabledToggleFeatures(topLevelCategoryFeatures);
            const totalCount = topLevelCategoryFeatures.length;
            const { btn, catId } = makeNavBtn(cat, config, (ICONS[config.icon] || ICONS.settings)(), `${enabledCount}/${totalCount}`, '', index === 0 ? ' active' : '');
            btn.dataset.totalCount = String(totalCount);
            addDragReorder(btn, catId);
            navList.appendChild(btn);
        });

        // Apply saved sidebar order
        const savedOrder = Array.isArray(appState.settings.sidebarOrder) && appState.settings.sidebarOrder.length > 0
            ? appState.settings.sidebarOrder
            : storageReadJSON(LEGACY_STORAGE_KEYS.sidebarOrder, null);
        if (savedOrder && Array.isArray(savedOrder)) {
            const navBtns = Array.from(navList.querySelectorAll('.ytkit-nav-btn'));
            const groupLabels = Array.from(navList.querySelectorAll('.ytkit-nav-group-label'));
            // Remove group labels (order is now user-controlled)
            groupLabels.forEach(gl => gl.remove());
            // Reorder buttons
            const btnMap = {};
            navBtns.forEach(b => { btnMap[b.dataset.tab] = b; });
            savedOrder.forEach(catId => {
                if (btnMap[catId]) navList.appendChild(btnMap[catId]);
            });
            // Append any new categories not in saved order
            navBtns.forEach(b => {
                if (!savedOrder.includes(b.dataset.tab)) navList.appendChild(b);
            });
        }

        // Content
        const content = document.createElement('div');
        content.className = 'ytkit-content';

        const searchState = document.createElement('section');
        searchState.className = 'ytkit-search-state';
        searchState.id = 'ytkit-search-state';
        searchState.hidden = true;
        searchState.setAttribute('aria-live', 'polite');

        const searchStateBadge = document.createElement('span');
        searchStateBadge.className = 'ytkit-search-state-badge';
        searchStateBadge.textContent = t('panelSearchStateBadge', 'Search');

        const searchStateTitle = document.createElement('h2');
        searchStateTitle.className = 'ytkit-search-state-title';
        searchStateTitle.id = 'ytkit-search-state-title';
        searchStateTitle.textContent = t('panelSearchStateTitle', 'Search across all settings');

        const searchStateCopy = document.createElement('p');
        searchStateCopy.className = 'ytkit-search-state-copy';
        searchStateCopy.id = 'ytkit-search-state-copy';
        searchStateCopy.textContent = t('panelSearchStateCopy', 'Type a control, page, or category to narrow the menu instantly.');

        const searchStateActions = document.createElement('div');
        searchStateActions.className = 'ytkit-search-state-actions';
        const searchStateClear = document.createElement('button');
        searchStateClear.type = 'button';
        searchStateClear.className = 'ytkit-reset-group-btn';
        searchStateClear.id = 'ytkit-search-state-clear';
        searchStateClear.textContent = t('panelSearchStateClear', 'Clear search');
        searchStateActions.appendChild(searchStateClear);

        searchState.appendChild(searchStateBadge);
        searchState.appendChild(searchStateTitle);
        searchState.appendChild(searchStateCopy);
        searchState.appendChild(searchStateActions);
        content.appendChild(searchState);

        //  Video Hider Custom Pane
        function buildVideoHiderPane(config) {
            const videoHiderFeature = getFeatureById('hideVideosFromHome');
            const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

            const pane = document.createElement('section');
            pane.id = 'ytkit-pane-Video-Hider';
            pane.className = 'ytkit-pane ytkit-vh-pane';

            // Pane header
            const paneHeader = document.createElement('div');
            paneHeader.className = 'ytkit-pane-header';
            const paneTitle = document.createElement('div');
            paneTitle.className = 'ytkit-pane-title';
            const paneEyebrow = document.createElement('span');
            paneEyebrow.className = 'ytkit-pane-eyebrow';
            paneEyebrow.textContent = 'Content Controls';
            const paneTitleH2 = document.createElement('h2');
            paneTitleH2.textContent = 'Video Hider';
            const paneDescription = document.createElement('p');
            paneDescription.className = 'ytkit-pane-description';
            paneDescription.textContent = 'Review hidden videos, manage blocked channels, and tune automatic filters without leaving the page.';
            const paneMeta = document.createElement('div');
            paneMeta.className = 'ytkit-pane-meta';
            const paneStateChip = document.createElement('span');
            paneStateChip.className = 'ytkit-pane-chip ytkit-vh-status-chip';
            const paneHiddenChip = document.createElement('span');
            paneHiddenChip.className = 'ytkit-pane-chip';
            const paneAllowedChip = document.createElement('span');
            paneAllowedChip.className = 'ytkit-pane-chip';
            const paneChannelsChip = document.createElement('span');
            paneChannelsChip.className = 'ytkit-pane-chip';
            paneTitle.appendChild(paneEyebrow);
            paneTitle.appendChild(paneTitleH2);
            paneTitle.appendChild(paneDescription);
            paneMeta.appendChild(paneStateChip);
            paneMeta.appendChild(paneHiddenChip);
            paneMeta.appendChild(paneAllowedChip);
            paneMeta.appendChild(paneChannelsChip);
            paneTitle.appendChild(paneMeta);

            // Enable toggle
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'ytkit-toggle-all';
            toggleLabel.style.marginLeft = 'auto';
            const toggleText = document.createElement('span');
            toggleText.textContent = 'Enabled';
            const toggleSwitch = document.createElement('div');
            toggleSwitch.className = 'ytkit-switch' + (appState.settings.hideVideosFromHome ? ' active' : '');
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.id = 'ytkit-toggle-hideVideosFromHome';
            toggleInput.name = 'hideVideosFromHome';
            toggleInput.setAttribute('aria-label', 'Enable Video Hider');
            toggleInput.checked = appState.settings.hideVideosFromHome;
            toggleInput.onchange = async () => {
                appState.settings.hideVideosFromHome = toggleInput.checked;
                toggleSwitch.classList.toggle('active', toggleInput.checked);
                settingsManager.save(appState.settings);
                if (toggleInput.checked) safeInitFeature(videoHiderFeature, 'video-hider-pane');
                else safeDestroyFeature(videoHiderFeature, 'video-hider-pane');
                updateVideoHiderMeta();
                updateAllToggleStates();
            };
            const toggleTrack = document.createElement('span');
            toggleTrack.className = 'ytkit-switch-track';
            const toggleThumb = document.createElement('span');
            toggleThumb.className = 'ytkit-switch-thumb';
            toggleTrack.appendChild(toggleThumb);
            toggleSwitch.appendChild(toggleInput);
            toggleSwitch.appendChild(toggleTrack);
            toggleLabel.appendChild(toggleText);
            toggleLabel.appendChild(toggleSwitch);
            paneHeader.appendChild(paneTitle);
            paneHeader.appendChild(toggleLabel);
            pane.appendChild(paneHeader);

            // Tab navigation
            const tabNav = document.createElement('div');
            tabNav.className = 'ytkit-vh-tabs';
            tabNav.style.setProperty('--ytkit-vh-accent', config.color);
            tabNav.setAttribute('role', 'tablist');
            tabNav.setAttribute('aria-label', 'Video Hider Sections');
            const tabContent = document.createElement('div');
            tabContent.id = 'ytkit-vh-content';
            tabContent.setAttribute('role', 'tabpanel');
            tabContent.setAttribute('aria-live', 'polite');
            tabContent.tabIndex = -1;
            const tabs = [
                { id: 'videos', label: 'Hidden Videos' },
                { id: 'allowed', label: 'Allowed Videos' },
                { id: 'channels', label: 'Blocked Channels' },
                { id: 'keywords', label: 'Keyword Rules' },
                { id: 'settings', label: 'Filters & Limits' }
            ];
            const tabButtons = new Map();

            function getVideoCount() {
                return videoHiderFeature?._getHiddenVideos()?.length || 0;
            }

            function getChannelCount() {
                return videoHiderFeature?._getBlockedChannels()?.length || 0;
            }

            function getAllowedCount() {
                return videoHiderFeature?._getAllowedVideos()?.length || 0;
            }

            function getKeywordStatus() {
                return (appState.settings.hideVideosKeywordFilter || '').trim() ? 'Live' : 'Empty';
            }

            function getSettingsStatus() {
                const scopeKeys = [
                    'hideVideosScopeHome',
                    'hideVideosScopeSubscriptions',
                    'hideVideosScopeSearch',
                    'hideVideosScopeWatch',
                    'hideVideosScopeChannels',
                    'hideVideosScopeOther'
                ];
                return (appState.settings.hideVideosDurationFilter || 0) > 0
                    || appState.settings.hideVideosSubsLoadLimit === false
                    || (appState.settings.hideVideosSubsLoadThreshold || 3) !== 3
                    || appState.settings.hideVideosRemoveHiddenCards === true
                    || appState.settings.hideVideosShowQuickHideButton === false
                    || appState.settings.hideVideosAllowChannelBlock === false
                    || appState.settings.hideVideosRememberRestoredVideos === false
                    || appState.settings.hideVideosLowViewFilter === true
                    || (appState.settings.hideVideosLowViewThreshold || 1000) !== 1000
                    || appState.settings.hideVideosHideLive === true
                    || appState.settings.hideVideosHideUpcoming === true
                    || appState.settings.hideVideosHideMixes === true
                    || appState.settings.hideVideosHidePlaylists === true
                    || appState.settings.hideVideosHideMovies === true
                    || appState.settings.hideVideosHideAutoDubbed === true
                    || (appState.settings.hideVideosWatchedRatio || 0) > 0
                    || scopeKeys.some(key => appState.settings[key] === false)
                    ? 'Custom'
                    : 'Ready';
            }

            function updateVideoHiderMeta() {
                const isEnabled = !!appState.settings.hideVideosFromHome;
                pane.dataset.state = isEnabled ? 'active' : 'paused';
                paneStateChip.dataset.state = isEnabled ? 'active' : 'paused';
                paneStateChip.textContent = isEnabled ? 'Feature On' : 'Feature Off';
                paneHiddenChip.textContent = `${countLabel(getVideoCount(), 'Video')} Hidden`;
                paneAllowedChip.textContent = `${countLabel(getAllowedCount(), 'Video')} Allowed`;
                paneChannelsChip.textContent = `${countLabel(getChannelCount(), 'Channel')} Blocked`;

                const videoBadge = tabButtons.get('videos')?.querySelector('.ytkit-vh-tab__badge');
                const allowedBadge = tabButtons.get('allowed')?.querySelector('.ytkit-vh-tab__badge');
                const channelBadge = tabButtons.get('channels')?.querySelector('.ytkit-vh-tab__badge');
                const keywordBadge = tabButtons.get('keywords')?.querySelector('.ytkit-vh-tab__badge');
                const settingsBadge = tabButtons.get('settings')?.querySelector('.ytkit-vh-tab__badge');
                if (videoBadge) videoBadge.textContent = String(getVideoCount());
                if (allowedBadge) allowedBadge.textContent = String(getAllowedCount());
                if (channelBadge) channelBadge.textContent = String(getChannelCount());
                if (keywordBadge) keywordBadge.textContent = getKeywordStatus();
                if (settingsBadge) settingsBadge.textContent = getSettingsStatus();
            }

            function createVideoHiderLead(eyebrow, title, copy, empty = false) {
                const lead = document.createElement('section');
                lead.className = 'ytkit-vh-hero' + (empty ? ' is-empty' : '');
                const leadEyebrow = document.createElement('span');
                leadEyebrow.className = 'ytkit-vh-hero__eyebrow';
                leadEyebrow.textContent = eyebrow;
                const leadTitle = document.createElement('h3');
                leadTitle.className = 'ytkit-vh-hero__title';
                leadTitle.textContent = title;
                const leadCopy = document.createElement('p');
                leadCopy.className = 'ytkit-vh-hero__copy';
                leadCopy.textContent = copy;
                lead.appendChild(leadEyebrow);
                lead.appendChild(leadTitle);
                lead.appendChild(leadCopy);
                return lead;
            }

            function createVideoHiderSection(title, copy) {
                const section = document.createElement('section');
                section.className = 'ytkit-vh-section';
                const sectionHeader = document.createElement('div');
                sectionHeader.className = 'ytkit-vh-section-header';
                const sectionTitle = document.createElement('h3');
                sectionTitle.className = 'ytkit-vh-section-title';
                sectionTitle.textContent = title;
                const sectionCopy = document.createElement('p');
                sectionCopy.className = 'ytkit-vh-section-copy';
                sectionCopy.textContent = copy;
                sectionHeader.appendChild(sectionTitle);
                sectionHeader.appendChild(sectionCopy);
                section.appendChild(sectionHeader);
                return section;
            }

            function refreshVideoHiderAfterSettingChange() {
                settingsManager.save(appState.settings);
                videoHiderFeature?._restoreRemovedVideoNodes?.();
                videoHiderFeature?._processAllVideos?.();
                videoHiderFeature?._removeSubsHideAllButton?.();
                videoHiderFeature?._removeHomeHideAllButton?.();
                videoHiderFeature?._createSubsHideAllButton?.();
                videoHiderFeature?._createHomeHideAllButton?.();
                updateVideoHiderMeta();
            }

            function createVideoHiderToggle({ key, title, description, defaultChecked = true, onChange = null }) {
                const row = document.createElement('label');
                row.className = 'ytkit-vh-toggle-row';
                const copy = document.createElement('div');
                copy.className = 'ytkit-vh-toggle-copy';
                const label = document.createElement('div');
                label.className = 'ytkit-vh-toggle-title';
                label.textContent = title;
                const desc = document.createElement('div');
                desc.className = 'ytkit-vh-toggle-desc';
                desc.textContent = description;
                const toggle = document.createElement('div');
                const isChecked = defaultChecked
                    ? appState.settings[key] !== false
                    : appState.settings[key] === true;
                toggle.className = 'ytkit-switch' + (isChecked ? ' active' : '');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.name = key;
                input.checked = isChecked;
                input.setAttribute('aria-label', title);
                const track = document.createElement('span');
                track.className = 'ytkit-switch-track';
                const thumb = document.createElement('span');
                thumb.className = 'ytkit-switch-thumb';
                track.appendChild(thumb);
                toggle.appendChild(input);
                toggle.appendChild(track);
                copy.appendChild(label);
                copy.appendChild(desc);
                row.appendChild(copy);
                row.appendChild(toggle);
                input.onchange = () => {
                    appState.settings[key] = input.checked;
                    toggle.classList.toggle('active', input.checked);
                    if (onChange) onChange(input.checked);
                    else refreshVideoHiderAfterSettingChange();
                };
                return row;
            }

            function createVideoIdEntryForm({ id, title, copy, placeholder, buttonLabel, onSubmit }) {
                const section = createVideoHiderSection(title, copy);
                const form = document.createElement('form');
                form.className = 'ytkit-vh-inline-form';
                const input = document.createElement('input');
                input.type = 'text';
                input.id = id;
                input.className = 'ytkit-vh-text-input';
                input.placeholder = placeholder;
                input.autocomplete = 'off';
                input.spellcheck = false;
                input.inputMode = 'url';
                const button = document.createElement('button');
                button.type = 'submit';
                button.className = 'ytkit-vh-list-btn';
                button.textContent = buttonLabel;
                const status = document.createElement('span');
                status.className = 'ytkit-vh-form-status';
                status.setAttribute('role', 'status');
                status.setAttribute('aria-live', 'polite');
                form.appendChild(input);
                form.appendChild(button);
                form.appendChild(status);
                form.addEventListener('submit', event => {
                    event.preventDefault();
                    const videoId = videoHiderFeature?._normalizeVideoIdInput?.(input.value);
                    if (!videoId) {
                        status.textContent = 'Enter a valid YouTube video URL or 11-character video ID.';
                        input.focus();
                        return;
                    }
                    status.textContent = '';
                    onSubmit(videoId);
                });
                section.appendChild(form);
                return section;
            }

            function setActiveTab(nextTabId) {
                tabButtons.forEach((button, tabId) => {
                    const isActive = tabId === nextTabId;
                    button.classList.toggle('active', isActive);
                    button.setAttribute('aria-selected', String(isActive));
                    button.tabIndex = isActive ? 0 : -1;
                });
                renderTabContent(nextTabId);
            }

            function focusRelativeTab(currentTabId, offset) {
                const currentIndex = tabs.findIndex(tab => tab.id === currentTabId);
                const nextIndex = (currentIndex + offset + tabs.length) % tabs.length;
                const nextTabId = tabs[nextIndex]?.id;
                if (!nextTabId) return;
                tabButtons.get(nextTabId)?.focus();
                setActiveTab(nextTabId);
            }

            tabs.forEach((tabInfo, i) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'ytkit-vh-tab' + (i === 0 ? ' active' : '');
                tab.dataset.tab = tabInfo.id;
                tab.id = `ytkit-vh-tab-${tabInfo.id}`;
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-controls', 'ytkit-vh-content');
                tab.setAttribute('aria-selected', String(i === 0));
                tab.tabIndex = i === 0 ? 0 : -1;
                const tabLabel = document.createElement('span');
                tabLabel.className = 'ytkit-vh-tab__label';
                tabLabel.textContent = tabInfo.label;
                const tabBadge = document.createElement('span');
                tabBadge.className = 'ytkit-vh-tab__badge';
                tab.appendChild(tabLabel);
                tab.appendChild(tabBadge);
                tab.onclick = () => {
                    setActiveTab(tabInfo.id);
                };
                tab.addEventListener('keydown', (event) => {
                    if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        focusRelativeTab(tabInfo.id, 1);
                    } else if (event.key === 'ArrowLeft') {
                        event.preventDefault();
                        focusRelativeTab(tabInfo.id, -1);
                    } else if (event.key === 'Home') {
                        event.preventDefault();
                        const firstTabId = tabs[0]?.id;
                        if (!firstTabId) return;
                        tabButtons.get(firstTabId)?.focus();
                        setActiveTab(firstTabId);
                    } else if (event.key === 'End') {
                        event.preventDefault();
                        const lastTabId = tabs[tabs.length - 1]?.id;
                        if (!lastTabId) return;
                        tabButtons.get(lastTabId)?.focus();
                        setActiveTab(lastTabId);
                    }
                });
                tabButtons.set(tabInfo.id, tab);
                tabNav.appendChild(tab);
            });
            pane.appendChild(tabNav);

            pane.appendChild(tabContent);

            function renderTabContent(tab) {
                tabContent.textContent = '';
                tabContent.setAttribute('aria-labelledby', `ytkit-vh-tab-${tab}`);
                updateVideoHiderMeta();

                if (tab === 'videos') {
                    const videos = videoHiderFeature?._getHiddenVideos() || [];
                    const createHiddenEntryForm = () => createVideoIdEntryForm({
                        id: 'ytkit-vh-add-hidden',
                        title: 'Add Hidden Video',
                        copy: 'Paste a YouTube URL or video ID to add it directly to the hidden list.',
                        placeholder: 'https://youtube.com/watch?v=...',
                        buttonLabel: 'Hide Video',
                        onSubmit: videoId => {
                            const added = videoHiderFeature?._addHiddenVideos?.([videoId]) || [];
                            videoHiderFeature?._processAllVideos?.();
                            renderTabContent('videos');
                            updateVideoHiderMeta();
                            showToast(added.length > 0 ? 'Video added to hidden list' : 'Video is already hidden', '#6b7280');
                        }
                    });
                    if (videos.length === 0) {
                        tabContent.appendChild(createVideoHiderLead(
                            'Nothing Hidden',
                            'No hidden videos yet',
                            'Use the X button on video thumbnails to hide items you do not want to see. Restored videos can be remembered in the allowed list so filters do not re-hide them.',
                            true
                        ));
                        tabContent.appendChild(createHiddenEntryForm());
                    } else {
                        const grid = document.createElement('div');
                        grid.className = 'ytkit-vh-grid';
                        tabContent.appendChild(createVideoHiderLead(
                            'Restore & Review',
                            `${countLabel(videos.length, 'Hidden Video')} Ready to Review`,
                            'Restore one item at a time, remove an entry from the list without creating an exception, or reset the whole list if you want YouTube recommendations to start fresh again.'
                        ));
                        tabContent.appendChild(createHiddenEntryForm());
                        videos.forEach(vid => {
                            const item = document.createElement('article');
                            item.className = 'ytkit-vh-card ytkit-vh-card--video';
                            const thumbLink = document.createElement('a');
                            thumbLink.className = 'ytkit-vh-thumb-link';
                            thumbLink.href = `https://youtube.com/watch?v=${vid}`;
                            thumbLink.target = '_blank';
                            thumbLink.rel = 'noopener noreferrer';
                            thumbLink.setAttribute('aria-label', `Open hidden video ${vid} on YouTube`);
                            const thumb = document.createElement('img');
                            thumb.className = 'ytkit-vh-thumb';
                            thumb.src = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
                            thumb.width = 176;
                            thumb.height = 100;
                            thumb.loading = 'lazy';
                            thumb.decoding = 'async';
                            thumb.alt = `Preview thumbnail for hidden video ${vid}`;
                            thumb.onerror = () => {
                                thumb.remove();
                                thumbLink.classList.add('is-fallback');
                                const fallback = document.createElement('span');
                                fallback.className = 'ytkit-vh-thumb-fallback';
                                fallback.textContent = 'Preview unavailable';
                                thumbLink.appendChild(fallback);
                            };
                            thumbLink.appendChild(thumb);
                            const info = document.createElement('div');
                            info.className = 'ytkit-vh-item-main';
                            const vidLabel = document.createElement('div');
                            vidLabel.className = 'ytkit-vh-item-label';
                            vidLabel.textContent = 'Video ID';
                            const vidId = document.createElement('div');
                            vidId.className = 'ytkit-vh-item-title ytkit-vh-item-title--code';
                            vidId.setAttribute('translate', 'no');
                            vidId.textContent = vid;
                            const summary = document.createElement('div');
                            summary.className = 'ytkit-vh-item-meta';
                            summary.textContent = 'Hidden from recommendations until you restore it. Restoring can add an exception so automatic rules leave it visible.';
                            const actions = document.createElement('div');
                            actions.className = 'ytkit-vh-item-actions';
                            const link = document.createElement('a');
                            link.className = 'ytkit-vh-link';
                            link.href = `https://youtube.com/watch?v=${vid}`;
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                            link.textContent = 'Open on YouTube';
                            const removeBtn = document.createElement('button');
                            removeBtn.type = 'button';
                            removeBtn.className = 'ytkit-vh-list-btn';
                            removeBtn.textContent = 'Restore & Allow';
                            removeBtn.setAttribute('aria-label', `Restore hidden video ${vid} and add an allowed-video exception`);
                            removeBtn.onclick = () => {
                                videoHiderFeature._unhideVideo?.(vid);
                                renderTabContent('videos');
                            };
                            const deleteBtn = document.createElement('button');
                            deleteBtn.type = 'button';
                            deleteBtn.className = 'ytkit-vh-list-btn';
                            deleteBtn.textContent = 'Remove From List';
                            deleteBtn.setAttribute('aria-label', `Remove hidden video ${vid} from the hidden list without adding an exception`);
                            deleteBtn.onclick = () => {
                                const removed = videoHiderFeature._removeHiddenVideos?.([vid]) || [];
                                videoHiderFeature._restoreRemovedVideoNodes?.(new Set([vid]));
                                videoHiderFeature._processAllVideos?.();
                                renderTabContent('videos');
                                updateVideoHiderMeta();
                                showToast(removed.length > 0 ? 'Video removed from hidden list' : 'Video was not in the hidden list', '#6b7280');
                            };
                            actions.appendChild(link);
                            actions.appendChild(removeBtn);
                            actions.appendChild(deleteBtn);
                            info.appendChild(vidLabel);
                            info.appendChild(vidId);
                            info.appendChild(summary);
                            info.appendChild(actions);
                            item.appendChild(thumbLink);
                            item.appendChild(info);
                            grid.appendChild(item);
                        });
                        tabContent.appendChild(grid);
                        const clearBtn = document.createElement('button');
                        clearBtn.type = 'button';
                        clearBtn.className = 'ytkit-vh-clear-btn';
                        clearBtn.textContent = `Restore & Allow All Hidden Videos (${videos.length})`;
                        clearBtn.onclick = () => {
                            const backup = [...videoHiderFeature._getHiddenVideos()];
                            const allowedAdded = videoHiderFeature._addAllowedVideos?.(backup) || [];
                            videoHiderFeature._setHiddenVideos([]);
                            videoHiderFeature._restoreRemovedVideoNodes?.(new Set(backup));
                            videoHiderFeature._processAllVideos();
                            renderTabContent('videos');
                            showToast(`Restored ${backup.length} hidden videos`, '#6b7280', { duration: 5, tone: 'neutral', action: { text: 'Undo', onClick: () => {
                                videoHiderFeature._setHiddenVideos(backup);
                                videoHiderFeature._removeAllowedVideos?.(allowedAdded);
                                videoHiderFeature._processAllVideos();
                                renderTabContent('videos');
                                updateVideoHiderMeta();
                                showToast('Hidden videos restored', '#22c55e');
                            }}});
                        };
                        tabContent.appendChild(clearBtn);
                        const clearListBtn = document.createElement('button');
                        clearListBtn.type = 'button';
                        clearListBtn.className = 'ytkit-vh-clear-btn';
                        clearListBtn.textContent = `Clear Hidden List Only (${videos.length})`;
                        clearListBtn.onclick = () => {
                            const backup = [...videoHiderFeature._getHiddenVideos()];
                            videoHiderFeature._setHiddenVideos([]);
                            videoHiderFeature._restoreRemovedVideoNodes?.(new Set(backup));
                            videoHiderFeature._processAllVideos?.();
                            renderTabContent('videos');
                            updateVideoHiderMeta();
                            showToast(`Cleared ${backup.length} hidden list entries`, '#6b7280', { duration: 5, tone: 'neutral', action: { text: 'Undo', onClick: () => {
                                videoHiderFeature._setHiddenVideos(backup);
                                videoHiderFeature._processAllVideos?.();
                                renderTabContent('videos');
                                updateVideoHiderMeta();
                                showToast('Hidden list restored', '#22c55e');
                            }}});
                        };
                        tabContent.appendChild(clearListBtn);
                        const removePageBtn = document.createElement('button');
                        removePageBtn.type = 'button';
                        removePageBtn.className = 'ytkit-vh-clear-btn ytkit-vh-clear-btn--danger';
                        removePageBtn.textContent = 'Remove Hidden Videos On This Page';
                        removePageBtn.onclick = () => {
                            videoHiderFeature._removeHiddenVideosOnPage?.();
                            updateVideoHiderMeta();
                        };
                        tabContent.appendChild(removePageBtn);
                    }
                } else if (tab === 'allowed') {
                    const allowed = videoHiderFeature?._getAllowedVideos() || [];
                    const createAllowedEntryForm = () => createVideoIdEntryForm({
                        id: 'ytkit-vh-add-allowed',
                        title: 'Add Allowed Video',
                        copy: 'Paste a YouTube URL or video ID to keep it visible even when a filter still matches.',
                        placeholder: 'https://youtube.com/watch?v=...',
                        buttonLabel: 'Allow Video',
                        onSubmit: videoId => {
                            const added = videoHiderFeature?._addAllowedVideos?.([videoId], { force: true }) || [];
                            const removedHidden = videoHiderFeature?._removeHiddenVideos?.([videoId]) || [];
                            videoHiderFeature?._restoreRemovedVideoNodes?.(new Set([videoId]));
                            videoHiderFeature?._processAllVideos?.();
                            renderTabContent('allowed');
                            updateVideoHiderMeta();
                            showToast(added.length > 0
                                ? 'Video added to allowed list'
                                : (removedHidden.length > 0 ? 'Video moved from hidden to allowed' : 'Video is already allowed'),
                                '#6b7280');
                        }
                    });
                    if (allowed.length === 0) {
                        tabContent.appendChild(createVideoHiderLead(
                            'No Exceptions',
                            'No allowed videos yet',
                            'Restore a hidden video while remembering restores is enabled to keep that video visible even when a keyword, duration, or channel rule still matches it.',
                            true
                        ));
                        tabContent.appendChild(createAllowedEntryForm());
                    } else {
                        const grid = document.createElement('div');
                        grid.className = 'ytkit-vh-grid';
                        tabContent.appendChild(createVideoHiderLead(
                            'Manual Exceptions',
                            `${countLabel(allowed.length, 'Allowed Video')} Protected From Filters`,
                            'Remove an exception to let automatic rules evaluate the video again, or hide it again to move it back to the hidden list.'
                        ));
                        tabContent.appendChild(createAllowedEntryForm());
                        allowed.forEach(vid => {
                            const item = document.createElement('article');
                            item.className = 'ytkit-vh-card ytkit-vh-card--video';
                            const thumbLink = document.createElement('a');
                            thumbLink.className = 'ytkit-vh-thumb-link';
                            thumbLink.href = `https://youtube.com/watch?v=${vid}`;
                            thumbLink.target = '_blank';
                            thumbLink.rel = 'noopener noreferrer';
                            thumbLink.setAttribute('aria-label', `Open allowed video ${vid} on YouTube`);
                            const thumb = document.createElement('img');
                            thumb.className = 'ytkit-vh-thumb';
                            thumb.src = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
                            thumb.width = 176;
                            thumb.height = 100;
                            thumb.loading = 'lazy';
                            thumb.decoding = 'async';
                            thumb.alt = `Preview thumbnail for allowed video ${vid}`;
                            thumb.onerror = () => {
                                thumb.remove();
                                thumbLink.classList.add('is-fallback');
                                const fallback = document.createElement('span');
                                fallback.className = 'ytkit-vh-thumb-fallback';
                                fallback.textContent = 'Preview unavailable';
                                thumbLink.appendChild(fallback);
                            };
                            thumbLink.appendChild(thumb);
                            const info = document.createElement('div');
                            info.className = 'ytkit-vh-item-main';
                            const vidLabel = document.createElement('div');
                            vidLabel.className = 'ytkit-vh-item-label';
                            vidLabel.textContent = 'Video ID';
                            const vidId = document.createElement('div');
                            vidId.className = 'ytkit-vh-item-title ytkit-vh-item-title--code';
                            vidId.setAttribute('translate', 'no');
                            vidId.textContent = vid;
                            const summary = document.createElement('div');
                            summary.className = 'ytkit-vh-item-meta';
                            summary.textContent = 'Allowed by manual restore. Automatic filters skip this video while the exception remains.';
                            const actions = document.createElement('div');
                            actions.className = 'ytkit-vh-item-actions';
                            const link = document.createElement('a');
                            link.className = 'ytkit-vh-link';
                            link.href = `https://youtube.com/watch?v=${vid}`;
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                            link.textContent = 'Open on YouTube';
                            const removeBtn = document.createElement('button');
                            removeBtn.type = 'button';
                            removeBtn.className = 'ytkit-vh-list-btn';
                            removeBtn.textContent = 'Remove Exception';
                            removeBtn.setAttribute('aria-label', `Remove allowed-video exception for ${vid}`);
                            removeBtn.onclick = () => {
                                videoHiderFeature._removeAllowedVideos?.([vid]);
                                videoHiderFeature._processAllVideos?.();
                                renderTabContent('allowed');
                            };
                            const hideAgainBtn = document.createElement('button');
                            hideAgainBtn.type = 'button';
                            hideAgainBtn.className = 'ytkit-vh-list-btn';
                            hideAgainBtn.textContent = 'Hide Again';
                            hideAgainBtn.setAttribute('aria-label', `Hide allowed video ${vid} again`);
                            hideAgainBtn.onclick = () => {
                                videoHiderFeature._addHiddenVideos?.([vid]);
                                videoHiderFeature._processAllVideos?.();
                                renderTabContent('allowed');
                                updateVideoHiderMeta();
                            };
                            actions.appendChild(link);
                            actions.appendChild(removeBtn);
                            actions.appendChild(hideAgainBtn);
                            info.appendChild(vidLabel);
                            info.appendChild(vidId);
                            info.appendChild(summary);
                            info.appendChild(actions);
                            item.appendChild(thumbLink);
                            item.appendChild(info);
                            grid.appendChild(item);
                        });
                        tabContent.appendChild(grid);
                        const clearBtn = document.createElement('button');
                        clearBtn.type = 'button';
                        clearBtn.className = 'ytkit-vh-clear-btn';
                        clearBtn.textContent = `Clear Allowed Videos (${allowed.length})`;
                        clearBtn.onclick = () => {
                            const backup = [...videoHiderFeature._getAllowedVideos()];
                            videoHiderFeature._setAllowedVideos([]);
                            videoHiderFeature._processAllVideos?.();
                            renderTabContent('allowed');
                            showToast(`Cleared ${backup.length} allowed videos`, '#6b7280', { duration: 5, tone: 'neutral', action: { text: 'Undo', onClick: () => {
                                videoHiderFeature._setAllowedVideos(backup);
                                videoHiderFeature._processAllVideos?.();
                                renderTabContent('allowed');
                                updateVideoHiderMeta();
                                showToast('Allowed videos restored', '#22c55e');
                            }}});
                        };
                        tabContent.appendChild(clearBtn);
                    }
                } else if (tab === 'channels') {
                    const channels = videoHiderFeature?._getBlockedChannels() || [];
                    if (channels.length === 0) {
                        tabContent.appendChild(createVideoHiderLead(
                            'Channel Blocks',
                            'No blocked channels yet',
                            'Right-click the thumbnail X button when you want to block a channel everywhere that Video Hider runs. Channel IDs are preferred, with handles and URLs kept as fallbacks.',
                            true
                        ));
                    } else {
                        const list = document.createElement('div');
                        list.className = 'ytkit-vh-stack';
                        tabContent.appendChild(createVideoHiderLead(
                            'Blocklist',
                            `${countLabel(channels.length, 'Blocked Channel')} in Your List`,
                            'Blocked channels stay hidden across supported feeds until you remove them here. Astra Deck matches the canonical channel ID first, then falls back to handle, vanity path, URL, and legacy ID.'
                        ));
                        channels.forEach(ch => {
                            const item = document.createElement('article');
                            item.className = 'ytkit-vh-card ytkit-vh-card--channel';
                            const icon = document.createElement('div');
                            icon.className = 'ytkit-vh-avatar';
                            icon.setAttribute('aria-hidden', 'true');
                            // Use Array.from() so multi-code-unit characters
                            // (emoji, CJK surrogates) aren't split into a
                            // dangling half-pair when we grab the first glyph.
                            icon.textContent = (Array.from(ch.name || ch.id || '?')[0] || '?').toUpperCase();
                            const info = document.createElement('div');
                            info.className = 'ytkit-vh-item-main';
                            const label = document.createElement('div');
                            label.className = 'ytkit-vh-item-label';
                            label.textContent = 'Blocked Channel';
                            const name = document.createElement('div');
                            name.className = 'ytkit-vh-item-title';
                            name.textContent = ch.name || ch.id;
                            const handle = document.createElement('div');
                            handle.className = 'ytkit-vh-item-meta';
                            handle.setAttribute('translate', 'no');
                            handle.textContent = [ch.channelId || ch.id, ch.handle].filter(Boolean).join(' / ');
                            const actions = document.createElement('div');
                            actions.className = 'ytkit-vh-item-actions';
                            const channelUrl = videoHiderFeature?._getChannelUrl?.(ch) || '';
                            if (channelUrl) {
                                const link = document.createElement('a');
                                link.className = 'ytkit-vh-link';
                                link.href = channelUrl;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.textContent = 'Open Channel';
                                actions.appendChild(link);
                            }
                            const removeBtn = document.createElement('button');
                            removeBtn.type = 'button';
                            removeBtn.className = 'ytkit-vh-list-btn';
                            removeBtn.textContent = 'Unblock';
                            removeBtn.setAttribute('aria-label', `Unblock channel ${ch.name || ch.id}`);
                            removeBtn.onclick = () => {
                                videoHiderFeature._removeBlockedChannel?.(ch);
                                videoHiderFeature._restoreRemovedVideoNodes?.();
                                videoHiderFeature._processAllVideos();
                                renderTabContent('channels');
                            };
                            info.appendChild(label);
                            info.appendChild(name);
                            info.appendChild(handle);
                            actions.appendChild(removeBtn);
                            info.appendChild(actions);
                            item.appendChild(icon);
                            item.appendChild(info);
                            list.appendChild(item);
                        });
                        tabContent.appendChild(list);
                        const clearBtn = document.createElement('button');
                        clearBtn.type = 'button';
                        clearBtn.className = 'ytkit-vh-clear-btn';
                        clearBtn.textContent = `Unblock All Channels (${channels.length})`;
                        clearBtn.onclick = () => {
                            const backup = [...videoHiderFeature._getBlockedChannels()];
                            videoHiderFeature._setBlockedChannels([]);
                            videoHiderFeature._restoreRemovedVideoNodes?.();
                            videoHiderFeature._processAllVideos();
                            renderTabContent('channels');
                            showToast(`Unblocked ${backup.length} channels`, '#6b7280', { duration: 5, tone: 'neutral', action: { text: 'Undo', onClick: () => {
                                videoHiderFeature._setBlockedChannels(backup);
                                videoHiderFeature._processAllVideos();
                                renderTabContent('channels');
                                updateVideoHiderMeta();
                                showToast('Channels restored', '#22c55e');
                            }}});
                        };
                        tabContent.appendChild(clearBtn);
                    }
                } else if (tab === 'keywords') {
                    const container = createVideoHiderSection(
                        'Keyword Rules',
                        'Hide videos by title or channel text. Add comma-separated keywords, use ! to always allow a match, or start with / for regex.'
                    );
                    const field = document.createElement('label');
                    field.className = 'ytkit-vh-field';
                    field.htmlFor = 'ytkit-vh-keywords';
                    const fieldLabel = document.createElement('span');
                    fieldLabel.className = 'ytkit-vh-field-label';
                    fieldLabel.textContent = 'Keywords & Rules';
                    const fieldCopy = document.createElement('span');
                    fieldCopy.className = 'ytkit-vh-field-copy';
                    fieldCopy.id = 'ytkit-vh-keywords-copy';
                    fieldCopy.textContent = 'Separate entries with commas. Rules apply immediately after you update this field.';
                    field.appendChild(fieldLabel);
                    field.appendChild(fieldCopy);
                    const textarea = document.createElement('textarea');
                    textarea.id = 'ytkit-vh-keywords';
                    textarea.name = 'hideVideosKeywordFilter';
                    textarea.className = 'ytkit-vh-textarea';
                    textarea.spellcheck = false;
                    textarea.autocomplete = 'off';
                    textarea.setAttribute('aria-describedby', 'ytkit-vh-keywords-copy');
                    textarea.placeholder = 'reaction, unboxing, prank, shorts…';
                    textarea.value = appState.settings.hideVideosKeywordFilter || '';
                    textarea.onchange = async () => {
                        appState.settings.hideVideosKeywordFilter = textarea.value;
                        settingsManager.save(appState.settings);
                        videoHiderFeature?._restoreRemovedVideoNodes?.();
                        videoHiderFeature?._processAllVideos();
                        updateVideoHiderMeta();
                    };
                    field.appendChild(textarea);
                    container.appendChild(field);
                    const hintPills = document.createElement('div');
                    hintPills.className = 'ytkit-vh-pill-list';
                    ['keyword hides matches', '!keyword always allows matches', '/pattern/i runs a regex rule'].forEach(copy => {
                        const pill = document.createElement('span');
                        pill.className = 'ytkit-vh-pill';
                        pill.textContent = copy;
                        hintPills.appendChild(pill);
                    });
                    container.appendChild(hintPills);
                    tabContent.appendChild(container);
                } else if (tab === 'settings') {
                    const container = document.createElement('div');
                    container.className = 'ytkit-vh-settings';

                    // Hidden card behavior
                    const behaviorSection = createVideoHiderSection(
                        'Hidden Card Behavior',
                        'Choose whether hidden matches stay collapsed or are removed from the current feed DOM.'
                    );
                    behaviorSection.appendChild(createVideoHiderToggle({
                        key: 'hideVideosRemoveHiddenCards',
                        title: 'Remove hidden cards automatically',
                        description: 'When enabled, matching videos are removed from the feed DOM instead of only being hidden with CSS.',
                        defaultChecked: false
                    }));
                    const removeCurrentPageBtn = document.createElement('button');
                    removeCurrentPageBtn.type = 'button';
                    removeCurrentPageBtn.className = 'ytkit-vh-clear-btn ytkit-vh-clear-btn--danger';
                    removeCurrentPageBtn.textContent = 'Remove Hidden Videos On This Page';
                    removeCurrentPageBtn.onclick = () => {
                        videoHiderFeature?._removeHiddenVideosOnPage?.();
                        updateVideoHiderMeta();
                    };
                    behaviorSection.appendChild(removeCurrentPageBtn);
                    container.appendChild(behaviorSection);

                    // Thumbnail controls
                    const controlsSection = createVideoHiderSection(
                        'Thumbnail Controls',
                        'Tune the quick-hide affordances that appear on video thumbnails.'
                    );
                    controlsSection.appendChild(createVideoHiderToggle({
                        key: 'hideVideosShowQuickHideButton',
                        title: 'Show thumbnail hide button',
                        description: 'Display the X button on supported video thumbnails for one-click hiding.'
                    }));
                    controlsSection.appendChild(createVideoHiderToggle({
                        key: 'hideVideosAllowChannelBlock',
                        title: 'Allow right-click channel blocking',
                        description: 'Use right-click on the thumbnail X button to block the whole channel.'
                    }));
                    controlsSection.appendChild(createVideoHiderToggle({
                        key: 'hideVideosRememberRestoredVideos',
                        title: 'Remember restored videos',
                        description: 'Keep restored videos visible by adding them to Allowed Videos, even when another rule still matches.'
                    }));
                    container.appendChild(controlsSection);

                    // Surface scope
                    const scopeSection = createVideoHiderSection(
                        'Run On',
                        'Limit where Video Hider evaluates videos and shows quick actions.'
                    );
                    [
                        { key: 'hideVideosScopeHome', title: 'Home', description: 'Hide matches on the YouTube home feed.' },
                        { key: 'hideVideosScopeSubscriptions', title: 'Subscriptions', description: 'Hide matches and show bulk controls on the subscriptions feed.' },
                        { key: 'hideVideosScopeSearch', title: 'Search results', description: 'Apply video and channel rules on search result pages.' },
                        { key: 'hideVideosScopeWatch', title: 'Watch pages', description: 'Apply rules to recommendations beside and below the player.' },
                        { key: 'hideVideosScopeChannels', title: 'Channel pages', description: 'Apply rules on channel home, video, live, and playlist surfaces.' },
                        { key: 'hideVideosScopeOther', title: 'Other YouTube surfaces', description: 'Keep Video Hider active on miscellaneous browse surfaces.' }
                    ].forEach(toggleInfo => {
                        scopeSection.appendChild(createVideoHiderToggle(toggleInfo));
                    });
                    container.appendChild(scopeSection);

                    // Content type filters
                    const typeSection = createVideoHiderSection(
                        'Content Type Filters',
                        'Opt into precise feed triage for low-view videos, live/upcoming items, mixes, playlists, movies, auto-dubbed videos, and mostly watched cards.'
                    );
                    [
                        { key: 'hideVideosHideLive', title: 'Hide live streams', description: 'Hide live-now cards and live recommendations when they appear in supported feeds.' },
                        { key: 'hideVideosHideUpcoming', title: 'Hide upcoming premieres', description: 'Hide scheduled, upcoming, and reminder-driven video cards.' },
                        { key: 'hideVideosHideMixes', title: 'Hide YouTube Mixes', description: 'Hide radio-style mixes and auto-generated recommendation mixes.' },
                        { key: 'hideVideosHidePlaylists', title: 'Hide playlist cards', description: 'Hide playlist and multi-video cards from supported feed surfaces.' },
                        { key: 'hideVideosHideMovies', title: 'Hide movies', description: 'Hide rental, purchase, free-with-ads, and movie-labeled cards.' },
                        { key: 'hideVideosHideAutoDubbed', title: 'Hide auto-dubbed videos', description: 'Hide cards labeled as dubbed, auto-dubbed, or alternate-audio videos.' }
                    ].forEach(toggleInfo => {
                        typeSection.appendChild(createVideoHiderToggle({ ...toggleInfo, defaultChecked: false }));
                    });

                    const lowViewToggle = createVideoHiderToggle({
                        key: 'hideVideosLowViewFilter',
                        title: 'Hide low-view videos',
                        description: 'Hide videos below the view-count threshold when YouTube exposes a view count on the card.',
                        defaultChecked: false
                    });
                    typeSection.appendChild(lowViewToggle);

                    const lowViewField = document.createElement('label');
                    lowViewField.className = 'ytkit-vh-field';
                    lowViewField.htmlFor = 'ytkit-vh-low-view-threshold';
                    const lowViewLabel = document.createElement('span');
                    lowViewLabel.className = 'ytkit-vh-field-label';
                    lowViewLabel.textContent = 'Low-View Threshold';
                    const lowViewCopy = document.createElement('span');
                    lowViewCopy.className = 'ytkit-vh-field-copy';
                    lowViewCopy.id = 'ytkit-vh-low-view-copy';
                    lowViewCopy.textContent = 'Videos below this view count are hidden only when low-view filtering is enabled.';
                    const lowViewRow = document.createElement('div');
                    lowViewRow.className = 'ytkit-vh-input-row';
                    const lowViewInput = document.createElement('input');
                    lowViewInput.type = 'number';
                    lowViewInput.id = 'ytkit-vh-low-view-threshold';
                    lowViewInput.name = 'hideVideosLowViewThreshold';
                    lowViewInput.className = 'ytkit-vh-number';
                    lowViewInput.inputMode = 'numeric';
                    lowViewInput.autocomplete = 'off';
                    lowViewInput.min = '0';
                    lowViewInput.max = '10000000';
                    lowViewInput.step = '100';
                    lowViewInput.value = appState.settings.hideVideosLowViewThreshold || 1000;
                    lowViewInput.setAttribute('aria-describedby', 'ytkit-vh-low-view-copy');
                    lowViewInput.onchange = async () => {
                        appState.settings.hideVideosLowViewThreshold = Math.max(0, Math.min(10000000, parseInt(lowViewInput.value, 10) || 0));
                        lowViewInput.value = appState.settings.hideVideosLowViewThreshold;
                        refreshVideoHiderAfterSettingChange();
                    };
                    const lowViewSuffix = document.createElement('span');
                    lowViewSuffix.className = 'ytkit-vh-inline-note';
                    lowViewSuffix.textContent = 'views';
                    lowViewRow.appendChild(lowViewInput);
                    lowViewRow.appendChild(lowViewSuffix);
                    lowViewField.appendChild(lowViewLabel);
                    lowViewField.appendChild(lowViewCopy);
                    lowViewField.appendChild(lowViewRow);
                    typeSection.appendChild(lowViewField);

                    const watchedField = document.createElement('label');
                    watchedField.className = 'ytkit-vh-field';
                    watchedField.htmlFor = 'ytkit-vh-watched-ratio';
                    const watchedLabel = document.createElement('span');
                    watchedLabel.className = 'ytkit-vh-field-label';
                    watchedLabel.textContent = 'Hide Watched Ratio';
                    const watchedCopy = document.createElement('span');
                    watchedCopy.className = 'ytkit-vh-field-copy';
                    watchedCopy.id = 'ytkit-vh-watched-ratio-copy';
                    watchedCopy.textContent = 'Use 0 to disable. Cards with a resume bar at or above this percent are hidden.';
                    const watchedRow = document.createElement('div');
                    watchedRow.className = 'ytkit-vh-input-row';
                    const watchedInput = document.createElement('input');
                    watchedInput.type = 'number';
                    watchedInput.id = 'ytkit-vh-watched-ratio';
                    watchedInput.name = 'hideVideosWatchedRatio';
                    watchedInput.className = 'ytkit-vh-number';
                    watchedInput.inputMode = 'numeric';
                    watchedInput.autocomplete = 'off';
                    watchedInput.min = '0';
                    watchedInput.max = '100';
                    watchedInput.step = '5';
                    watchedInput.value = appState.settings.hideVideosWatchedRatio || 0;
                    watchedInput.setAttribute('aria-describedby', 'ytkit-vh-watched-ratio-copy');
                    watchedInput.onchange = async () => {
                        appState.settings.hideVideosWatchedRatio = Math.max(0, Math.min(100, parseInt(watchedInput.value, 10) || 0));
                        watchedInput.value = appState.settings.hideVideosWatchedRatio;
                        refreshVideoHiderAfterSettingChange();
                    };
                    const watchedSuffix = document.createElement('span');
                    watchedSuffix.className = 'ytkit-vh-inline-note';
                    watchedSuffix.textContent = '% watched';
                    watchedRow.appendChild(watchedInput);
                    watchedRow.appendChild(watchedSuffix);
                    watchedField.appendChild(watchedLabel);
                    watchedField.appendChild(watchedCopy);
                    watchedField.appendChild(watchedRow);
                    typeSection.appendChild(watchedField);
                    container.appendChild(typeSection);

                    // Duration filter
                    const durSection = createVideoHiderSection(
                        'Duration Filter',
                        'Automatically hide videos shorter than your chosen minimum length.'
                    );
                    const durField = document.createElement('label');
                    durField.className = 'ytkit-vh-field';
                    durField.htmlFor = 'ytkit-vh-duration';
                    const durLabel = document.createElement('span');
                    durLabel.className = 'ytkit-vh-field-label';
                    durLabel.textContent = 'Minimum Duration';
                    const durHelper = document.createElement('span');
                    durHelper.className = 'ytkit-vh-field-copy';
                    durHelper.id = 'ytkit-vh-duration-copy';
                    durHelper.textContent = 'Use 0 to disable this rule.';
                    const durRow = document.createElement('div');
                    durRow.className = 'ytkit-vh-input-row';
                    const durInput = document.createElement('input');
                    durInput.type = 'number';
                    durInput.id = 'ytkit-vh-duration';
                    durInput.name = 'hideVideosDurationFilter';
                    durInput.className = 'ytkit-vh-number';
                    durInput.inputMode = 'numeric';
                    durInput.autocomplete = 'off';
                    durInput.min = '0';
                    durInput.max = '60';
                    durInput.step = '1';
                    durInput.value = appState.settings.hideVideosDurationFilter || 0;
                    durInput.setAttribute('aria-describedby', 'ytkit-vh-duration-copy');
                    durInput.onchange = async () => {
                        appState.settings.hideVideosDurationFilter = Math.max(0, Math.min(60, parseInt(durInput.value, 10) || 0));
                        durInput.value = appState.settings.hideVideosDurationFilter;
                        settingsManager.save(appState.settings);
                        videoHiderFeature?._restoreRemovedVideoNodes?.();
                        videoHiderFeature?._processAllVideos();
                        updateVideoHiderMeta();
                    };
                    const durSuffix = document.createElement('span');
                    durSuffix.className = 'ytkit-vh-inline-note';
                    durSuffix.textContent = 'minutes';
                    durRow.appendChild(durInput);
                    durRow.appendChild(durSuffix);
                    durField.appendChild(durLabel);
                    durField.appendChild(durHelper);
                    durField.appendChild(durRow);
                    durSection.appendChild(durField);
                    container.appendChild(durSection);

                    // Subscription Load Limiter
                    const limiterSection = createVideoHiderSection(
                        'Subscription Load Limiter',
                        'Stop endless loading on Subscriptions when too many consecutive batches are fully hidden.'
                    );
                    const limiterToggleRow = document.createElement('div');
                    limiterToggleRow.className = 'ytkit-vh-toggle-row';
                    const limiterToggleCopy = document.createElement('div');
                    limiterToggleCopy.className = 'ytkit-vh-toggle-copy';
                    const limiterToggleLabel = document.createElement('div');
                    limiterToggleLabel.className = 'ytkit-vh-toggle-title';
                    limiterToggleLabel.textContent = 'Enable Load Limiter';
                    const limiterToggleDesc = document.createElement('div');
                    limiterToggleDesc.className = 'ytkit-vh-toggle-desc';
                    limiterToggleDesc.textContent = 'Recommended if you hide a lot of subscription feed content.';
                    const limiterSwitch = document.createElement('div');
                    limiterSwitch.className = 'ytkit-switch' + (appState.settings.hideVideosSubsLoadLimit !== false ? ' active' : '');
                    limiterSwitch.style.cssText = 'cursor:pointer;';
                    const limiterInput = document.createElement('input');
                    limiterInput.type = 'checkbox';
                    limiterInput.name = 'hideVideosSubsLoadLimit';
                    limiterInput.setAttribute('aria-label', 'Enable subscription load limiter');
                    limiterInput.checked = appState.settings.hideVideosSubsLoadLimit !== false;
                    const limiterTrack = document.createElement('span');
                    limiterTrack.className = 'ytkit-switch-track';
                    const limiterThumb = document.createElement('span');
                    limiterThumb.className = 'ytkit-switch-thumb';
                    limiterTrack.appendChild(limiterThumb);
                    limiterSwitch.appendChild(limiterInput);
                    limiterSwitch.appendChild(limiterTrack);
                    limiterToggleCopy.appendChild(limiterToggleLabel);
                    limiterToggleCopy.appendChild(limiterToggleDesc);
                    limiterToggleRow.appendChild(limiterToggleCopy);
                    limiterToggleRow.appendChild(limiterSwitch);
                    limiterSection.appendChild(limiterToggleRow);
                    const thresholdRow = document.createElement('label');
                    thresholdRow.className = 'ytkit-vh-field';
                    thresholdRow.htmlFor = 'ytkit-vh-threshold';
                    const thresholdLabel = document.createElement('span');
                    thresholdLabel.className = 'ytkit-vh-field-label';
                    thresholdLabel.textContent = 'Consecutive Hidden Batches';
                    const thresholdCopy = document.createElement('span');
                    thresholdCopy.className = 'ytkit-vh-field-copy';
                    thresholdCopy.id = 'ytkit-vh-threshold-copy';
                    thresholdCopy.textContent = 'Lower values stop faster. Higher values allow more loading before the limiter steps in.';
                    const thresholdInputRow = document.createElement('div');
                    thresholdInputRow.className = 'ytkit-vh-input-row';
                    const thresholdInput = document.createElement('input');
                    thresholdInput.type = 'number';
                    thresholdInput.id = 'ytkit-vh-threshold';
                    thresholdInput.name = 'hideVideosSubsLoadThreshold';
                    thresholdInput.className = 'ytkit-vh-number';
                    thresholdInput.inputMode = 'numeric';
                    thresholdInput.autocomplete = 'off';
                    thresholdInput.min = '1';
                    thresholdInput.max = '20';
                    thresholdInput.step = '1';
                    thresholdInput.value = appState.settings.hideVideosSubsLoadThreshold || 3;
                    thresholdInput.setAttribute('aria-describedby', 'ytkit-vh-threshold-copy');
                    const thresholdNote = document.createElement('span');
                    thresholdNote.className = 'ytkit-vh-inline-note';
                    thresholdNote.textContent = 'batches';

                    const syncLimiterState = () => {
                        const isEnabled = limiterInput.checked;
                        limiterSwitch.classList.toggle('active', limiterInput.checked);
                        limiterToggleRow.classList.toggle('is-disabled', !isEnabled);
                        thresholdRow.classList.toggle('is-disabled', !isEnabled);
                        thresholdInput.disabled = !isEnabled;
                    };

                    limiterInput.onchange = async () => {
                        appState.settings.hideVideosSubsLoadLimit = limiterInput.checked;
                        syncLimiterState();
                        settingsManager.save(appState.settings);
                        if (!limiterInput.checked) videoHiderFeature?._removeLoadBlocker?.();
                        else videoHiderFeature?._resetSubsLoadState?.();
                        updateVideoHiderMeta();
                    };
                    thresholdInput.onchange = async () => {
                        appState.settings.hideVideosSubsLoadThreshold = Math.max(1, Math.min(20, parseInt(thresholdInput.value, 10) || 3));
                        thresholdInput.value = appState.settings.hideVideosSubsLoadThreshold;
                        settingsManager.save(appState.settings);
                        updateVideoHiderMeta();
                    };
                    thresholdInputRow.appendChild(thresholdInput);
                    thresholdInputRow.appendChild(thresholdNote);
                    thresholdRow.appendChild(thresholdLabel);
                    thresholdRow.appendChild(thresholdCopy);
                    thresholdRow.appendChild(thresholdInputRow);
                    limiterSection.appendChild(thresholdRow);
                    syncLimiterState();
                    container.appendChild(limiterSection);

                    // Stats
                    const statsSection = createVideoHiderSection(
                        'At-a-Glance Status',
                        'A quick snapshot of what Video Hider is currently managing for you.'
                    );
                    const statsGrid = document.createElement('div');
                    statsGrid.className = 'ytkit-vh-stat-grid';
                    const videoCount = videoHiderFeature?._getHiddenVideos()?.length || 0;
                    const allowedCount = videoHiderFeature?._getAllowedVideos()?.length || 0;
                    const channelCount = videoHiderFeature?._getBlockedChannels()?.length || 0;
                    [{ label: 'Hidden Videos', value: videoCount }, { label: 'Allowed Videos', value: allowedCount }, { label: 'Blocked Channels', value: channelCount }].forEach(stat => {
                        const statEl = document.createElement('div');
                        statEl.className = 'ytkit-vh-stat-card';
                        const val = document.createElement('div');
                        val.className = 'ytkit-vh-stat-value';
                        val.textContent = stat.value;
                        const lbl = document.createElement('div');
                        lbl.className = 'ytkit-vh-stat-label';
                        lbl.textContent = stat.label;
                        statEl.appendChild(val); statEl.appendChild(lbl);
                        statsGrid.appendChild(statEl);
                    });
                    statsSection.appendChild(statsGrid);
                    container.appendChild(statsSection);
                    tabContent.appendChild(container);
                }
            }

            updateVideoHiderMeta();
            renderTabContent('videos');
            return pane;
        }

        categoryOrder.forEach((cat, index) => {

            const categoryFeatures = featuresByCategory[cat];
            if (!categoryFeatures || categoryFeatures.length === 0) return;

            const config = CATEGORY_CONFIG[cat] || { icon: 'settings', color: '#60a5fa' };
            const catId = cat.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '');
            const parentFeatures = categoryFeatures.filter(f => !f.isSubFeature);
            const subFeatures = categoryFeatures.filter(f => f.isSubFeature);

            const pane = document.createElement('section');
            pane.id = `ytkit-pane-${catId}`;
            pane.className = 'ytkit-pane' + (index === 0 ? ' active' : '');

            // Pane header
            const paneHeader = document.createElement('div');
            paneHeader.className = 'ytkit-pane-header';

            const paneTitle = document.createElement('div');
            paneTitle.className = 'ytkit-pane-title';

            const paneEyebrow = document.createElement('span');
            paneEyebrow.className = 'ytkit-pane-eyebrow';
            paneEyebrow.textContent = CATEGORY_META[cat]?.summary || 'Settings group';

            const paneTitleH2 = document.createElement('h2');
            paneTitleH2.textContent = cat;
            const paneDescription = document.createElement('p');
            paneDescription.className = 'ytkit-pane-description';
            paneDescription.textContent = CATEGORY_META[cat]?.description || 'Adjust how this part of YouTube behaves.';
            const paneMeta = document.createElement('div');
            paneMeta.className = 'ytkit-pane-meta';
            const paneEnabledChip = document.createElement('span');
            paneEnabledChip.className = 'ytkit-pane-chip';
            paneEnabledChip.dataset.stat = 'enabled';
            paneEnabledChip.dataset.category = catId;
            paneEnabledChip.textContent = `${countEnabledToggleFeatures(parentFeatures)} On`;
            const paneTotalChip = document.createElement('span');
            paneTotalChip.className = 'ytkit-pane-chip';
            paneTotalChip.textContent = `${parentFeatures.length} Items`;
            paneMeta.appendChild(paneEnabledChip);
            paneMeta.appendChild(paneTotalChip);

            paneTitle.appendChild(paneEyebrow);
            paneTitle.appendChild(paneTitleH2);
            paneTitle.appendChild(paneDescription);
            paneTitle.appendChild(paneMeta);

            const toggleAllLabel = document.createElement('label');
            toggleAllLabel.className = 'ytkit-toggle-all';

            const toggleAllText = document.createElement('span');
            toggleAllText.textContent = 'All';

            const toggleAllSwitch = document.createElement('div');
            toggleAllSwitch.className = 'ytkit-switch';

            const toggleAllInput = document.createElement('input');
            toggleAllInput.type = 'checkbox';
            toggleAllInput.className = 'ytkit-toggle-all-cb';
            toggleAllInput.dataset.category = catId;

            const toggleAllTrack = document.createElement('span');
            toggleAllTrack.className = 'ytkit-switch-track';

            const toggleAllThumb = document.createElement('span');
            toggleAllThumb.className = 'ytkit-switch-thumb';

            toggleAllTrack.appendChild(toggleAllThumb);
            toggleAllSwitch.appendChild(toggleAllInput);
            toggleAllSwitch.appendChild(toggleAllTrack);
            toggleAllLabel.appendChild(toggleAllText);
            toggleAllLabel.appendChild(toggleAllSwitch);
            toggleAllInput.setAttribute('aria-label', `Enable all settings in ${cat}`);

            const paneActions = document.createElement('div');
            paneActions.className = 'ytkit-pane-actions';

            // Reset group button
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'ytkit-reset-group-btn';
            resetBtn.title = 'Reset this group to defaults';
            resetBtn.textContent = 'Reset';
            resetBtn.onclick = () => {
                const categoryFeatures = featuresByCategory[cat];
                const backup = {};
                categoryFeatures.forEach(f => { backup[f.id] = appState.settings[f.id]; });
                categoryFeatures.forEach(f => {
                    const defaultValue = settingsManager.defaults[f.id];
                    if (defaultValue !== undefined) {
                        appState.settings[f.id] = defaultValue;
                        try { destroyFeatureLifecycle(f, 'group-reset'); } catch(err) {
                            DebugManager.log('Reset', `Destroy failed for "${f.id}": ${err.message}`);
                        }
                        if (defaultValue) {
                            try { initFeatureLifecycle(f, 'group-reset'); } catch(err) {
                                DebugManager.log('Reset', `Init failed for "${f.id}": ${err.message}`);
                            }
                        }
                    }
                });
                settingsManager.save(appState.settings);
                updateAllToggleStates();
                setPanelStatus(`${cat} reset to defaults. Undo is available in the toast.`, 'warn');
                // Update UI
                categoryFeatures.forEach(f => {
                    const toggle = document.getElementById(`ytkit-toggle-${f.id}`);
                    if (toggle) {
                        toggle.checked = appState.settings[f.id];
                        const switchEl = toggle.closest('.ytkit-switch');
                        if (switchEl) switchEl.classList.toggle('active', toggle.checked);
                    }
                });
                showToast(`"${cat}" reset to defaults`, '#f97316', { duration: 5, action: { text: 'Undo', onClick: async () => {
                    categoryFeatures.forEach(f => {
                        if (backup[f.id] !== undefined) {
                            appState.settings[f.id] = backup[f.id];
                            try { destroyFeatureLifecycle(f, 'group-reset-undo'); } catch(err) {
                                DebugManager.log('Reset', `Undo destroy failed for "${f.id}": ${err.message}`);
                            }
                            if (backup[f.id]) {
                                try { initFeatureLifecycle(f, 'group-reset-undo'); } catch(err) {
                                    DebugManager.log('Reset', `Undo init failed for "${f.id}": ${err.message}`);
                                }
                            }
                        }
                    });
                    settingsManager.save(appState.settings);
                    updateAllToggleStates();
                    setPanelStatus(`${cat} restored.`, 'success');
                    categoryFeatures.forEach(f => {
                        const t = document.getElementById(`ytkit-toggle-${f.id}`);
                        if (t) { t.checked = appState.settings[f.id]; const s = t.closest('.ytkit-switch'); if (s) s.classList.toggle('active', t.checked); }
                    });
                    showToast(`"${cat}" restored`, '#22c55e');
                }}});
            };
            paneActions.appendChild(resetBtn);
            paneActions.appendChild(toggleAllLabel);

            paneHeader.appendChild(paneTitle);
            paneHeader.appendChild(paneActions);
            pane.appendChild(paneHeader);

            // MediaDL status banner for Downloads pane
            if (cat === 'Downloads') {
                const banner = document.createElement('div');
                banner.id = 'ytkit-mediadl-banner';
                banner.className = 'ytkit-mediadl-banner';
                banner.dataset.state = 'checking';
                banner.setAttribute('role', 'region');
                banner.setAttribute('aria-labelledby', 'ytkit-mediadl-title');
                banner.setAttribute('aria-describedby', 'ytkit-mediadl-status-text');

                const bannerTop = document.createElement('div');
                bannerTop.className = 'ytkit-mediadl-banner__top';

                const bannerLeft = document.createElement('div');
                bannerLeft.className = 'ytkit-mediadl-banner__main';
                const statusDot = document.createElement('span');
                statusDot.id = 'ytkit-mediadl-status-dot';
                statusDot.className = 'ytkit-mediadl-banner__dot';
                statusDot.setAttribute('aria-hidden', 'true');
                const bannerInfo = document.createElement('div');
                bannerInfo.className = 'ytkit-mediadl-banner__copy';
                const bannerTitle = document.createElement('div');
                bannerTitle.id = 'ytkit-mediadl-title';
                bannerTitle.className = 'ytkit-mediadl-banner__title';
                bannerTitle.textContent = 'Astra Downloader';
                const bannerStatus = document.createElement('div');
                bannerStatus.id = 'ytkit-mediadl-status-text';
                bannerStatus.className = 'ytkit-mediadl-banner__status';
                bannerStatus.setAttribute('role', 'status');
                bannerStatus.setAttribute('aria-live', 'polite');
                bannerStatus.textContent = 'Checking downloader status…';
                bannerInfo.appendChild(bannerTitle);
                bannerInfo.appendChild(bannerStatus);
                bannerLeft.appendChild(statusDot);
                bannerLeft.appendChild(bannerInfo);

                const bannerActions = document.createElement('div');
                bannerActions.id = 'ytkit-mediadl-banner-actions';
                bannerActions.className = 'ytkit-mediadl-banner__actions';
                bannerActions.setAttribute('aria-label', 'Downloader actions');

                bannerTop.appendChild(bannerLeft);
                bannerTop.appendChild(bannerActions);
                banner.appendChild(bannerTop);

                pane.appendChild(banner);

                // Check MediaDL status and update banner
                (async () => {
                    const result = await MediaDLManager.check();
                    if (!banner.isConnected) return;
                    const text = bannerStatus;
                    const actions = bannerActions;

                    const makeBannerButton = (label, variant = 'ghost') => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = `ytkit-mediadl-banner__btn ytkit-mediadl-banner__btn--${variant}`;
                        button.textContent = label;
                        return button;
                    };

                    if (result.ok) {
                        banner.dataset.state = 'ready';
                        text.textContent = `Running${result.version ? ' (v' + result.version + ')' : ''} \u2014 yt-dlp server ready`;
                        // Add a "Check" refresh button
                        const refreshBtn = makeBannerButton('Refresh');
                        refreshBtn.textContent = 'Refresh';
                        refreshBtn.onclick = async () => {
                            refreshBtn.textContent = 'Checking…';
                            refreshBtn.disabled = true;
                            banner.dataset.state = 'checking';
                            const r = await MediaDLManager.check(true);
                            banner.dataset.state = r.ok ? 'ready' : 'missing';
                            text.textContent = r.ok ? `Running${r.version ? ' (v' + r.version + ')' : ''} \u2014 yt-dlp server ready` : 'Not connected. Local downloads need the setup helper.';
                            refreshBtn.textContent = 'Refresh';
                            refreshBtn.disabled = false;
                        };
                        actions.appendChild(refreshBtn);
                    } else {
                        banner.dataset.state = 'missing';
                        text.textContent = 'Not connected. Local downloads need the setup helper.';

                        // "Try Start" button — attempts auto-start via mediadl:// protocol
                        const startBtn = makeBannerButton('Start service');
                        startBtn.title = 'Try to start the Astra Downloader service';
                        startBtn.onclick = async () => {
                            startBtn.textContent = 'Starting…';
                            startBtn.disabled = true;
                            banner.dataset.state = 'checking';
                            text.textContent = 'Trying to start the Astra Downloader service…';
                            MediaDLManager.resetAutoStart();
                            const r = await MediaDLManager.tryAutoStart(5);
                            if (r.ok) {
                                banner.dataset.state = 'ready';
                                text.textContent = `Running${r.version ? ' (v' + r.version + ')' : ''} \u2014 yt-dlp server ready`;
                                startBtn.textContent = 'Running';
                                startBtn.classList.add('is-success');
                            } else {
                                banner.dataset.state = 'missing';
                                text.textContent = 'The service did not start. Run setup to repair Astra Downloader.';
                                startBtn.textContent = 'Start service';
                                startBtn.disabled = false;
                                showToast('Astra Downloader did not start. Run setup to repair it.', '#f59e0b', { duration: 4 });
                            }
                        };
                        actions.appendChild(startBtn);

                        // "Install" button — downloads the setup file and copies the fallback command
                        const installBtn = makeBannerButton('Download setup', 'accent');
                        installBtn.textContent = 'Download setup';
                        installBtn.title = 'Download the Astra Deck setup file and reveal it in Downloads';
                        installBtn.onclick = async () => {
                            installBtn.textContent = 'Preparing…';
                            installBtn.disabled = true;
                            banner.dataset.state = 'checking';
                            text.textContent = 'Preparing the setup file…';
                            const result = await MediaDLManager.runInstallAssist();
                            installBtn.textContent = result.downloaded ? 'Setup ready' : 'Open setup';
                            installBtn.classList.toggle('is-success', !!result.downloaded);
                            banner.dataset.state = result.downloaded ? 'ready' : 'checking';
                            text.textContent = result.downloaded
                                ? 'Setup downloaded. Open the file, finish installation, then refresh.'
                                : 'Setup opened. Finish installation, then refresh.';
                            setTimeout(() => {
                                installBtn.textContent = 'Download setup';
                                installBtn.classList.remove('is-success');
                                installBtn.disabled = false;
                            }, 3500);
                        };
                        actions.appendChild(installBtn);

                        // "Copy command" button
                        const dlBtn = makeBannerButton('Copy command');
                        dlBtn.title = 'Copy the fallback PowerShell install command';
                        dlBtn.onclick = async () => {
                            const copied = await MediaDLManager.copyInstallCommand();
                            if (copied) {
                                dlBtn.textContent = 'Command copied';
                                text.textContent = 'Fallback command copied. Use it only if the setup file cannot run.';
                                showToast(t('toastDlCmdCopied', 'Fallback install command copied. Use it only if you cannot run the downloaded setup file.'), '#3b82f6', { duration: 6 });
                                setTimeout(() => { dlBtn.textContent = 'Copy command'; }, 3000);
                            } else {
                                void openExternalUrl(MediaDLManager.INSTALLER_URL).catch(() => {});
                            }
                        };
                        actions.appendChild(dlBtn);
                    }
                })();
            }

            // Features grid
            const grid = document.createElement('div');
            grid.className = 'ytkit-features-grid';

            // Sort features: dropdowns/selects first, then others
            const sortedParentFeatures = [...parentFeatures].sort((a, b) => {
                const aIsDropdown = a.type === 'select';
                const bIsDropdown = b.type === 'select';
                if (aIsDropdown && !bIsDropdown) return -1;
                if (!aIsDropdown && bIsDropdown) return 1;
                return 0;
            });

            sortedParentFeatures.forEach(f => {
                const card = buildFeatureCard(f, config.color);
                grid.appendChild(card);

                // Add sub-features if any
                const children = subFeatures.filter(sf => sf.parentId === f.id);
                if (children.length > 0) {
                    const subContainer = document.createElement('div');
                    subContainer.className = 'ytkit-sub-features';
                    subContainer.dataset.parentId = f.id;
                    if (!appState.settings[f.id]) { subContainer.style.opacity = '0.35'; subContainer.style.pointerEvents = 'none'; }
                    children.forEach(sf => {
                        subContainer.appendChild(buildFeatureCard(sf, config.color, true));
                    });
                    grid.appendChild(subContainer);
                }
            });

            pane.appendChild(grid);
            content.appendChild(pane);
        });

        body.appendChild(sidebar);
        body.appendChild(content);

        // Footer
        const footer = document.createElement('footer');
        footer.className = 'ytkit-footer';

        const footerLeft = document.createElement('div');
        footerLeft.className = 'ytkit-footer-left';

        const githubLink = document.createElement('a');
        githubLink.href = 'https://github.com/SysAdminDoc/Astra-Deck';
        githubLink.target = '_blank';
        githubLink.rel = 'noopener noreferrer';
        githubLink.className = 'ytkit-github';
        githubLink.title = 'View on GitHub';
        githubLink.appendChild(ICONS.github());

        // Local downloader installer button
        const ytToolsBtn = document.createElement('button');
        ytToolsBtn.type = 'button';
        ytToolsBtn.className = 'ytkit-github';
        ytToolsBtn.title = 'Download the Astra Deck downloader setup file';
        ytToolsBtn.setAttribute('aria-label', 'Download the Astra Deck downloader setup file');
        ytToolsBtn.style.cssText = 'background: linear-gradient(135deg, #f97316, #22c55e) !important; border: none; cursor: pointer;';
        const dlIcon = ICONS.download();
        dlIcon.style.color = 'white';
        ytToolsBtn.appendChild(dlIcon);

        ytToolsBtn.addEventListener('click', () => {
            MediaDLManager.runInstallAssist().catch(() => {
                void openExternalUrl(MediaDLManager.INSTALLER_URL).catch(() => {});
            });
        });
        const ytToolsLink = ytToolsBtn; // Alias for existing appendChild call

        const versionSpan = document.createElement('span');
        versionSpan.className = 'ytkit-version';
        versionSpan.textContent = 'v' + YTKIT_VERSION;
        versionSpan.style.position = 'relative';
        versionSpan.style.cursor = 'pointer';
        // What's New badge
        const CURRENT_VER = YTKIT_VERSION;
        const lastSeenVer = storageRead('ytkit_last_seen_version', '');
        if (lastSeenVer !== CURRENT_VER) {
            const badge = document.createElement('span');
            badge.id = 'ytkit-whats-new-badge';
            badge.style.cssText = 'position:absolute;top:-3px;right:-8px;width:8px;height:8px;background:#ef4444;border-radius:50%;animation:ytkit-badge-pulse 2s infinite;';
            versionSpan.appendChild(badge);
            versionSpan.title = `New in v${YTKIT_VERSION}: Performance audit — fixed listener leaks, replaced polling with events, seek stutter fix`;
            versionSpan.onclick = () => {
                storageWrite('ytkit_last_seen_version', CURRENT_VER);
                badge.remove();
                showToast(`v${YTKIT_VERSION}: Fixed quality/codec selection — DOM click quality, MAIN world codec bridge`, '#3b82f6', { duration: 6 });
            };
        }

        footerLeft.appendChild(githubLink);
        footerLeft.appendChild(ytToolsLink);
        footerLeft.appendChild(versionSpan);

        const footerStatus = document.createElement('span');
        footerStatus.className = 'ytkit-panel-status';
        footerStatus.id = 'ytkit-panel-status';
        footerStatus.setAttribute('role', 'status');
        footerStatus.setAttribute('aria-live', 'polite');
        footerStatus.dataset.tone = 'idle';
        footerStatus.textContent = 'Ready. Changes save automatically.';

        const footerRight = document.createElement('div');
        footerRight.className = 'ytkit-footer-right';

        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'ytkit-btn ytkit-btn-secondary';
        importBtn.id = 'ytkit-import';
        importBtn.setAttribute('aria-label', `Import ${BRAND.name} settings`);
        importBtn.appendChild(ICONS.upload());
        const importText = document.createElement('span');
        importText.textContent = 'Import';
        importBtn.appendChild(importText);

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'ytkit-btn ytkit-btn-primary';
        exportBtn.id = 'ytkit-export';
        exportBtn.setAttribute('aria-label', `Export ${BRAND.name} settings`);
        exportBtn.appendChild(ICONS.download());
        const exportText = document.createElement('span');
        exportText.textContent = 'Export';
        exportBtn.appendChild(exportText);

        footerRight.appendChild(importBtn);
        footerRight.appendChild(exportBtn);

        footer.appendChild(footerLeft);
        footer.appendChild(footerStatus);
        footer.appendChild(footerRight);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        if (panel.dir === 'rtl') {
            injectStyle(`
                #ytkit-settings-panel[dir="rtl"] .ytkit-sidebar { border-right: none; border-left: 1px solid rgba(255,255,255,0.08); }
                #ytkit-settings-panel[dir="rtl"] .ytkit-search-icon { left: auto; right: 14px; }
                #ytkit-settings-panel[dir="rtl"] .ytkit-search-meta { right: auto; left: 12px; }
                #ytkit-settings-panel[dir="rtl"] .ytkit-search-input { padding: 12px 40px 12px 84px; }
                #ytkit-settings-panel[dir="rtl"] .ytkit-feature-card { text-align: right; }
            `, 'ytkit-rtl-panel', true);
        }

        attachUIEventListeners();
        updateAllToggleStates();
    }

function buildFeatureCard(f, accentColor, isSubFeature = false) {
        const card = document.createElement('div');
        const featureType = f.type || 'toggle';
        const featureName = getFeatureName(f);
        const featureDescription = String(getFeatureDescription(f) || '').trim();
        card.className = 'ytkit-feature-card'
            + ` ytkit-feature-card--${featureType}`
            + (isSubFeature ? ' ytkit-sub-card' : '')
            + (f.type === 'textarea' ? ' ytkit-textarea-card' : '')
            + (f.type === 'select' ? ' ytkit-select-card' : '')
            + (f.type === 'info' ? ' ytkit-info-card' : '')
            + (f.type === 'range' ? ' ytkit-range-card' : '')
            + (f.type === 'color' ? ' ytkit-color-card' : '');
        card.dataset.featureId = f.id;
        card.dataset.featureType = featureType;
        card.dataset.searchText = [
            featureName,
            featureDescription,
            f.id,
            f.group,
            f.type,
            f.parentId,
            ...(Array.isArray(f.pages) ? f.pages.map(formatPageLabel) : [])
        ].filter(Boolean).join(' ').toLowerCase();
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', featureName);
        if (accentColor) card.style.setProperty('--cat-color', accentColor);

        // Apply enabled accent stripe for boolean features
        const _cardIsEnabled = f._arrayKey
            ? (appState.settings[f._arrayKey] || []).includes(f._arrayValue)
            : (f.type !== 'select' && f.type !== 'color' && f.type !== 'range' && appState.settings[f.id]);
        if (_cardIsEnabled && !isSubFeature) card.classList.add('ytkit-card-enabled');

        // Special styling for info cards
        if (f.type === 'info') {
            card.style.cssText = 'background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(34, 197, 94, 0.15)) !important; border: 1px solid rgba(249, 115, 22, 0.3) !important; grid-column: 1 / -1;';
        }

        const featureMain = document.createElement('div');
        featureMain.className = 'ytkit-feature-main';

        const glyph = document.createElement('div');
        glyph.className = 'ytkit-feature-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.style.setProperty('--feature-color', accentColor || '#ff4e45');
        glyph.appendChild((ICONS[f.icon] || ICONS.settings)());

        const info = document.createElement('div');
        info.className = 'ytkit-feature-info';

        const meta = document.createElement('div');
        meta.className = 'ytkit-feature-meta';
        let hasMeta = false;
        if (isSubFeature) {
            const typeBadge = document.createElement('span');
            typeBadge.className = 'ytkit-feature-badge';
            typeBadge.textContent = 'Sub';
            meta.appendChild(typeBadge);
            hasMeta = true;
        }
        if (f.pages && f.pages.length === 1) {
            const pageBadge = document.createElement('span');
            pageBadge.className = 'ytkit-feature-badge ytkit-feature-badge-muted';
            pageBadge.textContent = formatPageLabel(f.pages[0]);
            meta.appendChild(pageBadge);
            hasMeta = true;
        }

        const name = document.createElement('h3');
        name.className = 'ytkit-feature-name';
        name.textContent = featureName;

        const descriptionText = featureDescription;
        card.title = descriptionText || featureName;

        if (hasMeta) info.appendChild(meta);
        info.appendChild(name);
        if (descriptionText) {
            const description = document.createElement('p');
            description.className = 'ytkit-feature-desc';
            description.textContent = descriptionText;
            info.appendChild(description);
        }
        featureMain.appendChild(glyph);
        featureMain.appendChild(info);

        // Feature preview tooltip — also mirrored into aria-description so
        // assistive tech hears what sighted users see on hover/focus-within.
        const previewText = FEATURE_PREVIEWS[f.id];
        if (previewText) {
            card.dataset.preview = previewText;
            card.setAttribute('aria-description', previewText);
            card.classList.add('ytkit-has-preview');
        }

        card.appendChild(featureMain);

        if (typeof f.render === 'function') {
            const custom = f.render(card);
            if (custom instanceof Element) {
                custom.classList.add('ytkit-feature-custom');
                card.appendChild(custom);
            }
        }

        if (f.type === 'info') {
            // info-type features have no interactive control
        } else if (f.type === 'textarea') {
            const fieldShell = document.createElement('div');
            fieldShell.className = 'ytkit-field-shell ytkit-textarea-shell';
            const textarea = document.createElement('textarea');
            textarea.className = 'ytkit-input';
            textarea.id = `ytkit-input-${f.id}`;
            textarea.setAttribute('aria-label', featureName);
            textarea.placeholder = f.placeholder || 'word1, word2, phrase';
            textarea.value = appState.settings[f.settingKey || f.id] ?? '';
            // Auto-save on blur for textarea features
            textarea.addEventListener('blur', () => {
                const key = f.settingKey || f.id;
                const nextValue = textarea.value;
                appState.settings[key] = nextValue;
                settingsManager.save(appState.settings);
                document.dispatchEvent(new CustomEvent('ytkit-settings-changed', { detail: { key } }));
            });
            fieldShell.appendChild(textarea);

            card.appendChild(fieldShell);
        } else if (f.type === 'select') {
            const selectShell = document.createElement('label');
            selectShell.className = 'ytkit-select-shell';
            selectShell.setAttribute('for', `ytkit-select-${f.id}`);

            const select = document.createElement('select');
            select.className = 'ytkit-select';
            select.id = `ytkit-select-${f.id}`;
            select.setAttribute('aria-label', featureName);
            select.name = f.settingKey || f.id;
            const options = normalizeSelectOptions(f.options);
            const settingKey = f.settingKey || f.id;
            const currentValue = String(appState.settings[settingKey] ?? options[0]?.value ?? '');
            for (const optionDef of options) {
                const option = document.createElement('option');
                option.value = optionDef.value;
                option.textContent = optionDef.label;
                option.selected = optionDef.value === currentValue;
                select.appendChild(option);
            }

            const chrome = document.createElement('span');
            chrome.className = 'ytkit-select-shell-chrome';
            chrome.setAttribute('aria-hidden', 'true');

            selectShell.appendChild(select);
            selectShell.appendChild(chrome);
            card.appendChild(selectShell);
        } else if (f.type === 'range') {
            const settingKey = f.settingKey || f.id;
            const currentVal = appState.settings[settingKey] ?? f.min ?? 0;
            const wrapper = document.createElement('div');
            wrapper.className = 'ytkit-range-shell';
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = f.min ?? 0;
            slider.max = f.max ?? 100;
            slider.step = f.step ?? 1;
            slider.value = currentVal;
            slider.className = 'ytkit-range';
            slider.id = `ytkit-range-${f.id}`;
            slider.setAttribute('aria-label', featureName);
            const valDisplay = document.createElement('span');
            valDisplay.className = 'ytkit-range-value';
            valDisplay.textContent = f.formatValue ? f.formatValue(currentVal) : currentVal;
            slider.oninput = () => { valDisplay.textContent = f.formatValue ? f.formatValue(slider.value) : slider.value; };
            wrapper.appendChild(slider);
            wrapper.appendChild(valDisplay);
            card.appendChild(wrapper);
        } else if (f.type === 'color') {
            const settingKey = f.settingKey || f.id;
            const currentVal = appState.settings[settingKey] || '';
            const wrapper = document.createElement('div');
            wrapper.className = 'ytkit-color-shell';
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.id = `ytkit-color-${f.id}`;
            colorInput.setAttribute('aria-label', featureName);
            colorInput.value = currentVal || '#3b82f6';
            colorInput.className = 'ytkit-color-input';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'ytkit-color-clear';
            clearBtn.setAttribute('aria-label', `Clear ${featureName}`);
            clearBtn.textContent = 'Clear';
            clearBtn.onclick = () => { colorInput.value = '#3b82f6'; colorInput.dispatchEvent(new Event('change', { bubbles: true })); };
            wrapper.appendChild(colorInput);
            wrapper.appendChild(clearBtn);
            card.appendChild(wrapper);
        } else {
            // For array-toggle sub-features, check array membership instead of boolean
            const isEnabled = f._arrayKey
                ? (appState.settings[f._arrayKey] || []).includes(f._arrayValue)
                : appState.settings[f.id];
            const switchDiv = document.createElement('div');
            switchDiv.className = 'ytkit-switch' + (isEnabled ? ' active' : '');
            switchDiv.style.setProperty('--switch-color', accentColor);

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'ytkit-feature-cb';
            input.id = `ytkit-toggle-${f.id}`;
            input.setAttribute('aria-label', featureName);
            input.checked = isEnabled;

            const track = document.createElement('span');
            track.className = 'ytkit-switch-track';

            const thumb = document.createElement('span');
            thumb.className = 'ytkit-switch-thumb';

            const iconWrap = document.createElement('span');
            iconWrap.className = 'ytkit-switch-icon';
            iconWrap.appendChild(ICONS.check());

            thumb.appendChild(iconWrap);
            track.appendChild(thumb);
            switchDiv.appendChild(input);
            switchDiv.appendChild(track);
            card.appendChild(switchDiv);
        }

        return card;
    }

function updateAllToggleStates() {
        document.querySelectorAll('.ytkit-toggle-all-cb').forEach(cb => {
            const catId = cb.dataset.category;
            const pane = document.getElementById(`ytkit-pane-${catId}`);
            if (!pane) return;
            const featureToggles = pane.querySelectorAll('.ytkit-feature-cb');
            const allChecked = featureToggles.length > 0 && Array.from(featureToggles).every(t => t.checked);
            cb.checked = allChecked;

            // Update switch visual state
            const switchEl = cb.closest('.ytkit-switch');
            if (switchEl) {
                switchEl.classList.toggle('active', allChecked);
            }
        });

        // Update nav counts
        document.querySelectorAll('.ytkit-nav-btn').forEach(btn => {
            const catId = btn.dataset.tab;
            const pane = document.getElementById(`ytkit-pane-${catId}`);
            if (!pane) return;
            const paneFeatures = Array.from(pane.querySelectorAll('.ytkit-feature-card:not(.ytkit-sub-card)'))
                .map(card => getFeatureById(card.dataset.featureId))
                .filter(Boolean);
            const enabledCount = countEnabledToggleFeatures(paneFeatures);
            const totalCount = Number(btn.dataset.totalCount || paneFeatures.length || 0);
            const countEl = btn.querySelector('.ytkit-nav-count');
            if (countEl) {
                countEl.textContent = `${enabledCount}/${totalCount}`;
                countEl.style.color = '';
            }
            const paneEnabledChip = pane.querySelector('.ytkit-pane-chip[data-stat="enabled"]');
            if (paneEnabledChip) paneEnabledChip.textContent = `${enabledCount} On`;
        });

        const sidebarEnabledCount = document.getElementById('ytkit-sidebar-enabled-count');
        if (sidebarEnabledCount) {
            const topLevelFeatures = liveFeatureList.filter((feature) => !feature.isSubFeature);
            sidebarEnabledCount.textContent = String(countEnabledToggleFeatures(topLevelFeatures));
        }

        const activeSearchInput = document.getElementById('ytkit-search');
        if (activeSearchInput?.value.trim() && typeof _panelSearchUpdater === 'function') {
            _panelSearchUpdater(activeSearchInput.value, { preserveScroll: true });
        }
    }

function attachUIEventListeners() {
        const doc = document;

        const clearPanelSearch = (focusInput = false) => {
            const searchInput = doc.getElementById('ytkit-search');
            if (!searchInput) return;
            if (searchInput.value) {
                searchInput.value = '';
            }
            if (typeof _panelSearchUpdater === 'function') {
                _panelSearchUpdater('');
            }
            if (focusInput) {
                searchInput.focus({ preventScroll: true });
            }
        };

        if (!_globalUIListenersAttached) {
            // Auto-close panel on SPA navigation — prevents overlay persisting on home/other pages
            doc.addEventListener('yt-navigate-start', () => {
                setSettingsPanelOpen(false);
            });

            // Keyboard shortcuts
            doc.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && isSettingsPanelOpen()) {
                    setSettingsPanelOpen(false);
                }
                const activeDialog = getPageModalOpen()
                    ? document.getElementById('ytkit-page-modal')
                    : isSettingsPanelOpen()
                        ? document.getElementById('ytkit-settings-panel')
                        : null;
                if (e.key === 'Tab' && activeDialog) {
                    trapFocusWithin(activeDialog, e);
                }
                // v4.5.3: Ctrl+Alt+Y in-page toggle retired with the rest of
                // the shortcut surface per the "no keyboard shortcuts" rule.
                // Activators: toolbar action button, in-page gear icon, popup.
            });

            _globalUIListenersAttached = true;
        }

        if (_panelUIListenersAttached || !document.getElementById('ytkit-settings-panel')) return;
        _panelUIListenersAttached = true;

        // Close panel + Tab navigation (single delegated handler)
        doc.addEventListener('click', (e) => {
            if (!isSettingsPanelOpen()) return;
            if (e.target.closest('.ytkit-close') || e.target.matches('#ytkit-overlay')) {
                setSettingsPanelOpen(false);
                return;
            }
            if (e.target.closest('#ytkit-search-clear') || e.target.closest('#ytkit-search-state-clear')) {
                clearPanelSearch(true);
                return;
            }
            const navBtn = e.target.closest('.ytkit-nav-btn');
            if (navBtn) {
                doc.querySelectorAll('.ytkit-nav-btn').forEach(btn => btn.classList.remove('active'));
                doc.querySelectorAll('.ytkit-pane').forEach(pane => pane.classList.remove('active'));
                navBtn.classList.add('active');
                const pane = doc.querySelector(`#ytkit-pane-${navBtn.dataset.tab}`);
                if (pane) {
                    pane.classList.add('active');
                    pane.scrollTop = 0;
                }
                const contentArea = doc.querySelector('.ytkit-content');
                if (contentArea) contentArea.scrollTop = 0;
                // Clear search on tab click
                const searchInput = doc.getElementById('ytkit-search');
                if (searchInput && searchInput.value) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            // Export/Import
            if (e.target.closest('#ytkit-export')) {
                const configString = settingsManager.exportAllSettings();
                handleFileExport('astra_deck_settings.json', configString);
                createToast('Settings exported successfully', 'success');
                setPanelStatus('Settings exported. The download is ready.', 'success');
                return;
            }
            if (e.target.closest('#ytkit-import')) {
                handleFileImport(async (content) => {
                    const success = settingsManager.importAllSettings(content);
                    if (success) {
                        handleExternalStorageChanges({
                            [STORAGE_KEYS.settings]: { newValue: StorageManager.get(STORAGE_KEYS.settings, settingsManager.defaults) },
                            [STORAGE_KEYS.hiddenVideos]: { newValue: StorageManager.get(STORAGE_KEYS.hiddenVideos, []) },
                            [STORAGE_KEYS.allowedVideos]: { newValue: StorageManager.get(STORAGE_KEYS.allowedVideos, []) },
                            [STORAGE_KEYS.blockedChannels]: { newValue: StorageManager.get(STORAGE_KEYS.blockedChannels, []) },
                            [STORAGE_KEYS.bookmarks]: { newValue: StorageManager.get(STORAGE_KEYS.bookmarks, {}) }
                        }, 'import', { forceApplyLocal: true });
                        createToast('Settings imported. Changes applied live.', 'success');
                        setPanelStatus('Settings imported. Changes applied live.', 'success');
                    } else {
                        createToast('Import failed. Invalid file format.', 'error');
                        setPanelStatus('Import failed. Choose a valid Astra Deck settings export.', 'error');
                    }
                });
            }
        });

        // Search functionality (debounced)
        let _searchDebounce = null;
        function updateSearchState(rawLabel, query, matchCount, visibleSectionCount) {
            const searchMeta = doc.getElementById('ytkit-search-count');
            const searchClearBtn = doc.getElementById('ytkit-search-clear');
            const searchState = doc.getElementById('ytkit-search-state');
            const searchStateTitle = doc.getElementById('ytkit-search-state-title');
            const searchStateCopy = doc.getElementById('ytkit-search-state-copy');

            if (searchClearBtn) searchClearBtn.hidden = !query;

            if (!query) {
                if (searchMeta) searchMeta.textContent = 'All';
                if (searchState) {
                    searchState.hidden = true;
                    searchState.classList.remove('is-empty');
                }
                return;
            }

            if (searchMeta) {
                searchMeta.textContent = matchCount > 0
                    ? `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                    : 'No matches';
            }

            if (!searchState || !searchStateTitle || !searchStateCopy) return;

            searchState.hidden = false;
            searchState.classList.toggle('is-empty', matchCount === 0);

            if (matchCount > 0) {
                searchStateTitle.textContent = `${matchCount} matching setting${matchCount === 1 ? '' : 's'}`;
                searchStateCopy.textContent = `Showing results across ${visibleSectionCount} section${visibleSectionCount === 1 ? '' : 's'} for "${rawLabel}". Changes save automatically as you toggle or edit a result.`;
            } else {
                searchStateTitle.textContent = `No settings found for "${rawLabel}"`;
                searchStateCopy.textContent = 'Try a feature name, page, or words like comments, transcript, download, or theme.';
            }
        }

        doc.addEventListener('input', (e) => {
            if (!isSettingsPanelOpen()) return;
            if (e.target.matches('#ytkit-search')) {
                clearTimeout(_searchDebounce);
                _searchDebounce = setTimeout(() => { _handleSearch(e.target.value); }, 150);
                return;
            }
        });
        function _handleSearch(rawQuery, options = {}) {
            const query = rawQuery.toLowerCase().trim();
            const rawLabel = rawQuery.trim();
            const allCards = doc.querySelectorAll('.ytkit-feature-card');
            const allPanes = doc.querySelectorAll('.ytkit-pane');
            const allNavBtns = doc.querySelectorAll('.ytkit-nav-btn');
            const contentArea = doc.querySelector('.ytkit-content');
            const preserveScroll = options.preserveScroll === true;

            _panelSearchUpdater = _handleSearch;

            // Clear all previous highlights
            doc.querySelectorAll('.ytkit-feature-name, .ytkit-feature-desc').forEach(el => {
                if (el._originalText !== undefined) el.textContent = el._originalText;
            });
            allCards.forEach(card => {
                card.style.display = '';
                card.classList.remove('ytkit-search-context-card');
                delete card.dataset.searchMatched;
            });
            allPanes.forEach(pane => pane.classList.remove('ytkit-search-active', 'ytkit-search-empty-pane'));
            allNavBtns.forEach(btn => btn.classList.remove('ytkit-search-empty-nav'));

            if (!query) {
                // Reset to normal view
                doc.querySelectorAll('.ytkit-sub-features').forEach(sub => {
                    sub.style.display = '';
                    const parentId = sub.dataset.parentId;
                    const enabled = appState.settings[parentId];
                    sub.style.opacity = enabled ? '' : '0.35';
                    sub.style.pointerEvents = enabled ? '' : 'none';
                });
                // Restore normal tab behavior
                if (!doc.querySelector('.ytkit-pane.active')) {
                    allPanes[0]?.classList.add('active');
                    allNavBtns[0]?.classList.add('active');
                }
                updateSearchState('', '', 0, 0);
                updateAllToggleStates();
                return;
            }

            // Show all panes for searching
            allPanes.forEach(pane => pane.classList.add('ytkit-search-active'));
            doc.querySelectorAll('.ytkit-sub-features').forEach(sub => { sub.style.opacity = ''; sub.style.pointerEvents = ''; });

            // Helper to highlight text matches
            const highlightText = (el, q) => {
                if (!el) return;
                if (el._originalText === undefined) el._originalText = el.textContent;
                const text = el._originalText;
                const idx = text.toLowerCase().indexOf(q);
                if (idx === -1) { el.textContent = text; return; }
                el.textContent = '';
                el.appendChild(document.createTextNode(text.substring(0, idx)));
                const mark = document.createElement('mark');
                mark.className = 'ytkit-search-mark';
                mark.textContent = text.substring(idx, idx + q.length);
                el.appendChild(mark);
                el.appendChild(document.createTextNode(text.substring(idx + q.length)));
            };

            // Filter cards and highlight
            let matchCount = 0;
            allCards.forEach(card => {
                const nameEl = card.querySelector('.ytkit-feature-name');
                const descEl = card.querySelector('.ytkit-feature-desc');
                const name = (nameEl?._originalText || nameEl?.textContent || '').toLowerCase();
                const desc = (descEl?._originalText || descEl?.textContent || '').toLowerCase();
                const haystack = card.dataset.searchText || `${name} ${desc}`;
                const matches = haystack.includes(query);
                card.style.display = matches ? '' : 'none';
                if (matches) {
                    matchCount++;
                    card.dataset.searchMatched = 'true';
                    highlightText(nameEl, query);
                    highlightText(descEl, query);
                }
            });

            doc.querySelectorAll('.ytkit-sub-features').forEach(sub => {
                const parentId = sub.dataset.parentId;
                const visibleChildren = Array.from(sub.querySelectorAll('.ytkit-feature-card')).filter(card => card.style.display !== 'none');
                sub.style.display = visibleChildren.length > 0 ? '' : 'none';
                if (visibleChildren.length > 0 && parentId) {
                    const parentCard = doc.querySelector(`.ytkit-feature-card[data-feature-id="${parentId}"]`);
                    if (parentCard && parentCard.style.display === 'none') {
                        parentCard.style.display = '';
                        parentCard.classList.add('ytkit-search-context-card');
                    }
                }
            });

            // Update nav buttons with match counts
            let visibleSectionCount = 0;
            allNavBtns.forEach(btn => {
                const catId = btn.dataset.tab;
                const pane = doc.getElementById(`ytkit-pane-${catId}`);
                if (pane) {
                    const directMatches = pane.querySelectorAll('.ytkit-feature-card[data-search-matched="true"]').length;
                    const visibleCards = Array.from(pane.querySelectorAll('.ytkit-feature-card')).filter(card => card.style.display !== 'none').length;
                    const countEl = btn.querySelector('.ytkit-nav-count');
                    pane.classList.toggle('ytkit-search-empty-pane', visibleCards === 0);
                    btn.classList.toggle('ytkit-search-empty-nav', directMatches === 0);
                    if (visibleCards > 0) visibleSectionCount++;
                    if (countEl) {
                        countEl.textContent = directMatches > 0 ? `${directMatches} match${directMatches !== 1 ? 'es' : ''}` : '0';
                        countEl.style.color = directMatches > 0 ? '#ffb19a' : '';
                    }
                }
            });

            if (contentArea && !preserveScroll) contentArea.scrollTop = 0;
            updateSearchState(rawLabel, query, matchCount, visibleSectionCount);
        }
        _panelSearchUpdater = _handleSearch;

        // Feature toggles
        doc.addEventListener('change', (e) => {
            if (!isSettingsPanelOpen()) return;
            if (e.target.matches('.ytkit-feature-cb')) {
                const card = e.target.closest('[data-feature-id]');
                if (!card) return;
                const featureId = card.dataset.featureId;
                const isEnabled = e.target.checked;

                // Update switch visual
                const switchEl = e.target.closest('.ytkit-switch');
                if (switchEl) switchEl.classList.toggle('active', isEnabled);

                // Update card enabled accent stripe
                const cardEl = e.target.closest('.ytkit-feature-card');
                if (cardEl && !cardEl.classList.contains('ytkit-sub-card')) {
                    cardEl.classList.toggle('ytkit-card-enabled', isEnabled);
                }

                const feature = getFeatureById(featureId);

                // Array-toggle sub-features: modify parent array instead of boolean
                if (feature?._arrayKey) {
                    let arr = appState.settings[feature._arrayKey] || [];
                    if (!Array.isArray(arr)) arr = [];
                    if (isEnabled && !arr.includes(feature._arrayValue)) {
                        arr.push(feature._arrayValue);
                    } else if (!isEnabled) {
                        arr = arr.filter(v => v !== feature._arrayValue);
                    }
                    appState.settings[feature._arrayKey] = arr;
                    settingsManager.save(appState.settings);
                    // Re-init parent feature to apply changes
                    const parentFeature = getFeatureById(feature.parentId);
                    if (parentFeature) {
                        try { destroyFeatureLifecycle(parentFeature, 'array-toggle'); } catch(err) {
                            DebugManager.log('Toggle', `Array parent destroy failed for "${parentFeature.id}": ${err.message}`);
                        }
                        if (appState.settings[parentFeature.id] !== false) {
                            try { initFeatureLifecycle(parentFeature, 'array-toggle'); } catch(err) {
                                DebugManager.log('Toggle', `Array parent init failed for "${parentFeature.id}": ${err.message}`);
                            }
                        }
                    }
                } else {
                    appState.settings[featureId] = isEnabled;
                    settingsManager.save(appState.settings);

                    // Conflict enforcement — auto-disable conflicting features
                    if (isEnabled && CONFLICT_MAP[featureId]) {
                        const conflicts = CONFLICT_MAP[featureId].conflicts || [];
                        const activeConflicts = conflicts.filter(cid => appState.settings[cid]);
                        if (activeConflicts.length > 0) {
                            activeConflicts.forEach(cid => {
                                const cf = getFeatureById(cid);
                                appState.settings[cid] = false;
                                settingsManager.save(appState.settings);
                                if (cf?._initialized) {
                                    try { destroyFeatureLifecycle(cf, 'conflict'); } catch(err) {
                                        DebugManager.log('Conflict', `Destroy failed for "${cid}": ${err.message}`);
                                    }
                                }
                                // Update toggle UI in settings panel
                                const toggle = document.querySelector(`[data-feature-id="${cid}"] input[type="checkbox"]`);
                                if (toggle) {
                                    toggle.checked = false;
                                    const switchEl = toggle.closest('.ytkit-switch');
                                    if (switchEl) switchEl.classList.remove('active');
                                }
                            });
                            const conflictNames = activeConflicts.map(cid => {
                                const cf = getFeatureById(cid);
                                return getFeatureName(cf) || cid;
                            }).join(', ');
                            showToast('Auto-disabled ' + conflictNames + ' — ' + (CONFLICT_MAP[featureId].reason || 'conflicts with ' + (getFeatureName(feature) || featureId)), '#f59e0b', { duration: 5 });
                        }
                    }

                    if (feature) {
                        if (isEnabled) {
                            // Reset crash counter on manual toggle-on
                            delete getFeatureCrashCounts()[featureId]; persistCrashCounts();
                            try { initFeatureLifecycle(feature, 'toggle'); } catch(err) {
                                console.error(`[YTKit] Error initializing "${featureId}":`, err);
                                DebugManager.log('Toggle', `Init failed for "${featureId}": ${err.message}`);
                            }
                        } else {
                            try { destroyFeatureLifecycle(feature, 'toggle'); } catch(err) {
                                console.error(`[YTKit] Error destroying "${featureId}":`, err);
                                DebugManager.log('Toggle', `Destroy failed for "${featureId}": ${err.message}`);
                            }
                        }
                    }

                    // If this is a sub-feature, reinit the parent to pick up the change
                    if (feature?.isSubFeature && feature.parentId) {
                        const parentFeature = getFeatureById(feature.parentId);
                        if (parentFeature && appState.settings[parentFeature.id] !== false) {
                            try { destroyFeatureLifecycle(parentFeature, 'sub-feature-toggle'); } catch(err) {
                                DebugManager.log('Toggle', `Parent destroy failed for "${parentFeature.id}": ${err.message}`);
                            }
                            try { initFeatureLifecycle(parentFeature, 'sub-feature-toggle'); } catch(err) {
                                DebugManager.log('Toggle', `Parent init failed for "${parentFeature.id}": ${err.message}`);
                            }
                        }
                    }
                }

                // Toggle sub-features visibility (greyed out, not hidden)
                const subContainer = doc.querySelector(`.ytkit-sub-features[data-parent-id="${featureId}"]`);
                if (subContainer) {
                    subContainer.style.opacity = isEnabled ? '' : '0.35';
                    subContainer.style.pointerEvents = isEnabled ? '' : 'none';
                }

                updateAllToggleStates();
                setPanelStatus(`${getFeatureName(feature) || featureId} ${isEnabled ? 'enabled' : 'disabled'}.`, 'success');
            }

            // Toggle all
            if (e.target.matches('.ytkit-toggle-all-cb')) {
                const isEnabled = e.target.checked;
                const catId = e.target.dataset.category;
                const pane = doc.getElementById(`ytkit-pane-${catId}`);

                // Update the switch visual state
                const switchEl = e.target.closest('.ytkit-switch');
                if (switchEl) {
                    switchEl.classList.toggle('active', isEnabled);
                }

                if (pane) {
                    pane.querySelectorAll('.ytkit-feature-card:not(.ytkit-sub-card) .ytkit-feature-cb').forEach(cb => {
                        if (cb.checked !== isEnabled) {
                            cb.checked = isEnabled;
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                    setPanelStatus(`${isEnabled ? 'Enabled' : 'Disabled'} all settings in this section.`, 'success');
                }
            }
        });

        // Textarea input — debounce reinit to avoid destroy/init churn per keystroke
        let _textareaReinitTimer = null;
        let _rangeReinitTimer = null;
        doc.addEventListener('input', (e) => {
            if (!isSettingsPanelOpen()) return;
            if (e.target.matches('.ytkit-input')) {
                const card = e.target.closest('[data-feature-id]');
                if (!card) return;
                const featureId = card.dataset.featureId;
                const feature = getFeatureById(featureId);
                const key = feature?.settingKey || featureId;
                appState.settings[key] = e.target.value;
                settingsManager.save(appState.settings);
                setPanelStatus(`${getFeatureName(feature) || 'Text setting'} saved.`, 'success');
                if (feature) {
                    if (_textareaReinitTimer) clearTimeout(_textareaReinitTimer);
                    _textareaReinitTimer = setTimeout(() => {
                        _textareaReinitTimer = null;
                        try { destroyFeatureLifecycle(feature, 'SettingsPanel'); } catch (e) {
                            DebugManager.log('SettingsPanel', `destroy failed for ${feature.id}: ${e.message}`);
                        }
                        try { initFeatureLifecycle(feature, 'SettingsPanel'); } catch (e) {
                            DebugManager.log('SettingsPanel', `re-init failed for ${feature.id}: ${e.message}`);
                        }
                    }, 600);
                }
            }
            // Select dropdown
            if (e.target.matches('.ytkit-select')) {
                const card = e.target.closest('[data-feature-id]');
                if (!card) return;
                const featureId = card.dataset.featureId;
                const feature = getFeatureById(featureId);

                // Use settingKey if specified, otherwise use featureId
                const settingKey = feature?.settingKey || featureId;
                const newValue = e.target.value;

                appState.settings[settingKey] = newValue;
                settingsManager.save(appState.settings);

                // Reinitialize the feature to apply changes immediately
                if (feature) {
                    if (typeof feature.destroy === 'function') {
                        try { destroyFeatureLifecycle(feature, 'select'); } catch (e) { /* reason: select reinit should continue even if destroy fails */ }
                    }
                    if (typeof feature.init === 'function') {
                        try { initFeatureLifecycle(feature, 'select'); } catch (e) { console.warn('[YTKit] Feature reinit error:', e); }
                    }
                }

                const selectedText = e.target.options[e.target.selectedIndex].text;
                createToast(`${getFeatureName(feature) || 'Setting'} changed to ${selectedText}`, 'success');
                setPanelStatus(`${getFeatureName(feature) || 'Setting'} changed to ${selectedText}.`, 'success');
            }
            // Range slider — debounce reinit to avoid destroy/init churn during drag
            if (e.target.matches('.ytkit-range')) {
                const card = e.target.closest('[data-feature-id]');
                if (!card) return;
                const featureId = card.dataset.featureId;
                const feature = getFeatureById(featureId);
                const settingKey = feature?.settingKey || featureId;
                const val = parseFloat(e.target.value);
                appState.settings[settingKey] = val;
                settingsManager.save(appState.settings);
                setPanelStatus(`${getFeatureName(feature) || 'Range setting'} saved.`, 'success');
                if (feature) {
                    if (_rangeReinitTimer) clearTimeout(_rangeReinitTimer);
                    _rangeReinitTimer = setTimeout(() => {
                        _rangeReinitTimer = null;
                        try { destroyFeatureLifecycle(feature, 'Range'); } catch(err) {
                            DebugManager.log('Range', `Destroy failed for "${featureId}": ${err.message}`);
                        }
                        try { initFeatureLifecycle(feature, 'Range'); } catch(err) {
                            DebugManager.log('Range', `Init failed for "${featureId}": ${err.message}`);
                        }
                    }, 300);
                }
            }
            // Color picker
            if (e.target.matches('[id^="ytkit-color-"]')) {
                const card = e.target.closest('[data-feature-id]');
                if (!card) return;
                const featureId = card.dataset.featureId;
                const feature = getFeatureById(featureId);
                const settingKey = feature?.settingKey || featureId;
                appState.settings[settingKey] = e.target.value;
                settingsManager.save(appState.settings);
                setPanelStatus(`${getFeatureName(feature) || 'Color setting'} updated.`, 'success');
                if (feature) {
                    try { destroyFeatureLifecycle(feature, 'Color'); } catch(err) {
                        DebugManager.log('Color', `Destroy failed for "${featureId}": ${err.message}`);
                    }
                    try { initFeatureLifecycle(feature, 'Color'); } catch(err) {
                        DebugManager.log('Color', `Init failed for "${featureId}": ${err.message}`);
                    }
                }
            }
        });
    }

        return {
            isSettingsPanelOpen,
            setSettingsPanelOpen,
            toggleSettingsPanel,
            countEnabledToggleFeatures,
            buildSettingsPanel,
            buildFeatureCard,
            updateAllToggleStates,
            attachUIEventListeners
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.settingsPanel = Object.freeze({
        createSettingsPanelRuntime
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createSettingsPanelRuntime
        };
    }
})();
