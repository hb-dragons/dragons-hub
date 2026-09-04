import { describe, it, expect, vi } from "vitest";
import { meStaffUpdateBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { meEndpoints } from "./me";

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
  return { api: meEndpoints(client), calls };
}

describe("self-service staff request bodies satisfy @dragons/contracts schemas", () => {
  it("full patch parses against meStaffUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateStaff({
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });
    const parsed = meStaffUpdateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "meStaffUpdateBodySchema rejected the patch body").toBeUndefined();
    expect(calls[0]!.url).toContain("/me/staff");
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("cleared fields parse against meStaffUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateStaff({ phone: null, email: null, licence: null });
    const parsed = meStaffUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "meStaffUpdateBodySchema rejected the cleared patch body",
    ).toBeUndefined();
  });

  it("reads the record with GET", async () => {
    const { api, calls } = recordingClient();
    await api.staff();
    expect(calls[0]!.url).toContain("/me/staff");
    expect(calls[0]!.method).toBe("GET");
  });
});
