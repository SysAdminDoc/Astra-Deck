(() => {
    'use strict';

    // extension/core/toast-dom.js
    //
    // v4.42.0 DOM-layer toast peel. The v4.14.0 toast.js peel extracted
    // the *pure* helpers (inferToastTone / getToastRgb /
    // getToastBadgeLabel / getToastAriaDefaults / TONE_RGB / TONE_BADGE);
    // the DOM-touching showToast / dismissToast functions stayed in the
    // monolith. This module ships canonical DOM builders that the
    // monolith now delegates to. ytkit.js keeps a byte-identical inline
    // fallback so the userscript path (which does not load this module)
    // continues to work exactly as before.
    //
    // Public surface (under globalThis.YTKitCore.toastDom):
    //   createToastSystem({ zIndex, inferToastTone, getToastRgb,
    //                       getToastBadgeLabel })
    //     → { showToast, dismissToast }
    //
    // The factory takes its dependencies as inputs rather than pulling
    // them off the global so the module is unit-testable in isolation
    // (no need to seed a YTKitCore.toast stub before requiring this
    // file). The monolith calls the factory once at init and caches
    // the returned pair.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.toastDom && core.toastDom.createToastSystem) return;

    function createToastSystem(deps = {}) {
        const zIndex = deps.zIndex || 70000;
        const inferToastTone = deps.inferToastTone || (() => 'success');
        const getToastRgb = deps.getToastRgb || (() => '53,199,127');
        const getToastBadgeLabel = deps.getToastBadgeLabel || (() => 'Done');

        function dismissToast(toast, immediate = false) {
            if (!toast) return;
            if (toast._dismissTimer) {
                clearTimeout(toast._dismissTimer);
                toast._dismissTimer = null;
            }
            if (toast._removeTimer) {
                clearTimeout(toast._removeTimer);
                toast._removeTimer = null;
            }
            toast.classList.remove('is-visible');
            // The reduced-motion branch matches ytkit.js's inline
            // fallback byte-for-byte so the parity test holds.
            const reduce = typeof window !== 'undefined'
                && window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (immediate || reduce) {
                toast.remove();
                return;
            }
            toast._removeTimer = setTimeout(() => {
                if (toast.isConnected) toast.remove();
            }, 180);
        }

        function showToast(message, color = '#22c55e', options = {}) {
            const existingToast = document.querySelector('.ytkit-global-toast');
            if (existingToast) dismissToast(existingToast, true);

            const tone = options.tone || inferToastTone(color);
            const actions = [
                ...(Array.isArray(options.actions) ? options.actions : []),
                ...(options.action ? [options.action] : [])
            ].filter(Boolean).slice(0, 2);
            const durationMs = Math.max(0, Number(options.duration ?? 2.5) * 1000);

            const toast = document.createElement('div');
            toast.className = 'ytkit-global-toast';
            toast.dataset.tone = tone;
            toast.style.setProperty('--ytkit-toast-rgb', getToastRgb(tone));
            toast.style.setProperty('--ytkit-toast-z', String(zIndex));
            toast.setAttribute('role', options.role || (color === '#ef4444' ? 'alert' : 'status'));
            toast.setAttribute('aria-live', options.ariaLive || (color === '#ef4444' ? 'assertive' : 'polite'));
            toast.setAttribute('aria-atomic', 'true');
            toast.tabIndex = -1;

            const badge = document.createElement('span');
            badge.className = 'ytkit-toast-badge';
            badge.textContent = getToastBadgeLabel(tone);

            const body = document.createElement('div');
            body.className = 'ytkit-toast-body';

            const textSpan = document.createElement('span');
            textSpan.className = 'ytkit-toast-message';
            textSpan.textContent = message;
            body.appendChild(textSpan);

            const actionWrap = document.createElement('div');
            actionWrap.className = 'ytkit-toast-actions';

            actions.forEach((action, index) => {
                const actionBtn = document.createElement('button');
                actionBtn.className = `ytkit-toast-action${index > 0 ? ' ytkit-toast-action--secondary' : ''}`;
                actionBtn.type = 'button';
                actionBtn.textContent = action.text || (index === 0 ? 'Undo' : 'Open');
                actionBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    dismissToast(toast);
                    action.onClick?.();
                });
                actionWrap.appendChild(actionBtn);
            });

            if (options.dismissible !== false) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'ytkit-toast-close';
                closeBtn.type = 'button';
                closeBtn.setAttribute('aria-label', 'Dismiss notification');
                closeBtn.textContent = '✕';
                closeBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    dismissToast(toast);
                });
                actionWrap.appendChild(closeBtn);
            }
            toast.appendChild(badge);
            toast.appendChild(body);
            toast.appendChild(actionWrap);
            document.body.appendChild(toast);

            let remainingMs = durationMs;
            let dismissAt = Date.now() + remainingMs;
            const pauseDismiss = () => {
                if (!toast._dismissTimer) return;
                clearTimeout(toast._dismissTimer);
                toast._dismissTimer = null;
                remainingMs = Math.max(0, dismissAt - Date.now());
            };
            const resumeDismiss = () => {
                if (!toast.isConnected || remainingMs <= 0 || options.persistent) return;
                dismissAt = Date.now() + remainingMs;
                toast._dismissTimer = setTimeout(() => dismissToast(toast), remainingMs);
            };

            toast.addEventListener('pointerenter', pauseDismiss);
            toast.addEventListener('pointerleave', resumeDismiss);
            toast.addEventListener('focusin', pauseDismiss);
            toast.addEventListener('focusout', (event) => {
                if (!toast.contains(event.relatedTarget)) resumeDismiss();
            });
            toast.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    dismissToast(toast);
                }
            });

            requestAnimationFrame(() => toast.classList.add('is-visible'));
            if (!options.persistent && durationMs > 0) {
                toast._dismissTimer = setTimeout(() => dismissToast(toast), durationMs);
            }

            return toast;
        }

        return { showToast, dismissToast };
    }

    core.toastDom = Object.freeze({ createToastSystem });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createToastSystem };
    }
})();
