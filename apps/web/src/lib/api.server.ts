import "server-only";
import { cookies } from "next/headers";
import { ApiClient, createApi } from "@dragons/api-client";
import { fetchAPI } from "./api";

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

export async function fetchAPIServer<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetchAPI<T>(endpoint, {
    ...options,
    headers: { ...(cookieHeader ? { Cookie: cookieHeader } : {}), ...options?.headers },
  });
}
