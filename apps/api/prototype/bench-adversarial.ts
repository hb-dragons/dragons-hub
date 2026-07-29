/* eslint-disable no-console */
// Scratch benchmark for issue #143: the DoS question only.
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
const { withPrototypeRedaction } = await import("./prototype-logger");

const sink = {
  write: (_c: string) => {
    /* no-op */
  },
};
const base = (): LoggerOptions => {
  const { transport: _t, ...o } = buildOptions();
  return { ...o, mixin: undefined };
};
const CURRENT = base();
const PLAIN: LoggerOptions = { ...base(), redact: undefined };
const PROTO = withPrototypeRedaction(base());

function bench(options: LoggerOptions, payload: object, iter: number): number {
  const log = pino(options, sink);
  for (let i = 0; i < Math.max(5, iter / 5); i++) log.info(payload, "probe");
  let best = Infinity;
  for (let r = 0; r < 5; r++) {
    const s = process.hrtime.bigint();
    for (let i = 0; i < iter; i++) log.info(payload, "probe");
    const us = Number(process.hrtime.bigint() - s) / 1000 / iter;
    if (us < best) best = us;
  }
  return best;
}

function row(label: string, payload: object, iter: number) {
  const p = bench(PLAIN, payload, iter);
  const c = bench(CURRENT, payload, iter);
  const x = bench(PROTO, payload, iter);
  console.log(
    `  ${label.padEnd(30)} plain ${p.toFixed(1).padStart(9)}us  current ${c.toFixed(1).padStart(9)}us  proto ${x.toFixed(1).padStart(9)}us  | cur ${(c / p).toFixed(1)}x  proto ${(x / p).toFixed(1)}x`,
  );
}

const N = 200;

for (const width of [1_000, 5_000, 20_000, 100_000]) {
  const wide: Record<string, unknown> = {};
  for (let i = 0; i < width; i++) wide[`k${i}`] = i;
  row(`${width}-key flat object`, { wide }, N);
}

for (const depth of [1_000, 5_000, 50_000]) {
  let deep: unknown = { leaf: 1 };
  for (let i = 0; i < depth; i++) deep = { n: deep };
  row(`${depth}-deep nest`, deep as object, N);
}

for (const len of [5_000, 20_000, 100_000]) {
  row(
    `${len}-element array of objects`,
    { items: new Array(len).fill({ a: 1 }) },
    N,
  );
}
