import { describe, expect, it } from "vitest";
import { buildClubQaSystemPrompt } from "./qa-system-prompt";

describe("buildClubQaSystemPrompt", () => {
  it("scopes to the club, instructs tool use, and refuses off-topic", () => {
    const p = buildClubQaSystemPrompt({});
    expect(p).toMatch(/Dragons/);
    expect(p).toMatch(/tools/i);
    expect(p).toMatch(/refuse|decline|only answer/i);
    expect(p).toMatch(/don't have|do not have|don't know/i);
    expect(p).toMatch(/last sync/i);
  });

  it("tells the model to answer in the user's language (German default)", () => {
    expect(buildClubQaSystemPrompt({})).toMatch(/German/);
    expect(buildClubQaSystemPrompt({ locale: "en" })).toMatch(/user's language|locale "en"/i);
  });
});
