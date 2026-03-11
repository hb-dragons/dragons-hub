import { Hono } from "hono";
import { matchesQuerySchema, idParamSchema, generateBodySchema } from "./social.schemas";
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

const socialRoutes = new Hono();

// --- Matches ---

socialRoutes.get("/matches", async (c) => {
  const query = matchesQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);
  const matches = await getWeekendMatches(query.data);
  return c.json(matches);
});

// --- Player Photos ---

socialRoutes.get("/player-photos", async (c) => {
  const photos = await listPlayerPhotos();
  return c.json(photos);
});

socialRoutes.get("/player-photos/:id/image", async (c) => {
  const { id } = idParamSchema.parse(c.req.param());
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
});

socialRoutes.post("/player-photos", async (c) => {
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
});

socialRoutes.delete("/player-photos/:id", async (c) => {
  const { id } = idParamSchema.parse(c.req.param());
  const record = await deletePlayerPhoto(id);
  if (!record) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// --- Backgrounds ---

socialRoutes.get("/backgrounds", async (c) => {
  const backgrounds = await listBackgrounds();
  return c.json(backgrounds);
});

socialRoutes.get("/backgrounds/:id/image", async (c) => {
  const { id } = idParamSchema.parse(c.req.param());
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
});

socialRoutes.post("/backgrounds", async (c) => {
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
});

socialRoutes.delete("/backgrounds/:id", async (c) => {
  const { id } = idParamSchema.parse(c.req.param());
  const record = await deleteBackground(id);
  if (!record) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

socialRoutes.patch("/backgrounds/:id/default", async (c) => {
  const { id } = idParamSchema.parse(c.req.param());
  const bg = await getBackgroundById(id);
  if (!bg) return c.json({ error: "Not found" }, 404);
  await setDefaultBackground(id);
  return c.json({ success: true });
});

// --- Generate ---

socialRoutes.post("/generate", async (c) => {
  const body = generateBodySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const { type, calendarWeek, year, matches: matchInputs, playerPhotoId, backgroundId, playerPosition } = body.data;

  const photo = await getPlayerPhotoById(playerPhotoId);
  if (!photo) return c.json({ error: "Player photo not found" }, 404);

  const bg = await getBackgroundById(backgroundId);
  if (!bg) return c.json({ error: "Background not found" }, 404);

  const weekMatches = await getWeekendMatches({ type, week: calendarWeek, year });
  const orderedMatches = matchInputs
    .sort((a, b) => a.order - b.order)
    .map((input) => weekMatches.find((m) => m.id === input.matchId))
    .filter(Boolean)
    .map((m) => ({
      teamLabel: m!.teamLabel,
      opponent: m!.opponent,
      isHome: m!.isHome,
      kickoffTime: m!.kickoffTime,
      homeScore: m!.homeScore ?? undefined,
      guestScore: m!.guestScore ?? undefined,
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
    return c.json({ error: e instanceof Error ? e.message : "Image generation failed" }, 500);
  }
});

export { socialRoutes };
