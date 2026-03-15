#!/usr/bin/env node
// build-extension.js -- Packages extension/ into Chrome + Firefox ZIPs
// Usage: node build-extension.js [--bump patch|minor|major]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXT_DIR = path.join(__dirname, 'extension');
const BUILD_DIR = path.join(__dirname, 'build');
const MANIFEST = path.join(EXT_DIR, 'manifest.json');
const YTKIT_JS = path.join(EXT_DIR, 'ytkit.js');
const USERSCRIPT = path.join(__dirname, 'ytkit.user.js');

// Parse args
const args = process.argv.slice(2);
const bumpIndex = args.indexOf('--bump');
const bumpType = bumpIndex !== -1 ? args[bumpIndex + 1] : null;

// Read manifest
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let version = manifest.version;

// Optional version bump
if (bumpType) {
    const parts = version.split('.').map(Number);
    if (bumpType === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
    else if (bumpType === 'minor') { parts[1]++; parts[2] = 0; }
    else if (bumpType === 'patch') { parts[2]++; }
    else { console.error('Invalid bump type: ' + bumpType + ' (use patch, minor, or major)'); process.exit(1); }
    version = parts.join('.');
    manifest.version = version;
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    // Also update YTKIT_VERSION in ytkit.js
    const ytkitSrc = fs.readFileSync(YTKIT_JS, 'utf8');
    const updated = ytkitSrc.replace(/const YTKIT_VERSION = '[^']+';/, "const YTKIT_VERSION = '" + version + "';");
    if (updated !== ytkitSrc) {
        fs.writeFileSync(YTKIT_JS, updated, 'utf8');
        console.log('Updated YTKIT_VERSION in ytkit.js');
    }

    // Update userscript version header
    if (fs.existsSync(USERSCRIPT)) {
        let usSrc = fs.readFileSync(USERSCRIPT, 'utf8');
        usSrc = usSrc.replace(/^(\/\/ @name\s+)YTKit v[\d.]+/m, '$1YTKit v' + version);
        usSrc = usSrc.replace(/^(\/\/ @version\s+)[\d.]+/m, '$1' + version);
        usSrc = usSrc.replace(/const YTKIT_VERSION = '[^']+';/, "const YTKIT_VERSION = '" + version + "';");
        fs.writeFileSync(USERSCRIPT, usSrc, 'utf8');
        console.log('Updated userscript version');
    }

    console.log('Bumped version to ' + version);
}

// Clean and create build dir
if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

// Copy extension files (exclude .map files and .git)
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else if (!entry.name.endsWith('.map')) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function createZip(sourceDir, zipPath) {
    if (process.platform === 'win32') {
        execSync(
            'powershell -NoProfile -Command "Compress-Archive -Path \'' + sourceDir + '\\*\' -DestinationPath \'' + zipPath + '\' -Force"',
            { stdio: 'inherit' }
        );
    } else {
        execSync('cd "' + sourceDir + '" && zip -r "' + zipPath + '" .', { stdio: 'inherit' });
    }
    const size = fs.statSync(zipPath).size;
    return (size / 1024).toFixed(1);
}

// ── Chrome Build ──
const chromeStageDir = path.join(BUILD_DIR, 'chrome-stage');
copyDir(EXT_DIR, chromeStageDir);

const chromeZipName = 'ytkit-chrome-v' + version + '.zip';
const chromeZipPath = path.join(BUILD_DIR, chromeZipName);

try {
    const size = createZip(chromeStageDir, chromeZipPath);
    console.log('Chrome:  build/' + chromeZipName + ' (' + size + ' KB)');
} catch (e) {
    console.error('Chrome ZIP failed:', e.message);
    process.exit(1);
}

// ── Firefox Build ──
const firefoxStageDir = path.join(BUILD_DIR, 'firefox-stage');
copyDir(EXT_DIR, firefoxStageDir);

// Modify manifest for Firefox
const ffManifestPath = path.join(firefoxStageDir, 'manifest.json');
const ffManifest = JSON.parse(fs.readFileSync(ffManifestPath, 'utf8'));

// Add Firefox-specific settings
ffManifest.browser_specific_settings = {
    gecko: {
        id: 'ytkit@sysadmindoc.github.io',
        strict_min_version: '128.0'
    }
};

// Firefox MV3: use background.scripts instead of service_worker for compat
if (ffManifest.background && ffManifest.background.service_worker) {
    const worker = ffManifest.background.service_worker;
    ffManifest.background = { scripts: [worker] };
}

fs.writeFileSync(ffManifestPath, JSON.stringify(ffManifest, null, 2) + '\n', 'utf8');

const firefoxZipName = 'ytkit-firefox-v' + version + '.zip';
const firefoxZipPath = path.join(BUILD_DIR, firefoxZipName);

try {
    const size = createZip(firefoxStageDir, firefoxZipPath);
    console.log('Firefox: build/' + firefoxZipName + ' (' + size + ' KB)');
} catch (e) {
    console.error('Firefox ZIP failed:', e.message);
    process.exit(1);
}

// ── Userscript Copy ──
if (fs.existsSync(USERSCRIPT)) {
    const usDestName = 'ytkit-v' + version + '.user.js';
    fs.copyFileSync(USERSCRIPT, path.join(BUILD_DIR, usDestName));
    const usSize = (fs.statSync(USERSCRIPT).size / 1024).toFixed(1);
    console.log('Script:  build/' + usDestName + ' (' + usSize + ' KB)');
}

// Cleanup staging dirs
fs.rmSync(chromeStageDir, { recursive: true });
fs.rmSync(firefoxStageDir, { recursive: true });

console.log('\nAll artifacts built for v' + version);
