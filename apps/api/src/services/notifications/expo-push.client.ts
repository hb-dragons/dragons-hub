import { logger } from "../../config/logger";

const log = logger.child({ service: "expo-push" });

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const SEND_BATCH_LIMIT = 100;
const RECEIPTS_BATCH_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushClientOptions {
  accessToken?: string;
}

export class ExpoPushClient {
  private readonly accessToken?: string;

  constructor(options: ExpoPushClientOptions = {}) {
    this.accessToken = options.accessToken;
  }

  async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];
    const tickets: ExpoPushTicket[] = [];
    for (let i = 0; i < messages.length; i += SEND_BATCH_LIMIT) {
      const chunk = messages.slice(i, i + SEND_BATCH_LIMIT);
      const chunkTickets = await this.postSend(chunk);
      tickets.push(...chunkTickets);
    }
    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) return {};
    const out: Record<string, ExpoPushReceipt> = {};
    for (let i = 0; i < ticketIds.length; i += RECEIPTS_BATCH_LIMIT) {
      const chunk = ticketIds.slice(i, i + RECEIPTS_BATCH_LIMIT);
      const chunkReceipts = await this.postReceipts(chunk);
      Object.assign(out, chunkReceipts);
    }
    return out;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;
    return headers;
  }

  private async postSend(chunk: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const res = await this.fetchWithRetry(SEND_URL, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(chunk),
    }, "Expo push send");

    const json = (await res.json()) as { data: ExpoPushTicket[] };
    return json.data ?? [];
  }

  private async postReceipts(chunk: string[]): Promise<Record<string, ExpoPushReceipt>> {
    const res = await this.fetchWithRetry(RECEIPTS_URL, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ ids: chunk }),
    }, "Expo push getReceipts");

    const json = (await res.json()) as { data: Record<string, ExpoPushReceipt> };
    return json.data ?? {};
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.fetchWithTimeout(url, init);
        if (res.ok) return res;
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
          continue;
        }
        const text = await res.text().catch(() => "");
        log.error({ status: res.status, text, attempt }, `${label} failed`);
        throw new Error(`${label} failed: ${res.status} ${text}`);
      } catch (err) {
        lastErr = err;
        const isRetryable =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.includes("ECONNRESET") || err.message.includes("ETIMEDOUT") || err.message.includes("fetch failed"));
        if (!isRetryable || attempt === MAX_ATTEMPTS) throw err;
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }
    throw lastErr ?? new Error(`${label} failed`);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
