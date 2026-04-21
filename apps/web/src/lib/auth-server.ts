import "server-only";
import { headers } from "next/headers";

export type ServerSessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  refereeId: number | null;
};

export type ServerSession = {
  user: ServerSessionUser;
  session: { id: string; expiresAt: string };
};

// Fetches the current session from the API by forwarding the request cookie.
// Returns null for unauthenticated requests or network/auth failures.
export async function getServerSession(): Promise<ServerSession | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;

  try {
    const res = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== "object" || !("user" in json)) return null;
    return json as ServerSession;
  } catch {
    return null;
  }
}
