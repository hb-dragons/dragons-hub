# User Management Admin Page — Design

## Goal

Add a `/admin/users` page where admins can manage users: create, view, edit, assign roles, ban/unban, and delete.

## Approach

Use Better Auth's `adminClient` plugin directly from the frontend. The admin plugin already provides all necessary API endpoints (`listUsers`, `createUser`, `updateUser`, `setRole`, `banUser`, `unbanUser`, `removeUser`, `setUserPassword`). No custom Hono API routes or DB schema changes needed.

## Page Structure

Single page at `/admin/users` with a DataTable (TanStack Table). All mutations happen via dialog modals triggered from row action dropdowns.

### Table Columns

| Column  | Content                                   | Sortable |
| ------- | ----------------------------------------- | -------- |
| Name    | User name                                 | Yes      |
| Email   | Email address                             | Yes      |
| Role    | Badge: "admin" or "user"                  | Yes      |
| Status  | Badge: "Active" or "Banned" (with reason) | Yes      |
| Created | Formatted date                            | Yes      |
| Actions | Dropdown menu                             | No       |

### Row Actions

- **Edit** — dialog to change name and email
- **Change role** — toggle between "user" and "admin" (with confirmation)
- **Set password** — dialog to enter a new password
- **Ban / Unban** — Ban opens dialog for reason + optional expiry; Unban is immediate with confirmation
- **Delete** — AlertDialog confirmation, then permanent removal

### Toolbar

- Search input (global filter on name + email)
- "Add User" button opening the create dialog

## Data Fetching

- Client-side only (no SSR hydration) — uses SWR with a custom fetcher wrapping `authClient.admin.listUsers()`
- Mutations use `authClient.admin.*` methods directly
- SWR `mutate()` for cache invalidation after mutations

## Components

| File                                                       | Purpose                     |
| ---------------------------------------------------------- | --------------------------- |
| `apps/web/src/app/[locale]/admin/users/page.tsx`           | Page entry point            |
| `apps/web/src/components/admin/users/user-list-table.tsx`  | DataTable + SWR fetching    |
| `apps/web/src/components/admin/users/columns.tsx`          | Column definitions          |
| `apps/web/src/components/admin/users/create-user-dialog.tsx` | Create user form          |
| `apps/web/src/components/admin/users/edit-user-dialog.tsx` | Edit user form              |
| `apps/web/src/components/admin/users/ban-user-dialog.tsx`  | Ban form (reason + expiry)  |
| `apps/web/src/components/admin/users/user-actions.tsx`     | Row actions dropdown        |
| `apps/web/src/components/admin/users/types.ts`             | TypeScript interfaces       |

## Modifications to Existing Files

- `apps/web/src/components/admin/header.tsx` — add "Users" nav link
- `apps/web/src/messages/en.json` — add `admin.users.*` translation keys
- `apps/web/src/messages/de.json` — add German translations

## What's NOT In Scope

- Force password change on first login (future follow-up)
- Email invites
- Custom Hono API routes for user management
- DB schema changes
