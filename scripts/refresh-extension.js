'use strict';

// One command for every delivered change: bump the version everywhere it
// lives, rebuild every package, and refresh the unpacked copy a browser
// loads, so the extension's reload button picks the change up.
//
//   node scripts/refresh-extension.js            patch bump (the default)
//   node scripts/refresh-extension.js minor      minor or major bump
//   node scripts/refresh-extension.js --no-bump  rebuild and refresh only
//
// The unpacked copy is the github-full Chrome build, extracted to
// %LOCALAPPDATA%\Astra-Deck\unpacked\chrome (ASTRA_UNPACKED_DIR overrides).
// Load it once with "Load unpacked"; after that a reload is enough. It lives
// outside the repo because the tree scans (one implementation of a guard, no
// eval, release readiness) would read it as a second copy of the source, and
// it is synced in place rather than deleted because a folder the browser
// holds can't be.
//
// Git is left to the caller. The userscript's libraries are pinned to the
// release commit, so a bump is followed by: commit, `git tag v<V>`,
// `node sync-userscript.js`, a second commit, then push the tag before main.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const UNPACKED_DIR = path.resolve(process.env.ASTRA_UNPACKED_DIR
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Astra-Deck', 'unpacked', 'chrome'));
const UNPACKED_PROFILE = 'github-full';
const BUMP_TYPES = ['patch', 'minor', 'major'];

function run(script, args = []) {
    execFileSync(process.execPath, [path.join(REPO_ROOT, script), ...args], { cwd: REPO_ROOT, stdio: 'inherit' });
}

function readVersion() {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
}

function rewrite(relativePath, edit) {
    const file = path.join(REPO_ROOT, relativePath);
    const before = fs.readFileSync(file, 'utf8');
    const after = edit(before);
    if (after === before) throw new Error(`${relativePath}: nothing to update, so its version anchor moved`);
    fs.writeFileSync(file, after, 'utf8');
}

// The version claims no generator owns.
function updateVersionClaims(version) {
    rewrite('docs/architecture.md', (text) => text
        .replace(/describes the v\d+\.\d+\.\d+ tree/, `describes the v${version} tree`)
        .replace(/currently agree at v\d+\.\d+\.\d+/, `currently agree at v${version}`));
    rewrite('tests/project-facts.test.js', (text) =>
        text.replace(/assert\.equal\(facts\.version, '\d+\.\d+\.\d+'\);/, `assert.equal(facts.version, '${version}');`));
}

// What sits under [Unreleased] becomes this version's section.
function addChangelogSection(version) {
    const date = new Date().toLocaleDateString('en-CA');
    rewrite('CHANGELOG.md', (text) => {
        const marker = '## [Unreleased]\n\n';
        const at = text.indexOf(marker);
        if (at < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
        const rest = text.slice(at + marker.length);
        if (rest.startsWith('## [')) console.warn(`[refresh-extension] CHANGELOG [Unreleased] is empty; ${version} gets an empty section`);
        return text.slice(0, at + marker.length) + `## [${version}] (${date})\n\n` + rest;
    });
}

function listFiles(dir, base = dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    });
}

function removeEmptyDirs(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const full = path.join(dir, entry.name);
        removeEmptyDirs(full);
        if (!fs.readdirSync(full).length) fs.rmdirSync(full);
    }
}

// Mirror the built package into the loaded folder: changed files are
// rewritten, files the build no longer has are removed, the folder stays.
function refreshUnpacked(version) {
    const zipPath = path.join(BUILD_DIR, `astra-deck-${UNPACKED_PROFILE}-chrome-v${version}.zip`);
    if (!fs.existsSync(zipPath)) throw new Error(`missing ${path.relative(REPO_ROOT, zipPath)}; the build did not produce it`);
    const zip = new AdmZip(zipPath);
    const incoming = new Map(zip.getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => [path.normalize(entry.entryName), entry]));
    fs.mkdirSync(UNPACKED_DIR, { recursive: true });
    let written = 0;
    for (const [relative, entry] of incoming) {
        const target = path.join(UNPACKED_DIR, relative);
        if (!target.startsWith(UNPACKED_DIR + path.sep)) throw new Error(`refusing zip entry outside the folder: ${relative}`);
        const data = entry.getData();
        if (fs.existsSync(target) && fs.readFileSync(target).equals(data)) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
        written += 1;
    }
    let removed = 0;
    for (const relative of listFiles(UNPACKED_DIR)) {
        if (incoming.has(path.normalize(relative))) continue;
        fs.rmSync(path.join(UNPACKED_DIR, relative), { force: true });
        removed += 1;
    }
    removeEmptyDirs(UNPACKED_DIR);
    const loaded = JSON.parse(fs.readFileSync(path.join(UNPACKED_DIR, 'manifest.json'), 'utf8')).version;
    if (loaded !== version) throw new Error(`unpacked manifest says ${loaded}, expected ${version}`);
    console.log(`[refresh-extension] ${UNPACKED_DIR} is v${version} (${written} written, ${removed} removed)`);
}

function main(args = process.argv.slice(2)) {
    const noBump = args.includes('--no-bump');
    const bumpType = args.find((arg) => BUMP_TYPES.includes(arg)) || 'patch';
    const unknown = args.filter((arg) => arg !== '--no-bump' && !BUMP_TYPES.includes(arg));
    if (unknown.length) throw new Error(`unknown argument ${unknown.join(' ')} (use patch, minor, major or --no-bump)`);

    const before = readVersion();
    run('build-extension.js', [...(noBump ? [] : ['--bump', bumpType]), '--with-userscript', '--no-crx']);
    const version = readVersion();
    if (!noBump) {
        if (version === before) throw new Error(`the build did not bump past ${before}`);
        run('scripts/project-facts.js', ['--write']);
        updateVersionClaims(version);
        run('scripts/build-selector-asset.js');
        run('scripts/sign-remote-feeds.js');
        addChangelogSection(version);
    }
    refreshUnpacked(version);
    console.log(`[refresh-extension] v${version} built. Reload the extension in the browser to pick it up.`);
    if (!noBump) {
        console.log(`[refresh-extension] Next: commit, git tag v${version}, node sync-userscript.js, commit, push the tag, then main.`);
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`[refresh-extension] ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { refreshUnpacked, updateVersionClaims, addChangelogSection, main };
