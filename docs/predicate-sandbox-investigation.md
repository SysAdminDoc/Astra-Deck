# Advanced Local Predicate Sandbox — Investigation

> Status: investigation. Default off. Not yet enabled in any shipped feature.
> Scope: v3.25.0 BlockTube parity work.
> Settings keys: `advancedLocalPredicate` (boolean, default off),
> `advancedLocalPredicateCode` (string, default empty, capped 20000 chars).

## Goal

BlockTube ships an "advanced custom predicate" filter where the user writes a
short JavaScript expression returning `true` to block a card. Astra Deck has the
matching setting keys but no execution path. This document records the design
constraints, the threats considered, and the bar that must be cleared before
the predicate runs against live YouTube DOM.

The user-facing contract is:

```js
// `ctx` is read-only. Return true to hide the card.
return ctx.title.toLowerCase().includes('giveaway')
    && ctx.durationSec < 60;
```

The predicate must never be able to:

1. Exfiltrate cookies, tokens, history, settings, or transcripts.
2. Reach the network (fetch / XHR / WebSocket / EventSource / SendBeacon /
   `new Image().src` / dynamic `<script>`).
3. Mutate the page beyond the card the resolver is asking about — and even then
   only via the explicit `ctx` surface, never raw DOM nodes.
4. Mutate Astra Deck settings, blocklists, or the feature registry.
5. Hang the renderer (infinite loops, heavy regex, sync XHR).
6. Persist across reloads except through the explicit `ctx.flag(...)` helper.

## Threat Model

The predicate body is **user-authored** but the user is not necessarily the
attacker. The realistic threats are:

| # | Actor | Vector | Mitigation strategy |
|---|---|---|---|
| 1 | The user themselves | Copies a "cool predicate" off Reddit that exfiltrates session data. | Block all global identifiers; allow only `ctx`. Block `Function`/`eval` re-entry. |
| 2 | A malicious extension that mutates `chrome.storage.local` | Writes a predicate body into our settings key from outside the popup. | Predicate runs in **page-isolated** sandbox, not in extension context. Has no `chrome.*` access regardless of body. |
| 3 | YouTube itself | Tries to fingerprint extensions by observing the predicate's side effects. | Predicate runs synchronously on data we already extracted, returns boolean only. No DOM writes, no observable timing channel by design. |
| 4 | The user's own bug | Predicate loops, throws every card, or always returns true. | 5 ms per-card wall clock budget enforced via `performance.now()` + cumulative-throw circuit breaker (10 consecutive errors → auto-disable). |

We are **not** trying to defend against a determined attacker with code-exec on
the user's machine. The browser is already lost in that scenario.

## Sandbox Options Considered

### Option A — `new Function(...)` in isolated world (rejected as primary)

- Body runs in our content script's isolated-world realm.
- We *can* shadow `window`, `document`, `chrome`, `fetch`, etc. with `undefined`
  by wrapping the body in `with ({ window: undefined, … }) { … }`.
- But: `with` is brittle, ES modules forbid it, and `eval`/`Function` inside
  the body still pierces the curtain.
- We *cannot* shadow `globalThis` or block re-entry into `Function`/`eval`
  reliably.
- **Verdict:** workable for trusted users but not robust enough to ship default-
  off as "safe."

### Option B — `iframe[sandbox]` worker (rejected — too heavy)

- Spin up a hidden `<iframe sandbox="allow-scripts">` per surface eval.
- Postmessage `(predicate, ctx)` in, `boolean` out.
- The iframe gets its own document, no cookies (`sandbox` drops same-origin),
  no `chrome.*`, no access to our content-script realm.
- **Killer downside:** every feed card eval is async and crosses a postMessage
  boundary. Feed processing budgets are already tight. A 60-card scroll batch
  would chew 60 postMessages.
- **Verdict:** correct but unaffordable.

### Option C — Static AST allowlist (rejected as primary)

- Parse the body with a tiny expression parser (jsep-style).
- Allow only: property access on `ctx`, comparisons, `&&`/`||`/`!`, string
  literals, number literals, `.includes`/`.startsWith`/`.endsWith`/`.test` on
  whitelisted methods.
- Reject everything else, including function calls outside the allowlist,
  `new`, member access on anything but `ctx`, regex literals (unless
  ReDoS-prechecked), `for`/`while`/recursion.
- **Verdict:** safest, also the smallest behavioural surface. Locks the user
  into expression-only predicates, no `let foo = …` lines. **Recommended.**

### Option D — Hybrid (recommended for v3.26+)

- v3.25: ship Option C as **the only path**. Document it as "expression
  predicates."
- v3.26+: if there is demand, layer Option B behind an "Experimental: full
  script predicate" toggle with the iframe transport. Keep the default-off
  posture.

## The Expression Grammar (Option C, frozen)

The smallest grammar that still beats BlockTube's "title contains, duration
under, channel ID equals" use case:

```
expr        := orExpr
orExpr      := andExpr ( '||' andExpr )*
andExpr     := notExpr ( '&&' notExpr )*
notExpr     := '!' notExpr | cmpExpr
cmpExpr     := value ( ('==='|'!=='|'<'|'<='|'>'|'>=') value )?
value       := literal | ctxAccess | methodCall | '(' expr ')'
literal     := number | string | 'true' | 'false' | 'null'
ctxAccess   := 'ctx' ( '.' identifier )+
methodCall  := ctxAccess '.' allowedMethod '(' value (',' value)? ')'
allowedMethod := 'includes' | 'startsWith' | 'endsWith' | 'match' | 'test'
identifier  := [a-zA-Z_$][a-zA-Z0-9_$]*
```

`match` and `test` reject patterns containing nested quantifiers (the same
ReDoS guard `videoHider` already enforces against the keyword filter).

Forbidden constructs: `function`, `=>`, `let`/`const`/`var`, `;`, `,` outside
arg lists, `[]` indexing, `new`, template literals, `await`, `typeof`,
`instanceof`, `in`, `delete`, `void`. The parser reports the first invalid
token and refuses to compile. The user sees the error in the settings panel —
no silent fallback.

## The `ctx` Surface (frozen)

```ts
interface PredicateCtx {
  // Identity
  videoId: string;          // 11-char YT id, '' if unknown
  channelId: string;        // 'UC…' if resolvable, '' otherwise
  channelHandle: string;    // '@foo' or ''
  // Text
  title: string;
  channelName: string;
  // Metadata
  durationSec: number;      // 0 if unknown
  viewCount: number;        // 0 if unknown
  ageDays: number;          // 0 if unknown
  isLive: boolean;
  isUpcoming: boolean;
  isShort: boolean;
  isMix: boolean;
  isMembersOnly: boolean;
  isAutoDubbed: boolean;
  // Surface
  page: 'home' | 'subscriptions' | 'search' | 'watch' | 'channel' | 'other';
}
```

All values are pre-extracted by `videoHider._extractCardCtx(element)` before
the predicate runs. The predicate receives a **frozen** ctx; mutation throws.
There is no element handle, no DOM reference, no callback. Output is one
boolean.

## Performance Budget

- Compile once per `advancedLocalPredicateCode` change, cache the compiled AST
  walker.
- 5 ms wall clock per card eval, enforced by `performance.now()` check at the
  top of every node walk. A predicate that exceeds the budget on a single card
  is auto-disabled for the remainder of the SPA route.
- 10 consecutive throws → the feature toggles itself off and surfaces a toast
  + a diagnostic-log entry. The user must re-enable.

## What This Investigation Concludes

1. **Ship Option C in v3.25.0** behind the existing `advancedLocalPredicate`
   toggle, default off, with the documented expression grammar.
2. The runtime must integrate with `videoHider._shouldHide` *after* the
   keyword/regex check, *before* the metadata filter, so predicates can both
   tighten existing hides and override them via a wrapping `!`.
3. The compile step must run inside the settings panel's "save" flow so the
   user sees parse errors immediately, not at first scroll.
4. The implementation lives in a single new module section in `ytkit.js`
   (`predicateSandbox`) plus a settings-panel textarea. No background-script
   surface needed; predicates never touch network or storage.
5. The follow-up Option B work is **not** scheduled for v3.25.0. Re-evaluate
   when (a) a real user requests `let`/`for` and (b) the iframe transport cost
   is paid for by an unrelated feature.

## Acceptance Checklist (v3.25.0)

- [ ] `parsePredicate(source)` returns either `{ ok: true, evaluator }` or
      `{ ok: false, error, position }`. No silent fallback.
- [ ] Settings panel surfaces parse errors inline.
- [ ] `evaluator(ctx)` is pure: same ctx → same boolean, no observable side
      effects.
- [ ] 5 ms per-card budget enforced.
- [ ] 10-consecutive-error circuit breaker auto-disables and toasts.
- [ ] `ctx` object is `Object.freeze`-d; mutation throws but does not crash
      the surrounding `_shouldHide` loop.
- [ ] Import/export round-trips the code body. Safe-store profile **strips**
      the code body (it is local-only sensitive surface).
- [ ] No `eval`, no `Function`, no `with`, no `new Function` anywhere in the
      sandbox path. Verified by a unit test that greps the implementation.

## References

- BlockTube custom JS predicate docs:
  <https://github.com/amitbl/blocktube#advanced-block-rules>
- jsep expression parser (design inspiration, not a dependency):
  <https://github.com/EricSmekens/jsep>
- "Why `with` is not a sandbox" (MDN):
  <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with#security_concerns>
