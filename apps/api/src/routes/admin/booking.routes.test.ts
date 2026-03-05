import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listBookings: vi.fn(),
  getBookingDetail: vi.fn(),
  updateBooking: vi.fn(),
  updateBookingStatus: vi.fn(),
  createBooking: vi.fn(),
  deleteBooking: vi.fn(),
  previewReconciliation: vi.fn(),
  reconcileAfterSync: vi.fn(),
}));

vi.mock("../../services/admin/booking-admin.service", () => ({
  listBookings: mocks.listBookings,
  getBookingDetail: mocks.getBookingDetail,
  updateBooking: mocks.updateBooking,
  updateBookingStatus: mocks.updateBookingStatus,
  createBooking: mocks.createBooking,
  deleteBooking: mocks.deleteBooking,
}));

vi.mock("../../services/venue-booking/venue-booking.service", () => ({
  previewReconciliation: mocks.previewReconciliation,
  reconcileAfterSync: mocks.reconcileAfterSync,
}));

vi.mock("../../config/logger", () => ({
  logger: {
    error: vi.fn(),
    child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  },
}));

// --- Imports (after mocks) ---

import { bookingRoutes } from "./booking.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", bookingRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /bookings", () => {
  it("returns all bookings", async () => {
    const bookings = [{ id: 1, venueName: "Main Hall", date: "2025-03-15" }];
    mocks.listBookings.mockResolvedValue(bookings);

    const res = await app.request("/bookings");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(bookings);
    expect(mocks.listBookings).toHaveBeenCalledWith({});
  });

  it("returns empty array when no bookings", async () => {
    mocks.listBookings.mockResolvedValue([]);

    const res = await app.request("/bookings");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });

  it("passes status filter to service", async () => {
    mocks.listBookings.mockResolvedValue([]);

    await app.request("/bookings?status=confirmed");

    expect(mocks.listBookings).toHaveBeenCalledWith({
      status: "confirmed",
    });
  });

  it("passes date range filters to service", async () => {
    mocks.listBookings.mockResolvedValue([]);

    await app.request("/bookings?dateFrom=2025-01-01&dateTo=2025-12-31");

    expect(mocks.listBookings).toHaveBeenCalledWith({
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
    });
  });

  it("passes all filters to service", async () => {
    mocks.listBookings.mockResolvedValue([]);

    await app.request("/bookings?status=pending&dateFrom=2025-03-01&dateTo=2025-03-31");

    expect(mocks.listBookings).toHaveBeenCalledWith({
      status: "pending",
      dateFrom: "2025-03-01",
      dateTo: "2025-03-31",
    });
  });

  it("returns 400 for invalid status filter", async () => {
    const res = await app.request("/bookings?status=invalid");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/bookings?dateFrom=01-01-2025");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /bookings/:id", () => {
  it("returns booking detail", async () => {
    const detail = {
      id: 1,
      venueName: "Main Hall",
      matches: [{ id: 100, matchNo: 42 }],
    };
    mocks.getBookingDetail.mockResolvedValue(detail);

    const res = await app.request("/bookings/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(detail);
    expect(mocks.getBookingDetail).toHaveBeenCalledWith(1);
  });

  it("returns 404 when booking not found", async () => {
    mocks.getBookingDetail.mockResolvedValue(null);

    const res = await app.request("/bookings/999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/bookings/0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/bookings/abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /bookings/:id", () => {
  it("updates booking and returns result", async () => {
    const updated = { id: 1, notes: "Updated", status: "pending" };
    mocks.updateBooking.mockResolvedValue(updated);

    const res = await app.request("/bookings/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateBooking).toHaveBeenCalledWith(1, { notes: "Updated" });
  });

  it("updates override times", async () => {
    mocks.updateBooking.mockResolvedValue({ id: 1 });

    await app.request("/bookings/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overrideStartTime: "13:00",
        overrideEndTime: "18:00",
        overrideReason: "Extended session",
      }),
    });

    expect(mocks.updateBooking).toHaveBeenCalledWith(1, {
      overrideStartTime: "13:00",
      overrideEndTime: "18:00",
      overrideReason: "Extended session",
    });
  });

  it("returns 404 when booking not found", async () => {
    mocks.updateBooking.mockResolvedValue(null);

    const res = await app.request("/bookings/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Test" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/bookings/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid time format", async () => {
    const res = await app.request("/bookings/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrideStartTime: "1300" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid status in update", async () => {
    const res = await app.request("/bookings/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for notes exceeding max length", async () => {
    const res = await app.request("/bookings/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "x".repeat(1001) }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /bookings/:id/status", () => {
  it("updates status and returns result", async () => {
    const updated = { id: 1, status: "confirmed" };
    mocks.updateBookingStatus.mockResolvedValue(updated);

    const res = await app.request("/bookings/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateBookingStatus).toHaveBeenCalledWith(1, "confirmed");
  });

  it("returns 404 when booking not found", async () => {
    mocks.updateBookingStatus.mockResolvedValue(null);

    const res = await app.request("/bookings/999/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid status", async () => {
    const res = await app.request("/bookings/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for missing status", async () => {
    const res = await app.request("/bookings/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/bookings/abc/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /bookings", () => {
  it("creates booking and returns 201", async () => {
    const created = { id: 1, venueId: 10, date: "2025-03-15" };
    mocks.createBooking.mockResolvedValue(created);

    const res = await app.request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: 10,
        date: "2025-03-15",
        overrideStartTime: "14:00",
        overrideEndTime: "17:00",
      }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(created);
    expect(mocks.createBooking).toHaveBeenCalledWith({
      venueId: 10,
      date: "2025-03-15",
      overrideStartTime: "14:00",
      overrideEndTime: "17:00",
    });
  });

  it("returns 409 when venue not found or duplicate", async () => {
    mocks.createBooking.mockResolvedValue(null);

    const res = await app.request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: 999,
        date: "2025-03-15",
        overrideStartTime: "14:00",
        overrideEndTime: "17:00",
      }),
    });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "CONFLICT" });
  });

  it("returns 400 for invalid body", async () => {
    const res = await app.request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId: "abc" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId: 10 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("passes matchIds to service", async () => {
    mocks.createBooking.mockResolvedValue({ id: 1 });

    await app.request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: 10,
        date: "2025-03-15",
        overrideStartTime: "14:00",
        overrideEndTime: "17:00",
        matchIds: [100, 200],
      }),
    });

    expect(mocks.createBooking).toHaveBeenCalledWith({
      venueId: 10,
      date: "2025-03-15",
      overrideStartTime: "14:00",
      overrideEndTime: "17:00",
      matchIds: [100, 200],
    });
  });
});

describe("DELETE /bookings/:id", () => {
  it("deletes booking and returns success", async () => {
    mocks.deleteBooking.mockResolvedValue(true);

    const res = await app.request("/bookings/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteBooking).toHaveBeenCalledWith(1);
  });

  it("returns 404 when booking not found", async () => {
    mocks.deleteBooking.mockResolvedValue(false);

    const res = await app.request("/bookings/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/bookings/abc", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
