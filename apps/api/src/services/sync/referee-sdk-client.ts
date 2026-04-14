import type {
  SdkOffeneSpieleResponse,
  SdkOpenGamesSearchParams,
} from "@dragons/sdk";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

const log = logger.child({ service: "referee-sdk-client" });

const BASE_URL = "https://www.basketball-bund.net";
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const PAGE_SIZE = 200;

const SEARCH_PAYLOAD_BASE: Omit<SdkOpenGamesSearchParams, "datum" | "pageFrom"> =
  {
    ats: null,
    ligaKurz: null,
    pageSize: PAGE_SIZE,
    sortBy: "sp.spieldatum",
    sortOrder: "asc",
    spielStatus: "ALLE",
    srName: null,
    vereinsDelegation: "ALLE",
    vereinsSpiele: "VEREIN",
    zeitraum: "all",
  };

interface RefereeSdkClient {
  fetchOffeneSpiele(): Promise<SdkOffeneSpieleResponse>;
}

export function createRefereeSdkClient(): RefereeSdkClient {
  let sessionCookie: string | null = null;
  let lastAuthenticatedAt = 0;

  function pickSessionCookie(setCookieHeaders: string[]): string | null {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return null;
    for (const raw of setCookieHeaders) {
      const kv = raw.split(";")[0]?.trim();
      if (kv?.startsWith("SESSION=")) return kv;
    }
    return null;
  }

  async function login(): Promise<void> {
    const username = env.REFEREE_SDK_USERNAME!;
    const password = env.REFEREE_SDK_PASSWORD!;

    const body = new URLSearchParams({ username, password }).toString();

    const res = await fetch(`${BASE_URL}/login.do?reqCode=login`, {
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
    const cookie = pickSessionCookie(setCookies);

    if (!cookie) {
      throw new Error("No session cookie received");
    }

    sessionCookie = cookie;

    // Verify session
    const verifyRes = await fetch(`${BASE_URL}/rest/user/lc`, {
      headers: {
        Cookie: sessionCookie,
        Accept: "application/json, text/plain, */*",
      },
    });
    const data = (await verifyRes.json()) as {
      data?: { loginName?: string };
    };
    if (!data?.data?.loginName) {
      throw new Error("Login did not persist, /rest/user/lc has no loginName");
    }

    lastAuthenticatedAt = Date.now();
    log.info("Successfully authenticated with basketball-bund.net (referee)");
  }

  async function ensureAuthenticated(): Promise<void> {
    const sessionAge = Date.now() - lastAuthenticatedAt;
    if (!sessionCookie || sessionAge > SESSION_MAX_AGE_MS) {
      if (sessionCookie) {
        log.info(
          { sessionAgeMs: sessionAge },
          "Referee session expired, re-authenticating",
        );
      }
      await login();
    }
  }

  async function fetchPage(pageFrom: number): Promise<SdkOffeneSpieleResponse> {
    const payload: SdkOpenGamesSearchParams = {
      ...SEARCH_PAYLOAD_BASE,
      datum: new Date().toISOString(),
      pageFrom,
    };

    const res = await fetch(`${BASE_URL}/rest/offenespiele/search`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie!,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return res.json() as Promise<SdkOffeneSpieleResponse>;
  }

  return {
    async fetchOffeneSpiele(): Promise<SdkOffeneSpieleResponse> {
      if (!env.REFEREE_SDK_USERNAME || !env.REFEREE_SDK_PASSWORD) {
        log.info(
          "Referee SDK credentials not configured, skipping offenespiele fetch",
        );
        return { total: 0, results: [] };
      }

      await ensureAuthenticated();

      const firstPage = await fetchPage(0);
      const allResults = [...firstPage.results];

      let pageFrom = PAGE_SIZE;
      while (allResults.length < firstPage.total) {
        const nextPage = await fetchPage(pageFrom);
        allResults.push(...nextPage.results);
        pageFrom += PAGE_SIZE;
      }

      return { total: firstPage.total, results: allResults };
    },
  };
}
