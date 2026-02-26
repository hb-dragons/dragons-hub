import { Hono } from "hono";
import { getReferees } from "../../services/admin/referee-admin.service";
import { refereeListQuerySchema } from "./referee.schemas";

const refereeRoutes = new Hono();

// GET /admin/referees - List all referees
refereeRoutes.get("/referees", async (c) => {
  const query = refereeListQuerySchema.parse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    search: c.req.query("search"),
  });
  const result = await getReferees(query);
  return c.json(result);
});

export { refereeRoutes };
