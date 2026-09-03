import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getLastNotificationResponseAsync: vi.fn(async () => null),
}));

import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import {
  SIGNED_OUT_FALLBACK,
  __resetPushHandlerStateForTests,
  configureNotificationHandler,
  followDeepLink,
  isPublicDeepLink,
  setPushAuthState,
  subscribeToTaps,
} from "@/lib/push/handler";
import { NOT_FOUND_ROUTE } from "@/lib/nav/href";
import { refereeGameRoute } from "@/lib/referee/einsatz";

type Tap = Parameters<Parameters<typeof Notifications.addNotificationResponseReceivedListener>[0]>[0];

function tapWith(data: unknown): Tap {
  return { notification: { request: { content: { data } } } } as unknown as Tap;
}

/** Fire the listener that `subscribeToTaps` registered. */
function fireLiveTap(data: unknown): void {
  const listener = vi.mocked(Notifications.addNotificationResponseReceivedListener).mock
    .calls[0]?.[0];
  if (!listener) throw new Error("no tap listener registered");
  listener(tapWith(data));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Notifications.addNotificationResponseReceivedListener).mockReturnValue({
    remove: vi.fn(),
  } as never);
  vi.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null as never);
  __resetPushHandlerStateForTests();
});

describe("configureNotificationHandler", () => {
  it("installs a foreground handler that shows the banner", async () => {
    configureNotificationHandler();
    const arg = vi.mocked(Notifications.setNotificationHandler).mock.calls[0]?.[0];
    expect(arg).toBeTruthy();
    const behaviour = await arg!.handleNotification!(tapWith({}).notification);
    expect(behaviour).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  });
});

describe("isPublicDeepLink", () => {
  it.each([["/"], ["/schedule"], ["/standings"], ["/teams"], ["/game/55"], ["/team/3"], ["/h2h/9"], ["/(tabs)/schedule"]])(
    "%s is reachable signed out",
    (link) => {
      expect(isPublicDeepLink(link)).toBe(true);
    },
  );

  it.each([["/officiating"], ["/today"], ["/referee-game/55"], ["/profile"], ["/admin/boards"], ["/assistant"]])(
    "%s needs a session",
    (link) => {
      expect(isPublicDeepLink(link)).toBe(false);
    },
  );
});

describe("followDeepLink while signed in", () => {
  beforeEach(() => setPushAuthState("signed-in"));

  it("follows a session-gated link straight away", () => {
    followDeepLink("/referee-game/55");
    expect(router.push).toHaveBeenCalledWith("/referee-game/55");
  });

  it.each([[""], ["   "], ["relative/path"], ["https://evil.example/x"]])(
    "ignores the unusable link %j",
    (link) => {
      followDeepLink(link);
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  // A payload is remote input and may name a screen this build does not have
  // (an older or newer app version, a typo). The router would land such a path
  // on `+not-found` anyway; sending it there deliberately keeps that outcome
  // while the push itself stays a route the type system knows.
  it.each([["/nope"], ["/game"], ["/game/55/box-score"]])(
    "lands the unroutable link %j on the not-found screen",
    (link) => {
      followDeepLink(link);
      expect(router.push).toHaveBeenCalledWith(NOT_FOUND_ROUTE);
    },
  );
});

// Every referee push routes by the referee game's own id, linked to a synced
// match or not — the API side of that is asserted in
// `apps/api/src/services/notifications/templates/push/referee-slots.test.ts`.
// This is the native half: such a link follows to the Einsatz screen (#307).
describe("referee push deep links", () => {
  it("follows a referee push to the Einsatz screen", () => {
    setPushAuthState("signed-in");
    followDeepLink(refereeGameRoute({ id: 7 }));
    expect(router.push).toHaveBeenCalledWith("/referee-game/7");
  });
});

describe("followDeepLink while signed out", () => {
  beforeEach(() => setPushAuthState("signed-out"));

  it("does not hold an unroutable link behind the sign-in screen", () => {
    followDeepLink("/nope");
    expect(router.push).toHaveBeenCalledWith(NOT_FOUND_ROUTE);
    expect(router.push).not.toHaveBeenCalledWith(SIGNED_OUT_FALLBACK);
  });

  it("does not navigate to a session-gated link", () => {
    followDeepLink("/referee-game/55");
    expect(router.push).not.toHaveBeenCalledWith("/referee-game/55");
  });

  it("sends the user to a valid public route instead", () => {
    followDeepLink("/referee-game/55");
    expect(router.push).toHaveBeenCalledWith(SIGNED_OUT_FALLBACK);
  });

  it("replays the held link once the session exists", () => {
    followDeepLink("/referee-game/55");
    vi.mocked(router.push).mockClear();
    setPushAuthState("signed-in");
    expect(router.push).toHaveBeenCalledWith("/referee-game/55");
  });

  it("only replays the held link once", () => {
    followDeepLink("/referee-game/55");
    setPushAuthState("signed-in");
    vi.mocked(router.push).mockClear();
    setPushAuthState("signed-in");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("still follows a public link immediately", () => {
    followDeepLink("/game/55");
    expect(router.push).toHaveBeenCalledWith("/game/55");
    expect(router.push).not.toHaveBeenCalledWith(SIGNED_OUT_FALLBACK);
  });
});

describe("followDeepLink before the session has resolved", () => {
  it("navigates nowhere while auth is still unknown", () => {
    followDeepLink("/referee-game/55");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("resolves the held link when the session turns out to exist", () => {
    followDeepLink("/referee-game/55");
    setPushAuthState("signed-in");
    expect(router.push).toHaveBeenCalledWith("/referee-game/55");
  });

  it("falls back to a public route when the user turns out to be signed out", () => {
    followDeepLink("/referee-game/55");
    setPushAuthState("signed-out");
    expect(router.push).toHaveBeenCalledWith(SIGNED_OUT_FALLBACK);
    expect(router.push).not.toHaveBeenCalledWith("/referee-game/55");
  });
});

describe("subscribeToTaps — live taps", () => {
  it("follows a tap whose payload carries a deep link", () => {
    setPushAuthState("signed-in");
    subscribeToTaps();
    fireLiveTap({ deepLink: "/game/55" });
    expect(router.push).toHaveBeenCalledWith("/game/55");
  });

  it("gates a session-gated tap that arrives while signed out", () => {
    setPushAuthState("signed-out");
    subscribeToTaps();
    fireLiveTap({ deepLink: "/officiating" });
    expect(router.push).not.toHaveBeenCalledWith("/officiating");
    expect(router.push).toHaveBeenCalledWith(SIGNED_OUT_FALLBACK);
  });

  it.each([[null], [undefined], [{}], [{ deepLink: 42 }], [{ deepLink: "" }]])(
    "ignores a tap with payload %j",
    (data) => {
      setPushAuthState("signed-in");
      subscribeToTaps();
      fireLiveTap(data);
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it("removes the listener on unsubscribe", () => {
    const remove = vi.fn();
    vi.mocked(Notifications.addNotificationResponseReceivedListener).mockReturnValue({
      remove,
    } as never);
    subscribeToTaps()();
    expect(remove).toHaveBeenCalled();
  });
});

describe("subscribeToTaps — cold start", () => {
  it("follows a cold-start tap once the session is known", async () => {
    vi.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(
      tapWith({ deepLink: "/referee-game/7" }) as never,
    );
    setPushAuthState("signed-in");
    subscribeToTaps();
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/referee-game/7"));
  });

  it("does not follow a cold-start tap while the session is still restoring", async () => {
    vi.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(
      tapWith({ deepLink: "/referee-game/7" }) as never,
    );
    subscribeToTaps();
    await vi.waitFor(() =>
      expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled(),
    );
    expect(router.push).not.toHaveBeenCalled();

    // …and it lands as soon as the restored session comes back signed in.
    setPushAuthState("signed-in");
    expect(router.push).toHaveBeenCalledWith("/referee-game/7");
  });

  it("does not follow a cold-start tap for a signed-out user", async () => {
    vi.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(
      tapWith({ deepLink: "/officiating" }) as never,
    );
    setPushAuthState("signed-out");
    subscribeToTaps();
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(SIGNED_OUT_FALLBACK));
    expect(router.push).not.toHaveBeenCalledWith("/officiating");
  });

  it("tolerates no cold-start tap at all", async () => {
    setPushAuthState("signed-in");
    subscribeToTaps();
    await vi.waitFor(() =>
      expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled(),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("processes the cached cold-start response only once across remounts", async () => {
    vi.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(
      tapWith({ deepLink: "/game/9" }) as never,
    );
    setPushAuthState("signed-in");
    subscribeToTaps()();
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    subscribeToTaps()();
    await Promise.resolve();
    expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

describe("setPushAuthState", () => {
  it("ignores a repeat of the state it is already in", () => {
    followDeepLink("/referee-game/55");
    setPushAuthState("signed-out");
    vi.mocked(router.push).mockClear();
    setPushAuthState("signed-out");
    expect(router.push).not.toHaveBeenCalled();
  });
});
