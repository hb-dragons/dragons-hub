import { z } from "zod";

/**
 * Spellings of "on" and "off" that a boolean env var actually arrives in.
 * Terraform renders an unset variable as `""`, shell wrappers and CI matrices
 * use `1`/`0`, humans write `yes`/`no`. The schema used to accept only the two
 * literals `"true"` and `"false"`, so every other spelling failed the whole
 * parse and the process refused to boot over a flag that only decides whether
 * an optional feature runs.
 */
const TRUTHY_FLAG_VALUES = new Set(["1", "true", "yes", "y", "on"]);
const FALSY_FLAG_VALUES = new Set(["0", "false", "no", "n", "off"]);

const FLAG_MESSAGE =
  'must be boolean-ish: "true"/"false", "1"/"0", "yes"/"no", "on"/"off", or blank for the default';

function normalizeFlag(raw: string | undefined): string {
  return raw?.trim().toLowerCase() ?? "";
}

/**
 * A boolean feature flag. Blank or absent means "unset" and falls back to
 * `defaultValue`; an unrecognised spelling is still a hard error, so a typo
 * like `CHATBOT_ENABLED=ture` fails loudly instead of silently reading as off.
 *
 * Only feature flags get this tolerance. The URL and credential vars
 * (`WAHA_BASE_URL`, the five `SMTP_*`) deliberately reject `""`: production
 * Terraform omits those keys entirely to leave a channel off, so an empty
 * value there means a broken deploy, not "off".
 */
function booleanFlag(defaultValue = false) {
  return z
    .string()
    .optional()
    .refine(
      (raw) => {
        const value = normalizeFlag(raw);
        return value === "" || TRUTHY_FLAG_VALUES.has(value) || FALSY_FLAG_VALUES.has(value);
      },
      { message: FLAG_MESSAGE },
    )
    .transform((raw) => {
      const value = normalizeFlag(raw);
      return value === "" ? defaultValue : TRUTHY_FLAG_VALUES.has(value);
    });
}

export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    // Blank means unset: `PORT=""` coerces to 0, which binds an arbitrary
    // ephemeral port and leaves the platform health check knocking on 8080.
    PORT: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.coerce.number().int().positive().max(65535).default(3001),
    ),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    SDK_USERNAME: z.string().min(1),
    SDK_PASSWORD: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
    TRUSTED_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((val) => val.split(",").map((s) => s.trim())),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    RUN_MODE: z.enum(["api", "worker", "both"]).default("both"),
    GCS_BUCKET_NAME: z.string().min(1).optional(),
    GCS_PROJECT_ID: z.string().min(1).optional(),

    SERVICE_NAME: z.string().min(1).default("api"),
    SERVICE_VERSION: z.string().min(1).optional(),
    GCP_PROJECT_ID: z.string().min(1).optional(),

    WAHA_BASE_URL: z.string().url().optional(),
    WAHA_SESSION: z.string().default("default"),

    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    EXPO_PROJECT_ID: z.string().min(1).optional(),

    REFEREE_SDK_USERNAME: z.string().min(1).optional(),
    REFEREE_SDK_PASSWORD: z.string().min(1).optional(),

    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    ASSISTANT_ENABLED: booleanFlag(),
    ASSISTANT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    CHATBOT_ENABLED: booleanFlag(),
    CHATBOT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    MCP_TOKEN: z.string().min(32).optional(),

    // SMTP relay for the `email` channel (channels/email.ts). All five are
    // optional and all five are required together: `readSmtpSettings()` treats
    // a partial set as "not configured" and the provider endpoint stops
    // offering the channel, which is why none of them carries a default.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).optional(),

    SCOREBOARD_INGEST_KEY: z.string().min(32),
    SCOREBOARD_DEVICE_ID: z.string().min(1),

    SYNC_RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    DOMAIN_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
    VERBOSE_ERRORS: booleanFlag(),
  })
  .superRefine((env, ctx) => {
    if (env.ASSISTANT_ENABLED && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "GOOGLE_GENERATIVE_AI_API_KEY is required when ASSISTANT_ENABLED=true",
      });
    }
    if (env.CHATBOT_ENABLED && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "GOOGLE_GENERATIVE_AI_API_KEY is required when CHATBOT_ENABLED=true",
      });
    }
    if (env.NODE_ENV === "production") {
      try {
        const host = new URL(env.BETTER_AUTH_URL).hostname;
        if (host === "localhost" || host === "127.0.0.1") {
          ctx.addIssue({
            code: "custom",
            path: ["BETTER_AUTH_URL"],
            message: "BETTER_AUTH_URL cannot point to localhost in production",
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_URL"],
          message: "BETTER_AUTH_URL is not a valid URL",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

/**
 * Parse `process.env` once, on first access. Deferring the parse keeps import
 * order from mattering (dotenv in `index.ts` runs before anything reads a var)
 * and keeps a test able to stub the environment before touching `env`.
 */
function loadEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("Invalid environment variables:");
      for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      }
      throw new Error("Invalid environment variables");
    }
    _env = result.data;
  }
  return _env;
}

/**
 * The parsed environment, behind a lazy Proxy.
 *
 * The traps beyond `get` are not decoration: with only `get`, the target is a
 * bare `{}`, so `"CHATBOT_ENABLED" in env` is false, `Object.keys(env)` is
 * empty and `{ ...env }` spreads to nothing — each of which reads as "not
 * configured" at exactly the call sites that check for configuration.
 * `getOwnPropertyDescriptor` has to report `configurable: true` because the
 * keys do not exist on the target; the Proxy invariants reject anything else.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const parsed = loadEnv();
    if (!(prop in parsed)) return undefined;
    return {
      value: parsed[prop as keyof Env],
      enumerable: true,
      configurable: true,
      writable: false,
    };
  },
});
