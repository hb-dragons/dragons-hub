import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { describeRoute } from "hono-openapi";

const publicAssetsRoutes = new Hono();

const CLUBS_DIR = path.resolve(process.cwd(), "public/clubs");

publicAssetsRoutes.get(
  "/assets/clubs/:id{[0-9]+\\.webp}",
  describeRoute({
    description: "Get club logo image by clubId (webp)",
    tags: ["Public"],
    security: [],
    responses: {
      200: {
        description: "Club logo",
        content: { "image/webp": {} },
      },
      400: { description: "Invalid clubId" },
      404: { description: "Logo not found" },
    },
  }),
  async (c) => {
    const raw = c.req.param("id");
    const id = Number(raw.replace(/\.webp$/, ""));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid clubId" }, 400);
    }

    const resolved = path.join(CLUBS_DIR, `${id}.webp`);
    if (!existsSync(resolved)) {
      return c.json({ error: "Not found" }, 404);
    }

    const buf = await readFile(resolved);
    c.header("Content-Type", "image/webp");
    c.header("Cache-Control", "public, max-age=86400, immutable");
    return c.body(buf);
  },
);

export { publicAssetsRoutes };
