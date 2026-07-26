import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpoPushClient, mapTicketError } from "./expo-push.client";

describe("mapTicketError", () => {
  it("returns null for an ok ticket", () => {
    expect(mapTicketError({ status: "ok" })).toBeNull();
  });

  it("returns the message when only message is present", () => {
    expect(mapTicketError({ status: "error", message: "X" })).toBe("X");
  });

  it("returns details.error when only details.error is present", () => {
    expect(mapTicketError({ status: "error", details: { error: "Y" } })).toBe("Y");
  });

  it("prefers message over details.error when both are present", () => {
    expect(mapTicketError({ status: "error", message: "X", details: { error: "Y" } })).toBe("X");
  });

  it("returns 'unknown' when neither message nor details.error is present", () => {
    expect(mapTicketError({ status: "error" })).toBe("unknown");
  });

  it("returns 'unknown' for an undefined ticket", () => {
    expect(mapTicketError(undefined)).toBe("unknown");
  });
});

describe("ExpoPushClient", () => {
  const fetchMock = vi.fn();
  let client: ExpoPushClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    client = new ExpoPushClient({ accessToken: undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("sendBatch", () => {
    it("returns empty array for empty input without calling fetch", async () => {
      const result = await client.sendBatch([]);
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts a single batch for <=100 messages", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "tkt1" }] }),
      });
      const result = await client.sendBatch([
        { to: "ExponentPushToken[a]", title: "T", body: "B" },
      ]);
      expect(result).toEqual([{ status: "ok", id: "tkt1" }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0]!;
      const [url, init] = call;
      expect(url).toBe("https://exp.host/--/api/v2/push/send");
      expect((init as RequestInit).method).toBe("POST");
      expect(JSON.parse((init as RequestInit).body as string)).toHaveLength(1);
    });

    it("splits batches >100 into multiple calls preserving order", async () => {
      const messages = Array.from({ length: 250 }, (_, i) => ({
        to: `ExponentPushToken[${i}]`,
        title: "t",
        body: "b",
      }));
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        const sent = JSON.parse(init.body as string) as unknown[];
        return {
          ok: true,
          json: async () => ({
            data: sent.map((_, i) => ({ status: "ok", id: `id${i}` })),
          }),
        };
      });
      const result = await client.sendBatch(messages);
      expect(result).toHaveLength(250);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("preserves earlier-chunk tickets and marks a failed chunk undelivered instead of throwing (#62)", async () => {
      const messages = Array.from({ length: 150 }, (_, i) => ({
        to: `ExponentPushToken[${i}]`,
        title: "t",
        body: "b",
      }));
      let call = 0;
      fetchMock.mockImplementation(async () => {
        call++;
        if (call === 1) {
          return {
            ok: true,
            json: async () => ({
              data: Array.from({ length: 100 }, (_, i) => ({ status: "ok", id: `id${i}` })),
            }),
          };
        }
        // chunk 2: malformed response shape → postSend throws (no retry)
        return { ok: true, json: async () => ({ unexpected: true }) };
      });

      const tickets = await client.sendBatch(messages);

      // chunk 1 delivered tickets must survive; chunk 2 marked undelivered, not lost.
      expect(tickets).toHaveLength(150);
      expect(tickets.slice(0, 100).every((t) => t.status === "ok")).toBe(true);
      expect(
        tickets.slice(100).every((t) => t.status === "error" && t.details?.error === "ChunkUndelivered"),
      ).toBe(true);
    });

    it("includes Authorization header when accessToken set", async () => {
      const authClient = new ExpoPushClient({ accessToken: "abc" });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "x" }] }),
      });
      await authClient.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer abc");
    });

    it("omits Authorization header when accessToken unset", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "x" }] }),
      });
      await client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    });

    it("marks the message undelivered on a non-ok HTTP response after retries are exhausted", async () => {
      const ok500 = { ok: false, status: 500, text: async () => "boom" };
      fetchMock.mockResolvedValueOnce(ok500);
      fetchMock.mockResolvedValueOnce(ok500);
      fetchMock.mockResolvedValueOnce(ok500);
      const tickets = await client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
      expect(tickets).toEqual([
        expect.objectContaining({ status: "error", details: { error: "ChunkUndelivered" } }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("retries 5xx and succeeds on third attempt", async () => {
      const ok500 = { ok: false, status: 503, text: async () => "boom" };
      fetchMock.mockResolvedValueOnce(ok500);
      fetchMock.mockResolvedValueOnce(ok500);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "tok" }] }),
      });
      const tickets = await client.sendBatch([
        { to: "ExponentPushToken[a]", title: "t", body: "b" },
      ]);
      expect(tickets).toEqual([{ status: "ok", id: "tok" }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("marks the message undelivered on a network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const tickets = await client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
      expect(tickets).toEqual([
        expect.objectContaining({ status: "error", details: { error: "ChunkUndelivered" } }),
      ]);
    });
  });

  describe("getReceipts", () => {
    it("returns empty object for empty input without calling fetch", async () => {
      const result = await client.getReceipts([]);
      expect(result).toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("batches >1000 ticket IDs across calls", async () => {
      const ids = Array.from({ length: 2500 }, (_, i) => `tkt${i}`);
      fetchMock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ data: {} }),
      }));
      await client.getReceipts(ids);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("posts ticket ids to /push/getReceipts", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { tkt1: { status: "ok" }, tkt2: { status: "error", message: "oops" } },
        }),
      });
      const result = await client.getReceipts(["tkt1", "tkt2"]);
      expect(result.tkt1?.status).toBe("ok");
      expect(result.tkt2?.status).toBe("error");
      const call = fetchMock.mock.calls[0]!;
      const [url, init] = call;
      expect(url).toBe("https://exp.host/--/api/v2/push/getReceipts");
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ["tkt1", "tkt2"] });
    });
  });
});
