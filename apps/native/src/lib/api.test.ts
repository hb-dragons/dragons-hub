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

import { cache } from "swr/_internal";
import { ApiClient } from "@dragons/api-client";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";

// See sign-out.test.ts: viewed as the plain Map it is at runtime so we can
// seed/reset/read the exact singleton SWR's own `mutate` operates on.
const store = cache as unknown as Map<string, { data?: unknown }>;

function seed(key: string, data: unknown) {
  store.set(key, { data });
}

function getOnResponse(): (response: Response) => Promise<void> {
  const ctorCall = vi.mocked(ApiClient).mock.calls[0];
  if (!ctorCall) throw new Error("ApiClient was not constructed");
  const options = ctorCall[0] as {
    onResponse: (response: Response) => Promise<void>;
  };
  return options.onResponse;
}

describe("api.ts 401 handling", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    vi.mocked(authClient.signOut).mockResolvedValue(undefined as never);
    vi.mocked(unregisterForPush).mockResolvedValue(undefined);
  });

  it("deregisters the device's push token on a 401 (previously only the manual sign-out did this)", async () => {
    // Regression guard: silently-signed-out users must stop receiving push
    // for a device they no longer control the session on.
    await vi.resetModules();
    const { apiClient } = await import("@/lib/api");
    void apiClient; // constructed for its side effect of registering onResponse
    const onResponse = getOnResponse();

    await onResponse({ status: 401 } as Response);

    expect(unregisterForPush).toHaveBeenCalledTimes(1);
  });

  it("wipes the SWR cache on a 401 so the next signed-in user can't read the previous session's data", async () => {
    await vi.resetModules();
    const { apiClient } = await import("@/lib/api");
    void apiClient;
    const onResponse = getOnResponse();

    seed("referee:games", { items: [{ id: 1, opponent: "Rival Referee Assignment" }] });
    seed("admin/boards/9/tasks", { items: [{ id: 2, title: "Confidential board task" }] });

    await onResponse({ status: 401 } as Response);

    expect(store.get("referee:games")?.data).toBeUndefined();
    expect(store.get("admin/boards/9/tasks")?.data).toBeUndefined();
  });

  it("navigates home and only runs the sign-out routine once for a concurrent burst of 401s", async () => {
    await vi.resetModules();
    const { apiClient } = await import("@/lib/api");
    void apiClient;
    const onResponse = getOnResponse();

    await Promise.all([
      onResponse({ status: 401 } as Response),
      onResponse({ status: 401 } as Response),
      onResponse({ status: 401 } as Response),
    ]);

    expect(unregisterForPush).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("does not touch sign-out state for a non-401 response", async () => {
    await vi.resetModules();
    const { apiClient } = await import("@/lib/api");
    void apiClient;
    const onResponse = getOnResponse();

    await onResponse({ status: 200 } as Response);

    expect(unregisterForPush).not.toHaveBeenCalled();
    expect(authClient.signOut).not.toHaveBeenCalled();
  });
});
