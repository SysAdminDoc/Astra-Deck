#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const DEFAULT_SOURCE = path.join(REPO_ROOT, 'AstraDownloader.exe');
const DEST = path.join(BUILD_DIR, 'AstraDownloader.exe');
const MIN_BYTES = 1024;

function validateCompanionExe(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`missing companion EXE: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
        throw new Error(`companion path is not a file: ${filePath}`);
    }
    if (stat.size < MIN_BYTES) {
        throw new Error(`companion EXE is too small (${stat.size} bytes): ${filePath}`);
    }
    const fd = fs.openSync(filePath, 'r');
    try {
        const header = Buffer.alloc(2);
        fs.readSync(fd, header, 0, 2, 0);
        if (header.toString('ascii') !== 'MZ') {
            throw new Error(`companion EXE does not have an MZ header: ${filePath}`);
        }
    } finally {
        fs.closeSync(fd);
    }
}

function stageCompanionRelease(sourcePath = DEFAULT_SOURCE) {
    const resolvedSource = path.resolve(sourcePath);
    if (!fs.existsSync(BUILD_DIR)) {
        throw new Error('build/ does not exist. Run `npm run build:userscript` before staging the companion EXE.');
    }
    validateCompanionExe(resolvedSource);
    fs.copyFileSync(resolvedSource, DEST);
    console.log(`Staged companion EXE: build/AstraDownloader.exe (${fs.statSync(DEST).size} bytes)`);
    console.log('Run `npm run release:manifest -- --require-companion` to emit the SHA-256 sidecar and include both assets.');
}

if (require.main === module) {
    try {
        stageCompanionRelease(process.argv[2] || DEFAULT_SOURCE);
    } catch (err) {
        console.error('[stage-companion-release] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    stageCompanionRelease,
    validateCompanionExe
};
