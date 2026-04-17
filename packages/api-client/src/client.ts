import { APIError } from "./errors";
import { buildQueryString } from "./query-string";

export interface AuthStrategy {
  getHeaders(): Record<string, string> | Promise<Record<string, string>>;
}

export interface ApiClientOptions {
  baseUrl: string;
  auth?: AuthStrategy;
  fetchFn?: typeof fetch;
  credentials?: RequestCredentials;
  /**
   * Called for every response before the client parses the body.
   * Errors thrown from the hook are not caught — keep it defensive.
   */
  onResponse?: (response: Response) => void | Promise<void>;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly auth?: AuthStrategy;
  private readonly fetchFn: typeof fetch;
  private readonly credentials?: RequestCredentials;
  private readonly onResponse?: (response: Response) => void | Promise<void>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.credentials = options.credentials;
    this.onResponse = options.onResponse;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, params);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, undefined, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: unknown,
  ): Promise<T> {
    const qs = params ? buildQueryString(params) : "";
    const url = `${this.baseUrl}${path}${qs}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.auth) {
      const authHeaders = await this.auth.getHeaders();
      Object.assign(headers, authHeaders);
    }

    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    if (this.credentials) {
      init.credentials = this.credentials;
    }
    const response = await this.fetchFn(url, init);

    if (this.onResponse) {
      await this.onResponse(response);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorRecord = errorBody as Record<string, unknown>;
      throw new APIError(
        response.status,
        (errorRecord["code"] as string) ?? "UNKNOWN_ERROR",
        (errorRecord["message"] as string) ?? response.statusText,
      );
    }

    return (await response.json()) as T;
  }
}
