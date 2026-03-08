import BasketballBundSDK from "basketball-bund-sdk";
import pLimit from "p-limit";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

const log = logger.child({ service: "sdk-client" });
import type {
  SdkLiga,
  SdkLigaListResponse,
  SdkSpielplanMatch,
  SdkSpielplanResponse,
  SdkTabelleEntry,
  SdkTabelleResponse,
  SdkGetGameResponse,
  SdkClubSearchResult,
  SdkClubMatchesResponse,
} from "@dragons/sdk";

const BASE_URL = "https://www.basketball-bund.net";

// Rate limiter: token bucket with 15 burst, refilling at 10/sec
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private maxTokens: number = 15,
    private refillRate: number = 10,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.pending = this.pending.then(() => this.acquireInternal());
    return this.pending;
  }

  private async acquireInternal(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    const waitMs = (1 / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  label: string = "operation",
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const baseDelay = Math.pow(2, attempt - 1) * 1000;
      const jitter = baseDelay * Math.random() * 0.5;
      const delay = baseDelay + jitter;
      log.warn(
        { label, attempt, delayMs: Math.round(delay) },
        `${label} attempt ${attempt} failed, retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

class AuthenticatedClient {
  private sessionCookie: string | null = null;
  private isAuthenticated = false;
  private lastAuthenticatedAt: number = 0;

  async login(): Promise<boolean> {
    const loginUrl = `${BASE_URL}/login.do?reqCode=login`;
    const body = new URLSearchParams({
      username: env.SDK_USERNAME,
      password: env.SDK_PASSWORD,
    }).toString();

    const res = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual",
    });

    const responseText = await res.text();

    if (
      responseText.includes(
        "Die Kombination aus Benutzername und Passwort ist nicht bekannt!",
      )
    ) {
      throw new Error("Invalid username or password");
    }

    const setCookies = res.headers.getSetCookie();
    this.sessionCookie = this.pickSessionCookie(setCookies);

    if (!this.sessionCookie) {
      throw new Error("No session cookie received");
    }

    await this.verifyLogin();
    this.isAuthenticated = true;
    this.lastAuthenticatedAt = Date.now();
    log.info("Successfully authenticated with basketball-bund.net");
    return true;
  }

  private pickSessionCookie(setCookieHeaders: string[]): string | null {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return null;
    for (const raw of setCookieHeaders) {
      const kv = raw.split(";")[0]?.trim();
      if (kv?.startsWith("SESSION=")) return kv;
    }
    return null;
  }

  private async verifyLogin(): Promise<void> {
    const response = await this.authenticatedFetch("/rest/user/lc");
    const data = await response.json();
    if (!data?.data?.loginName) {
      throw new Error("Login did not persist, /rest/user/lc has no loginName");
    }
  }

  async authenticatedFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    if (!this.sessionCookie) {
      throw new Error("Not authenticated. Call login() first.");
    }
    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Cookie: this.sessionCookie,
        Accept: "application/json, text/plain, */*",
      },
    });
  }

  get authenticated(): boolean {
    return this.isAuthenticated;
  }

  logout(): void {
    this.sessionCookie = null;
    this.isAuthenticated = false;
    this.lastAuthenticatedAt = 0;
  }

  get authenticatedAt(): number {
    return this.lastAuthenticatedAt;
  }
}

export class SdkClient {
  private authClient = new AuthenticatedClient();
  public sdk = new BasketballBundSDK();
  private rateLimiter = new TokenBucket(15, 10);
  private static readonly SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  async ensureAuthenticated(): Promise<void> {
    const sessionAge = Date.now() - this.authClient.authenticatedAt;
    if (!this.authClient.authenticated || sessionAge > SdkClient.SESSION_MAX_AGE_MS) {
      if (this.authClient.authenticated) {
        log.info({ sessionAgeMs: sessionAge }, "Session expired, re-authenticating");
      }
      await withRetry(() => this.authClient.login(), 3, "login");
    }
  }

  async getAllLigen(verbandIds: number[] = [7]): Promise<SdkLiga[]> {
    const allLigen: SdkLiga[] = [];
    let index = 0;
    let hasMore = true;

    while (hasMore) {
      await this.rateLimiter.acquire();
      const response = await withRetry(
        () =>
          this.sdk.wam.getLigaList({
            akgGeschlechtIds: [],
            altersklasseIds: [],
            gebietIds: [],
            ligatypIds: [],
            sortBy: 0,
            spielklasseIds: [],
            token: "",
            verbandIds,
            startAtIndex: index,
          }),
        3,
        "getLigaList",
      );

      const resp = response as unknown as SdkLigaListResponse;
      if (resp?.ligen) {
        allLigen.push(...resp.ligen);
        hasMore = resp.hasMoreData ?? false;
        index += resp.size ?? resp.ligen.length;
      } else {
        hasMore = false;
      }
    }

    log.info({ count: allLigen.length }, "Fetched leagues");
    return allLigen;
  }

  async getSpielplan(competitionId: number): Promise<SdkSpielplanMatch[]> {
    await this.rateLimiter.acquire();
    const response = await withRetry(
      () => this.sdk.competition.getSpielplan({ competitionId }),
      3,
      `getSpielplan(${competitionId})`,
    );
    const resp = response as unknown as SdkSpielplanResponse;
    return resp?.matches || [];
  }

  async getTabelle(competitionId: number): Promise<SdkTabelleEntry[]> {
    await this.rateLimiter.acquire();
    const response = await withRetry(
      () => this.sdk.competition.getTabelle({ competitionId }),
      3,
      `getTabelle(${competitionId})`,
    );
    const resp = response as unknown as SdkTabelleResponse;
    return resp?.tabelle?.entries || [];
  }

  async getTabelleResponse(
    competitionId: number,
  ): Promise<SdkTabelleResponse | null> {
    await this.rateLimiter.acquire();
    const response = await withRetry(
      () => this.sdk.competition.getTabelle({ competitionId }),
      3,
      `getTabelleResponse(${competitionId})`,
    );
    return (response as unknown as SdkTabelleResponse) ?? null;
  }

  async searchClubs(freetext: string): Promise<SdkClubSearchResult[]> {
    await this.rateLimiter.acquire();
    const response = await withRetry(
      () => this.sdk.club.getClubsByFreetext({ freetext }),
      3,
      `searchClubs(${freetext})`,
    );
    const results = response as unknown as SdkClubSearchResult[];
    return Array.isArray(results) ? results : [];
  }

  async getClubMatches(
    clubId: number,
    rangeDays = 365,
  ): Promise<SdkClubMatchesResponse> {
    await this.rateLimiter.acquire();
    const response = await withRetry(
      () => this.sdk.club.getActualMatches({ clubId, rangeDays }),
      3,
      `getClubMatches(${clubId})`,
    );
    return response as unknown as SdkClubMatchesResponse;
  }

  async getGameDetails(matchId: number): Promise<SdkGetGameResponse> {
    await this.ensureAuthenticated();
    await this.rateLimiter.acquire();
    const response = await withRetry(
      async () => {
        const res = await this.authClient.authenticatedFetch(
          `/rest/assignschiri/getGame/${matchId}`,
        );
        if (res.status === 401 || res.status === 403) {
          // Re-login and retry
          await this.authClient.login();
          const retry = await this.authClient.authenticatedFetch(
            `/rest/assignschiri/getGame/${matchId}`,
          );
          if (!retry.ok)
            throw new Error(`Failed to fetch game details: ${retry.status}`);
          return retry.json();
        }
        if (!res.ok)
          throw new Error(`Failed to fetch game details: ${res.status}`);
        return res.json();
      },
      3,
      `getGameDetails(${matchId})`,
    );

    // Validate the response has the expected structure
    if (!response || typeof response !== "object" || !("game1" in response)) {
      throw new Error(
        `Unexpected response shape for matchId=${matchId}: missing game1 (keys: ${Object.keys(
          response ?? {},
        )
          .slice(0, 5)
          .join(",")})`,
      );
    }

    return response as SdkGetGameResponse;
  }

  async getGameDetailsBatch(
    matchIds: number[],
  ): Promise<Map<number, SdkGetGameResponse>> {
    await this.ensureAuthenticated();

    log.info({ count: matchIds.length }, "Fetching game details for matches");

    const detailsMap = new Map<number, SdkGetGameResponse>();
    const limit = pLimit(10);

    const results = await Promise.allSettled(
      matchIds.map((matchId) =>
        limit(async () => {
          const details = await this.getGameDetails(matchId);
          return { matchId, details };
        }),
      ),
    );

    let failedCount = 0;
    const failedErrors: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "fulfilled") {
        detailsMap.set(result.value.matchId, result.value.details);
      } else {
        failedCount++;
        const matchId = matchIds[i]!;
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        if (failedErrors.length < 5) {
          failedErrors.push(`matchId=${matchId}: ${reason}`);
        }
      }
    }

    log.info(
      { fetched: detailsMap.size, total: matchIds.length, failed: failedCount },
      "Fetched game details",
    );

    if (failedCount > 0) {
      log.warn(
        { failedCount, errors: failedErrors },
        "Game detail failures",
      );
    }

    return detailsMap;
  }

  logout(): void {
    this.authClient.logout();
  }
}

export const sdkClient = new SdkClient();
