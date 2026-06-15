# Club Q&A Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a members-only chatbot that answers questions about the club (fixtures, standings, results/form) on both the web and native apps, grounded by tool-calls over existing public services.

**Architecture:** A new, separate AI slice that reuses the reschedule copilot's plumbing (Vercel AI SDK v6 `streamText().toUIMessageStreamResponse()`, a tool registry, env-flag gating, `useChat`/`DefaultChatTransport`). One streaming endpoint `POST /qa/chat` (auth-gated, rate-limited) is consumed by `useChat` on web (cookie via `credentials:"include"`) and native (cookie via a `Cookie` header + `expo/fetch`). Tools wrap read-only public services, so the tool whitelist is the data-exposure boundary.

**Tech Stack:** Hono + `ai@^6` + `@ai-sdk/google` (API), Next.js + `@ai-sdk/react` (web), Expo ~55 / RN 0.83 + `@ai-sdk/react` + `expo/fetch` (native), Zod contracts, Vitest, Drizzle, Redis (ioredis).

**Spec:** `docs/superpowers/specs/2026-06-15-club-qa-assistant-design.md`

**Conventions for every commit:** Do NOT add `Co-Authored-By` or any AI-credit trailer (per `CLAUDE.md`). Run the package's tests before each commit. Work on branch `feat/club-qa-assistant`.

**Tool set (v1):** `get_dashboard`, `get_standings`, `list_matches` — these answer "which team plays this weekend" (`get_dashboard.upcomingGames` / `list_matches` by date), "what place is Herren 1 in" (`get_standings`), and "how did the last games go" (`get_dashboard.recentResults` / `list_matches`). They need no internal-id resolution. `get_team_stats`/`list_teams`/referee/FAQ tools are deferred later additions (the registry is one-entry-per-tool).

---

## Task 1: API env flags (`CHATBOT_ENABLED`, `CHATBOT_MODEL`)

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.test.ts` (create if absent; else add a `describe` block)

- [ ] **Step 1: Write the failing test**

Create/append `apps/api/src/config/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { envSchema } from "./env";

const baseEnv = {
  DATABASE_URL: "postgres://x",
  REDIS_URL: "redis://x",
  SDK_USERNAME: "u",
  SDK_PASSWORD: "p",
  BETTER_AUTH_SECRET: "x".repeat(32),
  SCOREBOARD_INGEST_KEY: "y".repeat(32),
  SCOREBOARD_DEVICE_ID: "panel-1",
};

describe("CHATBOT_* env", () => {
  it("defaults CHATBOT_ENABLED=false and CHATBOT_MODEL=gemini-2.5-flash", () => {
    const parsed = envSchema.parse(baseEnv);
    expect(parsed.CHATBOT_ENABLED).toBe(false);
    expect(parsed.CHATBOT_MODEL).toBe("gemini-2.5-flash");
  });

  it("requires GOOGLE_GENERATIVE_AI_API_KEY when CHATBOT_ENABLED=true", () => {
    const result = envSchema.safeParse({ ...baseEnv, CHATBOT_ENABLED: "true" });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join("."))).toContain(
      "GOOGLE_GENERATIVE_AI_API_KEY",
    );
  });

  it("accepts CHATBOT_ENABLED=true with the key present", () => {
    const parsed = envSchema.parse({ ...baseEnv, CHATBOT_ENABLED: "true", GOOGLE_GENERATIVE_AI_API_KEY: "k" });
    expect(parsed.CHATBOT_ENABLED).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- env.test`
Expected: FAIL (`CHATBOT_ENABLED` undefined / superRefine missing).

- [ ] **Step 3: Add the fields and superRefine clause**

In `apps/api/src/config/env.ts`, inside the `z.object({ ... })`, next to `ASSISTANT_MODEL`/`MCP_TOKEN`, add:

```ts
    CHATBOT_ENABLED: z
      .union([z.literal("true"), z.literal("false")])
      .default("false")
      .transform((v) => v === "true"),
    CHATBOT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
```

In the `.superRefine((env, ctx) => { ... })`, alongside the existing `ASSISTANT_ENABLED` check, add:

```ts
    if (env.CHATBOT_ENABLED && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "GOOGLE_GENERATIVE_AI_API_KEY is required when CHATBOT_ENABLED=true",
      });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- env.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/config/env.test.ts
git commit -m "feat(api): add CHATBOT_ENABLED and CHATBOT_MODEL env flags"
```

---

## Task 2: `chatbotModel()` provider factory

**Files:**
- Modify: `apps/api/src/config/ai.ts`
- Test: `apps/api/src/config/ai.test.ts` (add a `describe`)

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/config/ai.test.ts`:

```ts
describe("chatbotModel", () => {
  it("creates the google provider and returns the configured CHATBOT_MODEL", async () => {
    vi.resetModules();
    const createGoogleGenerativeAI = vi.fn();
    vi.doMock("@ai-sdk/google", () => ({ createGoogleGenerativeAI }));
    vi.doMock("./env", () => ({
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "test-key", CHATBOT_MODEL: "gemini-2.5-flash" },
    }));
    const { chatbotModel } = await import("./ai");
    const modelFactory = vi.fn().mockReturnValue({ id: "gemini-2.5-flash" });
    createGoogleGenerativeAI.mockReturnValue(modelFactory);
    const model = chatbotModel();
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(modelFactory).toHaveBeenCalledWith("gemini-2.5-flash");
    expect(model).toEqual({ id: "gemini-2.5-flash" });
    vi.resetModules();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- ai.test`
Expected: FAIL (`chatbotModel` is not exported).

- [ ] **Step 3: Add `chatbotModel()`**

In `apps/api/src/config/ai.ts`, below `assistantModel()`, add (reusing the existing `provider()` helper):

```ts
export function chatbotModel(): LanguageModel {
  // Configurable via CHATBOT_MODEL (default gemini-2.5-flash). To support Claude later,
  // branch on the model-id prefix here and use @ai-sdk/anthropic for "claude-*".
  return provider()(env.CHATBOT_MODEL);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- ai.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/ai.ts apps/api/src/config/ai.test.ts
git commit -m "feat(api): add chatbotModel() provider factory"
```

---

## Task 3: Extract shared `ai/tool-kit.ts` and refactor the reschedule registry

**Files:**
- Create: `apps/api/src/ai/tool-kit.ts`
- Create: `apps/api/src/ai/tool-kit.test.ts`
- Modify: `apps/api/src/ai/tool-registry.ts`
- Modify: `apps/api/src/ai/chat.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/tool-kit.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ tool: (d: unknown) => d }));

// --- Imports (after mocks) ---
import { z } from "zod";
import { defineTool, toAiSdkTools } from "./tool-kit";

describe("defineTool", () => {
  it("parses input with the schema before running", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    const t = defineTool("echo", "desc", z.object({ n: z.number() }), run);
    await t.execute({ n: 3 });
    expect(run).toHaveBeenCalledWith({ n: 3 });
  });

  it("throws on input that fails the schema", async () => {
    const t = defineTool("echo", "desc", z.object({ n: z.number() }), vi.fn());
    await expect(t.execute({ n: "x" })).rejects.toThrow();
  });
});

describe("toAiSdkTools", () => {
  it("maps a tool array into a record keyed by name", () => {
    const t = defineTool("echo", "desc", z.object({}), vi.fn());
    const out = toAiSdkTools([t]) as Record<string, { description: string }>;
    expect(Object.keys(out)).toEqual(["echo"]);
    expect(out.echo.description).toBe("desc");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- tool-kit.test`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Create `apps/api/src/ai/tool-kit.ts`**

```ts
import { z } from "zod";
import { tool as aiTool } from "ai";

export interface ChatTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

/** Define a tool whose raw input is parsed by `inputSchema` before `run` is called. */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  inputSchema: S,
  run: (i: z.infer<S>) => Promise<unknown>,
): ChatTool {
  return {
    name,
    description,
    inputSchema,
    execute: (raw) => run(inputSchema.parse(raw) as z.infer<S>),
  };
}

/** Convert a ChatTool[] into the AI SDK's `Record<string, Tool>` shape. */
export function toAiSdkTools(tools: ChatTool[]) {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      aiTool({ description: t.description, inputSchema: t.inputSchema, execute: (args: unknown) => t.execute(args) }),
    ]),
  );
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm --filter @dragons/api test -- tool-kit.test`
Expected: PASS.

- [ ] **Step 5: Refactor `tool-registry.ts` to use `defineTool`**

In `apps/api/src/ai/tool-registry.ts`: delete the local `ReschedTool` interface and the local `tool<S>(...)` helper. Add at the top:

```ts
import { defineTool, type ChatTool } from "./tool-kit";

export type ReschedTool = ChatTool;
```

Replace every `tool(` call in the `reschedTools` array with `defineTool(`. Keep the array and its contents otherwise unchanged.

- [ ] **Step 6: Refactor `chat.ts` to use the shared mapper**

In `apps/api/src/ai/chat.ts`: remove the local `toAiSdkTools()` function and the `tool` import from `"ai"`. Update imports/usage:

```ts
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { assistantModel } from "../config/ai";
import { reschedTools } from "./tool-registry";
import { toAiSdkTools } from "./tool-kit";
import { buildRescheduleSystemPrompt } from "./system-prompt";
import { getMatchForReschedule } from "../services/reschedule/reschedule-context.service";
```

and in `streamRescheduleChat`, change `tools: toAiSdkTools(),` to `tools: toAiSdkTools(reschedTools),`.

- [ ] **Step 7: Run the affected suites to verify nothing broke**

Run: `pnpm --filter @dragons/api test -- tool-kit.test tool-registry.test chat.test`
Expected: PASS (the existing `chat.test.ts` and `tool-registry.test.ts` still pass).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/ai/tool-kit.ts apps/api/src/ai/tool-kit.test.ts apps/api/src/ai/tool-registry.ts apps/api/src/ai/chat.ts
git commit -m "refactor(api): extract shared ai/tool-kit from reschedule registry"
```

---

## Task 4: Q&A system prompt

**Files:**
- Create: `apps/api/src/ai/qa/qa-system-prompt.ts`
- Create: `apps/api/src/ai/qa/qa-system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildClubQaSystemPrompt } from "./qa-system-prompt";

describe("buildClubQaSystemPrompt", () => {
  it("scopes to the club, instructs tool use, and refuses off-topic", () => {
    const p = buildClubQaSystemPrompt({});
    expect(p).toMatch(/Dragons/);
    expect(p).toMatch(/tools/i);
    expect(p).toMatch(/refuse|decline|only answer/i);
    expect(p).toMatch(/don't have|do not have|don't know/i);
    expect(p).toMatch(/last sync/i);
  });

  it("tells the model to answer in the user's language (German default)", () => {
    expect(buildClubQaSystemPrompt({})).toMatch(/German/);
    expect(buildClubQaSystemPrompt({ locale: "en" })).toMatch(/user's language|locale "en"/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- qa-system-prompt.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the prompt builder**

Create `apps/api/src/ai/qa/qa-system-prompt.ts`:

```ts
export function buildClubQaSystemPrompt(opts: { locale?: string }): string {
  const locale = opts.locale ?? "de";
  return `You are the assistant for the Dragons basketball club. You ONLY answer questions about THIS club: its fixtures, results, standings, teams, schedules and venues.

How you work:
- Use the provided tools to read live club data. Never invent fixtures, scores, standings, or names. If a tool returns nothing, say you don't have that information.
- If a question is off-topic (general knowledge, other clubs, coding, opinions, anything the tools cannot answer), politely decline in one sentence and steer back to club topics.
- Data comes from a periodic sync of the federation portal. For time-sensitive answers (next game, kickoff time, latest result), note that it reflects the last sync and may lag.
- Be concise. Answer in the user's language; default to German for this German club. The current locale is "${locale}".`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- qa-system-prompt.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/qa/qa-system-prompt.ts apps/api/src/ai/qa/qa-system-prompt.test.ts
git commit -m "feat(api): club Q&A system prompt"
```

---

## Task 5: Q&A tools (`get_dashboard`, `get_standings`, `list_matches`)

**Files:**
- Create: `apps/api/src/ai/qa/qa-tools.ts`
- Create: `apps/api/src/ai/qa/qa-tools.test.ts`

Service signatures to call (verified):
- `getHomeDashboard(): Promise<HomeDashboard>` from `../../services/public/home-dashboard.service`
- `getStandings(): Promise<LeagueStandings[]>` from `../../services/admin/standings-admin.service`
- `getOwnClubMatches(params: MatchListParams): Promise<{ items: MatchListItem[]; total; limit; offset; hasMore }>` from `../../services/admin/match-query.service` (`MatchListParams` requires `limit`+`offset`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getHomeDashboard: vi.fn(),
  getStandings: vi.fn(),
  getOwnClubMatches: vi.fn(),
}));
vi.mock("../../services/public/home-dashboard.service", () => ({ getHomeDashboard: m.getHomeDashboard }));
vi.mock("../../services/admin/standings-admin.service", () => ({ getStandings: m.getStandings }));
vi.mock("../../services/admin/match-query.service", () => ({ getOwnClubMatches: m.getOwnClubMatches }));

// --- Imports (after mocks) ---
import { qaTools } from "./qa-tools";

function byName(name: string) {
  const t = qaTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

describe("qaTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes exactly the v1 tool set", () => {
    expect(qaTools.map((t) => t.name).sort()).toEqual(["get_dashboard", "get_standings", "list_matches"]);
  });

  it("get_dashboard calls getHomeDashboard", async () => {
    m.getHomeDashboard.mockResolvedValue({ nextGame: null });
    const r = await byName("get_dashboard").execute({});
    expect(m.getHomeDashboard).toHaveBeenCalled();
    expect(r).toEqual({ nextGame: null });
  });

  it("get_standings calls getStandings", async () => {
    m.getStandings.mockResolvedValue([]);
    await byName("get_standings").execute({});
    expect(m.getStandings).toHaveBeenCalled();
  });

  it("list_matches passes filters with defaults and returns items", async () => {
    m.getOwnClubMatches.mockResolvedValue({ items: [{ id: 1 }], total: 1, limit: 50, offset: 0, hasMore: false });
    const r = await byName("list_matches").execute({ dateFrom: "2026-06-20", dateTo: "2026-06-21" });
    expect(m.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: "2026-06-20", dateTo: "2026-06-21", limit: 50, offset: 0, excludeInactive: true }),
    );
    expect(r).toEqual([{ id: 1 }]);
  });

  it("list_matches rejects a malformed date", async () => {
    await expect(byName("list_matches").execute({ dateFrom: "20-06-2026" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- qa-tools.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the tools**

Create `apps/api/src/ai/qa/qa-tools.ts`:

```ts
import { z } from "zod";
import { defineTool, type ChatTool } from "../tool-kit";
import { getHomeDashboard } from "../../services/public/home-dashboard.service";
import { getStandings } from "../../services/admin/standings-admin.service";
import { getOwnClubMatches } from "../../services/admin/match-query.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const listMatchesInput = z.object({
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  leagueId: z.number().int().positive().optional(),
  teamApiId: z.number().int().positive().optional(),
  hasScore: z.boolean().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const qaTools: ChatTool[] = [
  defineTool(
    "get_dashboard",
    "Club overview: the next game, the last few results, upcoming fixtures, and season win/loss totals. Call this for 'what's next', 'how are we doing', or 'how did the last games go'.",
    z.object({}),
    () => getHomeDashboard(),
  ),
  defineTool(
    "get_standings",
    "Current league tables for the club's tracked leagues, including each team's position. Call this for 'what place is <team> in' or 'show the table'.",
    z.object({}),
    () => getStandings(),
  ),
  defineTool(
    "list_matches",
    "List the club's games, optionally filtered by date range (YYYY-MM-DD), league, team (teamApiId from standings), whether they have a score, and sort order. Call this for fixtures on a specific weekend or a team's schedule/results.",
    listMatchesInput,
    async (i) => {
      const r = await getOwnClubMatches({
        limit: i.limit ?? 50,
        offset: 0,
        excludeInactive: true,
        dateFrom: i.dateFrom,
        dateTo: i.dateTo,
        leagueId: i.leagueId,
        teamApiId: i.teamApiId,
        hasScore: i.hasScore,
        sort: i.sort ?? "asc",
      });
      return r.items;
    },
  ),
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- qa-tools.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/qa/qa-tools.ts apps/api/src/ai/qa/qa-tools.test.ts
git commit -m "feat(api): club Q&A read tools over public services"
```

---

## Task 6: Q&A chat stream

**Files:**
- Create: `apps/api/src/ai/qa/qa-chat.ts`
- Create: `apps/api/src/ai/qa/qa-chat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => ({ stepCountIs: n })),
  convertToModelMessages: vi.fn((x: unknown) => x),
  chatbotModel: vi.fn(() => ({ id: "gemini-2.5-flash" })),
  toAiSdkTools: vi.fn(() => ({ get_dashboard: {}, get_standings: {}, list_matches: {} })),
}));
vi.mock("ai", () => ({ streamText: m.streamText, stepCountIs: m.stepCountIs, convertToModelMessages: m.convertToModelMessages }));
vi.mock("../../config/ai", () => ({ chatbotModel: m.chatbotModel }));
vi.mock("../tool-kit", () => ({ toAiSdkTools: m.toAiSdkTools }));
vi.mock("./qa-tools", () => ({ qaTools: [] }));

// --- Imports (after mocks) ---
import { streamClubQaChat } from "./qa-chat";

describe("streamClubQaChat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires model, system prompt, tools and a step cap, then returns a Response", async () => {
    const toResponse = vi.fn(() => new Response("ok"));
    m.streamText.mockReturnValue({ toUIMessageStreamResponse: toResponse });

    const res = await streamClubQaChat({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "table?" }] }],
      locale: "de",
    });

    expect(m.chatbotModel).toHaveBeenCalled();
    const args = m.streamText.mock.calls[0]![0];
    expect(Object.keys(args.tools)).toContain("get_standings");
    expect(args.system).toMatch(/Dragons/);
    expect(args.stopWhen).toEqual({ stepCountIs: 5 });
    expect(res).toBeInstanceOf(Response);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- qa-chat.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the chat stream**

Create `apps/api/src/ai/qa/qa-chat.ts`:

```ts
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { chatbotModel } from "../../config/ai";
import { toAiSdkTools } from "../tool-kit";
import { qaTools } from "./qa-tools";
import { buildClubQaSystemPrompt } from "./qa-system-prompt";

export async function streamClubQaChat(opts: {
  messages: UIMessage[];
  locale?: string;
}): Promise<Response> {
  const result = streamText({
    model: chatbotModel(),
    system: buildClubQaSystemPrompt({ locale: opts.locale }),
    messages: await convertToModelMessages(opts.messages),
    tools: toAiSdkTools(qaTools),
    stopWhen: stepCountIs(5),
  });
  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- qa-chat.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/qa/qa-chat.ts apps/api/src/ai/qa/qa-chat.test.ts
git commit -m "feat(api): club Q&A chat stream"
```

---

## Task 7: Per-user rate-limit middleware

**Files:**
- Create: `apps/api/src/middleware/rate-limit.ts`
- Create: `apps/api/src/middleware/rate-limit.test.ts`

Mirror the fixed-window pattern in `apps/api/src/middleware/ingest-key.ts` (`getRedis().incr` + `.expire`, 429 with `Retry-After` and `code:"RATE_LIMITED"`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const m = vi.hoisted(() => ({ incr: vi.fn(), expire: vi.fn() }));
vi.mock("../config/redis", () => ({ getRedis: () => ({ incr: m.incr, expire: m.expire }) }));

// --- Imports (after mocks) ---
import { rateLimit } from "./rate-limit";

function makeApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u1" } as never);
    await next();
  });
  app.post("/x", rateLimit({ limit: 2, windowSeconds: 60, keyPrefix: "qa" }), (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows requests under the limit and sets TTL on the first hit", async () => {
    m.incr.mockResolvedValue(1);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(200);
    expect(m.expire).toHaveBeenCalledWith(expect.stringContaining("qa:u1:"), 60);
  });

  it("returns 429 with Retry-After when over the limit", async () => {
    m.incr.mockResolvedValue(3);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- rate-limit.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the middleware**

Create `apps/api/src/middleware/rate-limit.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { getRedis } from "../config/redis";
import type { AppEnv } from "../types";

export function rateLimit(opts: {
  limit: number;
  windowSeconds: number;
  keyPrefix: string;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    const id = user?.id ?? "anon";
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `${opts.keyPrefix}:${id}:${window}`;
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, opts.windowSeconds);
    }
    if (count > opts.limit) {
      c.header("Retry-After", String(opts.windowSeconds));
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    await next();
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- rate-limit.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/rate-limit.ts apps/api/src/middleware/rate-limit.test.ts
git commit -m "feat(api): per-user fixed-window rate-limit middleware"
```

---

## Task 8: `qaChatBodySchema` contract

**Files:**
- Create: `packages/contracts/src/qa.ts`
- Create: `packages/contracts/src/qa.test.ts`
- Modify: `packages/contracts/src/index.ts`

There is NO api-client method or `*.contract.test.ts` for this endpoint — the stream is consumed directly by `useChat`/`DefaultChatTransport`, not `@dragons/api-client`.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/qa.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { qaChatBodySchema } from "./qa";

describe("qaChatBodySchema", () => {
  it("accepts a non-empty messages array and optional locale", () => {
    expect(qaChatBodySchema.safeParse({ messages: [{ id: "1" }], locale: "de" }).success).toBe(true);
    expect(qaChatBodySchema.safeParse({ messages: [{ id: "1" }] }).success).toBe(true);
  });

  it("rejects an empty messages array", () => {
    expect(qaChatBodySchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it("rejects a missing messages field", () => {
    expect(qaChatBodySchema.safeParse({ locale: "de" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/contracts test -- qa.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the contract**

Create `packages/contracts/src/qa.ts`:

```ts
import { z } from "zod";

export const qaChatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  locale: z.string().min(2).max(15).optional(),
});

export type QaChatBody = z.infer<typeof qaChatBodySchema>;
```

Add to `packages/contracts/src/index.ts`:

```ts
export { qaChatBodySchema, type QaChatBody } from "./qa";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/contracts test -- qa.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/qa.ts packages/contracts/src/qa.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): qaChatBodySchema"
```

---

## Task 9: `POST /qa/chat` route + mount

**Files:**
- Create: `apps/api/src/routes/qa.routes.ts`
- Create: `apps/api/src/routes/qa.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

Mirror the `validator`/`describeRoute` import from an existing contract-validated route (e.g. `apps/api/src/routes/device.routes.ts`): `import { describeRoute, validator } from "hono-openapi";`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ streamClubQaChat: vi.fn(), enabled: true }));
vi.mock("../middleware/rbac", () => ({ requireAuth: async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../middleware/rate-limit", () => ({ rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../config/env", () => ({ env: { get CHATBOT_ENABLED() { return mocks.enabled; } } }));
vi.mock("../ai/qa/qa-chat", () => ({ streamClubQaChat: mocks.streamClubQaChat }));

// --- Imports (after mocks) ---
import type { AppEnv } from "../types";
import { errorHandler } from "../middleware/error";
import { qaRoutes } from "./qa.routes";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/qa", qaRoutes);
  return app;
}

function post(body: unknown) {
  return makeApp().request("/qa/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /qa/chat", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

  it("returns 503 when the chatbot is disabled", async () => {
    mocks.enabled = false;
    const res = await post({ messages: [{ id: "1" }] });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "CHATBOT_DISABLED" });
  });

  it("delegates to streamClubQaChat and returns its Response", async () => {
    mocks.streamClubQaChat.mockResolvedValue(new Response("stream", { headers: { "x-test": "1" } }));
    const res = await post({ messages: [{ id: "1", role: "user", parts: [] }], locale: "de" });
    expect(res.headers.get("x-test")).toBe("1");
    expect(mocks.streamClubQaChat).toHaveBeenCalledWith({ messages: [{ id: "1", role: "user", parts: [] }], locale: "de" });
    await res.body?.cancel();
  });

  it("rejects an empty messages array with a 400", async () => {
    const res = await post({ messages: [] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- qa.routes.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/qa.routes.ts`:

```ts
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { UIMessage } from "ai";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/rbac";
import { rateLimit } from "../middleware/rate-limit";
import { validationHook } from "../middleware/validation";
import { qaChatBodySchema } from "@dragons/contracts";
import { env } from "../config/env";
import { streamClubQaChat } from "../ai/qa/qa-chat";

const qaRoutes = new Hono<AppEnv>();

qaRoutes.post(
  "/chat",
  requireAuth,
  rateLimit({ limit: 20, windowSeconds: 60, keyPrefix: "qa-chat" }),
  validator("json", qaChatBodySchema, validationHook),
  describeRoute({
    description: "Stream the members-only club Q&A assistant (AI SDK UI message stream).",
    tags: ["assistant"],
    responses: { 200: { description: "UI message stream" }, 503: { description: "Chatbot disabled" } },
  }),
  async (c) => {
    if (!env.CHATBOT_ENABLED) {
      return c.json({ error: "Chatbot is disabled", code: "CHATBOT_DISABLED" }, 503);
    }
    const { messages, locale } = c.req.valid("json");
    return streamClubQaChat({ messages: messages as UIMessage[], locale });
  },
);

export { qaRoutes };
```

Mount in `apps/api/src/routes/index.ts` (add the import near the others and a mount line):

```ts
import { qaRoutes } from "./qa.routes";
// ...
routes.route("/qa", qaRoutes);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- qa.routes.test`
Expected: PASS.

- [ ] **Step 5: Run the whole API suite + typecheck**

Run: `pnpm --filter @dragons/api test && pnpm --filter @dragons/api typecheck`
Expected: PASS (coverage stays above the 90/95 gate).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/qa.routes.ts apps/api/src/routes/qa.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): members-only POST /qa/chat route"
```

---

## Task 10: Web i18n namespace

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add the `qa` namespace to `en.json`**

Add a top-level `"qa"` object (sibling of `"matches"`, 2-space indent):

```json
  "qa": {
    "trigger": "Ask the club assistant",
    "title": "Club assistant",
    "description": "Ask about fixtures, standings, and recent results.",
    "placeholder": "e.g. who plays this weekend? what place is Herren 1 in?",
    "send": "Send",
    "empty": "Ask me about the club's games, standings, or results.",
    "error": "Something went wrong. Please try again."
  }
```

- [ ] **Step 2: Add the same keys to `de.json`** (German values, identical keys):

```json
  "qa": {
    "trigger": "Den Vereins-Assistenten fragen",
    "title": "Vereins-Assistent",
    "description": "Frag nach Spielen, Tabellen und letzten Ergebnissen.",
    "placeholder": "z. B. wer spielt am Wochenende? auf welchem Platz steht Herren 1?",
    "send": "Senden",
    "empty": "Frag mich nach Spielen, Tabellen oder Ergebnissen des Vereins.",
    "error": "Etwas ist schiefgelaufen. Bitte versuche es erneut."
  }
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('apps/web/src/messages/de.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): qa i18n namespace"
```

---

## Task 11: Web `ClubAssistant` widget

**Files:**
- Create: `apps/web/src/components/public/club-assistant.tsx`
- Create: `apps/web/src/components/public/club-assistant.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/public/club-assistant.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: [], sendMessage: vi.fn(), status: "ready" }) }));
vi.mock("ai", () => ({ DefaultChatTransport: class { constructor(_o: unknown) {} } }));
const sessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => sessionMock() } }));

// Import after mocks
import { ClubAssistant } from "./club-assistant";

const messages = {
  qa: { trigger: "Ask the club assistant", title: "Club assistant", description: "d", placeholder: "p", send: "Send", empty: "e", error: "x" },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

describe("ClubAssistant", () => {
  afterEach(cleanup);

  it("renders the trigger for a logged-in member", () => {
    sessionMock.mockReturnValue({ data: { user: { id: "u1" } } });
    render(wrap(<ClubAssistant />));
    expect(screen.getByRole("button", { name: "Ask the club assistant" })).toBeInTheDocument();
  });

  it("renders nothing for an anonymous visitor", () => {
    sessionMock.mockReturnValue({ data: null });
    const { container } = render(wrap(<ClubAssistant />));
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- club-assistant.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the widget**

Create `apps/web/src/components/public/club-assistant.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@dragons/ui/components/sheet";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ClubAssistant() {
  const { data: session } = authClient.useSession();
  const t = useTranslations("qa");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/qa/chat`,
      credentials: "include",
      body: { locale },
    }),
  });

  if (!session?.user) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5rem+var(--safe-area-bottom))] right-4 z-40 shadow-lg md:bottom-6"
      >
        {t("trigger")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-4 bg-popover shadow-lg ring-1 ring-foreground/10 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="rounded-md bg-surface-low px-3 py-2 text-sm">
                  {msg.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                </div>
              ))
            )}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                void sendMessage({ text: input });
                setInput("");
              }
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              className="rounded-md"
              rows={2}
            />
            <Button type="submit" disabled={status !== "ready"}>
              {t("send")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- club-assistant.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/public/club-assistant.tsx apps/web/src/components/public/club-assistant.test.tsx
git commit -m "feat(web): club assistant chat widget"
```

---

## Task 12: Mount the widget in the public layout

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/layout.tsx`

- [ ] **Step 1: Add the gated mount**

Edit `apps/web/src/app/[locale]/(public)/layout.tsx` — import the widget and render it (after `<PublicBottomTabs />`), gated on the build-time flag:

```tsx
import { PublicHeader } from "@/components/public/public-header";
import { PublicBottomTabs } from "@/components/public/public-bottom-tabs";
import { ClubAssistant } from "@/components/public/club-assistant";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-[calc(5rem+var(--safe-area-bottom))] md:pb-6">
        {children}
      </main>
      <PublicBottomTabs />
      {process.env.NEXT_PUBLIC_CHATBOT_ENABLED === "true" ? <ClubAssistant /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the web app**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/layout.tsx
git commit -m "feat(web): mount club assistant on public pages behind NEXT_PUBLIC_CHATBOT_ENABLED"
```

---

## Task 13: Native dependencies, metro, polyfill

**Files:**
- Modify: `apps/native/package.json`
- Modify: `apps/native/metro.config.js`
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Add dependencies**

In `apps/native/package.json` `dependencies`, add (match the versions web/api already pin):

```json
    "@ai-sdk/react": "^3.0.199",
    "ai": "^6.0.197",
    "@ungap/structured-clone": "^1.3.0",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Enable Metro package-exports**

In `apps/native/metro.config.js`, after the existing `config.resolver = { ... }` assignment, add:

```js
config.resolver.unstable_enablePackageExports = true;
```

- [ ] **Step 4: Add the polyfill as the FIRST import in `_layout.tsx`**

At the very top of `apps/native/src/app/_layout.tsx` (before all other imports):

```ts
import structuredClonePolyfill from "@ungap/structured-clone";
import { Platform } from "react-native";
if (Platform.OS !== "web" && typeof globalThis.structuredClone !== "function") {
  (globalThis as { structuredClone?: unknown }).structuredClone = structuredClonePolyfill;
}
```

- [ ] **Step 5: De-risk the `ai` resolution**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS (confirms `ai` / `@ai-sdk/react` resolve with package-exports enabled). If Metro later errors with `Unable to resolve @vercel/oidc`, confirm Step 3 was applied after the resolver spread.

- [ ] **Step 6: Commit**

```bash
git add apps/native/package.json apps/native/metro.config.js apps/native/src/app/_layout.tsx pnpm-lock.yaml
git commit -m "chore(native): add AI SDK deps, metro package-exports, structuredClone polyfill"
```

---

## Task 14: Native transport builder (testable lib)

**Files:**
- Create: `apps/native/src/lib/assistant/transport.ts`
- Test: `apps/native/src/lib/assistant/transport.test.ts`

(Native tests only run `src/**/*.test.ts` and only `src/lib/**/*.ts` counts for coverage — so the transport/cookie logic lives in `src/lib`.)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildAssistantTransportConfig } from "./transport";

describe("buildAssistantTransportConfig", () => {
  it("targets /qa/chat and sets the Cookie header when a cookie exists", () => {
    const cfg = buildAssistantTransportConfig({ apiUrl: "https://api.test", cookie: "dragons.session=abc", locale: "de" });
    expect(cfg.api).toBe("https://api.test/qa/chat");
    expect(cfg.headers).toEqual({ Cookie: "dragons.session=abc" });
    expect(cfg.body).toEqual({ locale: "de" });
  });

  it("omits the Cookie header when there is no cookie", () => {
    const cfg = buildAssistantTransportConfig({ apiUrl: "https://api.test", cookie: null });
    expect(cfg.headers).toEqual({});
    expect(cfg.body).toEqual({ locale: undefined });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/native test -- transport.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the builder**

Create `apps/native/src/lib/assistant/transport.ts`:

```ts
export interface AssistantTransportConfig {
  api: string;
  headers: Record<string, string>;
  body: { locale?: string };
}

export function buildAssistantTransportConfig(opts: {
  apiUrl: string;
  cookie: string | null;
  locale?: string;
}): AssistantTransportConfig {
  return {
    api: `${opts.apiUrl}/qa/chat`,
    headers: opts.cookie ? { Cookie: opts.cookie } : {},
    body: { locale: opts.locale },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/native test -- transport.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/assistant/transport.ts apps/native/src/lib/assistant/transport.test.ts
git commit -m "feat(native): assistant transport-config builder"
```

---

## Task 15: Native message-text mapper (testable lib)

**Files:**
- Create: `apps/native/src/lib/assistant/messages.ts`
- Test: `apps/native/src/lib/assistant/messages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { messageText } from "./messages";

describe("messageText", () => {
  it("concatenates text parts and ignores non-text parts", () => {
    const msg = { id: "1", role: "assistant", parts: [
      { type: "text", text: "Hello " },
      { type: "tool-call", text: "ignored" },
      { type: "text", text: "world" },
    ] };
    expect(messageText(msg)).toBe("Hello world");
  });

  it("returns an empty string when there are no text parts", () => {
    expect(messageText({ id: "1", role: "user", parts: [] })).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/native test -- messages.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the mapper**

Create `apps/native/src/lib/assistant/messages.ts`:

```ts
export interface UiTextPart {
  type: string;
  text?: string;
}
export interface UiMessageLike {
  id: string;
  role: string;
  parts: UiTextPart[];
}

export function messageText(message: UiMessageLike): string {
  return message.parts
    .filter((p): p is UiTextPart & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/native test -- messages.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/assistant/messages.ts apps/native/src/lib/assistant/messages.test.ts
git commit -m "feat(native): assistant message-text mapper"
```

---

## Task 16: Native assistant screen, route registration, entry point, i18n

**Files:**
- Create: `apps/native/src/app/assistant.tsx`
- Modify: `apps/native/src/app/_layout.tsx` (register the modal route)
- Modify: `apps/native/src/app/(tabs)/index.tsx` (entry-point button)
- Modify: native i18n locale files loaded by `apps/native/src/lib/i18n.ts`

(The screen `.tsx` is not unit-tested — the testable logic lives in Task 14/15. Verify it on a device build.)

- [ ] **Step 1: Add native i18n keys**

Open `apps/native/src/lib/i18n.ts`, find the locale resource objects/files it loads (de + en). Add an `assistant` namespace mirroring an existing namespace's shape, in both locales:

- en: `{ "assistant": { "title": "Club assistant", "placeholder": "Ask about games, standings, results", "send": "Send", "empty": "Ask me about the club's games, standings, or results.", "open": "Ask the club assistant" } }`
- de: `{ "assistant": { "title": "Vereins-Assistent", "placeholder": "Frag nach Spielen, Tabellen, Ergebnissen", "send": "Senden", "empty": "Frag mich nach Spielen, Tabellen oder Ergebnissen des Vereins.", "open": "Den Vereins-Assistenten fragen" } }`

- [ ] **Step 2: Create the screen**

Create `apps/native/src/app/assistant.tsx`:

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { multilineInput } from "@/components/ui/inputStyles";
import { resolveApiUrl, authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { buildAssistantTransportConfig } from "@/lib/assistant/transport";
import { messageText } from "@/lib/assistant/messages";

export default function AssistantScreen() {
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const [input, setInput] = useState("");

  const cfg = buildAssistantTransportConfig({
    apiUrl: resolveApiUrl(),
    cookie: authClient.getCookie(),
    locale: i18n.locale,
  });
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: cfg.api,
      headers: cfg.headers,
      body: cfg.body,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
    }),
  });

  return (
    <Screen scroll={false} edges={[]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(msg) => msg.id}
          ListEmptyComponent={<Text style={{ color: colors.mutedForeground }}>{i18n.t("assistant.empty")}</Text>}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.surfaceLow, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
              <Text style={{ color: colors.foreground }}>{messageText(item)}</Text>
            </View>
          )}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end", paddingVertical: spacing.sm }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            placeholder={i18n.t("assistant.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            style={[multilineInput(theme), { flex: 1 }]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={status !== "ready" || !input.trim()}
            onPress={() => {
              if (input.trim()) {
                void sendMessage({ text: input });
                setInput("");
              }
            }}
          >
            <Text style={{ color: colors.primary, padding: spacing.sm }}>{i18n.t("assistant.send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
```

- [ ] **Step 3: Register the modal route in `_layout.tsx`**

Inside `RootNavigator`'s `<Stack>`, add (using `colors` already in scope):

```tsx
        <Stack.Screen
          name="assistant"
          options={{
            presentation: "modal",
            headerShown: true,
            headerTitle: i18n.t("assistant.title"),
            headerStyle: { backgroundColor: colors.background },
          }}
        />
```

- [ ] **Step 4: Add the entry-point button**

In `apps/native/src/app/(tabs)/index.tsx` (home tab), add a `Pressable` that opens the assistant, gated on a logged-in session and the build flag. Near the existing imports add `import { useRouter } from "expo-router"; import { authClient } from "@/lib/auth-client"; import { i18n } from "@/lib/i18n";` then, inside the component:

```tsx
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const chatbotEnabled = process.env.EXPO_PUBLIC_CHATBOT_ENABLED === "true";
  // ...render, where appropriate in the header/top area:
  {chatbotEnabled && session?.user ? (
    <Pressable accessibilityRole="button" accessibilityLabel={i18n.t("assistant.open")} onPress={() => router.push("/assistant")}>
      <Text style={{ color: colors.primary }}>{i18n.t("assistant.open")}</Text>
    </Pressable>
  ) : null}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/app/assistant.tsx apps/native/src/app/_layout.tsx "apps/native/src/app/(tabs)/index.tsx" apps/native/src/lib/i18n.ts
git commit -m "feat(native): club assistant screen, modal route, and entry point"
```

---

## Task 17: Env documentation

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add to `.env.example`** (under the optional/assistant section):

```
CHATBOT_ENABLED=false             # set true to enable the members-only club Q&A assistant
CHATBOT_MODEL=gemini-2.5-flash    # AI SDK model id for the club Q&A assistant
NEXT_PUBLIC_CHATBOT_ENABLED=false # web: mount the club assistant widget on public pages
EXPO_PUBLIC_CHATBOT_ENABLED=false # native: show the club assistant entry point
```

- [ ] **Step 2: Document in `CLAUDE.md`** — in the "Optional with defaults" env block, add the same four vars with one-line descriptions, mirroring the `ASSISTANT_*` entries. Note that `CHATBOT_ENABLED=true` requires `GOOGLE_GENERATIVE_AI_API_KEY`.

- [ ] **Step 3: Verify the AI-slop check passes** (it scans `.md`):

Run: `pnpm check:ai-slop`
Expected: PASS (no banned phrases).

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: document CHATBOT_* env vars"
```

---

## Task 18: AGENTS.md + deployment plumbing

**Files:**
- Modify: `AGENTS.md`
- Modify: `infra/environments/production/variables.tf`, `infra/environments/production/main.tf`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Update `AGENTS.md`** — add `POST /qa/chat` (members-only club Q&A stream) to the endpoint list, next to the existing assistant endpoint.

- [ ] **Step 2: Thread the runtime flags** — mirror the `SCOREBOARD_DEVICE_ID` / `ASSISTANT_*` pattern documented in `CLAUDE.md` "Production deployment plumbing":
  - Add `chatbot_enabled` and `chatbot_model` variables in `infra/environments/production/variables.tf`.
  - Thread them into the API + Worker `env_vars` blocks in `main.tf` (`CHATBOT_ENABLED`, `CHATBOT_MODEL`). The existing `GOOGLE_GENERATIVE_AI_API_KEY` secret already covers the key requirement.
  - In `.github/workflows/deploy.yml`, pass `NEXT_PUBLIC_CHATBOT_ENABLED` as a Docker build-arg for the web image (sourced from a GitHub repo variable), exactly as `NEXT_PUBLIC_SCOREBOARD_DEVICE_ID` is passed.

- [ ] **Step 3: Validate Terraform formatting** (if `tofu`/`terraform` is available):

Run: `cd infra/environments/production && tofu fmt -check`
Expected: no diff. (If the tool is unavailable, skip and note it.)

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md infra/environments/production/variables.tf infra/environments/production/main.tf .github/workflows/deploy.yml
git commit -m "chore: wire CHATBOT_* through deployment + document endpoint"
```

---

## Final verification

- [ ] **Run the full gates from the repo root:**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS across all packages. (Coverage thresholds for `api`, `web`, `contracts`, `native` stay at or above their floors.)

- [ ] **Manual device/E2E check (not in CI):** with the API running and `CHATBOT_ENABLED=true` + `GOOGLE_GENERATIVE_AI_API_KEY` set, sign in and confirm streaming works on web (public-page FAB) and on a device build of native (home entry → modal). The node-env native tests cannot exercise real streaming.
