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
  cache?: RequestCache;
  /**
   * Called for every response before the client parses the body.
   * Errors thrown from the hook are not caught — keep it defensive.
   */
  onResponse?: (response: Response) => void | Promise<void>;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly auth?: AuthStrategy;
  /**
   * Explicitly-injected fetch, if any. When absent we resolve `globalThis.fetch`
   * at call time (not construction time) so test doubles that stub the global
   * after the client is constructed still take effect.
   */
  private readonly fetchFn?: typeof fetch;
  private readonly credentials?: RequestCredentials;
  private readonly cache?: RequestCache;
  private readonly onResponse?: (response: Response) => void | Promise<void>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
    this.fetchFn = options.fetchFn;
    this.credentials = options.credentials;
    this.cache = options.cache;
    this.onResponse = options.onResponse;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    opts?: { signal?: AbortSignal },
  ): Promise<T> {
    return this.request<T>("GET", path, params, undefined, opts);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, undefined, body);
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
    opts?: { signal?: AbortSignal },
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
    if (this.cache) {
      init.cache = this.cache;
    }
    if (opts?.signal) {
      init.signal = opts.signal;
    }
    const fetchFn = this.fetchFn ?? globalThis.fetch;
    const response = await fetchFn(url, init);

    if (this.onResponse) {
      await this.onResponse(response);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorRecord = errorBody as Record<string, unknown>;
      throw new APIError(
        response.status,
        (errorRecord["code"] as string) ?? "UNKNOWN_ERROR",
        (errorRecord["error"] as string) ??
          (errorRecord["message"] as string) ??
          response.statusText,
      );
    }

    return (await response.json()) as T;
  }
}
