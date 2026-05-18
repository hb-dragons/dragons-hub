import { Hono } from "hono";
import { z } from "zod";
import { describeRoute } from "hono-openapi";
import {
  getReferees,
  getRefereeCounts,
  updateRefereeVisibility,
  updateRefereeRules,
  RefereeSettingsError,
} from "../../services/admin/referee-admin.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import { refereeListQuerySchema } from "./referee.schemas";

const refereeRoutes = new Hono<AppEnv>();

refereeRoutes.get(
  "/referees",
  requirePermission("referee", "view"),
  describeRoute({
    description: "List referees with pagination, search, and sort",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = refereeListQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      scope: c.req.query("scope"),
      sort: c.req.query("sort"),
    });
    const result = await getReferees(query);
    return c.json(result);
  },
);

refereeRoutes.get(
  "/referees/counts",
  requirePermission("referee", "view"),
  describeRoute({
    description: "Returns own-club and total referee counts",
    tags: ["Referees"],
    responses: { 200: { description: "Counts" } },
  }),
  async (c) => {
    const result = await getRefereeCounts();
    return c.json(result);
  },
);

const visibilityBodySchema = z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
  isOwnClub: z.boolean(),
});

refereeRoutes.patch(
  "/referees/:id/visibility",
  requirePermission("referee", "update"),
  describeRoute({
    description: "Update referee visibility flags (own-club, all home, away)",
    tags: ["Referees"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid request" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
    }
    const body = visibilityBodySchema.parse(await c.req.json());
    try {
      const result = await updateRefereeVisibility(id, body);
      return c.json(result);
    } catch (err) {
      if (err instanceof RefereeSettingsError) {
        return c.json({ error: err.message, code: err.code }, err.code === "NOT_FOUND" ? 404 : 400);
      }
      throw err;
    }
  },
);

const rulesBodySchema = z.object({
  rules: z.array(
    z.object({
      teamId: z.number().int().positive(),
      deny: z.boolean(),
      allowSr1: z.boolean(),
      allowSr2: z.boolean(),
    }),
  ),
});

refereeRoutes.patch(
  "/referees/:id/rules",
  requirePermission("referee", "update"),
  describeRoute({
    description: "Replace all assignment rules for a referee",
    tags: ["Referees"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid request" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
    }
    const body = rulesBodySchema.parse(await c.req.json());
    try {
      const result = await updateRefereeRules(id, body);
      return c.json(result);
    } catch (err) {
      if (err instanceof RefereeSettingsError) {
        const status = err.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: err.message, code: err.code }, status);
      }
      throw err;
    }
  },
);

export { refereeRoutes };
