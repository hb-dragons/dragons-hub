import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { logger as rootLogger } from "../config/logger";
import type { AppEnv } from "../types";

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: "Invalid request data",
        code: "VALIDATION_ERROR",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  // Use request-scoped logger if available, otherwise root logger
  const log = c.get("logger") ?? rootLogger;
  log.error({ err: error, stack }, message);

  return c.json(
    {
      error: isProd ? "Internal server error" : message,
      code: "INTERNAL_ERROR",
    },
    500,
  );
};
