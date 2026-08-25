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

    function formatRelativeTimestamp(value, options = {}) {
        const timestamp = value instanceof Date ? value.getTime() : Number(value);
        const nowValue = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
        if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(nowValue)) return '';

        const deltaSeconds = (timestamp - nowValue) / 1000;
        const absoluteSeconds = Math.abs(deltaSeconds);
        let unit = 'second';
        let divisor = 1;
        if (absoluteSeconds >= 31536000) {
            unit = 'year';
            divisor = 31536000;
        } else if (absoluteSeconds >= 2592000) {
            unit = 'month';
            divisor = 2592000;
        } else if (absoluteSeconds >= 604800) {
            unit = 'week';
            divisor = 604800;
        } else if (absoluteSeconds >= 86400) {
            unit = 'day';
            divisor = 86400;
        } else if (absoluteSeconds >= 3600) {
            unit = 'hour';
            divisor = 3600;
        } else if (absoluteSeconds >= 60) {
            unit = 'minute';
            divisor = 60;
        }
        const amount = Math.round(deltaSeconds / divisor);
        try {
            return new Intl.RelativeTimeFormat(options.locale, { numeric: 'auto' }).format(amount, unit);
        } catch (_) {
            const magnitude = Math.abs(amount);
            const label = `${unit}${magnitude === 1 ? '' : 's'}`;
            return amount > 0 ? `in ${magnitude} ${label}` : `${magnitude} ${label} ago`;
        }
    }

    function durationParts(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        return {
            hours: Math.floor(total / 3600),
            minutes: Math.floor((total % 3600) / 60),
            seconds: total % 60
        };
    }

    function formatDurationFallback(seconds, options = {}) {
        const { hours, minutes, seconds: remainder } = durationParts(seconds);
        if (options.style === 'digital') {
            // With an hours field in front, minutes have to be two digits or
            // the clock reads "1:2:03". Chrome 120 to 128 takes this path
            // (Intl.DurationFormat landed in 129) and the manifest floor is
            // 120, so the platform path never covered it. Leading minutes stay
            // unpadded, which is how YouTube renders its own durations.
            const clock = hours > 0
                ? `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
                : `${minutes}:${String(remainder).padStart(2, '0')}`;
            return hours > 0 ? `${hours}:${clock}` : clock;
        }
        const includeSeconds = options.includeSeconds !== false;
        const includeHours = hours > 0;
        const parts = [];
        if (includeHours) parts.push(`${hours}h`);
        if (minutes > 0 || includeHours || !includeSeconds) parts.push(`${minutes}m`);
        if (includeSeconds && (remainder > 0 || parts.length === 0)) parts.push(`${remainder}s`);
        return parts.join(' ');
    }

    function formatDuration(seconds, options = {}) {
        const parts = durationParts(seconds);
        const style = ['long', 'short', 'narrow', 'digital'].includes(options.style)
            ? options.style
            : 'short';
        const includeSeconds = options.includeSeconds !== false;
        const duration = {};

        if (parts.hours > 0) duration.hours = parts.hours;
        if (parts.minutes > 0 || parts.hours > 0 || (!includeSeconds && !Object.keys(duration).length)) {
            duration.minutes = parts.minutes;
        }
        if (includeSeconds && (parts.seconds > 0 || !Object.keys(duration).length)) {
            duration.seconds = parts.seconds;
        }

        const IntlObject = typeof globalThis !== 'undefined' ? globalThis.Intl : null;
        if (typeof IntlObject?.DurationFormat === 'function') {
            try {
                const formatted = new IntlObject.DurationFormat(options.locale, { style }).format(duration);
                if (style === 'digital' && parts.hours === 0) {
                    const clock = formatted.split(':');
                    if (clock.length >= 3) clock.shift();
                    if (clock.length >= 2) clock[0] = clock[0].replace(/^0(?=\d)/, '');
                    return clock.join(':');
                }
                return formatted;
            } catch (_) {
                // reason: older engines or an invalid locale fall back to the
                // compact, deterministic formatter below.
            }
        }
        return formatDurationFallback(seconds, options);
    }

    Object.assign(core, {
        formatDuration,
        formatAbsoluteYouTubeDate,
        formatApproximateYouTubeDate,
        formatRelativeTimestamp,
        hasExplicitTime,
        parseRelativeYouTubeAge,
        parseYouTubeDate
    });
})();
