#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createFirefoxStage } = require('./check-firefox-webext');

const REPO_ROOT = path.join(__dirname, '..');
const WEB_EXT_BIN = path.join(REPO_ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const DEFAULT_START_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

function firefoxCandidates(cliPath) {
    const candidates = [];
    if (cliPath) candidates.push(cliPath);
    if (process.env.FIREFOX_PATH) candidates.push(process.env.FIREFOX_PATH);
    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        candidates.push(
            path.join(pf, 'Mozilla Firefox', 'firefox.exe'),
            path.join(pfx86, 'Mozilla Firefox', 'firefox.exe')
        );
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Firefox.app/Contents/MacOS/firefox');
    } else {
        candidates.push('/usr/bin/firefox', '/usr/local/bin/firefox');
    }
    return candidates;
}

function resolveFirefoxExecutable(cliPath = '') {
    const found = firefoxCandidates(cliPath).find((candidate) =>
        candidate && fs.existsSync(candidate)
    );
    if (!found) {
        throw new Error('Firefox executable not found. Install Firefox or pass --firefox <path>.');
    }
    return found;
}

function parseArgs(argv) {
    const opts = {
        firefox: '',
        keepStage: false,
        stageRoot: '',
        startUrl: DEFAULT_START_URL,
        timeoutMs: 25000,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (!value) throw new Error(`${arg} requires a value`);
            i += 1;
            return value;
        };
        if (arg === '--firefox') opts.firefox = next();
        else if (arg === '--keep-stage') opts.keepStage = true;
        else if (arg === '--stage-root') opts.stageRoot = path.resolve(next());
        else if (arg === '--start-url') opts.startUrl = next();
        else if (arg === '--timeout-ms') opts.timeoutMs = Number(next()) || opts.timeoutMs;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return opts;
}

function killProcessTree(proc) {
    if (!proc || proc.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        proc.kill('SIGTERM');
    }
}

function hasStartupFailure(output) {
    return /WebExtError|ExtensionError|Failed to start Firefox|Error:|TypeError:|ReferenceError:/i.test(output);
}

function runFirefoxSmoke(opts) {
    if (!fs.existsSync(WEB_EXT_BIN)) {
        throw new Error('web-ext is not installed. Run `npm ci` before `npm run smoke:firefox`.');
    }

    const firefox = resolveFirefoxExecutable(opts.firefox);
    const stageRoot = opts.stageRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-smoke-'));
    fs.mkdirSync(stageRoot, { recursive: true });
    const stageDir = createFirefoxStage('store-safe', stageRoot);
    const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8'));

    return new Promise((resolve, reject) => {
        const args = [
            WEB_EXT_BIN,
            'run',
            '--source-dir',
            stageDir,
            '--target',
            'firefox-desktop',
            '--start-url',
            opts.startUrl,
            '--no-reload',
            '--firefox',
            firefox,
            '--arg=-headless',
        ];
        const startedAt = Date.now();
        const proc = spawn(process.execPath, args, {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;

        function finish(err, timedOut = false, code = proc.exitCode) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            killProcessTree(proc);
            if (!opts.keepStage && fs.existsSync(stageRoot)) {
                fs.rmSync(stageRoot, { recursive: true, force: true });
            }
            if (err) {
                reject(err);
                return;
            }
            resolve({
                firefox,
                geckoId: manifest.browser_specific_settings?.gecko?.id || '',
                manifestVersion: manifest.manifest_version,
                profile: 'store-safe',
                startUrl: opts.startUrl,
                timedOut,
                code,
                durationMs: Date.now() - startedAt,
                stdout,
                stderr,
            });
        }

        const timer = setTimeout(() => {
            const combined = `${stdout}\n${stderr}`;
            if (hasStartupFailure(combined)) {
                finish(new Error(`Firefox smoke saw startup errors:\n${combined.trim()}`), true);
                return;
            }
            finish(null, true);
        }, opts.timeoutMs);

        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.once('error', (err) => finish(err));
        proc.once('exit', (code) => {
            const combined = `${stdout}\n${stderr}`;
            if (code !== 0 || hasStartupFailure(combined)) {
                finish(new Error(`Firefox smoke exited with ${code}:\n${combined.trim()}`), false, code);
                return;
            }
            finish(null, false, code);
        });
    });
}

async function main(argv = process.argv.slice(2)) {
    const result = await runFirefoxSmoke(parseArgs(argv));
    const status = result.timedOut ? 'observed clean startup window' : `exited ${result.code}`;
    console.log(`[smoke-firefox-webext] ${result.profile}: ${status} in ${result.durationMs}ms`);
    console.log(`[smoke-firefox-webext] manifest: mv${result.manifestVersion}, gecko=${result.geckoId}`);
    console.log(`[smoke-firefox-webext] firefox: ${result.firefox}`);
    console.log(`[smoke-firefox-webext] start-url: ${result.startUrl}`);
    const trimmed = `${result.stdout}\n${result.stderr}`.trim();
    if (trimmed) {
        console.log('[smoke-firefox-webext] captured output:');
        console.log(trimmed.split(/\r?\n/).slice(0, 40).join('\n'));
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[smoke-firefox-webext]', err.message || err);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_START_URL,
    firefoxCandidates,
    hasStartupFailure,
    parseArgs,
    resolveFirefoxExecutable,
    runFirefoxSmoke,
};
