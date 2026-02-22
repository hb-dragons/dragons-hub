import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  env: {
    BETTER_AUTH_SECRET: "testsecrettestsecrettestsecrettest",
    BETTER_AUTH_URL: "http://localhost:3001",
    TRUSTED_ORIGINS: ["http://localhost:3000"],
    NODE_ENV: "test",
  },
}));

vi.mock("./database", () => ({
  db: {},
}));

const mockBetterAuth = vi.fn().mockReturnValue({
  handler: vi.fn(),
  api: { getSession: vi.fn() },
});
vi.mock("better-auth", () => ({
  betterAuth: (...args: unknown[]) => mockBetterAuth(...args),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn().mockReturnValue({}),
}));

vi.mock("better-auth/plugins/admin", () => ({
  admin: vi.fn().mockReturnValue({}),
}));

describe("auth config", () => {
  it("creates auth instance with betterAuth", async () => {
    const { auth } = await import("./auth");

    expect(auth).toBeDefined();
    expect(mockBetterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "testsecrettestsecrettestsecrettest",
        baseURL: "http://localhost:3001",
      }),
    );
  });
});
