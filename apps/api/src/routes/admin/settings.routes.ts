import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
  getClubConfig,
  setClubConfig,
  getBookingSettings,
  setBookingSettings,
  getSetting,
  upsertSetting,
} from "../../services/admin/settings.service";
import { requireAdmin } from "../../middleware/auth";

const settingsRoutes = new Hono();

// GET /admin/settings/club - Get current club config
settingsRoutes.get(
  "/settings/club",
  describeRoute({
    description: "Get current club configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const config = await getClubConfig();
    return c.json(config);
  },
);

const clubConfigSchema = z.object({
  clubId: z.number().int().positive(),
  clubName: z.string().min(1),
});

// PUT /admin/settings/club - Set club config
settingsRoutes.put(
  "/settings/club",
  describeRoute({
    description: "Set club configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = clubConfigSchema.parse(await c.req.json());
    await setClubConfig(body.clubId, body.clubName);
    return c.json({ clubId: body.clubId, clubName: body.clubName });
  },
);

// GET /admin/settings/booking - Get booking config
settingsRoutes.get(
  "/settings/booking",
  describeRoute({
    description: "Get booking configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const config = await getBookingSettings();
    return c.json(config);
  },
);

const bookingConfigSchema = z.object({
  bufferBefore: z.number().int().min(0),
  bufferAfter: z.number().int().min(0),
  gameDuration: z.number().int().positive(),
  dueDaysBefore: z.number().int().min(0),
});

// PUT /admin/settings/booking - Set booking config
settingsRoutes.put(
  "/settings/booking",
  describeRoute({
    description: "Set booking configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = bookingConfigSchema.parse(await c.req.json());
    await setBookingSettings(body);
    return c.json(body);
  },
);

// GET /admin/settings/referee-reminders - Get referee reminder days
settingsRoutes.get(
  "/settings/referee-reminders",
  requireAdmin,
  describeRoute({
    description: "Get referee reminder days configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const value = await getSetting("referee_reminder_days");
    const days = value ? JSON.parse(value) : [7, 3, 1];
    return c.json({ days });
  },
);

const refereeReminderSchema = z.object({
  days: z.array(z.number().int().positive()).min(1).max(10),
});

// PUT /admin/settings/referee-reminders - Set referee reminder days
settingsRoutes.put(
  "/settings/referee-reminders",
  requireAdmin,
  describeRoute({
    description: "Set referee reminder days configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = await c.req.json();
    const parsed = refereeReminderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }
    const sorted = parsed.data.days.sort((a, b) => b - a);
    await upsertSetting("referee_reminder_days", JSON.stringify(sorted));
    return c.json({ days: sorted });
  },
);

// POST /admin/settings/referee-games-sync — trigger manual referee games sync
settingsRoutes.post(
  "/settings/referee-games-sync",
  requireAdmin,
  describeRoute({
    description: "Trigger a manual referee games sync",
    tags: ["Settings"],
    responses: { 200: { description: "Sync triggered" } },
  }),
  async (c) => {
    const { triggerRefereeGamesSync } = await import("../../workers/queues");
    await triggerRefereeGamesSync();
    return c.json({ success: true, message: "Referee games sync triggered" });
  },
);

export { settingsRoutes };
