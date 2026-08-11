import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// The database singleton points at the PGlite harness; nothing else is stubbed.
// The point of this file is that a token in a mail, presented with no session
// at all, actually stops delivery — so the writes have to be real.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// --- Imports (after mocks) ---

import { routes } from "../index";
import {
  UNSUBSCRIBE_PATH,
  buildUnsubscribeUrl,
  findSubscriptionByToken,
  loadEmailSubscriptions,
} from "../../services/notifications/email-subscription.service";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Mint a subscription the way the send path does and hand back its token. */
async function tokenFor(userId: string): Promise<string> {
  const state = await loadEmailSubscriptions([userId]);
  return state.get(userId)!.token;
}

function url(token: string, locale?: string): string {
  const query = new URLSearchParams({ token });
  if (locale) query.set("locale", locale);
  return `${UNSUBSCRIBE_PATH}?${query.toString()}`;
}

/** An RFC 8058 one-click POST, exactly as a conforming mail client sends it. */
function oneClick(token: string): Request {
  return new Request(`http://api.test${url(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
}

// The link is baked into mail that outlives any deploy: the path the header
// points at has to be the path the router answers on.
describe("the URL put in outgoing mail", () => {
  it("is served by the mounted router", async () => {
    const token = await tokenFor("u_anna");
    const built = new URL(buildUnsubscribeUrl(token, "de"));

    const response = await routes.request(built.pathname + built.search);

    expect(response.status).toBe(200);
  });
});

describe("GET /public/notifications/unsubscribe", () => {
  it("renders the confirmation page for a valid token", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(url(token));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html).toContain('<form method="post"');
  });

  // Mail-security proxies fetch every link in a message before the member sees
  // it. A GET that opted people out would unsubscribe them silently.
  it("changes nothing", async () => {
    const token = await tokenFor("u_anna");

    await routes.request(url(token));

    expect(await findSubscriptionByToken(token)).toEqual({
      userId: "u_anna",
      unsubscribed: false,
    });
  });

  it("does not let the token be cached, indexed or leaked in a Referer", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(url(token));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("renders in the locale the message was sent in", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(url(token, "en"));

    expect(await response.text()).toContain('<html lang="en">');
  });

  it("falls back to German for an unrecognised locale rather than failing", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(url(token, "klingon"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html lang="de">');
  });

  it("answers 404 with a readable page for a token nobody holds", async () => {
    const response = await routes.request(url("not-a-real-token"));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("nicht gültig");
  });

  it("tells a member who already opted out that nothing more is needed", async () => {
    const token = await tokenFor("u_anna");
    await routes.request(oneClick(token));

    const response = await routes.request(url(token, "en"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Already unsubscribed");
  });

  it("rejects a request carrying no token at all", async () => {
    const response = await routes.request(UNSUBSCRIBE_PATH);

    expect(response.status).toBe(400);
  });
});

describe("POST /public/notifications/unsubscribe", () => {
  it("records the opt-out for an RFC 8058 one-click POST with no session", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(oneClick(token));

    expect(response.status).toBe(200);
    expect(await findSubscriptionByToken(token)).toEqual({
      userId: "u_anna",
      unsubscribed: true,
    });
    const rows = await ctx.client.query<{ unsubscribed_via: string }>(
      "SELECT unsubscribed_via FROM email_subscriptions WHERE user_id = 'u_anna'",
    );
    expect(rows.rows[0]!.unsubscribed_via).toBe("one_click");
  });

  it("records the opt-out for the confirmation page's own form submit", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(
      new Request(`http://api.test${url(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "confirm=1",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Abbestellt");
    const rows = await ctx.client.query<{ unsubscribed_via: string }>(
      "SELECT unsubscribed_via FROM email_subscriptions WHERE user_id = 'u_anna'",
    );
    expect(rows.rows[0]!.unsubscribed_via).toBe("confirmation_page");
  });

  // A client that sends no body, or a content type the form parser would
  // reject, must still opt the member out rather than get an error.
  it("honours a POST with no body at all", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(
      new Request(`http://api.test${url(token)}`, { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect((await findSubscriptionByToken(token))!.unsubscribed).toBe(true);
  });

  it("honours a POST whose body is not form-encoded", async () => {
    const token = await tokenFor("u_anna");

    const response = await routes.request(
      new Request(`http://api.test${url(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"unexpected":true}',
      }),
    );

    expect(response.status).toBe(200);
    expect((await findSubscriptionByToken(token))!.unsubscribed).toBe(true);
  });

  it("honours a POST whose body cannot be read at all", async () => {
    const token = await tokenFor("u_anna");
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error("connection dropped mid-body"));
      },
    });

    const response = await routes.request(
      new Request(`http://api.test${url(token)}`, {
        method: "POST",
        body,
        // Required by undici to send a streaming request body.
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    );

    expect(response.status).toBe(200);
    expect((await findSubscriptionByToken(token))!.unsubscribed).toBe(true);
  });

  it("is idempotent: a second POST reports the opt-out already stands", async () => {
    const token = await tokenFor("u_anna");
    await routes.request(oneClick(token));

    const response = await routes.request(oneClick(token));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Bereits abbestellt");
  });

  // Answering 200 to a link that does nothing is the worst outcome available:
  // the member believes they opted out and the mail keeps coming.
  it("answers 404 for a token nobody holds instead of pretending it worked", async () => {
    const response = await routes.request(oneClick("not-a-real-token"));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("nicht gültig");
  });

  it("opts out only the member the token belongs to", async () => {
    await loadEmailSubscriptions(["u_anna", "u_bert"]);
    const annaToken = await tokenFor("u_anna");
    const bertToken = await tokenFor("u_bert");

    await routes.request(oneClick(annaToken));

    expect((await findSubscriptionByToken(annaToken))!.unsubscribed).toBe(true);
    expect((await findSubscriptionByToken(bertToken))!.unsubscribed).toBe(false);
  });

  it("rejects a request carrying no token at all", async () => {
    const response = await routes.request(
      new Request(`http://api.test${UNSUBSCRIBE_PATH}`, { method: "POST" }),
    );

    expect(response.status).toBe(400);
  });
});
