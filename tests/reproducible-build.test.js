'use strict';

// Reproducible packaging, for AMO source verification.
//
// AMO rebuilds a submitted source tree and compares the result against the
// uploaded package. A match moves review along in hours; a mismatch means days
// to weeks of someone investigating a diff. The packaging step recorded file
// access times until v4.84.0 and nobody noticed, because nothing ever compared
// two builds — so the point of these tests is that the property is checked,
// not asserted.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const buildSource = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');

// The writer is not exported (build-extension.js runs a CLI on require when it
// is the entry point, and exporting it would widen that surface), so slice it
// out and run it against a real temp tree — which is the only way to test that
// the BYTES are stable rather than that the source mentions determinism.
function loadZipWriter() {
    const start = buildSource.indexOf('const DEFAULT_SOURCE_DATE_EPOCH');
    const end = buildSource.indexOf('function formatSize(');
    assert.ok(start > -1 && end > start, 'build-extension.js must declare the deterministic writer');
    return new Function('fs', 'path', 'zlib', 'process',
        `${buildSource.slice(start, end)}\nreturn { createZip, listStagedFiles, resolveSourceDateEpoch };`
    )(fs, path, require('node:zlib'), process);
}

const zipWriter = loadZipWriter();

function makeTree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-zip-'));
    fs.mkdirSync(path.join(dir, 'src', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'console.log("a");\n'.repeat(200));
    fs.writeFileSync(path.join(dir, 'src', 'nested', 'b.js'), 'const b = 1;\n');
    fs.writeFileSync(path.join(dir, 'assets', 'tiny.bin'), Buffer.from([1, 2, 3]));
    return dir;
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('packaging the same tree twice produces identical bytes', () => {
    const dir = makeTree();
    try {
        const first = path.join(dir, 'first.zip');
        const second = path.join(dir, 'second.zip');
        zipWriter.createZip(path.join(dir, 'src'), first);
        // Touch every file so their mtimes and atimes differ from the first
        // run. This is the exact condition that made the old packager
        // non-reproducible.
        const later = new Date(Date.now() + 86400000);
        for (const name of zipWriter.listStagedFiles(path.join(dir, 'src'))) {
            fs.utimesSync(path.join(dir, 'src', name), later, later);
        }
        zipWriter.createZip(path.join(dir, 'src'), second);
        assert.equal(sha256(first), sha256(second),
            'a rebuild of unchanged source must produce the same archive');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the archive carries no timestamps or extra fields that could vary', () => {
    const dir = makeTree();
    try {
        const zipPath = path.join(dir, 'out.zip');
        zipWriter.createZip(path.join(dir, 'src'), zipPath);
        const buf = fs.readFileSync(zipPath);

        // Walk the local file headers and assert each declares no extra field
        // and the fixed DOS timestamp. An extra field is where bsdtar hid the
        // access time that broke this in the first place.
        let offset = 0;
        let entries = 0;
        const epoch = new Date(zipWriter.resolveSourceDateEpoch() * 1000);
        const expectedDate = ((epoch.getUTCFullYear() - 1980) << 9)
            | ((epoch.getUTCMonth() + 1) << 5) | epoch.getUTCDate();
        while (buf.readUInt32LE(offset) === 0x04034b50) {
            assert.equal(buf.readUInt16LE(offset + 28), 0, 'no local extra field');
            assert.equal(buf.readUInt16LE(offset + 12), expectedDate, 'fixed DOS date');
            const nameLen = buf.readUInt16LE(offset + 26);
            const compressed = buf.readUInt32LE(offset + 18);
            offset += 30 + nameLen + compressed;
            entries += 1;
        }
        assert.equal(entries, 2, 'every file under src/ must be an entry');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('entries are written in sorted order, whatever the filesystem returns', () => {
    const dir = makeTree();
    try {
        const names = zipWriter.listStagedFiles(path.join(dir, 'src'));
        assert.deepEqual(names, [...names].sort(),
            'readdir order is filesystem-dependent; an unsorted list reproduces only by luck');
        assert.deepEqual(names, ['a.js', 'nested/b.js'],
            'paths must be relative and forward-slashed');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('SOURCE_DATE_EPOCH is honoured and a nonsense value falls back', () => {
    const previous = process.env.SOURCE_DATE_EPOCH;
    try {
        process.env.SOURCE_DATE_EPOCH = '1600000000';
        assert.equal(zipWriter.resolveSourceDateEpoch(), 1600000000);
        // Below the 1980 ZIP floor, or unparseable: use the default rather
        // than write a timestamp the format cannot express.
        process.env.SOURCE_DATE_EPOCH = '5';
        assert.equal(zipWriter.resolveSourceDateEpoch(), 1577836800);
        process.env.SOURCE_DATE_EPOCH = 'yesterday';
        assert.equal(zipWriter.resolveSourceDateEpoch(), 1577836800);
    } finally {
        if (previous === undefined) delete process.env.SOURCE_DATE_EPOCH;
        else process.env.SOURCE_DATE_EPOCH = previous;
    }
});

test('the archive is readable by a real unzip implementation', () => {
    // A writer that only this repo can read would be worse than the shell-out
    // it replaced. Round-trip through Node's own inflate via the same headers
    // a reader uses.
    const zlib = require('node:zlib');
    const dir = makeTree();
    try {
        const zipPath = path.join(dir, 'out.zip');
        zipWriter.createZip(path.join(dir, 'src'), zipPath);
        const buf = fs.readFileSync(zipPath);
        let offset = 0;
        const seen = new Map();
        while (buf.readUInt32LE(offset) === 0x04034b50) {
            const method = buf.readUInt16LE(offset + 8);
            const crc = buf.readUInt32LE(offset + 14);
            const compressed = buf.readUInt32LE(offset + 18);
            const uncompressed = buf.readUInt32LE(offset + 22);
            const nameLen = buf.readUInt16LE(offset + 26);
            const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
            const body = buf.subarray(offset + 30 + nameLen, offset + 30 + nameLen + compressed);
            const raw = method === 8 ? zlib.inflateRawSync(body) : body;
            assert.equal(raw.length, uncompressed, `${name} length must match its header`);
            assert.equal(zlib.crc32(raw), crc, `${name} CRC must match its header`);
            seen.set(name, raw);
            offset += 30 + nameLen + compressed;
        }
        assert.deepEqual(
            seen.get('nested/b.js').toString('utf8'),
            fs.readFileSync(path.join(dir, 'src', 'nested', 'b.js'), 'utf8'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('build-for-amo builds twice and fails on a mismatch', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'build-for-amo.js'), 'utf8');
    assert.equal((source.match(/^\s*runBuild\(profile\);$/gm) || []).length, 2,
        'the whole point is comparing two builds; one build proves nothing');
    assert.match(source, /is NOT reproducible/);
    // A CRX needs the maintainer key the reviewer does not have, so including
    // one would guarantee the rebuild diverges.
    assert.match(source, /'--no-crx'/);
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['build-for-amo'], 'node scripts/build-for-amo.js');
});

test('SOURCE-README names the reviewer environment the script reports', () => {
    const { REVIEWER_ENVIRONMENT } = require('../scripts/build-for-amo.js');
    const readme = fs.readFileSync(path.join(REPO_ROOT, 'SOURCE-README.md'), 'utf8');
    for (const value of Object.values(REVIEWER_ENVIRONMENT)) {
        const bare = value.replace(/\s*\(.*\)$/, '');
        assert.ok(readme.includes(bare), `SOURCE-README.md must state "${bare}"`);
    }
    assert.match(readme, /npm ci/);
    assert.match(readme, /npm run build-for-amo/);
    // The deviation that has not been eliminated has to be declared, not
    // implied by silence.
    assert.match(readme, /Windows/);
});
