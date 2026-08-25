'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// One canonical DOM contract per UI-building feature. The title points to a
// test that invokes the live renderer and reads the resulting tree. Keeping
// this list executable prevents a later source-only replacement from quietly
// reopening the gap this pass closed.
const RENDER_ASSERTION_INVENTORY = Object.freeze([
    ['timestampBookmarks', 'feature-render-surfaces.test.js', 'timestampBookmarks renders the empty state with its own copy, not a bare list', "loadFeature('timestampBookmarks'"],
    ['sleepTimer', 'feature-render-surfaces.test.js', 'sleepTimer renders a countdown chip with the controls that drive it', "loadFeature('sleepTimer'"],
    ['watchHistoryAnalytics', 'feature-render-surfaces.test.js', 'watchHistoryAnalytics renders an empty state rather than thirty zero-height bars', "loadFeature('watchHistoryAnalytics'"],
    ['quickLinkMenu', 'feature-render-surfaces.test.js', 'quickLinkMenu renders its own empty state when nothing is configured', "loadFeature('quickLinkMenu'"],
    ['videoContextMenu', 'feature-render-surfaces.test.js', 'videoContextMenu offers the download actions and hides the installer while the companion runs', "loadFeature('videoContextMenu'"],
    ['commentNavigator', 'feature-render-surfaces.test.js', 'commentNavigator builds one navigator with its live-region counters', "loadFeature('commentNavigator'"],
    ['commentSearch', 'feature-render-surfaces.test.js', 'commentSearch builds one search bar and waits before claiming a count', "loadFeature('commentSearch'"],
    ['aiVideoSummary', 'feature-render-surfaces.test.js', 'aiVideoSummary builds one dialog and replaces its content rather than appending', "loadFeature('aiVideoSummary'"],
    ['customSpeedButtons', 'feature-render-surfaces.test.js', 'customSpeedButtons renders every preset once and marks the active one', "loadFeature('customSpeedButtons'"],
    ['copyVideoTitle', 'feature-render-surfaces.test.js', 'copyVideoTitle builds one button that starts in its idle state', "loadFeature('copyVideoTitle'"],
    ['researchSpacedReview', 'feature-render-surfaces.test.js', 'researchSpacedReview builds one queue panel, hidden until it has rows', "loadFeature('researchSpacedReview'"],
    ['bulkCardActions', 'feature-render-surfaces.test.js', 'bulkCardActions builds one toolbar and keeps it out of the way until select mode', "loadFeature('bulkCardActions'"],
    ['redditComments', 'feature-render-surfaces.test.js', 'redditComments renders a row per thread with its subreddit line', "loadFeature('redditComments'"],
    ['miniPlayerBar', 'feature-render-surfaces.test.js', 'miniPlayerBar builds one bar carrying the current video thumbnail and title', "loadFeature('miniPlayerBar'"],
    ['playlistSearch', 'feature-render-surfaces.test.js', 'playlistSearch builds one bar and reports the unfiltered item count', "loadFeature('playlistSearch'"],
    ['abLoop', 'feature-render-surfaces.test.js', 'abLoop draws the loop region across the progress bar once both points are set', "loadFeature('abLoop'"],
    ['watchPageTabs', 'feature-render-surfaces.test.js', 'watchPageTabs builds one tab bar and opens on the description', "loadFeature('watchPageTabs'"],
    ['playbackStatsOverlay', 'feature-render-surfaces.test.js', 'playbackStatsOverlay builds a hidden overlay and a toggle that reports its state', "loadFeature('playbackStatsOverlay'"],
    ['sbPerChannelProfiles', 'feature-render-surfaces.test.js', 'sbPerChannelProfiles renders a chip that says whether this channel overrides the global set', "loadFeature('sbPerChannelProfiles'"],
    ['videoVisualFilters', 'feature-render-surfaces.test.js', 'videoVisualFilters renders one row per adjustable channel, showing its current value', "loadFeature('videoVisualFilters'"],
    ['downloadThumbnail', 'feature-render-surfaces.test.js', 'downloadThumbnail builds one labelled button next to the watch actions', "loadFeature('downloadThumbnail'"],
    ['volumeWheelMode', 'feature-render-surfaces.test.js', 'volumeWheelMode renders one announced level chip and updates it in place', "loadFeature('volumeWheelMode'"],
    ['wheelSeek', 'feature-render-surfaces.test.js', 'wheelSeek renders one announced position chip that names the direction', "loadFeature('wheelSeek'"],
    ['astraContextMenu', 'feature-render-surfaces.test.js', 'astraContextMenu offers the player actions on the player and nothing elsewhere', "loadFeature('astraContextMenu'"],
    ['transcriptAiHandoff', 'feature-render-surfaces.test.js', 'transcriptAiHandoff builds one labelled player button carrying its glyph', "loadFeature('transcriptAiHandoff'"],
    ['deArrowVoting', 'feature-render-surfaces.test.js', 'deArrowVoting attaches one vote pair to a replaced title', "loadFeature('deArrowVoting'"],
    ['videoScreenshot', 'feature-render-surfaces.test.js', 'videoScreenshot builds one announced player button in its idle state', "loadFeature('videoScreenshot'"],
    ['subscriptionGroups', 'subscription-groups.test.js', 'an empty group renders a notice explaining the blank feed', 'createSubscriptionGroupsFeature('],
    ['transcriptViewer', 'transcript-export.test.js', 'a transcript state renders a titled shell into the body', "loadFeature('transcriptViewer'"],
    ['watchLaterWorkbench', 'watch-later-workbench.test.js', 'watchLaterWorkbench builds one recovery row per restorable entry', "loadFeature('watchLaterWorkbench'"],
    ['settingsPanel', 'settings-panel.test.js', 'the settings search count announces itself', 'appendSettingsSearchStatus('],
    ['ageRestrictionBypass', 'age-restriction.test.js', 'ageRestrictionBypass replaces the gated player with one accessible embed', "loadFeature('ageRestrictionBypass'"],
    ['preciseViewCounts', 'absolute-upload-dates.test.js', 'precise watch metadata attaches one accessible exact date beside the native date', "loadFeature('preciseViewCounts'"],
    ['videoAgeColors', 'absolute-upload-dates.test.js', 'video age cards render an approximate absolute date and restore the native metadata', "loadFeature('videoAgeColors'"],
    ['likeViewRatio', 'like-view-ratio.test.js', 'the rendered badge reports the counts it divided and replaces itself in place', "loadFeature('likeViewRatio'"],
    ['floatingLogoOnWatch', 'player-dock.test.js', 'Player Dock renders one accessible control group and tears it down', 'createFloatingLogoOnWatchFeature('],
    ['searchWhileWatching', 'search-while-watching.test.js', 'search panel renders loading, results, keyboard close, and teardown in the page tree', 'createSearchWhileWatchingFeature('],
    ['subscriptionView', 'subscription-view.test.js', 'subscription layouts render one labelled toolbar with persistent view state', 'createSubscriptionViewFeature('],
    ['elementZapper', 'element-zapper-apply.test.js', 'the picker renders its three owned surfaces into the page body', 'createElementZapperFeature'],
    ['returnDislike', 'return-dislike.test.js', 'Return Dislike renders the estimated count on the Shorts action bar across reel navigation', 'createReturnDislikeFeature('],
    ['returnDislikeOnCards', 'return-dislike.test.js', 'thumbnail ratio bars render on the thumbnail with a text equivalent and clean teardown', 'createReturnDislikeCardsFeature('],
    ['videoInsights', 'video-insights.test.js', 'video insights renders complete page metadata into one labelled region', 'createVideoInsightsFeature('],
    ['stickyVideo', 'theater-split.test.js', 'Theater Split renders its divider and close action into the overlay it owns', 'createStickyVideoFeature('],
    ['downloadUI', 'next-monolith-peel.test.js', 'downloadUI renders the playlist chooser into its row with real checkbox controls', 'renderDownloadPlaylistItems(']
]);

function testBlock(source, title) {
    const start = source.indexOf(`test('${title}'`);
    assert.ok(start >= 0, `render inventory title is missing: ${title}`);
    const next = source.indexOf('\ntest(', start + 6);
    return source.slice(start, next < 0 ? source.length : next);
}

test('every inventoried UI builder has a live renderer and tree assertion', () => {
    const ids = RENDER_ASSERTION_INVENTORY.map(([id]) => id);
    assert.equal(new Set(ids).size, ids.length, 'each UI builder must appear once');

    for (const [id, file, title, runtimeMarker] of RENDER_ASSERTION_INVENTORY) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        assert.ok(source.includes(runtimeMarker), `${id} must invoke its live runtime`);
        const block = testBlock(source, title);
        assert.match(block, /assert\.(?:equal|deepEqual|ok|match|doesNotMatch)\(/,
            `${id} must assert on the rendered result`);
        assert.match(block, /(?:children|querySelector|isConnected|getAttribute|classList|parentElement|dataset|textContent|hidden|style)/,
            `${id} must read the built tree, not only return values`);
        assert.doesNotMatch(block, /(?:readFileSync|featureSlice|extractFeatureBlock|MODULE_SOURCE)/,
            `${id} render evidence must not inspect implementation text`);
    }
});
test('converted UI contracts retain explicit placement or teardown oracles', () => {
    const placementEvidence = [
        ['return-dislike.test.js', 'the bar must attach inside the thumbnail it describes'],
        ['video-insights.test.js', 'the panel attaches to watch metadata, not a detached node'],
        ['watch-later-workbench.test.js', 'placement oracle must stay empty'],
        ['settings-panel.test.js', 'placement oracle must reject a count redirected to a sibling'],
        ['theater-split.test.js', 'placement oracle must reject a render redirected to a sibling'],
        ['next-monolith-peel.test.js', 'placement oracle must reject a chooser redirected to a sibling']
    ];
    for (const [file, marker] of placementEvidence) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        assert.ok(source.includes(marker), `${file} must keep its wrong-parent bait assertion`);
    }
});
