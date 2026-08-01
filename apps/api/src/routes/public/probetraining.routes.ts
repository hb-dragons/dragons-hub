import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { probetrainingRequestSchema } from "@dragons/contracts";
import { validationHook } from "../../middleware/validation";
import { trustForwardedFor } from "../../middleware/auth-protect";
import { submitProbetraining } from "../../services/public/probetraining.service";
import type { AppEnv } from "../../types";

const publicProbetrainingRoutes = new Hono<AppEnv>();

/** What every non-429 answer looks like — success and silently-dropped alike. */
const SUBMISSION_OK = { ok: true } as const;

/**
 * Honeypot guard, deliberately **ahead of validation**.
 *
 * The contract schema admits only an empty `website`, so a bot that filled the
 * field would get the shared 400 envelope naming the offending field — which
 * teaches it exactly what to clear. Short-circuiting here answers with the
 * same fake 201 a real submission gets, before any validation, rate-limit
 * INCR, row or mail can happen. (Hono caches the parsed body, so the
 * validator behind this guard does not re-read the stream.)
 */
const honeypotGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const website = (body as { website?: unknown } | undefined)?.website;
  if (typeof website === "string" && website.length > 0) {
    return c.json(SUBMISSION_OK, 201);
  }
  await next();
};

publicProbetrainingRoutes.post(
  "/probetraining",
  // Normalize x-forwarded-for to the single proxy-trusted client IP before the
  // handler reads it for the rate-limit bucket — same plumbing as sign-in.
  trustForwardedFor,
  honeypotGuard,
  validator("json", probetrainingRequestSchema, validationHook),
  describeRoute({
    description:
      "Public Probetraining (trial training) submission from the club website (no auth). " +
      "Field names are preserved 1:1 from the legacy form; `website` is a honeypot — " +
      "any content makes the request a silent no-op that still answers 201. " +
      "Rate limited to 5 submissions per IP per hour; the IP is kept only in Redis " +
      "with a one-hour TTL, never stored (GDPR minimization).",
    tags: ["Public"],
    security: [],
    responses: {
      201: { description: "Submission stored (or honeypot-dropped — indistinguishable)" },
      400: { description: "Validation error" },
      429: { description: "More than 5 submissions from this IP within an hour" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    // trustForwardedFor has already collapsed the header to the trusted client
    // IP. Absent header (local dev, direct hit) shares one "unknown" bucket.
    const ip = c.req.header("x-forwarded-for")?.trim() || "unknown";

    const outcome = await submitProbetraining(body, ip);

    if (outcome === "rate_limited") {
      c.header("Retry-After", "3600");
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    return c.json(SUBMISSION_OK, 201);
  },
);

export { publicProbetrainingRoutes };
