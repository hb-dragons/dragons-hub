import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach } from "vitest";

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
}));
vi.mock("./config/logger", () => ({ logger: log }));

import {
  createShutdown,
  registerProcessHandlers,
  type ShutdownDeps,
} from "./shutdown";

function makeDeps() {
  const calls: string[] = [];
  const deps: ShutdownDeps = {
    httpServer: {
      close: (cb?: (err?: Error) => void) => {
        calls.push("server");
        cb?.();
      },
    },
    shutdownWorkers: async () => {
      calls.push("workers");
    },
    closeDb: async () => {
      calls.push("db");
    },
    closeRedis: async () => {
      calls.push("redis");
    },
    flushLogger: async () => {
      calls.push("flush");
    },
    exit: (code: number) => {
      calls.push(`exit:${code}`);
    },
  };
  return { calls, deps };
}

describe("createShutdown", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes resources in order then flushes and exits 0", async () => {
    const { calls, deps } = makeDeps();
    await createShutdown(deps)();
    expect(calls).toEqual([
      "server",
      "workers",
      "db",
      "redis",
      "flush",
      "exit:0",
    ]);
  });

  it("is idempotent: a second signal does not re-run shutdown", async () => {
    const { calls, deps } = makeDeps();
    const shutdown = createShutdown(deps);
    await shutdown();
    await shutdown();
    expect(calls.filter((c) => c === "db")).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("exit"))).toHaveLength(1);
  });

  it("still flushes and exits when a close step rejects", async () => {
    const { calls, deps } = makeDeps();
    deps.closeDb = async () => {
      throw new Error("pool end failed");
    };
    await createShutdown(deps)();
    expect(log.error).toHaveBeenCalled();
    expect(calls).toContain("flush");
    expect(calls).toContain("exit:0");
  });

  it("still flushes and exits when the http server close errors", async () => {
    const { calls, deps } = makeDeps();
    deps.httpServer = {
      close: (cb?: (err?: Error) => void) => {
        calls.push("server");
        cb?.(new Error("close failed"));
      },
    };
    await createShutdown(deps)();
    expect(log.error).toHaveBeenCalled();
    expect(calls).toContain("flush");
    expect(calls).toContain("exit:0");
  });

  it("works without optional httpServer/workers", async () => {
    const { calls, deps } = makeDeps();
    const minimal = {
      closeDb: deps.closeDb,
      closeRedis: deps.closeRedis,
      flushLogger: deps.flushLogger,
      exit: deps.exit,
    };
    await createShutdown(minimal)();
    expect(calls).toEqual(["db", "redis", "flush", "exit:0"]);
  });

  it("forces a non-zero exit when teardown exceeds the timeout", async () => {
    vi.useFakeTimers();
    try {
      const { calls, deps } = makeDeps();
      deps.timeoutMs = 5000;
      deps.closeDb = () => new Promise<void>(() => {}); // never resolves
      const done = createShutdown(deps)();
      await vi.advanceTimersByTimeAsync(5000);
      await done;
      expect(log.error).toHaveBeenCalled();
      expect(calls).toContain("flush");
      expect(calls).toContain("exit:1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits with the requested code (crash path uses non-zero)", async () => {
    const { calls, deps } = makeDeps();
    await createShutdown(deps)(1);
    expect(calls[calls.length - 1]).toBe("exit:1");
  });
});

describe("registerProcessHandlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs fatal and shuts down with a non-zero code on uncaughtException", () => {
    const proc = new EventEmitter();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    registerProcessHandlers(shutdown, proc);
    proc.emit("uncaughtException", new Error("boom"));
    expect(log.fatal).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalledWith(1);
  });

  it("logs error on unhandledRejection without exiting", () => {
    const proc = new EventEmitter();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    registerProcessHandlers(shutdown, proc);
    proc.emit("unhandledRejection", new Error("floating"));
    expect(log.error).toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
  });
});
