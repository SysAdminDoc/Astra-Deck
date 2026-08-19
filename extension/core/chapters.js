(() => {
    'use strict';

    // extension/core/chapters.js
    //
    // v4.70.0 — recovering ORIGINAL chapter titles.
    //
    // Astra Deck already restores original titles, descriptions, thumbnails,
    // transcripts and audio tracks. Chapters were the hole in that matrix: the
    // chapter rail, the player's hover label and the three features that read
    // chapter text (autoSkipChapters, chapterJumpButtons, copyChapterMarkdown)
    // all take whatever YouTube rendered, which is the TRANSLATED string.
    //
    // Where the original lives, and why it is this and not a payload field:
    // description chapters ARE the description. YouTube builds them by parsing
    // timestamp lines out of the video description, so the original chapter
    // titles are already sitting in `videoDetails.shortDescription` — the same
    // locale-independent source the description un-translate has used since
    // v3.23.0. Parsing them back out needs no new network call, no new payload
    // shape to guess at, and no permission.
    //
    // The validation below is YouTube's own published rule set for description
    // chapters (first chapter at 0:00, at least three of them, each at least
    // ten seconds, ascending). Those rules are what make this safe: a
    // description that merely MENTIONS some timestamps does not satisfy them,
    // so a shopping list of "3:40 my favourite bit" links cannot be mistaken
    // for a chapter list and painted over the real one.
    //
    // Pure: text in, plain data out. No DOM, no player, no settings.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.parseDescriptionChapters) return;

    // A description is user text and can be enormous. Chapter lists are not.
    const MAX_LINES_SCANNED = 400;
    const MAX_CHAPTERS = 120;
    const MAX_TITLE_LENGTH = 300;

    // YouTube's published requirements for description chapters.
    const MIN_CHAPTERS = 3;
    const MIN_CHAPTER_SECONDS = 10;

    // `1:23`, `01:23`, `1:02:03`, `01:02:03`, and `120:00` — a long video's
    // description often keeps counting minutes past 99 instead of switching to
    // hours, and dropping those would silently truncate the tail of a real
    // chapter list. Anchored to the start of the line (after optional list
    // punctuation) because a timestamp in the middle of a sentence is a
    // reference, not a chapter heading.
    const CHAPTER_LINE = /^[\s\-–—•*]*\(?((?:\d{1,2}:)?\d{1,3}:\d{2})\)?[\s\-–—:|)\]]*(.*)$/;

    function parseTimestamp(text) {
        const raw = String(text || '').trim();
        const match = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(raw);
        if (!match) return null;
        const hours = match[1] ? Number(match[1]) : 0;
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
        // Seconds past 59 are always malformed. Minutes past 59 are malformed
        // only when an hour part is already carrying that magnitude — on its
        // own, "90:00" is simply how a 1h30m mark gets written.
        if (seconds > 59) return null;
        if (match[1] && minutes > 59) return null;
        return (hours * 3600) + (minutes * 60) + seconds;
    }

    // Parse the chapter list out of a description. Returns [] whenever the
    // text does not satisfy YouTube's rules for a real chapter list — an empty
    // result means "this description has no chapters", which callers must
    // treat as "leave the rendered chapters alone".
    function parseDescriptionChapters(description) {
        const text = String(description || '');
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        const found = [];
        const limit = Math.min(lines.length, MAX_LINES_SCANNED);
        for (let index = 0; index < limit; index += 1) {
            const match = CHAPTER_LINE.exec(lines[index]);
            if (!match) continue;
            const startSeconds = parseTimestamp(match[1]);
            if (startSeconds === null) continue;
            const title = String(match[2] || '').trim().slice(0, MAX_TITLE_LENGTH);
            // A stamp with no text beside it labels nothing.
            if (!title) continue;
            found.push({ startSeconds, title });
            if (found.length > MAX_CHAPTERS) return [];
        }

        if (found.length < MIN_CHAPTERS) return [];
        // Description chapters must open at 0:00. This is the single most
        // useful rule: it rejects descriptions that merely cite timestamps.
        if (found[0].startSeconds !== 0) return [];
        for (let index = 1; index < found.length; index += 1) {
            const gap = found[index].startSeconds - found[index - 1].startSeconds;
            if (gap < MIN_CHAPTER_SECONDS) return [];
        }
        return found;
    }

    // Find the original title for a chapter that RENDERS at `startSeconds`.
    // Exact match first; then a small tolerance, because the rail rounds a
    // stamp to the second it displays and the player can report a chapter
    // boundary a hair off the parsed value.
    function findChapterTitle(chapters, startSeconds, options) {
        if (!Array.isArray(chapters) || !chapters.length) return null;
        if (!Number.isFinite(startSeconds)) return null;
        const tolerance = options && Number.isFinite(options.toleranceSeconds)
            ? Math.max(0, options.toleranceSeconds)
            : 1;
        let best = null;
        let bestDelta = Infinity;
        for (const chapter of chapters) {
            const delta = Math.abs(chapter.startSeconds - startSeconds);
            if (delta <= tolerance && delta < bestDelta) {
                best = chapter;
                bestDelta = delta;
            }
        }
        return best ? best.title : null;
    }

    // Given the chapter rows YouTube rendered (each carrying the timestamp
    // text it displays and the title it displays), work out which titles were
    // translated and what they should say instead. Rows whose displayed title
    // already matches the original are left out of the result entirely, so a
    // caller can treat a non-empty plan as "there is work to do".
    function planChapterRestore(renderedRows, chapters, options) {
        const plan = [];
        if (!Array.isArray(renderedRows) || !Array.isArray(chapters) || !chapters.length) return plan;
        for (const row of renderedRows) {
            if (!row) continue;
            const startSeconds = Number.isFinite(row.startSeconds)
                ? row.startSeconds
                : parseTimestamp(row.timestampText);
            if (startSeconds === null || !Number.isFinite(startSeconds)) continue;
            const original = findChapterTitle(chapters, startSeconds, options);
            if (!original) continue;
            const displayed = String(row.title || '').trim();
            if (!displayed || displayed === original) continue;
            plan.push({ startSeconds, from: displayed, to: original, row });
        }
        return plan;
    }

    core.parseChapterTimestamp = parseTimestamp;
    core.parseDescriptionChapters = parseDescriptionChapters;
    core.findChapterTitle = findChapterTitle;
    core.planChapterRestore = planChapterRestore;
})();
