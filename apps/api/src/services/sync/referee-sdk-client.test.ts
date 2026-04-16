import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mock setup ---

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => mockLog,
  },
}));

const mockEnv = {
  REFEREE_SDK_USERNAME: "refereeuser",
  REFEREE_SDK_PASSWORD: "refereepass",
};

vi.mock("../../config/env", () => ({
  get env() {
    return mockEnv;
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { createRefereeSdkClient } from "./referee-sdk-client";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockEnv.REFEREE_SDK_USERNAME = "refereeuser";
  mockEnv.REFEREE_SDK_PASSWORD = "refereepass";
});

afterEach(() => {
  vi.useRealTimers();
});

function makeLoginResponse(text = "OK") {
  return {
    text: vi.fn().mockResolvedValue(text),
    headers: {
      getSetCookie: () => ["SESSION=referee123; Path=/"],
    },
  };
}

function makeVerifyResponse(loginName = "refereeuser") {
  return {
    json: vi.fn().mockResolvedValue({ data: { loginName } }),
  };
}

function makeOffeneSpieleResponse(total: number, pageFrom: number) {
  const pageSize = 200;
  const count = Math.min(pageSize, total - pageFrom);
  const results = Array.from({ length: count }, (_, i) => ({
    sp: { spielplanId: pageFrom + i + 1 },
    schiriTyp: "SR1",
  }));
  return {
    json: vi.fn().mockResolvedValue({ total, results }),
  };
}

describe("createRefereeSdkClient", () => {
  describe("fetchOffeneSpiele", () => {
    it("returns empty results when REFEREE_SDK_USERNAME is not configured", async () => {
      mockEnv.REFEREE_SDK_USERNAME = undefined as unknown as string;

      const client = createRefereeSdkClient();
      const result = await client.fetchOffeneSpiele();

      expect(result).toEqual({ total: 0, results: [] });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("credentials"),
      );
    });

    it("logs in and fetches offene spiele successfully", async () => {
      mockFetch
        .mockResolvedValueOnce(makeLoginResponse())
        .mockResolvedValueOnce(makeVerifyResponse())
        .mockResolvedValueOnce(makeOffeneSpieleResponse(2, 0));

      const client = createRefereeSdkClient();
      const result = await client.fetchOffeneSpiele();

      expect(result.total).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Login call
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://www.basketball-bund.net/login.do?reqCode=login",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      );

      // Verify call
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://www.basketball-bund.net/rest/user/lc",
        expect.objectContaining({
          headers: expect.objectContaining({ Cookie: "SESSION=referee123" }),
        }),
      );

      // Offene spiele fetch
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        "https://www.basketball-bund.net/rest/offenespiele/search",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Cookie: "SESSION=referee123" }),
        }),
      );
    });

    it("reuses session within TTL (login called only once for two fetches)", async () => {
      mockFetch
        .mockResolvedValueOnce(makeLoginResponse())
        .mockResolvedValueOnce(makeVerifyResponse())
        .mockResolvedValueOnce(makeOffeneSpieleResponse(1, 0))
        .mockResolvedValueOnce(makeOffeneSpieleResponse(1, 0));

      const client = createRefereeSdkClient();

      await client.fetchOffeneSpiele();
      await client.fetchOffeneSpiele();

      // Login (1) + verify (1) + two offene spiele fetches (2) = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);

      const loginCalls = mockFetch.mock.calls.filter((args) =>
        (args[0] as string).includes("login.do"),
      );
      expect(loginCalls).toHaveLength(1);
    });

    it("throws on invalid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        text: vi
          .fn()
          .mockResolvedValue(
            "Die Kombination aus Benutzername und Passwort ist nicht bekannt!",
          ),
        headers: {
          getSetCookie: () => [],
        },
      });

      const client = createRefereeSdkClient();

      await expect(client.fetchOffeneSpiele()).rejects.toThrow(
        "Invalid username or password",
      );
    });

    it("throws when no session cookie received", async () => {
      mockFetch.mockResolvedValueOnce({
        text: vi.fn().mockResolvedValue("OK"),
        headers: {
          getSetCookie: () => ["OTHER_COOKIE=abc; Path=/"],
        },
      });

      const client = createRefereeSdkClient();
      await expect(client.fetchOffeneSpiele()).rejects.toThrow(
        "No session cookie received",
      );
    });

    it("throws when login session does not persist", async () => {
      mockFetch
        .mockResolvedValueOnce(makeLoginResponse())
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ data: {} }),
        });

      const client = createRefereeSdkClient();
      await expect(client.fetchOffeneSpiele()).rejects.toThrow(
        "Login did not persist",
      );
    });

    it("paginates when total exceeds page size", async () => {
      mockFetch
        .mockResolvedValueOnce(makeLoginResponse())
        .mockResolvedValueOnce(makeVerifyResponse())
        .mockResolvedValueOnce(makeOffeneSpieleResponse(350, 0))
        .mockResolvedValueOnce(makeOffeneSpieleResponse(350, 200));

      const client = createRefereeSdkClient();
      const result = await client.fetchOffeneSpiele();

      expect(result.total).toBe(350);
      expect(result.results).toHaveLength(350);

      // Login + verify + 2 pages of results
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Second page request should have pageFrom: 200
      const secondPageCall = mockFetch.mock.calls[3];
      const body = JSON.parse(secondPageCall![1].body as string) as {
        pageFrom: number;
      };
      expect(body.pageFrom).toBe(200);
    });
  });
});
