'use strict';

// `fullTitles` shipped in 0.1.0 against `ytd-rich-grid-media` and
// `#video-title`. YouTube then rebuilt the feed on `yt-lockup-view-model`, and
// nobody noticed the toggle had stopped matching anything: the captured
// Subscriptions page in the repo root has 192 `yt-lockup-metadata-view-model`
// elements and zero `ytd-rich-grid-media`. A user could switch the feature on
// and still read "Worldwide Societal Collapse: Get Ready for I..." forever.
//
// Three things have to hold and each has a quiet way to break:
//   1. The rule that unclamps a title carries the full set of declarations.
//      Half of them is not a fix — dropping `max-height` alone leaves the
//      2-line box in place on the pre-`-webkit-line-clamp` fallback path.
//   2. It out-specifies `listFeedLayout`, which re-clamps the same titles to
//      three lines. A tie loses or wins on sheet order, which is not a thing
//      this codebase controls.
//   3. `canScopeCss()` keeps refusing to wrap it in `@scope`. `@scope`
//      contributes no specificity and implicitly prepends `:scope`, so a
//      wrapped `html body.ytkit-fullTitles ...` would match nothing at all.
//
// Assertions are made against the *rule that owns a title as its subject*, not
// against the sheet as a whole. An earlier draft of this file compared whole
// sheets and happily passed while the lockup selectors were deleted, because a
// legacy `#video-title` rule and an inner-span rule answered for them.

const test = require('node:test');
const assert = require('node:assert/strict');

const homeSubsCss = require('../extension/features/home-subs-css/index.js');
const styles = require('../extension/core/styles.js');

const css = homeSubsCss.buildFullTitlesCss();

/** Every rule in a stylesheet as `{ selectors, declarations }`. */
function rulesOf(sheet) {
    return String(sheet)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('}')
        .map(chunk => chunk.split('{'))
        .filter(parts => parts.length === 2 && parts[0].trim() && parts[1].trim())
        .map(([head, body]) => ({
            // Paren-aware: a naive comma split tears `:is(a, b)` in half.
            selectors: splitArguments(head),
            declarations: body.split(';').map(decl => decl.trim()).filter(Boolean)
        }));
}

/** Every selector in a stylesheet, flattened. */
function selectorsOf(sheet) {
    return rulesOf(sheet).flatMap(rule => rule.selectors);
}

/** Split an argument list on top-level commas, ignoring nested parentheses. */
function splitArguments(text) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of text) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
        current += char;
    }
    if (current.trim()) parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const higher = (a, b) => (beats(a, b) ? a : b);

/**
 * CSS specificity as [ids, classes/attrs/pseudo-classes, types].
 *
 * `:is()` and `:not()` take the specificity of their most specific argument
 * and `:where()` takes none, which is the whole reason the legacy selectors
 * can be written as two short lists instead of a 27-selector cross product.
 * Counting them as one plain pseudo-class would make this test agree with a
 * broken implementation.
 */
function specificity(selector) {
    let rest = String(selector);
    let fromFunctional = [0, 0, 0];

    const functional = /:(is|not|where|matches|any)\(/;
    for (;;) {
        const match = functional.exec(rest);
        if (!match) break;
        let depth = 0;
        let end = match.index + match[0].length - 1;
        for (; end < rest.length; end += 1) {
            if (rest[end] === '(') depth += 1;
            else if (rest[end] === ')') { depth -= 1; if (depth === 0) break; }
        }
        const args = rest.slice(match.index + match[0].length, end);
        if (match[1] !== 'where') {
            const best = splitArguments(args)
                .map(specificity)
                .reduce((winner, weight) => higher(weight, winner), [0, 0, 0]);
            fromFunctional = add(fromFunctional, best);
        }
        rest = `${rest.slice(0, match.index)} ${rest.slice(end + 1)}`;
    }

    const count = (pattern) => {
        const found = rest.match(pattern);
        rest = rest.replace(pattern, ' ');
        return found ? found.length : 0;
    };
    const ids = count(/#[A-Za-z0-9_-]+/g);
    const classes = count(/\.[A-Za-z0-9_-]+/g)
        + count(/\[[^\]]+\]/g)
        + count(/:(?!:)[A-Za-z-]+(?:\([^)]*\))?/g);
    const types = count(/(?:^|[\s>+~])([A-Za-z][A-Za-z0-9-]*)/g);
    return add([ids, classes, types], fromFunctional);
}

/** True when `a` beats `b` outright, ignoring source order. */
function beats(a, b) {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

/**
 * The last compound of a selector — the element the rule actually styles.
 * Combinator splitting is parenthesis-aware, or `:is(#video-title, h3 a)`
 * would be torn in half at the space inside its argument list.
 */
function subjectOf(selector) {
    const text = String(selector).trim();
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '(') depth += 1;
        else if (char === ')') depth -= 1;
        else if (depth === 0 && /[\s>+~]/.test(char)) start = i + 1;
    }
    return text.slice(start);
}

// The surfaces a video title can be rendered on, the token that identifies a
// title element on each, and how `listFeedLayout` re-clamps it.
const SURFACES = [
    {
        name: 'modern lockup',
        isOurs: subject => subject.includes('ytLockupMetadataViewModelTitle')
            || subject.includes('shortsLockupViewModelHostMetadataTitle'),
        rivalPattern: /a\[title\]$/
    },
    {
        name: 'legacy renderer',
        isOurs: subject => subject.includes('#video-title'),
        rivalPattern: /#video-title$/
    }
];

/** The rules whose subject is a title element on `surface`. */
function titleRules(surface) {
    return rulesOf(css).filter(rule => rule.selectors.some(sel => surface.isOurs(subjectOf(sel))));
}

test('specificity helper agrees with hand-counted selectors', () => {
    // A positive control: if this drifts, every comparison below is noise.
    assert.deepEqual(specificity('html body.ytkit-fullTitles #video-title'), [1, 1, 2]);
    assert.deepEqual(
        specificity('ytd-browse[page-subtype="home"] yt-lockup-view-model a[title]'),
        [0, 2, 3]
    );
    assert.deepEqual(
        specificity('html body.ytkit-fullTitles yt-lockup-view-model a.ytLockupMetadataViewModelTitle'),
        [0, 2, 4]
    );
    assert.equal(subjectOf('html body.ytkit-fullTitles ytd-video-renderer #video-title'), '#video-title');

    // `:is()` carries its most specific argument, `:where()` carries nothing.
    assert.deepEqual(specificity(':is(ytd-video-renderer, ytd-rich-item-renderer)'), [0, 0, 1]);
    assert.deepEqual(specificity(':is(#video-title, h3 a.yt-simple-endpoint)'), [1, 0, 0]);
    assert.deepEqual(specificity(':where(#video-title)'), [0, 0, 0]);
    assert.deepEqual(
        specificity('html body.ytkit-fullTitles :is(ytd-video-renderer) :is(#video-title, h3 a.yt-simple-endpoint)'),
        [1, 1, 3]
    );
    assert.equal(
        subjectOf('html body.ytkit-fullTitles :is(ytd-video-renderer) :is(#video-title, h3 a.yt-simple-endpoint)'),
        ':is(#video-title, h3 a.yt-simple-endpoint)'
    );
});

test('the sheet targets the classes the modern feed actually clamps', () => {
    // Read off the captured Subscriptions page, 2026-09-14:
    //   .ytLockupMetadataViewModelStandard .ytLockupMetadataViewModelTitle
    //     { -webkit-line-clamp: 2; max-height: 5.2rem; overflow: hidden }
    //   .shortsLockupViewModelHostMetadataTitle { -webkit-line-clamp: 3 }
    // Checked against rule *subjects*, not against the sheet text: the
    // satellite rule for the inner attributed-string span names both classes
    // too, and would happily answer for a deleted title selector.
    const unclamped = rulesOf(css)
        .filter(rule => UNCLAMP.every(decl => rule.declarations.includes(decl)))
        .flatMap(rule => rule.selectors)
        .map(subjectOf);
    for (const clamped of [
        'ytLockupMetadataViewModelTitle',
        'shortsLockupViewModelHostMetadataTitle'
    ]) {
        assert.ok(
            unclamped.some(subject => subject.includes(clamped)),
            `no unclamp rule has .${clamped} as its subject`
        );
    }
});

// YouTube clamps with five cooperating properties and falls back to
// `max-height` where `-webkit-line-clamp` is unsupported. Undoing four of the
// five still truncates.
const UNCLAMP = [
    '-webkit-line-clamp: unset !important',
    'max-height: none !important',
    'overflow: visible !important',
    'text-overflow: clip !important',
    'white-space: normal !important'
];

/**
 * The one rule that does the unclamping for `surface`. The sheet also carries
 * satellite rules on the same subjects (menu-button padding, a legacy custom
 * property) and those must not stand in for the real thing.
 */
function unclampRule(surface) {
    return titleRules(surface)
        .find(rule => UNCLAMP.every(decl => rule.declarations.includes(decl)));
}

test('each surface has one rule carrying the whole unclamp set', () => {
    for (const surface of SURFACES) {
        assert.ok(titleRules(surface).length > 0, `no rule styles a ${surface.name} title`);
        const rule = unclampRule(surface);
        assert.ok(
            rule,
            `no ${surface.name} rule carries all of: ${UNCLAMP.join('; ')}`
        );
    }
});

test('no rule re-clamps a title it just freed', () => {
    // Property -> the values that leave a title truncated. Split rather than
    // regex-matched: `\s*:\s*` backtracks to zero width, so a negative
    // lookahead after it reads the space and not the value.
    const CLAMPING = {
        '-webkit-line-clamp': value => !['unset', 'none', 'initial'].includes(value),
        'line-clamp': value => !['unset', 'none', 'initial'].includes(value),
        'max-height': value => value !== 'none',
        'overflow': value => value === 'hidden',
        'text-overflow': value => value === 'ellipsis'
    };
    for (const surface of SURFACES) {
        for (const rule of titleRules(surface)) {
            for (const decl of rule.declarations) {
                const separator = decl.indexOf(':');
                const property = decl.slice(0, separator).trim();
                const value = decl.slice(separator + 1).replace('!important', '').trim();
                assert.ok(
                    !(CLAMPING[property] && CLAMPING[property](value)),
                    `${surface.name} rule "${rule.selectors[0]}" re-clamps with ${decl}`
                );
            }
        }
    }
});

test('every selector is anchored at the document root and the body class', () => {
    for (const selector of selectorsOf(css)) {
        assert.ok(
            selector.startsWith('html body.ytkit-fullTitles '),
            `unanchored selector would lose its specificity budget: ${selector}`
        );
    }
});

test('core/styles.js leaves the sheet unwrapped by @scope', () => {
    // `@scope` adds zero specificity and implies a leading `:scope`, so a
    // wrapped sheet would need `html` to be a descendant of `body`.
    assert.equal(styles.canScopeCss(css), false);
    assert.equal(
        styles.scopeCss(css, { scope: true, scopeRoot: '.ytkit-fullTitles' }),
        css
    );
});

test('fullTitles out-specifies the listFeedLayout title clamp on every surface', () => {
    // A winning selector only helps if it matches the same elements as the
    // rival, so each rival is answered from its own surface's selectors.
    const rivals = selectorsOf(homeSubsCss.buildListFeedLayoutCss());

    for (const surface of SURFACES) {
        const surfaceRivals = rivals.filter(sel => surface.rivalPattern.test(subjectOf(sel))
            || surface.rivalPattern.test(sel));
        assert.ok(
            surfaceRivals.length > 0,
            `listFeedLayout stopped clamping the ${surface.name} surface — re-check this guard`
        );

        // Only the unclamp rule counts. A satellite rule on the same subject
        // can be more specific without removing a single clamp.
        const rule = unclampRule(surface);
        assert.ok(rule, `fullTitles has no unclamp rule for the ${surface.name} surface`);
        const mine = rule.selectors
            .filter(sel => surface.isOurs(subjectOf(sel)))
            .map(specificity);
        assert.ok(mine.length > 0, `fullTitles has no selector for the ${surface.name} surface`);

        for (const rival of surfaceRivals) {
            const rivalWeight = specificity(rival);
            assert.ok(
                mine.some(weight => beats(weight, rivalWeight)),
                `no ${surface.name} selector in fullTitles outranks listFeedLayout's ${rival}`
            );
        }
    }
});

test('the toggle is registered as a lifecycle feature on every page', () => {
    const spec = homeSubsCss.LIFECYCLE_SPECS.find(entry => entry.id === 'fullTitles');
    assert.ok(spec, 'fullTitles has no lifecycle spec');
    assert.deepEqual([...spec.pageScopes], ['all']);
});

test('fullTitles ships on by default across all three declarations', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..', 'extension');

    const defaults = JSON.parse(fs.readFileSync(path.join(root, 'default-settings.json'), 'utf8'));
    assert.equal(defaults.fullTitles, true);

    const schema = fs.readFileSync(path.join(root, 'core', 'settings-schema.js'), 'utf8');
    const entry = schema.split('\n').find(line => line.includes('key: "fullTitles"'));
    assert.ok(entry, 'fullTitles missing from the settings schema');
    assert.match(entry, /defaultValue:\s*true/);

    const runtime = fs.readFileSync(path.join(root, 'ytkit.js'), 'utf8');
    assert.match(runtime, /^\s*fullTitles:\s*true,/m);
});
