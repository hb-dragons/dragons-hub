import type { StaffPerson, StaffPersonWithAssignments } from "@dragons/shared";
import type { StaffPersonCreateBody, StaffPersonUpdateBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

/**
 * The pool of staff people (ADR 0009): the humans the club holds contact data
 * on, each shared by every team they are attached to.
 */
export function staffPeopleEndpoints(client: ApiClient) {
  return {
    list(search?: string): Promise<StaffPersonWithAssignments[]> {
      const query = search ? `?q=${encodeURIComponent(search)}` : "";
      return client.get(`/admin/staff-people${query}`);
    },
    create(body: StaffPersonCreateBody): Promise<StaffPerson> {
      return client.post("/admin/staff-people", body);
    },
    update(id: number, body: StaffPersonUpdateBody): Promise<StaffPerson> {
      return client.patch(`/admin/staff-people/${id}`, body);
    },
    remove(id: number): Promise<{ success: boolean }> {
      return client.delete(`/admin/staff-people/${id}`);
    },
    /**
     * Uploads or replaces a portrait. Multipart, so there is no zod request
     * body to share — the API validates the bytes themselves and answers with
     * the updated person, whose `photoUrl` points at the new object.
     */
    uploadPhoto(id: number, file: File): Promise<StaffPerson> {
      const form = new FormData();
      form.set("file", file);
      return client.postForm(`/admin/staff-people/${id}/photo`, form);
    },
  };
}
