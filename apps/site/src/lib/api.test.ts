import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("API_BASE", () => {
  test("defaults to the production API host", async () => {
    vi.resetModules();
    const { API_BASE } = await import("./api");
    expect(API_BASE).toBe("https://api.app.hbdragons.de");
  });

  test("honors PUBLIC_API_URL", async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_API_URL", "http://localhost:3010");
    const { API_BASE } = await import("./api");
    expect(API_BASE).toBe("http://localhost:3010");
  });
});

describe("api", () => {
  test("exposes the public endpoints the islands consume", async () => {
    vi.resetModules();
    const { api } = await import("./api");
    expect(typeof api.public.getMatches).toBe("function");
  });
});
