import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bucket: vi.fn(),
  env: { GCS_PROJECT_ID: "test-project", GCS_BUCKET_NAME: "test-bucket" as string | undefined },
  StorageCtor: vi.fn(),
}));

vi.mock("./env", () => ({
  get env() {
    return mocks.env;
  },
}));

vi.mock("@google-cloud/storage", () => ({
  Storage: class MockStorage {
    constructor(opts: unknown) {
      mocks.StorageCtor(opts);
    }
    bucket = mocks.bucket;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.env = { GCS_PROJECT_ID: "test-project", GCS_BUCKET_NAME: "test-bucket" };
});

describe("getGcsStorage", () => {
  it("creates Storage with configured projectId", async () => {
    const { getGcsStorage } = await import("./gcs");
    const s1 = getGcsStorage();
    expect(mocks.StorageCtor).toHaveBeenCalledWith({ projectId: "test-project" });
    expect(s1).toBeDefined();
  });

  it("memoizes the Storage instance across calls", async () => {
    const { getGcsStorage } = await import("./gcs");
    const s1 = getGcsStorage();
    const s2 = getGcsStorage();
    expect(s1).toBe(s2);
    expect(mocks.StorageCtor).toHaveBeenCalledTimes(1);
  });
});

describe("getGcsBucket", () => {
  it("returns bucket when bucket name is configured", async () => {
    mocks.bucket.mockReturnValue({ name: "test-bucket" });
    const { getGcsBucket } = await import("./gcs");

    const bucket = getGcsBucket();

    expect(mocks.bucket).toHaveBeenCalledWith("test-bucket");
    expect(bucket).toEqual({ name: "test-bucket" });
  });

  it("throws when GCS_BUCKET_NAME is not set", async () => {
    mocks.env.GCS_BUCKET_NAME = undefined;
    const { getGcsBucket } = await import("./gcs");

    expect(() => getGcsBucket()).toThrow("GCS_BUCKET_NAME is required for social features");
    expect(mocks.bucket).not.toHaveBeenCalled();
  });

  it("throws when GCS_BUCKET_NAME is empty string", async () => {
    mocks.env.GCS_BUCKET_NAME = "";
    const { getGcsBucket } = await import("./gcs");

    expect(() => getGcsBucket()).toThrow("GCS_BUCKET_NAME is required for social features");
  });
});
