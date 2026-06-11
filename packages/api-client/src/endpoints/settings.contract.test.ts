import { describe, it, expect, vi } from "vitest";
import {
  settingsClubConfigSchema,
  settingsBookingConfigSchema,
  settingsRefereeReminderSchema,
  leagueNumbersSchema,
  leagueOwnClubRefsSchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { settingsEndpoints } from "./settings";

/** Build a client whose fetch records the outgoing request url + method + body. */
function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: settingsEndpoints(client), calls };
}

describe("settings request bodies satisfy @dragons/contracts schemas", () => {
  it("setClub body parses against settingsClubConfigSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setClub({ clubId: 42, clubName: "Dragons" });
    const parsed = settingsClubConfigSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "settingsClubConfigSchema rejected the setClub body",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("PUT");
  });

  it("setBooking body parses against settingsBookingConfigSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setBooking({
      bufferBefore: 60,
      bufferAfter: 60,
      gameDuration: 90,
      dueDaysBefore: 7,
    });
    const parsed = settingsBookingConfigSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "settingsBookingConfigSchema rejected the setBooking body",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("PUT");
  });

  it("setRefereeReminders body parses against settingsRefereeReminderSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setRefereeReminders({ days: [7, 3, 1] });
    const parsed = settingsRefereeReminderSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "settingsRefereeReminderSchema rejected the setRefereeReminders body",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("PUT");
  });

  it("setLeagues body parses against leagueNumbersSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setLeagues({ leagueNumbers: [12345, 67890] });
    const parsed = leagueNumbersSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "leagueNumbersSchema rejected the setLeagues body",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("PUT");
  });

  it("setLeagueOwnClubRefs body parses against leagueOwnClubRefsSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setLeagueOwnClubRefs(7, { ownClubRefs: true });
    const parsed = leagueOwnClubRefsSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "leagueOwnClubRefsSchema rejected the setLeagueOwnClubRefs body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/settings/leagues/7/own-club-refs");
    expect(calls[0]!.method).toBe("PATCH");
  });
});

describe("settings read + trigger endpoints target the right path + verb", () => {
  it("getClub targets the club config with GET", async () => {
    const { api, calls } = recordingClient();
    await api.getClub();
    expect(calls[0]!.url).toContain("/admin/settings/club");
    expect(calls[0]!.method).toBe("GET");
  });

  it("getBooking targets the booking config with GET", async () => {
    const { api, calls } = recordingClient();
    await api.getBooking();
    expect(calls[0]!.url).toContain("/admin/settings/booking");
    expect(calls[0]!.method).toBe("GET");
  });

  it("getRefereeReminders targets the referee-reminders config with GET", async () => {
    const { api, calls } = recordingClient();
    await api.getRefereeReminders();
    expect(calls[0]!.url).toContain("/admin/settings/referee-reminders");
    expect(calls[0]!.method).toBe("GET");
  });

  it("getLeagues targets the tracked leagues with GET", async () => {
    const { api, calls } = recordingClient();
    await api.getLeagues();
    expect(calls[0]!.url).toContain("/admin/settings/leagues");
    expect(calls[0]!.method).toBe("GET");
  });

  it("triggerRefereeGamesSync posts to the referee-games-sync endpoint", async () => {
    const { api, calls } = recordingClient();
    await api.triggerRefereeGamesSync();
    expect(calls[0]!.url).toContain("/admin/settings/referee-games-sync");
    expect(calls[0]!.method).toBe("POST");
  });
});
