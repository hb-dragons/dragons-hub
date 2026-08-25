import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable so a single test can flip the two early-return guards
// (`Device.isDevice`, the EAS projectId) without re-mocking the module.
const env = vi.hoisted(() => ({
  isDevice: true,
  projectId: "proj-1" as string | undefined,
}));
vi.mock("expo-device", () => ({
  get isDevice() {
    return env.isDevice;
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: env.projectId } } };
    },
  },
}));
vi.mock("expo-localization", () => ({ getLocales: vi.fn(() => [{ languageTag: "de-DE" }]) }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));
vi.mock("../api", () => ({ deviceApi: { register: vi.fn(), unregister: vi.fn() } }));

import * as Notifications from "expo-notifications";
import { getLocales } from "expo-localization";
import { deviceApi } from "../api";
import {
  getPushPermissionStatus,
  registerForPush,
  requestPushPermissionAndRegister,
  unregisterForPush,
} from "@/lib/push/registration";

describe("getPushPermissionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.isDevice = true;
    env.projectId = "proj-1";
  });

  it.each([
    [{ status: "granted", canAskAgain: true }, "granted"],
    [{ status: "undetermined", canAskAgain: true }, "undetermined"],
    [{ status: "denied", canAskAgain: false }, "denied"],
    // iOS reports "undetermined" with canAskAgain=false after a hard deny.
    [{ status: "undetermined", canAskAgain: false }, "denied"],
  ])("maps %o to %s", async (permission, expected) => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission as never);
    expect(await getPushPermissionStatus()).toBe(expected);
  });

  it("reports denied and warns when the OS read throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Notifications.getPermissionsAsync).mockRejectedValue(new Error("boom"));
    expect(await getPushPermissionStatus()).toBe("denied");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("registerForPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.isDevice = true;
    env.projectId = "proj-1";
  });

  it("registers the token when permission is already granted", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await registerForPush();
    expect(deviceApi.register).toHaveBeenCalledWith("tok-1", "ios", "de-DE");
  });

  it("never triggers the OS prompt itself (the pre-permission sheet does, #237)", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined", canAskAgain: true } as never);
    await registerForPush();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(deviceApi.register).not.toHaveBeenCalled();
  });

  it("passes undefined as locale when getLocales returns empty array", async () => {
    vi.mocked(getLocales).mockReturnValueOnce([] as never);
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-2" } as never);
    await registerForPush();
    expect(deviceApi.register).toHaveBeenCalledWith("tok-2", "ios", undefined);
  });

  it("swallows a token failure with a warning (a build without FCM keeps working)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValue(new Error("no FCM"));
    await registerForPush();
    expect(deviceApi.register).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("requestPushPermissionAndRegister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.isDevice = true;
    env.projectId = "proj-1";
  });

  it("prompts, and registers on grant", async () => {
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-3" } as never);
    expect(await requestPushPermissionAndRegister()).toBe("granted");
    expect(deviceApi.register).toHaveBeenCalledWith("tok-3", "ios", "de-DE");
  });

  it("prompts, and does not register on denial", async () => {
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    expect(await requestPushPermissionAndRegister()).toBe("denied");
    expect(deviceApi.register).not.toHaveBeenCalled();
  });

  it("reports denied and warns when the prompt itself rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Notifications.requestPermissionsAsync).mockRejectedValue(new Error("boom"));
    expect(await requestPushPermissionAndRegister()).toBe("denied");
    expect(warn).toHaveBeenCalled();
    expect(deviceApi.register).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports denied on a simulator without asking the OS", async () => {
    env.isDevice = false;
    expect(await requestPushPermissionAndRegister()).toBe("denied");
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("reports denied and warns when the EAS projectId is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    env.projectId = undefined;
    expect(await requestPushPermissionAndRegister()).toBe("denied");
    expect(warn).toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("unregisterForPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.isDevice = true;
    env.projectId = "proj-1";
  });

  it("deletes the token from the server", async () => {
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await unregisterForPush();
    expect(deviceApi.unregister).toHaveBeenCalledWith("tok-1");
  });
});
