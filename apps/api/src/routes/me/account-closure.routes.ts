import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { meAccountClosureCreateBodySchema } from "@dragons/contracts";
import { requireAuth } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  getAccountClosureRequest,
  requestAccountClosure,
} from "../../services/me/account-closure.service";
import type { AppEnv } from "../../types";

/**
 * The signed-in account's closure request (#400, ADR-0013). Every account is
 * a staff login the club created, so being signed in is the whole
 * authorisation; the account comes from the session and never from the path
 * or body.
 */
const meAccountClosureRoutes = new Hono<AppEnv>();

meAccountClosureRoutes.get(
  "/account-closure",
  requireAuth,
  describeRoute({
    description: "Read the signed-in account's closure request, if it made one",
    tags: ["Account"],
    responses: { 200: { description: "Success; `request` is null before one is made" } },
  }),
  async (c) => {
    const request = await getAccountClosureRequest(c.get("user").id);
    return c.json({ request });
  },
);

meAccountClosureRoutes.post(
  "/account-closure",
  requireAuth,
  validator("json", meAccountClosureCreateBodySchema, validationHook),
  describeRoute({
    description:
      "Ask the club to close the signed-in account. Idempotent: the Datenschutz inbox is mailed only when the request is created",
    tags: ["Account"],
    responses: {
      200: { description: "A request was already on file; returned unchanged" },
      201: { description: "Request stored and the club notified" },
    },
  }),
  async (c) => {
    const { id, name, email } = c.get("user");
    const { request, created } = await requestAccountClosure({ id, name, email });
    return c.json({ request }, created ? 201 : 200);
  },
);

export { meAccountClosureRoutes };
