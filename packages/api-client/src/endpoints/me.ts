import type { AccountClosureStatus, MyStaffProfile } from "@dragons/shared";
import type { MeAccountClosureCreateBody, MeStaffUpdateBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

/**
 * What the signed-in account may read and change about itself: the coach's
 * own staff record (#315) — the same person the admin editor writes,
 * addressed by the session instead of by an id, so every team the coach trains
 * shows a corrected number at once — and the account closure request (#400).
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
    /** The caller's closure request, `{ request: null }` before one exists. */
    accountClosure(): Promise<AccountClosureStatus> {
      return client.get("/me/account-closure");
    },
    /**
     * Ask the club to close this account. Idempotent: a repeat returns the
     * request already on file, and the club is mailed only the first time.
     */
    requestAccountClosure(): Promise<AccountClosureStatus> {
      const body: MeAccountClosureCreateBody = {};
      return client.post("/me/account-closure", body);
    },
  };
}
