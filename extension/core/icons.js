(() => {
    'use strict';

    // SVG icon library + createSVG
    // helper extracted out of the ytkit.js monolith into a focused core
    // module. The library has zero ytkit.js-internal dependencies — it
    // only consumes `document.createElementNS` — so the extraction is
    // a plain top-level move with no accessor pattern needed.
    //
    // Why this is worth shipping: ~400 lines (createSVG + _S const +
    // ICONS object) leave the monolith. 29 call sites in ytkit.js
    // continue to use the same `ICONS.foo()` invocation shape via a
    // local-variable rebinding at the call site.
    //
    // Editors adding new icons: alphabetize within reason, don't
    // reshuffle existing order (keeps diff against the v4.5.0
    // extraction commit a pure key-block move).

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.ICONS) return;

    function createSVG(viewBox, paths, options = {}) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', viewBox);
        if (options.fill) svg.setAttribute('fill', options.fill);
        else svg.setAttribute('fill', 'none');
        if (options.stroke !== false) svg.setAttribute('stroke', options.stroke || 'currentColor');
        if (options.strokeWidth) svg.setAttribute('stroke-width', options.strokeWidth);
        if (options.strokeLinecap) svg.setAttribute('stroke-linecap', options.strokeLinecap);
        if (options.strokeLinejoin) svg.setAttribute('stroke-linejoin', options.strokeLinejoin);

        paths.forEach(p => {
            if (p.type === 'path') {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', p.d);
                if (p.fill) path.setAttribute('fill', p.fill);
                svg.appendChild(path);
            } else if (p.type === 'circle') {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', p.cx);
                circle.setAttribute('cy', p.cy);
                circle.setAttribute('r', p.r);
                if (p.fill) circle.setAttribute('fill', p.fill);
                svg.appendChild(circle);
            } else if (p.type === 'rect') {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', p.x);
                rect.setAttribute('y', p.y);
                rect.setAttribute('width', p.width);
                rect.setAttribute('height', p.height);
                if (p.rx) rect.setAttribute('rx', p.rx);
                svg.appendChild(rect);
            } else if (p.type === 'line') {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', p.x1);
                line.setAttribute('y1', p.y1);
                line.setAttribute('x2', p.x2);
                line.setAttribute('y2', p.y2);
                svg.appendChild(line);
            } else if (p.type === 'polyline') {
                const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                polyline.setAttribute('points', p.points);
                svg.appendChild(polyline);
            } else if (p.type === 'polygon') {
                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                polygon.setAttribute('points', p.points);
                svg.appendChild(polygon);
            }
        });
        return svg;
    }

    const _S = { strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' };
    const ICONS = {
        settings: () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 3 },
            { type: 'path', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }
        ], _S),

        close: () => createSVG('0 0 24 24', [
            { type: 'line', x1: 18, y1: 6, x2: 6, y2: 18 },
            { type: 'line', x1: 6, y1: 6, x2: 18, y2: 18 }
        ], { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        github: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' }
        ], { fill: 'currentColor', stroke: false }),

        upload: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
            { type: 'polyline', points: '17 8 12 3 7 8' },
            { type: 'line', x1: 12, y1: 3, x2: 12, y2: 15 }
        ], { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        download: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
            { type: 'polyline', points: '7 10 12 15 17 10' },
            { type: 'line', x1: 12, y1: 15, x2: 12, y2: 3 }
        ], { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        check: () => createSVG('0 0 24 24', [
            { type: 'polyline', points: '20 6 9 17 4 12' }
        ], { strokeWidth: '3', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        search: () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 11, cy: 11, r: 8 },
            { type: 'line', x1: 21, y1: 21, x2: 16.65, y2: 16.65 }
        ], { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        chevronRight: () => createSVG('0 0 24 24', [
            { type: 'polyline', points: '9 18 15 12 9 6' }
        ], { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        ytLogo: () => createSVG('0 0 28 20', [
            { type: 'rect', x: 1.5, y: 1.5, width: 25, height: 17, rx: 5, fill: 'rgba(255,255,255,0.1)' },
            { type: 'path', d: 'M10 6.4 18.2 10 10 13.6Z', fill: 'currentColor' },
            { type: 'circle', cx: 22.2, cy: 5.6, r: 1.6, fill: '#ffd166' }
        ], { stroke: false }),

        // Category icons
        interface: () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
            { type: 'path', d: 'M3 9h18' },
            { type: 'path', d: 'M9 21V9' }
        ], _S),

        appearance: () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 5 },
            { type: 'path', d: 'M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' }
        ], _S),

        content: () => createSVG('0 0 24 24', [
            { type: 'rect', x: 2, y: 2, width: 20, height: 20, rx: 2 },
            { type: 'line', x1: 7, y1: 2, x2: 7, y2: 22 },
            { type: 'line', x1: 17, y1: 2, x2: 17, y2: 22 },
            { type: 'line', x1: 2, y1: 12, x2: 22, y2: 12 }
        ], _S),

        player: () => createSVG('0 0 24 24', [
            { type: 'rect', x: 2, y: 3, width: 20, height: 14, rx: 2 },
            { type: 'path', d: 'm10 8 5 3-5 3z' },
            { type: 'line', x1: 2, y1: 20, x2: 22, y2: 20 }
        ], _S),

        sponsor: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }
        ], _S),

        shield: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
            { type: 'path', d: 'M9 12l2 2 4-4' }
        ], _S),

        quality: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8' },
            { type: 'circle', cx: 12, cy: 12, r: 4 }
        ], _S),

        clutter: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' },
            { type: 'path', d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' },
            { type: 'line', x1: 10, y1: 11, x2: 10, y2: 17 },
            { type: 'line', x1: 14, y1: 11, x2: 14, y2: 17 }
        ], _S),

        livechat: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
            { type: 'circle', cx: 12, cy: 10, r: 1, fill: 'currentColor' },
            { type: 'circle', cx: 8, cy: 10, r: 1, fill: 'currentColor' },
            { type: 'circle', cx: 16, cy: 10, r: 1, fill: 'currentColor' }
        ], _S),

        actions: () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'path', d: 'M12 8v4l3 3' }
        ], _S),

        controls: () => createSVG('0 0 24 24', [
            { type: 'line', x1: 4, y1: 21, x2: 4, y2: 14 },
            { type: 'line', x1: 4, y1: 10, x2: 4, y2: 3 },
            { type: 'line', x1: 12, y1: 21, x2: 12, y2: 12 },
            { type: 'line', x1: 12, y1: 8, x2: 12, y2: 3 },
            { type: 'line', x1: 20, y1: 21, x2: 20, y2: 16 },
            { type: 'line', x1: 20, y1: 12, x2: 20, y2: 3 },
            { type: 'circle', cx: 4, cy: 12, r: 2, fill: 'currentColor' },
            { type: 'circle', cx: 12, cy: 10, r: 2, fill: 'currentColor' },
            { type: 'circle', cx: 20, cy: 14, r: 2, fill: 'currentColor' }
        ], _S),

        downloads: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
            { type: 'polyline', points: '7 10 12 15 17 10' },
            { type: 'line', x1: 12, y1: 15, x2: 12, y2: 3 }
        ], _S),

        'list-plus': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 8, y1: 6, x2: 21, y2: 6 },
            { type: 'line', x1: 8, y1: 12, x2: 21, y2: 12 },
            { type: 'line', x1: 8, y1: 18, x2: 21, y2: 18 },
            { type: 'circle', cx: 3, cy: 6, r: 1, fill: 'currentColor' },
            { type: 'circle', cx: 3, cy: 12, r: 1, fill: 'currentColor' },
            { type: 'circle', cx: 3, cy: 18, r: 1, fill: 'currentColor' }
        ], _S),

        // Feature Icons
        'eye-off': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' },
            { type: 'line', x1: 1, y1: 1, x2: 23, y2: 23 }
        ], _S),

        'square': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 }
        ], _S),

        'video-off': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8' },
            { type: 'path', d: 'M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2' },
            { type: 'line', x1: 2, y1: 2, x2: 22, y2: 22 }
        ], _S),

        'external-link': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
            { type: 'polyline', points: '15 3 21 3 21 9' },
            { type: 'line', x1: 10, y1: 14, x2: 21, y2: 3 }
        ], _S),

        'layout': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
            { type: 'line', x1: 3, y1: 9, x2: 21, y2: 9 },
            { type: 'line', x1: 9, y1: 21, x2: 9, y2: 9 }
        ], _S),

        'grid': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 7, height: 7 },
            { type: 'rect', x: 14, y: 3, width: 7, height: 7 },
            { type: 'rect', x: 14, y: 14, width: 7, height: 7 },
            { type: 'rect', x: 3, y: 14, width: 7, height: 7 }
        ], _S),

        'folder-video': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z' },
            { type: 'polygon', points: '10 13 15 10.5 10 8 10 13' }
        ], _S),

        'fullscreen': () => createSVG('0 0 24 24', [
            { type: 'polyline', points: '15 3 21 3 21 9' },
            { type: 'polyline', points: '9 21 3 21 3 15' },
            { type: 'polyline', points: '21 15 21 21 15 21' },
            { type: 'polyline', points: '3 9 3 3 9 3' }
        ], _S),

        'arrows-horizontal': () => createSVG('0 0 24 24', [
            { type: 'polyline', points: '18 8 22 12 18 16' },
            { type: 'polyline', points: '6 8 2 12 6 16' },
            { type: 'line', x1: 2, y1: 12, x2: 22, y2: 12 }
        ], _S),

        'youtube': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z' },
            { type: 'polygon', points: '9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02' }
        ], _S),

        'tv': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 2, y: 7, width: 20, height: 15, rx: 2 },
            { type: 'polyline', points: '17 2 12 7 7 2' }
        ], _S),

        'home': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
            { type: 'polyline', points: '9 22 9 12 15 12 15 22' }
        ], _S),

        'sidebar': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
            { type: 'line', x1: 9, y1: 3, x2: 9, y2: 21 }
        ], _S),

        'skip-forward': () => createSVG('0 0 24 24', [
            { type: 'polygon', points: '5 4 15 12 5 20 5 4' },
            { type: 'line', x1: 19, y1: 5, x2: 19, y2: 19 }
        ], _S),

        'play-circle': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'polygon', points: '10 8 16 12 10 16 10 8' }
        ], _S),

        'monitor': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 2, y: 3, width: 20, height: 14, rx: 2 },
            { type: 'line', x1: 8, y1: 21, x2: 16, y2: 21 },
            { type: 'line', x1: 12, y1: 17, x2: 12, y2: 21 }
        ], _S),

        'menu': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 3, y1: 12, x2: 21, y2: 12 },
            { type: 'line', x1: 3, y1: 6, x2: 21, y2: 6 },
            { type: 'line', x1: 3, y1: 18, x2: 21, y2: 18 }
        ], _S),

        'hash': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 4, y1: 9, x2: 20, y2: 9 },
            { type: 'line', x1: 4, y1: 15, x2: 20, y2: 15 },
            { type: 'line', x1: 10, y1: 3, x2: 8, y2: 21 },
            { type: 'line', x1: 16, y1: 3, x2: 14, y2: 21 }
        ], _S),

        'file-text': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
            { type: 'polyline', points: '14 2 14 8 20 8' },
            { type: 'line', x1: 16, y1: 13, x2: 8, y2: 13 },
            { type: 'line', x1: 16, y1: 17, x2: 8, y2: 17 },
            { type: 'polyline', points: '10 9 9 9 8 9' }
        ], _S),

        'link': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
            { type: 'path', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }
        ], _S),

        'music': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M9 18V5l12-2v13' },
            { type: 'circle', cx: 6, cy: 18, r: 3 },
            { type: 'circle', cx: 18, cy: 16, r: 3 }
        ], _S),

        'hard-drive-download': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 2v8' },
            { type: 'path', d: 'm16 6-4 4-4-4' },
            { type: 'rect', x: 2, y: 14, width: 20, height: 8, rx: 2 },
            { type: 'line', x1: 6, y1: 18, x2: 6.01, y2: 18 }
        ], _S),

        'users-x': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
            { type: 'circle', cx: 9, cy: 7, r: 4 },
            { type: 'line', x1: 18, y1: 8, x2: 23, y2: 13 },
            { type: 'line', x1: 23, y1: 8, x2: 18, y2: 13 }
        ], _S),

        'clock': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'polyline', points: '12 6 12 12 16 14' }
        ], _S),

        'download-cloud': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' },
            { type: 'path', d: 'M12 12v9' },
            { type: 'path', d: 'm8 17 4 4 4-4' }
        ], _S),

        'filter': () => createSVG('0 0 24 24', [
            { type: 'polygon', points: '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' }
        ], _S),

        'layout-grid': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 7, height: 7, rx: 1 },
            { type: 'rect', x: 14, y: 3, width: 7, height: 7, rx: 1 },
            { type: 'rect', x: 14, y: 14, width: 7, height: 7, rx: 1 },
            { type: 'rect', x: 3, y: 14, width: 7, height: 7, rx: 1 }
        ], _S),

        'message-square': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }
        ], _S),

        'play': () => createSVG('0 0 24 24', [
            { type: 'polygon', points: '5 3 19 12 5 21 5 3' }
        ], _S),

        'sparkles': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z' },
            { type: 'path', d: 'M5 3v4' },
            { type: 'path', d: 'M19 17v4' },
            { type: 'path', d: 'M3 5h4' },
            { type: 'path', d: 'M17 19h4' }
        ], _S),

        'square-x': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
            { type: 'line', x1: 9, y1: 9, x2: 15, y2: 15 },
            { type: 'line', x1: 15, y1: 9, x2: 9, y2: 15 }
        ], _S),

        'list': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 8, y1: 6, x2: 21, y2: 6 },
            { type: 'line', x1: 8, y1: 12, x2: 21, y2: 12 },
            { type: 'line', x1: 8, y1: 18, x2: 21, y2: 18 },
            { type: 'line', x1: 3, y1: 6, x2: 3.01, y2: 6 },
            { type: 'line', x1: 3, y1: 12, x2: 3.01, y2: 12 },
            { type: 'line', x1: 3, y1: 18, x2: 3.01, y2: 18 }
        ], _S),
        'picture-in-picture-2': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 1, y: 1, width: 22, height: 22, rx: 2 },
            { type: 'rect', x: 10, y: 10, width: 12, height: 8, rx: 1 }
        ], _S),
        'gauge': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 15l3.5-5' },
            { type: 'circle', cx: 12, cy: 15, r: 2 },
            { type: 'path', d: 'M2 12a10 10 0 0120 0' }
        ], _S),
        'palette': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10a2.5 2.5 0 002.5-2.5c0-.61-.23-1.21-.64-1.67A1.5 1.5 0 0115 16h1.5a10 10 0 00-4.5-18z' },
            { type: 'circle', cx: 7.5, cy: 11.5, r: 1.5 },
            { type: 'circle', cx: 12, cy: 7.5, r: 1.5 },
            { type: 'circle', cx: 16.5, cy: 11.5, r: 1.5 }
        ], _S),
        'cpu': () => createSVG('0 0 24 24', [
            { type: 'rect', x: 4, y: 4, width: 16, height: 16, rx: 2 },
            { type: 'rect', x: 9, y: 9, width: 6, height: 6 },
            { type: 'line', x1: 9, y1: 1, x2: 9, y2: 4 }, { type: 'line', x1: 15, y1: 1, x2: 15, y2: 4 },
            { type: 'line', x1: 9, y1: 20, x2: 9, y2: 23 }, { type: 'line', x1: 15, y1: 20, x2: 15, y2: 23 },
            { type: 'line', x1: 20, y1: 9, x2: 23, y2: 9 }, { type: 'line', x1: 20, y1: 14, x2: 23, y2: 14 },
            { type: 'line', x1: 1, y1: 9, x2: 4, y2: 9 }, { type: 'line', x1: 1, y1: 14, x2: 4, y2: 14 }
        ], _S),
        'type': () => createSVG('0 0 24 24', [
            { type: 'polyline', points: '4 7 4 4 20 4 20 7' },
            { type: 'line', x1: 9, y1: 20, x2: 15, y2: 20 },
            { type: 'line', x1: 12, y1: 4, x2: 12, y2: 20 }
        ], _S),
        'bar-chart': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 12, y1: 20, x2: 12, y2: 10 },
            { type: 'line', x1: 18, y1: 20, x2: 18, y2: 4 },
            { type: 'line', x1: 6, y1: 20, x2: 6, y2: 16 }
        ], _S)
    };

    Object.assign(core, {
        createSVG,
        ICONS
    });
})();
