import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---
//
// The route, the auth gate, the service and the database are real (PGlite), so
// every acceptance criterion of #400 is asserted as HTTP response plus table
// state. Only the session, the env and the SMTP transport are doubles: a test
// must never open a socket to a relay.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
  warn: vi.fn(),
}));
const envState = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mocks.getSession(...args) } },
}));

vi.mock("../../config/env", () => ({ env: envState.env }));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({ error: vi.fn(), warn: mocks.warn, info: vi.fn(), debug: vi.fn() })),
  },
}));

// --- Imports (after mocks) ---

import { meAccountClosureRoutes } from "./account-closure.routes";
import { errorHandler } from "../../middleware/error";
import { accountClosureRequests, user } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { DATENSCHUTZ_MAILBOX } from "../../services/me/account-closure.service";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/me", meAccountClosureRoutes);

let ctx: TestDbContext;

const SMTP_ENV = {
  SMTP_HOST: "smtp.example.de",
  SMTP_PORT: 587,
  SMTP_USER: "mailer",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "Dragons <noreply@example.de>",
};

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  for (const key of Object.keys(envState.env)) delete envState.env[key];
  Object.assign(envState.env, SMTP_ENV);
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
  mocks.sendMail.mockResolvedValue({ messageId: "m-1" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

const ADA = { id: "user-ada", name: "Ada Lovelace", email: "ada@example.de" };

/** Seeds the account and signs the request in as it. */
async function signedInAsAda(): Promise<void> {
  await ctx.db.insert(user).values({ ...ADA, role: "coach" });
  mocks.getSession.mockResolvedValue({
    user: { ...ADA, role: "coach" },
    session: { id: "sess-ada" },
  });
}

function signedOut(): void {
  mocks.getSession.mockResolvedValue(null);
}

const post = () =>
  app.request("/me/account-closure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
const get = () => app.request("/me/account-closure");

async function storedRows() {
  return ctx.db.select().from(accountClosureRequests);
}

describe("POST /me/account-closure", () => {
  it("stores the request, returns it and mails the Datenschutz inbox once", async () => {
    await signedInAsAda();

    const res = await post();

    expect(res.status).toBe(201);
    const body = (await res.json()) as { request: { requestedAt: string } };
    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(ADA.id);
    expect(body.request.requestedAt).toBe(rows[0]!.requestedAt.toISOString());

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0]![0] as Record<string, string>;
    expect(mail.to).toBe(DATENSCHUTZ_MAILBOX);
    expect(mail.from).toBe(SMTP_ENV.SMTP_FROM);
    expect(mail.replyTo).toBe(ADA.email);
    expect(mail.text).toContain(ADA.name);
    expect(mail.text).toContain(ADA.email);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("returns the same request on a repeat and sends no further mail", async () => {
    await signedInAsAda();
    const first = (await (await post()).json()) as { request: { requestedAt: string } };

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
    expect(await storedRows()).toHaveLength(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it("stores the request and logs a skipped mail when SMTP is not configured", async () => {
    await signedInAsAda();
    delete envState.env.SMTP_HOST;

    const res = await post();

    expect(res.status).toBe(201);
    expect(await storedRows()).toHaveLength(1);
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining("SMTP is not configured"));
  });

  it("keeps the request when the relay fails", async () => {
    await signedInAsAda();
    mocks.sendMail.mockRejectedValue(new Error("relay down"));

    const res = await post();

    expect(res.status).toBe(201);
    expect(await storedRows()).toHaveLength(1);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("rejects a body carrying a field", async () => {
    await signedInAsAda();
    const res = await app.request("/me/account-closure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "someone-else" }),
    });
    expect(res.status).toBe(400);
    expect(await storedRows()).toHaveLength(0);
  });

  it("answers 401 without a session", async () => {
    signedOut();
    const res = await post();
    expect(res.status).toBe(401);
    expect(await storedRows()).toHaveLength(0);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("GET /me/account-closure", () => {
  it("returns no request before one is made and the request after", async () => {
    await signedInAsAda();

    const before = await get();
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ request: null });

    const created = await (await post()).json();
    const after = await get();
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual(created);
  });

  it("answers 401 without a session", async () => {
    signedOut();
    expect((await get()).status).toBe(401);
  });
});

describe("deleting the account", () => {
  it("removes its closure request", async () => {
    await signedInAsAda();
    await post();
    expect(await storedRows()).toHaveLength(1);

    await ctx.db.delete(user).where(eq(user.id, ADA.id));

    expect(await storedRows()).toHaveLength(0);
  });
});
