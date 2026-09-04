import { describe, it, expect, vi } from "vitest";
import {
  staffPersonCreateBodySchema,
  staffPersonUpdateBodySchema,
  staffPersonListQuerySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { staffPeopleEndpoints } from "./staff-people";

/** Build a client whose fetch records the outgoing request url + method + body. */
function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: staffPeopleEndpoints(client), calls };
}

describe("staff person request bodies satisfy @dragons/contracts schemas", () => {
  it("create body parses against staffPersonCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });
    const parsed = staffPersonCreateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "staffPersonCreateBodySchema rejected the create body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/staff-people");
    expect(calls[0]!.method).toBe("POST");
  });

  it("minimal create body parses against staffPersonCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({ firstName: "Ada", lastName: "Lovelace" });
    const parsed = staffPersonCreateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "staffPersonCreateBodySchema rejected the minimal create body",
    ).toBeUndefined();
  });

  it("update body parses against staffPersonUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(9, { phone: "", email: "", licence: null, lastName: "Byron" });
    const parsed = staffPersonUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "staffPersonUpdateBodySchema rejected the update body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/staff-people/9");
    expect(calls[0]!.method).toBe("PATCH");
  });
});

describe("staff person read and delete endpoints target the right path + verb", () => {
  it("list targets the pool with GET and no query when unsearched", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    expect(calls[0]!.url).toMatch(/\/admin\/staff-people$/);
    expect(calls[0]!.method).toBe("GET");
  });

  it("list sends the search fragment as the contract's `q`", async () => {
    const { api, calls } = recordingClient();
    await api.list("love lace");
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe("love lace");
    expect(staffPersonListQuerySchema.safeParse({ q }).error?.issues).toBeUndefined();
  });

  it("remove targets the person with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.remove(9);
    expect(calls[0]!.url).toContain("/admin/staff-people/9");
    expect(calls[0]!.method).toBe("DELETE");
  });
});

/** The upload is multipart, so its body is recorded as-is rather than JSON-parsed. */
function formRecordingClient() {
  const calls: { url: string; method: string; body: unknown; headers: HeadersInit | undefined }[] =
    [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body,
      headers: init?.headers,
    });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: staffPeopleEndpoints(client), calls };
}

describe("the portrait upload posts multipart to the person's photo path", () => {
  it("sends the file under the `file` field the route reads", async () => {
    const { api, calls } = formRecordingClient();
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/png" });

    await api.uploadPhoto(9, file);

    const call = calls[0]!;
    expect(call.url).toContain("/admin/staff-people/9/photo");
    expect(call.method).toBe("POST");
    expect(call.body).toBeInstanceOf(FormData);
    expect((call.body as FormData).get("file")).toBe(file);
  });

  it("leaves Content-Type unset so the runtime writes the multipart boundary", async () => {
    const { api, calls } = formRecordingClient();

    await api.uploadPhoto(9, new File([], "p.png", { type: "image/png" }));

    expect(calls[0]!.headers).not.toHaveProperty("Content-Type");
  });
});
