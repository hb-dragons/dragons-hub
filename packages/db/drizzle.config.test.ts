import { afterEach, describe, expect, it, vi } from "vitest";

// The real config loads ../../.env at import time. Tests must not depend on a
// developer's local environment file, nor mutate process.env by importing.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const originalArgv = process.argv;

/** Re-evaluate drizzle.config.ts with a given drizzle-kit argument list. */
async function loadConfigWith(args: string[]) {
  process.argv = [originalArgv[0] ?? "node", "drizzle-kit", ...args];
  vi.resetModules();
  const module = await import("./drizzle.config");
  return module.default as { schema?: string; out?: string; dialect?: string } & {
    dbCredentials?: { url?: string };
  };
}

afterEach(() => {
  process.argv = originalArgv;
  vi.resetModules();
});

describe("drizzle.config push guard", () => {
  it("refuses `drizzle-kit push`", async () => {
    await expect(loadConfigWith(["push"])).rejects.toThrow(/drizzle-kit push is disabled/);
  });

  it("names the three indexes push would drop", async () => {
    // The message is the only thing standing between a developer and three
    // silently dropped production indexes, so its content is part of the guard.
    await expect(loadConfigWith(["push"])).rejects.toThrow(/notification_log_dedup_idx/);
    await expect(loadConfigWith(["push"])).rejects.toThrow(/domain_events_outbox_idx/);
    await expect(loadConfigWith(["push"])).rejects.toThrow(/referee_games_status_kickoff_idx/);
  });

  it("points at the migration workflow instead", async () => {
    await expect(loadConfigWith(["push"])).rejects.toThrow(/db:generate \+ db:migrate/);
  });

  it("refuses push whatever position the argument arrives in", async () => {
    // `pnpm exec drizzle-kit --config drizzle.config.ts push` must be refused
    // just like the bare form.
    await expect(
      loadConfigWith(["--config", "drizzle.config.ts", "push"]),
    ).rejects.toThrow(/disabled/);
    await expect(loadConfigWith(["push", "--force"])).rejects.toThrow(/disabled/);
  });

  it("allows generate, migrate and studio", async () => {
    await expect(loadConfigWith(["generate"])).resolves.toBeDefined();
    await expect(loadConfigWith(["migrate"])).resolves.toBeDefined();
    await expect(loadConfigWith(["studio"])).resolves.toBeDefined();
  });

  it("does not trip on a node binary path that happens to contain push", async () => {
    process.argv = ["/opt/push/bin/node", "/opt/push/drizzle-kit", "generate"];
    vi.resetModules();

    await expect(import("./drizzle.config")).resolves.toBeDefined();
  });
});

describe("drizzle.config", () => {
  it("generates migrations from the schema barrel into drizzle/", async () => {
    const config = await loadConfigWith(["generate"]);

    expect(config.schema).toBe("./src/schema/index.ts");
    expect(config.out).toBe("./drizzle");
    expect(config.dialect).toBe("postgresql");
  });

  it("reads the connection string from DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://dragons:dragons@localhost:5432/dragons");

    const config = await loadConfigWith(["migrate"]);

    expect(config.dbCredentials?.url).toBe(
      "postgresql://dragons:dragons@localhost:5432/dragons",
    );

    vi.unstubAllEnvs();
  });
});
