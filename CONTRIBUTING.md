# Contributing to YTKit

Thanks for your interest in contributing to YTKit! This guide will help you get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Install** [Tampermonkey](https://www.tampermonkey.net/) (Chrome) or [Violentmonkey](https://violentmonkey.github.io/) (Firefox)
4. Create a new userscript pointing to your local `YTKit.user.js` file for development

## Project Structure

```
YouTube-Kit/
  YTKit.user.js    # The entire userscript (single-file architecture)
  CHANGELOG.md     # Version history
  README.md        # Project documentation
  archive/         # Previous versioned releases
  assets/          # Images and media
```

## Architecture

YTKit is a single-file userscript. All features follow the feature object pattern:

```javascript
{
    id: 'featureName',
    name: 'Human Readable Name',
    description: 'What this feature does',
    group: 'Category',        // Appearance, Playback, Interface, etc.
    icon: 'lucide-icon-name',
    init() { /* activate */ },
    destroy() { /* clean up */ }
}
```

### Key patterns:
- **CSS-only features**: Use `cssFeature()` factory
- **DOM observation**: Use `addMutationRule()` / `removeMutationRule()`
- **SPA navigation**: Use `addNavigateRule()` / `removeNavigateRule()`
- **Persistent buttons**: Use `registerPersistentButton()` / `unregisterPersistentButton()`
- **Settings storage**: Use `StorageManager.get()` / `StorageManager.set()`

## Adding a Feature

1. Define your feature object in the `features` array
2. Add a default value in `DEFAULT_SETTINGS`
3. Implement `init()` to activate and `destroy()` to fully clean up
4. Always remove event listeners, observers, and DOM elements in `destroy()`
5. Test with the feature toggled on/off multiple times

## Code Style

- No external dependencies (no jQuery, no npm packages)
- Use `cachedQuery()` for frequently accessed DOM elements
- Use `DebugManager.log()` for debug output
- Always clean up in `destroy()` -- no leaked listeners or DOM nodes
- Follow existing indentation (4 spaces)

## Submitting Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Test thoroughly on YouTube (watch page, home, search, channels)
4. Commit with a clear message
5. Push and open a Pull Request

## Reporting Bugs

Use the [Bug Report template](https://github.com/SysAdminDoc/YouTube-Kit/issues/new?template=bug_report.md) and include:
- Browser + version
- Userscript manager + version
- YTKit version
- Steps to reproduce
- Console errors (F12 > Console)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
