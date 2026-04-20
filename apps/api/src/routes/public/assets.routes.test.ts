import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
}));

import { publicAssetsRoutes } from "./assets.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicAssetsRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /assets/clubs/:id.webp", () => {
  it("returns 200 with webp body and cache header for valid clubId", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFile.mockResolvedValue(Buffer.from("fake-webp-bytes"));

    const res = await app.request("/assets/clubs/1017.webp");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, immutable",
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe("fake-webp-bytes");
  });

  it("returns 404 when logo file does not exist", async () => {
    mocks.existsSync.mockReturnValue(false);

    const res = await app.request("/assets/clubs/9999999.webp");

    expect(res.status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("returns 404 for non-numeric clubId", async () => {
    const res = await app.request("/assets/clubs/abc.webp");

    expect(res.status).toBe(404);
    expect(mocks.existsSync).not.toHaveBeenCalled();
  });

  it("returns 400 for zero clubId", async () => {
    const res = await app.request("/assets/clubs/0.webp");

    expect(res.status).toBe(400);
  });

  it("returns 404 for negative clubId", async () => {
    const res = await app.request("/assets/clubs/-5.webp");

    expect(res.status).toBe(404);
  });

  it("rejects path traversal attempts", async () => {
    const res = await app.request("/assets/clubs/..%2Fsecret.webp");

    expect(res.status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
