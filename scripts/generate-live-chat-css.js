'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_PATH = path.join(REPO_ROOT, 'extension', 'ytkit.js');
const OUTPUT_PATH = path.join(REPO_ROOT, 'extension', 'live-chat.css');
const HEADER = '/* Generated from premiumLiveChat in extension/ytkit.js. Run npm run generate:live-chat-css after editing that source. */\n';

function extractPremiumLiveChatCss(source) {
    const featureStart = source.indexOf("id: 'premiumLiveChat'");
    if (featureStart < 0) throw new Error('premiumLiveChat feature marker is missing');
    const assignment = 'const css = `';
    const cssStart = source.indexOf(assignment, featureStart);
    if (cssStart < 0) throw new Error('premiumLiveChat CSS template is missing');
    const contentStart = cssStart + assignment.length;
    const endMarker = '`;\n\n                this._styleElement = injectStyle(css, this.id, true);';
    const cssEnd = source.indexOf(endMarker, contentStart);
    if (cssEnd < 0) throw new Error('premiumLiveChat CSS template terminator is missing');
    const raw = source.slice(contentStart, cssEnd);
    if (raw.includes('${')) throw new Error('premiumLiveChat CSS must remain a static template');
    const lines = raw.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '').split(/\r?\n/);
    const indents = lines
        .filter((line) => line.trim())
        .map((line) => line.match(/^\s*/)[0].length);
    const indent = Math.min(...indents);
    return lines.map((line) => line.slice(Math.min(indent, line.length))).join('\n') + '\n';
}

function generate() {
    return HEADER + extractPremiumLiveChatCss(fs.readFileSync(SOURCE_PATH, 'utf8'));
}

function main(args = process.argv.slice(2)) {
    const expected = generate();
    if (args.includes('--check')) {
        const actual = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : '';
        if (actual !== expected) {
            console.error('[generate-live-chat-css] extension/live-chat.css is stale; run npm run generate:live-chat-css');
            process.exitCode = 1;
            return;
        }
        console.log('[generate-live-chat-css] OK — generated CSS matches premiumLiveChat');
        return;
    }
    fs.writeFileSync(OUTPUT_PATH, expected, 'utf8');
    console.log(`[generate-live-chat-css] Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) main();

module.exports = { extractPremiumLiveChatCss, generate, main };
