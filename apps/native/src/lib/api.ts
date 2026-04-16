import { ApiClient, publicEndpoints, deviceEndpoints } from "@dragons/api-client";
import { authClient } from "./auth-client";

const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = new ApiClient({
  baseUrl,
  auth: {
    getHeaders() {
      const cookie = authClient.getCookie();
      if (cookie) {
        return { Cookie: cookie };
      }
      return {} as Record<string, string>;
    },
  },
});

export const publicApi = publicEndpoints(apiClient);
export const deviceApi = deviceEndpoints(apiClient);
