/* eslint-disable no-console */
// Scratch benchmark for issue #143. NOT part of the build; delete or keep
// gitignored. Run with: pnpm --filter @dragons/api exec tsx bench-redact.ts
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

// Dynamic: ESM hoists static imports above the process.env writes above, and
// config/env.ts validates at module load.
const pino = (await import("pino")).default;
import type { LoggerOptions } from "pino";
const { buildOptions } = await import("../src/config/logger");

const ITER = 20_000;
const WARMUP = 3_000;

const sink = {
  write: (_chunk: string) => {
    // no-op sink
  },
};

// The issue's benchmark payload: request-completion fields plus a nested user.
const ISSUE_PAYLOAD = {
  requestId: "0d5f0f4a-0e2d-4b0e-9f1e-2b1f0a3c4d5e",
  method: "GET",
  path: "/api/matches",
  status: 200,
  durationMs: 12,
  user: { id: "u-1", email: "a@b.de", roles: ["admin"] },
};

// What `requestLogger` actually emits at info, one line per request.
const REAL_REQUEST_PAYLOAD = {
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

// Smallest realistic line: a worker/service log with one or two scalars.
const TINY_PAYLOAD = { jobId: "sync-1291" };

function makeLogger(redact: LoggerOptions["redact"]) {
  const base = buildOptions();
  const { transport: _t, ...options } = base;
  return pino({ ...options, redact, mixin: undefined }, sink);
}

// This box runs other work concurrently (load average ~26 on 24 cores), so a
// single mean over 20k iterations reads high and unstable. Run the 20k loop in
// REPEATS chunks and keep the best chunk: the minimum is the closest available
// estimate of the uncontended cost, and it is stable across runs.
const REPEATS = 5;

function bench(
  label: string,
  redact: LoggerOptions["redact"],
  payload: object,
): number {
  const log = makeLogger(redact);
  for (let i = 0; i < WARMUP; i++) log.info(payload, "probe");
  const chunk = Math.floor(ITER / REPEATS);
  let best = Infinity;
  let total = 0;
  for (let r = 0; r < REPEATS; r++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < chunk; i++) log.info(payload, "probe");
    const end = process.hrtime.bigint();
    const us = Number(end - start) / 1000 / chunk;
    total += us;
    if (us < best) best = us;
  }
  const mean = total / REPEATS;
  console.log(
    `${label.padEnd(40)} best ${best.toFixed(2)}us   mean ${mean.toFixed(2)}us`,
  );
  return best;
}

const CENSOR = "[REDACTED]";
const keys = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`);

const realRedact = buildOptions().redact as { paths: string[]; censor: string };
const realPaths = realRedact.paths;
const wildcardCount = realPaths.filter((p) => p.startsWith("*.")).length;

console.log(
  `real config: ${realPaths.length} paths, ${wildcardCount} wildcards\n`,
);

console.log("=== issue payload (nested user) ===");
bench("plain (no redact)", undefined, ISSUE_PAYLOAD);
bench(
  "100 bare paths",
  { paths: keys(100), censor: CENSOR },
  ISSUE_PAYLOAD,
);
bench(
  "1 wildcard (*.k0)",
  { paths: ["*.k0"], censor: CENSOR },
  ISSUE_PAYLOAD,
);
bench(
  "9 wildcards",
  { paths: keys(9).map((k) => `*.${k}`), censor: CENSOR },
  ISSUE_PAYLOAD,
);
bench(
  "27 wildcards",
  { paths: keys(27).map((k) => `*.${k}`), censor: CENSOR },
  ISSUE_PAYLOAD,
);
bench(
  "81 wildcards",
  { paths: keys(81).map((k) => `*.${k}`), censor: CENSOR },
  ISSUE_PAYLOAD,
);
bench(
  "81 two-level (*.body.k)",
  { paths: keys(81).map((k) => `*.body.${k}`), censor: CENSOR },
  ISSUE_PAYLOAD,
);
bench("the real config", realRedact, ISSUE_PAYLOAD);

console.log("\n=== real request-completion payload ===");
bench("plain (no redact)", undefined, REAL_REQUEST_PAYLOAD);
bench("the real config", realRedact, REAL_REQUEST_PAYLOAD);

console.log("\n=== tiny payload { jobId } ===");
bench("plain (no redact)", undefined, TINY_PAYLOAD);
bench("the real config", realRedact, TINY_PAYLOAD);

console.log("\n=== scaling with top-level key count (real config) ===");
for (const n of [1, 2, 5, 10, 20]) {
  const payload: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) payload[`f${i}`] = { a: 1, b: "x" };
  bench(`${n} top-level object keys`, realRedact, payload);
}
