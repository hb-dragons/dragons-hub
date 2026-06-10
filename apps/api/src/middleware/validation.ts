import type { Env } from "hono";
import type { Hook } from "@hono/standard-validator";

/**
 * Shared hook for hono-openapi's validator(). On failure it produces the same
 * { error, code, details } envelope that middleware/error.ts emits for a
 * ZodError, so every validated route returns one consistent 400 shape.
 */
export const validationHook: Hook<unknown, Env, string> = (result, c) => {
  if (!result.success) {
    return c.json(
      {
        error: "Invalid request data",
        code: "VALIDATION_ERROR",
        details: result.error.map((issue) => ({
          path: (issue.path ?? [])
            .map((p) =>
              typeof p === "object" && p !== null && "key" in p
                ? String((p as { key: PropertyKey }).key)
                : String(p),
            )
            .join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }
  return undefined;
};
