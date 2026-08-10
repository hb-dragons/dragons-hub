import { afterEach, describe, expect, it, vi } from "vitest";

import { migrateMedia } from "./media";
import { createUpload } from "./payload-client";
import { downloadFile, fetchUploads } from "./strapi";

vi.mock("./payload-client", () => ({ createUpload: vi.fn() }));
vi.mock("./strapi", () => ({ fetchUploads: vi.fn(), downloadFile: vi.fn() }));

const fetchUploadsMock = vi.mocked(fetchUploads);
const downloadFileMock = vi.mocked(downloadFile);
const createUploadMock = vi.mocked(createUpload);

function strapiFile(id: number, url: string, name = "Anzeige Name.png") {
  return { id, url, name, mime: "image/png", size: 1, alternativeText: `alt ${id}` };
}

afterEach(() => {
  // clearAllMocks as well as restoreAllMocks: restore only undoes spies, so
  // the vi.mock'd module functions above would otherwise carry their call
  // history from one test into the next.
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("migrateMedia", () => {
  it("returns the strapi-id -> payload-id map every later collection needs", async () => {
    // This map is the spine of the whole migration: every header image, team
    // photo and gallery entry is resolved through it, so a wrong pairing here
    // mis-attaches images across the entire site.
    fetchUploadsMock.mockResolvedValue([
      strapiFile(7, "/uploads/a_abc.png"),
      strapiFile(9, "/uploads/b_def.png"),
    ]);
    downloadFileMock.mockResolvedValue(new Blob(["x"]));
    createUploadMock.mockResolvedValueOnce({ id: 42 }).mockResolvedValueOnce({ id: 43 });
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await migrateMedia()).toEqual(
      new Map([
        [7, 42],
        [9, 43],
      ]),
    );
  });

  it("uploads under the hashed basename from the URL, not the display name", async () => {
    // Strapi hashes filenames on upload, so the URL basename is already safe;
    // file.name is the human label and can carry spaces and umlauts.
    fetchUploadsMock.mockResolvedValue([strapiFile(7, "/uploads/logo_a1b2.png", "Logo Groß.png")]);
    downloadFileMock.mockResolvedValue(new Blob(["x"]));
    createUploadMock.mockResolvedValue({ id: 42 });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await migrateMedia();

    expect(createUploadMock).toHaveBeenCalledWith(
      "media",
      expect.any(Blob),
      "logo_a1b2.png",
      { alt: "alt 7" },
    );
  });

  it("falls back to the display name when the URL has no basename", async () => {
    fetchUploadsMock.mockResolvedValue([strapiFile(7, "", "Fallback.png")]);
    downloadFileMock.mockResolvedValue(new Blob(["x"]));
    createUploadMock.mockResolvedValue({ id: 42 });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await migrateMedia();

    expect(createUploadMock).toHaveBeenCalledWith("media", expect.any(Blob), "Fallback.png", {
      alt: "alt 7",
    });
  });

  it("uploads sequentially, so 73 files cannot stampede a scale-to-zero container", async () => {
    fetchUploadsMock.mockResolvedValue([
      strapiFile(1, "/uploads/a.png"),
      strapiFile(2, "/uploads/b.png"),
      strapiFile(3, "/uploads/c.png"),
    ]);
    downloadFileMock.mockResolvedValue(new Blob(["x"]));
    vi.spyOn(console, "log").mockImplementation(() => {});

    let inFlight = 0;
    let peak = 0;
    createUploadMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { id: 1 };
    });

    await migrateMedia();

    expect(peak).toBe(1);
  });

  it("aborts the run when one file cannot be downloaded", async () => {
    // Better to stop than to finish with a map that silently omits an id —
    // every relation resolving through it would then write null.
    fetchUploadsMock.mockResolvedValue([strapiFile(7, "/uploads/a.png")]);
    downloadFileMock.mockRejectedValue(new Error("strapi download: HTTP 404"));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(migrateMedia()).rejects.toThrow("strapi download: HTTP 404");
  });

  it("returns an empty map when Strapi has no uploads", async () => {
    fetchUploadsMock.mockResolvedValue([]);
    expect(await migrateMedia()).toEqual(new Map());
    expect(createUploadMock).not.toHaveBeenCalled();
  });
});
