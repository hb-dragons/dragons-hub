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

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock("./redis", () => ({
  redis: {
    get: (...a: unknown[]) => redisMocks.get(...a),
    set: (...a: unknown[]) => redisMocks.set(...a),
    del: (...a: unknown[]) => redisMocks.del(...a),
  },
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
  });
});
