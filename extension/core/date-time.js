(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.parseYouTubeDate) return;

    function parseYouTubeDate(value) {
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
        }

        const raw = String(value || '').trim();
        if (!raw) return null;
        const calendarDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const date = calendarDate
            ? new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]))
            : new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function hasExplicitTime(value) {
        return typeof value === 'string' && /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(value.trim());
    }

    function formatAbsoluteYouTubeDate(value, options = {}) {
        const date = parseYouTubeDate(value);
        if (!date) return '';

        const includeTime = options.includeTime === undefined
            ? hasExplicitTime(value)
            : Boolean(options.includeTime);
        const formatOptions = includeTime
            ? { dateStyle: 'long', timeStyle: 'short' }
            : { dateStyle: options.dateStyle || 'long' };

        return new Intl.DateTimeFormat(options.locale, formatOptions).format(date);
    }

    function subtractCalendarUnits(date, amount, unit) {
        const result = new Date(date.getTime());
        const originalDay = result.getDate();

        if (unit === 'month' || unit === 'year') {
            result.setDate(1);
            if (unit === 'month') result.setMonth(result.getMonth() - amount);
            else result.setFullYear(result.getFullYear() - amount);
            const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
            result.setDate(Math.min(originalDay, lastDay));
            return result;
        }

        const unitMs = {
            second: 1000,
            minute: 60000,
            hour: 3600000,
            day: 86400000,
            week: 604800000
        }[unit];
        return unitMs ? new Date(result.getTime() - (amount * unitMs)) : null;
    }

    function parseRelativeYouTubeAge(text, now = new Date()) {
        const reference = parseYouTubeDate(now);
        if (!reference) return null;

        const normalized = String(text || '').replace(/\u00a0/g, ' ').trim();
        if (!normalized) return null;
        if (/\byesterday\b/i.test(normalized)) {
            return { date: subtractCalendarUnits(reference, 1, 'day'), unit: 'day', approximate: true };
        }
        if (/\btoday\b/i.test(normalized) || /\bjust now\b/i.test(normalized)) {
            return { date: new Date(reference.getTime()), unit: 'day', approximate: true };
        }

        const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(second|minute|hour|day|week|month|year)s?\s+ago\b/i);
        if (!match) return null;
        const amount = Number(match[1].replace(',', '.'));
        if (!Number.isFinite(amount) || amount < 0) return null;
        const unit = match[2].toLowerCase();
        const date = subtractCalendarUnits(reference, amount, unit);
        return date ? { date, unit, approximate: true } : null;
    }

    function formatApproximateYouTubeDate(relativeAge, options = {}) {
        const date = parseYouTubeDate(relativeAge?.date);
        if (!date) return '';

        return new Intl.DateTimeFormat(options.locale, {
            dateStyle: options.dateStyle || 'medium'
        }).format(date);
    }

    Object.assign(core, {
        formatAbsoluteYouTubeDate,
        formatApproximateYouTubeDate,
        hasExplicitTime,
        parseRelativeYouTubeAge,
        parseYouTubeDate
    });
})();
