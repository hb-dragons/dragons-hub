import { describe, expect, it } from "vitest";

import { fetchTeamBackground } from "./team-background";

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchTeamBackground", () => {
  it("reads the populated image from the team-background global", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(
        JSON.stringify({
          image: { id: 7, url: "/api/media/file/bg.webp", blurhash: "hash", alt: "Halle" },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    await expect(fetchTeamBackground("http://localhost:3013", fetchImpl)).resolves.toEqual({
      url: "/api/media/file/bg.webp",
      blurhash: "hash",
      alt: "Halle",
    });
    expect(requested).toBe("http://localhost:3013/api/globals/team-background?depth=1");
  });

  it("tolerates a trailing slash on the base URL", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ image: null }), { status: 200 });
    }) as typeof fetch;
    await fetchTeamBackground("http://localhost:3013/", fetchImpl);
    expect(requested).toBe("http://localhost:3013/api/globals/team-background?depth=1");
  });

  it("returns null when no image is configured", async () => {
    await expect(
      fetchTeamBackground("http://cms", fetchReturning(200, { image: null })),
    ).resolves.toBeNull();
    await expect(fetchTeamBackground("http://cms", fetchReturning(200, {}))).resolves.toBeNull();
  });

  it("returns null when the image has no URL yet", async () => {
    await expect(
      fetchTeamBackground("http://cms", fetchReturning(200, { image: { id: 7, url: null } })),
    ).resolves.toBeNull();
  });

  it("throws on a non-200 response", async () => {
    await expect(fetchTeamBackground("http://cms", fetchReturning(500, {}))).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("throws on an unexpected response shape", async () => {
    await expect(fetchTeamBackground("http://cms", fetchReturning(200, []))).rejects.toThrow();
  });
});
