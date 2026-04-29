import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
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

  // Logging / observability
  SERVICE_NAME: z.string().min(1).default("api"),
  SERVICE_VERSION: z.string().min(1).optional(),
  GCP_PROJECT_ID: z.string().min(1).optional(),

  // WAHA (WhatsApp HTTP API - self-hosted)
  WAHA_BASE_URL: z.string().url().optional(),
  WAHA_SESSION: z.string().default("default"),

  // Expo Push (native notifications)
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  EXPO_PROJECT_ID: z.string().min(1).optional(),

  // Referee SDK (separate federation account for offenespiele sync)
  REFEREE_SDK_USERNAME: z.string().min(1).optional(),
  REFEREE_SDK_PASSWORD: z.string().min(1).optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),

  // Scoreboard ingest (Raspberry Pi -> API)
  SCOREBOARD_INGEST_KEY: z.string().min(32),
  SCOREBOARD_DEVICE_ID: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    if (!_env) {
      const result = envSchema.safeParse(process.env);
      if (!result.success) {
        // Logger depends on env config — cannot import here (circular dependency).
        // console.error is acceptable for env validation failures at startup.
        console.error("Invalid environment variables:");
        for (const issue of result.error.issues) {
          console.error(`  ${issue.path.join(".")}: ${issue.message}`);
        }
        throw new Error("Invalid environment variables");
      }
      _env = result.data;
    }
    return _env[prop as keyof Env];
  },
});
