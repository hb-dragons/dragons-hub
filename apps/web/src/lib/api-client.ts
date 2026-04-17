import { ApiClient, publicEndpoints } from "@dragons/api-client";

const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  credentials: "include",
});

export const publicApi = publicEndpoints(apiClient);
