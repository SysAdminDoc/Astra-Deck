'use strict';

// autoDismissStillWatching used to dispatch a click on the player's Play
// button on EVERY ytd-popup-container mutation, before it checked whether the
// inactivity prompt was up at all. YouTube keeps the player subtree in the DOM
// after an SPA route change off /watch, so on a channel or search page the
// leftover control was always there and always paused — and the click bubbled
// to document, where YouTube reads it as a click outside whatever overlay had
// just opened. Subscribe menus, unsubscribe confirmations and the channel
// links dialog opened and closed again inside ~200ms.
//
// The second half of the same defect: the locale fallback in
// _isYouTherePrompt() accepted ANY yt-confirm-dialog-renderer while a video
// was paused. Unsubscribe, delete playlist and clear watch history all render
// that same element, so on any page reached from a watch page they were
// auto-confirmed.
//
// The userscript used to carry its own, further-drifted copy of this feature
// (no debounce, no compliance guard, a bare popup-button selector) with its own
// tests. It now runs this same ytkit.js, so the tests below cover both.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeNode, fakeTreeDocument } = require('../helpers/monolith');
const { readUserscriptBuild } = require('../helpers/source');

const PLAYER_CONTROL_SELECTOR = '.ytp-unmute-confirm-button, button.ytp-play-button[data-title-no-tooltip="Play"]';
const CONFIRM_SELECTOR = 'ytmusic-you-there-renderer #button, yt-confirm-dialog-renderer #confirm-button, .yt-confirm-dialog-renderer #confirm-button';
const DIALOG_SELECTOR = 'yt-confirm-dialog-renderer, .yt-confirm-dialog-renderer';

/** A node the browser would lay out: it reports a client rect. */
function onScreen(node) {
    node.getClientRects = () => [{ width: 320, height: 180, top: 0, left: 0 }];
    node.getBoundingClientRect = () => ({ width: 320, height: 180, top: 0, left: 0 });
    return node;
}

/** A node inside a display:none subtree: attached, but with no box. */
function offScreen(node) {
    node.getClientRects = () => [];
    node.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0 });
    return node;
}

/**
 * `dialogOpen: false` is a prompt YouTube has closed: still in the DOM with
 * its text, but inside a hidden paper dialog, so neither it nor its button has
 * a box. `staleCopy` puts such a closed prompt ahead of the open one in
 * document order, which is where an earlier prompt sits.
 */
function scenario({ dialogText = null, hasCancelButton = false, playerControl = null, video = null, dialogOpen = true, staleCopy = false } = {}) {
    const place = dialogOpen ? onScreen : offScreen;
    const confirmButton = place(fakeNode({ tag: 'button', attributes: { id: 'confirm-button' } }));
    const cancelButton = place(fakeNode({ tag: 'button', attributes: { id: 'cancel-button' } }));
    const dialog = dialogText === null
        ? null
        : place(fakeNode({ tag: 'yt-confirm-dialog-renderer', text: dialogText }));
    if (dialog) {
        dialog.querySelector = (selector) => (hasCancelButton && selector.includes('cancel') ? cancelButton : null);
    }
    const staleButton = offScreen(fakeNode({ tag: 'button', attributes: { id: 'confirm-button' } }));
    const staleDialog = offScreen(fakeNode({ tag: 'yt-confirm-dialog-renderer', text: 'Video paused. Continue watching?' }));
    staleDialog.querySelector = () => null;
    const withStale = (stale, current) => (staleCopy ? [stale, current].filter(Boolean) : current);

    const documentRef = fakeTreeDocument((selector) => {
        if (selector === 'ytmusic-you-there-renderer') return null;
        if (selector === DIALOG_SELECTOR) return withStale(staleDialog, dialog);
        if (selector === PLAYER_CONTROL_SELECTOR) return playerControl;
        if (selector === CONFIRM_SELECTOR) return withStale(staleButton, dialog ? confirmButton : null);
        if (selector.includes('ytp-pause-overlay')) return null;
        if (selector === 'ytd-popup-container') return null;
        return null;
    });

    const feature = loadFeature('autoDismissStillWatching', {
        document: documentRef,
        findComplianceDialog: () => null,
        isSafeToAutoClick: () => true,
        getMainVideoElement: () => video
    });

    return { feature, confirmButton, cancelButton, playerControl, dialog, staleButton };
}

function pausedOnScreenVideo() {
    const video = onScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    return video;
}

function playButton() {
    return onScreen(fakeNode({
        tag: 'button',
        attributes: { class: 'ytp-play-button', 'data-title-no-tooltip': 'Play' }
    }));
}

test('a prompt YouTube already closed does not hold the gate open', () => {
    // The 2026-09-28 audit case: the prompt was answered, YouTube closed it
    // without removing it, and later the user paused and opened Save or Share.
    // That popup mutation re-ran the gate, the old text passed it, and Play
    // got clicked under the user's menu.
    const play = playButton();
    const { feature, confirmButton, staleButton } = scenario({
        dialogText: 'Video paused. Continue watching?',
        dialogOpen: false,
        playerControl: play,
        video: pausedOnScreenVideo()
    });
    assert.equal(feature._isYouTherePrompt(), false);
    feature._dismiss();
    assert.equal(play.clicked, 0, 'Play must not be clicked for a closed prompt');
    assert.equal(confirmButton.clicked + staleButton.clicked, 0);
});

test('a new prompt is answered through its own button, not a closed one before it', () => {
    const { feature, confirmButton, staleButton } = scenario({
        dialogText: 'Video paused. Continue watching?',
        staleCopy: true,
        video: pausedOnScreenVideo()
    });
    assert.equal(feature._isYouTherePrompt(), true);
    feature._dismiss();
    assert.equal(staleButton.clicked, 0, 'the closed prompt has no box to click');
    assert.equal(confirmButton.clicked, 1);
});

test('a cancellable dialog behind a closed prompt is still refused', () => {
    // The closed prompt's text must not vouch for the open dialog.
    const { feature, confirmButton } = scenario({
        dialogText: 'Unsubscribe from this channel?',
        hasCancelButton: true,
        staleCopy: true,
        video: pausedOnScreenVideo()
    });
    assert.equal(feature._isYouTherePrompt(), false);
    feature._dismiss();
    assert.equal(confirmButton.clicked, 0);
});

test('no prompt on the page means no click at all', () => {
    // The reported bug: a channel page carrying the player it inherited from
    // the watch page, while the user opens any YouTube popup.
    const leftoverPlay = onScreen(fakeNode({
        tag: 'button',
        attributes: { class: 'ytp-play-button', 'data-title-no-tooltip': 'Play' }
    }));
    const { feature } = scenario({
        dialogText: null,
        playerControl: leftoverPlay,
        video: offScreen(fakeNode({ tag: 'video' }))
    });
    feature._dismiss();
    assert.equal(leftoverPlay.clicked, 0, 'a player control must not be clicked with no prompt open');
});

test('a confirm dialog that offers a cancel is not the inactivity prompt', () => {
    // Unsubscribe, delete playlist and clear watch history all render
    // yt-confirm-dialog-renderer and all offer a way out. Auto-confirming one
    // is an account action taken without the user.
    const video = onScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    const { feature, confirmButton } = scenario({
        dialogText: 'Unsubscribe from this channel?',
        hasCancelButton: true,
        video
    });
    assert.equal(feature._isYouTherePrompt(), false);
    feature._dismiss();
    assert.equal(confirmButton.clicked, 0, 'a cancellable dialog must never be auto-confirmed');
});

test('the English prompt is still answered', () => {
    const video = onScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    const { feature, confirmButton } = scenario({
        dialogText: 'Video paused. Continue watching?',
        video
    });
    assert.equal(feature._isYouTherePrompt(), true);
    feature._dismiss();
    assert.equal(confirmButton.clicked, 1, 'the you-there prompt must still be dismissed');
});

test('the locale fallback still answers a single-action prompt on a visible player', () => {
    const video = onScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    const { feature, confirmButton } = scenario({
        dialogText: 'Wiedergabe pausiert. Weiterschauen?',
        video
    });
    assert.equal(feature._isYouTherePrompt(), true);
    feature._dismiss();
    assert.equal(confirmButton.clicked, 1, 'the locale fallback must survive the tightening');
});

test('the locale fallback refuses a player that has no box', () => {
    // Same dialog, but the player is the one YouTube parked off-screen after
    // an SPA route change — so "a video is paused" says nothing about this
    // page.
    const video = offScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    const { feature, confirmButton } = scenario({
        dialogText: 'Wiedergabe pausiert. Weiterschauen?',
        video
    });
    assert.equal(feature._isYouTherePrompt(), false);
    feature._dismiss();
    assert.equal(confirmButton.clicked, 0);
});

test('an off-screen player control is never the thing that gets clicked', () => {
    // The prompt IS up, but the play button belongs to a player with no box.
    // Clicking it would land as an outside click; the dialog's own confirm
    // control is the right target.
    const video = onScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    const detachedPlay = offScreen(fakeNode({
        tag: 'button',
        attributes: { class: 'ytp-play-button', 'data-title-no-tooltip': 'Play' }
    }));
    const { feature, confirmButton } = scenario({
        dialogText: 'Video paused. Continue watching?',
        playerControl: detachedPlay,
        video
    });
    feature._dismiss();
    assert.equal(detachedPlay.clicked, 0, 'a control with no client rect must not be clicked');
    assert.equal(confirmButton.clicked, 1, 'the dialog control answers instead');
});

test('a visible player control is preferred when the prompt is up', () => {
    const video = onScreen(fakeNode({ tag: 'video' }));
    video.paused = true;
    video.ended = false;
    const play = onScreen(fakeNode({
        tag: 'button',
        attributes: { class: 'ytp-play-button', 'data-title-no-tooltip': 'Play' }
    }));
    const { feature, confirmButton } = scenario({
        dialogText: 'Video paused. Continue watching?',
        playerControl: play,
        video
    });
    feature._dismiss();
    assert.equal(play.clicked, 1);
    assert.equal(confirmButton.clicked, 0);
});

test('the userscript runs this same feature rather than a copy of its own', () => {
    assert.equal(readUserscriptBuild().modules.app, 'ytkit.js');
});
