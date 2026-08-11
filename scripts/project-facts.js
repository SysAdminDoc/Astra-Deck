#!/usr/bin/env node
'use strict';

// Source-derived project facts and documentation drift gate.
//
// `--write` refreshes the marked blocks in the existing project documents;
// `--check` is the CI path and fails if any rendered block is stale.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const BEGIN_MARKER = '<!-- BEGIN GENERATED PROJECT FACTS -->';
const END_MARKER = '<!-- END GENERATED PROJECT FACTS -->';
const DOCUMENT_TARGETS = Object.freeze([
    'README.md',
    'CONTRIBUTING.md',
    path.join('docs', 'architecture.md')
]);
const OPTIONAL_DOCUMENT_TARGETS = Object.freeze(['CLAUDE.md']);

function getDocumentTargets() {
    return [
        ...DOCUMENT_TARGETS,
        ...OPTIONAL_DOCUMENT_TARGETS.filter(relativePath => fs.existsSync(path.join(REPO_ROOT, relativePath)))
    ];
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function unique(values) {
    return [...new Set(values)];
}

function collectManifestModules(manifest) {
    const modules = [];
    for (const contentScript of manifest.content_scripts || []) {
        modules.push(...(contentScript.js || []));
        modules.push(...(contentScript['x-ytkit-runtime-modules'] || []));
    }
    return unique(modules);
}

function collectFeatureIds() {
    const ids = new Set();
    const files = [
        path.join(REPO_ROOT, 'extension', 'ytkit.js'),
        ...fs.readdirSync(path.join(REPO_ROOT, 'extension', 'features'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => path.join(REPO_ROOT, 'extension', 'features', entry.name, 'index.js'))
    ];
    const idPattern = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        idPattern.lastIndex = 0;
        let match;
        while ((match = idPattern.exec(source)) !== null) ids.add(match[1]);
    }
    return [...ids].sort();
}

function loadSelectorRegistry() {
    const packDir = path.join(REPO_ROOT, 'extension', 'core', 'selector-packs');
    const context = { globalThis: {}, console };
    context.globalThis = context;
    vm.createContext(context);
    for (const file of fs.readdirSync(packDir).filter(name => name.endsWith('.js')).sort()) {
        const source = fs.readFileSync(path.join(packDir, file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    return context.YTKitCore?.SurfacePackRegistry || new Map();
}

function collectColorThemeOptions(ytkitSource) {
    const match = ytkitSource.match(
        /id:\s*'colorThemeManager'[\s\S]*?options:\s*\{([\s\S]*?)\n\s*\},\s*settingKey:\s*'colorTheme'/
    );
    if (!match) throw new Error('Could not locate colorThemeManager options in extension/ytkit.js');
    const names = [...match[1].matchAll(/^\s*'([^']+)'\s*:/gm)].map(hit => hit[1]);
    if (!names.includes('none') || names.length < 2) {
        throw new Error('colorThemeManager options are incomplete in extension/ytkit.js');
    }
    return names;
}

function collectCompatibilityFacts(manifest, pageSource, musicSource, ytkitSource) {
    const requiredEvidence = [
        [/MUSIC:\s*'music'/, 'PageTypes.MUSIC'],
        [/EMBED:\s*'embed'/, 'PageTypes.EMBED'],
        [/isMusicHost/, 'music host classifier'],
        [/isEmbedPath/, 'embed path classifier'],
        [/location\.hostname !== 'music\.youtube\.com'/, 'exact YouTube Music host gate'],
        [/themeing \+ OLED \+ density/, 'bounded YouTube Music feature description'],
        [/qualityDefaultEmbed/, 'embed quality context'],
        [/data-ytkit-quality-context/, 'embed quality context marker']
    ];
    const sources = [pageSource, pageSource, pageSource, pageSource, musicSource, musicSource, ytkitSource, ytkitSource];
    for (let index = 0; index < requiredEvidence.length; index += 1) {
        if (!requiredEvidence[index][0].test(sources[index])) {
            throw new Error(`Compatibility source drift: missing ${requiredEvidence[index][1]}`);
        }
    }

    const excludedMatches = unique((manifest.content_scripts || [])
        .flatMap(entry => entry.exclude_matches || []));
    const mobileExcluded = excludedMatches.some(value => value.includes('m.youtube.com'));
    const studioExcluded = excludedMatches.some(value => value.includes('studio.youtube.com'));
    if (!mobileExcluded || !studioExcluded) {
        throw new Error('Manifest compatibility exclusions must include mobile YouTube and YouTube Studio');
    }

    return Object.freeze({
        desktop: 'Desktop YouTube extension',
        music: 'bounded YouTube Music theme/OLED/density compatibility',
        embed: 'bounded /embed/:id player mode',
        excluded: 'mobile browsers and YouTube Studio',
        userscript: 'userscript follows the host desktop browser'
    });
}

function collectProjectFacts() {
    const packageJson = readJson('package.json');
    const manifest = readJson(path.join('extension', 'manifest.json'));
    const schema = require(path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js'));
    const capabilityProbe = require(path.join(REPO_ROOT, 'extension', 'core', 'capability-probe.js'));
    const manifestPatch = require(path.join(REPO_ROOT, 'scripts', 'manifest-patch.js'));
    const build = require(path.join(REPO_ROOT, 'build-extension.js'));
    const dataFlow = require(path.join(REPO_ROOT, 'extension', 'core', 'data-flow.js'));
    const ytkitSource = readText(path.join('extension', 'ytkit.js'));
    const pageSource = readText(path.join('extension', 'core', 'page.js'));
    const musicSource = readText(path.join('extension', 'features', 'youtube-music-compat', 'index.js'));
    const modules = collectManifestModules(manifest);
    const featureModules = modules
        .filter(modulePath => /^features\/[^/]+\/index\.js$/.test(modulePath))
        .sort();
    const runtimeModules = manifest.content_scripts
        .flatMap(entry => entry['x-ytkit-runtime-modules'] || []);
    const localeNames = fs.readdirSync(path.join(REPO_ROOT, 'extension', '_locales'), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    const selectorRegistry = loadSelectorRegistry();
    const selectorEntries = [...selectorRegistry.entries()];
    const selectorAliases = selectorEntries
        .filter(([, entry]) => /^Alias for\b/i.test(String(entry.notes || '')))
        .map(([name]) => name)
        .sort();
    const themeOptions = collectColorThemeOptions(ytkitSource);
    const fullOnlyOrigins = dataFlow.ORIGIN_CATALOGUE.filter(entry => entry.profile === 'github-full');
    const nodeFloor = packageJson.engines?.node || `>=${String(readText('.nvmrc')).trim()}`;
    const browserFacts = capabilityProbe.CAPABILITY_MATRIX.browsers;
    const featureIds = collectFeatureIds();

    if (manifest.version !== packageJson.version) {
        throw new Error(`Manifest version ${manifest.version} does not match package version ${packageJson.version}`);
    }
    if (manifest.default_locale !== 'en' || !localeNames.includes(manifest.default_locale)) {
        throw new Error('Manifest default locale must be the checked-in en locale');
    }
    if (String(manifestPatch.FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION).split('.')[0]
        !== browserFacts.firefox.baseline.replace(/\D/g, '')) {
        throw new Error('Firefox floor sources disagree between capability probe and manifest patch');
    }

    return Object.freeze({
        version: packageJson.version,
        nodeFloor,
        chromiumFloor: browserFacts.chromium.baseline,
        firefoxFloor: browserFacts.firefox.baseline,
        locales: Object.freeze(localeNames),
        schemaEntries: schema.SETTINGS_SCHEMA.length,
        schemaCategories: schema.CATEGORIES.length,
        runtimeModules: runtimeModules.length,
        featureModules: Object.freeze(featureModules),
        featureIds: Object.freeze(featureIds),
        selectorPackFiles: fs.readdirSync(path.join(REPO_ROOT, 'extension', 'core', 'selector-packs'))
            .filter(file => file.endsWith('.js')).sort(),
        selectorSurfaces: selectorEntries.map(([name]) => name).sort(),
        selectorAliases: Object.freeze(selectorAliases),
        buildProfiles: Object.freeze([...build.BUILD_PROFILE_IDS]),
        fullOnlyOrigins: Object.freeze(fullOnlyOrigins.map(entry => entry.origin)),
        colorThemes: Object.freeze(themeOptions.filter(name => name !== 'none')),
        themeControls: Object.freeze(['oledTheme', 'denseMode', 'tokenThemeBridge']),
        compatibility: collectCompatibilityFacts(manifest, pageSource, musicSource, ytkitSource)
    });
}

function escapeTableCell(value) {
    return String(value).replace(/\|/g, '\\|');
}

function renderProjectFactsBlock(facts) {
    const profiles = facts.buildProfiles.map(profile => `\`${profile}\``).join(', ');
    const profileAddition = facts.fullOnlyOrigins.length
        ? `; github-full adds ${facts.fullOnlyOrigins.length} full-only origins`
        : '';
    const compatibility = [
        facts.compatibility.desktop,
        facts.compatibility.music,
        facts.compatibility.embed,
        facts.compatibility.excluded,
        facts.compatibility.userscript
    ].join('; ');
    const lines = [
        BEGIN_MARKER,
        '### Source-derived project facts',
        '',
        '| Fact | Current source value |',
        '| --- | --- |',
        `| Release | \`v${facts.version}\` |`,
        `| Runtime floors | Node \`${facts.nodeFloor}\`; ${facts.chromiumFloor}; ${facts.firefoxFloor} |`,
        `| Extension locales | \`${facts.locales.length}\`: ${facts.locales.map(locale => `\`${locale}\``).join(', ')} |`,
        `| Settings schema | \`${facts.schemaEntries}\` entries across \`${facts.schemaCategories}\` categories |`,
        `| Runtime graph | \`${facts.runtimeModules}\` modules, including \`${facts.featureModules.length}\` peeled feature modules and \`${facts.featureIds.length}\` declared feature IDs |`,
        `| Selector surfaces | \`${facts.selectorSurfaces.length}\` shipped surfaces from \`${facts.selectorPackFiles.length}\` selector packs (\`${facts.selectorAliases.length}\` aliases) |`,
        `| Build profiles | ${profiles}${profileAddition} |`,
        `| Themes | \`${facts.colorThemes.length}\` named color themes plus ${facts.themeControls.map(control => `\`${control}\``).join(', ')} controls |`,
        `| Compatibility modes | ${escapeTableCell(compatibility)} |`,
        END_MARKER
    ];
    return lines.join('\n');
}

function validateDocument(content, facts) {
    const normalized = String(content).replace(/\r\n/g, '\n');
    const block = renderProjectFactsBlock(facts);
    const matches = normalized.match(new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}`, 'g')) || [];
    if (matches.length !== 1) {
        return [`expected exactly one generated project-facts block, found ${matches.length}`];
    }
    return matches[0] === block ? [] : ['generated project-facts block is stale'];
}

function updateDocument(content, facts) {
    const newline = String(content).includes('\r\n') ? '\r\n' : '\n';
    const normalizedBlock = renderProjectFactsBlock(facts);
    const block = normalizedBlock.replace(/\n/g, newline);
    const pattern = new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}`);
    if (!pattern.test(content)) {
        throw new Error('document does not contain a generated project-facts block');
    }
    return content.replace(pattern, block);
}

function run(mode = 'check') {
    const facts = collectProjectFacts();
    const errors = [];
    for (const relativePath of getDocumentTargets()) {
        const absolutePath = path.join(REPO_ROOT, relativePath);
        const content = fs.readFileSync(absolutePath, 'utf8');
        if (mode === 'write') {
            const updated = updateDocument(content, facts);
            if (updated !== content) fs.writeFileSync(absolutePath, updated, 'utf8');
            continue;
        }
        for (const error of validateDocument(content, facts)) {
            errors.push(`${relativePath}: ${error}`);
        }
    }
    if (mode === 'check' && errors.length) {
        console.error('[project-facts] documentation drift detected:');
        for (const error of errors) console.error(`  ✗ ${error}`);
        process.exitCode = 1;
        return;
    }
    console.log(`[project-facts] ${mode === 'write' ? 'rendered' : 'OK'} — v${facts.version}, ${facts.locales.length} locales, ${facts.schemaEntries} schema entries, ${facts.selectorSurfaces.length} selector surfaces`);
}

if (require.main === module) {
    const mode = process.argv.includes('--write') ? 'write' : 'check';
    run(mode);
}

module.exports = {
    BEGIN_MARKER,
    DOCUMENT_TARGETS,
    END_MARKER,
    collectProjectFacts,
    renderProjectFactsBlock,
    updateDocument,
    validateDocument
};
