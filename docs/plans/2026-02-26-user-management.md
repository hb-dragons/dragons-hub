# User Management Admin Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/admin/users` page where admins can create, view, edit, assign roles, ban/unban, and delete users via Better Auth's adminClient API.

**Architecture:** All user CRUD operations go through `authClient.admin.*` methods (already wired up in `apps/web/src/lib/auth-client.ts`). No custom Hono API routes needed. A new Dialog UI component is added to the shared UI package (the existing Sheet component uses the same Radix Dialog primitive). The page uses SWR for client-side data fetching and follows existing admin page patterns.

**Tech Stack:** Next.js 16, Better Auth adminClient, SWR, TanStack Table, Radix Dialog, react-hook-form + Zod, sonner for toasts, next-intl for i18n.

**Design doc:** `docs/plans/2026-02-26-user-management-design.md`

---

### Task 1: Add Dialog UI Component

The project has AlertDialog and Sheet but no general Dialog component. Sheet uses `Dialog` from `radix-ui` internally, confirming the primitive is available.

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`

**Step 1: Create the Dialog component**

Follow the AlertDialog pattern exactly but use the closable Dialog primitive (click-outside-to-close behavior).

```tsx
"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@dragons/ui/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
```

**Step 2: Verify the build**

Run: `pnpm --filter @dragons/ui build` (or `pnpm typecheck` if no build step)
Expected: No errors.

**Step 3: Commit**

```
feat(ui): add Dialog component based on Radix Dialog primitive
```

---

### Task 2: Add i18n Translation Keys

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

**Step 1: Add English translations**

Add `"users"` key to the `nav` section and add a new top-level `"users"` section. Insert `"users": "Users"` in the `nav` object after `"venues"`:

```json
"nav": {
  ...existing keys...,
  "users": "Users"
},
```

Add this new top-level section (place it after the `"teams"` section):

```json
"users": {
  "title": "Users",
  "description": "Manage user accounts and permissions",
  "empty": "No users found",
  "searchPlaceholder": "Search users...",
  "addUser": "Add User",
  "columns": {
    "name": "Name",
    "email": "Email",
    "role": "Role",
    "status": "Status",
    "created": "Created"
  },
  "roles": {
    "admin": "Admin",
    "user": "User"
  },
  "status": {
    "active": "Active",
    "banned": "Banned"
  },
  "actions": {
    "edit": "Edit",
    "changeRole": "Change Role",
    "setPassword": "Set Password",
    "ban": "Ban User",
    "unban": "Unban User",
    "delete": "Delete User"
  },
  "createDialog": {
    "title": "Create User",
    "description": "Create a new user account with a temporary password.",
    "nameLabel": "Name",
    "namePlaceholder": "Full name",
    "emailLabel": "Email",
    "emailPlaceholder": "user@example.com",
    "passwordLabel": "Temporary Password",
    "passwordPlaceholder": "Enter a temporary password",
    "roleLabel": "Role",
    "create": "Create User",
    "creating": "Creating..."
  },
  "editDialog": {
    "title": "Edit User",
    "description": "Update user details.",
    "nameLabel": "Name",
    "emailLabel": "Email",
    "update": "Save Changes",
    "updating": "Saving..."
  },
  "setPasswordDialog": {
    "title": "Set Password",
    "description": "Set a new password for {name}.",
    "passwordLabel": "New Password",
    "passwordPlaceholder": "Enter new password",
    "confirm": "Set Password",
    "confirming": "Setting..."
  },
  "banDialog": {
    "title": "Ban User",
    "description": "Ban {name} from accessing the system.",
    "reasonLabel": "Reason",
    "reasonPlaceholder": "Optional ban reason",
    "expiresLabel": "Expires after (days)",
    "expiresPlaceholder": "Leave empty for permanent",
    "confirm": "Ban User",
    "confirming": "Banning..."
  },
  "unbanConfirm": {
    "title": "Unban User",
    "description": "Are you sure you want to unban {name}?",
    "confirm": "Unban"
  },
  "deleteConfirm": {
    "title": "Delete User",
    "description": "This will permanently delete {name} and all their data. This action cannot be undone.",
    "confirm": "Delete"
  },
  "changeRoleConfirm": {
    "title": "Change Role",
    "description": "Change {name}'s role from {currentRole} to {newRole}?",
    "confirm": "Change Role"
  },
  "toast": {
    "created": "User created successfully",
    "updated": "User updated successfully",
    "deleted": "User deleted successfully",
    "banned": "User banned successfully",
    "unbanned": "User unbanned successfully",
    "roleChanged": "Role changed successfully",
    "passwordSet": "Password set successfully",
    "createFailed": "Failed to create user",
    "updateFailed": "Failed to update user",
    "deleteFailed": "Failed to delete user",
    "banFailed": "Failed to ban user",
    "unbanFailed": "Failed to unban user",
    "roleChangeFailed": "Failed to change role",
    "passwordSetFailed": "Failed to set password"
  }
}
```

**Step 2: Add German translations**

Same structure in `de.json`:

Nav: `"users": "Benutzer"`

```json
"users": {
  "title": "Benutzer",
  "description": "Benutzerkonten und Berechtigungen verwalten",
  "empty": "Keine Benutzer gefunden",
  "searchPlaceholder": "Benutzer suchen...",
  "addUser": "Benutzer hinzufügen",
  "columns": {
    "name": "Name",
    "email": "E-Mail",
    "role": "Rolle",
    "status": "Status",
    "created": "Erstellt"
  },
  "roles": {
    "admin": "Admin",
    "user": "Benutzer"
  },
  "status": {
    "active": "Aktiv",
    "banned": "Gesperrt"
  },
  "actions": {
    "edit": "Bearbeiten",
    "changeRole": "Rolle ändern",
    "setPassword": "Passwort setzen",
    "ban": "Benutzer sperren",
    "unban": "Benutzer entsperren",
    "delete": "Benutzer löschen"
  },
  "createDialog": {
    "title": "Benutzer erstellen",
    "description": "Neues Benutzerkonto mit temporärem Passwort erstellen.",
    "nameLabel": "Name",
    "namePlaceholder": "Vollständiger Name",
    "emailLabel": "E-Mail",
    "emailPlaceholder": "benutzer@beispiel.de",
    "passwordLabel": "Temporäres Passwort",
    "passwordPlaceholder": "Temporäres Passwort eingeben",
    "roleLabel": "Rolle",
    "create": "Benutzer erstellen",
    "creating": "Wird erstellt..."
  },
  "editDialog": {
    "title": "Benutzer bearbeiten",
    "description": "Benutzerdaten aktualisieren.",
    "nameLabel": "Name",
    "emailLabel": "E-Mail",
    "update": "Änderungen speichern",
    "updating": "Wird gespeichert..."
  },
  "setPasswordDialog": {
    "title": "Passwort setzen",
    "description": "Neues Passwort für {name} setzen.",
    "passwordLabel": "Neues Passwort",
    "passwordPlaceholder": "Neues Passwort eingeben",
    "confirm": "Passwort setzen",
    "confirming": "Wird gesetzt..."
  },
  "banDialog": {
    "title": "Benutzer sperren",
    "description": "{name} vom Zugriff auf das System sperren.",
    "reasonLabel": "Grund",
    "reasonPlaceholder": "Optionaler Sperrgrund",
    "expiresLabel": "Läuft ab nach (Tage)",
    "expiresPlaceholder": "Leer lassen für dauerhaft",
    "confirm": "Benutzer sperren",
    "confirming": "Wird gesperrt..."
  },
  "unbanConfirm": {
    "title": "Benutzer entsperren",
    "description": "Möchten Sie {name} wirklich entsperren?",
    "confirm": "Entsperren"
  },
  "deleteConfirm": {
    "title": "Benutzer löschen",
    "description": "{name} und alle zugehörigen Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
    "confirm": "Löschen"
  },
  "changeRoleConfirm": {
    "title": "Rolle ändern",
    "description": "Rolle von {name} von {currentRole} zu {newRole} ändern?",
    "confirm": "Rolle ändern"
  },
  "toast": {
    "created": "Benutzer erfolgreich erstellt",
    "updated": "Benutzer erfolgreich aktualisiert",
    "deleted": "Benutzer erfolgreich gelöscht",
    "banned": "Benutzer erfolgreich gesperrt",
    "unbanned": "Benutzer erfolgreich entsperrt",
    "roleChanged": "Rolle erfolgreich geändert",
    "passwordSet": "Passwort erfolgreich gesetzt",
    "createFailed": "Benutzer konnte nicht erstellt werden",
    "updateFailed": "Benutzer konnte nicht aktualisiert werden",
    "deleteFailed": "Benutzer konnte nicht gelöscht werden",
    "banFailed": "Benutzer konnte nicht gesperrt werden",
    "unbanFailed": "Benutzer konnte nicht entsperrt werden",
    "roleChangeFailed": "Rolle konnte nicht geändert werden",
    "passwordSetFailed": "Passwort konnte nicht gesetzt werden"
  }
}
```

**Step 3: Verify the message keys test passes**

Run: `pnpm --filter @dragons/web test`
Expected: `messages.test.ts` passes (it checks en/de key parity).

**Step 4: Commit**

```
feat(i18n): add user management translation keys
```

---

### Task 3: Add "Users" Nav Link + SWR Key

**Files:**
- Modify: `apps/web/src/components/admin/header.tsx`
- Modify: `apps/web/src/lib/swr-keys.ts`

**Step 1: Add nav link**

In `header.tsx`, add the Users link to the `navLinks` array. Place it before "Sync" since it's a management page:

```ts
const navLinks = [
  { href: "/admin/matches" as const, labelKey: "nav.matches" as const },
  { href: "/admin/referees" as const, labelKey: "nav.referees" as const },
  { href: "/admin/standings" as const, labelKey: "nav.standings" as const },
  { href: "/admin/venues" as const, labelKey: "nav.venues" as const },
  { href: "/admin/teams" as const, labelKey: "nav.teams" as const },
  { href: "/admin/users" as const, labelKey: "nav.users" as const },
  { href: "/admin/sync" as const, labelKey: "nav.sync" as const },
  { href: "/admin/settings" as const, labelKey: "nav.settings" as const },
];
```

**Step 2: Add SWR key**

In `swr-keys.ts`, add:

```ts
export const SWR_KEYS = {
  ...existing keys...,
  users: "admin-users",
} as const;
```

Note: Unlike other SWR keys that are API paths, this one is just a cache key since we're using `authClient.admin.listUsers()` as the fetcher, not `apiFetcher`.

**Step 3: Verify build**

Run: `pnpm typecheck`
Expected: No errors.

**Step 4: Commit**

```
feat(web): add Users nav link and SWR key
```

---

### Task 4: Create User Types

**Files:**
- Create: `apps/web/src/components/admin/users/types.ts`

**Step 1: Create the types file**

```ts
export interface UserListItem {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

This mirrors Better Auth's user shape returned by `listUsers`. The `id` is `string` (Better Auth uses text PKs). `banExpires` is a `number` (timestamp from Better Auth's API response).

**Step 2: Commit**

```
feat(web): add user management types
```

---

### Task 5: Create the Create User Dialog

**Files:**
- Create: `apps/web/src/components/admin/users/create-user-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

import { Button } from "@dragons/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"
import { Input } from "@dragons/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select"
import { Field, FieldLabel, FieldError } from "@dragons/ui/components/field"

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["user", "admin"]),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateUserDialogProps) {
  const t = useTranslations("users")
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "user",
    },
  })

  async function onSubmit(values: CreateUserFormValues) {
    setSubmitting(true)
    try {
      const { error } = await authClient.admin.createUser({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
      })
      if (error) {
        toast.error(t("toast.createFailed"))
        return
      }
      toast.success(t("toast.created"))
      form.reset()
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error(t("toast.createFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("createDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("createDialog.nameLabel")}</FieldLabel>
                <Input
                  placeholder={t("createDialog.namePlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("createDialog.emailLabel")}</FieldLabel>
                <Input
                  type="email"
                  placeholder={t("createDialog.emailPlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("createDialog.passwordLabel")}</FieldLabel>
                <Input
                  type="password"
                  placeholder={t("createDialog.passwordPlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("createDialog.roleLabel")}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t("roles.user")}</SelectItem>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("~common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("createDialog.creating")
                : t("createDialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Note: The `t("~common.cancel")` syntax may not work with next-intl. Check how other components reference `common.*` keys — they may use a separate `useTranslations("common")` call or `useTranslations()` (root scope). Adjust accordingly based on what you find in `match-edit-sheet.tsx` patterns. If root scope, use `t("common.cancel")` from a root-scoped translator.

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: No errors (may need adjustments for the `authClient.admin.createUser` return type — check if it returns `{ error }` or throws).

**Step 3: Commit**

```
feat(web): add create user dialog component
```

---

### Task 6: Create the Edit User Dialog

**Files:**
- Create: `apps/web/src/components/admin/users/edit-user-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

import { Button } from "@dragons/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"
import { Input } from "@dragons/ui/components/input"
import { Field, FieldLabel, FieldError } from "@dragons/ui/components/field"

import type { UserListItem } from "./types"

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
})

type EditUserFormValues = z.infer<typeof editUserSchema>

interface EditUserDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export function EditUserDialog({
  user,
  open,
  onOpenChange,
  onUpdated,
}: EditUserDialogProps) {
  const t = useTranslations("users")
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: "", email: "" },
  })

  useEffect(() => {
    if (user) {
      form.reset({ name: user.name, email: user.email })
    }
  }, [user, form])

  async function onSubmit(values: EditUserFormValues) {
    if (!user) return
    setSubmitting(true)
    try {
      const { error } = await authClient.admin.updateUser({
        userId: user.id,
        data: { name: values.name, email: values.email },
      })
      if (error) {
        toast.error(t("toast.updateFailed"))
        return
      }
      toast.success(t("toast.updated"))
      onOpenChange(false)
      onUpdated()
    } catch {
      toast.error(t("toast.updateFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("editDialog.nameLabel")}</FieldLabel>
                <Input {...field} />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("editDialog.emailLabel")}</FieldLabel>
                <Input type="email" {...field} />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("~common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("editDialog.updating")
                : t("editDialog.update")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Same note as Task 5 about the `t("~common.cancel")` — use the pattern found in existing components.

**Step 2: Commit**

```
feat(web): add edit user dialog component
```

---

### Task 7: Create the Ban User Dialog

**Files:**
- Create: `apps/web/src/components/admin/users/ban-user-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

import { Button } from "@dragons/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"
import { Input } from "@dragons/ui/components/input"
import { Field, FieldLabel } from "@dragons/ui/components/field"

import type { UserListItem } from "./types"

const banUserSchema = z.object({
  banReason: z.string().optional(),
  banExpiresInDays: z.coerce.number().positive().optional().or(z.literal("")),
})

type BanUserFormValues = z.infer<typeof banUserSchema>

interface BanUserDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBanned: () => void
}

export function BanUserDialog({
  user,
  open,
  onOpenChange,
  onBanned,
}: BanUserDialogProps) {
  const t = useTranslations("users")
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<BanUserFormValues>({
    resolver: zodResolver(banUserSchema),
    defaultValues: { banReason: "", banExpiresInDays: "" },
  })

  async function onSubmit(values: BanUserFormValues) {
    if (!user) return
    setSubmitting(true)
    try {
      const banExpiresIn =
        typeof values.banExpiresInDays === "number"
          ? values.banExpiresInDays * 86400
          : undefined
      const { error } = await authClient.admin.banUser({
        userId: user.id,
        banReason: values.banReason || undefined,
        banExpiresIn,
      })
      if (error) {
        toast.error(t("toast.banFailed"))
        return
      }
      toast.success(t("toast.banned"))
      form.reset()
      onOpenChange(false)
      onBanned()
    } catch {
      toast.error(t("toast.banFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("banDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("banDialog.description", { name: user?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="banReason"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("banDialog.reasonLabel")}</FieldLabel>
                <Input
                  placeholder={t("banDialog.reasonPlaceholder")}
                  {...field}
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="banExpiresInDays"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("banDialog.expiresLabel")}</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  placeholder={t("banDialog.expiresPlaceholder")}
                  {...field}
                />
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("~common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting
                ? t("banDialog.confirming")
                : t("banDialog.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```
feat(web): add ban user dialog component
```

---

### Task 8: Create the Set Password Dialog

**Files:**
- Create: `apps/web/src/components/admin/users/set-password-dialog.tsx`

**Step 1: Create the dialog component**

```tsx
"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

import { Button } from "@dragons/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"
import { Input } from "@dragons/ui/components/input"
import { Field, FieldLabel, FieldError } from "@dragons/ui/components/field"

import type { UserListItem } from "./types"

const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type SetPasswordFormValues = z.infer<typeof setPasswordSchema>

interface SetPasswordDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SetPasswordDialog({
  user,
  open,
  onOpenChange,
}: SetPasswordDialogProps) {
  const t = useTranslations("users")
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "" },
  })

  async function onSubmit(values: SetPasswordFormValues) {
    if (!user) return
    setSubmitting(true)
    try {
      const { error } = await authClient.admin.setUserPassword({
        userId: user.id,
        newPassword: values.password,
      })
      if (error) {
        toast.error(t("toast.passwordSetFailed"))
        return
      }
      toast.success(t("toast.passwordSet"))
      form.reset()
      onOpenChange(false)
    } catch {
      toast.error(t("toast.passwordSetFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("setPasswordDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("setPasswordDialog.description", { name: user?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("setPasswordDialog.passwordLabel")}</FieldLabel>
                <Input
                  type="password"
                  placeholder={t("setPasswordDialog.passwordPlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("~common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("setPasswordDialog.confirming")
                : t("setPasswordDialog.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```
feat(web): add set password dialog component
```

---

### Task 9: Create User Actions Dropdown

**Files:**
- Create: `apps/web/src/components/admin/users/user-actions.tsx`

**Step 1: Create the row actions component**

This component renders the "..." dropdown for each row. It manages the state for which dialog is open and delegates to the dialog components.

```tsx
"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

import { Button } from "@dragons/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dragons/ui/components/alert-dialog"

import { EditUserDialog } from "./edit-user-dialog"
import { BanUserDialog } from "./ban-user-dialog"
import { SetPasswordDialog } from "./set-password-dialog"
import type { UserListItem } from "./types"

interface UserActionsProps {
  user: UserListItem
  currentUserId: string
  onMutated: () => void
}

export function UserActions({
  user,
  currentUserId,
  onMutated,
}: UserActionsProps) {
  const t = useTranslations("users")

  const [editOpen, setEditOpen] = useState(false)
  const [banOpen, setBanOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [unbanOpen, setUnbanOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)

  const isSelf = user.id === currentUserId
  const isBanned = user.banned === true
  const newRole = user.role === "admin" ? "user" : "admin"

  async function handleDelete() {
    try {
      const { error } = await authClient.admin.removeUser({
        userId: user.id,
      })
      if (error) {
        toast.error(t("toast.deleteFailed"))
        return
      }
      toast.success(t("toast.deleted"))
      onMutated()
    } catch {
      toast.error(t("toast.deleteFailed"))
    }
  }

  async function handleUnban() {
    try {
      const { error } = await authClient.admin.unbanUser({
        userId: user.id,
      })
      if (error) {
        toast.error(t("toast.unbanFailed"))
        return
      }
      toast.success(t("toast.unbanned"))
      onMutated()
    } catch {
      toast.error(t("toast.unbanFailed"))
    }
  }

  async function handleRoleChange() {
    try {
      const { error } = await authClient.admin.setRole({
        userId: user.id,
        role: newRole,
      })
      if (error) {
        toast.error(t("toast.roleChangeFailed"))
        return
      }
      toast.success(t("toast.roleChanged"))
      onMutated()
    } catch {
      toast.error(t("toast.roleChangeFailed"))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            {t("actions.setPassword")}
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem onSelect={() => setRoleOpen(true)}>
              {t("actions.changeRole")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {!isSelf && (
            <>
              {isBanned ? (
                <DropdownMenuItem onSelect={() => setUnbanOpen(true)}>
                  {t("actions.unban")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setBanOpen(true)}>
                  {t("actions.ban")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                {t("actions.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        user={user}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={onMutated}
      />

      <BanUserDialog
        user={user}
        open={banOpen}
        onOpenChange={setBanOpen}
        onBanned={onMutated}
      />

      <SetPasswordDialog
        user={user}
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm.description", { name: user.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("~common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("deleteConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unban confirmation */}
      <AlertDialog open={unbanOpen} onOpenChange={setUnbanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("unbanConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("unbanConfirm.description", { name: user.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("~common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnban}>
              {t("unbanConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change role confirmation */}
      <AlertDialog open={roleOpen} onOpenChange={setRoleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("changeRoleConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("changeRoleConfirm.description", {
                name: user.name,
                currentRole: user.role ?? "user",
                newRole,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("~common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleChange}>
              {t("changeRoleConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

Key decisions:
- `isSelf` check prevents admins from deleting, banning, or demoting themselves.
- The `currentUserId` is passed from the parent (from the auth session).
- Each confirmation dialog (delete, unban, role change) is an AlertDialog since they're non-dismissable confirmations.

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```
feat(web): add user row actions with edit, ban, delete, role dialogs
```

---

### Task 10: Create the User List Table

**Files:**
- Create: `apps/web/src/components/admin/users/user-list-table.tsx`

**Step 1: Create the table component**

This is the main client component with inline `getColumns`, SWR fetching via `authClient.admin.listUsers()`, and the create button.

```tsx
"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { Plus, SearchIcon, Users } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { SWR_KEYS } from "@/lib/swr-keys"

import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { Badge } from "@dragons/ui/components/badge"
import { Button } from "@dragons/ui/components/button"
import { Input } from "@dragons/ui/components/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@dragons/ui/components/tooltip"

import { DataTable } from "@/components/ui/data-table"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

import { CreateUserDialog } from "./create-user-dialog"
import { UserActions } from "./user-actions"
import type { UserListItem } from "./types"

function getColumns(
  t: ReturnType<typeof useTranslations<"users">>,
  currentUserId: string,
  onMutated: () => void,
): ColumnDef<UserListItem, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.name")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.name}</span>
      ),
      meta: { label: t("columns.name") },
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.email")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.email}
        </span>
      ),
      meta: { label: t("columns.email") },
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.role")} />
      ),
      cell: ({ row }) => {
        const role = row.original.role ?? "user"
        return (
          <Badge variant={role === "admin" ? "default" : "secondary"}>
            {t(`roles.${role}` as "roles.admin" | "roles.user")}
          </Badge>
        )
      },
      meta: { label: t("columns.role") },
    },
    {
      accessorKey: "banned",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.status")} />
      ),
      cell: ({ row }) => {
        const { banned, banReason } = row.original
        if (banned) {
          return banReason ? (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive">{t("status.banned")}</Badge>
              </TooltipTrigger>
              <TooltipContent>{banReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Badge variant="destructive">{t("status.banned")}</Badge>
          )
        }
        return <Badge variant="success">{t("status.active")}</Badge>
      },
      meta: { label: t("columns.status") },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.created")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
      meta: { label: t("columns.created") },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <UserActions
          user={row.original}
          currentUserId={currentUserId}
          onMutated={onMutated}
        />
      ),
      enableSorting: false,
    },
  ]
}

const userGlobalFilterFn: FilterFn<UserListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = (filterValue as string).toLowerCase()
  if (!search) return true

  const name = row.original.name.toLowerCase()
  const email = row.original.email.toLowerCase()

  return name.includes(search) || email.includes(search)
}

async function fetchUsers(): Promise<UserListItem[]> {
  const { data, error } = await authClient.admin.listUsers({
    sortBy: "createdAt",
    sortDirection: "desc",
  })
  if (error) throw error
  return (data?.users as UserListItem[]) ?? []
}

export function UserListTable() {
  const t = useTranslations("users")
  const { data: session } = authClient.useSession()
  const { data: users, mutate } = useSWR<UserListItem[]>(
    SWR_KEYS.users,
    fetchUsers,
  )
  const [createOpen, setCreateOpen] = useState(false)

  const currentUserId = session?.user?.id ?? ""
  const columns = useMemo(
    () => getColumns(t, currentUserId, () => mutate()),
    [t, currentUserId, mutate],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={users ?? []}
        globalFilterFn={userGlobalFilterFn}
        emptyState={
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="mb-2 h-8 w-8" />
            <p>{t("empty")}</p>
          </div>
        }
      >
        {(table) => (
          <DataTableToolbar table={table}>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={(table.getState().globalFilter as string) ?? ""}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                className="h-8 w-[150px] pl-8 lg:w-[250px]"
              />
            </div>
            <Button
              size="sm"
              className="h-8"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("addUser")}
            </Button>
          </DataTableToolbar>
        )}
      </DataTable>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => mutate()}
      />
    </>
  )
}
```

Key points:
- `fetchUsers` wraps `authClient.admin.listUsers()` as the SWR fetcher.
- `authClient.useSession()` provides the current user ID to prevent self-destructive actions.
- `mutate()` is passed to child components for cache invalidation after mutations.
- Columns include `onMutated` callback — this is a pragmatic choice. If it causes excessive re-renders, memoize differently.

**Step 2: Verify build**

Run: `pnpm typecheck`

**Step 3: Commit**

```
feat(web): add user list table with search, create button, and row actions
```

---

### Task 11: Create the Admin Users Page

**Files:**
- Create: `apps/web/src/app/[locale]/admin/users/page.tsx`

**Step 1: Create the page**

Since data fetching uses `authClient.admin.listUsers()` (client-side), the page is simpler than other admin pages — no SSR hydration or SWRConfig fallback.

```tsx
import { getTranslations } from "next-intl/server";
import { UserListTable } from "@/components/admin/users/user-list-table";

export default async function UsersPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("users.title")}</h1>
      <UserListTable />
    </div>
  );
}
```

**Step 2: Verify the whole app builds**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```
feat(web): add admin users page at /admin/users
```

---

### Task 12: Type-check, Fix, and Polish

**Step 1: Run full type check**

Run: `pnpm typecheck`

Fix any type errors. Common issues to watch for:
- `authClient.admin.*` return types may differ from what's assumed (check `{ data, error }` vs throw patterns).
- The `t()` function key types from next-intl may complain about dynamic keys like `` t(`roles.${role}`) `` — use type assertions or a mapping object.
- The `"~common.cancel"` syntax may not work — check how `match-edit-sheet.tsx` accesses `common.*` keys and replicate that pattern (likely needs a separate `useTranslations()` call at root scope or `useTranslations("common")`).

**Step 2: Run the i18n key parity test**

Run: `pnpm --filter @dragons/web test`
Expected: Passes.

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors.

**Step 4: Run build**

Run: `pnpm build`
Expected: Succeeds.

**Step 5: Commit any fixes**

```
fix(web): resolve type and lint issues in user management
```

---

### Task 13: Manual Smoke Test

**Step 1: Start the dev environment**

Run: `docker compose -f docker/docker-compose.dev.yml up -d && pnpm dev`

**Step 2: Verify the page loads**

Navigate to `http://localhost:3000/admin/users`. Verify:
- Page heading shows "Users"
- Nav link is visible and highlighted when active
- Table loads with existing users
- Search filters by name and email

**Step 3: Test CRUD operations**

- Click "Add User" — fill form, submit — verify user appears in table
- Click row actions → Edit — change name — verify update
- Click row actions → Change Role — confirm — verify badge changes
- Click row actions → Set Password — set new password
- Click row actions → Ban — fill reason — verify status badge changes to "Banned"
- Click row actions → Unban — confirm — verify status returns to "Active"
- Click row actions → Delete — confirm — verify user removed from table
- Verify you cannot delete/ban/change-role on yourself

**Step 4: Test error states**

- Try creating a user with duplicate email — should show error toast
- Try creating with invalid email — should show form validation error

**Step 5: Final commit if any tweaks are needed**

```
fix(web): polish user management UI after smoke testing
```
