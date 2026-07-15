'use strict';

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function waitForCondition(predicate, options = {}) {
    const attempts = Number.isInteger(options.attempts) ? options.attempts : 50;
    const schedule = typeof options.schedule === 'function' ? options.schedule : setImmediate;
    let lastValue;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        lastValue = await predicate();
        if (lastValue) return lastValue;
        await new Promise((resolve) => schedule(resolve));
    }
    throw new Error(`Condition did not complete after ${attempts} scheduler turns; last value: ${String(lastValue)}`);
}

module.exports = { createDeferred, waitForCondition };
