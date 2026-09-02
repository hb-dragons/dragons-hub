import { describe, it, expect, vi } from "vitest";
import { teamStaffCreateBodySchema, teamStaffUpdateBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { teamStaffEndpoints } from "./team-staff";

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
  return { api: teamStaffEndpoints(client), calls };
}

describe("team staff request bodies satisfy @dragons/contracts schemas", () => {
  it("create body parses against teamStaffCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.create(7, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      refereeContact: true,
    });
    const parsed = teamStaffCreateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamStaffCreateBodySchema rejected the create body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/teams/7/staff");
    expect(calls[0]!.method).toBe("POST");
  });

  it("minimal create body parses against teamStaffCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.create(7, { firstName: "Ada", lastName: "Lovelace", role: "co_trainer" });
    const parsed = teamStaffCreateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamStaffCreateBodySchema rejected the minimal create body",
    ).toBeUndefined();
  });

  it("create body with nulls parses against teamStaffCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.create(7, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: null,
      email: null,
      licence: null,
    });
    const parsed = teamStaffCreateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamStaffCreateBodySchema rejected the create body with nulls",
    ).toBeUndefined();
  });

  it("update body parses against teamStaffUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, 12, {
      firstName: "Ada",
      lastName: "Byron",
      role: "co_trainer",
      phone: "",
      email: "",
      licence: null,
      refereeContact: false,
    });
    const parsed = teamStaffUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamStaffUpdateBodySchema rejected the update body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/teams/7/staff/12");
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("toggle-only update body parses against teamStaffUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, 12, { refereeContact: true });
    const parsed = teamStaffUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamStaffUpdateBodySchema rejected the toggle-only update body",
    ).toBeUndefined();
  });
});

describe("team staff read and delete endpoints target the right path + verb", () => {
  it("list targets the staff collection with GET", async () => {
    const { api, calls } = recordingClient();
    await api.list(7);
    expect(calls[0]!.url).toContain("/admin/teams/7/staff");
    expect(calls[0]!.method).toBe("GET");
  });

  it("remove targets the staff member with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.remove(7, 12);
    expect(calls[0]!.url).toContain("/admin/teams/7/staff/12");
    expect(calls[0]!.method).toBe("DELETE");
  });
});
