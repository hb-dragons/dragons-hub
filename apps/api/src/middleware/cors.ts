import { cors } from "hono/cors";
import { env } from "../config/env";

export const corsMiddleware = cors({
  origin: env.TRUSTED_ORIGINS,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
