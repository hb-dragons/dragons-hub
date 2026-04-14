import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listChannelConfigs: vi.fn(),
  getChannelConfig: vi.fn(),
  createChannelConfig: vi.fn(),
  updateChannelConfig: vi.fn(),
  deleteChannelConfig: vi.fn(),
  validateConfigForType: vi.fn(),
  env: {
    WAHA_BASE_URL: "http://waha:3000",
    // SMTP vars not set — email provider is unconfigured
  } as Record<string, string | undefined>,
}));

vi.mock("../../services/admin/channel-config-admin.service", () => ({
  listChannelConfigs: mocks.listChannelConfigs,
  getChannelConfig: mocks.getChannelConfig,
  createChannelConfig: mocks.createChannelConfig,
  updateChannelConfig: mocks.updateChannelConfig,
  deleteChannelConfig: mocks.deleteChannelConfig,
}));

vi.mock("../../config/env", () => ({
  env: mocks.env,
}));

vi.mock("./channel-config.schemas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./channel-config.schemas")>();
  return {
    ...actual,
    validateConfigForType: mocks.validateConfigForType,
  };
});

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { channelConfigRoutes } from "./channel-config.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", channelConfigRoutes);

function json(response: Response) {
  return response.json();
}

const sampleConfig = {
  id: 1,
  name: "Admin In-App",
  type: "in_app",
  enabled: true,
  config: { locale: "de" },
  digestMode: "per_sync",
  digestCron: null,
  digestTimezone: "Europe/Berlin",
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /channel-configs", () => {
  it("returns paginated channel configs", async () => {
    const payload = { configs: [sampleConfig], total: 1 };
    mocks.listChannelConfigs.mockResolvedValue(payload);

    const res = await app.request("/channel-configs");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(payload);
    expect(mocks.listChannelConfigs).toHaveBeenCalledWith({});
  });

  it("passes page and limit to service", async () => {
    mocks.listChannelConfigs.mockResolvedValue({ configs: [], total: 0 });

    await app.request("/channel-configs?page=3&limit=5");

    expect(mocks.listChannelConfigs).toHaveBeenCalledWith({
      page: 3,
      limit: 5,
    });
  });

  it("returns 400 for invalid page", async () => {
    const res = await app.request("/channel-configs?page=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding max", async () => {
    const res = await app.request("/channel-configs?limit=101");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /channel-configs/:id", () => {
  it("returns a single channel config", async () => {
    mocks.getChannelConfig.mockResolvedValue(sampleConfig);

    const res = await app.request("/channel-configs/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(sampleConfig);
    expect(mocks.getChannelConfig).toHaveBeenCalledWith(1);
  });

  it("returns 404 when config not found", async () => {
    mocks.getChannelConfig.mockResolvedValue(null);

    const res = await app.request("/channel-configs/999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/channel-configs/0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/channel-configs/abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /channel-configs", () => {
  const validBody = {
    name: "Admin In-App",
    type: "in_app",
    config: { audienceRole: "admin", locale: "de" },
  };

  it("creates a channel config", async () => {
    mocks.createChannelConfig.mockResolvedValue(sampleConfig);

    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(sampleConfig);
    expect(mocks.createChannelConfig).toHaveBeenCalledWith(validBody);
  });

  it("passes optional fields", async () => {
    mocks.createChannelConfig.mockResolvedValue(sampleConfig);

    const body = {
      ...validBody,
      enabled: false,
      config: { audienceRole: "referee", locale: "en" },
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
    };

    await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(mocks.createChannelConfig).toHaveBeenCalledWith(body);
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "in_app" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when type is missing", async () => {
    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid type", async () => {
    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", type: "sms" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid digestMode", async () => {
    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, digestMode: "daily" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /channel-configs/:id", () => {
  it("updates a channel config", async () => {
    const updated = { ...sampleConfig, name: "Renamed" };
    mocks.updateChannelConfig.mockResolvedValue(updated);

    const res = await app.request("/channel-configs/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateChannelConfig).toHaveBeenCalledWith(1, { name: "Renamed" });
  });

  it("returns 404 when config not found", async () => {
    mocks.updateChannelConfig.mockResolvedValue(null);

    const res = await app.request("/channel-configs/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/channel-configs/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /channel-configs/:id", () => {
  it("deletes a channel config", async () => {
    mocks.deleteChannelConfig.mockResolvedValue(true);

    const res = await app.request("/channel-configs/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteChannelConfig).toHaveBeenCalledWith(1);
  });

  it("returns 404 when config not found", async () => {
    mocks.deleteChannelConfig.mockResolvedValue(false);

    const res = await app.request("/channel-configs/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/channel-configs/0", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /channel-configs/providers", () => {
  it("returns all three types with configured status", async () => {
    const res = await app.request("/channel-configs/providers");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      in_app: { configured: true },
      whatsapp_group: { configured: true },
      email: { configured: false },
    });
  });

  it("in_app is always configured", async () => {
    // Even with empty env, in_app should be true
    const res = await app.request("/channel-configs/providers");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.in_app.configured).toBe(true);
  });
});

describe("POST /channel-configs (provider gate)", () => {
  const validInAppBody = {
    name: "Admin In-App",
    type: "in_app",
    config: { audienceRole: "admin", locale: "de" },
  };

  it("succeeds for in_app with valid config", async () => {
    mocks.createChannelConfig.mockResolvedValue(sampleConfig);

    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validInAppBody),
    });

    expect(res.status).toBe(201);
    expect(mocks.createChannelConfig).toHaveBeenCalled();
  });

  it("returns 400 PROVIDER_NOT_CONFIGURED when email SMTP is not set", async () => {
    const res = await app.request("/channel-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Email Channel",
        type: "email",
        config: { locale: "de" },
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toMatchObject({
      error: 'Provider for "email" is not configured',
      code: "PROVIDER_NOT_CONFIGURED",
    });
  });
});

describe("PATCH /channel-configs/:id (typed config validation)", () => {
  it("succeeds when config matches existing type", async () => {
    mocks.getChannelConfig.mockResolvedValue({ ...sampleConfig, type: "in_app" });
    mocks.validateConfigForType.mockReturnValue({ audienceRole: "admin", locale: "de" });
    const updated = { ...sampleConfig, config: { audienceRole: "admin", locale: "de" } };
    mocks.updateChannelConfig.mockResolvedValue(updated);

    const res = await app.request("/channel-configs/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { audienceRole: "admin", locale: "de" } }),
    });

    expect(res.status).toBe(200);
    expect(mocks.validateConfigForType).toHaveBeenCalledWith("in_app", {
      audienceRole: "admin",
      locale: "de",
    });
  });

  it("returns 400 VALIDATION_ERROR when config does not match existing type", async () => {
    mocks.getChannelConfig.mockResolvedValue({ ...sampleConfig, type: "in_app" });
    mocks.validateConfigForType.mockReturnValue(null);

    const res = await app.request("/channel-configs/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { groupId: "wrong-field" } }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("succeeds without config validation for name-only update", async () => {
    const updated = { ...sampleConfig, name: "Renamed" };
    mocks.updateChannelConfig.mockResolvedValue(updated);

    const res = await app.request("/channel-configs/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.validateConfigForType).not.toHaveBeenCalled();
    expect(mocks.getChannelConfig).not.toHaveBeenCalled();
  });
});
