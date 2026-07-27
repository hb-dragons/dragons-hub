import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// nodemailer is NOT mocked. The whole point of this file is that the message
// leaves over a real SMTP session, so the adapter talks to an in-process relay
// (src/test/smtp-test-server.ts) and the assertions are on what that relay
// received. Only env and the logger are stubbed.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const envHolder = vi.hoisted(
  () => ({}) as Record<string, string | number | undefined>,
);

vi.mock("../../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] },
    ),
}));

vi.mock("../../../config/env", () => ({ env: envHolder }));

vi.mock("../../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// --- Imports (after mocks) ---

import { EmailChannelAdapter, smtpTransportOptions } from "./email";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../../test/setup-test-db";
import {
  decodeQuotedPrintable,
  startSmtpTestServer,
  type SmtpTestServer,
} from "../../../test/smtp-test-server";

let ctx: TestDbContext;
let smtp: SmtpTestServer;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
  smtp = await startSmtpTestServer();
});

afterAll(async () => {
  await smtp.close();
  await closeTestDb(ctx);
});

async function insertPrerequisites() {
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'match.cancelled', 'sync', 'immediate', NOW(), 'match', 1, 'Test Match', '/matches/1', '{}');
  `);
  await ctx.client.exec(
    `INSERT INTO channel_configs (id, name, type, config) VALUES (1, 'email-channel', 'email', '{"locale":"de"}');`,
  );
}

async function seedUser(
  id: string,
  opts: { email: string; name?: string; verified?: boolean },
) {
  await ctx.client.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [id, opts.name ?? id, opts.email, opts.verified ?? true],
  );
}

async function getLogs() {
  const result = await ctx.client.query("SELECT * FROM notification_log ORDER BY id");
  return result.rows as Record<string, unknown>[];
}

beforeEach(async () => {
  await resetTestDb(ctx);
  await insertPrerequisites();
  smtp.received.length = 0;
  smtp.rejectRecipients.clear();
  for (const key of Object.keys(envHolder)) delete envHolder[key];
  Object.assign(envHolder, {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: smtp.port,
    SMTP_USER: "relay-user",
    SMTP_PASSWORD: "relay-pass",
    SMTP_FROM: "Dragons <noreply@dragons.de>",
  });
});

const params = {
  eventId: "evt-001",
  watchRuleId: null,
  channelConfigId: 1,
  recipientUserIds: ["u_anna"],
  title: "Match cancelled",
  body: "Dragons vs Tigers has been cancelled.",
  locale: "en",
};

describe("EmailChannelAdapter", () => {
  describe("end-to-end delivery", () => {
    it("delivers a message the relay actually receives, with both MIME parts", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de", name: "Anna Admin" });

      const result = await new EmailChannelAdapter().send({
        ...params,
        link: "https://hub.dragons.de/matches/1",
      });

      expect(result).toEqual({ success: true, sent: 1, failed: 0, skipped: 0 });

      // What the relay accepted — not what the adapter reported.
      expect(smtp.received).toHaveLength(1);
      const mail = smtp.received[0]!;
      expect(mail.mailFrom).toBe("noreply@dragons.de");
      expect(mail.rcptTo).toEqual(["anna@dragons.de"]);
      expect(mail.data).toContain("Subject: Match cancelled");
      expect(mail.data).toContain("To: Anna Admin <anna@dragons.de>");

      // Both parts present, and the alternative container that pairs them.
      expect(mail.data).toContain("Content-Type: multipart/alternative");
      expect(mail.data).toContain("Content-Type: text/plain");
      expect(mail.data).toContain("Content-Type: text/html");

      // Both parts carry the message, and only the HTML one carries markup.
      const [, rawText = "", rawHtml = ""] = mail.data.split(
        /Content-Type: text\/(?:plain|html)/,
      );
      const textPart = decodeQuotedPrintable(rawText);
      const htmlPart = decodeQuotedPrintable(rawHtml);
      expect(textPart).toContain("Dragons vs Tigers has been cancelled.");
      expect(textPart).not.toContain("<h1");
      expect(htmlPart).toContain("Dragons vs Tigers has been cancelled.");
      expect(htmlPart).toContain("<h1");
      expect(htmlPart).toContain("https://hub.dragons.de/matches/1");
    });

    it("records the delivery in notification_log with the address and message id", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });

      await new EmailChannelAdapter().send(params);

      const rows = await getLogs();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_id).toBe("evt-001");
      expect(rows[0]!.recipient_id).toBe("u_anna");
      expect(rows[0]!.status).toBe("sent");
      expect(rows[0]!.sent_at).not.toBeNull();
      expect(rows[0]!.recipient_token).toBe("anna@dragons.de");
      expect(rows[0]!.provider_ticket_id).toEqual(expect.stringContaining("@"));
    });

    it("delivers one message per recipient", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      await seedUser("u_bert", { email: "bert@dragons.de" });

      const result = await new EmailChannelAdapter().send({
        ...params,
        recipientUserIds: ["u_anna", "u_bert"],
      });

      expect(result).toMatchObject({ success: true, sent: 2 });
      expect(smtp.received.map((m) => m.rcptTo).flat().sort()).toEqual([
        "anna@dragons.de",
        "bert@dragons.de",
      ]);
      expect(await getLogs()).toHaveLength(2);
    });

    // A display name is user-controlled text; interpolating it into the header
    // would let one rewrite the envelope it sits in.
    it("does not let a display name rewrite the To header", async () => {
      await seedUser("u_anna", {
        email: "anna@dragons.de",
        name: 'Anna <evil@attacker.test>, "X"',
      });

      await new EmailChannelAdapter().send(params);

      expect(smtp.received[0]!.rcptTo).toEqual(["anna@dragons.de"]);
    });

    it("deduplicates: a re-processed event does not send a second copy", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      const adapter = new EmailChannelAdapter();

      await adapter.send(params);
      const second = await adapter.send(params);

      expect(second).toEqual({ success: true, sent: 0, failed: 0, skipped: 0 });
      expect(smtp.received).toHaveLength(1);
      expect(await getLogs()).toHaveLength(1);
    });
  });

  describe("recipient resolution", () => {
    it("skips an unverified address and sends nothing", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de", verified: false });

      const result = await new EmailChannelAdapter().send(params);

      expect(result).toEqual({ success: true, sent: 0, failed: 0, skipped: 1 });
      expect(smtp.received).toEqual([]);
      expect(await getLogs()).toEqual([]);
    });

    it("delivers to the verified recipients of a mixed batch only", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      await seedUser("u_bert", { email: "bert@dragons.de", verified: false });

      const result = await new EmailChannelAdapter().send({
        ...params,
        recipientUserIds: ["u_anna", "u_bert"],
      });

      expect(result).toEqual({ success: true, sent: 1, failed: 0, skipped: 1 });
      expect(smtp.received.map((m) => m.rcptTo).flat()).toEqual(["anna@dragons.de"]);
    });

    it("reports a recipient with no account as skipped", async () => {
      const result = await new EmailChannelAdapter().send(params);

      expect(result).toEqual({ success: true, sent: 0, failed: 0, skipped: 1 });
      expect(smtp.received).toEqual([]);
    });

    it("does nothing for an empty recipient list", async () => {
      const result = await new EmailChannelAdapter().send({
        ...params,
        recipientUserIds: [],
      });

      expect(result).toEqual({ success: true, sent: 0, failed: 0, skipped: 0 });
      expect(smtp.received).toEqual([]);
    });
  });

  describe("configuration", () => {
    it("returns failure and writes no claim row when SMTP is not configured", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      delete envHolder.SMTP_HOST;

      const result = await new EmailChannelAdapter().send(params);

      expect(result).toEqual({ success: false, sent: 0, failed: 0, skipped: 0 });
      expect(smtp.received).toEqual([]);
      expect(await getLogs()).toEqual([]);
    });

    // nodemailer infers neither from the port: 465 must be told it is implicit
    // TLS, and everything else must be left to upgrade via STARTTLS.
    it.each([
      [465, true],
      [587, false],
      [25, false],
    ])("port %i sets secure=%s", (port, secure) => {
      expect(
        smtpTransportOptions({
          host: "smtp.example.com",
          port,
          user: "u",
          password: "p",
          from: "f",
        }),
      ).toEqual({
        host: "smtp.example.com",
        port,
        secure,
        auth: { user: "u", pass: "p" },
      });
    });
  });

  describe("relay failures", () => {
    it("releases the claim when the relay rejects the recipient, so the event retries", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      smtp.rejectRecipients.add("anna@dragons.de");
      const adapter = new EmailChannelAdapter();

      const failed = await adapter.send(params);

      expect(failed).toEqual({ success: false, sent: 0, failed: 1, skipped: 0 });
      expect(await getLogs()).toEqual([]);

      smtp.rejectRecipients.clear();
      const retried = await adapter.send(params);

      expect(retried).toMatchObject({ success: true, sent: 1 });
      expect(smtp.received).toHaveLength(1);
      expect(await getLogs()).toHaveLength(1);
    });

    it("keeps the delivered recipient and releases only the rejected one", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      await seedUser("u_bert", { email: "bert@dragons.de" });
      smtp.rejectRecipients.add("bert@dragons.de");

      const result = await new EmailChannelAdapter().send({
        ...params,
        recipientUserIds: ["u_anna", "u_bert"],
      });

      expect(result).toEqual({ success: false, sent: 1, failed: 1, skipped: 0 });
      const rows = await getLogs();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.recipient_id).toBe("u_anna");
    });

    it("releases the claim when the relay is unreachable", async () => {
      await seedUser("u_anna", { email: "anna@dragons.de" });
      // Port 1 is reserved and never listening in the test sandbox.
      envHolder.SMTP_PORT = 1;

      const result = await new EmailChannelAdapter().send(params);

      expect(result).toMatchObject({ success: false, sent: 0, failed: 1 });
      expect(await getLogs()).toEqual([]);
    });
  });
});
