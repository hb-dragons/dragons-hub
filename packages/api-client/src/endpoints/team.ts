import type { OwnClubTeam, TeamReorderItem } from "@dragons/shared";
import type { TeamUpdateBody, TeamReorderBody, TeamsListQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function teamEndpoints(client: ApiClient) {
  return {
    list(query?: TeamsListQuery): Promise<OwnClubTeam[]> {
      return client.get("/admin/teams", query);
    },
    update(entryId: number, body: TeamUpdateBody): Promise<OwnClubTeam> {
      return client.patch(`/admin/teams/${entryId}`, body);
    },
    reorder(body: TeamReorderBody): Promise<TeamReorderItem[]> {
      return client.put("/admin/teams/order", body);
    },
  };
}
