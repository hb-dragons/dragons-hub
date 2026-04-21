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
import type { CreateChannelConfigBody, UpdateChannelConfigBody } from "@dragons/shared";
import { requirePermission } from "../../middleware/rbac";
import {
  channelConfigIdParamSchema,
  channelConfigListQuerySchema,
  createChannelConfigSchema,
  updateChannelConfigSchema,
  validateConfigForType,
} from "./channel-config.schemas";
import { env } from "../../config/env";

const channelConfigRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

function isProviderConfigured(type: string): boolean {
  switch (type) {
    case "in_app":
      return true;
    case "whatsapp_group":
      return !!env.WAHA_BASE_URL;
    case "email":
      return !!(
        env.SMTP_HOST &&
        env.SMTP_PORT &&
        env.SMTP_USER &&
        env.SMTP_PASSWORD &&
        env.SMTP_FROM
      );
    default:
      return false;
  }
}

// GET /admin/channel-configs/providers - Provider availability
channelConfigRoutes.get(
  "/channel-configs/providers",
  settingsUpdate,
  describeRoute({
    description: "List channel types with provider configuration status",
    tags: ["Channel Configs"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    return c.json({
      in_app: { configured: isProviderConfigured("in_app") },
      whatsapp_group: { configured: isProviderConfigured("whatsapp_group") },
      email: { configured: isProviderConfigured("email") },
    });
  },
);

// GET /admin/channel-configs - List channel configs
channelConfigRoutes.get(
  "/channel-configs",
  settingsUpdate,
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
  settingsUpdate,
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
  settingsUpdate,
  describeRoute({
    description: "Create a new channel configuration",
    tags: ["Channel Configs"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = createChannelConfigSchema.parse(await c.req.json());

    if (!isProviderConfigured(body.type)) {
      return c.json(
        {
          error: `Provider for "${body.type}" is not configured`,
          code: "PROVIDER_NOT_CONFIGURED",
        },
        400,
      );
    }

    const config = await createChannelConfig(body as unknown as CreateChannelConfigBody);
    return c.json(config, 201);
  },
);

// PATCH /admin/channel-configs/:id - Update channel config
channelConfigRoutes.patch(
  "/channel-configs/:id",
  settingsUpdate,
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

    if (body.config) {
      const existing = await getChannelConfig(id);
      if (!existing) {
        return c.json(
          { error: "Channel config not found", code: "NOT_FOUND" },
          404,
        );
      }

      const validated = validateConfigForType(existing.type, body.config);
      if (!validated) {
        return c.json(
          {
            error: `Config does not match schema for type "${existing.type}"`,
            code: "VALIDATION_ERROR",
          },
          400,
        );
      }
    }

    const config = await updateChannelConfig(id, body as UpdateChannelConfigBody);

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
  settingsUpdate,
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
