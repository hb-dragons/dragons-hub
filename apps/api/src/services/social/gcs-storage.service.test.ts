import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFile, mockBucket } = vi.hoisted(() => {
  const mockFile = {
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from("image-data")]),
  };
  const mockBucket = { file: vi.fn().mockReturnValue(mockFile) };
  return { mockFile, mockBucket };
});

vi.mock("../../config/gcs", () => ({
  getGcsBucket: vi.fn().mockReturnValue(mockBucket),
}));

import { uploadToGcs, downloadFromGcs, deleteFromGcs } from "./gcs-storage.service";

describe("gcs-storage.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads buffer to correct path", async () => {
    const buffer = Buffer.from("test");
    await uploadToGcs("player-photos/abc.png", buffer, "image/png");
    expect(mockBucket.file).toHaveBeenCalledWith("player-photos/abc.png");
    expect(mockFile.save).toHaveBeenCalledWith(buffer, { metadata: { contentType: "image/png" }, resumable: false });
  });

  it("downloads buffer", async () => {
    mockBucket.file.mockReturnValue(mockFile);
    const result = await downloadFromGcs("player-photos/abc.png");
    expect(result).toBeInstanceOf(Buffer);
  });

  it("deletes file", async () => {
    mockBucket.file.mockReturnValue(mockFile);
    await deleteFromGcs("player-photos/abc.png");
    expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
