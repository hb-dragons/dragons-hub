// Provide valid env vars for all tests so config/env.ts validation passes.
// Individual tests can override with vi.stubEnv() or vi.mock() as needed.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SDK_USERNAME = "test";
process.env.SDK_PASSWORD = "test";
process.env.BETTER_AUTH_SECRET =
  "test-secret-that-is-at-least-32-chars-long!!";
process.env.BETTER_AUTH_URL = "http://localhost:3001";
process.env.NODE_ENV = "test";
process.env.TRUSTED_ORIGINS = "http://localhost:3000";
