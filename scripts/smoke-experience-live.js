'use strict';

// Real pointer input against an unpacked extension in an isolated browser.
// --port attaches to an already isolated test browser for visual iteration.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const {
    chromiumArgs, connectCdp, createChromiumStage, evaluate, killProcessTree,
    removeDirWithRetries, reserveLoopbackPort, sleep, waitForBackgroundTarget, waitForDevTools
} = require('./smoke-chromium-optional-hosts');
const { DEFAULT_FLAGS } = require('../extension/core/classic-watch-layout.js');

const ROOT = path.join(__dirname, '..');
const WATCH = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const OPEN = "document.documentElement.classList.contains('ytkit-split-open')";
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const OUT = path.resolve(option('--out', path.join(os.tmpdir(), 'astra-experience-evidence')));
const report = { version: require('../package.json').version, checks: [], limitations: [], screenshots: [] };

async function run(client, background) {
    const read = expression => evaluate(client, expression);
    const from = option('--from', '');
    let started = !from;
    async function until(expression, label, ms = 30000) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await read(expression).catch(() => false)) return;
            await sleep(200);
        }
        throw new Error(`Timed out: ${label}`);
    }
    async function settings(patch) {
        await evaluate(background, `new Promise(resolve => chrome.storage.local.get('ytSuiteSettings', result => chrome.storage.local.set({ytSuiteSettings:{...result.ytSuiteSettings,...${JSON.stringify(patch)}}},resolve)))`);
        await sleep(700);
    }
    async function point(selector) {
        return read(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>{const b=e.getBoundingClientRect();return b.width&&b.height&&b.top>=0&&b.top<innerHeight&&getComputedStyle(e).visibility!=='hidden';}); if(!e){const f=document.querySelector(${JSON.stringify(selector)}),r=f&&f.getBoundingClientRect();throw Error('Missing visible target: '+${JSON.stringify(selector)}+(r?' (first match at '+[r.x,r.y,r.width,r.height].map(Math.round).join(',')+' in a '+innerWidth+'x'+innerHeight+' viewport, on top: '+(document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('[id]')?.id||'?')+')':' (no match)'));} const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
    }
    async function click(selector, delay = 250) {
        const p = await point(selector);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
        if (delay) await sleep(delay);
    }
    async function wheel(x, y, deltaY) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
        await sleep(350);
    }
    async function escape() {
        for (const type of ['keyDown', 'keyUp']) await client.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(200);
    }
    async function capture(name) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
        const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
        const file = path.join(OUT, name + '.png');
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        report.screenshots.push(file);
    }
    async function navigate(url, { video = true } = {}) {
        await client.send('Page.navigate', { url });
        await until('document.readyState==="complete"&&document.querySelectorAll("style[id^=yt-suite-style-]").length>20', 'extension styles');
        await sleep(2000);
        if (video && url.includes('/watch?')) await until('document.querySelector("video")?.readyState>=2', 'watch video loaded');
        await read('document.querySelector("video")?.pause()');
    }
    async function theme(dark) {
        await read(`document.documentElement.toggleAttribute('dark',${dark});document.documentElement.style.colorScheme=${JSON.stringify(dark ? 'dark' : 'light')}`);
        await sleep(300);
    }
    async function check(name, action) {
        if (!started && name !== from) return;
        started = true;
        const checkStarted = Date.now();
        const details = await action();
        report.checks.push({ name, passed: true, ms: Date.now() - checkStarted, details });
        console.log(`[experience] PASS ${name}`);
    }
    const split = () => read(`({open:${OPEN},ratio:Number(document.querySelector('#ytkit-split-divider')?.getAttribute('aria-valuenow')),state:document.querySelector('#ytkit-split-divider')?.dataset.ytkitPanelState,wrappers:document.querySelectorAll('#ytkit-split-wrapper').length,width:document.querySelector('#below')?.getBoundingClientRect().width,overflow:document.querySelector('#below')?.scrollWidth>document.querySelector('#below')?.clientWidth+2})`);
    async function openSplit() {
        if (!await read(OPEN)) await wheel(400, 350, 140);
        await until(OPEN, 'Theater Split open');
        await sleep(450);
        await read('document.querySelector("video")?.pause()');
    }
    async function drag(delta) {
        const p = await point('#ytkit-split-divider');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + delta, y: p.y, button: 'left', buttons: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + delta, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(400);
    }
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await evaluate(background, "chrome.storage.local.set({'ytkit_split_ratio':68})");
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await settings({ hideSidebar: false, hideVideosFromHome: false, hideVideosKeywordFilter: false, hideVideosHideLive: false, daShowOriginalTitle: false, colorTheme: 'none', disableAutoplayNext: true });
    await navigate(WATCH);
    await navigate('https://www.youtube.com/');
    const homeCheck = 'home grid and hidden ad shells';
    if (!from || from === homeCheck) await until('document.querySelectorAll("ytd-rich-item-renderer").length>2', 'public home recommendations');
    await check(homeCheck, async () => {
        const result = await read(`(()=>{const grid=document.querySelector('#contents.ytd-rich-grid-renderer');return {columns:getComputedStyle(grid).gridTemplateColumns,cards:[...grid.querySelectorAll('ytd-rich-item-renderer')].filter(e=>getComputedStyle(e).display!=='none').length,empty:[...grid.children].filter(e=>e.tagName==='YTD-RICH-ITEM-RENDERER'&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height===0).length,chip:getComputedStyle(document.querySelector('.ytChipShapeInactive')).color};})()`);
        assert.equal(result.empty, 0); assert.ok(result.cards > 2); assert.notEqual(result.chip, 'rgb(0, 0, 0)');
        await capture('home-dark');
        return result;
    });
    await check('native Guide collapse and reopen six times', async () => {
        const margins = [];
        for (let i = 0; i < 12; i++) {
            await click('#guide-button', 250);
            margins.push(await read("getComputedStyle(document.querySelector('ytd-page-manager')).marginLeft"));
            assert.equal(await read('document.documentElement.scrollWidth>innerWidth'), false);
        }
        assert.notEqual(margins[0], margins[1]);
        await click('#guide-button'); await capture('home-guide-collapsed-dark'); await click('#guide-button');
        return margins.slice(0, 2);
    });
    await check('home chip selection, scrolling and card menu', async () => {
        await click('yt-chip-cloud-chip-renderer:nth-child(2) button', 650);
        assert.ok(await read("document.querySelector('yt-chip-cloud-chip-renderer:nth-child(2)').hasAttribute('selected')"));
        await click('yt-chip-cloud-chip-renderer:first-child button', 500);
        for (let i = 0; i < 3; i++) await wheel(900, 600, 600);
        assert.ok(await read('scrollY>500'));
        await read('scrollTo(0,0)'); await sleep(300);
        await click('.ytLockupMetadataViewModelMenuButton button', 350);
        assert.ok(await read("[...document.querySelectorAll('ytd-menu-popup-renderer,yt-sheet-view-model')].some(e=>e.getBoundingClientRect().height>0)"));
        await escape();
    });
    await check('home light theme', async () => { await theme(false); await capture('home-light'); await theme(true); });
    await check('saved color theme remains readable in light mode', async () => {
        await settings({ colorTheme: 'catppuccin-mocha' }); await theme(false);
        const colors = await read("({text:getComputedStyle(document.querySelector('.ytChipShapeInactive')).color,canvas:getComputedStyle(document.body).backgroundColor})");
        const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(value=>{
            const c = Number(value)/255; return c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4;
        }).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
        const l = [luminance(colors.text),luminance(colors.canvas)].sort((a,b)=>a-b);
        assert.ok((l[1]+0.05)/(l[0]+0.05)>=4.5, 'saved palette must retain readable light text');
        await settings({ colorTheme: 'none' }); await theme(true);
        return colors;
    });
    await check('live subscriptions shell', async () => {
        await click('ytd-guide-entry-renderer a[href="/feed/subscriptions"]', 800);
        await until("location.pathname==='/feed/subscriptions'", 'native subscriptions navigation');
        await capture('subscriptions-signed-out-dark');
        const count = await read("document.querySelectorAll('ytd-browse[page-subtype=\"subscriptions\"] ytd-rich-item-renderer').length");
        if (!count) report.limitations.push('Personal subscriptions require sign-in. The live signed-out shell was exercised; populated layouts use captured native public cards.');
    });
    await navigate('https://www.youtube.com/@NASA/videos');
    await until('document.querySelectorAll("ytd-rich-item-renderer").length>3', 'public channel cards');
    await check('subscriptions grid, list and compact native-card fixture', async () => {
        // Public cards provide real current DOM without an account or modifying
        // subscriptions. This is layout evidence, not a signed-in feed claim.
        await read(`void(window.__astraExperienceGrid=document.querySelector('ytd-rich-grid-renderer'))`);
        await click('ytd-guide-entry-renderer a[href="/feed/subscriptions"]', 600);
        await until("location.pathname==='/feed/subscriptions'", 'subscriptions fixture route');
        await read(`(()=>{const browse=[...document.querySelectorAll('ytd-browse')].find(e=>!e.hidden);browse.setAttribute('page-subtype','subscriptions');browse.querySelector('ytd-background-promo-renderer')?.remove();browse.appendChild(window.__astraExperienceGrid);delete window.__astraExperienceGrid;})()`);
        await settings({ subscriptionsGrid: false });
        await settings({ subscriptionsGrid: true });
        await capture('subscriptions-public-card-fixture-dark');
        const grid = await read("getComputedStyle(document.querySelector('#contents.ytd-rich-grid-renderer')).display");
        assert.equal(grid, 'grid');
        await settings({ subscriptionViewControls: true, subscriptionViewMode: 'list' });
        await until("document.querySelector('ytd-browse[page-subtype=\"subscriptions\"]:not([hidden])')?.getAttribute('data-ytkit-subscription-view')==='list'", 'subscriptions list');
        assert.notEqual(await read("getComputedStyle(document.querySelector('#contents.ytd-rich-grid-renderer')).display"), 'grid');
        await settings({ subscriptionViewMode: 'compact' });
        await until("document.querySelector('ytd-browse[page-subtype=\"subscriptions\"]:not([hidden])')?.getAttribute('data-ytkit-subscription-view')==='compact'", 'compact subscriptions');
        await capture('subscriptions-public-card-fixture-compact');
        await settings({ subscriptionViewMode: 'grid', subscriptionViewControls: false });
        await theme(false); await capture('subscriptions-public-card-fixture-light'); await theme(true);
    });
    await navigate('https://www.youtube.com/');
    await until('document.querySelectorAll("ytd-rich-item-renderer").length>2', 'home cards return');
    await check('saved column count and list feed preferences', async () => {
        await settings({ videosPerRow: 4 });
        const count = await read("getComputedStyle(document.querySelector('#contents.ytd-rich-grid-renderer')).gridTemplateColumns.split(' ').length");
        assert.equal(count, 4);
        await settings({ listFeedLayout: true });
        assert.equal(await read("getComputedStyle(document.querySelector('#contents.ytd-rich-grid-renderer')).display"), 'flex');
        await settings({ listFeedLayout: false, videosPerRow: 0 });
    });
    await check('real feed link SPA navigation', async () => {
        await read('window.__astraExperienceSpaProbe=true');
        await click('ytd-rich-item-renderer .ytLockupMetadataViewModelTitle', 700);
        await until("location.pathname==='/watch'&&!!document.querySelector('#ytkit-split-wrapper')", 'SPA watch');
        assert.equal(await read('window.__astraExperienceSpaProbe'), true, 'feed navigation must preserve the current document');
        await read('document.querySelector("video")?.pause()');
        assert.equal(await read("document.querySelectorAll('#ytkit-split-wrapper').length"), 1);
    });
    await navigate(WATCH); await openSplit();
    await check('single DeArrow watch title and quiet idle resize', async () => {
        await sleep(600);
        const visible = await read("[...document.querySelector('ytd-watch-metadata h1').children].filter(e=>getComputedStyle(e).display!=='none'&&e.textContent.trim()).length");
        assert.equal(visible, 1);
        const resizes = await read("new Promise(resolve=>{let count=0;const listener=()=>count++;window.addEventListener('resize',listener);setTimeout(()=>{window.removeEventListener('resize',listener);resolve(count)},2000)})");
        assert.ok(resizes < 4, `idle resize count ${resizes}`);
        await capture('theater-split-dark');
        return { visible, resizes };
    });
    await check('real video clicks alternate play and pause', async () => {
        await read('document.querySelector("video").currentTime=0;document.querySelector("video").pause()');
        const states = [];
        for (let i = 0; i < 4; i++) {
            await click('#movie_player video', 350);
            states.push(await read('document.querySelector("video").paused'));
        }
        assert.deepEqual(states, [false, true, false, true]);
        return states;
    });
    await check('comments rail collapse and restore six times', async () => {
        const before = await split();
        for (let i = 0; i < 6; i++) {
            await click('#ytkit-split-divider', 250);
            assert.equal((await split()).state, 'closed');
            assert.equal(await read("getComputedStyle(document.querySelector('#below')).pointerEvents"), 'none');
            if (!i) await capture('theater-comments-collapsed-dark');
            await click('#ytkit-split-divider', 250);
            assert.equal((await split()).open, true);
        }
        assert.ok(Math.abs((await split()).ratio - before.ratio) <= 1);
    });
    await check('divider fast release, drag reversal and cancellation', async () => {
        const before = await split();
        const initialX = (await point('#ytkit-split-divider')).x;
        await drag(10);
        assert.ok(Math.abs((await point('#ytkit-split-divider')).x - initialX - 10) < 2, 'a small right drag must move right by its actual distance');
        await drag(-10);
        assert.ok(Math.abs((await point('#ytkit-split-divider')).x - initialX) < 2, 'opposite drags must return to the starting position');
        await drag(-72); const wider = await split();
        assert.ok(wider.ratio < before.ratio && wider.width > before.width);
        await drag(32); assert.ok((await split()).ratio > wider.ratio);
        const p = await point('#ytkit-split-divider');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x - 40, y: p.y, buttons: 1 });
        await read("window.dispatchEvent(new Event('blur'))");
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x - 40, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
        assert.equal(await read('document.body.style.userSelect'), '');
        await sleep(350);
        assert.equal((await split()).open, true);
    });
    await check('ten rapid collapse and reopen cycles', async () => {
        await read("window.__astraRapidHits=0;window.__astraRapidListener=e=>{if(e.target.closest('#ytkit-split-divider'))window.__astraRapidHits++};document.addEventListener('mousedown',window.__astraRapidListener,true)");
        for (let i = 0; i < 20; i++) await click('#ytkit-split-divider', 25);
        const hits = await read("(()=>{document.removeEventListener('mousedown',window.__astraRapidListener,true);const hits=window.__astraRapidHits;delete window.__astraRapidHits;delete window.__astraRapidListener;return hits})()");
        assert.equal(hits, 20, 'the rail must not move away between pointer targeting and press');
        await sleep(500);
        const state = await split(); assert.equal(state.open, true); assert.equal(state.wrappers, 1);
        return state;
    });
    await check('comments scroll, replies and sort menu Escape', async () => {
        await until("document.querySelectorAll('ytd-comment-thread-renderer').length>0", 'native comments');
        const p = await point('#below');
        await wheel(p.x, 600, 500);
        assert.ok(await read("document.querySelector('#below').scrollTop>0"));
        await read("document.querySelector('#below').scrollTop=0"); await sleep(200);
        await click('ytd-comment-replies-renderer :is(#more-replies,#more-replies-sub-thread) button', 750);
        assert.ok(await read("document.querySelectorAll('ytd-comment-replies-renderer ytd-comment-view-model').length>0"));
        await read("document.querySelector('#below').scrollTop=0");
        await click('yt-sort-filter-sub-menu-renderer #label', 300);
        await escape(); assert.equal(await read(OPEN), true);
        await click('ytd-watch-metadata .ytkit-ql-toggle', 250);
        const menu = await read("(()=>{const b=document.querySelector('ytd-watch-metadata .ytkit-ql-drop').getBoundingClientRect();return {left:b.left,right:b.right,viewport:innerWidth}})()");
        assert.ok(menu.left>=0&&menu.right<=menu.viewport, 'Quick Links must stay inside the viewport');
        await click('ytd-watch-metadata .ytkit-ql-toggle', 200);
        await capture('theater-comments-replies-dark');
    });
    await check('responsive split in both themes', async () => {
        for (const [width, height] of [[1920,1080],[1440,900],[1280,720],[1024,768],[900,700]]) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await sleep(650);
            for (const dark of [true, false]) {
                await theme(dark);
                const state = await split(); assert.equal(state.open, true); assert.equal(state.overflow, false);
                await capture(`theater-split-${dark ? 'dark' : 'light'}-${width}`);
            }
        }
        await theme(true);
        await client.send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
    });
    await check('minimum and maximum divider ratios keep metadata inside the pane', async () => {
        for (const target of [85, 25, 68]) {
            const p = await point('#ytkit-split-divider');
            await drag(target === 85 ? 1430 - p.x : target === 25 ? 10 - p.x : 1440 * 0.68 - 10 - p.x);
            for (const dark of [true, false]) {
                await theme(dark);
                const outside = await read(`(()=>{const pane=document.querySelector('#below').getBoundingClientRect();return [...document.querySelectorAll('ytd-watch-metadata #title h1,ytd-watch-metadata .ytkit-split-upload-meta,ytd-watch-metadata #owner button,ytd-watch-metadata .ytkit-split-owner-actions>button')].filter(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&(b.left<pane.left-1||b.right>pane.right+1);}).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,40)}));})()`);
                assert.deepEqual(outside, [], `ratio ${target}, ${dark ? 'dark' : 'light'} metadata overflow`);
                await capture(`theater-ratio-${target}-${dark ? 'dark' : 'light'}`);
            }
        }
        await theme(true);
    });
    await check('width buttons resize the split with single clicks', async () => {
        const WIDER = '#ytkit-split-width .ytkit-split-width-btn[data-ytkit-width-step="-5"]';
        const NARROWER = '#ytkit-split-width .ytkit-split-width-btn[data-ytkit-width-step="5"]';
        const stored = () => evaluate(background, "new Promise(resolve => chrome.storage.local.get('ytkit_split_ratio', r => resolve(r.ytkit_split_ratio)))");
        const start = (await split()).ratio;
        await click(WIDER, 400);
        assert.equal((await split()).ratio, start - 5, 'one click widens the side panel');
        assert.equal(Number(await stored()), start - 5, 'the width persists');
        await click(NARROWER, 400); await click(NARROWER, 400);
        const wider = (await split()).ratio;
        assert.equal(wider, start + 5);
        for (const dark of [true, false]) {
            await theme(dark);
            assert.equal(await read(`getComputedStyle(document.querySelector('${WIDER}')).display`), 'flex');
            await capture(`theater-width-buttons-${dark ? 'dark' : 'light'}`);
        }
        await theme(true);
        await click('#ytkit-split-divider', 500);
        assert.equal(await read(OPEN), false, 'a divider click still collapses the comments');
        assert.equal(await read("getComputedStyle(document.querySelector('#ytkit-split-width')).display"), 'none', 'no width buttons while collapsed');
        await click('#ytkit-split-divider', 500);
        await until(OPEN, 'divider click reopens the comments');
        assert.equal((await split()).ratio, wider, 'reopening keeps the clicked width');
        return { start, wider };
    });
    await check('Watch Feed Add stays reachable in the split on VOD and live pages', async () => {
        const BUTTON = '.ytkit-watch-feed-btn';
        const queued = async (id) => {
            const raw = await evaluate(background, "new Promise(resolve => chrome.storage.local.get('ytkit-queue', r => resolve(r['ytkit-queue'] ?? null)))");
            const store = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return (store?.items || []).filter(item => item.id === id).length;
        };
        const settle = async (id, count, label) => {
            const end = Date.now() + 5000;
            while (Date.now() < end && await queued(id) !== count) await sleep(200);
            assert.equal(await queued(id), count, label);
        };
        await evaluate(background, "chrome.storage.local.remove('ytkit-queue')");
        await settings({ persistentQueue: true });
        const proofs = {};
        for (const [kind, url, host] of [['vod', WATCH, '.ytkit-split-owner-actions'], ['live', 'https://www.youtube.com/@LofiGirl/live', '.ytkit-split-live-meta']]) {
            await navigate(url, { video: kind === 'vod' });
            if (kind === 'live') {
                // The channel's /live link resolves to whatever is streaming now.
                // A signed-out headless profile is not always served live media,
                // and without it the split never opens.
                // That page is a channel page, so load the stream's own
                // /live/<id> link, the form YouTube's share button hands out.
                const end = Date.now() + 30000;
                let state = null;
                while (Date.now() < end) {
                    state = await read("({id:document.querySelector('#movie_player')?.getVideoData?.()?.video_id||'',ready:document.querySelector('video')?.readyState||0,live:!!document.querySelector('#movie_player')?.getVideoData?.()?.isLive})").catch(() => null);
                    if (state?.ready >= 2 && state.live && /^[\w-]{11}$/.test(state.id)) break;
                    await sleep(500);
                }
                if (!(state?.ready >= 2 && state.live && /^[\w-]{11}$/.test(state.id))) {
                    report.limitations.push(`Watch Feed live leg skipped: no playable live stream for the signed-out profile (${JSON.stringify(state)}); tests/features/theater-split.test.js covers the live pin`);
                    break;
                }
                await navigate(`https://www.youtube.com/live/${state.id}`, { video: false });
                await until('document.querySelector("video")?.readyState>=2', 'live video loaded');
                await read('document.querySelector("video")?.pause()');
                assert.equal(await read('location.pathname'), `/live/${state.id}`, 'the stream stays on its /live/<id> link');
                proofs.liveStream = state.id;
            }
            await openSplit();
            await until(`!!document.querySelector('${host} > ${BUTTON}')`, `${kind} Watch Feed button docked`);
            await sleep(400);
            const id = kind === 'live' ? proofs.liveStream : await read("new URLSearchParams(location.search).get('v')");
            await settle(id, 0, `${kind}: starts outside the Watch Feed`);
            await click(BUTTON, 500);
            await settle(id, 1, `${kind}: one click adds exactly once`);
            assert.equal(await read(`document.querySelector('${BUTTON}').getAttribute('aria-pressed')`), 'true');
            if (kind === 'vod') {
                for (const dark of [true, false]) { await theme(dark); await capture(`theater-watch-feed-${dark ? 'dark' : 'light'}`); }
                await theme(true);
                await click('#ytkit-split-divider', 500);
                await click('#ytkit-split-divider', 500);
                await until(OPEN, 'comments reopen');
                assert.equal(await read(`document.querySelectorAll('${BUTTON}').length`), 1, 'collapse and reopen keep one button');
            } else {
                // Like and Subscribe keep the pinned row to themselves.
                const pins = await read("[...document.querySelectorAll('[data-ytkit-split-live-pinned=\"1\"]')].map(e=>({tag:e.tagName,width:Math.round(e.getBoundingClientRect().width)}))");
                assert.ok(!pins.some(pin => pin.tag === 'BUTTON'), 'the Watch Feed button is not squeezed into the pinned row');
                proofs.livePins = pins;
                for (const dark of [true, false]) { await theme(dark); await capture(`theater-watch-feed-live-${dark ? 'dark' : 'light'}`); }
                await theme(true);
            }
            await click(BUTTON, 500);
            await settle(id, 0, `${kind}: a second click removes it`);
            assert.equal(await read(`document.querySelector('${BUTTON}').getAttribute('aria-pressed')`), 'false');
            proofs[kind] = id;
        }
        if (!await read(OPEN)) { await navigate(WATCH); await openSplit(); }
        await click('#ytkit-split-close', 500);
        assert.equal(await read(`!!document.querySelector('#top-level-buttons-computed ${BUTTON}')`), true, 'closing the split puts it back in the action row');
        await navigate(WATCH); await openSplit();
        return proofs;
    });
    await check('close action, watch navigation and teardown', async () => {
        await click('#ytkit-split-close'); assert.equal(await read(OPEN), false);
        await wheel(400,350,160); assert.equal(await read(OPEN), false);
        await navigate(WATCH); await openSplit();
        await read("document.querySelector('ytd-app').dispatchEvent(new CustomEvent('yt-navigate',{bubbles:true,composed:true,detail:{endpoint:{commandMetadata:{webCommandMetadata:{url:'/',webPageType:'WEB_PAGE_TYPE_BROWSE',rootVe:3854}},browseEndpoint:{browseId:'FEwhat_to_watch'}}}}))");
        await until("location.pathname==='/'&&!document.querySelector('#ytkit-split-wrapper')", 'home SPA teardown');
        assert.equal(await read("document.documentElement.classList.contains('ytkit-split-active')"), false);
        await client.send('Input.dispatchMouseEvent', { type:'mouseWheel',x:800,y:600,deltaX:0,deltaY:500 });
        await sleep(400); assert.ok(await read('scrollY>0'));
    });
    await check('hide-sidebar preference can turn off and back on', async () => {
        await settings({ hideSidebar: true });
        assert.equal(await read("getComputedStyle(document.querySelector('#guide-button')).display"), 'none');
        assert.equal(await read("getComputedStyle(document.querySelector('ytd-page-manager')).marginLeft"), '0px');
        await settings({ hideSidebar: false });
        assert.notEqual(await read("getComputedStyle(document.querySelector('#guide-button')).display"), 'none');
    });
    await check('features off at load turn on from settings, and every pane opens with Video Hider off', async () => {
        // A module skipped at startup never loaded later in the tab, so its
        // switch did nothing until a reload, and a missing Video Hider made
        // the masthead button throw before the panel drew.
        await evaluate(background, "chrome.storage.local.set({'ytkit-hidden-videos':['aaaaaaaaaaa','bbbbbbbbbbb'],'ytkit-video-hider-allowed-videos':['ccccccccccc']})");
        await settings({ deArrow: false, hideVideosFromHome: false, hideVideosKeywordFilter: false, hideVideosHideLive: false, sponsorBlock: false });
        await navigate('https://www.youtube.com/');
        await until('document.querySelectorAll("ytd-rich-item-renderer").length>2', 'home cards with features off');
        const seen = client.events.length;
        const extensionErrors = () => client.events.slice(seen)
            .filter(e => e.method === 'Runtime.exceptionThrown')
            .map(e => e.params.exceptionDetails)
            .filter(d => JSON.stringify(d).includes('chrome-extension://'))
            .map(d => d.exception?.description || d.text);
        assert.equal(await read("document.querySelectorAll('[data-da-video-id]').length"), 0, 'DeArrow stays idle while off');
        await click('#ytkit-masthead-btn', 800);
        await until("!!document.getElementById('ytkit-settings-panel')", 'settings panel');
        const tabs = await read("[...document.querySelectorAll('#ytkit-settings-panel .ytkit-nav-btn')].map(b=>b.dataset.tab)");
        assert.ok(tabs.length > 5, 'settings lists its categories');
        for (const tab of tabs) {
            await click(`#ytkit-settings-panel .ytkit-nav-btn[data-tab="${tab}"]`, 300);
            assert.equal(await read(`document.querySelector('#ytkit-settings-panel .ytkit-nav-btn[data-tab="${tab}"]').classList.contains('active')`), true, `${tab} pane opens`);
        }
        const deArrowTab = await read("document.getElementById('ytkit-toggle-deArrow').closest('[id^=\"ytkit-pane-\"]').id.replace('ytkit-pane-','')");
        await click(`#ytkit-settings-panel .ytkit-nav-btn[data-tab="${deArrowTab}"]`, 400);
        await read("document.getElementById('ytkit-toggle-deArrow').closest('.ytkit-switch,label').scrollIntoView({block:'center'})");
        await sleep(300);
        await click('.ytkit-switch:has(#ytkit-toggle-deArrow)', 600);
        assert.equal(await read("document.getElementById('ytkit-toggle-deArrow').checked"), true, 'the switch turned on');
        await escape();
        await until("document.querySelectorAll('[data-da-video-id]').length>0", 'DeArrow working on the same tab without a reload', 20000);
        assert.deepEqual(extensionErrors(), [], 'no extension exceptions while opening panes or switching on');
        await settings({ deArrow: true, sponsorBlock: true });
        return { tabs: tabs.length, deArrowTab };
    });
    await check('transcript Retry recovers a failed load without reloading or seeking', async () => {
        // Every caption route fails while the panel loads, then the block lifts
        // and Retry has to recover in the same document at the same position.
        // The profile is fresh, so no cached transcript can answer instead.
        // Theater Split stays on: it hides #secondary, so the panel has to
        // follow #below into the split's side column.
        const PANEL_HOST = "document.querySelector('#ytkit-transcript-panel')?.parentElement?.id||''";
        await settings({ transcriptViewer: false, stickyVideo: true });
        await navigate(WATCH);
        await openSplit();
        const blocked = ['*timedtext*', '*/youtubei/v1/get_transcript*', '*/youtubei/v1/player*', '*youtube.com/watch?*'];
        await client.send('Network.setBlockedURLs', { urls: blocked });
        try {
            await read('window.__astraTranscriptRetryProbe=true;document.querySelector("video").currentTime=7;document.querySelector("video").pause()');
            await settings({ transcriptViewer: true });
            await until("!!document.querySelector('#ytkit-transcript-panel .ytkit-transcript-state__action')", 'retryable transcript failure', 45000);
            assert.equal(await read("document.querySelector('#ytkit-transcript-panel .ytkit-transcript-body').getAttribute('aria-busy')"), 'false');
        } finally {
            await client.send('Network.setBlockedURLs', { urls: [] });
        }
        assert.equal(await read(PANEL_HOST), 'below', 'the panel mounts in the split side column');
        const belowKids = await read("[...document.querySelector('#below').children].map(e=>e.tagName+(e.id?'#'+e.id:'')+'@'+Math.round(e.getBoundingClientRect().height))");
        assert.equal(await read("(()=>{const p=document.querySelector('#ytkit-transcript-panel').previousElementSibling;return !!p&&(p.tagName==='YTD-WATCH-METADATA'||!!p.querySelector('ytd-watch-metadata'));})()"), true, `it sits under the video title (#below: ${belowKids.join(' ')})`);
        await read("document.querySelector('#ytkit-transcript-panel .ytkit-transcript-state__action').scrollIntoView({block:'center'})");
        await sleep(300);
        assert.equal(await read("getComputedStyle(document.querySelector('#ytkit-transcript-panel .ytkit-transcript-export')).display"), 'none', 'a failed load shows no export buttons');
        await capture('transcript-retry-failed-dark');
        await theme(false); await capture('transcript-retry-failed-light'); await theme(true);
        // Record whether the click starts a fresh load: the body goes busy and
        // the failed Retry button is replaced.
        await read("(()=>{const body=document.querySelector('#ytkit-transcript-panel .ytkit-transcript-body');window.__astraRetryBusy=false;document.querySelector('#ytkit-transcript-panel .ytkit-transcript-state__action').dataset.astraOld='1';new MutationObserver(()=>{if(body.getAttribute('aria-busy')==='true')window.__astraRetryBusy=true;}).observe(body,{attributes:true,attributeFilter:['aria-busy']});})()");
        await click('#ytkit-transcript-panel .ytkit-transcript-state__action', 100);
        const settled = "window.__astraRetryBusy&&document.querySelector('#ytkit-transcript-panel .ytkit-transcript-body').getAttribute('aria-busy')==='false'&&!document.querySelector('[data-astra-old]')&&(document.querySelectorAll('#ytkit-transcript-panel .ytkit-transcript-line').length>0||!!document.querySelector('#ytkit-transcript-panel .ytkit-transcript-state'))";
        await until(settled, 'Retry starts a fresh load and settles', 45000);
        const result = await read("({lines:document.querySelectorAll('#ytkit-transcript-panel .ytkit-transcript-line').length,exportDisplay:getComputedStyle(document.querySelector('#ytkit-transcript-panel .ytkit-transcript-export')).display,retry:!!document.querySelector('#ytkit-transcript-panel .ytkit-transcript-state__action'),retryFocused:document.activeElement?.classList.contains('ytkit-transcript-state__action')===true,probe:window.__astraTranscriptRetryProbe===true,time:Math.round(document.querySelector('video').currentTime),paused:document.querySelector('video').paused})");
        assert.equal(result.probe, true, 'Retry must not reload the page');
        assert.equal(result.time, 7, 'Retry must not seek playback');
        assert.equal(result.paused, true);
        if (result.lines) assert.notEqual(result.exportDisplay, 'none', 'exports appear with the recovered transcript');
        else if (result.retry) {
            assert.equal(result.retryFocused, true, 'a failed retry hands focus to the new Retry button');
            assert.equal(result.exportDisplay, 'none');
            report.limitations.push('YouTube refused the caption fetch in this signed-out headless profile even after the block lifted, so the live check proves a fresh load, no reload or seek, and the repeated-failure focus, while cue-line recovery rests on the unit tests.');
        } else report.limitations.push('The smoke video reported no caption tracks after Retry, so recovery reached the captionless state rather than cue lines.');
        await capture('transcript-retry-after-dark');
        // Collapse hands #below back to the page, and reopening takes the panel along again.
        const ratio = (await split()).ratio;
        await click('#ytkit-split-divider', 500);
        assert.equal(await read(OPEN), false, 'the divider still collapses the split');
        assert.equal(await read(PANEL_HOST), 'secondary', 'a collapsed split gives the panel back to the sidebar');
        await click('#ytkit-split-divider', 500);
        await until(OPEN, 'the divider reopens the split');
        assert.equal(await read(PANEL_HOST), 'below', 'reopening shows the panel in the side column again');
        assert.equal((await split()).ratio, ratio, 'the split keeps its ratio');
        assert.equal(await read("document.querySelectorAll('#ytkit-transcript-panel').length"), 1);
        await click('#ytkit-split-close', 500);
        assert.equal(await read(PANEL_HOST), 'secondary', 'closing the split puts the panel back in #secondary');
        assert.equal(await read("document.querySelector('#secondary').firstElementChild?.id"), 'ytkit-transcript-panel');
        await settings({ transcriptViewer: false });
        return { ...result, ratio };
    });
    await check('Live Latency Catch-up reads the player, boosts only while behind and stops at the head', async () => {
        const READOUT = '.ytkit-live-latency-readout';
        const sample = () => read(`(() => { const p = document.querySelector('#movie_player'), v = document.querySelector('#movie_player video.html5-main-video'), r = document.querySelector('${READOUT}'), g = p?.getProgressState?.();
            return { state: document.documentElement.getAttribute('data-ytkit-live-edge-state'), readout: r && !r.hidden ? r.textContent : null, rate: v?.playbackRate, time: v?.currentTime || 0, paused: !!v?.paused, ready: v?.readyState, player: p?.getPlayerState?.(),
                ad: !!p?.classList.contains('ad-showing'), head: g?.isAtLiveHead === true, behind: g ? +(g.seekableEnd - g.current).toFixed(1) : null }; })()`);
        const play = () => read("document.querySelector('#movie_player')?.playVideo?.()");
        await settings({ liveLatencyCatchup: true, liveLatencyTargetSeconds: 8, liveLatencyMaxRate: 1.25 });
        // A VOD has no live edge: nothing published, no readout, no boost.
        await navigate(WATCH);
        await play();
        await sleep(3000);
        const vod = await sample();
        assert.equal(vod.state, null, 'nothing is published for a VOD');
        assert.equal(vod.readout, null, 'and no readout shows');
        assert.equal(vod.rate, 1);
        await navigate('https://www.youtube.com/@LofiGirl/live', { video: false });
        const end = Date.now() + 30000;
        let stream = null;
        while (Date.now() < end) {
            stream = await read("({id:document.querySelector('#movie_player')?.getVideoData?.()?.video_id||'',ready:document.querySelector('video')?.readyState||0,live:!!document.querySelector('#movie_player')?.getVideoData?.()?.isLive})").catch(() => null);
            if (stream?.ready >= 2 && stream.live && /^[\w-]{11}$/.test(stream.id)) break;
            await sleep(500);
        }
        if (!(stream?.ready >= 2 && stream.live && /^[\w-]{11}$/.test(stream.id))) {
            report.limitations.push(`Live Latency check skipped: no playable live stream for the signed-out profile (${JSON.stringify(stream)}); tests/features/live-latency.test.js and tests/live-edge-bridge.test.js cover it`);
            await settings({ liveLatencyCatchup: false });
            return { skipped: true };
        }
        await navigate(`https://www.youtube.com/live/${stream.id}`, { video: false });
        await until('document.querySelector("video")?.readyState>=2', 'live video loaded');
        await play();
        await until("!document.querySelector('#movie_player')?.classList.contains('ad-showing')", 'pre-roll ad finished', 120000);
        await play();
        await until(`(() => { const r = document.querySelector('${READOUT}'); return !!r && !r.hidden && document.querySelector('#movie_player')?.getProgressState?.()?.isAtLiveHead === true; })()`, 'readout shown at the live head', 30000);
        // At the head: a readout of a few seconds at most, and the rate left alone.
        const atHead = [];
        for (let i = 0; i < 4; i++) { atHead.push(await sample()); await sleep(1500); }
        for (const s of atHead) {
            assert.match(s.readout || '', /^Live \d/, `readout at the head: ${JSON.stringify(s)}`);
            assert.ok(Number(s.readout.match(/^Live ([\d.]+)/)[1]) <= 8, `at the head the readout is a few seconds: ${s.readout}`);
            assert.equal(s.rate, 1, 'no boost at the head');
        }
        await capture('live-latency-head-dark');
        // Fall about 30 seconds behind: the boost starts within the cap, then ends by the head.
        // A pause rather than a seek. A live seek reloads the media, and in this
        // signed-out headless profile that reload often never starts again.
        await read("(() => { const p = document.querySelector('#movie_player'); p.mute(); p.pauseVideo(); })()");
        await sleep(6000);
        const paused = await sample();
        assert.equal(paused.readout, null, `a paused stream's state goes stale and the readout hides: ${JSON.stringify(paused)}`);
        await sleep(24000);
        await play();
        const resuming = [];
        let behind = null;
        for (const stop = Date.now() + 30000; Date.now() < stop && !behind;) {
            await sleep(1000);
            const s = await sample();
            resuming.push(s);
            if (s.rate > 1) behind = s;
        }
        if (!behind && resuming.every(s => s.ready === 0 || s.player === -1 || s.time === 0)) {
            report.limitations.push(`Live Latency boost leg skipped: the headless player did not resume the live stream (${JSON.stringify(resuming.at(-1))}); the head leg passed, and tests/features/live-latency.test.js covers the boost`);
            await settings({ liveLatencyCatchup: false });
            return { stream: stream.id, vod, atHead, paused, resumed: false };
        }
        assert.ok(behind, `the boost starts behind the edge: ${JSON.stringify(resuming.slice(-5))}`);
        assert.ok(behind.rate <= 1.25, `the boost honors the cap: ${behind.rate}`);
        assert.match(behind.readout || '', /^Live \d/);
        await capture('live-latency-behind-dark');
        const trace = [behind];
        const deadline = Date.now() + 300000;
        let released = null;
        while (Date.now() < deadline) {
            await sleep(3000);
            const s = await sample();
            trace.push(s);
            assert.ok(s.ad || s.rate <= 1.25, `never past the cap: ${JSON.stringify(s)}`);
            if (!s.ad && s.rate === 1) { released = s; break; }
        }
        assert.ok(released, `the boost is released: ${JSON.stringify(trace.slice(-4))}`);
        assert.ok(released.head || released.behind <= 10, `released at the head or the target: ${JSON.stringify(released)}`);
        // Back at the plain rate after the release. Whether the stream keeps
        // going after that is the player's: on 2026-10-26 a signed-out headless
        // player ran dry about 45 seconds after falling behind, with this
        // feature off too.
        const before = await sample();
        await sleep(6000);
        const after = await sample();
        assert.equal(after.rate, 1, 'no new boost once released');
        if (!(after.time - before.time > 3)) report.limitations.push(`The headless player stopped after the release (${before.time} -> ${after.time}); it does that with Live Latency Catch-up off too.`);
        await settings({ liveLatencyCatchup: false });
        assert.equal(await read("document.documentElement.getAttribute('data-ytkit-live-edge-state')"), null, 'turning it off withdraws the state');
        return { stream: stream.id, vod, atHead, paused, behind, released, after, samples: trace.length };
    });
    await check('DeArrow cards still fill in with hide-while-loading, saturation and emoji cleanup on', async () => {
        // Hide While Loading must never leave a card blank: every hidden
        // title and cover comes back once its lookup answers or times out.
        await settings({ deArrow: true, daReplaceTitles: true, daReplaceThumbs: true, daHideWhileFetching: true, daThumbSaturation: 50, daCleanEmojis: true, daFallbackFormat: true });
        await navigate('https://www.youtube.com/');
        await until("document.querySelectorAll('ytd-rich-item-renderer[data-da-video-id]').length>2", 'DeArrow takes the home cards');
        await until("!document.querySelector('[data-da-fetching]')", 'every hidden card shown again', 15000);
        const home = await read(`(() => {
            const cards = [...document.querySelectorAll('ytd-rich-item-renderer[data-da-video-id]')];
            const thumbs = cards.map(c => c.querySelector('yt-thumbnail-view-model img, ytd-thumbnail img')).filter(Boolean);
            const titles = cards.map(c => c.querySelector('.daCustomTitle, a.ytLockupMetadataViewModelTitle, #video-title')).filter(Boolean);
            return {
                cards: cards.length,
                drawnTitles: document.querySelectorAll('.daCustomTitle').length,
                replacedCovers: document.querySelectorAll('.da-replaced-thumb').length,
                hiddenTitles: titles.filter(t => getComputedStyle(t).visibility !== 'visible').length,
                // YouTube keeps its own not-yet-loaded covers (no src) hidden, so
                // only a loaded cover or one under our marker counts as ours.
                hiddenCovers: thumbs.filter(i => getComputedStyle(i).visibility !== 'visible' && (i.getAttribute('src') || i.closest('[data-da-hide]'))).length,
                leftMarked: document.querySelectorAll('[data-da-hide]:not([data-da-hide=""])').length,
                faded: thumbs.filter(i => getComputedStyle(i).filter === 'grayscale(0.5)').length,
                thumbs: thumbs.length
            };
        })()`);
        assert.ok(home.drawnTitles + home.replacedCovers > 0, `DeArrow drew nothing on ${home.cards} cards`);
        assert.equal(home.hiddenTitles, 0, 'no title is left hidden');
        assert.equal(home.hiddenCovers, 0, 'no cover is left hidden');
        assert.equal(home.leftMarked, 0, 'no card keeps a hide marker');
        assert.ok(home.thumbs > 0 && home.faded === home.thumbs, `covers at 50% saturation (${home.faded} of ${home.thumbs})`);
        await capture('dearrow-options-home');
        await navigate(WATCH);
        await until("document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.dataset.daProcessed==='1'", 'watch heading looked up by hash prefix');
        await until("!document.querySelector('[data-da-fetching]')", 'watch heading shown again', 15000);
        const heading = await read("[...document.querySelector('ytd-watch-metadata h1').children].filter(e=>getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility==='visible'&&e.textContent.trim()).map(e=>e.textContent.trim())");
        assert.equal(heading.length, 1, 'one visible watch title');
        await settings({ daThumbSaturation: 100 });
        return { home, heading: heading[0] };
    });
    await check('comment features follow comments into the side-panel page', async () => {
        // YouTube's 2026-10 side-panel watch page, forced the way the capture
        // in tests/watch-side-panel-capture.test.js was: every flag Classic
        // Watch Layout turns off, set true after each ytcfg.set.
        const flags = DEFAULT_FLAGS.filter(flag => flag !== 'kevlar_watch_cinematics');
        const { identifier } = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
            const flags = ${JSON.stringify(flags)};
            const force = store => { if (store && typeof store === 'object') for (const flag of flags) store[flag] = true; };
            const wrap = cfg => {
                if (!cfg || typeof cfg.set !== 'function' || cfg.__astraForced) return;
                cfg.__astraForced = true;
                const set = cfg.set;
                cfg.set = function (...values) {
                    const result = set.apply(this, values);
                    try { force(cfg.get('EXPERIMENT_FLAGS')); force(cfg.data_ && cfg.data_.EXPERIMENT_FLAGS); force(window.yt && window.yt.config_ && window.yt.config_.EXPERIMENT_FLAGS); } catch (error) {}
                    return result;
                };
            };
            let current = window.ytcfg;
            Object.defineProperty(window, 'ytcfg', { configurable: true, get: () => current, set: value => { current = value; wrap(value); } });
            wrap(current);
        })()` });
        const PANEL = '[target-id="engagement-panel-comments-section"]';
        const THREADS = `${PANEL} ytd-comments ytd-comment-thread-renderer`;
        const KEYS = ['stickyVideo', 'restoreClassicWatchLayout', 'hideRelatedVideos', 'chatStyleComments', 'commentSearch', 'commentFilterManager', 'commentFilterRules'];
        const before = await evaluate(background, "new Promise(resolve => chrome.storage.local.get('ytSuiteSettings', result => resolve(result.ytSuiteSettings || {})))");
        const search = query => read(`(() => { const input = document.querySelector('${PANEL} .ytkit-comment-search-input'); input.value = ${JSON.stringify(query)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        try {
            // Theater Split takes the whole page over, so it's off here; its
            // pane mirrors #below and can't show the panel yet (ROADMAP).
            await settings({ stickyVideo: false, restoreClassicWatchLayout: false, hideRelatedVideos: true, chatStyleComments: true, commentSearch: true, commentFilterManager: true, commentFilterRules: '' });
            await navigate(WATCH);
            await until("[...(document.querySelector('ytd-watch-flexy')?.attributes || [])].some(a => /split-scroll|using-fixed-panel|side-rail/.test(a.name))", 'the side-panel page');
            await click('button[aria-label="Comments"]', 1000);
            await until(`document.querySelector('${PANEL}')?.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'`, 'the side rail opens the comments panel', 10000);
            await until(`document.querySelectorAll('${THREADS}').length > 3`, 'comments in the panel', 30000);
            await until(`!!document.querySelector('${PANEL} ytd-comments .ytkit-comment-search')`, 'Comment Search bar in the panel', 15000);
            await until(`!!document.querySelector('${PANEL} ytd-comments [data-ytkit-chat]')`, 'Studio Comments takes the panel comments', 15000);
            const state = await read(`(() => {
                const panelRoot = document.querySelector('${PANEL} ytd-comments');
                const classic = document.querySelector('ytd-comments#comments');
                const box = document.querySelector('${PANEL}').getBoundingClientRect();
                const words = (panelRoot.querySelector('ytd-comment-thread-renderer #content-text')?.textContent || '').toLowerCase().match(/[a-z]{5,}/g) || [];
                return {
                    threads: panelRoot.querySelectorAll('ytd-comment-thread-renderer').length,
                    styled: panelRoot.querySelectorAll('[data-ytkit-chat]').length,
                    rootRadius: getComputedStyle(panelRoot).borderTopLeftRadius,
                    rootRules: [...document.querySelectorAll('style[id^="yt-suite-style-chatStyleComments"]')].flatMap(s => [...(s.sheet?.cssRules || [])]).filter(r => r.selectorText && panelRoot.matches(r.selectorText)).length,
                    bars: document.querySelectorAll('.ytkit-comment-search').length,
                    classicHidden: !classic || (classic.hasAttribute('hidden') && getComputedStyle(classic).display === 'none'),
                    panelBox: [box.x, box.y, box.width, box.height].map(Math.round),
                    onScreen: box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= innerWidth + 1,
                    word: words.sort((a, b) => b.length - a.length)[0] || ''
                };
            })()`);
            assert.ok(state.rootRules > 0 && state.rootRadius !== '0px', `the Studio Comments card style reaches the panel root (${state.rootRules} rules, radius ${state.rootRadius})`);
            assert.ok(state.styled > 0, 'Studio Comments marks the panel comments');
            assert.equal(state.bars, 1, 'one search bar, in the panel');
            assert.equal(state.classicHidden, true, 'the #comments YouTube hid under the video stays hidden');
            assert.ok(state.word, 'the first panel comment has a word to filter on');
            assert.ok(state.onScreen, `the comments panel is on screen with Hide Related Videos on (box ${state.panelBox.join(',')})`);
            await search('zzqxjv no comment says this');
            await until(`[...document.querySelectorAll('${THREADS}')].every(t => t.dataset.ytkitCommentSearchHidden === '1')`, 'Comment Search filters the panel threads', 5000);
            await search('');
            await until(`!document.querySelector('${PANEL} [data-ytkit-comment-search-hidden="1"]')`, 'Comment Search clears', 5000);
            await settings({ commentFilterRules: state.word });
            await until(`[...document.querySelectorAll('${THREADS}')].some(t => t.dataset.ytkitCommentFilterHidden === '1' && getComputedStyle(t).display === 'none')`, 'Comment Filter hides the matching panel thread', 10000);
            const filtered = await read(`document.querySelectorAll('${PANEL} [data-ytkit-comment-filter-hidden="1"]').length`);
            await capture('side-panel-comments');
            return { ...state, filtered };
        } finally {
            await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            await settings(Object.fromEntries(KEYS.map(key => [key, before[key]])));
        }
    });
}

async function main() {
    fs.mkdirSync(OUT, { recursive:true });
    let port = Number(option('--port', 0)), proc, temp, client, background;
    try {
        if (!port) {
            const binary = option('--browser', path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe'));
            assert.ok(fs.existsSync(binary), 'Pass --browser with a Chromium binary that allows unpacked extensions');
            temp = fs.mkdtempSync(path.join(os.tmpdir(),'astra-experience-'));
            const { stageDir } = createChromiumStage(temp);
            fs.copyFileSync(path.join(ROOT,'extension/manifest.json'),path.join(stageDir,'manifest.json'));
            port = await reserveLoopbackPort();
            proc = spawn(binary,[...chromiumArgs(path.join(temp,'profile'),stageDir,{headed:false},port),'--window-size=1440,900','--renderer-process-limit=2','--js-flags=--max-old-space-size=384'],{windowsHide:true,stdio:'ignore'});
            os.setPriority(proc.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);
            await waitForDevTools(port,45000);
        }
        const target = await waitForBackgroundTarget(port,45000);
        background = await connectCdp(target.webSocketDebuggerUrl);
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
        client = await connectCdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
        await client.send('Network.enable');
        await client.send('Network.setCookie',{name:'PREF',value:'f6=400',domain:'.youtube.com',path:'/',secure:true});
        await run(client,background);
        report.passed = true;
    } catch (error) {
        report.passed = false; report.error = error.stack;
        if (client) {
            const shot = await client.send('Page.captureScreenshot',{format:'png'}).catch(()=>null);
            if (shot) fs.writeFileSync(path.join(OUT,'failure.png'),Buffer.from(shot.data,'base64'));
        }
        throw error;
    } finally {
        fs.writeFileSync(path.join(OUT,'experience-report.json'),JSON.stringify(report,null,2)+'\n');
        client?.close(); background?.close();
        if (proc) killProcessTree(proc);
        if (temp) await removeDirWithRetries(temp);
    }
    console.log(`[experience] ${report.checks.length} checks passed. Evidence: ${OUT}`);
}
if (require.main === module) main().catch(error=>{console.error(error.stack);process.exitCode=1;});
