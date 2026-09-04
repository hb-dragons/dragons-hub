import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockStorage, mockSharp, bucket, file, save, resize } = vi.hoisted(() => {
  const save = vi.fn().mockResolvedValue(undefined);
  const file = vi.fn(() => ({ save }));
  const bucket = vi.fn(() => ({ file }));
  const resize = vi.fn().mockReturnThis();
  return {
    save,
    file,
    bucket,
    resize,
    // A real function, not an arrow: `new Storage()` needs a constructor.
    mockStorage: vi.fn(function () {
      return { bucket };
    }),
    mockSharp: vi.fn(() => ({ resize, toBuffer: vi.fn().mockResolvedValue(Buffer.from("normalized")) })),
  };
});

vi.mock("@google-cloud/storage", () => ({ Storage: mockStorage }));
vi.mock("sharp", () => ({ default: mockSharp }));

import { MAX_PORTRAIT_DIMENSION, openBucket, storePortrait } from "./storage";
import type { Bucket } from "@google-cloud/storage";

describe("openBucket", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens the named bucket on Application Default Credentials", () => {
    vi.stubEnv("GCS_BUCKET_NAME", "dragons-assets");

    openBucket();

    expect(mockStorage).toHaveBeenCalledWith();
    expect(bucket).toHaveBeenCalledWith("dragons-assets");
  });

  it("throws by name when GCS_BUCKET_NAME is missing", () => {
    vi.stubEnv("GCS_BUCKET_NAME", "");

    expect(() => openBucket()).toThrow("GCS_BUCKET_NAME is not set");
  });
});

describe("storePortrait", () => {
  const target = { file } as unknown as Bucket;
  const bytes = Buffer.from("original");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds the longest edge without enlarging a smaller portrait", async () => {
    await storePortrait(target, bytes, "image/jpeg");

    expect(mockSharp).toHaveBeenCalledWith(bytes);
    expect(resize).toHaveBeenCalledWith(MAX_PORTRAIT_DIMENSION, MAX_PORTRAIT_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });
  });

  it("stores the normalised bytes under the staff prefix with a fresh uuid name", async () => {
    const filename = await storePortrait(target, bytes, "image/jpeg");

    expect(filename).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(file).toHaveBeenCalledWith(`team-staff-photos/${filename}`);
    expect(save).toHaveBeenCalledWith(Buffer.from("normalized"), {
      metadata: { contentType: "image/jpeg" },
      resumable: false,
    });
  });

  it("names the object from the content type", async () => {
    expect(await storePortrait(target, bytes, "image/webp")).toMatch(/\.webp$/);
    expect(await storePortrait(target, bytes, "image/png")).toMatch(/\.png$/);
  });

  it("gives every copy its own name", async () => {
    const first = await storePortrait(target, bytes, "image/jpeg");
    const second = await storePortrait(target, bytes, "image/jpeg");

    expect(first).not.toBe(second);
  });

  it("refuses a type the hub does not store before touching sharp or the bucket", async () => {
    await expect(storePortrait(target, bytes, "image/gif")).rejects.toThrow(/image\/gif/);
    expect(mockSharp).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
