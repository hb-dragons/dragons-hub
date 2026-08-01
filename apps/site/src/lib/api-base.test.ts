import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_API_BASE, apiBase } from "./api-base";

// Vitest's vite config has no PUBLIC_ envPrefix, so import.meta.env never
// carries PUBLIC_API_URL here — apiBase() falls through to process.env.
const original = process.env.PUBLIC_API_URL;

afterEach(() => {
  if (original === undefined) delete process.env.PUBLIC_API_URL;
  else process.env.PUBLIC_API_URL = original;
});

describe("apiBase", () => {
  it("defaults to the production API", () => {
    delete process.env.PUBLIC_API_URL;
    expect(apiBase()).toBe(DEFAULT_API_BASE);
    expect(DEFAULT_API_BASE).toBe("https://api.app.hbdragons.de");
  });

  it("prefers a configured PUBLIC_API_URL", () => {
    process.env.PUBLIC_API_URL = "http://localhost:8787";
    expect(apiBase()).toBe("http://localhost:8787");
  });

  it("treats a blank PUBLIC_API_URL as unset", () => {
    process.env.PUBLIC_API_URL = "";
    expect(apiBase()).toBe(DEFAULT_API_BASE);
  });
});
