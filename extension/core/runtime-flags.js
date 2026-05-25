(() => {
    'use strict';

    // extension/core/runtime-flags.js
    //
    // v4.47.0 NF12 — typed accessors for the three internal
    // window.__ytkit_* coordination primitives. These flags govern
    // cross-feature behavior:
    //
    //   __ytkit_videoPopped — popOutPlayer sets it on Document-PiP /
    //     standard-PiP enter; clears on pagehide / leavepictureinpicture.
    //     pipButton and fullscreenOnDoubleClick read it to skip work
    //     when the video has been popped to a separate window.
    //
    //   __ytkit_cpu_tamer — CPU Tamer init re-entry guard + destroy
    //     state. Set true when init patches the native timer functions;
    //     cleared on destroy after the originals are restored.
    //
    //   __ytkit_debug — Debug Mode on/off marker. Read by any feature
    //     that wants to gate verbose logging.
    //
    // Why a module? Until now these were untyped global assignments. A
    // misspelled flag at a write site (e.g. `__ytkit_video_popped`)
    // would silently break cooperation without firing any test or
    // lint. The wrapper gives every flag a single typed accessor and
    // lets the hardening test pin that no new internal flag gets
    // smuggled in through bare window.__ytkit_* writes.
    //
    // Back-compat: the storage is still window.__ytkit_*, so console
    // power users and the userscript build's globalThis-bound code
    // continue to see the same values. The module just owns the typed
    // read/write contract.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.runtimeFlags) return;

    const win = typeof window !== 'undefined' ? window : globalThis;

    const flags = Object.freeze({
        // popOutPlayer / pipButton / fullscreenOnDoubleClick coordination.
        getVideoPopped() {
            return Boolean(win.__ytkit_videoPopped);
        },
        setVideoPopped(value) {
            win.__ytkit_videoPopped = Boolean(value);
        },

        // CPU Tamer init guard + destroy marker.
        getCpuTamerActive() {
            return Boolean(win.__ytkit_cpu_tamer);
        },
        setCpuTamerActive(value) {
            win.__ytkit_cpu_tamer = Boolean(value);
        },

        // Debug Mode on/off.
        getDebugActive() {
            return Boolean(win.__ytkit_debug);
        },
        setDebugActive(value) {
            win.__ytkit_debug = Boolean(value);
        },
    });

    core.runtimeFlags = flags;
})();
