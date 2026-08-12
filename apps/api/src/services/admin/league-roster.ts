import { sdkClient } from "../sync/sdk-client";
import type { SdkTeamRef } from "@dragons/sdk";

/**
 * The teams a federation league lists: the table names the roster even for a
 * vorabliga; an early-season league may publish only its schedule, so fall
 * back to the fixtures' team slots. Deduped by teamPermanentId.
 */
export async function fetchLeagueRoster(ligaId: number): Promise<SdkTeamRef[]> {
  const refs: SdkTeamRef[] = [];
  const table = await sdkClient.getTabelle(ligaId);
  if (table.length > 0) {
    for (const entry of table) refs.push(entry.team);
  } else {
    const matches = await sdkClient.getSpielplan(ligaId);
    for (const m of matches) {
      if (m.homeTeam) refs.push(m.homeTeam);
      if (m.guestTeam) refs.push(m.guestTeam);
    }
  }
  const byId = new Map<number, SdkTeamRef>();
  for (const ref of refs) {
    if (ref.teamPermanentId && !byId.has(ref.teamPermanentId)) byId.set(ref.teamPermanentId, ref);
  }
  return [...byId.values()];
}
