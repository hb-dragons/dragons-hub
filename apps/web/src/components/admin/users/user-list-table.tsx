"use client"

import { useMemo, useState } from "react"
import { useTranslations, useFormatter } from "next-intl"
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
  format: ReturnType<typeof useFormatter>,
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
        const variant = role === "admin" ? "default" : role === "referee" ? "outline" : "secondary"
        const label = role === "admin" ? t("roles.admin") : role === "referee" ? t("roles.referee") : t("roles.user")
        return <Badge variant={variant}>{label}</Badge>
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
          {format.dateTime(new Date(row.original.createdAt), "dateOnly")}
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
    query: {
      sortBy: "createdAt",
      sortDirection: "desc",
    },
  })
  if (error) throw error
  return (
    data?.users.map((u): UserListItem => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role ?? null,
      banned: u.banned ?? null,
      banReason: u.banReason ?? null,
      banExpires: u.banExpires instanceof Date ? u.banExpires.getTime() : u.banExpires ?? null,
      image: u.image ?? null,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : String(u.updatedAt),
    })) ?? []
  )
}

export function UserListTable() {
  const t = useTranslations("users")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const { data: session } = authClient.useSession()
  const { data: users, error, isLoading, mutate } = useSWR<UserListItem[]>(
    SWR_KEYS.users,
    fetchUsers,
  )
  const [createOpen, setCreateOpen] = useState(false)

  const currentUserId = session?.user?.id ?? ""
  const columns = useMemo(
    () => getColumns(t, format, currentUserId, () => mutate()),
    [t, format, currentUserId, mutate],
  )

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {t("empty")}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p>{tCommon("loading")}</p>
      </div>
    )
  }

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
