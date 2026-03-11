import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listPlayerPhotos: vi.fn(),
  uploadPlayerPhoto: vi.fn(),
  deletePlayerPhoto: vi.fn(),
  getPlayerPhotoById: vi.fn(),
  getPlayerPhotoImage: vi.fn(),
  listBackgrounds: vi.fn(),
  uploadBackground: vi.fn(),
  deleteBackground: vi.fn(),
  setDefaultBackground: vi.fn(),
  getBackgroundById: vi.fn(),
  getBackgroundImage: vi.fn(),
  getWeekendMatches: vi.fn(),
}));

vi.mock("../../services/social/player-photo.service", () => ({
  listPlayerPhotos: mocks.listPlayerPhotos,
  uploadPlayerPhoto: mocks.uploadPlayerPhoto,
  deletePlayerPhoto: mocks.deletePlayerPhoto,
  getPlayerPhotoById: mocks.getPlayerPhotoById,
  getPlayerPhotoImage: mocks.getPlayerPhotoImage,
}));

vi.mock("../../services/social/background.service", () => ({
  listBackgrounds: mocks.listBackgrounds,
  uploadBackground: mocks.uploadBackground,
  deleteBackground: mocks.deleteBackground,
  setDefaultBackground: mocks.setDefaultBackground,
  getBackgroundById: mocks.getBackgroundById,
  getBackgroundImage: mocks.getBackgroundImage,
}));

vi.mock("../../services/social/match-social.service", () => ({
  getWeekendMatches: mocks.getWeekendMatches,
}));

// --- Imports (after mocks) ---

import { socialRoutes } from "./social.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono();
app.onError(errorHandler);
app.route("/", socialRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /player-photos", () => {
  it("returns 200 with photo list", async () => {
    const photos = [{ id: 1, filename: "abc.png" }];
    mocks.listPlayerPhotos.mockResolvedValue(photos);

    const res = await app.request("/player-photos");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(photos);
    expect(mocks.listPlayerPhotos).toHaveBeenCalledOnce();
  });
});

describe("GET /player-photos/:id/image", () => {
  it("returns 200 with image buffer when photo exists", async () => {
    mocks.getPlayerPhotoById.mockResolvedValue({ id: 1, filename: "abc.png" });
    mocks.getPlayerPhotoImage.mockResolvedValue(Buffer.from("image-data"));

    const res = await app.request("/player-photos/1/image");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(mocks.getPlayerPhotoById).toHaveBeenCalledWith(1);
    expect(mocks.getPlayerPhotoImage).toHaveBeenCalledWith("abc.png");
  });

  it("returns correct content type for JPEG photos", async () => {
    mocks.getPlayerPhotoById.mockResolvedValue({ id: 2, filename: "abc.jpg" });
    mocks.getPlayerPhotoImage.mockResolvedValue(Buffer.from("image-data"));

    const res = await app.request("/player-photos/2/image");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns correct content type for WebP photos", async () => {
    mocks.getPlayerPhotoById.mockResolvedValue({ id: 3, filename: "abc.webp" });
    mocks.getPlayerPhotoImage.mockResolvedValue(Buffer.from("image-data"));

    const res = await app.request("/player-photos/3/image");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("returns 404 when photo not found", async () => {
    mocks.getPlayerPhotoById.mockResolvedValue(null);

    const res = await app.request("/player-photos/999/image");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: "Not found" });
    expect(mocks.getPlayerPhotoImage).not.toHaveBeenCalled();
  });
});

describe("POST /player-photos", () => {
  it("returns 201 with record on successful upload", async () => {
    const record = { id: 1, filename: "test.png" };
    mocks.uploadPlayerPhoto.mockResolvedValue(record);

    const formData = new FormData();
    formData.append("file", new File(["content"], "test.png", { type: "image/png" }));

    const res = await app.request("/player-photos", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(record);
  });

  it("returns 400 when no file provided", async () => {
    const formData = new FormData();

    const res = await app.request("/player-photos", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "File is required" });
  });

  it("returns 400 when service throws validation error", async () => {
    mocks.uploadPlayerPhoto.mockRejectedValue(new Error("Invalid file type"));

    const formData = new FormData();
    formData.append("file", new File(["content"], "test.gif", { type: "image/gif" }));

    const res = await app.request("/player-photos", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "Invalid file type" });
  });
});

describe("DELETE /player-photos/:id", () => {
  it("returns 200 on successful delete", async () => {
    mocks.deletePlayerPhoto.mockResolvedValue({ id: 1 });

    const res = await app.request("/player-photos/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deletePlayerPhoto).toHaveBeenCalledWith(1);
  });

  it("returns 404 when photo not found", async () => {
    mocks.deletePlayerPhoto.mockResolvedValue(null);

    const res = await app.request("/player-photos/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: "Not found" });
  });
});

describe("GET /backgrounds", () => {
  it("returns 200 with background list", async () => {
    const backgrounds = [{ id: 1, filename: "bg.png", isDefault: true }];
    mocks.listBackgrounds.mockResolvedValue(backgrounds);

    const res = await app.request("/backgrounds");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(backgrounds);
    expect(mocks.listBackgrounds).toHaveBeenCalledOnce();
  });
});

describe("GET /backgrounds/:id/image", () => {
  it("returns 200 with image buffer when background exists", async () => {
    mocks.getBackgroundById.mockResolvedValue({ id: 1, filename: "bg.png" });
    mocks.getBackgroundImage.mockResolvedValue(Buffer.from("bg-data"));

    const res = await app.request("/backgrounds/1/image");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(mocks.getBackgroundById).toHaveBeenCalledWith(1);
    expect(mocks.getBackgroundImage).toHaveBeenCalledWith("bg.png");
  });

  it("returns 404 when background not found", async () => {
    mocks.getBackgroundById.mockResolvedValue(null);

    const res = await app.request("/backgrounds/999/image");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: "Not found" });
    expect(mocks.getBackgroundImage).not.toHaveBeenCalled();
  });
});

describe("POST /backgrounds", () => {
  it("returns 201 with record on successful upload", async () => {
    const record = { id: 2, filename: "bg.png", isDefault: false };
    mocks.uploadBackground.mockResolvedValue(record);

    const formData = new FormData();
    formData.append("file", new File(["content"], "bg.png", { type: "image/png" }));

    const res = await app.request("/backgrounds", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(record);
  });

  it("returns 400 when no file provided", async () => {
    const formData = new FormData();

    const res = await app.request("/backgrounds", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "File is required" });
  });

  it("returns 400 when service throws validation error", async () => {
    mocks.uploadBackground.mockRejectedValue(new Error("Image too small"));

    const formData = new FormData();
    formData.append("file", new File(["content"], "tiny.png", { type: "image/png" }));

    const res = await app.request("/backgrounds", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "Image too small" });
  });
});

describe("DELETE /backgrounds/:id", () => {
  it("returns 200 on successful delete", async () => {
    mocks.deleteBackground.mockResolvedValue({ id: 2 });

    const res = await app.request("/backgrounds/2", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteBackground).toHaveBeenCalledWith(2);
  });

  it("returns 404 when background not found", async () => {
    mocks.deleteBackground.mockResolvedValue(null);

    const res = await app.request("/backgrounds/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: "Not found" });
  });
});

describe("PATCH /backgrounds/:id/default", () => {
  it("returns 200 on success", async () => {
    mocks.getBackgroundById.mockResolvedValue({ id: 3, filename: "bg.png" });
    mocks.setDefaultBackground.mockResolvedValue(undefined);

    const res = await app.request("/backgrounds/3/default", { method: "PATCH" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.setDefaultBackground).toHaveBeenCalledWith(3);
  });

  it("returns 404 if background does not exist", async () => {
    mocks.getBackgroundById.mockResolvedValue(null);

    const res = await app.request("/backgrounds/999/default", { method: "PATCH" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: "Not found" });
    expect(mocks.setDefaultBackground).not.toHaveBeenCalled();
  });
});

describe("GET /matches", () => {
  it("returns 200 with match list for valid params", async () => {
    const matchList = [{ id: 1, teamLabel: "Dragons U16", opponent: "Tigers" }];
    mocks.getWeekendMatches.mockResolvedValue(matchList);

    const res = await app.request("/matches?type=results&week=10&year=2026");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(matchList);
    expect(mocks.getWeekendMatches).toHaveBeenCalledWith({ type: "results", week: 10, year: 2026 });
  });

  it("returns 200 for preview type", async () => {
    mocks.getWeekendMatches.mockResolvedValue([]);

    const res = await app.request("/matches?type=preview&week=5&year=2025");

    expect(res.status).toBe(200);
    expect(mocks.getWeekendMatches).toHaveBeenCalledWith({ type: "preview", week: 5, year: 2025 });
  });

  it("returns 400 when required params are missing", async () => {
    const res = await app.request("/matches");

    expect(res.status).toBe(400);
    expect(mocks.getWeekendMatches).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid type", async () => {
    const res = await app.request("/matches?type=invalid&week=10&year=2026");

    expect(res.status).toBe(400);
    expect(mocks.getWeekendMatches).not.toHaveBeenCalled();
  });

  it("returns 400 for out-of-range week", async () => {
    const res = await app.request("/matches?type=results&week=54&year=2026");

    expect(res.status).toBe(400);
    expect(mocks.getWeekendMatches).not.toHaveBeenCalled();
  });
});
