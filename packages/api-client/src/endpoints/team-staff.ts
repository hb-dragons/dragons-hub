import type { TeamStaffMember } from "@dragons/shared";
import type { TeamStaffCreateBody, TeamStaffUpdateBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

/**
 * The assignments of one team entry. The people themselves — including their
 * portraits — are `staffPeopleEndpoints` (ADR 0009).
 */
export function teamStaffEndpoints(client: ApiClient) {
  return {
    list(entryId: number): Promise<TeamStaffMember[]> {
      return client.get(`/admin/teams/${entryId}/staff`);
    },
    create(entryId: number, body: TeamStaffCreateBody): Promise<TeamStaffMember> {
      return client.post(`/admin/teams/${entryId}/staff`, body);
    },
    update(
      entryId: number,
      staffId: number,
      body: TeamStaffUpdateBody,
    ): Promise<TeamStaffMember> {
      return client.patch(`/admin/teams/${entryId}/staff/${staffId}`, body);
    },
    remove(entryId: number, staffId: number): Promise<{ success: boolean }> {
      return client.delete(`/admin/teams/${entryId}/staff/${staffId}`);
    },
  };
}
