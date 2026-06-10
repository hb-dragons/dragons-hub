import type { OwnClubTeam, TeamReorderItem } from "@dragons/shared";
import type { TeamUpdateBody, TeamReorderBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function teamEndpoints(client: ApiClient) {
  return {
    list(): Promise<OwnClubTeam[]> {
      return client.get("/admin/teams");
    },
    update(id: number, body: TeamUpdateBody): Promise<OwnClubTeam> {
      return client.patch(`/admin/teams/${id}`, body);
    },
    reorder(body: TeamReorderBody): Promise<TeamReorderItem[]> {
      return client.put("/admin/teams/order", body);
    },
  };
}
