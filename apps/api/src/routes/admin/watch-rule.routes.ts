import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  listWatchRules,
  getWatchRule,
  createWatchRule,
  updateWatchRule,
  deleteWatchRule,
} from "../../services/admin/watch-rule-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  watchRuleIdParamSchema,
  watchRuleListQuerySchema,
  createWatchRuleSchema,
  updateWatchRuleSchema,
} from "@dragons/contracts";

const watchRuleRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

// GET /admin/watch-rules - List watch rules
watchRuleRoutes.get(
  "/watch-rules",
  settingsUpdate,
  validator("query", watchRuleListQuerySchema, validationHook),
  describeRoute({
    description: "List watch rules with pagination",
    tags: ["Watch Rules"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listWatchRules(query);
    return c.json(result);
  },
);

// GET /admin/watch-rules/:id - Get watch rule by ID
watchRuleRoutes.get(
  "/watch-rules/:id",
  settingsUpdate,
  validator("param", watchRuleIdParamSchema, validationHook),
  describeRoute({
    description: "Get a single watch rule by ID",
    tags: ["Watch Rules"],
    responses: {
      200: { description: "Success" },
      404: { description: "Watch rule not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const rule = await getWatchRule(id);

    if (!rule) {
      return c.json(
        { error: "Watch rule not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(rule);
  },
);

// POST /admin/watch-rules - Create watch rule
watchRuleRoutes.post(
  "/watch-rules",
  settingsUpdate,
  validator("json", createWatchRuleSchema, validationHook),
  describeRoute({
    description: "Create a new watch rule",
    tags: ["Watch Rules"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("user")?.id ?? "system";
    const rule = await createWatchRule(body, userId);
    return c.json(rule, 201);
  },
);

// PATCH /admin/watch-rules/:id - Update watch rule
watchRuleRoutes.patch(
  "/watch-rules/:id",
  settingsUpdate,
  validator("param", watchRuleIdParamSchema, validationHook),
  validator("json", updateWatchRuleSchema, validationHook),
  describeRoute({
    description: "Update a watch rule",
    tags: ["Watch Rules"],
    responses: {
      200: { description: "Success" },
      404: { description: "Watch rule not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const rule = await updateWatchRule(id, body);

    if (!rule) {
      return c.json(
        { error: "Watch rule not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(rule);
  },
);

// DELETE /admin/watch-rules/:id - Delete watch rule
watchRuleRoutes.delete(
  "/watch-rules/:id",
  settingsUpdate,
  validator("param", watchRuleIdParamSchema, validationHook),
  describeRoute({
    description: "Delete a watch rule",
    tags: ["Watch Rules"],
    responses: {
      200: { description: "Success" },
      404: { description: "Watch rule not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const success = await deleteWatchRule(id);

    if (!success) {
      return c.json(
        { error: "Watch rule not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  },
);

export { watchRuleRoutes };
