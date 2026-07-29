// PROTOTYPE — issue #143, option 3. Not wired into the running app.
//
// Replaces the 81 compiled wildcard matchers in `REDACT_PATHS` with a single
// copy-on-write walk that censors by key name at any depth.
//
// Coverage relationship to the current config:
//   - Everything `REDACT_PATHS` censors, this censors (see the parity test).
//   - Plus: any depth. Today nothing deeper than `*.<container>.<key>` is
//     covered, so `{ req: { body: { user: { password } } } }` leaks.
//   - Plus: case-insensitive key match, so `Authorization` / `apiKey` spelled
//     `APIKEY` are covered too. That is a deliberate widening.
//
// The three hard parts, all of which the tests exercise rather than assume:
// cycles, unbounded input (depth / breadth / node count), and not mutating the
// caller's object.

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
];

// Names the current config pins as explicit bare or header paths. They are not
// morphologically derivable from SENSITIVE_KEYS, so they are listed.
export const EXPLICIT_SENSITIVE_KEYS = [
  "set-cookie",
  "SDK_PASSWORD",
  "SDK_USERNAME",
  "BETTER_AUTH_SECRET",
  "SCOREBOARD_INGEST_KEY",
  "REFEREE_SDK_PASSWORD",
  "EXPO_ACCESS_TOKEN",
];

const SENSITIVE = new Set(
  [...SENSITIVE_KEYS, ...EXPLICIT_SENSITIVE_KEYS].map((k) => k.toLowerCase()),
);

export const CENSOR = "[REDACTED]";

// Beyond this depth the subtree is replaced wholesale. Censoring rather than
// passing the value through keeps the failure mode safe: an attacker who can
// nest a payload past the limit gets it dropped, not printed in clear.
export const MAX_DEPTH = 12;

// Total properties visited per log call. Same reasoning: a payload wide enough
// to blow the budget is truncated, not passed through. 5000 is ~40x the widest
// object this app logs.
export const MAX_NODES = 5_000;

export const DEPTH_MARKER = "[TRUNCATED: depth]";
export const NODES_MARKER = "[TRUNCATED: size]";
export const CYCLE_MARKER = "[CIRCULAR]";

function isSensitive(key: string): boolean {
  return SENSITIVE.has(key.toLowerCase());
}

// Values that must not be walked. Buffers and typed arrays are index-keyed, so
// walking one is O(byte length) for no benefit — a 10 MB Buffer would cost 10M
// property visits. Dates, RegExps and functions have no useful own enumerable
// keys. Map/Set contents are invisible to JSON.stringify, so pino never emits
// them and there is nothing to censor.
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

function cloneShell(source: object): Record<string, unknown> {
  // Preserve the prototype so an Error stays an Error (pino's std serializer
  // checks `instanceof Error`) and a class instance keeps its toJSON.
  const proto: object | null = Object.getPrototypeOf(source) as object | null;
  return Object.create(proto) as Record<string, unknown>;
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
  if (ancestors.has(obj)) return CYCLE_MARKER;
  if (depth >= MAX_DEPTH) return DEPTH_MARKER;

  ancestors.add(obj);
  try {
    if (Array.isArray(obj)) {
      let copy: unknown[] | undefined;
      for (let i = 0; i < obj.length; i++) {
        if (++state.nodes > MAX_NODES) {
          copy ??= obj.slice();
          copy.length = i;
          copy.push(NODES_MARKER);
          return copy;
        }
        const before = obj[i];
        const after = walk(before, depth + 1, ancestors, state);
        if (after !== before) {
          copy ??= obj.slice();
          copy[i] = after;
        }
      }
      return copy ?? obj;
    }

    // Own enumerable string keys — exactly what JSON.stringify would emit, so
    // nothing reachable in the output is skipped. `Object.keys` also works on
    // a null-prototype object.
    const keys = Object.keys(obj);
    const record = obj as Record<string, unknown>;
    let copy: Record<string, unknown> | undefined;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] as string;
      if (++state.nodes > MAX_NODES) {
        // Build the truncated copy from the keys already visited rather than
        // from the whole record. On a 20k-key object `Object.assign` would be
        // O(width) *after* the budget was supposed to have stopped the work,
        // which is exactly the amplification the budget exists to prevent.
        if (copy === undefined) {
          copy = cloneShell(obj);
          for (let j = 0; j < i; j++) {
            const k = keys[j] as string;
            copy[k] = record[k];
          }
        }
        copy[key] = NODES_MARKER;
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

    // An Error carries `message`/`stack` as non-enumerable own props, which
    // `Object.assign` does not copy. Restore them onto the clone so pino's err
    // serializer still finds them.
    if (copy && obj instanceof Error) {
      const err = obj;
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

    return copy ?? obj;
  } finally {
    ancestors.delete(obj);
  }
}

/**
 * Returns `input` with every sensitive-named property censored at any depth.
 * Copy-on-write: when nothing matches, the original reference comes back and
 * nothing is allocated. The caller's object is never mutated.
 */
export function scrub<T>(input: T): T {
  return walk(input, 0, new Set<object>(), { nodes: 0 }) as T;
}
