# Channel Config Typed UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace freeform JSON channel config with typed per-channel schemas, env vars for provider credentials, a provider availability endpoint, and typed UI form fields.

**Architecture:** Keep the `channel_configs.config` column as `jsonb` but enforce typed shapes via Zod discriminated unions. Provider credentials (WhatsApp Meta API, SMTP) live in env vars. A new `/providers` endpoint tells the UI which channel types are available and gates creation server-side. The UI renders typed form fields per channel type instead of a JSON textarea.

**Tech Stack:** Zod 4, Hono, Drizzle ORM, Next.js 16, shadcn/Radix UI, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-channel-config-typed-ui-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/channel-configs.ts` | Modify | Add typed config interfaces, update `ChannelType`, update request/response types |
| `packages/db/src/schema/channel-configs.ts` | Modify | Update `.$type<>()` on config column |
| `apps/api/src/config/env.ts` | Modify | Add optional WhatsApp + SMTP env vars |
| `apps/api/src/services/admin/channel-config-admin.service.ts` | Modify | Remove `?? {}` fallback on config (now required), fix type casts |
| `apps/api/src/services/admin/channel-config-admin.service.test.ts` | Modify | Update test fixtures for typed config |
| `apps/api/src/routes/admin/channel-config.schemas.ts` | Modify | Zod discriminated union for create; typed update config validation helper |
| `apps/api/src/routes/admin/channel-config.schemas.test.ts` | Create | Tests for new validation schemas |
| `apps/api/src/routes/admin/channel-config.routes.ts` | Modify | Add providers endpoint; provider-gate on create; config validation on update via DB lookup |
| `apps/api/src/routes/admin/channel-config.routes.test.ts` | Modify | Tests for providers endpoint + typed create/update validation |
| `apps/web/src/components/admin/notifications/channel-configs-list.tsx` | Modify | Replace JSON textarea with typed form fields, fetch providers |
| `apps/web/src/components/admin/notifications/types.ts` | Modify | Update `ChannelConfigItem.config` type, add typed config interfaces |
| `apps/web/src/messages/en.json` | Modify | Add new i18n keys for form fields, remove `push` from typeLabels |
| `apps/web/src/messages/de.json` | Modify | Add new i18n keys for form fields, remove `push` from typeLabels |
| `apps/web/src/lib/swr-keys.ts` | Modify | Add `channelConfigProviders` key |
| `.env.example` | Modify | Document new optional env vars |
| `AGENTS.md` | Modify | Document new `/admin/channel-configs/providers` endpoint |

**Note:** `packages/db/src/schema/watch-rules.ts` and `apps/api/src/routes/admin/watch-rule.schemas.ts` keep `"push"` in their `ChannelTargetRow`/`channelTargetSchema` types — watch rules may reference existing push-type entries. No changes needed there.

---

### Task 1: Shared types + DB schema + service layer (atomic type change)

These three changes must happen together to avoid intermediate build failures. Changing the shared types alone would break the DB schema and service layer.

**Files:**
- Modify: `packages/shared/src/channel-configs.ts`
- Modify: `packages/db/src/schema/channel-configs.ts`
- Modify: `apps/api/src/services/admin/channel-config-admin.service.ts`
- Modify: `apps/api/src/services/admin/channel-config-admin.service.test.ts`

- [ ] **Step 1: Update shared types — `packages/shared/src/channel-configs.ts`**

Replace the entire file content:

```ts
// ── Channel types ────────────────────────────────────────────────────────────

export type ChannelType = "in_app" | "whatsapp_group" | "email";
export type DigestMode = "per_sync" | "scheduled" | "none";

// ── Per-channel config shapes ───────────────────────────────────────────────

export interface InAppConfig {
  audienceRole: "admin" | "referee";
  locale: "de" | "en";
}

export interface WhatsAppGroupConfig {
  groupId: string;
  locale: "de" | "en";
}

export interface EmailConfig {
  locale: "de" | "en";
}

export type ChannelConfig = InAppConfig | WhatsAppGroupConfig | EmailConfig;

// ── API response types ───────────────────────────────────────────────────────

export interface ChannelConfigItem {
  id: number;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: ChannelConfig;
  digestMode: DigestMode;
  digestCron: string | null;
  digestTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConfigListResult {
  configs: ChannelConfigItem[];
  total: number;
}

// ── Provider availability ───────────────────────────────────────────────────

export interface ProviderStatus {
  configured: boolean;
}

export type ProviderAvailability = Record<ChannelType, ProviderStatus>;

// ── Request body types ───────────────────────────────────────────────────────

export interface CreateChannelConfigBody {
  name: string;
  type: ChannelType;
  enabled?: boolean;
  config: ChannelConfig;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}

export interface UpdateChannelConfigBody {
  name?: string;
  enabled?: boolean;
  config?: ChannelConfig;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}
```

Note: `config` is now **required** on create (no more empty `{}`), and typed as `ChannelConfig`.

- [ ] **Step 2: Update DB schema — `packages/db/src/schema/channel-configs.ts`**

Add import at top:
```ts
import type { ChannelConfig } from "@dragons/shared";
```

Change the config column `$type<>()` from `$type<Record<string, unknown>>()` to `$type<ChannelConfig>()`.

No migration needed — the column is still `jsonb`, only the TypeScript type changes.

- [ ] **Step 3: Fix service layer — `apps/api/src/services/admin/channel-config-admin.service.ts`**

In `createChannelConfig` (around line 78), change:
```ts
config: data.config ?? {},
```
to:
```ts
config: data.config,
```

The `?? {}` fallback is no longer needed since `config` is required on create. The route validates the shape before it reaches the service.

- [ ] **Step 4: Update service test fixtures — `channel-config-admin.service.test.ts`**

In `makeDbRow` (around line 55), the default `config: { groupId: "abc" }` is fine for `whatsapp_group` type but should include `locale`. Update to:
```ts
config: { groupId: "abc", locale: "de" },
```

In the `createChannelConfig` test (around line 222), update the call to pass a valid typed config:
```ts
const result = await createChannelConfig({
  name: "WhatsApp Eltern",
  type: "whatsapp_group",
  config: { groupId: "abc", locale: "de" },
});
```

Update the assertion from `expect(valuesCall.config).toEqual({})` to:
```ts
expect(valuesCall.config).toEqual({ groupId: "abc", locale: "de" });
```

In the `toItem mapping` test (around line 296), change `config: { address: "team@example.com" }` to a valid email config:
```ts
config: { locale: "en" },
```

And update the assertion to match.

- [ ] **Step 5: Verify everything builds and tests pass**

Run: `pnpm --filter @dragons/shared build && pnpm --filter @dragons/db build && pnpm --filter @dragons/api test -- src/services/admin/channel-config-admin.service.test.ts`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/channel-configs.ts packages/db/src/schema/channel-configs.ts apps/api/src/services/admin/channel-config-admin.service.ts apps/api/src/services/admin/channel-config-admin.service.test.ts
git commit -m "feat: add typed channel config interfaces and update DB/service layer"
```

---

### Task 2: Env vars — add WhatsApp + SMTP credentials

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add optional env vars to the Zod schema in `env.ts`**

Add these fields to the `envSchema` object (after the `GCS_PROJECT_ID` line, around line 21):

```ts
  // WhatsApp (Meta Cloud API)
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
```

Note: `SMTP_FROM` is validated as a plain string (not email) because it accepts RFC 5322 display-name format like `Dragons <noreply@dragons.de>`.

- [ ] **Step 2: Update `.env.example`**

Add at the bottom:

```
# WhatsApp notifications (Meta Cloud API) — optional
# WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
# WHATSAPP_ACCESS_TOKEN=your-access-token

# Email notifications (SMTP) — optional
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@dragons.de
# SMTP_PASSWORD=your-password
# SMTP_FROM=Dragons <noreply@dragons.de>
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/env.ts .env.example
git commit -m "feat(api): add optional WhatsApp and SMTP env vars"
```

---

### Task 3: API schemas — Zod discriminated union validation

**Files:**
- Modify: `apps/api/src/routes/admin/channel-config.schemas.ts`
- Create: `apps/api/src/routes/admin/channel-config.schemas.test.ts`

- [ ] **Step 1: Write tests for the new validation schemas**

Create `channel-config.schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createChannelConfigSchema,
  validateConfigForType,
} from "./channel-config.schemas";
```

Test cases for `createChannelConfigSchema`:
- Accepts `type: "in_app"` with `config: { audienceRole: "admin", locale: "de" }`
- Accepts `type: "in_app"` with `config: { audienceRole: "referee", locale: "en" }`
- Accepts `type: "whatsapp_group"` with `config: { groupId: "123", locale: "de" }`
- Accepts `type: "email"` with `config: { locale: "de" }`
- Rejects `type: "push"` (removed from enum)
- Rejects `type: "in_app"` with `config: { groupId: "123", locale: "de" }` (wrong shape for type)
- Rejects `type: "whatsapp_group"` with `config: { audienceRole: "admin", locale: "de" }` (wrong shape)
- Rejects missing `config` on create

Test cases for `validateConfigForType`:
- Returns validated config for matching type/config pair
- Returns `null` for mismatched type/config pair
- Returns `null` for unknown type (e.g., `"push"`)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/channel-config.schemas.test.ts`
Expected: FAIL — `validateConfigForType` doesn't exist yet, schema rejects differently

- [ ] **Step 3: Rewrite `channel-config.schemas.ts`**

```ts
import { z } from "zod";

export const channelConfigIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const channelConfigListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ── Per-channel config schemas ──────────────────────────────────────────────

const localeSchema = z.enum(["de", "en"]);

const inAppConfigSchema = z.object({
  audienceRole: z.enum(["admin", "referee"]),
  locale: localeSchema,
});

const whatsappGroupConfigSchema = z.object({
  groupId: z.string().min(1),
  locale: localeSchema,
});

const emailConfigSchema = z.object({
  locale: localeSchema,
});

const configSchemaByType = {
  in_app: inAppConfigSchema,
  whatsapp_group: whatsappGroupConfigSchema,
  email: emailConfigSchema,
} as const;

// ── Create schema ───────────────────────────────────────────────────────────

const channelTypeSchema = z.enum(["in_app", "whatsapp_group", "email"]);

export const createChannelConfigSchema = z
  .object({
    name: z.string().min(1),
    type: channelTypeSchema,
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()),
    digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
    digestCron: z.string().nullable().optional(),
    digestTimezone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const schema = configSchemaByType[data.type];
    const result = schema.safeParse(data.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["config", ...issue.path],
        });
      }
    }
  });

// ── Update schema ───────────────────────────────────────────────────────────

export const updateChannelConfigSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
  digestCron: z.string().nullable().optional(),
  digestTimezone: z.string().optional(),
});

// ── Config validation helper (for update route) ─────────────────────────────

/**
 * Validate a config object against a specific channel type.
 * Used by the update route handler after fetching the existing row's type.
 * Returns the parsed config or null if validation fails.
 */
export function validateConfigForType(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> | null {
  const schema = configSchemaByType[type as keyof typeof configSchemaByType];
  if (!schema) return null;
  const result = schema.safeParse(config);
  return result.success ? (result.data as Record<string, unknown>) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/channel-config.schemas.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/channel-config.schemas.ts apps/api/src/routes/admin/channel-config.schemas.test.ts
git commit -m "feat(api): add typed Zod validation for channel config per type"
```

---

### Task 4: API routes — providers endpoint + provider-gated create + typed update

**Files:**
- Modify: `apps/api/src/routes/admin/channel-config.routes.ts`
- Modify: `apps/api/src/routes/admin/channel-config.routes.test.ts`

- [ ] **Step 1: Write tests for the providers endpoint, provider-gated create, and typed update**

Add to `channel-config.routes.test.ts`:

**Providers endpoint tests:**
- `GET /channel-configs/providers` returns all three types with `configured` status
- `in_app` is always `configured: true`
- `whatsapp_group` and `email` reflect env var presence

Mock `env` for provider tests:
```ts
vi.mock("../../config/env", () => ({
  env: {
    WHATSAPP_PHONE_NUMBER_ID: "test-id",
    WHATSAPP_ACCESS_TOKEN: "test-token",
    // SMTP vars not set — email should be unconfigured
  },
}));
```

**Provider-gated create tests:**
- POST with `type: "in_app"` and correct config succeeds (in_app always available)
- POST with `type: "whatsapp_group"` and correct config succeeds when env vars are set
- POST with `type: "email"` returns 400 with `PROVIDER_NOT_CONFIGURED` when SMTP env vars are missing
- POST with `type: "push"` returns 400 (invalid type)
- POST with `type: "in_app"` and wrong config shape returns 400

**Typed update tests:**
- PATCH with config matching existing type succeeds
- PATCH with config not matching existing type returns 400
- PATCH without config (e.g., just `{ name: "Renamed" }`) succeeds without config validation

Update the existing `POST /channel-configs` test (`validBody`) to include a config object:
```ts
const validBody = {
  name: "Admin In-App",
  type: "in_app",
  config: { audienceRole: "admin", locale: "de" },
};
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/channel-config.routes.test.ts`
Expected: FAIL — providers endpoint doesn't exist, create doesn't gate on provider, update doesn't validate config

- [ ] **Step 3: Add providers endpoint and provider helper to routes**

Add these imports at the top of `channel-config.routes.ts`:
```ts
import { env } from "../../config/env";
import { validateConfigForType } from "./channel-config.schemas";
```

Add a helper function:
```ts
function isProviderConfigured(type: string): boolean {
  switch (type) {
    case "in_app":
      return true;
    case "whatsapp_group":
      return !!(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);
    case "email":
      return !!(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
    default:
      return false;
  }
}
```

Add the providers endpoint **before** the `GET /channel-configs/:id` route (so `/providers` doesn't match `:id`):

```ts
// GET /admin/channel-configs/providers - Provider availability
channelConfigRoutes.get(
  "/channel-configs/providers",
  describeRoute({
    description: "Check which notification channel providers are configured",
    tags: ["Channel Configs"],
    responses: { 200: { description: "Provider availability" } },
  }),
  (c) => {
    return c.json({
      in_app: { configured: isProviderConfigured("in_app") },
      whatsapp_group: { configured: isProviderConfigured("whatsapp_group") },
      email: { configured: isProviderConfigured("email") },
    });
  },
);
```

- [ ] **Step 4: Add provider gate to POST route**

In the POST handler, after parsing the body, add:

```ts
  async (c) => {
    const body = createChannelConfigSchema.parse(await c.req.json());

    if (!isProviderConfigured(body.type)) {
      return c.json(
        {
          error: `Provider for "${body.type}" is not configured`,
          code: "PROVIDER_NOT_CONFIGURED",
        },
        400,
      );
    }

    const config = await createChannelConfig(body);
    return c.json(config, 201);
  },
```

- [ ] **Step 5: Update the PATCH route to validate config against existing type**

Replace the PATCH handler:

```ts
  async (c) => {
    const { id } = channelConfigIdParamSchema.parse({ id: c.req.param("id") });
    const body = updateChannelConfigSchema.parse(await c.req.json());

    // If config is being updated, validate it against the existing channel type
    if (body.config) {
      const existing = await getChannelConfig(id);
      if (!existing) {
        return c.json(
          { error: "Channel config not found", code: "NOT_FOUND" },
          404,
        );
      }
      const validated = validateConfigForType(existing.type, body.config);
      if (!validated) {
        return c.json(
          {
            error: "Config does not match channel type",
            code: "VALIDATION_ERROR",
          },
          400,
        );
      }
    }

    const config = await updateChannelConfig(id, body);

    if (!config) {
      return c.json(
        { error: "Channel config not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(config);
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/channel-config.routes.test.ts`
Expected: all PASS

- [ ] **Step 7: Run full API test suite**

Run: `pnpm --filter @dragons/api test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/channel-config.routes.ts apps/api/src/routes/admin/channel-config.routes.test.ts
git commit -m "feat(api): add providers endpoint, provider-gate on create, typed config validation on update"
```

---

### Task 5: Web app types + i18n

**Files:**
- Modify: `apps/web/src/components/admin/notifications/types.ts`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`
- Modify: `apps/web/src/lib/swr-keys.ts`

- [ ] **Step 1: Update web app types — `types.ts`**

Add typed config interfaces near the top of the file (before `ChannelConfigItem`):

```ts
// Channel config shapes
export interface InAppConfig {
  audienceRole: "admin" | "referee";
  locale: "de" | "en";
}

export interface WhatsAppGroupConfig {
  groupId: string;
  locale: "de" | "en";
}

export interface EmailConfig {
  locale: "de" | "en";
}

export type ChannelConfig = InAppConfig | WhatsAppGroupConfig | EmailConfig;
```

Update `ChannelConfigItem`:
- Change `type` from `"in_app" | "whatsapp_group" | "push" | "email"` to `"in_app" | "whatsapp_group" | "email"`
- Change `config` from `Record<string, unknown>` to `ChannelConfig`

Add provider types:
```ts
export interface ProviderStatus {
  configured: boolean;
}

export type ProviderAvailability = Record<string, ProviderStatus>;
```

- [ ] **Step 2: Add i18n keys — `en.json`**

Inside the `channelConfigs` section, add these keys:

```json
"audienceRole": "Audience",
"audienceRoles": {
  "admin": "Admins",
  "referee": "Referees"
},
"locale": "Language",
"locales": {
  "de": "German",
  "en": "English"
},
"groupId": "WhatsApp Group ID",
"groupIdHelp": "Group chat ID from Meta Business dashboard",
"providerNotConfigured": "Provider not configured — set env vars to enable"
```

Remove `"push": "Push"` from the `typeLabels` object.

- [ ] **Step 3: Add i18n keys — `de.json`**

Same structure with German translations:

```json
"audienceRole": "Zielgruppe",
"audienceRoles": {
  "admin": "Admins",
  "referee": "Schiedsrichter"
},
"locale": "Sprache",
"locales": {
  "de": "Deutsch",
  "en": "Englisch"
},
"groupId": "WhatsApp Gruppen-ID",
"groupIdHelp": "Gruppen-Chat-ID aus dem Meta Business Dashboard",
"providerNotConfigured": "Anbieter nicht konfiguriert — Umgebungsvariablen setzen"
```

Remove `"push": "Push"` from the `typeLabels` object.

- [ ] **Step 4: Add SWR key for providers — `swr-keys.ts`**

Add inside `SWR_KEYS`:
```ts
channelConfigProviders: "/admin/channel-configs/providers",
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/notifications/types.ts apps/web/src/messages/en.json apps/web/src/messages/de.json apps/web/src/lib/swr-keys.ts
git commit -m "feat(web): update types and i18n for typed channel config"
```

---

### Task 6: UI — replace JSON textarea with typed form fields

**Files:**
- Modify: `apps/web/src/components/admin/notifications/channel-configs-list.tsx`

- [ ] **Step 1: Rewrite the channel config form**

Read the existing file first. Then make these changes:

1. **Update imports** — add `ProviderAvailability` to the types import.

2. **Update `CHANNEL_TYPES`** — remove `"push"`:
```ts
const CHANNEL_TYPES: ChannelType[] = ["in_app", "whatsapp_group", "email"];
```

3. **Remove** `channelTypeLabel` function's `case "push"` branch.

4. **Replace `ChannelFormState`** — remove `config: string`, add typed fields:
```ts
interface ChannelFormState {
  name: string;
  type: ChannelType;
  digestMode: DigestMode;
  digestCron: string;
  digestTimezone: string;
  audienceRole: "admin" | "referee";
  locale: "de" | "en";
  groupId: string;
}
```

5. **Update `emptyForm()`**:
```ts
function emptyForm(): ChannelFormState {
  return {
    name: "",
    type: "in_app",
    digestMode: "none",
    digestCron: "",
    digestTimezone: "Europe/Berlin",
    audienceRole: "admin",
    locale: "de",
    groupId: "",
  };
}
```

6. **Update `channelToForm()`**:
```ts
function channelToForm(ch: ChannelConfigItem): ChannelFormState {
  const config = ch.config;
  return {
    name: ch.name,
    type: ch.type,
    digestMode: ch.digestMode,
    digestCron: ch.digestCron ?? "",
    digestTimezone: ch.digestTimezone,
    audienceRole: "audienceRole" in config ? config.audienceRole : "admin",
    locale: config.locale ?? "de",
    groupId: "groupId" in config ? config.groupId : "",
  };
}
```

7. **Fetch provider availability** — add inside `ChannelConfigsList`:
```ts
const { data: providers } = useSWR<ProviderAvailability>(
  SWR_KEYS.channelConfigProviders,
  apiFetcher,
);

const availableTypes = CHANNEL_TYPES.filter(
  (ct) => providers?.[ct]?.configured !== false,
);
```

8. **Add `buildConfig` helper**:
```ts
function buildConfig(form: ChannelFormState): Record<string, unknown> {
  switch (form.type) {
    case "in_app":
      return { audienceRole: form.audienceRole, locale: form.locale };
    case "whatsapp_group":
      return { groupId: form.groupId, locale: form.locale };
    case "email":
      return { locale: form.locale };
  }
}
```

9. **Update `handleSubmit`** — replace `JSON.parse(form.config)` with `buildConfig(form)`:
```ts
const body = {
  name: form.name.trim(),
  type: form.type,
  digestMode: form.digestMode,
  digestCron:
    form.digestMode === "scheduled" && form.digestCron
      ? form.digestCron
      : null,
  digestTimezone: form.digestTimezone || "Europe/Berlin",
  config: buildConfig(form),
};
```

Remove the `try/catch` JSON parse block since config is no longer a string.

10. **Reset config on type change** — update the type Select's `onValueChange`:
```ts
onValueChange={(v) =>
  setForm((prev) => ({
    ...emptyForm(),
    name: prev.name,
    digestMode: prev.digestMode,
    digestCron: prev.digestCron,
    digestTimezone: prev.digestTimezone,
    type: v as ChannelType,
  }))
}
```

11. **Use `availableTypes`** in the type Select dropdown instead of `CHANNEL_TYPES`.

12. **Replace the JSON textarea** with typed form fields:

```tsx
{/* Config fields based on type */}
{form.type === "in_app" && (
  <div className="space-y-2">
    <Label>{t("audienceRole")}</Label>
    <Select
      value={form.audienceRole}
      onValueChange={(v) =>
        setForm((prev) => ({
          ...prev,
          audienceRole: v as "admin" | "referee",
        }))
      }
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">{t("audienceRoles.admin")}</SelectItem>
        <SelectItem value="referee">{t("audienceRoles.referee")}</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}

{form.type === "whatsapp_group" && (
  <div className="space-y-2">
    <Label htmlFor="channel-group-id">{t("groupId")}</Label>
    <Input
      id="channel-group-id"
      value={form.groupId}
      onChange={(e) =>
        setForm((prev) => ({ ...prev, groupId: e.target.value }))
      }
      required
    />
    <p className="text-xs text-muted-foreground">{t("groupIdHelp")}</p>
  </div>
)}

{/* Locale (shown for all types) */}
<div className="space-y-2">
  <Label>{t("locale")}</Label>
  <Select
    value={form.locale}
    onValueChange={(v) =>
      setForm((prev) => ({ ...prev, locale: v as "de" | "en" }))
    }
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="de">{t("locales.de")}</SelectItem>
      <SelectItem value="en">{t("locales.en")}</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 2: Verify the web app builds**

Run: `pnpm --filter @dragons/web build`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/notifications/channel-configs-list.tsx
git commit -m "feat(web): replace JSON textarea with typed channel config form fields"
```

---

### Task 7: Documentation + final verification

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md**

Add the new endpoint to the channel configs section:
```
GET  /admin/channel-configs/providers  — check which providers are configured
```

- [ ] **Step 2: Run full API test suite with coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: all pass, coverage above thresholds (90% branches, 95% functions/lines/statements)

- [ ] **Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean (ignore `.next/dev/types/routes.d.ts` errors — those are stale cache)

- [ ] **Step 4: Run AI slop check**

Run: `pnpm check:ai-slop`
Expected: clean

- [ ] **Step 5: Manual smoke test**

Start `pnpm dev`, navigate to `/admin/notifications/channels`:
- Create an in-app channel — should show Audience Role + Locale dropdowns, no JSON textarea
- Create a whatsapp_group channel (if env vars set) — should show Group ID input + Locale dropdown
- Edit an existing channel — form should populate with existing typed values
- Verify channel type dropdown only shows available providers
- Try switching type in the create form — config fields should reset

- [ ] **Step 6: Commit AGENTS.md**

```bash
git add AGENTS.md
git commit -m "docs: add providers endpoint to AGENTS.md"
```
