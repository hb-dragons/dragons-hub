import type { UserRefereeLinkBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

/** Result of linking/unlinking a referee record to a user account. */
export interface UserRefereeLinkResult {
  id: string;
  refereeId: number | null;
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
  };
}
