import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mock state ---

const { mockDb, mockGcs, mockSharp } = vi.hoisted(() => {
  // Builder chain mock for Drizzle - each method returns `this` for chaining,
  // and the chain is thenable so awaiting it returns mockResult.
  let mockResult: unknown[] = [];

  function makeChain() {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "from", "where", "orderBy", "insert", "values", "delete", "returning"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Make the chain thenable so `await db.select().from(...).orderBy(...)` resolves
    chain.then = (resolve: (v: unknown) => void) => resolve(mockResult);
    return chain;
  }

  const chain = makeChain();

  const mockDb = {
    chain,
    setResult(rows: unknown[]) {
      mockResult = rows;
    },
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(chain),
  };

  const mockGcs = {
    uploadToGcs: vi.fn().mockResolvedValue(undefined),
    downloadFromGcs: vi.fn().mockResolvedValue(Buffer.from("image-bytes")),
    deleteFromGcs: vi.fn().mockResolvedValue(undefined),
  };

  const mockSharpInstance = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  };

  const mockSharp = vi.fn().mockReturnValue(mockSharpInstance);
  (mockSharp as unknown as Record<string, unknown>)._instance = mockSharpInstance;

  return { mockDb, mockGcs, mockSharp };
});

// --- Module mocks ---

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        return mockDb[prop as keyof typeof mockDb];
      },
    },
  ),
}));

vi.mock("@dragons/db/schema", () => ({
  playerPhotos: { id: "id", createdAt: "createdAt", filename: "filename" },
}));

vi.mock("./gcs-storage.service", () => mockGcs);

vi.mock("sharp", () => ({ default: mockSharp }));

// --- Imports after mocks ---

import {
  listPlayerPhotos,
  getPlayerPhotoById,
  uploadPlayerPhoto,
  deletePlayerPhoto,
  getPlayerPhotoImage,
} from "./player-photo.service";

// --- Helpers ---

const samplePhoto = {
  id: 1,
  filename: "abc.png",
  originalName: "photo.png",
  width: 800,
  height: 600,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.setResult([]);
  // Re-wire select/insert/delete to return the chain after clearAllMocks
  mockDb.select.mockReturnValue(mockDb.chain);
  mockDb.insert.mockReturnValue(mockDb.chain);
  mockDb.delete.mockReturnValue(mockDb.chain);
  for (const key of ["from", "where", "orderBy", "values", "returning"]) {
    (mockDb.chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(mockDb.chain);
  }
  mockGcs.uploadToGcs.mockResolvedValue(undefined);
  mockGcs.downloadFromGcs.mockResolvedValue(Buffer.from("image-bytes"));
  mockGcs.deleteFromGcs.mockResolvedValue(undefined);
  mockSharp.mockReturnValue({ metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }) });
});

describe("listPlayerPhotos", () => {
  it("returns an array of records", async () => {
    mockDb.setResult([samplePhoto]);

    const result = await listPlayerPhotos();

    expect(result).toEqual([samplePhoto]);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("returns empty array when no records exist", async () => {
    mockDb.setResult([]);

    const result = await listPlayerPhotos();

    expect(result).toEqual([]);
  });

  it("calls orderBy on the query chain", async () => {
    mockDb.setResult([]);

    await listPlayerPhotos();

    expect(mockDb.chain.orderBy).toHaveBeenCalled();
  });
});

describe("getPlayerPhotoById", () => {
  it("returns the record when found", async () => {
    mockDb.setResult([samplePhoto]);

    const result = await getPlayerPhotoById(1);

    expect(result).toEqual(samplePhoto);
    expect(mockDb.chain.where).toHaveBeenCalled();
  });

  it("returns null when record is not found", async () => {
    mockDb.setResult([]);

    const result = await getPlayerPhotoById(999);

    expect(result).toBeNull();
  });
});

describe("uploadPlayerPhoto", () => {
  const validBuffer = Buffer.alloc(100);
  const validName = "player.png";
  const validType = "image/png";

  it("throws on invalid content type", async () => {
    await expect(uploadPlayerPhoto(validBuffer, validName, "image/gif")).rejects.toThrow(
      "Invalid file type: image/gif",
    );
  });

  it("throws when file exceeds max size", async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

    await expect(uploadPlayerPhoto(largeBuffer, validName, validType)).rejects.toThrow(
      "File too large",
    );
  });

  it("throws when sharp cannot read image dimensions", async () => {
    mockSharp.mockReturnValue({ metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }) });

    await expect(uploadPlayerPhoto(validBuffer, validName, validType)).rejects.toThrow(
      "Could not read image dimensions",
    );
  });

  it("throws when sharp returns width but not height", async () => {
    mockSharp.mockReturnValue({ metadata: vi.fn().mockResolvedValue({ width: 800, height: undefined }) });

    await expect(uploadPlayerPhoto(validBuffer, validName, validType)).rejects.toThrow(
      "Could not read image dimensions",
    );
  });

  it("uploads to GCS with correct path prefix", async () => {
    mockDb.setResult([samplePhoto]);

    await uploadPlayerPhoto(validBuffer, validName, validType);

    const [path, , type] = mockGcs.uploadToGcs.mock.calls[0]!;
    expect(path).toMatch(/^player-photos\//);
    expect(type).toBe("image/png");
  });

  it("preserves file extension from original name", async () => {
    mockDb.setResult([samplePhoto]);

    await uploadPlayerPhoto(validBuffer, "photo.webp", "image/webp");

    const [path] = mockGcs.uploadToGcs.mock.calls[0]!;
    expect(path).toMatch(/\.webp$/);
  });

  it("falls back to .png extension when original name has no extension", async () => {
    mockDb.setResult([samplePhoto]);

    await uploadPlayerPhoto(validBuffer, "photo", validType);

    const [path] = mockGcs.uploadToGcs.mock.calls[0]!;
    expect(path).toMatch(/\.png$/);
  });

  it("inserts record into DB and returns it", async () => {
    mockDb.setResult([samplePhoto]);

    const result = await uploadPlayerPhoto(validBuffer, validName, validType);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: validName,
        width: 800,
        height: 600,
      }),
    );
    expect(result).toEqual(samplePhoto);
  });

  it("accepts image/jpeg content type", async () => {
    mockDb.setResult([samplePhoto]);

    await expect(uploadPlayerPhoto(validBuffer, "photo.jpg", "image/jpeg")).resolves.toBeDefined();
  });

  it("accepts image/webp content type", async () => {
    mockDb.setResult([samplePhoto]);

    await expect(uploadPlayerPhoto(validBuffer, "photo.webp", "image/webp")).resolves.toBeDefined();
  });
});

describe("deletePlayerPhoto", () => {
  it("deletes from DB and then from GCS", async () => {
    mockDb.setResult([samplePhoto]);

    const result = await deletePlayerPhoto(1);

    expect(result).toEqual(samplePhoto);
    expect(mockGcs.deleteFromGcs).toHaveBeenCalledWith(`player-photos/${samplePhoto.filename}`);
  });

  it("calls deleteFromGcs with the correct path", async () => {
    const photo = { ...samplePhoto, filename: "xyz.png" };
    mockDb.setResult([photo]);

    await deletePlayerPhoto(1);

    expect(mockGcs.deleteFromGcs).toHaveBeenCalledWith("player-photos/xyz.png");
  });

  it("returns null and skips GCS delete when record not found", async () => {
    mockDb.setResult([]);

    const result = await deletePlayerPhoto(999);

    expect(result).toBeNull();
    expect(mockGcs.deleteFromGcs).not.toHaveBeenCalled();
  });
});

describe("getPlayerPhotoImage", () => {
  it("returns buffer from GCS", async () => {
    const imageData = Buffer.from("raw-image-data");
    mockGcs.downloadFromGcs.mockResolvedValue(imageData);

    const result = await getPlayerPhotoImage("abc.png");

    expect(result).toBe(imageData);
    expect(mockGcs.downloadFromGcs).toHaveBeenCalledWith("player-photos/abc.png");
  });

  it("constructs the correct GCS path", async () => {
    await getPlayerPhotoImage("some-uuid.webp");

    expect(mockGcs.downloadFromGcs).toHaveBeenCalledWith("player-photos/some-uuid.webp");
  });
});
