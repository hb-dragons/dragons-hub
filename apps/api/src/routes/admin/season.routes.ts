import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  listSeasons,
  createSeason,
  activateSeason,
  archiveSeason,
} from "../../services/admin/season.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { createSeasonSchema, seasonIdParamSchema } from "@dragons/contracts";

const seasonRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

seasonRoutes.get(
  "/seasons",
  settingsUpdate,
  describeRoute({
    description: "List seasons",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await listSeasons()),
);

seasonRoutes.post(
  "/seasons",
  settingsUpdate,
  validator("json", createSeasonSchema, validationHook),
  describeRoute({
    description: "Create an upcoming season",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await createSeason(c.req.valid("json"))),
);

seasonRoutes.post(
  "/seasons/:id/activate",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({
    description: "Activate a season (archives the prior active one)",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await activateSeason(c.req.valid("param").id)),
);

seasonRoutes.post(
  "/seasons/:id/archive",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({
    description: "Archive a season",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await archiveSeason(c.req.valid("param").id)),
);

export { seasonRoutes };
