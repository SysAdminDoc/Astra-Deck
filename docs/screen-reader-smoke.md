# Astra Deck — Screen-Reader Smoke Checklist

> One-pass bring-up checklist for verifying the toolbar popup + in-page
> overlays under NVDA / JAWS / VoiceOver. Run this on every release that
> changes a popup control, a toast, a settings-panel item, or an overlay.
> NX5's aria-live announcements (SponsorBlock + DeArrow) and N3's
> reaction-spammer first-use toast both have specific assertions below.

WebAIM's 2024 Screen Reader Survey lists NVDA at 65.6 % share. NVDA is
the minimum required test target. JAWS + VoiceOver are nice-to-have.

---

## 1. Setup

| Tool | Version target | Notes |
|---|---|---|
| **NVDA** | 2025.3 or later | Free — https://www.nvaccess.org/download/. Enable the "Speak typed characters" pref + the speech viewer (NVDA → Tools → Speech Viewer) so you can see what was announced. |
| **JAWS** | 2026 | Commercial — https://www.freedomscientific.com/products/software/jaws/. 40-min demo mode is fine for smoke tests. |
| **VoiceOver** | macOS 14+ / iOS 17+ | Built into macOS (Cmd+F5) + iOS. The macOS Caption Panel shows the spoken text. |

Browser: Chrome stable + Firefox stable. Test both — accessibility tree
behaviour differs between Blink and Gecko.

---

## 2. Popup checklist

Open the toolbar popup with screen reader active.

- [ ] Popup announces "Controls and local data, dialog" (or localized
      equivalent) on open. The `<body>` has `role="dialog"
      aria-modal="true" aria-labelledby="popup-title"`.
- [ ] Tab from the first control wraps to the last; Shift-Tab from the
      first wraps to the last.
- [ ] Escape closes the popup.
- [ ] Every button has either a visible label or an `aria-label`.
      `npm run audit:a11y` enforces this; manual cross-check with the
      screen reader matters because aria-label text quality varies.
- [ ] Health banner appears with announcement (`role="status"
      aria-live="polite"`) when TrustedTypes diagnostics exist.
- [ ] Copy / Save / Clear buttons in the health banner: each announces
      its specific label (not the same word repeated).
- [ ] Language dropdown announces "Display language combobox" + the
      selected option + the option count.
- [ ] Quick toggles each announce their name + state (on/off). Toggling
      announces the new state.

---

## 3. In-page (watch-page) checklist

Navigate to a SponsorBlock-eligible video (sponsor segment + DeArrow
override + ideally a non-original audio track).

- [ ] **NX5 SponsorBlock announcement:** Skip event → polite live region
      reads "Skipped <category> segment." Category labels: sponsor /
      self promotion / interaction reminder / intro / outro / preview
      or recap / non-music section / filler tangent. Raw category id is
      a fallback only.
- [ ] **NX5 DeArrow announcement:** Watch-page title replaced → polite
      live region reads "Title replaced by DeArrow: <new title>". Grid
      thumbnail replacements MUST NOT announce — verify on the home
      feed that no spam fires.
- [ ] **NX8 auto-dubbed audio notice:** Watch a video with a non-
      original audio track active → toast + announcement read the
      track name with the "manually switch in player settings" hint.
- [ ] **N3 Reaction-spammer first-use warning:** First click of the
      reaction-spammer launcher → toast + live region read the rate-
      limit warning. Subsequent clicks: no announcement (ack flag set).

---

## 4. Settings panel checklist

Open Astra Deck's in-page settings panel (gear icon).

- [ ] Panel announces "Settings dialog" + the visible title.
- [ ] Each toggle reads name + description on focus.
- [ ] Search input announces "Search settings" + the results count.
- [ ] Hidden Videos / Blocked Channels textareas announce their label +
      "edit text" (or equivalent).
- [ ] Export / Import / Reset buttons announce purpose.
- [ ] Conflict-detection toast (auto-disable of incompatible features)
      reads via the same toast aria-live path used by other features.

---

## 5. Toast announcement quality

- [ ] Toasts with role="status" (informational) announce politely —
      don't interrupt current speech.
- [ ] Toasts with role="alert" (errors, color #ef4444) interrupt —
      should announce immediately.
- [ ] Toast actions (e.g. Retry buttons) are focusable + announced.
- [ ] Toast auto-dismiss does NOT trigger a "dialog closed" or similar
      noise.

---

## 6. Known limitations to document, not regress

- **YouTube's own controls are not in scope.** Astra Deck modifies the
  YouTube DOM; YT's own player chrome a11y is upstream's problem.
- **NVDA Speech Viewer captures may miss inline-aria-live updates** in
  fast-fire sequences. Use the JAWS / VoiceOver caption panel as a
  cross-check when verifying live-region behaviour.
- **Reduced-motion (L12)** is a separate audit. This checklist covers
  semantic announcements only.

---

## 7. Filing a bug report

Failures from this checklist file as `area: a11y` GitHub issues with:

- Tool + version (NVDA 2025.3, JAWS 2026, VoiceOver 14.5, etc.).
- Browser + version (Chrome stable / Firefox stable).
- Astra Deck version (popup version chip).
- Specific checklist line that failed + what was announced (or wasn't).
- Whether the issue reproduces on YouTube alone (without Astra Deck
  enabled) — if yes, the bug is upstream.
