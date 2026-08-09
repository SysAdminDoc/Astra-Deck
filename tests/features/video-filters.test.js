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
    const black = new Uint8ClampedArray([
        0, 0, 0, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255
    ]);
    const white = new Uint8ClampedArray([
        255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255
    ]);
    assert.equal(videoFilters.computeFrameLuminance(black), 0);
    assert.ok(Math.abs(videoFilters.computeFrameLuminance(white) - 1) < 1e-12);
    const flash = videoFilters.detectPhotosensitiveFlash(0.1, 0.35, 0.2);
    assert.equal(flash.luminance, 0.35);
    assert.ok(Math.abs(flash.delta - 0.25) < 1e-12);
    assert.equal(flash.triggered, true);
    assert.match(videoFilters.buildPhotosensitiveOverlayCss(), /ytkit-photosensitive-alert/);
    assert.equal(videoFilters.PHOTOSENSITIVE_FRAME_BUDGET_MS, 1);
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
    assert.match(mainSrc, /FRAME_BUDGET_MS = 1/);
    assert.match(ytkitSrc, /id: 'photosensitiveFlashProtection'/);
    assert.match(ytkitSrc, /_recordFeatureRuntimeFailure\(this\.id, error\)/);
    assert.match(ytkitSrc, /data-ytkit-photosensitive-failure/);
});
