(() => {
    'use strict';

    // extension/core/remote-list-scope.js
    //
    // Scope control for requests whose destination a user chooses at runtime:
    // the optional Video Hider filter-list URL and a self-hosted Cobalt API.
    //
    // Every other origin Astra Deck contacts is a fixed literal in
    // core/data-flow.js and is enforced by background.js's static
    // ALLOWED_FETCH_ORIGINS allowlist. A user-typed URL cannot be on that
    // list, so it is admitted through a narrower door instead:
    //
    //   1. the build must declare the broad `https://*/*` optional host
    //      permission (github-full only — store-safe strips it),
    //   2. the user must grant THAT SPECIFIC origin through the browser's
    //      own permission prompt, and
    //   3. the URL must survive the denylist below.
    //
    // Step 3 is what this module owns. Steps 1 and 2 keep the browser in the
    // loop; step 3 keeps the extension from being turned into an SSRF probe
    // for the user's own LAN, since a granted origin is otherwise fetched by
    // the privileged background worker rather than by the page.
    //
    // The denylist is literal-only by design. Resolving the hostname here
    // would prove nothing about resolution a millisecond later at fetch time
    // (classic DNS-rebinding TOCTOU), so this rejects the address forms that
    // name private space directly and accepts the residual documented in
    // docs/store-permission-rationale.md. Note that WHATWG URL parsing has
    // already normalised every alternate IPv4 spelling — `0x7f.0.0.1`,
    // `127.1`, and `2130706433` all arrive here as `127.0.0.1` — so the
    // dotted-quad checks below cover them without any custom parsing.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.describeRemoteListUrl && core.describeCobaltInstanceUrl) return;

    // The single optional host pattern a build must declare for user-chosen
    // HTTPS origins to be grantable at all.
    const REMOTE_LIST_HOST_PATTERN = 'https://*/*';
    const COBALT_PUBLIC_INSTANCE_HOST = 'api.cobalt.tools';

    const MAX_URL_LENGTH = 2048;

    // Suffixes reserved for names that never resolve on the public internet.
    const RESERVED_SUFFIXES = Object.freeze([
        '.local', '.localhost', '.internal', '.lan', '.intranet',
        '.private', '.corp', '.home', '.home.arpa', '.test', '.invalid', '.example'
    ]);

    function ipv4PartsAreGlobal(parts) {
        const [a, b, c] = parts;
        if (a === 0) return false;                                  // 0.0.0.0/8 "this network"
        if (a === 10) return false;                                 // RFC1918
        if (a === 127) return false;                                // loopback
        if (a === 169 && b === 254) return false;                   // link-local (incl. 169.254.169.254)
        if (a === 172 && b >= 16 && b <= 31) return false;          // RFC1918
        if (a === 192 && b === 168) return false;                   // RFC1918
        if (a === 100 && b >= 64 && b <= 127) return false;         // CGNAT RFC6598
        if (a === 192 && b === 0 && c === 0) return false;          // IETF protocol assignments
        if (a === 192 && b === 0 && c === 2) return false;          // TEST-NET-1
        if (a === 192 && b === 88 && c === 99) return false;        // 6to4 relay anycast
        if (a === 198 && (b === 18 || b === 19)) return false;      // benchmarking
        if (a === 198 && b === 51 && c === 100) return false;       // TEST-NET-2
        if (a === 203 && b === 0 && c === 113) return false;        // TEST-NET-3
        if (a >= 224) return false;                                 // multicast + reserved + broadcast
        return true;
    }

    function classifyIpv4(hostname) {
        const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
        if (!match) return null;
        const parts = match.slice(1, 5).map((part) => Number(part));
        if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return 'malformed-host';
        }
        // A globally-routable literal is not a security problem, but a filter
        // list is always published under a name. Rejecting every bare address
        // keeps one rule to reason about instead of two, and removes the whole
        // alternate-spelling surface from the grant path.
        return ipv4PartsAreGlobal(parts) ? 'ip-literal' : 'private-network';
    }

    function classifyIpv6(hostname) {
        if (!hostname.startsWith('[') || !hostname.endsWith(']')) return null;
        const raw = hostname.slice(1, -1).toLowerCase();
        if (!raw || raw === '::' || raw === '::1') return 'private-network';
        // IPv4-mapped forms must be classified on the embedded address.
        // URL parsing rewrites `::ffff:127.0.0.1` to the compressed hex form
        // `::ffff:7f00:1`, so matching only a trailing dotted quad would let
        // loopback through — read both spellings.
        const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(raw);
        if (dotted) {
            const nested = classifyIpv4(dotted[1]);
            if (nested && nested !== 'public') return nested;
        }
        const hexMapped = /^(?:0*:)*(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(raw);
        if (hexMapped) {
            const high = parseInt(hexMapped[1], 16);
            const low = parseInt(hexMapped[2], 16);
            const nested = classifyIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'));
            if (nested && nested !== 'public') return nested;
        }
        const head = raw.split(':')[0];
        if (/^f[cd][0-9a-f]{0,2}$/.test(head)) return 'private-network';  // fc00::/7 unique-local
        if (/^fe[89ab][0-9a-f]?$/.test(head)) return 'private-network';   // fe80::/10 link-local
        if (/^ff[0-9a-f]{0,2}$/.test(head)) return 'private-network';     // ff00::/8 multicast
        return 'ip-literal';
    }

    function classifyHostname(hostname) {
        const host = String(hostname || '').toLowerCase();
        if (!host) return 'malformed-host';
        // WHATWG URL accepts a leading wildcard label (`*.example.com`). A
        // runtime filter-list grant must always name one exact host; allowing
        // that input would silently widen one user choice to every subdomain.
        if (host.includes('*')) return 'malformed-host';

        const ipv6 = classifyIpv6(host);
        if (ipv6) return ipv6;

        const ipv4 = classifyIpv4(host);
        if (ipv4) return ipv4;

        if (host.endsWith('.')) return 'malformed-host';
        if (!host.includes('.')) return 'non-public-host';   // single label: bare intranet name
        if (RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'non-public-host';

        // A public suffix is always alphabetic or an IDN `xn--` label. This is
        // the backstop that rejects any numeric host shape URL parsing did not
        // already fold into a dotted quad.
        const tld = host.slice(host.lastIndexOf('.') + 1);
        if (!/^[a-z]{2,}$/.test(tld) && !/^xn--[a-z0-9-]+$/.test(tld)) return 'non-public-host';

        return 'public';
    }

    // Chrome/Firefox match patterns have no port component: a host pattern
    // grants every port on that host. Build the pattern from the hostname
    // alone so `permissions.request` cannot throw on an invalid pattern.
    function remoteListOriginPattern(hostname) {
        const host = String(hostname || '').toLowerCase();
        if (classifyHostname(host) !== 'public') return '';
        // An IPv6 literal is bracketed in a URL but must not be in a match
        // pattern; such hosts are rejected before this point anyway.
        return 'https://' + host + '/*';
    }

    // Returns a stable descriptor for a user-supplied public HTTPS URL.
    //   { ok: true,  url, origin, originPattern, hostname }
    //   { ok: false, reason }
    // `reason` is a stable token the UI maps to localized copy — never a raw
    // parser message, which would leak the input back into the surface.
    function describePublicHttpsUrl(value, options = {}) {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return { ok: false, reason: 'empty' };
        if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too-long' };

        let parsed;
        try {
            parsed = new URL(raw);
        } catch (_) {
            return { ok: false, reason: 'malformed-host' };
        }

        if (parsed.protocol !== 'https:') return { ok: false, reason: 'not-https' };
        if (parsed.username || parsed.password) return { ok: false, reason: 'credentials' };
        if (parsed.hash) return { ok: false, reason: 'fragment' };
        if (options.allowSearch === false && parsed.search) {
            return { ok: false, reason: 'query' };
        }

        const classification = classifyHostname(parsed.hostname);
        if (classification !== 'public') return { ok: false, reason: classification };

        const url = parsed.href;
        if (url.length > MAX_URL_LENGTH) return { ok: false, reason: 'too-long' };

        return {
            ok: true,
            url,
            hostname: parsed.hostname,
            origin: parsed.origin,
            originPattern: remoteListOriginPattern(parsed.hostname)
        };
    }

    // Filter lists may legitimately use query parameters (for example a
    // version selector), so their existing contract is the general public
    // HTTPS descriptor above.
    function describeRemoteListUrl(value) {
        return describePublicHttpsUrl(value);
    }

    // Cobalt v11 accepts POST requests at the instance root. Restricting this
    // setting to an origin (rather than an arbitrary path/query) keeps the
    // background capability auditable and avoids treating an API token in a
    // query string as ordinary settings data. The project-operated public
    // instance is explicitly forbidden: Cobalt's own API documentation says
    // third-party projects must self-host or obtain an instance owner's
    // permission, and Astra Deck has no such permission.
    function describeCobaltInstanceUrl(value) {
        const described = describePublicHttpsUrl(value, { allowSearch: false });
        if (!described.ok) return described;
        const parsed = new URL(described.url);
        if (parsed.hostname.toLowerCase() === COBALT_PUBLIC_INSTANCE_HOST) {
            return { ok: false, reason: 'public-instance' };
        }
        if (parsed.pathname !== '/') return { ok: false, reason: 'path' };
        return {
            ...described,
            url: parsed.origin + '/'
        };
    }

    // Convenience for callers that only need a yes/no gate.
    function isRemoteListUrlAllowed(value) {
        return describeRemoteListUrl(value).ok === true;
    }

    core.REMOTE_LIST_HOST_PATTERN = REMOTE_LIST_HOST_PATTERN;
    core.COBALT_PUBLIC_INSTANCE_HOST = COBALT_PUBLIC_INSTANCE_HOST;
    core.describeCobaltInstanceUrl = describeCobaltInstanceUrl;
    core.describePublicHttpsUrl = describePublicHttpsUrl;
    core.describeRemoteListUrl = describeRemoteListUrl;
    core.isRemoteListUrlAllowed = isRemoteListUrlAllowed;
    core.remoteListOriginPattern = remoteListOriginPattern;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            REMOTE_LIST_HOST_PATTERN,
            COBALT_PUBLIC_INSTANCE_HOST,
            describeCobaltInstanceUrl,
            describePublicHttpsUrl,
            describeRemoteListUrl,
            isRemoteListUrlAllowed,
            remoteListOriginPattern
        };
    }
})();
