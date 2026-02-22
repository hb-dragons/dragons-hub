import "server-only";
import { cookies } from "next/headers";
import { fetchAPI } from "./api";

export async function fetchAPIServer<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return fetchAPI<T>(endpoint, {
    ...options,
    headers: {
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...options?.headers,
    },
  });
}
