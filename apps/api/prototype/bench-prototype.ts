/* eslint-disable no-console */
// Scratch benchmark for issue #143 option 3. Not part of the build.
// Run: npx tsx bench-prototype.ts
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SDK_USERNAME = "test";
process.env.SDK_PASSWORD = "test";
process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars-long!!";
process.env.BETTER_AUTH_URL = "http://localhost:3001";
process.env.NODE_ENV = "test";
process.env.TRUSTED_ORIGINS = "http://localhost:3000";
process.env.SCOREBOARD_INGEST_KEY = "k".repeat(48);
process.env.SCOREBOARD_DEVICE_ID = "dragons-1";
process.env.ASSISTANT_ENABLED = "false";

const pino = (await import("pino")).default;
import type { LoggerOptions } from "pino";
const { buildOptions } = await import("../src/config/logger");
const { withPrototypeRedaction, withScrubbedChildren } = await import(
  "./prototype-logger"
);

const ITER = 20_000;
const WARMUP = 3_000;
const REPEATS = 5;

const sink = {
  write: (_c: string) => {
    /* no-op */
  },
};

const baseOptions = (): LoggerOptions => {
  const { transport: _t, ...o } = buildOptions();
  return { ...o, mixin: undefined };
};

const CURRENT = baseOptions();
const PLAIN: LoggerOptions = { ...baseOptions(), redact: undefined };
const PROTO = withPrototypeRedaction(baseOptions());

function bench(
  options: LoggerOptions,
  payload: object,
  iter = ITER,
): number {
  const log = pino(options, sink);
  const warm = Math.min(WARMUP, Math.max(50, Math.floor(iter / 5)));
  for (let i = 0; i < warm; i++) log.info(payload, "probe");
  const chunk = Math.max(1, Math.floor(iter / REPEATS));
  let best = Infinity;
  for (let r = 0; r < REPEATS; r++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < chunk; i++) log.info(payload, "probe");
    const us = Number(process.hrtime.bigint() - start) / 1000 / chunk;
    if (us < best) best = us;
  }
  return best;
}

function row(label: string, payload: object, iter = ITER) {
  const p = bench(PLAIN, payload, iter);
  const c = bench(CURRENT, payload, iter);
  const x = bench(PROTO, payload, iter);
  console.log(
    `  ${label.padEnd(30)} plain ${p.toFixed(2).padStart(9)}us  current ${c.toFixed(2).padStart(9)}us  proto ${x.toFixed(2).padStart(9)}us   | cur ${(c / p).toFixed(1)}x  proto ${(x / p).toFixed(1)}x  speedup ${(c / x).toFixed(1)}x`,
  );
}

const REAL_REQUEST = {
  method: "GET",
  path: "/api/matches",
  status: 200,
  duration: 12,
  httpRequest: {
    requestMethod: "GET",
    requestUrl: "https://api.example.de/api/matches?season=2026",
    status: 200,
    latency: "0.012s",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    remoteIp: "203.0.113.0",
    responseSize: "4821",
  },
};

const ISSUE_PAYLOAD = {
  requestId: "0d5f0f4a-0e2d-4b0e-9f1e-2b1f0a3c4d5e",
  method: "GET",
  path: "/api/matches",
  status: 200,
  durationMs: 12,
  user: { id: "u-1", email: "a@b.de", roles: ["admin"] },
};

console.log("=== representative payloads ===");
row("tiny { jobId }", { jobId: "sync-1291" });
row("real request-completion line", REAL_REQUEST);
row("issue benchmark payload", ISSUE_PAYLOAD);

console.log("=== scaling: top-level object keys ===");
for (const n of [1, 2, 5, 10, 20, 50]) {
  const payload: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) payload[`f${i}`] = { a: 1, b: "x" };
  row(`${n} top-level object keys`, payload);
}

console.log("=== scaling: total node count (flat) ===");
for (const n of [10, 50, 200, 1000]) {
  const payload: Record<string, unknown> = { wrap: {} };
  const inner = payload.wrap as Record<string, unknown>;
  for (let i = 0; i < n; i++) inner[`k${i}`] = i;
  row(`1 key wrapping ${n} scalars`, payload);
}

console.log("=== scaling: depth ===");
for (const d of [1, 3, 6, 11]) {
  let node: unknown = { leaf: 1 };
  for (let i = 0; i < d; i++) node = { n: node };
  row(`nested ${d} deep`, node as object);
}

console.log("=== child() creation cost (once per request) ===");
{
  const plainLog = pino(PLAIN, sink);
  const currentLog = pino(CURRENT, sink);
  const protoLog = withScrubbedChildren(pino(PROTO, sink));
  const time = (label: string, fn: () => void) => {
    for (let i = 0; i < WARMUP; i++) fn();
    let best = Infinity;
    for (let r = 0; r < REPEATS; r++) {
      const s = process.hrtime.bigint();
      for (let i = 0; i < 20_000; i++) fn();
      const us = Number(process.hrtime.bigint() - s) / 1000 / 20_000;
      if (us < best) best = us;
    }
    console.log(`  ${label.padEnd(44)} ${best.toFixed(2)}us`);
  };
  time("child({requestId}) — plain", () => {
    plainLog.child({ requestId: "r-1" });
  });
  time("child({requestId}) — current", () => {
    currentLog.child({ requestId: "r-1" });
  });
  time("child({requestId}) — prototype (scrubbed)", () => {
    protoLog.child({ requestId: "r-1" });
  });
}

console.log("\n=== adversarial payloads (attacker-shaped) ===");
{
  const ADV = 300;
  const wide: Record<string, unknown> = {};
  for (let i = 0; i < 20_000; i++) wide[`k${i}`] = i;
  row("20k-key flat object", { wide }, ADV);

  let deep: unknown = { leaf: 1 };
  for (let i = 0; i < 5_000; i++) deep = { n: deep };
  row("5000-deep nest", deep as object, ADV);

  const bigArray = { items: new Array(20_000).fill({ a: 1 }) };
  row("20k-element array of objects", bigArray, ADV);
}
