'use strict';

// extension/core/settings-schema.js
//
// v5.0.0 single source of truth for all Astra Deck settings.
// Generated from ROADMAP.md "Full Per-Toggle Settings Schema (354 keys)"
// and extension/default-settings.json. scripts/check-settings.js enforces
// schema <-> default-settings parity on every `npm run check`; build emit
// (extension/default-settings.json) is downstream of this module.
//
// Safe to load as a Node CommonJS module (build + tests) and as an
// ISOLATED-world classic content-script (ytkit.js consumer).

const CATEGORIES = Object.freeze([
    'shell',
    'nav',
    'shorts',
    'feed',
    'watch-player',
    'playback-audio',
    'quality-codec',
    'content-filter',
    'comments',
    'live-chat',
    'subscriptions',
    'enrichment',
    'downloads',
    'subtitles',
    'research-ai',
    'privacy-profiles',
    'a11y-perf',
    'dev-diagnostics',
]);

const RISKS = Object.freeze(['safe', 'api', 'local-companion', 'experimental', 'store-risk']);
const PROFILES = Object.freeze(['store-safe', 'github-full', 'both']);
const SCOPES = Object.freeze(['global', 'feed', 'watch', 'player', 'comments', 'live-chat', 'subscriptions', 'downloads', 'popup']);
const VEHICLES = Object.freeze(['extension', 'userscript', 'both']);
const TYPES = Object.freeze(['boolean', 'string', 'number', 'array', 'object', 'null']);

const SETTINGS_SCHEMA = Object.freeze([

    // ─── nav ───
    Object.freeze({ key: "hideCreateButton", category: "nav", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVoiceSearch", category: "nav", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "logoToSubscriptions", category: "nav", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "widenSearchBar", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "squareSearchBar", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "squareAvatars", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionsGrid", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "homepageGridAlign", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "styledFilterChips", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideSidebar", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "uiStyle", category: "shell", type: "string", defaultValue: "square", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "noAmbientMode", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "compactLayout", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "thinScrollbar", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "watchPageRestyle", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "chatStyleComments", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shorts ───
    Object.freeze({ key: "removeAllShorts", category: "shorts", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "redirectShorts", category: "shorts", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "disablePlayOnHover", category: "shorts", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "fullWidthSubscriptions", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hideSubscriptionOptions", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hidePaidContentOverlay", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "redirectToVideosTab", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── feed ───
    Object.freeze({ key: "hidePlayables", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideMembersOnly", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideNewsHome", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hidePlaylistsHome", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hideRelatedVideos", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "expandVideoWidth", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "floatingLogoOnWatch", category: "shell", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hideDescriptionRow", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideoEndContent", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideJumpAheadButton", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "stickyVideo", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "cleanShareUrls", category: "nav", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── feed ───
    Object.freeze({ key: "videosPerRow", category: "feed", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "quickLinkMenu", category: "nav", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "quickLinkItems", category: "nav", type: "string", defaultValue: "History | /feed/history\nWatch Later | /playlist?list=WL\nPlaylists | /feed/library\nLiked Videos | /playlist?list=LL\nSubscriptions | /feed/subscriptions\nFor You Page | /", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── quality-codec ───
    Object.freeze({ key: "autoMaxResolution", category: "quality-codec", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── feed ───
    Object.freeze({ key: "hideMerchShelf", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideAiSummary", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hideDescriptionExtras", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideHashtags", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "hidePinnedComments", category: "comments", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideCommentDislikeButton", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideCommentActionMenu", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "condenseComments", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideCommentTeaser", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoExpandComments", category: "comments", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── live-chat ───
    Object.freeze({ key: "hideLiveChatEngagement", category: "live-chat", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "live-chat", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "premiumLiveChat", category: "live-chat", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "live-chat", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "reactionSpammer", category: "live-chat", type: "boolean", defaultValue: false, risk: "store-risk", profile: "github-full", scope: "live-chat", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "_reactionSpammerAck", category: "live-chat", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "live-chat", vehicle: 'both', immediateApply: false, destroyRequired: false, internal: true, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hidePaidPromotionWatch", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideChannelJoinButton", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideFundraiser", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── live-chat ───
    Object.freeze({ key: "hiddenChatElementsManager", category: "live-chat", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "live-chat", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hiddenChatElements", category: "live-chat", type: "array", defaultValue: ["header","menu","popout","timestamps","polls","ticker","leaderboard","support","banner","emoji","topFan","superChats","levelUp","bots"], risk: "safe", profile: "both", scope: "live-chat", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "chatKeywordFilter", category: "live-chat", type: "string", defaultValue: "", risk: "safe", profile: "both", scope: "live-chat", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hiddenActionButtonsManager", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hiddenActionButtons", category: "watch-player", type: "array", defaultValue: ["like","share","ask","clip","thanks","save","sponsor","moreActions"], risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hiddenPlayerControlsManager", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hiddenPlayerControls", category: "watch-player", type: "array", defaultValue: ["next","autoplay","subtitles","captions","miniplayer","pip","theater","fullscreen"], risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hiddenWatchElementsManager", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hiddenWatchElements", category: "watch-player", type: "array", defaultValue: ["joinButton","askButton","saveButton","moreActions","askAISection","podcastSection","transcriptSection","channelInfoCards"], risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── downloads ───
    Object.freeze({ key: "showLocalDownloadButton", category: "downloads", type: "boolean", defaultValue: true, risk: "local-companion", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "videoContextMenu", category: "downloads", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "hideCollaborations", category: "watch-player", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── content-filter ───
    Object.freeze({ key: "hideVideosFromHome", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosKeywordFilter", category: "content-filter", type: "string", defaultValue: "", risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosDurationFilter", category: "content-filter", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosSubsLoadLimit", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosSubsLoadThreshold", category: "content-filter", type: "number", defaultValue: 3, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosRemoveHiddenCards", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosShowQuickHideButton", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosAllowChannelBlock", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosRememberRestoredVideos", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosScopeHome", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosScopeSubscriptions", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosScopeSearch", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosScopeWatch", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosScopeChannels", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosScopeOther", category: "content-filter", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosLowViewFilter", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosLowViewThreshold", category: "content-filter", type: "number", defaultValue: 1000, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosHideLive", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosHideUpcoming", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosHideMixes", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosHidePlaylists", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosHideMovies", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosHideAutoDubbed", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideVideosWatchedRatio", category: "content-filter", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── feed ───
    Object.freeze({ key: "hideInfoPanels", category: "feed", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "colorTheme", category: "shell", type: "string", defaultValue: "none", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "commentEnhancements", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── privacy-profiles ───
    Object.freeze({ key: "sidebarOrder", category: "privacy-profiles", type: "null", defaultValue: null, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── quality-codec ───
    Object.freeze({ key: "forceH264", category: "quality-codec", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "titleNormalization", category: "nav", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "watchProgress", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "autoDismissStillWatching", category: "playback-audio", type: "boolean", defaultValue: false, risk: "store-risk", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "remainingTimeDisplay", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "showPlaylistDuration", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "showTimeInTabTitle", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "customProgressBarColor", category: "shell", type: "string", defaultValue: "#ff0000", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "compactUnfixedHeader", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "reversePlaylist", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "rssFeedLink", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "preciseViewCounts", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "videoScreenshot", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "perChannelSpeed", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── content-filter ───
    Object.freeze({ key: "hideWatchedVideos", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideWatchedMode", category: "content-filter", type: "string", defaultValue: "dim", risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "antiTranslate", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "pauseOtherTabs", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "abLoop", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "fineSpeedControl", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "showChannelVideoCount", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "redirectHomeToSubs", category: "nav", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "notInterestedButton", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "timestampBookmarks", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "blueLightFilter", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "blueLightIntensity", category: "playback-audio", type: "number", defaultValue: 30, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── feed ───
    Object.freeze({ key: "disableInfiniteScroll", category: "feed", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "popOutPlayer", category: "watch-player", type: "boolean", defaultValue: false, risk: "experimental", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "watchTimeTracker", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "alwaysShowProgressBar", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "sortCommentsNewest", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "autoSkipChapters", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoSkipChapterPatterns", category: "playback-audio", type: "string", defaultValue: "intro,outro,recap,sponsor", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "chapterNavButtons", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "videoLoopButton", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "persistentSpeed", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "persistentSpeedValue", category: "playback-audio", type: "number", defaultValue: 1, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── quality-codec ───
    Object.freeze({ key: "codecSelector", category: "quality-codec", type: "string", defaultValue: "auto", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "ageRestrictionBypass", category: "playback-audio", type: "boolean", defaultValue: false, risk: "store-risk", profile: "github-full", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoLikeSubscribed", category: "playback-audio", type: "boolean", defaultValue: false, risk: "store-risk", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "thumbnailPreviewSize", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "cinemaAmbientGlow", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "transcriptViewer", category: "watch-player", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "searchFilterDefaults", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "searchFilterSort", category: "playback-audio", type: "string", defaultValue: "upload_date", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── quality-codec ───
    Object.freeze({ key: "forceStandardFps", category: "quality-codec", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "stickyChat", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoExpandDescription", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "keyMoments", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "scrollToPlayer", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideEndCards", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideInfoCards", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoTheaterMode", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "resumePlayback", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "miniPlayerBar", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "playbackStatsOverlay", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "hideNotificationBadge", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "autoPauseOnSwitch", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "creatorCommentHighlight", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "copyVideoTitle", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "channelAgeDisplay", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "speedIndicatorOverlay", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideAutoplayToggle", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "fullscreenOnDoubleClick", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "rememberVolume", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "rememberVolumeLevel", category: "playback-audio", type: "number", defaultValue: 100, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "pipButton", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoSubtitles", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoSubtitleLang", category: "playback-audio", type: "string", defaultValue: "en", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "focusedMode", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "thumbnailQualityUpgrade", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "watchLaterQuickAdd", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "playlistEnhancer", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "commentSearch", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "videoZoom", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "forceDarkEverywhere", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "customCssInjection", category: "shell", type: "boolean", defaultValue: false, risk: "store-risk", profile: "github-full", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "customCssCode", category: "shell", type: "string", defaultValue: "", risk: "store-risk", profile: "github-full", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "shareMenuCleaner", category: "nav", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "autoClosePopups", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "videoResolutionBadge", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "likeViewRatio", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── downloads ───
    Object.freeze({ key: "downloadThumbnail", category: "downloads", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "grayscaleThumbnails", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "disableAutoplayNext", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "channelSubCount", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "customSpeedButtons", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "openInNewTab", category: "nav", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "preventAutoplay", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "hideNotificationButton", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "noFrostedGlass", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "autoOpenChapters", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "autoOpenTranscript", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "chronologicalNotifications", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── feed ───
    Object.freeze({ key: "hideLatestPosts", category: "feed", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "disableMiniPlayer", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "adaptiveLiveLayout", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "commentNavigator", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shorts ───
    Object.freeze({ key: "shortsAsRegularVideo", category: "shorts", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "themeAccentColor", category: "shell", type: "string", defaultValue: "", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "theaterAutoScroll", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "scrollWheelSpeed", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "speedStep", category: "playback-audio", type: "number", defaultValue: 0.25, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "preloadComments", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "playbackSpeedOSD", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "enableCPU_Tamer", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "enableHandleRevealer", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── downloads ───
    Object.freeze({ key: "autoDownloadOnVisit", category: "downloads", type: "boolean", defaultValue: false, risk: "local-companion", profile: "github-full", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadQuality", category: "downloads", type: "string", defaultValue: "best", risk: "local-companion", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadVideoFormat", category: "downloads", type: "string", defaultValue: "mp4", risk: "local-companion", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadAudioFormat", category: "downloads", type: "string", defaultValue: "mp3", risk: "local-companion", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── enrichment ───
    Object.freeze({ key: "deArrow", category: "enrichment", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "daReplaceTitles", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "daReplaceThumbs", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "daTitleFormat", category: "enrichment", type: "string", defaultValue: "sentence", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "daFallbackFormat", category: "enrichment", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "daShowOriginalHover", category: "enrichment", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "daCacheTTL", category: "enrichment", type: "string", defaultValue: "4", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sponsorBlock", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_sponsor", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_intro", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_outro", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_selfpromo", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_interaction", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_music_offtopic", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_preview", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_filler", category: "enrichment", type: "boolean", defaultValue: true, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sbCat_poi_highlight", category: "enrichment", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "showStatisticsDashboard", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── privacy-profiles ───
    Object.freeze({ key: "settingsProfiles", category: "privacy-profiles", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── dev-diagnostics ───
    Object.freeze({ key: "debugMode", category: "dev-diagnostics", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "nyanCatProgressBar", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "fitPlayerToWindow", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── a11y-perf ───
    Object.freeze({ key: "disableSpaNavigation", category: "a11y-perf", type: "boolean", defaultValue: false, risk: "experimental", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "videoRotation", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "videoRotationAngle", category: "playback-audio", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "frameByFrameButtons", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── research-ai ───
    Object.freeze({ key: "digitalWellbeing", category: "research-ai", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "dwBreakIntervalMin", category: "research-ai", type: "number", defaultValue: 30, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "dwDailyCapMin", category: "research-ai", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "dwWatchTimeToday", category: "research-ai", type: "object", defaultValue: {"date":"","seconds":0}, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── privacy-profiles ───
    Object.freeze({ key: "_profiles", category: "privacy-profiles", type: "object", defaultValue: {}, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: false, destroyRequired: false, internal: true, since: "0.1.0" }),
    Object.freeze({ key: "_activeProfile", category: "privacy-profiles", type: "string", defaultValue: "default", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: false, destroyRequired: false, internal: true, since: "0.1.0" }),
    Object.freeze({ key: "privacyDataFlowPanel", category: "privacy-profiles", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "safeStoreProfile", category: "privacy-profiles", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "githubFullProfile", category: "privacy-profiles", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "syncSafePrefs", category: "privacy-profiles", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "syncSafePrefsAllowlist", category: "privacy-profiles", type: "array", defaultValue: ["hideCreateButton","hideVoiceSearch","logoToSubscriptions","widenSearchBar","squareSearchBar","squareAvatars","subscriptionsGrid","homepageGridAlign","styledFilterChips","hideSidebar","uiStyle","compactLayout","thinScrollbar","watchPageRestyle","removeAllShorts","redirectShorts","disablePlayOnHover","fullWidthSubscriptions","hideRelatedVideos","expandVideoWidth","hideDescriptionRow","hideVideoEndContent","hideJumpAheadButton","videosPerRow","autoMaxResolution","colorTheme","themeAccentColor","hideVideosFromHome","hideVideosKeywordFilter","hideVideosDurationFilter","hideVideosSubsLoadLimit","hideVideosSubsLoadThreshold","hideVideosRemoveHiddenCards","hideVideosShowQuickHideButton","hideVideosAllowChannelBlock","hideVideosRememberRestoredVideos","hideVideosScopeHome","hideVideosScopeSubscriptions","hideVideosScopeSearch","hideVideosScopeWatch","hideVideosScopeChannels","hideVideosScopeOther","hideVideosLowViewFilter","hideVideosLowViewThreshold","hideVideosHideLive","hideVideosHideUpcoming","hideVideosHideMixes","hideVideosHidePlaylists","hideVideosHideMovies","hideVideosHideAutoDubbed","hideVideosWatchedRatio","hiddenActionButtonsManager","hiddenActionButtons","hiddenPlayerControlsManager","hiddenPlayerControls","hiddenWatchElementsManager","hiddenWatchElements","sponsorBlock","sbCat_sponsor","sbCat_intro","sbCat_outro","sbCat_selfpromo","sbCat_interaction","sbCat_music_offtopic","sbCat_preview","sbCat_filler","sbCat_poi_highlight"], risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── content-filter ───
    Object.freeze({ key: "advancedLocalPredicate", category: "content-filter", type: "boolean", defaultValue: false, risk: "experimental", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "advancedLocalPredicateCode", category: "content-filter", type: "string", defaultValue: "", risk: "experimental", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── comments ───
    Object.freeze({ key: "commentFilterManager", category: "comments", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "commentFilterRules", category: "comments", type: "string", defaultValue: "", risk: "safe", profile: "both", scope: "comments", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── content-filter ───
    Object.freeze({ key: "bulkCardActions", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "feedTriageProfile", category: "content-filter", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "feed", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "downloadScreenshotFormat", category: "playback-audio", type: "string", defaultValue: "png", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadSubtitlesWithScreenshot", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "volumeWheelMode", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "disableLoudnessNormalization", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "perChannelIntroOutro", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "perChannelIntroOutroData", category: "playback-audio", type: "object", defaultValue: {}, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── quality-codec ───
    Object.freeze({ key: "initialPlayerStateForeground", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "initialPlayerStateBackground", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── downloads ───
    Object.freeze({ key: "downloadHistoryPanel", category: "downloads", type: "boolean", defaultValue: false, risk: "local-companion", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadHealthPanel", category: "downloads", type: "boolean", defaultValue: false, risk: "local-companion", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadStreamLinksPanel", category: "downloads", type: "boolean", defaultValue: false, risk: "local-companion", profile: "github-full", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadCobaltFallback", category: "downloads", type: "boolean", defaultValue: false, risk: "api", profile: "github-full", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "downloadCobaltInstance", category: "downloads", type: "string", defaultValue: "https://api.cobalt.tools/api/json", risk: "api", profile: "github-full", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── enrichment ───
    Object.freeze({ key: "returnDislike", category: "enrichment", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "returnDislikeOnCards", category: "enrichment", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "returnDislikeCacheHours", category: "enrichment", type: "number", defaultValue: 24, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "returnDislikeShowRatio", category: "enrichment", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "deArrowChannelOverrides", category: "enrichment", type: "object", defaultValue: {}, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "deArrowChannelOverridesPanel", category: "enrichment", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── quality-codec ───
    Object.freeze({ key: "qualityProfileMatrix", category: "quality-codec", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "qualityDefaultNormal", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "qualityDefaultTheater", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "qualityDefaultFullscreen", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "qualityDefaultBackground", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "qualityDefaultEmbed", category: "quality-codec", type: "string", defaultValue: "inherit", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "antiTranslateAudioTrack", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "antiTranslateTranscript", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "monetizationIndicator", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── subscriptions ───
    Object.freeze({ key: "subscriptionGroups", category: "subscriptions", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionGroupData", category: "subscriptions", type: "object", defaultValue: {}, risk: "safe", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionSortMode", category: "subscriptions", type: "string", defaultValue: "default", risk: "safe", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionShowNewSinceLastVisit", category: "subscriptions", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionLastVisitData", category: "subscriptions", type: "object", defaultValue: {}, risk: "safe", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionAiTags", category: "subscriptions", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subscriptionAiTagData", category: "subscriptions", type: "object", defaultValue: {}, risk: "safe", profile: "both", scope: "subscriptions", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── research-ai ───
    Object.freeze({ key: "localAiSummary", category: "research-ai", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "researchSpacedReview", category: "research-ai", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "researchTranscriptIndex", category: "research-ai", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "researchTranscriptSearchPanel", category: "research-ai", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── a11y-perf ───
    Object.freeze({ key: "reducedMotion", category: "a11y-perf", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "forcedColorsSupport", category: "a11y-perf", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "globalAriaLiveRegion", category: "a11y-perf", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "lowPowerProfile", category: "a11y-perf", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "lowPowerProfileBackup", category: "a11y-perf", type: "null", defaultValue: null, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "oledTheme", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "denseMode", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "rectangularizeYouTube", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "classicLayoutProfile", category: "shell", type: "string", defaultValue: "modern", risk: "experimental", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "newPlayerUiRestore", category: "shell", type: "boolean", defaultValue: false, risk: "experimental", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "tokenThemeBridge", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "openInAlternativeFrontend", category: "nav", type: "boolean", defaultValue: false, risk: "store-risk", profile: "github-full", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "alternativeFrontendInstance", category: "nav", type: "string", defaultValue: "https://yewtu.be", risk: "store-risk", profile: "github-full", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── downloads ───
    Object.freeze({ key: "vlcMpvHandoff", category: "downloads", type: "boolean", defaultValue: false, risk: "local-companion", profile: "github-full", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "astraContextMenu", category: "downloads", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── a11y-perf ───
    Object.freeze({ key: "youtubeMusicCompat", category: "a11y-perf", type: "boolean", defaultValue: false, risk: "experimental", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── downloads ───
    Object.freeze({ key: "subtitleDownload", category: "downloads", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "downloads", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "videoVisualFilters", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "vvfBrightness", category: "playback-audio", type: "number", defaultValue: 100, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "vvfContrast", category: "playback-audio", type: "number", defaultValue: 100, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "vvfSaturation", category: "playback-audio", type: "number", defaultValue: 100, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "vvfHue", category: "playback-audio", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "vvfGrayscale", category: "playback-audio", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "vvfSepia", category: "playback-audio", type: "number", defaultValue: 0, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── enrichment ───
    Object.freeze({ key: "dearrowPeekButton", category: "enrichment", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "videoAgeColors", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "watchPageTabs", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── research-ai ───
    Object.freeze({ key: "redditComments", category: "research-ai", type: "boolean", defaultValue: false, risk: "api", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── dev-diagnostics ───
    Object.freeze({ key: "diagnosticLog", category: "dev-diagnostics", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "_errors", category: "dev-diagnostics", type: "array", defaultValue: [], risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: false, destroyRequired: false, internal: true, since: "0.1.0" }),

    // ─── privacy-profiles ───
    Object.freeze({ key: "storageQuotaLRU", category: "privacy-profiles", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── a11y-perf ───
    Object.freeze({ key: "apiRetryBackoff", category: "a11y-perf", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── research-ai ───
    Object.freeze({ key: "watchHistoryAnalytics", category: "research-ai", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── subtitles ───
    Object.freeze({ key: "subtitleStyling", category: "subtitles", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleFontSize", category: "subtitles", type: "number", defaultValue: 100, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleFontFamily", category: "subtitles", type: "string", defaultValue: "default", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleColor", category: "subtitles", type: "string", defaultValue: "#ffffff", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleBgOpacity", category: "subtitles", type: "number", defaultValue: 75, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleBgColor", category: "subtitles", type: "string", defaultValue: "#000000", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleBottomOffset", category: "subtitles", type: "number", defaultValue: 10, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "subStyleTextShadow", category: "subtitles", type: "boolean", defaultValue: true, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── research-ai ───
    Object.freeze({ key: "aiVideoSummary", category: "research-ai", type: "boolean", defaultValue: false, risk: "api", profile: "github-full", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "aiSummaryEndpoint", category: "research-ai", type: "string", defaultValue: "https://api.openai.com/v1/chat/completions", risk: "api", profile: "github-full", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "aiSummaryModel", category: "research-ai", type: "string", defaultValue: "gpt-4o-mini", risk: "api", profile: "github-full", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "aiSummaryApiKey", category: "research-ai", type: "string", defaultValue: "", risk: "api", profile: "github-full", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "aiSummaryProvider", category: "research-ai", type: "string", defaultValue: "openai", risk: "api", profile: "github-full", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── watch-player ───
    Object.freeze({ key: "copyChapterMarkdown", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "chapterJumpButtons", category: "watch-player", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── shell ───
    Object.freeze({ key: "hideAirplayButton", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "hideQueueOnThumbnails", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "fullTitles", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "titleCaseTransform", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "titleCaseMode", category: "shell", type: "string", defaultValue: "none", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "customSelectionColor", category: "shell", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "selectionColor", category: "shell", type: "string", defaultValue: "#2dd36f", risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── nav ───
    Object.freeze({ key: "bypassPlaylistMode", category: "nav", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "global", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "musicVideoSpeedLock", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "playlistQuickRemove", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "watchLaterCleanup", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),

    // ─── research-ai ───
    Object.freeze({ key: "transcriptAiHandoff", category: "research-ai", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "transcriptAiTarget", category: "research-ai", type: "string", defaultValue: "notebooklm", risk: "safe", profile: "both", scope: "watch", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),

    // ─── playback-audio ───
    Object.freeze({ key: "audioTrackLanguage", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "preferredAudioLang", category: "playback-audio", type: "string", defaultValue: "en", risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: false, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "notifyAutoDubbedAudio", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
    Object.freeze({ key: "sleepTimer", category: "playback-audio", type: "boolean", defaultValue: false, risk: "safe", profile: "both", scope: "player", vehicle: 'both', immediateApply: true, destroyRequired: true, internal: false, since: "0.1.0" }),
]);

// Build a {key: defaultValue} map for chrome.storage.local seeding +
// for the build-time emit of extension/default-settings.json.
function buildDefaultsFromSchema(schema) {
    const src = schema || SETTINGS_SCHEMA;
    const out = {};
    for (const entry of src) out[entry.key] = entry.defaultValue;
    return out;
}

// Group keys by category in declared order. The popup renders
// category sections from this map.
function getKeysByCategory(schema) {
    const src = schema || SETTINGS_SCHEMA;
    const out = {};
    for (const c of CATEGORIES) out[c] = [];
    for (const entry of src) {
        if (!out[entry.category]) out[entry.category] = [];
        out[entry.category].push(entry.key);
    }
    return out;
}

// O(n) lookup. Cache the result if used on a hot path.
function findSettingEntry(key, schema) {
    const src = schema || SETTINGS_SCHEMA;
    for (const entry of src) if (entry.key === key) return entry;
    return null;
}

// Internal storage-only keys (prefix `_`). Excluded from the popup
// toggle surface and from data-flow advertising; still imported/exported.
function isInternalSettingKey(key) {
    return typeof key === "string" && key.startsWith("_");
}

// Store-safe vs github-full filters drive the dual-profile build.
function getStoreSafeKeys(schema) {
    const src = schema || SETTINGS_SCHEMA;
    return src.filter((e) => e.profile !== "github-full").map((e) => e.key);
}
function getGithubFullKeys(schema) {
    const src = schema || SETTINGS_SCHEMA;
    return src.filter((e) => e.profile === "github-full").map((e) => e.key);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SETTINGS_SCHEMA, CATEGORIES, RISKS, PROFILES, SCOPES, VEHICLES, TYPES,
        buildDefaultsFromSchema, getKeysByCategory, findSettingEntry,
        isInternalSettingKey, getStoreSafeKeys, getGithubFullKeys
    };
}
if (typeof window !== "undefined") {
    window.__YTKIT_SETTINGS_SCHEMA__ = {
        SETTINGS_SCHEMA, CATEGORIES, RISKS, PROFILES, SCOPES, VEHICLES, TYPES,
        buildDefaultsFromSchema, getKeysByCategory, findSettingEntry,
        isInternalSettingKey, getStoreSafeKeys, getGithubFullKeys
    };
}
