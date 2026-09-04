import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { publicStaffIdParamSchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import { getPublicStaffPortrait } from "../../services/public/staff-portrait.service";

const publicStaffRoutes = new Hono();

// GET /public/staff/:id/photo - Coach portrait for the public Website
publicStaffRoutes.get(
  "/staff/:id/photo",
  validator("param", publicStaffIdParamSchema, validationHook),
  describeRoute({
    description: "Get the portrait of a team staff member (public)",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Image" },
      400: { description: "Invalid staff id" },
      404: { description: "No portrait for this staff member" },
    },
  }),
  async (c) => {
    const portrait = await getPublicStaffPortrait(c.req.valid("param").id);
    if (!portrait) {
      return c.json({ error: "Portrait not found", code: "NOT_FOUND" }, 404);
    }
    return new Response(new Uint8Array(portrait.buffer), {
      headers: {
        "Content-Type": portrait.contentType,
        "Content-Length": String(portrait.buffer.length),
        // The URL carries the object name, so a replaced portrait is requested
        // under a different one and this can be cached hard and publicly.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  },
);

export { publicStaffRoutes };
