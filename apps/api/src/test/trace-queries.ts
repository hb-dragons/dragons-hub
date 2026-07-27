/**
 * Wrap a drizzle client so tests can count the queries a service issues and see
 * whether it issues them serially or together.
 *
 * `select()` is intercepted: each call pushes `start:<n>` and the returned query
 * builder is proxied so that awaiting it pushes `end:<n>`. Chained calls
 * (`.from()`, `.where()`, `.limit()`, …) keep the same id, and every method is
 * applied to the real builder, so drizzle's own internals never see a proxy.
 *
 * Two things fall out of the event log:
 *   - `startCount` is the number of queries a call made (N+1 regressions show up
 *     as a count that grows with the row count).
 *   - `start:n` appearing before `end:n-1` means the two queries were in flight
 *     at the same time; a serial `await` always yields `end:n-1` first.
 *
 * The real database still runs every query, so this composes with the PGlite
 * suite rather than replacing it with canned rows.
 */
export interface QueryTrace {
  /** Drop-in replacement for the drizzle client, for `getDb()` to hand out. */
  db: unknown;
  /** Chronological `start:<id>` / `end:<id>` log. */
  events: string[];
  /** How many `select()` calls have been made since the last `reset()`. */
  startCount(): number;
  /** True when query `id` was issued before query `id - 1` had come back. */
  overlaps(id: number): boolean;
  reset(): void;
}

type AnyFn = (...args: unknown[]) => unknown;

export function traceQueries(client: object): QueryTrace {
  const events: string[] = [];
  let nextId = 0;

  function wrap(value: unknown, id: number): unknown {
    if (value === null || typeof value !== "object") return value;
    return new Proxy(value as object, {
      get(target, prop) {
        const member = Reflect.get(target, prop) as unknown;
        if (typeof member !== "function") return member;
        if (prop === "then") {
          return (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
            (member as AnyFn).call(
              target,
              (resolved: unknown) => {
                events.push(`end:${id}`);
                return onOk ? onOk(resolved) : resolved;
              },
              onErr,
            );
        }
        return (...args: unknown[]) => wrap((member as AnyFn).apply(target, args), id);
      },
    });
  }

  const db = new Proxy(client, {
    get(target, prop) {
      const member = Reflect.get(target, prop) as unknown;
      if (prop !== "select" || typeof member !== "function") return member;
      return (...args: unknown[]) => {
        const id = nextId++;
        events.push(`start:${id}`);
        return wrap((member as AnyFn).apply(target, args), id);
      };
    },
  });

  return {
    db,
    events,
    startCount: () => events.filter((e) => e.startsWith("start:")).length,
    overlaps: (id) => {
      const start = events.indexOf(`start:${id}`);
      const previousEnd = events.indexOf(`end:${id - 1}`);
      return start !== -1 && previousEnd !== -1 && start < previousEnd;
    },
    reset: () => {
      events.length = 0;
      nextId = 0;
    },
  };
}
