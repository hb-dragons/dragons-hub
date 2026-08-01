import { describe, expect, it } from "vitest";

import { Users } from "./users";

describe("users", () => {
  it("supports API-key auth for the site build reader", () => {
    expect(Users.slug).toBe("users");
    expect(Users.auth).toEqual({ useAPIKey: true });
  });
});
