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
    function hardenOutlineIcon(svg) {
        if (!svg) return svg;
        svg.style.setProperty('color', 'inherit', 'important');
        svg.style.setProperty('fill', 'none', 'important');
        svg.style.setProperty('stroke', 'currentColor', 'important');
        for (const part of svg.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon')) {
            part.style.setProperty('fill', 'none', 'important');
            part.style.setProperty('stroke', 'currentColor', 'important');
        }
        return svg;
    }
    if (!core.hardenOutlineIcon) core.hardenOutlineIcon = hardenOutlineIcon;
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
                if (p.x !== undefined) rect.setAttribute('x', p.x);
                if (p.y !== undefined) rect.setAttribute('y', p.y);
                rect.setAttribute('width', p.width);
                rect.setAttribute('height', p.height);
                if (p.rx) rect.setAttribute('rx', p.rx);
                if (p.ry) rect.setAttribute('ry', p.ry);
                svg.appendChild(rect);
            } else if (p.type === 'ellipse') {
                const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                ellipse.setAttribute('cx', p.cx);
                ellipse.setAttribute('cy', p.cy);
                ellipse.setAttribute('rx', p.rx);
                ellipse.setAttribute('ry', p.ry);
                svg.appendChild(ellipse);
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
        edit: () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' },
            { type: 'path', d: 'M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z' }
        ], { strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        settings: () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 3 },
            { type: 'path', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }
        ], _S),

        close: () => createSVG('0 0 24 24', [
            { type: 'line', x1: 18, y1: 6, x2: 6, y2: 18 },
            { type: 'line', x1: 6, y1: 6, x2: 18, y2: 18 }
        ], { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }),

        lock: () => createSVG('0 0 24 24', [
            { type: 'rect', x: 4, y: 10, width: 16, height: 10, rx: 2 },
            { type: 'path', d: 'M8 10V7a4 4 0 0 1 8 0v3' }
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
        ], _S),

        // Feature definitions name their icon with a Lucide id
        // (CONTRIBUTING.md), and a name missing here fell back to the
        // settings gear, so 161 settings rows drew the same gear. The glyphs
        // below are Lucide's (ISC license, lucide.dev), drawn with this
        // file's 1.5 stroke. tests/icon-coverage.test.js fails when a feature
        // names an icon this map lacks.
        'activity': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }
        ], _S),
        'airplay': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1' },
            { type: 'path', d: 'm12 15 5 6H7Z' }
        ], _S),
        'alert-triangle': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
            { type: 'path', d: 'M12 9v4' },
            { type: 'path', d: 'M12 17h.01' }
        ], _S),
        'arrow-down': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 5v14' },
            { type: 'path', d: 'm19 12-7 7-7-7' }
        ], _S),
        'arrow-down-up': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm3 16 4 4 4-4' },
            { type: 'path', d: 'M7 20V4' },
            { type: 'path', d: 'm21 8-4-4-4 4' },
            { type: 'path', d: 'M17 4v16' }
        ], _S),
        'arrow-right': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M5 12h14' },
            { type: 'path', d: 'm12 5 7 7-7 7' }
        ], _S),
        'arrow-up': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm5 12 7-7 7 7' },
            { type: 'path', d: 'M12 19V5' }
        ], _S),
        'at-sign': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 4 },
            { type: 'path', d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8' }
        ], _S),
        'audio-lines': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M2 10v3' },
            { type: 'path', d: 'M6 6v11' },
            { type: 'path', d: 'M10 3v18' },
            { type: 'path', d: 'M14 8v7' },
            { type: 'path', d: 'M18 5v13' },
            { type: 'path', d: 'M22 10v3' }
        ], _S),
        'bar-chart-2': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M5 21v-6' },
            { type: 'path', d: 'M12 21V3' },
            { type: 'path', d: 'M19 21V9' }
        ], _S),
        'battery-low': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M22 14v-4' },
            { type: 'path', d: 'M6 14v-4' },
            { type: 'rect', x: 2, y: 6, width: 16, height: 12, rx: 2 }
        ], _S),
        'bell-ring': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10.268 21a2 2 0 0 0 3.464 0' },
            { type: 'path', d: 'M22 8c0-2.3-.8-4.3-2-6' },
            { type: 'path', d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' },
            { type: 'path', d: 'M4 2C2.8 3.7 2 5.7 2 8' }
        ], _S),
        'book-open': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 5v16' },
            { type: 'path', d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z' }
        ], _S),
        'bookmark': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z' }
        ], _S),
        'bot-off': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M13.67 8H18a2 2 0 0 1 2 2v4.33' },
            { type: 'path', d: 'M2 14h2' },
            { type: 'path', d: 'M20 14h2' },
            { type: 'path', d: 'M22 22 2 2' },
            { type: 'path', d: 'M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586' },
            { type: 'path', d: 'M9 13v2' },
            { type: 'path', d: 'M9.67 4H12v2.33' }
        ], _S),
        'broom': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M13.5 10.5 22 2' },
            { type: 'path', d: 'M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z' },
            { type: 'path', d: 'm5 18 2-2' },
            { type: 'path', d: 'm7.699 10.7 5.602 5.601' }
        ], _S),
        'bug': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 20v-9' },
            { type: 'path', d: 'M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z' },
            { type: 'path', d: 'M14.12 3.88 16 2' },
            { type: 'path', d: 'M21 21a4 4 0 0 0-3.81-4' },
            { type: 'path', d: 'M21 5a4 4 0 0 1-3.55 3.97' },
            { type: 'path', d: 'M22 13h-4' },
            { type: 'path', d: 'M3 21a4 4 0 0 1 3.81-4' },
            { type: 'path', d: 'M3 5a4 4 0 0 0 3.55 3.97' },
            { type: 'path', d: 'M6 13H2' },
            { type: 'path', d: 'm8 2 1.88 1.88' },
            { type: 'path', d: 'M9 7.13V6a3 3 0 1 1 6 0v1.13' }
        ], _S),
        'calendar': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M8 2v3' },
            { type: 'path', d: 'M16 2v3' },
            { type: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
            { type: 'path', d: 'M3 9h18' }
        ], _S),
        'calendar-clock': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M16 14v2.2l1.6 1' },
            { type: 'path', d: 'M16 2v3' },
            { type: 'path', d: 'M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338' },
            { type: 'path', d: 'M3 9h5.859' },
            { type: 'path', d: 'M8 2v3' },
            { type: 'circle', cx: 16, cy: 16, r: 6 }
        ], _S),
        'camera': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z' },
            { type: 'circle', cx: 12, cy: 13, r: 3 }
        ], _S),
        'case-sensitive': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16' },
            { type: 'path', d: 'M22 9v7' },
            { type: 'path', d: 'M3.304 13h6.392' },
            { type: 'circle', cx: 18.5, cy: 12.5, r: 3.5 }
        ], _S),
        'cast': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6' },
            { type: 'path', d: 'M2 12a9 9 0 0 1 8 8' },
            { type: 'path', d: 'M2 16a5 5 0 0 1 4 4' },
            { type: 'line', x1: 2, x2: 2.01, y1: 20, y2: 20 }
        ], _S),
        'chart-no-axes-combined': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 16v5' },
            { type: 'path', d: 'M16 14.639V21' },
            { type: 'path', d: 'M20 10.656V21' },
            { type: 'path', d: 'm22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15' },
            { type: 'path', d: 'M4 18.463V21' },
            { type: 'path', d: 'M8 14.656V21' }
        ], _S),
        'check-square': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344' },
            { type: 'path', d: 'm9 11 3 3L22 4' }
        ], _S),
        'chevrons-down': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm7 6 5 5 5-5' },
            { type: 'path', d: 'm7 13 5 5 5-5' }
        ], _S),
        'circle-dollar-sign': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'path', d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' },
            { type: 'path', d: 'M12 18V6' }
        ], _S),
        'clipboard': () => createSVG('0 0 24 24', [
            { type: 'rect', width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 },
            { type: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }
        ], _S),
        'code': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm16 18 6-6-6-6' },
            { type: 'path', d: 'm8 6-6 6 6 6' }
        ], _S),
        'contrast': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'path', d: 'M12 18a6 6 0 0 0 0-12v12z' }
        ], _S),
        'copy-check': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm12 15 2 2 4-4' },
            { type: 'rect', width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 },
            { type: 'path', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }
        ], _S),
        'database': () => createSVG('0 0 24 24', [
            { type: 'ellipse', cx: 12, cy: 5, rx: 9, ry: 3 },
            { type: 'path', d: 'M3 5V19A9 3 0 0 0 21 19V5' },
            { type: 'path', d: 'M3 12A9 3 0 0 0 21 12' }
        ], _S),
        'droplet': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z' }
        ], _S),
        'eye': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' },
            { type: 'circle', cx: 12, cy: 12, r: 3 }
        ], _S),
        'fast-forward': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z' },
            { type: 'path', d: 'M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z' }
        ], _S),
        'film': () => createSVG('0 0 24 24', [
            { type: 'rect', width: 18, height: 18, x: 3, y: 3, rx: 2 },
            { type: 'path', d: 'M7 3v18' },
            { type: 'path', d: 'M3 7.5h4' },
            { type: 'path', d: 'M3 12h18' },
            { type: 'path', d: 'M3 16.5h4' },
            { type: 'path', d: 'M17 3v18' },
            { type: 'path', d: 'M17 7.5h4' },
            { type: 'path', d: 'M17 16.5h4' }
        ], _S),
        'flip-horizontal': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3' },
            { type: 'path', d: 'M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3' },
            { type: 'path', d: 'M12 20v2' },
            { type: 'path', d: 'M12 14v2' },
            { type: 'path', d: 'M12 8v2' },
            { type: 'path', d: 'M12 2v2' }
        ], _S),
        'folder-tree': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z' },
            { type: 'path', d: 'M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z' },
            { type: 'path', d: 'M3 5a2 2 0 0 0 2 2h3' },
            { type: 'path', d: 'M3 3v13a2 2 0 0 0 2 2h3' }
        ], _S),
        'graduation-cap': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z' },
            { type: 'path', d: 'M22 10v6' },
            { type: 'path', d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' }
        ], _S),
        'headphones': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3' }
        ], _S),
        'history': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' },
            { type: 'path', d: 'M3 3v5h5' },
            { type: 'path', d: 'M12 7v5l4 2' }
        ], _S),
        'image': () => createSVG('0 0 24 24', [
            { type: 'rect', width: 18, height: 18, x: 3, y: 3, rx: 2, ry: 2 },
            { type: 'circle', cx: 9, cy: 9, r: 2 },
            { type: 'path', d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }
        ], _S),
        'info': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'path', d: 'M12 16v-4' },
            { type: 'path', d: 'M12 8h.01' }
        ], _S),
        'languages': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm5 8 6 6' },
            { type: 'path', d: 'm4 14 6-6 2-3' },
            { type: 'path', d: 'M2 5h12' },
            { type: 'path', d: 'M7 2h1' },
            { type: 'path', d: 'm22 22-5-10-5 10' },
            { type: 'path', d: 'M14 18h6' }
        ], _S),
        'list-end': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M16 5H3' },
            { type: 'path', d: 'M16 12H3' },
            { type: 'path', d: 'M9 19H3' },
            { type: 'path', d: 'm16 16-3 3 3 3' },
            { type: 'path', d: 'M21 5v12a2 2 0 0 1-2 2h-6' }
        ], _S),
        'list-filter': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M2 5h20' },
            { type: 'path', d: 'M6 12h12' },
            { type: 'path', d: 'M9 19h6' }
        ], _S),
        'list-ordered': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M11 5h10' },
            { type: 'path', d: 'M11 12h10' },
            { type: 'path', d: 'M11 19h10' },
            { type: 'path', d: 'M4 4h1v5' },
            { type: 'path', d: 'M4 9h2' },
            { type: 'path', d: 'M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02' }
        ], _S),
        'list-tree': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M8 5h13' },
            { type: 'path', d: 'M13 12h8' },
            { type: 'path', d: 'M13 19h8' },
            { type: 'path', d: 'M3 10a2 2 0 0 0 2 2h3' },
            { type: 'path', d: 'M3 5v12a2 2 0 0 0 2 2h3' }
        ], _S),
        'list-x': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M16 5H3' },
            { type: 'path', d: 'M11 12H3' },
            { type: 'path', d: 'M16 19H3' },
            { type: 'path', d: 'm15.5 9.5 5 5' },
            { type: 'path', d: 'm20.5 9.5-5 5' }
        ], _S),
        'mail-open': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z' },
            { type: 'path', d: 'm22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10' }
        ], _S),
        'maximize': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M8 3H5a2 2 0 0 0-2 2v3' },
            { type: 'path', d: 'M21 8V5a2 2 0 0 0-2-2h-3' },
            { type: 'path', d: 'M3 16v3a2 2 0 0 0 2 2h3' },
            { type: 'path', d: 'M16 21h3a2 2 0 0 0 2-2v-3' }
        ], _S),
        'maximize-2': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M15 3h6v6' },
            { type: 'path', d: 'm21 3-7 7' },
            { type: 'path', d: 'm3 21 7-7' },
            { type: 'path', d: 'M9 21H3v-6' }
        ], _S),
        'message-circle': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719' }
        ], _S),
        'message-circle-off': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm2 2 20 20' },
            { type: 'path', d: 'M4.93 4.929a10 10 0 0 0-1.938 11.412 2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 0 0 11.302-1.989' },
            { type: 'path', d: 'M8.35 2.69A10 10 0 0 1 21.3 15.65' }
        ], _S),
        'messages-square': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' },
            { type: 'path', d: 'M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1' }
        ], _S),
        'minimize': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M8 3v3a2 2 0 0 1-2 2H3' },
            { type: 'path', d: 'M21 8h-3a2 2 0 0 1-2-2V3' },
            { type: 'path', d: 'M3 16h3a2 2 0 0 1 2 2v3' },
            { type: 'path', d: 'M16 21v-3a2 2 0 0 1 2-2h3' }
        ], _S),
        'moon': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401' }
        ], _S),
        'move-horizontal': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm18 8 4 4-4 4' },
            { type: 'path', d: 'M2 12h20' },
            { type: 'path', d: 'm6 8-4 4 4 4' }
        ], _S),
        'move-vertical': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 2v20' },
            { type: 'path', d: 'm8 18 4 4 4-4' },
            { type: 'path', d: 'm8 6 4-4 4 4' }
        ], _S),
        'pause-circle': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'line', x1: 10, x2: 10, y1: 15, y2: 9 },
            { type: 'line', x1: 14, x2: 14, y1: 15, y2: 9 }
        ], _S),
        'percent': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 19, x2: 5, y1: 5, y2: 19 },
            { type: 'circle', cx: 6.5, cy: 6.5, r: 2.5 },
            { type: 'circle', cx: 17.5, cy: 17.5, r: 2.5 }
        ], _S),
        'picture-in-picture': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M2 10h6V4' },
            { type: 'path', d: 'm2 4 6 6' },
            { type: 'path', d: 'M21 10V7a2 2 0 0 0-2-2h-7' },
            { type: 'path', d: 'M3 14v2a2 2 0 0 0 2 2h3' },
            { type: 'rect', x: 12, y: 14, width: 10, height: 7, rx: 1 }
        ], _S),
        'pin-off': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 17v5' },
            { type: 'path', d: 'M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89' },
            { type: 'path', d: 'm2 2 20 20' },
            { type: 'path', d: 'M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11' }
        ], _S),
        'refresh-cw': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' },
            { type: 'path', d: 'M21 3v5h-5' },
            { type: 'path', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' },
            { type: 'path', d: 'M8 16H3v5' }
        ], _S),
        'repeat': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm17 2 4 4-4 4' },
            { type: 'path', d: 'M3 11v-1a4 4 0 0 1 4-4h14' },
            { type: 'path', d: 'm7 22-4-4 4-4' },
            { type: 'path', d: 'M21 13v1a4 4 0 0 1-4 4H3' }
        ], _S),
        'repeat-2': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm2 9 3-3 3 3' },
            { type: 'path', d: 'M13 18H7a2 2 0 0 1-2-2V6' },
            { type: 'path', d: 'm22 15-3 3-3-3' },
            { type: 'path', d: 'M11 6h6a2 2 0 0 1 2 2v10' }
        ], _S),
        'rewind': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z' },
            { type: 'path', d: 'M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z' }
        ], _S),
        'rotate-cw': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' },
            { type: 'path', d: 'M21 3v5h-5' }
        ], _S),
        'route': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 6, cy: 19, r: 3 },
            { type: 'path', d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' },
            { type: 'circle', cx: 18, cy: 5, r: 3 }
        ], _S),
        'rows-3': () => createSVG('0 0 24 24', [
            { type: 'rect', width: 18, height: 18, x: 3, y: 3, rx: 2 },
            { type: 'path', d: 'M21 9H3' },
            { type: 'path', d: 'M21 15H3' }
        ], _S),
        'rss': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M4 11a9 9 0 0 1 9 9' },
            { type: 'path', d: 'M4 4a16 16 0 0 1 16 16' },
            { type: 'circle', cx: 5, cy: 19, r: 1 }
        ], _S),
        'scroll-text': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M15 12h-5' },
            { type: 'path', d: 'M15 8h-5' },
            { type: 'path', d: 'M19 17V5a2 2 0 0 0-2-2H4' },
            { type: 'path', d: 'M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3' }
        ], _S),
        'share-2': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 18, cy: 5, r: 3 },
            { type: 'circle', cx: 6, cy: 12, r: 3 },
            { type: 'circle', cx: 18, cy: 19, r: 3 },
            { type: 'line', x1: 8.59, x2: 15.42, y1: 13.51, y2: 17.49 },
            { type: 'line', x1: 15.41, x2: 8.59, y1: 6.51, y2: 10.49 }
        ], _S),
        'shield-check': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
            { type: 'path', d: 'm9 12 2 2 4-4' }
        ], _S),
        'shield-off': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm2 2 20 20' },
            { type: 'path', d: 'M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71' },
            { type: 'path', d: 'M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264' }
        ], _S),
        'shuffle': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm18 14 4 4-4 4' },
            { type: 'path', d: 'm18 2 4 4-4 4' },
            { type: 'path', d: 'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22' },
            { type: 'path', d: 'M2 6h1.972a4 4 0 0 1 3.6 2.2' },
            { type: 'path', d: 'M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45' }
        ], _S),
        'sliders': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10 8h4' },
            { type: 'path', d: 'M12 21v-9' },
            { type: 'path', d: 'M12 8V3' },
            { type: 'path', d: 'M17 16h4' },
            { type: 'path', d: 'M19 12V3' },
            { type: 'path', d: 'M19 21v-5' },
            { type: 'path', d: 'M3 14h4' },
            { type: 'path', d: 'M5 10V3' },
            { type: 'path', d: 'M5 21v-7' }
        ], _S),
        'sliders-horizontal': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10 5H3' },
            { type: 'path', d: 'M12 19H3' },
            { type: 'path', d: 'M14 3v4' },
            { type: 'path', d: 'M16 17v4' },
            { type: 'path', d: 'M21 12h-9' },
            { type: 'path', d: 'M21 19h-5' },
            { type: 'path', d: 'M21 5h-7' },
            { type: 'path', d: 'M8 10v4' },
            { type: 'path', d: 'M8 12H3' }
        ], _S),
        'speaker': () => createSVG('0 0 24 24', [
            { type: 'rect', width: 16, height: 20, x: 4, y: 2, rx: 2 },
            { type: 'path', d: 'M12 6h.01' },
            { type: 'circle', cx: 12, cy: 14, r: 4 },
            { type: 'path', d: 'M12 14h.01' }
        ], _S),
        'subtitles': () => createSVG('0 0 24 24', [
            { type: 'rect', width: 18, height: 14, x: 3, y: 5, rx: 2, ry: 2 },
            { type: 'path', d: 'M7 15h4M15 15h2M7 11h2M13 11h4' }
        ], _S),
        'sun': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 4 },
            { type: 'path', d: 'M12 2v2' },
            { type: 'path', d: 'M12 20v2' },
            { type: 'path', d: 'm4.93 4.93 1.41 1.41' },
            { type: 'path', d: 'm17.66 17.66 1.41 1.41' },
            { type: 'path', d: 'M2 12h2' },
            { type: 'path', d: 'M20 12h2' },
            { type: 'path', d: 'm6.34 17.66-1.41 1.41' },
            { type: 'path', d: 'm19.07 4.93-1.41 1.41' }
        ], _S),
        'thumbs-down': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z' },
            { type: 'path', d: 'M17 14V2' }
        ], _S),
        'thumbs-up': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z' },
            { type: 'path', d: 'M7 10v12' }
        ], _S),
        'timer': () => createSVG('0 0 24 24', [
            { type: 'line', x1: 10, x2: 14, y1: 2, y2: 2 },
            { type: 'line', x1: 12, x2: 15, y1: 14, y2: 11 },
            { type: 'circle', cx: 12, cy: 14, r: 8 }
        ], _S),
        'timer-reset': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10 2h4' },
            { type: 'path', d: 'M12 14v-4' },
            { type: 'path', d: 'M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6' },
            { type: 'path', d: 'M9 17H4v5' }
        ], _S),
        'trash-2': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10 11v6' },
            { type: 'path', d: 'M14 11v6' },
            { type: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
            { type: 'path', d: 'M3 6h18' },
            { type: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }
        ], _S),
        'user-check': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'm16 11 2 2 4-4' },
            { type: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
            { type: 'circle', cx: 9, cy: 7, r: 4 }
        ], _S),
        'user-cog': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M10 15H6a4 4 0 0 0-4 4v2' },
            { type: 'path', d: 'm14.305 16.53.923-.382' },
            { type: 'path', d: 'm15.228 13.852-.923-.383' },
            { type: 'path', d: 'm16.852 12.228-.383-.923' },
            { type: 'path', d: 'm16.852 17.772-.383.924' },
            { type: 'path', d: 'm19.148 12.228.383-.923' },
            { type: 'path', d: 'm19.53 18.696-.382-.924' },
            { type: 'path', d: 'm20.772 13.852.924-.383' },
            { type: 'path', d: 'm20.772 16.148.924.383' },
            { type: 'circle', cx: 18, cy: 15, r: 3 },
            { type: 'circle', cx: 9, cy: 7, r: 4 }
        ], _S),
        'user-x': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
            { type: 'circle', cx: 9, cy: 7, r: 4 },
            { type: 'line', x1: 17, x2: 22, y1: 8, y2: 13 },
            { type: 'line', x1: 22, x2: 17, y1: 8, y2: 13 }
        ], _S),
        'users': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
            { type: 'path', d: 'M16 3.128a4 4 0 0 1 0 7.744' },
            { type: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
            { type: 'circle', cx: 9, cy: 7, r: 4 }
        ], _S),
        'volume-1': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' },
            { type: 'path', d: 'M16 9a5 5 0 0 1 0 6' }
        ], _S),
        'volume-2': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' },
            { type: 'path', d: 'M16 9a5 5 0 0 1 0 6' },
            { type: 'path', d: 'M19.364 18.364a9 9 0 0 0 0-12.728' }
        ], _S),
        'volume-x': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z' },
            { type: 'path', d: 'm16.5 14.5 5-5' },
            { type: 'path', d: 'm16.5 9.5 5 5' }
        ], _S),
        'wind': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M12.8 19.6A2 2 0 1 0 14 16H2' },
            { type: 'path', d: 'M17.5 8a2.5 2.5 0 1 1 2 4H2' },
            { type: 'path', d: 'M9.8 4.4A2 2 0 1 1 11 8H2' }
        ], _S),
        'x-circle': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 12, cy: 12, r: 10 },
            { type: 'path', d: 'm15 9-6 6' },
            { type: 'path', d: 'm9 9 6 6' }
        ], _S),
        'zap': () => createSVG('0 0 24 24', [
            { type: 'path', d: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z' }
        ], _S),
        'zoom-in': () => createSVG('0 0 24 24', [
            { type: 'circle', cx: 11, cy: 11, r: 8 },
            { type: 'line', x1: 21, x2: 16.65, y1: 21, y2: 16.65 },
            { type: 'line', x1: 11, x2: 11, y1: 8, y2: 14 },
            { type: 'line', x1: 8, x2: 14, y1: 11, y2: 11 }
        ], _S)
    };

    Object.assign(core, {
        createSVG,
        hardenOutlineIcon,
        ICONS
    });
})();
