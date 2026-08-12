#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseSha256Sums } = require('./generate-release-readiness');

const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_STATE_PATH = path.join(REPO_ROOT, 'release-channels.json');
const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'build', 'release-manifest.json');
const DEFAULT_HEALTH_PATH = path.join(REPO_ROOT, 'build', 'release-health.json');
const RELEASE_BASE_URL = 'https://github.com/SysAdminDoc/Astra-Deck/releases/download';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const REMOTE_TIMEOUT_MS = 15000;

const CHANNEL_TEMPLATES = Object.freeze({
    'store-safe-chrome': 'astra-deck-store-safe-chrome-v{version}.zip',
    'store-safe-firefox': 'astra-deck-store-safe-firefox-v{version}.xpi',
    'github-full-chrome': 'astra-deck-github-full-chrome-v{version}.zip',
    'github-full-firefox': 'astra-deck-github-full-firefox-v{version}.xpi',
    userscript: 'ytkit-v{version}.user.js'
});

const CHANNEL_IDS = Object.freeze(Object.keys(CHANNEL_TEMPLATES));

function fillArtifactTemplate(template, version) {
    return String(template).replace('{version}', version);
}

function releaseUrl(ref, baseUrl = RELEASE_BASE_URL) {
    return `${baseUrl}/${ref.tag}/${ref.artifact}`;
}

function buildReleaseRef(version, artifactTemplate, extra = {}) {
    const tag = `v${version}`;
    const artifact = fillArtifactTemplate(artifactTemplate, version);
    return {
        version,
        tag,
        artifact,
        url: extra.url || releaseUrl({ tag, artifact }),
        ...(extra.sha256 ? { sha256: String(extra.sha256).toLowerCase() } : {}),
        ...(Number.isFinite(extra.size) ? { size: Number(extra.size) } : {})
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readChannelState(filePath = DEFAULT_STATE_PATH) {
    const state = readJson(filePath);
    validateChannelState(state);
    return state;
}

function validateReleaseRef(ref, label, artifactTemplate) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
        throw new Error(`${label} must be an object`);
    }
    if (!VERSION_PATTERN.test(String(ref.version || ''))) {
        throw new Error(`${label}.version is invalid`);
    }
    if (ref.tag !== `v${ref.version}`) {
        throw new Error(`${label}.tag must be v${ref.version}`);
    }
    const expectedArtifact = fillArtifactTemplate(artifactTemplate, ref.version);
    if (ref.artifact !== expectedArtifact) {
        throw new Error(`${label}.artifact must be ${expectedArtifact}`);
    }
    if (typeof ref.url !== 'string' || !/^https:\/\//i.test(ref.url)) {
        throw new Error(`${label}.url must be an HTTPS URL`);
    }
    if (ref.sha256 != null && !DIGEST_PATTERN.test(String(ref.sha256))) {
        throw new Error(`${label}.sha256 must be a 64-character hex digest`);
    }
    if (ref.size != null && (!Number.isSafeInteger(ref.size) || ref.size < 0)) {
        throw new Error(`${label}.size must be a non-negative integer`);
    }
}

function validateChannelState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        throw new Error('release channel state must be an object');
    }
    if (state.schemaVersion !== 1 || state.product !== 'Astra Deck') {
        throw new Error('release channel state schema is unsupported');
    }
    if (!state.channels || typeof state.channels !== 'object' || Array.isArray(state.channels)) {
        throw new Error('release channel state must contain a channels object');
    }
    const actualIds = Object.keys(state.channels).sort();
    const expectedIds = [...CHANNEL_IDS].sort();
    if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
        throw new Error(`release channel set must be exactly: ${expectedIds.join(', ')}`);
    }
    for (const id of CHANNEL_IDS) {
        const channel = state.channels[id];
        const template = CHANNEL_TEMPLATES[id];
        if (!channel || channel.artifactTemplate !== template) {
            throw new Error(`${id}.artifactTemplate is not the closed channel template`);
        }
        validateReleaseRef(channel.active, `${id}.active`, template);
        validateReleaseRef(channel.lastKnownGood, `${id}.lastKnownGood`, template);
        validateReleaseRef(channel.rollbackTarget, `${id}.rollbackTarget`, template);
    }
    return state;
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readReleaseManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
    const manifest = readJson(manifestPath);
    if (!manifest || !Array.isArray(manifest.assets)) {
        throw new Error('release manifest must contain an assets array');
    }
    return manifest;
}

async function fetchRemote(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || REMOTE_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'Astra-Deck-release-channel-check' }
        });
        return response;
    } finally {
        clearTimeout(timer);
    }
}

function checksumUrl(tag, baseUrl = RELEASE_BASE_URL) {
    return `${baseUrl}/${tag}/SHA256SUMS`;
}

async function validateRemoteChannelRefs(state, options = {}) {
    const baseUrl = options.baseUrl || RELEASE_BASE_URL;
    if (options.baseUrl) {
        // Tests may provide a local HTTP fixture. Validate its ref shape
        // against the production URL form, while the fetches use baseUrl.
        const schemaState = JSON.parse(JSON.stringify(state));
        for (const id of CHANNEL_IDS) {
            const channel = schemaState.channels[id];
            for (const key of ['active', 'lastKnownGood', 'rollbackTarget']) {
                channel[key].url = releaseUrl(channel[key]);
            }
        }
        validateChannelState(schemaState);
    } else {
        validateChannelState(state);
    }
    const refs = [];
    for (const id of CHANNEL_IDS) {
        const channel = state.channels[id];
        refs.push(
            { label: `${id}.active`, ref: channel.active },
            { label: `${id}.lastKnownGood`, ref: channel.lastKnownGood },
            { label: `${id}.rollbackTarget`, ref: channel.rollbackTarget }
        );
    }

    const checksumCache = new Map();
    const checked = [];
    const unique = new Map();
    for (const item of refs) unique.set(`${item.ref.tag}/${item.ref.artifact}`, item);

    for (const item of unique.values()) {
        const { ref } = item;
        const expectedUrl = releaseUrl(ref, baseUrl);
        if (ref.url !== expectedUrl) {
            throw new Error(`${item.label}.url must point at its recorded GitHub release artifact`);
        }
        const artifactResponse = await fetchRemote(ref.url, options);
        if (!artifactResponse.ok) {
            throw new Error(`${item.label} artifact is unavailable: HTTP ${artifactResponse.status}`);
        }

        let checksums = checksumCache.get(ref.tag);
        if (!checksums) {
            const checksumResponse = await fetchRemote(checksumUrl(ref.tag, baseUrl), options);
            if (!checksumResponse.ok) {
                throw new Error(`${item.label} release SHA256SUMS is unavailable: HTTP ${checksumResponse.status}`);
            }
            checksums = parseSha256Sums(await checksumResponse.text());
            checksumCache.set(ref.tag, checksums);
        }
        const remoteDigest = checksums.get(ref.artifact);
        if (!remoteDigest) {
            throw new Error(`${item.label} is missing from ${ref.tag}/SHA256SUMS`);
        }
        if (ref.sha256 && String(ref.sha256).toLowerCase() !== remoteDigest.toLowerCase()) {
            throw new Error(`${item.label}.sha256 disagrees with ${ref.tag}/SHA256SUMS`);
        }
        checked.push({ artifact: ref.artifact, tag: ref.tag, sha256: remoteDigest });
    }
    return { status: 'pass', checked };
}

function assertHealthAllowsPromotion(health, manifestPath = DEFAULT_MANIFEST_PATH) {
    if (!health || typeof health !== 'object' || Array.isArray(health)) {
        throw new Error('release health report is missing or malformed');
    }
    const manifestDigest = sha256(manifestPath);
    const manifest = readReleaseManifest(manifestPath);
    if (health.status !== 'pass' || health.promotionEligible !== true) {
        throw new Error(`release health is ${String(health.status || 'unknown')}; promotion is refused`);
    }
    if (health.version !== manifest.version) {
        throw new Error('release health version does not match the current release manifest; rerun release:health');
    }
    if (health.manifestSha256 !== manifestDigest) {
        throw new Error('release health does not describe the current release manifest; rerun release:health');
    }
    const required = new Set(['artifact-readiness', 'selector-asset', 'startup-budget', 'smoke-fixture']);
    const checks = Array.isArray(health.checks) ? health.checks : [];
    const missing = [...required].filter((id) => !checks.some((check) => check.id === id));
    const failed = checks.filter((check) => required.has(check.id) && check.status !== 'pass');
    if (missing.length || failed.length) {
        throw new Error(
            `release health is incomplete: ${[
                missing.length ? `missing ${missing.join(', ')}` : '',
                failed.length ? `failed ${failed.map((check) => check.id).join(', ')}` : ''
            ].filter(Boolean).join('; ')}`
        );
    }
}

function assertCandidateAssets(manifest, buildDir, version, channelIds) {
    const assets = new Map(manifest.assets.map((asset) => [asset.name, asset]));
    const candidates = {};
    for (const id of channelIds) {
        const artifact = fillArtifactTemplate(CHANNEL_TEMPLATES[id], version);
        const asset = assets.get(artifact);
        if (!asset) throw new Error(`${id} candidate asset is missing from release-manifest.json: ${artifact}`);
        const filePath = path.join(buildDir, artifact);
        if (!fs.existsSync(filePath)) throw new Error(`${id} candidate artifact is missing from build/: ${artifact}`);
        const actualDigest = sha256(filePath);
        if (asset.sha256 !== actualDigest) throw new Error(`${id} candidate digest disagrees with release-manifest.json`);
        if (Number(asset.size) !== fs.statSync(filePath).size) throw new Error(`${id} candidate size disagrees with release-manifest.json`);
        candidates[id] = buildReleaseRef(version, CHANNEL_TEMPLATES[id], {
            sha256: actualDigest,
            size: fs.statSync(filePath).size
        });
    }
    return candidates;
}

function promoteChannels(state, manifest, options = {}) {
    validateChannelState(state);
    const version = String(options.version || manifest.version || '');
    if (!VERSION_PATTERN.test(version)) throw new Error('promotion version is invalid');
    if (manifest.version !== version) throw new Error('promotion version does not match release manifest');
    const channelIds = options.channelIds || CHANNEL_IDS;
    for (const id of channelIds) {
        if (!CHANNEL_TEMPLATES[id]) throw new Error(`unknown release channel: ${id}`);
    }
    const buildDir = options.buildDir || path.join(path.dirname(options.manifestPath || DEFAULT_MANIFEST_PATH));
    const candidates = assertCandidateAssets(manifest, buildDir, version, channelIds);
    const next = JSON.parse(JSON.stringify(state));
    for (const id of channelIds) {
        const channel = next.channels[id];
        const previous = channel.lastKnownGood || channel.active;
        channel.active = candidates[id];
        channel.lastKnownGood = candidates[id];
        channel.rollbackTarget = previous;
        channel.updatedAt = options.now || new Date().toISOString();
    }
    next.lastAction = {
        type: 'promote',
        version,
        channels: [...channelIds],
        at: options.now || new Date().toISOString()
    };
    validateChannelState(next);
    return next;
}

function rollbackChannels(state, options = {}) {
    validateChannelState(state);
    const channelIds = options.channelIds || CHANNEL_IDS;
    const next = JSON.parse(JSON.stringify(state));
    for (const id of channelIds) {
        if (!CHANNEL_TEMPLATES[id]) throw new Error(`unknown release channel: ${id}`);
        const channel = next.channels[id];
        if (!channel.rollbackTarget) throw new Error(`${id} has no rollback target`);
        const priorActive = channel.active;
        channel.active = channel.rollbackTarget;
        channel.lastKnownGood = channel.rollbackTarget;
        channel.rollbackTarget = priorActive;
        channel.updatedAt = options.now || new Date().toISOString();
    }
    next.lastAction = {
        type: 'rollback',
        channels: [...channelIds],
        at: options.now || new Date().toISOString(),
        rebuilt: false
    };
    validateChannelState(next);
    return next;
}

function writeJsonAtomic(filePath, value) {
    const absolutePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
        fs.renameSync(tempPath, absolutePath);
    } catch (error) {
        try { fs.rmSync(tempPath, { force: true }); } catch (_) { /* preserve the original failure */ }
        throw error;
    }
}

function parseArgs(argv = process.argv.slice(2)) {
    const command = argv[0] || 'validate';
    if (!['validate', 'promote', 'rollback'].includes(command)) {
        throw new Error(`unknown release-channel command: ${command}`);
    }
    const args = {
        command,
        statePath: DEFAULT_STATE_PATH,
        manifestPath: DEFAULT_MANIFEST_PATH,
        healthPath: DEFAULT_HEALTH_PATH,
        channelIds: []
    };
    for (let index = 1; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--state' || arg === '--manifest' || arg === '--health') {
            const value = argv[++index];
            if (!value) throw new Error(`${arg} requires a path`);
            const key = arg === '--state' ? 'statePath' : arg === '--manifest' ? 'manifestPath' : 'healthPath';
            args[key] = path.resolve(value);
            continue;
        }
        if (arg === '--channel') {
            const id = argv[++index];
            if (!id) throw new Error('--channel requires a channel id');
            args.channelIds.push(id);
            continue;
        }
        throw new Error(`unknown argument: ${arg}`);
    }
    if (!args.channelIds.length) args.channelIds = [...CHANNEL_IDS];
    return args;
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const state = readChannelState(args.statePath);
    if (args.command === 'validate') {
        const remote = await validateRemoteChannelRefs(state);
        console.log(`[release-channels] valid: ${CHANNEL_IDS.length} channel(s), ${remote.checked.length} published artifact pointer(s)`);
        return state;
    }
    if (args.command === 'promote') {
        const manifest = readReleaseManifest(args.manifestPath);
        const health = readJson(args.healthPath);
        assertHealthAllowsPromotion(health, args.manifestPath);
        const next = promoteChannels(state, manifest, {
            buildDir: path.dirname(args.manifestPath),
            manifestPath: args.manifestPath,
            channelIds: args.channelIds
        });
        writeJsonAtomic(args.statePath, next);
        console.log(`[release-channels] promoted ${manifest.version}: ${args.channelIds.join(', ')}`);
        return next;
    }
    const next = rollbackChannels(state, { channelIds: args.channelIds });
    writeJsonAtomic(args.statePath, next);
    console.log(`[release-channels] rolled back without rebuilding: ${args.channelIds.join(', ')}`);
    return next;
}

if (require.main === module) {
    Promise.resolve(main()).catch((error) => {
        console.error('[release-channels] ' + (error.message || error));
        process.exit(1);
    });
}

module.exports = {
    CHANNEL_IDS,
    CHANNEL_TEMPLATES,
    DEFAULT_HEALTH_PATH,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_STATE_PATH,
    assertCandidateAssets,
    assertHealthAllowsPromotion,
    buildReleaseRef,
    fillArtifactTemplate,
    parseArgs,
    promoteChannels,
    readChannelState,
    readReleaseManifest,
    rollbackChannels,
    validateRemoteChannelRefs,
    validateChannelState,
    writeJsonAtomic
};
