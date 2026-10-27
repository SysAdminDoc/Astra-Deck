(() => {
    'use strict';

    // extension/core/feature-disable-feed.js
    //
    // The remote broken-feature disable feed.
    //
    // 291 DOM-coupled features, one maintainer, no CI, and a site that
    // reshuffles the watch page without warning. When YouTube breaks feature X
    // the only remedy available today is cutting a release, which means the
    // break lasts as long as store review does. Refined GitHub answers the same
    // problem with a CSV on a static host: name the feature, name the issue,
    // name the versions it is broken in, and every install stops running it
    // within one cache window.
    //
    // The mechanism is deliberately one-directional and this module is where
    // that is enforced. A feed row can do exactly one thing: stop a feature
    // from activating. It cannot turn a feature on, cannot write a setting,
    // cannot change a value, and cannot put its own text or its own links in
    // front of the user. Everything the UI says about a disabled feature is a
    // localized string in this extension; the only thing the feed contributes
    // to that copy is an integer issue number.
    //
    // Structural reasons that holds, in order of how much they matter:
    //
    //   1. The parser's output is a Set of feature IDs plus per-ID metadata.
    //      There is no "enabled" shape to return, so a hostile row has nothing
    //      to aim at. The consumer (`shouldFeatureBeActive` in ytkit.js) reads
    //      it as one more reason to return false, after the user's own setting
    //      has already been consulted.
    //   2. A row's feature ID must resolve to an identity the shipped schema
    //      already knows, through the same alias table stored settings use. An
    //      ID nothing recognises is dropped, so the feed cannot name a setting
    //      that does not exist and cannot reach anything outside the toggle
    //      surface.
    //   3. The issue column is an integer, never a URL. The link the user sees
    //      is built here from the project's own tracker origin.
    //   4. Every row is scoped to a version range. A row that does not name the
    //      version it broke in is malformed, not open-ended, because "broken in
    //      every version forever" is the shape a mistake takes.
    //
    // Feed format — CSV, one entry per line, `#` starts a comment line:
    //
    //   feature,issue,broken-from,fixed-in
    //   returnDislike,412,4.80.0,4.84.0
    //   sponsorblock,415,4.83.0,
    //
    // `broken-from` is inclusive, `fixed-in` is exclusive and may be empty for
    // "still broken". A row applies when broken-from <= running < fixed-in.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.parseFeatureDisableFeed) return;

    // Static host, project-owned, data only. raw.githubusercontent.com is
    // already a declared host permission and already carries the selector-pack
    // repair asset, so the feed adds no new origin to the disclosure surface.
    // GitHub Pages would give a friendlier cache story but would cost a new
    // host permission for one text file.
    const FEATURE_DISABLE_FEED_URL =
        'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/heads/main/feature-disable-feed.csv';

    const FEATURE_DISABLE_ISSUE_URL_PREFIX = 'https://github.com/SysAdminDoc/Astra-Deck/issues/';

    // Refined GitHub's numbers, and they are the right shape: long enough that
    // a feed outage is invisible, short enough that a fix reaches installs the
    // same day.
    const FEATURE_DISABLE_FEED_MAX_AGE_MS = 6 * 60 * 60 * 1000;          // 6 hours
    const FEATURE_DISABLE_FEED_STALE_MS = 30 * 24 * 60 * 60 * 1000;      // 30 days

    const MAX_FEED_BYTES = 64 * 1024;
    const MAX_FEED_ROWS = 200;
    const MAX_ISSUE_NUMBER = 999999;

    const FEATURE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
    const VERSION_PATTERN = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;

    function parseVersion(value) {
        const match = VERSION_PATTERN.exec(String(value || '').trim());
        if (!match) return null;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    // The running version comes from the build, not the feed, and it is the
    // one input whose rejection turns the whole mechanism off. Chrome accepts
    // four-part manifest versions and release tooling grows prerelease
    // suffixes, so a strict three-part match would silently disable the kill
    // switch on a build that is otherwise fine. Read the leading three
    // components and ignore the rest; anything without three is still a
    // refusal, because comparing against a version we cannot order would be
    // guessing.
    function parseRunningVersion(value) {
        const match = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[.\-+].*)?$/.exec(String(value || '').trim());
        if (!match) return null;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    function compareVersions(a, b) {
        for (let i = 0; i < 3; i += 1) {
            if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
        }
        return 0;
    }

    // Splits one CSV line. The feed carries identifiers, integers, and dotted
    // numbers — no quoting, no embedded commas — so a full CSV reader would be
    // a larger surface than the format needs. A row that contains a quote is
    // rejected rather than interpreted, so the strictness is visible rather
    // than silently lenient.
    function splitRow(line) {
        if (line.includes('"') || line.includes("'")) return null;
        return line.split(',').map((cell) => cell.trim());
    }

    /**
     * Parses the feed into the set of features that must not activate.
     *
     * @param {string} text            raw feed body
     * @param {object} options
     * @param {string} options.version running extension version
     * @param {function} [options.resolveId]  stored-identity alias resolver
     * @param {Set|Array} [options.knownIds]  identities the schema ships; a row
     *                                        naming anything else is dropped
     * @returns {{entries: Array, disabled: Set<string>, rejected: Array}}
     */
    function parseFeatureDisableFeed(text, options = {}) {
        const rejected = [];
        const entries = [];
        const disabled = new Set();
        const seen = new Set();

        const running = parseRunningVersion(options.version);
        const resolveId = typeof options.resolveId === 'function'
            ? options.resolveId
            : (id) => id;
        const known = options.knownIds instanceof Set
            ? options.knownIds
            : (Array.isArray(options.knownIds) ? new Set(options.knownIds) : null);

        const body = typeof text === 'string' ? text : '';
        // A body over the cap is not truncated and read anyway — a partial read
        // of a list whose whole job is to be authoritative is worse than none.
        if (!body || body.length > MAX_FEED_BYTES) {
            if (body) rejected.push({ line: 0, raw: '', reason: 'feed-too-large' });
            return { entries, disabled, rejected };
        }
        if (!running) {
            rejected.push({ line: 0, raw: '', reason: 'unknown-running-version' });
            return { entries, disabled, rejected };
        }

        const lines = body.split(/\r?\n/);
        let dataRows = 0;

        for (let index = 0; index < lines.length; index += 1) {
            const raw = lines[index];
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;

            dataRows += 1;
            if (dataRows > MAX_FEED_ROWS) {
                rejected.push({ line: index + 1, raw: line, reason: 'too-many-rows' });
                break;
            }

            const cells = splitRow(line);
            if (!cells) {
                rejected.push({ line: index + 1, raw: line, reason: 'quoted-cell' });
                continue;
            }
            // A header row is tolerated so the file reads as a table.
            if (dataRows === 1 && cells[0] === 'feature' && cells[1] === 'issue') {
                dataRows -= 1;
                continue;
            }
            if (cells.length !== 4) {
                rejected.push({ line: index + 1, raw: line, reason: 'column-count' });
                continue;
            }

            const [rawId, rawIssue, rawFrom, rawFixed] = cells;

            if (!FEATURE_ID_PATTERN.test(rawId)) {
                rejected.push({ line: index + 1, raw: line, reason: 'malformed-feature-id' });
                continue;
            }
            const featureId = resolveId(rawId) || rawId;
            if (known && !known.has(featureId)) {
                rejected.push({ line: index + 1, raw: line, reason: 'unknown-feature-id' });
                continue;
            }

            if (!/^\d{1,6}$/.test(rawIssue)) {
                rejected.push({ line: index + 1, raw: line, reason: 'malformed-issue' });
                continue;
            }
            const issue = Number(rawIssue);
            if (issue < 1 || issue > MAX_ISSUE_NUMBER) {
                rejected.push({ line: index + 1, raw: line, reason: 'malformed-issue' });
                continue;
            }

            const brokenFrom = parseVersion(rawFrom);
            if (!brokenFrom) {
                rejected.push({ line: index + 1, raw: line, reason: 'malformed-broken-from' });
                continue;
            }
            const fixedIn = rawFixed === '' ? null : parseVersion(rawFixed);
            if (rawFixed !== '' && !fixedIn) {
                rejected.push({ line: index + 1, raw: line, reason: 'malformed-fixed-in' });
                continue;
            }
            if (fixedIn && compareVersions(fixedIn, brokenFrom) <= 0) {
                rejected.push({ line: index + 1, raw: line, reason: 'inverted-range' });
                continue;
            }

            // Range first, identity second. A feature YouTube breaks twice
            // gets two rows — one closed range and one open — and claiming the
            // ID on the closed row would reject the open one as a duplicate
            // and silently leave the feature running. A row that does not
            // apply to this build is not a claim on the identity at all.
            const applies = compareVersions(running, brokenFrom) >= 0
                && (!fixedIn || compareVersions(running, fixedIn) < 0);
            if (!applies) continue;

            if (seen.has(featureId)) {
                rejected.push({ line: index + 1, raw: line, reason: 'duplicate-feature-id' });
                continue;
            }
            seen.add(featureId);

            entries.push(Object.freeze({
                featureId,
                issue,
                issueUrl: FEATURE_DISABLE_ISSUE_URL_PREFIX + String(issue),
                brokenFrom: rawFrom,
                fixedIn: rawFixed || null
            }));
            disabled.add(featureId);
        }

        return { entries, disabled, rejected };
    }

    // Signed freshness. The signature covers the whole body, and the body's
    // first line says which feed this is and how long it stays good:
    //
    //   # astra-feed: sequence=7 issued=2026-10-26T18:00:00Z expires=2026-12-25T18:00:00Z
    //
    // Builds before v4.100.4 read it as a comment. The receipt time a client
    // stamps on its cache says when it last checked, never how old the feed
    // is, because replaying an old signed copy would reset that clock. The
    // sequence goes up by one every time the feed is signed, so a client that
    // remembers the highest one it has seen can refuse an older copy.
    const FEED_ENVELOPE_PREFIX = '# astra-feed:';
    const FEED_ENVELOPE_PATTERN = /^# astra-feed: sequence=([1-9]\d{0,14}) issued=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) expires=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/;
    const FEED_MAX_VALIDITY_MS = 90 * 24 * 60 * 60 * 1000;               // 90 days
    const FEED_DEFAULT_VALIDITY_MS = 60 * 24 * 60 * 60 * 1000;           // 60 days
    // A client clock running a day behind still takes a feed signed today.
    const FEED_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

    function parseUtcStamp(value) {
        const ms = Date.parse(value);
        // Date.parse rolls 2026-02-31 over to March; a stamp that does not
        // round-trip was not written by the signer.
        if (!Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z', 'Z') !== value) return null;
        return ms;
    }

    // Returns { sequence, issuedAt, expiresAt } or null. The envelope must be
    // the first line and appear once, so there is never a question of which
    // of two headers counts.
    function readFeedEnvelope(text) {
        if (typeof text !== 'string' || !text) return null;
        const lines = text.split(/\r?\n/);
        const match = FEED_ENVELOPE_PATTERN.exec(lines[0]);
        if (!match) return null;
        if (lines.slice(1).some((line) => line.trim().startsWith(FEED_ENVELOPE_PREFIX))) return null;
        const sequence = Number(match[1]);
        const issuedAt = parseUtcStamp(match[2]);
        const expiresAt = parseUtcStamp(match[3]);
        if (!Number.isSafeInteger(sequence) || issuedAt === null || expiresAt === null) return null;
        if (expiresAt <= issuedAt || expiresAt - issuedAt > FEED_MAX_VALIDITY_MS) return null;
        return { sequence, issuedAt, expiresAt };
    }

    // Why a signed envelope can't be used at `now`, or null when it can.
    function checkFeedEnvelope(envelope, now, skewMs = FEED_CLOCK_SKEW_MS) {
        if (!envelope) return 'missing-envelope';
        if (envelope.issuedAt > now + skewMs) return 'issued-in-future';
        if (now >= envelope.expiresAt) return 'expired';
        return null;
    }

    function formatFeedEnvelope({ sequence, issuedAt, expiresAt }) {
        const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
        return `${FEED_ENVELOPE_PREFIX} sequence=${sequence} issued=${stamp(issuedAt)} expires=${stamp(expiresAt)}`;
    }

    // Replaces the envelope line, or adds one above an unsigned body.
    function stampFeedEnvelope(text, envelope) {
        let body = String(text || '');
        // An editor-added byte-order mark would hide the old envelope from the
        // check below, leaving two, which the reader refuses.
        if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
        const eol = body.includes('\r\n') ? '\r\n' : '\n';
        const lines = body.split(/\r?\n/);
        if (lines[0].startsWith(FEED_ENVELOPE_PREFIX)) lines.shift();
        return [formatFeedEnvelope(envelope), ...lines].join(eol);
    }

    // Decides what to do with a cached feed body without fetching anything.
    // Split out from the fetch so the freshness policy is testable on its own
    // and so a caller with no network still gets the right answer.
    //   'fresh'   inside the max-age window; use it, do not refetch
    //   'stale'   past max-age but inside the stale window; use it AND refetch
    //   'expired' past the stale window; do not use it, refetch
    function classifyFeedCache(cachedAt, now, maxAgeMs = FEATURE_DISABLE_FEED_MAX_AGE_MS,
        staleMs = FEATURE_DISABLE_FEED_STALE_MS) {
        if (!Number.isFinite(cachedAt) || cachedAt <= 0) return 'expired';
        const age = now - cachedAt;
        // A cache stamped in the future is a clock change, not a fresh read.
        if (age < 0) return 'expired';
        if (age <= maxAgeMs) return 'fresh';
        if (age <= staleMs) return 'stale';
        return 'expired';
    }

    core.parseFeatureDisableFeed = parseFeatureDisableFeed;
    core.classifyFeatureDisableFeedCache = classifyFeedCache;
    core.FEATURE_DISABLE_FEED_URL = FEATURE_DISABLE_FEED_URL;
    core.FEATURE_DISABLE_FEED_MAX_AGE_MS = FEATURE_DISABLE_FEED_MAX_AGE_MS;
    core.FEATURE_DISABLE_FEED_STALE_MS = FEATURE_DISABLE_FEED_STALE_MS;
    core.FEATURE_DISABLE_FEED_MAX_BYTES = MAX_FEED_BYTES;
    core.readFeatureDisableFeedEnvelope = readFeedEnvelope;
    core.checkFeatureDisableFeedEnvelope = checkFeedEnvelope;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            parseFeatureDisableFeed,
            classifyFeatureDisableFeedCache: classifyFeedCache,
            readFeedEnvelope,
            checkFeedEnvelope,
            formatFeedEnvelope,
            stampFeedEnvelope,
            FEED_MAX_VALIDITY_MS,
            FEED_DEFAULT_VALIDITY_MS,
            FEED_CLOCK_SKEW_MS,
            FEATURE_DISABLE_FEED_URL,
            FEATURE_DISABLE_FEED_MAX_AGE_MS,
            FEATURE_DISABLE_FEED_STALE_MS,
            FEATURE_DISABLE_FEED_MAX_BYTES: MAX_FEED_BYTES
        };
    }
})();
