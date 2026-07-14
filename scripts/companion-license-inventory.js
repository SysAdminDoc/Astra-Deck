#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COMPANION_BUILD_METADATA_NAME = 'companion-build-metadata.json';
const COMPANION_EXE_NAME = 'AstraDownloader.exe';
const POLICY_RELATIVE_PATH = path.join('astra_downloader', 'license-policy.json');
const REQUIRED_COMPONENT_KEYS = Object.freeze([
    'python',
    'pyinstaller',
    'pyqt6',
    'pyqt6-qt6',
    'yt-dlp',
    'ffmpeg',
    'deno'
]);

const PROPERTY = Object.freeze({
    artifactName: 'astra:companion:artifact-name',
    artifactSha256: 'astra:companion:artifact-sha256',
    checksumUrl: 'astra:companion:checksum-url',
    componentKey: 'astra:companion:component-key',
    decision: 'astra:license:decision',
    delivery: 'astra:companion:delivery',
    distributionUrl: 'astra:companion:distribution-url',
    downloadSha256: 'astra:companion:download-sha256',
    evidence: 'astra:license:approval-evidence',
    inventory: 'astra:companion:inventory',
    noticeUrl: 'astra:license:notice-url',
    obligations: 'astra:license:obligations',
    recordSha256: 'astra:companion:record-sha256',
    resolutionGraph: 'astra:companion:resolution-graph',
    constraintsSha256: 'astra:companion:constraints-sha256',
    resolution: 'astra:license:resolution',
    sourceUrl: 'astra:license:source-url'
});

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function canonicalName(value) {
    return String(value || '').trim().toLowerCase().replace(/[_.]+/g, '-');
}

function purlName(value) {
    return encodeURIComponent(canonicalName(value));
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateResolutionMetadata(metadata, repoRoot = null) {
    const resolution = metadata && metadata.resolution;
    if (
        !metadata || metadata.schemaVersion !== 2
        || !resolution || resolution.schemaVersion !== 1
        || resolution.constraintsPath !== 'astra_downloader/constraints-release.txt'
        || !/^[0-9a-f]{64}$/i.test(String(resolution.constraintsSha256 || ''))
        || !Array.isArray(resolution.supportedPythonMinors)
        || resolution.supportedPythonMinors.join(',') !== '3.11,3.12'
        || !Array.isArray(resolution.packages) || !resolution.packages.length
    ) {
        throw new Error('companion build metadata is missing the reviewed release resolution graph');
    }
    const keys = new Set();
    for (const record of resolution.packages) {
        const key = canonicalName(record && record.name);
        if (
            !key || keys.has(key)
            || !record.version || !/^[A-Za-z0-9_.+!-]+$/.test(String(record.version))
            || !['embedded', 'build', 'validation'].includes(record.scope)
            || !Array.isArray(record.dependsOn)
        ) {
            throw new Error(`invalid or duplicate resolved Python package: ${key || 'unknown'}`);
        }
        keys.add(key);
    }
    for (const record of resolution.packages) {
        for (const dependency of record.dependsOn) {
            if (!keys.has(canonicalName(dependency))) {
                throw new Error(`${record.name} depends on unresolved Python package ${dependency}`);
            }
        }
    }
    if (repoRoot) {
        const constraintsPath = path.join(repoRoot, resolution.constraintsPath);
        if (!fs.existsSync(constraintsPath) || sha256(constraintsPath) !== resolution.constraintsSha256) {
            throw new Error('companion build metadata constraints digest does not match the reviewed release graph');
        }
    }
    return resolution;
}

function property(name, value) {
    return { name, value: String(value ?? '') };
}

function propertyValue(component, name) {
    const item = (component.properties || []).find((entry) => entry.name === name);
    return item ? String(item.value) : '';
}

function normalizeLicenseExpression(raw) {
    const value = String(raw || '').trim();
    const aliases = new Map([
        ['apache 2.0', 'Apache-2.0'],
        ['bsd', 'BSD-3-Clause'],
        ['bsd 2-clause', 'BSD-2-Clause'],
        ['bsd-2-clause', 'BSD-2-Clause'],
        ['bsd-3-clause', 'BSD-3-Clause'],
        ['gpl-3.0', 'GPL-3.0-only'],
        ['gplv3', 'GPL-3.0-only'],
        ['isc', 'ISC'],
        ['lgpl v3', 'LGPL-3.0-only'],
        ['mit', 'MIT'],
        ['python-2.0', 'Python-2.0'],
        ['the unlicense', 'Unlicense'],
        ['unlicense', 'Unlicense'],
        ['zpl 2.1', 'ZPL-2.1']
    ]);
    if (aliases.has(value.toLowerCase())) return aliases.get(value.toLowerCase());
    if (/^(?:LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.-]+)(?:\s+(?:AND|OR|WITH)\s+(?:LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.-]+))*$/.test(value)) {
        return value;
    }
    return value ? `LicenseRef-Unresolved-${canonicalName(value).replace(/[^a-z0-9.-]/g, '-')}` : 'LicenseRef-Unknown';
}

function licenseObject(expression) {
    return /^[A-Za-z0-9-.+]+$/.test(expression) && !expression.startsWith('LicenseRef-')
        ? { license: { id: expression } }
        : { expression };
}

function externalReferences(...entries) {
    const seen = new Set();
    return entries
        .filter((entry) => entry && entry.url)
        .filter((entry) => {
            const key = `${entry.type}:${entry.url}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function componentFromRecord(record, policy, artifact) {
    const key = canonicalName(record.key || record.name);
    const override = (policy.components || {})[key] || {};
    const expression = normalizeLicenseExpression(override.licenseExpression || record.license);
    const licenseFiles = Array.isArray(record.licenseFiles) ? record.licenseFiles : [];
    const autoApproved = new Set(policy.autoApprovedLicenseExpressions || []);
    const decision = override.decision
        || (autoApproved.has(expression) && licenseFiles.length ? 'approved' : 'unresolved');
    const sourceUrl = override.sourceUrl || record.sourceUrl || '';
    const noticeUrl = override.noticeUrl || (licenseFiles[0] && `embedded:${licenseFiles[0].path}`) || '';
    const name = override.name || record.name;
    const version = String(record.version || 'unresolved');
    const bomRef = record.scope === 'python-runtime'
        ? `pkg:generic/cpython@${encodeURIComponent(version)}`
        : `pkg:pypi/${purlName(name)}@${encodeURIComponent(version)}`;
    const component = {
        type: record.scope === 'build' ? 'framework' : 'library',
        'bom-ref': bomRef,
        name,
        version,
        purl: bomRef,
        scope: record.scope === 'build' ? 'excluded' : 'required',
        licenses: [licenseObject(expression)],
        externalReferences: externalReferences(
            { type: 'website', url: sourceUrl },
            { type: 'license', url: noticeUrl.startsWith('http') ? noticeUrl : '' }
        ),
        properties: [
            property(PROPERTY.inventory, true),
            property(PROPERTY.componentKey, key),
            property(PROPERTY.delivery, record.scope === 'build' ? 'build-tool' : 'embedded'),
            property(PROPERTY.artifactName, artifact.name),
            property(PROPERTY.artifactSha256, artifact.sha256),
            property(PROPERTY.decision, decision),
            property(PROPERTY.evidence, override.approvalEvidence
                || (decision === 'approved' && licenseFiles.length ? `embedded:${licenseFiles[0].path}` : '')),
            property(PROPERTY.sourceUrl, sourceUrl),
            property(PROPERTY.noticeUrl, noticeUrl),
            property(PROPERTY.obligations, JSON.stringify(override.obligations
                || (decision === 'approved' && licenseFiles.length
                    ? [`Retain ${licenseFiles[0].path} with the binary distribution.`]
                    : []))),
            property(PROPERTY.resolution, override.resolution || ''),
            property(PROPERTY.recordSha256, record.recordSha256 || '')
        ]
    };
    if (!component.externalReferences.length) delete component.externalReferences;
    return component;
}

function helperComponent(helper, artifact) {
    const expression = normalizeLicenseExpression(helper.licenseExpression);
    const version = String(helper.version || 'unresolved');
    const bomRef = `pkg:generic/${purlName(helper.name)}@${encodeURIComponent(version)}`;
    return {
        type: 'application',
        'bom-ref': bomRef,
        name: helper.name,
        version,
        purl: bomRef,
        scope: 'required',
        licenses: [licenseObject(expression)],
        externalReferences: externalReferences(
            { type: 'distribution', url: helper.distributionUrl },
            { type: 'vcs', url: helper.sourceUrl },
            { type: 'license', url: helper.noticeUrl }
        ),
        properties: [
            property(PROPERTY.inventory, true),
            property(PROPERTY.componentKey, helper.key),
            property(PROPERTY.delivery, 'runtime-download'),
            property(PROPERTY.artifactName, artifact.name),
            property(PROPERTY.artifactSha256, artifact.sha256),
            property(PROPERTY.decision, helper.decision || 'unresolved'),
            property(PROPERTY.evidence, helper.approvalEvidence || ''),
            property(PROPERTY.sourceUrl, helper.sourceUrl || ''),
            property(PROPERTY.noticeUrl, helper.noticeUrl || ''),
            property(PROPERTY.obligations, JSON.stringify(helper.obligations || [])),
            property(PROPERTY.resolution, helper.resolution || ''),
            property(PROPERTY.checksumUrl, helper.checksumUrl || ''),
            property(PROPERTY.distributionUrl, helper.distributionUrl || ''),
            property(PROPERTY.downloadSha256, helper.sha256 || '')
        ]
    };
}

function resolvedPythonComponent(record, resolution, artifact) {
    const expression = normalizeLicenseExpression(record.license);
    const version = String(record.version);
    const bomRef = `pkg:pypi/${purlName(record.name)}@${encodeURIComponent(version)}`;
    const component = {
        type: record.scope === 'build' ? 'framework' : 'library',
        'bom-ref': bomRef,
        name: record.name,
        version,
        purl: bomRef,
        scope: record.scope === 'embedded' ? 'required' : 'excluded',
        licenses: [licenseObject(expression)],
        externalReferences: externalReferences(
            { type: 'website', url: record.sourceUrl || '' }
        ),
        properties: [
            property(PROPERTY.resolutionGraph, true),
            property(PROPERTY.constraintsSha256, resolution.constraintsSha256),
            property(PROPERTY.delivery, record.scope),
            property(PROPERTY.artifactName, artifact.name),
            property(PROPERTY.artifactSha256, artifact.sha256),
            property(PROPERTY.recordSha256, record.recordSha256 || '')
        ]
    };
    if (!component.externalReferences.length) delete component.externalReferences;
    return component;
}

function buildCompanionInventory(repoRoot, buildDir) {
    const exePath = path.join(buildDir, COMPANION_EXE_NAME);
    if (!fs.existsSync(exePath)) return { components: [], dependencies: [] };

    const metadataPath = path.join(buildDir, COMPANION_BUILD_METADATA_NAME);
    if (!fs.existsSync(metadataPath)) {
        throw new Error(`companion license inventory requires build/${COMPANION_BUILD_METADATA_NAME}; rebuild and stage the companion with current tooling`);
    }
    const metadata = readJson(metadataPath);
    const policy = readJson(path.join(repoRoot, POLICY_RELATIVE_PATH));
    if (metadata.schemaVersion !== 2 || policy.schemaVersion !== 1) {
        throw new Error('unsupported companion build metadata or license policy schema');
    }
    const resolution = validateResolutionMetadata(metadata, repoRoot);
    const artifactSha256 = sha256(exePath);
    const artifact = metadata.artifact || {};
    if (artifact.name !== COMPANION_EXE_NAME || artifact.sha256 !== artifactSha256) {
        throw new Error(`companion build metadata does not match ${COMPANION_EXE_NAME}`);
    }

    const records = [
        {
            key: 'python',
            name: 'CPython',
            version: metadata.python && metadata.python.version,
            license: metadata.python && metadata.python.license,
            sourceUrl: metadata.python && metadata.python.sourceUrl,
            scope: 'python-runtime',
            licenseFiles: []
        },
        ...(Array.isArray(metadata.distributions) ? metadata.distributions : [])
    ];
    const artifactRecord = { name: COMPANION_EXE_NAME, sha256: artifactSha256 };
    const libraryComponents = records.map((record) => componentFromRecord(record, policy, artifactRecord));
    const componentByRef = new Map(libraryComponents.map((component) => [component['bom-ref'], component]));
    const resolutionComponents = [];
    const resolutionRefByName = new Map();
    for (const record of resolution.packages) {
        const resolved = resolvedPythonComponent(record, resolution, artifactRecord);
        resolutionRefByName.set(canonicalName(record.name), resolved['bom-ref']);
        const existing = componentByRef.get(resolved['bom-ref']);
        if (existing) {
            existing.properties.push(
                property(PROPERTY.resolutionGraph, true),
                property(PROPERTY.constraintsSha256, resolution.constraintsSha256)
            );
        } else {
            resolutionComponents.push(resolved);
            componentByRef.set(resolved['bom-ref'], resolved);
        }
    }
    const helperComponents = (policy.runtimeHelpers || []).map((helper) => helperComponent(helper, artifactRecord));
    const companionRef = `pkg:generic/astra-downloader@${encodeURIComponent(metadata.version || 'unresolved')}`;
    const companion = {
        type: 'application',
        'bom-ref': companionRef,
        name: 'Astra Downloader Companion',
        version: String(metadata.version || 'unresolved'),
        purl: companionRef,
        scope: 'required',
        hashes: [{ alg: 'SHA-256', content: artifactSha256 }],
        licenses: [{ license: { id: 'MIT' } }],
        properties: [
            property(PROPERTY.inventory, true),
            property(PROPERTY.componentKey, 'astra-downloader'),
            property(PROPERTY.delivery, 'release-artifact'),
            property(PROPERTY.artifactName, COMPANION_EXE_NAME),
            property(PROPERTY.artifactSha256, artifactSha256),
            property(PROPERTY.decision, 'approved'),
            property(PROPERTY.evidence, 'repository LICENSE'),
            property(PROPERTY.sourceUrl, 'https://github.com/SysAdminDoc/Astra-Deck'),
            property(PROPERTY.noticeUrl, 'LICENSE'),
            property(PROPERTY.obligations, JSON.stringify(['Retain the repository MIT license with the binary distribution.'])),
            property(PROPERTY.resolution, '')
        ]
    };
    const components = [companion, ...libraryComponents, ...resolutionComponents, ...helperComponents];
    const resolutionDependencies = resolution.packages.map((record) => ({
        ref: resolutionRefByName.get(canonicalName(record.name)),
        dependsOn: record.dependsOn
            .map((name) => resolutionRefByName.get(canonicalName(name)))
            .filter(Boolean)
            .sort()
    }));
    return {
        components,
        dependencies: [{
            ref: companionRef,
            dependsOn: [...libraryComponents, ...helperComponents]
                .filter((component) => component.scope !== 'excluded')
                .map((component) => component['bom-ref'])
                .sort()
        }, ...resolutionDependencies]
    };
}

function componentLicenseExpression(component) {
    const first = component.licenses && component.licenses[0];
    if (!first) return '';
    return first.expression || (first.license && first.license.id) || '';
}

function inspectCompanionInventory(sbom, artifactSha256) {
    const components = (sbom && Array.isArray(sbom.components) ? sbom.components : [])
        .filter((component) => propertyValue(component, PROPERTY.inventory) === 'true');
    const issues = [];
    const keys = new Set(components.map((component) => propertyValue(component, PROPERTY.componentKey)));
    for (const key of REQUIRED_COMPONENT_KEYS) {
        if (!keys.has(key)) issues.push(`${key}: missing from companion inventory`);
    }
    for (const component of components) {
        const key = propertyValue(component, PROPERTY.componentKey) || component.name || 'unknown';
        const decision = propertyValue(component, PROPERTY.decision);
        const expression = componentLicenseExpression(component);
        const version = String(component.version || '');
        const delivery = propertyValue(component, PROPERTY.delivery);
        if (!version || /^(?:unknown|unresolved|latest|dynamic)$/i.test(version)) {
            issues.push(`${key}: exact version is unresolved`);
        }
        if (!expression || /^LicenseRef-(?:Unknown|Unresolved)/.test(expression)) {
            issues.push(`${key}: SPDX license expression is unresolved`);
        }
        if (decision !== 'approved') {
            const resolution = propertyValue(component, PROPERTY.resolution);
            issues.push(`${key}: decision=${decision || 'unknown'}${resolution ? ` (${resolution})` : ''}`);
        } else if (!propertyValue(component, PROPERTY.evidence)) {
            issues.push(`${key}: approval evidence is missing`);
        }
        if (!propertyValue(component, PROPERTY.sourceUrl)) issues.push(`${key}: source URL is missing`);
        if (!propertyValue(component, PROPERTY.noticeUrl)) issues.push(`${key}: notice/license location is missing`);
        try {
            const obligations = JSON.parse(propertyValue(component, PROPERTY.obligations));
            if (!Array.isArray(obligations) || !obligations.length) {
                issues.push(`${key}: required obligations are missing`);
            }
        } catch (_) {
            issues.push(`${key}: required obligations are malformed`);
        }
        if (propertyValue(component, PROPERTY.artifactSha256) !== artifactSha256) {
            issues.push(`${key}: artifact SHA-256 linkage does not match ${COMPANION_EXE_NAME}`);
        }
        if (delivery === 'runtime-download') {
            if (!propertyValue(component, PROPERTY.checksumUrl)) issues.push(`${key}: checksum source is missing`);
            for (const [label, url] of [
                ['distribution', propertyValue(component, PROPERTY.distributionUrl)],
                ['checksum', propertyValue(component, PROPERTY.checksumUrl)],
                ['source', propertyValue(component, PROPERTY.sourceUrl)]
            ]) {
                if (/\/(?:releases\/)?latest(?:\/|$)|\/download\/latest\//i.test(url)) {
                    issues.push(`${key}: ${label} URL still uses a moving latest target`);
                }
            }
            if (!/^[0-9a-f]{64}$/i.test(propertyValue(component, PROPERTY.downloadSha256))) {
                issues.push(`${key}: exact download SHA-256 is unresolved`);
            }
        }
    }
    return { components, issues };
}

module.exports = {
    COMPANION_BUILD_METADATA_NAME,
    COMPANION_EXE_NAME,
    PROPERTY,
    REQUIRED_COMPONENT_KEYS,
    buildCompanionInventory,
    canonicalName,
    inspectCompanionInventory,
    normalizeLicenseExpression,
    propertyValue,
    validateResolutionMetadata,
    sha256
};
