import { describe, expect, it } from "vitest";
import { buildAssistantTransportConfig } from "./transport";

describe("buildAssistantTransportConfig", () => {
  it("targets /qa/chat and sets the Cookie header when a cookie exists", () => {
    const cfg = buildAssistantTransportConfig({ apiUrl: "https://api.test", cookie: "dragons.session=abc", locale: "de" });
    expect(cfg.api).toBe("https://api.test/qa/chat");
    expect(cfg.headers).toEqual({ Cookie: "dragons.session=abc" });
    expect(cfg.body).toEqual({ locale: "de" });
  });

  it("omits the Cookie header when there is no cookie", () => {
    const cfg = buildAssistantTransportConfig({ apiUrl: "https://api.test", cookie: null });
    expect(cfg.headers).toEqual({});
    expect(cfg.body).toEqual({ locale: undefined });
  });
});
