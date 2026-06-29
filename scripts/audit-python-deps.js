#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const REQUIREMENTS_PATH = path.join(REPO_ROOT, 'astra_downloader', 'requirements.txt');
const OUTPUT_PATH = path.join(BUILD_DIR, 'astra-downloader-pip-audit.json');
const FAILURE_FLOOR = 'moderate';
const UNKNOWN_SEVERITY_IS_ACTIONABLE = true;

// Reviewed advisories live in code so local release gates fail closed.
// Add entries only after documenting why the advisory is structurally
// inapplicable or why a temporary ship exception is safer than holding release.
const REVIEWED_VULNERABILITIES = Object.freeze({
    // Example shape:
    // 'PYSEC-0000-000': {
    //     package: 'example',
    //     reviewedAt: '2026-06-29',
    //     reason: 'Not reachable from Astra Downloader.'
    // }
});

const SEVERITY_RANK = Object.freeze({
    none: 0,
    negligible: 0,
    low: 1,
    medium: 2,
    moderate: 2,
    high: 3,
    critical: 4,
    unknown: 5
});

function repoRelative(filePath) {
    return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function normalizeSeverity(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return 'unknown';
    if (text === 'medium') return 'moderate';
    if (Object.prototype.hasOwnProperty.call(SEVERITY_RANK, text)) return text;
    return 'unknown';
}

function severityFromVuln(vuln) {
    if (!vuln || typeof vuln !== 'object') return 'unknown';
    const direct = normalizeSeverity(vuln.severity || vuln.cvss_severity || vuln.risk);
    if (direct !== 'unknown') return direct;
    const details = [
        vuln.cvss,
        vuln.database_specific,
        vuln.severity_v3,
        vuln.details
    ];
    for (const item of details) {
        if (!item) continue;
        if (typeof item === 'string') {
            const normalized = normalizeSeverity(item);
            if (normalized !== 'unknown') return normalized;
        }
        if (Array.isArray(item)) {
            for (const nested of item) {
                const normalized = severityFromVuln(nested);
                if (normalized !== 'unknown') return normalized;
            }
        } else if (typeof item === 'object') {
            const normalized = normalizeSeverity(
                item.severity || item.cvss_severity || item.risk || item.baseSeverity
            );
            if (normalized !== 'unknown') return normalized;
        }
    }
    return 'unknown';
}

function vulnIdentifiers(vuln) {
    const ids = [];
    if (vuln && vuln.id) ids.push(String(vuln.id));
    if (vuln && Array.isArray(vuln.aliases)) {
        for (const alias of vuln.aliases) ids.push(String(alias));
    }
    return Array.from(new Set(ids.filter(Boolean))).sort();
}

function isReviewed(vuln) {
    return vulnIdentifiers(vuln).some((id) => Object.prototype.hasOwnProperty.call(REVIEWED_VULNERABILITIES, id));
}

function isActionableSeverity(severity) {
    const normalized = normalizeSeverity(severity);
    if (normalized === 'unknown') return UNKNOWN_SEVERITY_IS_ACTIONABLE;
    return SEVERITY_RANK[normalized] >= SEVERITY_RANK[FAILURE_FLOOR];
}

function normalizeAudit(raw, options = {}) {
    const dependencies = Array.isArray(raw && raw.dependencies) ? raw.dependencies : [];
    const normalizedDependencies = dependencies.map((dependency) => {
        const vulns = Array.isArray(dependency.vulns) ? dependency.vulns : [];
        return {
            name: String(dependency.name || ''),
            version: dependency.version ? String(dependency.version) : null,
            vulnerabilities: vulns.map((vuln) => {
                const identifiers = vulnIdentifiers(vuln);
                const severity = severityFromVuln(vuln);
                const reviewed = isReviewed(vuln);
                return {
                    id: identifiers[0] || 'unknown',
                    aliases: identifiers.slice(1),
                    severity,
                    actionable: !reviewed && isActionableSeverity(severity),
                    reviewed,
                    fixVersions: Array.isArray(vuln.fix_versions) ? vuln.fix_versions.map(String) : [],
                    description: vuln.description ? String(vuln.description) : ''
                };
            })
        };
    });

    const findings = normalizedDependencies.flatMap((dependency) => (
        dependency.vulnerabilities.map((vuln) => ({
            package: dependency.name,
            version: dependency.version,
            ...vuln
        }))
    ));
    const actionableFindings = findings.filter((finding) => finding.actionable);
    const reviewedFindings = findings.filter((finding) => finding.reviewed);

    return {
        schemaVersion: 1,
        product: 'Astra Downloader',
        generatedAt: (options.now || new Date()).toISOString(),
        status: actionableFindings.length ? 'fail' : 'pass',
        requirements: repoRelative(options.requirementsPath || REQUIREMENTS_PATH),
        tool: {
            name: 'pip-audit',
            service: 'osv',
            command: options.command || null,
            exitCode: Number.isInteger(options.exitCode) ? options.exitCode : null
        },
        policy: {
            failureFloor: FAILURE_FLOOR,
            unknownSeverityIsActionable: UNKNOWN_SEVERITY_IS_ACTIONABLE,
            reviewedVulnerabilityIds: Object.keys(REVIEWED_VULNERABILITIES).sort()
        },
        summary: {
            dependencies: normalizedDependencies.length,
            vulnerableDependencies: normalizedDependencies.filter((dependency) => dependency.vulnerabilities.length).length,
            findings: findings.length,
            actionableFindings: actionableFindings.length,
            reviewedFindings: reviewedFindings.length
        },
        actionableFindings,
        reviewedFindings,
        dependencies: normalizedDependencies,
        raw
    };
}

function parsePipAuditJson(stdout) {
    const text = String(stdout || '').trim();
    if (!text) throw new Error('pip-audit produced no JSON output');
    try {
        return JSON.parse(text);
    } catch (_) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(text.slice(start, end + 1));
        }
        throw new Error('pip-audit output was not valid JSON');
    }
}

function auditCandidates(env = process.env) {
    const out = [];
    if (env.ASTRA_PIP_AUDIT_PYTHON) {
        out.push({ command: env.ASTRA_PIP_AUDIT_PYTHON, prefixArgs: ['-m', 'pip_audit'] });
    }
    out.push(
        { command: 'py', prefixArgs: ['-3.12', '-m', 'pip_audit'] },
        { command: 'python', prefixArgs: ['-m', 'pip_audit'] },
        { command: 'pip-audit', prefixArgs: [] }
    );
    return out;
}

function runPipAudit(options = {}) {
    const requirementsPath = options.requirementsPath || REQUIREMENTS_PATH;
    const auditArgs = [
        '-r', requirementsPath,
        '--format', 'json',
        '--progress-spinner', 'off',
        '--strict',
        '--aliases', 'on',
        '--desc', 'on',
        '--vulnerability-service', 'osv',
        '--timeout', '30'
    ];
    const errors = [];
    for (const candidate of auditCandidates(options.env || process.env)) {
        const args = [...candidate.prefixArgs, ...auditArgs];
        const result = spawnSync(candidate.command, args, {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        if (result.error) {
            errors.push(`${candidate.command}: ${result.error.message}`);
            continue;
        }
        let raw;
        try {
            raw = parsePipAuditJson(result.stdout);
        } catch (err) {
            const stderr = String(result.stderr || '').trim();
            throw new Error(`pip-audit failed before JSON could be parsed (${candidate.command}): ${err.message}${stderr ? `; stderr: ${stderr}` : ''}`);
        }
        return normalizeAudit(raw, {
            requirementsPath,
            command: [candidate.command, ...args].join(' '),
            exitCode: result.status
        });
    }
    throw new Error(
        'pip-audit is required for local release checks. Install it with `py -3.12 -m pip install --user pip-audit`. ' +
        `Attempts: ${errors.join('; ')}`
    );
}

function writeAuditArtifact(report, outputPath = OUTPUT_PATH) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    return outputPath;
}

function main() {
    const report = runPipAudit();
    const outputPath = writeAuditArtifact(report);
    console.log(`Python dependency audit: ${report.status}`);
    console.log(`JSON: ${repoRelative(outputPath)}`);
    console.log(`Findings: ${report.summary.findings}; actionable: ${report.summary.actionableFindings}`);
    if (report.status !== 'pass') {
        for (const finding of report.actionableFindings) {
            const ids = [finding.id, ...finding.aliases].filter(Boolean).join(', ');
            console.error(`[pip-audit] ${finding.package}@${finding.version || 'unknown'} ${ids} severity=${finding.severity}`);
        }
        process.exitCode = 1;
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[audit-python-deps] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    FAILURE_FLOOR,
    OUTPUT_PATH,
    REQUIREMENTS_PATH,
    REVIEWED_VULNERABILITIES,
    isActionableSeverity,
    normalizeAudit,
    normalizeSeverity,
    parsePipAuditJson,
    writeAuditArtifact
};
