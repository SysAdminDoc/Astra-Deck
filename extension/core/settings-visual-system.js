(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const STYLE_ID = 'ytkit-settings-visual-v3';

    const SETTINGS_VISUAL_SYSTEM_CSS = `
        /* Astra Deck settings visual system v3 — imagegen mockup parity. */
        #ytkit-settings-panel {
            --ytkit-v3-bg: #0b1016;
            --ytkit-v3-surface: #101720;
            --ytkit-v3-surface-raised: #151e28;
            --ytkit-v3-hover: rgba(255,255,255,0.035);
            --ytkit-v3-border: rgba(220,230,242,0.10);
            --ytkit-v3-border-strong: rgba(220,230,242,0.16);
            --ytkit-v3-text: #f3f5f7;
            --ytkit-v3-muted: #aab3bf;
            --ytkit-v3-subtle: #7f8996;
            --ytkit-v3-accent: #ff5a4f;
            --ytkit-v3-accent-rgb: 255,90,79;
            --ytkit-v3-success: #45d978;
            width: min(1440px, calc(100vw - 48px)) !important;
            height: min(94vh, 920px) !important;
            max-height: min(94vh, 920px) !important;
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 18px !important;
            background: var(--ytkit-v3-bg) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: 0 28px 80px rgba(0,0,0,0.52) !important;
            color-scheme: dark !important;
            font-family: Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif !important;
            font-size: 15px !important;
            line-height: 1.45 !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel .ytkit-header {
            display: grid !important;
            grid-template-columns: 260px minmax(320px, 1fr) auto !important;
            grid-template-areas: "brand search actions" !important;
            align-items: center !important;
            gap: 24px !important;
            min-height: 76px !important;
            padding: 0 24px !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-brand {
            grid-area: brand !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            min-width: 0 !important;
            padding: 0 !important;
        }

        #ytkit-settings-panel .ytkit-brand-mark {
            display: grid !important;
            place-items: center !important;
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-brand-image {
            width: 32px !important;
            height: 32px !important;
            object-fit: contain !important;
        }

        #ytkit-settings-panel .ytkit-brand-copy {
            display: flex !important;
            flex-direction: row !important;
            align-items: baseline !important;
            gap: 12px !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-brand-lockup {
            display: inline-flex !important;
            flex: 0 1 auto !important;
            flex-direction: row !important;
            align-items: baseline !important;
            gap: 12px !important;
            min-width: 0 !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-eyebrow {
            color: var(--ytkit-v3-text) !important;
            font-size: 18px !important;
            font-weight: 720 !important;
            line-height: 1 !important;
            letter-spacing: -0.015em !important;
            text-transform: none !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-title {
            margin: 0 !important;
            color: var(--ytkit-v3-accent) !important;
            font-size: 14px !important;
            font-weight: 760 !important;
            line-height: 1 !important;
            letter-spacing: 0.08em !important;
            text-transform: uppercase !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-brand-intro,
        #ytkit-settings-panel .ytkit-brand-badges {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-command-search {
            grid-area: search !important;
            position: relative !important;
            width: 100% !important;
            height: 44px !important;
            min-height: 44px !important;
            margin: 0 !important;
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 10px !important;
            background: var(--ytkit-v3-surface) !important;
            box-shadow: none !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel .ytkit-command-search:focus-within {
            border-color: rgba(var(--ytkit-v3-accent-rgb),0.72) !important;
            box-shadow: 0 0 0 3px rgba(var(--ytkit-v3-accent-rgb),0.12) !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-input {
            height: 100% !important;
            min-height: 0 !important;
            padding: 0 50px 0 44px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 15px !important;
            font-weight: 480 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-input::placeholder {
            color: var(--ytkit-v3-subtle) !important;
            opacity: 1 !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-icon {
            left: 15px !important;
            width: 18px !important;
            height: 18px !important;
            color: var(--ytkit-v3-muted) !important;
        }

        #ytkit-settings-panel .ytkit-search-meta {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-search-clear {
            width: 36px !important;
            min-width: 36px !important;
            height: 36px !important;
            min-height: 36px !important;
            border: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
        }

        #ytkit-settings-panel .ytkit-header-actions {
            grid-area: actions !important;
            display: flex !important;
            align-items: center !important;
            gap: 14px !important;
        }

        #ytkit-settings-panel .ytkit-header-live {
            min-height: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            font-weight: 520 !important;
            box-shadow: none !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-header-live-dot {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-close {
            width: 44px !important;
            min-width: 44px !important;
            height: 44px !important;
            min-height: 44px !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 10px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-close:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-body {
            display: grid !important;
            grid-template-columns: 240px minmax(520px, 1fr) 220px !important;
            min-height: 0 !important;
            background: var(--ytkit-v3-bg) !important;
        }

        #ytkit-settings-panel .ytkit-sidebar {
            display: flex !important;
            flex-direction: column !important;
            width: auto !important;
            min-width: 0 !important;
            height: auto !important;
            padding: 22px 12px 14px !important;
            gap: 0 !important;
            border: 0 !important;
            border-right: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: none !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel .ytkit-sidebar-top,
        #ytkit-settings-panel .ytkit-nav-group-label,
        #ytkit-settings-panel .ytkit-nav-meta,
        #ytkit-settings-panel .ytkit-nav-state,
        #ytkit-settings-panel .ytkit-nav-arrow {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-list {
            display: flex !important;
            flex: 1 1 auto !important;
            flex-direction: column !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            gap: 2px !important;
            overflow: auto !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn {
            position: relative !important;
            display: grid !important;
            grid-template-columns: 28px minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 10px !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 50px !important;
            margin: 0 !important;
            padding: 0 12px !important;
            border: 0 !important;
            border-radius: 10px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            box-shadow: none !important;
            text-align: left !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn::before {
            content: "" !important;
            position: absolute !important;
            top: 10px !important;
            bottom: 10px !important;
            left: 0 !important;
            width: 2px !important;
            border-radius: 2px !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active {
            border: 0 !important;
            background: rgba(var(--ytkit-v3-accent-rgb),0.09) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active::before {
            background: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-nav-icon {
            display: grid !important;
            place-items: center !important;
            width: 24px !important;
            height: 24px !important;
            min-width: 24px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: currentColor !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-icon svg {
            width: 18px !important;
            height: 18px !important;
        }

        #ytkit-settings-panel .ytkit-nav-copy {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-nav-label {
            display: block !important;
            overflow: hidden !important;
            color: inherit !important;
            font-size: 14px !important;
            font-weight: 610 !important;
            line-height: 1.25 !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-nav-count {
            display: none !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-subtle) !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active .ytkit-nav-count {
            display: inline !important;
        }

        #ytkit-settings-panel .ytkit-sidebar-footer {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            min-height: 44px !important;
            margin: 12px 4px 0 !important;
            padding: 8px 6px 0 !important;
            border: 0 !important;
            border-top: 1px solid var(--ytkit-v3-border) !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-github {
            width: 36px !important;
            min-width: 36px !important;
            height: 36px !important;
            min-height: 36px !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--ytkit-v3-subtle) !important;
        }

        #ytkit-settings-panel .ytkit-version {
            margin-left: auto !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-subtle) !important;
            font-size: 11px !important;
        }

        #ytkit-settings-panel .ytkit-content {
            min-width: 0 !important;
            padding: 28px 40px 48px !important;
            background: var(--ytkit-v3-bg) !important;
            scrollbar-gutter: stable !important;
        }

        #ytkit-settings-panel .ytkit-pane-header {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: space-between !important;
            gap: 24px !important;
            min-height: 0 !important;
            margin: 0 0 22px !important;
            padding: 0 0 22px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-pane-title {
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-pane-eyebrow,
        #ytkit-settings-panel .ytkit-pane-meta {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-pane-title h2 {
            margin: 0 !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 28px !important;
            font-weight: 720 !important;
            line-height: 1.15 !important;
            letter-spacing: -0.025em !important;
        }

        #ytkit-settings-panel .ytkit-pane-description {
            display: block !important;
            max-width: 680px !important;
            margin: 8px 0 0 !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14.5px !important;
            font-weight: 440 !important;
            line-height: 1.5 !important;
        }

        #ytkit-settings-panel .ytkit-pane-actions {
            display: flex !important;
            align-items: center !important;
            gap: 14px !important;
            flex: 0 0 auto !important;
        }

        #ytkit-settings-panel .ytkit-reset-group-btn {
            min-height: 40px !important;
            padding: 0 10px !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            font-weight: 620 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-reset-group-btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-toggle-all {
            min-height: 40px !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-toggle-all > span {
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            font-weight: 620 !important;
            letter-spacing: 0 !important;
        }

        #ytkit-settings-panel .ytkit-features-grid {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-feature-card {
            position: relative !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(190px, 310px) !important;
            align-items: center !important;
            gap: 28px !important;
            width: 100% !important;
            min-height: 80px !important;
            margin: 0 !important;
            padding: 16px 4px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            color: var(--ytkit-v3-text) !important;
            overflow: visible !important;
        }

        #ytkit-settings-panel .ytkit-feature-card:first-child {
            border-top: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-card.ytkit-card-enabled {
            border-color: var(--ytkit-v3-border) !important;
            background: transparent !important;
            box-shadow: none !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-card:hover,
        #ytkit-settings-panel .ytkit-feature-card:focus-within {
            border-color: var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-hover) !important;
            box-shadow: 12px 0 0 var(--ytkit-v3-hover), -12px 0 0 var(--ytkit-v3-hover) !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-card::before,
        #ytkit-settings-panel .ytkit-feature-card::after,
        #ytkit-settings-panel .ytkit-feature-card.ytkit-has-preview::after {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-info-card {
            grid-column: 1 / -1 !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner,
        #ytkit-settings-panel .ytkit-mediadl-banner[data-state] {
            margin: 0 0 10px !important;
            padding: 4px 4px 18px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__top {
            gap: 18px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__main {
            gap: 12px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__title {
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            font-weight: 650 !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__status {
            color: var(--ytkit-v3-muted) !important;
            font-size: 12.5px !important;
            line-height: 1.45 !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__actions {
            gap: 4px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn {
            min-height: 40px !important;
            padding: 0 10px !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 12.5px !important;
            font-weight: 620 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn--accent,
        #ytkit-settings-panel .ytkit-mediadl-banner__btn.is-success {
            background: var(--ytkit-v3-accent) !important;
            color: #fff !important;
        }

        #ytkit-settings-panel .ytkit-feature-main {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-glyph,
        #ytkit-settings-panel .ytkit-feature-meta,
        #ytkit-settings-panel .ytkit-feature-badge {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-info {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-name {
            margin: 0 !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 16px !important;
            font-weight: 650 !important;
            line-height: 1.3 !important;
            letter-spacing: -0.008em !important;
        }

        #ytkit-settings-panel .ytkit-feature-desc {
            display: -webkit-box !important;
            max-width: 640px !important;
            margin: 5px 0 0 !important;
            overflow: hidden !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13.5px !important;
            font-weight: 430 !important;
            line-height: 1.45 !important;
            -webkit-box-orient: vertical !important;
            -webkit-line-clamp: 2 !important;
        }

        #ytkit-settings-panel .ytkit-select-shell,
        #ytkit-settings-panel .ytkit-field-shell,
        #ytkit-settings-panel .ytkit-range-shell,
        #ytkit-settings-panel .ytkit-color-shell,
        #ytkit-settings-panel .ytkit-feature-custom {
            justify-self: stretch !important;
            width: 100% !important;
            max-width: 310px !important;
            margin: 0 !important;
        }

        #ytkit-settings-panel .ytkit-select {
            width: 100% !important;
            min-height: 46px !important;
            padding: 0 42px 0 14px !important;
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 9px !important;
            background: var(--ytkit-v3-surface) !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            font-weight: 560 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-select:hover {
            border-color: rgba(var(--ytkit-v3-accent-rgb),0.42) !important;
            background: var(--ytkit-v3-surface-raised) !important;
        }

        #ytkit-settings-panel .ytkit-switch {
            position: relative !important;
            justify-self: end !important;
            width: 46px !important;
            min-width: 46px !important;
            height: 26px !important;
            min-height: 26px !important;
            border: 0 !important;
            border-radius: 999px !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-switch .ytkit-switch-track {
            position: absolute !important;
            inset: 0 !important;
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 999px !important;
            background: var(--ytkit-v3-surface-raised) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-switch .ytkit-switch-thumb {
            top: 3px !important;
            left: 3px !important;
            width: 20px !important;
            height: 20px !important;
            border: 0 !important;
            border-radius: 50% !important;
            background: #e8edf2 !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.32) !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-switch.active .ytkit-switch-track {
            border-color: transparent !important;
            background: var(--ytkit-v3-accent) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-switch.active .ytkit-switch-thumb {
            left: 23px !important;
            background: #fff !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-switch-icon {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-textarea-card,
        #ytkit-settings-panel .ytkit-range-card,
        #ytkit-settings-panel .ytkit-color-card,
        #ytkit-settings-panel .ytkit-feature-card:has(.ytkit-feature-custom) {
            grid-template-columns: minmax(0, 1fr) minmax(220px, 360px) !important;
            min-height: 92px !important;
        }

        #ytkit-settings-panel .ytkit-input,
        #ytkit-settings-panel .ytkit-vh-number {
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 9px !important;
            background: var(--ytkit-v3-surface) !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-sub-features {
            display: block !important;
            margin: 0 0 8px 18px !important;
            padding: 0 0 0 18px !important;
            border: 0 !important;
            border-left: 1px solid rgba(var(--ytkit-v3-accent-rgb),0.28) !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-sub-card {
            min-height: 66px !important;
            padding-block: 12px !important;
        }

        #ytkit-settings-panel .ytkit-sub-card .ytkit-feature-name {
            font-size: 14.5px !important;
        }

        #ytkit-settings-panel .ytkit-sub-card .ytkit-feature-desc {
            font-size: 12.75px !important;
        }

        #ytkit-settings-panel .ytkit-insights {
            display: block !important;
            min-width: 0 !important;
            padding: 30px 22px !important;
            border: 0 !important;
            border-left: 1px solid var(--ytkit-v3-border) !important;
            background: rgba(255,255,255,0.012) !important;
            overflow: auto !important;
        }

        #ytkit-settings-panel .ytkit-insight-section {
            margin: 0 0 26px !important;
            padding: 0 !important;
            border: 0 !important;
        }

        #ytkit-settings-panel .ytkit-insight-section:nth-child(3) {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-insight-heading {
            margin: 0 0 14px !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 15px !important;
            font-weight: 680 !important;
            line-height: 1.3 !important;
            letter-spacing: 0 !important;
            text-transform: none !important;
        }

        #ytkit-settings-panel .ytkit-insight-card,
        #ytkit-settings-panel .ytkit-status-card,
        #ytkit-settings-panel .ytkit-backup-card {
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-status-hero {
            display: block !important;
            margin: 0 0 10px !important;
            padding: 0 0 14px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-status-hero-icon,
        #ytkit-settings-panel .ytkit-status-hero-copy span {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-status-hero-copy strong {
            color: var(--ytkit-v3-success) !important;
            font-size: 14px !important;
            font-weight: 680 !important;
        }

        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row:nth-child(2),
        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row:nth-child(4),
        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row:nth-child(6) {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            gap: 10px !important;
            min-height: 34px !important;
            padding: 7px 0 !important;
            border: 0 !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-status-dot {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-status-label,
        #ytkit-settings-panel .ytkit-status-value {
            color: var(--ytkit-v3-muted) !important;
            font-size: 12.5px !important;
            font-weight: 500 !important;
        }

        #ytkit-settings-panel .ytkit-status-value {
            color: var(--ytkit-v3-text) !important;
            font-weight: 620 !important;
            text-align: right !important;
        }

        #ytkit-settings-panel .ytkit-backup-card .ytkit-status-row {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-rail-action {
            width: auto !important;
            min-height: 40px !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            box-shadow: none !important;
            justify-content: flex-start !important;
        }

        #ytkit-settings-panel .ytkit-rail-action:hover {
            color: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-footer {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 24px !important;
            min-height: 72px !important;
            padding: 0 24px !important;
            border: 0 !important;
            border-top: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-panel-status {
            display: block !important;
            min-height: 0 !important;
            padding: 0 !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            line-height: 1.4 !important;
        }

        #ytkit-settings-panel .ytkit-panel-status::before,
        #ytkit-settings-panel .ytkit-panel-status::after {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-right,
        #ytkit-settings-panel .ytkit-footer-actions {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: auto !important;
        }

        #ytkit-settings-panel #ytkit-reset-active-section {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn {
            min-width: 0 !important;
            min-height: 44px !important;
            padding: 0 16px !important;
            border: 0 !important;
            border-radius: 9px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            font-weight: 620 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn svg {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
            min-width: 120px !important;
            padding-inline: 24px !important;
            background: var(--ytkit-v3-accent) !important;
            color: #fff !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary:hover {
            background: #ff6b61 !important;
            color: #fff !important;
        }

        html:not([dark]) #ytkit-settings-panel {
            --ytkit-v3-bg: #f7f8fa;
            --ytkit-v3-surface: #eef1f5;
            --ytkit-v3-surface-raised: #e7ebf0;
            --ytkit-v3-hover: rgba(15,23,42,0.045);
            --ytkit-v3-border: rgba(15,23,42,0.10);
            --ytkit-v3-border-strong: rgba(15,23,42,0.16);
            --ytkit-v3-text: #17202b;
            --ytkit-v3-muted: #5f6b79;
            --ytkit-v3-subtle: #7d8997;
            --ytkit-v3-accent: #cf352f;
            --ytkit-v3-accent-rgb: 207,53,47;
            --ytkit-v3-success: #168845;
            color-scheme: light !important;
            background: var(--ytkit-v3-bg) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: 0 28px 80px rgba(15,23,42,0.26) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-header,
        html:not([dark]) #ytkit-settings-panel .ytkit-sidebar,
        html:not([dark]) #ytkit-settings-panel .ytkit-content,
        html:not([dark]) #ytkit-settings-panel .ytkit-footer {
            background: var(--ytkit-v3-bg) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-insights {
            background: rgba(15,23,42,0.012) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-switch .ytkit-switch-thumb {
            background: #fff !important;
        }

        @media (max-width: 1180px) and (min-width: 901px) {
            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: 220px minmax(280px, 1fr) auto !important;
                gap: 16px !important;
            }

            #ytkit-settings-panel .ytkit-body {
                grid-template-columns: 210px minmax(0, 1fr) !important;
            }

            #ytkit-settings-panel .ytkit-insights {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-content {
                padding-inline: 32px !important;
            }
        }

        @media (max-width: 900px) {
            #ytkit-settings-panel {
                width: min(100vw - 20px, 760px) !important;
                height: min(95vh, 920px) !important;
                max-height: min(95vh, 920px) !important;
                border-radius: 14px !important;
            }

            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: minmax(0, 1fr) auto !important;
                grid-template-areas:
                    "brand actions"
                    "search search" !important;
                gap: 12px !important;
                min-height: auto !important;
                padding: 14px !important;
            }

            #ytkit-settings-panel .ytkit-header-live {
                display: block !important;
                font-size: 12.5px !important;
            }

            #ytkit-settings-panel .ytkit-body {
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
            }

            #ytkit-settings-panel .ytkit-sidebar {
                display: block !important;
                flex: 0 0 66px !important;
                width: 100% !important;
                min-height: 66px !important;
                height: 66px !important;
                padding: 8px 12px !important;
                border: 0 !important;
                border-bottom: 1px solid var(--ytkit-v3-border) !important;
                overflow: hidden !important;
            }

            #ytkit-settings-panel .ytkit-nav-list {
                display: grid !important;
                grid-auto-flow: column !important;
                grid-auto-columns: minmax(142px, 170px) !important;
                width: 100% !important;
                height: 50px !important;
                gap: 4px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn {
                min-height: 48px !important;
                padding-inline: 10px !important;
            }

            #ytkit-settings-panel .ytkit-sidebar-footer {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-content {
                flex: 1 1 auto !important;
                padding: 24px !important;
            }

            #ytkit-settings-panel .ytkit-insights {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-footer {
                min-height: 68px !important;
                padding: 10px 16px !important;
            }
        }

        @media (max-width: 560px) {
            #ytkit-settings-panel {
                width: 100vw !important;
                height: 100vh !important;
                max-height: 100vh !important;
                border: 0 !important;
                border-radius: 0 !important;
            }

            #ytkit-settings-panel .ytkit-header {
                padding: 12px 14px !important;
            }

            #ytkit-settings-panel .ytkit-brand-copy {
                gap: 9px !important;
            }

            #ytkit-settings-panel .ytkit-brand-lockup {
                gap: 9px !important;
            }

            #ytkit-settings-panel .ytkit-eyebrow {
                font-size: 16px !important;
            }

            #ytkit-settings-panel .ytkit-title {
                font-size: 12px !important;
            }

            #ytkit-settings-panel .ytkit-brand-mark {
                width: 32px !important;
                min-width: 32px !important;
                height: 32px !important;
            }

            #ytkit-settings-panel .ytkit-brand-image {
                width: 28px !important;
                height: 28px !important;
            }

            #ytkit-settings-panel .ytkit-command-search {
                height: 44px !important;
                min-height: 44px !important;
            }

            #ytkit-settings-panel .ytkit-nav-list {
                grid-auto-columns: minmax(144px, 164px) !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn {
                grid-template-columns: 24px minmax(0, 1fr) !important;
                gap: 8px !important;
            }

            #ytkit-settings-panel .ytkit-nav-count {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn.active .ytkit-nav-count {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-header-actions {
                gap: 8px !important;
            }

            #ytkit-settings-panel .ytkit-header-live {
                display: grid !important;
                place-items: center !important;
                width: 14px !important;
                min-width: 14px !important;
                height: 14px !important;
                min-height: 14px !important;
                overflow: visible !important;
                font-size: 0 !important;
            }

            #ytkit-settings-panel .ytkit-header-live-dot {
                display: block !important;
                width: 8px !important;
                height: 8px !important;
                border-radius: 50% !important;
                background: var(--ytkit-v3-success) !important;
                box-shadow: 0 0 0 3px rgba(34,197,94,0.16) !important;
            }

            #ytkit-settings-panel .ytkit-content {
                padding: 20px 18px 28px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                display: block !important;
                margin-bottom: 14px !important;
                padding-bottom: 16px !important;
            }

            #ytkit-settings-panel .ytkit-pane-title h2 {
                font-size: 24px !important;
            }

            #ytkit-settings-panel .ytkit-pane-actions {
                justify-content: space-between !important;
                margin-top: 14px !important;
            }

            #ytkit-settings-panel .ytkit-feature-card,
            #ytkit-settings-panel .ytkit-textarea-card,
            #ytkit-settings-panel .ytkit-range-card,
            #ytkit-settings-panel .ytkit-color-card,
            #ytkit-settings-panel .ytkit-feature-card:has(.ytkit-feature-custom) {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 14px !important;
                min-height: 0 !important;
                padding: 16px 0 !important;
            }

            #ytkit-settings-panel .ytkit-feature-name {
                font-size: 15.5px !important;
            }

            #ytkit-settings-panel .ytkit-feature-desc {
                font-size: 13px !important;
                -webkit-line-clamp: 3 !important;
            }

            #ytkit-settings-panel .ytkit-select-shell,
            #ytkit-settings-panel .ytkit-field-shell,
            #ytkit-settings-panel .ytkit-range-shell,
            #ytkit-settings-panel .ytkit-color-shell,
            #ytkit-settings-panel .ytkit-feature-custom {
                justify-self: stretch !important;
                width: 100% !important;
                max-width: none !important;
            }

            #ytkit-settings-panel .ytkit-switch {
                justify-self: start !important;
            }

            #ytkit-settings-panel .ytkit-sub-features {
                margin-left: 8px !important;
                padding-left: 14px !important;
            }

            #ytkit-settings-panel .ytkit-footer {
                grid-template-columns: 1fr !important;
                gap: 8px !important;
                min-height: 0 !important;
                padding: 10px 14px !important;
            }

            #ytkit-settings-panel .ytkit-panel-status {
                overflow: hidden !important;
                font-size: 12.5px !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            #ytkit-settings-panel .ytkit-footer-right,
            #ytkit-settings-panel .ytkit-footer-actions {
                width: 100% !important;
            }

            #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn {
                flex: 1 1 0 !important;
                min-height: 42px !important;
                padding-inline: 10px !important;
            }

            #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
                min-width: 0 !important;
            }
        }

        @media (forced-colors: active) {
            #ytkit-settings-panel,
            #ytkit-settings-panel .ytkit-command-search,
            #ytkit-settings-panel .ytkit-select,
            #ytkit-settings-panel .ytkit-input {
                border-color: CanvasText !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn.active {
                outline: 2px solid Highlight !important;
                outline-offset: -2px !important;
            }

            #ytkit-settings-panel .ytkit-feature-card {
                border-bottom-color: CanvasText !important;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #ytkit-settings-panel *,
            #ytkit-settings-panel *::before,
            #ytkit-settings-panel *::after {
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
            }
        }
    `;

    function ensureSettingsVisualSystem(doc = globalThis.document) {
        if (!doc?.getElementById) return null;
        const id = `yt-suite-style-${STYLE_ID}`;
        const existing = doc.getElementById(id);
        if (existing) return existing;
        if (doc !== globalThis.document || typeof core.injectStyle !== 'function') return null;
        return core.injectStyle(SETTINGS_VISUAL_SYSTEM_CSS, STYLE_ID, true);
    }

    Object.assign(core, {
        SETTINGS_VISUAL_SYSTEM_CSS,
        ensureSettingsVisualSystem
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            SETTINGS_VISUAL_SYSTEM_CSS,
            STYLE_ID,
            ensureSettingsVisualSystem
        };
    }
})();
