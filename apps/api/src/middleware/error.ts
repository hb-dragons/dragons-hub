import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { logger as rootLogger } from "../config/logger";
import type { AppEnv } from "../types";

// Marker that tells Cloud Error Reporting to ingest this log entry.
// https://cloud.google.com/error-reporting/docs/formatting-error-messages
const REPORTED_ERROR_TYPE =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

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

  if (error instanceof HTTPException) {
    const code =
      error.status === 401
        ? "UNAUTHORIZED"
        : error.status === 403
          ? "FORBIDDEN"
          : error.status === 404
            ? "NOT_FOUND"
            : "HTTP_ERROR";
    return c.json({ error: error.message, code }, error.status);
  }

  const isProd = process.env.NODE_ENV === "production";
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  // Use request-scoped logger if available, otherwise root logger
  const log = c.get("logger") ?? rootLogger;
  log.error(
    { err: error, stack_trace: stack, "@type": REPORTED_ERROR_TYPE },
    message,
  );

  return c.json(
    {
      error: isProd ? "Internal server error" : message,
      code: "INTERNAL_ERROR",
    },
    500,
  );
};
