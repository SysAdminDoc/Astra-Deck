(() => {
    'use strict';

    // iter-7 N11 (M-phase extraction #2): PredicateSandbox moved out of
    // the 44k-line ytkit.js monolith into a focused core module.
    //
    // Option C from docs/predicate-sandbox-investigation.md — an
    // expression-only AST walker. No eval, no Function, no with. The
    // body parses into an AST of comparisons / logical-ops / literal /
    // ctx-access / method-call only. ctx is frozen at the call site.
    // Evaluator returns boolean; PredicateError is thrown only from
    // compile() and is surfaced to the caller as { ok:false, error,
    // position } — it never propagates out of the evaluator.
    //
    // The factory takes one optional callback:
    //   debugLog(category, message) — used by the evaluator for
    //     budget/circuit telemetry. Defaults to a no-op so unit tests
    //     can drop in a recorder without a full DebugManager.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createPredicateSandbox) return;

    class PredicateError extends Error {
        constructor(message, position = -1) {
            super(message);
            this.name = 'PredicateError';
            this.position = position;
        }
    }

    function createPredicateSandbox(options = {}) {
        const debugLog = typeof options.debugLog === 'function'
            ? options.debugLog
            : () => {};

        const ALLOWED_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'match', 'test']);
        const STRING_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'match']);
        const REGEX_METHODS = new Set(['test']);
        // ReDoS guard — same shape videoHider uses for keyword regex.
        function hasUnsafeQuantifiers(pattern) {
            const adjacent = /([+*?]|\{\d+,?\d*\})\s*[+*?]/.test(pattern);
            const groupInner = /\(([^()]*(?:[+*?]|\{\d+,?\d*\})[^()]*)\)\s*(?:[+*?]|\{\d+,?\d*\})/.test(pattern);
            return adjacent || groupInner;
        }

        // ── Tokenizer ──
        function tokenize(src) {
            const tokens = [];
            let i = 0;
            const len = src.length;
            while (i < len) {
                const ch = src[i];
                if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
                // Skip // and /* */ comments (not regex; regex must be quoted as string).
                if (ch === '/' && src[i + 1] === '/') {
                    while (i < len && src[i] !== '\n') i++;
                    continue;
                }
                if (ch === '/' && src[i + 1] === '*') {
                    i += 2;
                    while (i < len && !(src[i] === '*' && src[i + 1] === '/')) i++;
                    i += 2;
                    continue;
                }
                if (ch === '(' || ch === ')' || ch === ',' || ch === '.') {
                    tokens.push({ type: ch, value: ch, pos: i });
                    i++; continue;
                }
                if (ch === '&' && src[i + 1] === '&') { tokens.push({ type: 'op', value: '&&', pos: i }); i += 2; continue; }
                if (ch === '|' && src[i + 1] === '|') { tokens.push({ type: 'op', value: '||', pos: i }); i += 2; continue; }
                if (ch === '!') {
                    if (src[i + 1] === '=' && src[i + 2] === '=') { tokens.push({ type: 'op', value: '!==', pos: i }); i += 3; continue; }
                    tokens.push({ type: 'op', value: '!', pos: i }); i++; continue;
                }
                if (ch === '=' && src[i + 1] === '=' && src[i + 2] === '=') { tokens.push({ type: 'op', value: '===', pos: i }); i += 3; continue; }
                if (ch === '<' && src[i + 1] === '=') { tokens.push({ type: 'op', value: '<=', pos: i }); i += 2; continue; }
                if (ch === '>' && src[i + 1] === '=') { tokens.push({ type: 'op', value: '>=', pos: i }); i += 2; continue; }
                if (ch === '<') { tokens.push({ type: 'op', value: '<', pos: i }); i++; continue; }
                if (ch === '>') { tokens.push({ type: 'op', value: '>', pos: i }); i++; continue; }
                if (ch === '"' || ch === "'") {
                    const quote = ch;
                    const startPos = i;
                    i++;
                    let value = '';
                    while (i < len && src[i] !== quote) {
                        if (src[i] === '\\' && i + 1 < len) {
                            const next = src[i + 1];
                            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
                            value += map[next] != null ? map[next] : next;
                            i += 2; continue;
                        }
                        value += src[i]; i++;
                    }
                    if (i >= len) throw new PredicateError('Unterminated string literal', startPos);
                    i++;
                    tokens.push({ type: 'string', value, pos: startPos });
                    continue;
                }
                if (ch >= '0' && ch <= '9') {
                    const startPos = i;
                    let num = '';
                    while (i < len && /[0-9.]/.test(src[i])) { num += src[i]; i++; }
                    tokens.push({ type: 'number', value: Number(num), pos: startPos });
                    continue;
                }
                if (/[a-zA-Z_$]/.test(ch)) {
                    const startPos = i;
                    let id = '';
                    while (i < len && /[a-zA-Z0-9_$]/.test(src[i])) { id += src[i]; i++; }
                    if (id === 'true' || id === 'false') tokens.push({ type: 'bool', value: id === 'true', pos: startPos });
                    else if (id === 'null') tokens.push({ type: 'null', value: null, pos: startPos });
                    else tokens.push({ type: 'ident', value: id, pos: startPos });
                    continue;
                }
                throw new PredicateError(`Unexpected character "${ch}"`, i);
            }
            return tokens;
        }

        // ── Parser (recursive descent) ──
        function parse(src) {
            const tokens = tokenize(src);
            let pos = 0;
            const peek = () => tokens[pos];
            const eat = (type, value) => {
                const t = tokens[pos];
                if (!t || t.type !== type || (value != null && t.value !== value)) {
                    const got = t ? `${t.type}(${t.value})` : 'end of input';
                    const want = value != null ? `${type}(${value})` : type;
                    throw new PredicateError(`Expected ${want}, got ${got}`, t ? t.pos : src.length);
                }
                pos++;
                return t;
            };
            function parseOr() {
                let left = parseAnd();
                while (peek()?.type === 'op' && peek().value === '||') {
                    eat('op', '||');
                    left = { kind: 'logical', op: '||', left, right: parseAnd() };
                }
                return left;
            }
            function parseAnd() {
                let left = parseNot();
                while (peek()?.type === 'op' && peek().value === '&&') {
                    eat('op', '&&');
                    left = { kind: 'logical', op: '&&', left, right: parseNot() };
                }
                return left;
            }
            function parseNot() {
                if (peek()?.type === 'op' && peek().value === '!') {
                    eat('op', '!');
                    return { kind: 'unary', op: '!', operand: parseNot() };
                }
                return parseCmp();
            }
            function parseCmp() {
                const left = parseValue();
                const t = peek();
                if (t?.type === 'op' && ['===', '!==', '<', '<=', '>', '>='].includes(t.value)) {
                    eat('op', t.value);
                    const right = parseValue();
                    return { kind: 'cmp', op: t.value, left, right };
                }
                return left;
            }
            function parseValue() {
                const t = peek();
                if (!t) throw new PredicateError('Unexpected end of input', src.length);
                if (t.type === '(') {
                    eat('(');
                    const inner = parseOr();
                    eat(')');
                    return inner;
                }
                if (t.type === 'number' || t.type === 'string' || t.type === 'bool' || t.type === 'null') {
                    pos++;
                    return { kind: 'literal', value: t.value };
                }
                if (t.type === 'ident') {
                    if (t.value !== 'ctx') throw new PredicateError(`Only "ctx" is allowed, got "${t.value}"`, t.pos);
                    pos++;
                    const path = [];
                    while (peek()?.type === '.') {
                        eat('.');
                        const ident = eat('ident');
                        path.push(ident.value);
                    }
                    if (path.length === 0) throw new PredicateError('ctx requires at least one property access', t.pos);
                    if (peek()?.type === '(') {
                        const method = path.pop();
                        if (!ALLOWED_METHODS.has(method)) {
                            throw new PredicateError(`Method "${method}" not allowed`, t.pos);
                        }
                        eat('(');
                        const args = [];
                        if (peek()?.type !== ')') {
                            args.push(parseValue());
                            while (peek()?.type === ',') { eat(','); args.push(parseValue()); }
                            if (args.length > 2) throw new PredicateError(`Method "${method}" takes 1-2 args`, t.pos);
                        }
                        eat(')');
                        if (method === 'match' || method === 'test') {
                            // First arg must be a literal string we can ReDoS-screen at parse time.
                            const patternArg = args[0];
                            if (!patternArg || patternArg.kind !== 'literal' || typeof patternArg.value !== 'string') {
                                throw new PredicateError(`${method}() needs a string literal pattern`, t.pos);
                            }
                            if (hasUnsafeQuantifiers(patternArg.value)) {
                                throw new PredicateError(`${method}() pattern rejected: nested quantifiers (ReDoS risk)`, t.pos);
                            }
                            try { new RegExp(patternArg.value, args[1]?.value || ''); }
                            catch (e) { throw new PredicateError(`Invalid regex: ${e.message}`, t.pos); }
                        }
                        return { kind: 'method', target: path, method, args };
                    }
                    return { kind: 'access', path };
                }
                throw new PredicateError(`Unexpected token "${t.value}"`, t.pos);
            }
            const ast = parseOr();
            if (pos !== tokens.length) {
                const remaining = tokens[pos];
                throw new PredicateError(`Unexpected trailing token "${remaining.value}"`, remaining.pos);
            }
            return ast;
        }

        function readPath(ctx, path, posInfo) {
            let cursor = ctx;
            for (const seg of path) {
                if (cursor == null) return undefined;
                if (!Object.prototype.hasOwnProperty.call(cursor, seg)) {
                    throw new PredicateError(`ctx.${path.join('.')} is not a known field`, posInfo);
                }
                cursor = cursor[seg];
            }
            return cursor;
        }

        function evaluate(node, ctx) {
            switch (node.kind) {
                case 'literal': return node.value;
                case 'logical':
                    if (node.op === '&&') return !!evaluate(node.left, ctx) && !!evaluate(node.right, ctx);
                    return !!evaluate(node.left, ctx) || !!evaluate(node.right, ctx);
                case 'unary': return !evaluate(node.operand, ctx);
                case 'cmp': {
                    const a = evaluate(node.left, ctx);
                    const b = evaluate(node.right, ctx);
                    switch (node.op) {
                        case '===': return a === b;
                        case '!==': return a !== b;
                        case '<': return a < b;
                        case '<=': return a <= b;
                        case '>': return a > b;
                        case '>=': return a >= b;
                    }
                    return false;
                }
                case 'access': return readPath(ctx, node.path, -1);
                case 'method': {
                    const target = readPath(ctx, node.target, -1);
                    if (target == null) return false;
                    const args = node.args.map(a => evaluate(a, ctx));
                    if (node.method === 'test') {
                        if (typeof target !== 'string') return false;
                        try {
                            const re = new RegExp(args[0], args[1] || '');
                            return re.test(target);
                        } catch { return false; }
                    }
                    if (node.method === 'match') {
                        if (typeof target !== 'string') return false;
                        try {
                            const re = new RegExp(args[0], args[1] || '');
                            return re.test(target);
                        } catch { return false; }
                    }
                    if (STRING_METHODS.has(node.method) && typeof target === 'string') {
                        return target[node.method](args[0]);
                    }
                    return false;
                }
            }
            return false;
        }

        function compile(source) {
            if (typeof source !== 'string') return { ok: false, error: 'Predicate must be a string', position: 0 };
            const trimmed = source.trim();
            if (!trimmed) return { ok: false, error: 'Predicate is empty', position: 0 };
            if (trimmed.length > 20000) return { ok: false, error: 'Predicate too long', position: 20000 };
            try {
                const ast = parse(trimmed);
                let consecutiveErrors = 0;
                const BUDGET_MS = 5;
                const ERROR_CIRCUIT = 10;
                let circuitOpen = false;
                const evaluator = (rawCtx) => {
                    if (circuitOpen) return false;
                    const ctx = Object.isFrozen(rawCtx) ? rawCtx : Object.freeze({ ...rawCtx });
                    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    try {
                        const result = !!evaluate(ast, ctx);
                        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        if (now - start > BUDGET_MS) {
                            debugLog('Predicate', 'Eval exceeded 5ms budget; auto-disabled for route');
                            circuitOpen = true;
                            return false;
                        }
                        consecutiveErrors = 0;
                        return result;
                    } catch (e) {
                        consecutiveErrors++;
                        debugLog('Predicate', `Eval error: ${e.message}`);
                        if (consecutiveErrors >= ERROR_CIRCUIT) {
                            circuitOpen = true;
                            debugLog('Predicate', 'Circuit opened after 10 consecutive errors; auto-disabled');
                        }
                        return false;
                    }
                };
                evaluator.reset = () => { circuitOpen = false; consecutiveErrors = 0; };
                return { ok: true, evaluator, ast };
            } catch (e) {
                return {
                    ok: false,
                    error: e instanceof PredicateError ? e.message : String(e),
                    position: e instanceof PredicateError ? e.position : -1
                };
            }
        }

        return { compile, PredicateError };
    }

    Object.assign(core, {
        createPredicateSandbox,
        PredicateError
    });
})();
