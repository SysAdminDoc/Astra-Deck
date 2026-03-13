// YTKit v3.0.0 - Background Service Worker
// Handles cross-origin fetch proxy (GM_xmlhttpRequest) and cookie access (GM_cookie)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GM_XHR') {
        const { method, url, headers, data, timeout, responseType } = msg.details;
        const controller = new AbortController();
        let timer = null;
        let responded = false;

        if (timeout > 0) {
            timer = setTimeout(() => {
                if (!responded) {
                    responded = true;
                    controller.abort();
                    sendResponse({ timeout: true });
                }
            }, timeout);
        }

        const fetchOpts = {
            method: method || 'GET',
            signal: controller.signal
        };

        if (headers && Object.keys(headers).length > 0) {
            fetchOpts.headers = headers;
        }
        if (data && method !== 'GET' && method !== 'HEAD') {
            fetchOpts.body = data;
        }

        fetch(url, fetchOpts).then(async (resp) => {
            if (timer) clearTimeout(timer);
            if (responded) return;
            responded = true;

            const text = await resp.text();
            const responseHeaders = [...resp.headers.entries()]
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n');

            sendResponse({
                status: resp.status,
                statusText: resp.statusText,
                responseText: text,
                responseHeaders: responseHeaders,
                finalUrl: resp.url
            });
        }).catch((err) => {
            if (timer) clearTimeout(timer);
            if (responded) return;
            responded = true;
            sendResponse({ error: err.name === 'AbortError' ? 'Request aborted' : err.message });
        });

        return true; // keep sendResponse channel open
    }

    if (msg.type === 'GM_COOKIE_LIST') {
        const domain = msg.filter?.domain || '.youtube.com';
        chrome.cookies.getAll({ domain }).then(cookies => {
            sendResponse({
                cookies: cookies.map(c => ({
                    domain: c.domain,
                    name: c.name,
                    value: c.value,
                    path: c.path || '/',
                    secure: !!c.secure,
                    httpOnly: !!c.httpOnly,
                    expirationDate: c.expirationDate || 0
                })),
                error: null
            });
        }).catch(err => {
            sendResponse({ cookies: null, error: err.message });
        });
        return true;
    }
});
