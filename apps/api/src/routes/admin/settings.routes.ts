import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  getClubConfig,
  setClubConfig,
  getBookingSettings,
  setBookingSettings,
  getSetting,
  upsertSetting,
} from "../../services/admin/settings.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  settingsClubConfigSchema,
  settingsBookingConfigSchema,
  settingsRefereeReminderSchema,
} from "@dragons/contracts";

const settingsRoutes = new Hono<AppEnv>();

// GET /admin/settings/club - Get current club config
settingsRoutes.get(
  "/settings/club",
  requirePermission("settings", "view"),
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

// PUT /admin/settings/club - Set club config
settingsRoutes.put(
  "/settings/club",
  requirePermission("settings", "update"),
  validator("json", settingsClubConfigSchema, validationHook),
  describeRoute({
    description: "Set club configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    await setClubConfig(body.clubId, body.clubName);
    return c.json({ clubId: body.clubId, clubName: body.clubName });
  },
);

// GET /admin/settings/booking - Get booking config
settingsRoutes.get(
  "/settings/booking",
  requirePermission("settings", "view"),
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

// PUT /admin/settings/booking - Set booking config
settingsRoutes.put(
  "/settings/booking",
  requirePermission("settings", "update"),
  validator("json", settingsBookingConfigSchema, validationHook),
  describeRoute({
    description: "Set booking configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    await setBookingSettings(body);
    return c.json(body);
  },
);

// GET /admin/settings/referee-reminders - Get referee reminder days
settingsRoutes.get(
  "/settings/referee-reminders",
  requirePermission("settings", "view"),
  describeRoute({
    description: "Get referee reminder days configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const value = await getSetting("referee_reminder_days");
    let days: unknown = [7, 3, 1];
    if (value) {
      try {
        days = JSON.parse(value);
      } catch {
        days = [7, 3, 1];
      }
    }
    return c.json({ days });
  },
);

// PUT /admin/settings/referee-reminders - Set referee reminder days
settingsRoutes.put(
  "/settings/referee-reminders",
  requirePermission("settings", "update"),
  validator("json", settingsRefereeReminderSchema, validationHook),
  describeRoute({
    description: "Set referee reminder days configuration",
    tags: ["Settings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { days } = c.req.valid("json");
    const sorted = [...days].sort((a, b) => b - a);
    await upsertSetting("referee_reminder_days", JSON.stringify(sorted));
    return c.json({ days: sorted });
  },
);

// POST /admin/settings/referee-games-sync — trigger manual referee games sync
settingsRoutes.post(
  "/settings/referee-games-sync",
  requirePermission("sync", "trigger"),
  describeRoute({
    description: "Trigger a manual referee games sync",
    tags: ["Settings"],
    responses: { 200: { description: "Sync triggered" } },
  }),
  async (c) => {
    const { triggerRefereeGamesSync } = await import("../../workers/queues");
    const userId = c.get("user")?.id;
    const result = await triggerRefereeGamesSync(userId);
    if (result === null) {
      return c.json({ error: "Referee games sync already in progress or queued" }, 409);
    }
    return c.json({ success: true, syncRunId: result.syncRunId, message: "Referee games sync triggered" });
  },
);

export { settingsRoutes };
