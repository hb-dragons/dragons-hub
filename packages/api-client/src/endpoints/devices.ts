import type { ApiClient } from "../client";

export interface RegisterDeviceResponse {
  success: boolean;
}

export interface UnregisterDeviceResponse {
  success: boolean;
}

export function deviceEndpoints(client: ApiClient) {
  return {
    register(
      token: string,
      platform: "ios" | "android",
    ): Promise<RegisterDeviceResponse> {
      return client.post("/api/devices/register", { token, platform });
    },

    unregister(token: string): Promise<UnregisterDeviceResponse> {
      return client.delete(`/api/devices/${encodeURIComponent(token)}`);
    },
  };
}
