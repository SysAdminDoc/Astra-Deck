// ==UserScript==
// @name         YT Reaction Spammer
// @namespace    https://github.com/SysAdminDoc/Astra-Deck
// @version      0.3.1
// @updateURL    https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YT_Reaction_Spammer.user.js
// @downloadURL  https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YT_Reaction_Spammer.user.js
// @description  Pick which YouTube live-chat reactions to spam; fires them in a random sequence at a chosen interval (minimum 500 ms).
// @author       SysAdminDoc
// @match        https://www.youtube.com/live_chat*
// @match        https://studio.youtube.com/live_chat*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID  = 'yt-reaction-spammer-panel';
  const STORAGE   = 'yt-reaction-spammer-state-v1';

  // ---------- YTKit coexistence guard (v0.3.1) ----------
  // The Astra Deck extension ships an integrated reaction spammer that
  // mounts #ytkit-reaction-spammer-launcher / #ytkit-reaction-spammer-panel
  // into this same live-chat frame. Running both would double-fire
  // reactions and stack two panels. If YTKit's UI is mounted, this
  // standalone script stands down.
  let ytkitConflictDisabled = false;
  const ytkitSpammerPresent = () =>
    !!document.getElementById('ytkit-reaction-spammer-launcher') ||
    !!document.getElementById('ytkit-reaction-spammer-panel');

  // v0.3.0 (N3): 500 ms floor on the spam interval. Faster than ~2 Hz risks
  // YouTube's automated-behavior heuristics flagging the account. The upper
  // bound stays at 60 s.
  const MIN_INTERVAL_MS = 500;
  const MAX_INTERVAL_MS = 60000;

  const defaults = {
    selected:   [],
    intervalMs: 600,
    pos:        { x: 20, y: 80 },
    collapsed:  false,
  };

  const clampInterval = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return defaults.intervalMs;
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, n));
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE);
      const merged = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
      merged.intervalMs = clampInterval(merged.intervalMs);
      return merged;
    } catch { return { ...defaults }; }
  };
  const save = () => {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch {}
  };

  const state = load();
  let running = false;
  let timer = null;
  let panel, listEl, startBtn, intervalEl, statusEl, collapseBtn, body, hintEl;

  // ---------- reaction discovery ----------
  // The panel may be in collapsed or expanded form. Both contain buttons.
  // We always prefer #expanded-buttons; if only collapsed is present, we expand first.
  const queryButtons = (root = document) =>
    root.querySelectorAll(
      '#expanded-buttons yt-reaction-control-panel-button-view-model button'
    );

  const findButtons = () => {
    const map = new Map(); // emoji -> { btn, host }
    queryButtons().forEach(btn => {
      const img = btn.querySelector('img[alt^="Send "]');
      if (!img) return;
      const emoji = img.alt.replace(/^Send\s+/, '').trim();
      if (emoji && !map.has(emoji)) {
        map.set(emoji, { btn, host: btn.closest('yt-reaction-control-panel-button-view-model') });
      }
    });
    return map;
  };

  const getHoverArea = () =>
    document.querySelector('yt-reaction-control-panel-view-model #hover-area') ||
    document.querySelector('#hover-area');

  const getCollapsedButton = () =>
    document.querySelector(
      '#collapsed-button yt-reaction-control-panel-button-view-model button'
    );

  // ---------- event simulation ----------
  // Polymer/yt components bind on-tap which listens to pointer events. A bare
  // .click() will not trigger those handlers. We dispatch the full sequence.
  const fireTap = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 || 0;
    const cy = r.top + r.height / 2 || 0;
    const base = {
      bubbles: true, cancelable: true, composed: true,
      view: window, button: 0, buttons: 1,
      clientX: cx, clientY: cy, screenX: cx, screenY: cy,
      pointerType: 'mouse', isPrimary: true, pointerId: 1,
    };

    try {
      el.dispatchEvent(new PointerEvent('pointerover',  base));
      el.dispatchEvent(new PointerEvent('pointerenter', base));
      el.dispatchEvent(new MouseEvent('mouseover',  base));
      el.dispatchEvent(new MouseEvent('mouseenter', base));
      el.dispatchEvent(new PointerEvent('pointerdown', base));
      el.dispatchEvent(new MouseEvent('mousedown',     base));
      el.dispatchEvent(new PointerEvent('pointerup',   { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup',       { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click',         { ...base, buttons: 0 }));
    } catch (e) {
      // Fallback for browsers missing PointerEvent ctor
      try { el.click(); } catch {}
    }
    // Belt-and-suspenders: also call native click for any handler bound that way.
    try { el.click(); } catch {}
    return true;
  };

  const ensureExpanded = () => {
    // If expanded buttons aren't present, try to expand the panel by hovering
    // and/or clicking the collapsed heart button.
    if (queryButtons().length > 0) return true;
    const hover = getHoverArea();
    if (hover) {
      const r = hover.getBoundingClientRect();
      const opts = {
        bubbles: true, cancelable: true, composed: true,
        clientX: r.left + 1, clientY: r.top + 1,
        pointerType: 'mouse', isPrimary: true, pointerId: 1,
      };
      try {
        hover.dispatchEvent(new PointerEvent('pointerover',  opts));
        hover.dispatchEvent(new PointerEvent('pointerenter', opts));
        hover.dispatchEvent(new MouseEvent('mouseover',  opts));
        hover.dispatchEvent(new MouseEvent('mouseenter', opts));
        hover.dispatchEvent(new PointerEvent('pointermove', opts));
      } catch {}
    }
    const collapsed = getCollapsedButton();
    if (collapsed && queryButtons().length === 0) fireTap(collapsed);
    return queryButtons().length > 0;
  };

  const clickReaction = (emoji) => {
    ensureExpanded();
    const entry = findButtons().get(emoji);
    if (!entry) return false;
    // Try the inner <button> first, then the host element as a fallback.
    fireTap(entry.btn);
    return true;
  };

  // ---------- spam loop ----------
  const start = () => {
    if (running) return;
    running = true;
    paint();
    const tick = () => {
      if (!running) return;
      const available = findButtons();
      const choices = state.selected.filter(e => available.has(e));
      if (choices.length === 0) {
        ensureExpanded();
        timer = setTimeout(tick, Math.max(200, state.intervalMs));
        return;
      }
      const pick = choices[Math.floor(Math.random() * choices.length)];
      clickReaction(pick);
      timer = setTimeout(tick, clampInterval(state.intervalMs));
    };
    tick();
  };

  const stop = () => {
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
    paint();
  };

  // ---------- UI ----------
  const css = (el, str) => { el.style.cssText = str; };

  const mkBtn = (label, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    css(b, `
      background:${primary ? '#a6e3a1' : '#313244'};
      color:${primary ? '#1e1e2e' : '#cdd6f4'};
      border:0; border-radius:6px;
      padding:6px 10px; cursor:pointer;
      font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
      width:100%;
    `);
    return b;
  };

  const buildPanel = () => {
    if (document.getElementById(PANEL_ID)) return;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    css(panel, `
      position:fixed; left:${state.pos.x}px; top:${state.pos.y}px;
      z-index:2147483647; width:260px;
      background:#1e1e2e; color:#cdd6f4;
      border:1px solid #313244; border-radius:10px;
      box-shadow:0 8px 24px rgba(0,0,0,.5);
      font:12px/1.4 ui-sans-serif, system-ui, sans-serif;
    `);

    const header = document.createElement('div');
    css(header, `
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 10px; cursor:move;
      background:#181825; border-radius:10px 10px 0 0;
      font-weight:600; user-select:none;
    `);
    const title = document.createElement('span');
    title.textContent = 'Reaction Spammer';
    const headerBtns = document.createElement('div');
    css(headerBtns, 'display:flex;gap:4px;');

    collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.title = 'Collapse / expand';
    css(collapseBtn, 'background:none;border:0;color:#cdd6f4;font-size:14px;cursor:pointer;padding:0 4px;');
    collapseBtn.textContent = state.collapsed ? '\u25B8' : '\u25BE';
    collapseBtn.onclick = () => {
      state.collapsed = !state.collapsed;
      body.style.display = state.collapsed ? 'none' : 'block';
      collapseBtn.textContent = state.collapsed ? '\u25B8' : '\u25BE';
      save();
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.title = 'Hide (refresh chat to bring back)';
    css(closeBtn, 'background:none;border:0;color:#cdd6f4;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;');
    closeBtn.textContent = '\u00D7';
    closeBtn.onclick = () => { stop(); panel.remove(); };

    headerBtns.append(collapseBtn, closeBtn);
    header.append(title, headerBtns);

    body = document.createElement('div');
    css(body, `padding:10px; display:${state.collapsed ? 'none' : 'block'};`);

    listEl = document.createElement('div');
    css(listEl, 'display:flex; flex-direction:column; gap:2px; max-height:240px; overflow:auto;');

    const refreshBtn = mkBtn('\u21BB Refresh reactions');
    refreshBtn.style.marginTop = '8px';
    refreshBtn.onclick = () => { ensureExpanded(); renderList(); };

    const intervalRow = document.createElement('label');
    css(intervalRow, 'display:flex;align-items:center;gap:6px;margin:8px 0;');
    const intervalLbl = document.createElement('span');
    intervalLbl.textContent = 'Interval (ms):';
    intervalEl = document.createElement('input');
    intervalEl.type = 'number';
    intervalEl.min = String(MIN_INTERVAL_MS);
    intervalEl.max = String(MAX_INTERVAL_MS);
    intervalEl.step = '50';
    intervalEl.value = String(state.intervalMs);
    css(intervalEl, `
      flex:1; background:#11111b; color:#cdd6f4;
      border:1px solid #313244; border-radius:4px;
      padding:3px 6px; font:inherit;
    `);
    intervalEl.onchange = () => {
      state.intervalMs = clampInterval(intervalEl.value);
      intervalEl.value = String(state.intervalMs);
      save();
    };
    intervalRow.append(intervalLbl, intervalEl);

    startBtn = mkBtn('\u25B6 Start spamming', true);
    startBtn.onclick = () => running ? stop() : start();

    statusEl = document.createElement('div');
    css(statusEl, 'margin-top:6px;color:#a6adc8;font-size:11px;');

    hintEl = document.createElement('div');
    css(hintEl, 'margin-top:4px;color:#6c7086;font-size:10px;line-height:1.3;');
    hintEl.textContent = 'Tip: click a row\u2019s test (\u2022) button to verify a single reaction fires.';

    body.append(listEl, refreshBtn, intervalRow, startBtn, statusEl, hintEl);
    panel.append(header, body);
    document.body.append(panel);

    enableDrag(panel, header);
    renderList();
    paint();
  };

  const renderList = () => {
    if (!listEl) return;
    const map = findButtons();
    listEl.replaceChildren();

    if (map.size === 0) {
      const empty = document.createElement('div');
      css(empty, 'color:#f38ba8;font-size:11px;padding:6px 2px;line-height:1.4;');
      empty.textContent = 'No reactions found. Make sure the live chat reaction panel is loaded, then click Refresh.';
      listEl.append(empty);
      paint();
      return;
    }

    for (const emoji of map.keys()) {
      const row = document.createElement('div');
      css(row, `
        display:flex; align-items:center; gap:8px;
        padding:4px 6px; border-radius:4px;
      `);
      row.onmouseenter = () => row.style.background = '#313244';
      row.onmouseleave = () => row.style.background = 'transparent';

      const lbl = document.createElement('label');
      css(lbl, 'display:flex; align-items:center; gap:8px; flex:1; cursor:pointer;');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selected.includes(emoji);
      cb.onchange = () => {
        if (cb.checked) {
          if (!state.selected.includes(emoji)) state.selected.push(emoji);
        } else {
          state.selected = state.selected.filter(e => e !== emoji);
        }
        save();
        paint();
      };

      const label = document.createElement('span');
      css(label, 'font-size:18px;');
      label.textContent = emoji;

      lbl.append(cb, label);

      const test = document.createElement('button');
      test.type = 'button';
      test.title = `Fire ${emoji} once`;
      test.textContent = '\u2022';
      css(test, `
        background:#45475a;color:#cdd6f4;border:0;border-radius:4px;
        width:24px;height:24px;cursor:pointer;font-weight:700;
      `);
      test.onclick = (e) => { e.preventDefault(); clickReaction(emoji); };

      row.append(lbl, test);
      listEl.append(row);
    }
    paint();
  };

  const paint = () => {
    if (!startBtn) return;
    if (running) {
      startBtn.textContent = '\u25A0 Stop';
      startBtn.style.background = '#f38ba8';
      startBtn.style.color = '#1e1e2e';
      statusEl.textContent = `Spamming ${state.selected.length} reaction(s)\u2026`;
    } else {
      startBtn.textContent = '\u25B6 Start spamming';
      startBtn.style.background = '#a6e3a1';
      startBtn.style.color = '#1e1e2e';
      statusEl.textContent = state.selected.length === 0
        ? 'Select at least one reaction.'
        : `${state.selected.length} reaction(s) selected.`;
    }
  };

  const enableDrag = (el, handle) => {
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    handle.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      sl = el.offsetLeft; st = el.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      el.style.left = (sl + e.clientX - sx) + 'px';
      el.style.top  = (st + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      state.pos = { x: el.offsetLeft, y: el.offsetTop };
      save();
    });
  };

  // ---------- bootstrap ----------
  const disableForYtkit = () => {
    if (ytkitConflictDisabled) return;
    ytkitConflictDisabled = true;
    stop();
    document.getElementById(PANEL_ID)?.remove();
    console.info('[YT Reaction Spammer] YTKit integrated reaction spammer detected — standalone panel is standing down.');
  };

  const ready = () => {
    if (ytkitConflictDisabled) return;
    if (ytkitSpammerPresent()) { disableForYtkit(); return; }
    if (document.body) buildPanel();
    else setTimeout(ready, 100);
  };
  ready();

  // Re-scan reactions when chat DOM mutates (panel may load late)
  const mo = new MutationObserver(() => {
    // Defensive late detection: YTKit's integrated spammer UI may mount
    // after this script boots — stand down as soon as it appears.
    if (ytkitConflictDisabled || ytkitSpammerPresent()) {
      disableForYtkit();
      mo.disconnect();
      return;
    }
    if (!listEl) return;
    const found = findButtons().size;
    const rendered = listEl.querySelectorAll('button[title^="Fire "]').length;
    if (found > 0 && rendered === 0) renderList();
    if (found !== rendered && found > 0) renderList();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('beforeunload', stop);
})();
