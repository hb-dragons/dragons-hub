import {
  ApiClient,
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  adminBoardEndpoints,
  meEndpoints,
} from "@dragons/api-client";
import { authClient, resolveApiUrl } from "./auth-client";
import { createOnceGuard } from "./auth/once-guard";
import { performSignOut } from "./auth/sign-out";

const baseUrl = resolveApiUrl();

// De-duplicate the 401 recovery flow so a burst of concurrent authed requests
// can't trigger N sign-outs / navigations. Runs the same sign-out routine as
// the manual "Sign Out" action (deregister push, clear session, wipe the SWR
// cache, navigate home) so a silently-expired session can't keep receiving
// push or leak its cached data to the next user on this device.
const handleUnauthorized = createOnceGuard(performSignOut);

export const apiClient = new ApiClient({
  baseUrl,
  auth: {
    // better-auth 1.7 made the Expo client's getCookie async (it reads from
    // SecureStore); ApiClient awaits getHeaders, so awaiting here is free.
    async getHeaders() {
      const cookie = await authClient.getCookie();
      if (cookie) {
        return { Cookie: cookie };
      }
      return {} as Record<string, string>;
    },
  },
  onResponse: async (response) => {
    if (response.status === 401) {
      await handleUnauthorized();
    }
  },
});

export const publicApi = publicEndpoints(apiClient);
export const deviceApi = deviceEndpoints(apiClient);
export const refereeApi = refereeEndpoints(apiClient);
export const adminBoardApi = adminBoardEndpoints(apiClient);
export const meApi = meEndpoints(apiClient);
