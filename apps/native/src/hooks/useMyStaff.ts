import useSWR from "swr";
import type { MyStaffProfile } from "@dragons/shared";
import { authClient } from "@/lib/auth-client";
import { meApi } from "@/lib/api";
import { showsStaffContact } from "@/lib/staff/my-staff";

export const MY_STAFF_KEY = "me/staff";

/**
 * The signed-in coach's own staff record (#315).
 *
 * The session decides whether to ask at all: an account with no staff link
 * would get a 404 it can already predict from `personId`, so it makes no
 * request. A 404 for a link that went away since is a client error, which
 * `swrConfig` does not retry.
 */
export function useMyStaff() {
  const { data: session } = authClient.useSession();
  const linked = showsStaffContact(session);
  return useSWR<MyStaffProfile>(linked ? MY_STAFF_KEY : null, () => meApi.staff());
}
