import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Logger } from "pino";

type PinoMockCall = [Record<string, unknown>];

function makeMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    flush: vi.fn((cb?: () => void) => cb?.()),
  };
}

describe("logger", () => {
  const origK = process.env.K_REVISION;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.K_REVISION;
  });

  afterEach(() => {
    if (origK === undefined) delete process.env.K_REVISION;
    else process.env.K_REVISION = origK;
  });

  it("exports a pino logger instance with child support", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "test", LOG_LEVEL: "info" },
    }));

    const { logger } = await import("./logger");

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
    const child = logger.child({ requestId: "abc" });

    expect(typeof child.info).toBe("function");
  });

  it("uses pino-pretty transport in development", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "development", LOG_LEVEL: "debug" },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    expect(pinoMock).toHaveBeenCalledTimes(1);
    const opts = pinoMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.level).toBe("debug");
    expect(opts.transport).toEqual({
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "HH:MM:ss.l",
      },
    });
    expect(opts.mixin).toBeTypeOf("function");
  });

  it("uses GCP-formatted options in production", async () => {
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: "1.2.3",
        GCP_PROJECT_ID: "my-proj",
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.level).toBe("info");
    expect(opts.messageKey).toBe("message");
    expect(opts.timestamp).toBe(stdTimeFunctions.isoTime);
    expect(opts.base).toEqual({ service: "api", version: "1.2.3" });
    expect(opts.transport).toBeUndefined();
    expect(opts.formatters).toBeDefined();
    expect(opts.redact).toMatchObject({ censor: "[REDACTED]" });
    expect(Array.isArray((opts.redact as { paths: string[] }).paths)).toBe(true);
    expect(opts.mixin).toBeTypeOf("function");
  });

  it("maps pino levels to GCP severities via level formatter", async () => {
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: "v1",
        GCP_PROJECT_ID: undefined,
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as {
      formatters: { level: (label: string) => Record<string, string> };
    };
    const level = opts.formatters.level;

    expect(level("trace")).toEqual({ severity: "DEBUG" });
    expect(level("debug")).toEqual({ severity: "DEBUG" });
    expect(level("info")).toEqual({ severity: "INFO" });
    expect(level("warn")).toEqual({ severity: "WARNING" });
    expect(level("error")).toEqual({ severity: "ERROR" });
    expect(level("fatal")).toEqual({ severity: "CRITICAL" });
    expect(level("unknown-label")).toEqual({ severity: "DEFAULT" });
  });

  it("falls back to K_REVISION for service version in prod", async () => {
    process.env.K_REVISION = "rev-42";
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: undefined,
        GCP_PROJECT_ID: undefined,
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as {
      base: { version: string };
    };
    expect(opts.base.version).toBe("rev-42");
  });

  it("defaults service version to 'unknown' when no env or K_REVISION", async () => {
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: undefined,
        GCP_PROJECT_ID: undefined,
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as { base: { version: string } };
    expect(opts.base.version).toBe("unknown");
  });

  it("mixin injects ALS context with GCP-prefixed trace when GCP_PROJECT_ID set", async () => {
    const getCtx = vi.fn();
    vi.doMock("./log-context", () => ({ getLogContext: getCtx }));
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: "1.0",
        GCP_PROJECT_ID: "proj-1",
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as {
      mixin: () => Record<string, unknown>;
    };

    getCtx.mockReturnValueOnce({
      requestId: "rid-1",
      traceId: "trace-abc",
      spanId: "span-1",
      traceSampled: true,
    });

    expect(opts.mixin()).toEqual({
      requestId: "rid-1",
      "logging.googleapis.com/trace": "projects/proj-1/traces/trace-abc",
      "logging.googleapis.com/spanId": "span-1",
      "logging.googleapis.com/trace_sampled": true,
    });
  });

  it("mixin emits bare traceId when no GCP_PROJECT_ID set", async () => {
    const getCtx = vi.fn();
    vi.doMock("./log-context", () => ({ getLogContext: getCtx }));
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: "1.0",
        GCP_PROJECT_ID: undefined,
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as {
      mixin: () => Record<string, unknown>;
    };

    getCtx.mockReturnValueOnce({
      requestId: "rid-1",
      traceId: "plain-trace",
    });

    expect(opts.mixin()).toEqual({
      requestId: "rid-1",
      "logging.googleapis.com/trace": "plain-trace",
    });
  });

  it("mixin returns empty object when no context", async () => {
    const getCtx = vi.fn().mockReturnValue(undefined);
    vi.doMock("./log-context", () => ({ getLogContext: getCtx }));
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: "1.0",
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");

    const opts = pinoMock.mock.calls[0]![0] as {
      mixin: () => Record<string, unknown>;
    };

    expect(opts.mixin()).toEqual({});
  });

  it("mixin handles partial context (only requestId)", async () => {
    const getCtx = vi.fn().mockReturnValue({ requestId: "r-only" });
    vi.doMock("./log-context", () => ({ getLogContext: getCtx }));
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "api",
        SERVICE_VERSION: "1.0",
      },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");
    const opts = pinoMock.mock.calls[0]![0] as {
      mixin: () => Record<string, unknown>;
    };
    expect(opts.mixin()).toEqual({ requestId: "r-only" });
  });

  it("flushLogger calls pino flush and resolves", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "test", LOG_LEVEL: "info" },
    }));

    const mock = makeMockLogger();
    const pinoMock = vi.fn().mockReturnValue(mock);
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    const { flushLogger } = await import("./logger");
    await expect(flushLogger()).resolves.toBeUndefined();
    expect(mock.flush).toHaveBeenCalled();
  });

  it("flushLogger resolves even if flush throws", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "test", LOG_LEVEL: "info" },
    }));

    const mock = makeMockLogger();
    mock.flush = vi.fn(() => {
      throw new Error("boom");
    });
    const pinoMock = vi.fn().mockReturnValue(mock);
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    const { flushLogger } = await import("./logger");
    await expect(flushLogger()).resolves.toBeUndefined();
  });

  // Guard against accidental regression — make sure mock return shape matches
  // what pino-mock asserts in the assertion set above.
  it("test-mode options attach mixin but no transport or formatters", async () => {
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "test", LOG_LEVEL: "warn" },
    }));

    const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
    const stdTimeFunctions = { isoTime: () => "T" };
    vi.doMock("pino", () => ({
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    }));

    await import("./logger");
    const opts = pinoMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.transport).toBeUndefined();
    expect(opts.formatters).toBeUndefined();
    expect(opts.mixin).toBeTypeOf("function");
    expect(opts.level).toBe("warn");
    // Prevents noise in tests
    expect((pinoMock.mock.calls[0] as PinoMockCall)[0]).not.toHaveProperty(
      "transport",
    );
  });

  // Redaction used to be configured only in the production branch, so a
  // password or bearer token logged during development or in CI went out in
  // clear text. The paths must be byte-identical across all three branches —
  // anything else means a gap that only shows up after deploy.
  describe("redaction applies in every environment", () => {
    async function redactOptionsFor(
      nodeEnv: string,
    ): Promise<{ paths: string[]; censor: string }> {
      vi.resetModules();
      vi.doMock("./env", () => ({
        env: {
          NODE_ENV: nodeEnv,
          LOG_LEVEL: "info",
          SERVICE_NAME: "api",
          SERVICE_VERSION: "1.0",
          GCP_PROJECT_ID: undefined,
        },
      }));
      const pinoMock = vi.fn().mockReturnValue(makeMockLogger());
      const stdTimeFunctions = { isoTime: () => "T" };
      vi.doMock("pino", () => ({
        default: Object.assign(pinoMock, { stdTimeFunctions }),
        stdTimeFunctions,
      }));

      await import("./logger");
      const opts = pinoMock.mock.calls[0]![0] as Record<string, unknown>;
      return opts.redact as { paths: string[]; censor: string };
    }

    it.each(["production", "development", "test"])(
      "configures redact in NODE_ENV=%s",
      async (nodeEnv) => {
        const redact = await redactOptionsFor(nodeEnv);

        expect(redact).toBeDefined();
        expect(redact.censor).toBe("[REDACTED]");
        expect(redact.paths).toContain("req.headers.authorization");
        expect(redact.paths).toContain("SDK_PASSWORD");
        expect(redact.paths).toContain("*.password");
        expect(redact.paths).toContain("*.body.token");
      },
    );

    it("uses identical redact paths in dev/test as in production", async () => {
      const prod = await redactOptionsFor("production");
      const dev = await redactOptionsFor("development");
      const test = await redactOptionsFor("test");

      expect(dev.paths).toEqual(prod.paths);
      expect(test.paths).toEqual(prod.paths);
    });

    // Builds a real pino against a capture stream using the logger's own
    // options, so these cases assert what actually reaches stdout rather than
    // the shape of the paths array.
    async function realProbe(
      nodeEnv: string,
    ): Promise<{ probe: Logger; written: string[] }> {
      vi.resetModules();
      // Earlier cases in this file register a pino mock, and doMock survives
      // resetModules. These cases need the real serializer.
      vi.doUnmock("pino");
      vi.doMock("./env", () => ({
        env: {
          NODE_ENV: nodeEnv,
          LOG_LEVEL: "info",
          SERVICE_NAME: "api",
          SERVICE_VERSION: "1.0",
          GCP_PROJECT_ID: undefined,
        },
      }));

      const written: string[] = [];
      const { buildOptions } = await import("./logger");
      const pino = (await import("pino")).default;

      // Drop the pino-pretty transport: a worker thread would swallow the
      // writes. Redaction happens before serialization either way.
      const { transport: _transport, ...options } = buildOptions();
      const probe = pino(options, {
        write: (chunk: string) => {
          written.push(chunk);
        },
      });

      return { probe, written };
    }

    // The assertions above check the options object; this one checks that the
    // options actually censor when a real pino writes a line.
    it.each(["test", "development"])(
      "censors a secret written through a real pino in NODE_ENV=%s",
      async (nodeEnv) => {
        const { probe, written } = await realProbe(nodeEnv);

        // `*.password` / `*.body.token`: the paths cover nested objects, which
        // is how services log request context. Shape the payload accordingly.
        probe.info(
          {
            creds: { password: "hunter2" },
            req: { body: { token: "bearer-abc" } },
            keep: "visible",
          },
          "probe",
        );

        const line = written.join("");
        expect(line).not.toContain("hunter2");
        expect(line).not.toContain("bearer-abc");
        expect(line).toContain("[REDACTED]");
        expect(line).toContain("visible");
      },
    );

    // `*.password` is a pino wildcard for "a password one level down", so it
    // does not match a password at the root of the logged object. Every
    // sensitive key had that hole, and `logger.debug({ token })` while poking
    // at an auth path is an easy thing to write. Listed here independently of
    // the implementation on purpose: this is the intent, not a mirror of
    // SENSITIVE_KEYS.
    const ROOT_SECRETS = {
      password: "root-password-value",
      token: "root-token-value",
      accessToken: "root-accessToken-value",
      refreshToken: "root-refreshToken-value",
      apiKey: "root-apiKey-value",
      api_key: "root-api_key-value",
      secret: "root-secret-value",
      authorization: "root-authorization-value",
      cookie: "root-cookie-value",
    };

    it.each(["production", "development", "test"])(
      "censors a top-level sensitive key in NODE_ENV=%s",
      async (nodeEnv) => {
        const { probe, written } = await realProbe(nodeEnv);

        probe.info({ ...ROOT_SECRETS, keep: "visible" }, "probe");

        const line = written.join("");
        for (const [key, value] of Object.entries(ROOT_SECRETS)) {
          expect(line, `top-level ${key} leaked`).not.toContain(value);
        }
        expect(line).toContain("[REDACTED]");
        expect(line).toContain("visible");
      },
    );

    // The nested cases above only run in test/development; production carries
    // the same paths but a different options object, so prove it there too.
    it("still censors nested and header secrets in NODE_ENV=production", async () => {
      const { probe, written } = await realProbe("production");

      probe.info(
        {
          creds: { password: "nested-hunter2" },
          req: {
            body: { token: "nested-bearer" },
            headers: { authorization: "Bearer header-secret" },
          },
          keep: "visible",
        },
        "probe",
      );

      const line = written.join("");
      expect(line).not.toContain("nested-hunter2");
      expect(line).not.toContain("nested-bearer");
      expect(line).not.toContain("header-secret");
      expect(line).toContain("[REDACTED]");
      expect(line).toContain("visible");
    });
  });
});
