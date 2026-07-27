import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { emailSubscriptions } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { env } from "../../config/env";

/**
 * Where the unsubscribe endpoint is mounted, as one absolute path.
 *
 * The link is baked into mail that outlives any deploy, so the path the header
 * points at and the path the router answers on must not drift.
 * `unsubscribe.routes.test.ts` asserts the router serves exactly this.
 */
export const UNSUBSCRIBE_PATH = "/public/notifications/unsubscribe";

/**
 * How a member withdrew consent, kept as evidence of *how* the opt-out was
 * expressed: `one_click` is an RFC 8058 POST issued by the mail client,
 * `confirmation_page` is the member pressing the button on the page the
 * unsubscribe link leads to.
 */
export type UnsubscribeVia = "one_click" | "confirmation_page";

/** What the email adapter needs to know about one member. */
export interface EmailSubscriptionState {
  /** The unsubscribe token to put in this member's copy of the message. */
  token: string;
  /** True when the member has opted out and must not be mailed. */
  unsubscribed: boolean;
}

/**
 * 32 random bytes, base64url — 256 bits, 43 characters.
 *
 * `randomBytes` is the CSPRNG, not `Math.random`, so a token cannot be
 * predicted from another one, and the space is far too large to enumerate
 * against the endpoint. That matters because holding a token is the entire
 * authorisation to act: the endpoint takes no session.
 */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The absolute unsubscribe URL for one member's copy of a message.
 *
 * Built on `BETTER_AUTH_URL`, which is the API's own public origin (Cloud Run
 * sets it to `https://<api_domain>`) — the endpoint is served by the API, so no
 * second base URL has to be configured and kept in step. `locale` rides along
 * so the page a member lands on is in the language the message was sent in.
 */
export function buildUnsubscribeUrl(token: string, locale: string): string {
  const url = new URL(UNSUBSCRIBE_PATH, env.BETTER_AUTH_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("locale", locale.toLowerCase().startsWith("en") ? "en" : "de");
  return url.toString();
}

/**
 * The subscription state of each given member, creating a row (and a token)
 * for anyone who does not have one yet.
 *
 * Called on the send path, so it must be safe under two workers dispatching to
 * the same member at once: the insert is `onConflictDoNothing` on `user_id` and
 * the losers are read back, which means a member ends up with exactly one
 * token no matter how the race lands. Minting here rather than at signup keeps
 * the table to members the club has actually mailed.
 */
export async function loadEmailSubscriptions(
  userIds: string[],
): Promise<Map<string, EmailSubscriptionState>> {
  const state = new Map<string, EmailSubscriptionState>();
  const wanted = [...new Set(userIds)];
  if (wanted.length === 0) return state;

  const record = (row: { userId: string; unsubscribeToken: string; unsubscribedAt: Date | null }) =>
    state.set(row.userId, {
      token: row.unsubscribeToken,
      unsubscribed: row.unsubscribedAt !== null,
    });

  const existing = await getDb()
    .select({
      userId: emailSubscriptions.userId,
      unsubscribeToken: emailSubscriptions.unsubscribeToken,
      unsubscribedAt: emailSubscriptions.unsubscribedAt,
    })
    .from(emailSubscriptions)
    .where(inArray(emailSubscriptions.userId, wanted));
  existing.forEach(record);

  const missing = wanted.filter((userId) => !state.has(userId));
  if (missing.length === 0) return state;

  await getDb()
    .insert(emailSubscriptions)
    .values(missing.map((userId) => ({ userId, unsubscribeToken: mintToken() })))
    .onConflictDoNothing({ target: emailSubscriptions.userId });

  const created = await getDb()
    .select({
      userId: emailSubscriptions.userId,
      unsubscribeToken: emailSubscriptions.unsubscribeToken,
      unsubscribedAt: emailSubscriptions.unsubscribedAt,
    })
    .from(emailSubscriptions)
    .where(inArray(emailSubscriptions.userId, missing));
  created.forEach(record);

  return state;
}

/** The member a token belongs to, for rendering the confirmation page. */
export interface TokenLookup {
  userId: string;
  unsubscribed: boolean;
}

/**
 * Resolve a token without changing anything.
 *
 * The `GET` side of the endpoint uses this: following a link must not opt a
 * member out, because link scanners and mail-security proxies fetch every URL
 * in a message. That is what the confirmation page (and RFC 8058's POST) exist
 * to prevent.
 */
export async function findSubscriptionByToken(token: string): Promise<TokenLookup | null> {
  const [row] = await getDb()
    .select({
      userId: emailSubscriptions.userId,
      unsubscribedAt: emailSubscriptions.unsubscribedAt,
    })
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.unsubscribeToken, token))
    .limit(1);
  if (!row) return null;
  return { userId: row.userId, unsubscribed: row.unsubscribedAt !== null };
}

export type UnsubscribeResult =
  | { status: "unsubscribed"; userId: string }
  | { status: "already_unsubscribed"; userId: string }
  | { status: "unknown_token" };

/**
 * Opt a member out of email, keyed by their unsubscribe token.
 *
 * Idempotent by construction: the write only matches a row that is still
 * subscribed, so a second click cannot rewrite the timestamp or the channel the
 * first one recorded. Nothing is returned as a bare boolean — an unknown token
 * and an already-honoured one look identical to the caller otherwise, and the
 * endpoint has to tell a member "this link is not valid" apart from "you are
 * already unsubscribed".
 */
export async function unsubscribeByToken(
  token: string,
  via: UnsubscribeVia,
): Promise<UnsubscribeResult> {
  const [updated] = await getDb()
    .update(emailSubscriptions)
    .set({ unsubscribedAt: new Date(), unsubscribedVia: via, updatedAt: new Date() })
    .where(
      and(
        eq(emailSubscriptions.unsubscribeToken, token),
        isNull(emailSubscriptions.unsubscribedAt),
      ),
    )
    .returning({ userId: emailSubscriptions.userId });
  if (updated) return { status: "unsubscribed", userId: updated.userId };

  const existing = await findSubscriptionByToken(token);
  if (!existing) return { status: "unknown_token" };
  return { status: "already_unsubscribed", userId: existing.userId };
}
