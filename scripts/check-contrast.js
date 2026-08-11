#!/usr/bin/env node
'use strict';

/**
 * Contrast checker for the rendered popup and side-panel token lanes.
 *
 * The pages load their page stylesheet first and surface-system.css second,
 * so the audit resolves the same :root custom-property cascade before it
 * computes any ratios. A literal list of copied colors would drift silently
 * when either stylesheet changes.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SURFACE_SYSTEM_PATH = path.join(ROOT, 'extension', 'surface-system.css');

function stripCssComments(source) {
    return String(source).replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractRootCustomProperties(source) {
    const variables = Object.create(null);
    const rootBlock = /:root\s*\{([^{}]*)\}/gi;
    let rootMatch;
    while ((rootMatch = rootBlock.exec(stripCssComments(source)))) {
        const declarations = /(--[-\w]+)\s*:\s*([^;{}]+)(?:;|$)/g;
        let declaration;
        while ((declaration = declarations.exec(rootMatch[1]))) {
            variables[declaration[1]] = declaration[2].trim();
        }
    }
    return variables;
}

function resolveCustomProperties(variables) {
    const resolved = Object.create(null);
    const resolving = [];
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

    function resolve(name) {
        if (hasOwn(resolved, name)) return resolved[name];
        if (!hasOwn(variables, name)) return null;
        if (resolving.includes(name)) {
            throw new Error(`CSS custom-property cycle: ${[...resolving, name].join(' -> ')}`);
        }

        resolving.push(name);
        const value = String(variables[name]).replace(
            /var\(\s*(--[-\w]+)(?:\s*,\s*([^()]*))?\s*\)/g,
            (match, dependency, fallback) => {
                const replacement = resolve(dependency);
                if (replacement !== null) return replacement;
                if (fallback !== undefined) return fallback.trim();
                throw new Error(`CSS custom property ${name} references missing ${dependency}`);
            }
        ).trim();
        resolving.pop();
        if (value.includes('var(')) {
            throw new Error(`CSS custom property ${name} contains an unresolved var()`);
        }
        resolved[name] = value;
        return value;
    }

    for (const name of Object.keys(variables)) resolve(name);
    return resolved;
}

function loadSurfaceTokens(surface) {
    const pageFile = surface === 'popup' ? 'popup.css' : 'sidepanel.css';
    const variables = Object.create(null);
    for (const file of [pageFile, SURFACE_SYSTEM_PATH]) {
        const filePath = path.isAbsolute(file) ? file : path.join(ROOT, 'extension', file);
        Object.assign(
            variables,
            extractRootCustomProperties(fs.readFileSync(filePath, 'utf8'))
        );
    }
    return resolveCustomProperties(variables);
}

function parseHex(hex) {
    // Fail loudly on anything that is not #rrggbb. parseInt('rgba(…)', 16)
    // coerces to NaN, which the bit math turned into rgb(0,0,0) — a check
    // could then silently "pass" against a black background that the
    // surface never uses.
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        throw new Error('parseHex expects #rrggbb, got: ' + hex);
    }
    const num = parseInt(hex.slice(1), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function parseColor(value) {
    const normalized = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return parseHex(normalized);
    if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
        return parseHex('#' + normalized.slice(1).split('').map((part) => part + part).join(''));
    }
    const rgb = normalized.match(/^rgba?\(\s*([^)]*)\s*\)$/i);
    if (!rgb) throw new Error(`Contrast colors must resolve to an opaque RGB value, got ${value}`);
    const channels = rgb[1].split(',').map((part) => part.trim());
    if (channels.length !== 3 && channels.length !== 4) {
        throw new Error(`Invalid RGB color: ${value}`);
    }
    const parsed = channels.slice(0, 3).map((part) => {
        if (/%$/.test(part)) return Math.round(Math.max(0, Math.min(100, parseFloat(part))) * 2.55);
        return Math.round(Math.max(0, Math.min(255, parseFloat(part))));
    });
    const alpha = channels.length === 4 ? parseFloat(channels[3]) : 1;
    if (parsed.some((channel) => !Number.isFinite(channel)) || !Number.isFinite(alpha) || alpha !== 1) {
        throw new Error(`Contrast colors must resolve to an opaque RGB value, got ${value}`);
    }
    return parsed;
}

function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(foreground, background) {
    const [r1, g1, b1] = Array.isArray(foreground) ? foreground : parseColor(foreground);
    const [r2, g2, b2] = Array.isArray(background) ? background : parseColor(background);
    const l1 = luminance(r1, g1, b1);
    const l2 = luminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function buildChecks() {
    const checks = [];
    const definitions = [
        { name: 'Primary text', foreground: '--text-primary', minimum: 7 },
        { name: 'Muted text', foreground: '--text-muted', minimum: 4.5 },
        { name: 'Subtle text on surface', foreground: '--text-subtle', background: '--surface-strong', minimum: 4.5 },
        { name: 'Accent control text', foreground: '--accent', minimum: 4.5 },
        { name: 'Warning status', foreground: '--warning', background: '--surface-strong', minimum: 4.5 },
        { name: 'Error status', foreground: '--error', background: '--surface-strong', minimum: 4.5 },
    ];

    for (const surface of ['popup', 'sidepanel']) {
        const tokens = loadSurfaceTokens(surface);
        const defaultBackground = surface === 'popup' ? '--page-bg' : '--bg';
        for (const definition of definitions) {
            const background = definition.background || defaultBackground;
            const foregroundValue = tokens[definition.foreground];
            const backgroundValue = tokens[background];
            if (!foregroundValue || !backgroundValue) {
                throw new Error(
                    `${surface} is missing ${definition.foreground} or ${background}`
                );
            }
            // Parsing here couples the gate to the final resolved CSS value;
            // adding an alpha-only token to a checked text lane fails loudly
            // instead of pretending the background is opaque black.
            parseColor(foregroundValue);
            parseColor(backgroundValue);
            checks.push({
                ...definition,
                surface,
                background,
                foregroundValue,
                backgroundValue,
            });
        }
    }
    return checks;
}

function run(log = console.log) {
    log('WCAG AA Contrast Audit from resolved popup/sidepanel CSS tokens:\n');
    let checks;
    try {
        checks = buildChecks();
    } catch (error) {
        log(`✗ ${error.message}`);
        return 1;
    }

    let failures = 0;
    for (const check of checks) {
        const ratio = contrast(check.foregroundValue, check.backgroundValue);
        const pass = ratio >= check.minimum;
        log(`${pass ? '✓' : '✗'} ${check.surface} ${check.name}`);
        log(`  ${check.foreground} ${check.foregroundValue} on ${check.background} ${check.backgroundValue}`);
        log(`  Ratio: ${ratio.toFixed(2)}:1 (target: ${check.minimum}:1)`);
        if (!pass) failures++;
    }

    if (failures > 0) {
        log(`\n⚠ ${failures} contrast issue(s) found.`);
        return 1;
    }
    log('\n✓ All resolved token contrast checks pass.');
    return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = {
    buildChecks,
    contrast,
    extractRootCustomProperties,
    loadSurfaceTokens,
    luminance,
    parseColor,
    parseHex,
    resolveCustomProperties,
    run,
};
