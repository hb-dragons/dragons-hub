import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// `server-only` throws when imported outside a server bundle; stub it out.
vi.mock("server-only", () => ({}));

// `cache` is React's per-request memoizer — identity here so each test
// exercises the underlying fetch logic in isolation.
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

const headersMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

function mockHeaders(cookie: string | null) {
  headersMock.mockResolvedValue({ get: (name: string) => (name === "cookie" ? cookie : null) });
}

const VALID_SESSION = {
  user: { id: "u1", name: "Admin", email: "a@b.com", role: "admin", refereeId: null },
  session: { id: "s1", expiresAt: "2099-01-01T00:00:00.000Z" },
};

describe("getServerSession", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    headersMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns null when the request has no cookie", async () => {
    mockHeaders(null);
    const { getServerSession } = await import("./auth-server");
    expect(await getServerSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the request cookie to the API get-session endpoint", async () => {
    mockHeaders("__Secure-dragons.session_token=abc");
    fetchMock.mockResolvedValue({ ok: true, json: async () => VALID_SESSION });
    const { getServerSession } = await import("./auth-server");

    await getServerSession();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/auth/get-session",
      { headers: { cookie: "__Secure-dragons.session_token=abc" }, cache: "no-store" },
    );
  });

  it("returns the session payload on success", async () => {
    mockHeaders("c=1");
    fetchMock.mockResolvedValue({ ok: true, json: async () => VALID_SESSION });
    const { getServerSession } = await import("./auth-server");

    expect(await getServerSession()).toEqual(VALID_SESSION);
  });

  it("returns null when the API responds non-ok (e.g. 429 rate limit)", async () => {
    mockHeaders("c=1");
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { getServerSession } = await import("./auth-server");

    expect(await getServerSession()).toBeNull();
  });

  it("returns null when the payload has no user field", async () => {
    mockHeaders("c=1");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ session: {} }) });
    const { getServerSession } = await import("./auth-server");

    expect(await getServerSession()).toBeNull();
  });

  it("returns null when the payload is not an object", async () => {
    mockHeaders("c=1");
    fetchMock.mockResolvedValue({ ok: true, json: async () => null });
    const { getServerSession } = await import("./auth-server");

    expect(await getServerSession()).toBeNull();
  });

  it("returns null when the fetch throws", async () => {
    mockHeaders("c=1");
    fetchMock.mockRejectedValue(new Error("network down"));
    const { getServerSession } = await import("./auth-server");

    expect(await getServerSession()).toBeNull();
  });

  it("falls back to localhost when NEXT_PUBLIC_API_URL is unset", async () => {
    vi.unstubAllEnvs();
    mockHeaders("c=1");
    fetchMock.mockResolvedValue({ ok: true, json: async () => VALID_SESSION });
    const { getServerSession } = await import("./auth-server");

    await getServerSession();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/get-session",
      expect.anything(),
    );
  });
});
