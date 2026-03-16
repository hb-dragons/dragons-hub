import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  listWatchRules,
  getWatchRule,
  createWatchRule,
  updateWatchRule,
  deleteWatchRule,
} from "../../services/admin/watch-rule-admin.service";
import {
  watchRuleIdParamSchema,
  watchRuleListQuerySchema,
  createWatchRuleSchema,
  updateWatchRuleSchema,
} from "./watch-rule.schemas";

const watchRuleRoutes = new Hono<AppEnv>();

// GET /admin/watch-rules - List watch rules
watchRuleRoutes.get(
  "/watch-rules",
  describeRoute({
    description: "List watch rules with pagination",
    tags: ["Watch Rules"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = watchRuleListQuerySchema.parse(c.req.query());
    const result = await listWatchRules(query);
    return c.json(result);
  },
);

// GET /admin/watch-rules/:id - Get watch rule by ID
watchRuleRoutes.get(
  "/watch-rules/:id",
  describeRoute({
    description: "Get a single watch rule by ID",
    tags: ["Watch Rules"],
    responses: {
      200: { description: "Success" },
      404: { description: "Watch rule not found" },
    },
  }),
  async (c) => {
    const { id } = watchRuleIdParamSchema.parse({ id: c.req.param("id") });
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
  describeRoute({
    description: "Create a new watch rule",
    tags: ["Watch Rules"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = createWatchRuleSchema.parse(await c.req.json());
    const userId = c.get("user")?.id ?? "system";
    const rule = await createWatchRule(body, userId);
    return c.json(rule, 201);
  },
);

// PATCH /admin/watch-rules/:id - Update watch rule
watchRuleRoutes.patch(
  "/watch-rules/:id",
  describeRoute({
    description: "Update a watch rule",
    tags: ["Watch Rules"],
    responses: {
      200: { description: "Success" },
      404: { description: "Watch rule not found" },
    },
  }),
  async (c) => {
    const { id } = watchRuleIdParamSchema.parse({ id: c.req.param("id") });
    const body = updateWatchRuleSchema.parse(await c.req.json());
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
  describeRoute({
    description: "Delete a watch rule",
    tags: ["Watch Rules"],
    responses: {
      200: { description: "Success" },
      404: { description: "Watch rule not found" },
    },
  }),
  async (c) => {
    const { id } = watchRuleIdParamSchema.parse({ id: c.req.param("id") });
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
