'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const videoFilters = require('../../extension/features/video-filters');

test('Video Filters peeled module exports CSS filter chain builder', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'video-filters', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.match(modSrc, /filter|brightness|contrast|saturate|hue-rotate/i,
        'Module must produce CSS filter chain strings');
});

test('Video Filters module references the html5-main-video target', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'video-filters', 'index.js'), 'utf8');
    assert.match(modSrc, /html5-main-video|\.video-stream/,
        'Module must target the YouTube video element');
});

test('Photosensitive frame helpers detect bounded luminance changes and render an alert lane', () => {
    const flash = videoFilters.detectPhotosensitiveFlash(0.1, 0.35, 0.2);
    assert.equal(flash.luminance, 0.35);
    assert.ok(Math.abs(flash.delta - 0.25) < 1e-12);
    assert.equal(flash.triggered, true);
    assert.match(videoFilters.buildPhotosensitiveOverlayCss(), /ytkit-photosensitive-alert/);
});

test('Photosensitive settings stay inside the safe local bounds', () => {
    assert.equal(videoFilters.readPhotosensitiveSetting({}, 'photosensitiveFlashThreshold'), 0.2);
    assert.equal(videoFilters.readPhotosensitiveSetting({ photosensitiveFlashThreshold: -1 }, 'photosensitiveFlashThreshold'), 0.05);
    assert.equal(videoFilters.readPhotosensitiveSetting({ photosensitiveFlashThreshold: 2 }, 'photosensitiveFlashThreshold'), 0.8);
    assert.equal(videoFilters.readPhotosensitiveSetting({ photosensitiveDimPercent: 999 }, 'photosensitiveDimPercent'), 80);
});

test('Photosensitive protection wires the isolated warning to the MAIN frame sampler', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'ytkit-main.js'), 'utf8');
    const ytkitSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
    assert.match(mainSrc, /requestVideoFrameCallback/);
    assert.match(mainSrc, /data-ytkit-photosensitive-event/);
    assert.match(mainSrc, /createFrameLuminanceReader/);
    assert.match(ytkitSrc, /id: 'photosensitiveFlashProtection'/);
    assert.match(ytkitSrc, /_recordFeatureRuntimeFailure\(this\.id, error\)/);
    assert.match(ytkitSrc, /data-ytkit-photosensitive-failure/);
});

test('the photosensitive frame budget has one owner, the core sampler', () => {
    // 2026-09-28 found the budget in five places, and a 1 ms value in all of
    // them switched the guard off on every GPU machine. core/player.js now
    // owns it; the two samplers take its default and the bench reads it.
    const vm = require('vm');
    const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
    const context = { console, setTimeout() { return 0; }, clearTimeout() {} };
    context.globalThis = context;
    vm.runInNewContext(read('extension/core/player.js'), context);
    const budget = context.YTKitCore.videoFrameBudgetMs;
    assert.equal(budget, 8, 'the measured contract: 3.5 ms median readback, 9.5 ms p90 on 4K60, worst 20-sample mean 7.0 ms');
    assert.equal(context.YTKitCore.createVideoFrameSampler({}).budgetMs, budget);
    assert.equal(require('../../scripts/bench-startup').PHOTOSENSITIVE_FRAME_BUDGET_MS, budget);
    for (const rel of ['extension/ytkit-main.js', 'extension/ytkit.js', 'extension/features/video-filters/index.js']) {
        const source = read(rel);
        assert.doesNotMatch(source, /budgetMs\s*:/, `${rel} must not pass its own frame budget`);
        assert.doesNotMatch(source, /FRAME_BUDGET_MS\s*=/, `${rel} must not keep a budget copy`);
    }
});
