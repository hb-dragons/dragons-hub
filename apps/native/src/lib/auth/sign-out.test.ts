import { beforeEach, describe, expect, it, vi } from "vitest";

// Leaf dependencies are mocked; the SWR cache itself is real so we can assert
// on its actual contents afterwards — an attacker reading the cache doesn't
// care whether `mutate` was "called", only whether the previous user's data
// is still sitting there.
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/push/registration", () => ({
  unregisterForPush: vi.fn().mockResolvedValue(undefined),
}));

import { cache } from "swr/_internal";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";
import { performSignOut } from "@/lib/auth/sign-out";

// The real global cache singleton, viewed as the plain Map it is at runtime —
// `Cache<Data>`'s public type doesn't expose `.clear()`, and internal state
// (`_k` etc.) isn't part of `State<Data>`, but we need both to seed/reset the
// exact object SWR's own `mutate` reads and writes.
const store = cache as unknown as Map<string, { data?: unknown }>;

/** Seed the real SWR cache the way a live screen would have populated it. */
function seed(key: string, data: unknown) {
  store.set(key, { data });
}

describe("performSignOut", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    vi.mocked(authClient.signOut).mockResolvedValue(undefined as never);
    vi.mocked(unregisterForPush).mockResolvedValue(undefined);
  });

  it("wipes every SWR cache entry so the next user can't read user A's data", async () => {
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
      expect(store.get(key)?.data).toBeUndefined();
    }
  });

  it("does not leave unrelated future keys populated either (full wipe, not a denylist)", async () => {
    seed("some/future/endpoint/not/yet/invented", { items: ["whatever"] });

    await performSignOut();

    expect(store.get("some/future/endpoint/not/yet/invented")?.data).toBeUndefined();
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

    expect(store.get("referee:games")?.data).toBeUndefined();
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
