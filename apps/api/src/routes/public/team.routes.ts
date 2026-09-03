import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { publicStaffIdParamSchema, publicTeamIdParamSchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import { listPublicTeams } from "../../services/public/team-list.service";
import { getPublicStaffPortrait } from "../../services/public/staff-portrait.service";
import { getTeamStats } from "../../services/public/team-stats.service";

const publicTeamRoutes = new Hono();

// GET /public/teams - List all teams (no auth required)
publicTeamRoutes.get(
  "/teams",
  describeRoute({
    description: "List all teams (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await listPublicTeams()),
);

// GET /public/teams/:id/stats - Season stats and recent form for a team
publicTeamRoutes.get(
  "/teams/:id/stats",
  validator("param", publicTeamIdParamSchema, validationHook),
  describeRoute({
    description: "Get season stats and recent form for a team (public)",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Team stats" },
      400: { description: "Invalid team id" },
      404: { description: "Team not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const stats = await getTeamStats(id);
    if (!stats) {
      return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(stats);
  },
);

// GET /public/staff/:id/photo - Coach portrait for the public Website
publicTeamRoutes.get(
  "/staff/:id/photo",
  validator("param", publicStaffIdParamSchema, validationHook),
  describeRoute({
    description: "Get the portrait of a team staff member (public)",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Image" },
      400: { description: "Invalid staff id" },
      404: { description: "No portrait for this staff member" },
    },
  }),
  async (c) => {
    const portrait = await getPublicStaffPortrait(c.req.valid("param").id);
    if (!portrait) {
      return c.json({ error: "Portrait not found", code: "NOT_FOUND" }, 404);
    }
    return new Response(new Uint8Array(portrait.buffer), {
      headers: {
        "Content-Type": portrait.contentType,
        "Content-Length": String(portrait.buffer.length),
        // The URL carries the object name, so a replaced portrait is requested
        // under a different one and this can be cached hard and publicly.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  },
);

export { publicTeamRoutes };
