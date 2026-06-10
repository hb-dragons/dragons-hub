import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
}));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "de-DE" }] }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));
vi.mock("../api", () => ({ deviceApi: { register: vi.fn(), unregister: vi.fn() } }));

import * as Notifications from "expo-notifications";
import { deviceApi } from "../api";
import { registerForPush, unregisterForPush } from "@/lib/push/registration";

describe("registerForPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the token when permission is already granted", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await registerForPush();
    expect(deviceApi.register).toHaveBeenCalledWith("tok-1", "ios", "de-DE");
  });

  it("requests permission when not yet granted, then bails if denied", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined" } as never);
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    await registerForPush();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
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
