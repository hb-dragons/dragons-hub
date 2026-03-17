import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  listChannelConfigs,
  getChannelConfig,
  createChannelConfig,
  updateChannelConfig,
  deleteChannelConfig,
} from "../../services/admin/channel-config-admin.service";
import {
  channelConfigIdParamSchema,
  channelConfigListQuerySchema,
  createChannelConfigSchema,
  updateChannelConfigSchema,
} from "./channel-config.schemas";

const channelConfigRoutes = new Hono<AppEnv>();

// GET /admin/channel-configs - List channel configs
channelConfigRoutes.get(
  "/channel-configs",
  describeRoute({
    description: "List channel configurations with pagination",
    tags: ["Channel Configs"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = channelConfigListQuerySchema.parse(c.req.query());
    const result = await listChannelConfigs(query);
    return c.json(result);
  },
);

// GET /admin/channel-configs/:id - Get channel config by ID
channelConfigRoutes.get(
  "/channel-configs/:id",
  describeRoute({
    description: "Get a single channel configuration by ID",
    tags: ["Channel Configs"],
    responses: {
      200: { description: "Success" },
      404: { description: "Channel config not found" },
    },
  }),
  async (c) => {
    const { id } = channelConfigIdParamSchema.parse({ id: c.req.param("id") });
    const config = await getChannelConfig(id);

    if (!config) {
      return c.json(
        { error: "Channel config not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(config);
  },
);

// POST /admin/channel-configs - Create channel config
channelConfigRoutes.post(
  "/channel-configs",
  describeRoute({
    description: "Create a new channel configuration",
    tags: ["Channel Configs"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = createChannelConfigSchema.parse(await c.req.json());
    const config = await createChannelConfig(body);
    return c.json(config, 201);
  },
);

// PATCH /admin/channel-configs/:id - Update channel config
channelConfigRoutes.patch(
  "/channel-configs/:id",
  describeRoute({
    description: "Update a channel configuration",
    tags: ["Channel Configs"],
    responses: {
      200: { description: "Success" },
      404: { description: "Channel config not found" },
    },
  }),
  async (c) => {
    const { id } = channelConfigIdParamSchema.parse({ id: c.req.param("id") });
    const body = updateChannelConfigSchema.parse(await c.req.json());
    const config = await updateChannelConfig(id, body);

    if (!config) {
      return c.json(
        { error: "Channel config not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(config);
  },
);

// DELETE /admin/channel-configs/:id - Delete channel config
channelConfigRoutes.delete(
  "/channel-configs/:id",
  describeRoute({
    description: "Delete a channel configuration",
    tags: ["Channel Configs"],
    responses: {
      200: { description: "Success" },
      404: { description: "Channel config not found" },
    },
  }),
  async (c) => {
    const { id } = channelConfigIdParamSchema.parse({ id: c.req.param("id") });
    const success = await deleteChannelConfig(id);

    if (!success) {
      return c.json(
        { error: "Channel config not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  },
);

export { channelConfigRoutes };
