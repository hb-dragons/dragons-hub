import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    BETTER_AUTH_SECRET: "testsecrettestsecrettestsecrettest",
    BETTER_AUTH_URL: "http://localhost:3001",
    TRUSTED_ORIGINS: ["http://localhost:3000"],
    NODE_ENV: "test" as "test" | "development" | "production",
  },
  betterAuth: vi.fn().mockReturnValue({
    handler: vi.fn(),
    api: { getSession: vi.fn() },
  }),
}));

vi.mock("./env", () => ({
  get env() {
    return mocks.env;
  },
}));

vi.mock("./database", () => ({
  db: {},
}));

vi.mock("better-auth", () => ({
  betterAuth: (...args: unknown[]) => mocks.betterAuth(...args),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn().mockReturnValue({}),
}));

vi.mock("better-auth/plugins/admin", () => ({
  admin: vi.fn().mockReturnValue({}),
}));

vi.mock("@better-auth/expo", () => ({
  expo: vi.fn().mockReturnValue({}),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.betterAuth.mockClear();
  mocks.env = {
    BETTER_AUTH_SECRET: "testsecrettestsecrettestsecrettest",
    BETTER_AUTH_URL: "http://localhost:3001",
    TRUSTED_ORIGINS: ["http://localhost:3000"],
    NODE_ENV: "test",
  };
});

describe("auth config", () => {
  it("creates auth instance with betterAuth", async () => {
    const { auth } = await import("./auth");

    expect(auth).toBeDefined();
    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "testsecrettestsecrettestsecrettest",
        baseURL: "http://localhost:3001",
      }),
    );
  });

  it("excludes exp:// origin and disables cross-subdomain cookies outside development/production", async () => {
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      trustedOrigins: string[];
      advanced: {
        crossSubDomainCookies: { enabled: boolean };
        defaultCookieAttributes: { secure: boolean };
      };
    };
    expect(config.trustedOrigins).not.toContain("exp://*");
    expect(config.advanced.crossSubDomainCookies).toEqual({ enabled: false });
    expect(config.advanced.defaultCookieAttributes.secure).toBe(false);
  });

  it("includes exp:// origin in development mode", async () => {
    mocks.env.NODE_ENV = "development";
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      trustedOrigins: string[];
    };
    expect(config.trustedOrigins).toContain("exp://*");
  });

  it("enables cross-subdomain cookies and secure flag in production", async () => {
    mocks.env.NODE_ENV = "production";
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      advanced: {
        crossSubDomainCookies: { enabled: boolean; domain?: string };
        defaultCookieAttributes: { secure: boolean };
      };
    };
    expect(config.advanced.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: ".app.hbdragons.de",
    });
    expect(config.advanced.defaultCookieAttributes.secure).toBe(true);
  });
});
