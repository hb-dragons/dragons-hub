import { Hono } from "hono";
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import {
  getRulesForReferee,
  updateRulesForReferee,
} from "../../services/referee/referee-rules.service";
import { refereeRulesParamSchema, updateRefereeRulesBodySchema } from "./referee-rules.schemas";

const refereeRulesRoutes = new Hono();

refereeRulesRoutes.get("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });
  const result = await getRulesForReferee(id);
  return c.json(result);
});

refereeRulesRoutes.put("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });
  const body = updateRefereeRulesBodySchema.parse(await c.req.json());

  // Validate all teamIds exist and are own-club teams
  if (body.rules.length > 0) {
    const teamIds = body.rules.map((r) => r.teamId);
    const validTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(inArray(teams.id, teamIds), eq(teams.isOwnClub, true)));

    const validTeamIds = new Set(validTeams.map((t) => t.id));
    const invalidIds = teamIds.filter((tid) => !validTeamIds.has(tid));

    if (invalidIds.length > 0) {
      return c.json(
        {
          error: `Invalid or non-own-club team IDs: ${invalidIds.join(", ")}`,
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }
  }

  const result = await updateRulesForReferee(id, body);
  return c.json(result);
});

export { refereeRulesRoutes };
