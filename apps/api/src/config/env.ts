import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
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
