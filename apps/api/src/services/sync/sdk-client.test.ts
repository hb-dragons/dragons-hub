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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  client = new SdkClient();
});

afterEach(() => {
  vi.useRealTimers();
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

      await expect(client.getGameDetails(1000)).rejects.toThrow(
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

      await expect(client.getGameDetails(1000)).rejects.toThrow();
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
      for (let i = 0; i < 16; i++) {
        await client.getSpielplan(i);
      }
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

      const result = await client.getGameDetailsBatch([1, 2]);

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

      const result = await client.getGameDetailsBatch([1, 2, 3, 4]);

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

      const result = await client.getGameDetailsBatch([1, 2]);

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

      await expect(client.ensureAuthenticated()).rejects.toThrow(
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

      await expect(client.ensureAuthenticated()).rejects.toThrow(
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

      await expect(client.ensureAuthenticated()).rejects.toThrow(
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

      await expect(client.ensureAuthenticated()).rejects.toThrow(
        "Login did not persist",
      );
    });
  });

  describe("authenticatedFetch without auth", () => {
    it("throws when calling getGameDetails without login", async () => {
      // Direct call without ensuring auth - the authClient has no sessionCookie
      // But ensureAuthenticated will try to login
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(client.getGameDetails(1)).rejects.toThrow();
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
});
