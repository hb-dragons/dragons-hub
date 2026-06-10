import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  socialMatchesQuerySchema,
  socialIdParamSchema,
  socialGenerateBodySchema,
} from "@dragons/contracts";
import {
  listPlayerPhotos,
  uploadPlayerPhoto,
  deletePlayerPhoto,
  getPlayerPhotoById,
  getPlayerPhotoImage,
} from "../../services/social/player-photo.service";
import {
  listBackgrounds,
  uploadBackground,
  deleteBackground,
  setDefaultBackground,
  getBackgroundById,
  getBackgroundImage,
} from "../../services/social/background.service";
import { getWeekendMatches } from "../../services/social/match-social.service";
import { generatePostImage } from "../../services/social/social-image.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { logger as rootLogger } from "../../config/logger";
import type { AppEnv } from "../../types";

const socialRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

// --- Matches ---

socialRoutes.get(
  "/matches",
  settingsUpdate,
  validator("query", socialMatchesQuerySchema, validationHook),
  describeRoute({
    description: "Get weekend matches for social post generation",
    tags: ["Social"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const matches = await getWeekendMatches(query);
    return c.json(matches);
  },
);

// --- Player Photos ---

socialRoutes.get(
  "/player-photos",
  settingsUpdate,
  describeRoute({
    description: "List all player photos",
    tags: ["Social"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const photos = await listPlayerPhotos();
    return c.json(photos);
  },
);

socialRoutes.get(
  "/player-photos/:id/image",
  settingsUpdate,
  validator("param", socialIdParamSchema, validationHook),
  describeRoute({
    description: "Get player photo image by ID",
    tags: ["Social"],
    responses: {
      200: { description: "Image" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const photo = await getPlayerPhotoById(id);
    if (!photo) return c.json({ error: "Not found" }, 404);
    const buffer = await getPlayerPhotoImage(photo.filename);
    const ext = photo.filename.split(".").pop()?.toLowerCase();
    const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);

socialRoutes.post(
  "/player-photos",
  settingsUpdate,
  describeRoute({
    description: "Upload a player photo",
    tags: ["Social"],
    responses: {
      201: { description: "Created" },
      400: { description: "Invalid file" },
    },
  }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) return c.json({ error: "File is required" }, 400);
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const record = await uploadPlayerPhoto(buffer, file.name, file.type);
      return c.json(record, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Upload failed" }, 400);
    }
  },
);

socialRoutes.delete(
  "/player-photos/:id",
  settingsUpdate,
  validator("param", socialIdParamSchema, validationHook),
  describeRoute({
    description: "Delete a player photo",
    tags: ["Social"],
    responses: {
      200: { description: "Deleted" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const record = await deletePlayerPhoto(id);
    if (!record) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  },
);

// --- Backgrounds ---

socialRoutes.get(
  "/backgrounds",
  settingsUpdate,
  describeRoute({
    description: "List all backgrounds",
    tags: ["Social"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const backgrounds = await listBackgrounds();
    return c.json(backgrounds);
  },
);

socialRoutes.get(
  "/backgrounds/:id/image",
  settingsUpdate,
  validator("param", socialIdParamSchema, validationHook),
  describeRoute({
    description: "Get background image by ID",
    tags: ["Social"],
    responses: {
      200: { description: "Image" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const bg = await getBackgroundById(id);
    if (!bg) return c.json({ error: "Not found" }, 404);
    const buffer = await getBackgroundImage(bg.filename);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);

socialRoutes.post(
  "/backgrounds",
  settingsUpdate,
  describeRoute({
    description: "Upload a background image",
    tags: ["Social"],
    responses: {
      201: { description: "Created" },
      400: { description: "Invalid file" },
    },
  }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) return c.json({ error: "File is required" }, 400);
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const record = await uploadBackground(buffer, file.name, file.type);
      return c.json(record, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Upload failed" }, 400);
    }
  },
);

socialRoutes.delete(
  "/backgrounds/:id",
  settingsUpdate,
  validator("param", socialIdParamSchema, validationHook),
  describeRoute({
    description: "Delete a background",
    tags: ["Social"],
    responses: {
      200: { description: "Deleted" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const record = await deleteBackground(id);
    if (!record) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  },
);

socialRoutes.patch(
  "/backgrounds/:id/default",
  settingsUpdate,
  validator("param", socialIdParamSchema, validationHook),
  describeRoute({
    description: "Set a background as the default",
    tags: ["Social"],
    responses: {
      200: { description: "Success" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const bg = await getBackgroundById(id);
    if (!bg) return c.json({ error: "Not found" }, 404);
    await setDefaultBackground(id);
    return c.json({ success: true });
  },
);

// --- Generate ---

socialRoutes.post(
  "/generate",
  settingsUpdate,
  validator("json", socialGenerateBodySchema, validationHook),
  describeRoute({
    description: "Generate a social media post image",
    tags: ["Social"],
    responses: {
      200: { description: "PNG image" },
      400: { description: "Invalid request or no valid matches" },
      404: { description: "Player photo or background not found" },
      500: { description: "Image generation failed" },
    },
  }),
  async (c) => {
    const { type, calendarWeek, year, matches: matchInputs, playerPhotoId, backgroundId, playerPosition } = c.req.valid("json");

    const photo = await getPlayerPhotoById(playerPhotoId);
    if (!photo) return c.json({ error: "Player photo not found" }, 404);

    const bg = await getBackgroundById(backgroundId);
    if (!bg) return c.json({ error: "Background not found" }, 404);

    const weekMatches = await getWeekendMatches({ type, week: calendarWeek, year });
    const orderedMatches = matchInputs
      .sort((a, b) => a.order - b.order)
      .map((input) => weekMatches.find((m) => m.id === input.matchId))
      .filter((m): m is NonNullable<typeof m> => m != null)
      .map((m) => ({
        teamLabel: m.teamLabel,
        opponent: m.opponent,
        isHome: m.isHome,
        kickoffTime: m.kickoffTime,
        homeScore: m.homeScore ?? undefined,
        guestScore: m.guestScore ?? undefined,
      }));

    if (orderedMatches.length === 0) return c.json({ error: "No valid matches found" }, 400);

    const footer = "HEIMHALLE: FRIEDRICH-EBERT-SCHULE | SALZWEG 34 30455 HANNOVER";

    try {
      const png = await generatePostImage({
        type,
        calendarWeek,
        matches: orderedMatches,
        footer,
        backgroundFilename: bg.filename,
        playerPhotoFilename: photo.filename,
        playerPosition,
      });

      return new Response(new Uint8Array(png), {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(png.length),
          "Content-Disposition": `attachment; filename="dragons-${type}-kw${calendarWeek}.png"`,
        },
      });
    } catch (e) {
      (c.get("logger") ?? rootLogger).error({ err: e }, "Image generation failed");
      return c.json({ error: e instanceof Error ? e.message : "Image generation failed" }, 500);
    }
  },
);

export { socialRoutes };
