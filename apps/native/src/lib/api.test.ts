import { beforeEach, describe, expect, it, vi } from "vitest";

// `@dragons/api-client`'s ApiClient is exercised elsewhere in that package;
// here we only need to capture the config this module wires up so we can
// drive its `onResponse` hook directly, the way a real 401 would.
vi.mock("@dragons/api-client", () => ({
  ApiClient: vi.fn(function MockApiClient(this: unknown, options: unknown) {
    Object.assign(this as object, { __options: options });
  }),
  publicEndpoints: vi.fn(() => ({})),
  deviceEndpoints: vi.fn(() => ({})),
  refereeEndpoints: vi.fn(() => ({})),
  adminBoardEndpoints: vi.fn(() => ({})),
}));
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn().mockResolvedValue(undefined),
    getCookie: vi.fn(() => undefined),
  },
  resolveApiUrl: vi.fn(() => "http://localhost:3001"),
}));
vi.mock("@/lib/push/registration", () => ({
  unregisterForPush: vi.fn().mockResolvedValue(undefined),
}));
// `lib/api.ts` -> `lib/auth/sign-out.ts` -> `lib/swr-config.ts` ->
// `lib/swr-native-adapters.ts`, which imports these for real. Neither is
// invoked here (see sign-out.test.ts for why they're safe to leave inert).
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: vi.fn() },
}));
vi.mock("expo-network", () => ({ addNetworkStateListener: vi.fn() }));

import { ApiClient } from "@dragons/api-client";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";

function getOnResponse(): (response: Response) => Promise<void> {
  const ctorCall = vi.mocked(ApiClient).mock.calls[0];
  if (!ctorCall) throw new Error("ApiClient was not constructed");
  const options = ctorCall[0] as {
    onResponse: (response: Response) => Promise<void>;
  };
  return options.onResponse;
}

/**
 * Each test calls `vi.resetModules()` so `lib/api.ts`'s once-guard dedup
 * latch starts fresh. That also means a *new* `swrCache` Map is created each
 * time `lib/swr-config.ts` is re-evaluated — so `swrCache` must be imported
 * fresh, from the same reset generation, alongside `lib/api.ts` itself,
 * rather than once at the top of this file. Importing it separately still
 * resolves to the exact same instance `lib/api.ts`'s dependency chain uses,
 * because both imports land in the same post-reset module registry.
 */
async function loadApiUnderTest() {
  await vi.resetModules();
  const [{ apiClient }, { swrCache }] = await Promise.all([
    import("@/lib/api"),
    import("@/lib/swr-config"),
  ]);
  void apiClient; // constructed for its side effect of registering onResponse
  return { onResponse: getOnResponse(), swrCache };
}

function seed(swrCache: Map<string, { data?: unknown }>, key: string, data: unknown) {
  swrCache.set(key, { data });
}

describe("api.ts 401 handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authClient.signOut).mockResolvedValue(undefined as never);
    vi.mocked(unregisterForPush).mockResolvedValue(undefined);
  });

  it("deregisters the device's push token on a 401 (previously only the manual sign-out did this)", async () => {
    // Regression guard: silently-signed-out users must stop receiving push
    // for a device they no longer control the session on.
    const { onResponse } = await loadApiUnderTest();

    await onResponse({ status: 401 } as Response);

    expect(unregisterForPush).toHaveBeenCalledTimes(1);
  });

  it("wipes the app's actual SWR cache on a 401 so the next signed-in user can't read the previous session's data", async () => {
    const { onResponse, swrCache } = await loadApiUnderTest();

    seed(swrCache, "referee:games", { items: [{ id: 1, opponent: "Rival Referee Assignment" }] });
    seed(swrCache, "admin/boards/9/tasks", { items: [{ id: 2, title: "Confidential board task" }] });

    await onResponse({ status: 401 } as Response);

    expect(swrCache.has("referee:games")).toBe(false);
    expect(swrCache.has("admin/boards/9/tasks")).toBe(false);
  });

  it("navigates home and only runs the sign-out routine once for a concurrent burst of 401s", async () => {
    const { onResponse } = await loadApiUnderTest();

    await Promise.all([
      onResponse({ status: 401 } as Response),
      onResponse({ status: 401 } as Response),
      onResponse({ status: 401 } as Response),
    ]);

    expect(unregisterForPush).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("does not touch sign-out state for a non-401 response", async () => {
    const { onResponse } = await loadApiUnderTest();

    await onResponse({ status: 200 } as Response);

    expect(unregisterForPush).not.toHaveBeenCalled();
    expect(authClient.signOut).not.toHaveBeenCalled();
  });
});
