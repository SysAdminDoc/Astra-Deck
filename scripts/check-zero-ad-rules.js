#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'extension', 'manifest.json');
const RULESET_PATH = path.join(REPO_ROOT, 'extension', 'rules', 'zero-ads.json');
const EARLY_CSS_PATH = path.join(REPO_ROOT, 'extension', 'early.css');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'YTKit.user.js');

const OBSERVED_REQUESTS = Object.freeze([
    Object.freeze({
        url: 'https://googleads.g.doubleclick.net/pagead/id',
        initiator: 'https://www.youtube.com/',
        resourceType: 'xmlhttprequest'
    }),
    Object.freeze({
        url: 'https://static.doubleclick.net/instream/ad_status.js',
        initiator: 'https://www.youtube.com/',
        resourceType: 'script'
    }),
    Object.freeze({
        url: 'https://www.google.com/pagead/lvz',
        initiator: 'https://www.youtube.com/',
        resourceType: 'image'
    })
]);

const REQUIRED_SHELL_SELECTORS = Object.freeze([
    '#masthead-ad',
    '#player-ads',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-ad-slot-renderer',
    '.video-ads',
    '.ytp-ad-module'
]);

function domainMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

function urlFilterMatches(url, urlFilter) {
    if (!urlFilter) return true;
    if (!urlFilter.startsWith('||')) return url.includes(urlFilter);
    const anchored = urlFilter.slice(2);
    const slashIndex = anchored.indexOf('/');
    const domain = slashIndex === -1 ? anchored : anchored.slice(0, slashIndex);
    const pathPrefix = slashIndex === -1 ? '/' : anchored.slice(slashIndex);
    const parsed = new URL(url);
    return domainMatches(parsed.hostname, domain) && parsed.pathname.startsWith(pathPrefix);
}

function ruleCoversRequest(rule, request) {
    const condition = rule?.condition || {};
    const requestUrl = new URL(request.url);
    const initiatorUrl = new URL(request.initiator);
    if (rule?.action?.type !== 'block') return false;
    if (condition.requestDomains
        && !condition.requestDomains.some((domain) => domainMatches(requestUrl.hostname, domain))) return false;
    if (condition.initiatorDomains
        && !condition.initiatorDomains.some((domain) => domainMatches(initiatorUrl.hostname, domain))) return false;
    if (condition.resourceTypes && !condition.resourceTypes.includes(request.resourceType)) return false;
    return urlFilterMatches(request.url, condition.urlFilter);
}

function auditZeroAdRules() {
    const failures = [];
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const rules = JSON.parse(fs.readFileSync(RULESET_PATH, 'utf8'));
    const earlyCss = fs.readFileSync(EARLY_CSS_PATH, 'utf8');
    const userscript = fs.readFileSync(USERSCRIPT_PATH, 'utf8');

    if (!manifest.permissions?.includes('declarativeNetRequest')) {
        failures.push('manifest is missing declarativeNetRequest permission');
    }
    const resource = manifest.declarative_net_request?.rule_resources?.find(
        ({ id }) => id === 'astra_zero_ads'
    );
    if (!resource?.enabled || resource.path !== 'rules/zero-ads.json') {
        failures.push('manifest does not enable rules/zero-ads.json as astra_zero_ads');
    }
    if (!Array.isArray(rules) || rules.length === 0) failures.push('zero-ad ruleset is empty');
    const ruleIds = rules.map(({ id }) => id);
    if (ruleIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ruleIds).size !== ruleIds.length) {
        failures.push('zero-ad rule ids must be unique positive integers');
    }
    for (const request of OBSERVED_REQUESTS) {
        if (!rules.some((rule) => ruleCoversRequest(rule, request))) {
            failures.push(`observed request is not blocked: ${request.url}`);
        }
    }
    for (const selector of REQUIRED_SHELL_SELECTORS) {
        if (!earlyCss.includes(selector)) failures.push(`extension early CSS misses ${selector}`);
        if (!userscript.includes(selector)) failures.push(`userscript early CSS misses ${selector}`);
    }
    if (userscript.indexOf('const ZERO_AD_CSS') > userscript.indexOf('BEGIN v5.0.0 bundled core modules')) {
        failures.push('userscript zero-ad CSS is not installed before bundled runtime startup');
    }
    if (!userscript.includes("'data-ytkit-userscript-ad-contract'")) {
        failures.push('userscript does not publish its shell-only ad contract');
    }
    if (!userscript.includes("'document-start-shells-only'")) {
        failures.push('userscript ad contract must not claim browser-level request blocking');
    }
    const serializedRules = JSON.stringify(rules);
    for (const protectedHost of ['googlevideo.com', 'ytimg.com']) {
        if (serializedRules.includes(protectedHost)) {
            failures.push(`ruleset must not block YouTube media host ${protectedHost}`);
        }
    }

    return { failures, rules, observedRequests: OBSERVED_REQUESTS };
}

if (require.main === module) {
    const result = auditZeroAdRules();
    if (result.failures.length) {
        console.error(`[check-zero-ad-rules] ${result.failures.length} failure(s):`);
        for (const failure of result.failures) console.error(`  - ${failure}`);
        process.exitCode = 1;
    } else {
        console.log(
            `[check-zero-ad-rules] OK — ${result.rules.length} static rules cover `
            + `${result.observedRequests.length} captured ad requests and persistent shell suppression`
        );
    }
}

module.exports = { OBSERVED_REQUESTS, auditZeroAdRules, domainMatches, ruleCoversRequest, urlFilterMatches };
