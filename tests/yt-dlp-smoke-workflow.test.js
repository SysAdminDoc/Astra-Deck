'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

test('downloader requirements carry exact yt-dlp smoke pins', () => {
    const requirements = fs.readFileSync(
        path.join(repoRoot, 'astra_downloader', 'requirements.txt'), 'utf8');
    assert.match(requirements, /^yt-dlp==2026\.6\.9$/m,
        'requirements.txt must pin yt-dlp exactly so Dependabot opens reviewed bump PRs');
    assert.match(requirements, /^curl_cffi==0\.15\.0$/m,
        'requirements.txt must pin curl_cffi exactly for the yt-dlp smoke environment');
});

test('yt-dlp smoke stays local-only with no scheduled workflow', () => {
    assert.equal(
        fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'yt-dlp-smoke.yml')),
        false,
        'yt-dlp smoke must be run locally, not through GitHub Actions'
    );
    const script = fs.readFileSync(
        path.join(repoRoot, 'scripts', 'yt-dlp-smoke.py'), 'utf8');
    assert.match(script, /def main\(\) -> int:/,
        'local smoke script must remain directly runnable by operators');
    assert.match(script, /ASTRA_YTDLP_SMOKE_URL/,
        'operators must be able to override the local smoke URL without editing source');
});

test('yt-dlp smoke script performs a bounded real media download', () => {
    const script = fs.readFileSync(
        path.join(repoRoot, 'scripts', 'yt-dlp-smoke.py'), 'utf8');
    assert.match(script, /dQw4w9WgXcQ/,
        'smoke script must use the stable public YouTube fixture by default');
    assert.match(script, /"--max-filesize"/,
        'smoke script must cap media size');
    assert.match(script, /"-m",\s*"yt_dlp"/,
        'smoke script must execute the installed yt-dlp package');
    assert.match(script, /path\.stat\(\)\.st_size/,
        'smoke script must verify a non-empty downloaded file');
});
