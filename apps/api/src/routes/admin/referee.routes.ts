import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  getReferees,
  getRefereeCounts,
  getRefereeById,
  updateRefereeVisibility,
  updateRefereeRules,
  RefereeSettingsError,
} from "../../services/admin/referee-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  refereeListQuerySchema,
  refereeVisibilityBodySchema,
  updateRefereeRulesBodySchema,
} from "@dragons/contracts";

const refereeRoutes = new Hono<AppEnv>();

refereeRoutes.get(
  "/referees",
  requirePermission("referee", "view"),
  validator("query", refereeListQuerySchema, validationHook),
  describeRoute({
    description: "List referees with pagination, search, and sort",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
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

refereeRoutes.patch(
  "/referees/:id/visibility",
  requirePermission("referee", "update"),
  validator("json", refereeVisibilityBodySchema, validationHook),
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
    const body = c.req.valid("json");
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

refereeRoutes.patch(
  "/referees/:id/rules",
  requirePermission("referee", "update"),
  validator("json", updateRefereeRulesBodySchema, validationHook),
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
    const body = c.req.valid("json");
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

refereeRoutes.get(
  "/referees/:id",
  requirePermission("referee", "view"),
  describeRoute({
    description: "Get a single referee by id",
    tags: ["Referees"],
    responses: {
      200: { description: "Found" },
      400: { description: "Invalid id" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
    }
    const ref = await getRefereeById(id);
    if (!ref) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(ref);
  },
);

export { refereeRoutes };
