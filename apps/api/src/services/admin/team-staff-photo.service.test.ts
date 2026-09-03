import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGcs, mockSharp } = vi.hoisted(() => ({
  mockGcs: {
    uploadToGcs: vi.fn().mockResolvedValue(undefined),
    downloadFromGcs: vi.fn().mockResolvedValue(Buffer.from("image-bytes")),
    deleteFromGcs: vi.fn().mockResolvedValue(undefined),
  },
  mockSharp: vi.fn(),
}));

vi.mock("../social/gcs-storage.service", () => mockGcs);
vi.mock("sharp", () => ({ default: mockSharp }));

import {
  PortraitRejected,
  storeStaffPortrait,
  readStaffPortrait,
  deleteStaffPortrait,
  staffPortraitContentType,
  MAX_PORTRAIT_BYTES,
  MAX_PORTRAIT_DIMENSION,
} from "./team-staff-photo.service";

/** A sharp double that reports readable dimensions and returns a known buffer. */
function sharpDouble(overrides: Partial<{ width: number; height: number }> = {}) {
  const resize = vi.fn().mockReturnThis();
  const instance = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 900, ...overrides }),
    resize,
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("normalized")),
  };
  mockSharp.mockReturnValue(instance);
  return { instance, resize };
}

const validBuffer = Buffer.alloc(100);

beforeEach(() => {
  vi.clearAllMocks();
  mockGcs.uploadToGcs.mockResolvedValue(undefined);
  mockGcs.downloadFromGcs.mockResolvedValue(Buffer.from("image-bytes"));
  mockGcs.deleteFromGcs.mockResolvedValue(undefined);
  sharpDouble();
});

describe("storeStaffPortrait", () => {
  it("rejects a content type that is not one of the three image types", async () => {
    await expect(storeStaffPortrait(validBuffer, "image/gif")).rejects.toMatchObject({
      reason: "unsupported_type",
    });
    expect(mockGcs.uploadToGcs).not.toHaveBeenCalled();
  });

  it("rejects a file over the size bound", async () => {
    const oversized = Buffer.alloc(MAX_PORTRAIT_BYTES + 1);

    await expect(storeStaffPortrait(oversized, "image/png")).rejects.toMatchObject({
      reason: "too_large",
    });
    expect(mockGcs.uploadToGcs).not.toHaveBeenCalled();
  });

  it("rejects bytes sharp cannot read dimensions from", async () => {
    sharpDouble({ width: undefined as unknown as number });

    await expect(storeStaffPortrait(validBuffer, "image/png")).rejects.toMatchObject({
      reason: "unreadable",
    });
  });

  it("rejects when sharp reports a width but no height", async () => {
    sharpDouble({ height: undefined as unknown as number });

    await expect(storeStaffPortrait(validBuffer, "image/png")).rejects.toMatchObject({
      reason: "unreadable",
    });
  });

  it("rejects when sharp throws on a file that is not really an image", async () => {
    mockSharp.mockReturnValue({
      metadata: vi.fn().mockRejectedValue(new Error("Input buffer contains unsupported image")),
    });

    await expect(storeStaffPortrait(validBuffer, "image/png")).rejects.toBeInstanceOf(
      PortraitRejected,
    );
  });

  it("bounds the longest edge without enlarging a smaller portrait", async () => {
    const { resize } = sharpDouble({ width: 4000, height: 6000 });

    await storeStaffPortrait(validBuffer, "image/png");

    expect(resize).toHaveBeenCalledWith(MAX_PORTRAIT_DIMENSION, MAX_PORTRAIT_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });
  });

  it("stores the normalized bytes under the staff prefix and returns the object name", async () => {
    const filename = await storeStaffPortrait(validBuffer, "image/png");

    const [path, stored, type] = mockGcs.uploadToGcs.mock.calls[0]!;
    expect(path).toBe(`team-staff-photos/${filename}`);
    expect(stored).toEqual(Buffer.from("normalized"));
    expect(type).toBe("image/png");
    expect(filename).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it("names the object from the validated content type, never from a caller filename", async () => {
    const jpeg = await storeStaffPortrait(validBuffer, "image/jpeg");
    const webp = await storeStaffPortrait(validBuffer, "image/webp");

    expect(jpeg).toMatch(/\.jpg$/);
    expect(webp).toMatch(/\.webp$/);
  });
});

describe("readStaffPortrait", () => {
  it("downloads the object under the staff prefix", async () => {
    const bytes = Buffer.from("raw");
    mockGcs.downloadFromGcs.mockResolvedValue(bytes);

    await expect(readStaffPortrait("abc.webp")).resolves.toBe(bytes);
    expect(mockGcs.downloadFromGcs).toHaveBeenCalledWith("team-staff-photos/abc.webp");
  });
});

describe("deleteStaffPortrait", () => {
  it("deletes the object under the staff prefix", async () => {
    await deleteStaffPortrait("abc.jpg");

    expect(mockGcs.deleteFromGcs).toHaveBeenCalledWith("team-staff-photos/abc.jpg");
  });
});

describe("staffPortraitContentType", () => {
  it.each([
    ["abc.png", "image/png"],
    ["abc.jpg", "image/jpeg"],
    ["abc.webp", "image/webp"],
    // Only the three names the store itself writes exist in the bucket, so an
    // unknown extension is a bug, not user input — serve it as the default.
    ["abc.bin", "image/png"],
  ])("maps %s to %s", (filename, expected) => {
    expect(staffPortraitContentType(filename)).toBe(expected);
  });
});
