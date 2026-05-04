import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpoPushClient } from "./expo-push.client";

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

    it("throws on non-ok HTTP response after retries are exhausted", async () => {
      const ok500 = { ok: false, status: 500, text: async () => "boom" };
      fetchMock.mockResolvedValueOnce(ok500);
      fetchMock.mockResolvedValueOnce(ok500);
      fetchMock.mockResolvedValueOnce(ok500);
      await expect(
        client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]),
      ).rejects.toThrow(/500/);
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

    it("throws on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await expect(
        client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]),
      ).rejects.toThrow(/ECONNREFUSED/);
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
