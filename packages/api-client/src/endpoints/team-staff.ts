import type { TeamStaffMember } from "@dragons/shared";
import type { TeamStaffCreateBody, TeamStaffUpdateBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

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
    /**
     * Uploads or replaces a portrait. Multipart, so there is no zod request
     * body to share — the API validates the bytes themselves and answers with
     * the updated member, whose `photoUrl` points at the new object.
     */
    uploadPhoto(entryId: number, staffId: number, file: File): Promise<TeamStaffMember> {
      const form = new FormData();
      form.set("file", file);
      return client.postForm(`/admin/teams/${entryId}/staff/${staffId}/photo`, form);
    },
  };
}
