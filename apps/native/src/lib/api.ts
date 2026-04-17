import {
  ApiClient,
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
} from "@dragons/api-client";
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
  onResponse: async (response) => {
    if (response.status === 401) {
      await authClient.signOut().catch(() => {});
    }
  },
});

export const publicApi = publicEndpoints(apiClient);
export const deviceApi = deviceEndpoints(apiClient);
export const refereeApi = refereeEndpoints(apiClient);
