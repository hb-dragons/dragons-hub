import { Hono } from "hono";
import { db } from "../../config/database";
import { teams, referees } from "@dragons/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import {
  getRulesForReferee,
  updateRulesForReferee,
} from "../../services/referee/referee-rules.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import { refereeRulesParamSchema, updateRefereeRulesBodySchema } from "./referee-rules.schemas";

const refereeRulesRoutes = new Hono<AppEnv>();
refereeRulesRoutes.use("*", requirePermission("referee", "update"));

async function requireOwnClubReferee(id: number) {
  const [referee] = await db
    .select({ isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, id))
    .limit(1);
  return referee ?? null;
}

refereeRulesRoutes.get("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });

  const referee = await requireOwnClubReferee(id);
  if (!referee) {
    return c.json({ error: "Referee not found", code: "NOT_FOUND" }, 404);
  }
  if (!referee.isOwnClub) {
    return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 400);
  }

  const result = await getRulesForReferee(id);
  return c.json(result);
});

refereeRulesRoutes.put("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });
  const body = updateRefereeRulesBodySchema.parse(await c.req.json());

  const referee = await requireOwnClubReferee(id);
  if (!referee) {
    return c.json({ error: "Referee not found", code: "NOT_FOUND" }, 404);
  }
  if (!referee.isOwnClub) {
    return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 400);
  }

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
