#!/usr/bin/env node
// build-extension.js -- Packages extension/ into a ZIP for Chrome Web Store
// Usage: node build-extension.js [--bump patch|minor|major]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXT_DIR = path.join(__dirname, 'extension');
const BUILD_DIR = path.join(__dirname, 'build');
const MANIFEST = path.join(EXT_DIR, 'manifest.json');
const YTKIT_JS = path.join(EXT_DIR, 'ytkit.js');

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

const stageDir = path.join(BUILD_DIR, 'extension');
copyDir(EXT_DIR, stageDir);

// Create ZIP
const zipName = 'ytkit-v' + version + '.zip';
const zipPath = path.join(BUILD_DIR, zipName);

try {
    if (process.platform === 'win32') {
        execSync(
            'powershell -NoProfile -Command "Compress-Archive -Path \'' + stageDir + '\\*\' -DestinationPath \'' + zipPath + '\' -Force"',
            { stdio: 'inherit' }
        );
    } else {
        execSync('cd "' + stageDir + '" && zip -r "' + zipPath + '" .', { stdio: 'inherit' });
    }
    const size = fs.statSync(zipPath).size;
    console.log('Created: build/' + zipName + ' (' + (size / 1024).toFixed(1) + ' KB)');
} catch (e) {
    console.error('ZIP creation failed:', e.message);
    process.exit(1);
}
