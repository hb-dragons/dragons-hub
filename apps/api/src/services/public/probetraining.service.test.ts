import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import type { ProbetrainingRequest } from "@dragons/contracts";

// --- Mocks (hoisted before imports) ---
//
// The database is real (PGlite): the point of the happy-path tests is that a
// submission ends up as a row. Redis, nodemailer and the env are mocked — the
// rate limiter's fixed-window semantics live in `incrementWithTtl` (tested in
// config/redis.test.ts), so here it is replaced by an in-memory counter, and
// the SMTP transport must never open a socket from a test.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

const redisMocks = vi.hoisted(() => ({ incrementWithTtl: vi.fn() }));

const mailMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));

const envState = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/redis", () => ({
  incrementWithTtl: redisMocks.incrementWithTtl,
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mailMocks.createTransport },
}));

vi.mock("../../config/env", () => ({ env: envState.env }));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// --- Imports (after mocks) ---

import { submitProbetraining } from "./probetraining.service";
import { probetrainingSubmissions } from "@dragons/db/schema";

let ctx: TestDbContext;

/** In-memory stand-in for the Redis fixed window: one counter per key. */
const counters = new Map<string, number>();

function submission(overrides: Partial<ProbetrainingRequest> = {}): ProbetrainingRequest {
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

async function storedRows() {
  return ctx.db.select().from(probetrainingSubmissions);
}

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  counters.clear();

  redisMocks.incrementWithTtl.mockImplementation(async (key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  });
  mailMocks.createTransport.mockReturnValue({
    sendMail: mailMocks.sendMail,
    close: mailMocks.close,
  });
  mailMocks.sendMail.mockResolvedValue({ messageId: "<test@relay>" });

  for (const key of Object.keys(envState.env)) delete envState.env[key];
  Object.assign(envState.env, {
    SMTP_HOST: "smtp.test",
    SMTP_PORT: 587,
    SMTP_USER: "mailer",
    SMTP_PASSWORD: "secret",
    SMTP_FROM: "Dragons <noreply@hbdragons.de>",
    PROBETRAINING_NOTIFY_TO: "vorstand@hbdragons.de",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("submitProbetraining — happy path", () => {
  it("stores the submission as a row, field for field", async () => {
    const outcome = await submitProbetraining(submission(), "203.0.113.7");

    expect(outcome).toBe("accepted");
    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      month: "Januar",
      year: 2012,
      didPlay: true,
      gender: "männlich",
      mail: "eltern@example.de",
      message: "Mein Kind würde gerne vorbeikommen.",
      acceptedPrivacy: true,
    });
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("stores a null message when none was submitted", async () => {
    await submitProbetraining(submission({ message: undefined }), "203.0.113.7");

    const rows = await storedRows();
    expect(rows[0]!.message).toBeNull();
  });

  it("notifies the club inbox with the submission's content, reply-to the submitter", async () => {
    await submitProbetraining(submission(), "203.0.113.7");

    expect(mailMocks.sendMail).toHaveBeenCalledTimes(1);
    const message = mailMocks.sendMail.mock.calls[0]![0] as {
      from: string;
      to: string;
      replyTo: string;
      subject: string;
      text: string;
    };
    expect(message.to).toBe("vorstand@hbdragons.de");
    expect(message.from).toBe("Dragons <noreply@hbdragons.de>");
    expect(message.replyTo).toBe("eltern@example.de");
    expect(message.subject).toBe("Neue Probetraining-Anfrage");
    expect(message.text).toContain("Januar");
    expect(message.text).toContain("2012");
    expect(message.text).toContain("männlich");
    expect(message.text).toContain("eltern@example.de");
    expect(message.text).toContain("Mein Kind würde gerne vorbeikommen.");
  });

  it("opens the transport with the club's SMTP relay settings and closes it after", async () => {
    await submitProbetraining(submission(), "203.0.113.7");

    expect(mailMocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.test",
      port: 587,
      secure: false,
      auth: { user: "mailer", pass: "secret" },
    });
    expect(mailMocks.close).toHaveBeenCalledTimes(1);
  });
});

describe("submitProbetraining — honeypot", () => {
  it("drops a filled honeypot without storing, mailing, or touching Redis", async () => {
    const outcome = await submitProbetraining(
      submission({ website: "https://spam.example" }),
      "203.0.113.7",
    );

    expect(outcome).toBe("dropped");
    expect(await storedRows()).toHaveLength(0);
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(redisMocks.incrementWithTtl).not.toHaveBeenCalled();
  });
});

describe("submitProbetraining — rate limit", () => {
  it("counts submissions per IP in a one-hour fixed window", async () => {
    await submitProbetraining(submission(), "203.0.113.7");

    expect(redisMocks.incrementWithTtl).toHaveBeenCalledWith("probetraining:203.0.113.7", 3600);
  });

  it("rejects the sixth submission from the same IP within the window", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await submitProbetraining(submission(), "203.0.113.7")).toBe("accepted");
    }

    const outcome = await submitProbetraining(submission(), "203.0.113.7");

    expect(outcome).toBe("rate_limited");
    expect(await storedRows()).toHaveLength(5);
    expect(mailMocks.sendMail).toHaveBeenCalledTimes(5);
  });

  it("keeps IPs in separate windows", async () => {
    for (let i = 0; i < 5; i++) {
      await submitProbetraining(submission(), "203.0.113.7");
    }

    expect(await submitProbetraining(submission(), "198.51.100.9")).toBe("accepted");
  });

  it("fails open when Redis is unreachable", async () => {
    redisMocks.incrementWithTtl.mockRejectedValue(new Error("connection refused"));

    const outcome = await submitProbetraining(submission(), "203.0.113.7");

    expect(outcome).toBe("accepted");
    expect(await storedRows()).toHaveLength(1);
  });
});

describe("submitProbetraining — mail failure", () => {
  it("still stores the row and reports accepted when the transport throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mailMocks.sendMail.mockRejectedValue(new Error("relay refused"));

    const outcome = await submitProbetraining(submission(), "203.0.113.7");

    expect(outcome).toBe("accepted");
    expect(await storedRows()).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(mailMocks.close).toHaveBeenCalledTimes(1);
  });

  // Unconfigured is a documented-normal state (.env.example), not a failure:
  // no transport is even opened, the submission is still stored.
  it("still stores the row when SMTP is not configured", async () => {
    delete envState.env.SMTP_HOST;

    const outcome = await submitProbetraining(submission(), "203.0.113.7");

    expect(outcome).toBe("accepted");
    expect(await storedRows()).toHaveLength(1);
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
  });

  it("still stores the row when PROBETRAINING_NOTIFY_TO is unset", async () => {
    delete envState.env.PROBETRAINING_NOTIFY_TO;

    const outcome = await submitProbetraining(submission(), "203.0.113.7");

    expect(outcome).toBe("accepted");
    expect(await storedRows()).toHaveLength(1);
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
  });
});
