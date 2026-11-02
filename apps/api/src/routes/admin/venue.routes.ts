import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  searchVenues,
  getVenues,
} from "../../services/admin/venue-admin.service";
import {
  applyHallTimeImport,
  deleteHallTime,
  listHallTimes,
  previewHallTimeImport,
  upsertHallTime,
} from "../../services/hall-times/hall-time.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  venueSearchQuerySchema,
  venueIdParamSchema,
  hallTimeDateParamSchema,
  hallTimeListQuerySchema,
  hallTimeUpsertBodySchema,
  hallTimeImportBodySchema,
} from "@dragons/contracts";

const venueRoutes = new Hono<AppEnv>();

// GET /admin/venues - List all venues
venueRoutes.get(
  "/venues",
  requirePermission("venue", "view"),
  describeRoute({
    description: "List all venues",
    tags: ["Venues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await getVenues();
    return c.json(result);
  },
);

// GET /admin/venues/search?q=<query>&limit=<n>
venueRoutes.get(
  "/venues/search",
  requirePermission("venue", "view"),
  validator("query", venueSearchQuerySchema, validationHook),
  describeRoute({
    description: "Search venues by name",
    tags: ["Venues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const venues = await searchVenues(q, limit);
    return c.json({ venues });
  },
);

// ── Hall times (Hallenzeiten) ────────────────────────────────────────────────

const VENUE_NOT_FOUND = { error: "Venue not found", code: "NOT_FOUND" } as const;

// GET /admin/venues/:id/hall-times?from&to
venueRoutes.get(
  "/venues/:id/hall-times",
  requirePermission("venue", "view"),
  validator("param", venueIdParamSchema, validationHook),
  validator("query", hallTimeListQuerySchema, validationHook),
  describeRoute({
    description: "List the hall times the club holds at a venue, optionally inside a date range",
    tags: ["Venues"],
    responses: { 200: { description: "Success" }, 404: { description: "Venue not found" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const rows = await listHallTimes(id, c.req.valid("query"));
    if (!rows) return c.json(VENUE_NOT_FOUND, 404);
    return c.json(rows);
  },
);

// POST /admin/venues/:id/hall-times/import/preview
venueRoutes.post(
  "/venues/:id/hall-times/import/preview",
  requirePermission("venue", "update"),
  validator("param", venueIdParamSchema, validationHook),
  validator("json", hallTimeImportBodySchema, validationHook),
  describeRoute({
    description:
      "Diff the rows of an Anlage T sheet against the stored hall times; writes nothing",
    tags: ["Venues"],
    responses: { 200: { description: "Preview" }, 404: { description: "Venue not found" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const preview = await previewHallTimeImport(id, c.req.valid("json"));
    if (!preview) return c.json(VENUE_NOT_FOUND, 404);
    return c.json(preview);
  },
);

// POST /admin/venues/:id/hall-times/import
venueRoutes.post(
  "/venues/:id/hall-times/import",
  requirePermission("venue", "update"),
  validator("param", venueIdParamSchema, validationHook),
  validator("json", hallTimeImportBodySchema, validationHook),
  describeRoute({
    description:
      "Apply an Anlage T sheet: replace the venue's sheet rows inside the sheet's date span",
    tags: ["Venues"],
    responses: { 200: { description: "Import result" }, 404: { description: "Venue not found" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await applyHallTimeImport(id, c.req.valid("json"));
    if (!result) return c.json(VENUE_NOT_FOUND, 404);
    return c.json(result);
  },
);

// PUT /admin/venues/:id/hall-times/:date
venueRoutes.put(
  "/venues/:id/hall-times/:date",
  requirePermission("venue", "update"),
  validator("param", hallTimeDateParamSchema, validationHook),
  validator("json", hallTimeUpsertBodySchema, validationHook),
  describeRoute({
    description: "Create or replace the hall time of one day by hand",
    tags: ["Venues"],
    responses: { 200: { description: "Success" }, 404: { description: "Venue not found" } },
  }),
  async (c) => {
    const { id, date } = c.req.valid("param");
    const row = await upsertHallTime(id, date, c.req.valid("json"));
    if (!row) return c.json(VENUE_NOT_FOUND, 404);
    return c.json(row);
  },
);

// DELETE /admin/venues/:id/hall-times/:date
venueRoutes.delete(
  "/venues/:id/hall-times/:date",
  requirePermission("venue", "update"),
  validator("param", hallTimeDateParamSchema, validationHook),
  describeRoute({
    description: "Remove the hall time of one day",
    tags: ["Venues"],
    responses: { 200: { description: "Success" }, 404: { description: "Hall time not found" } },
  }),
  async (c) => {
    const { id, date } = c.req.valid("param");
    const deleted = await deleteHallTime(id, date);
    if (!deleted) return c.json({ error: "Hall time not found", code: "NOT_FOUND" }, 404);
    return c.json({ success: true });
  },
);

export { venueRoutes };
