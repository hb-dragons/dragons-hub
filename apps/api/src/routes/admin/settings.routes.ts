import { Hono } from "hono";
import { z } from "zod";
import {
  getClubConfig,
  setClubConfig,
  getBookingSettings,
  setBookingSettings,
} from "../../services/admin/settings.service";

const settingsRoutes = new Hono();

// GET /admin/settings/club - Get current club config
settingsRoutes.get("/settings/club", async (c) => {
  const config = await getClubConfig();
  return c.json(config);
});

const clubConfigSchema = z.object({
  clubId: z.number().int().positive(),
  clubName: z.string().min(1),
});

// PUT /admin/settings/club - Set club config
settingsRoutes.put("/settings/club", async (c) => {
  const body = clubConfigSchema.parse(await c.req.json());
  await setClubConfig(body.clubId, body.clubName);
  return c.json({ clubId: body.clubId, clubName: body.clubName });
});

// GET /admin/settings/booking - Get booking config
settingsRoutes.get("/settings/booking", async (c) => {
  const config = await getBookingSettings();
  return c.json(config);
});

const bookingConfigSchema = z.object({
  bufferBefore: z.number().int().min(0),
  bufferAfter: z.number().int().min(0),
  gameDuration: z.number().int().positive(),
  dueDaysBefore: z.number().int().min(0),
});

// PUT /admin/settings/booking - Set booking config
settingsRoutes.put("/settings/booking", async (c) => {
  const body = bookingConfigSchema.parse(await c.req.json());
  await setBookingSettings(body);
  return c.json(body);
});

export { settingsRoutes };
