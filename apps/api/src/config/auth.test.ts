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
  getDb: () => ({}),
}));

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock("./redis", () => ({
  getRedis: () => ({
    get: (...a: unknown[]) => redisMocks.get(...a),
    set: (...a: unknown[]) => redisMocks.set(...a),
    del: (...a: unknown[]) => redisMocks.del(...a),
  }),
}));

const logMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("./logger", () => ({ logger: logMocks }));

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
    mocks.env.BETTER_AUTH_URL = "https://api.app.hbdragons.de";
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

  // The domain used to be the literal ".app.hbdragons.de" regardless of where
  // BETTER_AUTH_URL pointed. Moving the API then scoped every session cookie to
  // a domain the browser never sends it back to.
  it("derives the production cookie domain from BETTER_AUTH_URL", async () => {
    mocks.env.NODE_ENV = "production";
    mocks.env.BETTER_AUTH_URL = "https://api.dragons.example.com";
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      advanced: { crossSubDomainCookies: { enabled: boolean; domain?: string } };
    };
    expect(config.advanced.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: ".dragons.example.com",
    });
  });

  it("leaves cross-subdomain cookies off when the host has no domain to scope to", async () => {
    mocks.env.NODE_ENV = "production";
    mocks.env.BETTER_AUTH_URL = "http://localhost:3001";
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      advanced: { crossSubDomainCookies: { enabled: boolean; domain?: string } };
    };
    expect(config.advanced.crossSubDomainCookies).toEqual({ enabled: false });
  });

  it("does not pre-bake __Secure- into the cookie prefix", async () => {
    // better-auth prepends `__Secure-` for HTTPS baseURLs on its own. Baking
    // it into `cookiePrefix` produces `__Secure-__Secure-dragons.*` cookies
    // that break get-session in production.
    mocks.env.NODE_ENV = "production";
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      advanced: { cookiePrefix: string };
    };
    expect(config.advanced.cookiePrefix).toBe("dragons");
    expect(config.advanced.cookiePrefix).not.toMatch(/^__Secure-/);
  });

  it("mirrors sessions to the database as a Valkey safety net", async () => {
    // Memorystore for Valkey is cluster-mode; ioredis runs against it in
    // standalone mode. A MOVED redirect or transient hiccup must not silently
    // drop sessions — findSession falls back to the session table when the
    // secondaryStorage read returns null, so writes have to land in both.
    await import("./auth");
    const config = mocks.betterAuth.mock.calls[0]![0] as {
      session: { storeSessionInDatabase?: boolean };
    };
    expect(config.session.storeSessionInDatabase).toBe(true);
  });

  describe("databaseHooks.user.create.before", () => {
    type UserCreateHook = (user: {
      role?: string | null;
      [key: string]: unknown;
    }) => Promise<{ data: { role: string | null; [key: string]: unknown } }>;

    async function getHook(): Promise<UserCreateHook> {
      await import("./auth");
      const config = mocks.betterAuth.mock.calls[0]![0] as {
        databaseHooks?: {
          user?: { create?: { before?: UserCreateHook } };
        };
      };
      const hook = config.databaseHooks?.user?.create?.before;
      if (!hook) throw new Error("Expected user.create.before hook to be configured");
      return hook;
    }

    it("strips the injected 'user' default role back to null", async () => {
      const hook = await getHook();
      const result = await hook({
        id: "u1",
        email: "a@b.com",
        name: "A",
        role: "user",
      });
      expect(result.data.role).toBeNull();
    });

    it("preserves null role (already correct)", async () => {
      const hook = await getHook();
      const result = await hook({
        id: "u2",
        email: "b@b.com",
        name: "B",
        role: null,
      });
      expect(result.data.role).toBeNull();
    });

    it("preserves non-'user' roles (e.g., admin, refereeAdmin)", async () => {
      const hook = await getHook();
      const adminResult = await hook({
        id: "u3",
        email: "c@b.com",
        name: "C",
        role: "admin",
      });
      expect(adminResult.data.role).toBe("admin");

      const multiResult = await hook({
        id: "u4",
        email: "d@b.com",
        name: "D",
        role: "admin,refereeAdmin",
      });
      expect(multiResult.data.role).toBe("admin,refereeAdmin");
    });

    it("preserves other user fields untouched", async () => {
      const hook = await getHook();
      const result = await hook({
        id: "u5",
        email: "e@b.com",
        name: "E",
        role: "user",
        emailVerified: true,
      });
      expect(result.data).toMatchObject({
        id: "u5",
        email: "e@b.com",
        name: "E",
        emailVerified: true,
        role: null,
      });
    });
  });

  describe("rateLimit", () => {
    async function getRateLimit(): Promise<{
      enabled: boolean;
      window: number;
      max: number;
      customRules: Record<string, unknown>;
    }> {
      await import("./auth");
      const config = mocks.betterAuth.mock.calls[0]![0] as {
        rateLimit: {
          enabled: boolean;
          window: number;
          max: number;
          customRules: Record<string, unknown>;
        };
      };
      return config.rateLimit;
    }

    it("exempts /get-session so the web tier's shared egress IP is not throttled", async () => {
      const rateLimit = await getRateLimit();
      // `false` makes better-auth skip the limiter for this path entirely;
      // a numeric ceiling would only postpone the shared-bucket exhaustion.
      expect(rateLimit.customRules["/get-session"]).toBe(false);
    });

    it("keeps strict per-IP limits on credential endpoints", async () => {
      const rateLimit = await getRateLimit();
      expect(rateLimit.customRules["/sign-in/email"]).toEqual({ window: 60, max: 5 });
      expect(rateLimit.customRules["/sign-up/email"]).toEqual({ window: 60, max: 3 });
      expect(rateLimit.customRules["/forget-password"]).toEqual({ window: 60, max: 3 });
      expect(rateLimit.customRules["/reset-password"]).toEqual({ window: 60, max: 5 });
    });
  });

  describe("secondaryStorage", () => {
    type Storage = {
      get(key: string): Promise<unknown>;
      set(key: string, value: string, ttl?: number): Promise<void>;
      delete(key: string): Promise<void>;
    };

    async function getStorage(): Promise<Storage> {
      await import("./auth");
      const config = mocks.betterAuth.mock.calls[0]![0] as {
        secondaryStorage: Storage;
      };
      return config.secondaryStorage;
    }

    beforeEach(() => {
      redisMocks.get.mockReset();
      redisMocks.set.mockReset();
      redisMocks.del.mockReset();
    });

    it("get prefixes the key", async () => {
      redisMocks.get.mockResolvedValue("v");
      const storage = await getStorage();
      await storage.get("session:abc");
      expect(redisMocks.get).toHaveBeenCalledWith("ba:session:abc");
    });

    it("set with ttl uses EX expiry", async () => {
      const storage = await getStorage();
      await storage.set("k", "v", 60);
      expect(redisMocks.set).toHaveBeenCalledWith("ba:k", "v", "EX", 60);
    });

    it("set without ttl omits EX", async () => {
      const storage = await getStorage();
      await storage.set("k", "v");
      expect(redisMocks.set).toHaveBeenCalledWith("ba:k", "v");
    });

    it("set with ttl=0 omits EX", async () => {
      const storage = await getStorage();
      await storage.set("k", "v", 0);
      expect(redisMocks.set).toHaveBeenCalledWith("ba:k", "v");
    });

    it("delete prefixes the key", async () => {
      const storage = await getStorage();
      await storage.delete("k");
      expect(redisMocks.del).toHaveBeenCalledWith("ba:k");
    });

    // Every getSession touches secondaryStorage once the 5-minute cookie cache
    // lapses. A Redis outage must degrade session resolution (fall through to
    // the mirrored session table), not propagate an error out of getSession.
    describe("with Redis unavailable", () => {
      beforeEach(() => {
        logMocks.warn.mockReset();
      });

      it("get degrades to a miss instead of throwing", async () => {
        redisMocks.get.mockRejectedValue(new Error("redis down"));
        const storage = await getStorage();

        await expect(storage.get("session:abc")).resolves.toBeNull();
        expect(logMocks.warn).toHaveBeenCalled();
      });

      it("set does not throw", async () => {
        redisMocks.set.mockRejectedValue(new Error("redis down"));
        const storage = await getStorage();

        await expect(storage.set("k", "v", 60)).resolves.toBeUndefined();
        expect(logMocks.warn).toHaveBeenCalled();
      });

      it("delete does not throw", async () => {
        redisMocks.del.mockRejectedValue(new Error("redis down"));
        const storage = await getStorage();

        await expect(storage.delete("k")).resolves.toBeUndefined();
        expect(logMocks.warn).toHaveBeenCalled();
      });
    });
  });
});

describe("deriveCookieDomain", () => {
  it.each([
    // [BETTER_AUTH_URL, expected cookie domain]
    ["https://api.app.hbdragons.de", ".app.hbdragons.de"],
    ["https://api.dragons.example.com", ".dragons.example.com"],
    // Already a registrable domain: no service label to strip, still shareable.
    ["https://hbdragons.de", ".hbdragons.de"],
    ["https://a.b.c.example.org", ".b.c.example.org"],
    // A port must not leak into the domain attribute.
    ["https://api.example.de:8443", ".example.de"],
    // Nothing to scope to — the caller disables cross-subdomain cookies.
    ["http://localhost:3001", undefined],
    ["http://127.0.0.1:3001", undefined],
    ["http://[::1]:3001", undefined],
    ["not a url", undefined],
  ])("%s -> %s", async (baseUrl, expected) => {
    const { deriveCookieDomain } = await import("./auth");
    expect(deriveCookieDomain(baseUrl)).toBe(expected);
  });
});
