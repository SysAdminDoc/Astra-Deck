---
name: Bug Report
about: Report a bug or unexpected behavior in Astra Deck
title: "[Bug] "
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots / Console errors**
If applicable, add screenshots or browser console output (F12 > Console).

**Astra Deck bug-report bundle (recommended)**
- Extension: open the toolbar popup, go to Diagnostics and click **Save log**. Attach the `astra-deck-diagnostics-YYYY-MM-DD....json` file it saves.
- Userscript: on a YouTube tab, open your manager's menu (Tampermonkey or Violentmonkey) and pick **Copy Astra Deck diagnostics**, then paste it here inside a code block.

Either way, Astra Deck's settings panel has a bug button at the bottom of the sidebar that copies the same bundle. It holds your Astra Deck version, browser, what your browser supports, your settings and recent errors. API keys, custom CSS and endpoint URLs are replaced with `[redacted]` before anything is copied or saved.

**Environment** (skip if you attached the bundle above)
- Browser and version: [from the browser's About page]
- Userscript manager (if using userscript): [e.g. Tampermonkey 5.x, Violentmonkey]
- Astra Deck version: [at the bottom of the settings panel sidebar, or next to the name in the toolbar popup]
- OS: [e.g. Windows 11, macOS 14]

**Additional context**
Any other details, such as which features are enabled/disabled.
