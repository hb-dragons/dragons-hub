import { describe, expect, it } from "vitest";
import { crashReportingOptions } from "@/lib/crash-reporting/options";

const DSN = "https://key@eu.glitchtip.com/334";

describe("crashReportingOptions", () => {
  it("is disabled when no DSN is compiled into the bundle", () => {
    expect(crashReportingOptions({ dsn: undefined, channel: "production" })).toBeNull();
  });

  it("is disabled when the DSN is present but blank", () => {
    expect(crashReportingOptions({ dsn: "   ", channel: "production" })).toBeNull();
  });

  it("passes the DSN through with surrounding whitespace removed", () => {
    expect(crashReportingOptions({ dsn: `  ${DSN}\n`, channel: "preview" })?.dsn).toBe(DSN);
  });

  it("names the EAS channel as the environment so preview and production separate", () => {
    expect(crashReportingOptions({ dsn: DSN, channel: "preview" })?.environment).toBe(
      "preview",
    );
  });

  // `Updates.channel` is "" in Expo Go and in a bare `expo run:ios` build,
  // where no channel exists to read.
  it.each([null, ""])("falls back to development when the channel is %o", (channel) => {
    expect(crashReportingOptions({ dsn: DSN, channel })?.environment).toBe("development");
  });

  it("turns off the features GlitchTip does not implement", () => {
    const options = crashReportingOptions({ dsn: DSN, channel: "production" });

    // GlitchTip has no release-health endpoint: sessions are ingested as
    // errors that never resolve to anything, and it has no /traces either.
    expect(options?.enableAutoSessionTracking).toBe(false);
    expect(options?.tracesSampleRate).toBe(0);
    expect(options?.enableNativeFramesTracking).toBe(false);
  });

  it("keeps personal data out of the payload", () => {
    const options = crashReportingOptions({ dsn: DSN, channel: "production" });

    // Art. 5(1)(c) DSGVO: a crash report needs the stack, not the device
    // owner. `sendDefaultPii` would attach the IP address and the username.
    expect(options?.sendDefaultPii).toBe(false);
  });
});
