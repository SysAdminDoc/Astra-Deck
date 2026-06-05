#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const DEFAULT_SOURCE = path.join(REPO_ROOT, 'AstraDownloader.exe');
const DEST = path.join(BUILD_DIR, 'AstraDownloader.exe');
const MIN_BYTES = 1024;

function openCompanionExe(filePath) {
    try {
        return fs.openSync(filePath, 'r');
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            throw new Error(`missing companion EXE: ${filePath}`);
        }
        throw err;
    }
}

function readValidatedCompanionExe(filePath) {
    const fd = openCompanionExe(filePath);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) {
            throw new Error(`companion path is not a file: ${filePath}`);
        }
        if (stat.size < MIN_BYTES) {
            throw new Error(`companion EXE is too small (${stat.size} bytes): ${filePath}`);
        }
        const header = Buffer.alloc(2);
        fs.readSync(fd, header, 0, 2, 0);
        if (header.toString('ascii') !== 'MZ') {
            throw new Error(`companion EXE does not have an MZ header: ${filePath}`);
        }

        const data = Buffer.alloc(stat.size);
        let offset = 0;
        while (offset < data.length) {
            const bytesRead = fs.readSync(fd, data, offset, data.length - offset, offset);
            if (bytesRead === 0) break;
            offset += bytesRead;
        }
        if (offset !== data.length) {
            throw new Error(`companion EXE changed while reading: ${filePath}`);
        }
        return data;
    } finally {
        fs.closeSync(fd);
    }
}

function validateCompanionExe(filePath) {
    readValidatedCompanionExe(filePath);
}

function assertBuildDirExists() {
    let stat;
    try {
        stat = fs.statSync(BUILD_DIR);
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            throw new Error('build/ does not exist. Run `npm run build:userscript` before staging the companion EXE.');
        }
        throw err;
    }
    if (!stat.isDirectory()) {
        throw new Error('build/ exists but is not a directory.');
    }
}

function stageCompanionRelease(sourcePath = DEFAULT_SOURCE) {
    const resolvedSource = path.resolve(sourcePath);
    assertBuildDirExists();
    const companionExe = readValidatedCompanionExe(resolvedSource);
    fs.writeFileSync(DEST, companionExe);
    console.log(`Staged companion EXE: build/AstraDownloader.exe (${companionExe.length} bytes)`);
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
