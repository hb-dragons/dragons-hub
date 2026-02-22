import BasketballBundSDK from "basketball-bund-sdk";

const BASE_URL = "https://www.basketball-bund.net";

export class SdkFetcher {
  private sdk = new BasketballBundSDK();
  private sessionCookie: string | null = null;
  private authenticated = false;

  constructor(
    private username?: string,
    private password?: string,
  ) {}

  get hasCredentials(): boolean {
    return !!(this.username && this.password);
  }

  async login(): Promise<boolean> {
    if (!this.username || !this.password) {
      return false;
    }

    const loginUrl = `${BASE_URL}/login.do?reqCode=login`;
    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
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

    // Verify login
    const verifyRes = await this.authenticatedFetch("/rest/user/lc");
    const data = await verifyRes.json();
    if (!data?.data?.loginName) {
      throw new Error("Login did not persist");
    }

    this.authenticated = true;
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

  private async authenticatedFetch(path: string): Promise<Response> {
    if (!this.sessionCookie) {
      throw new Error("Not authenticated. Call login() first.");
    }
    return fetch(`${BASE_URL}${path}`, {
      headers: {
        Cookie: this.sessionCookie,
        Accept: "application/json, text/plain, */*",
      },
    });
  }

  async fetchLigaList(): Promise<unknown> {
    const response = await this.sdk.wam.getLigaList({
      akgGeschlechtIds: [],
      altersklasseIds: [],
      gebietIds: [],
      ligatypIds: [],
      sortBy: 0,
      spielklasseIds: [],
      token: "",
      verbandIds: [7],
      startAtIndex: 0,
    });
    return response;
  }

  async fetchSpielplan(competitionId: number): Promise<unknown> {
    const response = await this.sdk.competition.getSpielplan({ competitionId });
    return response;
  }

  async fetchTabelle(competitionId: number): Promise<unknown> {
    const response = await this.sdk.competition.getTabelle({ competitionId });
    return response;
  }

  async fetchGameDetails(matchId: number): Promise<unknown> {
    if (!this.authenticated) {
      await this.login();
    }
    const res = await this.authenticatedFetch(
      `/rest/assignschiri/getGame/${matchId}`,
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch game details: ${res.status}`);
    }
    return res.json();
  }

  /**
   * Auto-discover IDs for testing: fetch liga list → pick first competition → fetch spielplan → pick first matchId.
   */
  async discoverTestIds(): Promise<{
    competitionId: number;
    matchId: number | null;
  }> {
    const ligaList = (await this.fetchLigaList()) as {
      ligen?: Array<{ ligaId: number }>;
    };
    const firstLiga = ligaList?.ligen?.[0];
    if (!firstLiga) {
      throw new Error("No leagues found in liga list response");
    }
    const competitionId = firstLiga.ligaId;

    const spielplan = (await this.fetchSpielplan(competitionId)) as {
      matches?: Array<{ matchId: number }>;
    };
    const firstMatch = spielplan?.matches?.[0];

    return {
      competitionId,
      matchId: firstMatch?.matchId ?? null,
    };
  }

  logout(): void {
    this.sessionCookie = null;
    this.authenticated = false;
  }
}
