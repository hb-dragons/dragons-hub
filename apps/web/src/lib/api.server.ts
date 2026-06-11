import "server-only";
import { cookies } from "next/headers";
import { ApiClient, createApi, publicEndpoints } from "@dragons/api-client";

const baseUrl =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export async function getServerApi() {
  const cookieHeader = (await cookies()).toString();
  const client = new ApiClient({
    baseUrl,
    cache: "no-store",
    auth: {
      getHeaders: (): Record<string, string> =>
        cookieHeader ? { Cookie: cookieHeader } : {},
    },
  });
  return createApi(client);
}

/**
 * Cookie-free server client for the public (unauthenticated) endpoints. Public
 * pages stay statically renderable, so this deliberately does NOT read
 * `cookies()` — touching the cookie store would opt the page into dynamic
 * rendering. Use `getServerApi()` instead when a page needs the caller's auth.
 */
export function getPublicServerApi() {
  return publicEndpoints(new ApiClient({ baseUrl }));
}
