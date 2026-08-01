import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks (hoisted before imports) ---
//
// The service is mocked wholesale: its behavior (row, mail, rate window) has
// its own PGlite suite in services/public/probetraining.service.test.ts. This
// file tests the HTTP contract — status codes, the honeypot's fake success,
// and which IP the service is handed.

const mocks = vi.hoisted(() => ({ submitProbetraining: vi.fn() }));

vi.mock("../../services/public/probetraining.service", () => ({
  submitProbetraining: mocks.submitProbetraining,
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// --- Imports (after mocks) ---

import { routes } from "../index";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    month: "Januar",
    year: 2012,
    didPlay: true,
    gender: "männlich",
    mail: "eltern@example.de",
    message: "Mein Kind würde gerne vorbeikommen.",
    acceptedPrivacy: true,
    website: "",
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://api.test/public/probetraining", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submitProbetraining.mockResolvedValue("accepted");
});

describe("POST /public/probetraining", () => {
  it("answers 201 { ok: true } for a valid submission", async () => {
    const response = await routes.request(post(validBody()));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("hands the service the validated body and the client IP", async () => {
    await routes.request(
      post(validBody(), { "x-forwarded-for": "203.0.113.7" }),
    );

    expect(mocks.submitProbetraining).toHaveBeenCalledWith(
      expect.objectContaining({ month: "Januar", year: 2012, mail: "eltern@example.de" }),
      "203.0.113.7",
    );
  });

  // GCP's load balancer appends "<client-ip>, <lb-ip>" to the header; the
  // trusted client IP is the second-to-last entry (see trustForwardedFor).
  it("rate-limits on the proxy-trusted client IP, not a spoofable prefix", async () => {
    await routes.request(
      post(validBody(), { "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1" }),
    );

    expect(mocks.submitProbetraining).toHaveBeenCalledWith(expect.anything(), "203.0.113.7");
  });

  it('falls back to a shared "unknown" bucket without a forwarded header', async () => {
    await routes.request(post(validBody()));

    expect(mocks.submitProbetraining).toHaveBeenCalledWith(expect.anything(), "unknown");
  });

  it("answers 429 with Retry-After when the service reports the window is spent", async () => {
    mocks.submitProbetraining.mockResolvedValue("rate_limited");

    const response = await routes.request(post(validBody()));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(await response.json()).toEqual({ error: "Too many requests", code: "RATE_LIMITED" });
  });

  it("keeps the dropped outcome indistinguishable from success", async () => {
    mocks.submitProbetraining.mockResolvedValue("dropped");

    const response = await routes.request(post(validBody()));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects an invalid body with the shared validation envelope", async () => {
    const response = await routes.request(post(validBody({ acceptedPrivacy: false })));
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mocks.submitProbetraining).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await routes.request(post("not json at all"));

    expect(response.status).toBe(400);
    expect(mocks.submitProbetraining).not.toHaveBeenCalled();
  });
});

describe("POST /public/probetraining — honeypot", () => {
  // A filled honeypot must not produce the validation 400 the schema would
  // give it — a distinguishable answer teaches the bot which field to clear.
  it("answers a filled honeypot with the same fake 201 as a real submission", async () => {
    const response = await routes.request(
      post(validBody({ website: "https://spam.example" })),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("does no work for a filled honeypot", async () => {
    await routes.request(post(validBody({ website: "https://spam.example" })));

    expect(mocks.submitProbetraining).not.toHaveBeenCalled();
  });
});
