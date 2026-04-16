import { Hono } from "hono";
import { z } from "zod";
import { describeRoute } from "hono-openapi";
import {
  getReferees,
  updateRefereeVisibility,
} from "../../services/admin/referee-admin.service";
import { refereeListQuerySchema } from "./referee.schemas";

const refereeRoutes = new Hono();

// GET /admin/referees - List all referees
refereeRoutes.get(
  "/referees",
  describeRoute({
    description: "List all referees with pagination and search",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = refereeListQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
    });
    const result = await getReferees(query);
    return c.json(result);
  },
);

const visibilityBodySchema = z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
});

// PATCH /admin/referees/:id/visibility - Update referee game visibility flags
refereeRoutes.patch(
  "/referees/:id/visibility",
  describeRoute({
    description: "Update referee game visibility flags",
    tags: ["Referees"],
    responses: {
      200: { description: "Updated visibility flags" },
      400: { description: "Invalid request" },
      404: { description: "Referee not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json(
        { error: "Invalid referee ID", code: "VALIDATION_ERROR" },
        400,
      );
    }

    const body = visibilityBodySchema.parse(await c.req.json());

    try {
      const result = await updateRefereeVisibility(id, body);
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: error.message, code: "NOT_FOUND" }, 404);
      }
      throw error;
    }
  },
);

export { refereeRoutes };
