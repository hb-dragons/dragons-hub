import { describe, it, expect, vi } from "vitest";
import {
  bookingListQuerySchema,
  bookingCreateBodySchema,
  bookingUpdateBodySchema,
  bookingStatusBodySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { bookingEndpoints } from "./booking";

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
  return { api: bookingEndpoints(client), calls };
}

describe("booking request bodies + queries satisfy @dragons/contracts schemas", () => {
  it("list query parses against bookingListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({ status: "confirmed", dateFrom: "2026-06-01", dateTo: "2026-06-30" });
    const url = new URL(calls[0]!.url);
    const parsed = bookingListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "bookingListQuerySchema rejected the list query",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("GET");
  });

  it("create body parses against bookingCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({
      venueId: 12,
      date: "2026-06-15",
      overrideStartTime: "18:00:00",
      overrideEndTime: "20:00:00",
      overrideReason: "Tournament",
      notes: "Bring extra balls",
      matchIds: [1, 2, 3],
    });
    const parsed = bookingCreateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "bookingCreateBodySchema rejected the create body",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("POST");
  });

  it("update body parses against bookingUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, {
      overrideStartTime: "19:00:00",
      overrideEndTime: "21:00:00",
      overrideReason: "Late start",
      status: "confirmed",
      notes: null,
    });
    const parsed = bookingUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "bookingUpdateBodySchema rejected the update body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/bookings/7");
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("updateStatus body parses against bookingStatusBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateStatus(7, { status: "cancelled" });
    const parsed = bookingStatusBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "bookingStatusBodySchema rejected the updateStatus body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/bookings/7/status");
    expect(calls[0]!.method).toBe("PATCH");
  });
});

describe("booking read + reconcile endpoints target the right path + verb", () => {
  it("get targets the booking detail with GET", async () => {
    const { api, calls } = recordingClient();
    await api.get(42);
    expect(calls[0]!.url).toContain("/admin/bookings/42");
    expect(calls[0]!.method).toBe("GET");
  });

  it("delete targets the booking with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.delete(42);
    expect(calls[0]!.url).toContain("/admin/bookings/42");
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("previewReconcile targets the reconcile preview with GET", async () => {
    const { api, calls } = recordingClient();
    await api.previewReconcile();
    expect(calls[0]!.url).toContain("/admin/bookings/reconcile/preview");
    expect(calls[0]!.method).toBe("GET");
  });

  it("applyReconcile posts to the reconcile endpoint", async () => {
    const { api, calls } = recordingClient();
    await api.applyReconcile();
    expect(calls[0]!.url).toContain("/admin/bookings/reconcile");
    expect(calls[0]!.method).toBe("POST");
  });
});
