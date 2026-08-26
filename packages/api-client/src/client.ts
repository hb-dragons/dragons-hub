import { APIError } from "./errors";
import { buildQueryString } from "./query-string";

export interface AuthStrategy {
  getHeaders(): Record<string, string> | Promise<Record<string, string>>;
}

/**
 * A downloaded file plus its response headers. File endpoints carry their
 * metadata out-of-band (row counts, truncation flags, `Content-Disposition`),
 * so callers need the headers alongside the bytes.
 */
export interface BlobResponse {
  blob: Blob;
  headers: Headers;
}

/**
 * Default request deadline. Without one a hung connection — a stalled Cloud Run
 * cold start, a captive portal — leaves callers spinning forever: the fetch
 * never settles, so nothing catches and no error state is ever reached (#271).
 * Long jobs are queued by the API rather than awaited, so 30s is generous.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Deadline for binary endpoints. Exports and generated images are produced
 * on the request, not queued, so they are legitimately slower than a JSON read.
 */
export const BLOB_TIMEOUT_MS = 120_000;

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
  /**
   * Deadline in milliseconds for every request this client makes. Defaults to
   * `DEFAULT_TIMEOUT_MS`; `0` disables it (for a genuinely long-running call,
   * prefer a per-request `timeoutMs`).
   */
  timeoutMs?: number;
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
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
    this.fetchFn = options.fetchFn;
    this.credentials = options.credentials;
    this.cache = options.cache;
    this.onResponse = options.onResponse;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T> {
    return this.request<T>("GET", path, params, undefined, opts);
  }

  async post<T>(
    path: string,
    body?: unknown,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T> {
    return this.request<T>("POST", path, undefined, body, opts);
  }

  /**
   * POST a multipart `FormData` body (file uploads). The runtime sets the
   * `multipart/form-data` boundary, so we must not send our own `Content-Type`.
   * The response is parsed as JSON like the other verbs.
   */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>("POST", path, undefined, form, { isForm: true });
  }

  /**
   * POST a JSON body and resolve the response as a binary `Blob` (e.g. a
   * generated PNG). Non-ok responses still throw an `APIError` parsed from the
   * JSON error envelope.
   */
  async postBlob(path: string, body?: unknown): Promise<Blob> {
    return this.request<Blob>("POST", path, undefined, body, {
      responseType: "blob",
    });
  }

  /**
   * GET a file download (CSV, PDF, image). Resolves the body as a `Blob`
   * together with the response headers — the API exposes row counts and
   * truncation flags there, and CORS `exposeHeaders` makes them readable from
   * the browser. Non-ok responses still throw an `APIError`.
   */
  async getBlob(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<BlobResponse> {
    return this.request<BlobResponse>("GET", path, params, undefined, {
      responseType: "blobWithHeaders",
    });
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
    opts?: {
      signal?: AbortSignal;
      timeoutMs?: number;
      isForm?: boolean;
      responseType?: "blob" | "blobWithHeaders";
    },
  ): Promise<T> {
    const qs = params ? buildQueryString(params) : "";
    const url = `${this.baseUrl}${path}${qs}`;

    const isForm = opts?.isForm ?? false;
    const headers: Record<string, string> = {
      // Binary responses accept anything; JSON requests stay strict.
      Accept: opts?.responseType ? "*/*" : "application/json",
    };
    // For multipart uploads the runtime must set the boundary itself, so we
    // omit Content-Type entirely.
    if (!isForm) {
      headers["Content-Type"] = "application/json";
    }

    if (this.auth) {
      const authHeaders = await this.auth.getHeaders();
      Object.assign(headers, authHeaders);
    }

    const init: RequestInit = {
      method,
      headers,
      body: isForm
        ? (body as FormData)
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
    };
    if (this.credentials) {
      init.credentials = this.credentials;
    }
    if (this.cache) {
      init.cache = this.cache;
    }
    const deadline = this.deadline(
      opts?.timeoutMs ?? (opts?.responseType ? BLOB_TIMEOUT_MS : undefined),
      opts?.signal,
    );
    if (deadline.signal) {
      init.signal = deadline.signal;
    }
    const fetchFn = this.fetchFn ?? globalThis.fetch;
    let response: Response;
    try {
      response = await fetchFn(url, init);
    } catch (error) {
      // A deadline abort surfaces as the same honest failure as any other
      // network error, distinguishable by its code.
      if (deadline.expired) {
        throw new APIError(408, "TIMEOUT", `Request timed out after ${deadline.ms}ms`);
      }
      throw error;
    } finally {
      deadline.clear();
    }

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

    if (opts?.responseType === "blob") {
      return (await response.blob()) as T;
    }

    if (opts?.responseType === "blobWithHeaders") {
      return {
        blob: await response.blob(),
        headers: response.headers,
      } as T;
    }

    return (await response.json()) as T;
  }

  /**
   * Composes the caller's signal (if any) with this request's deadline.
   * Written with a plain controller rather than `AbortSignal.any` so it holds
   * on React Native, where that static is not guaranteed.
   */
  private deadline(
    override: number | undefined,
    callerSignal: AbortSignal | undefined,
  ): { signal: AbortSignal | undefined; clear: () => void; expired: boolean; ms: number } {
    const ms = override ?? this.timeoutMs;
    if (ms <= 0) {
      return { signal: callerSignal, clear: () => {}, expired: false, ms };
    }

    const controller = new AbortController();
    const state = { signal: controller.signal, expired: false, ms, clear: () => {} };

    const timer = setTimeout(() => {
      state.expired = true;
      controller.abort(new Error(`Request timed out after ${ms}ms`));
    }, ms);

    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) {
        onCallerAbort();
      } else {
        callerSignal.addEventListener("abort", onCallerAbort);
      }
    }

    state.clear = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    };
    return state;
  }
}
