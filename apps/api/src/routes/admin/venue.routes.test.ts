import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  searchVenues: vi.fn(),
}));

vi.mock("../../services/admin/venue-admin.service", () => ({
  searchVenues: mocks.searchVenues,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { venueRoutes } from "./venue.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono();
app.onError(errorHandler);
app.route("/", venueRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /venues/search", () => {
  it("returns matching venues", async () => {
    const venues = [
      { id: 1, name: "Sporthalle Mitte", street: "Hauptstr. 1", city: "Berlin" },
      { id: 2, name: "Sporthalle Nord", street: null, city: "Hamburg" },
    ];
    mocks.searchVenues.mockResolvedValue(venues);

    const res = await app.request("/venues/search?q=Sporthalle");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ venues });
    expect(mocks.searchVenues).toHaveBeenCalledWith("Sporthalle", 10);
  });

  it("passes custom limit", async () => {
    mocks.searchVenues.mockResolvedValue([]);

    const res = await app.request("/venues/search?q=Test&limit=5");

    expect(res.status).toBe(200);
    expect(mocks.searchVenues).toHaveBeenCalledWith("Test", 5);
  });

  it("returns empty array when no matches", async () => {
    mocks.searchVenues.mockResolvedValue([]);

    const res = await app.request("/venues/search?q=xyz");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ venues: [] });
  });

  it("returns 400 when q is missing", async () => {
    const res = await app.request("/venues/search");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when q is empty", async () => {
    const res = await app.request("/venues/search?q=");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when limit exceeds max", async () => {
    const res = await app.request("/venues/search?q=Test&limit=51");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when limit is zero", async () => {
    const res = await app.request("/venues/search?q=Test&limit=0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when limit is negative", async () => {
    const res = await app.request("/venues/search?q=Test&limit=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
