import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "./instrumentation";

// The real config pulls in every collection plus sharp; the mock keeps the
// test at the seam — register() only forwards it to getPayload.
vi.mock("./payload.config", () => ({ default: { mocked: "payload-config" } }));

const getPayload = vi.fn().mockResolvedValue({});
vi.mock("payload", () => ({ getPayload: (...args: unknown[]) => getPayload(...args) }));

afterEach(() => {
  vi.unstubAllEnvs();
  getPayload.mockClear();
});

describe("register", () => {
  it("initializes Payload at boot in the production nodejs runtime (runs prodMigrations)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(getPayload).toHaveBeenCalledWith({ config: { mocked: "payload-config" } });
  });

  it("does nothing outside production (dev push-mode owns the schema)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(getPayload).not.toHaveBeenCalled();
  });

  it("does nothing outside the nodejs runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(getPayload).not.toHaveBeenCalled();
  });
});
