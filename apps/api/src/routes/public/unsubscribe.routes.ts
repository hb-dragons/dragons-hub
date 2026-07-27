import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { unsubscribeQuerySchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import { logger } from "../../config/logger";
import {
  buildUnsubscribeUrl,
  findSubscriptionByToken,
  unsubscribeByToken,
  type UnsubscribeVia,
} from "../../services/notifications/email-subscription.service";
import {
  renderUnsubscribePage,
  type UnsubscribePageKind,
} from "../../services/notifications/unsubscribe-page";
import type { Context } from "hono";

const log = logger.child({ service: "unsubscribe" });

const publicUnsubscribeRoutes = new Hono();

/**
 * Serve one page.
 *
 * The token sits in the URL, so the response must not be cached by a proxy, be
 * indexed, or leak the URL onward in a `Referer` header.
 */
function page(
  c: Context,
  kind: UnsubscribePageKind,
  locale: "de" | "en",
  status: 200 | 404,
  formAction?: string,
): Response {
  c.header("Content-Type", "text/html; charset=utf-8");
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.body(renderUnsubscribePage(kind, locale, formAction), status);
}

/**
 * GET is deliberately **safe**: it looks the token up and renders, and changes
 * nothing.
 *
 * Mail-security proxies and link scanners fetch every URL in a message before
 * the member ever sees it. If GET performed the opt-out, those fetches would
 * unsubscribe members who never asked to be — silently, and with a record
 * claiming they consented to it. So the click leads to a page with a button,
 * and the button POSTs.
 */
publicUnsubscribeRoutes.get(
  "/notifications/unsubscribe",
  validator("query", unsubscribeQuerySchema, validationHook),
  describeRoute({
    description:
      "Unsubscribe confirmation page for a per-recipient email token (no auth). Changes nothing.",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Confirmation page", content: { "text/html": {} } },
      400: { description: "No token supplied" },
      404: { description: "Token matches no recipient", content: { "text/html": {} } },
    },
  }),
  async (c) => {
    const { token, locale } = c.req.valid("query");
    const found = await findSubscriptionByToken(token);

    if (!found) {
      log.warn("Unsubscribe page requested with an unknown token");
      return page(c, "invalid", locale, 404);
    }
    if (found.unsubscribed) return page(c, "already", locale, 200);
    return page(c, "confirm", locale, 200, buildUnsubscribeUrl(token, locale));
  },
);

/**
 * POST performs the opt-out. Unauthenticated by design — the token *is* the
 * authorisation, because a member reading a mail has no session and cannot be
 * asked to acquire one before exercising a right.
 *
 * Two callers land here and are told apart by the body: an RFC 8058 one-click
 * POST sends `List-Unsubscribe=One-Click`, the confirmation page's form sends
 * its own field. The body is read as text and never parsed — a client that
 * sends none, or sends a content type the parser would reject, must still
 * unsubscribe the member rather than get an error.
 */
publicUnsubscribeRoutes.post(
  "/notifications/unsubscribe",
  validator("query", unsubscribeQuerySchema, validationHook),
  describeRoute({
    description:
      "Unsubscribe a recipient from the email channel via their token (no auth, RFC 8058 one-click).",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Opt-out recorded", content: { "text/html": {} } },
      400: { description: "No token supplied" },
      404: { description: "Token matches no recipient", content: { "text/html": {} } },
    },
  }),
  async (c) => {
    const { token, locale } = c.req.valid("query");

    const rawBody = await c.req.text().catch(() => "");
    const via: UnsubscribeVia = rawBody.includes("List-Unsubscribe=One-Click")
      ? "one_click"
      : "confirmation_page";

    const result = await unsubscribeByToken(token, via);

    if (result.status === "unknown_token") {
      // Loud on purpose. A member who believes they unsubscribed and keeps
      // receiving mail is the failure this endpoint exists to prevent, so an
      // unusable link says so instead of returning a reassuring 200.
      log.warn({ via }, "Unsubscribe attempted with an unknown token");
      return page(c, "invalid", locale, 404);
    }
    if (result.status === "already_unsubscribed") {
      return page(c, "already", locale, 200);
    }

    log.info({ userId: result.userId, via }, "Member unsubscribed from the email channel");
    return page(c, "done", locale, 200);
  },
);

export { publicUnsubscribeRoutes };
