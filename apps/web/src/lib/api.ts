import { ApiClient, createApi, APIError } from "@dragons/api-client";

export const browserClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  credentials: "include",
});

export const api = createApi(browserClient);
export { APIError };

function getBaseURL(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  }
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const baseURL = getBaseURL();
  const url = `${baseURL}${endpoint}`;
  const isServer = typeof window === "undefined";
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    ...(isServer ? { cache: "no-store" as const } : {}),
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new APIError(res.status, body.code || "UNKNOWN_ERROR", body.message || body.error || res.statusText);
  }
  return res.json() as Promise<T>;
}
