function env(name: "CMS_URL" | "CMS_API_TOKEN"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

function headers(): Record<string, string> {
  return { Authorization: `users API-Key ${env("CMS_API_TOKEN")}` };
}

/**
 * Every write carries ?skipRebuild=true so the afterChange/afterDelete hooks
 * do not fire ~130 repository_dispatch events at dragons-hub. REST cannot set
 * req.context, which is why the hook reads this query parameter — see
 * apps/cms/src/hooks/dispatch-rebuild.ts.
 */
function writeUrl(path: string, extra: Record<string, string> = {}): string {
  const url = new URL(`${env("CMS_URL").replace(/\/$/, "")}${path}`);
  url.searchParams.set("skipRebuild", "true");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

async function expectOk(res: Response, what: string): Promise<unknown> {
  if (!res.ok) throw new Error(`payload ${what}: HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

export async function createDoc(collection: string, data: unknown): Promise<{ id: number }> {
  const res = await fetch(writeUrl(`/api/${collection}`), {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await expectOk(res, `create ${collection}`)) as { doc: { id: number } };
  return body.doc;
}

export async function createUpload(
  collection: string,
  file: Blob,
  filename: string,
  data: unknown,
): Promise<{ id: number }> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("_payload", JSON.stringify(data));
  // No Content-Type header — fetch sets the multipart boundary itself.
  const res = await fetch(writeUrl(`/api/${collection}`), {
    method: "POST",
    headers: headers(),
    body: form,
  });
  const body = (await expectOk(res, `upload ${filename}`)) as { doc: { id: number } };
  return body.doc;
}

export async function updateGlobal(slug: string, data: unknown): Promise<void> {
  const res = await fetch(writeUrl(`/api/globals/${slug}`), {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await expectOk(res, `global ${slug}`);
}

export async function deleteAll(collection: string): Promise<number> {
  // `where[id][exists]=true` matches every document; Payload requires a where.
  const res = await fetch(writeUrl(`/api/${collection}`, { "where[id][exists]": "true" }), {
    method: "DELETE",
    headers: headers(),
  });
  const body = (await expectOk(res, `delete ${collection}`)) as { docs: unknown[] };
  return body.docs.length;
}

export async function countDocs(collection: string): Promise<number> {
  const url = new URL(`${env("CMS_URL").replace(/\/$/, "")}/api/${collection}`);
  url.searchParams.set("limit", "0");
  url.searchParams.set("depth", "0");
  const res = await fetch(url.toString(), { headers: headers() });
  const body = (await expectOk(res, `count ${collection}`)) as { totalDocs: number };
  return body.totalDocs;
}
