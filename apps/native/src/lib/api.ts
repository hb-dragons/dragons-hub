import { router } from "expo-router";
import { mutate as globalMutate } from "swr";
import {
  ApiClient,
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
} from "@dragons/api-client";
import { authClient, resolveApiUrl } from "./auth-client";

const baseUrl = resolveApiUrl();

// De-duplicate the 401 recovery flow so a burst of concurrent authed requests
// can't trigger N sign-outs / navigations.
let unauthorizedInFlight: Promise<void> | null = null;

async function handleUnauthorized(): Promise<void> {
  if (unauthorizedInFlight) return unauthorizedInFlight;
  unauthorizedInFlight = (async () => {
    try {
      await authClient.signOut().catch(() => {});
      // Clear every SWR cache entry without revalidating so post-signOut
      // screens don't briefly show the previous user's data.
      await globalMutate(() => true, undefined, { revalidate: false });
      // `router` is a stable singleton from expo-router; safe to call outside
      // the React tree. `replace("/")` is a no-op if already on home.
      router.replace("/");
    } finally {
      unauthorizedInFlight = null;
    }
  })();
  return unauthorizedInFlight;
}

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
      await handleUnauthorized();
    }
  },
});

export const publicApi = publicEndpoints(apiClient);
export const deviceApi = deviceEndpoints(apiClient);
export const refereeApi = refereeEndpoints(apiClient);
