import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
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
  beforeEach(() => vi.clearAllMocks());

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
});

describe("registerForPush", () => {
  beforeEach(() => vi.clearAllMocks());

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
  beforeEach(() => vi.clearAllMocks());

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
});

describe("unregisterForPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the token from the server", async () => {
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await unregisterForPush();
    expect(deviceApi.unregister).toHaveBeenCalledWith("tok-1");
  });
});
