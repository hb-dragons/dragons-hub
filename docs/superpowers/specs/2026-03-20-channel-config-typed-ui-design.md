# Channel Config Typed UI Design

## Problem

Channel configurations store their settings in a freeform `config: jsonb` column exposed as a raw JSON textarea in the admin UI. Users must know the correct keys and shapes to type manually (e.g., `{"audienceRole": "admin", "locale": "de"}`). There is no validation, no guidance, and no indication of which providers are actually configured.

## Goal

Replace the raw JSON config with typed, validated form fields per channel type. Move provider credentials to env variables. Show only available channel types based on configured providers.

## Scope

- Typed config schemas per channel type
- Env vars for WhatsApp (Meta Cloud API) and email (SMTP) credentials
- Provider availability endpoint
- Typed UI form fields replacing the JSON textarea
- Tests for new validation and endpoint

**Not in scope:** WhatsApp/email channel adapters (send logic), digest settings, watch rules, role-defaults.

## Design

### Channel Types and Their Config Shapes

Each channel type has a well-defined config shape validated by Zod:

| Channel Type | Config Fields | Notes |
|---|---|---|
| `in_app` | `audienceRole: "admin" \| "referee"`, `locale: "de" \| "en"` | The pipeline uses `audienceRole` to match role-default audiences — both `"admin"` and `"referee"` are valid |
| `whatsapp_group` | `groupId: string`, `locale: "de" \| "en"` | Group chat ID from Meta Business dashboard |
| `email` | `locale: "de" \| "en"` | Recipient email resolved from user account at send time |

`push` is removed from the allowed `ChannelType` enum until a push adapter exists. This avoids creating configs that can never deliver.

### Env Variables for Provider Credentials

New optional env vars in `apps/api/src/config/env.ts`:

```
# WhatsApp (Meta Cloud API)
WHATSAPP_PHONE_NUMBER_ID=<from Meta Business dashboard>
WHATSAPP_ACCESS_TOKEN=<permanent or system user token>

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@dragons.de
SMTP_PASSWORD=<password>
SMTP_FROM=Dragons <noreply@dragons.de>
```

All optional. If not set, the corresponding channel type cannot be created. In-app requires no credentials.

Note: `SMTP_FROM` accepts RFC 5322 display-name format (e.g., `Dragons <noreply@dragons.de>`), so validate it as a non-empty string, not as a strict email.

### Provider Availability Endpoint

`GET /admin/channel-configs/providers`

Response:

```json
{
  "in_app": { "configured": true },
  "whatsapp_group": { "configured": true },
  "email": { "configured": false }
}
```

Checks whether required env vars are present for each provider. The UI uses this to hide or disable unavailable channel types in the create form.

### Shared Types — `packages/shared/src/channel-configs.ts`

Replace the generic `config: Record<string, unknown>` in `ChannelConfigItem`, `CreateChannelConfigBody`, and `UpdateChannelConfigBody` with typed config shapes:

```ts
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

Update `ChannelType` to `"in_app" | "whatsapp_group" | "email"` (remove `"push"`).

`ChannelConfigItem.config` becomes `ChannelConfig` instead of `Record<string, unknown>`.

### API Validation — `apps/api/src/routes/admin/channel-config.schemas.ts`

The `createChannelConfigSchema` uses Zod discriminated union on the `type` field to validate that the config matches the channel type:

- `type: "in_app"` requires `config: { audienceRole: "admin" | "referee", locale: "de" | "en" }`
- `type: "whatsapp_group"` requires `config: { groupId: string, locale: "de" | "en" }`
- `type: "email"` requires `config: { locale: "de" | "en" }`

**Update validation flow:** Since `type` is immutable after creation and `config` is optional on update, the update route handler must:
1. Fetch the existing row to determine its `type`
2. If `config` is present in the update body, validate it against the existing `type`'s schema
3. Reject if the config shape does not match

This means config validation on update moves from the Zod schema into the route handler (or a service-layer helper), since it requires a DB lookup.

### UI Changes — `apps/web/src/components/admin/notifications/channel-configs-list.tsx`

Replace the JSON textarea in the create/edit dialog with per-channel-type form fields:

**When `in_app` is selected:**
- Audience Role: dropdown (`admin` / `referee`)
- Locale: dropdown (`de` / `en`)

**When `whatsapp_group` is selected:**
- Group ID: text input with helper text
- Locale: dropdown (`de` / `en`)

**When `email` is selected:**
- Locale: dropdown (`de` / `en`)

The channel type dropdown only shows types whose provider is configured (fetched from `/admin/channel-configs/providers`). In-app is always available.

If no providers are configured for a type, it is hidden from the dropdown entirely.

When the user switches the channel type in the create form, reset the config fields to defaults for the new type. This prevents stale values from a previous type being submitted.

### Files Changed

| File | Change |
|---|---|
| `apps/api/src/config/env.ts` | Add optional `WHATSAPP_*` and `SMTP_*` env vars |
| `packages/shared/src/channel-configs.ts` | Add typed config interfaces, update `ChannelType` (remove `push`), update request/response types |
| `packages/db/src/schema/channel-configs.ts` | Update `.$type<>()` on `config` column to `ChannelConfig` |
| `apps/api/src/routes/admin/channel-config.schemas.ts` | Zod discriminated union validation for config per type on create; remove `push` from type enum |
| `apps/api/src/routes/admin/channel-config.routes.ts` | Add `GET /admin/channel-configs/providers` endpoint; add DB-lookup config validation on update |
| `apps/web/src/components/admin/notifications/channel-configs-list.tsx` | Replace JSON textarea with typed form fields, fetch provider availability, reset fields on type switch |
| `apps/web/src/components/admin/notifications/types.ts` | Update `ChannelConfigItem.config` type to match shared types (or import from `@dragons/shared`) |
| `.env.example` | Document new optional env vars |
| Tests | Update channel-config route/service tests, add providers endpoint test |

### Backward Compatibility

Existing `channel_configs` rows with valid config shapes will continue to work. The DB column stays `jsonb` — no migration needed. Rows with invalid shapes (if any) will fail validation on update but remain readable.

### Testing

- API: validate that create rejects mismatched type/config pairs (e.g., `type: "email"` with `{ groupId: "..." }`)
- API: validate that create rejects `type: "push"` (removed from enum)
- API: validate providers endpoint returns correct availability based on env vars
- API: validate update fetches existing type and validates config against it
- API: validate that create rejects whatsapp/email types when provider env vars are missing
- Existing channel-config CRUD tests updated for new config shapes
