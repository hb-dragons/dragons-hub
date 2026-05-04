import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    SDK_USERNAME: "testuser",
    SDK_PASSWORD: "testpass",
  },
}));

const mockGetLigaList = vi.fn();
const mockGetSpielplan = vi.fn();
const mockGetTabelle = vi.fn();
const mockGetClubsByFreetext = vi.fn();
const mockGetActualMatches = vi.fn();
vi.mock("basketball-bund-sdk", () => ({
  default: class MockSDK {
    wam = { getLigaList: (...args: unknown[]) => mockGetLigaList(...args) };
    competition = {
      getSpielplan: (...args: unknown[]) => mockGetSpielplan(...args),
      getTabelle: (...args: unknown[]) => mockGetTabelle(...args),
    };
    club = {
      getClubsByFreetext: (...args: unknown[]) => mockGetClubsByFreetext(...args),
      getActualMatches: (...args: unknown[]) => mockGetActualMatches(...args),
    };
  },
}));

vi.mock("p-limit", () => ({
  default: () => (fn: () => Promise<unknown>) => fn(),
}));

import { SdkClient } from "./sdk-client";

let client: SdkClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  client = new SdkClient();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Flush fake timers so retry backoff delays resolve instantly. */
async function withTimers<T>(promise: Promise<T>): Promise<T> {
  // Prevent unhandled-rejection noise — caller's rejects.toThrow() handles the real rejection
  promise.catch(() => {});
  // Advance enough for 3 retry attempts of exponential backoff (1s + 2s + 4s + jitter)
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(5_000);
  }
  return promise;
}

describe("SdkClient", () => {
  describe("ensureAuthenticated", () => {
    it("logs in when not authenticated", async () => {
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: {
            getSetCookie: () => ["SESSION=abc123; Path=/"],
          },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "testuser" } }),
        });

      await client.ensureAuthenticated();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not re-login when already authenticated", async () => {
      // Login first
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: {
            getSetCookie: () => ["SESSION=abc123; Path=/"],
          },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "testuser" } }),
        });

      await client.ensureAuthenticated();
      mockFetch.mockClear();
      await client.ensureAuthenticated();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("re-authenticates when session is older than 30 minutes", async () => {
      // First login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc123; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "testuser" } }),
        });

      await client.ensureAuthenticated();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance time past 30 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Second login after session expiry
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new456; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "testuser" } }),
        });

      await client.ensureAuthenticated();
      // 2 original + 2 re-login = 4
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("does not re-authenticate when session is fresh", async () => {
      // First login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc123; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "testuser" } }),
        });

      await client.ensureAuthenticated();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Only 5 minutes later
      vi.advanceTimersByTime(5 * 60 * 1000);

      await client.ensureAuthenticated();
      // Should still be only 2 calls (no re-login)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getAllLigen", () => {
    it("fetches leagues with pagination", async () => {
      mockGetLigaList
        .mockResolvedValueOnce({
          ligen: [{ ligaId: 1 }, { ligaId: 2 }],
          hasMoreData: true,
          size: 2,
        })
        .mockResolvedValueOnce({
          ligen: [{ ligaId: 3 }],
          hasMoreData: false,
          size: 1,
        });

      const result = await client.getAllLigen();

      expect(result).toHaveLength(3);
      expect(mockGetLigaList).toHaveBeenCalledTimes(2);
    });

    it("handles empty response", async () => {
      mockGetLigaList.mockResolvedValue({ ligen: null });

      const result = await client.getAllLigen();

      expect(result).toHaveLength(0);
    });

    it("handles missing size in response", async () => {
      mockGetLigaList.mockResolvedValueOnce({
        ligen: [{ ligaId: 1 }],
        hasMoreData: false,
        // no size field
      });

      const result = await client.getAllLigen([7]);

      expect(result).toHaveLength(1);
    });

    it("uses default verbandIds", async () => {
      mockGetLigaList.mockResolvedValue({
        ligen: [],
        hasMoreData: false,
        size: 0,
      });

      await client.getAllLigen();

      expect(mockGetLigaList).toHaveBeenCalledWith(
        expect.objectContaining({ verbandIds: [7] }),
      );
    });
  });

  describe("getSpielplan", () => {
    it("fetches spielplan for a competition", async () => {
      mockGetSpielplan.mockResolvedValue({
        matches: [{ matchId: 100 }],
      });

      const result = await client.getSpielplan(1);

      expect(result).toHaveLength(1);
      expect(result[0]!.matchId).toBe(100);
    });

    it("returns empty array for null response", async () => {
      mockGetSpielplan.mockResolvedValue({});

      const result = await client.getSpielplan(1);

      expect(result).toHaveLength(0);
    });
  });

  describe("getTabelle", () => {
    it("fetches tabelle for a competition", async () => {
      mockGetTabelle.mockResolvedValue({
        tabelle: { entries: [{ rang: 1 }] },
      });

      const result = await client.getTabelle(1);

      expect(result).toHaveLength(1);
    });

    it("returns empty array for missing entries", async () => {
      mockGetTabelle.mockResolvedValue({});

      const result = await client.getTabelle(1);

      expect(result).toHaveLength(0);
    });
  });

  describe("getGameDetails", () => {
    it("fetches game details with auth", async () => {
      // First login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Then game detail fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ game1: { spielplanId: 1 } }),
        });

      const result = await client.getGameDetails(1000);

      expect(result.game1.spielplanId).toBe(1);
    });

    it("re-authenticates on 401", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // First attempt: 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        // Re-login
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Retry after re-login
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ game1: {} }),
        });

      const result = await client.getGameDetails(1000);

      expect(result).toBeDefined();
    });

    it("re-authenticates on 403", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // First attempt: 403
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        })
        // Re-login
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Retry after re-login
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ game1: {} }),
        });

      const result = await client.getGameDetails(1000);

      expect(result).toBeDefined();
    });

    it("throws on unexpected response shape (missing game1)", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Returns valid JSON but wrong structure (no game1)
        // Validation is outside withRetry, so only 1 fetch needed
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ error: "not found" }),
        });

      await expect(client.getGameDetails(1000)).rejects.toThrow(
        "missing game1",
      );
    });

    it("throws on non-ok response", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Fetch fails with 500
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        // Retry 2 - still 500
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        // Retry 3 - still 500
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      await expect(withTimers(client.getGameDetails(1000))).rejects.toThrow(
        "Failed to fetch game details: 500",
      );
    });

    it("throws on retry failure after re-auth (401)", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // 401
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Re-login
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Retry fails too
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // Retry attempt 2 (withRetry) - 401 again
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Re-login
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new2; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // Retry attempt 3
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new3; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(withTimers(client.getGameDetails(1000))).rejects.toThrow();
    });
  });

  describe("rate limiting", () => {
    it("waits when bucket is empty", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        });

      // Exhaust all tokens by making many quick calls
      for (let i = 0; i < 16; i++) {
        mockGetSpielplan.mockResolvedValueOnce({ matches: [] });
      }

      // First 15 calls should use the burst capacity
      const promises = Array.from({ length: 16 }, (_, i) => client.getSpielplan(i));
      await vi.runAllTimersAsync();
      await Promise.all(promises);
    });
  });

  describe("getGameDetailsBatch", () => {
    it("fetches multiple games", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Game 1
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ game1: { spielplanId: 1 } }),
        })
        // Game 2
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ game1: { spielplanId: 2 } }),
        });

      const result = await withTimers(client.getGameDetailsBatch([1, 2]));

      expect(result.size).toBe(2);
    });

    it("warns on high failure rate", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        });

      // All 4 fail (>50% of 4)
      for (let i = 0; i < 4 * 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      }

      const result = await withTimers(client.getGameDetailsBatch([1, 2, 3, 4]));

      expect(result.size).toBe(0);
    });

    it("handles partial failures", async () => {
      // Login
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        })
        // Game 1 - success
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ game1: {} }),
        })
        // Game 2 - all retries fail
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await withTimers(client.getGameDetailsBatch([1, 2]));

      expect(result.size).toBe(1);
    });
  });

  describe("getTabelleResponse", () => {
    it("returns the full tabelle response", async () => {
      const mockResponse = {
        ligaData: { ligaId: 1, seasonId: 2025, seasonName: "2025/26" },
        tabelle: { entries: [{ rang: 1 }] },
      };
      mockGetTabelle.mockResolvedValue(mockResponse);

      const result = await client.getTabelleResponse(1);

      expect(result).toEqual(mockResponse);
    });

    it("returns null for undefined response", async () => {
      mockGetTabelle.mockResolvedValue(undefined);

      const result = await client.getTabelleResponse(1);

      expect(result).toBeNull();
    });
  });

  describe("searchClubs", () => {
    it("returns club search results", async () => {
      const mockClubs = [
        { vereinId: 1, vereinsname: "Dragons", vereinsnummer: 100, kontaktData: null },
      ];
      mockGetClubsByFreetext.mockResolvedValue(mockClubs);

      const result = await client.searchClubs("Dragons");

      expect(result).toHaveLength(1);
      expect(result[0]!.vereinsname).toBe("Dragons");
    });

    it("returns empty array for non-array response", async () => {
      mockGetClubsByFreetext.mockResolvedValue(null);

      const result = await client.searchClubs("test");

      expect(result).toEqual([]);
    });

    it("passes freetext to SDK", async () => {
      mockGetClubsByFreetext.mockResolvedValue([]);

      await client.searchClubs("test query");

      expect(mockGetClubsByFreetext).toHaveBeenCalledWith({ freetext: "test query" });
    });
  });

  describe("getClubMatches", () => {
    it("returns club matches response", async () => {
      const mockResponse = {
        club: { vereinId: 1, vereinsname: "Dragons" },
        matches: [{ matchId: 100, competition: { ligaId: 1 } }],
      };
      mockGetActualMatches.mockResolvedValue(mockResponse);

      const result = await client.getClubMatches(1);

      expect(result.club.vereinId).toBe(1);
      expect(result.matches).toHaveLength(1);
    });

    it("uses default rangeDays of 365", async () => {
      mockGetActualMatches.mockResolvedValue({ club: {}, matches: [] });

      await client.getClubMatches(42);

      expect(mockGetActualMatches).toHaveBeenCalledWith({ clubId: 42, rangeDays: 365 });
    });

    it("accepts custom rangeDays", async () => {
      mockGetActualMatches.mockResolvedValue({ club: {}, matches: [] });

      await client.getClubMatches(42, 180);

      expect(mockGetActualMatches).toHaveBeenCalledWith({ clubId: 42, rangeDays: 180 });
    });
  });

  describe("login", () => {
    it("throws on invalid credentials", async () => {
      // withRetry retries 3 times, each login attempt calls fetch once
      const invalidResponse = () => ({
        text: vi.fn().mockResolvedValue(
          "Die Kombination aus Benutzername und Passwort ist nicht bekannt!",
        ),
        headers: { getSetCookie: () => [] },
      });
      mockFetch
        .mockResolvedValueOnce(invalidResponse())
        .mockResolvedValueOnce(invalidResponse())
        .mockResolvedValueOnce(invalidResponse());

      await expect(withTimers(client.ensureAuthenticated())).rejects.toThrow(
        "Invalid username or password",
      );
    });

    it("throws when no session cookie received", async () => {
      const noCookieResponse = () => ({
        text: vi.fn().mockResolvedValue("OK"),
        headers: { getSetCookie: () => [] },
      });
      mockFetch
        .mockResolvedValueOnce(noCookieResponse())
        .mockResolvedValueOnce(noCookieResponse())
        .mockResolvedValueOnce(noCookieResponse());

      await expect(withTimers(client.ensureAuthenticated())).rejects.toThrow(
        "No session cookie received",
      );
    });

    it("throws when cookies exist but no SESSION cookie", async () => {
      const noSessionCookie = () => ({
        text: vi.fn().mockResolvedValue("OK"),
        headers: { getSetCookie: () => ["JSESSIONID=xyz; Path=/", "OTHER=val; Path=/"] },
      });
      mockFetch
        .mockResolvedValueOnce(noSessionCookie())
        .mockResolvedValueOnce(noSessionCookie())
        .mockResolvedValueOnce(noSessionCookie());

      await expect(withTimers(client.ensureAuthenticated())).rejects.toThrow(
        "No session cookie received",
      );
    });

    it("throws when login verification fails", async () => {
      const failedVerifyPair = () => {
        mockFetch
          .mockResolvedValueOnce({
            text: vi.fn().mockResolvedValue("OK"),
            headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
          })
          .mockResolvedValueOnce({
            json: vi.fn().mockResolvedValue({ data: {} }),
          });
      };
      // 3 retry attempts, each with login+verify
      failedVerifyPair();
      failedVerifyPair();
      failedVerifyPair();

      await expect(withTimers(client.ensureAuthenticated())).rejects.toThrow(
        /Login did not persist/,
      );
    });

    it("dedupes concurrent login() calls", async () => {
      const ok = () => ({
        text: vi.fn().mockResolvedValue("OK"),
        headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
      });
      const verify = () => ({
        json: vi.fn().mockResolvedValue({ data: { loginName: "tester" } }),
      });
      mockFetch.mockResolvedValueOnce(ok()).mockResolvedValueOnce(verify());
      const [a, b] = await withTimers(
        Promise.all([client.ensureAuthenticated(), client.ensureAuthenticated()]),
      );
      expect(a).toBeUndefined();
      expect(b).toBeUndefined();
      // Only one login round-trip (1 login + 1 verify) despite 2 concurrent callers.
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("authenticatedFetch without auth", () => {
    it("throws when calling getGameDetails without login", async () => {
      // Direct call without ensuring auth - the authClient has no sessionCookie
      // But ensureAuthenticated will try to login
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(withTimers(client.getGameDetails(1))).rejects.toThrow();
    });
  });

  describe("TokenBucket concurrency", () => {
    it("handles concurrent acquires without errors", async () => {
      const testClient = new SdkClient();

      for (let i = 0; i < 20; i++) {
        mockGetSpielplan.mockResolvedValueOnce({ matches: [] });
      }

      // Fire 20 calls concurrently
      const promises = Promise.all(
        Array.from({ length: 20 }, (_, i) => testClient.getSpielplan(i)),
      );
      await vi.runAllTimersAsync();
      await promises;

      expect(mockGetSpielplan).toHaveBeenCalledTimes(20);
    });
  });

  describe("logout", () => {
    it("clears authentication state", async () => {
      // Login first
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=abc; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        });
      await client.ensureAuthenticated();

      client.logout();

      // Next call should re-authenticate
      mockFetch
        .mockResolvedValueOnce({
          text: vi.fn().mockResolvedValue("OK"),
          headers: { getSetCookie: () => ["SESSION=new; Path=/"] },
        })
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
        });
      await client.ensureAuthenticated();

      expect(mockFetch).toHaveBeenCalledTimes(4); // 2 login + 2 re-login
    });
  });

  // Helper: sets up a successful login sequence (2 fetch calls)
  function setupLogin(session = "SESSION=abc; Path=/") {
    mockFetch
      .mockResolvedValueOnce({
        text: vi.fn().mockResolvedValue("OK"),
        headers: { getSetCookie: () => [session] },
      })
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ data: { loginName: "user" } }),
      });
  }

  describe("searchRefereesForGame", () => {
    it("returns referee list on happy path", async () => {
      setupLogin();
      const mockRefs = { refs: [{ personId: 1, name: "Ref One" }], total: 1 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockRefs),
      });

      const result = await client.searchRefereesForGame(999);

      expect(result).toEqual(mockRefs);
    });

    it("sends correct POST payload to federation", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ refs: [], total: 0 }),
      });

      await client.searchRefereesForGame(42, { textSearch: "Smith", pageFrom: 5, pageSize: 20 });

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/getRefs/"),
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.spielId).toBe(42);
      expect(body.textSearch).toBe("Smith");
      expect(body.pageFrom).toBe(5);
      expect(body.pageSize).toBe(20);
      expect(body.mode).toBe("EINSETZBAR");
    });

    it("uses default options when none provided", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ refs: [], total: 0 }),
      });

      await client.searchRefereesForGame(77);

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/getRefs/"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.textSearch).toBeNull();
      expect(body.pageFrom).toBe(0);
      expect(body.pageSize).toBe(15);
    });

    it("re-authenticates on 401 and returns result", async () => {
      setupLogin();
      // First attempt: 401
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      // Re-login
      setupLogin("SESSION=new; Path=/");
      // Retry succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ refs: [], total: 0 }),
      });

      const result = await client.searchRefereesForGame(999);

      expect(result).toEqual({ refs: [], total: 0 });
    });

    it("re-authenticates on 403 and returns result", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      setupLogin("SESSION=new; Path=/");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ refs: [], total: 0 }),
      });

      const result = await client.searchRefereesForGame(999);

      expect(result).toBeDefined();
    });

    it("throws when retry after re-auth fails", async () => {
      // ensureAuthenticated: initial login
      setupLogin();
      // 3 withRetry attempts, each: fetch 401 + re-login (2 fetches) + retry fetch 500
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
        setupLogin("SESSION=new; Path=/");
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      }

      await expect(withTimers(client.searchRefereesForGame(999))).rejects.toThrow("getRefs failed: 500");
    });

    it("throws on non-ok response (no re-auth path)", async () => {
      // ensureAuthenticated: initial login
      setupLogin();
      // 3 withRetry attempts, each with a direct non-ok response
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      }

      await expect(withTimers(client.searchRefereesForGame(999))).rejects.toThrow("getRefs failed: 503");
    });
  });

  describe("submitRefereeAssignment", () => {
    const candidate = {
      srId: 7,
      vorname: "Jane",
      nachName: "Ref",
      email: "jane@example.com",
      lizenznr: 12345,
      strasse: "Teststr. 1",
      plz: "12345",
      ort: "Teststadt",
      distanceKm: "10",
      qmaxSr1: "A",
      qmaxSr2: null,
      warning: [],
      meta: {
        schiedsrichterId: 7,
        lizenzNr: 12345,
        heimTotal: 0,
        gastTotal: 0,
        total: 0,
        va: 0,
        eh: 0,
        qmaxSr1: null,
        qmaxSr2: null,
        tnaCount: 0,
        sperrvereinCount: 0,
        sperrzeitenCount: 0,
        qualiSr1: 0,
        qualiSr2: 0,
        qualiSr3: 0,
        qualiCoa: 0,
        qualiKom: 0,
        entfernung: 10,
        maxDatumBefore: null,
        minDatumAfter: null,
        anzAmTag: 0,
        anzInWoche: 0,
        anzImMonat: 0,
      },
      qualiSr1: true,
      qualiSr2: false,
      qualiSr3: false,
      qualiCoa: false,
      qualiKom: false,
      srModusMismatchSr1: false,
      srModusMismatchSr2: false,
      ansetzungAmTag: false,
      blocktermin: false,
      zeitraumBlockiert: null,
      srGruppen: [],
    };

    it("returns submit response on happy path", async () => {
      setupLogin();
      const mockResponse = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.submitRefereeAssignment(100, 1, candidate);

      expect(result).toEqual(mockResponse);
    });

    it("sends correct payload for slot 1 assignment via buildSubmitPayload", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      await client.submitRefereeAssignment(100, 1, candidate);

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/submit/"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      // slot 1 should have the candidate, others should be NOOP
      expect(body.sr1.ansetzen).toEqual(candidate);
      expect(body.sr1.ansetzenFix).toBe(true);
      expect(body.sr2.ansetzen).toBeNull();
      expect(body.sr3.ansetzen).toBeNull();
      expect(body.coa.ansetzen).toBeNull();
      expect(body.kom.ansetzen).toBeNull();
    });

    it("sends correct payload for slot 2 assignment", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      await client.submitRefereeAssignment(100, 2, candidate);

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/submit/"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.sr1.ansetzen).toBeNull();
      expect(body.sr2.ansetzen).toEqual(candidate);
      expect(body.sr3.ansetzen).toBeNull();
    });

    it("sends correct payload for slot 3 assignment", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      await client.submitRefereeAssignment(100, 3, candidate);

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/submit/"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.sr1.ansetzen).toBeNull();
      expect(body.sr2.ansetzen).toBeNull();
      expect(body.sr3.ansetzen).toEqual(candidate);
    });

    it("re-authenticates on 401 and returns result", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      setupLogin("SESSION=new; Path=/");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      const result = await client.submitRefereeAssignment(100, 1, candidate);

      expect(result).toEqual({ success: true });
    });

    it("re-authenticates on 403 and returns result", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      setupLogin("SESSION=new; Path=/");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      const result = await client.submitRefereeAssignment(100, 1, candidate);

      expect(result).toBeDefined();
    });

    it("throws when retry after re-auth fails", async () => {
      setupLogin();
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
        setupLogin("SESSION=new; Path=/");
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      }

      await expect(withTimers(client.submitRefereeAssignment(100, 1, candidate))).rejects.toThrow(
        "submit assignment failed: 500",
      );
    });

    it("throws on non-ok response", async () => {
      setupLogin();
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });
      }

      await expect(withTimers(client.submitRefereeAssignment(100, 1, candidate))).rejects.toThrow(
        "submit assignment failed: 422",
      );
    });
  });

  describe("submitRefereeUnassignment", () => {
    it("returns submit response on happy path", async () => {
      setupLogin();
      const mockResponse = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.submitRefereeUnassignment(200, 2);

      expect(result).toEqual(mockResponse);
    });

    it("sends correct unassignment payload for slot 2 via buildSubmitPayload", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      await client.submitRefereeUnassignment(200, 2);

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/submit/"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.sr1.aufheben).toBeNull();
      expect(body.sr2.aufheben).toEqual({ typ: "AUFHEBEN", grund: null });
      expect(body.sr3.aufheben).toBeNull();
      expect(body.coa.aufheben).toBeNull();
      expect(body.kom.aufheben).toBeNull();
    });

    it("sends correct unassignment payload for slot 3", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      await client.submitRefereeUnassignment(200, 3);

      const postCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("/submit/"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.sr2.aufheben).toBeNull();
      expect(body.sr3.aufheben).toEqual({ typ: "AUFHEBEN", grund: null });
    });

    it("re-authenticates on 401 and returns result", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      setupLogin("SESSION=new; Path=/");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      const result = await client.submitRefereeUnassignment(200, 1);

      expect(result).toEqual({ success: true });
    });

    it("re-authenticates on 403 and returns result", async () => {
      setupLogin();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      setupLogin("SESSION=new; Path=/");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      const result = await client.submitRefereeUnassignment(200, 1);

      expect(result).toBeDefined();
    });

    it("throws when retry after re-auth fails", async () => {
      setupLogin();
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
        setupLogin("SESSION=new; Path=/");
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      }

      await expect(withTimers(client.submitRefereeUnassignment(200, 1))).rejects.toThrow(
        "submit unassignment failed: 500",
      );
    });

    it("throws on non-ok response", async () => {
      setupLogin();
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      }

      await expect(withTimers(client.submitRefereeUnassignment(200, 1))).rejects.toThrow(
        "submit unassignment failed: 500",
      );
    });
  });
});
