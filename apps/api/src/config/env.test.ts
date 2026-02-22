import { describe, expect, it, vi, beforeEach } from "vitest";

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
    // Remove optional envs
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.TRUSTED_ORIGINS;

    const { env } = await import("./env");

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
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

  it("caches env after first parse", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("SDK_USERNAME", "user");
    vi.stubEnv("SDK_PASSWORD", "pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));

    const { env } = await import("./env");

    const first = env.DATABASE_URL;
    const second = env.DATABASE_URL;
    expect(first).toBe(second);
  });
});
