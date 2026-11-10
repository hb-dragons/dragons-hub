import useSWR from "swr";
import type { AccountClosureStatus } from "@dragons/shared";
import { authClient } from "@/lib/auth-client";
import { meApi } from "@/lib/api";

export const ACCOUNT_CLOSURE_KEY = "me/account-closure";

/**
 * The signed-in account's closure request (#400). A fan has no account to
 * close, so the hook asks only with a session; Profile and the closure screen
 * share the one cache entry, so confirming on the screen updates the row.
 */
export function useAccountClosure() {
  const { data: session } = authClient.useSession();
  return useSWR<AccountClosureStatus>(session ? ACCOUNT_CLOSURE_KEY : null, () => meApi.accountClosure());
}
