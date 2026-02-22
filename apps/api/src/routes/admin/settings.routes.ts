import { Hono } from "hono";
import { z } from "zod";
import {
  getClubConfig,
  setClubConfig,
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

export { settingsRoutes };
