import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// Only the database singleton is redirected at the PGlite harness. Neither
// drizzle-orm nor the schema is mocked: the guarantees under test here are
// uniqueness of the token, `onConflictDoNothing` under a concurrent mint and
// the conditional UPDATE that makes an opt-out idempotent — all of which are
// properties of the database, not of this module.

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

// --- Imports (after mocks) ---

import {
  UNSUBSCRIBE_PATH,
  buildUnsubscribeUrl,
  findSubscriptionByToken,
  loadEmailSubscriptions,
  unsubscribeByToken,
} from "./email-subscription.service";
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

async function rows(): Promise<Record<string, unknown>[]> {
  const result = await ctx.client.query(
    "SELECT * FROM email_subscriptions ORDER BY user_id",
  );
  return result.rows as Record<string, unknown>[];
}

describe("loadEmailSubscriptions", () => {
  it("mints a row and a token for a member who has none", async () => {
    const state = await loadEmailSubscriptions(["u_anna"]);

    expect(state.get("u_anna")).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      unsubscribed: false,
    });
    expect(await rows()).toHaveLength(1);
  });

  // 256 bits from the CSPRNG: the token is the whole authorisation, so it must
  // not be guessable or derivable from another member's.
  it("mints an unpredictable token per member", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `u_${i}`);

    const state = await loadEmailSubscriptions(ids);

    const tokens = ids.map((id) => state.get(id)!.token);
    expect(new Set(tokens).size).toBe(ids.length);
    for (const token of tokens) {
      // base64url of 32 bytes is 43 characters with no padding.
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("reuses the token it already minted", async () => {
    const first = await loadEmailSubscriptions(["u_anna"]);
    const second = await loadEmailSubscriptions(["u_anna"]);

    expect(second.get("u_anna")!.token).toBe(first.get("u_anna")!.token);
    expect(await rows()).toHaveLength(1);
  });

  it("returns an empty map without touching the database for no members", async () => {
    expect(await loadEmailSubscriptions([])).toEqual(new Map());
    expect(await rows()).toEqual([]);
  });

  it("deduplicates a member repeated in the batch", async () => {
    const state = await loadEmailSubscriptions(["u_anna", "u_anna"]);

    expect(state.size).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  // Two workers dispatching the same event must not race a member into two
  // rows — the unique constraint would reject one of them outright.
  it("survives a concurrent mint for the same member", async () => {
    const [a, b] = await Promise.all([
      loadEmailSubscriptions(["u_anna"]),
      loadEmailSubscriptions(["u_anna"]),
    ]);

    expect(await rows()).toHaveLength(1);
    expect(a.get("u_anna")!.token).toBe(b.get("u_anna")!.token);
  });

  it("reports an opted-out member as unsubscribed", async () => {
    const minted = await loadEmailSubscriptions(["u_anna"]);
    await unsubscribeByToken(minted.get("u_anna")!.token, "one_click");

    const state = await loadEmailSubscriptions(["u_anna"]);

    expect(state.get("u_anna")).toEqual({
      token: minted.get("u_anna")!.token,
      unsubscribed: true,
    });
  });

  it("mixes existing and new members in one map", async () => {
    const first = await loadEmailSubscriptions(["u_anna"]);

    const state = await loadEmailSubscriptions(["u_anna", "u_bert"]);

    expect(state.get("u_anna")!.token).toBe(first.get("u_anna")!.token);
    expect(state.get("u_bert")!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await rows()).toHaveLength(2);
  });
});

describe("findSubscriptionByToken", () => {
  it("resolves a token to its member without changing anything", async () => {
    const state = await loadEmailSubscriptions(["u_anna"]);
    const token = state.get("u_anna")!.token;

    expect(await findSubscriptionByToken(token)).toEqual({
      userId: "u_anna",
      unsubscribed: false,
    });
    expect((await rows())[0]!.unsubscribed_at).toBeNull();
  });

  it("returns null for a token nobody holds", async () => {
    expect(await findSubscriptionByToken("not-a-real-token")).toBeNull();
  });

  it("reports an opted-out member as unsubscribed", async () => {
    const state = await loadEmailSubscriptions(["u_anna"]);
    const token = state.get("u_anna")!.token;
    await unsubscribeByToken(token, "confirmation_page");

    expect(await findSubscriptionByToken(token)).toEqual({
      userId: "u_anna",
      unsubscribed: true,
    });
  });
});

describe("unsubscribeByToken", () => {
  it("records the opt-out, who it was for and how it arrived", async () => {
    const state = await loadEmailSubscriptions(["u_anna"]);

    const result = await unsubscribeByToken(state.get("u_anna")!.token, "one_click");

    expect(result).toEqual({ status: "unsubscribed", userId: "u_anna" });
    const [row] = await rows();
    expect(row!.unsubscribed_at).not.toBeNull();
    expect(row!.unsubscribed_via).toBe("one_click");
  });

  it("records a confirmation-page opt-out under its own channel", async () => {
    const state = await loadEmailSubscriptions(["u_anna"]);

    await unsubscribeByToken(state.get("u_anna")!.token, "confirmation_page");

    expect((await rows())[0]!.unsubscribed_via).toBe("confirmation_page");
  });

  // A second click must not rewrite when consent was withdrawn: that timestamp
  // is the evidence the opt-out was honoured from the moment it was made.
  it("is idempotent and keeps the first opt-out's timestamp and channel", async () => {
    const state = await loadEmailSubscriptions(["u_anna"]);
    const token = state.get("u_anna")!.token;
    await unsubscribeByToken(token, "one_click");
    const first = (await rows())[0]!;

    const second = await unsubscribeByToken(token, "confirmation_page");

    expect(second).toEqual({ status: "already_unsubscribed", userId: "u_anna" });
    const after = (await rows())[0]!;
    expect(after.unsubscribed_at).toEqual(first.unsubscribed_at);
    expect(after.unsubscribed_via).toBe("one_click");
  });

  it("reports an unknown token instead of silently succeeding", async () => {
    expect(await unsubscribeByToken("not-a-real-token", "one_click")).toEqual({
      status: "unknown_token",
    });
  });

  it("opts out only the member the token belongs to", async () => {
    const state = await loadEmailSubscriptions(["u_anna", "u_bert"]);

    await unsubscribeByToken(state.get("u_anna")!.token, "one_click");

    const all = await rows();
    expect(all.find((r) => r.user_id === "u_anna")!.unsubscribed_at).not.toBeNull();
    expect(all.find((r) => r.user_id === "u_bert")!.unsubscribed_at).toBeNull();
  });
});

describe("buildUnsubscribeUrl", () => {
  it("builds an absolute URL on the API origin carrying the token", () => {
    const url = new URL(buildUnsubscribeUrl("tok-123", "de"));

    expect(url.origin).toBe("http://localhost:3001");
    expect(url.pathname).toBe(UNSUBSCRIBE_PATH);
    expect(url.searchParams.get("token")).toBe("tok-123");
    expect(url.searchParams.get("locale")).toBe("de");
  });

  it("carries an English locale through", () => {
    const url = new URL(buildUnsubscribeUrl("tok-123", "en-GB"));

    expect(url.searchParams.get("locale")).toBe("en");
  });

  it("falls back to German for any other locale", () => {
    const url = new URL(buildUnsubscribeUrl("tok-123", "fr"));

    expect(url.searchParams.get("locale")).toBe("de");
  });

  it("percent-encodes a token so it cannot inject query parameters", () => {
    const url = new URL(buildUnsubscribeUrl("a&locale=en&x=1", "de"));

    expect(url.searchParams.get("token")).toBe("a&locale=en&x=1");
    expect(url.searchParams.get("locale")).toBe("de");
  });
});
