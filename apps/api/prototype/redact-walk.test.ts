// PROTOTYPE tests — issue #143, option 3.
// Run: pnpm --filter @dragons/api exec vitest run --config prototype/vitest.config.ts
import { describe, expect, it } from "vitest";
import pino, { type Logger, type LoggerOptions } from "pino";
import {
  CENSOR,
  CYCLE_MARKER,
  DEPTH_MARKER,
  MAX_DEPTH,
  MAX_NODES,
  NODES_MARKER,
  scrub,
} from "./redact-walk";
import {
  withPrototypeRedaction,
  withScrubbedChildren,
} from "./prototype-logger";

// ---------------------------------------------------------------------------
// The live config, copied verbatim from src/config/logger.ts. Copied rather
// than imported because logger.ts pulls in config/env.ts at module load.
// `parity: the copy matches the live source` below fails if they drift.
// ---------------------------------------------------------------------------
const SENSITIVE_KEYS = [
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

const SENSITIVE_CONTAINERS = [
  "body",
  "form",
  "data",
  "payload",
  "params",
  "input",
  "config",
  "env",
];

const REDACT_PATHS = [
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
  ...SENSITIVE_KEYS.flatMap((k) => [
    k,
    `*.${k}`,
    ...SENSITIVE_CONTAINERS.map((c) => `*.${c}.${k}`),
  ]),
];

const CURRENT: LoggerOptions = {
  level: "info",
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
};

function capture(options: LoggerOptions): {
  log: Logger;
  read: () => string;
} {
  const written: string[] = [];
  const log = pino(options, {
    write: (chunk: string) => {
      written.push(chunk);
    },
  });
  return { log, read: () => written.join("") };
}

function currentLogger() {
  return capture(CURRENT);
}

function prototypeLogger() {
  const { log, read } = capture(withPrototypeRedaction(CURRENT));
  return { log: withScrubbedChildren(log), read };
}

// ---------------------------------------------------------------------------
// Coverage parity: every path the live config redacts must still be redacted.
// Derived from REDACT_PATHS itself, so a new path added there is automatically
// asserted rather than needing a matching test.
// ---------------------------------------------------------------------------

/** `req.headers["set-cookie"]` -> ["req", "headers", "set-cookie"] */
function parsePath(path: string): string[] {
  const segments: string[] = [];
  const re = /\["([^"]+)"\]|\['([^']+)'\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    segments.push((m[1] ?? m[2] ?? m[3]) as string);
  }
  return segments;
}

/** Builds the shallowest payload that a given redact path matches. */
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

describe("option 3 prototype — coverage parity with REDACT_PATHS", () => {
  it("the copied config matches the live source", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/config/logger.ts", import.meta.url), "utf8"),
    );
    for (const key of SENSITIVE_KEYS) {
      expect(source, `SENSITIVE_KEYS drifted: ${key}`).toContain(`"${key}"`);
    }
    for (const container of SENSITIVE_CONTAINERS) {
      expect(source, `SENSITIVE_CONTAINERS drifted: ${container}`).toContain(
        `"${container}"`,
      );
    }
    expect(REDACT_PATHS).toHaveLength(102);
  });

  it.each(REDACT_PATHS)(
    "redacts everything the live path %s covers",
    (path) => {
      const secret = `secret-for-${path}`;
      const payload = payloadFor(path, secret);

      // Sanity: the live config really does cover this path. Without this the
      // parity assertion below could pass against a hole in both configs.
      const before = currentLogger();
      before.log.info(payload, "probe");
      expect(before.read(), `live config missed ${path}`).not.toContain(secret);

      const after = prototypeLogger();
      after.log.info(payload, "probe");
      expect(after.read(), `prototype missed ${path}`).not.toContain(secret);
    },
  );

  it("keeps non-sensitive fields visible", () => {
    const { log, read } = prototypeLogger();
    log.info({ method: "GET", user: { id: "u-1", email: "a@b.de" } }, "probe");
    const line = read();
    expect(line).toContain("GET");
    expect(line).toContain("u-1");
    expect(line).toContain("a@b.de");
  });

  it("covers a child logger's nested bindings, which the live config also covers", () => {
    const secret = "child-nested-secret";

    const before = currentLogger();
    before.log.child({ creds: { password: secret } }).info("probe");
    expect(before.read()).not.toContain(secret);

    const after = prototypeLogger();
    after.log.child({ creds: { password: secret } }).info("probe");
    expect(after.read()).not.toContain(secret);
  });

  it("covers a grandchild logger's bindings", () => {
    const { log, read } = prototypeLogger();
    log
      .child({ service: "x" })
      .child({ creds: { password: "grandchild-secret" } })
      .info("probe");
    expect(read()).not.toContain("grandchild-secret");
  });

  it("covers mixin output", () => {
    const { log, read } = capture(
      withPrototypeRedaction({
        ...CURRENT,
        mixin: () => ({ creds: { token: "mixin-secret" } }),
      }),
    );
    log.info("probe");
    expect(read()).not.toContain("mixin-secret");
  });
});

// ---------------------------------------------------------------------------
// The gap option 3 closes.
// ---------------------------------------------------------------------------

describe("option 3 prototype — the depth limit it closes", () => {
  // Nothing deeper than `*.<container>.<key>` is covered today, so a secret at
  // four levels goes out in clear. This is the case that fails against the
  // live config and passes under the prototype.
  const DEEP = {
    req: { body: { user: { credentials: { password: "deep-leak-value" } } } },
  };

  it("the live config LEAKS a secret nested four levels down", () => {
    const { log, read } = currentLogger();
    log.info(DEEP, "probe");
    expect(read()).toContain("deep-leak-value");
  });

  it("the prototype redacts it", () => {
    const { log, read } = prototypeLogger();
    log.info(DEEP, "probe");
    expect(read()).not.toContain("deep-leak-value");
    expect(read()).toContain(CENSOR);
  });

  it("the live config LEAKS a secret inside an array element", () => {
    const payload = { users: [{ name: "a", password: "array-leak-value" }] };
    const { log, read } = currentLogger();
    log.info(payload, "probe");
    expect(read()).toContain("array-leak-value");
  });

  it("the prototype redacts inside array elements", () => {
    const payload = { users: [{ name: "a", password: "array-leak-value" }] };
    const { log, read } = prototypeLogger();
    log.info(payload, "probe");
    expect(read()).not.toContain("array-leak-value");
  });

  it("the live config LEAKS a differently-cased sensitive key", () => {
    const { log, read } = currentLogger();
    log.info({ req: { Authorization: "case-leak-value" } }, "probe");
    expect(read()).toContain("case-leak-value");
  });

  it("the prototype redacts it", () => {
    const { log, read } = prototypeLogger();
    log.info({ req: { Authorization: "case-leak-value" } }, "probe");
    expect(read()).not.toContain("case-leak-value");
  });

  it("the live config LEAKS a secret under an unlisted container", () => {
    const { log, read } = currentLogger();
    log.info({ req: { query: { token: "container-leak-value" } } }, "probe");
    expect(read()).toContain("container-leak-value");
  });

  it("the prototype redacts it", () => {
    const { log, read } = prototypeLogger();
    log.info({ req: { query: { token: "container-leak-value" } } }, "probe");
    expect(read()).not.toContain("container-leak-value");
  });
});

// ---------------------------------------------------------------------------
// Traversal safety.
// ---------------------------------------------------------------------------

describe("scrub — mutation", () => {
  it("does not mutate the caller's object", () => {
    const payload = { creds: { password: "orig" }, keep: "v" };
    const snapshot = JSON.stringify(payload);
    const out = scrub(payload);
    expect(JSON.stringify(payload)).toBe(snapshot);
    expect(payload.creds.password).toBe("orig");
    expect((out.creds as { password: string }).password).toBe(CENSOR);
  });

  it("does not mutate arrays", () => {
    const payload = { list: [{ token: "orig" }] };
    scrub(payload);
    expect(payload.list[0]?.token).toBe("orig");
  });

  it("returns the same reference when nothing matches (copy-on-write)", () => {
    const payload = { a: { b: { c: 1 } } };
    expect(scrub(payload)).toBe(payload);
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
    const { log } = prototypeLogger();
    log.info(payload, "probe");
    expect(payload.creds.password).toBe("orig");
  });
});

describe("scrub — cycles", () => {
  it("handles a self-referencing object", () => {
    const payload: Record<string, unknown> = { name: "root" };
    payload.self = payload;
    const out = scrub(payload) as Record<string, unknown>;
    expect(out.self).toBe(CYCLE_MARKER);
  });

  it("handles a cycle that also contains a secret", () => {
    const inner: Record<string, unknown> = { password: "cycle-secret" };
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
  });

  it("does not mistake a shared (non-cyclic) reference for a cycle", () => {
    const shared = { password: "shared-secret", label: "keep" };
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
    const { log, read } = prototypeLogger();
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

  it("truncates below MAX_DEPTH rather than recursing", () => {
    const out = scrub(nest(MAX_DEPTH + 5, { password: "deep" }));
    expect(JSON.stringify(out)).toContain(DEPTH_MARKER);
    expect(JSON.stringify(out)).not.toContain("deep");
  });

  it("survives a 100k-deep payload without a stack overflow", () => {
    expect(() => scrub(nest(100_000, { password: "x" }))).not.toThrow();
  });

  it("truncates past MAX_NODES rather than walking forever", () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < MAX_NODES * 2; i++) wide[`k${i}`] = i;
    const out = JSON.stringify(scrub({ wide }));
    expect(out).toContain(NODES_MARKER);
  });

  it("still censors a secret that appears before the node budget runs out", () => {
    const wide: Record<string, unknown> = { password: "early-secret" };
    for (let i = 0; i < MAX_NODES * 2; i++) wide[`k${i}`] = i;
    expect(JSON.stringify(scrub(wide))).not.toContain("early-secret");
  });

  it("truncates a huge array", () => {
    const out = JSON.stringify(scrub({ list: new Array(MAX_NODES * 2).fill(1) }));
    expect(out).toContain(NODES_MARKER);
  });
});

describe("scrub — non-plain values", () => {
  it("leaves primitives and null alone", () => {
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
    expect(scrub(42)).toBe(42);
    expect(scrub("s")).toBe("s");
  });

  it("does not walk a Buffer", () => {
    const buf = Buffer.alloc(1_000_000);
    const payload = { buf };
    const out = scrub(payload);
    expect(out.buf).toBe(buf);
  });

  it("does not walk a Date or RegExp", () => {
    const date = new Date();
    const re = /x/;
    const out = scrub({ date, re });
    expect(out.date).toBe(date);
    expect(out.re).toBe(re);
  });

  it("censors an Error's own sensitive props and keeps it an Error", () => {
    const err = Object.assign(new Error("boom"), { token: "err-secret" });
    const out = scrub({ err }).err;
    expect(out).toBeInstanceOf(Error);
    expect((out as unknown as { token: string }).token).toBe(CENSOR);
    expect((out as Error).message).toBe("boom");
    expect((out as Error).stack).toContain("boom");
  });

  it("serializes a censored Error through pino with message and stack intact", () => {
    const err = Object.assign(new Error("boom-msg"), { token: "err-secret" });
    const { log, read } = prototypeLogger();
    log.error({ err }, "failed");
    const line = read();
    expect(line).not.toContain("err-secret");
    expect(line).toContain("boom-msg");
    expect(line).toContain("Error");
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
    const out = scrub({ s: new Session("s-1", "cls-secret") }).s;
    expect(out).toBeInstanceOf(Session);
    expect(out.token).toBe(CENSOR);
    expect(out.describe()).toBe("session s-1");
  });

  it("handles a null-prototype object", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.password = "np-secret";
    bare.keep = "v";
    const out = scrub({ bare }).bare;
    expect(out.password).toBe(CENSOR);
    expect(out.keep).toBe("v");
    expect(Object.getPrototypeOf(out)).toBeNull();
  });

  it("handles a getter that throws without taking the process down", () => {
    const payload = {
      get boom(): string {
        throw new Error("getter exploded");
      },
    };
    expect(() => scrub(payload)).toThrow("getter exploded");
  });

  it("censors a sensitive key nested inside an array of arrays", () => {
    const out = scrub({ rows: [[{ secret: "nested-array-secret" }]] });
    expect(JSON.stringify(out)).not.toContain("nested-array-secret");
  });
});
