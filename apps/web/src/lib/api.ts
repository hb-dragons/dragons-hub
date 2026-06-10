import { ApiClient, createApi, APIError } from "@dragons/api-client";

export const browserClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  credentials: "include",
});

export const api = createApi(browserClient);
export { APIError };
