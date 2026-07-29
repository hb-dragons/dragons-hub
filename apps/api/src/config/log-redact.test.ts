import { describe, expect, it } from "vitest";
import type { Logger } from "pino";
import {
  CENSOR,
  CYCLE_MARKER,
  DEPTH_MARKER,
  MAX_DEPTH,
  MAX_NODES,
  NODES_MARKER,
  SENSITIVE_ENV_KEYS,
  SENSITIVE_KEYS,
  scrub,
  withScrubbedChildren,
} from "./log-redact";
import { createLogger } from "./logger";

/**
 * Builds a logger through the app's own `createLogger`, so these cases exercise
 * the same three-part wiring production runs: the declarative bare paths, the
 * `scrub` formatter, and the child-binding wrapper. Assembling a probe from
 * `buildOptions()` alone would silently skip the third.
 */
function probe(): { log: Logger; read: () => string } {
  const written: string[] = [];
  const log = createLogger({
    write: (chunk: string) => {
      written.push(chunk);
    },
  });
  return { log, read: () => written.join("") };
}

// ---------------------------------------------------------------------------
// Historical coverage contract (#143).
//
// This is the `redact.paths` array as it stood before the any-depth walk
// replaced it: 6 header paths, 6 env var names, and `SENSITIVE_KEYS` crossed
// with `SENSITIVE_CONTAINERS` as bare / `*.<key>` / `*.<container>.<key>`.
//
// It is frozen test data on purpose. The generator is gone from the source, so
// keeping the expansion here is the only thing that still asserts every path
// the old config covered is covered now. Do not regenerate it from the current
// key list — that would make the assertion circular.
// ---------------------------------------------------------------------------
const HISTORICAL_SENSITIVE_KEYS = [
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

const HISTORICAL_SENSITIVE_CONTAINERS = [
  "body",
  "form",
  "data",
  "payload",
  "params",
  "input",
  "config",
  "env",
];

const HISTORICAL_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  "SDK_PASSWORD",
  "SDK_USERNAME",
  "BETTER_AUTH_SECRET",
  "SCOREBOARD_INGEST_KEY",
  "REFEREE_SDK_PASSWORD",
  "EXPO_ACCESS_TOKEN",
  ...HISTORICAL_SENSITIVE_KEYS.flatMap((k) => [
    k,
    `*.${k}`,
    ...HISTORICAL_SENSITIVE_CONTAINERS.map((c) => `*.${c}.${k}`),
  ]),
];

/** `req.headers["set-cookie"]` -> ["req", "headers", "set-cookie"] */
function parsePath(path: string): string[] {
  const segments: string[] = [];
  const re = /\["([^"]+)"\]|\['([^']+)'\]|([^.[\]]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    segments.push((match[1] ?? match[2] ?? match[3]) as string);
  }
  return segments;
}

/** The shallowest payload a given historical redact path matched. */
function payloadFor(path: string, secret: string): Record<string, unknown> {
  const segments = parsePath(path).map((s) => (s === "*" ? "anyKey" : s));
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const next: Record<string, unknown> = {};
    cursor[segments[i] as string] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1] as string] = secret;
  return root;
}

describe("log-redact — historical coverage contract", () => {
  it("still enumerates all 102 paths the old config carried", () => {
    expect(HISTORICAL_REDACT_PATHS).toHaveLength(102);
  });

  it.each(HISTORICAL_REDACT_PATHS)(
    "redacts what the retired path %s used to cover",
    (path) => {
      const secret = `secret-for-${path}`;
      const { log, read } = probe();
      log.info(payloadFor(path, secret), "probe");
      expect(read(), `no longer redacted: ${path}`).not.toContain(secret);
    },
  );

  it("keeps every historical key name in the live list", () => {
    for (const key of HISTORICAL_SENSITIVE_KEYS) {
      expect(SENSITIVE_KEYS, `dropped from SENSITIVE_KEYS: ${key}`).toContain(
        key,
      );
    }
    for (const key of [
      "SDK_PASSWORD",
      "SDK_USERNAME",
      "BETTER_AUTH_SECRET",
      "SCOREBOARD_INGEST_KEY",
      "REFEREE_SDK_PASSWORD",
      "EXPO_ACCESS_TOKEN",
    ]) {
      expect(SENSITIVE_ENV_KEYS, `dropped: ${key}`).toContain(key);
    }
  });

  it("leaves non-sensitive fields visible", () => {
    const { log, read } = probe();
    log.info({ method: "GET", user: { id: "u-1", email: "a@b.de" } }, "probe");
    const line = read();
    expect(line).toContain("GET");
    expect(line).toContain("u-1");
    expect(line).toContain("a@b.de");
  });
});

// ---------------------------------------------------------------------------
// The four leak classes the old wildcard config had. Each of these was verified
// to leak against that config before it was replaced (#143); the "and here is
// the old config leaking" halves of the pairs were dropped once the old config
// stopped existing, because there is nothing left to point them at.
// ---------------------------------------------------------------------------
describe("log-redact — leak classes the wildcard config missed", () => {
  // `*.<container>.<key>` bottomed out at three levels.
  it("redacts a secret nested deeper than three levels", () => {
    const { log, read } = probe();
    log.info(
      { req: { body: { user: { credentials: { password: "deep-value" } } } } },
      "probe",
    );
    expect(read()).not.toContain("deep-value");
    expect(read()).toContain(CENSOR);
  });

  // A wildcard matches object keys, never array indices, so anything inside a
  // list of rows went out in clear. `log.info({ users })` after a DB fetch is
  // the realistic version of this.
  it("redacts a secret inside an array element", () => {
    const { log, read } = probe();
    log.info({ users: [{ name: "a", password: "array-value" }] }, "probe");
    expect(read()).not.toContain("array-value");
  });

  it("redacts a secret inside a nested array of arrays", () => {
    const { log, read } = probe();
    log.info({ rows: [[{ secret: "nested-array-value" }]] }, "probe");
    expect(read()).not.toContain("nested-array-value");
  });

  // Path matching was case-sensitive; header names arrive lowercased from
  // fetch, but nothing forces a hand-built object to follow.
  it("redacts a differently-cased sensitive key", () => {
    const { log, read } = probe();
    log.info({ req: { Authorization: "case-value" } }, "probe");
    expect(read()).not.toContain("case-value");
  });

  // Coverage depended on the parent being one of eight hard-coded container
  // names. `query` was not one of them.
  it("redacts a secret under a container that was never on the list", () => {
    const { log, read } = probe();
    log.info({ req: { query: { token: "container-value" } } }, "probe");
    expect(read()).not.toContain("container-value");
  });
});

// ---------------------------------------------------------------------------
// The guard for `withScrubbedChildren`.
//
// `formatters.log` never sees child bindings — pino serializes them inside
// `child()`, before any log formatter runs — so the only thing covering a
// *nested* sensitive binding is the `child` monkey-patch in `log-redact.ts`.
// That patch has no compile-time guard: delete it and everything still builds,
// typechecks and lints, and nested child bindings silently start going out in
// clear.
//
// These cases are the guard. Verified 2026-07-29 by removing
// `withScrubbedChildren` from `createLogger` and confirming all three go red.
// Do not delete them.
// ---------------------------------------------------------------------------
describe("log-redact — child bindings (guard for withScrubbedChildren)", () => {
  it("redacts a sensitive key nested inside a child logger's bindings", () => {
    const { log, read } = probe();
    log.child({ creds: { password: "child-nested-value" } }).info("probe");
    expect(
      read(),
      "nested child bindings leaked — is withScrubbedChildren still applied in createLogger?",
    ).not.toContain("child-nested-value");
  });

  it("redacts a sensitive key inside a grandchild logger's bindings", () => {
    const { log, read } = probe();
    log
      .child({ service: "x" })
      .child({ creds: { token: "grandchild-value" } })
      .info("probe");
    expect(read()).not.toContain("grandchild-value");
    expect(read()).toContain("x");
  });

  it("redacts a secret inside an array in a child logger's bindings", () => {
    const { log, read } = probe();
    log.child({ devices: [{ token: "child-array-value" }] }).info("probe");
    expect(read()).not.toContain("child-array-value");
  });

  it("keeps the child logger usable and its harmless bindings intact", () => {
    const { log, read } = probe();
    const child = log.child({ service: "sync", requestId: "r-1" });
    child.info({ count: 3 }, "probe");
    const line = read();
    expect(line).toContain("sync");
    expect(line).toContain("r-1");
    expect(line).toContain("probe");
  });

  it("passes child options through to pino", () => {
    const { log, read } = probe();
    const child = log.child({ service: "x" }, { level: "error" });
    child.info({ nope: 1 }, "filtered out");
    child.error({ yes: 1 }, "kept");
    const line = read();
    expect(line).not.toContain("filtered out");
    expect(line).toContain("kept");
  });
});

// ---------------------------------------------------------------------------
// Traversal safety. Replacing declarative config with a hand-written walk adds
// three failure modes that a path array cannot have: infinite recursion,
// unbounded work, and mutating the caller's object.
// ---------------------------------------------------------------------------
describe("scrub — does not mutate the caller's object", () => {
  it("leaves the input untouched", () => {
    const payload = { creds: { password: "orig" }, keep: "v" };
    const snapshot = JSON.stringify(payload);
    const out = scrub(payload);
    expect(JSON.stringify(payload)).toBe(snapshot);
    expect((out.creds as { password: string }).password).toBe(CENSOR);
  });

  it("leaves arrays untouched", () => {
    const payload = { list: [{ token: "orig" }] };
    scrub(payload);
    expect(payload.list[0]?.token).toBe("orig");
  });

  it("returns the same reference when nothing matches", () => {
    const payload = { a: { b: { c: 1 } } };
    expect(scrub(payload)).toBe(payload);
  });

  it("returns the same array reference when nothing matches", () => {
    const list = [{ a: 1 }, { b: 2 }];
    expect(scrub({ list }).list).toBe(list);
  });

  it("shares untouched subtrees with the original", () => {
    const untouched = { deep: { value: 1 } };
    const payload = { untouched, creds: { password: "x" } };
    const out = scrub(payload);
    expect(out).not.toBe(payload);
    expect(out.untouched).toBe(untouched);
  });

  it("does not mutate the caller's object when logging through pino", () => {
    const payload = { creds: { password: "orig" } };
    const { log } = probe();
    log.info(payload, "probe");
    expect(payload.creds.password).toBe("orig");
  });
});

describe("scrub — cycles", () => {
  it("marks a self-reference instead of recursing forever", () => {
    const payload: Record<string, unknown> = { name: "root" };
    payload.self = payload;
    expect((scrub(payload) as Record<string, unknown>).self).toBe(CYCLE_MARKER);
  });

  it("still censors inside a cyclic structure", () => {
    const inner: Record<string, unknown> = { password: "cycle-value" };
    const payload: Record<string, unknown> = { inner };
    inner.parent = payload;
    const out = scrub(payload) as { inner: Record<string, unknown> };
    expect(out.inner.password).toBe(CENSOR);
    expect(out.inner.parent).toBe(CYCLE_MARKER);
  });

  it("handles a cycle through an array", () => {
    const arr: unknown[] = [1];
    arr.push(arr);
    expect(() => scrub({ arr })).not.toThrow();
    expect(JSON.stringify(scrub({ arr }))).toContain(CYCLE_MARKER);
  });

  // An ancestor set, not a visited set. A shared reference appearing twice in
  // a tree is not a cycle, and treating it as one would drop real fields.
  it("does not mistake a shared reference for a cycle", () => {
    const shared = { password: "shared-value", label: "keep" };
    const out = scrub({ a: shared, b: shared }) as {
      a: Record<string, unknown>;
      b: Record<string, unknown>;
    };
    expect(out.a.password).toBe(CENSOR);
    expect(out.b.password).toBe(CENSOR);
    expect(out.b.label).toBe("keep");
  });

  it("logs a cyclic payload through pino without throwing", () => {
    const payload: Record<string, unknown> = { password: "cyc" };
    payload.self = payload;
    const { log, read } = probe();
    expect(() => log.info(payload, "probe")).not.toThrow();
    expect(read()).not.toContain("cyc");
  });
});

describe("scrub — bounds", () => {
  function nest(depth: number, leaf: unknown): Record<string, unknown> {
    let node: unknown = leaf;
    for (let i = 0; i < depth; i++) node = { n: node };
    return node as Record<string, unknown>;
  }

  it("truncates past MAX_DEPTH instead of recursing", () => {
    const out = JSON.stringify(scrub(nest(MAX_DEPTH + 5, { password: "deep" })));
    expect(out).toContain(DEPTH_MARKER);
    expect(out).not.toContain("deep");
  });

  it("keeps everything above MAX_DEPTH", () => {
    const out = JSON.stringify(scrub(nest(MAX_DEPTH - 2, { keep: "visible" })));
    expect(out).toContain("visible");
    expect(out).not.toContain(DEPTH_MARKER);
  });

  it("survives a 100k-deep payload without a stack overflow", () => {
    expect(() => scrub(nest(100_000, { password: "x" }))).not.toThrow();
  });

  it("truncates an object past MAX_NODES", () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < MAX_NODES * 2; i++) wide[`k${i}`] = i;
    expect(JSON.stringify(scrub({ wide }))).toContain(NODES_MARKER);
  });

  it("still censors a secret seen before the budget ran out", () => {
    const wide: Record<string, unknown> = { password: "early-value" };
    for (let i = 0; i < MAX_NODES * 2; i++) wide[`k${i}`] = i;
    expect(JSON.stringify(scrub(wide))).not.toContain("early-value");
  });

  it("keeps the keys visited before truncation", () => {
    const wide: Record<string, unknown> = { first: "kept-value" };
    for (let i = 0; i < MAX_NODES * 2; i++) wide[`k${i}`] = i;
    expect(JSON.stringify(scrub(wide))).toContain("kept-value");
  });

  it("truncates an array past MAX_NODES", () => {
    const out = JSON.stringify(
      scrub({ list: new Array(MAX_NODES * 2).fill(1) }),
    );
    expect(out).toContain(NODES_MARKER);
  });

  it("keeps an Error's message when truncation hits inside it", () => {
    const err = new Error("truncated-error-message");
    const record = err as unknown as Record<string, unknown>;
    for (let i = 0; i < MAX_NODES * 2; i++) record[`k${i}`] = i;
    const out = scrub({ err }).err;
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).message).toBe("truncated-error-message");
  });
});

describe("scrub — values that must not be walked", () => {
  it("leaves primitives and null alone", () => {
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
    expect(scrub(42)).toBe(42);
    expect(scrub("s")).toBe("s");
  });

  // Index-keyed, so walking one is O(byte length) for no benefit.
  it("does not walk a Buffer", () => {
    const buf = Buffer.alloc(1_000_000);
    expect(scrub({ buf }).buf).toBe(buf);
  });

  it("does not walk a typed array or ArrayBuffer", () => {
    const typed = new Uint8Array(8);
    const raw = new ArrayBuffer(8);
    const out = scrub({ typed, raw });
    expect(out.typed).toBe(typed);
    expect(out.raw).toBe(raw);
  });

  it("does not walk a Date or RegExp", () => {
    const date = new Date();
    const re = /x/;
    const out = scrub({ date, re });
    expect(out.date).toBe(date);
    expect(out.re).toBe(re);
  });

  // Their contents never reach JSON.stringify, so there is nothing to censor.
  it("does not walk a Map or Set", () => {
    const map = new Map([["password", "map-value"]]);
    const set = new Set(["set-value"]);
    const out = scrub({ map, set });
    expect(out.map).toBe(map);
    expect(out.set).toBe(set);
  });
});

describe("scrub — non-plain objects", () => {
  it("censors an Error's own sensitive props and keeps it an Error", () => {
    const err = Object.assign(new Error("boom"), { token: "err-value" });
    const out = scrub({ err }).err;
    expect(out).toBeInstanceOf(Error);
    expect((out as unknown as { token: string }).token).toBe(CENSOR);
    expect((out as Error).message).toBe("boom");
    expect((out as Error).stack).toContain("boom");
  });

  it("serializes a censored Error through pino with message and stack intact", () => {
    const err = Object.assign(new Error("boom-msg"), { token: "err-value" });
    const { log, read } = probe();
    log.error({ err }, "failed");
    const line = read();
    expect(line).not.toContain("err-value");
    expect(line).toContain("boom-msg");
    expect(line).toContain("Error");
  });

  it("censors inside an Error's cause chain", () => {
    const cause = Object.assign(new Error("inner"), { secret: "cause-value" });
    const err = new Error("outer", { cause });
    const { log, read } = probe();
    log.error({ err }, "failed");
    expect(read()).not.toContain("cause-value");
  });

  it("keeps a class instance's prototype when a property is censored", () => {
    class Session {
      constructor(
        public id: string,
        public token: string,
      ) {}
      describe(): string {
        return `session ${this.id}`;
      }
    }
    const out = scrub({ s: new Session("s-1", "cls-value") }).s;
    expect(out).toBeInstanceOf(Session);
    expect(out.token).toBe(CENSOR);
    expect(out.describe()).toBe("session s-1");
  });

  it("handles a null-prototype object", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.password = "np-value";
    bare.keep = "v";
    const out = scrub({ bare }).bare;
    expect(out.password).toBe(CENSOR);
    expect(out.keep).toBe("v");
    expect(Object.getPrototypeOf(out)).toBeNull();
  });

  it("censors a sensitive key at the root of the walked object", () => {
    const out = scrub({ password: "root-value", keep: "v" });
    expect(out.password).toBe(CENSOR);
    expect(out.keep).toBe("v");
  });
});

describe("withScrubbedChildren", () => {
  it("returns the same logger instance it was given", () => {
    const { log } = probe();
    expect(withScrubbedChildren(log)).toBe(log);
  });

  it("is idempotent — wrapping twice does not double-scrub", () => {
    const { log, read } = probe();
    withScrubbedChildren(log);
    log.child({ service: "x", creds: { password: "twice" } }).info("probe");
    const line = read();
    expect(line).not.toContain("twice");
    expect(line).toContain("x");
    expect(line).toContain(CENSOR);
  });
});

// ---------------------------------------------------------------------------
// False positives.
//
// Matching by key name at any depth is broader than the retired path list, so
// it can censor a field that merely shares a name with a credential — a
// `data.token` that is a parse token, a `config.secret` that is a feature name.
// Unlike a leak, that failure is silent: the field just stops being useful for
// debugging.
//
// Audited 2026-07-29 across all 120 occurrences of these names in
// `apps/api/src` (excluding tests). Every one is a genuine credential: push
// device tokens, email unsubscribe tokens, better-auth session cookies, the
// SMTP password, the federation SDK password, the Expo access token. No
// homonyms, so nothing legitimate is being hidden today.
//
// The matching rule is exact name, case-insensitive — never substring — which
// is what keeps names like `tokenCount` and `hasPassword` readable. These cases
// pin that down: widening to a substring match would break them.
// ---------------------------------------------------------------------------
describe("log-redact — does not censor names that merely contain a sensitive word", () => {
  const VISIBLE = {
    tokenCount: 42,
    hasPassword: true,
    secretsChecked: 7,
    unsubscribeTokenId: "sub-9",
    apiKeyPrefix: "dk_live",
    cookieConsent: "granted",
    authorizationChecked: true,
    accessTokenExpiresIn: 3600,
  };

  it("keeps every one of them in the emitted line", () => {
    const { log, read } = probe();
    log.info(VISIBLE, "probe");
    const line = read();
    for (const key of Object.keys(VISIBLE)) {
      expect(line, `${key} was censored`).toContain(key);
    }
    expect(line).toContain("42");
    expect(line).toContain("sub-9");
    expect(line).toContain("dk_live");
    expect(line).not.toContain(CENSOR);
  });

  it("keeps them visible when nested and inside arrays too", () => {
    const { log, read } = probe();
    log.info({ stats: { a: [{ tokenCount: 3, apiKeyPrefix: "dk_x" }] } }, "p");
    const line = read();
    expect(line).toContain("dk_x");
    expect(line).not.toContain(CENSOR);
  });
});
