import type { MyStaffProfile } from "@dragons/shared";
import type { MeStaffUpdateBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

/**
 * What the signed-in account may read and change about itself. Today that is
 * the coach's own staff record (#315): the same person the admin editor writes,
 * addressed by the session instead of by an id, so every team the coach trains
 * shows a corrected number at once.
 */
export function meEndpoints(client: ApiClient) {
  return {
    /** 404 for an account with no staff link — the app hides the section on it. */
    staff(): Promise<MyStaffProfile> {
      return client.get("/me/staff");
    },
    updateStaff(body: MeStaffUpdateBody): Promise<MyStaffProfile> {
      return client.patch("/me/staff", body);
    },
  };
}
