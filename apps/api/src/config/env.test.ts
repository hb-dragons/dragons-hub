import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { envSchema } from "./env";

const baseEnv = {
  DATABASE_URL: "postgres://x",
  REDIS_URL: "redis://x",
  SDK_USERNAME: "u",
  SDK_PASSWORD: "p",
  BETTER_AUTH_SECRET: "x".repeat(32),
  SCOREBOARD_INGEST_KEY: "y".repeat(32),
  SCOREBOARD_DEVICE_ID: "panel-1",
};

describe("env config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("parses valid environment variables", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
    vi.stubEnv("PORT", "3001");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TRUSTED_ORIGINS", "http://localhost:3000,http://localhost:3001");
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");

    const { env } = await import("./env");

    expect(env.DATABASE_URL).toBe("postgresql://test:test@localhost:5432/test");
    expect(env.PORT).toBe(3001);
    expect(env.TRUSTED_ORIGINS).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("uses defaults for optional fields", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");
    // Remove optional envs
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.TRUSTED_ORIGINS;
    delete process.env.RUN_MODE;

    const { env } = await import("./env");

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.RUN_MODE).toBe("both");
  });

  it("accepts valid RUN_MODE values", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");
    vi.stubEnv("RUN_MODE", "worker");

    const { env } = await import("./env");

    expect(env.RUN_MODE).toBe("worker");
  });

  it("throws on missing required fields", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.SDK_USERNAME;
    delete process.env.SDK_PASSWORD;
    delete process.env.BETTER_AUTH_SECRET;

    const { env } = await import("./env");

    expect(() => env.DATABASE_URL).toThrow("Invalid environment variables");
  });

  it("throws when BETTER_AUTH_SECRET is too short", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "short");

    const { env } = await import("./env");

    expect(() => env.DATABASE_URL).toThrow("Invalid environment variables");
  });

  it("rejects production with localhost BETTER_AUTH_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");

    const { env } = await import("./env");
    expect(() => env.DATABASE_URL).toThrow(/Invalid environment variables/);
  });

  it("rejects production with 127.0.0.1 BETTER_AUTH_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3001");

    const { env } = await import("./env");
    expect(() => env.DATABASE_URL).toThrow(/Invalid environment variables/);
  });

  it("accepts production with public BETTER_AUTH_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://api.app.hbdragons.de");

    const { env } = await import("./env");
    expect(env.BETTER_AUTH_URL).toBe("https://api.app.hbdragons.de");
  });

  it("VERBOSE_ERRORS coerces string to boolean", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");
    vi.stubEnv("VERBOSE_ERRORS", "true");

    const { env } = await import("./env");
    expect(env.VERBOSE_ERRORS).toBe(true);
  });

  it("caches env after first parse", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("SCOREBOARD_INGEST_KEY", "k".repeat(32));
    vi.stubEnv("SCOREBOARD_DEVICE_ID", "dragons-1");

    const { env } = await import("./env");

    const first = env.DATABASE_URL;
    const second = env.DATABASE_URL;
    expect(first).toBe(second);
  });
});

describe("assistant env vars", () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
  });
  afterEach(() => { process.env = { ...ORIGINAL }; });

  it("defaults ASSISTANT_ENABLED to false and ASSISTANT_MODEL to gemini-2.5-flash", async () => {
    delete process.env.ASSISTANT_ENABLED;
    delete process.env.ASSISTANT_MODEL;
    const { envSchema } = await import("./env");
    const parsed = envSchema.parse(process.env);
    expect(parsed.ASSISTANT_ENABLED).toBe(false);
    expect(parsed.ASSISTANT_MODEL).toBe("gemini-2.5-flash");
  });

  it("requires GOOGLE_GENERATIVE_AI_API_KEY when ASSISTANT_ENABLED=true", async () => {
    process.env.ASSISTANT_ENABLED = "true";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { envSchema } = await import("./env");
    expect(() => envSchema.parse(process.env)).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });
});

describe("boolean feature flags", () => {
  const FLAGS = ["VERBOSE_ERRORS", "ASSISTANT_ENABLED", "CHATBOT_ENABLED"] as const;

  // The schema used to accept only the literals "true"/"false". Terraform
  // renders an unset variable as "", shells pass "1"/"0" — each of those failed
  // the whole parse and the process refused to boot over an optional feature.
  describe.each(FLAGS)("%s", (flag) => {
    it.each([
      ["true", true],
      ["TRUE", true],
      [" true ", true],
      ["1", true],
      ["yes", true],
      ["on", true],
      ["false", false],
      ["0", false],
      ["no", false],
      ["off", false],
      // Blank and absent both mean "unset" and fall back to the default.
      ["", false],
    ] as const)("parses %p as %p", (raw, expected) => {
      const parsed = envSchema.parse({
        ...baseEnv,
        GOOGLE_GENERATIVE_AI_API_KEY: "k",
        [flag]: raw,
      });
      expect(parsed[flag]).toBe(expected);
    });

    it("defaults to false when unset", () => {
      const parsed = envSchema.parse(baseEnv);
      expect(parsed[flag]).toBe(false);
    });

    // A typo must not read as "off": that would disable a feature silently.
    it.each(["ture", "enabled", "2"])("rejects %p", (raw) => {
      const result = envSchema.safeParse({ ...baseEnv, [flag]: raw });
      expect(result.success).toBe(false);
      expect(result.success ? [] : result.error.issues.map((i) => i.path.join("."))).toContain(
        flag,
      );
    });
  });

  // CLAUDE.md's deployment contract: production Terraform omits these keys
  // entirely rather than passing "", because an empty value is a broken deploy
  // and not "leave the channel off". The tolerance above must not reach them.
  it.each(["WAHA_BASE_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"])(
    "still rejects an empty %s",
    (name) => {
      expect(envSchema.safeParse({ ...baseEnv, [name]: "" }).success).toBe(false);
    },
  );
});

describe("PORT", () => {
  it("parses a numeric port", () => {
    expect(envSchema.parse({ ...baseEnv, PORT: "8080" }).PORT).toBe(8080);
  });

  // `Number("")` is 0, which binds an arbitrary ephemeral port and leaves the
  // platform health check knocking on a port nothing listens on.
  it.each([undefined, ""])("falls back to 3001 when PORT is %p", (value) => {
    const raw = { ...baseEnv, ...(value === undefined ? {} : { PORT: value }) };
    expect(envSchema.parse(raw).PORT).toBe(3001);
  });

  it.each(["0", "-1", "70000", "http", "3001.5"])("rejects %p", (value) => {
    expect(envSchema.safeParse({ ...baseEnv, PORT: value }).success).toBe(false);
  });
});

describe("env proxy", () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL, ...baseEnv };
    // The ambient environment may carry these; the assertions below pin the
    // defaults, so start from "not set".
    delete process.env.PORT;
    delete process.env.VERBOSE_ERRORS;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  // With only a `get` trap the target is a bare `{}`, so `in`, `Object.keys`
  // and spread all report an empty object — which reads as "not configured"
  // at exactly the call sites that probe for configuration.
  it("answers `in` from the parsed env", async () => {
    const { env } = await import("./env");
    expect("DATABASE_URL" in env).toBe(true);
    expect("NOT_A_REAL_VAR" in env).toBe(false);
  });

  it("enumerates its keys", async () => {
    const { env } = await import("./env");
    const keys = Object.keys(env);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("CHATBOT_ENABLED");
    expect(keys).toEqual(Object.keys(envSchema.parse(process.env)));
  });

  it("spreads into a plain object", async () => {
    const { env } = await import("./env");
    const copy = { ...env };
    expect(copy.DATABASE_URL).toBe(baseEnv.DATABASE_URL);
    expect(copy.PORT).toBe(3001);
    expect(copy.VERBOSE_ERRORS).toBe(false);
  });

  it("reports own property descriptors for parsed keys only", async () => {
    const { env } = await import("./env");
    expect(Object.getOwnPropertyDescriptor(env, "PORT")).toMatchObject({
      value: 3001,
      enumerable: true,
      configurable: true,
    });
    expect(Object.getOwnPropertyDescriptor(env, "NOT_A_REAL_VAR")).toBeUndefined();
  });

  it("throws through every trap when the environment is invalid", async () => {
    delete process.env.DATABASE_URL;
    const { env } = await import("./env");
    expect(() => "DATABASE_URL" in env).toThrow("Invalid environment variables");
    expect(() => Object.keys(env)).toThrow("Invalid environment variables");
  });
});

describe("CHATBOT_* env", () => {
  it("defaults CHATBOT_ENABLED=false and CHATBOT_MODEL=gemini-2.5-flash", () => {
    const parsed = envSchema.parse(baseEnv);
    expect(parsed.CHATBOT_ENABLED).toBe(false);
    expect(parsed.CHATBOT_MODEL).toBe("gemini-2.5-flash");
  });

  it("requires GOOGLE_GENERATIVE_AI_API_KEY when CHATBOT_ENABLED=true", () => {
    const result = envSchema.safeParse({ ...baseEnv, CHATBOT_ENABLED: "true" });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join("."))).toContain(
      "GOOGLE_GENERATIVE_AI_API_KEY",
    );
  });

  it("accepts CHATBOT_ENABLED=true with the key present", () => {
    const parsed = envSchema.parse({ ...baseEnv, CHATBOT_ENABLED: "true", GOOGLE_GENERATIVE_AI_API_KEY: "k" });
    expect(parsed.CHATBOT_ENABLED).toBe(true);
  });
});
