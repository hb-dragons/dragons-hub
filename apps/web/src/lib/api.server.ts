import "server-only";
import { cookies } from "next/headers";
import { ApiClient, createApi } from "@dragons/api-client";

export async function getServerApi() {
  const cookieHeader = (await cookies()).toString();
  const client = new ApiClient({
    baseUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    cache: "no-store",
    auth: {
      getHeaders: (): Record<string, string> =>
        cookieHeader ? { Cookie: cookieHeader } : {},
    },
  });
  return createApi(client);
}
