import { describe, expect, it, vi } from "vitest";
import { DEFAULT_API_URL, resolveApiUrlSafe } from "./api-url";

describe("resolveApiUrlSafe", () => {
  it("returns the configured URL in a release build", () => {
    expect(resolveApiUrlSafe({ configured: "https://api.hbdragons.de", isDev: false })).toEqual({
      url: "https://api.hbdragons.de",
      error: null,
    });
  });

  it("falls back to localhost in development when nothing is configured", () => {
    expect(resolveApiUrlSafe({ configured: undefined, isDev: true })).toEqual({
      url: DEFAULT_API_URL,
      error: null,
    });
  });

  it("does not throw when a release build has no API URL configured", () => {
    // The bug: this threw at module scope, before ErrorBoundary could mount,
    // so an OTA update published without EXPO_PUBLIC_API_URL produced a bundle
    // that died during module evaluation and was unrecoverable in-process.
    expect(() => resolveApiUrlSafe({ configured: undefined, isDev: false })).not.toThrow();
  });

  it("reports a missing release URL as an error instead of throwing", () => {
    const result = resolveApiUrlSafe({ configured: undefined, isDev: false });

    expect(result.error).toMatch(/EXPO_PUBLIC_API_URL/);
    expect(result.url).toBe("");
  });

  it("refuses to hand out a cleartext URL in a release build", () => {
    // Degrading must not mean silently sending session cookies over http://.
    const result = resolveApiUrlSafe({ configured: "http://api.hbdragons.de", isDev: false });

    expect(result.url).toBe("");
    expect(result.error).toMatch(/HTTPS/i);
  });

  it("allows cleartext in development", () => {
    expect(resolveApiUrlSafe({ configured: "http://192.168.1.20:3001", isDev: true })).toEqual({
      url: "http://192.168.1.20:3001",
      error: null,
    });
  });

  it("treats an empty string as unconfigured", () => {
    expect(resolveApiUrlSafe({ configured: "", isDev: true }).url).toBe(DEFAULT_API_URL);
  });
});

describe("resolveApiUrl", () => {
  it("never throws and logs the misconfiguration once", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("EXPO_PUBLIC_API_URL", "");
    vi.resetModules();

    const { resolveApiUrl, getApiUrlConfigError } = await import("./api-url");

    expect(() => resolveApiUrl()).not.toThrow();
    // Under vitest `__DEV__` is undefined, which the module treats as a release
    // build — the strict path — so the missing URL must surface as an error.
    expect(getApiUrlConfigError()).toMatch(/EXPO_PUBLIC_API_URL/);
    expect(err).toHaveBeenCalled();

    err.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
