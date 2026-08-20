'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
    CHANNEL_IDS,
    CHANNEL_TEMPLATES,
    buildReleaseRef,
    fillArtifactTemplate,
    promoteChannels,
    readChannelState,
    rollbackChannels,
    validateRemoteChannelRefs,
    validateChannelState
} = require('../scripts/release-channels');
const {
    assertHealthAllowsPromotion
} = require('../scripts/release-channels');
const { buildHealthReport, sha256 } = require('../scripts/release-health');

function digest(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function fixtureBuild(version = '1.2.3') {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-release-channels-'));
    const buildDir = path.join(tempRoot, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    const assets = [];
    for (const id of CHANNEL_IDS) {
        const name = fillArtifactTemplate(CHANNEL_TEMPLATES[id], version);
        const content = `candidate ${id} ${version}\n`;
        fs.writeFileSync(path.join(buildDir, name), content, 'utf8');
        assets.push({
            name,
            size: Buffer.byteLength(content),
            sha256: digest(content)
        });
    }
    const manifest = { schemaVersion: 1, product: 'Astra Deck', version, assets };
    const manifestPath = path.join(buildDir, 'release-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return { buildDir, manifest, manifestPath };
}

// Promotion and rollback are about the RELATIONSHIP between the three
// pointers, not about whichever versions happen to be live. These two tests
// used to seed themselves from the real release-channels.json and assert
// hardcoded version strings, so shipping a release broke them — which is
// backwards, since shipping a release is the thing they exist to protect.
const PRIOR = '4.0.0';      // the rollback target before anything happens
const BASE = '4.1.0';       // what the channels are serving
const CANDIDATE = '1.2.3';  // matches fixtureBuild()'s default

function fixtureChannelState() {
    const channels = {};
    for (const id of CHANNEL_IDS) {
        const template = CHANNEL_TEMPLATES[id];
        channels[id] = {
            artifactTemplate: template,
            active: buildReleaseRef(BASE, template, { sha256: digest(`base ${id}`), size: 1 }),
            lastKnownGood: buildReleaseRef(BASE, template, { sha256: digest(`base ${id}`), size: 1 }),
            rollbackTarget: buildReleaseRef(PRIOR, template),
            updatedAt: '2026-08-11T11:00:00.000Z'
        };
    }
    const state = { schemaVersion: 1, product: 'Astra Deck', channels };
    // Fail loudly here rather than deep inside promote if the shape drifts.
    validateChannelState(state);
    return state;
}

function passingHealth(manifestPath) {
    return {
        status: 'pass',
        promotionEligible: true,
        version: '1.2.3',
        manifestSha256: sha256(manifestPath),
        checks: [
            { id: 'artifact-readiness', status: 'pass' },
            { id: 'selector-asset', status: 'pass' },
            { id: 'startup-budget', status: 'pass' },
            { id: 'smoke-fixture', status: 'pass' }
        ]
    };
}

test('checked-in release channel ledger covers every channel with LKG and rollback references', () => {
    const state = readChannelState(path.join(root, 'release-channels.json'));

    assert.deepEqual(Object.keys(state.channels).sort(), [...CHANNEL_IDS].sort());
    for (const id of CHANNEL_IDS) {
        const channel = state.channels[id];
        assert.equal(channel.lastKnownGood.artifact, fillArtifactTemplate(CHANNEL_TEMPLATES[id], channel.lastKnownGood.version));
        assert.equal(channel.rollbackTarget.artifact, fillArtifactTemplate(CHANNEL_TEMPLATES[id], channel.rollbackTarget.version));
        assert.match(channel.lastKnownGood.url, /^https:\/\//);
        assert.match(channel.rollbackTarget.url, /^https:\/\//);
    }
});

test('release channel validation dereferences assets and checks SHA256SUMS', async () => {
    const state = readChannelState(path.join(root, 'release-channels.json'));
    const remoteDigests = new Map();
    for (const id of CHANNEL_IDS) {
        const channel = state.channels[id];
        for (const key of ['active', 'lastKnownGood', 'rollbackTarget']) {
            const ref = channel[key];
            const keyName = `${ref.tag}/${ref.artifact}`;
            const value = digest(`published ${keyName}`);
            ref.sha256 = value;
            remoteDigests.set(keyName, value);
        }
    }

    const server = http.createServer((request, response) => {
        const relative = String(request.url || '').replace(/^\/releases\/download\//, '');
        const separator = relative.indexOf('/');
        const tag = separator >= 0 ? relative.slice(0, separator) : '';
        const artifact = separator >= 0 ? relative.slice(separator + 1) : '';
        if (artifact === 'SHA256SUMS') {
            const lines = [...remoteDigests.entries()]
                .filter(([keyName]) => keyName.startsWith(`${tag}/`))
                .map(([keyName, value]) => `${value}  ${keyName.slice(tag.length + 1)}`);
            response.statusCode = lines.length ? 200 : 404;
            response.end(lines.join('\n') + (lines.length ? '\n' : ''));
            return;
        }
        response.statusCode = remoteDigests.has(`${tag}/${artifact}`) ? 200 : 404;
        response.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/releases/download`;
    try {
        for (const id of CHANNEL_IDS) {
            const channel = state.channels[id];
            for (const key of ['active', 'lastKnownGood', 'rollbackTarget']) {
                const ref = channel[key];
                ref.url = `${baseUrl}/${ref.tag}/${ref.artifact}`;
            }
        }
        await assert.doesNotReject(() => validateRemoteChannelRefs(state, { baseUrl }));

        const brokenKey = `${state.channels.userscript.active.tag}/${state.channels.userscript.active.artifact}`;
        remoteDigests.delete(brokenKey);
        await assert.rejects(
            () => validateRemoteChannelRefs(state, { baseUrl }),
            /HTTP 404/
        );
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});

test('promotion requires a passing health report tied to the exact manifest', () => {
    const fixture = fixtureBuild();
    const manifestText = fs.readFileSync(fixture.manifestPath, 'utf8');
    const health = passingHealth(fixture.manifestPath);
    assert.doesNotThrow(() => assertHealthAllowsPromotion(health, fixture.manifestPath));

    const failed = { ...health, status: 'fail', promotionEligible: false };
    assert.throws(() => assertHealthAllowsPromotion(failed, fixture.manifestPath), /promotion is refused/);

    const stale = { ...health, manifestSha256: digest(manifestText + 'stale') };
    assert.throws(() => assertHealthAllowsPromotion(stale, fixture.manifestPath), /current release manifest/);
});

test('promotion records the candidate digest and makes the previous LKG the rollback target', () => {
    const state = fixtureChannelState();
    const fixture = fixtureBuild(CANDIDATE);
    const next = promoteChannels(state, fixture.manifest, {
        buildDir: fixture.buildDir,
        manifestPath: fixture.manifestPath,
        channelIds: ['userscript', 'store-safe-chrome'],
        now: '2026-08-11T12:00:00.000Z'
    });

    assert.equal(next.channels.userscript.active.version, CANDIDATE);
    assert.equal(next.channels.userscript.lastKnownGood.version, CANDIDATE);
    // The build being replaced becomes the way back, so a bad promotion is
    // undoable without a rebuild.
    assert.equal(next.channels.userscript.rollbackTarget.version, BASE);
    assert.match(next.channels.userscript.active.sha256, /^[a-f0-9]{64}$/);
    assert.equal(next.channels['store-safe-firefox'].active.version, BASE,
        'an unselected channel must not be promoted');
    assert.equal(next.lastAction.type, 'promote');
});

test('rollback swaps pointers to an existing artifact and explicitly records no rebuild', () => {
    const state = fixtureChannelState();
    const next = rollbackChannels(state, {
        channelIds: ['userscript'],
        now: '2026-08-11T12:01:00.000Z'
    });

    assert.equal(next.channels.userscript.active.version, PRIOR);
    assert.equal(next.channels.userscript.lastKnownGood.version, PRIOR);
    // Straight swap: what was being served becomes the way back.
    assert.equal(next.channels.userscript.rollbackTarget.version, BASE);
    assert.equal(next.lastAction.rebuilt, false);
    assert.equal(next.channels['store-safe-chrome'].active.version, BASE,
        'an unselected channel must not be rolled back');
});

test('release health combines readiness, selector, startup, and no-screenshot smoke results', () => {
    const fixture = fixtureBuild();
    const report = buildHealthReport({
        repoRoot: root,
        buildDir: fixture.buildDir,
        now: new Date('2026-08-11T12:00:00.000Z'),
        readinessReport: {
            schemaVersion: 1,
            product: 'Astra Deck',
            version: '1.2.3',
            status: 'pass',
            checks: [{ id: 'checksum-coverage', status: 'pass' }]
        },
        selectorCheck: () => ({ status: 'pass', details: 'fixture selector pack' }),
        startupCheck: () => ({ status: 'pass', details: 'startup budget fixture' }),
        smokeCheck: () => ({ status: 'pass', details: 'DOM fixture passed without screenshots' })
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.promotionEligible, true);
    assert.equal(report.version, '1.2.3');
    assert.equal(report.checks.map((check) => check.id).join(','),
        'artifact-readiness,selector-asset,startup-budget,smoke-fixture');
});

test('release health is not promotable when the startup budget fails', () => {
    const fixture = fixtureBuild();
    const report = buildHealthReport({
        repoRoot: root,
        buildDir: fixture.buildDir,
        readinessReport: { status: 'pass', checks: [] },
        selectorCheck: () => true,
        startupCheck: () => ({ status: 'fail', details: 'startup regression' }),
        smokeCheck: () => true
    });

    assert.equal(report.status, 'fail');
    assert.equal(report.promotionEligible, false);
    assert.equal(report.checks.find((check) => check.id === 'startup-budget').status, 'fail');
});

test('health-only overlay smoke mode is headless and does not capture screenshots', () => {
    const smoke = require('../scripts/smoke-settings-overlay');
    const parsed = smoke.parseArgs(['--health-only']);
    assert.equal(parsed.healthOnly, true);
    const source = fs.readFileSync(path.join(root, 'scripts', 'smoke-settings-overlay.js'), 'utf8');
    assert.match(source, /if \(!opts\.healthOnly\) \{[\s\S]*Page\.captureScreenshot/);
    assert.match(source, /windowsHide: !opts\.headedPrivate/);
});

test('channel state validation rejects a missing rollback target', () => {
    const state = readChannelState(path.join(root, 'release-channels.json'));
    delete state.channels.userscript.rollbackTarget;
    assert.throws(() => validateChannelState(state), /rollbackTarget/);
    assert.equal(typeof buildReleaseRef, 'function');
});
