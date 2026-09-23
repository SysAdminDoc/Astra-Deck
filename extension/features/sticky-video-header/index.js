(() => {
    'use strict';

    // extension/features/sticky-video-header/index.js
    //
    // Theater Split header surfaces: the compact title bar with upload date and
    // view count, the live-stream header that sits over live chat, and the
    // action dock that moves the YouTube like and notification controls, and
    // the Astra page and download buttons, into the split and back.
    // features/sticky-video merges these methods onto the feature object, so
    // this is the feature and the header and dock state lives there.

    function createStickyVideoHeaderMethods(deps = {}) {
        const { t, _rw, getVideoId, getFeatureById } = deps;
        return {
            _scheduleSplitActionDock(delay = 80) {
                clearTimeout(this._splitActionDockTimer);
                this._splitActionDockTimer = setTimeout(() => {
                    this._splitActionDockTimer = null;
                    this._dockSplitHeader();
                    this._dockSplitActions();
                }, delay);
            },

            _getSplitTitleEl() {
                const below = this._getBelow();
                return below?.querySelector('ytd-watch-metadata #title, #title.ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata #title, #title.ytd-watch-metadata');
            },

            _createSplitYoutubeIcon() {
                const ns = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(ns, 'svg');
                svg.setAttribute('viewBox', '0 0 28 20');
                svg.setAttribute('aria-hidden', 'true');

                const rect = document.createElementNS(ns, 'rect');
                rect.setAttribute('x', '1.5');
                rect.setAttribute('y', '1.5');
                rect.setAttribute('width', '25');
                rect.setAttribute('height', '17');
                rect.setAttribute('rx', '5');
                rect.setAttribute('fill', 'currentColor');
                svg.appendChild(rect);

                const play = document.createElementNS(ns, 'path');
                play.setAttribute('d', 'M11 6.25 18.5 10 11 13.75Z');
                play.setAttribute('fill', '#fff');
                svg.appendChild(play);

                return svg;
            },

            _ensureSplitHeaderMeta(bar) {
                if (!bar) return null;

                let meta = bar.querySelector(':scope > .ytkit-split-upload-meta');
                let date = bar.querySelector('.ytkit-split-upload-date');
                if (!meta) {
                    meta = document.createElement('span');
                    meta.className = 'ytkit-split-upload-meta';
                    meta.setAttribute('translate', 'no');
                    if (date) {
                        date.removeAttribute('translate');
                        bar.insertBefore(meta, date);
                        meta.appendChild(date);
                    } else {
                        date = document.createElement('span');
                        date.className = 'ytkit-split-upload-date';
                        meta.appendChild(date);
                        bar.appendChild(meta);
                    }
                }

                if (!date) {
                    date = document.createElement('span');
                    date.className = 'ytkit-split-upload-date';
                    meta.insertBefore(date, meta.firstChild);
                }

                let views = meta.querySelector(':scope > .ytkit-split-view-count');
                if (!views) {
                    views = document.createElement('span');
                    views.className = 'ytkit-split-view-count';
                    meta.appendChild(views);
                }

                return meta;
            },

            _ensureSplitHeaderBar() {
                const title = this._getSplitTitleEl();
                if (!title) return null;

                let bar = title.querySelector(':scope > .ytkit-split-title-bar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.className = 'ytkit-split-title-bar';

                    const homeLink = document.createElement('a');
                    homeLink.className = 'ytkit-split-youtube-link';
                    homeLink.href = 'https://www.youtube.com/feed/subscriptions';
                    homeLink.title = t('stickyVideoSubscriptionsLink', 'Go to subscriptions');
                    homeLink.setAttribute('aria-label', t('stickyVideoSubscriptionsLink', 'Go to subscriptions'));
                    homeLink.appendChild(this._createSplitYoutubeIcon());
                    bar.appendChild(homeLink);

                    const actions = document.createElement('div');
                    actions.className = 'ytkit-split-header-actions';
                    actions.setAttribute('aria-label', t('stickyVideoQuickLinksAria', 'Quick links'));
                    bar.appendChild(actions);

                    const meta = document.createElement('span');
                    meta.className = 'ytkit-split-upload-meta';
                    meta.setAttribute('translate', 'no');
                    const date = document.createElement('span');
                    date.className = 'ytkit-split-upload-date';
                    meta.appendChild(date);
                    const views = document.createElement('span');
                    views.className = 'ytkit-split-view-count';
                    meta.appendChild(views);
                    bar.appendChild(meta);

                    title.insertBefore(bar, title.firstChild);
                }

                this._ensureSplitHeaderMeta(bar);
                this._splitHeaderBar = bar;
                return bar;
            },

            _extractSplitFallbackDate(text) {
                const normalized = String(text || '').replace(/\u00A0/g, ' ').trim();
                if (!normalized) return null;

                const segments = normalized.split(/[•|]/).map(part => part.trim()).filter(Boolean);
                const preferred = segments.find(segment => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(segment))
                    || normalized;
                const cleaned = preferred
                    .replace(/^(Premiered|Published on|Published|Uploaded|Streamed live on|Started streaming on|Streamed)\s*/i, '')
                    .trim();
                const parsed = new Date(cleaned);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            },

            _getSplitDateAnchor() {
                const root = this._getBelow() || document;
                const candidates = Array.from(root.querySelectorAll(
                    '#info-strings yt-formatted-string, ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string'
                ));
                return candidates.find(el => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(el.textContent || ''))
                    || candidates[0]
                    || null;
            },

            _getSplitPublishDate(anchorEl) {
                const currentVideoId = getVideoId();

                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const responseVideoId = playerResponse?.videoDetails?.videoId;
                    if (!responseVideoId || !currentVideoId || responseVideoId === currentVideoId) {
                        const microformat = playerResponse?.microformat?.playerMicroformatRenderer;
                        const raw = microformat?.publishDate
                            || microformat?.uploadDate
                            || microformat?.liveBroadcastDetails?.startTimestamp
                            || microformat?.liveBroadcastDetails?.endTimestamp;
                        if (raw) {
                            const parsed = new Date(raw);
                            if (!Number.isNaN(parsed.getTime())) return parsed;
                        }
                    }
                } catch { /* reason: player response date unavailable; fallback to page text */ }

                const meta = document.querySelector('meta[itemprop="datePublished"], meta[itemprop="uploadDate"]');
                const metaValue = meta?.getAttribute('content');
                if (metaValue) {
                    const parsed = new Date(metaValue);
                    if (!Number.isNaN(parsed.getTime())) return parsed;
                }

                return this._extractSplitFallbackDate(anchorEl?.textContent || '');
            },

            _formatSplitUploadDate(date) {
                return new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }).format(date);
            },

            _getSplitUploadDateText() {
                const anchor = this._getSplitDateAnchor();
                const publishDate = this._getSplitPublishDate(anchor);
                if (publishDate) return `Uploaded ${this._formatSplitUploadDate(publishDate)}`;

                const rawText = String(anchor?.textContent || '').replace(/\u00A0/g, ' ').trim();
                if (!rawText) return '';

                const segments = rawText.split(/[•|]/).map(part => part.trim()).filter(Boolean);
                const preferred = segments.find(segment => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(segment))
                    || segments[0]
                    || rawText;

                if (/^Published on\s+/i.test(preferred)) return preferred.replace(/^Published on\s+/i, 'Uploaded ');
                if (/^(Uploaded|Published|Premiered|Streamed)/i.test(preferred)) return preferred;
                return `Uploaded ${preferred}`;
            },

            _formatSplitViewCount(value) {
                const count = Number(value);
                if (!Number.isFinite(count) || count < 0) return '';
                return `${new Intl.NumberFormat().format(Math.floor(count))} views`;
            },

            _getSplitFallbackViewCountText() {
                const root = this._getBelow() || document;
                const candidates = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #metadata-line span'
                ));
                return candidates
                    .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
                    .find(text => /\bviews?\b/i.test(text)) || '';
            },

            _getSplitViewCountText() {
                const currentVideoId = getVideoId();
                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const responseVideoId = playerResponse?.videoDetails?.videoId;
                    if (!responseVideoId || !currentVideoId || responseVideoId === currentVideoId) {
                        const viewText = this._formatSplitViewCount(playerResponse?.videoDetails?.viewCount);
                        if (viewText) return viewText;
                    }
                } catch { /* reason: player response view count unavailable; fallback to DOM text */ }
                return this._getSplitFallbackViewCountText();
            },

            _getSplitVideoTitleText() {
                const root = this._getBelow() || document;
                const el = root.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata #title yt-formatted-string')
                    || document.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata #title yt-formatted-string');
                const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) return text;
                try {
                    const title = _rw.ytInitialPlayerResponse?.videoDetails?.title;
                    if (title) return String(title).replace(/\s+/g, ' ').trim();
                } catch { /* reason: player response title unavailable; fallback to document title */ }
                return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim()
                    || t('stickyVideoLiveVideoFallback', 'Live video');
            },

            _formatSplitLiveTitleText(title) {
                const cleaned = String(title || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .replace(/^[\s\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F7E3}\u{1F7E4}\u{26AB}\u{26AA}\u{25CF}\u{2B24}]+/u, '')
                    .replace(/^(?:LIVE(?:\s+NOW|\s+STREAM)?|WATCHING\s+LIVE)\s*[-:|\u2022]\s*/i, '')
                    .trim();
                return cleaned || String(title || '').replace(/\s+/g, ' ').trim()
                    || t('stickyVideoLiveVideoFallback', 'Live video');
            },

            _getSplitChannelText() {
                const root = this._getBelow() || document;
                const el = root.querySelector('ytd-video-owner-renderer #channel-name #text, ytd-video-owner-renderer #channel-name yt-formatted-string, #owner #channel-name #text, #owner yt-formatted-string.ytd-channel-name')
                    || document.querySelector('ytd-video-owner-renderer #channel-name #text, ytd-video-owner-renderer #channel-name yt-formatted-string, #owner #channel-name #text, #owner yt-formatted-string.ytd-channel-name');
                const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) return text;
                try {
                    return String(_rw.ytInitialPlayerResponse?.videoDetails?.author || '').replace(/\s+/g, ' ').trim();
                } catch { /* reason: player response author unavailable; fallback to DOM text */ }
                return '';
            },

            _formatSplitLiveInfoText(text, viewText = '') {
                let normalized = String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                if (!normalized) return '';
                if (viewText) normalized = normalized.replace(viewText, ' ');
                normalized = normalized
                    .replace(/\b\d[\d,.]*\s*(?:K|M|B)?\s*(?:watching(?:\s+now)?|waiting|views?)\b/i, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const match = normalized.match(/\b(?:Started streaming|Streamed live(?: on)?|Scheduled for|Premiered|Started)\b[^#|\u2022]*/i);
                return (match?.[0] || '')
                    .replace(/\s+Uploaded\b.*$/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            },

            _getSplitLiveInfoText(viewText = '') {
                const root = this._getBelow() || document;
                const parts = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #owner-sub-count, ytd-watch-metadata #metadata-line span, ytd-watch-info-text yt-formatted-string, factoid-renderer yt-formatted-string'
                )).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                for (const text of parts) {
                    const info = this._formatSplitLiveInfoText(text, viewText);
                    if (info) return info;
                }
                return '';
            },

            _formatSplitLiveViewText(text) {
                const normalized = String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const liveMatch = normalized.match(/\b\d[\d,.]*\s*(?:K|M|B)?\s*(?:watching(?:\s+now)?|waiting)\b/i);
                if (liveMatch) return liveMatch[0].replace(/\swatching$/i, ' watching now');
                const viewMatch = normalized.match(/\b\d[\d,.]*\s*(?:K|M|B)?\s*views?\b/i);
                return viewMatch?.[0] || '';
            },

            _getSplitLiveViewCountText() {
                const root = this._getBelow() || document;
                const parts = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #metadata-line span, ytd-watch-info-text yt-formatted-string, factoid-renderer yt-formatted-string'
                )).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                const watchingText = parts.map(text => this._formatSplitLiveViewText(text)).find(Boolean);
                if (watchingText) return watchingText;
                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const liveDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
                    const isLive = playerResponse?.videoDetails?.isLive || playerResponse?.videoDetails?.isLiveContent || !!liveDetails;
                    const viewText = isLive ? this._formatSplitViewCount(playerResponse?.videoDetails?.viewCount).replace(/\s+views$/i, ' watching now') : '';
                    if (viewText) return viewText;
                } catch { /* reason: player response live count unavailable; fallback to visible metadata */ }
                return parts.find(text => /\bviews?\b/i.test(text))
                    || this._getSplitViewCountText();
            },

            _createSplitLiveHeaderNode() {
                const header = document.createElement('section');
                header.className = 'ytkit-split-live-header';
                header.setAttribute('aria-label', t('stickyVideoLiveInfoAria', 'Live video information'));
                header.style.cssText = [
                    'position:fixed',
                    'top:0',
                    'right:0',
                    'height:auto',
                    `min-height:${this._liveHeaderHeight}px`,
                    'z-index:10003',
                    'padding:10px 12px',
                    'box-sizing:border-box',
                    'pointer-events:auto',
                    'color:var(--ytkit-split-text)',
                    'background:var(--ytkit-split-panel)',
                    'border-left:1px solid var(--ytkit-split-border)',
                    'border-bottom:1px solid var(--ytkit-split-border)',
                    'box-shadow:none',
                    'overflow:hidden'
                ].join(';');

                const card = document.createElement('div');
                card.className = 'ytkit-split-live-card';
                card.style.cssText = [
                    'min-height:0',
                    'border-radius: 12px',
                    'border:1px solid var(--ytkit-split-border)',
                    'background:var(--ytkit-split-raised)',
                    'box-shadow:var(--ytkit-split-control-shadow)',
                    'position:relative',
                    'display:grid',
                    'min-width:0',
                    'width:100%',
                    'max-width:100%',
                    'inline-size:100%',
                    'max-inline-size:100%',
                    'grid-template-columns:minmax(0,1fr) minmax(0,min(330px,42%))',
                    'grid-template-areas:"channel actions" "title title" "meta meta"',
                    'align-content:start',
                    'align-items:stretch',
                    'gap:5px',
                    'padding:12px 15px 11px',
                    'box-sizing:border-box',
                    'overflow:hidden'
                ].join(';');

                const channel = document.createElement('div');
                channel.className = 'ytkit-split-live-channel';
                channel.setAttribute('translate', 'no');
                channel.style.cssText = 'grid-area:channel;min-width:0;max-width:100%;font:800 14px/1.25 Arial,sans-serif;color:var(--ytkit-split-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                card.appendChild(channel);

                const meta = document.createElement('div');
                meta.className = 'ytkit-split-live-meta';
                meta.style.cssText = 'grid-area:meta;display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:5px 8px;min-width:0;max-width:100%;overflow:hidden;';

                const liveBadge = document.createElement('span');
                liveBadge.className = 'ytkit-split-live-badge';
                liveBadge.textContent = t('stickyVideoLiveBadge', 'LIVE');
                liveBadge.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;font:800 11px/1.2 Arial,sans-serif;letter-spacing:0;color:#fff;background:#dc2626;border-radius:4px;padding:5px 9px;box-shadow:0 8px 18px rgba(220,38,38,0.22);';
                meta.appendChild(liveBadge);

                const viewCount = document.createElement('span');
                viewCount.className = 'ytkit-split-live-view-count';
                viewCount.setAttribute('translate', 'no');
                viewCount.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;min-width:0;max-width:100%;font:700 12px/1.2 Arial,sans-serif;color:var(--ytkit-split-text);background:var(--ytkit-split-comment-control);border:1px solid var(--ytkit-split-border);border-radius:6px;padding:5px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                meta.appendChild(viewCount);

                const date = document.createElement('span');
                date.className = 'ytkit-split-live-date';
                date.setAttribute('translate', 'no');
                date.style.cssText = 'display:-webkit-box;flex:1 1 240px;min-width:0;max-width:100%;font:650 12px/1.25 Arial,sans-serif;color:var(--ytkit-split-muted);overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:1;-webkit-box-orient:vertical;';
                meta.appendChild(date);
                card.appendChild(meta);

                const title = document.createElement('h2');
                title.className = 'ytkit-split-live-title';
                title.style.cssText = [
                    'grid-area:title',
                    'margin:0',
                    'min-width:0',
                    'width:100%',
                    'max-width:100%',
                    'justify-self:stretch',
                    'box-sizing:border-box',
                    'font:800 16px/1.22 Arial,sans-serif',
                    'letter-spacing:0',
                    'color:var(--ytkit-split-text)',
                    'display:-webkit-box',
                    'max-height:2.44em',
                    '-webkit-line-clamp:2',
                    '-webkit-box-orient:vertical',
                    'overflow:hidden',
                    'text-overflow:ellipsis',
                    'white-space:normal',
                    'overflow-wrap:anywhere',
                    'word-break:break-word'
                ].join(';');
                card.appendChild(title);

                const actions = document.createElement('div');
                actions.className = 'ytkit-split-live-actions';
                actions.setAttribute('aria-label', t('stickyVideoLiveActionsAria', 'Live video actions'));
                actions.style.cssText = 'grid-area:actions;display:flex;align-items:center;align-self:center;justify-content:flex-end;gap:8px;height:42px;min-height:42px;min-width:0;width:100%;max-width:100%;contain:inline-size;overflow:hidden;';
                card.appendChild(actions);

                header.appendChild(card);
                return header;
            },

            _ensureSplitLiveHeader(rightPct) {
                let header = this._splitLiveHeader;
                if (!header || !header.isConnected) {
                    header = this._createSplitLiveHeaderNode();
                    document.body.appendChild(header);
                    this._splitLiveHeader = header;
                }

                const headerWidth = Math.max(0, Math.round(window.innerWidth * rightPct / 100));
                const compact = headerWidth > 0 && headerWidth < 760;
                const narrow = headerWidth > 0 && headerWidth < 420;
                const baseHeaderHeight = narrow ? 190 : (compact ? 164 : this._liveHeaderHeight);
                const maxHeaderHeight = Math.max(baseHeaderHeight, Math.min(260, Math.round(window.innerHeight * 0.42)));
                header.dataset.ytkitLiveCompact = compact ? '1' : '0';
                header.dataset.ytkitLiveNarrow = narrow ? '1' : '0';
                header.style.width = `calc(${rightPct}% - 2px)`;
                header.style.padding = narrow ? '8px 9px' : '10px 12px';
                header.style.minHeight = `${baseHeaderHeight}px`;
                header.style.height = `${baseHeaderHeight}px`;
                const card = header.querySelector('.ytkit-split-live-card');
                const titleEl = header.querySelector('.ytkit-split-live-title');
                const channelEl = header.querySelector('.ytkit-split-live-channel');
                const metaEl = header.querySelector('.ytkit-split-live-meta');
                const viewEl = header.querySelector('.ytkit-split-live-view-count');
                const dateEl = header.querySelector('.ytkit-split-live-date');
                const title = this._formatSplitLiveTitleText(this._getSplitVideoTitleText());
                const channel = this._getSplitChannelText();
                const dateText = this._getSplitUploadDateText();
                const viewText = this._getSplitLiveViewCountText();
                const infoText = this._getSplitLiveInfoText(viewText);
                const supplementalInfo = viewText && infoText === viewText ? '' : infoText;
                const dateInfo = supplementalInfo || dateText;
                const fullDateInfo = [supplementalInfo, dateText].filter(Boolean).join(' | ');
                if (card) {
                    card.style.padding = narrow ? '10px 12px' : '12px 15px 11px';
                    card.style.gridTemplateColumns = narrow
                        ? 'minmax(0,1fr)'
                        : 'minmax(0,1fr) minmax(0,min(330px,42%))';
                    card.style.gridTemplateAreas = narrow
                        ? '"channel" "actions" "title" "meta"'
                        : '"channel actions" "title title" "meta meta"';
                }
                if (channelEl) {
                    channelEl.textContent = channel;
                    channelEl.hidden = !channel;
                    if (channel) channelEl.title = channel;
                    else channelEl.removeAttribute('title');
                }
                if (titleEl) {
                    titleEl.textContent = title;
                    titleEl.hidden = !title;
                    titleEl.style.setProperty('display', '-webkit-box');
                    titleEl.style.setProperty('width', '100%');
                    titleEl.style.setProperty('max-width', '100%');
                    titleEl.style.setProperty('max-inline-size', '100%');
                    titleEl.style.setProperty('overflow', 'hidden');
                    titleEl.style.setProperty('text-overflow', 'ellipsis');
                    titleEl.style.setProperty('white-space', 'normal');
                    titleEl.style.setProperty('overflow-wrap', 'anywhere');
                    titleEl.style.setProperty('word-break', 'normal');
                    titleEl.style.setProperty('-webkit-line-clamp', '2');
                    titleEl.style.setProperty('-webkit-box-orient', 'vertical');
                    titleEl.style.setProperty('max-height', '2.44em');
                    if (title) titleEl.title = title;
                    else titleEl.removeAttribute('title');
                }
                if (metaEl) metaEl.hidden = false;
                if (viewEl) {
                    viewEl.textContent = viewText;
                    viewEl.hidden = !viewText;
                    if (viewText) viewEl.title = viewText;
                    else viewEl.removeAttribute('title');
                }
                if (dateEl) {
                    dateEl.textContent = dateInfo;
                    dateEl.hidden = !dateInfo;
                    dateEl.style.setProperty('-webkit-line-clamp', compact ? '2' : '1');
                    if (fullDateInfo) dateEl.title = fullDateInfo;
                    else dateEl.removeAttribute('title');
                }
                header.setAttribute('aria-label', [t('stickyVideoLiveVideoFallback', 'Live video'), channel, viewText, dateInfo, title].filter(Boolean).join(' | '));
                this._dockSplitLiveHeaderActions();
                const outerVerticalPadding = narrow ? 16 : 20;
                const measuredCardHeight = Math.max(card?.scrollHeight || 0, card?.getBoundingClientRect?.().height || 0);
                const measuredHeaderHeight = Math.ceil((measuredCardHeight || baseHeaderHeight - outerVerticalPadding) + outerVerticalPadding);
                const liveHeaderHeight = Math.min(maxHeaderHeight, Math.max(baseHeaderHeight, measuredHeaderHeight));
                header.style.height = `${liveHeaderHeight}px`;
                return liveHeaderHeight;
            },

            _removeSplitLiveHeader() {
                this._splitLiveHeader?.remove();
                this._splitLiveHeader = null;
            },

            _dockSplitHeader() {
                if (!this._isActive || !this._isSplit) return;

                const bar = this._ensureSplitHeaderBar();
                if (!bar) return;

                const metaEl = bar.querySelector('.ytkit-split-upload-meta');
                const dateEl = bar.querySelector('.ytkit-split-upload-date');
                const viewEl = bar.querySelector('.ytkit-split-view-count');
                const dateText = this._getSplitUploadDateText();
                const viewText = this._getSplitViewCountText();
                if (dateEl) {
                    dateEl.textContent = dateText;
                    dateEl.hidden = !dateText;
                }
                if (viewEl) {
                    viewEl.textContent = viewText;
                    viewEl.hidden = !viewText;
                }
                if (metaEl) {
                    const metaLabel = [dateText, viewText].filter(Boolean).join(' | ');
                    metaEl.hidden = !metaLabel;
                    if (metaLabel) {
                        metaEl.title = metaLabel;
                        metaEl.setAttribute('aria-label', metaLabel);
                    } else {
                        metaEl.removeAttribute('title');
                        metaEl.removeAttribute('aria-label');
                    }
                }

                const actions = bar.querySelector('.ytkit-split-header-actions');
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                if (actions && logoWrap && logoWrap.parentElement !== actions) {
                    if (!this._splitHeaderMovedLogo) {
                        this._splitHeaderMovedLogo = {
                            parent: logoWrap.parentNode,
                            next: logoWrap.nextSibling
                        };
                    }
                    logoWrap.dataset.ytkitSplitHeaderDocked = '1';
                    actions.appendChild(logoWrap);
                    getFeatureById('quickLinkMenu')?._syncLauncherChrome?.(logoWrap);
                }
                if (actions) actions.hidden = !logoWrap;
            },

            _restoreSplitHeader() {
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                const moved = this._splitHeaderMovedLogo;
                if (logoWrap) delete logoWrap.dataset.ytkitSplitHeaderDocked;
                if (logoWrap && moved) {
                    const fallbackParent = document.getElementById('ytkit-player-controls');
                    const parent = moved.parent?.isConnected ? moved.parent : fallbackParent;
                    if (parent) {
                        if (moved.next?.parentNode === parent) parent.insertBefore(logoWrap, moved.next);
                        else parent.appendChild(logoWrap);
                    }
                }
                this._splitHeaderMovedLogo = null;

                document.querySelectorAll('.ytkit-split-title-bar').forEach(bar => bar.remove());
                this._splitHeaderBar = null;
            },

            _getSplitOwner() {
                const below = this._getBelow();
                return below?.querySelector('ytd-watch-metadata #owner, #owner.ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata #owner, #owner.ytd-watch-metadata');
            },

            _ensureSplitActionDock() {
                const owner = this._getSplitOwner();
                if (!owner) return null;

                let dock = owner.querySelector(':scope > .ytkit-split-owner-actions');
                if (!dock) {
                    dock = document.createElement('div');
                    dock.className = 'ytkit-split-owner-actions';
                    dock.setAttribute('aria-label', t('stickyVideoVideoActionsAria', 'Video actions'));
                    const subscribe = owner.querySelector('#subscribe-button');
                    if (subscribe?.nextSibling) owner.insertBefore(dock, subscribe.nextSibling);
                    else owner.appendChild(dock);
                }

                this._splitActionDock = dock;
                return dock;
            },

            _findSplitLikeControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #actions segmented-like-dislike-button-view-model',
                    'ytd-watch-metadata #actions ytd-segmented-like-dislike-button-renderer',
                    'ytd-watch-metadata #actions like-button-view-model',
                    'ytd-watch-metadata #actions #segmented-like-button'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-owner-actions')) return el;
                }
                return null;
            },

            _findSplitSubscribeControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #owner #subscribe-button',
                    'ytd-watch-metadata #owner yt-subscribe-button-view-model',
                    'ytd-watch-metadata #owner ytd-subscribe-button-renderer'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-live-actions')) return el;
                }
                return null;
            },

            _findSplitNotificationControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #owner #notification-preference-button',
                    'ytd-watch-metadata #owner ytd-subscription-notification-toggle-button-renderer-next'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-owner-actions') && !el.closest('.ytkit-split-live-actions')) return el;
                }
                return null;
            },

            _findSplitPageControl() {
                const owner = this._getSplitOwner();
                if (!owner) return null;
                return owner.querySelector(':scope > #ytkit-page-btn-watch, :scope > #ytkit-watch-btn');
            },

            _findSplitDownloadControl() {
                const root = this._getBelow() || document;
                const controls = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #actions .ytkit-local-dl-btn, ytd-watch-metadata #top-level-buttons-computed .ytkit-local-dl-btn'
                ));
                return controls.find(el => !el.closest('.ytkit-split-owner-actions')) || null;
            },

            _dockSplitControl(control, dock) {
                if (!control || !dock) return false;
                if (control.parentElement === dock) {
                    control.dataset.ytkitSplitDocked = '1';
                    return false;
                }

                if (!this._splitActionDockMoved) this._splitActionDockMoved = new Map();
                if (!this._splitActionDockMoved.has(control)) {
                    this._splitActionDockMoved.set(control, {
                        parent: control.parentNode,
                        next: control.nextSibling
                    });
                }

                control.dataset.ytkitSplitDocked = '1';
                dock.appendChild(control);
                return true;
            },

            _polishSplitLiveHeaderAction(control) {
                if (!control) return;
                control.style.setProperty('display', 'inline-flex', 'important');
                control.style.setProperty('align-items', 'center', 'important');
                control.style.setProperty('margin', '0', 'important');
                control.style.setProperty('overflow', 'visible', 'important');
                control.querySelectorAll('dislike-button-view-model, #segmented-dislike-button, .ytDislikeButtonViewModelHost').forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                });
                control.querySelectorAll('button, .yt-spec-button-shape-next, .ytSpecButtonShapeNextHost').forEach(button => {
                    button.style.setProperty('height', '32px', 'important');
                    button.style.setProperty('min-height', '32px', 'important');
                    button.style.setProperty('border-radius', '10px', 'important');
                    button.style.setProperty('white-space', 'nowrap', 'important');
                });
            },

            _restoreSplitLiveHeaderActionPin(control, state) {
                if (!control) return;
                delete control.dataset.ytkitSplitLivePinned;
                if (state?.style == null) control.removeAttribute('style');
                else control.setAttribute('style', state.style);
            },

            _restoreSplitLiveHeaderActionPins() {
                const pinned = this._splitLiveActionPinned;
                if (pinned) {
                    pinned.forEach((state, control) => this._restoreSplitLiveHeaderActionPin(control, state));
                    pinned.clear();
                }
                this._splitLiveActionPinned = null;

                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                if (actions) {
                    actions.hidden = true;
                    actions.style.removeProperty('width');
                    actions.style.removeProperty('min-width');
                }
            },

            _setSplitLiveHeaderActionPinsHidden(hidden) {
                this._splitLiveActionPinned?.forEach((_, control) => {
                    if (!control?.isConnected) return;
                    control.style.setProperty('visibility', hidden ? 'hidden' : 'visible', 'important');
                });
            },

            _layoutSplitLiveHeaderActions() {
                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                const pinned = this._splitLiveActionPinned;
                if (!actions || !pinned?.size) return;

                const controls = Array.from(pinned.keys()).filter(control => control?.isConnected);
                if (!controls.length) {
                    this._restoreSplitLiveHeaderActionPins();
                    return;
                }

                const gap = 8;
                const naturalMetrics = controls.map(control => {
                    const rect = control.getBoundingClientRect();
                    const naturalWidth = Math.max(32, Math.ceil(rect.width || control.offsetWidth || 96));
                    return {
                        control,
                        naturalWidth: Math.min(180, naturalWidth),
                        height: Math.max(32, Math.ceil(rect.height || control.offsetHeight || 32))
                    };
                });
                actions.hidden = false;
                actions.style.width = '100%';
                actions.style.minWidth = '0';
                actions.style.maxWidth = '100%';

                const box = actions.getBoundingClientRect();
                const availableWidth = Math.max(32, box.width || actions.clientWidth || 32);
                const gapWidth = gap * Math.max(0, naturalMetrics.length - 1);
                const controlWidth = Math.max(32, Math.floor((availableWidth - gapWidth) / naturalMetrics.length));
                const metrics = naturalMetrics.map(item => ({
                    ...item,
                    width: Math.min(item.naturalWidth, controlWidth)
                }));
                const totalWidth = metrics.reduce((sum, item) => sum + item.width, 0) + gapWidth;
                const topBase = box.top + Math.max(0, (box.height - 32) / 2);
                const clampedWidth = Math.min(totalWidth, Math.max(32, box.width || actions.clientWidth || totalWidth));
                let left = Math.max(box.left, box.right - clampedWidth);

                metrics.forEach(({ control, width, height }) => {
                    const top = topBase + Math.max(0, (32 - height) / 2);
                    control.dataset.ytkitSplitLivePinned = '1';
                    control.style.setProperty('position', 'fixed', 'important');
                    control.style.setProperty('left', `${Math.round(left)}px`, 'important');
                    control.style.setProperty('top', `${Math.round(top)}px`, 'important');
                    control.style.setProperty('z-index', '10006', 'important');
                    control.style.setProperty('pointer-events', 'auto', 'important');
                    control.style.setProperty('visibility', this._fullscreenHidden ? 'hidden' : 'visible', 'important');
                    control.style.setProperty('transform', 'none', 'important');
                    control.style.setProperty('width', `${width}px`, 'important');
                    control.style.setProperty('min-width', '0', 'important');
                    control.style.setProperty('max-width', `${width}px`, 'important');
                    control.style.setProperty('overflow', 'hidden', 'important');
                    left += width + gap;
                });
            },

            _pinSplitLiveHeaderActions(controls, actions) {
                if (!this._splitLiveActionPinned) this._splitLiveActionPinned = new Map();
                const current = new Set(controls);

                this._splitLiveActionPinned.forEach((state, control) => {
                    if (current.has(control) && control.isConnected) return;
                    this._restoreSplitLiveHeaderActionPin(control, state);
                    this._splitLiveActionPinned.delete(control);
                });

                controls.forEach(control => {
                    if (!this._splitLiveActionPinned.has(control)) {
                        this._splitLiveActionPinned.set(control, {
                            style: control.getAttribute('style')
                        });
                    }
                    this._polishSplitLiveHeaderAction(control);
                });

                actions.hidden = controls.length === 0;
                if (!controls.length) {
                    actions.style.removeProperty('width');
                    actions.style.removeProperty('min-width');
                    return false;
                }

                this._layoutSplitLiveHeaderActions();
                return true;
            },

            _dockSplitLiveHeaderActions() {
                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                if (!actions) return false;

                const controls = [
                    this._findSplitLikeControl(),
                    this._findSplitSubscribeControl()
                ].filter(Boolean);

                return this._pinSplitLiveHeaderActions(controls, actions);
            },

            _dockSplitActions() {
                if (!this._isActive || !this._isSplit) return;
                if (this._videoType === 'live') {
                    this._dockSplitLiveHeaderActions();
                    return;
                }
                this._restoreSplitLiveHeaderActionPins();
                this._dockSplitHeader();

                const dock = this._ensureSplitActionDock();
                if (!dock) return;

                this._dockSplitControl(this._findSplitNotificationControl(), dock);
                this._dockSplitControl(this._findSplitPageControl(), dock);
                this._dockSplitControl(this._findSplitLikeControl(), dock);
                this._dockSplitControl(this._findSplitDownloadControl(), dock);

                const hasControls = dock.children.length > 0;
                dock.hidden = !hasControls;
                const topRow = dock.closest('#top-row');
                if (topRow) {
                    if (hasControls) topRow.dataset.ytkitSplitActionsDocked = '1';
                    else delete topRow.dataset.ytkitSplitActionsDocked;
                }
            },

            _startSplitActionDock() {
                if (!this._isActive || !this._isSplit) return;

                if (this._videoType === 'live') this._dockSplitLiveHeaderActions();
                else {
                    this._dockSplitHeader();
                    this._dockSplitActions();
                }
                if (this._splitActionDockObserver) return;

                const metadata = this._getBelow()?.querySelector('ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata');
                if (!metadata) return;

                this._splitActionDockObserver = new MutationObserver(() => {
                    this._scheduleSplitActionDock(80);
                });
                this._splitActionDockObserver.observe(metadata, { childList: true, subtree: true });
            },

            _restoreSplitActionDock() {
                clearTimeout(this._splitActionDockTimer);
                this._splitActionDockTimer = null;
                this._splitActionDockObserver?.disconnect();
                this._splitActionDockObserver = null;
                this._restoreSplitHeader();

                const moved = this._splitActionDockMoved;
                if (moved) {
                    moved.forEach(({ parent, next }, control) => {
                        delete control.dataset.ytkitSplitDocked;
                        if (!control.isConnected || !parent?.isConnected) return;
                        if (next?.parentNode === parent) parent.insertBefore(control, next);
                        else parent.appendChild(control);
                    });
                    moved.clear();
                }
                this._splitActionDockMoved = null;
                this._restoreSplitLiveHeaderActionPins();
                this._removeSplitLiveHeader();

                document.querySelectorAll('.ytkit-split-owner-actions').forEach(dock => dock.remove());
                document.querySelectorAll('[data-ytkit-split-actions-docked]').forEach(row => {
                    delete row.dataset.ytkitSplitActionsDocked;
                });
                this._splitActionDock = null;
            },
        };
    }

    const api = Object.freeze({ createStickyVideoHeaderMethods });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideoHeader = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
