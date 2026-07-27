import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  listChannelConfigs,
  getChannelConfig,
  createChannelConfig,
  updateChannelConfig,
  deleteChannelConfig,
} from "../../services/admin/channel-config-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  channelConfigIdParamSchema,
  channelConfigListQuerySchema,
  createChannelConfigSchema,
  updateChannelConfigSchema,
  validateConfigForType,
} from "@dragons/contracts";
import type { ChannelConfigUpdateBodyParsed } from "@dragons/contracts";
import { CHANNEL_TYPES } from "@dragons/shared";
import type { ProviderAvailability } from "@dragons/shared";
import { env } from "../../config/env";
import { readSmtpSettings } from "../../services/notifications/channels/smtp-settings";

const channelConfigRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

function isProviderConfigured(type: string): boolean {
  switch (type) {
    case "in_app":
      return true;
    case "push":
      // Expo Push needs no credentials — EXPO_ACCESS_TOKEN only upgrades the
      // send tier, so the provider is always available.
      return true;
    case "whatsapp_group":
      return !!env.WAHA_BASE_URL;
    case "email":
      // All five or nothing — `readSmtpSettings()` in the adapter applies the
      // same rule, so the endpoint never advertises a relay the adapter would
      // then refuse to use.
      return readSmtpSettings() !== null;
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
    // Built from CHANNEL_TYPES so a new channel type is reported automatically
    // instead of silently missing from the response.
    const availability = Object.fromEntries(
      CHANNEL_TYPES.map((type) => [
        type,
        { configured: isProviderConfigured(type) },
      ]),
    ) as ProviderAvailability;
    return c.json(availability);
  },
);

// GET /admin/channel-configs - List channel configs
channelConfigRoutes.get(
  "/channel-configs",
  settingsUpdate,
  validator("query", channelConfigListQuerySchema, validationHook),
  describeRoute({
    description: "List channel configurations with pagination",
    tags: ["Channel Configs"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listChannelConfigs(query);
    return c.json(result);
  },
);

// GET /admin/channel-configs/:id - Get channel config by ID
channelConfigRoutes.get(
  "/channel-configs/:id",
  settingsUpdate,
  validator("param", channelConfigIdParamSchema, validationHook),
  describeRoute({
    description: "Get a single channel configuration by ID",
    tags: ["Channel Configs"],
    responses: {
      200: { description: "Success" },
      404: { description: "Channel config not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
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
  validator("json", createChannelConfigSchema, validationHook),
  describeRoute({
    description: "Create a new channel configuration",
    tags: ["Channel Configs"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = c.req.valid("json");

    if (!isProviderConfigured(body.type)) {
      return c.json(
        {
          error: `Provider for "${body.type}" is not configured`,
          code: "PROVIDER_NOT_CONFIGURED",
        },
        400,
      );
    }

    // `body.config` is already the parsed, key-stripped ChannelConfig — the
    // create schema transforms it, so no cast is needed here any more.
    const config = await createChannelConfig(body);
    return c.json(config, 201);
  },
);

// PATCH /admin/channel-configs/:id - Update channel config
channelConfigRoutes.patch(
  "/channel-configs/:id",
  settingsUpdate,
  validator("param", channelConfigIdParamSchema, validationHook),
  validator("json", updateChannelConfigSchema, validationHook),
  describeRoute({
    description: "Update a channel configuration",
    tags: ["Channel Configs"],
    responses: {
      200: { description: "Success" },
      404: { description: "Channel config not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { config: rawConfig, ...rest } = c.req.valid("json");
    const updates: ChannelConfigUpdateBodyParsed = rest;

    if (rawConfig) {
      const existing = await getChannelConfig(id);
      if (!existing) {
        return c.json(
          { error: "Channel config not found", code: "NOT_FOUND" },
          404,
        );
      }

      const validated = validateConfigForType(existing.type, rawConfig);
      if (!validated) {
        return c.json(
          {
            error: `Config does not match schema for type "${existing.type}"`,
            code: "VALIDATION_ERROR",
          },
          400,
        );
      }
      // Persist the *validated* value. Writing `body.config` back would put the
      // raw record — unknown keys and all — into a jsonb column typed
      // `$type<ChannelConfig>()`.
      updates.config = validated;
    }

    const config = await updateChannelConfig(id, updates);

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
  validator("param", channelConfigIdParamSchema, validationHook),
  describeRoute({
    description: "Delete a channel configuration",
    tags: ["Channel Configs"],
    responses: {
      200: { description: "Success" },
      404: { description: "Channel config not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
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
