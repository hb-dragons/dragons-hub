import type { UserRefereeLinkBody, UserStaffLinkBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

/** Result of linking/unlinking a referee record to a user account. */
export interface UserRefereeLinkResult {
  id: string;
  refereeId: number | null;
}

/**
 * Result of linking/unlinking a staff record to a user account. `role` is the
 * account's comma-joined role string after the call, so a caller that asked for
 * the coach grant can render the new roles without refetching.
 */
export interface UserStaffLinkResult {
  id: string;
  staffId: number | null;
  role: string | null;
}

/**
 * Admin user-management surface. Currently only the referee-link mutation is
 * routed through the typed API client; user list/role/ban actions are served by
 * better-auth's admin client (`authClient.admin.*`) and are intentionally not
 * duplicated here.
 */
export function userEndpoints(client: ApiClient) {
  return {
    linkReferee(
      id: string,
      body: UserRefereeLinkBody,
    ): Promise<UserRefereeLinkResult> {
      return client.patch(`/admin/users/${id}/referee-link`, body);
    },
    linkStaff(id: string, body: UserStaffLinkBody): Promise<UserStaffLinkResult> {
      return client.patch(`/admin/users/${id}/staff-link`, body);
    },
  };
}
