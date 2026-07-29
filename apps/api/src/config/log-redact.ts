import type { Bindings, ChildLoggerOptions, Logger } from "pino";

/**
 * Redaction by key name at any depth (issue #143).
 *
 * This replaces a `pino` `redact.paths` array that generated 81 wildcard
 * matchers — `SENSITIVE_KEYS` x `SENSITIVE_CONTAINERS` as `*.<container>.<key>`
 * plus `*.<key>`. That config had two problems:
 *
 *  - **Cost.** Every wildcard path is a compiled matcher run against every
 *    top-level key of every log line, so the price was ~81x a bare path and
 *    scaled with the payload's key count. Measured at ~185us per request
 *    against ~2.9us for plain pino.
 *  - **Coverage.** Wildcards are depth-anchored. Nothing deeper than
 *    `*.<container>.<key>` was covered, nothing inside an array element was
 *    covered, key matching was case-sensitive, and a container name outside the
 *    eight-name list was not covered. Four distinct leak classes, each of which
 *    has a regression test in `log-redact.test.ts`.
 *
 * One walk over the object replaces all 81 matchers and closes all four.
 *
 * The remaining declarative paths live in `logger.ts` as bare (non-wildcard)
 * path names. Bare paths are free — measured at parity with plain pino — and
 * they cover the one surface this walk cannot reach: pino serializes a child
 * logger's bindings at `child()` time, before any log formatter runs. See
 * `withScrubbedChildren` for the nested-binding half of that.
 */

/**
 * Property names whose value never belongs in a log line, matched
 * case-insensitively at any depth.
 *
 * Changing this list changes what production redacts. Removing a name is a
 * security change; adding one costs nothing at runtime (the lookup is a single
 * `Set.has`) but can hide a field someone was using to debug — see the
 * "collision" note in `log-redact.test.ts`.
 */
export const SENSITIVE_KEYS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "api_key",
  "secret",
  "authorization",
  "cookie",
  "set-cookie",
];

/**
 * Env var names carrying a credential. These are not derivable from
 * `SENSITIVE_KEYS` by shape, so they are listed. They matter because a
 * config-dump log line (`logger.debug({ env })`) would otherwise print them.
 */
export const SENSITIVE_ENV_KEYS = [
  "SDK_PASSWORD",
  "SDK_USERNAME",
  "BETTER_AUTH_SECRET",
  "SCOREBOARD_INGEST_KEY",
  "REFEREE_SDK_PASSWORD",
  "EXPO_ACCESS_TOKEN",
];

const SENSITIVE = new Set(
  [...SENSITIVE_KEYS, ...SENSITIVE_ENV_KEYS].map((k) => k.toLowerCase()),
);

export const CENSOR = "[REDACTED]";

/**
 * Depth and size budgets, measured 2026-07-29 rather than guessed.
 *
 * Every log call site in `apps/api/src` was enumerated (230 with an object
 * payload): 98.7% pass a flat object literal, the deepest literal nests 2, and
 * the widest names 6 properties. Expanding the ones whose fields are variables
 * gives the real ceiling:
 *
 *   requestLogger info (1 per request)      depth 2, 13 properties
 *   requestLogger debug (header dump)       depth 2, 24 properties  <- widest
 *   errorHandler 500 line                   depth 3, 10 properties
 *   Error with a two-deep cause chain       depth 4, 12 properties
 *   AggregateError with causes              depth 5, 17 properties  <- deepest
 *   Expo API response body ({ raw })        depth 5, 16 properties
 *
 * So: observed maximum depth 5, observed maximum 24 properties. 12 leaves 2.4x
 * headroom on depth; 5000 leaves 208x on size. Both are far enough above real
 * traffic that nothing legitimate is ever truncated, and far enough below a
 * hostile payload that one log line cannot become milliseconds of CPU.
 *
 * What would actually get clipped in practice: an Error whose `cause` chain is
 * more than ~10 links deep. Nothing in this app builds one — no source file
 * sets `cause` — and the library-produced chains (undici's `fetch failed`) run
 * 1-2 deep. If one ever appears, the outer message and stack survive; the
 * innermost causes are replaced.
 *
 * Past either limit the subtree is replaced rather than passed through.
 * Censoring is the safe failure mode: someone who can nest or widen a payload
 * past the budget gets it dropped, not printed in clear.
 */
export const MAX_DEPTH = 12;

/**
 * See `MAX_DEPTH` for how this number was chosen.
 *
 * The budget only works if the truncation path is itself O(visited). An earlier
 * version rebuilt the copy with `Object.assign` over the whole record, which is
 * O(width) work performed *after* the budget was supposed to have stopped it —
 * that made a 20k-key object slower than the config this replaced. See the
 * comment at the truncation branch in `walkObject`.
 */
export const MAX_NODES = 5_000;

export const DEPTH_MARKER = "[TRUNCATED: depth]";
export const NODES_MARKER = "[TRUNCATED: size]";
export const CYCLE_MARKER = "[CIRCULAR]";

function isSensitive(key: string): boolean {
  return SENSITIVE.has(key.toLowerCase());
}

/**
 * Values that must not be walked.
 *
 * Buffers and typed arrays are index-keyed, so walking one is O(byte length)
 * for no benefit — a 10 MB Buffer would cost 10M property visits. Dates and
 * RegExps have no useful own enumerable keys. Map/Set contents are invisible to
 * `JSON.stringify`, so pino never emits them and there is nothing to censor.
 */
function isOpaque(value: object): boolean {
  return (
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set
  );
}

interface WalkState {
  nodes: number;
}

/**
 * An empty object with `source`'s prototype, so an Error stays an Error (pino's
 * standard serializer checks `instanceof Error`) and a class instance keeps its
 * methods and any `toJSON`.
 */
function cloneShell(source: object): Record<string, unknown> {
  const proto: object | null = Object.getPrototypeOf(source) as object | null;
  return Object.create(proto) as Record<string, unknown>;
}

/**
 * `message` and `stack` are non-enumerable own properties, so neither
 * `Object.keys` nor `Object.assign` carries them onto the clone. Without this
 * a censored error would serialize with no message and no stack.
 */
function restoreErrorFields(copy: Record<string, unknown>, err: Error): void {
  Object.defineProperty(copy, "message", {
    value: err.message,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(copy, "stack", {
    value: err.stack,
    writable: true,
    configurable: true,
  });
}

function walkArray(
  arr: unknown[],
  depth: number,
  ancestors: Set<object>,
  state: WalkState,
): unknown {
  let copy: unknown[] | undefined;
  for (let i = 0; i < arr.length; i++) {
    if (++state.nodes > MAX_NODES) {
      copy ??= arr.slice(0, i);
      copy.length = i;
      copy.push(NODES_MARKER);
      return copy;
    }
    const before = arr[i];
    const after = walk(before, depth + 1, ancestors, state);
    if (after !== before) {
      copy ??= arr.slice();
      copy[i] = after;
    }
  }
  return copy ?? arr;
}

function walkObject(
  obj: object,
  depth: number,
  ancestors: Set<object>,
  state: WalkState,
): unknown {
  // Own enumerable string keys — exactly what `JSON.stringify` would emit, so
  // nothing reachable in the output is skipped. Works on a null-prototype
  // object too.
  const keys = Object.keys(obj);
  const record = obj as Record<string, unknown>;
  let copy: Record<string, unknown> | undefined;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string;

    if (++state.nodes > MAX_NODES) {
      // Build the truncated copy from the keys already visited, never from the
      // whole record: `Object.assign` here would be O(width) work done *after*
      // the budget was supposed to have stopped it, which is the exact
      // amplification the budget exists to prevent.
      if (copy === undefined) {
        copy = cloneShell(obj);
        for (let j = 0; j < i; j++) {
          const visited = keys[j] as string;
          copy[visited] = record[visited];
        }
      }
      copy[key] = NODES_MARKER;
      if (obj instanceof Error) restoreErrorFields(copy, obj);
      return copy;
    }

    const before = record[key];
    const after = isSensitive(key)
      ? CENSOR
      : walk(before, depth + 1, ancestors, state);

    if (after !== before) {
      copy ??= Object.assign(cloneShell(obj), record);
      copy[key] = after;
    }
  }

  if (copy && obj instanceof Error) restoreErrorFields(copy, obj);
  return copy ?? obj;
}

function walk(
  value: unknown,
  depth: number,
  ancestors: Set<object>,
  state: WalkState,
): unknown {
  if (value === null || typeof value !== "object") return value;

  const obj: object = value;
  if (isOpaque(obj)) return value;
  // An *ancestor* set, not a visited set: a shared reference that appears twice
  // in a tree is not a cycle, and censoring it as one would lose real fields.
  if (ancestors.has(obj)) return CYCLE_MARKER;
  if (depth >= MAX_DEPTH) return DEPTH_MARKER;

  ancestors.add(obj);
  try {
    return Array.isArray(obj)
      ? walkArray(obj, depth, ancestors, state)
      : walkObject(obj, depth, ancestors, state);
  } finally {
    ancestors.delete(obj);
  }
}

/**
 * Returns `input` with every sensitive-named property censored at any depth.
 *
 * Copy-on-write: when nothing matches — the overwhelmingly common case — the
 * original reference comes back and nothing is allocated. Subtrees that contain
 * no match are shared with the original rather than copied. The caller's object
 * is never mutated, which matters because callers routinely log an object they
 * go on to use.
 */
export function scrub<T>(input: T): T {
  return walk(input, 0, new Set<object>(), { nodes: 0 }) as T;
}

const SCRUBBED = Symbol.for("dragons.logRedact.scrubbedChildren");

/**
 * Makes `logger.child(bindings)` scrub its bindings, for descendants at any
 * generation.
 *
 * This exists because `formatters.log` — where `scrub` otherwise runs — never
 * sees child bindings: pino serializes them once inside `child()`, before any
 * log formatter is involved. The bare paths in `logger.ts` catch a *top-level*
 * sensitive binding, but not `logger.child({ creds: { password } })`, which the
 * old `*.password` wildcard did catch. Without this wrapper, adopting the walk
 * would have been a coverage trade rather than a strict improvement.
 *
 * It is a monkey-patch on the instance and has no compile-time guard, so
 * `log-redact.test.ts` has a test that logs a secret through a real pino child
 * and fails if this stops being applied. Do not delete that test.
 */
export function withScrubbedChildren(logger: Logger): Logger {
  // Already wrapped — wrapping again would scrub twice per `child()` call.
  if (SCRUBBED in logger) return logger;

  // Deliberately unbound, and forwarded with the *caller's* `this`.
  //
  // pino builds a child with `Object.create(parent)`, so this own property is
  // inherited by every descendant. Calling through `this` means a grandchild
  // reaches `Object.getPrototypeOf`'s `child` with itself as the receiver, and
  // keeps its parent's bindings. Binding to `logger` here instead would make
  // every grandchild a child of the *root* logger and silently drop whatever
  // its parent had bound — which is exactly what the first version did, caught
  // by the grandchild case in `log-redact.test.ts`.
  const original: Logger["child"] = logger.child;

  function scrubbedChild<ChildLevels extends string = never>(
    this: Logger,
    bindings: Bindings,
    options?: ChildLoggerOptions<ChildLevels>,
  ): Logger<ChildLevels, boolean> {
    return original.call<
      Logger,
      [Bindings, ChildLoggerOptions<ChildLevels> | undefined],
      Logger<ChildLevels, boolean>
    >(this, scrub(bindings), options);
  }

  logger.child = scrubbedChild;
  Object.defineProperty(logger, SCRUBBED, { value: true });
  return logger;
}
