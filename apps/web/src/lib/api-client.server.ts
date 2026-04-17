import "server-only";
import { ApiClient, publicEndpoints } from "@dragons/api-client";

export function getPublicApi() {
  const baseUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";
  const client = new ApiClient({ baseUrl });
  return publicEndpoints(client);
}
