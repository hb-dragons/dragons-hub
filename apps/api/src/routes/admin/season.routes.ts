import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  listSeasons,
  createSeason,
  activateSeason,
  archiveSeason,
} from "../../services/admin/season.service";
import {
  browseLeagues,
  setSeasonLeagues,
  getTrackedLeagues,
} from "../../services/admin/league-discovery.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  createSeasonSchema,
  seasonIdParamSchema,
  browseLeaguesQuerySchema,
  seasonLeaguesSchema,
} from "@dragons/contracts";

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

// Browse federation leagues before a season exists (new-season onboarding).
// Hono's router prioritises this static segment over the `/seasons/:id/...`
// param routes, so "browse" is never matched as an id (verified in tests).
seasonRoutes.get(
  "/seasons/browse",
  settingsUpdate,
  validator("query", browseLeaguesQuerySchema, validationHook),
  describeRoute({
    description: "Browse federation leagues for onboarding (not tied to a season)",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { vorabligaOnly } = c.req.valid("query");
    return c.json(await browseLeagues({ vorabligaOnly }));
  },
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

seasonRoutes.get(
  "/seasons/:id/discover",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  validator("query", browseLeaguesQuerySchema, validationHook),
  describeRoute({
    description: "Browse federation leagues to track for a season",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { vorabligaOnly } = c.req.valid("query");
    return c.json(await browseLeagues({ vorabligaOnly, seasonId: id }));
  },
);

seasonRoutes.get(
  "/seasons/:id/leagues",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({
    description: "Tracked leagues for a season",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await getTrackedLeagues(c.req.valid("param").id)),
);

seasonRoutes.put(
  "/seasons/:id/leagues",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  validator("json", seasonLeaguesSchema, validationHook),
  describeRoute({
    description: "Set tracked leagues for a season",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { ligaIds } = c.req.valid("json");
    return c.json(await setSeasonLeagues(id, ligaIds));
  },
);

export { seasonRoutes };
