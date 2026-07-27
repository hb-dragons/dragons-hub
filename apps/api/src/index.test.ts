import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `index.ts` is the process entry point: importing it boots an HTTP server,
 * starts the workers and registers signal handlers, so it is asserted on as
 * source text rather than executed. The one thing worth pinning is that the
 * bootstrap reads config through the validated schema — `process.env.PORT`
 * bypassed the range check, and `Number("")` is 0, which binds an arbitrary
 * ephemeral port while the platform health check knocks on the configured one.
 */
const source = readFileSync(path.join(import.meta.dirname, "index.ts"), "utf8");

describe("api bootstrap", () => {
  it("takes the listen port from the validated env", () => {
    expect(source).toMatch(/const port = env\.PORT;/);
  });

  it("reads no config off process.env beyond the dotenv bootstrap", () => {
    const offenders = source
      .split("\n")
      .map((line, i) => `${i + 1}: ${line}`)
      .filter((line) => !/^\s*\d+: \s*\/\//.test(line))
      // NODE_ENV gates the dotenv import, which has to run before the env
      // module is loaded at all — it cannot come from the parsed schema.
      .filter((line) => /process\.env\./.test(line) && !/process\.env\.NODE_ENV/.test(line));
    expect(offenders).toEqual([]);
  });

  it("quits the shared redis client as part of shutdown", () => {
    expect(source).toMatch(/closeRedis/);
  });
});
