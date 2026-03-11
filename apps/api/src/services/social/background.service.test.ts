import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockSharp, mockGcs, txMock } = vi.hoisted(() => {
  const whereChain = { where: vi.fn() };
  const setChain = { set: vi.fn().mockReturnValue(whereChain) };
  const updateChain = { update: vi.fn().mockReturnValue(setChain) };

  const txMock = {
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  };

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn().mockReturnValue(setChain),
    transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
  };

  const mockSharpInstance = {
    metadata: vi.fn(),
    resize: vi.fn(),
    png: vi.fn(),
    toBuffer: vi.fn(),
  };
  mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
  mockSharpInstance.png.mockReturnValue(mockSharpInstance);

  const mockSharp = vi.fn().mockReturnValue(mockSharpInstance);

  const mockGcs = {
    uploadToGcs: vi.fn().mockResolvedValue(undefined),
    downloadFromGcs: vi.fn().mockResolvedValue(Buffer.from("image-data")),
    deleteFromGcs: vi.fn().mockResolvedValue(undefined),
  };

  // Suppress unused variable warning
  void updateChain;
  void whereChain;

  return { mockDb, mockSharp, mockGcs, txMock };
});

vi.mock("../../config/database", () => ({ db: mockDb }));
vi.mock("@dragons/db/schema", () => ({
  socialBackgrounds: { id: "id", isDefault: "isDefault", createdAt: "createdAt" },
}));
vi.mock("./gcs-storage.service", () => mockGcs);
vi.mock("sharp", () => ({ default: mockSharp }));

import {
  listBackgrounds,
  getBackgroundById,
  uploadBackground,
  deleteBackground,
  setDefaultBackground,
  getBackgroundImage,
} from "./background.service";

const FAKE_RECORD = {
  id: 1,
  filename: "abc.png",
  originalName: "photo.png",
  width: 1080,
  height: 1080,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeSelectChain(result: unknown[]) {
  const whereChain = { where: vi.fn().mockResolvedValue(result) };
  const fromChain = {
    from: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(result),
      where: whereChain.where,
    }),
  };
  return fromChain;
}

function makeInsertChain(result: unknown[]) {
  const returningChain = { returning: vi.fn().mockResolvedValue(result) };
  const valueChain = { values: vi.fn().mockReturnValue(returningChain) };
  return { into: vi.fn(), values: valueChain.values };
}

function makeDeleteChain(result: unknown[]) {
  const returningChain = { returning: vi.fn().mockResolvedValue(result) };
  const whereChain = { where: vi.fn().mockReturnValue(returningChain) };
  return { from: vi.fn(), where: whereChain.where };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset txMock's update chain for each test
  txMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  });
});

describe("listBackgrounds", () => {
  it("returns array of backgrounds ordered by createdAt desc", async () => {
    const selectChain = makeSelectChain([FAKE_RECORD]);
    mockDb.select.mockReturnValue(selectChain);
    const result = await listBackgrounds();
    expect(mockDb.select).toHaveBeenCalled();
    expect(result).toEqual([FAKE_RECORD]);
  });
});

describe("getBackgroundById", () => {
  it("returns the matching record", async () => {
    const selectChain = makeSelectChain([FAKE_RECORD]);
    mockDb.select.mockReturnValue(selectChain);
    const result = await getBackgroundById(1);
    expect(result).toEqual(FAKE_RECORD);
  });

  it("returns null when record is not found", async () => {
    const selectChain = makeSelectChain([]);
    mockDb.select.mockReturnValue(selectChain);
    const result = await getBackgroundById(999);
    expect(result).toBeNull();
  });
});

describe("uploadBackground", () => {
  function setupSharp(width: number, height: number) {
    const instance = mockSharp.getMockImplementation()?.() ?? mockSharp();
    vi.mocked(mockSharp).mockReturnValue(instance);
    instance.metadata.mockResolvedValue({ width, height });
    instance.resize.mockReturnValue(instance);
    instance.png.mockReturnValue(instance);
    instance.toBuffer.mockResolvedValue(Buffer.from("resized"));
  }

  it("throws for invalid content type", async () => {
    await expect(uploadBackground(Buffer.from("x"), "file.bmp", "image/bmp")).rejects.toThrow(
      "Invalid file type: image/bmp",
    );
  });

  it("throws when file exceeds max size", async () => {
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(uploadBackground(bigBuffer, "big.png", "image/png")).rejects.toThrow("File too large");
  });

  it("throws when image dimensions cannot be read", async () => {
    const instance = {
      metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
      resize: vi.fn(),
      png: vi.fn(),
      toBuffer: vi.fn(),
    };
    vi.mocked(mockSharp).mockReturnValue(instance as ReturnType<typeof mockSharp>);
    await expect(uploadBackground(Buffer.from("x"), "img.png", "image/png")).rejects.toThrow(
      "Could not read image dimensions",
    );
  });

  it("throws when image is smaller than 1080x1080", async () => {
    const instance = {
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      resize: vi.fn(),
      png: vi.fn(),
      toBuffer: vi.fn(),
    };
    vi.mocked(mockSharp).mockReturnValue(instance as ReturnType<typeof mockSharp>);
    await expect(uploadBackground(Buffer.from("x"), "small.png", "image/png")).rejects.toThrow(
      "Image must be at least 1080x1080px. Got 800x600",
    );
  });

  it("also throws when only one dimension is too small", async () => {
    const instance = {
      metadata: vi.fn().mockResolvedValue({ width: 1080, height: 500 }),
      resize: vi.fn(),
      png: vi.fn(),
      toBuffer: vi.fn(),
    };
    vi.mocked(mockSharp).mockReturnValue(instance as ReturnType<typeof mockSharp>);
    await expect(uploadBackground(Buffer.from("x"), "img.png", "image/jpeg")).rejects.toThrow(
      "Image must be at least 1080x1080px. Got 1080x500",
    );
  });

  it("resizes to 1080x1080, uploads to GCS, inserts DB record, and returns it", async () => {
    setupSharp(1200, 1200);
    const insertChain = makeInsertChain([FAKE_RECORD]);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await uploadBackground(Buffer.from("valid"), "photo.png", "image/png");

    expect(mockGcs.uploadToGcs).toHaveBeenCalledWith(
      expect.stringMatching(/^backgrounds\/.+\.png$/),
      expect.any(Buffer),
      "image/png",
    );
    expect(mockDb.insert).toHaveBeenCalled();
    expect(result).toEqual(FAKE_RECORD);
  });

  it("accepts jpeg and webp content types", async () => {
    setupSharp(1080, 1080);
    const insertChain = makeInsertChain([FAKE_RECORD]);
    mockDb.insert.mockReturnValue(insertChain);

    await expect(uploadBackground(Buffer.from("x"), "img.jpg", "image/jpeg")).resolves.toBeDefined();

    setupSharp(1080, 1080);
    mockDb.insert.mockReturnValue(makeInsertChain([FAKE_RECORD]));
    await expect(uploadBackground(Buffer.from("x"), "img.webp", "image/webp")).resolves.toBeDefined();
  });
});

describe("deleteBackground", () => {
  it("deletes DB record and GCS file, returns the deleted record", async () => {
    const deleteChain = makeDeleteChain([FAKE_RECORD]);
    mockDb.delete.mockReturnValue(deleteChain);

    const result = await deleteBackground(1);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockGcs.deleteFromGcs).toHaveBeenCalledWith(`backgrounds/${FAKE_RECORD.filename}`);
    expect(result).toEqual(FAKE_RECORD);
  });

  it("returns null when record does not exist", async () => {
    const deleteChain = makeDeleteChain([]);
    mockDb.delete.mockReturnValue(deleteChain);

    const result = await deleteBackground(999);

    expect(mockGcs.deleteFromGcs).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe("setDefaultBackground", () => {
  it("uses a transaction to unset all defaults then set the target", async () => {
    const setWhere1 = vi.fn().mockResolvedValue([]);
    const set1 = vi.fn().mockReturnValue({ where: setWhere1 });
    const setWhere2 = vi.fn().mockResolvedValue([]);
    const set2 = vi.fn().mockReturnValue({ where: setWhere2 });

    txMock.update
      .mockReturnValueOnce({ set: set1 })
      .mockReturnValueOnce({ set: set2 });

    await setDefaultBackground(5);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(txMock.update).toHaveBeenCalledTimes(2);
    // First call: unset all defaults
    expect(set1).toHaveBeenCalledWith({ isDefault: false });
    // Second call: set the target as default
    expect(set2).toHaveBeenCalledWith({ isDefault: true });
  });
});

describe("getBackgroundImage", () => {
  it("downloads and returns the buffer from GCS", async () => {
    const buffer = Buffer.from("image-bytes");
    mockGcs.downloadFromGcs.mockResolvedValue(buffer);

    const result = await getBackgroundImage("abc.png");

    expect(mockGcs.downloadFromGcs).toHaveBeenCalledWith("backgrounds/abc.png");
    expect(result).toBe(buffer);
  });
});
