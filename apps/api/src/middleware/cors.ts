import { cors } from "hono/cors";
import { env } from "../config/env";

export const corsMiddleware = cors({
  origin: env.TRUSTED_ORIGINS,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
  // Browsers hide every non-safelisted response header from cross-origin
  // fetch() unless it is listed here. The CSV export endpoints report their
  // unpaginated row count and whether the 1000-row cap truncated the file in
  // these headers, and the web app runs on a different origin than the API.
  exposeHeaders: [
    "X-Total-Count",
    "X-Result-Truncated",
    "Content-Disposition",
  ],
  credentials: true,
});
