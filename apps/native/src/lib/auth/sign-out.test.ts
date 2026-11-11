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
vi.mock("expo-router", () => ({
  router: { replace: vi.fn(), canDismiss: vi.fn(() => false), dismissAll: vi.fn() },
}));
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
import { SWRGlobalState, initCache } from "swr/_internal";
import { bindSWRCacheMutate, swrCache, swrConfig } from "@/lib/swr-config";
import { performSignOut } from "@/lib/auth/sign-out";

// SWR's own state for the app cache, as `<SWRConfig value={swrConfig}>` sets
// it up: the cache-bound mutate the root layout hands to `swr-config.ts`, and
// the table of revalidators that mounted `useSWR` hooks register in.
const [, cacheMutate] = initCache(swrCache, swrConfig)!;
const revalidators = SWRGlobalState.get(swrCache)![0] as Record<string, ((event: number) => Promise<boolean>)[]>;

/** Seed the real app cache the way a live screen would have populated it. */
function seed(key: string, data: unknown) {
  swrCache.set(key, { data, _k: key });
}

/** A screen that is on display, reading `key`: its hook's revalidator. */
function mountScreen(key: string) {
  const revalidate = vi.fn().mockResolvedValue(true);
  revalidators[key] = [revalidate];
  return revalidate;
}

describe("performSignOut", () => {
  beforeEach(() => {
    swrCache.clear();
    for (const key of Object.keys(revalidators)) delete revalidators[key];
    bindSWRCacheMutate(cacheMutate);
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
      expect(swrCache.get(key)?.data).toBeUndefined();
    }
  });

  it("does not leave unrelated future keys populated either (full wipe, not a denylist)", async () => {
    seed("some/future/endpoint/not/yet/invented", { items: ["whatever"] });

    await performSignOut();

    expect(swrCache.get("some/future/endpoint/not/yet/invented")?.data).toBeUndefined();
  });

  // The bug behind the endless spinner on Home, Tabelle and Teams after a
  // sign-out: `swrCache.clear()` emptied the Map behind SWR's back. Mounted
  // hooks were not told, started no request, and on their next render read an
  // empty entry — `isLoading` with nothing in flight, until the app restarted.
  it("tells every screen on display to fetch again", async () => {
    seed("teams:all", { items: [{ id: 1 }] });
    const teams = mountScreen("teams:all");

    await performSignOut();

    expect(teams).toHaveBeenCalled();
    expect(swrCache.get("teams:all")?.data).toBeUndefined();
  });

  it("does not wait for those fetches before navigating home", async () => {
    seed("teams:all", { items: [{ id: 1 }] });
    revalidators["teams:all"] = [() => new Promise<boolean>(() => {})];

    await performSignOut();

    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("still wipes the cache before the tree has mounted SWR", async () => {
    bindSWRCacheMutate(null);
    seed("referee:games", { items: [{ id: 1 }] });

    await performSignOut();

    expect(swrCache.has("referee:games")).toBe(false);
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

  // Sign-out runs from the Profile sheet. Replacing from there swapped the
  // sheet for a second tab bar stacked over the first.
  it("closes the sheet it was started from before navigating home", async () => {
    vi.mocked(router.canDismiss).mockReturnValueOnce(true);
    await performSignOut();
    expect(router.dismissAll).toHaveBeenCalledOnce();
    expect(vi.mocked(router.dismissAll).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(router.replace).mock.invocationCallOrder[0]!,
    );
  });

  it("still clears the cache and navigates even if the sign-out network call rejects", async () => {
    seed("referee:games", { items: [{ id: 1 }] });
    vi.mocked(authClient.signOut).mockRejectedValueOnce(new Error("network down"));

    await performSignOut();

    expect(swrCache.get("referee:games")?.data).toBeUndefined();
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
