import { beforeEach, describe, expect, it, vi } from "vitest";

// Leaf dependencies are mocked; the SWR cache itself is real — specifically
// `swrCache` from `swr-config.ts`, the exact Map instance `_layout.tsx`
// wires in as the app's `provider`. That is deliberately NOT the same object
// as `swr`'s own top-level `cache`/`mutate` (a separate default Map created
// at module init): once a custom `provider` is configured, nothing in the
// app reads from that default cache, so seeding *that* one and asserting
// against it would pass without proving anything about what a real screen
// would show the next user. `react-native`/`expo-network` are mocked only
// because `swr-config.ts` transitively imports `swr-native-adapters.ts`,
// which references them — neither is ever invoked here.
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/push/registration", () => ({
  unregisterForPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: vi.fn() },
}));
vi.mock("expo-network", () => ({ addNetworkStateListener: vi.fn() }));

import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";
import { swrCache } from "@/lib/swr-config";
import { performSignOut } from "@/lib/auth/sign-out";

/** Seed the real app cache the way a live screen would have populated it. */
function seed(key: string, data: unknown) {
  swrCache.set(key, { data });
}

describe("performSignOut", () => {
  beforeEach(() => {
    swrCache.clear();
    vi.clearAllMocks();
    vi.mocked(authClient.signOut).mockResolvedValue(undefined as never);
    vi.mocked(unregisterForPush).mockResolvedValue(undefined);
  });

  it("wipes every entry in the app's actual SWR cache so the next user can't read user A's data", async () => {
    seed("referee:games", { items: [{ id: 1, opponent: "Rival Club Referee" }] });
    seed("today:referee", { items: [{ id: 2, title: "Assigned: Cup Final" }] });
    seed("admin/boards", { items: [{ id: 3, name: "U16 Board" }] });
    seed("admin/boards/3/tasks", { items: [{ id: 4, title: "Set up scoreboard" }] });
    seed("admin/tasks/4", { data: { id: 4, title: "Set up scoreboard", assignee: "User A" } });

    await performSignOut();

    // This is the attacker's read: whatever the next signed-in user's screen
    // would pull straight out of the cache before its own revalidation lands.
    for (const key of [
      "referee:games",
      "today:referee",
      "admin/boards",
      "admin/boards/3/tasks",
      "admin/tasks/4",
    ]) {
      expect(swrCache.has(key)).toBe(false);
      expect(swrCache.get(key)?.data).toBeUndefined();
    }
  });

  it("does not leave unrelated future keys populated either (full wipe, not a denylist)", async () => {
    seed("some/future/endpoint/not/yet/invented", { items: ["whatever"] });

    await performSignOut();

    expect(swrCache.has("some/future/endpoint/not/yet/invented")).toBe(false);
  });

  it("deregisters the push token before clearing the auth session", async () => {
    const order: string[] = [];
    vi.mocked(unregisterForPush).mockImplementation(async () => {
      order.push("unregister-push");
    });
    vi.mocked(authClient.signOut).mockImplementation(async () => {
      order.push("sign-out");
      return undefined as never;
    });

    await performSignOut();

    expect(order).toEqual(["unregister-push", "sign-out"]);
  });

  it("navigates home", async () => {
    await performSignOut();
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("still clears the cache and navigates even if the sign-out network call rejects", async () => {
    seed("referee:games", { items: [{ id: 1 }] });
    vi.mocked(authClient.signOut).mockRejectedValueOnce(new Error("network down"));

    await performSignOut();

    expect(swrCache.has("referee:games")).toBe(false);
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
