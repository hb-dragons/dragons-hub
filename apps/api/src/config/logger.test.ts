import { describe, expect, it, vi, beforeEach } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports a pino logger instance", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "test", LOG_LEVEL: "info" },
    }));

    const { logger } = await import("./logger");

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("creates child loggers with additional context", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "test", LOG_LEVEL: "info" },
    }));

    const { logger } = await import("./logger");

    const child = logger.child({ requestId: "test-123" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });

  it("uses pino-pretty transport in development", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "development", LOG_LEVEL: "debug" },
    }));

    const pinoMock = vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    });
    vi.doMock("pino", () => ({ default: pinoMock }));

    await import("./logger");

    expect(pinoMock).toHaveBeenCalledWith({
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss.l",
        },
      },
    });
  });

  it("does not use pino-pretty transport outside development", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "production", LOG_LEVEL: "warn" },
    }));

    const pinoMock = vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    });
    vi.doMock("pino", () => ({ default: pinoMock }));

    await import("./logger");

    expect(pinoMock).toHaveBeenCalledWith({
      level: "warn",
    });
  });
});
