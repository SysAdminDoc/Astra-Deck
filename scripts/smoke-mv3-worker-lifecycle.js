#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
    browserCandidates,
    chromiumArgs,
    connectCdp,
    createChromiumStage,
    evaluate,
    extensionIdFromTarget,
    fetchJsonFromDevTools,
    hasLoadExtensionPolicyBlock,
    killProcessTree,
    removeDirWithRetries,
    reserveLoopbackPort,
    sleep,
    waitForBackgroundTarget,
    waitForDevTools,
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
const TIMEOUT_MS = 20000;
const SETTINGS_KEY = 'ytSuiteSettings';
const PENDING_REVEALS_KEY = '_pendingReveals';
const LIFECYCLE_KEY = '_swLifecycle';
const UPDATE_RECOVERY_KEY = '_updateRecovery';
const UPDATE_OPERATION_ID = 'mv3-lifecycle-smoke-update';

async function waitFor(predicate, label, timeoutMs = TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
        lastValue = await predicate();
        if (lastValue) return lastValue;
        await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

async function waitForExtensionPage(port, extensionId, timeoutMs = TIMEOUT_MS) {
    const expected = `chrome-extension://${extensionId}/popup.html`;
    return waitFor(async () => {
        const targets = await fetchJsonFromDevTools(port, '/json/list');
        return targets.find((target) => target.type === 'page' && String(target.url).startsWith(expected)) || null;
    }, 'the lifecycle extension page', timeoutMs);
}

async function waitForWorkerId(port, previousId = '', timeoutMs = TIMEOUT_MS) {
    return waitFor(async () => {
        const target = await waitForBackgroundTarget(port, 1000).catch(() => null);
        return target && target.id !== previousId ? target : null;
    }, 'a new MV3 service-worker target', timeoutMs);
}

async function waitForWorkerGone(port, workerId, timeoutMs = TIMEOUT_MS) {
    return waitFor(async () => {
        const targets = await fetchJsonFromDevTools(port, '/json/list');
        return targets.some((target) => target.id === workerId) ? null : true;
    }, `service worker ${workerId} to close`, timeoutMs);
}

function runtimeMessageExpression(message) {
    return `new Promise((resolve) => chrome.runtime.sendMessage(${JSON.stringify(message)}, (response) => resolve({
        response: response || null,
        lastError: chrome.runtime.lastError?.message || ''
    })))`;
}

async function runtimeMessage(client, message) {
    const result = await evaluate(client, runtimeMessageExpression(message));
    if (result?.lastError) throw new Error(result.lastError);
    return result?.response;
}

async function readDurableState(client) {
    return evaluate(client, `Promise.all([
        chrome.storage.local.get([${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(UPDATE_RECOVERY_KEY)}]),
        chrome.storage.session.get([${JSON.stringify(PENDING_REVEALS_KEY)}, ${JSON.stringify(LIFECYCLE_KEY)}]),
        chrome.permissions.getAll()
    ]).then(([local, session, permissions]) => ({
        settings: local[${JSON.stringify(SETTINGS_KEY)}] || {},
        pendingReveals: session[${JSON.stringify(PENDING_REVEALS_KEY)}] || [],
        lifecycle: session[${JSON.stringify(LIFECYCLE_KEY)}] || [],
        updateRecovery: local[${JSON.stringify(UPDATE_RECOVERY_KEY)}] || null,
        permissions: { origins: (permissions.origins || []).slice().sort(), permissions: (permissions.permissions || []).slice().sort() }
    }))`);
}

async function seedUpdateCheckpoint(client, pendingRevealIds = []) {
    const checkpoint = {
        id: UPDATE_OPERATION_ID,
        state: 'pending',
        stagedAt: Date.now(),
        pendingRevealIds
    };
    await evaluate(client, `chrome.storage.local.set({ ${JSON.stringify(UPDATE_RECOVERY_KEY)}: {
        ...${JSON.stringify(checkpoint)},
        version: chrome.runtime.getManifest().version
    } })`);
}

async function cancelDownload(client, downloadId) {
    const result = await evaluate(client, `new Promise((resolve) => chrome.downloads.cancel(${Number(downloadId)}, () => resolve({
        lastError: chrome.runtime.lastError?.message || ''
    })))`);
    if (result?.lastError) throw new Error(`Could not cancel lifecycle smoke download: ${result.lastError}`);
}

function countOperation(entries, event, operationId) {
    return (entries || []).filter((entry) => entry?.event === event && entry?.operationId === operationId).length;
}

function assertRecoveredState(before, after, downloadId) {
    if (after.settings.hideCreateButton !== false) throw new Error('Settings mutation did not survive worker termination');
    if (JSON.stringify(after.settings) !== JSON.stringify(before.settings)) throw new Error('Settings mutation replayed or drifted after worker restart');
    if (JSON.stringify(after.permissions) !== JSON.stringify(before.permissions)) throw new Error('Optional-permission state changed across worker restart');
    if ((after.pendingReveals || []).includes(downloadId)) throw new Error('Interrupted pending reveal was not consumed after restart');
    if (after.updateRecovery?.state !== 'resumed' || after.updateRecovery?.id !== UPDATE_OPERATION_ID) {
        throw new Error(`Update recovery did not resume: ${JSON.stringify(after.updateRecovery)}`);
    }
    if (countOperation(after.lifecycle, 'update-recovery-resumed', UPDATE_OPERATION_ID) !== 1) {
        throw new Error('Update recovery was not recorded exactly once');
    }
    if (countOperation(after.lifecycle, 'reveal-interrupted', `download:${downloadId}:interrupted`) !== 1) {
        throw new Error('Interrupted pending reveal was not handled exactly once');
    }
}

async function createSlowDownloadServer() {
    let requestSeenResolve;
    const requestSeen = new Promise((resolve) => { requestSeenResolve = resolve; });
    const server = http.createServer((request, response) => {
        if (request.url !== '/slow.bin') {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(64 * 1024 * 1024),
            'Cache-Control': 'no-store'
        });
        response.write(Buffer.alloc(1024, 65));
        requestSeenResolve(true);
        // Intentionally leave the response open. The harness cancels through
        // chrome.downloads, producing an "interrupted" event that exercises
        // reveal recovery without ever calling show-in-folder on the desktop.
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        server,
        requestSeen,
        url: `http://127.0.0.1:${server.address().port}/slow.bin`
    };
}

async function runWithBrowser(candidate, stageDir, download) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-mv3-lifecycle-profile-'));
    const downloadDir = path.join(profile, 'downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    const port = await reserveLoopbackPort();
    const args = chromiumArgs(profile, stageDir, { headed: false }, port);
    if (!args.includes('--headless=new')) throw new Error('Lifecycle smoke refused to launch a visible browser');
    const proc = spawn(candidate.path, args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    let pageClient;
    let browserClient;
    try {
        await waitForDevTools(port, TIMEOUT_MS);
        const worker1 = await waitForBackgroundTarget(port, TIMEOUT_MS);
        const extensionId = extensionIdFromTarget(worker1);
        const version = await fetchJsonFromDevTools(port, '/json/version');
        browserClient = await connectCdp(version.webSocketDebuggerUrl);
        await browserClient.send('Target.createTarget', { url: `chrome-extension://${extensionId}/popup.html` });
        await browserClient.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
        const page = await waitForExtensionPage(port, extensionId);
        pageClient = await connectCdp(page.webSocketDebuggerUrl);
        await pageClient.send('Runtime.enable');
        await pageClient.send('Page.enable');

        const mutation = await runtimeMessage(pageClient, {
            type: 'YTKIT_MUTATE_SETTING',
            key: 'hideCreateButton',
            value: false,
            source: 'mv3-lifecycle-smoke'
        });
        if (!mutation?.ok || mutation?.value !== false) throw new Error(`Settings mutation failed: ${JSON.stringify(mutation)}`);

        const permissionState = await evaluate(pageClient, 'chrome.permissions.getAll()');
        if (!Array.isArray(permissionState?.origins)) throw new Error('Optional-permission state is unavailable');
        const downloadResult = await runtimeMessage(pageClient, {
            type: 'DOWNLOAD_FILE',
            url: download.url,
            filename: 'mv3-lifecycle-smoke.bin',
            showInFolder: true
        });
        const downloadId = Number(downloadResult?.downloadId);
        if (!Number.isFinite(downloadId)) throw new Error(`Slow download did not start: ${JSON.stringify(downloadResult)}`);
        await waitFor(() => download.requestSeen.then(() => true), 'the slow download request');
        const before = await waitFor(async () => {
            const state = await readDurableState(pageClient);
            return state.pendingReveals.includes(downloadId) ? state : null;
        }, 'the pending reveal checkpoint');
        await seedUpdateCheckpoint(pageClient, [downloadId]);
        // storage.session is cleared by a real extension update. Remove the
        // session mirror here so the restarted worker must reconstruct it from
        // the storage.local update checkpoint before the interrupted event.
        await evaluate(pageClient, `chrome.storage.session.remove(${JSON.stringify(PENDING_REVEALS_KEY)})`);

        const closed1 = await browserClient.send('Target.closeTarget', { targetId: worker1.id });
        if (closed1?.success !== true) throw new Error('DevTools did not close the first worker target');
        await waitForWorkerGone(port, worker1.id);
        await cancelDownload(pageClient, downloadId);
        const worker2 = await waitForWorkerId(port, worker1.id);
        await runtimeMessage(pageClient, { type: 'GET_SW_LIFECYCLE' });
        let observedFirstRestart = null;
        let afterFirstRestart;
        try {
            afterFirstRestart = await waitFor(async () => {
                const state = await readDurableState(pageClient);
                observedFirstRestart = state;
                const revealDone = countOperation(state.lifecycle, 'reveal-interrupted', `download:${downloadId}:interrupted`) === 1;
                const updateDone = countOperation(state.lifecycle, 'update-recovery-resumed', UPDATE_OPERATION_ID) === 1;
                return revealDone && updateDone && !state.pendingReveals.includes(downloadId) ? state : null;
            }, 'reveal and update recovery after worker restart');
        } catch (error) {
            throw new Error(`${error.message}; observed state: ${JSON.stringify(observedFirstRestart)}`);
        }
        assertRecoveredState(before, afterFirstRestart, downloadId);

        const closed2 = await browserClient.send('Target.closeTarget', { targetId: worker2.id });
        if (closed2?.success !== true) throw new Error('DevTools did not close the second worker target');
        await waitForWorkerGone(port, worker2.id);
        await runtimeMessage(pageClient, { type: 'GET_SW_LIFECYCLE' });
        const worker3 = await waitForWorkerId(port, worker2.id);
        const afterSecondRestart = await waitFor(async () => {
            const state = await readDurableState(pageClient);
            return (state.lifecycle || []).filter((entry) => entry.event === 'sw-start').length >= 3 ? state : null;
        }, 'the third worker boot diagnostic');
        assertRecoveredState(afterFirstRestart, afterSecondRestart, downloadId);

        return {
            browser: candidate.label,
            extensionId,
            workerIds: [worker1.id, worker2.id, worker3.id],
            lifecycleEntries: afterSecondRestart.lifecycle.length,
            optionalOrigins: afterSecondRestart.permissions.origins.length
        };
    } catch (error) {
        if (hasLoadExtensionPolicyBlock(stderr)) error.code = 'LOAD_EXTENSION_BLOCKED';
        error.stderr = stderr;
        throw error;
    } finally {
        pageClient?.close();
        browserClient?.close();
        killProcessTree(proc);
        await removeDirWithRetries(profile);
    }
}

async function main() {
    const candidates = browserCandidates();
    if (!candidates.length) throw new Error('No Chromium-family browser found; set CHROMIUM_PATH, CHROME_PATH, or EDGE_PATH');
    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-mv3-lifecycle-stage-'));
    const download = await createSlowDownloadServer();
    try {
        const { stageDir } = createChromiumStage(stageRoot);
        let lastError;
        for (const candidate of candidates) {
            try {
                const result = await runWithBrowser(candidate, stageDir, download);
                console.log(`[smoke-mv3-worker-lifecycle] ${result.browser}: terminated ${result.workerIds.join(' -> ')}`);
                console.log(`[smoke-mv3-worker-lifecycle] settings, optional permissions (${result.optionalOrigins} origins), pending reveal, diagnostics, and update recovery passed`);
                return;
            } catch (error) {
                lastError = error;
                if (error.code === 'LOAD_EXTENSION_BLOCKED') continue;
                throw error;
            }
        }
        throw lastError || new Error('No Chromium candidate could load the staged extension');
    } finally {
        await new Promise((resolve) => download.server.close(resolve));
        await removeDirWithRetries(stageRoot);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-mv3-worker-lifecycle]', error.message || error);
        process.exit(1);
    });
}

module.exports = {
    UPDATE_OPERATION_ID,
    assertRecoveredState,
    countOperation,
    runtimeMessageExpression,
};
