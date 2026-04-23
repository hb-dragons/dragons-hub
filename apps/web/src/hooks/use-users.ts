import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { SWR_KEYS } from "@/lib/swr-keys";

export interface BoardUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

async function fetchUsers(): Promise<Map<string, BoardUser>> {
  const { data, error } = await authClient.admin.listUsers({
    query: { sortBy: "name", sortDirection: "asc" },
  });
  if (error) throw error;
  const users = data?.users ?? [];
  return new Map(
    users.map((u) => [
      u.id,
      {
        id: u.id,
        name: u.name,
        email: u.email,
        image: (u as { image?: string | null }).image ?? null,
      },
    ]),
  );
}

export function useUsers() {
  return useSWR<Map<string, BoardUser>>(SWR_KEYS.users, fetchUsers);
}
